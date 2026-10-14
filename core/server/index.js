import 'dotenv/config'
import app from './app.js'
import { checarConexao, pool } from './db.js'
import { plantarRoteiro } from './roteiro.js'
import { comoEnvia, diagnostico } from './email.js'
import { aquecer } from './routes/bot.js'
import { logger } from './logger.js'

/**
 * A API rodando NA MAQUINA — `npm run api` (ou `npm run api:dev`, que
 * recarrega sozinho a cada mudanca em server/).
 *
 * As rotas nao moram aqui: elas estao em server/app.js, que e o mesmo
 * arquivo que a Vercel usa em producao (via api/index.js). Aqui fica so
 * o que existe por haver um processo de verdade: a porta, o modelo do
 * bot entrando na memoria e a conferencia de partida.
 */

const porta = Number(process.env.API_PORT ?? 3001)

app.listen(porta, async () => {
  logger.info('api', `ouvindo em http://localhost:${porta}`)
  /* o modelo do bot entra na memoria agora, sem ninguem esperando: a
     primeira pergunta do dia custa 50s com ele frio e 7s com ele quente */
  aquecer()
  /* saber por onde o e-mail sai poupa meia hora de investigacao quando
     o "esqueci minha senha" nao chega */
  const modo = comoEnvia()
  const caminho = {
    'api-microsoft': 'API da Microsoft (Graph)',
    smtp: 'SMTP',
    nenhum: 'NAO CONFIGURADO — o "esqueci minha senha" nao envia',
  }[modo]
  logger.info('api', `envio de e-mail: ${caminho}`)

  /* Autenticar e uma coisa, ter permissao e outra: o registro pode
     estar certinho e o envio falhar com 403 porque ninguem concedeu
     Mail.Send. O token responde isso sem mandar e-mail nenhum, e dizer
     aqui poupa a investigacao de "por que o codigo nao chega". */
  if (modo === 'api-microsoft') {
    const check = await diagnostico()
    logger.info('api', `${check.ok ? 'permissao ok:' : 'ATENCAO:'} ${check.motivo}`)
  }
  try {
    const info = await checarConexao()
    logger.info('api', `banco "${info.banco}" conectado.`)
    if (!info.tem_tabela) {
      logger.warn('api', 'atencao: a tabela "usuario" ainda nao existe — rode db/usuario.sql.txt')
      return
    }
    /* planta o roteiro de fabrica so na primeira vez; depois disso o
       roteiro e do usuario e subir a API de novo nao mexe em nada */
    const plantadas = await plantarRoteiro(pool)
    if (plantadas > 0) logger.info('api', `roteiro de fabrica criado: ${plantadas} etapas.`)
  } catch (erro) {
    if (erro.code === '42P01' || erro.code === '42703') {
      logger.warn(
        'api',
        'atencao: faltam tabelas/colunas novas — rode db/quadro.sql.txt e db/atualizacao.sql.txt',
      )
      return
    }
    logger.error('api', 'falha ao conectar no banco', { message: erro.message })
  }
})
