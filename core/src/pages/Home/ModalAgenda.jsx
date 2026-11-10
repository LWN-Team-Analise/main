import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoTexto } from '@/components/Campo/Campo'
import { CampoData, CampoHora } from '@/components/CampoData/CampoData'
import * as agendaApi from '@/services/agendaService'
/* o formulario tambem abre pelo "Marcar evento" do +, em qualquer aba */
import './Panorama.css'

/* ============================================================
   A AGENDA INTEIRA e o cadastro de evento (aba Panorama)

   ModalAgenda — o "Ver calendario" do card: todos os eventos de hoje
                 em diante, separados por mes. Quem tem `enviar_avisos`
                 ve o "Novo evento" e, em cada linha, editar e excluir.
   ModalEvento — o formulario: titulo, dia, hora e local. So o titulo
                 e o dia sao obrigatorios; evento sem hora e "dia
                 inteiro".

   A API confere a permissao de novo antes de gravar (server/routes/
   agenda.js): esconder o botao e conveniencia, nao trava.
   ============================================================ */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const Lapis = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10v4Z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
)

const Lixo = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 7h15M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </svg>
)

const Mais = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const MESES_CURTOS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

const Relogio = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
)

const Local = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
)

const dois = (n) => String(n).padStart(2, '0')

/** Hoje, como 'AAAA-MM-DD' no calendario de quem esta olhando. */
function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

/** 'HH:MM' -> '09h00', como a agenda e escrita no papel. */
const horaCurta = (hora) => (hora ? hora.replace(':', 'h') : '')

/**
 * Uma linha da agenda: o bloco do dia, o pingo da linha do tempo e o
 * texto. Serve ao card (os tres proximos) e a lista inteira, onde
 * `children` traz o editar e o excluir.
 */
export function Evento({ evento, children }) {
  const ehHoje = evento.dia === hojeLocal()
  const detalhe = [horaCurta(evento.hora), evento.local].filter(Boolean).join(' – ')
  return (
    <li className="pevento" data-hoje={ehHoje ? 'sim' : undefined}>
      <span className="pevento__data" aria-hidden="true">
        <strong>{evento.dia.slice(8, 10)}</strong>
        <span>{MESES_CURTOS[Number(evento.dia.slice(5, 7)) - 1]}</span>
      </span>
      <span className="pevento__pingo" aria-hidden="true" />
      <span className="pevento__texto">
        <strong>
          {evento.titulo}
          {ehHoje && <span className="pevento__hoje">Hoje</span>}
        </strong>
        <span className="pevento__detalhe">
          {evento.hora ? <Relogio /> : evento.local ? <Local /> : null}
          <span className="sr-only">{`${evento.dia.slice(8, 10)}/${evento.dia.slice(5, 7)} `}</span>
          {detalhe || 'Dia inteiro'}
        </span>
      </span>
      {children}
    </li>
  )
}

