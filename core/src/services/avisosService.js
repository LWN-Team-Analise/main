/**
 * O aviso geral (server/routes/avisos.js, atualizacoes 46 e 47): o
 * "Enviar aviso" do botao "+", que aparece no card "Avisos e
 * Comunicados" do Panorama e depois fica no historico de avisos.
 *
 * Quem decide se pode enviar, encerrar ou excluir e a API: sem
 * `publicar_avisos`, volta erro e a tela mostra o recado.
 */

import { del, get, post } from './api'

/**
 * Um aviso mudou (enviado, encerrado ou excluido): o card do Panorama e
 * o historico escutam este evento e leem de novo.
 */
export const AVISOS_MUDARAM = 'atmosfera:avisos-gerais'

const avisar = () => window.dispatchEvent(new CustomEvent(AVISOS_MUDARAM))

/** Os que estao valendo para o setor de quem esta logado. */
export async function carregarAvisos() {
  const { avisos } = await get('/avisos')
  return avisos ?? []
}

/** { ativos, encerrados } — todos os que nao foram excluidos. */
export async function carregarHistorico() {
  const { ativos, encerrados } = await get('/avisos/historico')
  return { ativos: ativos ?? [], encerrados: encerrados ?? [] }
}

/** campos: { titulo, mensagem, importante, setor (chave ou ''), expiraEm ('AAAA-MM-DD' ou '') } */
export async function enviarAviso(campos) {
  const resposta = await post('/avisos', campos)
  avisar()
  return resposta
}

/** Tira do Panorama e leva para o historico. */
export async function encerrarAviso(id) {
  await post(`/avisos/${encodeURIComponent(id)}/encerrar`)
  avisar()
}

export async function apagarAviso(id) {
  await del(`/avisos/${encodeURIComponent(id)}`)
  avisar()
}
