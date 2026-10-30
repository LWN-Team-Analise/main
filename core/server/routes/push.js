import crypto from 'node:crypto'
import { Router } from 'express'
import { query } from '../db.js'
import { exigeSessao, meuCargo, tratar } from '../sessao.js'
import { chavePublica, notificar, pushConfigurado } from '../push.js'
import { appConfigurado, conectarRemetente, estadoDoTeams, linkDoSite, mandarNoTeams, urlDeConexao } from '../teams.js'
import { avisarSenhaPadrao } from '../avisosConta.js'

/* ============================================================
   /api/push — ligar e desligar as notificacoes de um aparelho

     GET    /chave      a chave publica VAPID ({ chave } ou { chave: null }
                        quando o servidor nao tem as chaves)
     POST   /inscricao  { inscricao: { endpoint, keys: { p256dh, auth } },
                          aparelho } — liga neste aparelho
     POST   /desligar   { endpoint } — desliga neste aparelho
     POST   /teste      manda uma notificacao de teste para os aparelhos
                        de quem pediu
     GET    /teams      { appConfigurado, remetente, conectado, email,
                        conectadoEm, erro } — a conta que manda as
                        mensagens no Teams (server/teams.js)
     POST   /teams/conexao/inicio  { redirecionar } — a janela da Microsoft
                        para conectar essa conta (so acesso total)
     POST   /teams/conexao  { codigo, redirecionar } — guarda a conexao
                        (so acesso total)
     POST   /teams/teste  manda uma mensagem de teste no Teams para quem
                        pediu
     POST   /teams/senha-padrao  pede no Teams, a quem entra pelo Outlook e
                        ainda tem a senha padrao, para trocar (so acesso total)

   O mesmo endpoint de outro usuario (o celular trocou de dono, ou
   outra pessoa entrou nele) passa para quem ligou por ultimo.
   ============================================================ */

const router = Router()

const SEM_TABELA = 'As notificações ainda não existem no banco (atualização 26).'

router.get('/chave', exigeSessao, (_req, res) => res.json({ chave: chavePublica() }))

router.post('/inscricao', exigeSessao, async (req, res) => {
  const i = req.body?.inscricao ?? {}
  const endpoint = String(i.endpoint ?? '')
  const p256dh = String(i.keys?.p256dh ?? '')
  const auth = String(i.keys?.auth ?? '')
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return res.status(400).json({ erro: 'Inscrição de notificação inválida.' })
  }
  if (!pushConfigurado) return res.status(503).json({ erro: 'As notificações não estão configuradas no servidor.' })
  try {
    await query(
      `INSERT INTO push_inscricao (usuario_id, endpoint, p256dh, auth, aparelho)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
          SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh,
              auth = EXCLUDED.auth, aparelho = EXCLUDED.aparelho, criado_em = now()`,
      [req.dono.sub, endpoint, p256dh, auth, String(req.body?.aparelho ?? '').slice(0, 120) || null],
    )
    return res.status(201).json({ ok: true })
  } catch (e) {
    if (e.code === '42P01') return res.status(503).json({ erro: SEM_TABELA })
    return tratar(e, res, 'push/inscrever')
  }
})

router.post('/desligar', exigeSessao, async (req, res) => {
  const endpoint = String(req.body?.endpoint ?? '')
  try {
    if (endpoint) {
      await query('DELETE FROM push_inscricao WHERE endpoint = $1 AND usuario_id = $2', [endpoint, req.dono.sub])
    }
    return res.json({ ok: true })
  } catch (e) {
    if (e.code === '42P01') return res.json({ ok: true })
    return tratar(e, res, 'push/desinscrever')
  }
})

router.post('/teste', exigeSessao, async (req, res) => {
  try {
    const { enviados } = await notificar([req.dono.sub], {
      titulo: 'Atmosfera LWN',
      corpo: 'As notificações estão funcionando neste aparelho.',
      url: '/core/app/configuracoes',
      tag: 'teste',
    })
    return res.json({ enviados })
  } catch (e) {
    return tratar(e, res, 'push/teste')
  }
})

/* conectar a conta que manda as mensagens e decisao da diretoria */
async function soAcessoTotal(req, res, next) {
  const meu = await meuCargo(req.dono.sub).catch(() => null)
  if (!meu?.acessoTotal) return res.status(403).json({ erro: 'Só quem tem acesso total conecta a conta do Teams.' })
  return next()
}

router.get('/teams', exigeSessao, async (_req, res) => {
  try {
    return res.json(await estadoDoTeams())
  } catch (e) {
    return tratar(e, res, 'push/teams')
  }
})

router.post('/teams/conexao/inicio', exigeSessao, soAcessoTotal, (req, res) => {
  if (!appConfigurado()) {
    return res.status(503).json({ erro: 'O login com a Microsoft ainda não foi configurado no servidor (OUTLOOK_CLIENT_ID).' })
  }
  const redirecionar = String(req.body?.redirecionar ?? '').trim()
  if (!redirecionar) return res.status(400).json({ erro: 'Endereço de retorno não informado.' })
  const estado = crypto.randomBytes(16).toString('base64url')
  return res.json({ url: urlDeConexao({ redirecionar, estado }), estado })
})

router.post('/teams/conexao', exigeSessao, soAcessoTotal, async (req, res) => {
  try {
    const conta = await conectarRemetente({
      codigo: String(req.body?.codigo ?? ''),
      redirecionar: String(req.body?.redirecionar ?? ''),
      porId: req.dono.sub,
    })
    return res.json({ ok: true, ...conta })
  } catch (e) {
    return res.status(400).json({ erro: e.message })
  }
})

router.post('/teams/teste', exigeSessao, async (req, res) => {
  try {
    if (!(await estadoDoTeams()).conectado) return res.json({ enviados: 0, conectado: false })
    const { enviados } = await mandarNoTeams([req.dono.sub], {
      titulo: 'Teste das notificações',
      linhas: ['As notificações do Atmosfera LWN estão chegando no seu Teams.'],
      link: linkDoSite('/core/app/configuracoes'),
    })
    return res.json({ enviados, conectado: true })
  } catch (e) {
    return tratar(e, res, 'push/teams-teste')
  }
})

router.post('/teams/senha-padrao', exigeSessao, soAcessoTotal, async (req, res) => {
  try {
    if (!(await estadoDoTeams()).conectado) return res.json({ avisados: 0, conectado: false })
    const { avisados } = await avisarSenhaPadrao({ quemPediu: req.dono.sub })
    return res.json({ avisados, conectado: true })
  } catch (e) {
    return tratar(e, res, 'push/teams-senha-padrao')
  }
})

export default router
