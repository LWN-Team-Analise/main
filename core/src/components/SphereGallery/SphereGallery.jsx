import * as React from 'react'

/**
 * SPHERE GALLERY 3D — placas de midia distribuidas numa casca esferica em
 * volta de um nucleo aceso, ligadas a ele por segmentos de linha.
 *
 * Porte do componente do Originkit para este projeto (JSX, sem TypeScript).
 * WebGL cru: nada de `three`, nada de dependencia nova. Projecao em
 * perspectiva, o rig YXZ, o billboard por quaternion, o raio do ponteiro, a
 * tesselacao da esfera e o upload de textura sao ~200 linhas de aritmetica, e
 * moram todas neste arquivo.
 *
 * Tres coisas mudaram em relacao ao original, e so tres:
 *
 *   1. AS FOTOS SAO AS LOGOS DOS CLIENTES. Quem passa a lista e a tela de
 *      login (hooks/useVitrine), e `branches` vem do TAMANHO dela: dois
 *      clientes com foto = duas placas, nunca as 34 com a mesma imagem
 *      repetida. O teto continua sendo 34.
 *
 *   2. A DERIVA SEGUE O ULTIMO ARRASTO. No original o giro automatico tem um
 *      sentido fixo (a prop `direction`). Aqui, quando a pessoa solta a
 *      esfera, o sentido do arrasto vira o sentido da deriva — arrastou para
 *      a direita, ela segue para a direita; para cima, segue subindo. No eixo
 *      vertical existe uma trava de 70 graus, entao ao encostar nela a deriva
 *      inverte em vez de travar.
 *
 *   3. O GIRO ESTA MAIS LENTO (ver DEFAULT_SPEED).
 *
 * Interacao:
 *   - arrasto — orbita a camera, yaw/pitch acumulados, pitch travado, inercia
 *     ao soltar, ouvida na `window` para que um arrasto que sai do quadro
 *     ainda gire e ainda solte.
 *   - hover   — atracao magnetica. O ponteiro e um RAIO, nao um ponto 2D:
 *     cada placa e puxada para o ponto mais proximo do raio da camera, entao
 *     o efeito fica certo em qualquer angulo de orbita.
 *   - roda    — aproxima e afasta a camera, amortecido.
 */

/* ---------------------------------------------------------------- shaders
 * GLSL ES 1.00, para o mesmo fonte compilar num contexto WebGL2 e num WebGL1.
 *
 * Um quad por placa. A quina arredondada e uma SDF, nao uma textura e nao um
 * clip de DOM: a mascara e calculada no fragment shader, entao fica exata a
 * qualquer distancia e a qualquer escala, com um pixel de suavizacao.
 *
 * Essa suavizacao vem de `uAA`, e NAO de `fwidth()`. Derivadas sao nativas no
 * GLSL ES 3.00 mas precisam de OES_standard_derivatives num contexto WebGL1, e
 * um shader que falha em compilar la leva o componente inteiro junto. A CPU ja
 * sabe a profundidade e a escala da placa, entao um pixel nas unidades da
 * propria SDF e aritmetica exata — sem extensao e sem desvio.
 */

const QUAD_VERT = `
precision highp float;
attribute vec2 aCorner;      // quad unitario, -0.5 .. 0.5
uniform mat4 uMVP;
varying vec2 vUv;
void main() {
    vUv = aCorner + 0.5;
    gl_Position = uMVP * vec4(aCorner, 0.0, 1.0);
}
`

const QUAD_FRAG = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uMap;
uniform float uHasTex;
uniform vec2  uHalf;     // meias extensoes em unidades locais, com aspecto
uniform float uRadius;   // raio da quina, nas mesmas unidades
uniform float uAA;       // um pixel de tela, nas mesmas unidades
uniform float uOpacity;
uniform float uDim;      // sombreado por profundidade, 0 = na sombra
uniform vec3  uPlaceholder;

