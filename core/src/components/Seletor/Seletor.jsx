import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './Seletor.css'

/* ============================================================
   Lista de escolha propria, no lugar do <select> do navegador.

   O <select> nativo nao aceita estilo na lista aberta: ela sai
   quadrada, com a fonte do sistema, e ignora o vidro do resto do
   site. Aqui a lista e nossa — vidro, cantos arredondados, cor do
   cargo na bolinha e navegacao pelo teclado igual a do nativo.
   ============================================================ */

const Seta = () => (
  <svg
    className="sel__seta"
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const Confere = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
)

/**
 * Fecha ao clicar fora e no Esc, e calcula onde a lista aberta cabe.
 *
 * A lista vai num portal com position: fixed em vez de ficar dentro do
 * .sel. Motivo: dentro de um pop-up o corpo rola (overflow-y: auto), e
 * um filho absoluto seria cortado na borda dele — a lista de estados
 * aparecia pela metade. Fixa e fora da arvore, ela nunca e cortada.
 *
 * Quando nao cabe embaixo do botao, abre para cima.
 */
function useListaFlutuante(aberto, fechar) {
  const caixa = useRef(null)
  const [posicao, setPosicao] = useState(null)

  const [emPopup, setEmPopup] = useState(false)

  const medir = useCallback(() => {
    const botao = caixa.current?.querySelector('.sel__botao')
    if (!botao) return
    // pop-up nao leva vidro; como a lista sai da arvore, ela precisa
    // saber sozinha que nasceu dentro de um
    setEmPopup(Boolean(botao.closest('.modal__caixa')))
    const r = botao.getBoundingClientRect()
    const folgaAbaixo = window.innerHeight - r.bottom
    const paraCima = folgaAbaixo < 220 && r.top > folgaAbaixo

    setPosicao({
      left: r.left,
      width: r.width,
      ...(paraCima
        ? { bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(264, r.top - 16) }
        : { top: r.bottom + 6, maxHeight: Math.min(264, folgaAbaixo - 16) }),
    })
  }, [])

  useLayoutEffect(() => {
    if (!aberto) {
      setPosicao(null)
      return undefined
    }
    medir()

    const fora = (e) => {
      // o clique na lista nao fecha: ela vive fora do .sel, no portal
      if (caixa.current?.contains(e.target)) return
      if (e.target.closest?.('.sel__lista')) return
      fechar()
    }
    const tecla = (e) => {
      if (e.key === 'Escape') fechar()
    }

    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    // rolar ou redimensionar move o botao: a lista acompanha
    window.addEventListener('scroll', medir, true)
    window.addEventListener('resize', medir)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', medir, true)
      window.removeEventListener('resize', medir)
    }
  }, [aberto, fechar, medir])

  return { caixa, posicao, emPopup }
}

/** A lista aberta, sempre no <body> para nao ser cortada por nada. */
function Lista({ posicao, emPopup, children, ...rest }) {
  if (!posicao) return null
  return createPortal(
    <ul
      className={`sel__lista ${emPopup ? 'is-solida' : ''}`.trim()}
      style={posicao}
      {...rest}
    >
      {children}
    </ul>,
    document.body,
  )
}

/**
 * Escolha de um item so.
 *
 * opcoes: [{ valor, rotulo, cor? }] — com `cor`, a opcao ganha a
 * bolinha do cargo/prioridade a esquerda.
 */
