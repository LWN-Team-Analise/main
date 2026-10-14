import { CATEGORIAS, rotuloDaCategoria, rotuloDoTipo } from '@/domain/despesas'
import {
  cargosDoCheck,
  chaveDoCargo,
  etapaAtual,
  progressoDaObra,
  rotuloPrioridadeObra,
} from '@/domain/obras'
import * as despesasApi from '@/services/despesasService'
import { dataHora, hojeISO } from '@/utils/formato'
import { baixarPlanilha } from '@/utils/planilha'
import {
  diasEntre,
  etapaDeCampo,
  horasEntre,
  inicioDaObra,
  linhaDoTempo,
  tempoEmCampo,
} from './tempo'

/* ============================================================
   EXPORTAR O DASHBOARD PARA O POWER BI

   O Power BI le planilha do Excel direto ("Obter dados > Pasta de
   trabalho do Excel"), e le melhor quando cada assunto e uma TABELA
   do Excel com nome: no navegador dele aparecem "Obras", "Etapas",
   "Checks" e "Despesas", ja com cabecalho, data como data e valor
   como numero. Por isso o arquivo sai assim — uma Tabela por aba, sem
   titulo nem enfeite em volta —, e nao como copia do desenho da tela.

   Tres escolhas:

     tudo      obras e despesas;
     obras     Obras, Etapas e Checks;
     despesas  so as despesas.

   Sai o HISTORICO INTEIRO, e nao so o mes das setas: quem filtra no
   Power BI e o Power BI. As tabelas se ligam pela coluna "Obra ID".

   As contas (duracao, desvio, tempo em campo, espera entre checks)
   sao as MESMAS do Dashboard — vem de tempo.js —, para o numero do
   relatorio bater com o da tela.

   Despesas por pessoa so saem para quem revisa (revisar_despesa_geral),
   como em Envios gerais. Para os outros, a tabela e "DespesasResumo":
   o total por dia, categoria e tipo, sem ninguem — o mesmo que os
   graficos do Dashboard mostram.
   ============================================================ */

export const ESCOPOS = {
  tudo: {
    rotulo: 'Todos os dados',
    descricao: 'Obras, etapas, checks e despesas, num arquivo só.',
  },
  obras: {
    rotulo: 'Apenas obras',
    descricao: 'Obras (com duração, prazo e tempo em campo), etapas e checks.',
  },
  despesas: {
    rotulo: 'Apenas despesas',
    descricao: 'Despesas, refeições e bônus.',
  },
}

const SIM_NAO = (v) => (v ? 'Sim' : 'Não')
const umaCasa = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10)

/* ------------------------------------------------------------
   Obras
   ------------------------------------------------------------ */

