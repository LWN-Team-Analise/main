/**
 * A folha de ponto (server/routes/ponto.js, atualizacao 51) — a aba Ponto.
 *
 * Quem decide o que cada um ve e a API: sem `gerenciar_ponto`, a folha de
 * outra pessoa, a lista de pessoas, o Excel da empresa e a importacao
 * voltam 403. Assinar e sempre a propria folha.
 */

import { get, post } from './api'

const periodo = (inicio, fim) => `inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`

/**
 * A folha de uma pessoa (sem `usuarioId`, a propria):
 * { usuario, proprio, semCpf, funcionario, dias, assinatura, inicio, fim }
 */
export function carregarFolha({ usuarioId, inicio, fim }) {
  const quem = usuarioId ? `usuario=${encodeURIComponent(usuarioId)}&` : ''
  return get(`/ponto/folha?${quem}${periodo(inicio, fim)}`)
}

/** { pessoas: [{ id, nome, temCpf, temFolha, assinada }], semUsuario: [nome] } */
export function carregarPessoas({ inicio, fim }) {
  return get(`/ponto/pessoas?${periodo(inicio, fim)}`)
}

/** Os dias de todo mundo no periodo, para o Excel da empresa. */
export async function diasDaEmpresa({ inicio, fim }) {
  const { dias } = await get(`/ponto/exportar?${periodo(inicio, fim)}`)
  return dias ?? []
}

/** Manda o texto do Calculo Diario. Volta o resumo do que entrou. */
export function importarCalculo({ conteudo, arquivo }) {
  return post('/ponto/importar', { conteudo, arquivo })
}

/**
 * O "Enviar aviso" das Assinaturas: a mensagem no Teams pedindo para a
 * pessoa assinar a folha do periodo. Volta { avisadoEm, avisadoPor }.
 */
export function lembrarAssinatura({ usuarioId, inicio, fim }) {
  return post('/ponto/lembrar', { usuarioId, inicio, fim })
}

/** Assina a propria folha do periodo (o duplo check vai junto). */
export async function assinarFolha({ usuarioId, inicio, fim, conferi, concordo }) {
  const { assinatura } = await post('/ponto/assinar', { usuarioId, inicio, fim, conferi, concordo })
  return assinatura
}
