/**
 * A agenda da empresa (server/routes/agenda.js, atualizacao 44) — o card
 * "Agenda da Empresa" da aba Panorama e o "Marcar evento" do botao "+".
 *
 * Quem decide se pode gravar e a API: sem `publicar_agenda`, criar, editar
 * ou excluir volta erro e a tela mostra o recado.
 */

import { del, get, post, put } from './api'

/**
 * A agenda mudou: o card do Panorama escuta este evento e le de novo,
 * mesmo com o evento marcado pelo "+", em outra parte da tela.
 */
export const AGENDA_MUDOU = 'atmosfera:agenda'

const avisar = () => window.dispatchEvent(new CustomEvent(AGENDA_MUDOU))

/** [{ id, titulo, dia, hora, local, criadoPorNome }] de hoje em diante. */
export async function carregarEventos() {
  const { eventos } = await get('/agenda')
  return eventos ?? []
}

/** campos: { titulo, dia ('AAAA-MM-DD'), hora ('HH:MM' ou ''), local } */
export async function criarEvento(campos) {
  const resposta = await post('/agenda', campos)
  avisar()
  return resposta
}

export async function editarEvento(id, campos) {
  const resposta = await put(`/agenda/${encodeURIComponent(id)}`, campos)
  avisar()
  return resposta
}

export async function apagarEvento(id) {
  await del(`/agenda/${encodeURIComponent(id)}`)
  avisar()
}
