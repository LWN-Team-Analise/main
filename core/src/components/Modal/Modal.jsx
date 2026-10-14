import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './Modal.css'

/**
 * Janela centralizada, com fundo escurecido. Superficie OPACA: e o unico
 * lugar do sistema sem o vidro, para o formulario nao brigar com o que
 * passa por tras.
 *
 * Fecha no Esc, no clique fora e no X. Enquanto esta aberta, a rolagem
 * da pagina fica travada e o foco vai para dentro do dialogo.
 *
 * `nivel`: pop-up aberto por cima de outro (editar um cargo a partir da
 * lista de cargos, por exemplo) usa nivel={1} para ficar na frente.
 *
 * `ajustavel`: a chave onde guardar o tamanho que a pessoa escolheu.
 * Passando uma, o pop-up ganha a alca do canto inferior direito e passa
 * a lembrar a largura e a altura entre as aberturas. Serve para pop-up
 * onde se MORA — o chat, que fica aberto ao lado do trabalho —, e nao
 * para formulario, que se abre, preenche e fecha: lembrar o tamanho de
 * um formulario so criaria um pop-up fora de forma sem ninguem entender
 * por que.
 */

/* os limites do arrasto. O minimo e o ponto em que o cabecalho ainda
   cabe em uma linha; o maximo deixa a moldura aparecendo, senao o
   pop-up vira a tela inteira e ninguem acha o lado de fora para fechar */
const MIN_L = 360
const MIN_A = 320
const folgaL = () => Math.max(MIN_L, window.innerWidth - 40)
const folgaA = () => Math.max(MIN_A, window.innerHeight - 40)

/* os pop-ups abertos, do de baixo para o de cima. O Esc fecha so o de
   CIMA: com um pop-up aberto por cima de outro (o catalogo de ensaios
   sobre o planejamento), um Esc fechava os dois de uma vez */
const abertos = []

function lerTamanho(chave) {
  if (!chave) return null
  try {
    const cru = JSON.parse(localStorage.getItem(chave) ?? 'null')
    if (!cru || typeof cru.l !== 'number' || typeof cru.a !== 'number') return null
    return cru
  } catch {
    return null
  }
}

export default function Modal({
  aberto,
  aoFechar,
  titulo,
  subtitulo,
  largura = 520,
  nivel = 0,
  ajustavel = null,
  children,
}) {
  const caixa = useRef(null)

  /* null = ninguem mexeu ainda; vale a largura que o componente pediu */
  const [tamanho, setTamanho] = useState(() => lerTamanho(ajustavel))

  /* o arrasto da alca mexe no elemento DIRETO, e so grava no fim.
     Passando por estado a cada pixel, a conversa inteira re-renderizava
     no meio do arrasto e a alca engasgava. */
  const puxar = useCallback(
    (evento) => {
      if (!ajustavel) return
      evento.preventDefault()
      const alvo = caixa.current
      if (!alvo) return

      const caixaAgora = alvo.getBoundingClientRect()
      const x0 = evento.clientX
      const y0 = evento.clientY
      /* o pop-up e centralizado: crescer 1px de um lado cresce 1px do
         outro, entao o ponteiro anda METADE do que a caixa cresce */
      const l0 = caixaAgora.width
      const a0 = caixaAgora.height
      let ultimo = { l: l0, a: a0 }

      const mover = (e) => {
        ultimo = {
          l: Math.round(Math.min(folgaL(), Math.max(MIN_L, l0 + (e.clientX - x0) * 2))),
          a: Math.round(Math.min(folgaA(), Math.max(MIN_A, a0 + (e.clientY - y0) * 2))),
        }
        alvo.style.width = ultimo.l + 'px'
        alvo.style.maxWidth = ultimo.l + 'px'
        alvo.style.height = ultimo.a + 'px'
        alvo.style.maxHeight = ultimo.a + 'px'
      }

      const soltar = () => {
        window.removeEventListener('pointermove', mover)
        window.removeEventListener('pointerup', soltar)
        document.body.style.userSelect = ''
        setTamanho(ultimo)
        try {
          localStorage.setItem(ajustavel, JSON.stringify(ultimo))
        } catch {
          /* sem storage o tamanho vale so ate fechar */
        }
      }

      /* sem isto o arrasto vai selecionando o texto da conversa por baixo */
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', mover)
      window.addEventListener('pointerup', soltar)
    },
    [ajustavel],
  )

  /* aoFechar quase sempre chega como funcao nova a cada render do pai
     (`() => setAberto(false)`). Guardada na ref, ela nao entra nas
     dependencias do efeito abaixo — se entrasse, o efeito rodaria a
     cada tecla digitada e o foco voltaria para a caixa, tirando o
     cursor do campo depois de UMA letra. */
  const fechar = useRef(aoFechar)
  useEffect(() => {
    fechar.current = aoFechar
  }, [aoFechar])

  useEffect(() => {
    if (!aberto) return undefined

    const eu = {}
    abertos.push(eu)

    const aoTeclar = (evento) => {
      if (evento.key === 'Escape' && abertos[abertos.length - 1] === eu) fechar.current?.()
    }

    const rolagem = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', aoTeclar)

    /* leva o foco para o dialogo uma vez, na abertura: dai o leitor de
       tela anuncia o titulo e o Tab anda dentro do formulario */
    caixa.current?.focus()

    return () => {
      document.body.style.overflow = rolagem
      document.removeEventListener('keydown', aoTeclar)
      const i = abertos.indexOf(eu)
      if (i >= 0) abertos.splice(i, 1)
    }
  }, [aberto])

  if (!aberto) return null

  return createPortal(
    <div
      className="modal"
      style={nivel > 0 ? { zIndex: 90 + nivel * 10 } : undefined}
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar?.()}
    >
      <div
        className={`modal__caixa ${tamanho ? 'is-ajustado' : ''}`.trim()}
        style={
          tamanho
            ? {
                width: tamanho.l,
                maxWidth: tamanho.l,
                height: tamanho.a,
                maxHeight: tamanho.a,
              }
            : { maxWidth: largura }
        }
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        ref={caixa}
      >
        <header className="modal__topo">
          <div>
            <h2 className="modal__titulo">{titulo}</h2>
            {subtitulo && <p className="modal__sub">{subtitulo}</p>}
          </div>
          <button type="button" className="modal__x" onClick={aoFechar} aria-label="Fechar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="modal__corpo">{children}</div>

        {/* a alca. `title` e o unico lugar que conta do duplo clique —
            um canto arrastavel nao tem como anunciar sozinho que
            tambem desfaz */}
        {ajustavel && (
          <span
            className="modal__alca"
            onPointerDown={puxar}
            onDoubleClick={() => {
              setTamanho(null)
              try {
                localStorage.removeItem(ajustavel)
              } catch {
                /* sem storage nao ha o que limpar */
              }
            }}
            role="separator"
            aria-label="Arraste para redimensionar; clique duas vezes para voltar ao tamanho padrão"
            title="Arraste para redimensionar — dois cliques voltam ao padrão"
          />
        )}
      </div>
    </div>,
    document.body,
  )
}
