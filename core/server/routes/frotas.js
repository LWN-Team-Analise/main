import { Router } from 'express'
import { pool, query } from '../db.js'
import { exige, exigeSessao, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'
/* as perguntas, as posicoes das fotos e os limites sao os MESMOS da
   tela: um arquivo so, sem React dentro, importado pelos dois lados */
import {
  CHAVES_CHECKLIST,
  CHAVES_POSICAO,
  FOTO_BYTES_MAXIMOS,
  KM_MAXIMO,
  NOME_VEICULO_MAXIMO,
  OBSERVACAO_MAXIMA,
  POSTO_MAXIMO,
  TIPOS,
  alertasDe,
  kmLegivel,
  lerHora,
  lerKm,
  lerSimNao,
} from '../../src/domain/frotas.js'
import { AREA, HORARIOS, finaisDoDia } from '../../src/domain/rodizio.js'

/* ============================================================
   FROTAS — /api/frotas

     GET   /veiculos               os veiculos, cada um com o ultimo
                                   registro (em uso ou na garagem)
     POST  /veiculos               cadastra um veiculo
     PUT   /veiculos/:id           edita (e corrige o KM atual)
     PATCH /veiculos/:id/ativo     desativa / reativa
     POST  /saidas                 registra uma saida (ou a troca de
                                   condutor, se o carro ja estava fora)
     POST  /devolucoes             registra uma devolucao
     GET   /registros              as saidas e devolucoes, da mais nova
                                   para a mais antiga, em paginas
     GET   /registros/:id/fotos    as cinco fotos de um registro

   Quem pode o que — conferido AQUI, a cada chamada:

     ver_frotas       qualquer rota daqui. Com ela a pessoa ve todos os
                      veiculos e todos os registros: a aba existe para
                      dar rastreabilidade, e rastro escondido nao serve.
     registrar_frota  dar saida e devolucao.
     editar_veiculos  cadastrar, editar e desativar veiculo.

   As duas de baixo dependem de ver_frotas (src/domain/permissoes.js).

   As regras do registro, que a tela tambem confere mas que valem
   mesmo e aqui (dentro de uma transacao com o veiculo travado, para
   duas saidas ao mesmo tempo nao passarem as duas):

     - o KM nunca e menor que o ultimo do veiculo (veiculo.km_atual);
     - a data e a hora nunca sao anteriores ao ultimo registro dele, e
       a data nunca e futura;
     - so devolve o carro que esta em uso;
     - todos os campos sao obrigatorios, inclusive as cinco fotos.
   ============================================================ */

const router = Router()

const VER = 'ver_frotas'
const REGISTRAR = 'registrar_frota'
const EDITAR = 'editar_veiculos'

const texto = (valor) => String(valor ?? '').trim()

/** Tabela que ainda nao existe vira recado com o arquivo certo, nao 500. */
function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro:
        'O banco ainda não tem as tabelas de Frotas. Rode db/atualizacao-22.sql.txt ' +
        '(ou: npm run db:atualizar) e suba a API de novo.',
    })
  }
  if (erro.code === '23505' && /placa/.test(erro.constraint ?? '')) {
    return res.status(409).json({ erro: 'Já existe um veículo com esta placa.', campo: 'placa' })
  }
  if (erro.code === '23505' && /nome/.test(erro.constraint ?? '')) {
    return res.status(409).json({ erro: 'Já existe um veículo com este nome.', campo: 'nome' })
  }
  return tratar(erro, res, onde)
}

/** Recusa com o campo que causou, para a tela acender o campo certo. */
class Recusa extends Error {
  constructor(campo, mensagem, status = 400) {
    super(mensagem)
    this.campo = campo
    this.status = status
  }
}

/* ------------------------------------------------------------
   Datas — "hoje" e o do Brasil, nao o do servidor (na Vercel o
   relogio e UTC, e as 21h de Sao Paulo ja seriam amanha).
   ------------------------------------------------------------ */

const FUSO = 'America/Sao_Paulo'

function hojeNoBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  )
}

function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [ano, mes, dia] = valor.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  return ano >= 2000 && d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

/* ------------------------------------------------------------
   A ordem dos registros de um veiculo

   Data, hora e, de desempate, o id. Os registros da planilha antiga
   as vezes vieram sem hora (a pessoa digitou "Na"): para eles vale a
   hora em que a resposta foi enviada.
   ------------------------------------------------------------ */

const MOMENTO = `(r.data + coalesce(r.hora, (r.criado_em AT TIME ZONE '${FUSO}')::time))`
const ORDEM_DESC = `${MOMENTO} DESC, r.id DESC`
const ORDEM_ASC = `${MOMENTO} ASC, r.id ASC`

/* ------------------------------------------------------------
   Formato de saida
   ------------------------------------------------------------ */

function paraVeiculo(l) {
  const temUltimo = Boolean(l.ult_tipo)
  return {
    id: String(l.id),
    nome: l.nome,
    marca: l.marca ?? '',
    modelo: l.modelo ?? '',
    placa: l.placa ?? '',
    ano: l.ano ?? null,
    cor: l.cor ?? '',
    kmAtual: l.km_atual ?? null,
    observacao: l.observacao ?? '',
    ativo: l.ativo,
    registros: Number(l.registros ?? 0),
    emUso: temUltimo && l.ult_tipo !== 'devolucao',
    ultimo: temUltimo
      ? {
          tipo: l.ult_tipo,
          condutorId: l.ult_condutor_id ? String(l.ult_condutor_id) : null,
          condutorNome: l.ult_condutor_nome,
          data: l.ult_data,
          hora: l.ult_hora,
          destino: l.ult_destino ?? '',
          km: l.ult_km ?? null,
        }
      : null,
  }
}

