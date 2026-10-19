/* Os icones de Frotas, no mesmo traco dos do menu. */

/**
 * O "!" que pisca no lugar de uma informacao que falta no cadastro do
 * veiculo (os carros que vieram da planilha antiga nao tinham placa,
 * ano nem cor). `oque` vai no title e no leitor de tela: "Falta a placa".
 */
export const Falta = ({ oque }) => (
  <span className="falta" title={`Falta ${oque}`} role="img" aria-label={`Falta ${oque}`}>
    !
  </span>
)

const traco = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const IconeCarro = ({ tamanho = 22 }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} {...traco}>
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
    <circle cx="7" cy="17" r="2" />
    <path d="M9 17h6" />
    <circle cx="17" cy="17" r="2" />
  </svg>
)

/* a seta saindo da garagem */
export const IconeSaida = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" {...traco}>
    <path d="M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10" />
    <path d="M13 8l4 4-4 4M17 12H9" />
  </svg>
)

/* a seta voltando para a garagem */
export const IconeDevolucao = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" {...traco}>
    <path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14" />
    <path d="M9 8l-4 4 4 4M5 12h9" />
  </svg>
)

export const IconeLista = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...traco}>
    <path d="M9 6.5h10M9 12h10M9 17.5h10" />
    <circle cx="5" cy="6.5" r="0.9" />
    <circle cx="5" cy="12" r="0.9" />
    <circle cx="5" cy="17.5" r="0.9" />
  </svg>
)

export const IconeMais = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconeEditar = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco}>
    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
)

export const IconeVoltar = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...traco}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

export const IconeAlerta = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...traco} strokeWidth="2">
    <path d="M12 4 2.8 19.5h18.4z" />
    <path d="M12 10v4.2M12 16.9v.1" />
  </svg>
)

export const IconeSeta = ({ aberto }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    {...traco}
    style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)
