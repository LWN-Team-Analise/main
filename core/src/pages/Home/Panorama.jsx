import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar, { PilhaAvatares } from '@/components/Avatar/Avatar'
import Estrelas from '@/components/Estrelas/Estrelas'
import { useDados } from '@/context/DadosContext'
import { tituloDaObra } from '@/domain/obras'
import useCorDaLogo from '@/hooks/useCorDaLogo'
import ModalAvisoGeral, { ModalHistoricoAvisos, ModalLerAviso } from '@/components/AvisoGeral/ModalAvisoGeral'
import * as agendaApi from '@/services/agendaService'
import * as avisosApi from '@/services/avisosService'
import GloboClientes from './GloboClientes'
import { Evento, ModalAgenda, ModalEvento } from './ModalAgenda'
import './Panorama.css'

/* ============================================================
   PANORAMA — a primeira aba da pagina inicial

   Quatro cards, cada um respondendo uma pergunta da empresa, e nao
   do dia de quem esta logado (isso e a Grade):

     Avisos e Comunicados   o que chegou para o meu setor (o sininho);
     Aniversariantes do Mes quem faz aniversario neste mes;
     Agenda da Empresa      o que esta marcado daqui para a frente;
     Destaques e Conquistas as obras e as pessoas mais bem avaliadas.

   So a agenda e cadastro novo (atualizacao 44). O resto le o que o
   sistema ja tinha: os avisos das obras, a data de nascimento do
   cadastro (so o dia e o mes chegam aqui) e as avaliacoes.
   ============================================================ */

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const dois = (n) => String(n).padStart(2, '0')

/** dd/mm de um carimbo (o envio do aviso, a conclusao da obra). */
function diaMes(valor) {
  if (!valor) return ''
  const t = String(valor)
  /* data pura ('AAAA-MM-DD'): sem Date, para nao escorregar de fuso */
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t.slice(8, 10)}/${t.slice(5, 7)}`
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return ''
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`
}

/** "Luis Gustavo da Silva Porto" -> "Luis Porto": o card e estreito. */
function nomeCurto(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 2) return partes.join(' ')
  return `${partes[0]} ${partes[partes.length - 1]}`
}

/** As notas antigas iam ate 10; aqui a escala e de cinco estrelas. */
const naEscala = (nota) => Math.min(5, Math.max(0, Number(nota) || 0))

/* abaixo disto a nota nao e destaque: "parabens" por um 2,5 seria ironia */
const NOTA_DESTAQUE = 4

/* ---------------- os desenhos ---------------- */

const Glifo = {
  megafone: () => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.2v3.6a1.2 1.2 0 0 0 1.2 1.2H7l5.6 3.6a.8.8 0 0 0 1.2-.7V6.1a.8.8 0 0 0-1.2-.7L7 9H5.2A1.2 1.2 0 0 0 4 10.2Z" />
      <path d="M7.2 15.2 8.4 19a1 1 0 0 0 1 .7h.9a.8.8 0 0 0 .77-1l-.9-3.2" />
      <path d="M17.2 9.2a4 4 0 0 1 0 5.6M19.6 6.8a7.4 7.4 0 0 1 0 10.4" />
    </svg>
  ),
  bolo: () => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20.5h16M5 20.5v-6.8a1.7 1.7 0 0 1 1.7-1.7h10.6a1.7 1.7 0 0 1 1.7 1.7v6.8" />
      <path d="M5 15.6c1.2 0 1.6.9 2.8.9s1.6-.9 2.8-.9 1.6.9 2.8.9 1.6-.9 2.8-.9 1.6.9 2.8.9" />
      <path d="M8.5 12V9.5M12 12V9.5M15.5 12V9.5" />
      <path d="M8.5 6.8c-.6-.5-.6-1.4 0-2.3.6.9.6 1.8 0 2.3ZM12 6.8c-.6-.5-.6-1.4 0-2.3.6.9.6 1.8 0 2.3ZM15.5 6.8c-.6-.5-.6-1.4 0-2.3.6.9.6 1.8 0 2.3Z" />
    </svg>
  ),
  calendario: ({ tamanho = 22, traco = 1.8 }) => (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.6" />
      <path d="M3.5 9.8h17M8 3.2v3.4M16 3.2v3.4" />
      <path d="M7.6 13.4h.01M12 13.4h.01M16.4 13.4h.01M7.6 17h.01M12 17h.01" strokeWidth={traco + 0.8} />
    </svg>
  ),
  trofeu: ({ tamanho = 22, traco = 1.8 }) => (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0V4Z" />
      <path d="M7.5 5.6H4.6v1.6a3.2 3.2 0 0 0 3.2 3.2M16.5 5.6h2.9v1.6a3.2 3.2 0 0 1-3.2 3.2" />
      <path d="M12 13.7v3M8.6 20.3h6.8M9.6 20.3l.6-3.6h3.6l.6 3.6" />
    </svg>
  ),
  seta: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" />
    </svg>
  ),
  mais: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  estrela: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.99 6.75 19.75l1-5.85L3.5 9.75l5.9-.85z" />
    </svg>
  ),
}

