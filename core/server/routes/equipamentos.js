import { Router } from 'express'
import { query } from '../db.js'
import { exige, exigeSessao, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'
import {
  CAMPOS_EQUIPAMENTO,
  SITUACOES_EQUIPAMENTO,
  TIPOS_EQUIPAMENTO,
  rotuloDoTipo,
} from '../../src/domain/equipamentos.js'

/* ============================================================
   /api/equipamentos — NOTEBOOKS E PCS (atualizacao 59)

     GET    /       { equipamentos } — todos, com o responsavel
     POST   /       cadastra
     PUT    /:id    edita
     DELETE /:id    apaga

   Ver e `ver_equipamentos`; cadastrar, editar e apagar e
   `editar_equipamentos` (a Area da excelencia).
   ============================================================ */

const router = Router()

const VER = 'ver_equipamentos'
const EDITAR = 'editar_equipamentos'

const texto = (valor) => String(valor ?? '').trim()
const idValido = (valor) => /^\d{1,18}$/.test(String(valor ?? ''))
const dataOuNula = (valor) => {
  const t = texto(valor)
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) ? t : null
}

/* o nome da coluna de cada campo de texto (so daqui, nunca do corpo) */
const COLUNA = {
  marca: 'marca',
  modelo: 'modelo',
  patrimonio: 'patrimonio',
  numeroSerie: 'numero_serie',
  processador: 'processador',
  memoria: 'memoria',
  armazenamento: 'armazenamento',
  sistema: 'sistema',
  local: 'local',
  observacao: 'observacao',
}

function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({ erro: 'O banco ainda não tem os notebooks e PCs (atualização 59 em core/db).' })
  }
  if (erro.code === '23505') {
    return res.status(409).json({ erro: 'Já existe um equipamento com este patrimônio.', campo: 'patrimonio' })
  }
  if (erro.code === '23503') return res.status(400).json({ erro: 'O responsável escolhido não existe mais.', campo: 'responsavelId' })
  return tratar(erro, res, onde)
}

const paraEquipamento = (l) => ({
  id: String(l.id),
  tipo: l.tipo,
  situacao: l.situacao,
  ...Object.fromEntries(Object.entries(COLUNA).map(([campo, coluna]) => [campo, l[coluna] ?? ''])),
  responsavelId: l.responsavel_id ? String(l.responsavel_id) : null,
  responsavelNome: l.responsavel_nome ?? null,
  aquisicao: l.aquisicao_iso ?? null,
  garantiaAte: l.garantia_iso ?? null,
  atualizadoEm: l.atualizado_em,
  atualizadoPorNome: l.atualizado_por_nome ?? null,
})

const CONSULTA = `
  SELECT e.*, to_char(e.aquisicao, 'YYYY-MM-DD') AS aquisicao_iso, to_char(e.garantia_ate, 'YYYY-MM-DD') AS garantia_iso,
         r.name AS responsavel_nome, a.name AS atualizado_por_nome
    FROM equipamento_ti e
    LEFT JOIN usuario r ON r.id = e.responsavel_id
    LEFT JOIN usuario a ON a.id = e.atualizado_por`

/** O corpo do cadastro, conferido — ou { erro, campo }. */
function lerEquipamento(corpo) {
  const tipo = texto(corpo?.tipo)
  const situacao = texto(corpo?.situacao) || 'em_uso'
  if (!TIPOS_EQUIPAMENTO.some((t) => t.id === tipo)) return { erro: 'Escolha o tipo.', campo: 'tipo' }
  if (!SITUACOES_EQUIPAMENTO.some((s) => s.id === situacao)) return { erro: 'Escolha a situação.', campo: 'situacao' }
  const campos = {}
  for (const [campo, maximo] of Object.entries(CAMPOS_EQUIPAMENTO)) {
    const valor = texto(corpo?.[campo])
    if (valor.length > maximo) return { erro: `Vai até ${maximo} caracteres.`, campo }
    campos[campo] = valor || null
  }
  if (!campos.marca && !campos.modelo) return { erro: 'Informe ao menos a marca ou o modelo.', campo: 'marca' }
  const responsavelId = idValido(corpo?.responsavelId) ? String(corpo.responsavelId) : null
  return { tipo, situacao, campos, responsavelId, aquisicao: dataOuNula(corpo?.aquisicao), garantiaAte: dataOuNula(corpo?.garantiaAte) }
}

async function lerUm(id) {
  const { rows } = await query(`${CONSULTA} WHERE e.id = $1`, [id])
  return rows[0] ? paraEquipamento(rows[0]) : null
}