export default function Seletor({
  valor,
  aoMudar,
  opcoes = [],
  vazio = 'Selecione...',
  desabilitado = false,
  largo = false,
  id: idFora,
  'aria-label': rotuloAria,
}) {
  const idAuto = useId()
  const id = idFora ?? idAuto
  const [aberto, setAberto] = useState(false)
  const fechar = useCallback(() => setAberto(false), [])
  const { caixa, posicao, emPopup } = useListaFlutuante(aberto, fechar)

  const escolhida = opcoes.find((o) => String(o.valor) === String(valor)) ?? null

  const escolher = (opcao) => {
    aoMudar?.(opcao.valor)
    setAberto(false)
  }

  /* setas andam na lista mesmo com ela fechada, como no <select> */
  const aoTeclar = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!aberto) {
        setAberto(true)
        return
      }
      const i = opcoes.findIndex((o) => String(o.valor) === String(valor))
      const proximo = e.key === 'ArrowDown' ? i + 1 : i - 1
      if (opcoes[proximo]) aoMudar?.(opcoes[proximo].valor)
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setAberto((v) => !v)
    }
  }

  return (
    <div className={`sel ${largo ? 'sel--largo' : ''}`.trim()} ref={caixa}>
      <button
        type="button"
        id={id}
        className={`sel__botao ${aberto ? 'is-aberto' : ''} ${escolhida ? '' : 'is-vazio'}`.trim()}
        onClick={() => setAberto((v) => !v)}
        onKeyDown={aoTeclar}
        disabled={desabilitado}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={rotuloAria}
      >
        {escolhida?.cor && (
          <span className="sel__bolha" style={{ background: escolhida.cor }} aria-hidden="true" />
        )}
        <span className="sel__valor">{escolhida?.rotulo ?? vazio}</span>
        <Seta />
      </button>

      {aberto && (
        <Lista posicao={posicao} emPopup={emPopup} role="listbox" aria-labelledby={id}>
          {opcoes.length === 0 && <li className="sel__nada">Nada para escolher</li>}
          {opcoes.map((o) => {
            const atual = String(o.valor) === String(valor)
            return (
              <li key={o.valor}>
                <button
                  type="button"
                  role="option"
                  aria-selected={atual}
                  className={`sel__item ${atual ? 'is-atual' : ''}`.trim()}
                  onClick={() => escolher(o)}
                >
                  {o.cor && (
                    <span className="sel__bolha" style={{ background: o.cor }} aria-hidden="true" />
                  )}
                  <span className="sel__rotulo">{o.rotulo}</span>
                  {atual && <Confere />}
                </button>
              </li>
            )
          })}
        </Lista>
      )}
    </div>
  )
}

/**
 * Escolha de varios itens. Mostra as escolhas como pastilhas no botao e
 * marca com um confere na lista.
 *
 * `aoMudar` recebe a lista nova inteira — quem chama nao precisa saber
 * se entrou ou saiu.
 */
export function SeletorMulti({
  valores = [],
  aoMudar,
  opcoes = [],
  vazio = 'Selecione...',
  largo = false,
  desabilitado = false,
  'aria-label': rotuloAria,
}) {
  const id = useId()
  const [aberto, setAberto] = useState(false)
  const fechar = useCallback(() => setAberto(false), [])
  const { caixa, posicao, emPopup } = useListaFlutuante(aberto, fechar)

  const marcados = useMemo(() => valores.map(String), [valores])

  const alternar = (opcao) => {
    const chave = String(opcao.valor)
    aoMudar?.(
      marcados.includes(chave)
        ? valores.filter((v) => String(v) !== chave)
        : [...valores, opcao.valor],
    )
  }

  const escolhidas = opcoes.filter((o) => marcados.includes(String(o.valor)))

  return (
    <div className={`sel ${largo ? 'sel--largo' : ''}`.trim()} ref={caixa}>
      <button
        type="button"
        id={id}
        className={`sel__botao ${aberto ? 'is-aberto' : ''} ${
          escolhidas.length ? '' : 'is-vazio'
        }`.trim()}
        onClick={() => setAberto((v) => !v)}
        disabled={desabilitado}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={rotuloAria}
      >
        {escolhidas.length === 0 ? (
          <span className="sel__valor">{vazio}</span>
        ) : (
          <span className="sel__pastilhas">
            {escolhidas.map((o) => (
              <span
                key={o.valor}
                className="sel__pastilha"
                style={o.cor ? { '--pastilha-cor': o.cor } : undefined}
              >
                {o.rotulo}
              </span>
            ))}
          </span>
        )}
        <Seta />
      </button>

      {aberto && (
        <Lista posicao={posicao} emPopup={emPopup} role="listbox" aria-multiselectable="true" aria-labelledby={id}>
          {opcoes.length === 0 && <li className="sel__nada">Nada para escolher</li>}
          {opcoes.map((o) => {
            const marcado = marcados.includes(String(o.valor))
            return (
              <li key={o.valor}>
                <button
                  type="button"
                  role="option"
                  aria-selected={marcado}
                  className={`sel__item ${marcado ? 'is-atual' : ''}`.trim()}
                  onClick={() => alternar(o)}
                >
                  <span className={`sel__caixa ${marcado ? 'is-marcada' : ''}`.trim()} aria-hidden="true">
                    {marcado && <Confere />}
                  </span>
                  {o.cor && (
                    <span className="sel__bolha" style={{ background: o.cor }} aria-hidden="true" />
                  )}
                  <span className="sel__rotulo">{o.rotulo}</span>
                </button>
              </li>
            )
          })}
        </Lista>
      )}
    </div>
  )
}
