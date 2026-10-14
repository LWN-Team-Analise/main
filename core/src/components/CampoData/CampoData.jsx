import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { somarDias } from '@/domain/obras'
import './CampoData.css'

/* ============================================================
   DATA e HORA — no lugar do <input type="date"> e "time" do
   navegador.

   Os nativos saem com a cara do sistema operacional: o "dd/mm/aaaa"
   cinza, o relogio do Windows, a roda do iPhone — cada um de um
   jeito e nenhum com a cara do resto do formulario. Aqui os dois
   sao um botao igual ao Seletor e abrem um painel nosso: o mes
   inteiro para a data, duas colunas (hora e minuto) para a hora.

   Sendo botao, e nao campo de digitar, o iPhone tambem nao da o zoom
   que da em campo com fonte menor que 16px.

   O painel vai num portal com position: fixed, como a lista do
   Seletor — dentro de um pop-up o corpo rola, e um filho absoluto
   seria cortado na borda dele.
   ============================================================ */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const SEMANA_EXTENSO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

const doMes = (iso) => iso.slice(0, 7)

function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7)
}

/** 0 = domingo ... 6 = sabado, sem passar por fuso. */
function diaDaSemana(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

const Icone = {
  calendario: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  relogio: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  seta: (lado) => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={lado === 'esq' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
    </svg>
  ),
}

/**
 * Abre o painel junto do botao: embaixo se cabe, em cima se nao, e no
 * meio da tela se nao cabe em nenhum dos dois (celular deitado, por
 * exemplo). Fecha no clique fora e no Esc, e acompanha a rolagem.
 */
function usePainel(aberto, fechar, { largura, altura }) {
  const ancora = useRef(null)
  const painel = useRef(null)
  const [posicao, setPosicao] = useState(null)
  const [emPopup, setEmPopup] = useState(false)

  const medir = useCallback(() => {
    const botao = ancora.current
    if (!botao) return
    setEmPopup(Boolean(botao.closest('.modal__caixa')))
    const r = botao.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const l = Math.min(Math.max(largura, r.width), vw - 24)
    const esquerda = Math.min(Math.max(12, r.left), vw - l - 12)
    const abaixo = vh - r.bottom - 12
    const acima = r.top - 12
    let topo
    if (abaixo >= altura + 6) topo = r.bottom + 6
    else if (acima >= altura + 6) topo = r.top - 6 - altura
    else topo = Math.max(12, (vh - altura) / 2)
    setPosicao({ left: esquerda, top: topo, width: l })
  }, [largura, altura])

  useLayoutEffect(() => {
    if (!aberto) {
      setPosicao(null)
      return undefined
    }
    medir()
    const fora = (e) => {
      if (ancora.current?.contains(e.target) || painel.current?.contains(e.target)) return
      fechar()
    }
    const tecla = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        fechar()
        ancora.current?.focus()
      }
    }
    document.addEventListener('pointerdown', fora)
    /* na captura: o Esc fecha o painel antes de chegar no pop-up, que
       senao fecharia o formulario inteiro junto */
    document.addEventListener('keydown', tecla, true)
    window.addEventListener('scroll', medir, true)
    window.addEventListener('resize', medir)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla, true)
      window.removeEventListener('scroll', medir, true)
      window.removeEventListener('resize', medir)
    }
  }, [aberto, fechar, medir])

  return { ancora, painel, posicao, emPopup }
}

/** O botao fechado, igual nos dois campos. */
function Gatilho({ id, ancora, aberto, aoAbrir, icone, texto, vazio, erro, rotuloAria }) {
  return (
    <button
      ref={ancora}
      id={id}
      type="button"
      className={`datahora__botao ${aberto ? 'is-aberto' : ''} ${texto ? '' : 'is-vazio'}`.trim()}
      onClick={aoAbrir}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      aria-invalid={Boolean(erro)}
      aria-label={rotuloAria}
    >
      <span className="datahora__valor">{texto || vazio}</span>
      <span className="datahora__icone">{icone}</span>
    </button>
  )
}

