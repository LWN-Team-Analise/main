/**
 * A OBRA CRIADA NA MAO ENTRA NO COMERCIAL.
 *
 * O caminho contrario ja existia: o negocio de Novos negocios, quando e
 * compartilhado, vira obra. Agora a obra cadastrada direto em Obras
 * tambem aparece no Comercial, no funil Novos negocios, em Demanda
 * Recebida, ja ligada a obra (`obra_id`). O titulo e o n° da proposta,
 * que e o que identifica a obra; a descricao vai para a observacao.
 *
 * `compartilhado_em` fica vazio de proposito: nada foi compartilhado, a
 * obra nasceu primeiro. E assim que se sabe que o negocio veio da obra.
 *
 * Falhar aqui nao derruba o cadastro da obra: ela ja foi gravada, e o
 * Comercial e consequencia. As obras que ja existiam quando isto entrou
 * vieram pela atualizacao 48.
 */
import { query } from './db.js'
import { logger } from './logger.js'
import { registrarAtividade } from './atividade.js'
import { FUNIL_PADRAO, TITULO_MAXIMO, funilPorId, rotuloDaEtapa } from '../src/domain/comercial.js'

const ETAPA = 'demanda_recebida'

export async function criarNegocioDaObra(req, { obraId, clienteId, proposta, descricao }) {
  try {
    const titulo = String(proposta).slice(0, TITULO_MAXIMO)
    const { rows } = await query(
      `INSERT INTO negocio (funil, etapa, titulo, cliente_id, responsavel_id, observacao, proposta, obra_id, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $5)
       RETURNING id`,
      [FUNIL_PADRAO, ETAPA, titulo, clienteId, req.dono.sub, descricao || null, proposta, obraId],
    )
    await registrarAtividade(req, {
      acao: 'negocio.criado',
      categoria: 'comercial',
      entidade: ['negocio', rows[0].id],
      descricao: 'Novo negócio no Comercial, a partir de uma obra',
      detalhes: {
        negocio: titulo,
        funil: funilPorId(FUNIL_PADRAO)?.rotulo,
        etapa: rotuloDaEtapa(FUNIL_PADRAO, ETAPA),
      },
    })
  } catch (erro) {
    logger.error('comercial/negocio-da-obra', erro.message)
  }
}

/**
 * A obra excluida leva o negocio que nasceu dela, enquanto ele ainda esta
 * como nasceu (aberto, em Demanda Recebida): sem isso ele ficava no
 * Comercial como "Pendente", sem obra e sem ninguem ter pedido. O que o
 * Comercial ja fez andar, ou que veio do proprio Comercial, continua la.
 */
export async function apagarNegocioDaObra(obraId) {
  try {
    await query(
      `DELETE FROM negocio
        WHERE obra_id = $1 AND compartilhado_em IS NULL
          AND status = 'aberto' AND funil = $2 AND etapa = $3`,
      [obraId, FUNIL_PADRAO, ETAPA],
    )
  } catch (erro) {
    logger.error('comercial/negocio-da-obra-apagar', erro.message)
  }
}
