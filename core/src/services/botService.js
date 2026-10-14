import { post } from './api'

/**
 * Uma rodada de conversa com o LWN Bot.
 *
 * A API é sem estado: o histórico inteiro sobe a cada pergunta, como
 * texto puro. Nada da conversa fica guardado — nem no servidor, nem no
 * banco.
 *
 * A resposta traz `sugestao` preenchida quando o assunto virou uma
 * proposta de melhoria. Isso NÃO envia nada: é o texto que a tela mostra
 * para a pessoa ler, corrigir e confirmar.
 */
export function conversarComBot(mensagens) {
  return post('/bot', { mensagens })
}

/**
 * Manda a sugestão, depois do clique de confirmação.
 *
 * O que sobe é o texto e a escolha do anonimato. Quem escreveu não vai
 * junto: quando `anonima` é true, o servidor monta o e-mail sem sequer
 * consultar o cadastro de quem está na sessão.
 */
export function enviarSugestaoDoBot(texto, anonima) {
  return post('/bot/sugestao', { texto, anonima })
}
