/**
 * O Historico — o que a PROPRIA pessoa fez no sistema
 * (server/routes/atividades.js). Nao ha como pedir o de outra pessoa:
 * a API responde sempre o de quem esta logado.
 */

import { get } from './api'

/**
 * { atividades, temMais, aviso? } — so os ultimos 7 dias (a API corta).
 * `antes` e o id da ultima ja mostrada; `tipo` e 'todos' | 'checks' | 'despesas'.
 */
export function carregarAtividades({ antes, limite = 20, tipo } = {}) {
  const partes = [`limite=${limite}`]
  if (antes) partes.push(`antes=${encodeURIComponent(antes)}`)
  if (tipo && tipo !== 'todos') partes.push(`tipo=${encodeURIComponent(tipo)}`)
  return get(`/atividades?${partes.join('&')}`)
}
