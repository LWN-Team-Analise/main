import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Confirma from '@/components/Confirma/Confirma'
import Seletor from '@/components/Seletor/Seletor'
import { useDados } from '@/context/DadosContext'
import {
  SUBTITULO_MAXIMO,
  TITULO_MAXIMO,
  corPorId,
  diaDaSemana,
  diasEntre,
  domingoDe,
  minutosDoTurno,
  somarDias,
} from '@/domain/turnos'
import * as turnosApi from '@/services/turnosService'
import { hojeISO } from '@/utils/formato'
import ModalTurno from './ModalTurno'
import ModalCronograma from './ModalCronograma'
import ModalAnotacao from './ModalAnotacao'
import './Turnos.css'

/* ============================================================
   TURNOS — a escala da equipe, no desenho dos Turnos do Teams

   No alto, duas barras como as do Teams:

     1a   o titulo, "Copiar agenda", "Compartilhar com a equipe" e o
          "+ Turno";
     2a   Hoje, as setas e o periodo ("25 de outubro – 7 de novembro de
          2026"); a direita os Conflitos, a visao (uma ou duas
          semanas), Imprimir, Filtrar, Exibir e "Adicionar cronograma".

   Embaixo, a grade:

     a linha dos dias     o dia, quantas pessoas trabalham e as horas;
     Anotacoes do dia     um recado por dia (quem edita escreve);
     Obras                a execucao e os prazos, direto das obras;
     os CRONOGRAMAS       Cronograma LWN, Cronograma Anapolis... (e os
                          que vierem), cada um abre e fecha. Dentro, os
                          "Turnos abertos" (ainda sem pessoa) e uma
                          linha por pessoa, com as horas do periodo.

   O turno e um bloco de fundo transparente, so com a BORDA na cor dele.
   O que cobre varios dias (a folga de 13/10 a 27/10) atravessa os dias.
   Varios no mesmo dia empilham.

   Os turnos vem de dois lugares: os criados aqui (a mao, colados ou
   copiados da agenda anterior) e o check com horario das obras — o
   ponto de encontro de cada data, para cada pessoa daquele dia. Este
   muda pela obra; clicar nele mostra de onde vem.

   QUEM EDITA (`editar_turnos`) trabalha como no Teams:

     clicar num card        escolhe (Ctrl/Shift + clique junta mais);
                            clicar de novo no escolhido abre;
     clicar num dia         escolhe o dia (a celula); clicar de novo cria
                            o turno ali;
     Copiar / Ctrl+C        guarda os cards escolhidos — os turnos e
                            tambem as tarefas das obras (ponto de
                            encontro, execucao, prazo);
     Colar / Ctrl+V         poe os copiados no dia escolhido, ou no dia
                            do card escolhido (a linha dele);
     Delete                 exclui os escolhidos; Esc desfaz a escolha.

   A tarefa da obra colada vira um turno feito aqui (a obra e o check
   vao junto): o original continua mudando so pela obra.

   O turno criado, colado ou copiado da agenda nasce SEM COMPARTILHAR:
   em italico, com o ✱ na barra da esquerda, e a equipe ainda nao o ve.
   Ele vale para todos depois do "Compartilhar com a equipe" — dos
   escolhidos, ou de todos os do periodo.
   ============================================================ */

const SEMANA = ['do', 'se', 'te', 'qu', 'qu', 'se', 'sá']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const VISOES = [
  { valor: 'semana', rotulo: 'Semana', dias: 7 },
  { valor: 'duas', rotulo: 'Duas semanas', dias: 14 },
]
/* o "Exibir": o que aparece na grade */
const PARTES = [
  { id: 'notas', rotulo: 'Anotações do dia' },
  { id: 'obras', rotulo: 'Obras (execução e prazos)' },
  { id: 'abertos', rotulo: 'Turnos abertos' },
]

const CHAVE_VISAO = 'atmosfera.turnos.visao'
const CHAVE_FECHADOS = 'atmosfera.turnos.fechados'
const CHAVE_EXIBIR = 'atmosfera.turnos.exibir'

function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave)
    return bruto === null ? padrao : JSON.parse(bruto)
  } catch {
    return padrao
  }
}

function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    /* modo privado: so nao lembra */
  }
}

const partes = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return { a, m, d }
}

/** "25 de outubro – 7 de novembro de 2026" (o mes e o ano so aparecem quando mudam). */
function rotuloDoPeriodo(de, ate) {
  const x = partes(de)
  const y = partes(ate)
  if (x.a !== y.a) return `${x.d} de ${MESES[x.m - 1]} de ${x.a} – ${y.d} de ${MESES[y.m - 1]} de ${y.a}`
  if (x.m !== y.m) return `${x.d} de ${MESES[x.m - 1]} – ${y.d} de ${MESES[y.m - 1]} de ${y.a}`
  return `${x.d} – ${y.d} de ${MESES[y.m - 1]} de ${y.a}`
}

/** 2981 h -> "2.981 H"; 9,5 h -> "9,5 H". */
const emHoras = (minutos) => `${(minutos / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} H`

const curta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

/** Para procurar sem acento e sem caixa: "Anápolis" acha "anapolis". */
const simples = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** O turno feito aqui: so ele se exclui e se compartilha (o das obras muda pela obra). */
const ehManual = (turno) => !turno.origem || turno.origem === 'manual'

/**
 * A copia de um card que vem das obras (ponto de encontro, execucao,
 * prazo de tarefa): os campos dele, para colar como turno feito aqui.
 * O ponto de encontro so tem a hora de chegada — ela vai na linha de
 * baixo e o turno colado fica de dia inteiro.
 */
function modeloDe(turno) {
  const encontro = turno.origem === 'obra' && turno.horaInicio && !turno.horaFim
  return {
    titulo: String(turno.titulo ?? 'Tarefa').slice(0, TITULO_MAXIMO),
    subtitulo: [turno.subtitulo, encontro ? `encontro às ${turno.horaInicio}` : '']
      .filter(Boolean)
      .join(' · ')
      .slice(0, SUBTITULO_MAXIMO),
    cor: turno.cor,
    dataInicio: turno.dataInicio,
    dataFim: turno.dataFim,
    horaInicio: encontro ? null : turno.horaInicio,
    horaFim: encontro ? null : turno.horaFim,
    obraId: turno.obraId ?? null,
    checkId: turno.checkId ?? null,
  }
}

