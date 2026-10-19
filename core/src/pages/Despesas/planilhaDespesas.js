import { CATEGORIAS, MESES } from '@/domain/despesas'
import * as despesasApi from '@/services/despesasService'
import { baixarPlanilha, paraNomeDeArquivo } from '@/utils/planilha'

/* ============================================================
   A planilha de despesas — "Exportar para o Excel"

   O MESMO formato das listas do SharePoint que a empresa usava
   ("Despesas.xlsx"): tres abas, cada uma uma Tabela do Excel, com as
   mesmas colunas, na mesma ordem e com os mesmos nomes —

     Refeicoes  Criado por | Data da refeição | Cliente/Obra? (Refeição) |
                Tipo de refeição | Valor da refeição | Criado | Tipo de Item | Caminho
     Bonus      Criado por | Data do bônus | Tipo de bônus |
                Cliente Obra - Bônus Viagem? | Cliente Obra - Bônus apartamento? |
                Valor do Bônus Apartamento | Valor do Bônus Viagem | Criado | Tipo de Item | Caminho
     Despesas   Criado por | Data da despesa | Cliente/Obra | Tipo de despesa |
                Valor da Despesa | Tem alguma observação? | Criado | Tipo de Item | Caminho

   Assim o que ja lia aquela planilha (filtros, tabelas dinamicas, o
   Power BI) continua lendo esta. "Tipo de Item" e "Caminho" sao os
   valores fixos que o SharePoint gravava; ficam iguais pelo mesmo
   motivo.

   Os filtros da tela continuam valendo (periodo, tipo, de quem): sai
   so a aba do tipo escolhido, e so as abas que tem envio.

   Quem decide o que entra e a API (GET /despesas/exportar), com as
   mesmas travas da tela: sem revisar, a pessoa so exporta os proprios
   envios, peca o que pedir. Aqui so se arruma o que veio.
   ============================================================ */

/** { mes: '2026-09' } -> 'Setembro de 2026'; { ano: 2026 } -> '2026'. */
export function rotuloDoPeriodo(periodo = {}) {
  if (periodo.mes) {
    const [ano, mes] = periodo.mes.split('-').map(Number)
    return `${MESES[mes - 1]} de ${ano}`
  }
  if (periodo.ano) return String(periodo.ano)
  return 'Todo o período'
}

/* os nomes dos tipos como a planilha do SharePoint os escrevia */
const TIPO_NA_PLANILHA = {
  almoco: 'Almoço',
  janta: 'Janta',
  bonus_viagem: 'Bônus viagem',
  bonus_apartamento: 'Bônus apartamento',
  vale_transporte: 'Vale Transporte',
  transporte_intermunicipal: 'Transporte Intermunicipal',
  combustivel: 'Combustível',
  outros: 'Outros',
}

/**
 * O "Cliente/Obra" do jeito da planilha: 'Libbs - Embu das Artes/SP'.
 * O envio que veio da planilha antiga volta com o texto que tinha.
 */
function clienteDoEnvio(e) {
  if (e.clienteTexto) return e.clienteTexto
  if (!e.clienteNome) return ''
  const onde = e.clienteCidade ? ` - ${e.clienteCidade}${e.clienteEstado ? `/${e.clienteEstado}` : ''}` : ''
  return `${e.clienteNome}${onde}`
}

/* as colunas fixas do fim de toda aba */
const CRIADO = { titulo: 'Criado', tipo: 'dataHora', largura: 15.57 }
const TIPO_DE_ITEM = { titulo: 'Tipo de Item', tipo: 'texto', largura: 14.43 }
const CAMINHO = (largura) => ({ titulo: 'Caminho', tipo: 'texto', largura })

/**
 * As tres abas, na ordem e com os nomes (das abas e das Tabelas) da
 * planilha do SharePoint. `linha` monta a linha de um envio.
 */
