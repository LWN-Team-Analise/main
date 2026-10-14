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

import { del, get, post } from './api'

function consulta(base, { usuarios, categoria } = {}) {
  const partes = []
  if (usuarios === 'todos') partes.push('usuarios=todos')
  else if (Array.isArray(usuarios) && usuarios.length > 0) {
    partes.push(`usuarios=${encodeURIComponent(usuarios.join(','))}`)
  }
  if (categoria) partes.push(`categoria=${encodeURIComponent(categoria)}`)
  return partes.length ? `${base}&${partes.join('&')}` : base
}

/** campos: { categoria, tipo, data, clienteId, obraId?, valor?, justificativa?, observacao?, anexo? } */
export const enviar = (campos) => post('/despesas/envios', campos)

/** Os envios de um mes ('AAAA-MM'), com os totais do dia, do mes e por pessoa. */
export const carregarMes = (mes, filtros) =>
  get(consulta(`/despesas/envios?mes=${encodeURIComponent(mes)}`, filtros))

/** O ano mes a mes, com o total anual. */
export const carregarAno = (ano, filtros) =>
  get(consulta(`/despesas/resumo?ano=${encodeURIComponent(ano)}`, filtros))

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
  const base = periodo.mes
    ? `/despesas/exportar?mes=${encodeURIComponent(periodo.mes)}`
    : periodo.ano
      ? `/despesas/exportar?ano=${encodeURIComponent(periodo.ano)}`
      : '/despesas/exportar?periodo=tudo'
  const { envios } = await get(consulta(base, filtros))
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
