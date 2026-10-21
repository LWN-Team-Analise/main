import { useEffect, useRef, useState } from 'react'

/* ============================================================
   A TELA DA TV — a pagina inicial que se troca sozinha

   Para a conta do setor marcado como "Painel TV" (cargo.painel_tv,
   atualizacao 27): a televisao da empresa fica alternando entre a
   Grade e o Quadro, com um esmaecer suave na troca.

   O que desce e SO a lista de tarefas. A faixa do dia (data, tempo,
   frase) e as abas ficam paradas em cima; a pagina tem a altura da
   tela, e as caixas das tarefas e que rolam por dentro:

     Grade   a tabela (o cabecalho dela fica preso no alto);
     Quadro  as tres colunas AO MESMO TEMPO — cada uma na mesma
             fracao do caminho, entao todas chegam ao fim juntas.

   A descida e DEVAGAR e sempre na mesma velocidade (25 px/s na caixa
   mais comprida, mais ou menos uma linha da Grade a cada 2 s): e o que
   da para ler de longe. Ela nunca acelera — a de 45 px/s, que ainda
   corria mais em lista comprida, passava rapido demais para ler.

   A regra da troca, como pedida:

     - cada tela fica no ar no minimo 1 minuto EXATO;
     - se a descida mostrou tudo antes do minuto, volta ao topo e
       desce de novo (em loop) ate dar o minuto — e troca na hora;
     - se o minuto acabou no meio da descida, ela continua ate o fim,
       com ate 10 segundos a mais, e entao troca.

   Lista comprida que nao coube nesses 70 segundos nao perde o fim: na
   proxima vez que a tela volta, ela continua de onde parou (e, quando
   chega ao fim, a vez seguinte comeca do topo).

   Cada troca chama `aoTrocar` — e e la que a pagina recarrega os
   dados, para a TV nunca ficar mostrando o quadro de horas atras.
   ============================================================ */

export const MINUTO = 60_000
const EXTRA = 10_000
const PAUSA_TOPO = 4_000
const PAUSA_FUNDO = 3_000
/* px por segundo na caixa mais comprida: devagar para ler de longe */
const VELOCIDADE = 25
const SUBIDA = 1_200
/* o esmaecer da saida (o da entrada e o CSS de .tv-palco) */
export const SAIDA = 450

/* as caixas que rolam: a da Grade e as pilhas das colunas do Quadro */
const ROLAGEM = '.tv-palco .grade, .tv-palco .colunat__pilha'

/* onde cada tela parou (fracao do caminho, de 0 a 1) quando o tempo
   acabou no meio da descida — e de la que ela continua na volta */
const ondeParou = new Map()

const suave = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)

export default function useModoTv({ ligado, aba, aoTrocar }) {
  const [saindo, setSaindo] = useState(false)

  /* a funcao muda a cada render; o ciclo usa sempre a mais nova */
  const trocar = useRef(aoTrocar)
  useEffect(() => {
    trocar.current = aoTrocar
  }, [aoTrocar])

  /* a pagina inteira com a altura da tela, so enquanto e a TV */
  useEffect(() => {
    if (!ligado) return undefined
    document.documentElement.classList.add('modo-tv')
    return () => document.documentElement.classList.remove('modo-tv')
  }, [ligado])

  useEffect(() => {
    if (!ligado) return undefined
    setSaindo(false)

    let vivo = true
    let quadro = 0
    /* a fracao em que as caixas estao agora */
    let atual = ondeParou.get(aba) ?? 0
    const relogios = []
    const inicio = performance.now()
    const decorrido = () => performance.now() - inicio

    const caixas = () => [...document.querySelectorAll(ROLAGEM)]
    const fundoDe = (c) => Math.max(0, c.scrollHeight - c.clientHeight)
    const maior = () => caixas().reduce((m, c) => Math.max(m, fundoDe(c)), 0)
    /* todas as caixas na mesma fracao do caminho (0 = topo, 1 = fim);
       o fim e relido a cada quadro porque a lista pode crescer */
    const em = (p) => {
      atual = p
      caixas().forEach((c) => {
        c.scrollTop = Math.round(p * fundoDe(c))
      })
    }

    const esperar = (ms) =>
      new Promise((pronto) => {
        relogios.push(setTimeout(pronto, Math.max(0, ms)))
      })

    const animar = (de, ate, ms, curva = (k) => k) =>
      new Promise((pronto) => {
        const t0 = performance.now()
        const passo = (agora) => {
          if (!vivo) return pronto()
          const k = Math.min(1, (agora - t0) / ms)
          em(de + (ate - de) * curva(k))
          if (k >= 1) return pronto()
          quadro = requestAnimationFrame(passo)
        }
        quadro = requestAnimationFrame(passo)
      })

    let viuTudo = false

    /* a troca: guarda onde parou, esmaece a tela e passa para a outra */
    const fim = () => {
      if (!vivo) return
      vivo = false
      cancelAnimationFrame(quadro)
      /* chegou ao fim: a proxima vez comeca do topo; senao, continua daqui */
      if (viuTudo || atual >= 0.999) ondeParou.delete(aba)
      else ondeParou.set(aba, atual)
      setSaindo(true)
      relogios.push(setTimeout(() => trocar.current?.(), SAIDA))
    }

    /* o minuto exato: se ja mostrou tudo, troca agora */
    relogios.push(
      setTimeout(() => {
        if (viuTudo) fim()
      }, MINUTO),
    )
    /* o teto: o minuto e os 10 s a mais */
    relogios.push(setTimeout(fim, MINUTO + EXTRA))

    /* a descida de `de` ate o fim, na velocidade de leitura */
    const descer = (de) => {
      const distancia = maior() * (1 - de)
      return distancia > 1 ? animar(de, 1, (distancia / VELOCIDADE) * 1000) : Promise.resolve()
    }

    const ciclo = async () => {
      em(atual)
      await esperar(PAUSA_TOPO)
      let de = atual
      while (vivo) {
        const temRolagem = maior() > 1
        await descer(de)
        if (!vivo) return
        if (!viuTudo) {
          viuTudo = true
          if (decorrido() >= MINUTO) {
            /* passou do minuto descendo: o fim fica um instante na tela
               (sem passar do teto) e troca */
            await esperar(Math.min(PAUSA_FUNDO, MINUTO + EXTRA - decorrido()))
            fim()
            return
          }
        }
        /* nada para rolar: a tela fica parada e o relogio do minuto troca */
        if (!temRolagem) return
        /* mostrou tudo antes do minuto: de volta ao topo, e de novo */
        await esperar(PAUSA_FUNDO)
        if (!vivo) return
        await animar(1, 0, SUBIDA, suave)
        if (!vivo) return
        await esperar(PAUSA_TOPO)
        de = 0
      }
    }

    /* espera a tela nova desenhar antes de medir */
    relogios.push(setTimeout(ciclo, 300))

    return () => {
      vivo = false
      cancelAnimationFrame(quadro)
      relogios.forEach(clearTimeout)
    }
  }, [ligado, aba])

  return { saindo }
}
