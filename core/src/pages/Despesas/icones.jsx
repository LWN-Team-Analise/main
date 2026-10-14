/* Os desenhos da aba Despesas — o mesmo traco dos icones do menu. */

const traco = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

/** Recibo: a despesa com comprovante. */
export const IconeDespesa = ({ tamanho = 24 }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} {...traco}>
    <path d="M6 3.5h12v17l-2.4-1.5-2.4 1.5-2.4-1.5-2.4 1.5L6 20.5z" />
    <path d="M9 8h6M9 11.5h6M9 15h3.5" />
  </svg>
)

/** Garfo e faca: a refeicao. */
export const IconeRefeicao = ({ tamanho = 24 }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} {...traco}>
    <path d="M7 3.5v6.2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3.5M9 3.5v17" />
    <path d="M17 20.5V3.5c-2 1-3.2 3.3-3.2 6.2V13H17" />
  </svg>
)

/** Presente: o bonus. */
export const IconeBonus = ({ tamanho = 24 }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} {...traco}>
    <rect x="3.5" y="8" width="17" height="4" rx="1" />
    <path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12M12 8v12.5" />
    <path d="M12 8C10.5 4.5 7 4.3 7 6.3 7 7.6 9 8 12 8zM12 8c1.5-3.5 5-3.7 5-1.7C17 7.6 15 8 12 8z" />
  </svg>
)

const POR_CATEGORIA = {
  despesa: IconeDespesa,
  refeicao: IconeRefeicao,
  bonus: IconeBonus,
}

export function IconeCategoria({ categoria, tamanho }) {
  const Icone = POR_CATEGORIA[categoria] ?? IconeDespesa
  return <Icone tamanho={tamanho} />
}

/** Lista: "Meus envios". */
export const IconeLista = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} strokeWidth="1.9">
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.6" />
  </svg>
)

/** Pessoas: "Envios gerais". */
export const IconeEquipe = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} strokeWidth="1.9">
    <circle cx="9" cy="8" r="3.3" />
    <path d="M2.8 19.5a6.4 6.4 0 0 1 12.4 0" />
    <path d="M16.2 5.2a3.3 3.3 0 0 1 0 6.1M17.6 14.4a6.4 6.4 0 0 1 3.6 5.1" />
  </svg>
)

export const IconeVoltar = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} strokeWidth="1.9">
    <path d="M15 5.5 8.5 12l6.5 6.5" />
  </svg>
)

export const IconeSeta = ({ lado = 'esquerda' }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} strokeWidth="2">
    <path d={lado === 'esquerda' ? 'M14.5 6 8.5 12l6 6' : 'M9.5 6l6 6-6 6'} />
  </svg>
)

export const IconeBaixar = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...traco} strokeWidth="1.8">
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
  </svg>
)

/** Planilha: "Exportar para o Excel". */
export const IconePlanilha = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} strokeWidth="1.8">
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="M3.5 9.5h17M3.5 14.8h17M9.5 9.5V20" />
  </svg>
)

/** Lixeira: excluir um lancamento. */
export const IconeLixo = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...traco} strokeWidth="1.8">
    <path d="M4.5 7h15M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </svg>
)