function paraRegistro(l) {
  const devolucao = l.tipo === 'devolucao'
  const checklist = devolucao
    ? {
        pneus: l.pneus,
        oleo: l.oleo,
        agua: l.agua,
        abastecido: l.abastecido,
        semParar: l.sem_parar,
        limpoInterno: l.limpo_interno,
        limpoExterno: l.limpo_externo,
        farois: l.farois,
      }
    : null
  /* o quanto o carro andou: do registro anterior dele ate esta devolucao */
  const kmRodados =
    devolucao && l.km !== null && l.km_anterior !== null && l.km >= l.km_anterior ? l.km - l.km_anterior : null
  const registro = {
    id: String(l.id),
    veiculoId: String(l.veiculo_id),
    veiculoNome: l.veiculo_nome,
    tipo: l.tipo,
    usuarioNome: l.usuario_nome ?? '',
    condutorId: l.condutor_id ? String(l.condutor_id) : null,
    condutorNome: l.condutor_nome,
    km: l.km ?? null,
    kmRodados,
    data: l.data,
    hora: l.hora_texto ?? null,
    obraId: l.obra_id ? String(l.obra_id) : null,
    destino: l.destino ?? '',
    observacao: l.observacao ?? '',
    checklist,
    posto: l.posto ?? '',
    fotos: Number(l.fotos ?? 0),
    fotosExternas: l.fotos_externas ?? [],
    daPlanilha: l.planilha_id !== null && l.planilha_id !== undefined,
    criadoEm: l.criado_em,
  }
  registro.alertas = alertasDe(registro)
  return registro
}

/* ------------------------------------------------------------
   Os veiculos
   ------------------------------------------------------------ */

const CONSULTA_VEICULOS = `
  SELECT v.*,
         u.tipo AS ult_tipo, u.condutor_id AS ult_condutor_id, u.condutor_nome AS ult_condutor_nome,
         u.data AS ult_data, to_char(u.hora, 'HH24:MI') AS ult_hora, u.destino AS ult_destino, u.km AS ult_km,
         (SELECT count(*) FROM veiculo_registro x WHERE x.veiculo_id = v.id) AS registros
    FROM veiculo v
    LEFT JOIN LATERAL (
      SELECT r.* FROM veiculo_registro r
       WHERE r.veiculo_id = v.id
       ORDER BY ${ORDEM_DESC}
       LIMIT 1
    ) u ON true
`

router.get('/veiculos', exigeSessao, exige(VER), async (_req, res) => {
  try {
    const [{ rows }, reservas] = await Promise.all([
      query(`${CONSULTA_VEICULOS} ORDER BY v.ativo DESC, lower(v.nome)`),
      /* a reserva de obra que ainda nao retirou o carro (atualizacao 23).
         Sem a tabela, nenhum carro esta reservado */
      query(
        `SELECT rv.veiculo_id, o.id AS obra_id, cl.nome AS cliente, o.proposta
           FROM obra_reserva_veiculo rv
           JOIN obra o     ON o.id = rv.obra_id
           JOIN cliente cl ON cl.id = o.cliente_id
          WHERE rv.veiculo_id IS NOT NULL AND rv.registro_id IS NULL AND o.concluida_em IS NULL`,
      ).catch((erro) => (erro.code === '42P01' ? { rows: [] } : Promise.reject(erro))),
    ])
    const reservaDo = new Map(
      reservas.rows.map((r) => [
        String(r.veiculo_id),
        { obraId: String(r.obra_id), nome: [r.cliente, texto(r.proposta)].filter(Boolean).join(' — ') },
      ]),
    )
    return res.json({
      veiculos: rows.map((l) => ({ ...paraVeiculo(l), reservadoPara: reservaDo.get(String(l.id)) ?? null })),
    })
  } catch (erro) {
    return falhou(erro, res, 'frotas/veiculos')
  }
})

/** 'abc-1d23' -> 'ABC1D23'. Aceita a placa antiga (ABC1234) e a Mercosul (ABC1D23). */
function lerPlaca(valor) {
  const placa = texto(valor).toUpperCase().replace(/[\s-]/g, '')
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa) ? placa : null
}

/** O corpo do cadastro/edicao de veiculo, conferido. Lanca Recusa. */
function lerVeiculo(corpo) {
  const nome = texto(corpo.nome)
  const marca = texto(corpo.marca)
  const modelo = texto(corpo.modelo)
  const cor = texto(corpo.cor)
  const observacao = texto(corpo.observacao)
  if (!nome) throw new Recusa('nome', 'Dê um nome ao veículo (ex.: Spin 01).')
  if (nome.length > NOME_VEICULO_MAXIMO) throw new Recusa('nome', `O nome tem no máximo ${NOME_VEICULO_MAXIMO} caracteres.`)
  if (!marca) throw new Recusa('marca', 'Informe a marca.')
  if (marca.length > 60) throw new Recusa('marca', 'A marca tem no máximo 60 caracteres.')
  if (!modelo) throw new Recusa('modelo', 'Informe o modelo.')
  if (modelo.length > 60) throw new Recusa('modelo', 'O modelo tem no máximo 60 caracteres.')

  const placa = lerPlaca(corpo.placa)
  if (!placa) throw new Recusa('placa', 'Informe a placa no formato ABC1D23 ou ABC-1234.')

  const ano = Number(texto(corpo.ano))
  const anoMaximo = Number(hojeNoBrasil().slice(0, 4)) + 1
  if (!Number.isInteger(ano) || ano < 1950 || ano > anoMaximo) {
    throw new Recusa('ano', `Informe o ano do veículo (1950 a ${anoMaximo}).`)
  }
  if (!cor) throw new Recusa('cor', 'Informe a cor.')
  if (cor.length > 40) throw new Recusa('cor', 'A cor tem no máximo 40 caracteres.')

  const kmAtual = lerKm(corpo.kmAtual)
  if (kmAtual === null) throw new Recusa('kmAtual', 'Informe o KM atual do veículo, só números.')
  if (observacao.length > OBSERVACAO_MAXIMA) {
    throw new Recusa('observacao', `A observação tem no máximo ${OBSERVACAO_MAXIMA} caracteres.`)
  }
  return { nome, marca, modelo, placa, ano, cor, kmAtual, observacao: observacao || null }
}

async function lerUmVeiculo(id) {
  const { rows } = await query(`${CONSULTA_VEICULOS} WHERE v.id = $1`, [id])
  return rows[0] ? paraVeiculo(rows[0]) : null
}

