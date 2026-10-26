/**
 * Frotas — direto no banco (server/routes/frotas.js).
 *
 * Quem decide se pode e a API: sem a permissao, a chamada volta erro
 * e a tela mostra o recado. Recusa de um campo vem com `erro.campo`,
 * para o formulario acender o campo certo.
 */

import { del, get, patch, post, put } from './api'

/** Os veiculos, cada um com o ultimo registro (em uso ou na garagem). */
export async function carregarVeiculos() {
  const { veiculos } = await get('/frotas/veiculos')
  return veiculos ?? []
}

/** campos: { nome, marca, modelo, placa, ano, cor, kmAtual, observacao } */
export const cadastrarVeiculo = (campos) => post('/frotas/veiculos', campos)
export const editarVeiculo = (id, campos) => put(`/frotas/veiculos/${encodeURIComponent(id)}`, campos)
export const ativarVeiculo = (id, ativo) => patch(`/frotas/veiculos/${encodeURIComponent(id)}/ativo`, { ativo })

/**
 * campos: { veiculoId, condutorId, km, data, hora, obraId, observacao,
 *           fotos: { frente, traseira, esquerda, direita, painel } }
 */
export const registrarSaida = (campos) => post('/frotas/saidas', campos)

/** Os da saida (sem obraId) e mais { checklist: { pneus: 'sim' | 'nao', ... }, posto }. */
export const registrarDevolucao = (campos) => post('/frotas/devolucoes', campos)

/** Apaga uma saida, troca ou devolucao (excluir_registro_frota). */
export const excluirRegistro = (id) => del(`/frotas/registros/${encodeURIComponent(id)}`)

/**
 * Uma pagina de registros, do mais novo para o mais antigo.
 * filtros: { veiculo, tipo, alertas, mes, busca, pagina }
 */
export function carregarRegistros(filtros = {}) {
  const partes = []
  if (filtros.veiculo) partes.push(`veiculo=${encodeURIComponent(filtros.veiculo)}`)
  if (filtros.tipo) partes.push(`tipo=${encodeURIComponent(filtros.tipo)}`)
  if (filtros.alertas) partes.push('alertas=1')
  if (filtros.mes) partes.push(`mes=${encodeURIComponent(filtros.mes)}`)
  if (filtros.busca) partes.push(`busca=${encodeURIComponent(filtros.busca)}`)
  if (filtros.pagina > 1) partes.push(`pagina=${filtros.pagina}`)
  return get(`/frotas/registros${partes.length ? `?${partes.join('&')}` : ''}`)
}

/** As fotos de um registro: [{ posicao, conteudo }]. */
export async function carregarFotos(id) {
  const { fotos } = await get(`/frotas/registros/${encodeURIComponent(id)}/fotos`)
  return fotos ?? []
}

/* ---- a reserva de carro da obra (atualizacao 23) ---- */

/**
 * A frota vista pelo periodo de execucao da obra (so supervisor / acesso
 * total): { execucao: { dias, de, ate }, rodizio: [{ data, finais, livre }],
 * veiculos: [{ ..., situacao: livre|reservado|em_uso|esta, conflito,
 * emUsoCom, rodizio: [dias] }] }. Sem o prazo da execucao, a API recusa.
 */
export async function carregarDisponiveis(obraId) {
  const r = await get(`/frotas/reservas/disponiveis?obra=${encodeURIComponent(obraId)}`)
  return { execucao: r.execucao ?? null, rodizio: r.rodizio ?? [], veiculos: r.veiculos ?? [] }
}

/** As reservas ainda sem saida, da mais proxima a mais distante ({ reservas, hoje }). */
export const carregarReservas = () => get('/frotas/reservas')

/** { veiculoId } reserva o carro; { semCarro: true } marca que a obra nao usa carro. */
export const reservar = (obraId, campos) => put(`/frotas/reservas/${encodeURIComponent(obraId)}`, campos)

export const cancelarReserva = (obraId) => del(`/frotas/reservas/${encodeURIComponent(obraId)}`)

/* ---- o rodizio de Sao Paulo ---- */

/** { hoje, dias, horarios, area, agora, fonte } — ver GET /frotas/rodizio. */
export const carregarRodizio = () => get('/frotas/rodizio')

/* ---- o transito e os alertas de Sao Paulo ---- */

/** { transito, alertas, cge } — ver GET /frotas/condicoes. Cada parte pode vir com `erro`. */
export const carregarCondicoes = () => get('/frotas/condicoes')

/**
 * O uso da frota de `de` a `ate` ('AAAA-MM'): km por carro e por mes,
 * e quem mais dirigiu — ver GET /frotas/uso.
 */
export const carregarUso = (de, ate) =>
  get(`/frotas/uso?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`)
