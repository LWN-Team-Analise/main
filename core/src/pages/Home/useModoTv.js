import { useEffect, useRef, useState } from 'react'

/* ============================================================
   A TELA DA TV — a pagina inicial que se troca sozinha

   Para a conta do setor marcado como "Painel TV" (cargo.painel_tv,
   atualizacao 27): a televisao da empresa fica alternando entre a
   Grade e o Quadro, com um esmaecer suave na troca.

   O que desce e SO a lista de tarefas. A faixa do dia (data, tempo,
   frase) e as abas ficam paradas em cima; a pagina tem a altura da
   tela, e o conteudo das caixas de tarefas DESLIZA por dentro delas.

   As caixas andam em GRUPOS, cada grupo no seu laco — desce ate o fim,
   para um instante, volta ao inicio e desce de novo:

     Grade         o corpo da tabela, por baixo do cabecalho parado,
                   a 25 px/s;
     "Em andamento" e "Não iniciado"
                   JUNTAS (conectadas): cada uma na mesma fracao do
                   caminho, as duas chegam ao fim ao mesmo tempo. Sao o
                   que interessa na TV, e andam mais depressa, 40 px/s
                   na mais comprida das duas;
     "Concluída"   sozinha, a 25 px/s. Ela nao conta para a troca: e
                   historico, e costuma ser dez vezes maior que as
                   outras (quando as tres andavam juntas, era ela que
                   ditava o tempo, e as outras duas quase nao saiam do
                   lugar, com o ultimo card cortado).

   A regra da troca, como pedida:

     - cada tela fica no ar no minimo 1 minuto EXATO;
     - quando os grupos que contam (a Grade, ou o par do Quadro) ja
       mostraram o fim pelo menos uma vez, a tela troca no minuto — e
       ate la eles ficam em loop;
     - se o minuto acabou e um deles ainda nao chegou ao fim, ele tem
       ate 10 segundos a mais; entao a tela troca — e, na proxima vez,
       continua de onde parou, para o fim nao se perder.

   Desliza com `transform`, animado pelo proprio navegador (Web
   Animations), e nao mexendo no `scrollTop`: anda em fracao de pixel e
   e a placa de video que move a camada, sem redesenhar a lista.

   A lista muda no meio do caminho (a cada troca a pagina relê os
   dados, e eles chegam depois que a tela apareceu): a cada 0,7 s cada
   grupo confere o proprio tamanho e, se mudou, segue do ponto em que
   esta. O quanto falta e medido ate o fim do que se VE — a caixa ou a
   borda da tela, o que vier antes —, entao o ultimo card sempre
   aparece inteiro.

   Cada troca chama `aoTrocar` — e e la que a pagina recarrega os
   dados, para a TV nunca ficar mostrando o quadro de horas atras.
   ============================================================ */

export const MINUTO = 60_000
const EXTRA = 10_000
const PAUSA_TOPO = 4_000
const PAUSA_FUNDO = 3_000
/* px por segundo: devagar para ler de longe */
const VELOCIDADE = 25
/* "Em andamento" e "Não iniciado", o que interessa: um pouco mais rapido */
const VELOCIDADE_PAR = 40
const SUBIDA = 1_200
/* o esmaecer da saida (o da entrada e o CSS de .tv-palco) */
export const SAIDA = 450
/* o respiro abaixo do ultimo card quando a descida chega ao fim */
const FOLGA = 10
/* de quanto em quanto tempo cada grupo confere se a lista mudou */
const CONFERIR = 700
/* o espaco que fica abaixo das caixas (o rodape da pagina) */
const RODAPE = 24

/* onde cada grupo de cada tela parou (fracao do caminho), quando o tempo
   acabou antes de ele chegar ao fim — e de la que ele continua na volta */
const ondeParou = new Map()

const SUAVE = 'cubic-bezier(0.65, 0, 0.35, 1)'

/* a animacao acabou (ou foi cancelada). `onfinish`, e nao a promessa
   `finished`, que navegador mais antigo nao tem */
const terminou = (a) =>
  new Promise((pronto) => {
    a.onfinish = pronto
    a.oncancel = pronto
  })

/* a caixa de uma coluna do Quadro, com o trilho que desliza dentro dela */
function coluna(id) {
  const caixa = document.querySelector(`.tv-palco .colunat[data-coluna='${id}'] .colunat__pilha`)
  const trilho = caixa?.querySelector('.colunat__trilho')
  return trilho ? { caixa, mover: trilho, medir: trilho } : null
}

