import { useEffect, useRef } from 'react'

/**
 * GLOBO — o mundo em letras, desenhado num canvas 2D.
 *
 * Peca de terceiro (Globe Study, da Originkit), trazida praticamente
 * como veio: os nomes curtos e a matematica dentro do `render` sao do
 * autor. Traduzir variavel por variavel num codigo assim — projecao,
 * rotacao e ordenacao por profundidade no mesmo laco — daria um
 * diff enorme e nenhuma clareza a mais. O que mudou foi so o contorno:
 *
 *   - saiu o TypeScript (o projeto e JS puro);
 *   - a caixa deixou de exigir 1200x800 e passou a ocupar o espaco que
 *     recebe, porque aqui ela mora dentro de um painel;
 *   - o fundo vem transparente por padrao, para o globo pousar sobre o
 *     vidro da tela em vez de abrir um retangulo preto no modo claro.
 *
 * O mapa dos continentes e um bitmap de 288x144 bits (5184 bytes) em
 * base64: cada bit diz se aquele pedaco de lat/lon e terra. E o que
 * decide onde as letras aparecem — elas nascem so em terra firme.
 *
 * Arrastar gira o globo; clicar crava um alfinete. O zoom pela roda do
 * mouse vem DESLIGADO no uso da tela inicial (`pointer={{ zoom: 0 }}`):
 * ligado, ele engoliria a rolagem da pagina de quem so passou o cursor
 * por cima.
 */

const MAX_DPR = 2
const FACE = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const QA = Math.PI / 36
const VOLTA = Math.PI * 2

/* O mapa entra espelhado no eixo horizontal.

   O espelho e aplicado na LONGITUDE, e nao no desenho: virar o canvas
   com um scale(-1, 1) inverteria tambem as letras, e um globo escrito
   ao contrario nao e um globo invertido — e um globo quebrado. Trocando
   o sinal da longitude, a geografia troca de lado e cada letra continua
   a ser lida da esquerda para a direita. */
const ESPELHO = -1
const MW = 288
const MH = 144

