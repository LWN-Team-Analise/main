import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import IconeClima from '@/components/Clima/IconeClima'
import Globo from '@/components/Globo/Globo'
import Seletor from '@/components/Seletor/Seletor'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import { useTheme } from '@/context/ThemeContext'
import { rotuloPrioridadeObra, tomPrioridadeObra } from '@/domain/obras'
import { coordenadaDaUF } from '@/domain/geo'
import { ehBrasil } from '@/domain/paises'
import useClima, { familiaDoTempo, nomeDoTempo } from '@/hooks/useClima'
import { dataBR, dataHora, hojeISO } from '@/utils/formato'
import useTarefas from './useTarefas'
import useModoTv from './useModoTv'
import Painel from './Painel'
import Historico from './Historico'
import ModalPowerBI from './ModalPowerBI'
import './Home.css'

const Icone = {
  grade: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </svg>
  ),
  quadro: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M9.5 4v16M15 4v16" />
    </svg>
  ),
  exportar: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
    </svg>
  ),
  painel: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  ok: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  ),
  relogio: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  ),
  cadeado: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </svg>
  ),
}

/**
 * O tempo agora, em Santana (SP), com a temperatura por cima.
 *
 * Aqui havia um sol desenhado, fixo — e num dia de chuva ele mentia.
 * Agora o icone e o tempo de verdade (ver `useClima`), e a pastilha
 * com a temperatura SOBREPOE o canto superior direito dele: o desenho
 * responde "como esta la fora" de relance, e o numero e o detalhe de
 * quem parou para olhar.
 *
 * Enquanto a resposta nao chega — ou quando o servico esta fora — sai
 * so o desenho neutro, sem pastilha. O dia da pessoa nao pode depender
 * de um servico de previsao do tempo.
 */
function Clima() {
  const clima = useClima()

  const familia = clima ? familiaDoTempo(clima.codigo, clima.dia) : 'sol-nuvem'
  const nome = clima
    ? `${nomeDoTempo(clima.codigo)} em Santana, São Paulo — ${clima.temperatura}°C`
    : 'Carregando o tempo em Santana, São Paulo'

  return (
    <div className="clima">
      <IconeClima familia={familia} titulo={nome} tamanho={54} />

      {clima && (
        <p className="clima__selo">
          <span className="clima__agora">{clima.temperatura}°</span>
          <span className="clima__faixa">
            <span className="clima__max" title="Máxima de hoje">
              ↑{clima.maxima}°
            </span>
            <span className="clima__min" title="Mínima de hoje">
              ↓{clima.minima}°
            </span>
          </span>
        </p>
      )}
    </div>
  )
}

/* onde o filtro "Gráficos" do Painel fica guardado */
const CHAVE_GRAFICOS = 'atmosfera.painel.graficos'

const DIAS = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.']
const MESES = ['JAN.', 'FEV.', 'MAR.', 'ABR.', 'MAI.', 'JUN.', 'JUL.', 'AGO.', 'SET.', 'OUT.', 'NOV.', 'DEZ.']

/**
 * O mes que a tela esta olhando.
 *
 * `{ ano, mes }` — `mes` de 0 a 11, como no Date. As setas andam um
 * mes para tras ou para a frente; a virada de ano sai de graca porque
 * `new Date(ano, mes - 1)` normaliza sozinho.
 *
 * O que ele filtra: SO o que tem data. A coluna de concluidas do
 * Quadro e os graficos do Dashboard passam por ele. A Grade e as duas
 * primeiras colunas do Quadro nao — "o que falta fazer" e sempre
 * hoje, e filtrar pendencia por mes esconderia trabalho atrasado
 * justamente de quem foi procurar o mes passado.
 */
function mesDe(ano, mes) {
  const d = new Date(ano, mes, 1)
  const agora = new Date()
  return {
    ano: d.getFullYear(),
    mes: d.getMonth(),
    /* 'AAAA-MM' — comparar por texto evita Date e fuso na filtragem */
    chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    rotulo: `${MESES[d.getMonth()].replace('.', '')} ${d.getFullYear()}`,
    atual: d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth(),
    /* nao ha o que ver no futuro: nada foi concluido ainda */
    podeAvancar: d < new Date(agora.getFullYear(), agora.getMonth(), 1),
  }
}

