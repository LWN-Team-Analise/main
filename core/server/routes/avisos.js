import { Router } from 'express'
import { query } from '../db.js'
import { exige, exigeSessao, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'

/* ============================================================
   /api/avisos — o AVISO GERAL (db/atualizacao-46.sql.txt)

     GET    /       { avisos } — os importantes primeiro, e em cada
                    grupo os mais novos primeiro (o teto da resposta
                    nunca corta um importante). Todo mundo logado ve
     POST   /       { titulo, mensagem?, importante? } envia
     DELETE /:id    apaga

   E o "Enviar aviso" do botao "+" (AppShell): um recado para a
   empresa inteira, sem obra e sem setor, que aparece no card "Avisos
   e Comunicados" do Panorama. Os avisos de OBRA continuam sendo os de
   /api/dados/obras/:id/avisos — este nao mexe neles.

   Enviar e excluir e de quem tem `enviar_avisos`.
   ============================================================ */

const router = Router()

const EDITAR = 'enviar_avisos'

const TITULO_MAXIMO = 120
const MENSAGEM_MAXIMA = 2000
/* o card mostra os tres mais novos e o "Ver todos" o resto; isto e so o
   teto de uma resposta */
const LIMITE = 60

const texto = (valor) => String(valor ?? '').trim()
const idValido = (valor) => /^\d{1,15}$/.test(String(valor ?? ''))

const CAMPOS = `a.id, a.titulo, a.mensagem, a.importante, a.enviado_em, a.enviado_por, u.name AS enviado_por_nome`

function paraAviso(l) {
  return {
    id: String(l.id),
    titulo: l.titulo,
    mensagem: l.mensagem ?? '',
    importante: l.importante === true,
    enviadoEm: l.enviado_em,
    enviadoPor: l.enviado_por === null ? null : String(l.enviado_por),
    enviadoPorNome: l.enviado_por_nome ?? null,
  }
}

function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro: 'O banco ainda não tem o aviso geral (atualização 46 em core/db). Rode npm run db:atualizar e suba a API de novo.',
    })
  }
  return tratar(erro, res, onde)
}

router.get('/', exigeSessao, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT ${CAMPOS}
         FROM aviso_geral a
         LEFT JOIN usuario u ON u.id = a.enviado_por
        ORDER BY a.importante DESC, a.enviado_em DESC, a.id DESC
        LIMIT ${LIMITE}`,
    )
    return res.json({ avisos: rows.map(paraAviso) })
  } catch (erro) {
    /* sem a tabela (atualizacao 46 ainda nao rodou), o card mostra so os
       avisos de obra — a pagina inicial nao pode cair por isso */
    if (erro.code === '42P01') return res.json({ avisos: [], semTabela: true })
    return falhou(erro, res, 'avisos/listar')
  }
})

router.post('/', exigeSessao, exige(EDITAR), async (req, res) => {
  const titulo = texto(req.body?.titulo)
  const mensagem = texto(req.body?.mensagem)
  const importante = req.body?.importante === true

  if (!titulo) return res.status(400).json({ erro: 'Dê um título ao aviso.', campo: 'titulo' })
  if (titulo.length > TITULO_MAXIMO) {
    return res.status(400).json({ erro: `O título vai até ${TITULO_MAXIMO} caracteres.`, campo: 'titulo' })
  }
  if (mensagem.length > MENSAGEM_MAXIMA) {
    return res.status(400).json({ erro: `O texto vai até ${MENSAGEM_MAXIMA} caracteres.`, campo: 'mensagem' })
  }

  try {
    const { rows } = await query(
      `INSERT INTO aviso_geral (titulo, mensagem, importante, enviado_por)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [titulo, mensagem, importante, req.dono.sub],
    )
    const salvo = await query(
      `SELECT ${CAMPOS} FROM aviso_geral a LEFT JOIN usuario u ON u.id = a.enviado_por WHERE a.id = $1`,
      [rows[0].id],
    )
    await registrarAtividade(req, {
      acao: 'aviso.geral_enviado',
      categoria: 'aviso',
      entidade: ['aviso_geral', rows[0].id],
      descricao: 'Aviso geral enviado',
      detalhes: { aviso: titulo, ...(importante ? { importante: 'sim' } : {}) },
    })
    return res.status(201).json({ aviso: paraAviso(salvo.rows[0]) })
  } catch (erro) {
    return falhou(erro, res, 'avisos/enviar')
  }
})

router.delete('/:id', exigeSessao, exige(EDITAR), async (req, res) => {
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