const idValido = (valor) => /^\d{1,18}$/.test(String(valor ?? ''))

router.post('/veiculos', exigeSessao, exige(EDITAR), async (req, res) => {
  try {
    const v = lerVeiculo(req.body ?? {})
    const { rows } = await query(
      `INSERT INTO veiculo (nome, marca, modelo, placa, ano, cor, km_atual, observacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [v.nome, v.marca, v.modelo, v.placa, v.ano, v.cor, v.kmAtual, v.observacao],
    )
    const veiculo = await lerUmVeiculo(rows[0].id)
    await registrarAtividade(req, {
      acao: 'frota.veiculo_criado',
      categoria: 'frota',
      entidade: ['veiculo', rows[0].id],
      descricao: 'Veículo cadastrado',
      detalhes: { veiculo: v.nome, placa: v.placa, km: kmLegivel(v.kmAtual) },
    })
    return res.status(201).json({ veiculo })
  } catch (erro) {
    if (erro instanceof Recusa) return res.status(erro.status).json({ erro: erro.message, campo: erro.campo })
    return falhou(erro, res, 'frotas/veiculos/criar')
  }
})

router.put('/veiculos/:id', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Veículo não encontrado.' })
  try {
    const v = lerVeiculo(req.body ?? {})
    const { rows: antes } = await query('SELECT nome, km_atual FROM veiculo WHERE id = $1', [req.params.id])
    if (!antes[0]) return res.status(404).json({ erro: 'Veículo não encontrado.' })

    await query(
      `UPDATE veiculo
          SET nome = $2, marca = $3, modelo = $4, placa = $5, ano = $6, cor = $7, km_atual = $8, observacao = $9
        WHERE id = $1`,
      [req.params.id, v.nome, v.marca, v.modelo, v.placa, v.ano, v.cor, v.kmAtual, v.observacao],
    )
    const veiculo = await lerUmVeiculo(req.params.id)
    /* mexer no KM e o que muda o piso da proxima saida: fica no historico
       com o de antes e o de agora */
    const kmMudou = antes[0].km_atual !== v.kmAtual
    await registrarAtividade(req, {
      acao: 'frota.veiculo_editado',
      categoria: 'frota',
      entidade: ['veiculo', req.params.id],
      descricao: kmMudou ? 'KM do veículo corrigido' : 'Veículo editado',
      detalhes: {
        veiculo: v.nome,
        km: kmMudou ? `${kmLegivel(antes[0].km_atual)} → ${kmLegivel(v.kmAtual)}` : undefined,
      },
    })
    return res.json({ veiculo })
  } catch (erro) {
    if (erro instanceof Recusa) return res.status(erro.status).json({ erro: erro.message, campo: erro.campo })
    return falhou(erro, res, 'frotas/veiculos/editar')
  }
})

router.patch('/veiculos/:id/ativo', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Veículo não encontrado.' })
  const ativo = req.body?.ativo === true
  try {
    const { rows } = await query('UPDATE veiculo SET ativo = $2 WHERE id = $1 RETURNING nome', [req.params.id, ativo])
    if (!rows[0]) return res.status(404).json({ erro: 'Veículo não encontrado.' })
    await registrarAtividade(req, {
      acao: ativo ? 'frota.veiculo_reativado' : 'frota.veiculo_desativado',
      categoria: 'frota',
      entidade: ['veiculo', req.params.id],
      descricao: ativo ? 'Veículo reativado' : 'Veículo desativado',
      detalhes: { veiculo: rows[0].nome },
    })
    return res.json({ veiculo: await lerUmVeiculo(req.params.id) })
  } catch (erro) {
    return falhou(erro, res, 'frotas/veiculos/ativo')
  }
})

/* ------------------------------------------------------------
   As fotos

   Chegam como data URL de imagem, uma por posicao. A tela ja reduz
   cada uma antes de enviar; aqui confere que e imagem de verdade em
   base64 e que cabe no teto.
   ------------------------------------------------------------ */

function lerFotos(bruto) {
  const fotos = []
  for (const posicao of CHAVES_POSICAO) {
    const conteudo = String(bruto?.[posicao] ?? '')
    if (!conteudo) throw new Recusa('fotos', 'Tire as cinco fotos: frente, traseira, os dois lados e o painel.')

    const cabecalho = /^data:(image\/(?:jpeg|png|webp));base64,/i.exec(conteudo)
    const base64 = cabecalho ? conteudo.slice(cabecalho[0].length) : ''
    if (!cabecalho || !base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new Recusa('fotos', 'Uma das fotos chegou corrompida. Tire de novo e reenvie.')
    }
    const sobra = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
    const tamanho = (base64.length / 4) * 3 - sobra
    if (tamanho > FOTO_BYTES_MAXIMOS) {
      throw new Recusa('fotos', 'Uma das fotos ficou grande demais. Tire de novo e reenvie.')
    }
    fotos.push({ posicao, tipo: cabecalho[1].toLowerCase(), tamanho, conteudo })
  }
  return fotos
}

/* ------------------------------------------------------------
   Saida e devolucao — o que as duas tem em comum
   ------------------------------------------------------------ */

/** O que vale para os dois formularios. Lanca Recusa. */
function lerComum(corpo) {
  if (!idValido(corpo.veiculoId)) throw new Recusa('veiculoId', 'Escolha o veículo.')
  if (!idValido(corpo.condutorId)) throw new Recusa('condutorId', 'Escolha o condutor do veículo.')

  const km = lerKm(corpo.km)
  if (km === null) throw new Recusa('km', `Informe o KM, só números (até ${KM_MAXIMO.toLocaleString('pt-BR')}).`)

  const data = texto(corpo.data)
  if (!dataValida(data)) throw new Recusa('data', 'Informe a data.')
  if (data > hojeNoBrasil()) throw new Recusa('data', 'A data não pode ser no futuro.')

  const hora = lerHora(corpo.hora)
  if (!hora) throw new Recusa('hora', 'Informe a hora no formato HH:MM.')

  const observacao = texto(corpo.observacao)
  if (!observacao) throw new Recusa('observacao', 'Escreva a observação (se não houver nada, escreva "Nenhuma").')
  if (observacao.length > OBSERVACAO_MAXIMA) {
    throw new Recusa('observacao', `A observação tem no máximo ${OBSERVACAO_MAXIMA} caracteres.`)
  }

  return { veiculoId: corpo.veiculoId, condutorId: corpo.condutorId, km, data, hora, observacao, fotos: lerFotos(corpo.fotos) }
}

/**
 * Trava o veiculo e le o que as regras precisam: o cadastro, o
 * ultimo registro e o condutor escolhido. Lanca Recusa.
 */
async function prepararRegistro(cliente, dados, donoId) {
  const { rows: v } = await cliente.query('SELECT id, nome, km_atual, ativo FROM veiculo WHERE id = $1 FOR UPDATE', [
    dados.veiculoId,
  ])
  const veiculo = v[0]
  if (!veiculo || !veiculo.ativo) throw new Recusa('veiculoId', 'Este veículo não está mais disponível. Escolha outro.', 409)

  const { rows: u } = await cliente.query(
    `SELECT r.tipo, r.condutor_nome, r.data, to_char(${MOMENTO}, 'YYYY-MM-DD HH24:MI') AS momento
       FROM veiculo_registro r
      WHERE r.veiculo_id = $1
      ORDER BY ${ORDEM_DESC}
      LIMIT 1`,
    [veiculo.id],
  )
  const ultimo = u[0] ?? null

  if (veiculo.km_atual !== null && dados.km < veiculo.km_atual) {
    throw new Recusa(
      'km',
      `O KM não pode ser menor que o último registrado para o ${veiculo.nome}: ${kmLegivel(veiculo.km_atual)}.`,
      409,
    )
  }

  if (ultimo && `${dados.data} ${dados.hora}` < ultimo.momento) {
    const [dia, hora] = ultimo.momento.split(' ')
    throw new Recusa(
      'data',
      `A data e a hora não podem ser anteriores ao último registro do ${veiculo.nome} (${dataBR(dia)} às ${hora}).`,
      409,
    )
  }

  const { rows: c } = await cliente.query('SELECT id, name FROM usuario WHERE id = $1 AND ativo', [dados.condutorId])
  if (!c[0]) throw new Recusa('condutorId', 'Este colaborador não está mais ativo. Escolha outro.', 409)

  const { rows: q } = await cliente.query('SELECT name FROM usuario WHERE id = $1', [donoId])

  return { veiculo, ultimo, condutor: c[0], quem: q[0]?.name ?? null }
}

async function gravarFotos(cliente, registroId, fotos) {
  for (const f of fotos) {
    await cliente.query(
      'INSERT INTO veiculo_foto (registro_id, posicao, tipo, tamanho, conteudo) VALUES ($1, $2, $3, $4, $5)',
      [registroId, f.posicao, f.tipo, f.tamanho, f.conteudo],
    )
  }
}

/** Um registro inteiro, no formato da lista. */
async function lerUmRegistro(id) {
  const { rows } = await query(`${CONSULTA_REGISTROS} SELECT * FROM base WHERE id = $1`, [id])
  return rows[0] ? paraRegistro(rows[0]) : null
}

/**
 * Roda `gravar` numa transacao: ou entra o registro, as fotos e o KM
 * novo do veiculo, ou nada entra.
 */
async function emTransacao(gravar) {
  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const resultado = await gravar(cliente)
    await cliente.query('COMMIT')
    return resultado
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => {})
    throw erro
  } finally {
    cliente.release()
  }
}

/* ------------------------------------------------------------
   Saida (ou troca de condutor)
   ------------------------------------------------------------ */

router.post('/saidas', exigeSessao, exige(REGISTRAR), async (req, res) => {
  try {
    const corpo = req.body ?? {}
    const dados = lerComum(corpo)
    if (!idValido(corpo.obraId)) throw new Recusa('obraId', 'Escolha a obra de destino.')

    const { registroId, tipo, veiculo, condutor, destino, retirada } = await emTransacao(async (cliente) => {
      const { veiculo: v, ultimo, condutor: c, quem } = await prepararRegistro(cliente, dados, req.dono.sub)

      /* a obra tem de estar no quadro: obra concluida ja saiu de la */
      const { rows: o } = await cliente.query(
        `SELECT o.id, o.proposta, o.descricao, o.concluida_em, cl.nome AS cliente
           FROM obra o JOIN cliente cl ON cl.id = o.cliente_id
          WHERE o.id = $1`,
        [corpo.obraId],
      )
      if (!o[0] || o[0].concluida_em) {
        throw new Recusa('obraId', 'Esta obra não está mais ativa. Escolha outra.', 409)
      }
      const obra = o[0]
      const destinoObra = [obra.cliente, texto(obra.proposta) || texto(obra.descricao)].filter(Boolean).join(' — ')

      /* carro que ja estava fora e "sai" de novo e uma troca de condutor */
      const tipoRegistro = ultimo && ultimo.tipo !== 'devolucao' ? 'troca' : 'saida'

      const { rows } = await cliente.query(
        `INSERT INTO veiculo_registro (
           veiculo_id, tipo, usuario_id, usuario_nome, condutor_id, condutor_nome,
           km, data, hora, obra_id, destino, observacao
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [v.id, tipoRegistro, req.dono.sub, quem, c.id, c.name, dados.km, dados.data, dados.hora, obra.id, destinoObra.slice(0, 500), dados.observacao],
      )
      await gravarFotos(cliente, rows[0].id, dados.fotos)
      await cliente.query('UPDATE veiculo SET km_atual = $2 WHERE id = $1', [v.id, dados.km])
      /* a saida do carro RESERVADO para esta obra e a retirada dele:
         liga a saida a reserva e marca o "Retirada do carro" da obra */
      const retirada = await ligarRetirada(cliente, obra.id, v.id, rows[0].id, req.dono.sub)
      return { registroId: rows[0].id, tipo: tipoRegistro, veiculo: v, condutor: c, destino: destinoObra, retirada }
    })

    await registrarAtividade(req, {
      acao: tipo === 'troca' ? 'frota.troca' : 'frota.saida',
      categoria: 'frota',
      entidade: ['veiculo', veiculo.id],
      descricao: tipo === 'troca' ? 'Troca de condutor do veículo' : 'Saída de veículo',
      detalhes: { veiculo: veiculo.nome, condutor: condutor.name, km: kmLegivel(dados.km), destino },
    })
    return res.status(201).json({ registro: await lerUmRegistro(registroId), retirada })
  } catch (erro) {
    if (erro instanceof Recusa) return res.status(erro.status).json({ erro: erro.message, campo: erro.campo })
    return falhou(erro, res, 'frotas/saidas')
  }
})