/** 'AAAA-MM' de um carimbo, para casar com `mes.chave`. */
function mesDoCarimbo(valor) {
  if (!valor) return null
  const t = String(valor)
  if (/^\d{4}-\d{2}/.test(t)) return t.slice(0, 7)
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** As setas de mes: < SET 2026 > */
/**
 * No celular ele aparece SO no Dashboard.
 *
 * O mes filtra duas coisas: a coluna de concluidas do Quadro e os
 * graficos do Dashboard. Na Grade ele nao filtra nada — a grade e o que
 * ha para fazer HOJE —, e numa barra de celular, onde cada controle
 * disputa a largura com os outros, um seletor que nao muda nada e o
 * primeiro que tem de sair. No computador ele fica onde sempre esteve.
 */
function SeletorMes({ mes, aoMudar, foraDoPainel }) {
  return (
    <div
      className="mes"
      data-fora-do-painel={foraDoPainel ? 'sim' : undefined}
      role="group"
      aria-label="Mês em exibição"
    >
      <button
        type="button"
        onClick={() => aoMudar(mesDe(mes.ano, mes.mes - 1))}
        aria-label="Mês anterior"
        title="Mês anterior"
      >
        ‹
      </button>

      <span className="mes__rotulo" data-atual={mes.atual ? 'sim' : undefined}>
        {mes.rotulo}
      </span>

      <button
        type="button"
        onClick={() => aoMudar(mesDe(mes.ano, mes.mes + 1))}
        disabled={!mes.podeAvancar}
        aria-label="Mês seguinte"
        title={mes.podeAvancar ? 'Mês seguinte' : 'Este já é o mês atual'}
      >
        ›
      </button>
    </div>
  )
}

/* A ordem e a leitura do quadro: primeiro o que esta acontecendo, depois
   o que ainda espera a vez, por fim o que ja saiu.

   "Em andamento" e a etapa ATUAL da obra — o que da para tocar hoje.
   "Não iniciado" e a PROXIMA etapa de cada setor, travada esperando
   outros setores fecharem as deles; o card diz quais (ver useTarefas).
   E por isso que a coluna vem depois, e nao antes: ela nao pede acao de
   ninguem, so explica quem esta segurando a fila. */
const COLUNAS = [
  { id: 'andamento', rotulo: 'Em andamento', Glifo: Icone.relogio },
  { id: 'espera', rotulo: 'Não iniciado', Glifo: Icone.cadeado },
  { id: 'concluida', rotulo: 'Concluída', Glifo: Icone.ok },
]

/**
 * Pagina inicial — o "meu dia" do sistema.
 *
 * Tres modos de olhar a MESMA lista de tarefas, e a tarefa aqui e o
 * CHECK de uma obra (ver `useTarefas`):
 *
 *   Grade      — a tabela do que precisa ser feito, em ordem de urgencia;
 *   Quadro     — as mesmas tarefas em tres colunas, por estado;
 *   Dashboard  — os numeros que a lista sozinha nao mostra: quanto tempo
 *                uma obra leva, quanto tempo cada setor leva, o quanto
 *                as entregas chegam antes ou depois do prazo, e quanto
 *                se gastou em despesas. So para quem tem `ver_dashboard`:
 *                sem ela a aba nem aparece. E dele que sai a exportacao
 *                para o Power BI.
 *
 * Nao ha "adicionar tarefa" em lugar nenhum, e isso e proposital: tarefa
 * solta nao teria obra onde ser marcada nem quem a cobrasse. Quem cria
 * tarefa e quem monta o roteiro da obra.
 */
export default function Home() {
  const { nomeDoCargo, corDoCargo, pessoaPorId, etapaDaObra, pendentesDaObra, pode, recarregar } = useDados()
  const { user } = useAuth()
  const navigate = useNavigate()
  const tarefas = useTarefas()
  const veDashboard = pode('ver_dashboard')
  /* a televisao da empresa (setor "Painel TV"): troca de Grade para Quadro
     sozinha e descendo a lista (useModoTv), fala com a EQUIPE e mostra as
     tarefas de todos os setores */
  const tv = Boolean(user?.painelTv)
  const veHistorico = pode('ver_historico') && !tv

  const [abaEscolhida, setAba] = useState('grade')
  const [powerBI, setPowerBI] = useState(false)
  const [recado, setRecado] = useState('')
  /* o passo do Dashboard mora aqui porque o seletor dele vive na barra
     de abas, ao lado de Grade/Quadro/Dashboard */
  const [passo, setPasso] = useState('mes')
  /* o filtro "Gráficos" do Painel: todos, ou um grupo so. Fica
     lembrado neste navegador. */
  const [graficos, setGraficosEstado] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_GRAFICOS) || 'todos'
    } catch {
      return 'todos'
    }
  })
  const setGraficos = (valor) => {
    setGraficosEstado(valor)
    try {
      localStorage.setItem(CHAVE_GRAFICOS, valor)
    } catch {
      /* sem storage, vale so ate recarregar */
    }
  }
  const [mes, setMes] = useState(() => {
    const agora = new Date()
    return mesDe(agora.getFullYear(), agora.getMonth())
  })
  /* "minhas" = so o que e do meu setor. Quem nao tem setor, ou quem nao
     tem tarefa nenhuma no dele, ve tudo — senao a tela abre vazia e
     parece quebrada. */
  const [escopo, setEscopo] = useState('minhas')

  const temMinhas = useMemo(() => tarefas.some((t) => t.minha), [tarefas])
  const soMinhas = escopo === 'minhas' && temMinhas && !tv

  /* na TV: Grade e Quadro se revezando, e os dados lidos de novo a cada
     troca — a tela fica ligada o dia inteiro */
  const proximaTela = useCallback(() => {
    setAba((atual) => (atual === 'quadro' ? 'grade' : 'quadro'))
    recarregar()
  }, [recarregar])

  /* quem perde a permissao com a aba aberta volta para a Grade, em vez
     de ficar olhando um painel que nao e mais dele (a TV nem tem o painel) */
  const aba = abaEscolhida === 'painel' && (!veDashboard || tv) ? 'grade' : abaEscolhida
  const { saindo: tvSaindo } = useModoTv({ ligado: tv, aba, aoTrocar: proximaTela })

  const visiveis = useMemo(
    () => (soMinhas ? tarefas.filter((t) => t.minha) : tarefas),
    [tarefas, soMinhas],
  )

  const hoje = hojeISO()

  /**
   * A ordem da lista: o que aperta primeiro.
   *
   * Prazo vencido na frente de tudo, depois prioridade, depois o prazo
   * mais proximo. Ordenar por nome ou por obra deixaria a emergencia
   * atrasada no meio da lista, que e exatamente onde ela nao pode estar.
   *
   * O prazo e o do proprio CHECK (definido dentro da obra): a obra nao
   * tem mais prazo final escolhido no cadastro.
   */
  const porUrgencia = useMemo(() => {
    const peso = { emergencia: 4, alta: 3, media: 2, baixa: 1 }
    const nota = (t) => (t.obra.tipo === 'emergencia' ? 4 : peso[t.obra.prioridade] ?? 0)

    return [...visiveis].sort((a, b) => {
      const venceA = a.prazo && a.prazo < hoje ? 1 : 0
      const venceB = b.prazo && b.prazo < hoje ? 1 : 0
      if (venceA !== venceB) return venceB - venceA
      if (nota(a) !== nota(b)) return nota(b) - nota(a)
      const prazoA = a.prazo ?? '9999-12-31'
      const prazoB = b.prazo ?? '9999-12-31'
      return prazoA.localeCompare(prazoB)
    })
  }, [visiveis, hoje])

  /**
   * O que falta AGORA: so a etapa que ja abriu e ainda nao fechou.
   *
   * O que esta preso na etapa seguinte fica de fora da Grade. Nao ha
   * o que fazer com ele hoje, e uma lista de afazeres que mistura o
   * que da para fazer com o que nao da deixa de ser lista de
   * afazeres — vira inventario do roteiro.
   *
   * Em "Todas" entram os checks dos OUTROS setores tambem, e eles vem
   * depois dos seus: primeiro o que voce pode marcar, depois o que
   * voce so acompanha. Misturados pela urgencia, o seu unico check do
   * dia acabava no meio de trinta que nao sao seus.
   */
  const faltando = useMemo(() => {
    const abertas = porUrgencia.filter((t) => t.status === 'andamento')
    return [...abertas].sort((a, b) => Number(b.posso) - Number(a.posso))
  }, [porUrgencia])

  const vencidas = faltando.filter(
    (t) => t.prazo && t.prazo < hoje,
  ).length

  /**
   * O que o Quadro enxerga, ja com o mes aplicado.
   *
   * O filtro pega SO as concluidas: o que esta pendente nao tem mes —
   * ele esta pendente hoje, e some-lo do quadro porque alguem foi
   * olhar agosto esconderia justamente o trabalho atrasado.
   */
  const doMes = useMemo(
    () =>
      porUrgencia.filter(
        (t) => t.status !== 'concluida' || mesDoCarimbo(t.feitoEm) === mes.chave,
      ),
    [porUrgencia, mes.chave],
  )

  const agora = new Date()

  const telaGrade = aba === 'grade' && (
    <Grade
      tarefas={tv ? faltando.map((t) => ({ ...t, posso: true })) : faltando}
      paraVoce={!soMinhas && temMinhas}
      hoje={hoje}
      nomeDoCargo={nomeDoCargo}
      corDoCargo={corDoCargo}
      aoAbrir={tv ? () => {} : (alvo) => navigate(`/app/obras/${alvo.obra.id}`)}
    />
  )

  const telaQuadro = aba === 'quadro' && (
    <Quadro
      tarefas={tv ? doMes.map((t) => ({ ...t, posso: true })) : doMes}
      paraVoce={!soMinhas && temMinhas}
      hoje={hoje}
      mes={mes}
      nomeDoCargo={nomeDoCargo}
      corDoCargo={corDoCargo}
      pessoaPorId={pessoaPorId}
      aoAbrir={tv ? () => {} : (t) => navigate(`/app/obras/${t.obra.id}`)}
    />
  )

  return (
    <AppShell semChat={tv}>
      <section className={`inicio ${tv ? 'inicio--tv' : ''}`.trim()}>
        {/* ---------------- a faixa do dia ---------------- */}
        <header className="dia vidro">
          <p className="dia__data">
            <span className="dia__semana">{DIAS[agora.getDay()]}</span>
            <strong className="dia__numero">{String(agora.getDate()).padStart(2, '0')}</strong>
            <span className="dia__mes">{MESES[agora.getMonth()]}</span>
          </p>

          <Clima />

          {/* So o recado do dia: a saudacao com o nome ja esta na barra
              de cima, e repeti-la aqui empurrava o que importa — quanto
              falta fazer — para a segunda linha. */}
          <div className="dia__texto">
            {/* deixa claro que a lista e a do usuario: as tarefas do setor dele */}
            {(soMinhas || tv) && faltando.length > 0 && (
              <span className="paravoce paravoce--topo">{tv ? 'Para equipe' : 'Para você'}</span>
            )}
            <h1 className="dia__frase">
              {faltando.length === 0
                ? 'Nenhuma tarefa pendente hoje'
                : tv
                  ? `Possuímos ${faltando.length} tarefa${faltando.length > 1 ? 's' : ''} para fazer agora.`
                  : soMinhas
                  ? `Você tem ${faltando.length} tarefa${faltando.length > 1 ? 's' : ''} para fazer agora.`
                  : /* em "Todas" a lista e da empresa: "voce tem" diria que e tudo seu */
                    `${faltando.length} tarefa${faltando.length > 1 ? 's' : ''} pendente${
                      faltando.length > 1 ? 's' : ''
                    } em todos os setores.`}
            </h1>
          </div>

          <p className="dia__resumo" data-alerta={vencidas > 0 ? 'sim' : undefined}>
            {faltando.length === 0
              ? 'Nenhuma tarefa pendente'
              : `${faltando.length} tarefa${faltando.length > 1 ? 's' : ''} pendente${
                  faltando.length > 1 ? 's' : ''
                }`}
            {vencidas > 0 && (
              <em>
                {vencidas} com prazo vencido
              </em>
            )}
          </p>
        </header>

        {/* ---------------- abas + escopo ---------------- */}
        <div className="inicio__barra">
          <nav className="abas" role="tablist" aria-label="Modo de visualização">
            {[
              { id: 'grade', rotulo: 'Grade', Glifo: Icone.grade },
              { id: 'quadro', rotulo: 'Quadro', Glifo: Icone.quadro },
              ...(veDashboard ? [{ id: 'painel', rotulo: 'Painel', Glifo: Icone.painel }] : []),
            ].map(({ id, rotulo, Glifo }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={aba === id}
                className={`abas__aba ${aba === id ? 'is-atual' : ''}`.trim()}
                onClick={() => setAba(id)}
              >
                <Glifo />
                {rotulo}
              </button>
            ))}
          </nav>

          {/* O mês fica no meio, entre as abas e o Minhas/Todas. Ele
              filtra só o que TEM data: a coluna de concluídas do Quadro
              e os gráficos do Dashboard. */}
          <SeletorMes mes={mes} aoMudar={setMes} foraDoPainel={aba !== 'painel'} />

          {/* o passo do Dashboard entra na MESMA linha das abas: ele é
              um modo de olhar, como elas, e não um controle de dentro
              de um cartão */}
          {aba === 'painel' && (
            <div className="escopo" role="group" aria-label="Passo do tempo">
              <button
                type="button"
                className={passo === 'mes' ? 'is-atual' : ''}
                onClick={() => setPasso('mes')}
                title="O mês escolhido, dia a dia"
              >
                Diário
              </button>
              <button
                type="button"
                className={passo === 'ano' ? 'is-atual' : ''}
                onClick={() => setPasso('ano')}
                title="De janeiro até o mês escolhido, mês a mês"
              >
                Mensal
              </button>
            </div>
          )}

          {/* quais graficos o Painel mostra: todos, ou so os de um grupo */}
          {aba === 'painel' && (
            <div className="inicio__graficos">
              <Seletor
                valor={pode('ver_comercial') || graficos !== 'comercial' ? graficos : 'todos'}
                aoMudar={setGraficos}
                aria-label="Quais gráficos mostrar"
                opcoes={[
                  { valor: 'todos', rotulo: 'Todos os gráficos' },
                  { valor: 'obras', rotulo: 'Obras' },
                  { valor: 'despesas', rotulo: 'Despesas' },
                  { valor: 'frotas', rotulo: 'Frotas' },
                  ...(pode('ver_comercial') ? [{ valor: 'comercial', rotulo: 'Comercial' }] : []),
                ]}
              />
            </div>
          )}

          {/* os dados do Dashboard, para o Power BI: tudo, só obras ou
              só despesas (ModalPowerBI) */}
          {aba === 'painel' && (
            <button
              type="button"
              className="acao acao--fraca inicio__exportar"
              onClick={() => setPowerBI(true)}
              title="Baixar os dados do Painel numa planilha que o Power BI abre"
            >
              <Icone.exportar />
              Exportar para o Power BI
            </button>
          )}

          {/* o Dashboard olha a empresa inteira: filtrar por setor ali
              daria uma média de uma pessoa só, que não é média nenhuma */}
          {tv && (
            <div className="escopo" role="group" aria-label="De quem são as tarefas">
              <button type="button" disabled>
                Para equipe
              </button>
              <button type="button" className="is-atual" aria-pressed="true">
                Todas
              </button>
            </div>
          )}

          {aba !== 'painel' && temMinhas && !tv && (
            <div className="escopo" role="group" aria-label="De quem são as tarefas">
              <button
                type="button"
                className={escopo === 'minhas' ? 'is-atual' : ''}
                onClick={() => setEscopo('minhas')}
              >
                Para você
              </button>
              <button
                type="button"
                className={escopo === 'todas' ? 'is-atual' : ''}
                onClick={() => setEscopo('todas')}
              >
                Todas
              </button>
            </div>
          )}
        </div>

        {/* A Grade e as duas primeiras colunas do Quadro são sempre
            HOJE: pendência não tem mês. Quando o mês escolhido não é o
            corrente, o aviso evita a leitura errada de que a lista
            também voltou no tempo. */}
        {!mes.atual && aba !== 'painel' && (
          <p className="inicio__nota" role="status">
            O que está pendente é sempre de hoje — {mes.rotulo.toLowerCase()} filtra apenas o
            que já foi concluído.
          </p>
        )}

        {tv ? (
          /* na TV a Grade e o Quadro moram num palco com a altura que
             sobra da tela: so ele rola (useModoTv), a faixa do dia e as
             abas ficam paradas. A `key` refaz o palco a cada troca, e e
             isso que dispara o esmaecer de entrada. */
          <div key={aba} className={`tv-palco ${tvSaindo ? 'is-saindo' : ''}`.trim()}>
            {telaGrade}
            {telaQuadro}
          </div>
        ) : (
          <>
            {telaGrade}

            {/* O Historico mora embaixo da Grade — do globo, quando nao ha
                nada pendente; da tabela de tarefas, quando ha. A Grade e o
                "meu dia" daqui para a frente; o Historico, o que ja foi. */}
            {aba === 'grade' && veHistorico && <Historico />}

            {telaQuadro}
          </>
        )}

        {aba === 'painel' && recado && (
          <p className="recado" role="status">
            {recado}
            <button type="button" onClick={() => setRecado('')} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}

        {aba === 'painel' && (
          <Painel
            mes={mes}
            passo={passo}
            secao={pode('ver_comercial') || graficos !== 'comercial' ? graficos : 'todos'}
          />
        )}
      </section>

      {veDashboard && (
        <ModalPowerBI aberto={powerBI} aoFechar={() => setPowerBI(false)} aoExportado={setRecado} />
      )}
    </AppShell>
  )
}

