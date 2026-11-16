import { Router } from 'express'
import { query } from '../db.js'
import { cargoPode, exige, exigeSessao, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'

/* ============================================================
   /api/insumos — os pedidos de insumos (db/atualizacao-57.sql.txt)

     GET    /?todos=1    { pedidos } — os proprios; com `todos`, os de
                         todo mundo (`gerenciar_insumos`). Os pendentes
                         primeiro, depois os mais novos
     POST   /            { item, quantidade?, observacao? } — o pedido
     PATCH  /:id         { situacao, resposta? } — atendido, recusado (com
                         o motivo) ou de volta a pendente
                         (`gerenciar_insumos`)
     DELETE /:id         cancela o PROPRIO pedido enquanto esta pendente

   Pedir e acompanhar e `ver_insumos` (Seu espaco > Pedir insumos);
   atender e `gerenciar_insumos` (Area admin > Insumos).
   ============================================================ */

const router = Router()

const VER = 'ver_insumos'
const GERENCIAR = 'gerenciar_insumos'

const ITEM_MAXIMO = 120
const TEXTO_MAXIMO = 500
const QUANTIDADE_MAXIMA = 9999
/* o teto de uma resposta, para a lista nao crescer sem fim */
const LIMITE = 500
const SITUACOES = ['pendente', 'atendido', 'recusado']

const texto = (valor) => String(valor ?? '').trim()
const idValido = (valor) => /^\d{1,15}$/.test(String(valor ?? ''))

const CAMPOS = `p.id, p.usuario_id, quem.name AS usuario_nome, p.item, p.quantidade, p.observacao,
                p.situacao, p.resposta, resp.name AS respondido_por_nome, p.respondido_em, p.criado_em`

const DE = `FROM insumo_pedido p
            JOIN usuario quem      ON quem.id = p.usuario_id
            LEFT JOIN usuario resp ON resp.id = p.respondido_por`

function paraPedido(l) {
  return {
    id: String(l.id),
    usuarioId: String(l.usuario_id),
    usuarioNome: l.usuario_nome ?? '',
    item: l.item,
    quantidade: l.quantidade,
    observacao: l.observacao ?? '',
    situacao: l.situacao,
    resposta: l.resposta ?? '',
    respondidoPorNome: l.respondido_por_nome ?? null,
    respondidoEm: l.respondido_em ?? null,
    criadoEm: l.criado_em,
  }
}

/** Os campos do pedido, ja conferidos — ou { erro, campo }. */
function lerPedido(corpo) {
  const item = texto(corpo?.item)
  const observacao = texto(corpo?.observacao)
  const bruta = corpo?.quantidade ?? 1
  const quantidade = Number(bruta)

  if (!item) return { erro: 'Diga o que você precisa.', campo: 'item' }
  if (item.length > ITEM_MAXIMO) return { erro: `O item vai até ${ITEM_MAXIMO} caracteres.`, campo: 'item' }
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > QUANTIDADE_MAXIMA) {
    return { erro: `A quantidade vai de 1 a ${QUANTIDADE_MAXIMA}.`, campo: 'quantidade' }
  }
  if (observacao.length > TEXTO_MAXIMO) {
    return { erro: `A observação vai até ${TEXTO_MAXIMO} caracteres.`, campo: 'observacao' }
  }
  return { item, quantidade, observacao: observacao || null }
}

function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro: 'O banco ainda não tem os insumos (atualização 57 em core/db). Rode npm run db:atualizar e suba a API de novo.',
    })
  }
  return tratar(erro, res, onde)
}

async function lerUm(id) {
  const { rows } = await query(`SELECT ${CAMPOS} ${DE} WHERE p.id = $1`, [id])
  return rows[0] ? paraPedido(rows[0]) : null
}

