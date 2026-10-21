/**
 * Comercial — direto no banco (server/routes/comercial.js).
 *
 * Quem decide se pode e a API: sem a permissao, a chamada volta erro
 * e a tela mostra o recado. Recusa de um campo vem com `erro.campo`,
 * para o formulario acender o campo certo.
 */

import { del, get, patch, post, put } from './api'

/**
 * Os negocios de um funil (ou de todos, sem `funil`), e o que a API da
 * Microsoft deixa fazer com e-mail: { negocios, email: { envio, leitura, caixa } }.
 */
export function carregarNegocios(funil) {
  return get(`/comercial/negocios${funil ? `?funil=${encodeURIComponent(funil)}` : ''}`)
}

/**
 * campos: { funil, etapa, titulo, clienteId, organizacao, pessoaId,
 *           contatoNome, contatoEmail, contatoTelefone, valor,
 *           responsavelId, etiqueta, proximaAtividade, atividadeDescricao,
 *           previsaoFechamento, observacao }
 */
export const criarNegocio = (campos) => post('/comercial/negocios', campos)
export const editarNegocio = (id, campos) => put(`/comercial/negocios/${encodeURIComponent(id)}`, campos)
export const moverNegocio = (id, etapa, funil) =>
  patch(`/comercial/negocios/${encodeURIComponent(id)}/etapa`, { etapa, funil })
/** status: 'ganho' | 'perdido' | 'aberto' (reabrir) */
export const mudarStatus = (id, status, motivo) =>
  patch(`/comercial/negocios/${encodeURIComponent(id)}/status`, { status, motivo })
export const apagarNegocio = (id) => del(`/comercial/negocios/${encodeURIComponent(id)}`)

/** linhas: [{ titulo, organizacao, contatoNome, contatoEmail, ... }] */
export const importarNegocios = (funil, linhas) => post('/comercial/negocios/importar', { funil, linhas })

/** Os e-mails mandados pelo site e o ultimo que o contato mandou. */
export const carregarEmails = (id) => get(`/comercial/negocios/${encodeURIComponent(id)}/emails`)

/** { para, assunto, mensagem, responder } — sai da caixa do Outlook de quem esta logado. */
export const enviarEmail = (id, campos) => post(`/comercial/negocios/${encodeURIComponent(id)}/email`, campos)

/** Confere na caixa de entrada quais contatos esperam resposta (o "Responder?"). */
export const conferirEmails = (funil) => post('/comercial/emails/conferir', { funil })

/** { [clienteId]: { ganhos, abertos, perdidos, valorGanho, ticketMedio } } */
export async function carregarResumoClientes() {
  const { resumo } = await get('/comercial/resumo-clientes')
  return resumo ?? {}
}

/** Todos os contatos (cliente_pessoa), de qualquer empresa ou de nenhuma. */
export async function carregarContatos() {
  const { contatos } = await get('/comercial/contatos')
  return contatos ?? []
}

/** { nome, email, telefone, clienteId } — o "Adicionar contato" do negocio. */
export async function criarContato(campos) {
  const { contato } = await post('/comercial/contatos', campos)
  return contato
}