function tabelasDeObras({ obras, roteiroDaObra, clientePorId, equipe, nomeDoCargo, concluida }) {
  const pessoa = (id) => equipe.find((p) => String(p.id) === String(id))
  const nomeDaEtapa = (etapa) =>
    [etapa?.nome, etapa?.descricao].filter(Boolean).join(' — ') || `Etapa ${etapa?.numero ?? ''}`.trim()

  const obrasLinhas = []
  const etapasLinhas = []
  const checksLinhas = []

  obras.forEach((obra) => {
    const roteiro = roteiroDaObra(obra)
    const cliente = clientePorId(obra.clienteId)?.nome ?? ''
    const fechada = concluida(obra)
    const marcados = obra.checks ?? {}
    const todos = roteiro.flatMap((e) => e.cards.flatMap((c) => c.checks ?? []))
    const feitos = todos.filter((c) => marcados[c.id]).length
    const campo = tempoEmCampo(obra, roteiro)
    const etapaCampo = etapaDeCampo(roteiro)
    const numeroAtual = etapaAtual(roteiro, marcados)
    const atual = roteiro.find((e) => e.numero === numeroAtual)

    const duracao = fechada ? diasEntre(inicioDaObra(obra), obra.concluidaEm) : null
    const desvio = fechada && obra.dataConclusao ? diasEntre(obra.dataConclusao, obra.concluidaEm) : null

    obrasLinhas.push([
      Number(obra.id),
      obra.proposta || '',
      cliente,
      obra.descricao || '',
      obra.tipo === 'emergencia' ? 'Emergência' : 'Padrão',
      rotuloPrioridadeObra(obra),
      fechada ? 'Concluída' : 'Em andamento',
      fechada ? '' : nomeDaEtapa(atual),
      progressoDaObra(roteiro, marcados) / 100,
      feitos,
      todos.length,
      obra.dataInicio || null,
      obra.dataConclusao || null,
      obra.criadoEm,
      obra.concluidaEm,
      duracao !== null && duracao >= 0 ? duracao : null,
      desvio,
      umaCasa(campo?.dias),
      obra.avaliacao?.nota ?? null,
    ])

    linhaDoTempo(obra, roteiro).forEach((l) => {
      etapasLinhas.push([
        Number(obra.id),
        obra.proposta || '',
        l.numero,
        l.etapa.nome || '',
        l.etapa.descricao || '',
        l.fechou ? 'Fechada' : l.abriu ? 'Aberta' : 'Esperando',
        l.abriu,
        l.fechou,
        umaCasa(l.dias),
        SIM_NAO(etapaCampo && etapaCampo.numero === l.numero),
      ])
    })

    /* a espera de cada check: o mesmo intervalo do "Tempo de resposta"
       do Dashboard — da marcacao anterior NA MESMA OBRA ate esta; a
       primeira conta do inicio da obra */
    const espera = {}
    let marco = inicioDaObra(obra)
    todos
      .map((c) => ({ id: c.id, ...marcados[c.id] }))
      .filter((m) => m.feitoEm)
      .sort((a, b) => String(a.feitoEm).localeCompare(String(b.feitoEm)))
      .forEach((m) => {
        const horas = horasEntre(marco, m.feitoEm)
        marco = m.feitoEm
        espera[m.id] = horas === null || horas < 0 ? null : horas / 24
      })

    roteiro.forEach((etapa) => {
      etapa.cards.forEach((card) => {
        ;(card.checks ?? []).forEach((check) => {
          const marca = marcados[check.id]
          const quem = marca?.feitoPor ? pessoa(marca.feitoPor) : null
          checksLinhas.push([
            Number(obra.id),
            obra.proposta || '',
            etapa.numero,
            nomeDaEtapa(etapa),
            check.titulo || '',
            cargosDoCheck(check, card).map(nomeDoCargo).join(', '),
            marca ? 'Feito' : 'Pendente',
            marca?.feitoPor ? quem?.nome ?? 'Usuário removido' : '',
            quem ? nomeDoCargo(chaveDoCargo(quem)) : '',
            marca?.feitoEm ?? null,
            umaCasa(espera[check.id]),
          ])
        })
      })
    })
  })

  return [
    {
      nome: 'Obras',
      tabela: 'Obras',
      colunas: [
        { titulo: 'Obra ID', tipo: 'inteiro' },
        { titulo: 'Proposta', tipo: 'texto' },
        { titulo: 'Cliente', tipo: 'texto' },
        { titulo: 'Descrição', tipo: 'texto', largura: 40 },
        { titulo: 'Tipo', tipo: 'texto' },
        { titulo: 'Prioridade', tipo: 'texto' },
        { titulo: 'Situação', tipo: 'texto' },
        { titulo: 'Etapa atual', tipo: 'texto' },
        { titulo: 'Progresso', tipo: 'porcento' },
        { titulo: 'Checks feitos', tipo: 'inteiro' },
        { titulo: 'Checks no roteiro', tipo: 'inteiro' },
        { titulo: 'Data de início', tipo: 'data' },
        { titulo: 'Prazo de conclusão', tipo: 'data' },
        { titulo: 'Cadastrada em', tipo: 'dataHora' },
        { titulo: 'Concluída em', tipo: 'dataHora' },
        { titulo: 'Duração (dias)', tipo: 'inteiro' },
        { titulo: 'Desvio do prazo (dias)', tipo: 'inteiro' },
        { titulo: 'Tempo em campo (dias)', tipo: 'decimal' },
        { titulo: 'Avaliação', tipo: 'decimal' },
      ],
      linhas: obrasLinhas,
    },
    {
      nome: 'Etapas',
      tabela: 'Etapas',
      colunas: [
        { titulo: 'Obra ID', tipo: 'inteiro' },
        { titulo: 'Proposta', tipo: 'texto' },
        { titulo: 'Etapa nº', tipo: 'inteiro' },
        { titulo: 'Etapa', tipo: 'texto' },
        { titulo: 'Descrição', tipo: 'texto' },
        { titulo: 'Situação', tipo: 'texto' },
        { titulo: 'Aberta em', tipo: 'dataHora' },
        { titulo: 'Fechada em', tipo: 'dataHora' },
        { titulo: 'Duração (dias)', tipo: 'decimal' },
        { titulo: 'Etapa de campo', tipo: 'texto' },
      ],
      linhas: etapasLinhas,
    },
    {
      nome: 'Checks',
      tabela: 'Checks',
      colunas: [
        { titulo: 'Obra ID', tipo: 'inteiro' },
        { titulo: 'Proposta', tipo: 'texto' },
        { titulo: 'Etapa nº', tipo: 'inteiro' },
        { titulo: 'Etapa', tipo: 'texto' },
        { titulo: 'Check', tipo: 'texto', largura: 40 },
        { titulo: 'Setor responsável', tipo: 'texto' },
        { titulo: 'Situação', tipo: 'texto' },
        { titulo: 'Feito por', tipo: 'texto' },
        { titulo: 'Setor de quem marcou', tipo: 'texto' },
        { titulo: 'Feito em', tipo: 'dataHora' },
        { titulo: 'Espera desde a marcação anterior (dias)', tipo: 'decimal' },
      ],
      linhas: checksLinhas,
    },
  ]
}

