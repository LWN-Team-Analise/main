/**
 * Turnos — direto no banco (server/routes/turnos.js, atualizacoes 31 e 32).
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

/* ---- copiar, colar e compartilhar (atualizacao 32): o que chega aqui nasce sem compartilhar ---- */

/** { origem: [ids], cronogramaId, usuarioId (vazio = aberto), dia } -> { colados, ids } */
export const colarTurnos = (campos) => post('/turnos/colar', campos)

/** O "Copiar agenda": os turnos do periodo anterior vem para { de, ate } -> { copiados, ids } */
export const copiarAgenda = (periodo) => post('/turnos/copiar-agenda', periodo)

/** { ids } compartilha os escolhidos; { de, ate } todos os do periodo -> { compartilhados } */
export const compartilhar = (campos) => post('/turnos/compartilhar', campos)
