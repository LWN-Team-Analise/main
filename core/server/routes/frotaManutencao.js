import { Router } from 'express'
import { query } from '../db.js'
import { exige, exigeSessao, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'
import { logger } from '../logger.js'
import { linkDoSite, mandarNoTeams } from '../teams.js'
import { lerValor } from '../../src/domain/despesas.js'

/* ============================================================
   FROTAS — os PROBLEMAS e as MANUTENCOES do carro (atualizacao 59)

   Montado em /api/frotas, ao lado de routes/frotas.js:

     GET    /ocorrencias?veiculo=ID&abertas=1
                                  os problemas relatados (os abertos
                                  primeiro), de um carro ou de todos
     POST   /ocorrencias          { veiculoId, descricao, impedeUso }
                                  relata um problema: vai no Teams para
                                  quem tem `aviso_problema_frota`
     PATCH  /ocorrencias/:id      { resolucao? } — resolvido
     GET    /manutencoes?veiculo=ID
     POST   /manutencoes          { veiculoId, data, descricao, custo,
                                    oficina?, km?, ocorrenciaId? } — com a
                                  ocorrencia, ela fica resolvida junto
     DELETE /manutencoes/:id
     GET    /manutencoes/resumo?de=AAAA-MM-DD&ate=AAAA-MM-DD
                                  o custo e os reparos por carro (o
                                  dashboard da diretoria)

   Quem pode o que:
     ver_frotas         ver tudo daqui e RELATAR um problema
     manutencao_frota   resolver o problema e lancar/apagar a manutencao
     aviso_problema_frota
                        recebe no Teams o problema relatado (so a chave
                        marcada conta: o acesso total nao entra sozinho)
   ============================================================ */

const router = Router()

const VER = 'ver_frotas'
const MANUTENCAO = 'manutencao_frota'

const DESCRICAO_MAXIMA = 1000
const TEXTO_MAXIMO = 500
const OFICINA_MAXIMA = 120
const CUSTO_MAXIMO = 9_999_999

const texto = (valor) => String(valor ?? '').trim()
const idValido = (valor) => /^\d{1,18}$/.test(String(valor ?? ''))
const dataValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? '')) && !Number.isNaN(Date.parse(valor))
const hojeNoBrasil = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro: 'O banco ainda não tem os problemas e as manutenções dos carros (atualização 59 em core/db).',
    })
  }
  if (erro.code === '23503') return res.status(404).json({ erro: 'Veículo não encontrado.' })
  return tratar(erro, res, onde)
}

const paraOcorrencia = (l) => ({
  id: String(l.id),
  veiculoId: String(l.veiculo_id),
  veiculoNome: l.veiculo_nome ?? '',
  descricao: l.descricao,
  impedeUso: l.impede_uso === true,
  relatadoPorNome: l.relatado_por_nome ?? null,
  relatadoEm: l.relatado_em,
  resolvidoEm: l.resolvido_em ?? null,
  resolvidoPorNome: l.resolvido_por_nome ?? null,
  resolucao: l.resolucao ?? '',
})

const paraManutencao = (l) => ({
  id: String(l.id),
  veiculoId: String(l.veiculo_id),
  data: l.data_iso,
  descricao: l.descricao,
  oficina: l.oficina ?? '',
  custo: Number(l.custo),
  km: l.km ?? null,
  ocorrenciaId: l.ocorrencia_id ? String(l.ocorrencia_id) : null,
  registradoPorNome: l.registrado_por_nome ?? null,
})

const CONSULTA_OCORRENCIAS = `
  SELECT o.*, v.nome AS veiculo_nome, rel.name AS relatado_por_nome, res.name AS resolvido_por_nome
    FROM veiculo_ocorrencia o
    JOIN veiculo v       ON v.id = o.veiculo_id
    LEFT JOIN usuario rel ON rel.id = o.relatado_por
    LEFT JOIN usuario res ON res.id = o.resolvido_por`

/* ---------------- os problemas ---------------- */

