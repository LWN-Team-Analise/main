import { CATEGORIAS, MESES } from '@/domain/despesas'
import * as despesasApi from '@/services/despesasService'
import { baixarPlanilha, paraNomeDeArquivo } from '@/utils/planilha'
import { abasDaPlanilha } from '@/domain/planilhaReembolso'

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

  const abas = abasDaPlanilha(envios, categoria)

  const total = Math.round(envios.reduce((s, e) => s + e.valor, 0) * 100) / 100
  const nome = usuarios === 'todos' ? 'todos' : quem || envios[0].usuarioNome || 'meus-envios'
  const arquivo = ['despesas', nome, rotuloPeriodo, categoria].map(paraNomeDeArquivo).filter(Boolean).join('-')
  baixarPlanilha(abas, arquivo)
  return { envios: envios.length, total }
}
