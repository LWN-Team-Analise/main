import { Router } from 'express'
import { emTransacao, query } from '../db.js'
import { exige, exigeSessao, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'
import { logger } from '../logger.js'
import { anotar, estourou } from '../limite.js'
import { enviarComo, podeEnviar, podeLerCaixas, ultimoDoContato } from '../graph.js'
/* os funis, as etapas e os limites sao os MESMOS da tela: um arquivo so,
   sem React dentro, importado pelos dois lados */
import {
  EMAIL_CORPO_MAXIMO,
  ETIQUETAS,
  MOEDAS,
  TEXTO_MAXIMO,
  TIPOS_CONTATO,
  TITULO_MAXIMO,
  VALOR_MAXIMO,
  emailValido,
  etapaDoFunil,
  funilPorId,
  lerValor,
  rotuloDaEtapa,
} from '../../src/domain/comercial.js'

/* ============================================================
   COMERCIAL — /api/comercial

     GET    /negocios?funil=        os negocios (de um funil, ou de todos),
                                    com o estado do e-mail da Microsoft
     POST   /negocios               cria
     PUT    /negocios/:id           edita (inclusive troca de funil)
     PATCH  /negocios/:id/etapa     muda de etapa (o arrastar do quadro)
     PATCH  /negocios/:id/status    ganho, perdido ou reaberto
     DELETE /negocios/:id           apaga de vez
     POST   /negocios/importar      varios de uma vez (planilha exportada
                                    do Pipedrive, ja lida pela tela)
     GET    /negocios/:id/emails    os e-mails mandados pelo site e o
                                    ultimo que o contato mandou
     POST   /negocios/:id/email     manda o e-mail ao contato, saindo da
                                    caixa do Outlook de quem esta logado
     POST   /emails/conferir        atualiza o "Responder?" dos cartoes
                                    (quais contatos esperam resposta)
     GET    /resumo-clientes        negocios ganhos, abertos e ticket
                                    medio de cada cliente (aba Clientes)
     GET    /contatos               todos os contatos (cliente_pessoa), de
                                    qualquer empresa ou de nenhuma
     POST   /contatos               cria um contato (o "Adicionar contato"
                                    do negocio)

   Quem pode o que — conferido AQUI, a cada chamada:

     ver_comercial     ver a aba e os negocios;
     editar_negocios   criar, editar, mover, ganhar, perder, importar;
     excluir_negocios  apagar;
     responder_emails  mandar e-mail ao contato pelo site.

   O "Responder?" manda pela API da Microsoft com a permissao de
   aplicativo Mail.Send — a mesma dos avisos do sistema —, so que pela
   caixa da PROPRIA pessoa (server/graph.js, enviarComo). Saber quais
   e-mails esperam resposta exige ler a caixa (Mail.Read); sem ela, o
   botao aparece em todo negocio com e-mail de contato e o envio sai
   como e-mail novo.
   ============================================================ */

const router = Router()

const VER = 'ver_comercial'
const EDITAR = 'editar_negocios'
const EXCLUIR = 'excluir_negocios'
const RESPONDER = 'responder_emails'

/* um envio por pessoa a cada ~2 minutos, em media: freia script e engano,
   nao o trabalho do dia */
const EMAILS_POR_HORA = 30
const IMPORTAR_MAXIMO = 3000

const texto = (valor) => String(valor ?? '').trim()
const idOuNulo = (valor) => {
  const t = texto(valor)
  return /^\d{1,15}$/.test(t) ? t : null
}

function dataOuNula(valor) {
  const t = texto(valor).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const d = new Date(`${t}T12:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? null : t
}

const soData = (valor) => {
  if (!valor) return null
  if (valor instanceof Date) {
    const p = (n) => String(n).padStart(2, '0')
    return `${valor.getFullYear()}-${p(valor.getMonth() + 1)}-${p(valor.getDate())}`
  }
  return String(valor).slice(0, 10)
}

/** Tabela ou coluna que ainda nao existe (falta rodar uma atualizacao) vira recado, nao 500. */
function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro:
        'O banco ainda não está atualizado para o Comercial (atualizações 27 a 29 em core/db). ' +
        'Rode npm run db:atualizar e suba a API de novo.',
    })
  }
  if (erro.code === '23503') {
    return res.status(400).json({ erro: 'O cliente, a pessoa ou o responsável escolhido não existe mais.' })
  }
  return tratar(erro, res, onde)
}

const SELECT_NEGOCIO = `
  SELECT n.*, c.nome AS cliente_nome, u.name AS responsavel_nome,
         p.nome AS pessoa_nome, p.email AS pessoa_email, p.telefone AS pessoa_telefone
    FROM negocio n
    LEFT JOIN cliente c        ON c.id = n.cliente_id
    LEFT JOIN usuario u        ON u.id = n.responsavel_id
    LEFT JOIN cliente_pessoa p ON p.id = n.pessoa_id`

function paraNegocio(l) {
  return {
    id: String(l.id),
    funil: l.funil,
    etapa: l.etapa,
    titulo: l.titulo,
    clienteId: l.cliente_id === null ? null : String(l.cliente_id),
    /* o nome do cliente cadastrado manda; sem ele, o texto livre (a
       empresa da prospeccao, ou o cliente que foi apagado) */
    organizacao: l.cliente_nome ?? l.organizacao ?? '',
    pessoaId: l.pessoa_id === null ? null : String(l.pessoa_id),
    contatoNome: l.pessoa_nome ?? l.contato_nome ?? '',
    /* o e-mail escrito NO negocio vale primeiro; sem ele, o do contato */
    contatoEmail: l.contato_email ?? l.pessoa_email ?? '',
    contatoTipo: l.contato_tipo ?? null,
    contatoTelefone: l.pessoa_telefone ?? l.contato_telefone ?? '',
    valor: Number(l.valor ?? 0),
    moeda: l.moeda ?? 'BRL',
    probabilidade: l.probabilidade === null || l.probabilidade === undefined ? null : Number(l.probabilidade),
    responsavelId: l.responsavel_id === null ? null : String(l.responsavel_id),
    responsavelNome: l.responsavel_nome ?? '',
    etiqueta: l.etiqueta ?? null,
    proximaAtividade: soData(l.proxima_atividade),
    atividadeDescricao: l.atividade_descricao ?? '',
    previsaoFechamento: soData(l.previsao_fechamento),
    status: l.status,
    motivoPerda: l.motivo_perda ?? '',
    fechadoEm: l.fechado_em,
    observacao: l.observacao ?? '',
    email: {
      aguardando: Boolean(l.email_aguardando),
      assunto: l.email_assunto ?? '',
      recebidoEm: l.email_recebido_em,
      conferidoEm: l.email_conferido_em,
    },
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  }
}

async function lerUm(id) {
  const { rows } = await query(`${SELECT_NEGOCIO} WHERE n.id = $1`, [id])
  return rows[0] ? paraNegocio(rows[0]) : null
}

/** A caixa do Outlook de quem esta logado: a vinculada, ou o e-mail do cadastro. */
async function caixaDe(usuarioId) {
  const { rows } = await query(
    "SELECT coalesce(nullif(outlook_email, ''), email) AS caixa, name FROM usuario WHERE id = $1",
    [usuarioId],
  )
  return { caixa: texto(rows[0]?.caixa).toLowerCase() || null, nome: rows[0]?.name ?? '' }
}

/* ---------------- validacao ---------------- */

/**
 * Le e confere o corpo de criar/editar. Devolve { erro, campo } ou
 * { campos } ja no formato das colunas.
 */
async function lerNegocio(corpo, usuarioId) {
  const funil = funilPorId(texto(corpo?.funil))
  if (!funil) return { erro: 'Escolha o funil.', campo: 'funil' }

  const etapaId = texto(corpo?.etapa) || funil.etapas[0].id
  if (!etapaDoFunil(funil.id, etapaId)) return { erro: 'Essa etapa não existe neste funil.', campo: 'etapa' }

  const titulo = texto(corpo?.titulo)
  if (!titulo) return { erro: 'Dê um título ao negócio.', campo: 'titulo' }
  if (titulo.length > TITULO_MAXIMO) return { erro: `O título passa de ${TITULO_MAXIMO} letras.`, campo: 'titulo' }

  const clienteId = idOuNulo(corpo?.clienteId)
  let organizacao = texto(corpo?.organizacao).slice(0, TEXTO_MAXIMO) || null
  if (clienteId) {
    const { rows } = await query('SELECT nome FROM cliente WHERE id = $1', [clienteId])
    if (!rows[0]) return { erro: 'Esse cliente não existe mais.', campo: 'clienteId' }
    /* o nome vai junto: se o cliente for apagado um dia, o negocio
       continua dizendo de quem era */
    organizacao = rows[0].nome
  }
  if (!clienteId && !organizacao) {
    return { erro: 'Escolha o cliente ou escreva o nome da empresa.', campo: 'organizacao' }
  }

  /* o contato nao depende da organizacao (atualizacao 29): qualquer
     pessoa cadastrada serve, de qualquer empresa ou de nenhuma */
  const pessoaId = idOuNulo(corpo?.pessoaId)
  if (pessoaId) {
    const { rows } = await query('SELECT id FROM cliente_pessoa WHERE id = $1', [pessoaId])
    if (!rows[0]) return { erro: 'Esse contato não existe mais.', campo: 'pessoaId' }
  }

  const contatoEmail = texto(corpo?.contatoEmail).toLowerCase()
  if (contatoEmail && !emailValido(contatoEmail)) {
    return { erro: 'O e-mail do contato não parece certo.', campo: 'contatoEmail' }
  }

  const valor = lerValor(corpo?.valor)
  if (valor === null || valor > VALOR_MAXIMO) return { erro: 'Confira o valor do negócio.', campo: 'valor' }

  const moeda = texto(corpo?.moeda) || 'BRL'
  if (!MOEDAS.some((m) => m.id === moeda)) return { erro: 'Moeda desconhecida.', campo: 'moeda' }

  const prob = corpo?.probabilidade
  const probabilidade = prob === null || prob === undefined || prob === '' ? null : Number(prob)
  if (probabilidade !== null && !(Number.isInteger(probabilidade) && probabilidade >= 0 && probabilidade <= 100)) {
    return { erro: 'A probabilidade vai de 0 a 100%.', campo: 'probabilidade' }
  }

  const contatoTipo = texto(corpo?.contatoTipo) || null
  if (contatoTipo && !TIPOS_CONTATO.some((t) => t.id === contatoTipo)) {
    return { erro: 'O contato é comercial ou pessoal.', campo: 'contatoTipo' }
  }

  const etiqueta = texto(corpo?.etiqueta) || null
  if (etiqueta && !ETIQUETAS.some((e) => e.id === etiqueta)) return { erro: 'Etiqueta desconhecida.', campo: 'etiqueta' }

  for (const campo of ['proximaAtividade', 'previsaoFechamento']) {
    if (texto(corpo?.[campo]) && !dataOuNula(corpo[campo])) return { erro: 'Confira a data.', campo }
  }

  return {
    campos: {
      funil: funil.id,
      etapa: etapaId,
      titulo,
      cliente_id: clienteId,
      organizacao,
      pessoa_id: pessoaId,
      contato_nome: pessoaId ? null : texto(corpo?.contatoNome).slice(0, TEXTO_MAXIMO) || null,
      /* o e-mail fica no negocio mesmo com contato escolhido: e o campo
         "E-mail" do formulario, e e para ele que vai o "Responder?" */
      contato_email: contatoEmail || null,
      contato_telefone: pessoaId ? null : texto(corpo?.contatoTelefone).slice(0, 40) || null,
      contato_tipo: contatoTipo,
      valor,
      moeda,
      probabilidade,
      responsavel_id: idOuNulo(corpo?.responsavelId) ?? String(usuarioId),
      etiqueta,
      proxima_atividade: dataOuNula(corpo?.proximaAtividade),
      atividade_descricao: texto(corpo?.atividadeDescricao).slice(0, TEXTO_MAXIMO) || null,
      previsao_fechamento: dataOuNula(corpo?.previsaoFechamento),
      observacao: texto(corpo?.observacao).slice(0, 4000) || null,
    },
  }
}

/* ---------------- leitura ---------------- */

router.get('/negocios', exigeSessao, exige(VER), async (req, res) => {
  const funil = texto(req.query.funil)
  if (funil && !funilPorId(funil)) return res.status(400).json({ erro: 'Funil desconhecido.' })
  try {
    const { rows } = await query(
      `${SELECT_NEGOCIO} WHERE ($1::text IS NULL OR n.funil = $1) ORDER BY n.criado_em DESC`,
      [funil || null],
    )
    const [envio, leitura] = await Promise.all([podeEnviar(), podeLerCaixas()])
    const { caixa } = await caixaDe(req.dono.sub)
    return res.json({
      negocios: rows.map(paraNegocio),
      email: { envio, leitura, caixa },
    })
  } catch (erro) {
    return falhou(erro, res, 'comercial/listar')
  }
})

/* ---------------- gravacao ---------------- */

router.post('/negocios', exigeSessao, exige(EDITAR), async (req, res) => {
  try {
    const lido = await lerNegocio(req.body, req.dono.sub)
    if (lido.erro) return res.status(400).json(lido)
    const c = { ...lido.campos, criado_por: req.dono.sub }
    const colunas = Object.keys(c)
    const { rows } = await query(
      `INSERT INTO negocio (${colunas.join(', ')})
       VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(c),
    )
    const negocio = await lerUm(rows[0].id)
    await registrarAtividade(req, {
      acao: 'negocio.criado',
      categoria: 'comercial',
      entidade: ['negocio', negocio.id],
      descricao: 'Novo negócio no Comercial',
      detalhes: {
        negocio: negocio.titulo,
        cliente: negocio.organizacao,
        funil: funilPorId(negocio.funil)?.rotulo,
        etapa: rotuloDaEtapa(negocio.funil, negocio.etapa),
      },
    })
    return res.status(201).json({ negocio })
  } catch (erro) {
    return falhou(erro, res, 'comercial/criar')
  }
})

