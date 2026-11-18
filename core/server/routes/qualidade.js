import { Router } from 'express'
import { emTransacao, query } from '../db.js'
import { cargoPode, exige, exigeSessao, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'
import {
  CORREIO_CANCELADA,
  CORREIO_CUSTO_MAXIMO,
  CORREIO_NOME_MAXIMO,
  CORREIO_OBS_MAXIMA,
  CORREIO_RASTREIO_MAXIMO,
  CORREIO_TEXTO_MAXIMO,
  DOC_CODIGO_MAXIMO,
  DOC_COMENTARIO_MAXIMO,
  DOC_OBS_MAXIMA,
  DOC_REVISAO_MAXIMA,
  DOC_TITULO_MAXIMO,
  PRIORIDADES_DOC,
  SERVICOS_CORREIO,
  TIPOS_DOCUMENTO,
  TODAS_SITUACOES_CORREIO,
  UFS,
  etapaDoc,
  funilDoc,
  rotuloEtapaDoc,
  rotuloSituacaoCorreio,
} from '../../src/domain/qualidade.js'

/* ============================================================
   /api/qualidade — a Area da qualidade (db/atualizacao-58.sql.txt)

   ACOMPANHAMENTO DOS DOCUMENTOS (ver_documentos; mexer e editar_documentos)

     GET    /documentos?arquivados=1   { documentos } — os em andamento; com
                                       `arquivados`, os concluidos e cancelados
     POST   /documentos                cria (na etapa pedida, ou na primeira)
     PUT    /documentos/:id            edita os dados (titulo, tipo, obra...)
     PATCH  /documentos/:id/etapa      { etapa } — anda no funil
     PATCH  /documentos/:id/status     { status, texto? } — conclui, cancela
                                       (com o motivo) ou reabre
     PATCH  /documentos/:id/revisao    a proxima revisao (Rev. 01, 02...)
     DELETE /documentos/:id            apaga de vez
     GET    /documentos/:id/eventos    { eventos } — o historico
     POST   /documentos/:id/comentarios { texto } — quem ve tambem comenta

   SOLICITACAO DE CORREIO (ver_correio; atender e gerenciar_correio)

     GET    /correio?arquivados=1      { solicitacoes } — as do quadro; com
                                       `arquivados`, as entregues ha mais de
                                       30 dias e as canceladas
     POST   /correio                   pede um envio
     PUT    /correio/:id               edita (quem pediu, enquanto solicitada;
                                       quem atende, sempre)
     PATCH  /correio/:id/situacao      { situacao, rastreio?, custo?,
                                       postadoEm?, resposta? } — quem atende
                                       leva pelas colunas; quem pediu so
                                       cancela, enquanto solicitada
     DELETE /correio/:id               apaga (quem atende; quem pediu,
                                       enquanto solicitada)
   ============================================================ */

const router = Router()

const VER_DOC = 'ver_documentos'
const EDITAR_DOC = 'editar_documentos'
const VER_CORREIO = 'ver_correio'
const GERENCIAR_CORREIO = 'gerenciar_correio'

const LIMITE = 600
/* a entrega fica no quadro por 30 dias; depois vai para os arquivados */
const DIAS_NO_QUADRO = 30

const texto = (valor) => String(valor ?? '').trim()
const idValido = (valor) => /^\d{1,15}$/.test(String(valor ?? ''))
const dataValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`))
const id = (v) => (v === null || v === undefined ? null : String(v))

function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro: 'O banco ainda não tem a Área da qualidade (atualização 58 em core/db). Rode npm run db:atualizar e suba a API de novo.',
    })
  }
  if (erro.code === '23503') return res.status(400).json({ erro: 'A obra, o cliente ou a pessoa escolhida não existe mais.' })
  return tratar(erro, res, onde)
}

/** A obra (e o cliente dela) existe? Devolve { obraId, clienteId } limpos, ou { erro }. */
async function lerObraECliente(corpo) {
  const obraId = texto(corpo?.obraId) || null
  let clienteId = texto(corpo?.clienteId) || null
  if (obraId) {
    if (!idValido(obraId)) return { erro: 'Obra inválida.', campo: 'obraId' }
    const { rows } = await query('SELECT cliente_id FROM obra WHERE id = $1', [obraId])
    if (!rows[0]) return { erro: 'Essa obra não existe mais.', campo: 'obraId' }
    /* a obra decide o cliente */
    if (rows[0].cliente_id) clienteId = String(rows[0].cliente_id)
  }
  if (clienteId) {
    if (!idValido(clienteId)) return { erro: 'Cliente inválido.', campo: 'clienteId' }
    const { rows } = await query('SELECT 1 FROM cliente WHERE id = $1', [clienteId])
    if (!rows[0]) return { erro: 'Esse cliente não existe mais.', campo: 'clienteId' }
  }
  return { obraId, clienteId }
}

/* ============================================================
   DOCUMENTOS
   ============================================================ */

const CAMPOS_DOC = `d.id, d.funil, d.etapa, d.titulo, d.tipo, d.codigo, d.revisao, d.obra_id, d.cliente_id,
  d.responsavel_id, to_char(d.prazo, 'YYYY-MM-DD') AS prazo, d.prioridade, d.observacao, d.status,
  d.etapa_desde, d.criado_por, d.criado_em, d.atualizado_em, d.concluido_em,
  o.proposta AS obra_proposta, cl.nome AS cliente_nome, resp.name AS responsavel_nome, quem.name AS criado_por_nome,
  (SELECT count(*)::int FROM qualidade_documento_evento e WHERE e.documento_id = d.id AND e.tipo = 'comentario') AS comentarios`

const DE_DOC = `FROM qualidade_documento d
  LEFT JOIN obra o       ON o.id = d.obra_id
  LEFT JOIN cliente cl   ON cl.id = d.cliente_id
  LEFT JOIN usuario resp ON resp.id = d.responsavel_id
  LEFT JOIN usuario quem ON quem.id = d.criado_por`

function paraDocumento(l) {
  return {
    id: String(l.id),
    funil: l.funil,
    etapa: l.etapa,
    titulo: l.titulo,
    tipo: l.tipo,
    codigo: l.codigo ?? '',
    revisao: l.revisao ?? 0,
    obraId: id(l.obra_id),
    obraProposta: l.obra_proposta ?? '',
    clienteId: id(l.cliente_id),
    clienteNome: l.cliente_nome ?? '',
    responsavelId: id(l.responsavel_id),
    responsavelNome: l.responsavel_nome ?? '',
    prazo: l.prazo ?? null,
    prioridade: l.prioridade,
    observacao: l.observacao ?? '',
    status: l.status,
    etapaDesde: l.etapa_desde,
    criadoPorNome: l.criado_por_nome ?? '',
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
    concluidoEm: l.concluido_em ?? null,
    comentarios: l.comentarios ?? 0,
  }
}

async function lerDocumentoDoBanco(docId) {
  const { rows } = await query(`SELECT ${CAMPOS_DOC} ${DE_DOC} WHERE d.id = $1`, [docId])
  return rows[0] ? paraDocumento(rows[0]) : null
}

async function registrarEvento(db, documentoId, usuarioId, { tipo, de = null, para = null, texto: t = null }) {
  await db.query(
    `INSERT INTO qualidade_documento_evento (documento_id, usuario_id, tipo, de, para, texto)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [documentoId, usuarioId, tipo, de, para, t],
  )
}