float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
    vec2 p = (vUv - 0.5) * 2.0 * uHalf;
    /* uRadius chegando a metade do lado CURTO e um circulo inteiro, nao um
     * estadio. O ponto amostrado ainda cobre as meias extensoes reais da
     * placa, mas a caixa da SDF se estreita ate um quadrado conforme o raio
     * cresce; no maximo as duas se encontram num circulo e o eixo longo e
     * cortado fora. */
    float sHalf = min(uHalf.x, uHalf.y);
    float t = sHalf > 0.0 ? clamp(uRadius / sHalf, 0.0, 1.0) : 0.0;
    vec2 box = mix(uHalf, vec2(sHalf), t);
    float d = sdRoundBox(p, box, uRadius);
    float aa = max(uAA, 1e-5);
    float mask = 1.0 - smoothstep(-aa, aa, d);
    if (mask <= 0.002) discard;

    vec3 col = mix(uPlaceholder, texture2D(uMap, vUv).rgb, uHasTex);
    col *= uDim;

    float a = mask * uOpacity;
    if (a <= 0.002) discard;
    // pre-multiplicado: o contexto e premultipliedAlpha, e o halo aditivo
    // abaixo precisa de blendFunc(ONE, ONE) para florescer em vez de lavar
    gl_FragColor = vec4(col * a, a);
}
`

const SOLID_VERT = `
precision highp float;
attribute vec3 aPos;
uniform mat4 uMVP;
uniform float uScale;
void main() {
    gl_Position = uMVP * vec4(aPos * uScale, 1.0);
}
`

const SOLID_FRAG = `
precision mediump float;
uniform vec4 uColor;
void main() {
    gl_FragColor = vec4(uColor.rgb * uColor.a, uColor.a);
}
`

/* ---------------------------------------------------------------- constantes */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const BASE_SPIN = 0.22 // rad/s com speed 100
/* O original vinha com 18. Aqui a esfera fica parada na tela de login o tempo
   todo, e a essa taxa ela chamava atencao demais — 8 da uma volta em uns tres
   minutos, que e o que se quer de um pano de fundo. */
const DEFAULT_SPEED = 8
/** abaixo disso o arrasto foi um toque, nao um giro: a deriva nao muda */
const DRIFT_MIN_VEL = 10 // graus/s
const SPRING_STIFFNESS = 70 // 1/s^2, puxao ate o alvo magnetico
const HOVER_POP = 0.3 // escala extra numa placa totalmente capturada
// 0 = radial puro, 1 = billboard puro. Medido: em 0.45 uma placa do lado de
// LA (normal radial a ~180 graus da camera) ainda cai ~81 graus fora de frente
// e vira uma lasca. 0.75 limita o pior caso perto de 45 graus, entao toda
// placa continua legivel e o conjunto ainda le como casca, nao como parede.
const BILLBOARD_BLEND = 0.75
const RADIUS = 12 // raio da casca, unidades de mundo
const DAMPING = 0.6 // assentamento da mola, 0-1
const FOV = 45 // graus, vertical
const MIN_DIST = 18 // trava da roda, unidades de mundo, com Scale 100
const MAX_DIST = 70
const REST_DIST_MUL = 2.8 // distancia de repouso = RADIUS * isto
const MAX_BRANCHES = 34 // o teto pedido: nunca mais que 34 placas
const ZOOM_GAIN = 1
const ORBIT_SPEED = 0.25 // graus de giro por pixel arrastado
const ORBIT_DAMPING = 0.6 // quao rapido a orbita assenta apos soltar
const ORBIT_LIMIT = 70 // trava do pitch, graus para cada lado
const DEPTH_FLOOR = 0.32 // quao escuro fica o lado de tras da casca
const ZOOM_RATE = 9 // 1/s, amortecimento do avanco da camera
const PLACEHOLDER = '#1b1b20'
const SPHERE_W = 32 // tesselacao do nucleo
const SPHERE_H = 24
const NEAR = 0.1
const FAR = 2000

/** ruido estavel por indice — hash semeado, nunca Math.random, para a casca
 * nao se reembaralhar a cada render */
function hash01(i) {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/* -------------------------------------------------------------------- cor
 * Leitura tolerante: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba().
 */
function parseColor(input, fallback) {
  if (!input) return fallback.slice()
  const s = String(input).trim()

  const m = s.match(/^rgba?\(([^)]+)\)$/i)
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean)
    const ch = (t) => (t.indexOf('%') >= 0 ? parseFloat(t) / 100 : parseFloat(t) / 255)
    const r = ch(parts[0] ?? '0')
    const g = ch(parts[1] ?? '0')
    const b = ch(parts[2] ?? '0')
    const a = parts[3] === undefined ? 1 : parseFloat(parts[3])
    if ([r, g, b, a].some((v) => !isFinite(v))) return fallback.slice()
    return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1), clamp(a, 0, 1)]
  }

  let h = s.replace(/^#/, '')
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (h.length !== 6 && h.length !== 8) return fallback.slice()
  const n = parseInt(h, 16)
  if (!isFinite(n)) return fallback.slice()
  if (h.length === 6) {
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
  }
  return [
    ((n >>> 24) & 255) / 255,
    ((n >>> 16) & 255) / 255,
    ((n >>> 8) & 255) / 255,
    (n & 255) / 255,
  ]
}

/* ---------------------------------------------------------------- matematica
 * mat4 coluna-a-coluna, ordem do GL. Tudo o que o `three` fazia aqui.
 */

function mat4() {
  const m = new Float32Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}

/** perspectiva por FOV vertical, igual a PerspectiveCamera do three */
function perspective(out, fovyRad, aspect) {
  const f = 1 / Math.tan(fovyRad / 2)
  out.fill(0)
  out[0] = f / aspect
  out[5] = f
  out[10] = (FAR + NEAR) / (NEAR - FAR)
  out[11] = -1
  out[14] = (2 * FAR * NEAR) / (NEAR - FAR)
  return out
}

function mul(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4]
    const b1 = b[c * 4 + 1]
    const b2 = b[c * 4 + 2]
    const b3 = b[c * 4 + 3]
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3
  }
  return out
}

/**
 * A rotacao do rig, Euler YXZ com z = 0 — Ry(yaw) . Rx(pitch). E essa ordem
 * que faz o arrasto parecer um prato giratorio, e nao um objeto cambaleando.
 * Escrita num mat4 cuja coluna de translacao e o avanco da camera, entao
 * `view . group` e uma matriz so e nunca duas.
 */
function rigView(out, yaw, pitch, camZ) {
  const a = Math.cos(pitch)
  const b = Math.sin(pitch)
  const c = Math.cos(yaw)
  const d = Math.sin(yaw)
  out[0] = c
  out[1] = 0
  out[2] = -d
  out[3] = 0
  out[4] = d * b
  out[5] = a
  out[6] = c * b
  out[7] = 0
  out[8] = a * d
  out[9] = -b
  out[10] = a * c
  out[11] = 0
  out[12] = 0
  out[13] = 0
  out[14] = -camZ
  out[15] = 1
  return out
}

/** a mesma rotacao como 3x3, linha a linha, para as contas do lado da CPU */
function rigBasis(yaw, pitch) {
  const a = Math.cos(pitch)
  const b = Math.sin(pitch)
  const c = Math.cos(yaw)
  const d = Math.sin(yaw)
  return [c, d * b, a * d, 0, a, -b, -d, c * b, a * c]
}

/** R . v */
function applyBasis(R, x, y, z, out) {
  out[0] = R[0] * x + R[1] * y + R[2] * z
  out[1] = R[3] * x + R[4] * y + R[5] * z
  out[2] = R[6] * x + R[7] * y + R[8] * z
}

/** R^T . v — mundo para local do rig, o inverso de uma rotacao pura */
function applyBasisT(R, x, y, z, out) {
  out[0] = R[0] * x + R[3] * y + R[6] * z
  out[1] = R[1] * x + R[4] * y + R[7] * z
  out[2] = R[2] * x + R[5] * y + R[8] * z
}

/** quaternion do rig para Euler YXZ com z = 0, ou seja qYaw . qPitch */
function quatFromYawPitch(yaw, pitch, out) {
  const cy = Math.cos(yaw / 2)
  const sy = Math.sin(yaw / 2)
  const cx = Math.cos(pitch / 2)
  const sx = Math.sin(pitch / 2)
  out[0] = cy * sx
  out[1] = sy * cx
  out[2] = -sy * sx
  out[3] = cy * cx
  return out
}

/**
 * A menor rotacao que leva +Z ate `dir` (unitario). O setFromUnitVectors do
 * three, especializado em vFrom = (0,0,1) — a normal do proprio quad.
 */
function quatFromZTo(dx, dy, dz, out) {
  const r = dz + 1
  let x
  let y
  let z
  let w
  if (r < 1e-6) {
    // antiparalelo: qualquer eixo perpendicular a +Z serve
    x = 0
    y = -1
    z = 0
    w = 0
  } else {
    x = -dy
    y = dx
    z = 0
    w = r
  }
  const len = Math.hypot(x, y, z, w) || 1
  out[0] = x / len
  out[1] = y / len
  out[2] = z / len
  out[3] = w / len
  return out
}

/** o Quaternion.slerp do three, com a virada de caminho mais curto */
function quatSlerp(a, b, t, out) {
  if (t <= 0) {
    out[0] = a[0]
    out[1] = a[1]
    out[2] = a[2]
    out[3] = a[3]
    return out
  }
  if (t >= 1) {
    out[0] = b[0]
    out[1] = b[1]
    out[2] = b[2]
    out[3] = b[3]
    return out
  }

  const ax = a[0]
  const ay = a[1]
  const az = a[2]
  const aw = a[3]
  let bx = b[0]
  let by = b[1]
  let bz = b[2]
  let bw = b[3]

  let cosHalf = aw * bw + ax * bx + ay * by + az * bz
  if (cosHalf < 0) {
    cosHalf = -cosHalf
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }

  if (cosHalf >= 1) {
    out[0] = ax
    out[1] = ay
    out[2] = az
    out[3] = aw
    return out
  }

  const sqrSin = 1 - cosHalf * cosHalf
  if (sqrSin <= Number.EPSILON) {
    const s = 1 - t
    out[0] = s * ax + t * bx
    out[1] = s * ay + t * by
    out[2] = s * az + t * bz
    out[3] = s * aw + t * bw
    const len = Math.hypot(out[0], out[1], out[2], out[3]) || 1
    out[0] /= len
    out[1] /= len
    out[2] /= len
    out[3] /= len
    return out
  }

  const sinHalf = Math.sqrt(sqrSin)
  const half = Math.atan2(sinHalf, cosHalf)
  const ra = Math.sin((1 - t) * half) / sinHalf
  const rb = Math.sin(t * half) / sinHalf
  out[0] = ax * ra + bx * rb
  out[1] = ay * ra + by * rb
  out[2] = az * ra + bz * rb
  out[3] = aw * ra + bw * rb
  return out
}

/** posicao . rotacao . escala, direto num mat4 coluna-a-coluna */
function compose(out, px, py, pz, q, sx, sy, sz) {
  const x = q[0]
  const y = q[1]
  const z = q[2]
  const w = q[3]
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2

  out[0] = (1 - (yy + zz)) * sx
  out[1] = (xy + wz) * sx
  out[2] = (xz - wy) * sx
  out[3] = 0
  out[4] = (xy - wz) * sy
  out[5] = (1 - (xx + zz)) * sy
  out[6] = (yz + wx) * sy
  out[7] = 0
  out[8] = (xz + wy) * sz
  out[9] = (yz - wx) * sz
  out[10] = (1 - (xx + yy)) * sz
  out[11] = 0
  out[12] = px
  out[13] = py
  out[14] = pz
  out[15] = 1
  return out
}

/** os eixos direita / cima / normal do quad, as colunas da matriz de rotacao */
function quatAxes(q, right, up, normal) {
  const x = q[0]
  const y = q[1]
  const z = q[2]
  const w = q[3]
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2
  right[0] = 1 - (yy + zz)
  right[1] = xy + wz
  right[2] = xz - wy
  up[0] = xy - wz
  up[1] = 1 - (xx + zz)
  up[2] = yz + wx
  normal[0] = xz + wy
  normal[1] = yz - wx
  normal[2] = 1 - (xx + yy)
}

/* ------------------------------------------------------- geometria do nucleo
 * O SphereGeometry(1, 32, 24) do three, gerado aqui. O halo reaproveita as
 * mesmas posicoes com um indice de arestas — que e o que material.wireframe
 * montava por baixo.
 */
function buildSphere(widthSeg, heightSeg) {
  const pos = []
  const grid = []
  let index = 0

  for (let iy = 0; iy <= heightSeg; iy++) {
    const row = []
    const v = iy / heightSeg
    const theta = v * Math.PI
    for (let ix = 0; ix <= widthSeg; ix++) {
      const u = ix / widthSeg
      const phi = u * Math.PI * 2
      pos.push(
        -Math.cos(phi) * Math.sin(theta),
        Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
      )
      row.push(index++)
    }
    grid.push(row)
  }

  const tris = []
  for (let iy = 0; iy < heightSeg; iy++) {
    for (let ix = 0; ix < widthSeg; ix++) {
      const a = grid[iy][ix + 1]
      const b = grid[iy][ix]
      const c = grid[iy + 1][ix]
      const d = grid[iy + 1][ix + 1]
      if (iy !== 0) tris.push(a, b, d)
      if (iy !== heightSeg - 1) tris.push(b, c, d)
    }
  }

  // Tres arestas por triangulo, e NAO um conjunto de arestas sem repeticao.
  // Aresta compartilhada e desenhada duas vezes, e sob blend aditivo isso e
  // exatamente uma trama 2x mais brilhante — que e o que o halo sempre foi.
  const edges = []
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i]
    const b = tris[i + 1]
    const c = tris[i + 2]
    edges.push(a, b, b, c, c, a)
  }

  return {
    positions: new Float32Array(pos),
    tris: new Uint16Array(tris),
    edges: new Uint16Array(edges),
  }
}

/* ---------------------------------------------------------------- runtime */

function makeNode() {
  return {
    ox: 0,
    oy: 0,
    oz: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    px: 0,
    py: 0,
    pz: 0,
    q: [0, 0, 0, 1],
    hx: 0,
    hy: 0,
  }
}

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('[SphereGallery3D] shader', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

function link(gl, vertSrc, fragSrc) {
  const v = compile(gl, gl.VERTEX_SHADER, vertSrc)
  const f = compile(gl, gl.FRAGMENT_SHADER, fragSrc)
  if (!v || !f) return null
  const p = gl.createProgram()
  if (!p) return null
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('[SphereGallery3D] link', gl.getProgramInfoLog(p))
    gl.deleteProgram(p)
    return null
  }
  return p
}

/* -------------------------------------------------------------- componente */

export default function SphereGallery({
  /** as fotos: uma entrada por placa, na ordem em que aparecem */
  images = [],
  /**
   * Quantas placas. Omitido, e o TAMANHO da lista de fotos — que e o que a
   * tela de login quer: dois clientes com logo, duas placas.
   */
  branches,
  background = 'transparent',
  scale = 60,
  size = 28,
  scatter = 0,
  speed = DEFAULT_SPEED,
  direction = 'counterclockwise',
  hover = 200,
  rounded = 18,
  /**
   * A roda do mouse (e a pinca do touchpad) aproxima a esfera. Com false,
   * ela fica no tamanho de partida e a roda volta a rolar a pagina.
   */
  zoom = true,
  core = { coreSize: 24, coreColor: '#FFFFFF59', lineColor: '#FFFFFF59' },
  className,
  style,
  rotulo = 'Clientes atendidos',
}) {
  const items = images && images.length ? images : []
  /* Sem lista, nao ha esfera para desenhar. Com lista, uma placa por foto —
     nunca uma imagem repetida enchendo as 34, que era o pedido. */
  const alvo = branches ?? items.length
  const nodes = clamp(Math.round(alvo), 0, MAX_BRANCHES)

  const hostRef = React.useRef(null)
  const canvasRef = React.useRef(null)

  /* ---------------------------------------------------------- props vivas
   * Tudo o que o laco le mora num ref. Qualquer um destes nas deps do efeito
   * de montagem reconstruiria o contexto GL a cada tique de slider.
   */
  const radius = RADIUS
  const coreColor = core.coreColor ?? '#7ab8ffff'
  const lineColor = core.lineColor ?? '#4a6a9959'
  const coreAlpha = parseColor(coreColor, [0.48, 0.72, 1, 1])[3]
  const lineAlpha = parseColor(lineColor, [0.29, 0.42, 0.6, 0.35])[3]
  /* Yaw positivo leva a frente da casca para a DIREITA, o que visto de CIMA —
     o eixo em que ela realmente gira — e o sentido anti-horario. */
  const spinSign = direction === 'clockwise' ? -1 : 1

  const live = React.useRef({})
  live.current = {
    count: nodes,
    radius,
    depthRand: clamp(scatter / 100, 0, 1),
    itemSize: radius * clamp(size / 100, 0.01, 2),
    coreColor,
    coreSize: radius * clamp((core.coreSize ?? 16) / 100, 0, 1),
    coreGlow: coreAlpha,
    lineColor,
    lineOpacity: lineAlpha,
    rounded: clamp(rounded / 100, 0, 1),
    // a taxa da deriva, sempre positiva; o SENTIDO vive na orbita, porque e
    // o ultimo arrasto que manda nele
    spinRate: Math.abs((BASE_SPIN * speed) / 50),
    spinSign,
    force: clamp(hover / 100, 0, 3),
    hoverDist: radius * clamp((hover / 100) * 0.35, 0, 3),
    scale: clamp(scale / 100, 0.2, 4),
    minZoom: MIN_DIST,
    maxZoom: MAX_DIST,
    zoomGain: ZOOM_GAIN,
    zoomable: zoom,
    orbitSpeed: ORBIT_SPEED,
    orbitDamping: ORBIT_DAMPING,
    orbitLimit: ORBIT_LIMIT,
  }

  /* -------------------------------------------------------------- midia
   * Este efeito so decodifica imagens. O upload para o GL acontece no laco,
   * onde o contexto esta em escopo.
   */
  const mediaRef = React.useRef([])
  const graveyardRef = React.useRef([])
  const mediaKey = React.useMemo(() => items.join('|'), [items])

  React.useEffect(() => {
    let alive = true
    const loaded = items.map(() => ({
      image: null,
      aspect: 1,
      texture: null,
      applied: false,
    }))
    mediaRef.current = loaded

    items.forEach((url, i) => {
      if (!url) return
      const img = new Image()
      // igual ao TextureLoader.setCrossOrigin("anonymous") do three: um canvas
      // contaminado nao pode virar textura de jeito nenhum
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (!alive) return
        loaded[i].image = img
        loaded[i].aspect = (img.naturalWidth || 1) / Math.max(1, img.naturalHeight || 1)
      }
      img.onerror = () => {
        /* fica o preenchimento de reserva */
      }
      img.src = url
    })

    return () => {
      alive = false
      // o laco e dono dos objetos GL, entao devolve em vez de apagar de um
      // efeito que pode viver mais que o contexto
      loaded.forEach((l) => {
        if (l.texture) graveyardRef.current.push(l.texture)
        l.texture = null
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey])

  /* ------------------------------------------------------------ GL setup */
  React.useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return undefined

    const attrs = {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      depth: true,
      powerPreference: 'high-performance',
    }
    const gl =
      canvas.getContext('webgl2', attrs) ||
      canvas.getContext('webgl', attrs) ||
      canvas.getContext('experimental-webgl', attrs)

    if (!gl) {
      console.error('[SphereGallery3D] WebGL indisponivel')
      return undefined
    }

    const isGL2 =
      typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
    const aniso =
      gl.getExtension('EXT_texture_filter_anisotropic') ||
      gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')

    /* --------------------------------------------------------- programas */
    const quadProg = link(gl, QUAD_VERT, QUAD_FRAG)
    const solidProg = link(gl, SOLID_VERT, SOLID_FRAG)
    if (!quadProg || !solidProg) return undefined

    const qLoc = {
      aCorner: gl.getAttribLocation(quadProg, 'aCorner'),
      uMVP: gl.getUniformLocation(quadProg, 'uMVP'),
      uMap: gl.getUniformLocation(quadProg, 'uMap'),
      uHasTex: gl.getUniformLocation(quadProg, 'uHasTex'),
      uHalf: gl.getUniformLocation(quadProg, 'uHalf'),
      uRadius: gl.getUniformLocation(quadProg, 'uRadius'),
      uAA: gl.getUniformLocation(quadProg, 'uAA'),
      uOpacity: gl.getUniformLocation(quadProg, 'uOpacity'),
      uDim: gl.getUniformLocation(quadProg, 'uDim'),
      uPlaceholder: gl.getUniformLocation(quadProg, 'uPlaceholder'),
    }
    const sLoc = {
      aPos: gl.getAttribLocation(solidProg, 'aPos'),
      uMVP: gl.getUniformLocation(solidProg, 'uMVP'),
      uScale: gl.getUniformLocation(solidProg, 'uScale'),
      uColor: gl.getUniformLocation(solidProg, 'uColor'),
    }
    const missing = [...Object.entries(qLoc), ...Object.entries(sLoc)].filter(
      ([, v]) => v === null || v === -1,
    )
    if (missing.length) {
      console.error(
        '[SphereGallery3D] locais GL nao resolvidos:',
        missing.map(([k]) => k).join(', '),
      )
    }

    /* --------------------------------------------------------- buffers */
    const quadBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      // dois triangulos, CCW, de -0.5 a 0.5
      new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5]),
      gl.STATIC_DRAW,
    )

    const ball = buildSphere(SPHERE_W, SPHERE_H)
    const ballBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, ballBuf)
    gl.bufferData(gl.ARRAY_BUFFER, ball.positions, gl.STATIC_DRAW)
    const ballTri = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ballTri)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ball.tris, gl.STATIC_DRAW)
    const ballEdge = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ballEdge)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ball.edges, gl.STATIC_DRAW)

    // um segmento por placa: [superficie do nucleo, placa]. Cresce, nunca e
    // realocado por quadro — so uma mudanca na contagem redimensiona.
    const lineBuf = gl.createBuffer()
    let lineData = new Float32Array(0)
    const ensureLines = (n) => {
      if (lineData.length === n * 6) return
      lineData = new Float32Array(n * 6)
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf)
      gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW)
    }

    /* -------------------------------------------------------- texturas */
    const white = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, white)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const isPOT = (v) => (v & (v - 1)) === 0 && v > 0

    const upload = (img) => {
      const tex = gl.createTexture()
      if (!tex) return null
      gl.bindTexture(gl.TEXTURE_2D, tex)
      // v = 1 e o topo do quad, e tem que ser o topo da imagem — o flipY
      // padrao do three, escrito por extenso
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        isGL2 ? gl.SRGB8_ALPHA8 : gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        img,
      )
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      // WebGL1 nao gera mip de textura fora de potencia de dois, e logo de
      // cliente nunca e; cai num minify bilinear simples
      const mip = isGL2 || (isPOT(img.naturalWidth) && isPOT(img.naturalHeight))
      if (mip) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.generateMipmap(gl.TEXTURE_2D)
        if (aniso) {
          const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
          gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max || 1))
        }
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      }
      return tex
    }

    /* ------------------------------------------------------------ tamanho */
    let vw = 1
    let vh = 1
    const resize = () => {
      const w = Math.max(1, host.clientWidth)
      const h = Math.max(1, host.clientHeight)
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      vw = Math.max(1, Math.round(w * dpr))
      vh = Math.max(1, Math.round(h * dpr))
      if (canvas.width !== vw) canvas.width = vw
      if (canvas.height !== vh) canvas.height = vh
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    /* ----------------------------------------------------------- entrada */
    const pointer = {
      nx: 0,
      ny: 0,
      inside: false,
      dragging: false,
      lastX: 0,
      lastY: 0,
    }

    const orbit = {
      yaw: 0,
      pitch: 0,
      yawVel: 0, // graus/s, inercia depois de soltar
      pitchVel: 0,
      /* A DERIVA — em rad/s, um valor por eixo. E ela que guarda "para que
         lado a esfera esta indo sozinha", e e ela que o arrasto reescreve. */
      driftYaw: live.current.spinRate * live.current.spinSign,
      driftPitch: 0,
      zoom: clamp(
        live.current.radius * REST_DIST_MUL,
        live.current.minZoom,
        live.current.maxZoom,
      ),
      zoomTarget: 0,
    }
    orbit.zoomTarget = orbit.zoom

    let camDist = orbit.zoom / live.current.scale

    const nodesRT = []
    const setNdc = (e) => {
      const r = host.getBoundingClientRect()
      pointer.nx = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1
      pointer.ny = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1
    }

    /* ------------------------------------------------------------- raio
     * A camera fica em (0,0,z) e nunca gira — quem gira e o RIG — entao
     * desprojetar um ponto NDC e uma tangente e nenhuma inversa de matriz.
     */
    const rayO = [0, 0, 0]
    const rayD = [0, 0, -1]
    const rayOL = [0, 0, 0]
    const rayDL = [0, 0, -1]
    const tmpA = [0, 0, 0]
    const axR = [0, 0, 0]
    const axU = [0, 0, 0]
    const axN = [0, 0, 0]

    const buildRay = (camZ, fovRad, aspect) => {
      const th = Math.tan(fovRad / 2)
      const dx = pointer.nx * th * aspect
      const dy = pointer.ny * th
      const dz = -1
      const len = Math.hypot(dx, dy, dz) || 1
      rayO[0] = 0
      rayO[1] = 0
      rayO[2] = camZ
      rayD[0] = dx / len
      rayD[1] = dy / len
      rayD[2] = dz / len
    }

    const onPointerDown = (e) => {
      setNdc(e)
      pointer.inside = true
      pointer.dragging = true
      pointer.lastX = e.clientX
      pointer.lastY = e.clientY
      orbit.yawVel = 0
      orbit.pitchVel = 0
      canvas.style.cursor = 'grabbing'
    }

    const onPointerMove = (e) => {
      const r = host.getBoundingClientRect()
      const inBox =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      pointer.inside = inBox || pointer.dragging
      if (pointer.inside) setNdc(e)

      if (!pointer.dragging) return

      const dx = e.clientX - pointer.lastX
      const dy = e.clientY - pointer.lastY
      pointer.lastX = e.clientX
      pointer.lastY = e.clientY

      const L = live.current
      // graus por pixel -> radianos, direto no rig
      orbit.yaw += (dx * L.orbitSpeed * Math.PI) / 180
      orbit.pitch += (dy * L.orbitSpeed * Math.PI) / 180
      const lim = (L.orbitLimit * Math.PI) / 180
      orbit.pitch = clamp(orbit.pitch, -lim, lim)

      // guarda a taxa instantanea, para a inercia ao soltar
      orbit.yawVel = dx * L.orbitSpeed * 60
      orbit.pitchVel = dy * L.orbitSpeed * 60
    }

    /**
     * Soltar a esfera define para onde ela segue sozinha.
     *
     * O sentido vem do proprio gesto: a velocidade do ultimo trecho do
     * arrasto e normalizada e vira a deriva, com a taxa configurada. Puxou
     * para a direita, ela continua para a direita; para cima, continua
     * subindo — nos dois eixos ao mesmo tempo, se o arrasto foi na diagonal.
     *
     * Um toque sem arrasto (velocidade quase nula) nao muda nada: seria
     * irritante a esfera parar de girar so porque a pessoa clicou nela.
     */
    const release = () => {
      if (!pointer.dragging) return
      pointer.dragging = false
      canvas.style.cursor = 'grab'

      const mag = Math.hypot(orbit.yawVel, orbit.pitchVel)
      if (mag < DRIFT_MIN_VEL) return

      const taxa = live.current.spinRate
      orbit.driftYaw = (orbit.yawVel / mag) * taxa
      orbit.driftPitch = (orbit.pitchVel / mag) * taxa
    }

    const onLeave = () => {
      if (!pointer.dragging) pointer.inside = false
    }

    const onWheel = (e) => {
      const L = live.current
      /* sem zoom, o gesto nem e segurado: a pagina rola normalmente */
      if (!L.zoomable) return
      e.preventDefault()
      orbit.zoomTarget = clamp(
        orbit.zoomTarget + e.deltaY * 0.02 * L.zoomGain,
        L.minZoom,
        L.maxZoom,
      )
    }

    canvas.style.cursor = 'grab'
    canvas.style.touchAction = 'none'
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    // move/up na janela: um ponteiro que sai do quadro no meio do arrasto
    // ainda tem que girar, e ainda tem que soltar
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)

    /* ------------------------------------------------------------ estado */
    const proj = mat4()
    const view = mat4()
    const viewProj = mat4()
    const model = mat4()
    const mvp = mat4()
    const qRig = [0, 0, 0, 1]
    const qCamLocal = [0, 0, 0, 1]
    const qRadial = [0, 0, 0, 1]
    const forwardLocal = [0, 0, -1]
    const placeholderRGB = parseColor(PLACEHOLDER, [0, 0, 0, 1])
    const order = []

    gl.clearColor(0, 0, 0, 0)
    gl.enable(gl.DEPTH_TEST)

    /* ------------------------------------------------------------ laco */
    let raf = 0
    let prev = performance.now()

    const frame = () => {
      raf = requestAnimationFrame(frame)

      const now = performance.now()
      const dt = Math.min(0.05, (now - prev) / 1000)
      prev = now

      const L = live.current
      const media = mediaRef.current
      const n = Math.max(0, L.count | 0)
      // uma placa por foto: os indices batem um a um. O modulo continua aqui
      // so como rede de seguranca enquanto a lista ainda esta carregando.
      const mediaFor = (i) => (media.length ? media[i % media.length] : undefined)

      /* -------------------------------------- texturas aposentadas */
      const grave = graveyardRef.current
      while (grave.length) gl.deleteTexture(grave.pop())

      /* ------------------------------------------ contagem de placas */
      while (nodesRT.length < n) nodesRT.push(makeNode())
      if (nodesRT.length > n) nodesRT.length = n
      ensureLines(n)

      /* ------------------------------------------------- viewport */
      gl.viewport(0, 0, vw, vh)
      // depthMask controla a LIMPEZA do buffer de profundidade, nao so a
      // escrita, e o quadro anterior terminou com ela em false
      gl.depthMask(true)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

      /* -------------------------------------------------- camera */
      const lo = Math.min(L.minZoom, L.maxZoom)
      const hi = Math.max(L.minZoom, L.maxZoom)
      orbit.zoomTarget = clamp(orbit.zoomTarget, lo, hi)
      orbit.zoom += (orbit.zoomTarget - orbit.zoom) * (1 - Math.exp(-ZOOM_RATE * dt))
      camDist = orbit.zoom / Math.max(0.001, L.scale)

      const fovRad = (FOV * Math.PI) / 180
      const aspect = vw / vh
      perspective(proj, fovRad, aspect)

      /* --------------------------------------------------- orbita */
      const lim = (L.orbitLimit * Math.PI) / 180
      if (!pointer.dragging) {
        // decaimento exponencial, correto em dt
        const keep =
          L.orbitDamping <= 0 ? 0 : Math.exp((-6 / Math.max(0.001, L.orbitDamping)) * dt)
        orbit.yaw += ((orbit.yawVel * dt * Math.PI) / 180) * keep
        orbit.pitch += ((orbit.pitchVel * dt * Math.PI) / 180) * keep
        orbit.yawVel *= keep
        orbit.pitchVel *= keep

        /* A deriva, no sentido do ultimo arrasto. O yaw da a volta inteira;
           o pitch tem trava de 70 graus, entao ao encostar nela a deriva
           inverte — a esfera desce de volta em vez de congelar no limite. */
        orbit.yaw += orbit.driftYaw * dt
        orbit.pitch += orbit.driftPitch * dt
        if (orbit.pitch > lim) {
          orbit.pitch = lim
          orbit.driftPitch = -Math.abs(orbit.driftPitch)
        } else if (orbit.pitch < -lim) {
          orbit.pitch = -lim
          orbit.driftPitch = Math.abs(orbit.driftPitch)
        }
      }
      orbit.pitch = clamp(orbit.pitch, -lim, lim)
      if (orbit.yaw > Math.PI * 2) orbit.yaw -= Math.PI * 2
      if (orbit.yaw < -Math.PI * 2) orbit.yaw += Math.PI * 2

      const yaw = orbit.yaw
      const pitch = orbit.pitch
      rigView(view, yaw, pitch, camDist)
      mul(viewProj, proj, view)

      const R = rigBasis(yaw, pitch)
      quatFromYawPitch(yaw, pitch, qRig)
      // a camera nao tem rotacao propria, entao a orientacao dela no espaco
      // do rig e simplesmente o inverso do rig
      qCamLocal[0] = -qRig[0]
      qCamLocal[1] = -qRig[1]
      qCamLocal[2] = -qRig[2]
      qCamLocal[3] = qRig[3]
      // a frente da camera e -Z no mundo; R^T leva isso para o local do rig
      applyBasisT(R, 0, 0, -1, forwardLocal)

      const coreR = Math.max(0.001, L.coreSize)

      /* ---------------------------------------------------- nucleo */
      gl.useProgram(solidProg)
      gl.uniformMatrix4fv(sLoc.uMVP, false, viewProj)
      gl.bindBuffer(gl.ARRAY_BUFFER, ballBuf)
      gl.enableVertexAttribArray(sLoc.aPos)
      gl.vertexAttribPointer(sLoc.aPos, 3, gl.FLOAT, false, 0, 0)

      if (L.coreSize > 0.001) {
        const c = parseColor(L.coreColor, [0.48, 0.72, 1, 1])
        gl.disable(gl.BLEND)
        gl.enable(gl.CULL_FACE)
        gl.cullFace(gl.BACK)
        gl.depthMask(true)
        gl.uniform1f(sLoc.uScale, coreR)
        gl.uniform4f(sLoc.uColor, c[0], c[1], c[2], 1)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ballTri)
        gl.drawElements(gl.TRIANGLES, ball.tris.length, gl.UNSIGNED_SHORT, 0)
        gl.disable(gl.CULL_FACE)
      }
      gl.disableVertexAttribArray(sLoc.aPos)

      gl.enable(gl.BLEND)
      gl.depthMask(false)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

      /* O halo em malha e a camada de FORA do nucleo, e e transparente:
       * nao escreve profundidade, entao o depth buffer nao consegue
       * ordena-lo. Ele precisa ser PINTADO no lugar certo — depois de tudo
       * o que esta atras do nucleo, antes de tudo o que esta na frente. */
      const drawHalo = () => {
        if (L.coreGlow <= 0.002) return
        const c = parseColor(L.coreColor, [0.48, 0.72, 1, 1])
        gl.useProgram(solidProg)
        gl.uniformMatrix4fv(sLoc.uMVP, false, viewProj)
        gl.bindBuffer(gl.ARRAY_BUFFER, ballBuf)
        gl.enableVertexAttribArray(sLoc.aPos)
        gl.vertexAttribPointer(sLoc.aPos, 3, gl.FLOAT, false, 0, 0)
        // aditivo pre-multiplicado — e o que faz o halo florescer em vez de
        // ficar uma malha cinza chapada sobre o nucleo
        gl.blendFunc(gl.ONE, gl.ONE)
        gl.uniform1f(sLoc.uScale, coreR * 1.45)
        gl.uniform4f(sLoc.uColor, c[0], c[1], c[2], L.coreGlow)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ballEdge)
        gl.drawElements(gl.LINES, ball.edges.length, gl.UNSIGNED_SHORT, 0)
        gl.disableVertexAttribArray(sLoc.aPos)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      }

      if (!n) {
        gl.disableVertexAttribArray(sLoc.aPos)
        drawHalo()
        return
      }

      /* -------------------------------------------- raio magnetico */
      const hovering = pointer.inside && L.force > 0 && L.hoverDist > 0
      if (hovering) buildRay(camDist, fovRad, aspect)

      /* ------------------------------------------------- disposicao */
      const worldPerPixel = (2 * Math.tan(fovRad / 2)) / vh

      for (let i = 0; i < n; i++) {
        const nd = nodesRT[i]

        // --- casca de Fibonacci / espiral aurea ----------------
        // (i + 0.5)/n, e nao i/(n-1): a forma com extremos duplica um ponto
        // em cada polo e deixa um anel careca embaixo dele
        const y = 1 - (2 * (i + 0.5)) / n
        const rr = Math.sqrt(Math.max(0, 1 - y * y))
        const th = GOLDEN_ANGLE * i
        const jitter = 1 + (hash01(i) - 0.5) * L.depthRand
        const Rr = L.radius * jitter

        const bx = Math.cos(th) * rr * Rr
        const by = y * Rr
        const bz = Math.sin(th) * rr * Rr

        // --- atracao magnetica ---------------------------------
        let capture = 0
        let tx = 0
        let ty = 0
        let tz = 0
        if (hovering) {
          applyBasis(R, bx, by, bz, tmpA)
          const wx = tmpA[0]
          const wy = tmpA[1]
          const wz = tmpA[2]
          const t = Math.max(
            0,
            (wx - rayO[0]) * rayD[0] + (wy - rayO[1]) * rayD[1] + (wz - rayO[2]) * rayD[2],
          )
          const cx = rayO[0] + rayD[0] * t
          const cy = rayO[1] + rayD[1] * t
          const cz = rayO[2] + rayD[2] * t
          const d = Math.hypot(cx - wx, cy - wy, cz - wz)
          if (d < L.hoverDist) {
            const u = 1 - d / L.hoverDist
            capture = u * u * (3 - 2 * u) // smoothstep
            applyBasisT(R, cx - wx, cy - wy, cz - wz, tmpA)
            const k = capture * L.force
            tx = tmpA[0] * k
            ty = tmpA[1] * k
            tz = tmpA[2] * k
            // e levanta a placa na direcao de quem olha, para a capturada
            // ler como solta da casca, e nao so deslizada por cima dela
            const pop = -k * L.radius * 0.12
            tx += forwardLocal[0] * pop
            ty += forwardLocal[1] * pop
            tz += forwardLocal[2] * pop
          }
        }

        // --- mola ate esse alvo --------------------------------
        const damp = 2 + DAMPING * 16
        nd.vx += (tx - nd.ox) * SPRING_STIFFNESS * dt
        nd.vy += (ty - nd.oy) * SPRING_STIFFNESS * dt
        nd.vz += (tz - nd.oz) * SPRING_STIFFNESS * dt
        const decay = Math.exp(-damp * dt)
        nd.vx *= decay
        nd.vy *= decay
        nd.vz *= decay
        nd.ox += nd.vx * dt
        nd.oy += nd.vy * dt
        nd.oz += nd.vz * dt

        const px = bx + nd.ox
        const py = by + nd.oy
        const pz = bz + nd.oz
        nd.px = px
        nd.py = py
        nd.pz = pz

        // --- orientacao ----------------------------------------
        const radLen = Math.hypot(px, py, pz) || 1
        quatFromZTo(px / radLen, py / radLen, pz / radLen, qRadial)
        quatSlerp(qRadial, qCamLocal, BILLBOARD_BLEND, nd.q)

        // --- tamanho -------------------------------------------
        const m = mediaFor(i)
        const aspectI = m?.aspect || 1
        const s = L.itemSize * (1 + HOVER_POP * capture)
        nd.hx = (s * aspectI) / 2
        nd.hy = s / 2

        order[i] = i
      }
      order.length = n

      /* --------------------------------------------------- placas
       * De tras para a frente. Quad transparente nao escreve profundidade,
       * entao a unica coisa que poe o lado de la atras do lado de ca e esta
       * ordenacao.
       */
      const depthOf = (nd) => R[6] * nd.px + R[7] * nd.py + R[8] * nd.pz
      order.sort((a, b) => depthOf(nodesRT[a]) - depthOf(nodesRT[b]))

      /* Onde a fila ordenada cruza o nucleo. Ele esta na origem, entao placa
         com z < 0 esta atras e z >= 0 esta na frente. */
      let split = 0
      while (split < n && depthOf(nodesRT[order[split]]) < 0) split++

      /* --------------------------------------------------- fios */
      for (let o = 0; o < n; o++) {
        const nd = nodesRT[order[o]]
        const len = Math.hypot(nd.px, nd.py, nd.pz) || 1
        const k = coreR / len
        lineData[o * 6 + 0] = nd.px * k
        lineData[o * 6 + 1] = nd.py * k
        lineData[o * 6 + 2] = nd.pz * k
        lineData[o * 6 + 3] = nd.px
        lineData[o * 6 + 4] = nd.py
        lineData[o * 6 + 5] = nd.pz
      }
      if (L.lineOpacity > 0.002) {
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData)
      }

      const drawStrings = (from, count) => {
        if (count <= 0 || L.lineOpacity <= 0.002) return
        const c = parseColor(L.lineColor, [0.29, 0.42, 0.6, 1])
        gl.useProgram(solidProg)
        gl.uniformMatrix4fv(sLoc.uMVP, false, viewProj)
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf)
        gl.enableVertexAttribArray(sLoc.aPos)
        gl.vertexAttribPointer(sLoc.aPos, 3, gl.FLOAT, false, 0, 0)
        gl.uniform1f(sLoc.uScale, 1)
        gl.uniform4f(sLoc.uColor, c[0], c[1], c[2], L.lineOpacity)
        gl.drawArrays(gl.LINES, from * 2, count * 2)
        gl.disableVertexAttribArray(sLoc.aPos)
      }

      const beginQuads = () => {
        gl.useProgram(quadProg)
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
        gl.enableVertexAttribArray(qLoc.aCorner)
        gl.vertexAttribPointer(qLoc.aCorner, 2, gl.FLOAT, false, 0, 0)
        gl.uniform1i(qLoc.uMap, 0)
        gl.uniform3f(
          qLoc.uPlaceholder,
          placeholderRGB[0],
          placeholderRGB[1],
          placeholderRGB[2],
        )
        gl.uniform1f(qLoc.uOpacity, 1)
        gl.activeTexture(gl.TEXTURE0)
      }

      const drawQuads = (from, to) => {
        for (let o = from; o < to; o++) {
          const i = order[o]
          const nd = nodesRT[i]
          const m = mediaFor(i)

          // upload preguicoso: a imagem decodificou no efeito de midia, mas
          // so o laco tem o contexto
          if (m && m.image && !m.texture) {
            m.texture = upload(m.image)
            m.applied = false
            m.image = null
          }

          const aspectI = m?.aspect || 1
          const hasTex = m && m.texture ? 1 : 0
          gl.bindTexture(gl.TEXTURE_2D, hasTex ? m.texture : white)
          gl.uniform1f(qLoc.uHasTex, hasTex)
          if (hasTex) {
            gl.uniform2f(qLoc.uHalf, aspectI / 2, 0.5)
            gl.uniform1f(qLoc.uRadius, L.rounded * Math.min(aspectI / 2, 0.5))
          } else {
            gl.uniform2f(qLoc.uHalf, 0.5, 0.5)
            gl.uniform1f(qLoc.uRadius, L.rounded * 0.5)
          }

          const sy = nd.hy * 2
          const sx = nd.hx * 2
          compose(model, nd.px, nd.py, nd.pz, nd.q, sx, sy, 1)
          mul(mvp, viewProj, model)
          gl.uniformMatrix4fv(qLoc.uMVP, false, mvp)

          // --- sombreado por profundidade ------------------------
          const depth = R[6] * nd.px + R[7] * nd.py + R[8] * nd.pz
          const tt = clamp((depth + L.radius) / (2 * L.radius), 0, 1)
          gl.uniform1f(qLoc.uDim, DEPTH_FLOOR + (1 - DEPTH_FLOOR) * tt)

          // um pixel de tela, nas unidades da propria SDF
          const dist = Math.max(0.001, camDist - depth)
          gl.uniform1f(qLoc.uAA, (worldPerPixel * dist) / Math.max(1e-4, sy))

          gl.drawArrays(gl.TRIANGLES, 0, 6)
        }
      }

      /* ------------------------------------------- ordem de pintura
       * Tudo o que esta atras do nucleo, depois a malha dele, depois tudo o
       * que esta na frente.
       */
      drawStrings(0, split)
      beginQuads()
      drawQuads(0, split)
      gl.disableVertexAttribArray(qLoc.aCorner)

      drawHalo()

      drawStrings(split, n - split)
      beginQuads()
      drawQuads(split, n)
      gl.disableVertexAttribArray(qLoc.aCorner)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)

      gl.deleteBuffer(quadBuf)
      gl.deleteBuffer(ballBuf)
      gl.deleteBuffer(ballTri)
      gl.deleteBuffer(ballEdge)
      gl.deleteBuffer(lineBuf)
      gl.deleteTexture(white)
      mediaRef.current.forEach((m) => {
        if (m.texture) gl.deleteTexture(m.texture)
        m.texture = null
      })
      while (graveyardRef.current.length) {
        gl.deleteTexture(graveyardRef.current.pop())
      }
      gl.deleteProgram(quadProg)
      gl.deleteProgram(solidProg)
      // nunca loseContext(): getContext devolve o MESMO contexto por canvas,
      // e uma remontagem em StrictMode reusaria um contexto perdido a forca
    }
    // montado uma vez — toda entrada viva e lida de `live.current`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* -------------------------------------------------------------- render */
  return (
    <div
      ref={hostRef}
      className={className}
      role="img"
      aria-label={rotulo}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background,
        isolation: 'isolate',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  )
}
