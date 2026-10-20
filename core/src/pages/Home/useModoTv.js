import { useEffect, useRef } from 'react'

/* ============================================================
   A TELA DA TV — a pagina inicial que se troca sozinha

   Para a conta do setor marcado como "Painel TV" (cargo.painel_tv,
   atualizacao 27): a televisao da empresa fica alternando entre a
   Grade e o Quadro, e cada uma DESCE devagar ate mostrar todas as
   tarefas.

   A regra da troca, como pedida:

     - cada tela fica no ar no minimo 1 minuto EXATO;
     - se a descida mostrou tudo antes do minuto, a tela volta ao
       topo e desce de novo (em loop) ate dar o minuto — e troca
       na hora, no 60o segundo;
     - se a lista e comprida e o minuto acaba antes de chegar ao fim,
       a tela continua descendo ate mostrar a ultima tarefa e so
       entao troca, com 10 segundos a mais (para, sobe de volta ao
       topo e troca), para a troca nao ser seca.

   Tela que cabe inteira (sem rolagem) ja "mostrou tudo": espera o
   minuto e troca.

   Cada troca chama `aoTrocar` — e e la que a pagina recarrega os
   dados, para a TV nunca ficar mostrando o quadro de horas atras.
   ============================================================ */

export const MINUTO = 60_000
const EXTRA = 10_000
const PAUSA_TOPO = 4_000
const PAUSA_FUNDO = 3_000
/* px por segundo: devagar o bastante para ler de longe */
const DESCIDA = 45
const SUBIDA = 900

export default function useModoTv({ ligado, aba, aoTrocar }) {
  /* a funcao muda a cada render; o ciclo usa sempre a mais nova */
  const trocar = useRef(aoTrocar)
  useEffect(() => {
    trocar.current = aoTrocar
  }, [aoTrocar])

  useEffect(() => {
    if (!ligado) return undefined

    let vivo = true
    let quadro = 0
    const relogios = []
    const raiz = () => document.scrollingElement ?? document.documentElement
    const fundo = () => Math.max(0, raiz().scrollHeight - window.innerHeight)

    const esperar = (ms) =>
      new Promise((pronto) => {
        relogios.push(setTimeout(pronto, ms))
      })

    /* anda ate `alvo` na velocidade dada; o fundo e relido a cada quadro,
       porque a lista pode crescer no meio do caminho */
    const rolar = (paraBaixo, velocidade) =>
      new Promise((pronto) => {
        let antes = performance.now()
        /* a posicao em fracao de pixel: o navegador arredonda o scrollTop,
           e somar 0,7 px por quadro direto nele nao sairia do lugar */
        let pos = raiz().scrollTop
        const passo = (agora) => {
          if (!vivo) return pronto()
          const dt = Math.min(agora - antes, 100) / 1000
          antes = agora
          /* alguem rolou na mao: segue de onde a tela esta */
          if (Math.abs(raiz().scrollTop - pos) > 4) pos = raiz().scrollTop
          const alvo = paraBaixo ? fundo() : 0
          const falta = alvo - pos
          if (Math.abs(falta) <= 1) {
            raiz().scrollTop = alvo
            return pronto()
          }
          const andar = Math.sign(falta) * velocidade * dt
          pos = Math.abs(andar) >= Math.abs(falta) ? alvo : pos + andar
          raiz().scrollTop = Math.round(pos)
          quadro = requestAnimationFrame(passo)
        }
        quadro = requestAnimationFrame(passo)
      })

    let viuTudo = false
    let minutoAcabou = false

    const fim = () => {
      if (!vivo) return
      vivo = false
      trocar.current?.()
    }

    /* o minuto exato: se ja mostrou tudo, troca agora; senao, a descida
       termina e troca depois (com os 10 s a mais) */
    relogios.push(
      setTimeout(() => {
        minutoAcabou = true
        if (viuTudo) fim()
      }, MINUTO),
    )

    const ciclo = async () => {
      raiz().scrollTop = 0
      await esperar(PAUSA_TOPO)
      while (vivo) {
        await rolar(true, DESCIDA)
        if (!vivo) return
        if (!viuTudo) {
          viuTudo = true
          if (minutoAcabou) {
            /* passou do minuto descendo: 10 s a mais e troca */
            relogios.push(setTimeout(fim, EXTRA))
            await esperar(PAUSA_FUNDO)
            if (vivo) await rolar(false, SUBIDA)
            return
          }
        }
        /* mostrou tudo antes do minuto: de volta ao topo, e de novo */
        await esperar(PAUSA_FUNDO)
        if (!vivo) return
        await rolar(false, SUBIDA)
        if (!vivo) return
        await esperar(PAUSA_TOPO)
      }
    }

    /* espera a tela nova desenhar antes de medir o fundo */
    relogios.push(setTimeout(ciclo, 300))

    return () => {
      vivo = false
      cancelAnimationFrame(quadro)
      relogios.forEach(clearTimeout)
    }
  }, [ligado, aba])
}
