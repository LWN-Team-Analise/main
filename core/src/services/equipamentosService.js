/**
 * Os notebooks e PCs da empresa (server/routes/equipamentos.js,
 * atualizacao 59). Ver e `ver_equipamentos`; mexer e
 * `editar_equipamentos` — a API confere as duas.
 */

import { del, get, post, put } from './api'

export async function carregarEquipamentos() {
  const { equipamentos } = await get('/equipamentos')
  return equipamentos ?? []
}

/** Cadastra (sem id) ou edita (com id) -> o equipamento gravado. */
export async function salvarEquipamento(id, campos) {
  const { equipamento } = id ? await put(`/equipamentos/${encodeURIComponent(id)}`, campos) : await post('/equipamentos', campos)
  return equipamento
}

export const apagarEquipamento = (id) => del(`/equipamentos/${encodeURIComponent(id)}`)
