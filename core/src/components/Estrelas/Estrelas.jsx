/**
 * Nota de 0 a 5 desenhada como cinco estrelas — cada uma vale 1 ponto.
 *
 * A estrela parcial e um gradiente com os dois pontos na MESMA posicao: ate
 * ali pinta, dali em diante e transparente. Sai um corte reto, sem meia
 * estrela desenhada a mao e sem imagem.
 *
 * Vive em components/ porque tres telas usam: Avaliacoes, Clientes e a
 * rastreabilidade da obra fechada. Antes morava dentro da pagina de
 * Avaliacoes, e quem quisesse a estrelinha tinha que importar a pagina
 * inteira — modal, formulario e tudo.
 *
 * ---- Com `aoEscolher`, ela vira CAMPO ----
 *
 * As estrelas passam a ser botoes: clicar na terceira da nota 3. Nao ha
 * mais caixa de numero para digitar — a nota e uma escala de cinco
 * degraus, e escolher um degrau clicando nele e mais rapido e nao deixa
 * digitar 7 numa escala que vai ate 5.
 *
 * Clicar de novo na estrela que ja e a nota ZERA: e o unico jeito de
 * desfazer uma nota dada por engano sem um botao a mais so para isso.
 */
export default function Estrelas({ nota, tamanho = 15, aoEscolher, rotulo }) {
  const valor = Number(nota) || 0
  const editavel = typeof aoEscolher === 'function'

  const desenho = (i) => {
    const parte = Math.round(Math.max(0, Math.min(1, valor - i)) * 100)
    const id = `est${i}-${parte}`
    return (
      <svg viewBox="0 0 24 24" width={tamanho} height={tamanho}>
        <defs>
          <linearGradient id={id}>
            <stop offset={`${parte}%`} stopColor="var(--pri-media)" />
            <stop offset={`${parte}%`} stopColor="transparent" />
          </linearGradient>
        </defs>
        <path
          d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.99 6.75 19.75l1-5.85L3.5 9.75l5.9-.85z"
          fill={`url(#${id})`}
          stroke="var(--pri-media)"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (!editavel) {
    return (
      <span className="estrelas" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i}>{desenho(i)}</span>
        ))}
      </span>
    )
  }

  return (
    <span className="estrelas estrelas--campo" role="radiogroup" aria-label={rotulo ?? 'Nota'}>
      {[0, 1, 2, 3, 4].map((i) => (
        <button
          key={i}
          type="button"
          className="estrelas__btn"
          role="radio"
          aria-checked={valor === i + 1}
          aria-label={`${i + 1} de 5`}
          title={`${i + 1} de 5`}
          onClick={() => aoEscolher(valor === i + 1 ? 0 : i + 1)}
        >
          {desenho(i)}
        </button>
      ))}
    </span>
  )
}