const ABAS = {
  refeicao: {
    nome: 'Refeicoes',
    tabela: 'Tabela_query__8',
    caminho: 'sites/administracao/Lists/Refeies',
    colunas: [
      { titulo: 'Criado por', tipo: 'texto', largura: 38.57 },
      { titulo: 'Data da refeição', tipo: 'data', largura: 18 },
      { titulo: 'Cliente/Obra? (Refeição)', tipo: 'texto', largura: 60.71 },
      { titulo: 'Tipo de refeição', tipo: 'texto', largura: 17.86 },
      { titulo: 'Valor da refeição', tipo: 'reais', largura: 18.43 },
      CRIADO,
      TIPO_DE_ITEM,
      CAMINHO(31.29),
    ],
    linha: (e, caminho) => [
      e.usuarioNome,
      e.data,
      clienteDoEnvio(e),
      TIPO_NA_PLANILHA[e.tipo] ?? e.tipo,
      e.valor,
      e.criadoEm,
      'Item',
      caminho,
    ],
  },
  bonus: {
    nome: 'Bonus',
    tabela: 'Tabela_query__7',
    caminho: 'sites/administracao/Lists/Bonus',
    colunas: [
      { titulo: 'Criado por', tipo: 'texto', largura: 38.57 },
      { titulo: 'Data do bônus', tipo: 'data', largura: 16.29 },
      { titulo: 'Tipo de bônus', tipo: 'texto', largura: 18.71 },
      { titulo: 'Cliente Obra - Bônus Viagem?', tipo: 'texto', largura: 38.57 },
      { titulo: 'Cliente Obra - Bônus apartamento?', tipo: 'texto', largura: 41.71 },
      { titulo: 'Valor do Bônus Apartamento', tipo: 'reais', largura: 29.14 },
      { titulo: 'Valor do Bônus Viagem', tipo: 'reais', largura: 24 },
      CRIADO,
      TIPO_DE_ITEM,
      CAMINHO(30.57),
    ],
    /* o bonus de viagem preenche as colunas de viagem; o de apartamento, as dele */
    linha: (e, caminho) => {
      const viagem = e.tipo === 'bonus_viagem'
      return [
        e.usuarioNome,
        e.data,
        TIPO_NA_PLANILHA[e.tipo] ?? e.tipo,
        viagem ? clienteDoEnvio(e) : null,
        viagem ? null : clienteDoEnvio(e),
        viagem ? null : e.valor,
        viagem ? e.valor : null,
        e.criadoEm,
        'Item',
        caminho,
      ]
    },
  },
  despesa: {
    nome: 'Despesas',
    tabela: 'Tabela_query__6',
    caminho: 'sites/administracao/Lists/Despesas',
    colunas: [
      { titulo: 'Criado por', tipo: 'texto', largura: 38.57 },
      { titulo: 'Data da despesa', tipo: 'data', largura: 18.14 },
      { titulo: 'Cliente/Obra', tipo: 'texto', largura: 60.71 },
      { titulo: 'Tipo de despesa', tipo: 'texto', largura: 24.43 },
      { titulo: 'Valor da Despesa', tipo: 'reais', largura: 18.86 },
      { titulo: 'Tem alguma observação?', tipo: 'texto', largura: 81.14 },
      CRIADO,
      TIPO_DE_ITEM,
      CAMINHO(33.57),
    ],
    /* a justificativa (so do tipo Outros) entra na frente da observacao */
    linha: (e, caminho) => [
      e.usuarioNome,
      e.data,
      clienteDoEnvio(e),
      TIPO_NA_PLANILHA[e.tipo] ?? e.tipo,
      e.valor,
      [e.justificativa, e.observacao].filter(Boolean).join(' — '),
      e.criadoEm,
      'Item',
      caminho,
    ],
  },
}

/* a ordem das abas na planilha */
const ORDEM = ['refeicao', 'bonus', 'despesa']

/**
 * Busca os envios e baixa a planilha.
 *
 *   usuarios   undefined (os meus) | 'todos' | ['7']
 *   categoria  undefined (todas) | 'despesa' | 'refeicao' | 'bonus'
 *   periodo    { mes: 'AAAA-MM' } | { ano: 2026 } | {} (tudo)
 *   quem       o nome que vai no arquivo ("Luis Pyim")
 *
 * Lanca Error com recado quando nao ha nada no periodo.
 */
export async function exportarEnvios({ usuarios, categoria, periodo = {}, quem }) {
  const envios = await despesasApi.carregarParaExportar(periodo, { usuarios, categoria })

  const rotuloPeriodo = rotuloDoPeriodo(periodo)
  if (envios.length === 0) {
    const doTipo = categoria ? ` de ${CATEGORIAS[categoria].rotulo.toLowerCase()}` : ''
    const quando = periodo.mes || periodo.ano ? ` em ${rotuloPeriodo.toLowerCase()}` : ' até agora'
    throw new Error(`Nenhum envio${doTipo}${quando} — não há o que exportar.`)
  }

  /* do mais novo para o mais antigo, como a lista do SharePoint mostrava */
  const ordenados = [...envios].sort(
    (a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criadoEm).localeCompare(String(a.criadoEm)),
  )

  const abas = ORDEM.filter((c) => !categoria || c === categoria)
    .map((c) => {
      const aba = ABAS[c]
      const daCategoria = ordenados.filter((e) => e.categoria === c)
      return {
        nome: aba.nome,
        tabela: aba.tabela,
        colunas: aba.colunas,
        linhas: daCategoria.map((e) => aba.linha(e, aba.caminho)),
      }
    })
    .filter((aba) => aba.linhas.length > 0)

  const total = Math.round(envios.reduce((s, e) => s + e.valor, 0) * 100) / 100
  const nome = usuarios === 'todos' ? 'todos' : quem || envios[0].usuarioNome || 'meus-envios'
  const arquivo = ['despesas', nome, rotuloPeriodo, categoria].map(paraNomeDeArquivo).filter(Boolean).join('-')
  baixarPlanilha(abas, arquivo)
  return { envios: envios.length, total }
}