export default function Panorama() {
  return (
    /* a caixa de fora e a medida da grade: duas colunas ou uma conforme
       a largura que SOBRA para os cards (com ou sem o menu do lado), e
       nao a da janela */
    <div className="panorama-caixa">
      <div className="panorama">
        <CardAvisos />
        <CardAniversarios />
        <CardAgenda />
        <CardDestaques />
      </div>
      {/* embaixo da Agenda e dos Destaques, no meio: onde estao os clientes */}
      <GloboClientes />
    </div>
  )
}

/**
 * A moldura dos quatro cards: o icone no quadrado colorido, o titulo
 * e o link do canto. `marca` e o desenho grande e apagado do fundo (o
 * calendario da agenda, o trofeu dos destaques).
 */
function Cartao({ tom, Icone, titulo, acao, marca, children }) {
  const id = useId()
  return (
    <section className="pcard vidro" data-tom={tom} aria-labelledby={id}>
      {marca && (
        <span className="pcard__marca" aria-hidden="true">
          {marca}
        </span>
      )}
      <header className="pcard__topo">
        <span className="pcard__icone" aria-hidden="true">
          <Icone />
        </span>
        <div className="pcard__titulos">
          <h2 id={id}>{titulo}</h2>
        </div>
        {acao}
      </header>
      <div className="pcard__corpo">{children}</div>
    </section>
  )
}

/** O link do canto ("Ver todos →"). Sem `aoClicar`, nem aparece. */
function Link({ rotulo, aoClicar, expandido }) {
  if (!aoClicar) return null
  return (
    <button type="button" className="pcard__link" onClick={aoClicar} aria-expanded={expandido} title={rotulo}>
      {/* no card estreito (celular) sobra so a seta num circulo: o texto
          ao lado espremia o titulo em tres linhas */}
      <span className="pcard__linktexto">{rotulo}</span>
      <Glifo.seta />
    </button>
  )
}

/** O vazio de cada card: um recado, e nao um buraco no meio da tela. */
function Vazio({ Icone, titulo, texto, children }) {
  return (
    <div className="pvazio">
      <span className="pvazio__icone" aria-hidden="true">
        <Icone />
      </span>
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
      {children}
    </div>
  )
}

/* ============================================================
   1. AVISOS E COMUNICADOS

   Dois tipos de aviso numa lista so, do mais novo ao mais antigo — com
   os gerais marcados como importantes sempre no topo:

     o GERAL     o "Enviar aviso" do botao + (atualizacoes 46 e 47,
                 /api/avisos): um recado para a empresa inteira ou para o
                 SEU setor, enquanto nao expira nem e encerrado. O clique
                 abre ele inteiro; quem tem `enviar_avisos` encerra e
                 exclui por la. Terminado, ele fica no historico (o link
                 no pe do card);
     o de OBRA   os mesmos do sininho, com a mesma regra: so o que foi
                 enderecado ao SEU setor, mais os sem setor. Quem decide
                 e `minhasNotificacoes`, no contexto. O clique abre a
                 obra; abrir o card nao marca nada como lido (quem zera o
                 selo continua sendo o sininho).

   O card le os gerais de novo quando um e enviado ou excluido, em
   qualquer parte da tela (o evento AVISOS_MUDARAM do servico).
   ============================================================ */

