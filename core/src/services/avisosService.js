/**
 * O aviso geral (server/routes/avisos.js, atualizacao 46): o "Enviar
 * aviso" do botao "+", que aparece no card "Avisos e Comunicados" do
 * Panorama.
 *
 * Quem decide se pode enviar e a API: sem `enviar_avisos`, enviar ou
 * excluir volta erro e a tela mostra o recado.
 */

import { del, get, post } from './api'

/**
 * O aviso que acabou de mudar (enviado ou excluido): o card do Panorama
 * escuta este evento e le de novo, mesmo aberto em outra parte da tela.
 */
export const AVISOS_MUDARAM = 'atmosfera:avisos-gerais'

const avisar = () => window.dispatchEvent(new CustomEvent(AVISOS_MUDARAM))

/** [{ id, titulo, mensagem, importante, enviadoEm, enviadoPorNome }] dos mais novos aos mais antigos. */
export async function carregarAvisos() {
  const { avisos } = await get('/avisos')
  return avisos ?? []
}

/** campos: { titulo, mensagem, importante } */
export async function enviarAviso(campos) {
  const resposta = await post('/avisos', campos)
  avisar()
  return resposta
}

export async function apagarAviso(id) {
  await del(`/avisos/${encodeURIComponent(id)}`)
  avisar()
}