/** O nome curto da obra no card e na linha: proposta ou empresa. */
const daObra = (t) =>
  [t.obra.proposta, t.cliente?.nome].filter(Boolean).join(' — ') || 'Obra sem nome'

/** Etiquetas dos setores donos da tarefa. */
function Setores({ cargos, nomeDoCargo, corDoCargo }) {
  return (
    <span className="tsetores">
      {cargos.map((c) => (
        <span key={c} className="tsetores__um" style={{ '--setor-cor': corDoCargo(c) }}>
          {nomeDoCargo(c)}
        </span>
      ))}
    </span>
  )
}

/**
 * O prazo da obra, com o tom certo.
 *
 * Vencido e vermelho; hoje e amarelo; o resto e texto comum. Obra sem
 * data de conclusao mostra um traco — dizer "sem prazo" em toda linha
 * so encheria a coluna de ruido.
 */
function Prazo({ iso, hoje }) {
  if (!iso) return <span className="tprazo tprazo--vazio">—</span>
  const tom = iso < hoje ? 'vencido' : iso === hoje ? 'hoje' : 'normal'
  return (
    <span className="tprazo" data-tom={tom}>
      {dataBR(iso)}
      {tom === 'vencido' && <em>vencido</em>}
      {tom === 'hoje' && <em>hoje</em>}
    </span>
  )
}

