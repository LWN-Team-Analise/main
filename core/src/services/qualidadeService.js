/**
 * A Area da qualidade (server/routes/qualidade.js, atualizacao 58).
 *
 * Documentos: ver e comentar e `ver_documentos`; criar, editar, mover,
 * concluir e excluir e `editar_documentos`. Correio: pedir e acompanhar e
 * `ver_correio`; levar o pedido pelas situacoes e `gerenciar_correio`. A
 * API confere as quatro.
 */

import { del, get, patch, post, put } from './api'

const doc = (id) => `/qualidade/documentos/${encodeURIComponent(id)}`
const envio = (id) => `/qualidade/correio/${encodeURIComponent(id)}`

/* ---------------- documentos ---------------- */

/** Os em andamento; com `arquivados`, os concluidos e cancelados. */
export async function carregarDocumentos({ arquivados = false } = {}) {
  const { documentos } = await get(`/qualidade/documentos${arquivados ? '?arquivados=1' : ''}`)
  return documentos ?? []
}

export async function criarDocumento(campos) {
  const { documento } = await post('/qualidade/documentos', campos)
  return documento
}

export async function editarDocumento(id, campos) {
  const { documento } = await put(doc(id), campos)
  return documento
}

export async function moverDocumento(id, etapa) {
  const { documento } = await patch(`${doc(id)}/etapa`, { etapa })
  return documento
}

/** 'concluido', 'cancelado' (com o motivo em `texto`) ou 'aberto' (reabrir). */
export async function mudarStatusDocumento(id, status, texto = '') {
  const { documento } = await patch(`${doc(id)}/status`, { status, texto })
  return documento
}

export async function novaRevisao(id, texto = '') {
  const { documento } = await patch(`${doc(id)}/revisao`, { texto })
  return documento
}

export const excluirDocumento = (id) => del(doc(id))

export async function carregarEventos(id) {
  const { eventos } = await get(`${doc(id)}/eventos`)
  return eventos ?? []
}

export async function comentarDocumento(id, texto) {
  const { documento } = await post(`${doc(id)}/comentarios`, { texto })
  return documento
}

/* ---------------- correio ---------------- */

/** As do quadro; com `arquivados`, as canceladas e as entregues ha mais de 30 dias. */
export async function carregarSolicitacoes({ arquivados = false } = {}) {
  const { solicitacoes } = await get(`/qualidade/correio${arquivados ? '?arquivados=1' : ''}`)
  return solicitacoes ?? []
}

export async function solicitarEnvio(campos) {
  const { solicitacao } = await post('/qualidade/correio', campos)
  return solicitacao
}

export async function editarSolicitacao(id, campos) {
  const { solicitacao } = await put(envio(id), campos)
  return solicitacao
}

/** { situacao, rastreio?, custo?, postadoEm?, entregueEm?, resposta? } */
export async function mudarSituacaoEnvio(id, campos) {
  const { solicitacao } = await patch(`${envio(id)}/situacao`, campos)
  return solicitacao
}

export const excluirSolicitacao = (id) => del(envio(id))
