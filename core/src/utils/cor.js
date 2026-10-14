/**
 * Cores dos cargos: leitura, opacidade e adaptacao ao tema.
 *
 * A cor e guardada como o usuario escolheu — #RRGGBB ou #RRGGBBAA,
 * quando ele mexeu na opacidade. O problema e que uma cor escolhida
 * olhando o modo claro pode sumir no fundo preto (e vice-versa). Por
 * isso a tela nunca pinta a cor crua: pinta o que sai de
 * `corAdaptada()`, que clareia o que ficou escuro demais e escurece o
 * que ficou claro demais — sem mudar o matiz nem o que esta no banco.
 */

const limitar = (n, min, max) => Math.min(max, Math.max(min, n))

/** Aceita #RGB, #RRGGBB e #RRGGBBAA. Devolve null se nao for cor. */
export function separarCor(cor) {
  const t = String(cor ?? '').trim()
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(t)
  if (!m) return null

  let hex = m[1]
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
  }
}

const doisDigitos = (n) => Math.round(limitar(n, 0, 255)).toString(16).padStart(2, '0')

/** Monta de volta. Alfa cheio sai como #RRGGBB, para nao poluir o banco. */
export function montarCor({ r, g, b, a = 1 }) {
  const base = `#${doisDigitos(r)}${doisDigitos(g)}${doisDigitos(b)}`
  return a >= 0.999 ? base : `${base}${doisDigitos(a * 255)}`
}

/** De {r,g,b,a} para o texto que o CSS entende. */
function paraCss(c) {
  return c.a >= 0.999
    ? montarCor(c)
    : `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a.toFixed(3)})`
}

/** Para usar em CSS quando a cor tem opacidade. Aceita texto ou {r,g,b,a}. */
export function corParaCss(cor) {
  const c = typeof cor === 'object' && cor !== null ? cor : separarCor(cor)
  if (!c) return cor
  return paraCss(c)
}

/**
 * Luminancia relativa (0 = preto, 1 = branco), na formula do WCAG.
 * E ela que diz se a cor vai sumir no fundo.
 */
export function luminancia({ r, g, b }) {
  const canal = (v) => {
    const n = v / 255
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

const misturar = (c, alvo, quanto) => ({
  r: c.r + (alvo - c.r) * quanto,
  g: c.g + (alvo - c.g) * quanto,
  b: c.b + (alvo - c.b) * quanto,
  a: c.a,
})

/* Abaixo disto some no preto; acima disto some no branco. */
const PISO_ESCURO = 0.16
const TETO_CLARO = 0.72

/**
 * A cor pronta para o tema atual.
 *
 * No escuro, cor muito escura vai sendo clareada ate dar para ver; no
 * claro, cor muito clara vai sendo escurecida. Cor que ja esta bem no
 * tema passa intacta — quem escolheu vermelho continua com o vermelho
 * dele. O matiz nunca muda: so o quanto de branco ou preto entra.
 */
export function corAdaptada(cor, escuro) {
  const c = separarCor(cor)
  if (!c) return cor ?? '#6b7280'

  const lum = luminancia(c)
  let ajustada = c

  if (escuro && lum < PISO_ESCURO) {
    // quanto mais escura, mais branco entra (ate 55%)
    const falta = (PISO_ESCURO - lum) / PISO_ESCURO
    ajustada = misturar(c, 255, limitar(falta * 0.55, 0, 0.55))
  } else if (!escuro && lum > TETO_CLARO) {
    const sobra = (lum - TETO_CLARO) / (1 - TETO_CLARO)
    ajustada = misturar(c, 0, limitar(sobra * 0.5, 0, 0.5))
  }

  return paraCss(ajustada)
}

/* ---- HSL: so para a cor suave ---- */

function paraHsl({ r, g, b }) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
  return { h: h / 6, s, l }
}

function deHsl({ h, s, l }) {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const canal = (t) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return { r: canal(h + 1 / 3) * 255, g: canal(h) * 255, b: canal(h - 1 / 3) * 255 }
}

/**
 * A cor do setor em versao SUAVE — para contorno e texto sobre fundo
 * transparente (os cards de check da obra, as etiquetas de setor).
 *
 * As cores cadastradas sao vivas (laranja, ciano, roxo), e chapadas
 * como fundo de card ficavam gritando. Aqui a saturacao cai e a
 * claridade e presa numa faixa de cada tema: escura o bastante para
 * ler no branco, clara o bastante para ler no preto. O matiz nao muda —
 * o laranja do Tecnico continua laranja, so que mais calmo.
 */
export function corSuave(cor, escuro) {
  const c = separarCor(cor)
  if (!c) return cor ?? '#6b7280'
  const hsl = paraHsl(c)
  const s = hsl.s * 0.68
  const l = escuro ? limitar(hsl.l, 0.66, 0.76) : limitar(hsl.l, 0.38, 0.48)
  return montarCor({ ...deHsl({ h: hsl.h, s, l }), a: 1 })
}

/**
 * Preto ou branco por cima da cor — o que der para ler.
 * Usa a cor JA adaptada, senao o texto erra no tema oposto.
 */
export function textoSobre(cor, escuro) {
  const c = separarCor(corAdaptada(cor, escuro))
  if (!c) return '#ffffff'
  return luminancia(c) > 0.55 ? '#12181f' : '#ffffff'
}