/* ============================================================
   GRADE — o que da para fazer AGORA

   Duas coisas entram, e so essas duas:

   1. os checks da etapa que ja abriu e ainda nao foram marcados —
      o que falta de verdade hoje;
   2. uma linha por obra onde nada falta para voce, dizendo o que
      aconteceu (a sua parte fechou, ou a sua vez ainda nao chegou) e
      QUEM esta segurando a passagem para a proxima etapa.

   Fica de fora o que esta preso em etapa futura: nao ha o que fazer
   com ele hoje. E fica de fora o que ja foi marcado — uma tabela que
   cresce com tudo o que terminou para de responder "o que falta" na
   terceira obra. Esses dois moram no Quadro, que e a aba do estado.
   ============================================================ */

/* `paraVoce`: em "Todas", a tarefa do setor do usuario ganha a etiqueta */
function Grade({ tarefas, hoje, nomeDoCargo, corDoCargo, aoAbrir, paraVoce = false }) {
  if (tarefas.length === 0) {
    return (
      <Vazio titulo="Nada pendente por aqui" arte="globo" />
    )
  }

  return (
    <div className="grade vidro">
      <table className="grade__tabela">
        <thead>
          <tr>
            {/* a OBRA primeiro: e por ela que a lista se le */}
            <th scope="col">Obra</th>
            <th scope="col">Tarefa</th>
            <th scope="col">Etapa</th>
            {/* a coluna do setor vai CENTRADA: as etiquetas tem
                larguras muito diferentes ("GQ" ao lado de "Garantia da
                Qualidade"), e encostadas a esquerda elas formavam uma
                borda irregular no meio da tabela */}
            <th scope="col" className="grade__setor">Setor</th>
            <th scope="col">Prioridade</th>
            <th scope="col">Prazo</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {tarefas.map((t) =>
            /* UMA lista, duas leituras. A linha que voce pode marcar
               abre a obra no clique; a dos outros setores traz a mesma
               informacao — nome do check, obra, etapa, setor, prazo —,
               so que travada, com o cadeado no lugar do botao.

               Antes as travadas eram uma lista a parte, e so entravam
               quando a obra nao tinha nada para voce. Em "Todas" isso
               dava o efeito errado: os checks dos outros setores
               apareciam como se fossem seus de marcar, e a aba ficava
               igual a "Minhas". */
            t.posso ? (
              /* A linha inteira responde ao clique, por conveniencia do
                 mouse. O caminho de TECLADO e o botao do primeiro campo:
                 um <tr> com tabindex e role=link quebra a leitura da
                 tabela para quem usa leitor de tela, e a linha deixaria
                 de ser uma linha. */
              <tr
                key={t.id}
                className="grade__linha"
                onClick={() => aoAbrir(t)}
                title={`Abrir ${daObra(t)}`}
              >
                <td data-rotulo="Obra">
                  <span className="grade__obra" data-tipo={t.obra.tipo}>
                    {daObra(t)}
                  </span>
                </td>
                <td className="grade__tarefa">
                  <button
                    type="button"
                    className="grade__link"
                    onClick={(e) => {
                      e.stopPropagation()
                      aoAbrir(t)
                    }}
                  >
                    {t.titulo}
                  </button>
                  {paraVoce && t.minha && <span className="paravoce">Para você</span>}
                </td>
                <td className="grade__etapa" data-rotulo="Etapa">
                  {t.etapaNome || `${t.etapaNumero}ª`}
                  {t.cardTitulo && <em>{t.cardTitulo}</em>}
                </td>
                <td className="grade__setor" data-rotulo="Setor">
                  <Setores cargos={t.cargos} nomeDoCargo={nomeDoCargo} corDoCargo={corDoCargo} />
                </td>
                <td data-rotulo="Prioridade">
                  <span className="tpri" data-pri={tomPrioridadeObra(t.obra)}>
                    {rotuloPrioridadeObra(t.obra)}
                  </span>
                </td>
                <td data-rotulo="Prazo">
                  <Prazo iso={t.prazo} hoje={hoje} />
                </td>
                <td data-rotulo="Estado">
                  <span className="testado" data-estado="andamento">
                    Em andamento
                  </span>
                </td>
              </tr>
            ) : (
              <tr
                key={t.id}
                className="grade__linha grade__linha--espera"
                aria-disabled="true"
                title="Esta tarefa é de outro setor"
              >
                <td data-rotulo="Obra">
                  <span className="grade__obra" data-tipo={t.obra.tipo}>
                    {daObra(t)}
                  </span>
                </td>
                <td className="grade__tarefa">
                  <span className="grade__travada">
                    <Icone.cadeado />
                    {t.titulo}
                  </span>
                </td>
                <td className="grade__etapa" data-rotulo="Etapa">
                  {t.etapaNome || `${t.etapaNumero}ª`}
                  {t.cardTitulo && <em>{t.cardTitulo}</em>}
                </td>
                <td className="grade__setor" data-rotulo="Setor">
                  <Setores cargos={t.cargos} nomeDoCargo={nomeDoCargo} corDoCargo={corDoCargo} />
                </td>
                <td data-rotulo="Prioridade">
                  <span className="tpri" data-pri={tomPrioridadeObra(t.obra)}>
                    {rotuloPrioridadeObra(t.obra)}
                  </span>
                </td>
                <td data-rotulo="Prazo">
                  <Prazo iso={t.prazo} hoje={hoje} />
                </td>
                <td data-rotulo="Estado">
                  <span className="testado" data-estado="espera">
                    Aguardando
                  </span>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ============================================================
   QUADRO — as mesmas tarefas em tres colunas

   Nao ha "adicionar tarefa" no pe das colunas: a tarefa nasce no
   roteiro da obra, nao aqui.

   Nao ha arrastar entre colunas pelo mesmo motivo. A coluna nao e
   uma escolha, e uma consequencia: "Em andamento" quer dizer que a
   etapa abriu, e "Concluida" que alguem marcou o check. Arrastar um
   card para "Concluida" seria marcar o check pelas costas do
   controle de quem pode marcar o que — a marcacao continua sendo na
   tela da obra, onde essa regra vive.
   ============================================================ */

function Quadro({ tarefas, hoje, mes, nomeDoCargo, corDoCargo, pessoaPorId, aoAbrir, paraVoce = false }) {
  const porColuna = useMemo(() => {
    const mapa = { espera: [], andamento: [], concluida: [] }
    tarefas.forEach((t) => mapa[t.status]?.push(t))
    return mapa
  }, [tarefas])

  /**
   * A coluna do que ja foi, agrupada por CARD.
   *
   * Antes cada check virava um card solto na coluna, e um card de
   * seis checks enchia a coluna com seis retangulos que contavam a
   * mesma historia. Agora o que aparece e o CARD — "Comercial" — com
   * os checks dele dentro, cada um com a hora em que foi marcado.
   *
   * A hora do CARD e a do ultimo check dele: e o instante em que
   * aquele setor terminou de fato. Card ainda pela metade entra na
   * mesma lista, marcado com o placar ("3 de 5"): esconde-lo faria o
   * trabalho ja feito sumir da tela sem ter para onde ir.
   *
   * Ordem: o que fechou por ultimo em cima. Esta coluna se le de tras
   * para frente — o que interessa e o que acabou de sair.
   */
  const cards = useMemo(() => {
    const mapa = new Map()

    porColuna.concluida.forEach((t) => {
      const chave = `${t.obra.id}:${t.cardId}`
      const grupo = mapa.get(chave) ?? {
        chave,
        obra: t.obra,
        cliente: t.cliente,
        etapaNome: t.etapaNome,
        etapaNumero: t.etapaNumero,
        titulo: t.cardTitulo || t.cardCargos.map((c) => nomeDoCargo(c)).join(' + ') || 'Card',
        cargos: t.cardCargos.length > 0 ? t.cardCargos : t.cargos,
        total: t.cardTotal,
        checks: [],
      }
      grupo.checks.push(t)
      mapa.set(chave, grupo)
    })

    return [...mapa.values()]
      .map((g) => {
        const checks = [...g.checks].sort((a, b) =>
          String(a.feitoEm ?? '').localeCompare(String(b.feitoEm ?? '')),
        )
        return {
          ...g,
          checks,
          /* o card fechou quando o ultimo check dele foi marcado */
          fechadoEm: checks.length === g.total ? checks[checks.length - 1]?.feitoEm : null,
          ultimo: checks[checks.length - 1]?.feitoEm ?? null,
        }
      })
      .sort((a, b) => String(b.ultimo ?? '').localeCompare(String(a.ultimo ?? '')))
  }, [porColuna.concluida, nomeDoCargo])

  /**
   * "Em andamento" e "Não iniciado", agrupados por OBRA.
   *
   * Um card por check enchia as colunas: uma obra com doze checks
   * abertos virava doze retangulos contando a mesma historia. Agora
   * cada obra e UM card, com o que falta nela: as etapas e, em cada
   * uma, os setores que ainda devem check (e quantos).
   *
   * A ordem e a da urgencia: a obra aparece onde aparecia o primeiro
   * check dela. No "Não iniciado", o card junta tambem quem segura a
   * fila — as etapas anteriores que ainda nao fecharam.
   */
  const obras = useMemo(() => {
    const agrupar = (lista) => {
      const mapa = new Map()
      lista.forEach((t) => {
        const g = mapa.get(t.obra.id) ?? {
          obra: t.obra,
          cliente: t.cliente,
          primeira: t,
          minha: false,
          posso: false,
          checks: 0,
          /* o prazo mais proximo entre os checks abertos da obra */
          prazo: null,
          etapas: new Map(),
          aguardando: new Map(),
        }
        g.checks += 1
        if (t.prazo && (!g.prazo || t.prazo < g.prazo)) g.prazo = t.prazo
        g.minha = g.minha || Boolean(t.minha)
        if (t.posso && !g.posso) {
          g.posso = true
          /* clicar abre a obra pelo check que a pessoa pode marcar */
          g.primeira = t
        }
        const etapa = g.etapas.get(t.etapaNumero) ?? {
          numero: t.etapaNumero,
          nome: t.etapaNome,
          checks: 0,
          setores: new Set(),
        }
        etapa.checks += 1
        t.cargos.forEach((c) => etapa.setores.add(c))
        g.etapas.set(t.etapaNumero, etapa)
        ;(t.aguardando ?? []).forEach((a) => {
          const espera = g.aguardando.get(a.numero) ?? { numero: a.numero, nome: a.nome, setores: new Set() }
          a.setores.forEach((c) => espera.setores.add(c))
          g.aguardando.set(a.numero, espera)
        })
        mapa.set(t.obra.id, g)
      })
      const emOrdem = (m) => [...m.values()].sort((a, b) => a.numero - b.numero).map((e) => ({ ...e, setores: [...e.setores] }))
      /* o que segura a obra e o que esta FORA do card: a etapa que espera
         a anterior, quando as duas estao no card, nao repete ali */
      return [...mapa.values()].map((g) => ({
        ...g,
        etapas: emOrdem(g.etapas),
        aguardando: emOrdem(g.aguardando).filter((a) => !g.etapas.has(a.numero)),
      }))
    }
    return { andamento: agrupar(porColuna.andamento), espera: agrupar(porColuna.espera) }
  }, [porColuna.andamento, porColuna.espera])

  if (tarefas.length === 0) {
    return (
      <Vazio
        titulo="Nenhuma tarefa por aqui"
        texto="As tarefas vêm dos checks das obras abertas. Assim que houver uma, ela aparece nestas colunas."
      />
    )
  }

  return (
    <div className="quadrot">
      {COLUNAS.map(({ id, rotulo, Glifo }) => (
        <section key={id} className="colunat" data-coluna={id}>
          <header className="colunat__topo">
            <Glifo />
            <h2>{rotulo}</h2>
            <span
              className="colunat__conta"
              title={id === 'concluida' ? undefined : `${porColuna[id].length} checks em ${obras[id].length} obras`}
            >
              {id === 'concluida' ? porColuna[id].length : obras[id].length}
            </span>
          </header>

          {/* o trilho dentro da pilha e o que a TV desliza (useModoTv) */}
          <div className="colunat__pilha">
            <div className="colunat__trilho">
              {(id === 'concluida' ? cards.length : obras[id].length) === 0 && (
                <p className="colunat__vazio">
                  {id === 'espera'
                    ? 'Nada esperando etapa anterior.'
                    : id === 'andamento'
                      ? 'Nada em andamento.'
                      : mes.atual
                        ? 'Nada concluído ainda.'
                        : `Nada concluído em ${mes.rotulo}.`}
                </p>
              )}

              {/* ---- concluídas: um card, com os checks dentro ---- */}
              {id === 'concluida' &&
                cards.map((c) => (
                  <article
                    key={c.chave}
                    className="cardfeito"
                    data-parcial={c.fechadoEm ? undefined : 'sim'}
                    onClick={() => aoAbrir(c.checks[0])}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        aoAbrir(c.checks[0])
                      }
                    }}
                    title={`Abrir ${daObra(c.checks[0])}`}
                  >
                    <p className="cardfeito__topo">
                      <strong>{c.titulo}</strong>
                      <span className="cardfeito__placar">
                        {c.checks.length}/{c.total}
                      </span>
                    </p>

                    <p className="tcard__obra" data-tipo={c.obra.tipo}>
                      <Avatar
                        nome={c.cliente?.nome}
                        foto={c.cliente?.logo}
                        tamanho={18}
                        quadrado
                      />
                      {daObra(c.checks[0])}
                    </p>

                    <p className="tcard__meio">
                      <span className="tcard__etapa">
                        {c.etapaNome || `${c.etapaNumero}ª etapa`}
                      </span>
                      <Setores
                        cargos={c.cargos}
                        nomeDoCargo={nomeDoCargo}
                        corDoCargo={corDoCargo}
                      />
                    </p>

                    {/* cada check, com a hora em que foi marcado e por quem */}
                    <ul className="cardfeito__checks">
                      {c.checks.map((t) => {
                        const quem = t.feitoPor ? pessoaPorId(t.feitoPor) : null
                        return (
                          <li key={t.id}>
                            <span className="cardfeito__ok" aria-hidden="true">
                              <Icone.ok />
                            </span>
                            <span className="cardfeito__nome">{t.titulo}</span>
                            <span className="cardfeito__quando">
                              {dataHora(t.feitoEm)}
                              {quem && <em>{quem.nome}</em>}
                            </span>
                          </li>
                        )
                      })}
                    </ul>

                    {/* o card fechou, ou ainda falta parte dele */}
                    <p className="cardfeito__pe">
                      {c.fechadoEm ? (
                        <>
                          <Icone.ok />
                          Card concluído em {dataHora(c.fechadoEm)}
                        </>
                      ) : (
                        <>
                          Faltam {c.total - c.checks.length} check
                          {c.total - c.checks.length > 1 ? 's' : ''} neste card
                        </>
                      )}
                    </p>
                  </article>
                ))}

              {/* ---- não iniciado e em andamento: um card por obra ---- */}
              {id !== 'concluida' &&
                obras[id].map((g) => (
                  /* travado = nenhum check da obra e do setor de quem ve.
                     O card continua contando o que falta, so nao abre. */
                  <article
                    key={g.obra.id}
                    className={`tcard tobra ${g.posso ? '' : 'tcard--travado'}`.trim()}
                    onClick={g.posso ? () => aoAbrir(g.primeira) : undefined}
                    role={g.posso ? 'link' : undefined}
                    tabIndex={g.posso ? 0 : undefined}
                    aria-disabled={g.posso ? undefined : 'true'}
                    onKeyDown={(e) => {
                      if (g.posso && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        aoAbrir(g.primeira)
                      }
                    }}
                    title={g.posso ? `Abrir ${daObra(g.primeira)}` : 'Nenhuma tarefa desta obra é do seu setor'}
                  >
                    <p className="tcard__obra tobra__nome" data-tipo={g.obra.tipo}>
                      {!g.posso && <Icone.cadeado />}
                      <Avatar nome={g.cliente?.nome} foto={g.cliente?.logo} tamanho={20} quadrado />
                      <span>{daObra(g.primeira)}</span>
                      {paraVoce && g.minha && <span className="paravoce">Para você</span>}
                    </p>

                    {/* o que falta: cada etapa com os setores que devem check */}
                    <ul className="tobra__etapas">
                      {g.etapas.map((e) => (
                        <li key={e.numero} className="tobra__etapa">
                          <span className="tcard__etapa">{e.nome || `${e.numero}ª etapa`}</span>
                          <Setores cargos={e.setores} nomeDoCargo={nomeDoCargo} corDoCargo={corDoCargo} />
                          <span className="tobra__conta">
                            {e.checks} check{e.checks > 1 ? 's' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* "Não iniciado": quem segura a fila — as etapas antes
                        destas que ainda nao fecharam e os setores que ainda
                        devem check em cada uma (ver useTarefas) */}
                    {id === 'espera' && g.aguardando.length > 0 && (
                      <div className="tcard__espera">
                        <span className="tcard__esperatit">
                          <Icone.relogio />
                          Aguardando a conclusão de
                        </span>
                        {g.aguardando.map((e) => (
                          <span key={e.numero} className="tcard__esperaetapa">
                            <strong>{e.nome || `${e.numero}ª Etapa`}</strong>
                            <Setores cargos={e.setores} nomeDoCargo={nomeDoCargo} corDoCargo={corDoCargo} />
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="tcard__pe">
                      <span className="tpri" data-pri={tomPrioridadeObra(g.obra)}>
                        {rotuloPrioridadeObra(g.obra)}
                      </span>
                      <Prazo iso={g.prazo} hoje={hoje} />
                    </p>
                  </article>
                ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}

/* A cor do pingo no globo. Fica aqui, e nao nos tokens, por um motivo
   pratico: o canvas nao le variavel de CSS — ele precisa da cor
   resolvida em texto. E o mesmo azul do orbe da barra de busca. */
const CLIENTE_NO_MAPA = "#4d8ff0"

/** O vazio das abas: um recado, e nao uma tela em branco. */
export function Vazio({ titulo, texto, arte = 'sol' }) {
  const { isDark } = useTheme()
  const { clientes } = useDados()

  /**
   * Um pingo por ESTADO, e nao por cliente nem por obra.
   *
   * Antes cada obra virava uma marca, verde ou laranja, e clicar nela
   * abria uma ficha. Oito clientes em Sao Paulo empilhavam oito pingos
   * no mesmo lugar, e o globo passava a responder "quantas obras" —
   * pergunta que a grade ao lado ja responde melhor.
   *
   * Agora ele responde outra: ONDE a empresa esta. Uma marca por UF,
   * no centro do estado, azul e sem clique. Tres clientes em Minas dao
   * um pingo em Minas, como daria um so.
   */
  const marcas = useMemo(() => {
    if (arte !== 'globo') return []

    const porUF = new Map()
    for (const cliente of clientes) {
      /* o estado de fora do Brasil nao e UF: "AL" no Alabama nao e Alagoas */
      if (!ehBrasil(cliente?.pais)) continue
      const uf = String(cliente?.estado ?? '').trim().toUpperCase()
      if (porUF.has(uf)) continue
      /* UF em branco ou escrita errada nao tem lugar no mapa: o
         cliente continua no sistema, so nao aparece no globo */
      const onde = coordenadaDaUF(uf)
      if (!onde) continue
      porUF.set(uf, { chave: uf, cor: CLIENTE_NO_MAPA, ...onde })
    }
    return [...porUF.values()]
  }, [arte, clientes])

  return (
    <div className="vaziot vidro">
      {/* O globo e do vazio da GRADE, e nao de todo vazio: e a tela do
          "o que faco agora", e quando nao ha nada a fazer ela fica sem
          assunto. Um mundo girando devagar, que responde ao cursor,
          ocupa esse silencio melhor que um icone parado — e nao inventa
          nenhum dado que nao existe. */}
      {arte === 'globo' ? (
        <div className="vaziot__globo">
          <Globo
            /* a tinta do globo segue o tema; o fundo dele e transparente,
               entao quem aparece atras e o vidro do painel */
            baseColor={isDark ? '#e2e4e9' : '#1d2633'}
            /* o preset do autor foi calibrado para uma tela de 1200x800.
               Aqui a caixa tem 340px: com a densidade de la a malha do mar
               rala some e sobram letras soltas no escuro, sem bola nenhuma
               por tras. Estes dois numeros devolvem a esfera no tamanho que
               ela tem nesta tela. */
            density={95}
            glyphSize={115}
            marcas={marcas}
            /* O giro parado, a pouco mais de um quarto do padrao do
               componente. Os 210 de fabrica foram calibrados para um globo
               de tela cheia, onde a volta demora porque a bola e grande;
               nesta caixa de 340px a mesma velocidade angular vira um pião.

               So o repouso muda: `speed` continua inteiro, entao arrastar
               responde com a mesma leveza de sempre. */
            globe={{ drift: 55 }}
            /* sem `aoTocarMarca` o pingo nao responde a clique nenhum:
               ele esta ali para dizer onde tem cliente, e nao para ser
               um botao disfarçado de enfeite */
            /* zoom pela roda desligado: ligado, ele comeria a rolagem da
               pagina de quem so passou o cursor por cima */
            pointer={{ zoom: 0, light: 100, pins: 7 }}
          />
        </div>
      ) : (
        <IconeClima familia="sol" titulo="" tamanho={54} />
      )}
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}

      {/* Sem esta linha o pingo azul seria enfeite: ninguem adivinha do
          que ele esta falando. O numero e o de CLIENTES, e nao o de
          estados: "clientes em 1 estado" e uma frase sobre o mapa, e quem
          olha quer saber o tamanho da carteira. */}
      {/* a unidade (Einstein Anapolis) nao e outro cliente: conta so o de cima */}
      {arte === 'globo' && clientes.some((c) => !c.matrizId) && (
        <p className="vaziot__legenda">
          <span className="vaziot__ponto" aria-hidden="true" />
          {clientes.filter((c) => !c.matrizId).length} cliente{clientes.filter((c) => !c.matrizId).length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}