router.get('/ocorrencias', exigeSessao, exige(VER), async (req, res) => {
  const veiculo = idValido(req.query.veiculo) ? String(req.query.veiculo) : null
  const abertas = req.query.abertas === '1'
  try {
    const { rows } = await query(
      `${CONSULTA_OCORRENCIAS}
        WHERE ($1::bigint IS NULL OR o.veiculo_id = $1) AND (NOT $2 OR o.resolvido_em IS NULL)
        ORDER BY (o.resolvido_em IS NULL) DESC, o.relatado_em DESC
        LIMIT 300`,
      [veiculo, abertas],
    )
    return res.json({ ocorrencias: rows.map(paraOcorrencia) })
  } catch (erro) {
    return falhou(erro, res, 'frotas/ocorrencias')
  }
})

router.post('/ocorrencias', exigeSessao, exige(VER), async (req, res) => {
  const veiculoId = String(req.body?.veiculoId ?? '')
  const descricao = texto(req.body?.descricao)
  const impedeUso = req.body?.impedeUso === true
  if (!idValido(veiculoId)) return res.status(400).json({ erro: 'Escolha o veículo.', campo: 'veiculoId' })
  if (!descricao) return res.status(400).json({ erro: 'Descreva o problema.', campo: 'descricao' })
  if (descricao.length > DESCRICAO_MAXIMA) {
    return res.status(400).json({ erro: `A descrição vai até ${DESCRICAO_MAXIMA} caracteres.`, campo: 'descricao' })
  }
  try {
    const { rows } = await query(
      `INSERT INTO veiculo_ocorrencia (veiculo_id, descricao, impede_uso, relatado_por)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [veiculoId, descricao, impedeUso, req.dono.sub],
    )
    const { rows: lida } = await query(`${CONSULTA_OCORRENCIAS} WHERE o.id = $1`, [rows[0].id])
    const ocorrencia = paraOcorrencia(lida[0])
    await registrarAtividade(req, {
      acao: 'frota.problema',
      categoria: 'frota',
      entidade: ['veiculo', veiculoId],
      descricao: 'Problema relatado no carro',
      detalhes: { veiculo: ocorrencia.veiculoNome, problema: descricao, impede_uso: impedeUso },
    })
    await avisarProblema(ocorrencia)
    return res.status(201).json({ ocorrencia })
  } catch (erro) {
    return falhou(erro, res, 'frotas/relatar')
  }
})

/**
 * O problema relatado vai no Teams para quem esta num setor com
 * `aviso_problema_frota` (o Administrativo e a lideranca tecnica). Nunca
 * derruba o relato.
 */
async function avisarProblema(ocorrencia) {
  try {
    const { rows } = await query(
      `SELECT u.id FROM usuario u JOIN cargo c ON c.id = u.cargo_id
        WHERE coalesce(u.ativo, true) AND 'aviso_problema_frota' = ANY (c.permissoes)`,
    )
    if (!rows.length) return
    await mandarNoTeams(
      rows.map((r) => r.id),
      {
        titulo: ocorrencia.impedeUso ? 'Carro com problema: não pode ser usado' : 'Problema relatado no carro',
        linhas: [
          `**${ocorrencia.relatadoPorNome ?? 'Alguém'}** relatou um problema no carro **${ocorrencia.veiculoNome}**:`,
          ocorrencia.descricao,
          ocorrencia.impedeUso ? '**O carro não pode ser usado até o conserto.**' : null,
        ],
        link: linkDoSite('/core/app/frotas'),
        rotuloLink: 'Abrir a Frota',
      },
    )
  } catch (erro) {
    logger.error('frotas/aviso-problema', erro.message)
  }
}

router.patch('/ocorrencias/:id', exigeSessao, exige(MANUTENCAO), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Problema não encontrado.' })
  const resolucao = texto(req.body?.resolucao).slice(0, TEXTO_MAXIMO)
  try {
    const { rowCount } = await query(
      `UPDATE veiculo_ocorrencia
          SET resolvido_em = now(), resolvido_por = $2, resolucao = $3
        WHERE id = $1 AND resolvido_em IS NULL`,
      [req.params.id, req.dono.sub, resolucao || null],
    )
    if (!rowCount) return res.status(409).json({ erro: 'Este problema já foi resolvido (ou não existe mais).' })
    const { rows } = await query(`${CONSULTA_OCORRENCIAS} WHERE o.id = $1`, [req.params.id])
    const ocorrencia = paraOcorrencia(rows[0])
    await registrarAtividade(req, {
      acao: 'frota.problema_resolvido',
      categoria: 'frota',
      entidade: ['veiculo', ocorrencia.veiculoId],
      descricao: 'Problema do carro resolvido',
      detalhes: { veiculo: ocorrencia.veiculoNome, problema: ocorrencia.descricao, resolucao: resolucao || null },
    })
    return res.json({ ocorrencia })
  } catch (erro) {
    return falhou(erro, res, 'frotas/resolver')
  }
})

/* ---------------- as manutencoes ---------------- */

const CONSULTA_MANUTENCOES = `
  SELECT m.*, to_char(m.data, 'YYYY-MM-DD') AS data_iso, u.name AS registrado_por_nome
    FROM veiculo_manutencao m
    LEFT JOIN usuario u ON u.id = m.registrado_por`

router.get('/manutencoes', exigeSessao, exige(VER), async (req, res) => {
  const veiculo = idValido(req.query.veiculo) ? String(req.query.veiculo) : null
  try {
    const { rows } = await query(
      `${CONSULTA_MANUTENCOES}
        WHERE ($1::bigint IS NULL OR m.veiculo_id = $1)
        ORDER BY m.data DESC, m.id DESC
        LIMIT 500`,
      [veiculo],
    )
    return res.json({ manutencoes: rows.map(paraManutencao) })
  } catch (erro) {
    return falhou(erro, res, 'frotas/manutencoes')
  }
})

/** O custo e quantos reparos cada carro teve no periodo (o dashboard). */
router.get('/manutencoes/resumo', exigeSessao, exige(VER), async (req, res) => {
  const de = dataValida(req.query.de) ? req.query.de : null
  const ate = dataValida(req.query.ate) ? req.query.ate : null
  try {
    const { rows } = await query(
      `SELECT v.id, v.nome, v.placa, count(m.id)::int AS reparos, coalesce(sum(m.custo), 0) AS custo
         FROM veiculo v
         JOIN veiculo_manutencao m ON m.veiculo_id = v.id
        WHERE ($1::date IS NULL OR m.data >= $1) AND ($2::date IS NULL OR m.data <= $2)
        GROUP BY v.id, v.nome, v.placa
        ORDER BY reparos DESC, custo DESC`,
      [de, ate],
    )
    const { rows: meses } = await query(
      `SELECT to_char(m.data, 'YYYY-MM') AS mes, coalesce(sum(m.custo), 0) AS custo, count(*)::int AS reparos
         FROM veiculo_manutencao m
        WHERE ($1::date IS NULL OR m.data >= $1) AND ($2::date IS NULL OR m.data <= $2)
        GROUP BY 1 ORDER BY 1`,
      [de, ate],
    )
    return res.json({
      carros: rows.map((l) => ({ id: String(l.id), nome: l.nome, placa: l.placa ?? '', reparos: l.reparos, custo: Number(l.custo) })),
      meses: meses.map((l) => ({ mes: l.mes, custo: Number(l.custo), reparos: l.reparos })),
    })
  } catch (erro) {
    /* banco sem a atualizacao 59: o dashboard so fica sem os numeros */
    if (erro.code === '42P01') return res.json({ carros: [], meses: [] })
    return falhou(erro, res, 'frotas/manutencoes-resumo')
  }
})

router.post('/manutencoes', exigeSessao, exige(MANUTENCAO), async (req, res) => {
  const veiculoId = String(req.body?.veiculoId ?? '')
  const data = texto(req.body?.data)
  const descricao = texto(req.body?.descricao)
  const oficina = texto(req.body?.oficina)
  const custo = lerValor(req.body?.custo)
  const kmBruto = texto(req.body?.km)
  const km = kmBruto ? Number(kmBruto.replace(/\D/g, '')) : null
  const ocorrenciaId = idValido(req.body?.ocorrenciaId) ? String(req.body.ocorrenciaId) : null

  if (!idValido(veiculoId)) return res.status(400).json({ erro: 'Escolha o veículo.', campo: 'veiculoId' })
  if (!dataValida(data) || data > hojeNoBrasil()) {
    return res.status(400).json({ erro: 'Informe a data da manutenção (não pode ser futura).', campo: 'data' })
  }
  if (!descricao) return res.status(400).json({ erro: 'Diga o que foi feito.', campo: 'descricao' })
  if (descricao.length > TEXTO_MAXIMO) {
    return res.status(400).json({ erro: `A descrição vai até ${TEXTO_MAXIMO} caracteres.`, campo: 'descricao' })
  }
  if (oficina.length > OFICINA_MAXIMA) {
    return res.status(400).json({ erro: `A oficina vai até ${OFICINA_MAXIMA} caracteres.`, campo: 'oficina' })
  }
  if (custo === null || custo < 0 || custo > CUSTO_MAXIMO) {
    return res.status(400).json({ erro: 'Informe o custo em reais (ex.: 350,00).', campo: 'custo' })
  }
  if (km !== null && (!Number.isInteger(km) || km > 9_999_999)) {
    return res.status(400).json({ erro: 'O KM vai só com números.', campo: 'km' })
  }

  try {
    const { rows } = await query(
      `INSERT INTO veiculo_manutencao (veiculo_id, data, descricao, oficina, custo, km, ocorrencia_id, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [veiculoId, data, descricao, oficina || null, custo, km, ocorrenciaId, req.dono.sub],
    )
    /* a manutencao que conserta um problema relatado o resolve junto */
    if (ocorrenciaId) {
      await query(
        `UPDATE veiculo_ocorrencia
            SET resolvido_em = now(), resolvido_por = $2, resolucao = $3
          WHERE id = $1 AND veiculo_id = $4 AND resolvido_em IS NULL`,
        [ocorrenciaId, req.dono.sub, `Manutenção: ${descricao}`.slice(0, TEXTO_MAXIMO), veiculoId],
      )
    }
    const { rows: lida } = await query(`${CONSULTA_MANUTENCOES} WHERE m.id = $1`, [rows[0].id])
    const { rows: carro } = await query('SELECT nome FROM veiculo WHERE id = $1', [veiculoId])
    await registrarAtividade(req, {
      acao: 'frota.manutencao',
      categoria: 'frota',
      entidade: ['veiculo', veiculoId],
      descricao: 'Manutenção do carro lançada',
      detalhes: { veiculo: carro[0]?.nome ?? null, manutencao: descricao, custo, data },
    })
    return res.status(201).json({ manutencao: paraManutencao(lida[0]) })
  } catch (erro) {
    return falhou(erro, res, 'frotas/manutencao')
  }
})

router.delete('/manutencoes/:id', exigeSessao, exige(MANUTENCAO), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Manutenção não encontrada.' })
  try {
    const { rows } = await query(
      `DELETE FROM veiculo_manutencao m USING veiculo v
        WHERE m.id = $1 AND v.id = m.veiculo_id
        RETURNING m.veiculo_id, m.descricao, m.custo, v.nome`,
      [req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Manutenção não encontrada.' })
    await registrarAtividade(req, {
      acao: 'frota.manutencao_apagada',
      categoria: 'frota',
      entidade: ['veiculo', rows[0].veiculo_id],
      descricao: 'Manutenção do carro apagada',
      detalhes: { veiculo: rows[0].nome, manutencao: rows[0].descricao, custo: Number(rows[0].custo) },
    })
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'frotas/manutencao-apagar')
  }
})

export default router
