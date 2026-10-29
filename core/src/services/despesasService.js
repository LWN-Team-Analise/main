/**
 * Despesas, refeicoes e bonus — direto no banco (server/routes/despesas.js).
 *
 * Os filtros de leitura se somam, e quem filtra e o BANCO:
 *
 *   usuarios   undefined / []   so os meus
 *              'todos'          a equipe inteira (exige revisar_despesa_geral)
 *              ['4', '9']       essas pessoas   (idem, se nao for so eu)
 *   categoria  undefined        todas
 *              'despesa' | 'refeicao' | 'bonus'
 *
 * Quem decide se pode e a API: sem a permissao, pedir outra pessoa
 * volta erro, e a tela mostra o recado.
 */

import { del, get, post, put } from './api'

/** '/despesas/envios' + ['mes=2026-10'] + os filtros -> '/despesas/envios?mes=2026-10&categoria=bonus' */
function consulta(base, { usuarios, categoria } = {}, partes = []) {
  if (usuarios === 'todos') partes.push('usuarios=todos')
  else if (Array.isArray(usuarios) && usuarios.length > 0) {
    partes.push(`usuarios=${encodeURIComponent(usuarios.join(','))}`)
  }
  if (categoria) partes.push(`categoria=${encodeURIComponent(categoria)}`)
  return partes.length ? `${base}?${partes.join('&')}` : base
}

/**
 * As tabelas do "Valores pré-definidos":
 *
 *   valores   { tipo: valor } — tipo fora dela e digitado;
 *   periodos  { categoria: dia } — o dia em que o periodo dela comeca.
 */
export async function carregarValores() {
  const { valores, periodos } = await get('/despesas/valores')
  return { valores: valores ?? {}, periodos: periodos ?? {} }
}

/** Grava as duas tabelas inteiras (definir_valores_reembolso). Devolve as que ficaram gravadas. */
export async function salvarValores(valores, periodos) {
  const resposta = await put('/despesas/valores', { valores, periodos })
  return { valores: resposta.valores ?? {}, periodos: resposta.periodos ?? {} }
}

/** campos: { categoria, tipo, data, clienteId, obraId?, valor?, justificativa?, observacao?, anexo? } */
export const enviar = (campos) => post('/despesas/envios', campos)

/**
 * Os envios de um mes ('AAAA-MM'), com os totais do dia, do mes e por
 * pessoa — cada categoria no periodo dela. Sem mes, a API escolhe o de
 * hoje (e devolve qual foi em `mes`).
 */
export const carregarMes = (mes, filtros) =>
  get(consulta('/despesas/envios', filtros, mes ? [`mes=${encodeURIComponent(mes)}`] : []))

/** O ano mes a mes, com o total anual. */
export const carregarAno = (ano, filtros) =>
  get(consulta('/despesas/resumo', filtros, [`ano=${encodeURIComponent(ano)}`]))

/** Quem ja enviou alguma coisa — a lista de Envios gerais (so revisor). */
export async function carregarPessoas() {
  const { pessoas } = await get('/despesas/pessoas')
  return pessoas ?? []
}

/** O comprovante: { nome, tipo, conteudo } (data URL). */
export const baixarAnexo = (id) => get(`/despesas/anexos/${id}`)

/** Exclui um lancamento (exige excluir_despesas; o dos outros, revisar tambem). */
export const excluir = (id) => del(`/despesas/envios/${encodeURIComponent(id)}`)

/**
 * Os envios de um periodo, numa lista so — e o que vira planilha.
 *
 *   periodo  { mes: 'AAAA-MM' } | { ano: 2026 } | {} (tudo)
 *   filtros  os mesmos de carregarMes: { usuarios, categoria }
 */
export async function carregarParaExportar(periodo = {}, filtros) {
  const recorte = periodo.mes
    ? `mes=${encodeURIComponent(periodo.mes)}`
    : periodo.ano
      ? `ano=${encodeURIComponent(periodo.ano)}`
      : 'periodo=tudo'
  const { envios } = await get(consulta('/despesas/exportar', filtros, [recorte]))
  return envios ?? []
}

/**
 * Os totais por dia, categoria e tipo — os graficos do Dashboard.
 * Sem pessoa nenhuma (ver /painel na API). de/ate: 'AAAA-MM-DD',
 * inclusive; sem eles, desde o primeiro envio.
 */
export async function carregarPainel({ de, ate } = {}) {
  const partes = []
  if (de) partes.push(`de=${encodeURIComponent(de)}`)
  if (ate) partes.push(`ate=${encodeURIComponent(ate)}`)
  const { linhas } = await get(`/despesas/painel${partes.length ? `?${partes.join('&')}` : ''}`)
  return linhas ?? []
}