router.get('/', exigeSessao, exige(VER), async (_req, res) => {
  try {
    const { rows } = await query(`${CONSULTA} ORDER BY e.situacao = 'baixado', e.tipo, lower(coalesce(e.patrimonio, e.modelo, ''))`)
    return res.json({ equipamentos: rows.map(paraEquipamento) })
  } catch (erro) {
    return falhou(erro, res, 'equipamentos/listar')
  }
})

router.post('/', exigeSessao, exige(EDITAR), async (req, res) => {
  const lido = lerEquipamento(req.body)
  if (lido.erro) return res.status(400).json(lido)
  const colunas = Object.keys(COLUNA)
  try {
    const { rows } = await query(
      `INSERT INTO equipamento_ti
         (tipo, situacao, ${colunas.map((c) => COLUNA[c]).join(', ')}, responsavel_id, aquisicao, garantia_ate, atualizado_por)
       VALUES ($1, $2, ${colunas.map((_, i) => `$${i + 3}`).join(', ')}, $${colunas.length + 3}, $${colunas.length + 4},
               $${colunas.length + 5}, $${colunas.length + 6})
       RETURNING id`,
      [lido.tipo, lido.situacao, ...colunas.map((c) => lido.campos[c]), lido.responsavelId, lido.aquisicao, lido.garantiaAte, req.dono.sub],
    )
    const equipamento = await lerUm(rows[0].id)
    await registrarAtividade(req, {
      acao: 'equipamento.cadastrado',
      categoria: 'equipamento',
      entidade: ['equipamento', rows[0].id],
      descricao: 'Equipamento cadastrado',
      detalhes: { tipo: rotuloDoTipo(lido.tipo), modelo: [lido.campos.marca, lido.campos.modelo].filter(Boolean).join(' '), patrimonio: lido.campos.patrimonio },
    })
    return res.status(201).json({ equipamento })
  } catch (erro) {
    return falhou(erro, res, 'equipamentos/cadastrar')
  }
})

router.put('/:id', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Equipamento não encontrado.' })
  const lido = lerEquipamento(req.body)
  if (lido.erro) return res.status(400).json(lido)
  const colunas = Object.keys(COLUNA)
  try {
    const { rowCount } = await query(
      `UPDATE equipamento_ti
          SET tipo = $1, situacao = $2,
              ${colunas.map((c, i) => `${COLUNA[c]} = $${i + 3}`).join(', ')},
              responsavel_id = $${colunas.length + 3}, aquisicao = $${colunas.length + 4},
              garantia_ate = $${colunas.length + 5}, atualizado_por = $${colunas.length + 6}, atualizado_em = now()
        WHERE id = $${colunas.length + 7}`,
      [
        lido.tipo,
        lido.situacao,
        ...colunas.map((c) => lido.campos[c]),
        lido.responsavelId,
        lido.aquisicao,
        lido.garantiaAte,
        req.dono.sub,
        req.params.id,
      ],
    )
    if (!rowCount) return res.status(404).json({ erro: 'Equipamento não encontrado.' })
    const equipamento = await lerUm(req.params.id)
    await registrarAtividade(req, {
      acao: 'equipamento.editado',
      categoria: 'equipamento',
      entidade: ['equipamento', req.params.id],
      descricao: 'Equipamento editado',
      detalhes: { tipo: rotuloDoTipo(lido.tipo), patrimonio: lido.campos.patrimonio, responsavel: equipamento?.responsavelNome ?? null },
    })
    return res.json({ equipamento })
  } catch (erro) {
    return falhou(erro, res, 'equipamentos/editar')
  }
})

router.delete('/:id', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Equipamento não encontrado.' })
  try {
    const { rows } = await query('DELETE FROM equipamento_ti WHERE id = $1 RETURNING tipo, marca, modelo, patrimonio', [
      req.params.id,
    ])
    if (!rows[0]) return res.status(404).json({ erro: 'Equipamento não encontrado.' })
    await registrarAtividade(req, {
      acao: 'equipamento.apagado',
      categoria: 'equipamento',
      entidade: ['equipamento', req.params.id],
      descricao: 'Equipamento apagado',
      detalhes: { tipo: rotuloDoTipo(rows[0].tipo), modelo: [rows[0].marca, rows[0].modelo].filter(Boolean).join(' '), patrimonio: rows[0].patrimonio },
    })
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'equipamentos/apagar')
  }
})

export default router