/* ------------------------------------------------------------
   Devolucao
   ------------------------------------------------------------ */

router.post('/devolucoes', exigeSessao, exige(REGISTRAR), async (req, res) => {
  try {
    const corpo = req.body ?? {}
    const dados = lerComum(corpo)

    const respostas = {}
    for (const chave of CHAVES_CHECKLIST) {
      const resposta = lerSimNao(corpo.checklist?.[chave])
      if (resposta === null) throw new Recusa(`checklist.${chave}`, 'Responda sim ou não.')
      respostas[chave] = resposta
    }
    const posto = respostas.semParar ? texto(corpo.posto) : ''
    if (respostas.semParar && !posto) throw new Recusa('posto', 'Informe o posto e o valor aproximado do abastecimento.')
    if (posto.length > POSTO_MAXIMO) throw new Recusa('posto', `No máximo ${POSTO_MAXIMO} caracteres.`)

    const { registroId, veiculo, condutor, alertas } = await emTransacao(async (cliente) => {
      const { veiculo: v, ultimo, condutor: c, quem } = await prepararRegistro(cliente, dados, req.dono.sub)
      if (!ultimo || ultimo.tipo === 'devolucao') {
        throw new Recusa('veiculoId', `O ${v.nome} não está em uso: ele já foi devolvido.`, 409)
      }

      const { rows } = await cliente.query(
        `INSERT INTO veiculo_registro (
           veiculo_id, tipo, usuario_id, usuario_nome, condutor_id, condutor_nome,
           km, data, hora, observacao,
           pneus, oleo, agua, abastecido, sem_parar, posto, limpo_interno, limpo_externo, farois
         ) VALUES ($1, 'devolucao', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id`,
        [
          v.id,
          req.dono.sub,
          quem,
          c.id,
          c.name,
          dados.km,
          dados.data,
          dados.hora,
          dados.observacao,
          respostas.pneus,
          respostas.oleo,
          respostas.agua,
          respostas.abastecido,
          respostas.semParar,
          posto || null,
          respostas.limpoInterno,
          respostas.limpoExterno,
          respostas.farois,
        ],
      )
      await gravarFotos(cliente, rows[0].id, dados.fotos)
      await cliente.query('UPDATE veiculo SET km_atual = $2 WHERE id = $1', [v.id, dados.km])
      return {
        registroId: rows[0].id,
        veiculo: v,
        condutor: c,
        alertas: alertasDe({ tipo: 'devolucao', checklist: respostas }).length,
      }
    })

    await registrarAtividade(req, {
      acao: 'frota.devolucao',
      categoria: 'frota',
      entidade: ['veiculo', veiculo.id],
      descricao: 'Devolução de veículo',
      detalhes: {
        veiculo: veiculo.nome,
        condutor: condutor.name,
        km: kmLegivel(dados.km),
        pendencias: alertas ? `${alertas} item(ns) com "não"` : undefined,
      },
    })
    return res.status(201).json({ registro: await lerUmRegistro(registroId) })
  } catch (erro) {
    if (erro instanceof Recusa) return res.status(erro.status).json({ erro: erro.message, campo: erro.campo })
    return falhou(erro, res, 'frotas/devolucoes')
  }
})

