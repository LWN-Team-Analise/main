import 'dotenv/config'
import express from 'express'
import { checarConexao } from './db.js'
import authRouter from './routes/auth.js'
import equipeRouter from './routes/equipe.js'
import dadosRouter from './routes/dados.js'
import roteiroRouter from './routes/roteiro.js'
import botRouter from './routes/bot.js'
import despesasRouter from './routes/despesas.js'
import frotasRouter from './routes/frotas.js'
import atividadesRouter from './routes/atividades.js'
import pushRouter from './routes/push.js'
import comercialRouter from './routes/comercial.js'
import presencaRouter from './routes/presenca.js'
import turnosRouter from './routes/turnos.js'
import sharepointRouter from './routes/sharepoint.js'
import cargaRouter, { cargaJunto } from './carga.js'
import { logger } from './logger.js'

/**
 * A API — so as rotas, sem servidor nenhum em volta.
 *
 * A separacao existe por causa da hospedagem. Na maquina local um
 * processo fica ouvindo a porta 3001 e atende tudo; na Vercel nao ha
 * processo nenhum parado esperando — cada chamada acorda uma funcao,
 * que recebe o pedido pronto e devolve a resposta.
 *
 * Os dois caminhos montam ESTE mesmo `app`:
 *
 *   server/index.js -> da um listen nele (desenvolvimento);
 *   api/index.js    -> entrega ele para a Vercel (producao).
 *
 * Como as rotas sao as mesmas, o que funciona num funciona no outro —
 * e nao ha uma "versao de producao" do comportamento para ninguem
 * descobrir quebrada depois do deploy.
 */

const app = express()

/* o "X-Powered-By: Express" so conta a quem procura brecha o que esta
   rodando aqui */
app.disable('x-powered-by')

/* Cabecalhos de seguranca de toda resposta da API:
     nosniff      o navegador nao "adivinha" que um JSON e HTML;
     no-store     resposta com dado da empresa nao fica no cache do
                  navegador nem de proxy no caminho;
     DENY         a API nao abre dentro de moldura de outro site.
   Os da PAGINA (CSP, HSTS...) ficam no vercel.json. */
app.use('/api', (_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  })
  next()
})

/* O login e o "esqueci minha senha" abrem sem sessao: ali o corpo fica
   pequeno, para ninguem fazer o servidor ler 8 MB por tentativa. (O
   parser de baixo ve o corpo ja lido e nao le de novo.) */
app.use('/api/auth', express.json({ limit: '32kb' }))

// foto de perfil e logo de cliente viajam como data URL: o limite
// padrao do express (100kb) barraria qualquer imagem de verdade
app.use(express.json({ limit: '8mb' }))

app.get('/api/health', async (_req, res) => {
  try {
    const info = await checarConexao()
    res.json({ ok: true, ...info })
  } catch (erro) {
    /* o motivo fica no log: a resposta e publica, e o texto do erro do
       banco conta host, usuario e versao a quem perguntar */
    logger.error('api/health', erro.message)
    res.status(503).json({ ok: false })
  }
})

/* a gravacao que pede (X-Carga: leve) volta com a carga junto — ver
   server/carga.js. Fica antes das rotas para valer em todas elas. */
app.use(cargaJunto)

app.use('/api/carga', cargaRouter)
app.use('/api/auth', authRouter)
app.use('/api/equipe', equipeRouter)
app.use('/api/dados', dadosRouter)
app.use('/api/roteiro', roteiroRouter)
app.use('/api/bot', botRouter)
app.use('/api/despesas', despesasRouter)
app.use('/api/frotas', frotasRouter)
app.use('/api/atividades', atividadesRouter)
app.use('/api/push', pushRouter)
app.use('/api/comercial', comercialRouter)
app.use('/api/presenca', presencaRouter)
app.use('/api/turnos', turnosRouter)
app.use('/api/sharepoint', sharepointRouter)

app.use((erro, req, res, _next) => {
  /* imagem grande demais chegava aqui como 500 sem explicacao, e a tela
     so dizia "nao foi possivel". Agora o recado diz o que houve. */
  if (erro.type === 'entity.too.large') {
    return res.status(413).json({
      erro: req.path.startsWith('/api/auth')
        ? 'O pedido veio grande demais.'
        : 'A imagem é grande demais para ser salva. Escolha uma menor.',
    })
  }
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'O conteúdo enviado veio corrompido.' })
  }
  logger.error('api', erro.message, { type: erro.type })
  return res.status(500).json({ erro: 'Erro interno no servidor.' })
})

export default app
