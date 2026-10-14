import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Textarea que cresce e encolhe sozinha, conforme o texto quebra linha.
 *
 * Devolve uma ref para pendurar no <textarea>. Toda vez que o valor
 * muda, a altura e recalculada: some a alcinha do canto inferior
 * direito (o CSS poe `resize: none`) e a caixa passa a acompanhar o
 * que esta escrito.
 *
 * Por que arrastar a alcinha era pior: ela so mexia na ALTURA, e
 * quem escrevia tres linhas tinha de puxar a caixa na mao toda vez —
 * e depois puxar de volta. Fora que, uma vez arrastada, a altura ficava
 * TRAVADA naquele tamanho: apagar o texto deixava um campo enorme e
 * vazio, porque o navegador passa a respeitar o que a mao escolheu.
 *
 * O truque das duas linhas e o de sempre, e a ordem importa:
 *
 *     el.style.height = 'auto'          // esquece a altura de agora
 *     el.style.height = scrollHeight    // e assume a do conteudo
 *
 * Sem o 'auto' antes, `scrollHeight` nunca diminui — ele mede o
 * conteudo dentro da caixa ATUAL, entao a caixa cresceria para sempre
 * e nunca voltaria ao encolher o texto.
 *
 * O teto e do CSS (`max-height`), nao daqui: passado ele, a caixa para
 * de crescer e o texto rola por dentro. Uma mensagem de trinta linhas
 * nao pode empurrar o botao de enviar para fora da tela.
 */
/** Poe a caixa na altura do conteudo. Exportada para quem ja tem a ref. */
export function ajustarAltura(el) {
  if (!el) return

  const estilo = getComputedStyle(el)
  /* com box-sizing: border-box (o padrao deste projeto) a altura tem de
     incluir as bordas, e `scrollHeight` so conta conteudo e padding */
  const bordas =
    parseFloat(estilo.borderTopWidth || 0) + parseFloat(estilo.borderBottomWidth || 0)

  /* ZERO, e nao 'auto', antes de medir.
     Com 'auto' a caixa fica sem altura propria, e um pai com
     `align-items: stretch` a estica ate a altura dele — ai o
     `scrollHeight` devolve essa altura esticada e a caixa nasce
     gigante. Foi o que acontecia no primeiro render, antes de o CSS
     do chat (que poe `align-items: center`) chegar: a caixa abria com
     850px de altura.

     Com uma altura EXPLICITA o stretch nao se aplica, e `scrollHeight`
     volta a medir o que realmente ha dentro. */
  el.style.height = '0px'
  el.style.height = `${el.scrollHeight + bordas}px`
}

/**
 * `refExterna` e para quem JA tem uma ref no textarea por outro motivo
 * — o chat, por exemplo, usa a dele para dar foco e para inserir a
 * mencao no lugar certo. Sem isso seriam duas refs no mesmo elemento, e
 * a segunda apagaria a primeira.
 */
export default function useAlturaAuto(valor, refExterna = null) {
  const propria = useRef(null)
  const alvo = refExterna ?? propria

  const ajustar = useCallback(() => ajustarAltura(alvo.current), [alvo])

  /* useLayoutEffect, e nao useEffect: o ajuste acontece antes de a tela
     pintar, entao nao ha um quadro com a caixa no tamanho errado */
  useLayoutEffect(ajustar, [valor, ajustar])

  return alvo
}
