/**
 * Os pedidos de insumos (server/routes/insumos.js, atualizacao 57).
 *
 * Pedir e acompanhar os proprios e `ver_insumos`; ver os de todos e
 * responder e `gerenciar_insumos` — a API confere as duas.
 */

import { del, get, patch, post } from './api'

/** Os proprios pedidos, ou os de todos (`todos`). */
export async function carregarPedidos({ todos = false } = {}) {
  const { pedidos } = await get(`/insumos${todos ? '?todos=1' : ''}`)
  return pedidos ?? []
}

/** { item, quantidade, observacao } -> o pedido gravado. */
export async function pedirInsumo(campos) {
  const { pedido } = await post('/insumos', campos)
  return pedido
}

/** Atendido, recusado (com a resposta) ou de volta a pendente. */
export async function responderPedido(id, { situacao, resposta }) {
  const { pedido } = await patch(`/insumos/${encodeURIComponent(id)}`, { situacao, resposta })
  return pedido
}

/** Cancela o proprio pedido, enquanto pendente. */
export function cancelarPedido(id) {
  return del(`/insumos/${encodeURIComponent(id)}`)
}