const LAND_B64 =
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPcBAOD/HwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA" +
    "//+P//f/LwgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4/v/4/////wcAAAAEAPABAAAAfAAAAAAAAAAAAAAAAAAAAADg9w/4" +
    "/////wEAAP4AAAAAAAAA+AAAAAAAAAAAAAAAAAAAAIAG+Of//////wAAAHwGAAAAAAAAAAMAAAAAAAAAAAAAAACABwAc/4P/////" +
    "/wAAADAAAAAAQAAAAD4AAAAAAAAAAAAAAAAAfMbDcQAA/v///wAAAAAAAADABwAA//8HAMAPAAAAAAAAAABgAAAAAAAA/P///wAA" +
    "AAAAAABwAADg//8AAAAAAAAAAAAAAADwG457dwcA8P//HwAAAAAAAAAYAAD///9/eAAAAAAAAAAAAAD4/g0H/w8A8P//PwAAAAAA" +
    "AAAOgOv/////fwD/AAAAAAA/AAAA/B84/v8A8P//LwAAAAD4AAAA4PP//////////wAAAOD///H/+D/3cPgDoP//DwAAAID/BwAA" +
    "x/v/////////P4AA/P///////////////////////w8AAOcBAAgAAAAAAAAAAAAAgP///////////////////////wcAACYAAAQA" +
    "AAAAAAAAAAAAgf///////////////////////wMM8AAAAAAAAAAAAAAAAAAAIID/////////e+wPwH8AgA8AAP/5z///////////" +
    "//////8/ANH///////9/AIALgD8AAAAAwH/+//////////////////9/APj///////8fADwAAD8AAAAA8D/+////////////////" +
    "//sPAPC/+f////8fAPwAADgAAAAA8D/+////////////////D/wBAMCfAP////8PAPwYAAAAAAAA8H/4//////////////9/DgcA" +
    "AAAcAOD///8/APw/AAAAAAAQAB7w//////////////8BgAMAAAACAMD/////Afh/AAAAAAA4gBz+/////////////38A4AMAAMAA" +
    "AMD/////B/z/AAAAAABwwAb+/////////////x8A8AEAAAAAAAD/////P///AwAAAADmgOH//////////////z8A4AAAAAAAAAD+" +
    "////P/7/BwAAAAD28P////////////////8D4AAAAAAAAAD8////f/7/BwAAAADz+f////////////////8HIAAAAAAAAAD6////" +
    "////BAAAAABw/v////////////////8EAAAAAAAAAADo//////8jHgAAAACA//////////////////8MAAAAAAAAAADQ//////8O" +
    "PgAAAADw//////////////////8AAAAAAAAAAADg//////+PIAAAAADA////v////////////38EAAAAAAAAAADg////////AAAA" +
    "AACA//v/zD/8/////////z8AAAAAAAAAAADg//////8bAAAAAACA//N/gD///////////x8GAAAAAAAAAADw//////8AAAAAAAD+" +
    "B8c/AD/+/////////wcPAAAAAAAAAADg//////8AAAAAAAD+gx4/DH74/////////wABAAAAAAAAAADg/////x8AAAAAAAD+gbCn" +
    "///8////////fQABAAAAAAAAAADg/////w8AAAAAAAD/gCDn///4//////9/MgADAAAAAAAAAADA/////w8AAAAAAAD+AADm/3/4" +
    "//////8/cIABAAAAAAAAAADA/////wcAAAAAAAA44AHC///5////////4+ABAAAAAAAAAACA/////wcAAAAAAACI/wEA4P//////" +
    "////4OgAAAAAAAAAAAAA/////wMAAAAAAAD4/wAA4P//////////ADYAAAAAAAAAAAAA/P///wEAAAAAAAD+/wEA8P//////////" +
    "AQcAAAAAAAAAAAAA+P//fwAAAAAAAAD//w8P8P//////////AQEAAAAAAAAAAAAAyP//fwAAAAAAAAD//3//////////////AQAA" +
    "AAAAAAAAAAAA0P+PYQAAAAAAAAD//////z//////////AwAAAAAAAAAAAAAAoP8HwAAAAAAAAMD/////83/+////////AQAAAAAA" +
    "AAAAAAAAIP8DwAAAAAAAAOD/////5//I////////AAAAAAAAAAAAAAAAQP4DgAAAAAAAAPD/////z/+A////////AAAAAAAAAAAA" +
    "AAAAAPwDAAIAAAAAAPD/////z/8ZwP////9/AQAAAAAAAAAAAAAAAPgDQAAAAAAAAPj/////j/9/gP////8fAQAAAAAAAAAAAAAA" +
    "APADEAMAAAAAAPz/////v///AP9//P8DAAAAAAAAAAAAAAAAAPADAwwAAAAAAPj/////P/9/APw//B8AAAAAAAAAAAAIAAAAAPCH" +
    "A8AAAAAAAPj/////P/4/APwP+J8BAAAAAAAAAAAAAAAAAMD/A0YEAAAAAPj/////f/4fAPwH+B8AAwAAAAAAAAAAAAAAAAD/AQAA" +
    "AAAAAPj/////f/wHAPgD8D8AAwAAAAAAAAAAAAAAAADgHwAAAAAAAPj///////wDAPgAwH8AAQAAAAAAAAAAAAAAAADAHwAAAAAA" +
    "APz//////30AAPAAwH8AAAAAAAAAAAAAAAAAAAAAHAAAAAAAAPj//////wsAAPAAgH4AAQAAAAAAAAAAAAAAAAAAGEAAAAAAAPj/" +
    "/////wMBAPAAgHwAAAAAAAAAAAAAAAAAAAAAGPAhAAAAAPD///////cBAOAAgDiABAAAAAAAAAAAAAAAAAAAIPl/AAAAAOD/////" +
    "//8AAGABABBAFAAAAAAAAAAAAAAAAAAAgP7/AQAAAMD///////8AAAABgAAAHAAAAAAAAAAAAAAAAAAAAPz/AQAAAID///////8A" +
    "AAABAAEgCAAAAAAAAAAAAAAAAAAAAPz/HwAAAAD/8P///38AAAAAAANgAAAAAAAAAAAAAAAAAAAAAPz/fwAAAAAAoP///z8AAAAA" +
    "YAd4AAAAAAAAAAAAAAAAAAAAAPz/fwAAAAAAAP///x8AAAAAwAY8AAAAAAAAAAAAAAAAAAAAAP7//wAAAAAAAP///w8AAAAAgAc+" +
    "AAAAAAAAAAAAAAAAAAAAAP///wAAAAAAAP///wcAAAAAgIM/TwAAAAAAAAAAAAAAAAAAAP///wEAAAAAgP///wMAAAAAAIc/QAQA" +
    "AAAAAAAAAAAAAAAAgP///w8AAAAAgP///wEAAAAAAA6fAUQAAAAAAAAAAAAAAAAAAP////8AAAAAAP///wAAAAAAAB6ewuwDAgAA" +
    "AAAAAAAAAAAAgP////8DAAAAAP7//wAAAAAAABwAAvAPAgAAAAAAAAAAAAAAgP////8PAAAAAPz/fwAAAAAAABAAAMCfAQAAAAAA" +
    "AAAAAAAAAP////8PAAAAAPz//wAAAAAAAOADAIA/MAAAAAAAAAAAAAAAAP7///8PAAAAAPz/fwAAAAAAAAAPAMBngAAAAAAAAAAA" +
    "AAAAAP7///8PAAAAAPz//wAAAAAAAAAACABAAAAAAAAAAAAAAAAAAPz///8HAAAAAPj//wAAAAAAAAAAAAAAAAIAAAAAAAAAAAAA" +
    "APz///8DAAAAAPj//wAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAPj///8BAAAAAPz//4AAAAAAAAAAAB8GAAAAAAAAAAAAAAAAAPj/" +
    "//8BAAAAAPz//8EAAAAAAAAAIB8OAAAAAAAAAAAAAAAAAPD///8BAAAAAP7//+AAAAAAAAAA+B8OACAAAAAAAAAAAAAAAMD///8B" +
    "AAAAAP7/f/gAAAAAAAAA/H8eAAAAAAAAAAAAAAAAAID///8AAAAAAP7/H/gAAAAAAAAA/P8fAABAAAAAAAAAAAAAAAD///8AAAAA" +
    "APz/D3AAAAAAAAAA/v8/AAAAAAAAAAAAAAAAAAD///8AAAAAAPj/D3gAAAAAAADA//9/AAgAAAAAAAAAAAAAAAD//38AAAAAAPj/" +
    "DzgAAAAAAADw////AAAAAAAAAAAAAAAAAAD//x8AAAAAAPD/DzgAAAAAAAD4////AQAAAAAAAAAAAAAAAAD//wMAAAAAAPD/DzgA" +
    "AAAAAAD4////AwAAAAAAAAAAAAAAAID//wEAAAAAAPD/AwAAAAAAAAD4////AwAAAAAAAAAAAAAAAID//wEAAAAAAPD/AwAAAAAA" +
    "AAD4////BwAAAAAAAAAAAAAAAID//wEAAAAAAOD/AwAAAAAAAAD4////BwAAAAAAAAAAAAAAAID//wAAAAAAAOD/AQAAAAAAAADw" +
    "////BwAAAAAAAAAAAAAAAID//wAAAAAAAMD/AAAAAAAAAADw////AwAAAAAAAAAAAAAAAID/fwAAAAAAAIB/AAAAAAAAAADgf/z/" +
    "AwAAAAAAAAAAAAAAAID/PwAAAAAAAIA/AAAAAAAAAADgB/D/AQAAAAAAAAAAAAAAAMD/HQAAAAAAAIABAAAAAAAAAADwAND/AQAA" +
    "AAAAAAAAAAAAAMD/AwAAAAAAAAAAAAAAAAAAAAAAAID/AAAIAAAAAAAAAAAAAMD/BwAAAAAAAAAAAAAAAAAAAAAAAAD/AAAQAAAA" +
    "AAAAAAAAAOD/AwAAAAAAAAAAAAAAAAAAAAAAAAA+AABwAAAAAAAAAAAAAOA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAA" +
    "AAAAAOA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAOAPAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAGAAAAAAAAAAAA" +
    "AMAPAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAADAAAAAAAAAAAAAPAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMABAAAAAAAAAAAAAPAD" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAOABAAAAAAAAAAAAAPAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAHAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPADAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAPABAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPCBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGABAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAA" +
    "AAAAAAAAAAAAAAAcAAAAAAAAAAAAAAA+AABAAJ8//j8PAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAPD/fwD///////8/AAAAAAAA" +
    "AAAAAAAAAIA+AAAAAAAAAAAAPP///8D/////////HwAAAAAAAAAAAAAAAIA9AAAAAAAA8Pz/////P/j//////////wMAAAAAAAAA" +
    "AMAAAPB9AAAAAID/////////P/7///////////8BAAAAAAAAAOABAwB/AAAAAPD///////////////////////8AAAAAAFACPoD/" +
    "//9/AAAAAPD//////////////////////x8AAAAA+P////////8HAAAAAP///////////////////////wcAAAAA/v///////wMA" +
    "AAAA/v///////////////////////wcAAAD8/////////w8AAA7w/////////////////////////w8AAMAB/////////wMAgB84" +
    "/////////////////////////wEAAAAA/P///////3/w4AcA/////////////////////////wAAAADg//////////8/gM//////" +
    "/////////////////////wMAAADg/////////////f///////////////////////////z8A7wMA/v//////////////////////" +
    "//////////////////8/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAA"

