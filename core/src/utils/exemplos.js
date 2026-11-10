import { EXEMPLOS } from '@/domain/exemplos'

/* ------------------------------------------------------------
   O SORTEIO DOS EXEMPLOS DOS CAMPOS

   O formulario continua escrevendo o placeholder fixo de sempre, e
   aquele texto e a chave da lista em domain/exemplos.js. Quem troca e
   o observador abaixo, no momento em que o campo aparece na tela.

   Pop-up desmonta o conteudo ao fechar (Modal.jsx), entao reabrir cria
   campos novos e sorteia de novo. Enquanto ele esta aberto o campo e o
   mesmo: digitar em outro campo nao troca o exemplo, porque o React so
   mexe no atributo quando o placeholder escrito no codigo muda.

   Um lugar so, em vez de um sorteio em cada um dos formularios: num
   formulario que fica montado com o pop-up fechado, um useMemo guardaria
   o mesmo exemplo para sempre.
   ------------------------------------------------------------ */

/* o ultimo de cada lista: reabrir nunca repete o que acabou de aparecer */
const ultimo = new Map()

function sortear(chave) {
  const candidatos = EXEMPLOS[chave].filter((item) => item !== ultimo.get(chave))
  const item = candidatos[Math.floor(Math.random() * candidatos.length)]
  ultimo.set(chave, item)
  return item
}

/** O exemplo sorteado sem o "Ex.: ", para usar no meio de uma frase. */
export function sortearExemplo(chave) {
  return sortear(chave).replace(/^Ex\.: /, '')
}

/* o que o observador escreveu em cada campo. Sem isto ele veria a propria
   troca como um placeholder novo, porque o exemplo original tambem esta
   na lista */
const escrito = new WeakMap()

function trocar(campo) {
  const atual = campo.getAttribute('placeholder')
  if (!Array.isArray(EXEMPLOS[atual]) || escrito.get(campo) === atual) return
  const novo = sortear(atual)
  escrito.set(campo, novo)
  campo.setAttribute('placeholder', novo)
}

function varrer(no) {
  if (no.nodeType !== Node.ELEMENT_NODE) return
  if (no.hasAttribute('placeholder')) trocar(no)
  no.querySelectorAll('[placeholder]').forEach(trocar)
}

/** Liga o sorteio. Chamado uma vez, antes da primeira tela (main.jsx). */
export function ligarExemplos() {
  const observador = new MutationObserver((mudancas) => {
    for (const mudanca of mudancas) {
      if (mudanca.type === 'attributes') trocar(mudanca.target)
      else mudanca.addedNodes.forEach(varrer)
    }
  })
  /* o atributo tambem: ha campo cujo exemplo muda com outra escolha (a
     condicao do filtro do Comercial, o tipo de item do planejamento) */
  observador.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['placeholder'],
  })
}
