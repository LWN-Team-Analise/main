import { useEffect, useRef } from 'react'
import './ParticleInterlock.css'

/**
 * Orbe de pontos que respira.
 *
 * Sao duas cascas de pontos giradas em sentidos opostos: quando a de
 * fora encolhe, a de dentro cresce para encontra-la. Os pontos das
 * duas entram na MESMA ordenacao por profundidade, entao um ponto de
 * dentro pode passar na frente de um de fora — e o que faz o orbe ler
 * como volume, e nao como duas bolas sobrepostas.
 *
 * O tempo vem de `performance.now()`, nao de um marco de montagem: o
 * header e remontado a cada troca de aba, e uma animacao presa ao
 * nascimento do elemento voltaria para o comeco toda vez.
 */

const AUREO = Math.PI * (3 - Math.sqrt(5))

/** Casca de Fibonacci: pontos espalhados sem formar fileiras. */
function casca(quantos) {
  const pontos = []
  for (let i = 0; i < quantos; i += 1) {
    const y = quantos === 1 ? 0 : 1 - (i / (quantos - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const t = AUREO * i
    pontos.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r })
  }
  return pontos
}

export default function ParticleInterlock({
  tamanho = 26,
  cor = '#f4f1ea',
  destaque = '#00ffcb',
  densidade = 90,
  pontoTamanho = 100,
  voltas = 1,
  velocidade = 50,
  inclinacao = -0.22,
  className = '',
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const ctx = canvas.getContext('2d')
    const suave = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(tamanho * dpr)
    canvas.height = Math.round(tamanho * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const fora = casca(densidade)
    const dentro = casca(Math.max(8, Math.round(densidade * 0.55)))

    const centro = tamanho / 2
    /* 0.86 deixa uma folga: no pico do respiro a casca de fora cresce e,
       sem essa margem, os pontos da borda seriam cortados */
    const base = centro * 0.86
    const foco = base * 3

    let quadro = 0

    const pintar = () => {
      const t = suave ? 0 : (performance.now() / 1000) * (velocidade / 100)
      /* respiro em contrafase: uma casca infla enquanto a outra murcha */
      const sopro = Math.sin(t * 1.7)
      const giro = t * 0.9 + t * voltas * 0.35

      const todos = []

      const juntar = (pontos, sentido, escalaRaio, pinta) => {
        const cg = Math.cos(giro * sentido)
        const sg = Math.sin(giro * sentido)
        const ci = Math.cos(inclinacao)
        const si = Math.sin(inclinacao)

        pontos.forEach((p) => {
          const x = p.x * cg + p.z * sg
          const z1 = p.z * cg - p.x * sg
          const y = p.y * ci - z1 * si
          const z = p.y * si + z1 * ci
          todos.push({ x: x * escalaRaio, y: y * escalaRaio, z: z * escalaRaio, pinta })
        })
      }

      juntar(fora, 1, base * (1 - 0.22 * sopro), cor)
      juntar(dentro, -1, base * (0.52 + 0.3 * (1 + sopro) * 0.5), destaque)

      ctx.clearRect(0, 0, tamanho, tamanho)

      /* uma ordenacao so para as duas cascas: e isso que permite um
         ponto de dentro cobrir um de fora */
      todos.sort((a, b) => a.z - b.z)

      todos.forEach((p) => {
        const k = foco / (foco + base - p.z)
        const sx = centro + p.x * k
        const sy = centro - p.y * k
        /* o lado de tras fica mais apagado: e o que da profundidade */
        const alfa = 0.3 + 0.7 * ((p.z / base + 1) / 2)

        let r = (tamanho / 100) * (pontoTamanho / 100) * 1.15 * k
        let a = alfa

        /* Disco menor que meio pixel some no Canvas 2D. Em vez de
           desaparecer, ele e alargado ate o minimo visivel e perde
           alfa na mesma proporcao da area que ganhou — o brilho total
           do ponto continua o mesmo. */
        if (r < 0.3) {
          a *= (r / 0.3) ** 2
          r = 0.3
        }

        ctx.globalAlpha = Math.max(0, Math.min(1, a))
        ctx.fillStyle = p.pinta
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
      })

      ctx.globalAlpha = 1
      quadro = requestAnimationFrame(pintar)
    }

    quadro = requestAnimationFrame(pintar)
    return () => cancelAnimationFrame(quadro)
  }, [tamanho, cor, destaque, densidade, pontoTamanho, voltas, velocidade, inclinacao])

  return (
    <canvas
      ref={canvasRef}
      className={`interlock ${className}`.trim()}
      style={{ width: tamanho, height: tamanho }}
      aria-hidden="true"
    />
  )
}
