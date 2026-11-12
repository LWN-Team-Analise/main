import { Router } from 'express'
import { query } from '../db.js'
import { exigePessoal, exigeSessao, meuCargo, podePessoal, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'

/* ============================================================
   /api/avisos — o AVISO GERAL (atualizacoes 46 e 47)

     GET    /               { avisos } — os que estao valendo para o
                            setor de quem pede: o card do Panorama
     GET    /historico      { ativos, encerrados } — todos os que nao
                            foram excluidos
     POST   /               { titulo, mensagem?, importante?, setor?,
                              expiraEm? } envia
     POST   /:id/encerrar   tira do Panorama e leva para o historico
     DELETE /:id            apaga de vez (nao fica no historico)

   E o "Enviar aviso" do botao "+" (AppShell): sem obra, para a empresa
   inteira ou para um setor so. Os avisos de OBRA continuam sendo os de
   /api/dados/obras/:id/avisos — este nao mexe neles.

   O aviso vale ate o fim do dia `expira_em` (ou para sempre, sem data)
   e enquanto ninguem o encerra. Depois disso ele so existe no historico.

   A regra do setor e a do sininho: chega so o que foi enderecado ao SEU
   setor, inclusive para a diretoria. No historico, quem pode publicar
   (`publicar_avisos`) ve os de todos os setores: e por la que se encerra
   o aviso mandado para um setor que nao e o seu.

   Enviar, encerrar e excluir e de quem tem `publicar_avisos`, uma
   permissao da PESSOA e nao do setor (atualizacao 53; sem ela no banco,
   vale a `enviar_avisos` do setor).
   ============================================================ */

const router = Router()

const EDITAR = 'publicar_avisos'

const TITULO_MAXIMO = 120
const MENSAGEM_MAXIMA = 2000
/* o card mostra os tres primeiros e o "Ver todos" o resto; isto e so o
   teto de uma resposta */
const LIMITE = 60
const LIMITE_HISTORICO = 300

const texto = (valor) => String(valor ?? '').trim()
const idValido = (valor) => /^\d{1,15}$/.test(String(valor ?? ''))

/** 'AAAA-MM-DD' que existe no calendario (nada de 30/02). */
function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [a, m, d] = valor.split('-').map(Number)
  const data = new Date(Date.UTC(a, m - 1, d))
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d
}

/** Hoje no calendario do Brasil: o servidor pode estar rodando em UTC. */
const hojeNoBrasil = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/* $1 e sempre o dia de hoje: e ele que separa o que vale do que expirou */
const SELECAO = `
  SELECT a.id, a.titulo, a.mensagem, a.importante, a.enviado_em, a.enviado_por,
         a.setor_chave, a.encerrado_em,
         to_char(a.expira_em, 'YYYY-MM-DD') AS expira_em,
         CASE WHEN a.encerrado_em IS NOT NULL THEN 'encerrado'
              WHEN a.expira_em < $1::date     THEN 'expirado'
              ELSE 'ativo' END AS situacao,
         u.name AS enviado_por_nome,
         fim.name AS encerrado_por_nome,
         coalesce(c.nome, a.setor_chave) AS setor_nome
    FROM aviso_geral a
    LEFT JOIN usuario u   ON u.id = a.enviado_por
    LEFT JOIN usuario fim ON fim.id = a.encerrado_por
    LEFT JOIN cargo c     ON c.chave = a.setor_chave`

function paraAviso(l) {
  return {
    id: String(l.id),
    titulo: l.titulo,
    mensagem: l.mensagem ?? '',
    importante: l.importante === true,
    enviadoEm: l.enviado_em,
    enviadoPor: l.enviado_por === null ? null : String(l.enviado_por),
    enviadoPorNome: l.enviado_por_nome ?? null,
    /* null = todos os setores */
    setor: l.setor_chave ?? null,
    setorNome: l.setor_nome ?? null,
    /* null = sem expiracao */
    expiraEm: l.expira_em ?? null,
    encerradoEm: l.encerrado_em ?? null,
    encerradoPorNome: l.encerrado_por_nome ?? null,
    /* 'ativo', 'expirado' ou 'encerrado' */
    situacao: l.situacao,
  }
}

function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro: 'O banco ainda não está atualizado para os avisos (atualizações 46 e 47 em core/db). Rode npm run db:atualizar e suba a API de novo.',
    })
  }
  return tratar(erro, res, onde)
}

router.get('/', exigeSessao, async (req, res) => {
  try {
    const { chave } = await meuCargo(req.dono.sub)
    const { rows } = await query(
      `${SELECAO}
        WHERE a.encerrado_em IS NULL
          AND (a.expira_em IS NULL OR a.expira_em >= $1::date)
          AND (a.setor_chave IS NULL OR a.setor_chave = $2)
        ORDER BY a.importante DESC, a.enviado_em DESC, a.id DESC
        LIMIT ${LIMITE}`,
      [hojeNoBrasil(), chave],
    )
    return res.json({ avisos: rows.map(paraAviso) })
  } catch (erro) {
    /* sem as atualizacoes, o card mostra so os avisos de obra — a pagina
       inicial nao pode cair por isso */
    if (erro.code === '42P01' || erro.code === '42703') return res.json({ avisos: [], semTabela: true })
    return falhou(erro, res, 'avisos/listar')
  }
})