function num(v, fb) {
    return typeof v === "number" && isFinite(v) ? v : fb
}

function clampN(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v
}

function parseRGB(input, fb) {
    if (!input) return fb
    const str = String(input).trim()
    if (str.charAt(0) === "#") {
        let hex = str.slice(1)
        if (hex.length === 3 || hex.length === 4) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
        }
        if (hex.length >= 6) {
            const r = parseInt(hex.slice(0, 2), 16)
            const g = parseInt(hex.slice(2, 4), 16)
            const b = parseInt(hex.slice(4, 6), 16)
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b]
        }
        return fb
    }
    const m = str.match(/[\d.]+/g)
    if (m && m.length >= 3) return [+m[0], +m[1], +m[2]]
    return fb
}

const GLOBE_DEFAULTS = { radius: 100, drift: 210, letters: 100 }
const POINTER_DEFAULTS = { zoom: 100, light: 100, pins: 7 }

export default function Globo(props) {
    const {
        style,
        background = "transparent",
        baseColor = "#E2E4E9",
        phrase = "everypointonthisballisapathbacktoanotherone",
        density = 53,
        glyphSize = 90,
        speed = 100,
        hover = 100,
        globe,
        pointer,
        marcas,
        aoTocarMarca,
        parado = false,
        width,
        height,
    } = props

    const globe_ = { ...GLOBE_DEFAULTS, ...(globe || {}) }
    const pointer_ = { ...POINTER_DEFAULTS, ...(pointer || {}) }

    const canvasRef = useRef(null)
    const sizeRef = useRef({ w: 0, h: 0 })
    sizeRef.current = { w: num(width, 0), h: num(height, 0) }

    const ptrRef = useRef({
        on: 0,
        x: -1e9,
        y: -1e9,
        dragging: 0,
        dx: 0,
        dy: 0,
        moved: 0,
        click: 0,
    })

    /* As marcas mudam com os dados (uma obra fecha, outra abre) e o laco
       de desenho nasce uma vez so. Como as cores e o tema, elas passam
       por uma ref lida a cada quadro — nao por dependencia de efeito,
       que reiniciaria o globo do zero a cada carga do quadro. */
    const marcasRef = useRef([])
    marcasRef.current = Array.isArray(marcas) ? marcas : []

    /* o que fazer quando o dedo acerta uma marca. Guardado em ref pelo
       mesmo motivo das marcas: o laco de desenho nasce uma vez. */
    const aoTocarRef = useRef(null)
    aoTocarRef.current = aoTocarMarca ?? null

    /* onde cada marca ficou na TELA no ultimo quadro desenhado. E por
       esta lista que o clique descobre em qual delas bateu: refazer a
       projecao no clique daria outro resultado, porque entre o desenho
       e o clique o globo ja girou. */
    const alvosRef = useRef([])

    const vRef = useRef({})
    vRef.current = {
        base: baseColor,
        phrase: String(phrase || "").length ? String(phrase) : "globe",
        density: clampN(num(density, 100), 40, 200) / 100,
        glyphSize: clampN(num(glyphSize, 100), 20, 300) / 100,
        speed: clampN(num(speed, 50), 0, 100) / 50,
        hover: clampN(num(hover, 100), 0, 200) / 100,
        radius: clampN(num(globe_.radius, 100), 40, 200) / 100,
        drift: clampN(num(globe_.drift, 100), 0, 400) / 100,
        letters: clampN(num(globe_.letters, 100), 0, 200) / 100,
        zoom: clampN(num(pointer_.zoom, 100), 0, 300) / 100,
        light: clampN(num(pointer_.light, 100), 0, 300) / 100,
        pins: Math.round(clampN(num(pointer_.pins, 7), 0, 24)),
        /* o globo fica quieto enquanto ha uma obra aberta na nuvem:
           ler uma ficha ancorada num ponto que continua andando e
           perseguir a informacao com os olhos */
        parado: parado ? 1 : 0,
    }

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return undefined
        const ctx = canvas.getContext("2d")
        if (!ctx) {
            console.error("Globo: contexto 2D indisponível")
            return undefined
        }

        let land = null
        try {
            const bin = atob(LAND_B64)
            land = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) land[i] = bin.charCodeAt(i)
        } catch {
            land = null
        }
        const isLand = (lon, lat) => {
            if (!land) return false
            const gx = Math.floor(((lon + 180) / 360) * MW)
            const gy = Math.floor(((90 - lat) / 180) * MH)
            if (gx < 0 || gx >= MW || gy < 0 || gy >= MH) return false
            const b = gy * MW + gx
            return ((land[b >> 3] >> (b & 7)) & 1) === 1
        }

        /**
         * Onde cada obra pousa no globo.
         *
         * O sistema nao guarda a coordenada de obra nenhuma — guarda
         * cliente, etapa e prazo. Entao o lugar e SORTEADO a partir do
         * id: o mesmo id cai sempre no mesmo ponto, em toda maquina e
         * em toda sessao, porque o sorteio e uma conta sobre o id e nao
         * um Math.random(). Uma obra que muda de cor (fechou) nao muda
         * de lugar, que e o que faz o globo ser lido como um mapa e nao
         * como um enfeite que se remexe.
         *
         * O ponto sorteado e rejeitado ate cair em TERRA. Marca no meio
         * do Pacifico ninguem entende como obra.
         */
        const ondeFica = new Map()
        const lugarDaChave = (chave) => {
            if (ondeFica.has(chave)) return ondeFica.get(chave)
            const texto = String(chave)
            let h = 2166136261
            for (let i = 0; i < texto.length; i++) {
                h ^= texto.charCodeAt(i)
                h = Math.imul(h, 16777619)
            }
            let a = h >>> 0
            const passo = () => {
                a = (Math.imul(a, 1664525) + 1013904223) >>> 0
                return a
            }
            let ponto = null
            for (let t = 0; t < 400 && !ponto; t++) {
                const lon = (passo() % 36000) / 100 - 180
                /* fora das calotas: perto dos polos a projecao amontoa
                   tudo num ponto so e as marcas se empilham */
                const lat = (passo() % 12000) / 100 - 60
                if (isLand(lon, lat)) {
                    ponto = { lat: (lat * Math.PI) / 180, lon: (lon * Math.PI) / 180 }
                }
            }
            ondeFica.set(chave, ponto)
            return ponto
        }

        /* parseRGB por marca, a cada quadro, seria a mesma conta 60x por
           segundo para as duas cores de sempre */
        const tintas = new Map()
        const tinta = (cor) => {
            if (!tintas.has(cor)) tintas.set(cor, parseRGB(cor, [255, 255, 255]))
            return tintas.get(cor)
        }

        let nodes = []
        let builtKey = ""
        const build = (dens, letterK, text) => {
            const step = 3.05 / dens
            nodes = []
            let k = 0
            let run = 0
            let sea3 = 0
            const every = letterK <= 0 ? 0 : Math.max(1, Math.round(2 / letterK))
            for (let lat = -86; lat <= 86; lat += step) {
                const rl = Math.cos((lat * Math.PI) / 180)
                const n = Math.max(1, Math.round(98 * dens * rl))
                for (let i = 0; i < n; i++) {
                    const lon = -180 + (360 * i) / n
                    const l = isLand(ESPELHO * lon, lat)
                    if (!l && sea3++ % 2) continue
                    let letter = ""
                    if (l && every && run++ % every === 0) letter = text.charAt(k++ % text.length)
                    nodes.push({ lat: (lat * Math.PI) / 180, lon: (lon * Math.PI) / 180, land: l, c: letter })
                }
            }
            builtKey = dens + "|" + letterK + "|" + text
        }

        const pins = []
        const view = { cx: 0, cy: 0, R: 1, cs: 1, sn: 0, ct: 1, st: 0 }

        const unproject = (px, py) => {
            const x1 = (px - view.cx) / view.R
            const y2 = (view.cy - py) / view.R
            const q = 1 - x1 * x1 - y2 * y2
            if (q <= 0.002) return null
            const z2 = Math.sqrt(q)
            const y0 = y2 * view.ct + z2 * view.st
            const z1 = -y2 * view.st + z2 * view.ct
            const x0 = x1 * view.cs + z1 * view.sn
            const z0 = -x1 * view.sn + z1 * view.cs
            return { lat: Math.asin(clampN(y0, -1, 1)), lon: Math.atan2(z0, x0) }
        }

        let raf = 0
        let last = performance.now()
        let clock = 0
        let spin = 2.1
        let vel = -0.16
        let tilt = -0.36
        let vtilt = 0
        let zoom = 1
        let zoomT = 1
        let seenClick = 0
        const sea = []
        const soil = []
        const land8 = []

        const render = (now) => {
            const dt = Math.min(0.05, (now - last) / 1000)
            last = now
            const v = vRef.current
            const sp = v.speed
            clock += dt * sp

            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
            const cw = sizeRef.current.w || canvas.clientWidth || 1200
            const ch = sizeRef.current.h || canvas.clientHeight || 800
            const bw = Math.max(1, Math.round(cw * dpr))
            const bh = Math.max(1, Math.round(ch * dpr))
            if (canvas.width !== bw || canvas.height !== bh) {
                canvas.width = bw
                canvas.height = bh
            }

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.clearRect(0, 0, cw, ch)

            const key = v.density + "|" + v.letters + "|" + v.phrase
            if (key !== builtKey) build(v.density, v.letters, v.phrase)

            const u = Math.min(cw, ch)
            const ptr = ptrRef.current
            const hv = v.hover * (ptr.on ? 1 : 0)

            zoom += (zoomT - zoom) * Math.min(1, dt / 0.18)

            const cx = cw / 2
            const cy = ch / 2 + u * 0.035
            const R = u * 0.318 * zoom * v.radius
            const fs = u * 0.0275 * Math.pow(zoom, 0.72) * v.glyphSize

            if (ptr.dragging) {
                /* O SINAL acompanha o espelho do mapa.

                   Com a longitude negada (ESPELHO), o mesmo giro faz os
                   continentes andarem para o lado contrario na tela — e o
                   arrasto passou a puxar o globo para o lado oposto ao da
                   mao. Negar aqui devolve o gesto: para onde a mao vai, a
                   terra vai junto. */
                const dspin = -(ptr.dx * u) / R
                /* e o vertical junto: arrastar para baixo tem de trazer
                   o polo sul para a frente, e nao empurra-lo para longe */
                const dtilt = (ptr.dy * u) / R
                ptr.dx = 0
                ptr.dy = 0
                spin += dspin
                /* sem trava: o arrasto vertical da a volta inteira, como
                   o horizontal sempre deu. O tilt so volta ao intervalo
                   de uma volta para nao crescer sem fim ao longo do dia
                   — cos e sen nao veem diferenca, o numero ve. */
                tilt = (tilt + dtilt) % VOLTA

                const k = Math.min(1, dt / 0.07)
                const inv = 1 / Math.max(dt, 1 / 240)
                vel += (clampN(dspin * inv, -9, 9) - vel) * k
                vtilt += (clampN(dtilt * inv, -9, 9) - vtilt) * k
            } else {
                /* parado NAO congela o quadro: a inercia ainda morre
                   suavemente, senao o globo trava no meio do movimento
                   como se a pagina tivesse pendurado */
                /* negativo = anti-horario. O sinal e a unica diferenca
                   entre a Terra girando para um lado ou para o outro. */
                const idle = v.parado ? 0 : -0.16 * v.drift * (hv > 0 ? 0.28 : 1)
                vel += (idle - vel) * Math.min(1, (dt * sp) / (v.parado ? 0.25 : 0.9))
                vtilt *= Math.exp(-dt * sp * 6.6)
                /* a inercia vertical desacelera sozinha, mas nao e mais
                   puxada de volta para a inclinacao de fabrica: quem
                   virou o globo de cabeca para baixo quis isso, e ver o
                   mundo se endireitar sozinho seria desfazer o gesto */
                tilt = (tilt + vtilt * dt * sp) % VOLTA
                spin += vel * dt * sp
            }

            if (ptr.click !== seenClick) {
                seenClick = ptr.click

                /* TODAS as marcas sob o dedo, e nao so a mais proxima:
                   duas obras do mesmo cliente caem no mesmo ponto, e
                   escolher uma delas por um pixel de diferenca seria
                   esconder a outra sem avisar. Quem escolhe e a pessoa,
                   na nuvem que abre. */
                const acertadas = []
                let perto = null
                let menor = Infinity
                for (const alvo of alvosRef.current) {
                    const dx = ptr.x - alvo.px
                    const dy = ptr.y - alvo.py
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist > alvo.alcance) continue
                    acertadas.push(alvo.chave)
                    if (dist < menor) {
                        menor = dist
                        perto = alvo
                    }
                }

                if (acertadas.length > 0 && aoTocarRef.current) {
                    /* clique em obra NAO crava alfinete: seria deixar um
                       enfeite por cima do dado que a pessoa foi abrir */
                    aoTocarRef.current(acertadas, {
                        x: perto.px,
                        y: perto.py,
                        largura: cw,
                        altura: ch,
                    })
                } else {
                    const g = unproject(ptr.x, ptr.y)
                    const cap = v.pins
                    if (g && cap > 0) {
                        pins.push({ lat: g.lat, lon: g.lon, t: clock })
                        while (pins.length > cap) pins.shift()
                    }
                }
            }

            const cs = Math.cos(spin)
            const sn = Math.sin(spin)
            const ct = Math.cos(tilt)
            const st = Math.sin(tilt)
            view.cx = cx
            view.cy = cy
            view.R = R
            view.cs = cs
            view.sn = sn
            view.ct = ct
            view.st = st

            const lightK = v.light * hv
            const lx = lightK > 0 && !ptr.dragging ? ptr.x : -1e9
            const ly = lightK > 0 && !ptr.dragging ? ptr.y : -1e9
            const lr = u * 0.2
            const lr2 = lr * lr

            const ink = parseRGB(v.base, [226, 228, 233])
            const rgb = ink[0] + "," + ink[1] + "," + ink[2]
            const tone = (a) => "rgba(" + rgb + "," + clampN(a, 0, 1).toFixed(3) + ")"

            ctx.textAlign = "center"
            ctx.textBaseline = "middle"

            sea.length = 0
            soil.length = 0
            for (let bi = 0; bi < 8; bi++) if (land8[bi]) land8[bi].length = 0

            for (let i = 0; i < nodes.length; i++) {
                const nd = nodes[i]
                const cl = Math.cos(nd.lat)
                const x0 = cl * Math.cos(nd.lon)
                const y0 = Math.sin(nd.lat)
                const z0 = cl * Math.sin(nd.lon)
                const x1 = x0 * cs - z0 * sn
                const z1 = x0 * sn + z0 * cs
                const y2 = y0 * ct - z1 * st
                const z2 = y0 * st + z1 * ct
                if (z2 <= 0.02) continue

                const px = cx + x1 * R
                const py = cy - y2 * R
                const ddx = px - lx
                const ddy = py - ly
                const glow = ddx * ddx + ddy * ddy < lr2 ? (1 - Math.sqrt(ddx * ddx + ddy * ddy) / lr) * lightK : 0
                if (!nd.land) {
                    sea.push(px, py, Math.min(0.999, z2 + glow * 0.55))
                    continue
                }
                if (!nd.c) {
                    soil.push(px, py, Math.min(0.999, z2 + glow * 0.55))
                    continue
                }

                const tx0 = -Math.sin(nd.lon)
                const tz0 = Math.cos(nd.lon)
                const tx1 = tx0 * cs - tz0 * sn
                const tz1 = tx0 * sn + tz0 * cs
                const ang = Math.round(Math.atan2(tz1 * st, tx1) / QA) * QA
                const b = Math.min(7, Math.max(0, (Math.min(0.999, z2 + glow * 0.6) * 7.99) | 0))
                ;(land8[b] || (land8[b] = [])).push(px, py, ang, i)
            }

            const dmin = Math.max(0.7, u * 0.0029)
            const dots = (list, baseA, gain, grow) => {
                for (let lvl = 0; lvl < 6; lvl++) {
                    const z = (lvl + 0.5) / 6
                    const dsz = dmin * grow * (0.55 + 0.75 * z)
                    ctx.fillStyle = tone(baseA + gain * z)
                    ctx.beginPath()
                    for (let q = 0; q < list.length; q += 3) {
                        const lv = list[q + 2] >= 1 ? 5 : (list[q + 2] * 6) | 0
                        if (lv !== lvl) continue
                        ctx.rect(list[q] - dsz / 2, list[q + 1] - dsz / 2, dsz, dsz)
                    }
                    ctx.fill()
                }
            }
            dots(sea, 0.1, 0.22, 1.0)
            dots(soil, 0.34, 0.46, 1.7)

            for (let bi = 0; bi < 8; bi++) {
                const arr = land8[bi]
                if (!arr || !arr.length) continue
                const zb = (bi + 0.5) / 8
                ctx.font = "bold " + (fs * (0.42 + 0.58 * zb)).toFixed(2) + "px " + FACE
                ctx.fillStyle = tone(0.28 + 0.72 * Math.pow(zb, 0.6))
                for (let t = 0; t < arr.length; t += 4) {
                    ctx.save()
                    ctx.translate(arr[t], arr[t + 1])
                    ctx.rotate(arr[t + 2])
                    ctx.fillText(nodes[arr[t + 3]].c, 0, 0)
                    ctx.restore()
                }
            }

            /* ---- as marcas das obras ----
               Vem DEPOIS das letras e ANTES dos alfinetes: elas sao dado,
               as letras sao textura e o alfinete e do dedo de quem esta
               mexendo agora. */
            alvosRef.current.length = 0
            for (const marca of marcasRef.current) {
                /* com lat/lon no cadastro, a marca pousa no lugar de
                   verdade; sem, cai no sorteio estavel por id — e o
                   caso da obra cujo cliente nao tem UF preenchida */
                /* a marca acompanha o espelho do mapa, senao a obra de
                   Sao Paulo pousaria no oceano do outro lado */
                const lugar =
                    typeof marca.lat === "number" && typeof marca.lon === "number"
                        ? {
                              lat: (marca.lat * Math.PI) / 180,
                              lon: (ESPELHO * marca.lon * Math.PI) / 180,
                          }
                        : lugarDaChave(marca.chave)
                if (!lugar) continue
                const mcl = Math.cos(lugar.lat)
                const mx = mcl * Math.cos(lugar.lon)
                const my = Math.sin(lugar.lat)
                const mz = mcl * Math.sin(lugar.lon)
                const mx1 = mx * cs - mz * sn
                const mz1 = mx * sn + mz * cs
                const my2 = my * ct - mz1 * st
                const mz2 = my * st + mz1 * ct
                /* do outro lado da bola: a propria terra tapa a marca */
                if (mz2 <= 0.02) continue

                const mpx = cx + mx1 * R
                const mpy = cy - my2 * R
                const [mr, mg, mb] = tinta(marca.cor)
                const corDa = (al) => "rgba(" + mr + "," + mg + "," + mb + "," + al.toFixed(3) + ")"
                /* o raio acompanha a profundidade: marca na borda da bola
                   e marca mais longe, e encolhe como tudo o mais */
                const raio = u * 0.0105 * (0.55 + 0.45 * mz2)

                ctx.beginPath()
                ctx.arc(mpx, mpy, raio * 2.6, 0, Math.PI * 2)
                ctx.fillStyle = corDa(0.14 * mz2)
                ctx.fill()

                ctx.beginPath()
                ctx.arc(mpx, mpy, raio, 0, Math.PI * 2)
                ctx.fillStyle = corDa(0.45 + 0.55 * mz2)
                ctx.fill()

                /* o alvo do clique e maior que o desenho: a marca tem uns
                   3px de raio e ninguem acerta 3px com o dedo */
                alvosRef.current.push({
                    chave: marca.chave,
                    px: mpx,
                    py: mpy,
                    alcance: Math.max(raio * 3.2, u * 0.035),
                })
            }

            for (let pi = 0; pi < pins.length; pi++) {
                const pn = pins[pi]
                const pcl = Math.cos(pn.lat)
                const ax = pcl * Math.cos(pn.lon)
                const ay = Math.sin(pn.lat)
                const az = pcl * Math.sin(pn.lon)
                const bx1 = ax * cs - az * sn
                const bz1 = ax * sn + az * cs
                const by2 = ay * ct - bz1 * st
                const bz2 = ay * st + bz1 * ct
                if (bz2 <= 0.02) continue
                const ppx = cx + bx1 * R
                const ppy = cy - by2 * R
                const age = clock - pn.t
                const pop = Math.min(1, age / 0.22)
                const rr2 = u * 0.016 * (0.4 + 0.6 * pop) * (0.55 + 0.45 * bz2)
                ctx.beginPath()
                ctx.arc(ppx, ppy, rr2, 0, Math.PI * 2)
                ctx.strokeStyle = tone(0.3 + 0.55 * bz2)
                ctx.lineWidth = Math.max(0.7, u * 0.0022)
                ctx.stroke()
                ctx.beginPath()
                ctx.arc(ppx, ppy, Math.max(0.7, rr2 * 0.22), 0, Math.PI * 2)
                ctx.fillStyle = tone(0.45 + 0.55 * bz2)
                ctx.fill()
                if (age < 0.9) {
                    const w2 = 1 - age / 0.9
                    ctx.beginPath()
                    ctx.arc(ppx, ppy, rr2 + (1 - w2) * u * 0.05, 0, Math.PI * 2)
                    ctx.strokeStyle = tone(0.55 * w2 * w2)
                    ctx.lineWidth = Math.max(0.6, u * 0.0016)
                    ctx.stroke()
                }
            }

            raf = requestAnimationFrame(render)
        }

        let lastX = 0
        let lastY = 0
        const localPoint = (e) => {
            const r = canvas.getBoundingClientRect()
            if (r.width <= 0 || r.height <= 0) return null
            const cw = sizeRef.current.w || canvas.clientWidth || 1200
            const ch = sizeRef.current.h || canvas.clientHeight || 800
            return { x: ((e.clientX - r.left) / r.width) * cw, y: ((e.clientY - r.top) / r.height) * ch }
        }
        const track = (e) => {
            const p = localPoint(e)
            if (!p) return
            const ptr = ptrRef.current
            ptr.on = 1
            if (ptr.dragging) {
                const u = Math.min(sizeRef.current.w || 1200, sizeRef.current.h || 800)
                ptr.dx += (p.x - lastX) / u
                ptr.dy += (p.y - lastY) / u
                ptr.moved = 1
            }
            ptr.x = p.x
            ptr.y = p.y
            lastX = p.x
            lastY = p.y
        }
        const onDown = (e) => {
            const p = localPoint(e)
            if (!p) return
            const ptr = ptrRef.current
            ptr.dragging = 1
            ptr.moved = 0
            ptr.x = p.x
            ptr.y = p.y
            lastX = p.x
            lastY = p.y
            try {
                canvas.setPointerCapture(e.pointerId)
            } catch {
                /* navegador sem captura de ponteiro: o arrasto segue pelo window */
            }
        }

        const onUp = () => {
            const ptr = ptrRef.current
            if (ptr.dragging && !ptr.moved) ptr.click++
            ptr.dragging = 0
        }
        const onLeave = () => {
            if (!ptrRef.current.dragging) ptrRef.current.on = 0
        }
        const onWheel = (e) => {
            const v = vRef.current
            if (v.zoom <= 0) return
            e.preventDefault()
            zoomT = clampN(zoomT * Math.exp(-e.deltaY * 0.0016 * v.zoom), 0.85, 2.6)
        }

        canvas.addEventListener("pointermove", track)
        canvas.addEventListener("pointerenter", track)
        canvas.addEventListener("pointerleave", onLeave)
        canvas.addEventListener("pointerdown", onDown)
        window.addEventListener("pointerup", onUp)
        window.addEventListener("pointercancel", onUp)
        canvas.addEventListener("wheel", onWheel, { passive: false })
        raf = requestAnimationFrame(render)

        return () => {
            cancelAnimationFrame(raf)
            canvas.removeEventListener("pointermove", track)
            canvas.removeEventListener("pointerenter", track)
            canvas.removeEventListener("pointerleave", onLeave)
            canvas.removeEventListener("pointerdown", onDown)
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onUp)
            canvas.removeEventListener("wheel", onWheel)
        }
    }, [])

    return (
        <div
            style={{
                position: "relative",
                overflow: "hidden",
                background,
                width: typeof width === "number" && width > 0 ? width : "100%",
                height: typeof height === "number" && height > 0 ? height : "100%",
                ...style,
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    display: "block",
                    touchAction: "none",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                }}
            />
        </div>
    )
}
