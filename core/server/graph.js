/**
 * Envio de e-mail pela API da Microsoft (Graph).
 *
 * Existe porque o caminho antigo parou de funcionar: o tenant da LWN
 * tem o SMTP autenticado DESLIGADO, e o servidor recusa a conta com
 *
 *   535 5.7.139 Authentication unsuccessful,
 *   SmtpClientAuthentication is disabled for the Tenant.
 *
 * A senha estava certa o tempo todo — o que a Microsoft nao aceita
 * mais e login por SMTP. O Graph e a porta que ela deixou aberta: em
 * vez de "conectar na caixa e mandar", o servidor pede um token para o
 * Entra ID e chama /sendMail.
 *
 * O fluxo aqui e o de CREDENCIAIS DE CLIENTE: quem se autentica e o
 * aplicativo, nao uma pessoa. Nao ha tela de login, nao ha senha de
 * caixa e nao ha MFA para atrapalhar — o que existe e uma permissao de
 * aplicativo (Mail.Send) concedida pelo administrador do tenant.
 *
 * O .env precisa de tres valores do registro no Entra ID:
 *
 *   GRAPH_TENANT_ID=...      o ID do diretorio (GUID) ou o dominio
 *   GRAPH_CLIENT_ID=...      o ID do aplicativo
 *   GRAPH_CLIENT_SECRET=...  o valor do segredo do cliente
 *
 * e o MAIL_USUARIO, que e a caixa de onde a mensagem sai.
 *
 * Faltando qualquer um deles, `configurado()` devolve false e o
 * email.js cai no SMTP de antes — que continua servindo para quem
 * roda o sistema fora do tenant da LWN.
 */
import { logger } from './logger.js'

/* Se o registro do Entra ID for o MESMO do login com Outlook, basta
   acrescentar Mail.Send nele e o resto ja esta preenchido. So o tenant
   nao serve: credenciais de cliente exigem o ID do diretorio, e
   'organizations' nao e um diretorio. */
const INQUILINO = process.env.GRAPH_TENANT_ID
const CLIENTE = process.env.GRAPH_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID
const SEGREDO = process.env.GRAPH_CLIENT_SECRET || process.env.OUTLOOK_CLIENT_SECRET
const CAIXA = process.env.MAIL_USUARIO

export function configurado() {
  return Boolean(INQUILINO && CLIENTE && SEGREDO && CAIXA)
}

/** O remetente configurado — o email.js usa nos recados de erro. */
export function caixaDeSaida() {
  return CAIXA
}

/* O token vale cerca de uma hora. Guardar evita uma ida ao Entra ID a
   cada e-mail; a folga de 60s cobre o relogio fora de sincronia. */
let guardado = { token: null, vence: 0 }