/* ============================================================
   A RESERVA DE CARRO DA OBRA (atualizacao 23)

     GET    /reservas/disponiveis?obra=  os carros que se pode reservar
     PUT    /reservas/:obraId            reserva { veiculoId } ou
                                         { semCarro: true }
     DELETE /reservas/:obraId            cancela a reserva

   O check "Reserva de carro" (1a etapa) so o SUPERVISOR marca — o
   cargo da pessoa (cargo_titulo), e nao o setor — ou quem esta num
   setor com acesso total. Reservar e que marca o check; cancelar
   desmarca. Depois que o carro sai (a saida liga a reserva, ver
   ligarRetirada), a reserva nao muda mais.

   Carro que se pode reservar: ativo, na garagem (o ultimo registro
   dele e uma devolucao) e sem reserva de OUTRA obra aberta que ainda
   nao o retirou.
   ============================================================ */

/** O check do sistema daquele tipo que ESTA obra enxerga (ou null). A mesma conta de dados.js. */
async function checkDaObra(db, obraId, tipo) {
  const { rows } = await db.query(
    `SELECT ck.id
       FROM obra o
       JOIN etapa_check ck ON ck.tipo = $2
                          AND CASE WHEN o.checks_proprios
                                   THEN ck.obra_id = o.id AND ck.vigente_ate IS NULL
                                   ELSE ck.obra_id IS NULL
                                        AND ck.vigente_de <= o.criado_em
                                        AND (ck.vigente_ate IS NULL OR o.criado_em < ck.vigente_ate)
                              END
      WHERE o.id = $1
      ORDER BY ck.id DESC
      LIMIT 1`,
    [obraId, tipo],
  )
  return rows[0]?.id ?? null
}

/**
 * A saida de um carro reservado para a obra de destino E a retirada
 * dele: grava a saida na reserva e marca o check "Retirada do carro".
 * Roda dentro da transacao da saida. Devolve true quando era a retirada.
 */
