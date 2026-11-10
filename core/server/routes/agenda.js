import { Router } from 'express'
import { query } from '../db.js'
import { exige, exigeSessao, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'

/* ============================================================
   /api/agenda — a agenda da empresa (db/atualizacao-44.sql.txt)

     GET    /            { eventos } — de hoje em diante, do mais
                         perto ao mais longe. Todo mundo logado ve
     POST   /            { titulo, dia, hora?, local? } cria
     PUT    /:id         os mesmos campos, troca o evento inteiro
     DELETE /:id         apaga

   Gravar e de quem tem `enviar_avisos`: a agenda e um aviso com data
   marcada, e quem ja manda recado para a empresa e quem marca a
   reuniao geral. O card fica na aba Panorama da pagina inicial.
   ============================================================ */

const router = Router()

const EDITAR = 'enviar_avisos'

const TITULO_MAXIMO = 120
const LOCAL_MAXIMO = 120
/* o card mostra os proximos; a lista do "Ver calendario" mostra todos.
   Isto e so o teto de uma resposta, para ela nao crescer sem fim */
const LIMITE = 200

const texto = (valor) => String(valor ?? '').trim()
const idValido = (valor) => /^\d{1,15}$/.test(String(valor ?? ''))

/** 'AAAA-MM-DD' que existe no calendario (nada de 30/02). */
function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [a, m, d] = valor.split('-').map(Number)
  const data = new Date(Date.UTC(a, m - 1, d))
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d
}

/** 'HH:MM' de 00:00 a 23:59. */
const horaValida = (valor) => /^([01]\d|2[0-3]):[0-5]\d$/.test(valor)

/** Hoje no calendario do Brasil: o servidor pode estar rodando em UTC. */
const hojeNoBrasil = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

const CAMPOS = `e.id, to_char(e.dia, 'YYYY-MM-DD') AS dia, to_char(e.hora, 'HH24:MI') AS hora,
                e.titulo, e.local, e.criado_em, e.atualizado_em, autor.name AS criado_por_nome`

function paraEvento(l) {
  return {
    id: String(l.id),
    titulo: l.titulo,
    dia: l.dia,
    hora: l.hora ?? null,
    local: l.local ?? '',
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em ?? null,
    criadoPorNome: l.criado_por_nome ?? null,
  }
}

/** Os campos do corpo, ja conferidos — ou { erro, campo }. */
function lerCampos(corpo) {
  const titulo = texto(corpo?.titulo)
  const dia = texto(corpo?.dia)
  const hora = texto(corpo?.hora)
  const local = texto(corpo?.local)

  if (!titulo) return { erro: 'Dê um título ao evento.', campo: 'titulo' }
  if (titulo.length > TITULO_MAXIMO) {
    return { erro: `O título vai até ${TITULO_MAXIMO} caracteres.`, campo: 'titulo' }
  }
  if (!dataValida(dia)) return { erro: 'Escolha o dia do evento.', campo: 'dia' }
  if (hora && !horaValida(hora)) return { erro: 'A hora não é válida.', campo: 'hora' }
  if (local.length > LOCAL_MAXIMO) {
    return { erro: `O local vai até ${LOCAL_MAXIMO} caracteres.`, campo: 'local' }
  }
  return { titulo, dia, hora: hora || null, local: local || null }
}

function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro: 'O banco ainda não tem a agenda (atualização 44 em core/db). Rode npm run db:atualizar e suba a API de novo.',
    })
  }
  return tratar(erro, res, onde)
}

const detalhes = (e) => ({
  evento: e.titulo,
  dia: e.dia,
  ...(e.hora ? { hora: e.hora } : {}),
  ...(e.local ? { local: e.local } : {}),
})

router.get('/', exigeSessao, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT ${CAMPOS}
         FROM agenda_evento e
         LEFT JOIN usuario autor ON autor.id = e.criado_por
        WHERE e.dia >= $1::date
        ORDER BY e.dia, e.hora NULLS FIRST, e.id
        LIMIT ${LIMITE}`,
      [hojeNoBrasil()],
    )
    return res.json({ eventos: rows.map(paraEvento) })
  } catch (erro) {
    /* sem a tabela (atualizacao 44 ainda nao rodou), a agenda so sai
       vazia — a pagina inicial nao pode cair por causa de um card */
    if (erro.code === '42P01') return res.json({ eventos: [], semTabela: true })
    return falhou(erro, res, 'agenda/listar')
  }
})

router.post('/', exigeSessao, exige(EDITAR), async (req, res) => {
  const campos = lerCampos(req.body)
  if (campos.erro) return res.status(400).json(campos)

  try {
    const { rows } = await query(
      `INSERT INTO agenda_evento (titulo, dia, hora, local, criado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [campos.titulo, campos.dia, campos.hora, campos.local, req.dono.sub],
    )
    const salvo = await query(
      `SELECT ${CAMPOS} FROM agenda_evento e LEFT JOIN usuario autor ON autor.id = e.criado_por WHERE e.id = $1`,
      [rows[0].id],
    )
    await registrarAtividade(req, {
      acao: 'agenda.evento_criado',
      categoria: 'aviso',
      entidade: ['agenda_evento', rows[0].id],
      descricao: 'Evento criado na agenda',
      detalhes: detalhes(campos),
    })
    return res.status(201).json({ evento: paraEvento(salvo.rows[0]) })
  } catch (erro) {
    return falhou(erro, res, 'agenda/criar')
  }
})

router.put('/:id', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Evento não encontrado.' })
  const campos = lerCampos(req.body)
  if (campos.erro) return res.status(400).json(campos)

  try {
    const { rowCount } = await query(
      `UPDATE agenda_evento
          SET titulo = $2, dia = $3, hora = $4, local = $5,
              atualizado_por = $6, atualizado_em = now()
        WHERE id = $1`,
      [req.params.id, campos.titulo, campos.dia, campos.hora, campos.local, req.dono.sub],
    )
    if (rowCount === 0) return res.status(404).json({ erro: 'Evento não encontrado.' })
    const salvo = await query(
      `SELECT ${CAMPOS} FROM agenda_evento e LEFT JOIN usuario autor ON autor.id = e.criado_por WHERE e.id = $1`,
      [req.params.id],
    )
    await registrarAtividade(req, {
      acao: 'agenda.evento_editado',
      categoria: 'aviso',
      entidade: ['agenda_evento', req.params.id],
      descricao: 'Evento editado na agenda',
      detalhes: detalhes(campos),
    })
    return res.json({ evento: paraEvento(salvo.rows[0]) })
  } catch (erro) {
    return falhou(erro, res, 'agenda/editar')
  }
})

router.delete('/:id', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(404).json({ erro: 'Evento não encontrado.' })
  try {
    const { rows } = await query(
      `DELETE FROM agenda_evento WHERE id = $1
       RETURNING titulo, to_char(dia, 'YYYY-MM-DD') AS dia, to_char(hora, 'HH24:MI') AS hora, local`,
      [req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Evento não encontrado.' })
    await registrarAtividade(req, {
      acao: 'agenda.evento_excluido',
      categoria: 'aviso',
      entidade: ['agenda_evento', req.params.id],
      descricao: 'Evento excluído da agenda',
      detalhes: detalhes(rows[0]),
    })
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'agenda/excluir')
  }
})

export default router