/**
 * Cada turno no seu lugar da linha: as colunas (do primeiro ao ultimo
 * dia que aparece) e a FAIXA — turnos que se cruzam vao para faixas
 * diferentes, um embaixo do outro.
 */
function colocar(turnos, dias) {
  const ultimo = dias.length - 1
  const lista = turnos
    .map((turno) => ({
      turno,
      ini: Math.max(0, diasEntre(dias[0], turno.dataInicio)),
      fim: Math.min(ultimo, diasEntre(dias[0], turno.dataFim)),
    }))
    .filter((c) => c.ini <= ultimo && c.fim >= 0 && c.ini <= c.fim)
    .sort((a, b) => a.ini - b.ini || b.fim - b.ini - (a.fim - a.ini) || String(a.turno.horaInicio ?? '').localeCompare(String(b.turno.horaInicio ?? '')))
  const fimDaFaixa = []
  lista.forEach((c) => {
    let faixa = fimDaFaixa.findIndex((fim) => fim < c.ini)
    if (faixa === -1) faixa = fimDaFaixa.length
    fimDaFaixa[faixa] = c.fim
    c.faixa = faixa
  })
  return { colocados: lista, faixas: Math.max(1, fimDaFaixa.length) }
}

/** Os minutos de um turno dentro do periodo (as horas de cada dia que aparece). */
function minutosNoPeriodo(turno, dias) {
  const ini = turno.dataInicio > dias[0] ? turno.dataInicio : dias[0]
  const fim = turno.dataFim < dias.at(-1) ? turno.dataFim : dias.at(-1)
  if (fim < ini) return 0
  return minutosDoTurno(turno) * (diasEntre(ini, fim) + 1)
}