async function ligarRetirada(cliente, obraId, veiculoId, registroId, usuarioId) {
  /* banco sem a atualizacao 23: confere ANTES, porque um erro aqui
     dentro anularia a transacao da saida inteira */
  const { rows: tabela } = await cliente.query("SELECT to_regclass('public.obra_reserva_veiculo') IS NOT NULL AS ok")
  if (!tabela[0]?.ok) return false
  const { rows } = await cliente.query(
    `UPDATE obra_reserva_veiculo SET registro_id = $3
      WHERE obra_id = $1 AND veiculo_id = $2 AND registro_id IS NULL
      RETURNING obra_id`,
    [obraId, veiculoId, registroId],
  )
  if (!rows[0]) return false
  const checkId = await checkDaObra(cliente, obraId, 'retirada_carro')
  if (checkId) {
    await cliente.query(
      `INSERT INTO obra_check (obra_id, check_id, feito_por) VALUES ($1, $2, $3)
       ON CONFLICT (obra_id, check_id) DO NOTHING`,
      [obraId, checkId, usuarioId],
    )
  }
  return true
}

/** Supervisor (o cargo da pessoa) ou setor com acesso total. */
async function podeReservar(usuarioId) {
  const { rows } = await query(
    `SELECT coalesce(c.acesso_total, false) AS total, lower(coalesce(t.nome, u.cargo_titulo, '')) AS titulo
       FROM usuario u
       LEFT JOIN cargo c        ON c.id = u.cargo_id
       LEFT JOIN cargo_titulo t ON t.id = u.cargo_titulo_id
      WHERE u.id = $1 AND u.ativo`,
    [usuarioId],
  )
  return Boolean(rows[0]) && (rows[0].total || rows[0].titulo.startsWith('supervisor'))
}

async function exigeReservador(req, res, next) {
  try {
    if (!(await podeReservar(req.dono.sub))) {
      return res.status(403).json({ erro: 'Só o supervisor reserva o carro da obra.' })
    }
    return next()
  } catch (erro) {
    return falhou(erro, res, 'frotas/reserva-permissao')
  }
}

/* os carros que a obra $1 pode reservar (a reserva dela mesma conta como livre) */
const CARROS_LIVRES = `
  SELECT v.id, v.nome, v.marca, v.modelo, v.placa, v.km_atual
    FROM veiculo v
   WHERE v.ativo
     AND coalesce((SELECT r.tipo FROM veiculo_registro r WHERE r.veiculo_id = v.id
                    ORDER BY ${ORDEM_DESC} LIMIT 1), 'devolucao') = 'devolucao'
     AND NOT EXISTS (SELECT 1 FROM obra_reserva_veiculo rv JOIN obra o ON o.id = rv.obra_id
                      WHERE rv.veiculo_id = v.id AND rv.registro_id IS NULL
                        AND o.concluida_em IS NULL AND rv.obra_id <> $1)
`

router.get('/reservas/disponiveis', exigeSessao, exigeReservador, async (req, res) => {
  const obraId = idValido(req.query.obra) ? req.query.obra : '0'
  try {
    const { rows } = await query(`${CARROS_LIVRES} ORDER BY lower(v.nome)`, [obraId])
    return res.json({
      veiculos: rows.map((v) => ({
        id: String(v.id),
        nome: v.nome,
        marca: v.marca ?? '',
        modelo: v.modelo ?? '',
        placa: v.placa ?? '',
        kmAtual: v.km_atual ?? null,
      })),
    })
  } catch (erro) {
    return falhou(erro, res, 'frotas/reservas-disponiveis')
  }
})

router.put('/reservas/:obraId', exigeSessao, exigeReservador, async (req, res) => {
  const { obraId } = req.params
  if (!idValido(obraId)) return res.status(404).json({ erro: 'Obra não encontrada.' })
  const semCarro = req.body?.semCarro === true
  const veiculoId = semCarro ? null : req.body?.veiculoId
  if (!semCarro && !idValido(veiculoId)) {
    return res.status(400).json({ erro: 'Escolha o carro.', campo: 'veiculoId' })
  }
  try {
    const { veiculoNome, obraNome } = await emTransacao(async (cliente) => {
      const { rows: o } = await cliente.query(
        `SELECT o.id, o.concluida_em, coalesce(nullif(btrim(o.proposta), ''), cl.nome) AS nome
           FROM obra o JOIN cliente cl ON cl.id = o.cliente_id
          WHERE o.id = $1 FOR UPDATE OF o`,
        [obraId],
      )
      if (!o[0]) throw new Recusa(null, 'Obra não encontrada.', 404)
      if (o[0].concluida_em) throw new Recusa(null, 'A obra já foi concluída.', 409)

      const checkId = await checkDaObra(cliente, obraId, 'reserva_carro')
      if (!checkId) throw new Recusa(null, 'Esta obra foi criada antes do check "Reserva de carro".', 409)

      const { rows: antes } = await cliente.query('SELECT registro_id FROM obra_reserva_veiculo WHERE obra_id = $1', [
        obraId,
      ])
      if (antes[0]?.registro_id) {
        throw new Recusa(null, 'O carro desta obra já foi retirado: a reserva não muda mais.', 409)
      }

      let nome = null
      if (veiculoId) {
        /* trava o carro: duas reservas ao mesmo tempo nao levam o mesmo */
        await cliente.query('SELECT id FROM veiculo WHERE id = $1 FOR UPDATE', [veiculoId])
        const { rows: livre } = await cliente.query(`${CARROS_LIVRES} AND v.id = $2`, [obraId, veiculoId])
        if (!livre[0]) throw new Recusa('veiculoId', 'Este carro não está mais disponível. Escolha outro.', 409)
        nome = livre[0].nome
      }

      await cliente.query(
        `INSERT INTO obra_reserva_veiculo (obra_id, veiculo_id, reservado_por, reservado_em, registro_id)
         VALUES ($1, $2, $3, now(), NULL)
         ON CONFLICT (obra_id) DO UPDATE
            SET veiculo_id = EXCLUDED.veiculo_id, reservado_por = EXCLUDED.reservado_por,
                reservado_em = now(), registro_id = NULL`,
        [obraId, veiculoId, req.dono.sub],
      )
      await cliente.query(
        `INSERT INTO obra_check (obra_id, check_id, feito_por) VALUES ($1, $2, $3)
         ON CONFLICT (obra_id, check_id) DO UPDATE SET feito_por = EXCLUDED.feito_por, feito_em = now()`,
        [obraId, checkId, req.dono.sub],
      )
      return { veiculoNome: nome, obraNome: o[0].nome }
    })

    await registrarAtividade(req, {
      acao: 'frota.reserva',
      categoria: 'frota',
      entidade: ['obra', obraId],
      descricao: veiculoNome ? 'Carro reservado para a obra' : 'Obra marcada sem carro da frota',
      detalhes: { obra: obraNome, veiculo: veiculoNome ?? 'sem carro' },
    })
    return res.json({ ok: true })
  } catch (erro) {
    if (erro instanceof Recusa) return res.status(erro.status).json({ erro: erro.message, campo: erro.campo })
    return falhou(erro, res, 'frotas/reservar')
  }
})