export function ModalAgenda({ aberto, eventos, podeEditar, aoFechar }) {
  const [editando, setEditando] = useState(null)
  const [apagando, setApagando] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (aberto) setErro('')
  }, [aberto])

  /* [{ chave: 'AAAA-MM', rotulo: 'Novembro de 2026', eventos }] */
  const porMes = useMemo(() => {
    const grupos = new Map()
    eventos.forEach((e) => {
      const chave = e.dia.slice(0, 7)
      const grupo = grupos.get(chave) ?? {
        chave,
        rotulo: `${MESES[Number(chave.slice(5, 7)) - 1]} de ${chave.slice(0, 4)}`,
        eventos: [],
      }
      grupo.eventos.push(e)
      grupos.set(chave, grupo)
    })
    return [...grupos.values()]
  }, [eventos])

  const apagar = async () => {
    const alvo = apagando
    setApagando(null)
    try {
      await agendaApi.apagarEvento(alvo.id)
    } catch (e) {
      setErro(e.message)
    }
  }

  return (
    <>
      <Modal
        aberto={aberto}
        aoFechar={aoFechar}
        titulo="Agenda da Empresa"
        subtitulo="Os próximos eventos e compromissos"
        largura={560}
      >
        <div className="pmodal">
          {podeEditar && (
            <button type="button" className="pmodal__novo" onClick={() => setEditando({})}>
              <Mais />
              Novo evento
            </button>
          )}

          {erro && (
            <p className="pmodal__erro" role="alert">
              {erro}
            </p>
          )}

          {porMes.length === 0 ? (
            <p className="pmodal__vazio">Nenhum evento marcado daqui para a frente.</p>
          ) : (
            porMes.map((grupo) => (
              <section key={grupo.chave} className="pmodal__mes">
                <h3>{grupo.rotulo}</h3>
                <ul className="pagenda pagenda--lista">
                  {grupo.eventos.map((evento) => (
                    <Evento key={evento.id} evento={evento}>
                      {podeEditar && (
                        <span className="pevento__acoes">
                          <button
                            type="button"
                            onClick={() => setEditando(evento)}
                            aria-label={`Editar ${evento.titulo}`}
                            title="Editar"
                          >
                            <Lapis />
                          </button>
                          <button
                            type="button"
                            className="is-perigo"
                            onClick={() => setApagando(evento)}
                            aria-label={`Excluir ${evento.titulo}`}
                            title="Excluir"
                          >
                            <Lixo />
                          </button>
                        </span>
                      )}
                    </Evento>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </Modal>

      <ModalEvento evento={editando} nivel={1} aoFechar={() => setEditando(null)} />

      <Confirma
        aberto={Boolean(apagando)}
        nivel={1}
        titulo="Excluir evento"
        mensagem={apagando ? `"${apagando.titulo}" sai da agenda de todo mundo.` : ''}
        rotuloConfirmar="Excluir"
        aoConfirmar={apagar}
        aoFechar={() => setApagando(null)}
      />
    </>
  )
}

/**
 * O formulario do evento. `evento` = null fecha; {} e um evento novo;
 * com `id`, edita aquele.
 */
export function ModalEvento({ evento, nivel = 0, aoFechar }) {
  const aberto = Boolean(evento)
  const novo = aberto && !evento.id
  const [campos, setCampos] = useState({ titulo: '', dia: '', hora: '', local: '' })
  const [erro, setErro] = useState({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!evento) return
    setCampos({
      titulo: evento.titulo ?? '',
      dia: evento.dia ?? '',
      hora: evento.hora ?? '',
      local: evento.local ?? '',
    })
    setErro({})
  }, [evento])

  const mudar = (campo, valor) => {
    setCampos((atual) => ({ ...atual, [campo]: valor }))
    setErro((atual) => ({ ...atual, [campo]: undefined, geral: undefined }))
  }

  const salvar = async (e) => {
    e.preventDefault()
    const titulo = campos.titulo.trim()
    if (!titulo) return setErro({ titulo: 'Dê um título ao evento.' })
    if (!campos.dia) return setErro({ dia: 'Escolha o dia do evento.' })

    setSalvando(true)
    try {
      const corpo = { ...campos, titulo, local: campos.local.trim() }
      if (novo) await agendaApi.criarEvento(corpo)
      else await agendaApi.editarEvento(evento.id, corpo)
      aoFechar()
    } catch (falha) {
      setErro({ geral: falha.message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={novo ? 'Novo evento' : 'Editar evento'}
      subtitulo="Aparece para todos na Agenda da Empresa"
      largura={460}
      nivel={nivel}
    >
      <form className="pform" onSubmit={salvar} noValidate>
        <CampoTexto
          rotulo="Título"
          placeholder="Ex.: Reunião Geral"
          maxLength={120}
          value={campos.titulo}
          onChange={(e) => mudar('titulo', e.target.value)}
          erro={erro.titulo}
          autoFocus
        />

        <div className="pform__linha">
          <CampoData
            rotulo="Dia"
            valor={campos.dia}
            aoMudar={(v) => mudar('dia', v)}
            /* evento novo e daqui para a frente; o que ja passou nem
               aparece mais na agenda */
            min={novo ? hojeLocal() : undefined}
            erro={erro.dia}
          />
          <div className="pform__hora">
            <CampoHora
              rotulo="Hora (opcional)"
              valor={campos.hora}
              aoMudar={(v) => mudar('hora', v)}
              vazio="Dia inteiro"
            />
            {campos.hora && (
              <button type="button" className="pform__limpar" onClick={() => mudar('hora', '')}>
                Sem hora
              </button>
            )}
          </div>
        </div>

        <CampoTexto
          rotulo="Local (opcional)"
          placeholder="Ex.: Sala de Reuniões, Online"
          maxLength={120}
          value={campos.local}
          onChange={(e) => mudar('local', e.target.value)}
        />

        {erro.geral && (
          <p className="pmodal__erro" role="alert">
            {erro.geral}
          </p>
        )}

        <footer className="formobra__acoes">
          <Button type="submit" loading={salvando}>
            {novo ? 'Adicionar' : 'Salvar'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
