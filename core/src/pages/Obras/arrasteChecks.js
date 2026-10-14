import { useCallback, useEffect, useRef, useState } from 'react'

/* quanto o ponteiro anda (px) antes de virar arraste: abaixo disso e clique */
const LIMIAR_MOUSE = 6
/* no toque, segurar parado este tempo (ms) pega o check; mexer antes rola a tela */
const SEGURAR_TOQUE = 320
const FOLGA_TOQUE = 10
/* a faixa perto da borda que rola a tela sozinha, e o passo dela */
const BORDA_ROLAGEM = 56
const PASSO_ROLAGEM = 14

/** A caixa que rola na vertical em volta de `el` (a do pop-up), ou a janela. */
function rolavelVertical(el) {
  for (let no = el?.parentElement; no && no !== document.body; no = no.parentElement) {
    const { overflowY } = getComputedStyle(no)
    if ((overflowY === 'auto' || overflowY === 'scroll') && no.scrollHeight > no.clientHeight) return no
  }
  return window
}

/** Os ids dos checks que ainda valem num card, na ordem da tela. */
const filaDoCard = (ul) =>
  [...ul.querySelectorAll(':scope > li[data-check][data-vivo]')].map((li) => li.dataset.check)

/**
 * ARRASTAR CHECKS — para cima, para baixo, ou para outro card (de
 * qualquer setor, de qualquer etapa). Sem pegador: o proprio check e
 * arrastado.
 *
 *   mouse  apertar e mover (mais de 6px) pega o check; soltar sem mover
 *          continua sendo o clique de marcar;
 *   toque  segurar o check parado por um instante pega ele (o celular
 *          vibra); arrastar o dedo sem segurar continua rolando a tela.
 *
 * Feito com eventos de ponteiro, e nao com o arraste nativo do HTML: o
 * nativo nao funciona no toque, e nao comeca em cima de botao travado.
 *
 * Quem marca os lugares e o HTML do card (ver CardSetor):
 *   ul[data-card][data-etapa]   a lista de checks de um card;
 *   li[data-check][data-vivo]   um check que ainda vale (o que ja saiu do
 *                               roteiro aparece, mas nao tem ordem).
 *
 * Ao soltar, o card de destino manda a fila inteira dele, ja na ordem
 * nova, para `ordenar(cardId, checkIds)`. Os checks do sistema mudam de
 * ordem e de card, mas nao saem da etapa deles: a tela recusa antes
 * (`aoRecusar`) e o servidor tambem.
 */
