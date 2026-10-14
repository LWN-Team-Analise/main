import { Router } from 'express'
import { query } from '../db.js'
import { exigeSessao, tratar } from '../sessao.js'

/* ============================================================
   HISTORICO — /api/atividades

     GET /?limite=30&antes=<id>&tipo=   as MINHAS atividades, da mais
                                        nova para a mais antiga;
                                        `antes` pagina

   So as de quem esta logado, e isso nao e parametro: o usuario sai
   do token. Nao existe `?usuario=` — nao ha como pedir o historico
   de outra pessoa por aqui.

   `tipo` recorta pelo assunto, no proprio SELECT:
     (vazio) | todos   tudo
     checks            check marcado / desmarcado
     despesas          despesa, refeicao e bonus enviados

   E so os ultimos 7 DIAS, contados pelo carimbo de cada linha
   (agora - 7 dias, na hora exata). O que passou disso nao sai daqui —
   mas continua no banco: e so o historico da pagina inicial que
   esquece. A despesa, o check, a obra... nada disso e tocado.
   ============================================================ */

const router = Router()

const JANELA = "interval '7 days'"

/** o `tipo` da tela -> a `categoria` gravada por server/atividade.js */
const TIPOS = { checks: 'check', despesas: 'despesa' }

const paraAtividade = (l) => ({
  id: String(l.id),
  acao: l.acao,
  categoria: l.categoria,
  entidadeTipo: l.entidade_tipo ?? null,
  entidadeId: l.entidade_id ?? null,
  descricao: l.descricao,
  detalhes: l.detalhes ?? {},
  criadoEm: l.criado_em,
})

router.get('/', exigeSessao, async (req, res) => {
  const limite = Math.min(Math.max(Number.parseInt(req.query.limite, 10) || 30, 1), 100)
  const antes = String(req.query.antes ?? '').trim()
  if (antes && !/^\d{1,15}$/.test(antes)) {
    return res.status(400).json({ erro: 'Página inválida.' })
  }
  const tipo = String(req.query.tipo ?? '').trim()
  if (tipo && tipo !== 'todos' && !TIPOS[tipo]) {
    return res.status(400).json({ erro: 'Filtro do histórico inválido.' })
  }

  try {
    /* Uma a mais que o pedido: e assim que se sabe se ha outra pagina.
       A ordem e pelo id, que cresce junto com o relogio (e o carimbo de
       quando a linha entrou) e e o que a pagina seguinte usa de corte. */
    const params = [req.dono.sub, limite + 1]
    const filtros = []
    if (antes) {
      params.push(antes)
      filtros.push(`AND id < $${params.length}`)
    }
    if (TIPOS[tipo]) {
      params.push(TIPOS[tipo])
      filtros.push(`AND categoria = $${params.length}`)
    }
    const { rows } = await query(
      `SELECT id, acao, categoria, entidade_tipo, entidade_id, descricao, detalhes, criado_em
         FROM atividade
        WHERE usuario_id = $1
          AND criado_em >= now() - ${JANELA}
          ${filtros.join(' ')}
        ORDER BY id DESC
        LIMIT $2`,
      params,
    )
    const temMais = rows.length > limite
    return res.json({ atividades: rows.slice(0, limite).map(paraAtividade), temMais })
  } catch (erro) {
    if (erro.code === '42P01') {
      /* banco sem a atualizacao-9: a pagina inicial abre com o historico
         vazio e o recado, em vez de quebrar */
      return res.json({
        atividades: [],
        temMais: false,
        aviso: 'O histórico ainda não está ativo: falta rodar db/atualizacao-9.sql.txt.',
      })
    }
    return tratar(erro, res, 'atividades/ler')
  }
})

export default router