router.put('/negocios/:id', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idOuNulo(req.params.id)) return res.status(400).json({ erro: 'Negócio inválido.' })
  try {
    const lido = await lerNegocio(req.body, req.dono.sub)
    if (lido.erro) return res.status(400).json(lido)
    const c = lido.campos
    const colunas = Object.keys(c)
    const { rowCount } = await query(
      `UPDATE negocio SET ${colunas.map((col, i) => `${col} = $${i + 1}`).join(', ')}, atualizado_em = now()
        WHERE id = $${colunas.length + 1}`,
      [...Object.values(c), req.params.id],
    )
    if (!rowCount) return res.status(404).json({ erro: 'Negócio não encontrado.' })
    const negocio = await lerUm(req.params.id)
    await registrarAtividade(req, {
      acao: 'negocio.editado',
      categoria: 'comercial',
      entidade: ['negocio', negocio.id],
      descricao: 'Negócio editado',
      detalhes: { negocio: negocio.titulo, cliente: negocio.organizacao },
    })
    return res.json({ negocio })
  } catch (erro) {
    return falhou(erro, res, 'comercial/editar')
  }
})

/** O arrastar do quadro: so a etapa (e, se vier, o funil). */
router.patch('/negocios/:id/etapa', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idOuNulo(req.params.id)) return res.status(400).json({ erro: 'Negócio inválido.' })
  try {
    const atual = await lerUm(req.params.id)
    if (!atual) return res.status(404).json({ erro: 'Negócio não encontrado.' })
    const funil = texto(req.body?.funil) || atual.funil
    const etapa = texto(req.body?.etapa)
    if (!etapaDoFunil(funil, etapa)) return res.status(400).json({ erro: 'Essa etapa não existe neste funil.' })
    if (funil === atual.funil && etapa === atual.etapa) return res.json({ negocio: atual })

    await query('UPDATE negocio SET funil = $1, etapa = $2, atualizado_em = now() WHERE id = $3', [
      funil,
      etapa,
      req.params.id,
    ])
    const negocio = await lerUm(req.params.id)
    await registrarAtividade(req, {
      acao: 'negocio.etapa',
      categoria: 'comercial',
      entidade: ['negocio', negocio.id],
      descricao: 'Negócio mudou de etapa',
      detalhes: {
        negocio: negocio.titulo,
        de: rotuloDaEtapa(atual.funil, atual.etapa),
        para: rotuloDaEtapa(funil, etapa),
      },
    })
    return res.json({ negocio })
  } catch (erro) {
    return falhou(erro, res, 'comercial/etapa')
  }
})