async function pegarToken() {
  const agora = Date.now()
  if (guardado.token && agora < guardado.vence) return guardado.token

  const resposta = await fetch(
    `https://login.microsoftonline.com/${INQUILINO}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENTE,
        client_secret: SEGREDO,
        grant_type: 'client_credentials',
        /* .default = "tudo o que o administrador ja concedeu a este
           aplicativo". Nao se pede Mail.Send aqui: a permissao mora no
           registro, nao na chamada. */
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )

  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok || !corpo?.access_token) {
    throw new Error(corpo?.error_description ?? 'O Entra ID recusou as credenciais do aplicativo.')
  }

  guardado = {
    token: corpo.access_token,
    vence: agora + (Number(corpo.expires_in ?? 3600) - 60) * 1000,
  }
  return guardado.token
}

/**
 * Confere se o aplicativo REALMENTE pode mandar e-mail.
 *
 * Autenticar e uma coisa; ter permissao e outra. O registro pode estar
 * certinho, o segredo valido, o token sair na hora — e o envio falhar
 * com 403 porque ninguem concedeu Mail.Send.
 *
 * A resposta esta dentro do proprio token: as permissoes de aplicativo
 * concedidas vem na lista `roles`. Sem Mail.Send ali, nao adianta
 * tentar. Ler isso ao subir a API poupa a investigacao de "por que o
 * e-mail nao chega" — o log ja diz o que falta e onde clicar.
 */
export async function diagnostico() {
  if (!configurado()) return { ok: false, motivo: 'não configurado' }
  try {
    const token = await pegarToken()
    const corpo = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    const papeis = corpo.roles ?? []
    if (!papeis.includes('Mail.Send')) {
      return {
        ok: false,
        motivo:
          'o aplicativo autentica, mas NAO tem a permissao Mail.Send. No Entra ID: ' +
          'Permissoes de API > Adicionar > Microsoft Graph > Permissoes de APLICATIVO > ' +
          'Mail.Send > e depois "Conceder consentimento do administrador".',
      }
    }
    return { ok: true, motivo: `Mail.Send concedida; caixa ${CAIXA}` }
  } catch (erro) {
    return { ok: false, motivo: erro.message }
  }
}

/** Uma ou varias pessoas, no formato que o Graph espera. */
const destinatarios = (para) =>
  (Array.isArray(para) ? para : [para])
    .filter(Boolean)
    .map((endereco) => ({ emailAddress: { address: endereco } }))

/**
 * Manda a mensagem pela caixa configurada.
 *
 * `para` aceita um endereco ou uma lista deles.
 *
 * `embutidas` sao as imagens que aparecem DENTRO do corpo — a logo do
 * cliente no aviso, por exemplo. Elas viajam como anexo com um
 * `contentId`, e o HTML aponta para `cid:aquele-id`. Nao da para
 * simplesmente por a data URL no `src`: Gmail, Outlook Web e a maioria
 * dos clientes descartam `src="data:..."` e a imagem chega quebrada.
 *
 * Cada embutida e { id, tipo, base64 }.
 *
 * Devolve { ok: true } ou { ok: false, motivo } — nunca estoura, para
 * a rota poder decidir o que contar na tela.
 */
export async function enviar({ para, cco, assunto, html, texto, embutidas = [] }) {
  if (!configurado()) {
    return { ok: false, motivo: 'O envio pela API da Microsoft não está configurado.' }
  }

  const alvos = destinatarios(para)
  const ocultos = destinatarios(cco ?? [])
  if (alvos.length === 0) return { ok: false, motivo: 'Nenhum destinatário informado.' }

  try {
    const token = await pegarToken()

    const anexos = embutidas.map((img) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: `${img.id}.png`,
      contentType: img.tipo || 'image/png',
      contentBytes: img.base64,
      contentId: img.id,
      isInline: true,
    }))

    const resposta = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(CAIXA)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: assunto,
            body: { contentType: 'HTML', content: html },
            toRecipients: alvos,
            /* Cco existe para UM caso: a sugestao anonima, que sai da
               caixa do sistema para ela mesma e leva a Excelencia
               escondida. Quem recebe nao ve lista de destinatarios
               nenhuma — nem a propria. */
            ...(ocultos.length > 0 ? { bccRecipients: ocultos } : {}),
            ...(anexos.length > 0 ? { attachments: anexos } : {}),
          },
          /* false = a copia fica em "Itens Enviados" da caixa. E o que
             deixa rastro de que o codigo saiu mesmo. */
          saveToSentItems: true,
        }),
      },
    )

    // 202 Accepted, sem corpo: a Microsoft aceitou e vai entregar
    if (resposta.status === 202) return { ok: true }

    const erro = await resposta.json().catch(() => null)
    const recado = erro?.error?.message ?? `A Microsoft recusou o envio (HTTP ${resposta.status}).`
    logger.error('graph/sendMail', recado, { status: resposta.status })
    return { ok: false, motivo: traduzir(resposta.status, recado) }
  } catch (erro) {
    logger.error('graph/sendMail', erro.message)
    return { ok: false, motivo: 'Não foi possível falar com a API da Microsoft agora.' }
  }
}

/**
 * Os erros que a Microsoft devolve sao para quem programa. Aqui eles
 * viram um recado que a pessoa na tela consegue levar para a diretoria.
 */
function traduzir(status, recado) {
  if (status === 401) {
    return 'O aplicativo não está autorizado no Entra ID. Confira o segredo do cliente (ele vence).'
  }
  if (status === 403) {
    return 'Falta a permissão Mail.Send no aplicativo, ou o consentimento do administrador.'
  }
  if (status === 404) {
    return `A caixa ${CAIXA} não foi encontrada no tenant.`
  }
  return recado
}

/* ============================================================
   E-MAIL COMO A PROPRIA PESSOA — o "Responder?" da aba Comercial

   A mesma permissao de APLICATIVO (Mail.Send) que manda os avisos da
   caixa do sistema manda de QUALQUER caixa do tenant: basta trocar o
   endereco em /users/{caixa}/sendMail. E assim que o site manda o
   e-mail "como se fosse a pessoa": sai da caixa dela, fica nos Itens
   Enviados dela, e o cliente responde para ela.

   Ler a caixa de entrada (achar o ultimo e-mail do contato, saber se
   ele ja foi respondido e responder DENTRO da conversa) e outra
   permissao: Mail.Read (ou Mail.ReadBasic.All). Sem ela, o envio
   continua funcionando — so que como e-mail novo, e nao como resposta.
   ============================================================ */

/** As permissoes de aplicativo concedidas, lidas do proprio token. */
export async function papeis() {
  if (!configurado()) return []
  try {
    const token = await pegarToken()
    const corpo = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return corpo.roles ?? []
  } catch {
    return []
  }
}

/** O aplicativo pode ler as caixas de entrada? */
export async function podeLerCaixas() {
  const lista = await papeis()
  return ['Mail.Read', 'Mail.ReadWrite', 'Mail.ReadBasic.All'].some((p) => lista.includes(p))
}

/** O aplicativo pode mandar e-mail (de qualquer caixa do tenant)? */
export async function podeEnviar() {
  return (await papeis()).includes('Mail.Send')
}

async function chamar(caminho, { metodo = 'GET', corpo } = {}) {
  const token = await pegarToken()
  const resposta = await fetch(`https://graph.microsoft.com/v1.0${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const dados = resposta.status === 202 || resposta.status === 204 ? null : await resposta.json().catch(() => null)
  return { status: resposta.status, ok: resposta.ok, dados }
}

const aspas = (texto) => String(texto ?? '').replace(/'/g, "''")

/**
 * O ultimo e-mail que o contato mandou para a caixa, e se ele ainda
 * espera resposta (nada saiu da caixa naquela conversa depois dele).
 *
 * Devolve null quando nao ha e-mail dele, ou { id, assunto, recebidoEm,
 * previa, aguardando }. Exige permissao de leitura (podeLerCaixas).
 */
export async function ultimoDoContato(caixa, contato) {
  /* com $filter e $orderby juntos, o Graph exige a propriedade da ordem
     tambem no filtro, e na frente — senao responde "too complex" */
  const filtro = `receivedDateTime ge 2000-01-01T00:00:00Z and from/emailAddress/address eq '${aspas(contato)}'`
  const r = await chamar(
    `/users/${encodeURIComponent(caixa)}/messages?$filter=${encodeURIComponent(filtro)}` +
      '&$orderby=receivedDateTime desc&$top=1&$select=id,subject,receivedDateTime,bodyPreview,conversationId',
  )
  if (!r.ok) throw new Error(r.dados?.error?.message ?? `HTTP ${r.status}`)
  const ultima = r.dados?.value?.[0]
  if (!ultima) return null

  const respostas = await chamar(
    `/users/${encodeURIComponent(caixa)}/mailFolders/sentitems/messages?$filter=${encodeURIComponent(
      `conversationId eq '${aspas(ultima.conversationId)}' and sentDateTime gt ${ultima.receivedDateTime}`,
    )}&$top=1&$select=id`,
  )
  const respondida = respostas.ok && (respostas.dados?.value?.length ?? 0) > 0

  return {
    id: ultima.id,
    assunto: ultima.subject ?? '',
    recebidoEm: ultima.receivedDateTime,
    previa: ultima.bodyPreview ?? '',
    aguardando: !respondida,
  }
}

/**
 * Manda o e-mail saindo da caixa da pessoa.
 *
 * Com `emRespostaA` (o id de uma mensagem da caixa dela), vira RESPOSTA
 * naquela conversa — o cliente ve o fio inteiro, como se ela tivesse
 * clicado em Responder no Outlook. Sem ele, e um e-mail novo.
 *
 * Devolve { ok: true } ou { ok: false, motivo } — nunca estoura.
 */
export async function enviarComo({ caixa, para, assunto, html, emRespostaA }) {
  if (!configurado()) {
    return { ok: false, motivo: 'O envio pela API da Microsoft não está configurado no servidor.' }
  }
  const alvos = destinatarios(para)
  if (alvos.length === 0) return { ok: false, motivo: 'Nenhum destinatário informado.' }

  try {
    const r = emRespostaA
      ? await chamar(`/users/${encodeURIComponent(caixa)}/messages/${encodeURIComponent(emRespostaA)}/reply`, {
          metodo: 'POST',
          corpo: { message: { toRecipients: alvos }, comment: html },
        })
      : await chamar(`/users/${encodeURIComponent(caixa)}/sendMail`, {
          metodo: 'POST',
          corpo: {
            message: { subject: assunto, body: { contentType: 'HTML', content: html }, toRecipients: alvos },
            saveToSentItems: true,
          },
        })

    if (r.status === 202) return { ok: true }

    const recado = r.dados?.error?.message ?? `A Microsoft recusou o envio (HTTP ${r.status}).`
    logger.error('graph/enviarComo', recado, { status: r.status })
    if (r.status === 404) {
      return { ok: false, motivo: `A caixa ${caixa} não foi encontrada no Outlook da empresa.` }
    }
    if (r.status === 403) {
      return {
        ok: false,
        motivo:
          'A Microsoft não deixou o site enviar por esta caixa. Confira a permissão Mail.Send do aplicativo (e se há uma política de acesso restringindo as caixas).',
      }
    }
    return { ok: false, motivo: traduzir(r.status, recado) }
  } catch (erro) {
    logger.error('graph/enviarComo', erro.message)
    return { ok: false, motivo: 'Não foi possível falar com a API da Microsoft agora.' }
  }
}
