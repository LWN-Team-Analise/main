/**
 * Mensagem no Teams, mandada pela conta da empresa no chat 1:1 com cada
 * pessoa — a conta de TEAMS_REMETENTE (por padrao
 * lwnteamanalise@lwnengenharia.com.br).
 *
 * O Graph so manda mensagem de chat em nome de uma PESSOA (permissao
 * delegada; com as credenciais de aplicativo, as do e-mail, nao da). Por
 * isso a conta e CONECTADA uma vez: em Configuracoes > Notificacoes no
 * Teams, alguem com acesso total clica em "Conectar a conta" e entra com
 * ela na janela da Microsoft (a mesma do login com Outlook, com o MFA de
 * sempre). O servidor guarda o token de renovacao — cifrado com o
 * JWT_SECRET — em configuracao ('teams_remetente') e, a cada aviso, pega
 * um token novo, abre (ou reaproveita) o chat 1:1 com a pessoa e posta.
 *
 * No Entra ID, o mesmo aplicativo do login com Outlook precisa das
 * permissoes DELEGADAS do Microsoft Graph Chat.Create e ChatMessage.Send,
 * com o consentimento do administrador (passo a passo no README).
 *
 * Sem a conta conectada nada e enviado, e o resto do sistema segue igual.
 */
import crypto from 'node:crypto'
import { query } from './db.js'
import { logger } from './logger.js'
import { SEGREDO } from './sessao.js'

const CLIENTE = process.env.OUTLOOK_CLIENT_ID
const SEGREDO_APP = process.env.OUTLOOK_CLIENT_SECRET
const INQUILINO = process.env.OUTLOOK_TENANT || 'organizations'
const BASE = `https://login.microsoftonline.com/${INQUILINO}/oauth2/v2.0`
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SITE = (process.env.APP_URL || 'https://www.lwnengenharia.com.br').replace(/\/+$/, '')

/** A conta que manda as mensagens. */
export const REMETENTE = (process.env.TEAMS_REMETENTE || 'lwnteamanalise@lwnengenharia.com.br').trim().toLowerCase()

/* o que a conta concede: quem ela e, abrir chat e mandar mensagem */
const ESCOPOS = 'openid profile email offline_access User.Read Chat.Create ChatMessage.Send'
const ESCOPOS_RENOVAR = 'offline_access User.Read Chat.Create ChatMessage.Send'
const CHAVE = 'teams_remetente'

/** O endereco completo de uma tela do sistema, para o link da mensagem. */
export const linkDoSite = (caminho = '/core/app') => `${SITE}${caminho.startsWith('/') ? caminho : `/${caminho}`}`

/* ---------------- o token guardado, cifrado ---------------- */

const chaveCifra = () => crypto.createHash('sha256').update(`${SEGREDO}:teams`).digest()

function cifrar(texto) {
  const iv = crypto.randomBytes(12)
  const cifra = crypto.createCipheriv('aes-256-gcm', chaveCifra(), iv)
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return [iv, cifra.getAuthTag(), dados].map((b) => b.toString('base64url')).join('.')
}

function decifrar(pacote) {
  const [iv, etiqueta, dados] = String(pacote).split('.').map((p) => Buffer.from(p, 'base64url'))
  const decifra = crypto.createDecipheriv('aes-256-gcm', chaveCifra(), iv)
  decifra.setAuthTag(etiqueta)
  return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8')
}

async function lerConexao() {
  try {
    const { rows } = await query('SELECT valor FROM configuracao WHERE chave = $1', [CHAVE])
    return rows[0] ? JSON.parse(rows[0].valor) : null
  } catch (erro) {
    if (erro.code !== '42P01') logger.error('teams', erro.message)
    return null
  }
}

