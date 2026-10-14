import { createContext, useContext, useMemo, useState } from 'react'
import './CutoutCard.css'

/**
 * Cartao com quinas recortadas.
 *
 * A ideia e uma so: a tarja e o selo nao ficam POR CIMA da foto, eles
 * sao um pedaco vazado dela. O que faz isso funcionar sao as pecinhas
 * de canto — quadradinhos pintados com a cor do cartao, com uma curva
 * concava de um lado. Encostadas na tarja, elas emendam a borda dela
 * com a borda da foto, e o vazio ganha a mesma curva do resto.
 *
 * As partes se montam soltas, cada uma no seu lugar:
 *
 *   <CutoutCard>
 *     <CutoutCardMedia>
 *       <CutoutCardImage src=... />
 *       <CutoutCardInsetLabel>Destaque</CutoutCardInsetLabel>
 *       <CutoutCardPin>Novo</CutoutCardPin>
 *       <CutoutCardAction>botao que aparece no hover</CutoutCardAction>
 *     </CutoutCardMedia>
 *     <CutoutCardContent> ... </CutoutCardContent>
 *     <CutoutCardFooter> ... </CutoutCardFooter>
 *   </CutoutCard>
 */

/* A curva concava. O desenho enche o canto INFERIOR DIREITO do
   quadrado e deixa o resto vazado — e por isso que ele emenda duas
   bordas em vez de so arredondar uma. */
const CANTO = 'M0 200C155.996 199.961 200.029 156.308 200 0V200H0Z'

const Contexto = createContext(null)

export function useCutoutCard() {
  return useContext(Contexto) ?? { sobre: false }
}

/** Peca de canto. `posicao` diz de que lado da tarja ela encosta. */
export function CutoutCorner({ posicao = 'direita', tamanho = 22 }) {
  return (
    <svg
      className={`corte__canto corte__canto--${posicao}`}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <path d={CANTO} fill="currentColor" />
    </svg>
  )
}

export function CutoutCard({ children, className = '', destaque = false, ...resto }) {
  const [sobre, setSobre] = useState(false)
  const valor = useMemo(() => ({ sobre }), [sobre])

  return (
    <Contexto.Provider value={valor}>
      <div
        className={`corte ${destaque ? 'is-destaque' : ''} ${className}`.trim()}
        data-estado={sobre ? 'sobre' : 'parado'}
        onMouseEnter={() => setSobre(true)}
        onMouseLeave={() => setSobre(false)}
        {...resto}
      >
        {children}
      </div>
    </Contexto.Provider>
  )
}

export function CutoutCardMedia({ children, className = '', altura, ...resto }) {
  return (
    <div
      className={`corte__media ${className}`.trim()}
      style={altura ? { '--media-h': `${altura}px` } : undefined}
      {...resto}
    >
      {children}
    </div>
  )
}

/**
 * A foto do cartao.
 *
 * Sem `src`, entra o bloco de iniciais na cor que vier em `cor` — e o
 * caso do cliente que ainda nao tem logo: melhor um bloco com a letra
 * dele do que um retangulo cinza vazio.
 */
export function CutoutCardImage({ src, alt = '', iniciais, cor, className = '' }) {
  if (!src) {
    return (
      <div
        className={`corte__inicial ${className}`.trim()}
        style={{ '--cor-media': cor ?? 'var(--accent)' }}
        aria-hidden={!alt}
      >
        <span>{iniciais}</span>
      </div>
    )
  }

  return <img className={`corte__img ${className}`.trim()} src={src} alt={alt} loading="lazy" />
}

export function CutoutCardOverlay({ className = '' }) {
  return <span className={`corte__vidro ${className}`.trim()} aria-hidden="true" />
}

/** Tarja vazada no canto de baixo, a esquerda. */
export function CutoutCardInsetLabel({ children, className = '', ...resto }) {
  return (
    <div className={`corte__faixa ${className}`.trim()} {...resto}>
      <CutoutCorner posicao="acima" />
      <CutoutCorner posicao="direita" />
      <span className="corte__faixa-texto">{children}</span>
    </div>
  )
}

/** Selo vazado no canto de cima, a direita. */
export function CutoutCardPin({ children, className = '', ...resto }) {
  return (
    <div className={`corte__pino ${className}`.trim()} {...resto}>
      <CutoutCorner posicao="abaixo" />
      <CutoutCorner posicao="esquerda" />
      <span className="corte__pino-texto">{children}</span>
    </div>
  )
}

/** Aparece quando o ponteiro entra no cartao. */
export function CutoutCardAction({ children, className = '', sempre = false, ...resto }) {
  const { sobre } = useCutoutCard()
  const visivel = sempre || sobre

  return (
    <div
      className={`corte__acao ${visivel ? 'is-visivel' : ''} ${className}`.trim()}
      aria-hidden={!visivel}
      {...resto}
    >
      {children}
    </div>
  )
}

export function CutoutCardContent({ children, className = '', ...resto }) {
  return (
    <div className={`corte__conteudo ${className}`.trim()} {...resto}>
      {children}
    </div>
  )
}

export function CutoutCardFooter({ children, className = '', ...resto }) {
  return (
    <div className={`corte__base ${className}`.trim()} {...resto}>
      {children}
    </div>
  )
}

export default CutoutCard