router.get('/', exigeSessao, exige(VER), async (req, res) => {
  const todos = req.query.todos === '1'
  if (todos && !cargoPode(req.cargo, GERENCIAR)) {
    return res.status(403).json({ erro: 'Seu setor não tem permissão para ver os pedidos de todos.' })
  }
  try {
    const { rows } = await query(
      `SELECT ${CAMPOS} ${DE}
        ${todos ? '' : 'WHERE p.usuario_id = $1'}
        ORDER BY (p.situacao = 'pendente') DESC, p.criado_em DESC, p.id DESC
        LIMIT ${LIMITE}`,
      todos ? [] : [req.dono.sub],
    )
    return res.json({ pedidos: rows.map(paraPedido) })
  } catch (erro) {
    return falhou(erro, res, 'insumos/listar')
  }
})

router.post('/', exigeSessao, exige(VER), async (req, res) => {
  const campos = lerPedido(req.body)
  if (campos.erro) return res.status(400).json(campos)
  try {
    const { rows } = await query(
      `INSERT INTO insumo_pedido (usuario_id, item, quantidade, observacao)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.dono.sub, campos.item, campos.quantidade, campos.observacao],
    )
    await registrarAtividade(req, {
      acao: 'insumos.pedido_criado',
      categoria: 'insumos',
      entidade: ['insumo_pedido', rows[0].id],
      descricao: 'Pedido de insumo enviado',
      detalhes: { item: campos.item, quantidade: campos.quantidade },
    })
    return res.status(201).json({ pedido: await lerUm(rows[0].id) })
  } catch (erro) {
    return falhou(erro, res, 'insumos/criar')
  }
})

router.patch('/:id', exigeSessao, exige(GERENCIAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Pedido não encontrado.' })
  const situacao = texto(req.body?.situacao)
  const resposta = texto(req.body?.resposta)
  if (!SITUACOES.includes(situacao)) return res.status(400).json({ erro: 'Situação inválida.', campo: 'situacao' })
  if (resposta.length > TEXTO_MAXIMO) {
    return res.status(400).json({ erro: `A resposta vai até ${TEXTO_MAXIMO} caracteres.`, campo: 'resposta' })
  }
  if (situacao === 'recusado' && !resposta) {
    return res.status(400).json({ erro: 'Diga o motivo da recusa.', campo: 'resposta' })
  }
  try {
    /* de volta a pendente, o pedido perde a resposta e quem respondeu */
    const pendente = situacao === 'pendente'
    const { rowCount } = await query(
      `UPDATE insumo_pedido
          SET situacao = $2,
              resposta = $3,
              respondido_por = $4,
              respondido_em = ${pendente ? 'NULL' : 'now()'}
        WHERE id = $1`,
      [req.params.id, situacao, pendente ? null : resposta || null, pendente ? null : req.dono.sub],
    )
    if (!rowCount) return res.status(404).json({ erro: 'Pedido não encontrado.' })
    const pedido = await lerUm(req.params.id)
    await registrarAtividade(req, {
      acao: `insumos.pedido_${situacao}`,
      categoria: 'insumos',
      entidade: ['insumo_pedido', req.params.id],
      descricao: pendente ? 'Pedido de insumo reaberto' : `Pedido de insumo ${situacao}`,
      detalhes: { item: pedido.item, de: pedido.usuarioNome },
    })
    return res.json({ pedido })
  } catch (erro) {
    return falhou(erro, res, 'insumos/responder')
  }
})

router.delete('/:id', exigeSessao, exige(VER), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Pedido não encontrado.' })
  try {
    const { rows } = await query('SELECT usuario_id, situacao, item FROM insumo_pedido WHERE id = $1', [req.params.id])
    const pedido = rows[0]
    if (!pedido || String(pedido.usuario_id) !== String(req.dono.sub)) {
      return res.status(404).json({ erro: 'Pedido não encontrado.' })
    }
    if (pedido.situacao !== 'pendente') {
      return res.status(409).json({ erro: 'Este pedido já foi respondido e não pode mais ser cancelado.' })
    }
    await query('DELETE FROM insumo_pedido WHERE id = $1', [req.params.id])
    await registrarAtividade(req, {
      acao: 'insumos.pedido_cancelado',
      categoria: 'insumos',
      entidade: ['insumo_pedido', req.params.id],
      descricao: 'Pedido de insumo cancelado',
      detalhes: { item: pedido.item },
    })
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'insumos/cancelar')
  }
})

export default router
