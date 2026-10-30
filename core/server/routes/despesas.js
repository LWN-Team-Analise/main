import { Router } from 'express'
import { query } from '../db.js'
import { cargoPode, exige, exigeSessao, meuCargo, tratar } from '../sessao.js'
import { descreverObra, registrarAtividade } from '../atividade.js'
import { logger } from '../logger.js'
import { guardarPlanilhaDoReembolso, sharepointConfigurado } from '../sharepoint.js'
import { montarPlanilha } from '../../src/utils/planilha.js'
import { abasDaPlanilha } from '../../src/domain/planilhaReembolso.js'
/* os tipos, os valores fixos e os limites sao os MESMOS da tela: um
   arquivo so, sem React dentro, importado pelos dois lados (ver o
   comentario no topo dele) */
import {
  ANEXO_BYTES_MAXIMOS,
  CHAVES_CATEGORIA,
  JUSTIFICATIVA_MAXIMA,
  OBSERVACAO_MAXIMA,
  PERIODOS_PADRAO,
  VALORES_FIXOS,
  VALOR_MAXIMO,
  anexoAceito,
  comprovanteObrigatorio,
  descreverPeriodo,
  inicioDoPeriodo,
  lerTabelaDePeriodos,
  lerTabelaDeValores,
  lerValor,
  mesDoPeriodo,
  periodoDoMes,
  rotuloDaCategoria,
  rotuloDoTipo,
  tipoValido,
  valorFixo,
} from '../../src/domain/despesas.js'

const REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const reais = (valor) => REAIS.format(Number(valor) || 0)

/* ============================================================
   REEMBOLSO (a aba que se chamava Despesas) — /api/despesas

     POST   /envios               envia uma despesa, refeicao ou bonus
     DELETE /envios/:id           exclui um lancamento (so quem pode excluir)
     GET    /envios?mes=AAAA-MM   os envios do mes, dia a dia, com totais
     GET    /resumo?ano=AAAA      o ano, mes a mes, com o total anual
     GET    /exportar             os envios de um mes, de um ano ou de
                                  tudo, numa lista so — a planilha do Excel
     GET    /pessoas              quem ja enviou algo (Envios gerais; so revisor)
     GET    /painel               os totais por dia, categoria e tipo, sem
                                  ninguem — os graficos do Dashboard
     GET    /anexos/:id           o comprovante (o arquivo em si)
     GET    /valores              os valores pre-definidos e o periodo de
                                  cada categoria
     PUT    /valores              grava os dois (definir_valores_reembolso)

   /envios, /resumo e /exportar aceitam os mesmos filtros, e eles se somam:
     ?usuarios=   de quem (ver escopoDaConsulta)
     ?categoria=  despesa | refeicao | bonus (vazio = todas)

   Quem enxerga o que — tudo conferido AQUI, a cada chamada, a partir
   do token (a tela esconde o que a pessoa nao pode, mas esconder nao
   protege nada):

     ver_despesas          qualquer rota daqui; sem ela, 403 em todas.
                           Com ela, a pessoa ve os PROPRIOS envios.
     alterar_despesas      enviar (POST /envios).
     revisar_despesa_geral ver os envios dos outros. `?usuarios=` com
                           o id de outra pessoa, sem ela, volta 403. E o
                           comprovante de outra pessoa volta 404, como se
                           nao existisse — o id de um anexo nao conta se
                           ele existe.
     excluir_despesas      excluir um lancamento. Os PROPRIOS, ou os de
                           qualquer um quando tambem revisa — o mesmo
                           alcance do que a pessoa enxerga.
     definir_valores_reembolso
                           mudar os valores pre-definidos (e escolher
                           quais tipos sao pre-definidos).

   As tres de baixo dependem de ver_despesas (src/domain/permissoes.js):
   a lista do setor e normalizada ao ser lida, entao sem a visualizacao
   nenhuma delas vale, mesmo que esteja gravada.

   /painel e a excecao: ele e do Dashboard da pagina inicial, e pede
   `ver_dashboard`, nao `ver_despesas`. Por isso ele so devolve
   SOMAS por dia, categoria e tipo — sem pessoa, sem obra, sem envio.
   Quem ve o Dashboard ve quanto a empresa gastou; quem gastou o que
   continua sendo de quem revisa.

   Os TOTAIS (do dia, do mes, do ano, por pessoa) saem do banco,
   com SUM sobre NUMERIC. A tela so escreve o que recebeu.

   O MES de /envios, /resumo e /exportar e o do PERIODO de cada
   categoria (ver src/domain/despesas.js): com a refeicao comecando
   no dia 26, as refeicoes de novembro sao as de 26/10 a 25/11, e as
   despesas de novembro continuam sendo as de 01/11 a 30/11.
   ============================================================ */

const router = Router()

const texto = (valor) => String(valor ?? '').trim()
const PERMISSAO_VER = 'ver_despesas'
const PERMISSAO_ENVIAR = 'alterar_despesas'
const PERMISSAO_REVISAR = 'revisar_despesa_geral'
const PERMISSAO_EXCLUIR = 'excluir_despesas'
const PERMISSAO_DASHBOARD = 'ver_dashboard'
const PERMISSAO_VALORES = 'definir_valores_reembolso'

/* ============================================================
   VALORES PRE-DEFINIDOS e PERIODOS

   As duas tabelas moram em configuracao, como JSON: os valores em
   'valores_reembolso' ({ tipo: valor }) e o dia em que o periodo de
   cada categoria comeca em 'periodos_reembolso' ({ categoria: dia }).
   Sem a linha (ninguem salvou ainda), vale o padrao de
   src/domain/despesas.js (VALORES_FIXOS e PERIODOS_PADRAO).
   ============================================================ */

const CHAVE_VALORES = 'valores_reembolso'
const CHAVE_PERIODOS = 'periodos_reembolso'

