/**
 * Avisos da CONTA no Teams (server/teams.js).
 *
 * Hoje e um so: quem entra pelo Outlook e ainda esta com a senha padrao
 * do site (123456, a SENHA_PADRAO do cadastro) recebe no Teams o pedido
 * para trocar. Sai sozinho no login com o Outlook (no maximo uma vez por
 * dia por pessoa) e, para todo mundo de uma vez, pelo botao de
 * Configuracoes > Notificacoes no Teams (acesso total).
 *
 * A senha padrao e conferida no hash (bcrypt), e nao pela marca
 * senha_temporaria: o vinculo com o Outlook liga essa marca de proposito,
 * mesmo para quem ja trocou.
 */
import bcrypt from 'bcryptjs'
import { query } from './db.js'
import { logger } from './logger.js'
import { registrarAtividade } from './atividade.js'
import { linkDoSite, mandarNoTeams } from './teams.js'
import { SENHA_PADRAO } from './routes/equipe.js'

const UM_DIA = "now() - interval '1 day'"

/**
 * Manda o pedido de troca a quem entrou pelo Outlook e continua com a
 * senha padrao. `usuarioIds` null = todo mundo ativo. Quem ja recebeu nas
 * ultimas 24 horas fica de fora. Devolve { avisados }.
 */
export async function avisarSenhaPadrao({ usuarioIds = null, quemPediu = null } = {}) {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.senha_hash
         FROM usuario u
         LEFT JOIN cargo c ON c.id = u.cargo_id
        WHERE coalesce(u.ativo, true) AND u.outlook = true AND u.senha_hash IS NOT NULL
          AND NOT coalesce((to_jsonb(c) ->> 'painel_tv')::boolean, false)
          AND ($1::bigint[] IS NULL OR u.id = ANY($1::bigint[]))
          AND NOT EXISTS (SELECT 1 FROM atividade a
                           WHERE a.acao = 'conta.lembrete_senha' AND a.entidade_tipo = 'usuario'
                             AND a.entidade_id = u.id::text AND a.criado_em > ${UM_DIA})`,
      [usuarioIds ? usuarioIds.map(String) : null],
    )
    const comPadrao = []
    for (const pessoa of rows) {
      if (await bcrypt.compare(SENHA_PADRAO, pessoa.senha_hash)) comPadrao.push(pessoa)
    }
    if (comPadrao.length === 0) return { avisados: 0 }

    const { enviados } = await mandarNoTeams(
      comPadrao.map((p) => p.id),
      {
        titulo: 'Troque a sua senha do Atmosfera LWN',
        linhas: [
          `A senha da sua conta no site ainda é a senha padrão (**${SENHA_PADRAO}**).`,
          'Para a segurança da sua conta, troque agora em Configurações > Senha.',
        ],
        link: linkDoSite('/core/app/configuracoes'),
        rotuloLink: 'Trocar a senha',
      },
    )
    if (enviados > 0) {
      for (const pessoa of comPadrao) {
        await registrarAtividade(quemPediu ?? pessoa.id, {
          acao: 'conta.lembrete_senha',
          categoria: 'conta',
          entidade: ['usuario', pessoa.id],
          descricao: 'Lembrete de troca da senha padrão enviado no Teams',
          detalhes: { pessoa: pessoa.name },
        })
      }
    }
    return { avisados: enviados }
  } catch (erro) {
    logger.error('avisos/senha', erro.message)
    return { avisados: 0 }
  }
}
