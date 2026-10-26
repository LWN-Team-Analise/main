/**
 * Turnos — direto no banco (server/routes/turnos.js, atualizacao 31).
 *
 * Quem decide se pode e a API: sem `editar_turnos`, criar ou mudar
 * volta erro e a tela mostra o recado.
 */

import { del, get, post, put } from './api'

/** { cronogramas: [{ id, nome, membros }], turnos: [...], anotacoes: { dia: texto } } do periodo. */
export const carregar = (de, ate) => get(`/turnos?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`)

/**
 * campos: { cronogramaId, usuarioId (vazio = turno aberto), titulo, subtitulo, cor,
 *           dataInicio, dataFim, horaInicio, horaFim (os dois ou nenhum), obraId?, checkId? }
 */
export const criarTurno = (campos) => post('/turnos', campos)
export const editarTurno = (id, campos) => put(`/turnos/${encodeURIComponent(id)}`, campos)
export const apagarTurno = (id) => del(`/turnos/${encodeURIComponent(id)}`)

/** A "Anotacao do dia" — texto vazio apaga. */
export const salvarAnotacao = (dia, texto) => put(`/turnos/anotacoes/${encodeURIComponent(dia)}`, { texto })

/** { nome, membros: [ids] } */
export const criarCronograma = (campos) => post('/turnos/cronogramas', campos)
export const editarCronograma = (id, campos) => put(`/turnos/cronogramas/${encodeURIComponent(id)}`, campos)
export const apagarCronograma = (id) => del(`/turnos/cronogramas/${encodeURIComponent(id)}`)
