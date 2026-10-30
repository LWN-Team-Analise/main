/**
 * Entrar na obra sem o "Incluir membro" (a inclusao ja aceita).
 *
 *   - quem CRIA a obra (o "Nova obra", ou o Comercial que compartilha o
 *     negocio com a equipe) ja faz parte dela;
 *   - quem marca check sem precisar estar na obra (o setor com
 *     `check_todas_obras`, ou o acesso total) entra nela ao marcar.
 *
 * Grava em obra_membro_parcial como "aceito": e a lista dos Incluidos
 * da tela de Membros, e e ela que libera os checks do setor da pessoa
 * (a regra da atualizacao 37). A inclusao pendente ou recusada que a
 * pessoa ja tivesse vira aceita.
 */
import { query } from './db.js'
import { logger } from './logger.js'
import { cargoPode, meuCargo } from './sessao.js'
import { avisarEtapasConcluidas } from './avisosObra.js'

/** A pessoa passa a fazer parte da obra (ja aceita). */
export async function incluirNaObra(obraId, usuarioId) {
  try {
    await query(
      `INSERT INTO obra_membro_parcial (obra_id, usuario_id, incluido_por, status, respondido_em)
       VALUES ($1, $2, $2, 'aceito', now())
       ON CONFLICT (obra_id, usuario_id) DO UPDATE
          SET status = 'aceito', motivo = NULL, respondido_em = now()
        WHERE obra_membro_parcial.status <> 'aceito'`,
      [obraId, usuarioId],
    )
  } catch (erro) {
    /* sem a atualizacao 30 nao ha a lista de incluidos: segue sem ela */
    if (erro.code !== '42P01') logger.error('membros/incluir', erro.message)
  }
}

/**
 * Depois de marcar check: quem marca sem precisar estar na obra entra
 * nela, e a etapa que fechou agora vai para os membros no Teams
 * (server/avisosObra.js). Serve para qualquer caminho que marca check.
 */
export async function depoisDeMarcar(usuarioId, obraId) {
  try {
    if (usuarioId && cargoPode(await meuCargo(usuarioId), 'check_todas_obras')) {
      await incluirNaObra(obraId, usuarioId)
    }
  } catch (erro) {
    logger.error('membros/marcou', erro.message)
  }
  await avisarEtapasConcluidas(obraId)
}