const AVISOS_NO_CARD = 3

function CardAvisos() {
  const { minhasNotificacoes, clientePorId, rotuloEtapa, pode } = useDados()
  const navigate = useNavigate()
  const podeAvisar = pode('enviar_avisos')
  const [todos, setTodos] = useState(false)
  const [gerais, setGerais] = useState([])
  const [lendo, setLendo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [historico, setHistorico] = useState(false)

  useEffect(() => {
    let vivo = true
    const ler = () =>
      avisosApi
        .carregarAvisos()
        .then((lista) => vivo && setGerais(lista))
        /* sem os gerais o card continua com os de obra: um aviso que
           nao chegou nao pode derrubar a pagina inicial */
        .catch(() => {})
    ler()
    window.addEventListener(avisosApi.AVISOS_MUDARAM, ler)
    return () => {
      vivo = false
      window.removeEventListener(avisosApi.AVISOS_MUDARAM, ler)
    }
  }, [])

  /* o IMPORTANTE (o aviso geral laranja) fica sempre em cima, do mais
     novo ao mais antigo entre eles; depois vem o resto, por data. So a
     data deixava o importante descer assim que outro aviso chegava */
  const avisos = useMemo(
    () =>
      [
        ...gerais.map((a) => ({ ...a, geral: true, chave: `geral-${a.id}` })),
        ...minhasNotificacoes.map((a) => ({ ...a, chave: `obra-${a.id}` })),
      ].sort(
        (a, b) =>
          Number(Boolean(b.importante)) - Number(Boolean(a.importante)) ||
          String(b.enviadoEm).localeCompare(String(a.enviadoEm)),
      ),
    [gerais, minhasNotificacoes],
  )

  const lista = todos ? avisos : avisos.slice(0, AVISOS_NO_CARD)
  const sobra = avisos.length > AVISOS_NO_CARD

  return (
    <Cartao
      tom="azul"
      Icone={Glifo.megafone}
      titulo="Avisos e Comunicados"
      acao={
        <Link
          rotulo={todos ? 'Ver menos' : 'Ver todos'}
          aoClicar={sobra ? () => setTodos((t) => !t) : null}
          expandido={todos}
        />
      }
    >
      {avisos.length === 0 ? (
        <Vazio
          Icone={Glifo.megafone}
          titulo="Nenhum aviso por aqui"
          texto="Quando um aviso for enviado para a empresa ou para o seu setor, ele aparece neste card."
        >
          {podeAvisar && (
            <button type="button" className="pvazio__acao" onClick={() => setEnviando(true)}>
              <Glifo.mais />
              Enviar aviso
            </button>
          )}
        </Vazio>
      ) : (
        <ul className={`pavisos ${todos ? 'is-todos' : ''}`.trim()}>
          {lista.map((aviso) =>
            aviso.geral ? (
              <li key={aviso.chave}>
                <button
                  type="button"
                  className="paviso"
                  data-importante={aviso.importante ? 'sim' : undefined}
                  onClick={() => setLendo(aviso)}
                  title="Ler o aviso inteiro"
                >
                  <span className="paviso__ponto" aria-hidden="true" />
                  <span className="paviso__texto">
                    <strong>{aviso.titulo}</strong>
                    <span>
                      {aviso.mensagem || (aviso.enviadoPorNome ? `Enviado por ${aviso.enviadoPorNome}.` : 'Aviso para toda a empresa.')}
                    </span>
                  </span>
                  <time className="paviso__data" dateTime={aviso.enviadoEm}>
                    {diaMes(aviso.enviadoEm)}
                  </time>
                </button>
              </li>
            ) : (
              <li key={aviso.chave}>
                <button
                  type="button"
                  className="paviso"
                  data-tipo={aviso.obraTipo}
                  data-novo={aviso.lido ? undefined : 'sim'}
                  onClick={() => navigate(`/app/obras/${aviso.obraId}`)}
                  title="Abrir a obra deste aviso"
                >
                  <span className="paviso__ponto" aria-hidden="true" />
                  <span className="paviso__texto">
                    <strong>
                      {tituloDaObra({ proposta: aviso.proposta }, clientePorId(aviso.clienteId))}
                      {!aviso.lido && <span className="paviso__novo">Novo</span>}
                    </strong>
                    <span>{aviso.mensagem || `Pendência na ${rotuloEtapa(aviso.etapa)}.`}</span>
                  </span>
                  <time className="paviso__data" dateTime={aviso.enviadoEm}>
                    {diaMes(aviso.enviadoEm)}
                  </time>
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      <button type="button" className="pavisos__historico" onClick={() => setHistorico(true)}>
        Histórico de avisos
        <Glifo.seta />
      </button>

      <ModalLerAviso aviso={lendo} podeApagar={podeAvisar} aoFechar={() => setLendo(null)} />
      <ModalHistoricoAvisos aberto={historico} podeApagar={podeAvisar} aoFechar={() => setHistorico(false)} />
      {podeAvisar && <ModalAvisoGeral aberto={enviando} aoFechar={() => setEnviando(false)} />}
    </Cartao>
  )
}

/* ============================================================
   2. ANIVERSARIANTES DO MES

   Sai do `aniversario` de cada pessoa da equipe — 'MM-DD', so o dia e
   o mes (a API nao manda o ano para quem nao edita usuario). Em ordem
   de dia; quem faz aniversario HOJE ganha o anel, os confetes e o
   "Hoje!". A fileira rola de lado e ja abre no proximo aniversario,
   para o de hoje (ou o que vem) estar a vista sem procurar.
   ============================================================ */

const NA_FILEIRA = 4

function CardAniversarios() {
  const { equipe, nomeDoCargo, corDoCargo } = useDados()
  const [todos, setTodos] = useState(false)
  const fileira = useRef(null)

  const agora = new Date()
  const mes = dois(agora.getMonth() + 1)
  const hoje = `${mes}-${dois(agora.getDate())}`

  const doMes = useMemo(
    () =>
      equipe
        .filter((p) => typeof p.aniversario === 'string' && p.aniversario.slice(0, 2) === mes)
        .sort((a, b) => a.aniversario.localeCompare(b.aniversario) || String(a.nome).localeCompare(String(b.nome))),
    [equipe, mes],
  )

  /* o primeiro de hoje em diante: e ele que a fileira mostra primeiro */
  const proximo = doMes.findIndex((p) => p.aniversario >= hoje)

  useEffect(() => {
    const trilho = fileira.current
    if (!trilho || todos || proximo <= 0) return
    const alvo = trilho.children[proximo]
    if (alvo) trilho.scrollTo({ left: alvo.offsetLeft - trilho.offsetLeft - 4 })
  }, [proximo, todos])

  return (
    <Cartao
      tom="rosa"
      Icone={Glifo.bolo}
      titulo="Aniversariantes do Mês"
      acao={
        <Link
          rotulo={todos ? 'Ver menos' : 'Ver todos'}
          aoClicar={doMes.length > NA_FILEIRA ? () => setTodos((t) => !t) : null}
          expandido={todos}
        />
      }
    >
      {doMes.length === 0 ? (
        <Vazio
          Icone={Glifo.bolo}
          titulo={`Ninguém faz aniversário em ${MESES[agora.getMonth()]}`}
          texto="As datas vêm do cadastro de cada colaborador."
        />
      ) : (
        <ul ref={fileira} className={`panivs ${todos ? 'is-todos' : ''}`.trim()}>
          {doMes.map((p) => {
            const ehHoje = p.aniversario === hoje
            const setor = p.cargo ? nomeDoCargo(p.cargo) : p.cargoNome
            return (
              <li
                key={p.id}
                className="paniv"
                data-hoje={ehHoje ? 'sim' : undefined}
                data-passou={p.aniversario < hoje ? 'sim' : undefined}
                title={ehHoje ? `${p.nome} faz aniversário hoje!` : p.nome}
              >
                <span className="paniv__foto">
                  {ehHoje && (
                    <span className="paniv__confete" aria-hidden="true">
                      {Array.from({ length: 8 }, (_, i) => (
                        <i key={i} />
                      ))}
                    </span>
                  )}
                  <Avatar nome={p.nome} foto={p.foto} tamanho={64} />
                </span>
                <strong className="paniv__nome">{nomeCurto(p.nome)}</strong>
                <span className="paniv__dia">
                  {ehHoje ? 'Hoje!' : `${p.aniversario.slice(3, 5)}/${p.aniversario.slice(0, 2)}`}
                </span>
                {setor && (
                  <span className="paniv__setor" style={{ '--setor-cor': corDoCargo(p.cargo) }}>
                    {setor}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Cartao>
  )
}

/* ============================================================
   3. AGENDA DA EMPRESA

   O cadastro novo (atualizacao 44, server/routes/agenda.js): os
   proximos tres eventos numa linha do tempo, com o dia num bloco. O
   "Ver calendario" abre a lista inteira; quem tem `enviar_avisos`
   cria, edita e exclui por la (e pelo vazio do card, direto).
   ============================================================ */

const EVENTOS_NO_CARD = 3

function CardAgenda() {
  const { pode } = useDados()
  const podeEditar = pode('enviar_avisos')
  /* null = ainda carregando */
  const [eventos, setEventos] = useState(null)
  const [erro, setErro] = useState('')
  const [lista, setLista] = useState(false)
  const [editando, setEditando] = useState(null)

  const carregar = useCallback(async () => {
    try {
      setEventos(await agendaApi.carregarEventos())
      setErro('')
    } catch (e) {
      setErro(e.message)
      setEventos((atual) => atual ?? [])
    }
  }, [])

  /* le de novo quando a agenda muda, inclusive pelo "Marcar evento" do + */
  useEffect(() => {
    carregar()
    window.addEventListener(agendaApi.AGENDA_MUDOU, carregar)
    return () => window.removeEventListener(agendaApi.AGENDA_MUDOU, carregar)
  }, [carregar])

  const proximos = (eventos ?? []).slice(0, EVENTOS_NO_CARD)

  return (
    <Cartao
      tom="marinho"
      Icone={Glifo.calendario}
      titulo="Agenda da Empresa"
      marca={<Glifo.calendario tamanho={150} traco={1.1} />}
      acao={
        <Link
          rotulo="Ver calendário"
          aoClicar={eventos && (eventos.length > 0 || podeEditar) ? () => setLista(true) : null}
        />
      }
    >
      {eventos === null ? (
        <ul className="pagenda" aria-busy="true" aria-label="Carregando a agenda">
          {[0, 1, 2].map((i) => (
            <li key={i} className="pevento pevento--fantasma" />
          ))}
        </ul>
      ) : proximos.length === 0 ? (
        <Vazio
          Icone={Glifo.calendario}
          titulo={erro ? 'Não foi possível ler a agenda' : 'Nenhum evento marcado'}
          texto={erro || (podeEditar ? 'Marque a próxima reunião, treinamento ou confraternização.' : 'Quando um evento for marcado, ele aparece aqui.')}
        >
          {podeEditar && !erro && (
            <button type="button" className="pvazio__acao" onClick={() => setEditando({})}>
              <Glifo.mais />
              Adicionar evento
            </button>
          )}
        </Vazio>
      ) : (
        <ul className="pagenda">
          {proximos.map((evento) => (
            <Evento key={evento.id} evento={evento} />
          ))}
        </ul>
      )}

      <ModalAgenda
        aberto={lista}
        eventos={eventos ?? []}
        podeEditar={podeEditar}
        aoFechar={() => setLista(false)}
      />
      <ModalEvento evento={editando} aoFechar={() => setEditando(null)} />
    </Cartao>
  )
}

/* ============================================================
   4. DESTAQUES E CONQUISTAS

   Das AVALIACOES: as obras com as melhores notas (4 estrelas ou mais)
   e, entre elas, um slide com as pessoas de melhor media. Um
   carrossel com os pontinhos embaixo; ele anda sozinho a cada poucos
   segundos, para quando o mouse (ou o foco) esta nele e nao anda para
   quem pediu menos movimento ao sistema.
   ============================================================ */

const OBRAS_EM_DESTAQUE = 5
const PESSOAS_EM_DESTAQUE = 3
const TROCA_MS = 7000

function CardDestaques() {
  const { obras, equipe, pode } = useDados()
  const navigate = useNavigate()

  const slides = useMemo(() => {
    const quando = (o) => String(o.concluidaEm ?? o.avaliacao?.avaliadaEm ?? '')
    const melhores = obras
      .filter((o) => o.avaliacao && naEscala(o.avaliacao.nota) >= NOTA_DESTAQUE)
      .sort(
        (a, b) =>
          naEscala(b.avaliacao.nota) - naEscala(a.avaliacao.nota) || quando(b).localeCompare(quando(a)),
      )
      .slice(0, OBRAS_EM_DESTAQUE)
      .map((obra) => ({ tipo: 'obra', id: `obra-${obra.id}`, obra }))

    const pessoas = equipe
      .filter((p) => p.avaliacao !== null && p.avaliacao !== undefined && naEscala(p.avaliacao) >= NOTA_DESTAQUE)
      .sort((a, b) => naEscala(b.avaliacao) - naEscala(a.avaliacao) || (b.obrasAvaliadas ?? 0) - (a.obrasAvaliadas ?? 0))
      .slice(0, PESSOAS_EM_DESTAQUE)

    /* as pessoas entram em SEGUNDO: a primeira impressao e a obra, mas
       quem fez a obra nao pode ficar no fim de cinco slides */
    if (pessoas.length > 0) melhores.splice(1, 0, { tipo: 'equipe', id: 'equipe', pessoas })
    return melhores
  }, [obras, equipe])

  return (
    <Cartao
      tom="ambar"
      Icone={Glifo.trofeu}
      titulo="Destaques e Conquistas"
      marca={<Glifo.trofeu tamanho={150} traco={1.1} />}
      acao={
        <Link
          rotulo="Ver mais"
          aoClicar={pode('ver_avaliacoes') ? () => navigate('/app/avaliacoes') : null}
        />
      }
    >
      {slides.length === 0 ? (
        <Vazio
          Icone={Glifo.trofeu}
          titulo="Nenhum destaque ainda"
          texto={`As obras avaliadas com ${NOTA_DESTAQUE} estrelas ou mais aparecem aqui, junto de quem trabalhou nelas.`}
        />
      ) : (
        <Carrossel slides={slides} />
      )}
    </Cartao>
  )
}

function Carrossel({ slides }) {
  const trilho = useRef(null)
  const [atual, setAtual] = useState(0)
  const [parado, setParado] = useState(false)

  const irPara = useCallback((i) => {
    const t = trilho.current
    if (!t) return
    t.scrollTo({ left: i * t.clientWidth, behavior: 'smooth' })
  }, [])

  /* o pontinho segue o arrasto do dedo (ou da barra), e nao so o clique */
  const aoRolar = () => {
    const t = trilho.current
    if (!t || !t.clientWidth) return
    setAtual(Math.max(0, Math.min(slides.length - 1, Math.round(t.scrollLeft / t.clientWidth))))
  }

  useEffect(() => {
    if (slides.length < 2 || parado) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const relogio = window.setInterval(() => {
      if (document.hidden) return
      irPara((atual + 1) % slides.length)
    }, TROCA_MS)
    return () => window.clearInterval(relogio)
  }, [slides.length, parado, atual, irPara])

  return (
    <div
      className="pdests"
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
      onFocus={() => setParado(true)}
      onBlur={() => setParado(false)}
    >
      <div ref={trilho} className="pdests__trilho" onScroll={aoRolar}>
        {slides.map((s, i) => (
          <div
            key={s.id}
            className="pdests__slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${slides.length}`}
            aria-hidden={i === atual ? undefined : 'true'}
          >
            {s.tipo === 'obra' ? <SlideObra obra={s.obra} ativo={i === atual} /> : <SlideEquipe pessoas={s.pessoas} />}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="pdests__pontos" role="tablist" aria-label="Destaques">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === atual}
              aria-label={`Destaque ${i + 1}`}
              className={i === atual ? 'is-atual' : ''}
              onClick={() => irPara(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SlideObra({ obra, ativo }) {
  const { clientePorId, pessoaPorId, pode } = useDados()
  const navigate = useNavigate()
  const cliente = clientePorId(obra.clienteId)
  const cor = useCorDaLogo(cliente?.logo, cliente?.nome)
  const nota = naEscala(obra.avaliacao.nota)
  const equipe = (obra.membros ?? []).map(pessoaPorId).filter(Boolean)
  const concluida = Boolean(obra.concluidaEm)

  /* a obra fechada abre em Concluidas; a aberta, em Obras — cada uma so
     para quem ve a aba dela */
  const destino = concluida
    ? pode('ver_concluidas') && `/app/concluidas/${obra.id}`
    : pode('ver_obras') && `/app/obras/${obra.id}`

  const conteudo = (
    <>
      <span
        className={`pdest__foto ${cliente?.capa ? '' : 'pdest__foto--logo'}`.trim()}
        style={cliente?.capa ? { backgroundImage: `url("${cliente.capa}")` } : { '--cor-empresa': cor }}
        aria-hidden="true"
      >
        {!cliente?.capa && <Avatar nome={cliente?.nome} foto={cliente?.logo} tamanho={58} quadrado />}
        <span className="pdest__nota">
          <Glifo.estrela />
          {nota.toFixed(1).replace('.', ',')}
        </span>
      </span>

      <span className="pdest__texto">
        <strong className="pdest__titulo">{tituloDaObra(obra, cliente)}</strong>
        <span className="pdest__estrelas">
          <Estrelas nota={nota} tamanho={14} />
          {obra.notas?.length > 1 && <em>média de {obra.notas.length} notas</em>}
        </span>
        <span className="pdest__frase">
          {concluida
            ? `Parabéns ${equipe.length > 1 ? `aos ${equipe.length} envolvidos` : 'a todos os envolvidos'} por uma obra entregue com excelência.`
            : `Parabéns ${equipe.length > 1 ? `aos ${equipe.length} envolvidos` : 'a todos os envolvidos'} pela ótima avaliação.`}
        </span>
        <span className="pdest__pe">
          {equipe.length > 0 && <PilhaAvatares pessoas={equipe} tamanho={22} limite={4} />}
          <span className="pdest__data">
            <Glifo.calendario tamanho={13} traco={2} />
            {diaMes(obra.concluidaEm ?? obra.avaliacao.avaliadaEm)}
          </span>
        </span>
      </span>
    </>
  )

  return destino ? (
    <button
      type="button"
      className="pdest"
      onClick={() => navigate(destino)}
      tabIndex={ativo ? undefined : -1}
      title="Abrir a obra"
    >
      {conteudo}
    </button>
  ) : (
    <div className="pdest">{conteudo}</div>
  )
}

function SlideEquipe({ pessoas }) {
  const { nomeDoCargo, corDoCargo } = useDados()
  return (
    <div className="pdest pdest--equipe">
      <span className="pdest__texto">
        <strong className="pdest__titulo">Destaques da equipe</strong>
        <span className="pdest__frase">As melhores médias nas obras avaliadas. Obrigado pelo capricho!</span>
      </span>
      <ol className="ppodio">
        {pessoas.map((p, i) => (
          <li key={p.id} className="ppodio__um" data-lugar={i + 1} title={p.nome}>
            <span className="ppodio__foto">
              <Avatar nome={p.nome} foto={p.foto} tamanho={i === 0 ? 60 : 50} />
              <span className="ppodio__lugar">{i + 1}º</span>
            </span>
            <strong>{nomeCurto(p.nome)}</strong>
            <span className="ppodio__media">
              <Glifo.estrela />
              {naEscala(p.avaliacao).toFixed(1).replace('.', ',')}
              <em>
                {p.obrasAvaliadas} obra{p.obrasAvaliadas === 1 ? '' : 's'}
              </em>
            </span>
            {p.cargo && (
              <span className="paniv__setor" style={{ '--setor-cor': corDoCargo(p.cargo) }}>
                {nomeDoCargo(p.cargo)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
