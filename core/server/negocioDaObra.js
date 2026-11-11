/**
 * O QUE SOBROU DA OBRA QUE ENTRAVA NO COMERCIAL.
 *
 * Entre a atualizacao 48 e a 51, toda obra criada na mao em Obras entrava
 * sozinha no Comercial, em Novos negocios > Demanda Recebida, ligada a obra
 * (`obra_id`) e com `compartilhado_em` vazio. Essa ligacao foi desligada:
 * agora o caminho e um so, o do Comercial para Obras — o negocio de Novos
 * negocios vira obra quando e compartilhado com a equipe. A obra criada em
 * Obras fica so em Obras.
 *
 * Os negocios que nasceram naquele intervalo continuam no Comercial. Fica
 * so a limpeza deles: a obra excluida leva o negocio que nasceu dela,
 * enquanto ele ainda esta como nasceu (aberto, em Demanda Recebida). Sem
 * isso ele ficaria no Comercial como "Pendente", sem obra — e um
 * "Compartilhar com a equipe" ali criaria a obra de novo. O que o Comercial
 * ja fez andar, ou que veio do proprio Comercial (`compartilhado_em`
 * preenchido), continua la.
 */
import { query } from './db.js'
import { logger } from './logger.js'
import { FUNIL_PADRAO } from '../src/domain/comercial.js'

const ETAPA = 'demanda_recebida'

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