/* os grupos que estao na tela agora */
function grupos() {
  const lista = []
  const grade = document.querySelector('.tv-palco .grade')
  const corpo = grade?.querySelector('.grade__tabela tbody')
  if (corpo) {
    lista.push({
      chave: 'grade',
      conta: true,
      velocidade: VELOCIDADE,
      itens: [{ caixa: grade, mover: corpo, medir: grade.querySelector('.grade__tabela') }],
    })
  }
  const par = ['andamento', 'espera'].map(coluna).filter(Boolean)
  if (par.length) lista.push({ chave: 'par', conta: true, velocidade: VELOCIDADE_PAR, itens: par })
  const concluida = coluna('concluida')
  if (concluida) lista.push({ chave: 'concluida', conta: false, velocidade: VELOCIDADE, itens: [concluida] })
  return lista
}

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
    const relogios = []
    const inicio = performance.now()
    const decorrido = () => performance.now() - inicio
    const retomar = ondeParou.get(aba) ?? {}

    const esperar = (ms) =>
      new Promise((pronto) => {
        relogios.push(setTimeout(pronto, Math.max(0, ms)))
      })

    const grupo = (chave) => grupos().find((g) => g.chave === chave) ?? null

    /* Quanto falta aparecer numa caixa: do fim do conteudo ate o fim do
       que se ve — o MENOR entre o fim da caixa e o fim da tela.
       offsetTop e offsetHeight nao mudam com o transform. */
    const fundoDe = ({ caixa, medir }) => {
      const r = caixa.getBoundingClientRect()
      const dentro = r.top + caixa.clientTop
      const fimConteudo = dentro + medir.offsetTop + medir.offsetHeight
      const fimVisivel = Math.min(dentro + caixa.clientHeight, window.innerHeight - RODAPE)
      return Math.max(0, Math.round(fimConteudo - fimVisivel + FOLGA))
    }
    /* o grupo anda o caminho da mais comprida das caixas dele */
    const maiorDe = (g) => (g ? g.itens.reduce((m, i) => Math.max(m, fundoDe(i)), 0) : 0)

    /* As caixas nunca passam do rodape da tela — com a altura em PIXELS,
       e nao so pelo CSS. `position: relative` faz delas a referencia do
       offsetTop de quem esta dentro. */
    const prenderCaixas = () => {
      document.querySelectorAll('.tv-palco .colunat__pilha, .tv-palco .grade').forEach((c) => {
        const altura = `${Math.max(80, Math.floor(window.innerHeight - c.getBoundingClientRect().top - RODAPE))}px`
        if (c.style.position !== 'relative') c.style.position = 'relative'
        /* a coluna tem a altura da tela; a Grade, no maximo ela */
        if (c.classList.contains('colunat__pilha') && c.style.height !== altura) c.style.height = altura
        if (c.style.maxHeight !== altura) c.style.maxHeight = altura
      })
    }

    /* ---------------- um grupo ---------------- */

    const estados = new Map()
    const estadoDe = (chave) => {
      if (!estados.has(chave)) estados.set(chave, { f: retomar[chave] ?? 0, viu: false, anims: [], corrida: null })
      return estados.get(chave)
    }

    /* a fracao do caminho em que o grupo esta agora, mesmo andando */
    const fAgora = (e) => {
      if (!e.corrida) return e.f
      const { de, ate, ms, t0 } = e.corrida
      const k = Math.min(1, (performance.now() - t0) / ms)
      return de + (ate - de) * k
    }

    /* leva as caixas do grupo de `de` ate `ate` (fracoes do caminho) em
       `ms`, cada uma na distancia dela — por isso chegam juntas */
    const mover = (chave, de, ate, ms, easing = 'linear') => {
      const e = estadoDe(chave)
      const g = grupo(chave)
      if (!g) return Promise.resolve()
      const novas = g.itens.map((i) => {
        const d = fundoDe(i)
        return i.mover.animate(
          [{ transform: `translate3d(0, ${-de * d}px, 0)` }, { transform: `translate3d(0, ${-ate * d}px, 0)` }],
          { duration: Math.max(1, ms), easing, fill: 'forwards' },
        )
      })
      /* as novas ja seguram a posicao: so entao as velhas saem, sem piscar */
      e.anims.forEach((a) => a.cancel())
      e.anims = novas
      e.corrida = { de, ate, ms: Math.max(1, ms), t0: performance.now() }
      return Promise.all(novas.map(terminou)).then(() => {
        if (!vivo || e.anims !== novas) return
        e.f = ate
        e.corrida = null
      })
    }

    /* o que o grupo tem na tela: quem desliza e quanto falta */
    const retrato = (chave) => {
      const g = grupo(chave)
      return { movers: g ? g.itens.map((i) => i.mover) : [], maior: maiorDe(g) }
    }
    const igual = (a, b) =>
      a.movers.length === b.movers.length && a.movers.every((m, k) => m === b.movers[k]) && Math.abs(a.maior - b.maior) <= 2

    /* resolve quando o grupo mudar (a lista cresceu, encolheu ou foi
       trocada); `parar` desliga a conferencia */
    const vigiar = (chave, base) => {
      let ativo = true
      const promessa = new Promise((pronto) => {
        const olhar = () => {
          if (!ativo || !vivo) return
          prenderCaixas()
          if (!igual(base, retrato(chave))) {
            ativo = false
            pronto()
            return
          }
          relogios.push(setTimeout(olhar, CONFERIR))
        }
        relogios.push(setTimeout(olhar, CONFERIR))
      })
      return {
        promessa,
        parar: () => {
          ativo = false
        },
      }
    }

    /* desce do ponto em que esta ate o fim, refazendo a conta quando a
       lista muda no caminho. Devolve false se nao ha o que descer. */
    const descer = async (chave) => {
      const e = estadoDe(chave)
      let agora = retrato(chave)
      for (;;) {
        if (!vivo) return true
        const g = grupo(chave)
        if (!g || agora.maior <= 1) return false
        const daqui = Math.min(1, fAgora(e))
        if (1 - daqui < 0.001) return true
        const vigia = vigiar(chave, agora)
        const chegou = mover(chave, daqui, 1, ((agora.maior * (1 - daqui)) / g.velocidade) * 1000).then(() => 'chegou')
        const motivo = await Promise.race([chegou, vigia.promessa.then(() => 'mudou')])
        vigia.parar()
        if (!vivo || motivo === 'chegou') return true
        /* mudou no caminho: segue do MESMO pixel, na medida nova */
        const novo = retrato(chave)
        if (novo.maior > 1) {
          const px = fAgora(e) * agora.maior
          mover(chave, Math.min(1, px / novo.maior), Math.min(1, px / novo.maior), 1)
          e.f = Math.min(1, px / novo.maior)
          e.corrida = null
        }
        agora = novo
      }
    }

    /* ---------------- a tela inteira ---------------- */

    let minutoAcabou = false

    /* a troca: guarda onde cada grupo parou, congela, esmaece e passa */
    const fim = () => {
      if (!vivo) return
      const parou = {}
      estados.forEach((e, chave) => {
        const f = fAgora(e)
        if (!e.viu && f > 0 && f < 0.999) parou[chave] = f
      })
      vivo = false
      estados.forEach((e) => e.anims.forEach((a) => a.pause()))
      if (Object.keys(parou).length) ondeParou.set(aba, parou)
      else ondeParou.delete(aba)
      setSaindo(true)
      relogios.push(setTimeout(() => trocar.current?.(), SAIDA))
    }

    /* os grupos que contam (a Grade, ou o par do Quadro) ja mostraram o fim? */
    const contaramTodos = () =>
      grupos()
        .filter((g) => g.conta)
        .every((g) => estados.get(g.chave)?.viu)

    /* depois do minuto, o ultimo grupo a chegar ao fim fica um instante
       na tela (sem passar do teto) e a tela troca */
    const conferirTroca = () => {
      if (!vivo || !minutoAcabou || !contaramTodos()) return
      relogios.push(setTimeout(fim, Math.min(PAUSA_FUNDO, Math.max(0, MINUTO + EXTRA - decorrido()))))
    }

    /* o laco de um grupo: desce, para, volta ao inicio, para, desce... */
    const rodar = async (chave) => {
      const e = estadoDe(chave)
      await mover(chave, e.f, e.f, 1)
      await esperar(PAUSA_TOPO)
      while (vivo) {
        prenderCaixas()
        const desceu = await descer(chave)
        if (!vivo) return
        e.viu = true
        conferirTroca()
        if (!desceu) {
          /* tudo cabe na tela: fica parado, de olho — se a lista
             crescer, desce */
          await vigiar(chave, retrato(chave)).promessa
          continue
        }
        await esperar(PAUSA_FUNDO)
        if (!vivo) return
        await mover(chave, fAgora(e), 0, SUBIDA, SUAVE)
        if (!vivo) return
        await esperar(PAUSA_TOPO)
      }
    }

    /* o minuto exato: se os grupos que contam ja mostraram o fim, troca */
    relogios.push(
      setTimeout(() => {
        minutoAcabou = true
        if (contaramTodos()) fim()
      }, MINUTO),
    )
    /* o teto: o minuto e os 10 s a mais */
    relogios.push(setTimeout(fim, MINUTO + EXTRA))

    /* cada grupo no seu laco. Confere de tempos em tempos: grupo que so
       aparece depois (a lista estava vazia e os dados chegaram) ganha o
       laco dele tambem */
    const rodando = new Set()
    const ligarGrupos = () => {
      if (!vivo) return
      prenderCaixas()
      grupos().forEach((g) => {
        if (rodando.has(g.chave)) return
        rodando.add(g.chave)
        rodar(g.chave)
      })
      relogios.push(setTimeout(ligarGrupos, CONFERIR))
    }
    /* espera a tela nova desenhar antes de medir */
    relogios.push(setTimeout(ligarGrupos, 300))

    return () => {
      vivo = false
      estados.forEach((e) => e.anims.forEach((a) => a.cancel()))
      relogios.forEach(clearTimeout)
      document.querySelectorAll('.colunat__pilha, .grade').forEach((c) => {
        c.style.height = ''
        c.style.maxHeight = ''
        c.style.position = ''
      })
    }
  }, [ligado, aba])

  return { saindo }
}