router.patch('/negocios/:id/status', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idOuNulo(req.params.id)) return res.status(400).json({ erro: 'Negócio inválido.' })
  const status = texto(req.body?.status)
  if (!['aberto', 'ganho', 'perdido'].includes(status)) return res.status(400).json({ erro: 'Situação inválida.' })
  const motivo = status === 'perdido' ? texto(req.body?.motivo).slice(0, TEXTO_MAXIMO) || null : null
  try {
    const { rowCount } = await query(
      `UPDATE negocio
          SET status = $1, motivo_perda = $2,
              fechado_em = CASE WHEN $1 = 'aberto' THEN NULL ELSE now() END,
              atualizado_em = now()
        WHERE id = $3`,
      [status, motivo, req.params.id],
    )
    if (!rowCount) return res.status(404).json({ erro: 'Negócio não encontrado.' })
    const negocio = await lerUm(req.params.id)
    const frase = { aberto: 'Negócio reaberto', ganho: 'Negócio ganho', perdido: 'Negócio perdido' }[status]
    await registrarAtividade(req, {
      acao: `negocio.${status}`,
      categoria: 'comercial',
      entidade: ['negocio', negocio.id],
      descricao: frase,
      detalhes: { negocio: negocio.titulo, cliente: negocio.organizacao, motivo },
    })
    return res.json({ negocio })
  } catch (erro) {
    return falhou(erro, res, 'comercial/status')
  }
})