/** Os campos do documento, conferidos — ou { erro, campo }. */
async function lerDocumento(corpo, { novo }) {
  const funil = texto(corpo?.funil)
  if (!funilDoc(funil)) return { erro: 'Escolha o funil do documento.', campo: 'funil' }
  let etapa = texto(corpo?.etapa)
  if (novo && !etapa) etapa = funilDoc(funil).etapas[0].id
  if (novo && !etapaDoc(funil, etapa)) return { erro: 'Essa etapa não existe neste funil.', campo: 'etapa' }

  const titulo = texto(corpo?.titulo)
  if (!titulo) return { erro: 'Dê um título ao documento.', campo: 'titulo' }
  if (titulo.length > DOC_TITULO_MAXIMO) return { erro: `O título vai até ${DOC_TITULO_MAXIMO} caracteres.`, campo: 'titulo' }

  const tipo = texto(corpo?.tipo) || funilDoc(funil).tipoPadrao
  if (!TIPOS_DOCUMENTO.some((t) => t.id === tipo)) return { erro: 'Tipo de documento desconhecido.', campo: 'tipo' }

  const codigo = texto(corpo?.codigo)
  if (codigo.length > DOC_CODIGO_MAXIMO) return { erro: `O código vai até ${DOC_CODIGO_MAXIMO} caracteres.`, campo: 'codigo' }

  const revisao = corpo?.revisao === undefined || corpo?.revisao === '' ? 0 : Number(corpo.revisao)
  if (!Number.isInteger(revisao) || revisao < 0 || revisao > DOC_REVISAO_MAXIMA) {
    return { erro: `A revisão vai de 0 a ${DOC_REVISAO_MAXIMA}.`, campo: 'revisao' }
  }

  const prioridade = texto(corpo?.prioridade) || 'normal'
  if (!PRIORIDADES_DOC.some((p) => p.id === prioridade)) return { erro: 'Prioridade desconhecida.', campo: 'prioridade' }

  const prazo = texto(corpo?.prazo) || null
  if (prazo && !dataValida(prazo)) return { erro: 'Prazo inválido.', campo: 'prazo' }

  const observacao = texto(corpo?.observacao)
  if (observacao.length > DOC_OBS_MAXIMA) return { erro: `A observação vai até ${DOC_OBS_MAXIMA} caracteres.`, campo: 'observacao' }

  const responsavelId = texto(corpo?.responsavelId) || null
  if (responsavelId) {
    if (!idValido(responsavelId)) return { erro: 'Responsável inválido.', campo: 'responsavelId' }
    const { rows } = await query('SELECT 1 FROM usuario WHERE id = $1 AND ativo', [responsavelId])
    if (!rows[0]) return { erro: 'Essa pessoa não está mais na equipe.', campo: 'responsavelId' }
  }

  const vinculo = await lerObraECliente(corpo)
  if (vinculo.erro) return vinculo

  return {
    campos: {
      funil,
      ...(novo ? { etapa } : {}),
      titulo,
      tipo,
      codigo: codigo || null,
      revisao,
      obra_id: vinculo.obraId,
      cliente_id: vinculo.clienteId,
      responsavel_id: responsavelId,
      prazo,
      prioridade,
      observacao: observacao || null,
    },
  }
}

