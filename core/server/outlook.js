/**
 * Conta Microsoft (Outlook).
 *
 * O fluxo e o padrao da Microsoft, em tres passos:
 *
 *   1. a tela abre uma janelinha em `urlDeEntrada()`, no site da
 *      Microsoft, e a pessoa entra com a conta corporativa dela;
 *   2. a Microsoft devolve um `code` para o nosso /outlook;
 *   3. o servidor troca esse code por um token e le o perfil e a foto
 *      em `perfilDoCodigo()`.
 *
 * Nada disso funciona sem um aplicativo registrado no Entra ID (o
 * antigo Azure AD). Os tres valores do registro vao para o .env:
 *
 *   OUTLOOK_CLIENT_ID=...        (ID do aplicativo)
 *   OUTLOOK_CLIENT_SECRET=...    (segredo do cliente)
 *   OUTLOOK_TENANT=...           (ID do diretorio; "organizations" serve)
 *
 * Sem eles, `configurado()` devolve false e a tela mostra o recado em
 * vez do botao — o resto do sistema continua funcionando igual.
 */

const CLIENTE = process.env.OUTLOOK_CLIENT_ID
const SEGREDO = process.env.OUTLOOK_CLIENT_SECRET
const INQUILINO = process.env.OUTLOOK_TENANT || 'organizations'

// Validação de configuração obrigatória
if (!CLIENTE || !SEGREDO) {
  console.warn('[outlook] OUTLOOK_CLIENT_ID e OUTLOOK_CLIENT_SECRET devem ser configurados para login com Outlook')
}

/* o que pedimos da conta: quem e (nome/e-mail) e a foto de perfil */
const ESCOPOS = 'openid profile email offline_access User.Read'

const BASE = () => `https://login.microsoftonline.com/${INQUILINO}/oauth2/v2.0`

export function configurado() {
  return Boolean(CLIENTE && SEGREDO)
}

/** O endereco da tela de login da Microsoft. */
export function urlDeEntrada({ redirecionar, estado }) {
  const parametros = new URLSearchParams({
    client_id: CLIENTE,
    response_type: 'code',
    redirect_uri: redirecionar,
    response_mode: 'query',
    scope: ESCOPOS,
    state: estado,
    // sempre pergunta qual conta usar: evita entrar com a conta errada
    prompt: 'select_account',
  })
  return `${BASE()}/authorize?${parametros}`
}

/** Troca o code pelo token de acesso. */
async function trocarCodigo(codigo, redirecionar) {
  const resposta = await fetch(`${BASE()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENTE,
      client_secret: SEGREDO,
      grant_type: 'authorization_code',
      code: codigo,
      redirect_uri: redirecionar,
      scope: ESCOPOS,
    }),
  })

  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    throw new Error(corpo?.error_description ?? 'A Microsoft recusou a entrada.')
  }
  return corpo.access_token
}

/** A foto de perfil, ja como data URL. Sem foto na conta, devolve null. */
async function buscarFoto(token) {
  try {
    const resposta = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resposta.ok) return null
    const tipo = resposta.headers.get('content-type') || 'image/jpeg'
    const bytes = Buffer.from(await resposta.arrayBuffer())
    // foto de perfil da Microsoft costuma ter menos de 100 KB; acima
    // disso a gente dispensa, para nao inchar a linha do usuario
    if (bytes.length > 1_500_000) return null
    return `data:${tipo};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Quem entrou: nome, e-mail, id da conta e a foto.
 *
 * `mail` e o e-mail de verdade da caixa; contas sem caixa so tem o
 * userPrincipalName, entao um serve de reserva para o outro.
 */
export async function perfilDoCodigo(codigo, redirecionar) {
  const token = await trocarCodigo(codigo, redirecionar)

  const resposta = await fetch(
    'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const perfil = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    throw new Error(perfil?.error?.message ?? 'Não foi possível ler o perfil da conta Microsoft.')
  }

  return {
    id: perfil.id,
    nome: perfil.displayName ?? '',
    email: String(perfil.mail || perfil.userPrincipalName || '').toLowerCase(),
    foto: await buscarFoto(token),
  }
}
