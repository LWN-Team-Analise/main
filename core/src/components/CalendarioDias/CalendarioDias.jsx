import { useMemo, useRef, useState } from 'react'
import { somarDias } from '@/domain/obras'
import './CalendarioDias.css'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const SEMANA_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** 0 = domingo ... 6 = sabado, sem passar por fuso. */
export const diaDaSemana = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

const doMes = (iso) => iso.slice(0, 7)

/** 'AAAA-MM' + n meses */
function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number)
  const data = new Date(Date.UTC(a, m - 1 + n, 1))
  return data.toISOString().slice(0, 7)
}

/** Todos os dias de `a` ate `b` (em qualquer ordem), inclusive. */
function intervalo(a, b) {
  const [de, ate] = a <= b ? [a, b] : [b, a]
  const dias = []
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d)
  return dias
}

/**
 * CALENDARIO DE DIAS SOLTOS — um mes por vez, e cada dia se marca
 * sozinho.
 *
 *   clique              marca o dia; clique de novo tira
 *   clique e arraste    marca do primeiro ao ultimo dia do arraste
 *                       (comecando num dia marcado, TIRA o trecho)
 *   Shift + clique      marca do ultimo dia clicado ate este
 *
 * Feito para o periodo de execucao: uma execucao de 5 dias nao precisa
 * ser 5 dias seguidos — pode ser so dias uteis, pular uma semana, cair
 * num feriado. Arrastar marca o trecho inteiro; os dias que nao entram
 * saem com um clique cada.
 *
 * O arraste funciona no dedo tambem: a grade captura o ponteiro e o dia
 * embaixo dele sai do `elementFromPoint`, porque no toque o navegador
 * nao avisa quando o dedo entra em outro botao. Por isso a grade tem
 * `touch-action: none` — o dedo em cima dela arrasta dias, nao a pagina.
 *
 * `valor` e a lista de 'AAAA-MM-DD' em ordem; `aoMudar` recebe a nova,
 * tambem em ordem. Dias fora de `min`/`max` ficam travados.
 */
