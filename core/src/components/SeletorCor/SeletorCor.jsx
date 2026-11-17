import { useEffect, useId, useRef, useState } from 'react'
import './SeletorCor.css'

/* ============================================================
   SELETOR DE COR — as amostras e, embaixo, "Outra cor"

   `cores` sao as amostras ({ id, rotulo, cor }). O valor e o id da
   amostra escolhida OU uma cor propria em '#rrggbb'. O "Outra cor" abre
   o painel da cor livre:

     o quadro    claro/escuro e intensidade (arrastar, ou as setas);
     a faixa     o matiz;
     HEX         digitar ou colar ('#1f8a70', '1f8a70' ou '#18a');
     R G B       os tres numeros, de 0 a 255.

   As quatro formas mexem na mesma cor e uma acompanha a outra. A cor
   so vai para fora (aoMudar) quando e valida: o campo que esta sendo
   digitado pode ficar pela metade sem estragar nada.
   ============================================================ */

const limitar = (n, min, max) => Math.min(max, Math.max(min, n))

/** '#18a', '18a', '#1188aa' ou '1188aa' -> '#1188aa'; senao null. */
export function lerHex(texto) {
  let t = String(texto ?? '').trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(t)) t = t.split('').map((c) => c + c).join('')
  return /^[0-9a-f]{6}$/.test(t) ? `#${t}` : null
}

const hexParaRgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
})

const rgbParaHex = ({ r, g, b }) =>
  `#${[r, g, b].map((n) => Math.round(limitar(n, 0, 255)).toString(16).padStart(2, '0')).join('')}`

