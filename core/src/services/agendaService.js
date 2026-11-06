/**
 * A agenda da empresa (server/routes/agenda.js, atualizacao 44) — o card
 * "Agenda da Empresa" da aba Panorama.
 *
 * Quem decide se pode gravar e a API: sem `enviar_avisos`, criar, editar
 * ou excluir volta erro e a tela mostra o recado.
 */

import { del, get, post, put } from './api'

/** [{ id, titulo, dia, hora, local, criadoPorNome }] de hoje em diante. */
export async function carregarEventos() {
  const { eventos } = await get('/agenda')
  return eventos ?? []
}

/** campos: { titulo, dia ('AAAA-MM-DD'), hora ('HH:MM' ou ''), local } */
export const criarEvento = (campos) => post('/agenda', campos)
export const editarEvento = (id, campos) => put(`/agenda/${encodeURIComponent(id)}`, campos)
export const apagarEvento = (id) => del(`/agenda/${encodeURIComponent(id)}`)