export function useArrasteDeChecks({ ordenar, aoRecusar }) {
  /* { checkId, cardId, etapaId, sistema, titulo } */
  const [arrastando, setArrastando] = useState(null)
  /* { cardId, antesDe } — antesDe null = no fim do card */
  const [alvo, setAlvo] = useState(null)
  /* o arraste em curso, fora do React: os ouvintes da janela leem daqui */
  const vivo = useRef(null)
  const ordenarRef = useRef(ordenar)
  const recusarRef = useRef(aoRecusar)
  useEffect(() => {
    ordenarRef.current = ordenar
    recusarRef.current = aoRecusar
  })

  const encerrar = useCallback(() => {
    const st = vivo.current
    if (!st) return
    clearTimeout(st.timer)
    cancelAnimationFrame(st.quadro)
    st.fantasma?.remove()
    st.desligar?.()
    document.body.classList.remove('arrastando-check')
    vivo.current = null
    setArrastando(null)
    setAlvo(null)
  }, [])

  /* desmontou no meio de um arraste: nada fica pendurado na janela */
  useEffect(() => encerrar, [encerrar])

  const mirar = (st) => {
    const el = document.elementFromPoint(st.x, st.y)
    const li = el?.closest('li[data-check][data-vivo]')
    const ul = el?.closest('ul[data-card]') ?? el?.closest('.setorcard')?.querySelector('ul[data-card]')
    let novo = null
    if (ul) {
      const fila = filaDoCard(ul)
      if (li && ul.contains(li)) {
        const caixa = li.getBoundingClientRect()
        const depois = st.y > caixa.top + caixa.height / 2
        const i = fila.indexOf(li.dataset.check)
        novo = { cardId: ul.dataset.card, etapaId: ul.dataset.etapa, antesDe: depois ? (fila[i + 1] ?? null) : li.dataset.check }
      } else {
        novo = { cardId: ul.dataset.card, etapaId: ul.dataset.etapa, antesDe: null }
      }
    }
    const igual = (a, b) => a?.cardId === b?.cardId && a?.antesDe === b?.antesDe
    if (!igual(novo, st.alvo)) {
      st.alvo = novo
      setAlvo(novo)
    }
  }

  /* perto da borda, a tela rola sozinha: e assim que o check chega na
     etapa que esta fora da vista */
  const rolar = (st) => {
    if (!st.ativo) return
    const { x, y } = st
    if (st.trilho) {
      const caixa = st.trilho.getBoundingClientRect()
      if (x < caixa.left + BORDA_ROLAGEM) st.trilho.scrollLeft -= PASSO_ROLAGEM
      else if (x > caixa.right - BORDA_ROLAGEM) st.trilho.scrollLeft += PASSO_ROLAGEM
    }
    if (st.vertical === window) {
      if (y < BORDA_ROLAGEM + 20) window.scrollBy(0, -PASSO_ROLAGEM)
      else if (y > window.innerHeight - BORDA_ROLAGEM - 40) window.scrollBy(0, PASSO_ROLAGEM)
    } else if (st.vertical) {
      const caixa = st.vertical.getBoundingClientRect()
      if (y < caixa.top + BORDA_ROLAGEM) st.vertical.scrollTop -= PASSO_ROLAGEM
      else if (y > caixa.bottom - BORDA_ROLAGEM) st.vertical.scrollTop += PASSO_ROLAGEM
    }
    mirar(st)
    st.quadro = requestAnimationFrame(() => rolar(st))
  }

  const comecar = (st) => {
    st.ativo = true
    const caixa = st.li.getBoundingClientRect()
    st.dx = st.x0 - caixa.left
    st.dy = st.y0 - caixa.top
    /* a copia que segue o ponteiro; o original fica apagado no lugar */
    const fantasma = st.li.cloneNode(true)
    fantasma.classList.add('tarefa-fantasma')
    fantasma.removeAttribute('data-check')
    Object.assign(fantasma.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: `${caixa.width}px`,
      transform: `translate(${caixa.left}px, ${caixa.top}px)`,
      pointerEvents: 'none',
      zIndex: '9999',
    })
    document.body.appendChild(fantasma)
    st.fantasma = fantasma
    st.trilho = st.li.closest('.trilho')
    st.vertical = rolavelVertical(st.trilho ?? st.li)
    document.body.classList.add('arrastando-check')
    window.getSelection?.()?.removeAllRanges()
    if (st.toque) navigator.vibrate?.(12)
    setArrastando(st.pego)
    st.quadro = requestAnimationFrame(() => rolar(st))
  }

  const soltarNo = async (st) => {
    const pego = st.pego
    const destino = st.alvo
    if (!destino || destino.antesDe === pego.checkId) return

    if (pego.sistema && String(destino.etapaId) !== String(pego.etapaId)) {
      recusarRef.current?.(`"${pego.titulo}" é do sistema: muda de ordem e de card, mas não sai da etapa dele.`)
      return
    }

    const ul = (st.trilho ?? document).querySelector(`ul[data-card="${destino.cardId}"]`)
    if (!ul) return
    const antes = filaDoCard(ul)
    const fila = antes.filter((id) => id !== pego.checkId)
    const posicao = destino.antesDe ? fila.indexOf(destino.antesDe) : -1
    fila.splice(posicao < 0 ? fila.length : posicao, 0, pego.checkId)
    if (pego.cardId === destino.cardId && fila.join('|') === antes.join('|')) return

    try {
      await ordenarRef.current(destino.cardId, fila)
    } catch (e) {
      recusarRef.current?.(e.message)
    }
  }

  /** O pointerdown de um check: prende os ouvintes ate soltar. */
  const pegar = (check, card, etapa) => (evento) => {
    if (vivo.current) return
    if (evento.pointerType === 'mouse' && evento.button !== 0) return
    const st = {
      pego: {
        checkId: check.id,
        cardId: card.id,
        etapaId: etapa.id,
        sistema: Boolean(check.tipo) && check.tipo !== 'comum',
        titulo: check.titulo,
      },
      li: evento.currentTarget,
      ponteiro: evento.pointerId,
      toque: evento.pointerType !== 'mouse',
      x0: evento.clientX,
      y0: evento.clientY,
      x: evento.clientX,
      y: evento.clientY,
      ativo: false,
      alvo: null,
    }
    vivo.current = st

    const mover = (e) => {
      if (e.pointerId !== st.ponteiro) return
      st.x = e.clientX
      st.y = e.clientY
      if (!st.ativo) {
        const andou = Math.hypot(st.x - st.x0, st.y - st.y0)
        /* no toque, mexer antes de segurar e rolar a tela: desiste */
        if (st.toque) {
          if (andou > FOLGA_TOQUE) encerrar()
          return
        }
        if (andou < LIMIAR_MOUSE) return
        comecar(st)
      }
      e.preventDefault()
      st.fantasma.style.transform = `translate(${st.x - st.dx}px, ${st.y - st.dy}px)`
    }

    const soltar = (e) => {
      if (e.pointerId !== st.ponteiro) return
      if (st.ativo) {
        /* o clique que vem depois de soltar nao marca o check */
        const engolir = (c) => {
          c.stopPropagation()
          c.preventDefault()
        }
        window.addEventListener('click', engolir, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', engolir, { capture: true }), 0)
        mirar(st)
        const copia = { ...st }
        encerrar()
        soltarNo(copia)
      } else {
        encerrar()
      }
    }

    /* com o check pego, o dedo nao rola a tela nem abre o menu do toque */
    const travarToque = (e) => {
      if (st.ativo) e.preventDefault()
    }
    const semMenu = (e) => e.preventDefault()
    const tecla = (e) => e.key === 'Escape' && encerrar()

    window.addEventListener('pointermove', mover, { passive: false })
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', encerrar)
    window.addEventListener('touchmove', travarToque, { passive: false })
    window.addEventListener('contextmenu', semMenu)
    window.addEventListener('keydown', tecla)
    st.desligar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', encerrar)
      window.removeEventListener('touchmove', travarToque)
      window.removeEventListener('contextmenu', semMenu)
      window.removeEventListener('keydown', tecla)
    }

    if (st.toque) st.timer = setTimeout(() => vivo.current === st && comecar(st), SEGURAR_TOQUE)
  }

  return { arrastando, alvo, pegar }
}