router.delete('/reservas/:obraId', exigeSessao, exigeReservador, async (req, res) => {
  const { obraId } = req.params
  if (!idValido(obraId)) return res.status(404).json({ erro: 'Obra não encontrada.' })
  try {
    await emTransacao(async (cliente) => {
      const { rows } = await cliente.query('SELECT registro_id FROM obra_reserva_veiculo WHERE obra_id = $1 FOR UPDATE', [
        obraId,
      ])
      if (!rows[0]) return
      if (rows[0].registro_id) {
        throw new Recusa(null, 'O carro desta obra já foi retirado: a reserva não se cancela mais.', 409)
      }
      await cliente.query('DELETE FROM obra_reserva_veiculo WHERE obra_id = $1', [obraId])
      await cliente.query(
        `DELETE FROM obra_check
          WHERE obra_id = $1
            AND check_id IN (SELECT id FROM etapa_check WHERE tipo IN ('reserva_carro', 'retirada_carro'))`,
        [obraId],
      )
    })
    await registrarAtividade(req, {
      acao: 'frota.reserva_cancelada',
      categoria: 'frota',
      entidade: ['obra', obraId],
      descricao: 'Reserva de carro cancelada',
    })
    return res.status(204).end()
  } catch (erro) {
    if (erro instanceof Recusa) return res.status(erro.status).json({ erro: erro.message, campo: erro.campo })
    return falhou(erro, res, 'frotas/reserva-cancelar')
  }
})

/* ------------------------------------------------------------
   Os registros

   Da mais nova para a mais antiga, 30 por pagina. Os filtros se
   somam:
     ?veiculo=  o id do veiculo
     ?tipo=     saida | devolucao | troca
     ?alertas=1 so as devolucoes com algum NAO importante
     ?mes=      AAAA-MM
     ?busca=    condutor, quem registrou ou destino
     ?pagina=   1, 2, 3...

   O KM do registro anterior do MESMO veiculo sai de uma janela
   (LAG) calculada antes do filtro — senao, filtrando por condutor,
   o "anterior" seria o registro anterior DELE, e nao o do carro.
   ------------------------------------------------------------ */

const POR_PAGINA = 30

const CONSULTA_REGISTROS = `
  WITH base AS (
    SELECT r.*, v.nome AS veiculo_nome,
           to_char(r.hora, 'HH24:MI') AS hora_texto,
           LAG(r.km) OVER (PARTITION BY r.veiculo_id ORDER BY ${ORDEM_ASC}) AS km_anterior,
           ${MOMENTO} AS momento,
           coalesce(f.fotos, 0) AS fotos
      FROM veiculo_registro r
      JOIN veiculo v ON v.id = r.veiculo_id
      LEFT JOIN (SELECT registro_id, count(*) AS fotos FROM veiculo_foto GROUP BY registro_id) f
             ON f.registro_id = r.id
  )
`

/* a mesma regra de alertasDe (src/domain/frotas.js), em SQL: devolucao
   com algum NAO importante — o Sem Parar nao conta */
const COM_ALERTA = `(tipo = 'devolucao' AND false IN (pneus, oleo, agua, abastecido, limpo_interno, limpo_externo, farois))`

router.get('/registros', exigeSessao, exige(VER), async (req, res) => {
  const filtros = []
  const valores = []
  const pedir = (valor) => {
    valores.push(valor)
    return `$${valores.length}`
  }

  const veiculo = texto(req.query.veiculo)
  if (veiculo) {
    if (!idValido(veiculo)) return res.json({ registros: [], total: 0, temMais: false })
    filtros.push(`veiculo_id = ${pedir(veiculo)}`)
  }

  const tipo = texto(req.query.tipo)
  if (tipo) {
    if (!TIPOS[tipo]) return res.status(400).json({ erro: 'Tipo de registro desconhecido.' })
    filtros.push(`tipo = ${pedir(tipo)}`)
  }

  if (req.query.alertas === '1') filtros.push(COM_ALERTA)

  const mes = texto(req.query.mes)
  if (mes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return res.status(400).json({ erro: 'Mês inválido.' })
    const [ano, m] = mes.split('-').map(Number)
    const proximo = m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, '0')}`
    filtros.push(`data >= ${pedir(`${mes}-01`)} AND data < ${pedir(`${proximo}-01`)}`)
  }

  const busca = texto(req.query.busca).slice(0, 80)
  if (busca) {
    const termo = pedir(`%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    filtros.push(`(condutor_nome ILIKE ${termo} OR usuario_nome ILIKE ${termo} OR destino ILIKE ${termo})`)
  }

  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(req.query.pagina, 10) || 1))
  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''

  try {
    const { rows } = await query(
      `${CONSULTA_REGISTROS}
       SELECT *, count(*) OVER () AS total
         FROM base
         ${onde}
        ORDER BY momento DESC, id DESC
        LIMIT ${POR_PAGINA + 1} OFFSET ${(pagina - 1) * POR_PAGINA}`,
      valores,
    )
    const total = rows[0] ? Number(rows[0].total) : 0
    return res.json({
      registros: rows.slice(0, POR_PAGINA).map(paraRegistro),
      total,
      temMais: rows.length > POR_PAGINA,
    })
  } catch (erro) {
    return falhou(erro, res, 'frotas/registros')
  }
})