/* ------------------------------------------------------------
   Despesas
   ------------------------------------------------------------ */

async function tabelaDeDespesas(revisor) {
  if (revisor) {
    const envios = await despesasApi.carregarParaExportar({}, { usuarios: 'todos' })
    return {
      nome: 'Despesas',
      tabela: 'Despesas',
      colunas: [
        { titulo: 'Envio ID', tipo: 'inteiro' },
        { titulo: 'Data', tipo: 'data' },
        { titulo: 'Pessoa', tipo: 'texto' },
        { titulo: 'Setor', tipo: 'texto' },
        { titulo: 'Categoria', tipo: 'texto' },
        { titulo: 'Tipo', tipo: 'texto' },
        { titulo: 'Cliente', tipo: 'texto' },
        { titulo: 'Proposta', tipo: 'texto' },
        { titulo: 'Obra ID', tipo: 'inteiro' },
        { titulo: 'Valor (R$)', tipo: 'reais' },
        { titulo: 'Enviado em', tipo: 'dataHora' },
      ],
      linhas: envios.map((e) => [
        Number(e.id),
        e.data,
        e.usuarioNome,
        e.usuarioSetor,
        rotuloDaCategoria(e.categoria),
        rotuloDoTipo(e.tipo),
        e.clienteNome,
        e.obraProposta,
        e.obraId === null ? null : Number(e.obraId),
        e.valor,
        e.criadoEm,
      ]),
    }
  }

  const linhas = await despesasApi.carregarPainel({})
  return {
    nome: 'Despesas (resumo)',
    tabela: 'DespesasResumo',
    colunas: [
      { titulo: 'Data', tipo: 'data' },
      { titulo: 'Categoria', tipo: 'texto' },
      { titulo: 'Tipo', tipo: 'texto' },
      { titulo: 'Envios', tipo: 'inteiro' },
      { titulo: 'Total (R$)', tipo: 'reais' },
    ],
    linhas: linhas.map((l) => [
      l.data,
      CATEGORIAS[l.categoria]?.rotulo ?? l.categoria,
      rotuloDoTipo(l.tipo),
      l.quantidade,
      l.total,
    ]),
  }
}

/* ------------------------------------------------------------
   O arquivo
   ------------------------------------------------------------ */

/**
 * Monta e baixa a planilha para o Power BI.
 *
 *   escopo   'tudo' | 'obras' | 'despesas'
 *   dados    o que a tela ja tem: obras, roteiroDaObra, clientePorId,
 *            equipe, nomeDoCargo, concluida
 *   revisor  se a pessoa ve os envios dos outros (despesa por pessoa)
 *   quem     o nome de quem exporta — vai na aba "Sobre"
 */
export async function exportarParaPowerBI({ escopo, dados, revisor, quem }) {
  const comObras = escopo !== 'despesas'
  const comDespesas = escopo !== 'obras'

  const abas = []
  if (comObras) abas.push(...tabelasDeObras(dados))
  if (comDespesas) abas.push(await tabelaDeDespesas(revisor))

  const descricao = {
    Obras: 'Uma linha por obra: cliente, situação, etapa atual, progresso, datas, duração, desvio do prazo e tempo em campo.',
    Etapas: 'Uma linha por etapa de cada obra: quando abriu, quando fechou e quanto durou. "Etapa de campo" marca a de execução.',
    Checks: 'Uma linha por check do roteiro de cada obra: quem marcou, quando, e quanto a obra esperou por ele.',
    Despesas: 'Uma linha por envio de despesa, refeição ou bônus, com a pessoa e o setor.',
    DespesasResumo: 'O total por dia, categoria e tipo (sem pessoa — o detalhe por pessoa é de quem revisa as despesas).',
  }

  abas.push({
    nome: 'Sobre',
    titulo: 'Dashboard — dados para o Power BI',
    info: [
      ['Conteúdo', ESCOPOS[escopo].rotulo],
      ['Gerado em', dataHora(new Date().toISOString())],
      ...(quem ? [['Gerado por', quem]] : []),
      ['Período', 'Todo o histórico (o Power BI faz os filtros)'],
      ['Como abrir', 'Power BI Desktop > Obter dados > Pasta de trabalho do Excel > marque as tabelas abaixo.'],
      ...(comObras ? [['Relação', 'As tabelas se ligam pela coluna "Obra ID".']] : []),
    ],
    colunas: [
      { titulo: 'Tabela', tipo: 'texto', largura: 18 },
      { titulo: 'O que tem', tipo: 'texto', largura: 110 },
      { titulo: 'Linhas', tipo: 'inteiro' },
    ],
    linhas: abas.map((a) => [a.tabela, descricao[a.tabela] ?? '', a.linhas.length]),
  })

  baixarPlanilha(abas, `dashboard-power-bi-${escopo}-${hojeISO()}`)
  return abas.filter((a) => a.tabela).map((a) => ({ tabela: a.tabela, linhas: a.linhas.length }))
}