router.delete('/negocios/:id', exigeSessao, exige(EXCLUIR), async (req, res) => {
  if (!idOuNulo(req.params.id)) return res.status(400).json({ erro: 'Negócio inválido.' })
  try {
    const { rows } = await query('DELETE FROM negocio WHERE id = $1 RETURNING titulo, organizacao', [req.params.id])
    if (!rows[0]) return res.status(404).json({ erro: 'Negócio não encontrado.' })
    await registrarAtividade(req, {
      acao: 'negocio.excluido',
      categoria: 'comercial',
      entidade: ['negocio', req.params.id],
      descricao: 'Negócio excluído',
      detalhes: { negocio: rows[0].titulo, cliente: rows[0].organizacao },
    })
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'comercial/apagar')
  }
})

/* ---------------- importacao ---------------- */

/** "Negociação/Aprovação Interna" e "negociacao aprovacao interna" sao a mesma coisa. */
const normal = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function statusDoTexto(t) {
  const n = normal(t)
  if (/^(ganho|ganha|won|vendido|fechado ganho)/.test(n)) return 'ganho'
  if (/^(perdido|perdida|lost)/.test(n)) return 'perdido'
  return 'aberto'
}

/**
 * Varios negocios de uma vez. A TELA le a planilha (o .xlsx ou .csv
 * exportado do Pipedrive) e manda as linhas ja com nomes de campo
 * nossos; aqui cada linha acha a etapa pelo nome, o cliente pelo nome
 * da empresa e o responsavel pelo nome ou e-mail. O que nao casa nao
 * trava a importacao: a etapa cai na primeira do funil, a empresa
 * entra como texto e o responsavel vira quem importou.
 */
