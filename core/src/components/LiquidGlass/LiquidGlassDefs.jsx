/**
 * Filtros SVG usados pelo efeito "liquid glass".
 * Montado uma unica vez na raiz da aplicacao (App.jsx).
 *
 * - #lg-refraction: turbulencia + deslocamento => distorcao liquida da imagem de fundo
 * - #lg-grain: ruido sutil para tirar o aspecto "plastico" do vidro
 */
export default function LiquidGlassDefs() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <filter id="lg-refraction" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.016"
            numOctaves="2"
            seed="7"
            result="noise"
          >
            <animate
              attributeName="baseFrequency"
              dur="24s"
              values="0.008 0.016; 0.012 0.010; 0.008 0.016"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale="10"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        <filter id="lg-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="grain" />
          <feColorMatrix in="grain" type="saturate" values="0" />
        </filter>
      </defs>
    </svg>
  )
}