/** A tabela gravada em `chave`, lida por `ler`; o `padrao` quando nao ha. */
async function tabelaDaConfiguracao(chave, ler, padrao) {
  try {
    const { rows } = await query('SELECT valor FROM configuracao WHERE chave = $1', [chave])
    if (!rows[0]) return padrao
    return ler(JSON.parse(rows[0].valor)) ?? padrao
  } catch (erro) {
    /* banco sem a tabela configuracao, ou JSON estragado: o padrao */
    if (erro.code === '42P01' || erro instanceof SyntaxError) return padrao
    throw erro
  }
}

const tabelaDeValores = () =>
  tabelaDaConfiguracao(CHAVE_VALORES, (bruto) => lerTabelaDeValores(bruto).tabela, VALORES_FIXOS)

const tabelaDePeriodos = () =>
  tabelaDaConfiguracao(CHAVE_PERIODOS, (bruto) => lerTabelaDePeriodos(bruto).periodos, PERIODOS_PADRAO)

const gravarConfiguracao = (chave, tabela, usuarioId) =>
  query(
    `INSERT INTO configuracao (chave, valor, atualizado_por) VALUES ($1, $2, $3)
     ON CONFLICT (chave) DO UPDATE
        SET valor = EXCLUDED.valor, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
    [chave, JSON.stringify(tabela), usuarioId],
  )

router.get('/valores', exigeSessao, exige(PERMISSAO_VER), async (_req, res) => {
  try {
    const [valores, periodos] = await Promise.all([tabelaDeValores(), tabelaDePeriodos()])
    return res.json({ valores, periodos })
  } catch (erro) {
    return falhou(erro, res, 'despesas/valores')
  }
})

router.put('/valores', exigeSessao, exige(PERMISSAO_VALORES), async (req, res) => {
  const lido = lerTabelaDeValores(req.body?.valores)
  if (lido.erro) return res.status(400).json({ erro: lido.erro, campo: lido.tipo })
  /* sem `periodos` no pedido (tela antiga), eles ficam como estao */
  const temPeriodos = req.body?.periodos !== undefined
  const lidos = temPeriodos ? lerTabelaDePeriodos(req.body.periodos) : null
  if (lidos?.erro) return res.status(400).json({ erro: lidos.erro, campo: `periodo-${lidos.categoria}` })
  try {
    const [antes, periodosAntes] = await Promise.all([tabelaDeValores(), tabelaDePeriodos()])
    const periodos = lidos?.periodos ?? periodosAntes
    await gravarConfiguracao(CHAVE_VALORES, lido.tabela, req.dono.sub)
    if (temPeriodos) await gravarConfiguracao(CHAVE_PERIODOS, periodos, req.dono.sub)
    /* o historico diz o que mudou: "Almoço: R$ 41,50 -> R$ 45,00",
       "Refeição: do dia 1 ao último dia do mês -> do dia 26 ao dia 25..." */
    const mudancas = [...new Set([...Object.keys(antes), ...Object.keys(lido.tabela)])]
      .filter((tipo) => antes[tipo] !== lido.tabela[tipo])
      .map((tipo) => {
        const de = antes[tipo] === undefined ? 'digitado' : reais(antes[tipo])
        const para = lido.tabela[tipo] === undefined ? 'digitado' : reais(lido.tabela[tipo])
        return `${rotuloDoTipo(tipo)}: ${de} -> ${para}`
      })
    CHAVES_CATEGORIA.forEach((categoria) => {
      const de = inicioDoPeriodo(categoria, periodosAntes)
      const para = inicioDoPeriodo(categoria, periodos)
      if (de === para) return
      const [era, ficou] = [de, para].map((dia) => descreverPeriodo(dia).toLowerCase())
      mudancas.push(`${rotuloDaCategoria(categoria)}: ${era} -> ${ficou}`)
    })
    if (mudancas.length) {
      await registrarAtividade(req, {
        acao: 'despesa.valores',
        categoria: 'despesa',
        entidade: ['configuracao', CHAVE_VALORES],
        descricao: 'Valores pré-definidos do reembolso alterados',
        detalhes: { mudancas: mudancas.join('; ') },
      })
    }
    return res.json({ valores: lido.tabela, periodos })
  } catch (erro) {
    return falhou(erro, res, 'despesas/valores-salvar')
  }
})

/** Tabela que ainda nao existe vira recado com o arquivo certo, nao 500. */
function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro:
        'O banco ainda não tem as tabelas de despesas. Rode db/atualizacao-8.sql.txt e ' +
        'db/atualizacao-10.sql.txt (ou, de uma vez: npm run db:atualizar) e suba a API de novo.',
    })
  }
  return tratar(erro, res, onde)
}

/** Recusa com o campo que causou, para a tela acender o campo certo. */
const recusa = (res, campo, erro, status = 400) => res.status(status).json({ erro, campo })

/* ------------------------------------------------------------
   Datas

   Tudo em 'AAAA-MM-DD', comparado como texto — nessa forma a ordem
   alfabetica e a cronologica. "Hoje" e o do Brasil, e nao o do
   servidor: na Vercel o relogio e UTC, e as 21h de Sao Paulo ja
   seriam amanha, recusando a despesa do proprio dia como futura.
   ------------------------------------------------------------ */

const FUSO = 'America/Sao_Paulo'

function hojeNoBrasil() {
  /* en-CA escreve a data como AAAA-MM-DD */
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** '2026-02-30' nao passa: a data tem de existir no calendario. */
function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [ano, mes, dia] = valor.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

const DATA_MINIMA = '2000-01-01'

const mesValido = (mes) => /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes >= '2000-01' && mes <= '2100-12'

/**
 * O mes mais adiante que ja comecou, entre as categorias pedidas: em
 * 28/10, com a refeicao comecando no dia 26, e novembro — e a tela deixa
 * andar ate ele.
 */
function ultimoMes(periodos, categoria) {
  const hoje = hojeNoBrasil()
  return (categoria ? [categoria] : CHAVES_CATEGORIA)
    .map((c) => mesDoPeriodo(hoje, inicioDoPeriodo(c, periodos)))
    .sort()
    .pop()
}

/* ------------------------------------------------------------
   O comprovante

   Chega como data URL, do mesmo jeito que os anexos da obra. Aqui
   ele e conferido de verdade — a tela confere antes, mas quem chama
   a API na mao passa por cima da tela:

     - o nome tem uma extensao da lista aceita (imagem, PDF, ZIP,
       documento — ver ANEXO_EXTENSOES);
     - o conteudo e mesmo um data URL em base64, e nao lixo;
     - o arquivo DECODIFICADO cabe no teto de 3 MB.
   ------------------------------------------------------------ */

function lerAnexo(bruto) {
  if (!bruto || typeof bruto !== 'object') return { erro: 'Anexe o comprovante da despesa.' }

  /* so o nome do arquivo, sem caminho: "C:\fakepath\nota.pdf" vira "nota.pdf" */
  const nome = texto(bruto.nome).split(/[\\/]/).pop().slice(0, 255)
  const conteudo = String(bruto.conteudo ?? '')

  if (!nome || !conteudo) return { erro: 'Anexe o comprovante da despesa.' }
  if (!anexoAceito(nome)) {
    return {
      erro: 'Tipo de arquivo não aceito. Envie imagem, PDF, ZIP, RAR, 7Z ou documento (Word, Excel, TXT, CSV, XML).',
    }
  }

  const cabecalho = /^data:([\w.+-]+\/[\w.+-]+)?((?:;[\w.+-]+=[^;,]*)*);base64,/i.exec(conteudo)
  if (!cabecalho) return { erro: 'O arquivo chegou corrompido. Escolha de novo e reenvie.' }

  const base64 = conteudo.slice(cabecalho[0].length)
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    return { erro: 'O arquivo chegou corrompido. Escolha de novo e reenvie.' }
  }

  const sobra = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const bytes = (base64.length / 4) * 3 - sobra
  if (bytes <= 0) return { erro: 'O arquivo está vazio.' }
  if (bytes > ANEXO_BYTES_MAXIMOS) return { erro: 'O arquivo passa de 3 MB. Envie um menor.' }

  return {
    anexo: {
      nome,
      tipo: (cabecalho[1] || texto(bruto.tipo) || 'application/octet-stream').slice(0, 120),
      tamanho: bytes,
      conteudo,
    },
  }
}

/* ------------------------------------------------------------
   De quem sao os envios que a chamada pediu

   ?usuarios=           (vazio)  so os meus
   ?usuarios=todos               a equipe inteira
   ?usuarios=4,9,12              essas pessoas

   Qualquer coisa alem de "so eu" exige a permissao. Pedir a si
   mesmo pela lista (`?usuarios=7`, sendo o 7) continua livre.

   Devolve `ids` (null = todos) ou ja respondeu a recusa.
   ------------------------------------------------------------ */

async function escopoDaConsulta(req, res) {
  const eu = Number(req.dono.sub)
  /* o `exige` da rota ja leu o setor; so le de novo se nao leu */
  const cargo = req.cargo ?? (await meuCargo(eu))
  const revisor = cargoPode(cargo, PERMISSAO_REVISAR)
  const bruto = texto(req.query.usuarios)

  let ids
  if (!bruto) {
    ids = [eu]
  } else if (bruto === 'todos') {
    ids = null
  } else {
    const partes = bruto.split(',').map((p) => p.trim()).filter(Boolean)
    if (partes.length === 0 || partes.length > 500 || partes.some((p) => !/^\d{1,15}$/.test(p))) {
      res.status(400).json({ erro: 'Filtro de usuários inválido.' })
      return null
    }
    ids = [...new Set(partes.map(Number))]
  }

  const soEu = ids !== null && ids.length === 1 && ids[0] === eu
  if (!soEu && !revisor) {
    res.status(403).json({ erro: 'Você só pode ver os seus próprios envios.' })
    return null
  }

  return { ids, revisor }
}

/**
 * `?categoria=despesa|refeicao|bonus` — vazio (ou `todos`) e tudo.
 * Devolve a categoria, null para "todas", ou `false` se ja recusou.
 */
function categoriaDaConsulta(req, res) {
  const bruto = texto(req.query.categoria)
  if (!bruto || bruto === 'todos') return null
  if (!CHAVES_CATEGORIA.includes(bruto)) {
    res.status(400).json({ erro: 'Tipo de envio inválido.' })
    return false
  }
  return bruto
}

/**
 * O WHERE das leituras: de quando, de quem e de que tipo.
 *
 *   meses  ['AAAA-MM', 'AAAA-MM'], do primeiro ao ultimo, os dois
 *          inclusive — cada categoria no periodo DELA (as que comecam
 *          no mesmo dia dividem o recorte). null = desde sempre.
 */
function recorte({ ids, categoria, periodos, meses }) {
  const params = []
  const p = (valor) => {
    params.push(valor)
    return `$${params.length}`
  }
  const partes = []
  if (meses) {
    const porDia = new Map()
    for (const c of categoria ? [categoria] : CHAVES_CATEGORIA) {
      const dia = inicioDoPeriodo(c, periodos)
      porDia.set(dia, [...(porDia.get(dia) ?? []), c])
    }
    const pedacos = [...porDia].map(
      ([dia, categorias]) =>
        `(e.categoria = ANY(${p(categorias)}::text[]) AND e.data >= ${p(periodoDoMes(meses[0], dia).de)}::date ` +
        `AND e.data <= ${p(periodoDoMes(meses[1], dia).ate)}::date)`,
    )
    partes.push(`(${pedacos.join(' OR ')})`)
  } else if (categoria) {
    partes.push(`e.categoria = ${p(categoria)}`)
  }
  if (ids !== null) partes.push(`e.usuario_id = ANY(${p(ids)}::bigint[])`)
  return { onde: partes.length ? `WHERE ${partes.join(' AND ')}` : '', params }
}

/**
 * O mes (1 a 12) do periodo de cada envio, para a visao anual: com a
 * refeicao comecando no dia 26, a de 28/12 e de janeiro. Os parametros
 * dela entram numa COPIA de `params` — as consultas que nao leem o mes
 * seguem sem eles, porque o Postgres recusa parametro que nao e lido.
 */
function mesDoEnvio(periodos, params) {
  const todos = [...params]
  const p = (valor) => {
    todos.push(valor)
    return `$${todos.length}`
  }
  const casos = CHAVES_CATEGORIA.filter((c) => inicioDoPeriodo(c, periodos) > 1).map(
    (c) =>
      `WHEN e.categoria = ${p(c)} AND extract(day FROM e.data) >= ${p(inicioDoPeriodo(c, periodos))} ` +
      `THEN extract(month FROM e.data + interval '1 month')::int`,
  )
  const doCalendario = 'extract(month FROM e.data)::int'
  return { sql: casos.length ? `CASE ${casos.join(' ')} ELSE ${doCalendario} END` : doCalendario, params: todos }
}

/* ------------------------------------------------------------
   O envio como a tela recebe
   ------------------------------------------------------------ */

const paraEnvio = (l) => ({
  id: String(l.id),
  categoria: l.categoria,
  tipo: l.tipo,
  data: String(l.data).slice(0, 10),
  valor: Number(l.valor),
  justificativa: l.justificativa ?? '',
  observacao: l.observacao ?? '',
  usuarioId: String(l.usuario_id),
  usuarioNome: l.usuario_nome ?? '',
  /* setor e cargo de HOJE da pessoa — so a planilha usa */
  usuarioSetor: l.usuario_setor ?? '',
  usuarioCargo: l.usuario_cargo ?? '',
  /* sem obra (enviado sem, ou excluida depois): null. O cliente vem
     da obra quando ha obra, e do proprio envio quando nao ha */
  obraId: l.obra_id === null || l.obra_id === undefined ? null : String(l.obra_id),
  obraProposta: l.obra_proposta ?? '',
  obraDescricao: l.obra_descricao ?? '',
  obraConcluida: Boolean(l.obra_concluida_em),
  clienteId: l.cliente_id === null || l.cliente_id === undefined ? null : String(l.cliente_id),
  /* o envio que veio da planilha do SharePoint (atualizacao 24) com um
     cliente que nao esta no cadastro: vale o que a pessoa escreveu */
  clienteNome: l.cliente_nome ?? l.cliente_texto ?? '',
  clienteCidade: l.cliente_cidade ?? '',
  clienteEstado: l.cliente_estado ?? '',
  /* o "Cliente/Obra" como estava na planilha; vazio no envio do sistema */
  clienteTexto: l.cliente_texto ?? '',
  criadoEm: l.criado_em,
  /* so nome e tamanho: o arquivo vem em /anexos/:id, no clique */
  anexos: (l.anexos ?? []).map((a) => ({
    id: String(a.id),
    nome: a.nome,
    tipo: a.tipo ?? '',
    tamanho: a.tamanho ?? 0,
  })),
})

const CONSULTA_ENVIOS = `
  SELECT e.id, e.categoria, e.tipo, e.data, e.valor, e.justificativa, e.observacao,
         e.criado_em, e.usuario_id, u.name AS usuario_nome,
         s.nome AS usuario_setor, coalesce(t.nome, u.cargo_titulo) AS usuario_cargo,
         e.obra_id, o.proposta AS obra_proposta, o.descricao AS obra_descricao,
         o.concluida_em AS obra_concluida_em,
         c.id AS cliente_id, c.nome AS cliente_nome, c.cidade AS cliente_cidade, c.estado AS cliente_estado,
         e.cliente_texto,
         (SELECT coalesce(json_agg(json_build_object(
                   'id', a.id, 'nome', a.nome, 'tipo', a.tipo, 'tamanho', a.tamanho
                 ) ORDER BY a.id), '[]'::json)
            FROM despesa_anexo a WHERE a.envio_id = e.id) AS anexos
    FROM despesa_envio e
    JOIN usuario u           ON u.id = e.usuario_id
    LEFT JOIN cargo s        ON s.id = u.cargo_id
    LEFT JOIN cargo_titulo t ON t.id = u.cargo_titulo_id
    LEFT JOIN obra o         ON o.id = e.obra_id
    LEFT JOIN cliente c ON c.id = coalesce(o.cliente_id, e.cliente_id)`

const soma = (l) => ({ total: Number(l?.total ?? 0), quantidade: Number(l?.quantidade ?? 0) })

/**
 * A planilha do reembolso no SharePoint (server/sharepoint.js):
 * 02 - Reembolso / Reembolso - Atmosfera LWN.xlsx, com TODOS os envios,
 * nas mesmas abas do "Exportar para o Excel" (src/domain/planilhaReembolso.js),
 * trocada a cada envio e a cada exclusao. O banco continua sendo a fonte:
 * o arquivo e a copia para abrir e filtrar no Excel.
 *
 * Nunca derruba quem chamou: se o arquivo estiver travado (alguem com ele
 * aberto no Excel do computador) ou o SharePoint nao responder, fica no
 * log, e a proxima mudanca grava de novo. Devolve o endereco, ou null.
 */
export async function atualizarPlanilhaNoSharePoint() {
  if (!sharepointConfigurado()) return null
  try {
    const { rows } = await query(`${CONSULTA_ENVIOS} ORDER BY e.data DESC, e.criado_em DESC, e.id DESC`)
    /* como a tela recebe: datas em texto (o JSON da API) */
    const envios = JSON.parse(JSON.stringify(rows.map(paraEnvio)))
    const abas = abasDaPlanilha(envios)
    if (abas.length === 0) return null
    return await guardarPlanilhaDoReembolso(Buffer.from(montarPlanilha(abas)))
  } catch (erro) {
    logger.error('despesas/planilha-sharepoint', erro.message)
    return null
  }
}

/* ============================================================
   ENVIAR
   ============================================================ */

router.post('/envios', exigeSessao, exige(PERMISSAO_ENVIAR), async (req, res) => {
  const corpo = req.body ?? {}
  const categoria = texto(corpo.categoria)
  const tipo = texto(corpo.tipo)
  const data = texto(corpo.data)
  const clienteId = texto(corpo.clienteId)
  const obraId = texto(corpo.obraId)

  if (!CHAVES_CATEGORIA.includes(categoria)) {
    return recusa(res, 'categoria', 'Tipo de envio inválido.')
  }

  /* ---- data ---- */
  if (!data) return recusa(res, 'data', 'Informe a data.')
  if (!dataValida(data) || data < DATA_MINIMA) return recusa(res, 'data', 'Data inválida.')
  if (data > hojeNoBrasil()) return recusa(res, 'data', 'A data não pode ser no futuro.')

  /* ---- tipo ---- */
  const nomeDoTipo = { despesa: 'despesa', refeicao: 'refeição', bonus: 'bônus' }[categoria]
  if (!tipo) return recusa(res, 'tipo', `Escolha o tipo de ${nomeDoTipo}.`)
  if (!tipoValido(categoria, tipo)) return recusa(res, 'tipo', `Tipo de ${nomeDoTipo} inválido.`)

  /* ---- cliente (obrigatorio) e obra (opcional) ---- */
  if (!clienteId) return recusa(res, 'clienteId', 'Escolha o cliente.')
  if (!/^\d{1,15}$/.test(clienteId)) return recusa(res, 'clienteId', 'Cliente inválido.')
  if (obraId && !/^\d{1,15}$/.test(obraId)) return recusa(res, 'obraId', 'Obra inválida.')

  /* ---- valor ----
     Tipo com valor pre-definido grava o numero da casa (a tabela do
     banco), e o que vier no pedido nao conta: e isso que torna o campo
     travado da tela uma regra, e nao so uma sugestao. */
  let fixo
  try {
    fixo = valorFixo(tipo, await tabelaDeValores())
  } catch (erro) {
    return falhou(erro, res, 'despesas/valores-envio')
  }
  let valor = fixo
  if (fixo === null) {
    if (corpo.valor === undefined || corpo.valor === null || texto(corpo.valor) === '') {
      return recusa(res, 'valor', 'Informe o valor.')
    }
    valor = lerValor(corpo.valor)
    if (valor === null) {
      return recusa(res, 'valor', 'Valor inválido. Use só números, com até duas casas decimais.')
    }
    if (valor <= 0) return recusa(res, 'valor', 'O valor precisa ser maior que zero.')
    if (valor > VALOR_MAXIMO) return recusa(res, 'valor', 'O valor passa do limite de R$ 100.000,00 por envio.')
  }

  /* ---- textos livres ---- */
  const justificativa = tipo === 'outros' ? texto(corpo.justificativa) : ''
  if (justificativa.length > JUSTIFICATIVA_MAXIMA) {
    return recusa(res, 'justificativa', `A justificativa passa de ${JUSTIFICATIVA_MAXIMA} caracteres.`)
  }
  const observacao = texto(corpo.observacao)
  if (observacao.length > OBSERVACAO_MAXIMA) {
    return recusa(res, 'observacao', `A observação passa de ${OBSERVACAO_MAXIMA} caracteres.`)
  }

  /* ---- comprovante: so na despesa. Obrigatorio no combustivel e no
     "outros"; nos transportes, vai se a pessoa anexar ---- */
  let anexo = null
  if (categoria === 'despesa' && (comprovanteObrigatorio(tipo) || corpo.anexo)) {
    const lido = lerAnexo(corpo.anexo)
    if (lido.erro) return recusa(res, 'anexo', lido.erro)
    anexo = lido.anexo
  }

  try {
    const cliente = await query('SELECT nome FROM cliente WHERE id = $1', [clienteId])
    if (!cliente.rows[0]) {
      return recusa(res, 'clienteId', 'O cliente escolhido não existe mais. Escolha outro.')
    }

    /* a obra, quando vem, tem de ser DESSE cliente — senao o envio
       diria um cliente e a obra, outro */
    if (obraId) {
      const obra = await query('SELECT cliente_id FROM obra WHERE id = $1', [obraId])
      if (!obra.rows[0]) {
        return recusa(res, 'obraId', 'A obra escolhida não existe mais. Escolha outra.')
      }
      if (String(obra.rows[0].cliente_id) !== clienteId) {
        return recusa(res, 'obraId', 'Essa obra não é do cliente escolhido.')
      }
    }

    /* O envio e o comprovante numa instrucao SO. Uma instrucao e
       atomica no Postgres: ou os dois entram, ou nenhum — nunca fica
       despesa sem o comprovante que ela exige. */
    const { rows } = await query(
      `WITH envio AS (
         INSERT INTO despesa_envio
                (usuario_id, cliente_id, obra_id, categoria, tipo, data, valor, justificativa, observacao)
         VALUES ($1, $13, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, criado_em, valor
       ), anexo AS (
         INSERT INTO despesa_anexo (envio_id, nome, tipo, tamanho, conteudo)
         SELECT envio.id, $9, $10, $11, $12 FROM envio WHERE $12::text IS NOT NULL
         RETURNING id
       )
       SELECT envio.id, envio.criado_em, envio.valor, (SELECT id FROM anexo) AS anexo_id FROM envio`,
      [
        req.dono.sub,
        obraId || null,
        categoria,
        tipo,
        data,
        valor.toFixed(2),
        justificativa || null,
        observacao || null,
        anexo?.nome ?? null,
        anexo?.tipo ?? null,
        anexo?.tamanho ?? null,
        anexo?.conteudo ?? null,
        clienteId,
      ],
    )

    await registrarAtividade(req, {
      acao: `${categoria}.enviado`,
      categoria: 'despesa',
      entidade: ['despesa_envio', rows[0].id],
      descricao: { despesa: 'Despesa enviada', refeicao: 'Refeição enviada', bonus: 'Bônus enviado' }[categoria],
      detalhes: {
        tipo: rotuloDoTipo(tipo),
        ...(obraId ? await descreverObra(obraId) : { cliente: cliente.rows[0].nome }),
        valor: reais(Number(rows[0].valor)),
        data: data.split('-').reverse().join('/'),
        comprovante: anexo?.nome ?? null,
      },
    })

    /* a copia no SharePoint ja sai com o envio novo */
    await atualizarPlanilhaNoSharePoint()
    return res.status(201).json({
      id: String(rows[0].id),
      criadoEm: rows[0].criado_em,
      valor: Number(rows[0].valor),
      anexoId: rows[0].anexo_id === null ? null : String(rows[0].anexo_id),
    })
  } catch (erro) {
    /* o cliente ou a obra sumiu entre a conferencia e a gravacao */
    if (erro.code === '23503') {
      return String(erro.constraint ?? '').includes('cliente')
        ? recusa(res, 'clienteId', 'O cliente escolhido não existe mais. Escolha outro.')
        : recusa(res, 'obraId', 'A obra escolhida não existe mais. Escolha outra.')
    }
    if (erro.code === '23514') {
      return res.status(400).json({ erro: 'Algum campo não passou na conferência do banco. Revise e envie de novo.' })
    }
    return falhou(erro, res, 'despesas/enviar')
  }
})

/* ============================================================
   EXCLUIR um lancamento

   So com `excluir_despesas`. O alcance e o mesmo do que a pessoa
   enxerga: os proprios envios sempre; os dos outros so se ela tambem
   revisa. Envio de outra pessoa, para quem nao revisa, "nao existe"
   (404) — do mesmo jeito que o comprovante.

   O comprovante vai junto (ON DELETE CASCADE em despesa_anexo). O
   Historico guarda o que foi excluido — tipo, valor, data e de quem
   era —, porque registro de dinheiro que some sem rastro nenhum e o
   tipo de coisa que alguem vai precisar explicar depois.
   ============================================================ */

router.delete('/envios/:id', exigeSessao, exige(PERMISSAO_EXCLUIR), async (req, res) => {
  const id = texto(req.params.id)
  const naoAchou = () => res.status(404).json({ erro: 'Lançamento não encontrado. Ele pode já ter sido excluído.' })
  if (!/^\d{1,15}$/.test(id)) return naoAchou()

  try {
    const { rows } = await query(
      `SELECT e.id, e.usuario_id, e.categoria, e.tipo, e.data, e.valor, e.obra_id,
              u.name AS usuario_nome, c.nome AS cliente_nome
         FROM despesa_envio e
         JOIN usuario u      ON u.id = e.usuario_id
         LEFT JOIN cliente c ON c.id = e.cliente_id
        WHERE e.id = $1`,
      [id],
    )
    const envio = rows[0]
    if (!envio) return naoAchou()

    const meu = Number(envio.usuario_id) === Number(req.dono.sub)
    if (!meu && !cargoPode(req.cargo, PERMISSAO_REVISAR)) return naoAchou()

    /* o nome da obra e lido ANTES: depois do DELETE nao ha mais o que ler */
    const obra = envio.obra_id ? await descreverObra(envio.obra_id) : { cliente: envio.cliente_nome }

    const { rowCount } = await query('DELETE FROM despesa_envio WHERE id = $1', [id])
    if (rowCount === 0) return naoAchou()

    const nome = { despesa: 'Despesa', refeicao: 'Refeição', bonus: 'Bônus' }[envio.categoria]
    await registrarAtividade(req, {
      acao: `${envio.categoria}.excluido`,
      categoria: 'despesa',
      entidade: ['despesa_envio', envio.id],
      descricao: `${nome} excluíd${envio.categoria === 'bonus' ? 'o' : 'a'}`,
      detalhes: {
        tipo: rotuloDoTipo(envio.tipo),
        de: meu ? null : envio.usuario_nome,
        ...obra,
        valor: reais(Number(envio.valor)),
        data: String(envio.data).slice(0, 10).split('-').reverse().join('/'),
      },
    })

    /* e sai sem o envio apagado */
    await atualizarPlanilhaNoSharePoint()
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'despesas/excluir')
  }
})

/* ============================================================
   MES — os envios, dia a dia
   ============================================================ */

router.get('/envios', exigeSessao, exige(PERMISSAO_VER), async (req, res) => {
  const pedido = texto(req.query.mes)
  if (pedido && !mesValido(pedido)) {
    return res.status(400).json({ erro: 'Mês inválido. Use AAAA-MM.' })
  }

  const categoria = categoriaDaConsulta(req, res)
  if (categoria === false) return undefined

  try {
    const escopo = await escopoDaConsulta(req, res)
    if (!escopo) return undefined

    const periodos = await tabelaDePeriodos()
    /* sem mes no pedido, o de hoje: o do calendario em "todos", e o do
       periodo quando ha uma categoria so */
    const mes =
      pedido ||
      (categoria ? mesDoPeriodo(hojeNoBrasil(), inicioDoPeriodo(categoria, periodos)) : hojeNoBrasil().slice(0, 7))
    const { onde, params } = recorte({ ids: escopo.ids, categoria, periodos, meses: [mes, mes] })

    const [envios, dias, categorias, pessoas, total] = await Promise.all([
      query(`${CONSULTA_ENVIOS} ${onde} ORDER BY e.data, e.criado_em, e.id`, params),
      query(
        `SELECT e.data, count(*)::int AS quantidade, sum(e.valor) AS total
           FROM despesa_envio e ${onde}
          GROUP BY e.data ORDER BY e.data`,
        params,
      ),
      query(
        `SELECT e.categoria, count(*)::int AS quantidade, sum(e.valor) AS total
           FROM despesa_envio e ${onde}
          GROUP BY e.categoria`,
        params,
      ),
      query(
        `SELECT e.usuario_id, u.name, count(*)::int AS quantidade, sum(e.valor) AS total
           FROM despesa_envio e JOIN usuario u ON u.id = e.usuario_id ${onde}
          GROUP BY e.usuario_id, u.name ORDER BY u.name`,
        params,
      ),
      query(
        `SELECT count(*)::int AS quantidade, coalesce(sum(e.valor), 0) AS total
           FROM despesa_envio e ${onde}`,
        params,
      ),
    ])

    return res.json({
      mes,
      ultimoMes: ultimoMes(periodos, categoria),
      periodos,
      revisor: escopo.revisor,
      envios: envios.rows.map(paraEnvio),
      dias: dias.rows.map((l) => ({ data: String(l.data).slice(0, 10), ...soma(l) })),
      categorias: Object.fromEntries(categorias.rows.map((l) => [l.categoria, soma(l)])),
      pessoas: pessoas.rows.map((l) => ({ usuarioId: String(l.usuario_id), nome: l.name, ...soma(l) })),
      ...soma(total.rows[0]),
    })
  } catch (erro) {
    return falhou(erro, res, 'despesas/mes')
  }
})

/* ============================================================
   ANO — mes a mes, e o total anual
   ============================================================ */

router.get('/resumo', exigeSessao, exige(PERMISSAO_VER), async (req, res) => {
  const ano = Number(texto(req.query.ano) || hojeNoBrasil().slice(0, 4))
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return res.status(400).json({ erro: 'Ano inválido.' })
  }

  const categoria = categoriaDaConsulta(req, res)
  if (categoria === false) return undefined

  try {
    const escopo = await escopoDaConsulta(req, res)
    if (!escopo) return undefined

    const periodos = await tabelaDePeriodos()
    const { onde, params } = recorte({ ids: escopo.ids, categoria, periodos, meses: [`${ano}-01`, `${ano}-12`] })
    const mesDe = mesDoEnvio(periodos, params)

    const [porMes, porMesCategoria, categorias, pessoas, total] = await Promise.all([
      query(
        `SELECT ${mesDe.sql} AS mes, count(*)::int AS quantidade, sum(e.valor) AS total
           FROM despesa_envio e ${onde}
          GROUP BY 1`,
        mesDe.params,
      ),
      query(
        `SELECT ${mesDe.sql} AS mes, e.categoria, count(*)::int AS quantidade, sum(e.valor) AS total
           FROM despesa_envio e ${onde}
          GROUP BY 1, 2`,
        mesDe.params,
      ),
      query(
        `SELECT e.categoria, count(*)::int AS quantidade, sum(e.valor) AS total
           FROM despesa_envio e ${onde}
          GROUP BY e.categoria`,
        params,
      ),
      query(
        `SELECT e.usuario_id, u.name, count(*)::int AS quantidade, sum(e.valor) AS total
           FROM despesa_envio e JOIN usuario u ON u.id = e.usuario_id ${onde}
          GROUP BY e.usuario_id, u.name ORDER BY u.name`,
        params,
      ),
      query(
        `SELECT count(*)::int AS quantidade, coalesce(sum(e.valor), 0) AS total
           FROM despesa_envio e ${onde}`,
        params,
      ),
    ])

    /* os doze meses sempre, mesmo os vazios: "marco: R$ 0,00" tambem e
       uma resposta, e um ano com buracos parece um ano com erro */
    const meses = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1
      const linha = porMes.rows.find((l) => Number(l.mes) === mes)
      return {
        mes,
        ...soma(linha),
        categorias: Object.fromEntries(
          porMesCategoria.rows
            .filter((l) => Number(l.mes) === mes)
            .map((l) => [l.categoria, soma(l)]),
        ),
      }
    })

    return res.json({
      ano,
      ultimoMes: ultimoMes(periodos, categoria),
      periodos,
      revisor: escopo.revisor,
      meses,
      categorias: Object.fromEntries(categorias.rows.map((l) => [l.categoria, soma(l)])),
      pessoas: pessoas.rows.map((l) => ({ usuarioId: String(l.usuario_id), nome: l.name, ...soma(l) })),
      ...soma(total.rows[0]),
    })
  } catch (erro) {
    return falhou(erro, res, 'despesas/ano')
  }
})

/* ============================================================
   EXPORTAR — a lista que vira planilha do Excel

     ?mes=AAAA-MM   o mes (o periodo de cada categoria)
     ?ano=AAAA      o ano inteiro
     (nenhum)       tudo o que ja foi enviado

   Mais os mesmos ?usuarios= e ?categoria= de /envios, com as mesmas
   travas (escopoDaConsulta): sem revisar, so os proprios.

   Volta os envios inteiros, sem o arquivo do comprovante (so o
   nome). Os totais a planilha soma por formula — quem abre o Excel
   ve a conta, e nao so o resultado.
   ============================================================ */

/** O periodo do pedido: os meses (null = tudo) e o nome dele, ou null se ja recusou. */
function periodoDaConsulta(req, res) {
  const mes = texto(req.query.mes)
  const ano = texto(req.query.ano)

  if (mes) {
    if (!mesValido(mes)) {
      res.status(400).json({ erro: 'Mês inválido. Use AAAA-MM.' })
      return null
    }
    return { tipo: 'mes', valor: mes, meses: [mes, mes] }
  }
  if (ano) {
    const n = Number(ano)
    if (!/^\d{4}$/.test(ano) || n < 2000 || n > 2100) {
      res.status(400).json({ erro: 'Ano inválido.' })
      return null
    }
    return { tipo: 'ano', valor: ano, meses: [`${ano}-01`, `${ano}-12`] }
  }
  return { tipo: 'tudo', valor: null, meses: null }
}

router.get('/exportar', exigeSessao, exige(PERMISSAO_VER), async (req, res) => {
  const periodo = periodoDaConsulta(req, res)
  if (!periodo) return undefined

  const categoria = categoriaDaConsulta(req, res)
  if (categoria === false) return undefined

  try {
    const escopo = await escopoDaConsulta(req, res)
    if (!escopo) return undefined

    const periodos = await tabelaDePeriodos()
    const { onde, params } = recorte({ ids: escopo.ids, categoria, periodos, meses: periodo.meses })
    const { rows } = await query(
      `${CONSULTA_ENVIOS} ${onde}
        ORDER BY lower(u.name), e.data, e.criado_em, e.id`,
      params,
    )

    return res.json({
      periodo: { tipo: periodo.tipo, valor: periodo.valor },
      revisor: escopo.revisor,
      envios: rows.map(paraEnvio),
    })
  } catch (erro) {
    return falhou(erro, res, 'despesas/exportar')
  }
})

/* ============================================================
   PAINEL — os graficos de despesa do Dashboard

     ?de=AAAA-MM-DD&ate=AAAA-MM-DD   (os dois inclusive)
     (nenhum)                         desde o primeiro envio

   Pede `ver_dashboard` (ver o topo do arquivo). Por isso a resposta
   e so de somas — uma linha por dia + categoria + tipo, com quantos
   envios e quanto deu. Nao ha pessoa, obra nem envio nenhum aqui.
   ============================================================ */

router.get('/painel', exigeSessao, exige(PERMISSAO_DASHBOARD), async (req, res) => {
  const de = texto(req.query.de) || DATA_MINIMA
  const ate = texto(req.query.ate) || '2100-12-31'
  if (!dataValida(de) || !dataValida(ate) || de > ate) {
    return res.status(400).json({ erro: 'Período inválido. Use AAAA-MM-DD.' })
  }

  try {
    const { rows } = await query(
      `SELECT e.data, e.categoria, e.tipo, count(*)::int AS quantidade, sum(e.valor) AS total
         FROM despesa_envio e
        WHERE e.data >= $1 AND e.data <= $2
        GROUP BY e.data, e.categoria, e.tipo
        ORDER BY e.data, e.categoria, e.tipo`,
      [de, ate],
    )
    return res.json({
      linhas: rows.map((l) => ({
        data: String(l.data).slice(0, 10),
        categoria: l.categoria,
        tipo: l.tipo,
        ...soma(l),
      })),
    })
  } catch (erro) {
    return falhou(erro, res, 'despesas/painel')
  }
})

/* ============================================================
   ENVIOS GERAIS — quem ja enviou alguma coisa

   A lista de pessoas da tela "Envios gerais". So entra quem tem pelo
   menos UM envio (despesa, refeicao ou bonus) — quem nunca enviou nada
   nao aparece, mesmo cadastrado. Pessoa desligada (inativa) com envio
   aparece: o historico dela continua valendo.

   So para quem tem `revisar_despesa_geral`, conferido aqui pelo
   `exige` — o mesmo 403 de qualquer outra rota protegida.
   ============================================================ */

router.get('/pessoas', exigeSessao, exige(PERMISSAO_REVISAR), async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.ativo,
              c.nome AS setor_nome, c.cor AS setor_cor,
              coalesce(t.nome, u.cargo_titulo) AS cargo_titulo,
              count(e.id)::int AS quantidade,
              sum(e.valor)     AS total,
              max(e.data)      AS ultimo_envio
         FROM despesa_envio e
         JOIN usuario u           ON u.id = e.usuario_id
         LEFT JOIN cargo c        ON c.id = u.cargo_id
         LEFT JOIN cargo_titulo t ON t.id = u.cargo_titulo_id
        GROUP BY u.id, u.name, u.email, u.ativo, c.nome, c.cor, t.nome, u.cargo_titulo
        ORDER BY lower(u.name)`,
    )
    return res.json({
      pessoas: rows.map((l) => ({
        usuarioId: String(l.id),
        nome: l.name,
        email: l.email ?? '',
        ativo: l.ativo,
        setor: l.setor_nome ?? '',
        setorCor: l.setor_cor ?? null,
        cargo: l.cargo_titulo ?? '',
        ultimoEnvio: l.ultimo_envio ? String(l.ultimo_envio).slice(0, 10) : null,
        ...soma(l),
      })),
    })
  } catch (erro) {
    return falhou(erro, res, 'despesas/pessoas')
  }
})

/* ============================================================
   O COMPROVANTE

   Do dono do envio, ou de quem revisa. Para qualquer outro, o anexo
   "nao existe" — 404, e nao 403, para o id nao servir de sonda.
   ============================================================ */

router.get('/anexos/:id', exigeSessao, exige(PERMISSAO_VER), async (req, res) => {
  const id = texto(req.params.id)
  const naoAchou = () => res.status(404).json({ erro: 'Anexo não encontrado.' })
  if (!/^\d{1,15}$/.test(id)) return naoAchou()

  try {
    const { rows } = await query(
      `SELECT a.nome, a.tipo, a.conteudo, e.usuario_id
         FROM despesa_anexo a JOIN despesa_envio e ON e.id = a.envio_id
        WHERE a.id = $1`,
      [id],
    )
    const anexo = rows[0]
    if (!anexo) return naoAchou()

    if (Number(anexo.usuario_id) !== Number(req.dono.sub) && !cargoPode(req.cargo, PERMISSAO_REVISAR)) {
      return naoAchou()
    }

    return res.json({ nome: anexo.nome, tipo: anexo.tipo ?? '', conteudo: anexo.conteudo })
  } catch (erro) {
    return falhou(erro, res, 'despesas/anexo')
  }
})

export default router