router.get('/documentos', exigeSessao, exige(VER_DOC), async (req, res) => {
  const arquivados = req.query.arquivados === '1'
  try {
    const { rows } = await query(
      `SELECT ${CAMPOS_DOC} ${DE_DOC}
        WHERE ${arquivados ? "d.status <> 'aberto'" : "d.status = 'aberto'"}
        ORDER BY ${arquivados ? 'coalesce(d.concluido_em, d.atualizado_em) DESC' : 'd.prazo NULLS LAST, d.criado_em'}, d.id
        LIMIT ${LIMITE}`,
    )
    return res.json({ documentos: rows.map(paraDocumento) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/documentos')
  }
})

router.post('/documentos', exigeSessao, exige(EDITAR_DOC), async (req, res) => {
  try {
    const lido = await lerDocumento(req.body, { novo: true })
    if (lido.erro) return res.status(400).json(lido)
    const c = { ...lido.campos, criado_por: req.dono.sub }
    const colunas = Object.keys(c)
    const novoId = await emTransacao(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO qualidade_documento (${colunas.join(', ')})
         VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        Object.values(c),
      )
      await registrarEvento(db, rows[0].id, req.dono.sub, { tipo: 'criado', para: c.etapa })
      return rows[0].id
    })
    await registrarAtividade(req, {
      acao: 'qualidade.documento_criado',
      categoria: 'qualidade',
      entidade: ['qualidade_documento', novoId],
      descricao: 'Documento da Qualidade criado',
      detalhes: { documento: c.titulo, etapa: rotuloEtapaDoc(c.funil, c.etapa) },
    })
    return res.status(201).json({ documento: await lerDocumentoDoBanco(novoId) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/documento-criar')
  }
})

router.put('/documentos/:id', exigeSessao, exige(EDITAR_DOC), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Documento não encontrado.' })
  try {
    const { rows: atual } = await query('SELECT funil, etapa FROM qualidade_documento WHERE id = $1', [req.params.id])
    if (!atual[0]) return res.status(404).json({ erro: 'Documento não encontrado.' })
    const lido = await lerDocumento(req.body, { novo: false })
    if (lido.erro) return res.status(400).json(lido)
    const c = { ...lido.campos }
    /* trocar de funil leva o documento para a primeira etapa do novo, se a
       etapa de agora nao existir la */
    const mudouFunil = c.funil !== atual[0].funil
    if (mudouFunil && !etapaDoc(c.funil, atual[0].etapa)) c.etapa = funilDoc(c.funil).etapas[0].id
    const colunas = Object.keys(c)
    await emTransacao(async (db) => {
      await db.query(
        `UPDATE qualidade_documento
            SET ${colunas.map((col, i) => `${col} = $${i + 1}`).join(', ')},
                ${c.etapa ? 'etapa_desde = now(),' : ''} atualizado_em = now()
          WHERE id = $${colunas.length + 1}`,
        [...Object.values(c), req.params.id],
      )
      await registrarEvento(db, req.params.id, req.dono.sub, {
        tipo: 'editado',
        ...(mudouFunil ? { de: atual[0].funil, para: c.funil } : {}),
      })
    })
    await registrarAtividade(req, {
      acao: 'qualidade.documento_editado',
      categoria: 'qualidade',
      entidade: ['qualidade_documento', req.params.id],
      descricao: 'Documento da Qualidade editado',
      detalhes: { documento: c.titulo },
    })
    return res.json({ documento: await lerDocumentoDoBanco(req.params.id) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/documento-editar')
  }
})

router.patch('/documentos/:id/etapa', exigeSessao, exige(EDITAR_DOC), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Documento não encontrado.' })
  const etapa = texto(req.body?.etapa)
  try {
    const { rows } = await query('SELECT funil, etapa, titulo, status FROM qualidade_documento WHERE id = $1', [req.params.id])
    const doc = rows[0]
    if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' })
    if (!etapaDoc(doc.funil, etapa)) return res.status(400).json({ erro: 'Essa etapa não existe neste funil.' })
    if (doc.status !== 'aberto') return res.status(409).json({ erro: 'Reabra o documento antes de mudar a etapa.' })
    if (doc.etapa === etapa) return res.json({ documento: await lerDocumentoDoBanco(req.params.id) })
    await emTransacao(async (db) => {
      await db.query(
        'UPDATE qualidade_documento SET etapa = $2, etapa_desde = now(), atualizado_em = now() WHERE id = $1',
        [req.params.id, etapa],
      )
      await registrarEvento(db, req.params.id, req.dono.sub, { tipo: 'etapa', de: doc.etapa, para: etapa })
    })
    await registrarAtividade(req, {
      acao: 'qualidade.documento_etapa',
      categoria: 'qualidade',
      entidade: ['qualidade_documento', req.params.id],
      descricao: 'Documento da Qualidade mudou de etapa',
      detalhes: { documento: doc.titulo, de: rotuloEtapaDoc(doc.funil, doc.etapa), para: rotuloEtapaDoc(doc.funil, etapa) },
    })
    return res.json({ documento: await lerDocumentoDoBanco(req.params.id) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/documento-etapa')
  }
})

router.patch('/documentos/:id/status', exigeSessao, exige(EDITAR_DOC), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Documento não encontrado.' })
  const status = texto(req.body?.status)
  const motivo = texto(req.body?.texto)
  if (!['aberto', 'concluido', 'cancelado'].includes(status)) return res.status(400).json({ erro: 'Situação inválida.' })
  if (status === 'cancelado' && !motivo) return res.status(400).json({ erro: 'Diga por que o documento foi cancelado.', campo: 'texto' })
  if (motivo.length > DOC_COMENTARIO_MAXIMO) {
    return res.status(400).json({ erro: `O texto vai até ${DOC_COMENTARIO_MAXIMO} caracteres.`, campo: 'texto' })
  }
  try {
    const { rows } = await query('SELECT titulo, status FROM qualidade_documento WHERE id = $1', [req.params.id])
    const doc = rows[0]
    if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' })
    if (doc.status === status) return res.json({ documento: await lerDocumentoDoBanco(req.params.id) })
    const evento = status === 'aberto' ? 'reaberto' : status
    await emTransacao(async (db) => {
      await db.query(
        `UPDATE qualidade_documento
            SET status = $2, concluido_em = ${status === 'aberto' ? 'NULL' : 'now()'}, atualizado_em = now()
          WHERE id = $1`,
        [req.params.id, status],
      )
      await registrarEvento(db, req.params.id, req.dono.sub, { tipo: evento, texto: motivo || null })
    })
    await registrarAtividade(req, {
      acao: `qualidade.documento_${evento}`,
      categoria: 'qualidade',
      entidade: ['qualidade_documento', req.params.id],
      descricao: { concluido: 'Documento da Qualidade concluído', cancelado: 'Documento da Qualidade cancelado', reaberto: 'Documento da Qualidade reaberto' }[evento],
      detalhes: { documento: doc.titulo, ...(motivo ? { motivo } : {}) },
    })
    return res.json({ documento: await lerDocumentoDoBanco(req.params.id) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/documento-status')
  }
})

router.patch('/documentos/:id/revisao', exigeSessao, exige(EDITAR_DOC), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Documento não encontrado.' })
  const motivo = texto(req.body?.texto)
  if (motivo.length > DOC_COMENTARIO_MAXIMO) {
    return res.status(400).json({ erro: `O texto vai até ${DOC_COMENTARIO_MAXIMO} caracteres.`, campo: 'texto' })
  }
  try {
    const { rows } = await query('SELECT titulo, revisao FROM qualidade_documento WHERE id = $1', [req.params.id])
    const doc = rows[0]
    if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' })
    if (doc.revisao >= DOC_REVISAO_MAXIMA) return res.status(409).json({ erro: `O documento já está na revisão ${DOC_REVISAO_MAXIMA}.` })
    const nova = doc.revisao + 1
    await emTransacao(async (db) => {
      await db.query('UPDATE qualidade_documento SET revisao = $2, atualizado_em = now() WHERE id = $1', [req.params.id, nova])
      await registrarEvento(db, req.params.id, req.dono.sub, {
        tipo: 'revisao',
        de: String(doc.revisao),
        para: String(nova),
        texto: motivo || null,
      })
    })
    await registrarAtividade(req, {
      acao: 'qualidade.documento_revisao',
      categoria: 'qualidade',
      entidade: ['qualidade_documento', req.params.id],
      descricao: 'Nova revisão de documento da Qualidade',
      detalhes: { documento: doc.titulo, revisao: nova },
    })
    return res.json({ documento: await lerDocumentoDoBanco(req.params.id) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/documento-revisao')
  }
})

router.delete('/documentos/:id', exigeSessao, exige(EDITAR_DOC), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Documento não encontrado.' })
  try {
    const { rows } = await query('DELETE FROM qualidade_documento WHERE id = $1 RETURNING titulo', [req.params.id])
    if (!rows[0]) return res.status(404).json({ erro: 'Documento não encontrado.' })
    await registrarAtividade(req, {
      acao: 'qualidade.documento_excluido',
      categoria: 'qualidade',
      entidade: ['qualidade_documento', req.params.id],
      descricao: 'Documento da Qualidade excluído',
      detalhes: { documento: rows[0].titulo },
    })
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'qualidade/documento-apagar')
  }
})

router.get('/documentos/:id/eventos', exigeSessao, exige(VER_DOC), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Documento não encontrado.' })
  try {
    const { rows } = await query(
      `SELECT e.id, e.tipo, e.de, e.para, e.texto, e.criado_em, e.usuario_id, u.name AS usuario_nome
         FROM qualidade_documento_evento e
         LEFT JOIN usuario u ON u.id = e.usuario_id
        WHERE e.documento_id = $1
        ORDER BY e.criado_em DESC, e.id DESC
        LIMIT 200`,
      [req.params.id],
    )
    return res.json({
      eventos: rows.map((l) => ({
        id: String(l.id),
        tipo: l.tipo,
        de: l.de,
        para: l.para,
        texto: l.texto ?? '',
        criadoEm: l.criado_em,
        usuarioId: id(l.usuario_id),
        usuarioNome: l.usuario_nome ?? '',
      })),
    })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/documento-eventos')
  }
})

router.post('/documentos/:id/comentarios', exigeSessao, exige(VER_DOC), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Documento não encontrado.' })
  const comentario = texto(req.body?.texto)
  if (!comentario) return res.status(400).json({ erro: 'Escreva o comentário.', campo: 'texto' })
  if (comentario.length > DOC_COMENTARIO_MAXIMO) {
    return res.status(400).json({ erro: `O comentário vai até ${DOC_COMENTARIO_MAXIMO} caracteres.`, campo: 'texto' })
  }
  try {
    const { rows } = await query('SELECT 1 FROM qualidade_documento WHERE id = $1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ erro: 'Documento não encontrado.' })
    await registrarEvento({ query }, req.params.id, req.dono.sub, { tipo: 'comentario', texto: comentario })
    return res.status(201).json({ documento: await lerDocumentoDoBanco(req.params.id) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/documento-comentar')
  }
})

/* ============================================================
   CORREIO
   ============================================================ */

const CAMPOS_CORREIO = `s.id, s.solicitante_id, quem.name AS solicitante_nome, s.obra_id, o.proposta AS obra_proposta,
  s.cliente_id, cl.nome AS cliente_nome, s.conteudo, s.destinatario, s.contato, s.telefone,
  s.cep, s.logradouro, s.numero, s.complemento, s.bairro, s.cidade, s.uf, s.servico,
  to_char(s.prazo, 'YYYY-MM-DD') AS prazo, s.observacao, s.situacao, s.rastreio, s.custo,
  to_char(s.postado_em, 'YYYY-MM-DD') AS postado_em, to_char(s.entregue_em, 'YYYY-MM-DD') AS entregue_em,
  s.resposta, s.atendido_por, quemat.name AS atendido_por_nome, s.situacao_desde, s.criado_em, s.atualizado_em`

const DE_CORREIO = `FROM correio_solicitacao s
  LEFT JOIN usuario quem   ON quem.id = s.solicitante_id
  LEFT JOIN usuario quemat ON quemat.id = s.atendido_por
  LEFT JOIN obra o         ON o.id = s.obra_id
  LEFT JOIN cliente cl     ON cl.id = s.cliente_id`

function paraSolicitacao(l) {
  return {
    id: String(l.id),
    solicitanteId: id(l.solicitante_id),
    solicitanteNome: l.solicitante_nome ?? '',
    obraId: id(l.obra_id),
    obraProposta: l.obra_proposta ?? '',
    clienteId: id(l.cliente_id),
    clienteNome: l.cliente_nome ?? '',
    conteudo: l.conteudo,
    destinatario: l.destinatario,
    contato: l.contato ?? '',
    telefone: l.telefone ?? '',
    cep: l.cep ?? '',
    logradouro: l.logradouro ?? '',
    numero: l.numero ?? '',
    complemento: l.complemento ?? '',
    bairro: l.bairro ?? '',
    cidade: l.cidade ?? '',
    uf: l.uf ?? '',
    servico: l.servico,
    prazo: l.prazo ?? null,
    observacao: l.observacao ?? '',
    situacao: l.situacao,
    rastreio: l.rastreio ?? '',
    custo: l.custo === null || l.custo === undefined ? null : Number(l.custo),
    postadoEm: l.postado_em ?? null,
    entregueEm: l.entregue_em ?? null,
    resposta: l.resposta ?? '',
    atendidoPorNome: l.atendido_por_nome ?? '',
    situacaoDesde: l.situacao_desde,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  }
}

async function lerSolicitacaoDoBanco(sid) {
  const { rows } = await query(`SELECT ${CAMPOS_CORREIO} ${DE_CORREIO} WHERE s.id = $1`, [sid])
  return rows[0] ? paraSolicitacao(rows[0]) : null
}

/** Os campos do pedido de envio, conferidos — ou { erro, campo }. */
async function lerSolicitacao(corpo) {
  const conteudo = texto(corpo?.conteudo)
  if (!conteudo) return { erro: 'Diga o que vai no envio.', campo: 'conteudo' }
  if (conteudo.length > CORREIO_TEXTO_MAXIMO) return { erro: `O conteúdo vai até ${CORREIO_TEXTO_MAXIMO} caracteres.`, campo: 'conteudo' }

  const destinatario = texto(corpo?.destinatario)
  if (!destinatario) return { erro: 'Para quem vai? Informe o destinatário.', campo: 'destinatario' }
  if (destinatario.length > CORREIO_NOME_MAXIMO) {
    return { erro: `O destinatário vai até ${CORREIO_NOME_MAXIMO} caracteres.`, campo: 'destinatario' }
  }
  const contato = texto(corpo?.contato).slice(0, CORREIO_NOME_MAXIMO)
  const telefone = texto(corpo?.telefone).slice(0, 40)

  const cepDigitos = texto(corpo?.cep).replace(/\D/g, '')
  if (cepDigitos && cepDigitos.length !== 8) return { erro: 'O CEP precisa ter 8 dígitos.', campo: 'cep' }
  const logradouro = texto(corpo?.logradouro).slice(0, 200)
  if (!logradouro) return { erro: 'Informe o endereço (rua, avenida...).', campo: 'logradouro' }
  const numero = texto(corpo?.numero).slice(0, 20)
  const complemento = texto(corpo?.complemento).slice(0, 100)
  const bairro = texto(corpo?.bairro).slice(0, 100)
  const cidade = texto(corpo?.cidade).slice(0, 100)
  if (!cidade) return { erro: 'Informe a cidade.', campo: 'cidade' }
  const uf = texto(corpo?.uf).toUpperCase()
  if (uf && !UFS.includes(uf)) return { erro: 'UF inválida.', campo: 'uf' }

  const servico = texto(corpo?.servico) || 'sedex'
  if (!SERVICOS_CORREIO.some((s) => s.id === servico)) return { erro: 'Serviço desconhecido.', campo: 'servico' }

  const prazo = texto(corpo?.prazo) || null
  if (prazo && !dataValida(prazo)) return { erro: 'Data inválida.', campo: 'prazo' }

  const observacao = texto(corpo?.observacao)
  if (observacao.length > CORREIO_OBS_MAXIMA) {
    return { erro: `A observação vai até ${CORREIO_OBS_MAXIMA} caracteres.`, campo: 'observacao' }
  }

  const vinculo = await lerObraECliente(corpo)
  if (vinculo.erro) return vinculo

  return {
    campos: {
      obra_id: vinculo.obraId,
      cliente_id: vinculo.clienteId,
      conteudo,
      destinatario,
      contato: contato || null,
      telefone: telefone || null,
      cep: cepDigitos || null,
      logradouro,
      numero: numero || null,
      complemento: complemento || null,
      bairro: bairro || null,
      cidade,
      uf: uf || null,
      servico,
      prazo,
      observacao: observacao || null,
    },
  }
}

router.get('/correio', exigeSessao, exige(VER_CORREIO), async (req, res) => {
  const arquivados = req.query.arquivados === '1'
  try {
    const { rows } = await query(
      `SELECT ${CAMPOS_CORREIO} ${DE_CORREIO}
        WHERE ${
          arquivados
            ? `s.situacao = 'cancelada' OR (s.situacao = 'entregue' AND s.situacao_desde < now() - interval '${DIAS_NO_QUADRO} days')`
            : `s.situacao <> 'cancelada' AND NOT (s.situacao = 'entregue' AND s.situacao_desde < now() - interval '${DIAS_NO_QUADRO} days')`
        }
        ORDER BY ${arquivados ? 's.atualizado_em DESC' : 's.prazo NULLS LAST, s.criado_em'}, s.id
        LIMIT ${LIMITE}`,
    )
    return res.json({ solicitacoes: rows.map(paraSolicitacao) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/correio')
  }
})

router.post('/correio', exigeSessao, exige(VER_CORREIO), async (req, res) => {
  try {
    const lido = await lerSolicitacao(req.body)
    if (lido.erro) return res.status(400).json(lido)
    const c = { ...lido.campos, solicitante_id: req.dono.sub }
    const colunas = Object.keys(c)
    const { rows } = await query(
      `INSERT INTO correio_solicitacao (${colunas.join(', ')})
       VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(c),
    )
    await registrarAtividade(req, {
      acao: 'correio.solicitado',
      categoria: 'correio',
      entidade: ['correio_solicitacao', rows[0].id],
      descricao: 'Envio pelo correio solicitado',
      detalhes: { conteudo: c.conteudo, para: c.destinatario, cidade: [c.cidade, c.uf].filter(Boolean).join('/') },
    })
    return res.status(201).json({ solicitacao: await lerSolicitacaoDoBanco(rows[0].id) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/correio-criar')
  }
})

router.put('/correio/:id', exigeSessao, exige(VER_CORREIO), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Solicitação não encontrada.' })
  try {
    const { rows } = await query('SELECT solicitante_id, situacao FROM correio_solicitacao WHERE id = $1', [req.params.id])
    const atual = rows[0]
    if (!atual) return res.status(404).json({ erro: 'Solicitação não encontrada.' })
    const atende = cargoPode(req.cargo, GERENCIAR_CORREIO)
    const meu = String(atual.solicitante_id) === String(req.dono.sub)
    if (!atende && !(meu && atual.situacao === 'solicitada')) {
      return res.status(403).json({ erro: 'Só quem atende os envios muda o pedido depois que ele começa a andar.' })
    }
    const lido = await lerSolicitacao(req.body)
    if (lido.erro) return res.status(400).json(lido)
    const c = lido.campos
    const colunas = Object.keys(c)
    await query(
      `UPDATE correio_solicitacao
          SET ${colunas.map((col, i) => `${col} = $${i + 1}`).join(', ')}, atualizado_em = now()
        WHERE id = $${colunas.length + 1}`,
      [...Object.values(c), req.params.id],
    )
    await registrarAtividade(req, {
      acao: 'correio.editado',
      categoria: 'correio',
      entidade: ['correio_solicitacao', req.params.id],
      descricao: 'Solicitação de correio editada',
      detalhes: { conteudo: c.conteudo, para: c.destinatario },
    })
    return res.json({ solicitacao: await lerSolicitacaoDoBanco(req.params.id) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/correio-editar')
  }
})

router.patch('/correio/:id/situacao', exigeSessao, exige(VER_CORREIO), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Solicitação não encontrada.' })
  const situacao = texto(req.body?.situacao)
  if (!TODAS_SITUACOES_CORREIO.includes(situacao)) return res.status(400).json({ erro: 'Situação inválida.' })
  const rastreio = texto(req.body?.rastreio).toUpperCase().replace(/\s+/g, '')
  if (rastreio.length > CORREIO_RASTREIO_MAXIMO) {
    return res.status(400).json({ erro: `O código de rastreio vai até ${CORREIO_RASTREIO_MAXIMO} caracteres.`, campo: 'rastreio' })
  }
  const resposta = texto(req.body?.resposta)
  if (resposta.length > CORREIO_OBS_MAXIMA) {
    return res.status(400).json({ erro: `O recado vai até ${CORREIO_OBS_MAXIMA} caracteres.`, campo: 'resposta' })
  }
  const custoBruto = req.body?.custo
  const custo = custoBruto === undefined || custoBruto === null || custoBruto === '' ? null : Number(String(custoBruto).replace(',', '.'))
  if (custo !== null && (!Number.isFinite(custo) || custo < 0 || custo > CORREIO_CUSTO_MAXIMO)) {
    return res.status(400).json({ erro: 'Custo inválido.', campo: 'custo' })
  }
  const postadoEm = texto(req.body?.postadoEm) || null
  if (postadoEm && !dataValida(postadoEm)) return res.status(400).json({ erro: 'Data da postagem inválida.', campo: 'postadoEm' })
  const entregueEm = texto(req.body?.entregueEm) || null
  if (entregueEm && !dataValida(entregueEm)) return res.status(400).json({ erro: 'Data da entrega inválida.', campo: 'entregueEm' })

  try {
    const { rows } = await query(
      'SELECT solicitante_id, situacao, conteudo, destinatario, rastreio, postado_em FROM correio_solicitacao WHERE id = $1',
      [req.params.id],
    )
    const atual = rows[0]
    if (!atual) return res.status(404).json({ erro: 'Solicitação não encontrada.' })
    const atende = cargoPode(req.cargo, GERENCIAR_CORREIO)
    const meu = String(atual.solicitante_id) === String(req.dono.sub)
    /* quem pediu so cancela o proprio pedido, enquanto ninguem pegou */
    if (!atende && !(meu && atual.situacao === 'solicitada' && situacao === CORREIO_CANCELADA)) {
      return res.status(403).json({ erro: 'Só quem atende os envios muda a situação do pedido.' })
    }
    if (situacao === CORREIO_CANCELADA && !resposta) {
      return res.status(400).json({ erro: 'Diga por que o envio foi cancelado.', campo: 'resposta' })
    }
    const rastreioFinal = rastreio || atual.rastreio || null
    const postado = ['postada', 'entregue'].includes(situacao)
    await query(
      `UPDATE correio_solicitacao
          SET situacao = $2,
              situacao_desde = CASE WHEN situacao = $2 THEN situacao_desde ELSE now() END,
              rastreio = $3,
              custo = coalesce($4, custo),
              postado_em = CASE WHEN $5 THEN coalesce($6::date, postado_em, current_date) ELSE postado_em END,
              entregue_em = CASE WHEN $2 = 'entregue' THEN coalesce($7::date, entregue_em, current_date) ELSE NULL END,
              resposta = coalesce(nullif($8, ''), resposta),
              atendido_por = CASE WHEN $9 THEN $10::bigint ELSE atendido_por END,
              atualizado_em = now()
        WHERE id = $1`,
      [req.params.id, situacao, rastreioFinal, custo, postado, postadoEm, entregueEm, resposta, atende, req.dono.sub],
    )
    await registrarAtividade(req, {
      acao: `correio.${situacao}`,
      categoria: 'correio',
      entidade: ['correio_solicitacao', req.params.id],
      descricao: `Envio pelo correio: ${rotuloSituacaoCorreio(situacao).toLowerCase()}`,
      detalhes: {
        conteudo: atual.conteudo,
        para: atual.destinatario,
        ...(rastreioFinal ? { rastreio: rastreioFinal } : {}),
        ...(resposta ? { recado: resposta } : {}),
      },
    })
    return res.json({ solicitacao: await lerSolicitacaoDoBanco(req.params.id) })
  } catch (erro) {
    return falhou(erro, res, 'qualidade/correio-situacao')
  }
})

router.delete('/correio/:id', exigeSessao, exige(VER_CORREIO), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Solicitação não encontrada.' })
  try {
    const { rows } = await query('SELECT solicitante_id, situacao, conteudo FROM correio_solicitacao WHERE id = $1', [req.params.id])
    const atual = rows[0]
    if (!atual) return res.status(404).json({ erro: 'Solicitação não encontrada.' })
    const atende = cargoPode(req.cargo, GERENCIAR_CORREIO)
    const meu = String(atual.solicitante_id) === String(req.dono.sub)
    if (!atende && !(meu && atual.situacao === 'solicitada')) {
      return res.status(403).json({ erro: 'Este pedido já começou a andar: só quem atende os envios pode apagá-lo.' })
    }
    await query('DELETE FROM correio_solicitacao WHERE id = $1', [req.params.id])
    await registrarAtividade(req, {
      acao: 'correio.excluido',
      categoria: 'correio',
      entidade: ['correio_solicitacao', req.params.id],
      descricao: 'Solicitação de correio excluída',
      detalhes: { conteudo: atual.conteudo },
    })
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'qualidade/correio-apagar')
  }
})

export default router