function Moldura({ id, rotulo, erro, dica, children }) {
  return (
    <div className={`campo ${erro ? 'has-erro' : ''}`.trim()}>
      {rotulo && (
        <label className="campo__rotulo" htmlFor={id}>
          {rotulo}
        </label>
      )}
      {children}
      {(erro || dica) && (
        <span className={`campo__nota ${erro ? 'campo__nota--erro' : ''}`.trim()} role={erro ? 'alert' : undefined}>
          {erro || dica}
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------
   Data
   ------------------------------------------------------------ */

/**
 * Um dia. `valor` e 'AAAA-MM-DD' (ou ''); `aoMudar` recebe o novo.
 * Dias fora de `min`/`max` ficam travados.
 */
export function CampoData({ rotulo, valor, aoMudar, min, max, erro, dica, vazio = 'Escolha a data' }) {
  const id = useId()
  const hoje = hojeLocal()
  const [aberto, setAberto] = useState(false)
  const fechar = useCallback(() => setAberto(false), [])
  const { ancora, painel, posicao, emPopup } = usePainel(aberto, fechar, { largura: 300, altura: 352 })

  const inicial = () => doMes(valor || (max && hoje > max ? max : min && hoje < min ? min : hoje))
  const [mes, setMes] = useState(inicial)

  /* abriu: volta para o mes do dia escolhido */
  useEffect(() => {
    if (aberto) setMes(inicial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const travado = (dia) => Boolean((min && dia < min) || (max && dia > max))

  const casas = useMemo(() => {
    const primeiro = `${mes}-01`
    const vazias = Array.from({ length: diaDaSemana(primeiro) }, () => null)
    const dias = []
    for (let d = primeiro; doMes(d) === mes; d = somarDias(d, 1)) dias.push(d)
    return [...vazias, ...dias]
  }, [mes])

  const escolher = (dia) => {
    aoMudar?.(dia)
    setAberto(false)
    ancora.current?.focus()
  }

  const [ano, numeroMes] = mes.split('-').map(Number)
  const podeVoltar = !min || somarMeses(mes, -1) >= doMes(min)
  const podeAvancar = !max || somarMeses(mes, 1) <= doMes(max)
  const texto = valor ? `${dataBR(valor)}${valor === hoje ? ' · hoje' : ''}` : ''

  return (
    <Moldura id={id} rotulo={rotulo} erro={erro} dica={dica}>
      <Gatilho
        id={id}
        ancora={ancora}
        aberto={aberto}
        aoAbrir={() => setAberto((a) => !a)}
        icone={<Icone.calendario />}
        texto={texto}
        vazio={vazio}
        erro={erro}
      />
      {aberto &&
        posicao &&
        createPortal(
          <div
            ref={painel}
            className={`datahora__painel ${emPopup ? 'is-solido' : ''}`.trim()}
            style={posicao}
            role="dialog"
            aria-label={rotulo ?? 'Escolha a data'}
          >
            <header className="datahora__topo">
              <button
                type="button"
                className="datahora__seta"
                onClick={() => setMes((m) => somarMeses(m, -1))}
                disabled={!podeVoltar}
                aria-label="Mês anterior"
              >
                {Icone.seta('esq')}
              </button>
              <strong aria-live="polite">
                {MESES[numeroMes - 1]} {ano}
              </strong>
              <button
                type="button"
                className="datahora__seta"
                onClick={() => setMes((m) => somarMeses(m, 1))}
                disabled={!podeAvancar}
                aria-label="Próximo mês"
              >
                {Icone.seta('dir')}
              </button>
            </header>

            <div className="datahora__semana" aria-hidden="true">
              {SEMANA.map((s, i) => (
                <span key={i}>{s}</span>
              ))}
            </div>

            <div className="datahora__grade">
              {casas.map((dia, i) =>
                dia ? (
                  <button
                    key={dia}
                    type="button"
                    className="datahora__dia"
                    aria-pressed={dia === valor}
                    aria-label={`${Number(dia.slice(8))} de ${MESES[numeroMes - 1]}, ${SEMANA_EXTENSO[diaDaSemana(dia)]}`}
                    data-hoje={dia === hoje ? 'sim' : undefined}
                    disabled={travado(dia)}
                    onClick={() => escolher(dia)}
                  >
                    {Number(dia.slice(8))}
                  </button>
                ) : (
                  <span key={`v${i}`} />
                ),
              )}
            </div>

            <footer className="datahora__rodape">
              <button type="button" className="datahora__atalho" onClick={() => escolher(hoje)} disabled={travado(hoje)}>
                Hoje
              </button>
              <button type="button" className="datahora__atalho is-fraco" onClick={fechar}>
                Fechar
              </button>
            </footer>
          </div>,
          document.body,
        )}
    </Moldura>
  )
}

/* ------------------------------------------------------------
   Hora
   ------------------------------------------------------------ */

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

function agora() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Uma coluna rolavel (horas ou minutos), que abre ja na escolhida. */
function Coluna({ titulo, itens, atual, aoEscolher }) {
  const lista = useRef(null)
  useLayoutEffect(() => {
    const escolhido = lista.current?.querySelector('[aria-pressed="true"]')
    if (escolhido) lista.current.scrollTop = escolhido.offsetTop - lista.current.clientHeight / 2 + escolhido.clientHeight / 2
  }, [])
  return (
    <div className="datahora__coluna">
      <span className="datahora__titulo">{titulo}</span>
      <div ref={lista} className="datahora__lista" role="listbox" aria-label={titulo}>
        {itens.map((item) => (
          <button
            key={item}
            type="button"
            role="option"
            className="datahora__item"
            aria-pressed={item === atual}
            aria-selected={item === atual}
            onClick={() => aoEscolher(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Uma hora, 'HH:MM' (ou ''). Escolher a hora mantem o minuto; escolher
 * o minuto fecha o painel — e a ordem em que a pessoa pensa.
 */
export function CampoHora({ rotulo, valor, aoMudar, erro, dica, vazio = 'HH:MM' }) {
  const id = useId()
  const [aberto, setAberto] = useState(false)
  const fechar = useCallback(() => setAberto(false), [])
  const { ancora, painel, posicao, emPopup } = usePainel(aberto, fechar, { largura: 220, altura: 300 })

  const [h, m] = /^\d{2}:\d{2}$/.test(valor ?? '') ? valor.split(':') : ['', '']

  const escolherHora = (hora) => aoMudar?.(`${hora}:${m || '00'}`)
  const escolherMinuto = (minuto) => {
    aoMudar?.(`${h || '00'}:${minuto}`)
    setAberto(false)
    ancora.current?.focus()
  }

  return (
    <Moldura id={id} rotulo={rotulo} erro={erro} dica={dica}>
      <Gatilho
        id={id}
        ancora={ancora}
        aberto={aberto}
        aoAbrir={() => setAberto((a) => !a)}
        icone={<Icone.relogio />}
        texto={valor}
        vazio={vazio}
        erro={erro}
      />
      {aberto &&
        posicao &&
        createPortal(
          <div
            ref={painel}
            className={`datahora__painel datahora__painel--hora ${emPopup ? 'is-solido' : ''}`.trim()}
            style={posicao}
            role="dialog"
            aria-label={rotulo ?? 'Escolha o horário'}
          >
            <div className="datahora__colunas">
              <Coluna titulo="Hora" itens={HORAS} atual={h} aoEscolher={escolherHora} />
              <span className="datahora__dois" aria-hidden="true">
                :
              </span>
              <Coluna titulo="Minuto" itens={MINUTOS} atual={m} aoEscolher={escolherMinuto} />
            </div>
            <footer className="datahora__rodape">
              <button
                type="button"
                className="datahora__atalho"
                onClick={() => {
                  aoMudar?.(agora())
                  setAberto(false)
                }}
              >
                Agora
              </button>
              <button type="button" className="datahora__atalho is-fraco" onClick={fechar}>
                Pronto
              </button>
            </footer>
          </div>,
          document.body,
        )}
    </Moldura>
  )
}
