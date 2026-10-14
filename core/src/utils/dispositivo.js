/**
 * Que aparelho esta abrindo o sistema.
 *
 * Serve para o que so faz sentido em UM aparelho — e nao para decidir
 * layout. Tamanho de tela quem responde e o CSS (e o `useMediaQuery`),
 * que acerta tambem a janela estreita no desktop; a pergunta daqui e
 * outra: "isto aqui e um iPhone?".
 */

/**
 * iPhone (e iPod touch, que usa o mesmo Safari).
 *
 * iPad fica de FORA de proposito: desde o iPadOS 13 ele se apresenta
 * como "Macintosh" para receber o site de computador, entao qualquer
 * tentativa de incluir o iPad acabaria pegando Mac junto.
 *
 * A conta e feita a cada chamada, e nao uma vez no modulo: assim a
 * ferramenta de dispositivo do navegador, que troca o user agent com a
 * pagina ja carregada, mostra o mesmo que o aparelho de verdade
 * mostraria.
 */
export function ehIphone() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPod/i.test(navigator.userAgent ?? '')
}

/**
 * O site foi ADICIONADO A TELA DE INICIO e esta rodando como aplicativo?
 *
 * Duas perguntas, porque cada plataforma responde de um jeito:
 *
 *   display-mode: standalone   o padrao da web, que o Android e o
 *                              Chrome respondem;
 *   navigator.standalone       o jeito antigo do Safari do iPhone, que
 *                              ate hoje e o unico que ele responde.
 *
 * E a conta e feita a cada chamada, e nao uma vez no modulo: no
 * navegador comum a resposta e sempre a mesma, mas assim a ferramenta
 * de desenvolvedor consegue simular o modo aplicativo com a pagina ja
 * carregada.
 */
export function ehAplicativo() {
  if (typeof window === 'undefined') return false
  const pelaMidia = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false
  const peloSafari = window.navigator?.standalone === true
  return pelaMidia || peloSafari
}