router.post('/negocios/importar', exigeSessao, exige(EDITAR), async (req, res) => {
  const funil = funilPorId(texto(req.body?.funil))
  if (!funil) return res.status(400).json({ erro: 'Escolha o funil de destino.' })
  const linhas = Array.isArray(req.body?.linhas) ? req.body.linhas : []
  if (linhas.length === 0) return res.status(400).json({ erro: 'A planilha não tem nenhuma linha.' })
  if (linhas.length > IMPORTAR_MAXIMO) {
    return res.status(400).json({ erro: `No máximo ${IMPORTAR_MAXIMO} negócios por vez.` })
  }

  try {
    const [clientes, pessoas] = await Promise.all([
      query('SELECT id, nome FROM cliente'),
      query('SELECT id, name, email, outlook_email FROM usuario WHERE ativo'),
    ])
    const clientePorNome = new Map(clientes.rows.map((c) => [normal(c.nome), c]))
    const pessoaPor = new Map()
    pessoas.rows.forEach((u) => {
      pessoaPor.set(normal(u.name), u.id)
      if (u.email) pessoaPor.set(String(u.email).toLowerCase(), u.id)
      if (u.outlook_email) pessoaPor.set(String(u.outlook_email).toLowerCase(), u.id)
    })
    const etapaPorNome = new Map(funil.etapas.flatMap((e) => [[normal(e.rotulo), e.id], [normal(e.id), e.id]]))

    const ignorados = []
    const prontos = []
    linhas.forEach((l, i) => {
      const titulo = texto(l?.titulo).slice(0, TITULO_MAXIMO)
      if (!titulo) {
        ignorados.push({ linha: i + 2, motivo: 'sem título' })
        return
      }
      const empresa = texto(l?.organizacao).slice(0, TEXTO_MAXIMO)
      const cliente = clientePorNome.get(normal(empresa))
      const email = texto(l?.contatoEmail).toLowerCase().split(/[,;\s]+/)[0] ?? ''
      const valor = lerValor(l?.valor)
      const responsavel = texto(l?.responsavel)
      const status = statusDoTexto(l?.status)
      prontos.push([
        funil.id,
        etapaPorNome.get(normal(l?.etapa)) ?? funil.etapas[0].id,
        titulo,
        cliente?.id ?? null,
        cliente?.nome ?? (empresa || null),
        texto(l?.contatoNome).slice(0, TEXTO_MAXIMO) || null,
        emailValido(email) ? email : null,
        texto(l?.contatoTelefone).slice(0, 40) || null,
        valor === null || valor > VALOR_MAXIMO ? 0 : valor,
        pessoaPor.get(responsavel.toLowerCase()) ?? pessoaPor.get(normal(responsavel)) ?? req.dono.sub,
        dataOuNula(l?.proximaAtividade),
        dataOuNula(l?.previsaoFechamento),
        status,
        status === 'aberto' ? null : new Date().toISOString(),
        req.dono.sub,
      ])
    })

    await emTransacao(async (cliente) => {
      for (const v of prontos) {
        await cliente.query(
          `INSERT INTO negocio (funil, etapa, titulo, cliente_id, organizacao, contato_nome, contato_email,
                                contato_telefone, valor, responsavel_id, proxima_atividade,
                                previsao_fechamento, status, fechado_em, criado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          v,
        )
      }
    })

    await registrarAtividade(req, {
      acao: 'negocio.importados',
      categoria: 'comercial',
      entidade: ['funil', funil.id],
      descricao: 'Negócios importados no Comercial',
      detalhes: { funil: funil.rotulo, importados: prontos.length, ignorados: ignorados.length || null },
    })
    return res.status(201).json({ importados: prontos.length, ignorados })
  } catch (erro) {
    return falhou(erro, res, 'comercial/importar')
  }
})

/* ---------------- e-mail ---------------- */

/** O corpo digitado vira HTML simples: texto escapado, quebra de linha vira <br>. */
function paraHtml(mensagem) {
  const escapado = String(mensagem)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${escapado.replace(/\r?\n/g, '<br>')}</div>`
}

router.get('/negocios/:id/emails', exigeSessao, exige(VER), async (req, res) => {
  if (!idOuNulo(req.params.id)) return res.status(400).json({ erro: 'Negócio inválido.' })
  try {
    const negocio = await lerUm(req.params.id)
    if (!negocio) return res.status(404).json({ erro: 'Negócio não encontrado.' })
    const { rows } = await query(
      `SELECT e.*, u.name AS usuario_nome FROM negocio_email e
         LEFT JOIN usuario u ON u.id = e.usuario_id
        WHERE e.negocio_id = $1 ORDER BY e.enviado_em DESC LIMIT 30`,
      [req.params.id],
    )
    const [envio, leitura] = await Promise.all([podeEnviar(), podeLerCaixas()])
    const { caixa } = await caixaDe(req.dono.sub)

    /* o ultimo e-mail do contato, na caixa de QUEM vai responder: e
       nessa conversa que a resposta entra */
    let ultimo = null
    let erroLeitura = null
    if (leitura && caixa && negocio.contatoEmail) {
      try {
        ultimo = await ultimoDoContato(caixa, negocio.contatoEmail)
      } catch (erro) {
        erroLeitura = 'Não foi possível ler a caixa de entrada agora.'
        logger.error('comercial/emails-ler', erro.message)
      }
    }

    return res.json({
      email: { envio, leitura, caixa },
      ultimo,
      erroLeitura,
      enviados: rows.map((e) => ({
        id: String(e.id),
        de: e.de,
        para: e.para,
        assunto: e.assunto,
        corpo: e.corpo,
        resposta: Boolean(e.em_resposta_a),
        usuarioId: e.usuario_id ? String(e.usuario_id) : null,
        usuarioNome: e.usuario_nome ?? '',
        enviadoEm: e.enviado_em,
      })),
    })
  } catch (erro) {
    return falhou(erro, res, 'comercial/emails')
  }
})

router.post('/negocios/:id/email', exigeSessao, exige(RESPONDER), async (req, res) => {
  if (!idOuNulo(req.params.id)) return res.status(400).json({ erro: 'Negócio inválido.' })
  const para = texto(req.body?.para).toLowerCase()
  const assunto = texto(req.body?.assunto).slice(0, 250)
  const mensagem = String(req.body?.mensagem ?? '').trim()
  if (!emailValido(para)) return res.status(400).json({ erro: 'Confira o e-mail do destinatário.', campo: 'para' })
  if (!mensagem) return res.status(400).json({ erro: 'Escreva a mensagem.', campo: 'mensagem' })
  if (mensagem.length > EMAIL_CORPO_MAXIMO) return res.status(400).json({ erro: 'A mensagem ficou grande demais.' })

  try {
    const negocio = await lerUm(req.params.id)
    if (!negocio) return res.status(404).json({ erro: 'Negócio não encontrado.' })

    const { caixa } = await caixaDe(req.dono.sub)
    if (!caixa) {
      return res.status(400).json({ erro: 'Seu cadastro não tem e-mail do Outlook. Vincule a conta em Configurações.' })
    }

    const freio = `email-negocio:${req.dono.sub}`
    if (await estourou([{ chave: freio, maximo: EMAILS_POR_HORA, minutos: 60 }])) {
      return res.status(429).json({ erro: 'Muitos e-mails em pouco tempo. Espere alguns minutos e tente de novo.' })
    }

    /* Responder DENTRO da conversa so da com leitura da caixa: acha o
       ultimo e-mail daquele contato na caixa de quem responde. Sem
       leitura (ou sem e-mail dele), sai como e-mail novo. */
    let emRespostaA = null
    let assuntoFinal = assunto
    if (req.body?.responder && (await podeLerCaixas())) {
      try {
        const ultimo = await ultimoDoContato(caixa, para)
        if (ultimo) {
          emRespostaA = ultimo.id
          if (!assuntoFinal) assuntoFinal = /^re:/i.test(ultimo.assunto) ? ultimo.assunto : `RE: ${ultimo.assunto}`
        }
      } catch (erro) {
        logger.error('comercial/email-ler', erro.message)
      }
    }
    if (!assuntoFinal) return res.status(400).json({ erro: 'Escreva o assunto.', campo: 'assunto' })

    await anotar(freio)
    const enviado = await enviarComo({ caixa, para, assunto: assuntoFinal, html: paraHtml(mensagem), emRespostaA })
    if (!enviado.ok) return res.status(502).json({ erro: enviado.motivo })

    await query(
      `INSERT INTO negocio_email (negocio_id, usuario_id, de, para, assunto, corpo, em_resposta_a)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.params.id, req.dono.sub, caixa, para, assuntoFinal, mensagem, emRespostaA],
    )
    await query(
      'UPDATE negocio SET email_aguardando = false, email_conferido_em = now(), atualizado_em = now() WHERE id = $1',
      [req.params.id],
    )
    await registrarAtividade(req, {
      acao: 'negocio.email',
      categoria: 'comercial',
      entidade: ['negocio', req.params.id],
      descricao: emRespostaA ? 'E-mail respondido pelo site' : 'E-mail enviado pelo site',
      detalhes: { negocio: negocio.titulo, para, assunto: assuntoFinal },
    })
    return res.status(201).json({ ok: true, resposta: Boolean(emRespostaA), negocio: await lerUm(req.params.id) })
  } catch (erro) {
    return falhou(erro, res, 'comercial/email')
  }
})

/**
 * Atualiza o "Responder?" dos cartoes de um funil.
 *
 * Para cada negocio aberto com e-mail de contato, olha a caixa do
 * RESPONSAVEL: o ultimo e-mail do contato ainda nao respondido acende o
 * botao. Sao 20 por chamada, os conferidos ha mais tempo primeiro, e
 * cada um so volta a ser conferido depois de 10 minutos — a tela chama
 * de novo enquanto houver o que conferir.
 */
router.post('/emails/conferir', exigeSessao, exige(VER), async (req, res) => {
  const funil = texto(req.body?.funil)
  if (funil && !funilPorId(funil)) return res.status(400).json({ erro: 'Funil desconhecido.' })
  try {
    if (!(await podeLerCaixas())) return res.json({ leitura: false, negocios: [], restantes: 0 })

    const { rows } = await query(
      `SELECT n.id, coalesce(n.contato_email, p.email) AS contato,
              coalesce(nullif(u.outlook_email, ''), u.email) AS caixa
         FROM negocio n
         LEFT JOIN cliente_pessoa p ON p.id = n.pessoa_id
         JOIN usuario u             ON u.id = n.responsavel_id
        WHERE n.status = 'aberto'
          AND ($1::text IS NULL OR n.funil = $1)
          AND coalesce(n.contato_email, p.email) IS NOT NULL
          AND (n.email_conferido_em IS NULL OR n.email_conferido_em < now() - interval '10 minutes')
        ORDER BY n.email_conferido_em NULLS FIRST
        LIMIT 21`,
      [funil || null],
    )
    const lote = rows.slice(0, 20)
    const resultados = await Promise.allSettled(lote.map((l) => ultimoDoContato(l.caixa, l.contato)))

    const atualizados = []
    for (const [i, r] of resultados.entries()) {
      const id = lote[i].id
      if (r.status === 'rejected') {
        /* caixa que a Microsoft nao achou: marca como conferida para nao
           ficar tentando a cada abertura do quadro */
        await query('UPDATE negocio SET email_conferido_em = now() WHERE id = $1', [id])
        continue
      }
      const m = r.value
      await query(
        `UPDATE negocio SET email_aguardando = $1, email_mensagem_id = $2, email_assunto = $3,
                            email_recebido_em = $4, email_conferido_em = now()
          WHERE id = $5`,
        [Boolean(m?.aguardando), m?.id ?? null, m?.assunto ?? null, m?.recebidoEm ?? null, id],
      )
      atualizados.push(id)
    }

    const negocios = atualizados.length
      ? (await query(`${SELECT_NEGOCIO} WHERE n.id = ANY($1::bigint[])`, [atualizados])).rows.map(paraNegocio)
      : []
    return res.json({ leitura: true, negocios, restantes: Math.max(rows.length - lote.length, 0) })
  } catch (erro) {
    return falhou(erro, res, 'comercial/conferir')
  }
})

/* ---------------- contatos ---------------- */

const paraContato = (l) => ({
  id: String(l.id),
  nome: l.nome,
  cargo: l.cargo ?? '',
  email: l.email ?? '',
  telefone: l.telefone ?? '',
  clienteId: l.cliente_id === null ? null : String(l.cliente_id),
  clienteNome: l.cliente_nome ?? '',
})

router.get('/contatos', exigeSessao, exige(VER), async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, c.nome AS cliente_nome
         FROM cliente_pessoa p
         LEFT JOIN cliente c ON c.id = p.cliente_id
        ORDER BY p.nome`,
    )
    return res.json({ contatos: rows.map(paraContato) })
  } catch (erro) {
    return falhou(erro, res, 'comercial/contatos')
  }
})

/* o "Adicionar contato" do negocio: com a empresa escolhida, ou sem
   empresa nenhuma (cliente_pessoa.cliente_id aceita NULL desde a 29) */
router.post('/contatos', exigeSessao, exige(EDITAR), async (req, res) => {
  const nome = texto(req.body?.nome).slice(0, 200)
  const email = texto(req.body?.email).toLowerCase()
  const telefone = texto(req.body?.telefone).slice(0, 40)
  const clienteId = idOuNulo(req.body?.clienteId)
  if (!nome) return res.status(400).json({ erro: 'Escreva o nome do contato.', campo: 'nome' })
  if (email && !emailValido(email)) return res.status(400).json({ erro: 'O e-mail não parece certo.', campo: 'email' })
  try {
    const { rows } = await query(
      `INSERT INTO cliente_pessoa (cliente_id, nome, email, telefone, ordem)
       VALUES ($1, $2, $3, $4,
               coalesce((SELECT max(ordem) + 1 FROM cliente_pessoa WHERE cliente_id IS NOT DISTINCT FROM $1), 0))
       RETURNING id`,
      [clienteId, nome, email || null, telefone || null],
    )
    const { rows: lido } = await query(
      `SELECT p.*, c.nome AS cliente_nome FROM cliente_pessoa p
         LEFT JOIN cliente c ON c.id = p.cliente_id WHERE p.id = $1`,
      [rows[0].id],
    )
    await registrarAtividade(req, {
      acao: 'contato.criado',
      categoria: 'comercial',
      entidade: ['cliente_pessoa', rows[0].id],
      descricao: 'Novo contato no Comercial',
      detalhes: { contato: nome, cliente: lido[0].cliente_nome || null },
    })
    return res.status(201).json({ contato: paraContato(lido[0]) })
  } catch (erro) {
    return falhou(erro, res, 'comercial/contato-criar')
  }
})

/* ---------------- resumo por cliente (aba Clientes) ---------------- */

router.get('/resumo-clientes', exigeSessao, exige('ver_clientes'), async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT cliente_id,
              count(*) FILTER (WHERE status = 'ganho')                 AS ganhos,
              count(*) FILTER (WHERE status = 'aberto')                AS abertos,
              count(*) FILTER (WHERE status = 'perdido')               AS perdidos,
              /* valores so em reais: o ticket medio e a soma nao misturam
                 dolar e euro com real */
              coalesce(sum(valor) FILTER (WHERE status = 'ganho' AND moeda = 'BRL'), 0) AS valor_ganho,
              avg(valor) FILTER (WHERE status = 'ganho' AND moeda = 'BRL')              AS ticket
         FROM negocio
        WHERE cliente_id IS NOT NULL
        GROUP BY cliente_id`,
    )
    const resumo = Object.fromEntries(
      rows.map((l) => [
        String(l.cliente_id),
        {
          ganhos: Number(l.ganhos),
          abertos: Number(l.abertos),
          perdidos: Number(l.perdidos),
          valorGanho: Number(l.valor_ganho),
          ticketMedio: l.ticket === null ? null : Math.round(Number(l.ticket) * 100) / 100,
        },
      ]),
    )
    return res.json({ resumo })
  } catch (erro) {
    /* banco sem a tabela de negocios: a aba Clientes continua, com zeros */
    if (erro.code === '42P01') return res.json({ resumo: {} })
    return tratar(erro, res, 'comercial/resumo-clientes')
  }
})

export default router
