import { EXEMPLOS, GRUPOS } from '@/domain/exemplos'

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

const sortearDe = (lista, anterior) => {
  const candidatos = lista.filter((item) => item !== anterior)
  return candidatos[Math.floor(Math.random() * candidatos.length)]
}

/* chave -> em que grupo e em que coluna ela esta */
const noGrupo = new Map()
for (const grupo of GRUPOS) {
  grupo.campos.forEach((chave, coluna) => noGrupo.set(chave, { grupo, coluna }))
}

/* por grupo: a linha da vez e os campos que a estao mostrando */
const emUso = new Map()

/* A linha so muda quando nao sobrou nenhum campo dela na tela. Assim os
   campos do mesmo pop-up combinam mesmo quando um deles aparece depois
   (o "Qual gas", que so existe com a opcao Outro), e reabrir sorteia. */
function linhaDe(grupo, campo) {
  let atual = emUso.get(grupo)
  if (!atual?.campos.some((c) => c.isConnected)) {
    atual = { linha: sortearDe(grupo.linhas, atual?.linha), campos: [] }
    emUso.set(grupo, atual)
  }
  if (campo) atual.campos.push(campo)
  return atual.linha
}

/* o ultimo de cada lista solta: reabrir nunca repete o que acabou de sair */
const ultimo = new Map()

function daListaSolta(chave) {
  const item = sortearDe(EXEMPLOS[chave], ultimo.get(chave))
  ultimo.set(chave, item)
  return item
}

/* 'UF (ex.: SP)' com 'GO' -> 'UF (ex.: GO)'; sem "ex" o valor e o texto todo */
function naFrase(chave, valor) {
  const marca = /\bex[.:]+\s*/i.exec(chave)
  if (!marca) return valor
  return chave.slice(0, marca.index + marca[0].length) + valor + (chave.endsWith(')') ? ')' : '')
}

const temExemplos = (chave) => noGrupo.has(chave) || Array.isArray(EXEMPLOS[chave])

function textoPara(chave, campo) {
  const lugar = noGrupo.get(chave)
  if (!lugar) return daListaSolta(chave)
  return naFrase(chave, linhaDe(lugar.grupo, campo)[lugar.coluna])
}

/** O exemplo sorteado sem o "Ex.: ", para usar no meio de uma frase. */
export function sortearExemplo(chave) {
  const lugar = noGrupo.get(chave)
  return lugar ? linhaDe(lugar.grupo)[lugar.coluna] : daListaSolta(chave).replace(/^Ex\.: /, '')
}

/* o que o observador escreveu em cada campo. Sem isto ele veria a propria
   troca como um placeholder novo, porque o exemplo original tambem esta
   na lista */
const escrito = new WeakMap()

function trocar(campo) {
  const atual = campo.getAttribute('placeholder')
  if (!temExemplos(atual) || escrito.get(campo) === atual) return
  const novo = textoPara(atual, campo)
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
