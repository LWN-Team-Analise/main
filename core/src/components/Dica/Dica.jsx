import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './Dica.css'

/**
 * Dica que aparece ao passar o mouse (ou ao focar pelo teclado).
 *
 * A bolha vai para o <body>, e nao para dentro do elemento: os cards que
 * usam isto tem `overflow: hidden` (cantos arredondados, gradiente), e
 * uma bolha de dentro deles sairia cortada justamente onde ela importa.
 * Ela abre ACIMA do elemento; sem espaco em cima, abre embaixo.
 *
 *   <Dica as="article" texto={card.informacoes} className="setorcard">...</Dica>
 *
 * Sem `texto`, e so o elemento — nada de bolha vazia.
 *
 * Dica DENTRO de dica (o check com informacoes, dentro do card com
 * informacoes): so a de dentro aparece enquanto o mouse esta nela, e a
 * de fora volta quando ele sai. Duas bolhas ao mesmo tempo se cobriam.
 */

/* as dicas abertas, da de fora para a de dentro: so a do topo aparece */
const pilha = []

export default function Dica({ as: Elemento = 'div', texto, titulo, children, ...resto }) {
  const alvo = useRef(null)
  const bolha = useRef(null)
  const [aberta, setAberta] = useState(false)
  const [escondida, setEscondida] = useState(false)
  const [lugar, setLugar] = useState(null)
  const eu = useRef({ esconder: setEscondida })

  const temDica = Boolean(String(texto ?? '').trim())

  const sair = useCallback(() => {
    const i = pilha.indexOf(eu.current)
    if (i < 0) return
    const eraTopo = i === pilha.length - 1
    pilha.splice(i, 1)
    if (eraTopo) pilha[pilha.length - 1]?.esconder(false)
  }, [])

  const abrir = useCallback(() => {
    if (!temDica || pilha.includes(eu.current)) return
    pilha[pilha.length - 1]?.esconder(true)
    pilha.push(eu.current)
    setEscondida(false)
    setAberta(true)
  }, [temDica])

  const fechar = useCallback(() => {
    sair()
    setAberta(false)
    setEscondida(false)
    setLugar(null)
  }, [sair])

  /* saiu da tela aberta (o card foi refeito): nao fica preso na pilha */
  useEffect(() => sair, [sair])

  /* posiciona depois de a bolha existir, para saber a altura dela */
  useLayoutEffect(() => {
    if (!aberta || !alvo.current || !bolha.current) return
    const caixa = alvo.current.getBoundingClientRect()
    const b = bolha.current.getBoundingClientRect()
    const margem = 8
    const cabeEmCima = caixa.top - b.height - margem > 8
    const left = Math.min(
      Math.max(8, caixa.left + caixa.width / 2 - b.width / 2),
      window.innerWidth - b.width - 8,
    )
    setLugar({
      top: cabeEmCima ? caixa.top - b.height - margem : caixa.bottom + margem,
      left,
      lado: cabeEmCima ? 'cima' : 'baixo',
    })
  }, [aberta, escondida])

  return (
    <>
      <Elemento
        ref={alvo}
        onMouseEnter={abrir}
        onMouseLeave={fechar}
        onFocus={abrir}
        onBlur={fechar}
        {...resto}
      >
        {children}
      </Elemento>

      {aberta &&
        !escondida &&
        createPortal(
          <div
            ref={bolha}
            className="dica"
            role="tooltip"
            data-lado={lugar?.lado}
            style={
              lugar
                ? { top: lugar.top, left: lugar.left }
                : /* primeira pintura: fora da tela, so para medir */
                  { top: -9999, left: -9999 }
            }
          >
            {titulo && <strong className="dica__titulo">{titulo}</strong>}
            <span className="dica__texto">{texto}</span>
          </div>,
          document.body,
        )}
    </>
  )
}