export default function CalendarioDias({ valor, aoMudar, min, max, hoje, rotulo = 'Dias' }) {
  const marcados = useMemo(() => new Set(valor), [valor])

  const mesInicial = () => {
    if (valor.length > 0) return doMes(valor[0])
    if ((!min || hoje >= min) && (!max || hoje <= max)) return doMes(hoje)
    return doMes(min ?? max ?? hoje)
  }
  const [mes, setMes] = useState(mesInicial)

  /* o arraste em andamento: de onde saiu, se marca ou tira, e como a
     lista estava antes dele — cada passo refaz o trecho em cima dela */
  const arraste = useRef(null)
  /* o ultimo dia clicado, para o Shift + clique */
  const ancora = useRef(null)
  const grade = useRef(null)

  const travado = (dia) => Boolean((min && dia < min) || (max && dia > max))

  const aplicar = (base, de, ate, marcar) => {
    const proxima = new Set(base)
    for (const dia of intervalo(de, ate)) {
      if (travado(dia)) continue
      if (marcar) proxima.add(dia)
      else proxima.delete(dia)
    }
    aoMudar([...proxima].sort())
  }

  const diaNoPonto = (x, y) => {
    const alvo = document.elementFromPoint(x, y)?.closest?.('[data-dia]')
    if (!alvo || !grade.current?.contains(alvo) || alvo.disabled) return null
    return alvo.dataset.dia
  }

  const comecar = (evento) => {
    if (evento.button !== 0) return
    const dia = diaNoPonto(evento.clientX, evento.clientY)
    if (!dia) return
    evento.preventDefault()
    grade.current.setPointerCapture?.(evento.pointerId)

    if (evento.shiftKey && ancora.current) {
      aplicar(marcados, ancora.current, dia, true)
      ancora.current = dia
      return
    }
    const marcar = !marcados.has(dia)
    arraste.current = { de: dia, ate: dia, marcar, base: new Set(marcados) }
    ancora.current = dia
    aplicar(marcados, dia, dia, marcar)
  }

  const mover = (evento) => {
    const atual = arraste.current
    if (!atual) return
    const dia = diaNoPonto(evento.clientX, evento.clientY)
    if (!dia || dia === atual.ate) return
    atual.ate = dia
    aplicar(atual.base, atual.de, dia, atual.marcar)
  }

  /* com o ponteiro capturado, o soltar chega na grade mesmo fora dela */
  const terminar = () => {
    if (arraste.current) ancora.current = arraste.current.ate
    arraste.current = null
  }

  /* teclado: Enter/Espaco no dia chegam como clique sem ponteiro
     (detail 0). O clique do mouse ja foi tratado no pointerdown. */
  const tecla = (evento, dia) => {
    if (evento.detail !== 0) return
    const proxima = new Set(marcados)
    if (proxima.has(dia)) proxima.delete(dia)
    else proxima.add(dia)
    ancora.current = dia
    aoMudar([...proxima].sort())
  }

  /* a grade do mes: as casas vazias antes do dia 1 e os dias */
  const primeiro = `${mes}-01`
  const casas = useMemo(() => {
    const vazias = Array.from({ length: diaDaSemana(primeiro) }, () => null)
    const dias = []
    for (let d = primeiro; doMes(d) === mes; d = somarDias(d, 1)) dias.push(d)
    return [...vazias, ...dias]
  }, [primeiro, mes])

  const podeVoltar = !min || somarMeses(mes, -1) >= doMes(min)
  const podeAvancar = !max || somarMeses(mes, 1) <= doMes(max)
  const noMes = valor.filter((d) => doMes(d) === mes).length
  const [ano, numeroMes] = mes.split('-').map(Number)

  return (
    <div className="diascal">
      <header className="diascal__topo">
        <button
          type="button"
          className="diascal__seta"
          onClick={() => setMes((m) => somarMeses(m, -1))}
          disabled={!podeVoltar}
          aria-label="Mês anterior"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <strong className="diascal__mes" aria-live="polite">
          {MESES[numeroMes - 1]} {ano}
          {noMes > 0 && (
            <em>
              {noMes} dia{noMes > 1 ? 's' : ''}
            </em>
          )}
        </strong>
        <button
          type="button"
          className="diascal__seta"
          onClick={() => setMes((m) => somarMeses(m, 1))}
          disabled={!podeAvancar}
          aria-label="Próximo mês"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </header>

      <div className="diascal__semana" aria-hidden="true">
        {SEMANA.map((s, i) => (
          <span key={i} data-fim={i === 0 || i === 6 ? 'sim' : undefined}>
            {s}
          </span>
        ))}
      </div>

      <div
        ref={grade}
        className="diascal__grade"
        role="group"
        aria-label={rotulo}
        onPointerDown={comecar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
      >
        {casas.map((dia, i) => {
          if (!dia) return <span key={`v${i}`} className="diascal__vazia" />
          const semana = diaDaSemana(dia)
          const marcado = marcados.has(dia)
          /* o trecho seguido vira uma faixa so: o dia marcado perde a
             borda redonda do lado em que o vizinho tambem esta marcado
             (na mesma linha da grade) */
          const liga = marcado
            ? [
                semana > 0 && marcados.has(somarDias(dia, -1)) ? 'esq' : '',
                semana < 6 && marcados.has(somarDias(dia, 1)) ? 'dir' : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined
            : undefined
          return (
            <button
              key={dia}
              type="button"
              data-dia={dia}
              className="diascal__dia"
              aria-pressed={marcado}
              aria-label={`${Number(dia.slice(8))} de ${MESES[numeroMes - 1]}, ${SEMANA_EXTENSO[semana]}`}
              data-liga={liga}
              data-fim={semana === 0 || semana === 6 ? 'sim' : undefined}
              data-hoje={dia === hoje ? 'sim' : undefined}
              disabled={travado(dia)}
              onClick={(e) => tecla(e, dia)}
            >
              {Number(dia.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