router.get('/registros/:id/fotos', exigeSessao, exige(VER), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Registro não encontrado.' })
  try {
    const { rows } = await query('SELECT posicao, conteudo FROM veiculo_foto WHERE registro_id = $1', [req.params.id])
    const ordem = (p) => CHAVES_POSICAO.indexOf(p)
    return res.json({
      fotos: rows.sort((a, b) => ordem(a.posicao) - ordem(b.posicao)).map((f) => ({ posicao: f.posicao, conteudo: f.conteudo })),
    })
  } catch (erro) {
    return falhou(erro, res, 'frotas/fotos')
  }
})

/* ============================================================
   O RODIZIO DE SAO PAULO — GET /rodizio

   A regra (dia da semana -> finais de placa, horarios) mora em
   src/domain/rodizio.js. O que muda de ano para ano sao os FERIADOS,
   e eles vem da BrasilAPI (brasilapi.com.br/api/feriados/v1/AAAA): a
   lista nacional, com Carnaval, Sexta-feira Santa e Corpus Christi.
   Por cima dela entram os de Sao Paulo: o aniversario da cidade
   (25/01) e a quarta-feira de cinzas, quando a CET suspende o rodizio.

   A lista de cada ano fica 12 horas na memoria. Sem resposta da
   BrasilAPI, os feriados sao calculados aqui mesmo — os fixos e os
   que dependem da Pascoa —, e a resposta diz qual das duas fontes
   valeu.

   Devolve hoje e os proximos 6 dias, cada um com os finais que nao
   circulam ou o motivo de estar livre.
   ============================================================ */

const feriadosEmCache = new Map()

/** Domingo de Pascoa (algoritmo de Meeus/Jones/Butcher), 'AAAA-MM-DD'. */
function pascoa(ano) {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function somarDiasIso(iso, n) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Os feriados nacionais calculados, para quando a BrasilAPI nao responde. */
function feriadosCalculados(ano) {
  const p = pascoa(ano)
  return [
    [`${ano}-01-01`, 'Confraternização mundial'],
    [somarDiasIso(p, -48), 'Carnaval'],
    [somarDiasIso(p, -47), 'Carnaval'],
    [somarDiasIso(p, -2), 'Sexta-feira Santa'],
    [`${ano}-04-21`, 'Tiradentes'],
    [`${ano}-05-01`, 'Dia do trabalho'],
    [somarDiasIso(p, 60), 'Corpus Christi'],
    [`${ano}-09-07`, 'Independência do Brasil'],
    [`${ano}-10-12`, 'Nossa Senhora Aparecida'],
    [`${ano}-11-02`, 'Finados'],
    [`${ano}-11-15`, 'Proclamação da República'],
    [`${ano}-11-20`, 'Dia da consciência negra'],
    [`${ano}-12-25`, 'Natal'],
  ].map(([data, nome]) => ({ data, nome }))
}

/** { lista: [{ data, nome }], fonte } dos feriados do ano, nacionais + os de Sao Paulo. */
async function feriadosDoAno(ano) {
  const guardado = feriadosEmCache.get(ano)
  if (guardado && guardado.ate > Date.now()) return guardado

  let lista
  let fonte = 'BrasilAPI'
  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!resposta.ok) throw new Error(`BrasilAPI ${resposta.status}`)
    const corpo = await resposta.json()
    lista = corpo.map((f) => ({ data: String(f.date).slice(0, 10), nome: f.name }))
    if (!lista.length) throw new Error('BrasilAPI sem feriados')
  } catch {
    lista = feriadosCalculados(ano)
    fonte = 'cálculo local (BrasilAPI indisponível)'
  }

  /* os de Sao Paulo, por cima dos nacionais */
  const terca = feriadosCalculados(ano).find((f) => f.nome === 'Carnaval' && diaDaSemanaIso(f.data) === 2)
  lista.push({ data: `${ano}-01-25`, nome: 'Aniversário de São Paulo' })
  if (terca) lista.push({ data: somarDiasIso(terca.data, 1), nome: 'Quarta-feira de Cinzas (rodízio suspenso)' })

  const valor = { lista, fonte, ate: Date.now() + 12 * 60 * 60 * 1000 }
  /* so guarda a resposta de verdade: o calculo local tenta de novo na proxima */
  if (fonte === 'BrasilAPI') feriadosEmCache.set(ano, valor)
  return valor
}

const diaDaSemanaIso = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

router.get('/rodizio', exigeSessao, exige(VER), async (_req, res) => {
  try {
    const hoje = hojeNoBrasil()
    const datas = Array.from({ length: 7 }, (_, i) => somarDiasIso(hoje, i))
    const anos = [...new Set(datas.map((d) => Number(d.slice(0, 4))))]
    const porAno = await Promise.all(anos.map(feriadosDoAno))
    const feriados = new Map(porAno.flatMap((a) => a.lista).map((f) => [f.data, f.nome]))

    const dias = datas.map((data) => {
      const dia = diaDaSemanaIso(data)
      const feriado = feriados.get(data) ?? null
      const fimDeSemana = dia === 0 || dia === 6
      return {
        data,
        diaSemana: dia,
        finais: fimDeSemana || feriado ? [] : finaisDoDia(dia),
        livre: fimDeSemana ? 'Fim de semana' : feriado ? `Feriado: ${feriado}` : null,
      }
    })

    const agora = new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date())

    return res.json({
      hoje: dias[0],
      dias,
      horarios: HORARIOS,
      area: AREA,
      agora,
      fonte: porAno.every((a) => a.fonte === 'BrasilAPI') ? 'BrasilAPI' : porAno.find((a) => a.fonte !== 'BrasilAPI').fonte,
    })
  } catch (erro) {
    return falhou(erro, res, 'frotas/rodizio')
  }
})

export default router
