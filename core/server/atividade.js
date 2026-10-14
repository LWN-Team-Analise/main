/**
 * O HISTORICO — um registro so para o sistema inteiro.
 *
 * Toda rota que muda alguma coisa chama `registrarAtividade` depois de
 * dar certo. E um lugar so, com um formato so: o Historico da pagina
 * inicial nao precisa saber de onde cada linha veio.
 *
 *   await registrarAtividade(req, {
 *     acao: 'obra.criada',          // o que aconteceu (chave)
 *     categoria: 'obra',            // o assunto: cor e agrupamento na tela
 *     entidade: ['obra', id],       // o que foi mexido
 *     descricao: 'Nova obra criada',
 *     detalhes: { obra: 'PT-2026-031', cliente: 'Hospital ABC' },
 *   })
 *
 * QUEM fez sai do token (req.dono), nunca do corpo do pedido.
 *
 * Ele NUNCA derruba a acao: se gravar o historico falhar (banco sem a
 * tabela, por exemplo), a obra continua criada e o erro vai so para o
 * log. Perder uma linha de historico e ruim; recusar a acao por causa
 * dela seria pior.
 */
import { query } from './db.js'
import { logger } from './logger.js'

/** Tira os vazios: detalhe sem valor nao vira "undefined" na tela. */
function limpar(detalhes) {
  return Object.fromEntries(
    Object.entries(detalhes ?? {}).filter(
      ([, valor]) => valor !== undefined && valor !== null && valor !== '',
    ),
  )
}

export async function registrarAtividade(reqOuUsuarioId, { acao, categoria, entidade, descricao, detalhes }) {
  const usuarioId =
    typeof reqOuUsuarioId === 'object' ? reqOuUsuarioId?.dono?.sub : reqOuUsuarioId
  if (!usuarioId || !acao || !descricao) return

  const [entidadeTipo, entidadeId] = entidade ?? []
  try {
    await query(
      `INSERT INTO atividade (usuario_id, acao, categoria, entidade_tipo, entidade_id, descricao, detalhes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        usuarioId,
        String(acao).slice(0, 60),
        categoria ?? String(acao).split('.')[0],
        entidadeTipo ?? null,
        entidadeId === undefined || entidadeId === null ? null : String(entidadeId),
        String(descricao).slice(0, 300),
        JSON.stringify(limpar(detalhes)),
      ],
    )
  } catch (erro) {
    /* 42P01 = a tabela ainda nao existe (falta db/atualizacao-9.sql.txt) */
    logger.warn('atividade', `historico nao gravado (${acao}): ${erro.message}`)
  }
}

/**
 * "Obra PT-2026-031 — Hospital ABC": o nome da obra do jeito que o
 * sistema escreve em todo lugar. Uma consulta so, que o historico usa
 * para gravar a foto do momento.
 */
export async function descreverObra(obraId) {
  try {
    const { rows } = await query(
      `SELECT o.proposta, c.nome AS cliente
         FROM obra o LEFT JOIN cliente c ON c.id = o.cliente_id
        WHERE o.id = $1`,
      [obraId],
    )
    return { obra: rows[0]?.proposta || null, cliente: rows[0]?.cliente || null }
  } catch {
    return { obra: null, cliente: null }
  }
}