async function gravarConexao(conexao) {
  await query(
    `INSERT INTO configuracao (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [CHAVE, JSON.stringify(conexao)],
  )
}

/* ---------------- conectar a conta (uma vez) ---------------- */

/** O aplicativo da Microsoft esta configurado (o mesmo do login com Outlook)? */
export const appConfigurado = () => Boolean(CLIENTE && SEGREDO_APP)

/** A janela da Microsoft para entrar com a conta que manda as mensagens. */
export function urlDeConexao({ redirecionar, estado }) {
  const parametros = new URLSearchParams({
    client_id: CLIENTE,
    response_type: 'code',
    redirect_uri: redirecionar,
    response_mode: 'query',
    scope: ESCOPOS,
    state: estado,
    login_hint: REMETENTE,
    prompt: 'select_account',
  })
  return `${BASE}/authorize?${parametros}`
}

async function pedirToken(campos) {
  const resposta = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENTE, client_secret: SEGREDO_APP, ...campos }),
    signal: AbortSignal.timeout(10000),
  })
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    const erro = new Error(corpo?.error_description?.split('\r\n')[0] ?? 'A Microsoft recusou o pedido.')
    erro.codigo = corpo?.error
    throw erro
  }
  return corpo
}

/**
 * Troca o code da janela pelos tokens, confere que a conta e a de
 * REMETENTE e guarda a conexao. Devolve { email, nome }.
 */
export async function conectarRemetente({ codigo, redirecionar, porId }) {
  const tokens = await pedirToken({ grant_type: 'authorization_code', code: codigo, redirect_uri: redirecionar, scope: ESCOPOS })
  if (!tokens.refresh_token) throw new Error('A Microsoft não devolveu a permissão de uso contínuo (offline_access).')
  const resposta = await fetch(`${GRAPH}/me?$select=id,displayName,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const eu = await resposta.json().catch(() => null)
  if (!resposta.ok || !eu?.id) throw new Error('Não foi possível ler a conta da Microsoft.')
  const email = String(eu.mail || eu.userPrincipalName || '').toLowerCase()
  if (email !== REMETENTE && String(eu.userPrincipalName ?? '').toLowerCase() !== REMETENTE) {
    throw new Error(`Entre com a conta ${REMETENTE} (você entrou com ${email || 'outra conta'}).`)
  }
  await gravarConexao({
    id: eu.id,
    email,
    nome: eu.displayName ?? email,
    refresh: cifrar(tokens.refresh_token),
    conectadoEm: new Date().toISOString(),
    conectadoPor: porId ? String(porId) : null,
    erro: null,
  })
  guardado = { token: tokens.access_token, vence: Date.now() + (Number(tokens.expires_in ?? 3600) - 60) * 1000 }
  return { email, nome: eu.displayName ?? email }
}

/** Para a tela: o app esta configurado? a conta esta conectada? */
export async function estadoDoTeams() {
  const conexao = await lerConexao()
  return {
    appConfigurado: appConfigurado(),
    remetente: REMETENTE,
    conectado: Boolean(conexao?.refresh) && !conexao?.erro,
    email: conexao?.email ?? null,
    conectadoEm: conexao?.conectadoEm ?? null,
    erro: conexao?.erro ?? null,
  }
}

/* ---------------- mandar ---------------- */

/* o token de acesso vale cerca de uma hora: guardado, poupa uma ida a
   Microsoft por aviso (a folga de 60s cobre o relogio fora de hora) */
let guardado = { token: null, vence: 0 }

async function tokenDoRemetente(conexao) {
  if (guardado.token && Date.now() < guardado.vence) return guardado.token
  try {
    const tokens = await pedirToken({
      grant_type: 'refresh_token',
      refresh_token: decifrar(conexao.refresh),
      scope: ESCOPOS_RENOVAR,
    })
    guardado = { token: tokens.access_token, vence: Date.now() + (Number(tokens.expires_in ?? 3600) - 60) * 1000 }
    /* a Microsoft troca o token de renovacao: o novo e o que vale daqui pra frente */
    if (tokens.refresh_token) await gravarConexao({ ...conexao, refresh: cifrar(tokens.refresh_token), erro: null })
    return guardado.token
  } catch (erro) {
    /* a senha da conta mudou, o acesso foi revogado ou passou 90 dias sem uso:
       a tela pede para conectar de novo */
    if (erro.codigo === 'invalid_grant') await gravarConexao({ ...conexao, erro: erro.message })
    logger.error('teams', `token da conta ${conexao.email}: ${erro.message}`)
    return null
  }
}

async function chamarGraph(token, caminho, corpo) {
  const resposta = await fetch(`${GRAPH}${caminho}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10000),
  })
  const json = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new Error(`${resposta.status} ${json?.error?.code ?? ''} ${json?.error?.message ?? ''}`.trim())
  return json
}

/* o chat 1:1 da conta com a pessoa: o Graph devolve o que ja existe */
const chats = new Map()
async function chatCom(token, remetenteId, email) {
  if (chats.has(email)) return chats.get(email)
  const membro = (quem) => ({
    '@odata.type': '#microsoft.graph.aadUserConversationMember',
    roles: ['owner'],
    'user@odata.bind': `${GRAPH}/users('${quem}')`,
  })
  const chat = await chamarGraph(token, '/chats', { chatType: 'oneOnOne', members: [membro(remetenteId), membro(email)] })
  chats.set(email, chat.id)
  return chat.id
}

const escapar = (texto) =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/* "**negrito**" e as linhas "- item" das mensagens de avisosObra.js */
const linhaEmHtml = (linha) =>
  escapar(linha)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .split('\n')
    .map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l))
    .join('<br>')

function mensagemEmHtml({ titulo, linhas, link, rotuloLink }) {
  return [
    '<p><em>Mensagem automática · Atmosfera LWN</em></p>',
    `<p><strong>${escapar(titulo)}</strong></p>`,
    ...(linhas ?? []).filter(Boolean).map((l) => `<p>${linhaEmHtml(l)}</p>`),
    link ? `<p><a href="${escapar(link)}">${escapar(rotuloLink || 'Abrir no site')}</a></p>` : '',
    '<p><em>Não responda esta mensagem.</em></p>',
  ].join('')
}

/**
 * Manda a mensagem no Teams para cada pessoa de `usuarioIds` (menos
 * `exceto`). `montar` e a mensagem — { titulo, linhas, link, rotuloLink }
 * — ou uma funcao (pessoa) => mensagem, para personalizar ("suas
 * tarefas"); devolver null pula a pessoa.
 *
 * O endereco e o da conta Microsoft da pessoa (o Outlook vinculado) ou,
 * sem ele, o e-mail do cadastro. Espera os envios (na Vercel, o que fica
 * pendente depois da resposta pode nao sair) e nunca derruba quem chamou.
 */
export async function mandarNoTeams(usuarioIds, montar, { exceto = null } = {}) {
  if (!appConfigurado()) return { enviados: 0 }
  const ids = [...new Set((usuarioIds ?? []).map(String))].filter((id) => id && id !== String(exceto ?? ''))
  if (ids.length === 0) return { enviados: 0 }

  try {
    const conexao = await lerConexao()
    if (!conexao?.refresh || conexao.erro) return { enviados: 0 }
    const token = await tokenDoRemetente(conexao)
    if (!token) return { enviados: 0 }

    const { rows } = await query(
      `SELECT u.id, u.name, u.cargo, lower(coalesce(nullif(u.outlook_email, ''), u.email)) AS email
         FROM usuario u
         LEFT JOIN cargo c ON c.id = u.cargo_id
        WHERE u.id = ANY($1::bigint[]) AND coalesce(u.ativo, true)
          AND NOT coalesce((to_jsonb(c) ->> 'painel_tv')::boolean, false)`,
      [ids],
    )
    const envios = rows
      /* a propria conta nao conversa com ela mesma */
      .filter((p) => p.email && p.email !== conexao.email)
      .map((p) => {
        const mensagem = typeof montar === 'function' ? montar({ id: String(p.id), nome: p.name, setor: p.cargo }) : montar
        if (!mensagem) return null
        return chatCom(token, conexao.id, p.email)
          .then((chatId) => chamarGraph(token, `/chats/${chatId}/messages`, { body: { contentType: 'html', content: mensagemEmHtml(mensagem) } }))
          .then(
            () => true,
            (erro) => {
              logger.warn('teams', `mensagem para ${p.id} nao saiu (${erro.message})`)
              return false
            },
          )
      })
      .filter(Boolean)
    const feitos = await Promise.all(envios)
    return { enviados: feitos.filter(Boolean).length }
  } catch (erro) {
    logger.error('teams', erro.message)
    return { enviados: 0 }
  }
}