router.get('/historico', exigeSessao, async (req, res) => {
  try {
    const cargo = await meuCargo(req.dono.sub)
    const { rows } = await query(
      `${SELECAO}
        WHERE ($2::boolean OR a.setor_chave IS NULL OR a.setor_chave = $3)
        ORDER BY coalesce(a.encerrado_em::date, a.expira_em, a.enviado_em::date) DESC, a.enviado_em DESC, a.id DESC
        LIMIT ${LIMITE_HISTORICO}`,
      [hojeNoBrasil(), await podePessoal(req.dono.sub, EDITAR), cargo.chave],
    )
    const avisos = rows.map(paraAviso)
    return res.json({
      /* os que estao valendo: os importantes em cima e os mais novos antes,
         como no card */
      ativos: avisos
        .filter((a) => a.situacao === 'ativo')
        .sort(
          (a, b) =>
            Number(b.importante) - Number(a.importante) || new Date(b.enviadoEm) - new Date(a.enviadoEm),
        ),
      /* os que ja sairam do Panorama, do que terminou por ultimo ao primeiro */
      encerrados: avisos.filter((a) => a.situacao !== 'ativo'),
    })
  } catch (erro) {
    if (erro.code === '42P01' || erro.code === '42703') return res.json({ ativos: [], encerrados: [], semTabela: true })
    return falhou(erro, res, 'avisos/historico')
  }
})

router.post('/', exigeSessao, exigePessoal(EDITAR), async (req, res) => {
  const titulo = texto(req.body?.titulo)
  const mensagem = texto(req.body?.mensagem)
  const importante = req.body?.importante === true
  const setor = texto(req.body?.setor) || null
  const expiraEm = texto(req.body?.expiraEm) || null

  if (!titulo) return res.status(400).json({ erro: 'Dê um título ao aviso.', campo: 'titulo' })
  if (titulo.length > TITULO_MAXIMO) {
    return res.status(400).json({ erro: `O título vai até ${TITULO_MAXIMO} caracteres.`, campo: 'titulo' })
  }
  if (mensagem.length > MENSAGEM_MAXIMA) {
    return res.status(400).json({ erro: `O texto vai até ${MENSAGEM_MAXIMA} caracteres.`, campo: 'mensagem' })
  }
  if (expiraEm && !dataValida(expiraEm)) {
    return res.status(400).json({ erro: 'A data de expiração não é válida.', campo: 'expiraEm' })
  }
  if (expiraEm && expiraEm < hojeNoBrasil()) {
    return res.status(400).json({ erro: 'A data de expiração já passou.', campo: 'expiraEm' })
  }

  try {
    let setorNome = null
    if (setor) {
      const achado = await query('SELECT nome FROM cargo WHERE chave = $1', [setor])
      if (!achado.rows[0]) return res.status(400).json({ erro: 'Esse setor não existe mais.', campo: 'setor' })
      setorNome = achado.rows[0].nome
    }

    const { rows } = await query(
      `INSERT INTO aviso_geral (titulo, mensagem, importante, enviado_por, setor_chave, expira_em)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [titulo, mensagem, importante, req.dono.sub, setor, expiraEm],
    )
    const salvo = await query(`${SELECAO} WHERE a.id = $2`, [hojeNoBrasil(), rows[0].id])
    await registrarAtividade(req, {
      acao: 'aviso.geral_enviado',
      categoria: 'aviso',
      entidade: ['aviso_geral', rows[0].id],
      descricao: 'Aviso geral enviado',
      detalhes: {
        aviso: titulo,
        setor: setorNome ?? 'Todos os setores',
        ...(expiraEm ? { expira: expiraEm } : {}),
        ...(importante ? { importante: 'sim' } : {}),
      },
    })
    return res.status(201).json({ aviso: paraAviso(salvo.rows[0]) })
  } catch (erro) {
    return falhou(erro, res, 'avisos/enviar')
  }
})

router.post('/:id/encerrar', exigeSessao, exigePessoal(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Aviso não encontrado.' })
  try {
    /* so o que ainda esta valendo: o aviso expirado ja esta no historico,
       e encerrar de novo trocaria o nome e a data de quem encerrou */
    const { rows } = await query(
      `UPDATE aviso_geral
          SET encerrado_em = now(), encerrado_por = $2
        WHERE id = $1
          AND encerrado_em IS NULL
          AND (expira_em IS NULL OR expira_em >= $3::date)
        RETURNING titulo`,
      [req.params.id, req.dono.sub, hojeNoBrasil()],
    )
    if (!rows[0]) {
      const existe = await query('SELECT 1 FROM aviso_geral WHERE id = $1', [req.params.id])
      return existe.rows[0]
        ? res.status(409).json({ erro: 'Este aviso já está no histórico.' })
        : res.status(404).json({ erro: 'Aviso não encontrado.' })
    }
    await registrarAtividade(req, {
      acao: 'aviso.geral_encerrado',
      categoria: 'aviso',
      entidade: ['aviso_geral', req.params.id],
      descricao: 'Aviso geral encerrado',
      detalhes: { aviso: rows[0].titulo },
    })
    return res.json({ ok: true })
  } catch (erro) {
    return falhou(erro, res, 'avisos/encerrar')
  }
})

router.delete('/:id', exigeSessao, exigePessoal(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Aviso não encontrado.' })
  try {
    const { rows } = await query('DELETE FROM aviso_geral WHERE id = $1 RETURNING titulo', [req.params.id])
    if (!rows[0]) return res.status(404).json({ erro: 'Aviso não encontrado.' })
    await registrarAtividade(req, {
      acao: 'aviso.geral_excluido',
      categoria: 'aviso',
      entidade: ['aviso_geral', req.params.id],
      descricao: 'Aviso geral excluído',
      detalhes: { aviso: rows[0].titulo },
    })
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'avisos/excluir')
  }
})

export default router