const paraMinutos = (hora) => {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/**
 * O pedaco do dia que o turno ocupa, em minutos [inicio, fim): sem
 * horario e o dia inteiro (a folga); so com o inicio (o ponto de
 * encontro da obra) e aquele instante; o que passa da meia-noite vai
 * ate o fim do dia.
 */
function ocupa(turno) {
  if (!turno.horaInicio) return [0, 24 * 60]
  const ini = paraMinutos(turno.horaInicio)
  if (!turno.horaFim) return [ini, ini + 1]
  const fim = paraMinutos(turno.horaFim)
  return [ini, fim > ini ? fim : 24 * 60]
}

/**
 * Os CONFLITOS, como no Teams: a mesma pessoa, no mesmo dia, com dois
 * turnos que se cruzam no horario — ou uma folga (dia inteiro) com
 * qualquer outro. Vale entre cronogramas e com o ponto de encontro das
 * obras.
 */
function acharConflitos(turnos, dias) {
  const doDia = new Map()
  turnos.forEach((t) => {
    if (!t.usuarioId) return
    dias.forEach((d) => {
      if (d < t.dataInicio || d > t.dataFim) return
      const chave = `${t.usuarioId}|${d}`
      if (!doDia.has(chave)) doDia.set(chave, [])
      doDia.get(chave).push(t)
    })
  })
  const ids = new Set()
  const lista = []
  doDia.forEach((daPessoa, chave) => {
    for (let i = 0; i < daPessoa.length; i += 1) {
      for (let j = i + 1; j < daPessoa.length; j += 1) {
        const [a1, a2] = ocupa(daPessoa[i])
        const [b1, b2] = ocupa(daPessoa[j])
        if (a1 < b2 && b1 < a2) {
          const [usuarioId, dia] = chave.split('|')
          ids.add(daPessoa[i].id)
          ids.add(daPessoa[j].id)
          lista.push({ chave: `${chave}|${i}|${j}`, usuarioId, dia, a: daPessoa[i], b: daPessoa[j] })
        }
      }
    }
  })
  lista.sort((x, y) => x.dia.localeCompare(y.dia))
  return { ids, lista }
}

/** Fecha o menu (Conflitos, Exibir) no clique fora dele e no Esc. */
function useFechaFora(aberto, fechar) {
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return undefined
    const clique = (e) => {
      if (ref.current && !ref.current.contains(e.target)) fechar()
    }
    const tecla = (e) => {
      if (e.key === 'Escape') fechar()
    }
    document.addEventListener('mousedown', clique)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', clique)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto, fechar])
  return ref
}

/* ---------------- os icones (traco, como os do Teams) ---------------- */

const Icone = ({ d, children, tamanho = 16 }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
)

const IconePessoas = () => (
  <Icone tamanho={14}>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 6a3 3 0 0 1 0 5.6M17.5 14a5.5 5.5 0 0 1 3 5" />
  </Icone>
)

const IconeSeta = ({ esquerda }) => <Icone tamanho={18} d={esquerda ? 'M19 12H5M11 6l-6 6 6 6' : 'M5 12h14M13 6l6 6-6 6'} />
const IconeCopiar = () => (
  <Icone>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icone>
)
const IconeColar = () => (
  <Icone>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4.5V3h6v1.5M9.5 10h5M9.5 14h5" />
  </Icone>
)
const IconeCompartilhar = () => <Icone d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
const IconeAlerta = () => <Icone d="M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17.2v.1" />
const IconeImprimir = () => <Icone d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7Z" />
const IconeFiltrar = () => <Icone d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5Z" />
const IconeExibir = () => (
  <Icone>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Icone>
)
const IconeGrupo = () => <Icone d="M12 5v14M5 12h14" />
const IconeMembro = () => (
  <Icone>
    <circle cx="10" cy="8.5" r="3.2" />
    <path d="M4 19.5a6 6 0 0 1 12 0M19 8v6M16 11h6" />
  </Icone>
)
const IconeAbrir = () => <Icone d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
const IconeLixo = () => <Icone d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
const IconeFechar = () => <Icone d="M6 6l12 12M18 6 6 18" />
const IconeMais = () => (
  <Icone tamanho={18}>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </Icone>
)

/**
 * Uma linha da grade: a coluna de quem (presa a esquerda) e os dias,
 * com os turnos por cima.
 *
 * `linha` e a chave dela ("cronograma|pessoa"): com ela a celula sabe
 * se e a escolhida. Sem `aoCelula` (a secao Obras, ou quem so ve) os
 * dias nao se clicam.
 */
function Linha({ quem, linha, turnos, dias, hoje, celula, selecao, conflitos, escolhe, aoCelula, aoTurno }) {
  const { colocados, faixas } = colocar(turnos, dias)
  return (
    <div className="turnos__linha">
      <div className="turnos__canto">{quem}</div>
      <div className="turnos__faixa" style={{ gridTemplateRows: `repeat(${faixas}, minmax(64px, auto))` }}>
        {dias.map((dia, i) => {
          const escolhida = celula === `${linha}|${dia}`
          const classe = `turnos__celula ${dia === hoje ? 'is-hoje' : ''} ${escolhida ? 'is-escolhida' : ''}`.replace(/\s+/g, ' ').trim()
          const lugar = { gridColumn: i + 1, gridRow: `1 / span ${faixas}` }
          return aoCelula ? (
            <button
              key={dia}
              type="button"
              className={classe}
              style={lugar}
              onClick={() => aoCelula(dia)}
              aria-pressed={escolhida}
              aria-label={escolhida ? `Novo turno em ${curta(dia)}` : `Escolher ${curta(dia)}`}
            >
              {escolhida && (
                <span className="turnos__mais" aria-hidden="true">
                  +
                </span>
              )}
            </button>
          ) : (
            <div key={dia} className={classe} style={lugar} />
          )
        })}
        {colocados.map(({ turno, ini, fim, faixa }) => {
          const varios = turno.dataInicio !== turno.dataFim
          const linha2 = turno.subtitulo || (varios ? `${curta(turno.dataInicio)} – ${curta(turno.dataFim)}` : '')
          const hora = turno.horaInicio ? (turno.horaFim ? `${turno.horaInicio} – ${turno.horaFim}` : turno.horaInicio) : ''
          const rascunho = turno.compartilhado === false
          const conflito = conflitos.has(turno.id)
          const escolhido = selecao.has(turno.id)
          const classe = [
            'turno',
            turno.origem === 'obra' && 'is-obra',
            rascunho && 'is-rascunho',
            escolhido && 'is-escolhido',
            conflito && 'is-conflito',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={turno.id}
              type="button"
              className={classe}
              style={{ gridColumn: `${ini + 1} / ${fim + 2}`, gridRow: faixa + 1, '--turno-cor': corPorId(turno.cor).cor }}
              onClick={(evento) => aoTurno(turno, evento, linha)}
              aria-pressed={escolhe ? escolhido : undefined}
              title={[
                turno.titulo,
                turno.subtitulo,
                varios ? `${curta(turno.dataInicio)} – ${curta(turno.dataFim)}` : '',
                hora,
                rascunho ? 'Ainda não compartilhado com a equipe' : '',
                conflito ? 'Conflito de horário' : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <strong>{turno.titulo}</strong>
              {linha2 && <span>{linha2}</span>}
              {hora && <em>{hora}</em>}
              {conflito && (
                <b className="turno__conflito" aria-label="Conflito de horário">
                  !
                </b>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function Turnos() {
  const { pode, pessoaPorId } = useDados()
  const edita = pode('editar_turnos')
  const hoje = hojeISO()

  const [visao, setVisao] = useState(() => (ler(CHAVE_VISAO, 'duas') === 'semana' ? 'semana' : 'duas'))
  const [inicio, setInicio] = useState(() => domingoDe(hoje))
  const nDias = VISOES.find((v) => v.valor === visao)?.dias ?? 14
  const dias = useMemo(() => Array.from({ length: nDias }, (_, i) => somarDias(inicio, i)), [inicio, nDias])

  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [fechados, setFechados] = useState(() => new Set(ler(CHAVE_FECHADOS, [])))
  const [exibir, setExibir] = useState(() => ({ notas: true, obras: true, abertos: true, ...ler(CHAVE_EXIBIR, {}) }))
  const [filtro, setFiltro] = useState('')
  const [filtrando, setFiltrando] = useState(false)
  const [menu, setMenu] = useState(null) // 'conflitos' | 'exibir'
  /* os pop-ups: o turno ({ turno } ou { base }), a anotacao (o dia) e o cronograma ('novo' ou ele) */
  const [editando, setEditando] = useState(null)
  const [anotando, setAnotando] = useState(null)
  const [cronograma, setCronograma] = useState(null)
  /* as confirmacoes: 'excluir', 'compartilhar' (todos do periodo) e 'agenda' */
  const [confirmando, setConfirmando] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  /* a escolha, como no Teams: os turnos (ids), o dia de uma linha e os copiados */
  const [selecao, setSelecao] = useState(() => new Set())
  const [celula, setCelula] = useState(null) // { chave, cronogramaId, usuarioId, dia }
  const [copiados, setCopiados] = useState([])
  /* o ultimo card clicado e a linha dele: o Ctrl+V sem dia escolhido cola ali */
  const [ultimo, setUltimo] = useState(null) // { id, linha }

  const de = dias[0]
  const ate = dias.at(-1)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try {
      const novos = await turnosApi.carregar(de, ate)
      setDados(novos)
      setErro('')
      /* o escolhido que sumiu (excluido, ou fora do periodo) sai da escolha */
      const existem = new Set([...(novos.turnos ?? []), ...(novos.obras ?? [])].map((t) => t.id))
      setSelecao((atual) => (Array.from(atual).every((id) => existem.has(id)) ? atual : new Set(Array.from(atual).filter((id) => existem.has(id)))))
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [de, ate])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  /* o dia escolhido nao atravessa a troca de periodo; os copiados sim
     (copiar nesta semana e colar na outra e o uso comum) */
  useEffect(() => {
    setCelula(null)
  }, [de, ate])

  /* o recado ("2 turnos colados") some sozinho */
  useEffect(() => {
    if (!aviso) return undefined
    const t = setTimeout(() => setAviso(''), 4500)
    return () => clearTimeout(t)
  }, [aviso])

  const fecharMenu = useCallback(() => setMenu(null), [])
  const refConflitos = useFechaFora(menu === 'conflitos', fecharMenu)
  const refExibir = useFechaFora(menu === 'exibir', fecharMenu)

  const mudarVisao = (valor) => {
    setVisao(valor)
    guardar(CHAVE_VISAO, valor)
  }

  const alternar = (id) => {
    setFechados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      guardar(CHAVE_FECHADOS, [...novo])
      return novo
    })
  }

  const alternarParte = (id) => {
    setExibir((atual) => {
      const novo = { ...atual, [id]: !atual[id] }
      guardar(CHAVE_EXIBIR, novo)
      return novo
    })
  }

  /* ---- as contas da grade ---- */
  const contas = useMemo(() => {
    if (!dados) return null
    const turnos = dados.turnos ?? []
    const daLinha = (cronogramaId, usuarioId) =>
      turnos.filter((t) =>
        usuarioId
          ? t.usuarioId === usuarioId && (t.origem === 'obra' || t.cronogramaId === cronogramaId)
          : !t.usuarioId && t.cronogramaId === cronogramaId,
      )

    /* por dia: horas e pessoas, sem contar duas vezes o turno da obra
       que aparece em mais de um cronograma */
    const porDia = Object.fromEntries(dias.map((d) => [d, { minutos: 0, pessoas: new Set() }]))
    turnos.forEach((t) => {
      if (!t.usuarioId) return
      dias.forEach((d) => {
        if (d < t.dataInicio || d > t.dataFim) return
        porDia[d].minutos += minutosDoTurno(t)
        porDia[d].pessoas.add(t.usuarioId)
      })
    })

    const grupos = (dados.cronogramas ?? []).map((c) => {
      const pessoas = c.membros.map((id) => {
        const lista = daLinha(c.id, id)
        return { id, turnos: lista, minutos: lista.reduce((s, t) => s + minutosNoPeriodo(t, dias), 0) }
      })
      return {
        ...c,
        abertos: daLinha(c.id, null),
        pessoas,
        minutos: pessoas.reduce((s, p) => s + p.minutos, 0),
      }
    })

    /* a secao Obras: a execucao (em trechos) e os prazos das tarefas */
    const execucao = (dados.obras ?? []).filter((t) => t.linha === 'execucao')
    return {
      porDia,
      grupos,
      execucao,
      emExecucao: new Set(execucao.map((t) => t.obraId)).size,
      prazos: (dados.obras ?? []).filter((t) => t.linha === 'prazo'),
      total: Object.values(porDia).reduce((s, d) => s + d.minutos, 0),
      conflitos: acharConflitos(turnos, dias),
      /* os que a equipe ainda nao ve */
      rascunhos: turnos.filter((t) => t.compartilhado === false),
      porId: new Map([...turnos, ...(dados.obras ?? [])].map((t) => [t.id, t])),
    }
  }, [dados, dias])

  const escolhidos = useMemo(
    () => (contas ? Array.from(selecao).map((id) => contas.porId.get(id)).filter(Boolean) : []),
    [contas, selecao],
  )
  const rascunhosEscolhidos = escolhidos.filter((t) => t.compartilhado === false)
  const manuaisEscolhidos = escolhidos.filter(ehManual)

  const nomeDe = (usuarioId) => (usuarioId ? (pessoaPorId(usuarioId)?.nome ?? 'Pessoa') : 'Turnos abertos')

  const novoTurno = (base) => setEditando({ base })
  const visaoAtual = VISOES.find((v) => v.valor === visao)

  /* ---- escolher ---- */

  const limparEscolha = () => {
    setSelecao(new Set())
    setCelula(null)
  }

  /** O clique no card: quem so ve, abre; quem edita escolhe (e abre no segundo clique). */
  const clicarTurno = (turno, evento, linha) => {
    if (!edita) {
      setEditando({ turno })
      return
    }
    /* o Shift + clique nao deixa texto marcado (ele seguraria o Ctrl+C) */
    window.getSelection?.()?.removeAllRanges()
    setCelula(null)
    setUltimo({ id: turno.id, linha })
    if (evento.ctrlKey || evento.metaKey || evento.shiftKey) {
      setSelecao((atual) => {
        const nova = new Set(atual)
        if (nova.has(turno.id)) nova.delete(turno.id)
        else nova.add(turno.id)
        return nova
      })
      return
    }
    if (selecao.size === 1 && selecao.has(turno.id)) {
      setEditando({ turno })
      return
    }
    setSelecao(new Set([turno.id]))
  }

  /** O clique no dia de uma linha: escolhe; no dia ja escolhido, cria o turno ali. */
  const clicarCelula = (cronogramaId, usuarioId, dia) => {
    const chave = `${cronogramaId}|${usuarioId ?? ''}|${dia}`
    if (celula?.chave === chave) {
      novoTurno({ cronogramaId, usuarioId, dia })
      return
    }
    setSelecao(new Set())
    setCelula({ chave, cronogramaId, usuarioId, dia })
  }

  /* ---- as acoes (os botoes e as teclas) ---- */

  const executar = async (fazer) => {
    setOcupado(true)
    try {
      await fazer()
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const copiar = () => {
    if (escolhidos.length === 0) return
    /* o turno daqui vai pelo id; a tarefa da obra, pelos campos do card */
    setCopiados(escolhidos.map((t) => (ehManual(t) ? { id: t.id, titulo: t.titulo } : { modelo: modeloDe(t), titulo: t.titulo })))
    setAviso(`${plural(escolhidos.length, 'card copiado', 'cards copiados')}. Escolha o dia e aperte Ctrl+V (ou Colar).`)
  }

  /**
   * Onde o Ctrl+V cola: o dia escolhido; sem ele, o dia do card escolhido,
   * na linha dele (a pessoa ou os turnos abertos daquele cronograma).
   * Nas linhas da secao Obras nao se cola.
   */
  const destino = (() => {
    if (celula) return celula
    if (!ultimo || !selecao.has(ultimo.id) || !contas) return null
    const [cronogramaId, usuarioId] = ultimo.linha.split('|')
    if (cronogramaId === 'obras') return null
    const turno = contas.porId.get(ultimo.id)
    if (!turno) return null
    return { cronogramaId, usuarioId: usuarioId || null, dia: turno.dataInicio < de ? de : turno.dataInicio }
  })()

  const colar = () => {
    if (!destino || copiados.length === 0) return
    const alvo = destino
    executar(async () => {
      const r = await turnosApi.colarTurnos({
        origem: copiados.filter((t) => t.id).map((t) => t.id),
        modelos: copiados.filter((t) => t.modelo).map((t) => t.modelo),
        cronogramaId: alvo.cronogramaId,
        usuarioId: alvo.usuarioId,
        dia: alvo.dia,
      })
      await recarregar()
      /* os colados ficam escolhidos: prontos para o "Compartilhar com a equipe" */
      setCelula(null)
      setSelecao(new Set(r.ids ?? []))
      setAviso(`${plural(r.colados, 'turno colado', 'turnos colados')} — ainda não compartilhado${r.colados === 1 ? '' : 's'} com a equipe.`)
    })
  }

  const excluir = () => {
    const ids = manuaisEscolhidos.map((t) => t.id)
    setConfirmando(null)
    executar(async () => {
      await Promise.all(ids.map((id) => turnosApi.apagarTurno(id)))
      setSelecao(new Set())
      await recarregar()
      setAviso(plural(ids.length, 'turno excluído.', 'turnos excluídos.'))
    })
  }

  /** "Compartilhar com a equipe": os escolhidos que ainda nao foram; sem escolha, pede para mandar todos do periodo. */
  const compartilhar = () => {
    if (rascunhosEscolhidos.length > 0) {
      const ids = rascunhosEscolhidos.map((t) => t.id)
      executar(async () => {
        const r = await turnosApi.compartilhar({ ids })
        await recarregar()
        setAviso(`${plural(r.compartilhados, 'turno compartilhado', 'turnos compartilhados')} com a equipe.`)
      })
      return
    }
    if ((contas?.rascunhos.length ?? 0) > 0) setConfirmando('compartilhar')
  }

  const compartilharTodos = () => {
    setConfirmando(null)
    executar(async () => {
      const r = await turnosApi.compartilhar({ de, ate })
      await recarregar()
      setAviso(`${plural(r.compartilhados, 'turno compartilhado', 'turnos compartilhados')} com a equipe.`)
    })
  }

  const copiarAgenda = () => {
    setConfirmando(null)
    executar(async () => {
      const r = await turnosApi.copiarAgenda({ de, ate })
      await recarregar()
      setCelula(null)
      setSelecao(new Set(r.ids ?? []))
      setAviso(
        r.copiados
          ? `${plural(r.copiados, 'turno copiado', 'turnos copiados')} do período anterior — confira e compartilhe com a equipe.`
          : 'Nada para copiar: o período anterior não tem turnos (ou eles já foram copiados).',
      )
    })
  }

  /* as teclas do Teams: Ctrl+C, Ctrl+V, Delete e Esc. Fora dos campos
     de texto e com nenhum pop-up aberto. */
  const teclas = useRef(null)
  teclas.current = (evento) => {
    if (!edita || editando || anotando || cronograma || confirmando) return
    const alvo = evento.target
    if (alvo?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
    const ctrl = (evento.ctrlKey || evento.metaKey) && !evento.altKey
    /* pela tecla e pelo lugar dela: o C e o V valem em qualquer layout de teclado */
    const tecla = String(evento.key ?? '').toLowerCase()
    const eC = tecla === 'c' || evento.code === 'KeyC'
    const eV = tecla === 'v' || evento.code === 'KeyV'
    /* texto marcado de proposito (fora da grade) ainda copia texto, como sempre */
    const naGrade = Boolean(document.activeElement?.closest?.('.turnos__quadro, .turnos__escolha'))
    const textoMarcado = Boolean(window.getSelection?.()?.toString())
    if (ctrl && eC && escolhidos.length > 0 && (naGrade || !textoMarcado)) {
      evento.preventDefault()
      copiar()
    } else if (ctrl && eV && destino && copiados.length > 0) {
      evento.preventDefault()
      colar()
    } else if ((evento.key === 'Delete' || evento.key === 'Backspace') && manuaisEscolhidos.length > 0) {
      evento.preventDefault()
      setConfirmando('excluir')
    } else if (evento.key === 'Escape' && (selecao.size > 0 || celula)) {
      limparEscolha()
    }
  }
  useEffect(() => {
    const ouvir = (evento) => teclas.current?.(evento)
    document.addEventListener('keydown', ouvir)
    return () => document.removeEventListener('keydown', ouvir)
  }, [])

  /* ---- o filtro: pessoa pelo nome, ou pelo titulo de um turno dela ---- */
  const procura = simples(filtro.trim())
  const passa = (usuarioId, turnos) =>
    !procura || simples(nomeDe(usuarioId)).includes(procura) || turnos.some((t) => simples(t.titulo).includes(procura))

  const nConflitos = contas?.conflitos.lista.length ?? 0
  const nRascunhos = contas?.rascunhos.length ?? 0

  /* o que cada linha precisa para escolher e marcar */
  const daGrade = {
    dias,
    hoje,
    celula: celula?.chave ?? null,
    selecao,
    conflitos: contas?.conflitos.ids ?? new Set(),
    escolhe: edita,
    aoTurno: clicarTurno,
  }

  return (
    <AppShell>
      <section className="turnos">
        {/* 1a barra: o titulo e o que mexe na agenda inteira */}
        <header className="turnos__topo">
          <h1 className="tela__titulo">Turnos</h1>
          <span className="turnos__espaco" />
          {edita && (
            <div className="turnos__acoes">
              <button
                type="button"
                className="turnos__ferramenta"
                onClick={() => setConfirmando('agenda')}
                disabled={ocupado || !dados}
                title="Trazer os turnos do período anterior para este"
              >
                <IconeCopiar />
                Copiar agenda
              </button>
              <button
                type="button"
                className={`turnos__compartilhar ${nRascunhos > 0 ? 'is-pendente' : ''}`.trim()}
                onClick={compartilhar}
                disabled={ocupado || nRascunhos === 0}
                title={
                  nRascunhos === 0
                    ? 'Tudo já está compartilhado com a equipe'
                    : rascunhosEscolhidos.length > 0
                      ? `Compartilhar ${plural(rascunhosEscolhidos.length, 'turno escolhido', 'turnos escolhidos')}`
                      : `${plural(nRascunhos, 'turno ainda não compartilhado', 'turnos ainda não compartilhados')}`
                }
              >
                <IconeCompartilhar />
                Compartilhar com a equipe
                {nRascunhos > 0 && <span aria-label={`${nRascunhos} pendentes`}>✱ {nRascunhos}</span>}
              </button>
              {(dados?.cronogramas?.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="turnos__ferramenta is-borda"
                  onClick={() =>
                    novoTurno(
                      celula
                        ? { cronogramaId: celula.cronogramaId, usuarioId: celula.usuarioId, dia: celula.dia }
                        : { cronogramaId: dados.cronogramas[0].id, usuarioId: null, dia: hoje >= de && hoje <= ate ? hoje : de },
                    )
                  }
                >
                  + Turno
                </button>
              )}
            </div>
          )}
        </header>

        {/* 2a barra: o periodo e as ferramentas da grade */}
        <div className="turnos__barra">
          <button type="button" className="turnos__hoje" onClick={() => setInicio(domingoDe(hoje))}>
            Hoje
          </button>
          <button
            type="button"
            className="turnos__passo"
            onClick={() => setInicio(somarDias(inicio, -nDias))}
            aria-label="Período anterior"
            title="Período anterior"
          >
            <IconeSeta esquerda />
          </button>
          <button
            type="button"
            className="turnos__passo"
            onClick={() => setInicio(somarDias(inicio, nDias))}
            aria-label="Próximo período"
            title="Próximo período"
          >
            <IconeSeta />
          </button>
          <span className="turnos__periodo">{rotuloDoPeriodo(de, ate)}</span>
          {(carregando || ocupado) && dados && <span className="turnos__lendo">Atualizando...</span>}

          <span className="turnos__espaco" />

          <div className="turnos__menu" ref={refConflitos}>
            <button
              type="button"
              className={`turnos__ferramenta ${nConflitos > 0 ? 'is-alerta' : ''}`.trim()}
              onClick={() => setMenu(menu === 'conflitos' ? null : 'conflitos')}
              aria-expanded={menu === 'conflitos'}
              disabled={nConflitos === 0}
            >
              <IconeAlerta />
              {nConflitos === 0 ? 'Sem conflitos' : plural(nConflitos, 'Conflito', 'Conflitos')}
            </button>
            {menu === 'conflitos' && (
              <div className="turnos__painel turnos__painel--largo" role="dialog" aria-label="Conflitos">
                <p className="turnos__paineltitulo">Conflitos de horário</p>
                <ul className="turnos__conflitos">
                  {contas.conflitos.lista.map((c) => (
                    <li key={c.chave}>
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(null)
                          if (edita) {
                            setCelula(null)
                            setSelecao(new Set([c.a.id, c.b.id]))
                          } else setEditando({ turno: c.a })
                        }}
                      >
                        <strong>
                          {nomeDe(c.usuarioId)} · {curta(c.dia)}
                        </strong>
                        <span>
                          {c.a.titulo}
                          {c.a.horaInicio ? ` (${c.a.horaInicio}${c.a.horaFim ? `–${c.a.horaFim}` : ''})` : ' (dia inteiro)'} ×{' '}
                          {c.b.titulo}
                          {c.b.horaInicio ? ` (${c.b.horaInicio}${c.b.horaFim ? `–${c.b.horaFim}` : ''})` : ' (dia inteiro)'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="turnos__visao">
            <Seletor
              valor={visao}
              aoMudar={mudarVisao}
              opcoes={VISOES.map((v) => ({ valor: v.valor, rotulo: v.rotulo }))}
              aria-label="Visão"
            />
          </div>
          <button type="button" className="turnos__ferramenta turnos__imprimir" onClick={() => window.print()}>
            <IconeImprimir />
            Imprimir
          </button>
          <button
            type="button"
            className={`turnos__ferramenta ${filtrando || filtro ? 'is-ligada' : ''}`.trim()}
            onClick={() => {
              if (filtrando) setFiltro('')
              setFiltrando(!filtrando)
            }}
            aria-expanded={filtrando}
          >
            <IconeFiltrar />
            Filtrar
          </button>
          <div className="turnos__menu" ref={refExibir}>
            <button
              type="button"
              className="turnos__ferramenta"
              onClick={() => setMenu(menu === 'exibir' ? null : 'exibir')}
              aria-expanded={menu === 'exibir'}
            >
              <IconeExibir />
              Exibir
            </button>
            {menu === 'exibir' && (
              <div className="turnos__painel" role="dialog" aria-label="Exibir">
                <p className="turnos__paineltitulo">Mostrar na grade</p>
                {PARTES.map((p) => (
                  <label key={p.id} className="turnos__parte">
                    <input type="checkbox" checked={exibir[p.id]} onChange={() => alternarParte(p.id)} />
                    <span>{p.rotulo}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {edita && (
            <button type="button" className="turnos__ferramenta" onClick={() => setCronograma('novo')}>
              <IconeGrupo />
              Adicionar cronograma
            </button>
          )}
        </div>

        {filtrando && (
          <div className="turnos__filtro">
            <IconeFiltrar />
            <input
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por pessoa ou título do turno"
              aria-label="Filtrar por pessoa ou título do turno"
              autoFocus
            />
          </div>
        )}

        {erro && (
          <p className="formdesp__erro" role="alert">
            {erro}
          </p>
        )}
        {aviso && (
          <p className="turnos__aviso" role="status">
            {aviso}
          </p>
        )}

        {!contas ? (
          !erro && <p className="turnos__vazio">Carregando os turnos...</p>
        ) : (
          <div className="turnos__quadro" style={{ '--dias': nDias }}>
            <div className="turnos__grade">
              {/* os dias: o numero, o dia da semana, quantas pessoas e quantas horas */}
              <div className="turnos__linha turnos__linha--dias">
                <div className="turnos__canto turnos__total">
                  {visaoAtual?.rotulo}: <strong>{emHoras(contas.total)}</strong>
                </div>
                <div className="turnos__faixa">
                  {dias.map((d) => {
                    const dia = contas.porDia[d]
                    return (
                      <div key={d} className={`turnos__dia ${d === hoje ? 'is-hoje' : ''}`.trim()}>
                        <span className="turnos__numero">{Number(d.slice(8, 10))}</span>
                        <span className="turnos__pessoas" title={`${dia.pessoas.size} pessoas`}>
                          <IconePessoas />
                          {dia.pessoas.size}
                        </span>
                        <span className="turnos__semana">{SEMANA[diaDaSemana(d)]}</span>
                        <span className="turnos__horas">{emHoras(dia.minutos)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* as anotacoes do dia */}
              {exibir.notas && (
                <div className="turnos__linha turnos__linha--notas">
                  <div className="turnos__canto turnos__rotulo">Anotações do dia</div>
                  <div className="turnos__faixa">
                    {dias.map((d) => {
                      const texto = dados.anotacoes?.[d] ?? ''
                      return edita ? (
                        <button
                          key={d}
                          type="button"
                          className={`turnos__nota ${d === hoje ? 'is-hoje' : ''}`.trim()}
                          onClick={() => setAnotando(d)}
                          title={texto || 'Escrever a anotação do dia'}
                        >
                          {texto}
                        </button>
                      ) : (
                        <div key={d} className={`turnos__nota ${d === hoje ? 'is-hoje' : ''}`.trim()} title={texto || undefined}>
                          {texto}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* as tarefas das obras, direto das obras: os dias da execucao
                  (com o carro reservado) e os checks com prazo ainda abertos */}
              {exibir.obras && !procura && (
                <div className={`turnos__grupo ${fechados.has('obras') ? '' : 'is-aberto'}`.trim()}>
                  <div className="turnos__grupotopo">
                    <button
                      type="button"
                      className="turnos__abrir"
                      onClick={() => alternar('obras')}
                      aria-expanded={!fechados.has('obras')}
                    >
                      <span className="turnos__caret" aria-hidden="true">
                        ▸
                      </span>
                      <strong>Obras</strong>
                      <span className="turnos__info">{contas.emExecucao} em execução</span>
                      <span className="turnos__info">{plural(contas.prazos.length, 'prazo', 'prazos')}</span>
                    </button>
                  </div>
                  {!fechados.has('obras') && (
                    <>
                      <Linha
                        {...daGrade}
                        quem={
                          <span className="turnos__quem">
                            <span className="turnos__aberto" aria-hidden="true">
                              <Icone tamanho={17} d="M4 20V9l8-5 8 5v11M4 20h16M10 20v-5h4v5" />
                            </span>
                            <span className="turnos__nome">
                              <strong>Execução</strong>
                              <em>{plural(contas.emExecucao, 'obra', 'obras')}</em>
                            </span>
                          </span>
                        }
                        linha="obras|execucao"
                        turnos={contas.execucao}
                      />
                      <Linha
                        {...daGrade}
                        quem={
                          <span className="turnos__quem">
                            <span className="turnos__aberto" aria-hidden="true">
                              <Icone tamanho={17}>
                                <circle cx="12" cy="13" r="7.5" />
                                <path d="M12 9.5V13l2.5 1.5M9.5 3h5" />
                              </Icone>
                            </span>
                            <span className="turnos__nome">
                              <strong>Prazos de tarefas</strong>
                              <em>{plural(contas.prazos.length, 'aberto', 'abertos')}</em>
                            </span>
                          </span>
                        }
                        linha="obras|prazo"
                        turnos={contas.prazos}
                      />
                    </>
                  )}
                </div>
              )}

              {contas.grupos.length === 0 && (
                <p className="turnos__vazio">Nenhum cronograma ainda.{edita ? ' Crie o primeiro no "Adicionar cronograma".' : ''}</p>
              )}

              {/* os cronogramas */}
              {contas.grupos.map((g) => {
                const aberto = !fechados.has(g.id)
                const pessoas = g.pessoas.filter((p) => passa(p.id, p.turnos))
                const mostraAbertos = exibir.abertos && passa(null, g.abertos)
                return (
                  <div key={g.id} className={`turnos__grupo ${aberto ? 'is-aberto' : ''}`.trim()}>
                    <div className="turnos__grupotopo">
                      <button type="button" className="turnos__abrir" onClick={() => alternar(g.id)} aria-expanded={aberto}>
                        <span className="turnos__caret" aria-hidden="true">
                          ▸
                        </span>
                        <strong>{g.nome}</strong>
                        <span className="turnos__info">{emHoras(g.minutos)}</span>
                        <span className="turnos__info">
                          <IconePessoas />
                          {g.pessoas.length}
                        </span>
                      </button>
                      {edita && (
                        <>
                          <button type="button" className="turnos__editar" onClick={() => setCronograma(g)} title="Adicionar membros">
                            <IconeMembro />
                            <span className="turnos__texto">Adicionar membros</span>
                          </button>
                          <button
                            type="button"
                            className="turnos__editar turnos__editar--icone"
                            onClick={() => setCronograma(g)}
                            aria-label={`Editar ${g.nome}`}
                            title="Editar o cronograma"
                          >
                            <IconeMais />
                          </button>
                        </>
                      )}
                    </div>

                    {aberto && (
                      <>
                        {mostraAbertos && (
                          <Linha
                            {...daGrade}
                            quem={
                              <span className="turnos__quem">
                                <span className="turnos__aberto" aria-hidden="true">
                                  <Icone tamanho={17} d="M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2M12 8v4l2 2" />
                                </span>
                                <span className="turnos__nome">
                                  <strong>Turnos abertos</strong>
                                  <em>{plural(g.abertos.length, 'turno', 'turnos')}</em>
                                </span>
                              </span>
                            }
                            linha={`${g.id}|`}
                            turnos={g.abertos}
                            aoCelula={edita ? (dia) => clicarCelula(g.id, null, dia) : undefined}
                          />
                        )}
                        {pessoas.map((p) => {
                          const pessoa = pessoaPorId(p.id)
                          return (
                            <Linha
                              key={p.id}
                              {...daGrade}
                              quem={
                                <span className="turnos__quem">
                                  <Avatar nome={pessoa?.nome} foto={pessoa?.foto} tamanho={34} titulo={pessoa?.nome} />
                                  <span className="turnos__nome">
                                    <strong title={pessoa?.nome}>{pessoa?.nome ?? 'Pessoa'}</strong>
                                    <em>{emHoras(p.minutos)}</em>
                                  </span>
                                </span>
                              }
                              linha={`${g.id}|${p.id}`}
                              turnos={p.turnos}
                              aoCelula={edita ? (dia) => clicarCelula(g.id, p.id, dia) : undefined}
                            />
                          )
                        })}
                        {g.pessoas.length === 0 && (
                          <p className="turnos__semgente">
                            Ninguém neste cronograma.{edita ? ' Adicione as pessoas no "Adicionar membros".' : ''}
                          </p>
                        )}
                        {g.pessoas.length > 0 && pessoas.length === 0 && (
                          <p className="turnos__semgente">Ninguém deste cronograma passa no filtro.</p>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* a barra da escolha: flutua embaixo enquanto ha turnos ou um dia escolhido */}
        {edita && (escolhidos.length > 0 || celula || copiados.length > 0) && (
          <div className="turnos__escolha" role="toolbar" aria-label="Ações da escolha">
            {escolhidos.length > 0 ? (
              <>
                <span className="turnos__escolhatexto">
                  {plural(escolhidos.length, 'card escolhido', 'cards escolhidos')}
                  {rascunhosEscolhidos.length > 0 && <em> · {rascunhosEscolhidos.length} sem compartilhar</em>}
                </span>
                {escolhidos.length === 1 && (
                  <button type="button" className="turnos__botao" onClick={() => setEditando({ turno: escolhidos[0] })} title="Abrir para editar">
                    <IconeAbrir />
                    <span className="turnos__texto">Abrir</span>
                  </button>
                )}
                <button type="button" className="turnos__botao" onClick={copiar} title="Copiar (Ctrl+C)">
                  <IconeCopiar />
                  <span className="turnos__texto">Copiar</span>
                </button>
                {copiados.length > 0 && destino && (
                  <button type="button" className="turnos__botao" onClick={colar} disabled={ocupado} title="Colar no dia deste card (Ctrl+V)">
                    <IconeColar />
                    <span className="turnos__texto">Colar</span>
                  </button>
                )}
                {rascunhosEscolhidos.length > 0 && (
                  <button type="button" className="turnos__botao turnos__botao--forte" onClick={compartilhar} disabled={ocupado}>
                    <IconeCompartilhar />
                    Compartilhar<span className="turnos__texto"> com a equipe</span>
                  </button>
                )}
                {manuaisEscolhidos.length > 0 && (
                  <button
                    type="button"
                    className="turnos__botao turnos__botao--perigo"
                    onClick={() => setConfirmando('excluir')}
                    disabled={ocupado}
                    title="Excluir (Delete)"
                  >
                    <IconeLixo />
                    <span className="turnos__texto">Excluir</span>
                  </button>
                )}
              </>
            ) : celula ? (
              <>
                <span className="turnos__escolhatexto">
                  {curta(celula.dia)} · {nomeDe(celula.usuarioId)}
                </span>
                <button
                  type="button"
                  className="turnos__botao"
                  onClick={() => novoTurno({ cronogramaId: celula.cronogramaId, usuarioId: celula.usuarioId, dia: celula.dia })}
                >
                  + Turno
                </button>
                {copiados.length > 0 && (
                  <button type="button" className="turnos__botao turnos__botao--forte" onClick={colar} disabled={ocupado}>
                    <IconeColar />
                    Colar {copiados.length > 1 ? `${copiados.length} cards` : `"${copiados[0].titulo}"`}
                  </button>
                )}
              </>
            ) : (
              <span className="turnos__escolhatexto">
                {plural(copiados.length, 'card copiado', 'cards copiados')} — escolha o dia e aperte Ctrl+V
              </span>
            )}
            <button
              type="button"
              className="turnos__botao turnos__botao--icone"
              onClick={() => {
                if (escolhidos.length === 0 && !celula) setCopiados([])
                limparEscolha()
              }}
              aria-label={escolhidos.length === 0 && !celula ? 'Esquecer os copiados' : 'Desfazer a escolha'}
              title={escolhidos.length === 0 && !celula ? 'Esquecer os copiados' : 'Desfazer a escolha (Esc)'}
            >
              <IconeFechar />
            </button>
          </div>
        )}
      </section>

      <ModalTurno
        aberto={Boolean(editando)}
        turno={editando?.turno ?? null}
        base={editando?.base ?? null}
        cronogramas={dados?.cronogramas ?? []}
        edita={edita}
        aoFechar={() => setEditando(null)}
        aoSalvo={recarregar}
      />

      <ModalAnotacao
        aberto={Boolean(anotando)}
        dia={anotando}
        texto={anotando ? (dados?.anotacoes?.[anotando] ?? '') : ''}
        aoFechar={() => setAnotando(null)}
        aoSalvo={recarregar}
      />

      <ModalCronograma
        aberto={Boolean(cronograma)}
        cronograma={cronograma === 'novo' ? null : cronograma}
        aoFechar={() => setCronograma(null)}
        aoSalvo={recarregar}
      />

      <Confirma
        aberto={confirmando === 'excluir'}
        titulo={manuaisEscolhidos.length === 1 ? 'Excluir este turno?' : `Excluir ${manuaisEscolhidos.length} turnos?`}
        detalhes={
          <ul className="turnos__lista">
            {manuaisEscolhidos.slice(0, 5).map((t) => (
              <li key={t.id}>
                {t.titulo} · {nomeDe(t.usuarioId)} · {curta(t.dataInicio)}
              </li>
            ))}
            {manuaisEscolhidos.length > 5 && <li>e mais {manuaisEscolhidos.length - 5}</li>}
          </ul>
        }
        rotuloConfirmar="Excluir"
        aoConfirmar={excluir}
        aoFechar={() => setConfirmando(null)}
      />

      <Confirma
        aberto={confirmando === 'compartilhar'}
        tom="acao"
        titulo="Compartilhar com a equipe?"
        mensagem={`${plural(nRascunhos, 'turno ainda não compartilhado', 'turnos ainda não compartilhados')} de ${rotuloDoPeriodo(de, ate)} passa${nRascunhos === 1 ? '' : 'm'} a aparecer para toda a equipe.`}
        rotuloConfirmar="Compartilhar"
        aoConfirmar={compartilharTodos}
        aoFechar={() => setConfirmando(null)}
      />

      <Confirma
        aberto={confirmando === 'agenda'}
        tom="acao"
        titulo="Copiar a agenda?"
        mensagem={`Os turnos de ${rotuloDoPeriodo(somarDias(de, -nDias), somarDias(ate, -nDias))} vêm para ${rotuloDoPeriodo(de, ate)}, nos mesmos dias da semana. Eles chegam sem compartilhar: confira e clique em "Compartilhar com a equipe".`}
        rotuloConfirmar="Copiar agenda"
        aoConfirmar={copiarAgenda}
        aoFechar={() => setConfirmando(null)}
      />
    </AppShell>
  )
}