/* HSV: h 0-360, s e v 0-1 */
function rgbParaHsv({ r, g, b }) {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const d = max - min
  let h = 0
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6
    else if (max === gg) h = (bb - rr) / d + 2
    else h = (rr - gg) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

function hsvParaRgb({ h, s, v }) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export default function SeletorCor({ valor, cores, aoMudar, rotulo = 'Cor', desabilitado = false }) {
  const id = useId()
  const amostra = cores.find((c) => c.id === valor) ?? null
  const propria = amostra ? null : lerHex(valor)
  const hexAtual = amostra?.cor ?? propria ?? cores[0]?.cor ?? '#2f6fd6'
  const [aberto, setAberto] = useState(Boolean(propria))

  /* a cor do painel em HSV: guardar o matiz a parte deixa o cinza e o
     preto sem "perder" o matiz enquanto se arrasta no quadro */
  const [hsv, setHsv] = useState(() => rgbParaHsv(hexParaRgb(hexAtual)))
  const [hexTexto, setHexTexto] = useState(hexAtual)
  const [rgbTexto, setRgbTexto] = useState(() => {
    const { r, g, b } = hexParaRgb(hexAtual)
    return { r: String(r), g: String(g), b: String(b) }
  })
  /* a cor que o proprio painel mandou por ultimo: quando ela volta pelo
     `valor`, nao reescreve os campos (o HSV ficaria arredondado) */
  const ultima = useRef(hexAtual)

  useEffect(() => {
    if (hexAtual === ultima.current) return
    ultima.current = hexAtual
    const rgb = hexParaRgb(hexAtual)
    setHsv(rgbParaHsv(rgb))
    setHexTexto(hexAtual)
    setRgbTexto({ r: String(rgb.r), g: String(rgb.g), b: String(rgb.b) })
  }, [hexAtual])

  /* uma amostra com a mesma cor vira a amostra; senao vai a cor propria */
  const mandar = (hex) => {
    ultima.current = hex
    const igual = cores.find((c) => c.cor.toLowerCase() === hex)
    aoMudar(igual ? igual.id : hex)
  }

  const deHsv = (novo) => {
    setHsv(novo)
    const rgb = hsvParaRgb(novo)
    const hex = rgbParaHex(rgb)
    setHexTexto(hex)
    setRgbTexto({ r: String(Math.round(rgb.r)), g: String(Math.round(rgb.g)), b: String(Math.round(rgb.b)) })
    mandar(hex)
  }

  const deHex = (texto) => {
    setHexTexto(texto)
    const hex = lerHex(texto)
    if (!hex) return
    const rgb = hexParaRgb(hex)
    setHsv(rgbParaHsv(rgb))
    setRgbTexto({ r: String(rgb.r), g: String(rgb.g), b: String(rgb.b) })
    mandar(hex)
  }

  const deRgb = (canal, texto) => {
    const limpo = texto.replace(/\D/g, '').slice(0, 3)
    const novo = { ...rgbTexto, [canal]: limpo }
    setRgbTexto(novo)
    const nums = ['r', 'g', 'b'].map((c) => (novo[c] === '' ? NaN : Number(novo[c])))
    if (nums.some((n) => Number.isNaN(n) || n > 255)) return
    const rgb = { r: nums[0], g: nums[1], b: nums[2] }
    const hex = rgbParaHex(rgb)
    setHsv(rgbParaHsv(rgb))
    setHexTexto(hex)
    mandar(hex)
  }

  /* o quadro: arrastar escolhe a intensidade (x) e o claro/escuro (y) */
  const quadro = useRef(null)
  const noPonto = (evento) => {
    const caixa = quadro.current.getBoundingClientRect()
    const s = limitar((evento.clientX - caixa.left) / caixa.width, 0, 1)
    const v = 1 - limitar((evento.clientY - caixa.top) / caixa.height, 0, 1)
    deHsv({ ...hsv, s, v })
  }
  const pegar = (evento) => {
    if (desabilitado) return
    evento.preventDefault()
    evento.currentTarget.setPointerCapture?.(evento.pointerId)
    noPonto(evento)
  }
  const teclaNoQuadro = (evento) => {
    const passo = evento.shiftKey ? 0.1 : 0.02
    const mudar = {
      ArrowLeft: { s: hsv.s - passo },
      ArrowRight: { s: hsv.s + passo },
      ArrowUp: { v: hsv.v + passo },
      ArrowDown: { v: hsv.v - passo },
    }[evento.key]
    if (!mudar) return
    evento.preventDefault()
    deHsv({
      ...hsv,
      s: limitar(mudar.s ?? hsv.s, 0, 1),
      v: limitar(mudar.v ?? hsv.v, 0, 1),
    })
  }

  const hexValido = lerHex(hexTexto)

  return (
    <div className="seletorcor">
      <span className="campo__rotulo" id={`${id}-rot`}>
        {rotulo}
      </span>

      <div className="seletorcor__amostras" role="radiogroup" aria-labelledby={`${id}-rot`}>
        {cores.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={valor === c.id}
            aria-label={c.rotulo}
            title={`${c.rotulo} · ${c.cor.toUpperCase()}`}
            className="seletorcor__amostra"
            style={{ '--cor': c.cor }}
            onClick={() => aoMudar(c.id)}
            disabled={desabilitado}
          />
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={Boolean(propria)}
          className={`seletorcor__outra ${aberto ? 'is-aberta' : ''}`.trim()}
          style={propria ? { '--cor': propria } : undefined}
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-controls={`${id}-painel`}
          disabled={desabilitado}
          title="Escolher outra cor (HEX ou RGB)"
        >
          <span className="seletorcor__arco" aria-hidden="true" />
          Outra cor
        </button>
      </div>

      {aberto && (
        <div className="seletorcor__painel" id={`${id}-painel`}>
          <div className="seletorcor__visual">
            <div
              ref={quadro}
              className="seletorcor__quadro"
              style={{ '--matiz': `hsl(${hsv.h} 100% 50%)` }}
              onPointerDown={pegar}
              onPointerMove={(e) => e.buttons === 1 && !desabilitado && noPonto(e)}
              onKeyDown={teclaNoQuadro}
              role="slider"
              tabIndex={desabilitado ? -1 : 0}
              aria-label="Intensidade e brilho da cor (use as setas)"
              aria-valuetext={`intensidade ${Math.round(hsv.s * 100)}%, brilho ${Math.round(hsv.v * 100)}%`}
            >
              <span
                className="seletorcor__alvo"
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hexValido ?? hexAtual }}
                aria-hidden="true"
              />
            </div>
            <input
              type="range"
              className="seletorcor__matiz"
              min="0"
              max="359"
              step="1"
              value={Math.round(hsv.h)}
              onChange={(e) => deHsv({ ...hsv, h: Number(e.target.value) })}
              aria-label="Matiz da cor"
              disabled={desabilitado}
            />
          </div>

          <div className="seletorcor__campos">
            <span className="seletorcor__previa" style={{ '--cor': hexValido ?? hexAtual }} aria-hidden="true" />
            <label className="seletorcor__campo seletorcor__campo--hex">
              <span>HEX</span>
              <input
                type="text"
                value={hexTexto}
                onChange={(e) => deHex(e.target.value)}
                onBlur={() => setHexTexto(hexValido ?? hexAtual)}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={!hexValido || undefined}
                disabled={desabilitado}
              />
            </label>
            {['r', 'g', 'b'].map((canal) => (
              <label key={canal} className="seletorcor__campo">
                <span>{canal.toUpperCase()}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={rgbTexto[canal]}
                  onChange={(e) => deRgb(canal, e.target.value)}
                  onBlur={() => {
                    const { r, g, b } = hexParaRgb(lerHex(hexTexto) ?? hexAtual)
                    setRgbTexto({ r: String(r), g: String(g), b: String(b) })
                  }}
                  maxLength={3}
                  aria-label={{ r: 'Vermelho (R), de 0 a 255', g: 'Verde (G), de 0 a 255', b: 'Azul (B), de 0 a 255' }[canal]}
                  disabled={desabilitado}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
