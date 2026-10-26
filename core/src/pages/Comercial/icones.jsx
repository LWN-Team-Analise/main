/* Os icones da aba Comercial — no desenho dos da barra do Pipedrive,
   que e o que a equipe ja conhece. Traco fino, cor do texto. */

const traco = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const svg = (tamanho, filhos, extra = {}) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true" {...traco} {...extra}>
    {filhos}
  </svg>
)

/* o funil do Pipedrive: tres colunas de alturas diferentes */
export const IconeFunil = ({ tamanho = 18 }) =>
  svg(
    tamanho,
    <>
      <rect x="4" y="4" width="4.5" height="16" rx="1" />
      <rect x="10" y="4" width="4.5" height="11" rx="1" />
      <rect x="16" y="4" width="4" height="7" rx="1" />
    </>,
  )

export const IconeLista = ({ tamanho = 18 }) => svg(tamanho, <path d="M5 7h14M5 12h14M5 17h14" />)

export const IconePrevisao = ({ tamanho = 18 }) =>
  svg(
    tamanho,
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4.5V9h-4.5" />
      <path d="M13.8 9.6c-.4-.6-1.1-.9-1.9-.9-1.2 0-2 .6-2 1.5 0 2.1 4.2 1 4.2 3.3 0 .9-.9 1.6-2.2 1.6-.9 0-1.7-.4-2.1-1M12 7.5v1.2M12 15.1v1.3" />
    </>,
  )

export const IconeArquivo = ({ tamanho = 18 }) =>
  svg(
    tamanho,
    <>
      <rect x="3.5" y="4.5" width="17" height="4" rx="1" />
      <path d="M5 8.5V18a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18V8.5M10 12h4" />
    </>,
  )

export const IconeMais = ({ tamanho = 16 }) => svg(tamanho, <path d="M12 5v14M5 12h14" />, { strokeWidth: 2.2 })

export const IconeCaret = ({ tamanho = 14 }) =>
  svg(tamanho, <path d="m6 9 6 6 6-6" fill="currentColor" stroke="none" />, { strokeWidth: 0 })

export const IconeInfo = ({ tamanho = 18 }) =>
  svg(
    tamanho,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.2" />
    </>,
  )

export const IconeFiltro = ({ tamanho = 16 }) => svg(tamanho, <path d="M4 7h16M7 12h10M10 17h4" />, { strokeWidth: 2 })

export const IconeReticencias = ({ tamanho = 18 }) =>
  svg(
    tamanho,
    <>
      <circle cx="6" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="18" cy="12" r="1.3" fill="currentColor" />
    </>,
  )

export const IconePino = ({ tamanho = 15 }) =>
  svg(tamanho, <path d="M9 4h6M10 4v6l-3 4h10l-3-4V4M12 14v6" />)

export const IconeSetaCima = ({ tamanho = 16 }) => svg(tamanho, <path d="M12 19V5M6 11l6-6 6 6" />, { strokeWidth: 2 })

export const IconeLapis = ({ tamanho = 16 }) => svg(tamanho, <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />)

export const IconePessoa = ({ tamanho = 14 }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true" fill="currentColor">
    <circle cx="12" cy="8" r="4.2" />
    <path d="M3.8 20.5c.6-4.2 4-6.5 8.2-6.5s7.6 2.3 8.2 6.5z" />
  </svg>
)

export const IconeEmail = ({ tamanho = 15 }) =>
  svg(
    tamanho,
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.6" />
      <path d="m4 7 8 6 8-6" />
    </>,
  )

export const IconeLixo = ({ tamanho = 16 }) =>
  svg(
    tamanho,
    <path d="M4.5 7h15M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />,
  )

/* a obra: o predio com a porta — o negocio que ja virou obra */
export const IconeObra = ({ tamanho = 16 }) =>
  svg(tamanho, <path d="M4 20V9l8-5 8 5v11M4 20h16M10 20v-5h4v5M8 11h.01M16 11h.01" />)

export const IconeImportar = ({ tamanho = 16 }) =>
  svg(tamanho, <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />)

export const IconeExportar = ({ tamanho = 16 }) =>
  svg(tamanho, <path d="M12 15V4m0 0 4 4m-4-4L8 8M5 19h14" />)

export const IconeTrofeu = ({ tamanho = 16 }) =>
  svg(tamanho, <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6" />)

/* ---------------- a situacao da proxima atividade ---------------- */

/** O triangulo amarelo: nenhuma atividade marcada. */
export const IconeSemAtividade = ({ tamanho = 20 }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true">
    <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" fill="#f5c518" />
    <path d="M12 9v5M12 17.2v.3" stroke="#1d1d1d" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

/** O circulo com a seta: vermelho (atrasada), verde (hoje) ou cinza (futura). */
export const IconeAtividade = ({ situacao, tamanho = 20 }) => {
  const cor = { atrasada: '#e5484d', hoje: '#2f9e5c', futura: 'var(--com-atividade-futura)' }[situacao]
  const seta = situacao === 'atrasada' ? 'm13.5 8-4 4 4 4' : 'm10.5 8 4 4-4 4'
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true">
      <circle cx="12" cy="12" r="10" style={{ fill: cor }} />
      <path d={seta} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
