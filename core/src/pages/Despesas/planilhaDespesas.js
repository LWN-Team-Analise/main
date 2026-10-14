import { CATEGORIAS, CHAVES_CATEGORIA, MESES, rotuloDaCategoria, rotuloDoTipo } from '@/domain/despesas'
import * as despesasApi from '@/services/despesasService'
import { dataHora } from '@/utils/formato'
import { baixarPlanilha, paraNomeDeArquivo } from '@/utils/planilha'

/* ============================================================
   A planilha de despesas — "Exportar para o Excel"

   Dois formatos, conforme de quem e a planilha:

     UMA pessoa (Meus envios, ou uma pessoa de Envios gerais)
       Resumo   o total por categoria e tipo, com quem, periodo e tipo
                no topo;
       Envios   um envio por linha, com a soma no fim.

     TODOS (Envios gerais > todos os usuarios)
       Resumo   uma linha por pessoa: setor, cargo, quanto em cada
                categoria e o total — e a soma da equipe no fim;
       + uma aba por pessoa, com os envios dela.

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

const rotuloDoFiltro = (categoria) => (categoria ? CATEGORIAS[categoria].plural : 'Todos')

/* as colunas de um envio; `comPessoa` liga a coluna de quem enviou */
function colunasDoEnvio(comPessoa) {
  return [
    { titulo: 'Data', tipo: 'data' },
    ...(comPessoa ? [{ titulo: 'Pessoa', tipo: 'texto' }] : []),
    { titulo: 'Categoria', tipo: 'texto' },
    { titulo: 'Tipo', tipo: 'texto', largura: 24 },
    { titulo: 'Cliente', tipo: 'texto' },
    { titulo: 'Proposta', tipo: 'texto' },
    { titulo: 'Obra', tipo: 'texto' },
    { titulo: 'Valor (R$)', tipo: 'reais', soma: true },
    { titulo: 'Justificativa', tipo: 'texto' },
    { titulo: 'Observação', tipo: 'texto' },
    { titulo: 'Comprovante', tipo: 'texto' },
    { titulo: 'Enviado em', tipo: 'dataHora' },
  ]
}

function linhaDoEnvio(e, comPessoa) {
  /* a obra e opcional: sem ela, as duas colunas ficam vazias */
  const obra = e.obraId ? `${e.obraDescricao || ''}${e.obraConcluida ? ' (concluída)' : ''}`.trim() : ''
  return [
    e.data,
    ...(comPessoa ? [e.usuarioNome] : []),
    rotuloDaCategoria(e.categoria),
    rotuloDoTipo(e.tipo),
    e.clienteNome || (e.obraId ? '' : 'Cliente removido'),
    e.obraProposta || '',
    obra,
    e.valor,
    e.justificativa || '',
    e.observacao || '',
    e.anexos.map((a) => a.nome).join(', '),
    e.criadoEm,
  ]
}

/** A aba com os envios de uma pessoa (ou de todas, com `comPessoa`). */
function abaDeEnvios(nome, envios, { comPessoa = false, titulo, info } = {}) {
  return {
    nome,
    titulo,
    info,
    colunas: colunasDoEnvio(comPessoa),
    linhas: envios.map((e) => linhaDoEnvio(e, comPessoa)),
    total: 'Total',
  }
}

/** O resumo de UMA pessoa: categoria x tipo, com quantos envios e quanto. */
function resumoPorTipo(envios, categoria, info, titulo) {
  const categorias = categoria ? [categoria] : CHAVES_CATEGORIA
  const linhas = categorias.flatMap((c) =>
    CATEGORIAS[c].tipos.map((t) => {
      const doTipo = envios.filter((e) => e.tipo === t.chave)
      const total = doTipo.reduce((s, e) => s + e.valor, 0)
      return [CATEGORIAS[c].rotulo, t.rotulo, doTipo.length, Math.round(total * 100) / 100]
    }),
  )
  return {
    nome: 'Resumo',
    titulo,
    info,
    colunas: [
      { titulo: 'Categoria', tipo: 'texto', largura: 16 },
      { titulo: 'Tipo', tipo: 'texto', largura: 28 },
      { titulo: 'Envios', tipo: 'inteiro', soma: true },
      { titulo: 'Total (R$)', tipo: 'reais', soma: true },
    ],
    linhas,
    total: 'Total',
  }
}

