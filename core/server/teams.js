/**
 * Mensagem no Teams, pela automacao do Workflows (Power Automate).
 *
 * O Teams nao deixa um aplicativo mandar mensagem de chat para uma
 * pessoa so com as credenciais de cliente (as do e-mail, em graph.js):
 * o Graph so manda mensagem de chat em nome de alguem logado. O caminho
 * que a Microsoft deixa aberto e o fluxo do Workflows:
 *
 *   gatilho  "Quando uma solicitacao de webhook do Teams for recebida"
 *            (quem pode disparar: qualquer pessoa) — o site chama a URL;
 *   acao     "Postar cartao em um chat ou canal", como "Bot de fluxo",
 *            em "Chat com o bot de fluxo", para o destinatario
 *            triggerBody()?['para'], com o cartao
 *            triggerBody()?['attachments'][0]['content'].
 *
 * A pessoa recebe a mensagem no chat do "Workflows" no Teams. O passo a
 * passo esta no README (Notificacoes no Teams).
 *
 * O .env precisa so da URL do gatilho:
 *
 *   TEAMS_WEBHOOK_URL=https://...   (a URL tem assinatura: e um segredo)
 *
 * Sem ela, `teamsConfigurado()` e false e nenhum envio e tentado — o
 * resto do sistema segue igual.
 */
import { query } from './db.js'
import { logger } from './logger.js'

const URL_FLUXO = process.env.TEAMS_WEBHOOK_URL || ''
const SITE = (process.env.APP_URL || 'https://www.lwnengenharia.com.br').replace(/\/+$/, '')

export const teamsConfigurado = () => Boolean(URL_FLUXO)

/** O endereco completo de uma tela do sistema, para o botao do cartao. */
export const linkDoSite = (caminho = '/core/app') => `${SITE}${caminho.startsWith('/') ? caminho : `/${caminho}`}`

/* o cartao (Adaptive Card 1.4): o selo de mensagem automatica, o titulo,
   as linhas e o botao para abrir no site */
function cartao({ titulo, linhas, link, rotuloLink }) {
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      { type: 'TextBlock', text: 'Mensagem automática · Atmosfera LWN', size: 'Small', isSubtle: true, wrap: true },
      { type: 'TextBlock', text: titulo, weight: 'Bolder', size: 'Medium', wrap: true },
      ...linhas.filter(Boolean).map((texto) => ({ type: 'TextBlock', text: texto, wrap: true, spacing: 'Small' })),
    ],
    actions: link ? [{ type: 'Action.OpenUrl', title: rotuloLink || 'Abrir no site', url: link }] : [],
  }
}

/* uma chamada ao fluxo; o Workflows responde 202 na hora e posta depois */
async function postar(para, mensagem) {
  const resposta = await fetch(URL_FLUXO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'message',
      para,
      titulo: mensagem.titulo,
      texto: mensagem.linhas.filter(Boolean).join('\n\n'),
      link: mensagem.link ?? null,
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: cartao(mensagem) }],
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!resposta.ok) throw new Error(`o fluxo respondeu ${resposta.status}`)
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
  if (!teamsConfigurado()) return { enviados: 0 }
  const ids = [...new Set((usuarioIds ?? []).map(String))].filter((id) => id && id !== String(exceto ?? ''))
  if (ids.length === 0) return { enviados: 0 }

  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.cargo, coalesce(nullif(u.outlook_email, ''), u.email) AS email
         FROM usuario u
         LEFT JOIN cargo c ON c.id = u.cargo_id
        WHERE u.id = ANY($1::bigint[]) AND coalesce(u.ativo, true)
          AND NOT coalesce((to_jsonb(c) ->> 'painel_tv')::boolean, false)`,
      [ids],
    )
    const envios = rows
      .filter((p) => p.email)
      .map((p) => {
        const mensagem = typeof montar === 'function' ? montar({ id: String(p.id), nome: p.name, setor: p.cargo }) : montar
        if (!mensagem) return null
        return postar(p.email, { ...mensagem, linhas: mensagem.linhas ?? [] }).then(
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
