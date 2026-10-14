import './IconeClima.css'

/**
 * Os desenhos do tempo.
 *
 * Um conjunto so, com as nove familias que `familiaDoTempo` devolve.
 * Sao desenhos e nao imagens pelo mesmo motivo de sempre por aqui:
 * acompanham o tema, escalam sem borrar e nao custam requisicao.
 *
 * As cores nao sao arbitrarias — elas dizem o que a figura diz:
 * amarelo para sol, cinza para nuvem, azul para agua, roxo para raio.
 * Um icone monocromatico obrigaria a ler a forma para saber se chove.
 *
 * O que se move, se move DEVAGAR: os raios do sol giram em 24s e a
 * chuva escorre em 1,4s. E enfeite de canto de tela, nao animacao de
 * carregamento — e para quem pediu menos movimento no sistema, tudo
 * para inteiro (ver o CSS).
 */

const Sol = ({ pequeno = false }) => (
  <g className="clima__sol">
    {!pequeno && (
      <g className="clima__raios">
        {Array.from({ length: 8 }, (_, i) => (
          <rect
            key={i}
            x="30.4"
            y="2.5"
            width="3.2"
            height="8"
            rx="1.6"
            fill="var(--clima-sol)"
            opacity={0.45 + (i % 3) * 0.2}
            transform={`rotate(${i * 45} 32 32)`}
          />
        ))}
      </g>
    )}
    <circle
      cx={pequoAjuste(pequeno).cx}
      cy={pequoAjuste(pequeno).cy}
      r={pequoAjuste(pequeno).r}
      fill="url(#clima-sol)"
    />
  </g>
)

/* o sol atras da nuvem sai do centro e encolhe: senao a nuvem cobriria
   ele inteiro e o icone viraria o de "encoberto" */
const pequoAjuste = (pequeno) =>
  pequeno ? { cx: 24, cy: 22, r: 9.5 } : { cx: 32, cy: 32, r: 13 }

const Lua = ({ pequeno = false }) => (
  <path
    d={
      pequeno
        ? 'M30 13a10 10 0 1 1-11.5 13.6A11.5 11.5 0 0 0 30 13z'
        : 'M41 16a15 15 0 1 1-17.5 20.8A17 17 0 0 0 41 16z'
    }
    fill="url(#clima-lua)"
  />
)

const Nuvem = ({ y = 0, tom = 'var(--clima-nuvem)' }) => (
  <path
    transform={`translate(0 ${y})`}
    d="M20 46a9 9 0 0 1 .6-17.9 13 13 0 0 1 24.6 3.1A8 8 0 0 1 44 46z"
    fill={tom}
  />
)

/**
 * O ritmo da chuva.
 *
 * O atraso de cada gota e NEGATIVO e distribuido pelo ciclo inteiro:
 * `-i/n` de uma volta. Duas coisas saem de graca disso.
 *
 * Primeiro, cada gota ja nasce no meio da propria animacao — o icone
 * aparece chovendo, e nao com a chuva parada esperando o primeiro
 * ciclo. Segundo, e mais importante: as gotas ficam SEMPRE espalhadas
 * pelo ciclo, entao ha sempre alguma no ar.
 *
 * Com atraso positivo pequeno (0,18s entre elas), as tres caiam quase
 * juntas e passavam boa parte do tempo invisiveis ao mesmo tempo — o
 * icone de garoa virava um icone de nuvem por meio segundo a cada
 * volta, e quem batesse o olho na hora errada leria "encoberto".
 */
const ritmo = (i, n, duracao) => ({
  animationDuration: `${duracao}s`,
  animationDelay: `${-(i / n) * duracao}s`,
})

/** As gotas que escorrem. `n` e quantas, `forte` engrossa e acelera. */
const Gotas = ({ n = 3, forte = false }) => {
  const duracao = forte ? 1 : 1.4
  return (
    <g className="clima__gotas">
      {Array.from({ length: n }, (_, i) => (
        <line
          key={i}
          x1={23 + i * 9}
          y1="49"
          x2={20.5 + i * 9}
          y2={forte ? 60 : 57}
          stroke="var(--clima-agua)"
          strokeWidth={forte ? 3 : 2.4}
          strokeLinecap="round"
          style={ritmo(i, n, duracao)}
        />
      ))}
    </g>
  )
}

const Flocos = ({ n = 3 }) => (
  <g className="clima__gotas">
    {Array.from({ length: n }, (_, i) => (
      <circle
        key={i}
        cx={23 + i * 9}
        cy="53"
        r="2.8"
        fill="var(--clima-neve)"
        style={ritmo(i, n, 2.2)}
      />
    ))}
  </g>
)

const Raio = () => (
  <path
    d="M34 47l-8 12h6l-3 10 11-14h-6l4-8z"
    fill="var(--clima-raio)"
    className="clima__raio"
  />
)

const Neblina = () => (
  <g className="clima__neblina" stroke="var(--clima-nuvem)" strokeWidth="3.4" strokeLinecap="round">
    <line x1="16" y1="38" x2="48" y2="38" />
    <line x1="12" y1="47" x2="52" y2="47" opacity="0.75" />
    <line x1="18" y1="56" x2="44" y2="56" opacity="0.5" />
  </g>
)

/**
 * `familia` vem de `familiaDoTempo`, em src/hooks/useClima.js.
 * `titulo` e a dica e o texto para leitor de tela.
 */
export default function IconeClima({ familia = 'sol', titulo = 'Tempo', tamanho = 46 }) {
  const desenho = {
    sol: <Sol />,
    lua: <Lua />,
    'sol-nuvem': (
      <>
        <Sol pequeno />
        <Nuvem y={4} />
      </>
    ),
    'lua-nuvem': (
      <>
        <Lua pequeno />
        <Nuvem y={4} />
      </>
    ),
    nuvem: (
      <>
        <Nuvem y={-4} tom="var(--clima-nuvem-alta)" />
        <Nuvem y={5} />
      </>
    ),
    neblina: (
      <>
        <Nuvem y={-9} tom="var(--clima-nuvem-alta)" />
        <Neblina />
      </>
    ),
    garoa: (
      <>
        <Nuvem y={-4} />
        <Gotas n={3} />
      </>
    ),
    chuva: (
      <>
        <Nuvem y={-6} />
        <Gotas n={4} forte />
      </>
    ),
    neve: (
      <>
        <Nuvem y={-4} />
        <Flocos />
      </>
    ),
    tempestade: (
      <>
        <Nuvem y={-8} tom="var(--clima-nuvem-alta)" />
        <Raio />
      </>
    ),
  }[familia] ?? <Sol />

  return (
    <svg
      className="clima__icone"
      viewBox="0 0 64 72"
      width={tamanho}
      height={tamanho * (72 / 64)}
      role="img"
      aria-label={titulo}
    >
      <title>{titulo}</title>
      <defs>
        <linearGradient id="clima-sol" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--clima-sol-claro)" />
          <stop offset="100%" stopColor="var(--clima-sol)" />
        </linearGradient>
        <linearGradient id="clima-lua" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--clima-lua-claro)" />
          <stop offset="100%" stopColor="var(--clima-lua)" />
        </linearGradient>
      </defs>
      {desenho}
    </svg>
  )
}