/** O resumo de TODOS: uma linha por pessoa. */
function resumoPorPessoa(pessoas, categoria, info, titulo) {
  const categorias = categoria ? [categoria] : CHAVES_CATEGORIA
  return {
    nome: 'Resumo',
    titulo,
    info,
    colunas: [
      { titulo: 'Pessoa', tipo: 'texto' },
      { titulo: 'Setor', tipo: 'texto' },
      { titulo: 'Cargo', tipo: 'texto' },
      ...categorias.map((c) => ({ titulo: `${CATEGORIAS[c].plural} (R$)`, tipo: 'reais', soma: true })),
      { titulo: 'Envios', tipo: 'inteiro', soma: true },
      { titulo: 'Total (R$)', tipo: 'reais', soma: true },
    ],
    linhas: pessoas.map((p) => {
      const porCategoria = categorias.map((c) =>
        Math.round(p.envios.filter((e) => e.categoria === c).reduce((s, e) => s + e.valor, 0) * 100) / 100,
      )
      const total = Math.round(p.envios.reduce((s, e) => s + e.valor, 0) * 100) / 100
      return [p.nome, p.setor, p.cargo, ...porCategoria, p.envios.length, total]
    }),
    total: 'Total da equipe',
  }
}

/** Os envios separados por pessoa, em ordem de nome. */
function agruparPorPessoa(envios) {
  const mapa = new Map()
  envios.forEach((e) => {
    if (!mapa.has(e.usuarioId)) {
      mapa.set(e.usuarioId, {
        id: e.usuarioId,
        nome: e.usuarioNome || 'Usuário removido',
        setor: e.usuarioSetor || '',
        cargo: e.usuarioCargo || '',
        envios: [],
      })
    }
    mapa.get(e.usuarioId).envios.push(e)
  })
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * Busca os envios e baixa a planilha.
 *
 *   usuarios   undefined (os meus) | 'todos' | ['7']
 *   categoria  undefined (todas) | 'despesa' | 'refeicao' | 'bonus'
 *   periodo    { mes: 'AAAA-MM' } | { ano: 2026 } | {} (tudo)
 *   quem       o nome que vai no titulo e no arquivo ("Luis Pyim")
 *
 * Com `usuarios: 'todos'`, sai o formato de equipe (uma aba por
 * pessoa). Lanca Error com recado quando nao ha nada no periodo.
 */
export async function exportarEnvios({ usuarios, categoria, periodo = {}, quem }) {
  const envios = await despesasApi.carregarParaExportar(periodo, { usuarios, categoria })

  const rotuloPeriodo = rotuloDoPeriodo(periodo)
  if (envios.length === 0) {
    const doTipo = categoria ? ` de ${CATEGORIAS[categoria].rotulo.toLowerCase()}` : ''
    const quando = periodo.mes || periodo.ano ? ` em ${rotuloPeriodo.toLowerCase()}` : ' até agora'
    throw new Error(`Nenhum envio${doTipo}${quando} — não há o que exportar.`)
  }

  const gerado = dataHora(new Date().toISOString())
  const total = Math.round(envios.reduce((s, e) => s + e.valor, 0) * 100) / 100
  const arquivo = (partes) => partes.map(paraNomeDeArquivo).filter(Boolean).join('-')

  if (usuarios === 'todos') {
    const pessoas = agruparPorPessoa(envios)
    const info = [
      ['Período', rotuloPeriodo],
      ['Tipo', rotuloDoFiltro(categoria)],
      ['Pessoas', String(pessoas.length)],
      ['Envios', String(envios.length)],
      ['Gerado em', gerado],
    ]
    const abas = [
      resumoPorPessoa(pessoas, categoria, info, `Envios gerais — todos os usuários`),
      ...pessoas.map((p) =>
        abaDeEnvios(p.nome, p.envios, {
          titulo: p.nome,
          info: [
            ['Setor', [p.setor, p.cargo].filter(Boolean).join(' · ') || 'Sem setor'],
            ['Período', rotuloPeriodo],
            ['Tipo', rotuloDoFiltro(categoria)],
          ],
        }),
      ),
    ]
    baixarPlanilha(abas, arquivo(['envios-gerais', 'todos', rotuloPeriodo, categoria]))
    return { envios: envios.length, total }
  }

  /* uma pessoa so: o nome vem da propria lista quando quem chamou nao disse */
  const nome = quem || envios[0].usuarioNome || 'Meus envios'
  const pessoa = envios[0]
  const info = [
    ['Pessoa', nome],
    ...(pessoa.usuarioSetor
      ? [['Setor', [pessoa.usuarioSetor, pessoa.usuarioCargo].filter(Boolean).join(' · ')]]
      : []),
    ['Período', rotuloPeriodo],
    ['Tipo', rotuloDoFiltro(categoria)],
    ['Envios', String(envios.length)],
    ['Gerado em', gerado],
  ]
  const abas = [
    resumoPorTipo(envios, categoria, info, `Despesas — ${nome}`),
    abaDeEnvios('Envios', envios, { titulo: `Envios — ${rotuloPeriodo}` }),
  ]
  baixarPlanilha(abas, arquivo(['despesas', nome, rotuloPeriodo, categoria]))
  return { envios: envios.length, total }
}
