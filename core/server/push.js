import webpush from 'web-push'
import { query } from './db.js'
import { logger } from './logger.js'

/* ============================================================
   NOTIFICACOES NO CELULAR (web push)

   Cada aparelho em que a pessoa liga as notificacoes (Configuracoes)
   vira uma linha de push_inscricao (atualizacao 26). Para avisar
   alguem, o servidor manda a notificacao para cada aparelho dela, e o
   service worker do app (public/core/sw.js) mostra na tela — mesmo com
   o app fechado.

   As chaves VAPID ficam no .env e na Vercel:
     VAPID_PUBLIC_KEY   vai para o navegador (GET /api/push/chave)
     VAPID_PRIVATE_KEY  fica so aqui
     VAPID_ASSUNTO      o contato de quem manda (o endereco do site)
   Sem elas, nada quebra: a tela diz que as notificacoes nao estao
   configuradas e as rotas de chat seguem normais.

   Mandar notificacao nunca derruba quem chamou: o erro vai para o log.
   ============================================================ */

const publica = process.env.VAPID_PUBLIC_KEY ?? ''
const privada = process.env.VAPID_PRIVATE_KEY ?? ''
const assunto = process.env.VAPID_ASSUNTO || process.env.APP_URL || 'https://www.lwnengenharia.com.br'

export const pushConfigurado = Boolean(publica && privada)

if (pushConfigurado) {
  try {
    webpush.setVapidDetails(assunto, publica, privada)
  } catch (erro) {
    logger.error('push', `chaves VAPID invalidas: ${erro.message}`)
  }
}

export const chavePublica = () => (pushConfigurado ? publica : null)

/* o corpo da notificacao, curto: a tela de bloqueio corta o resto */
const curto = (texto, max = 140) => {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Manda { titulo, corpo, url, tag } para todos os aparelhos das pessoas
 * de `usuarioIds` (menos `exceto`, que e quem causou o aviso).
 *
 * Espera os envios (no maximo uns segundos): na Vercel, o que fica
 * pendente depois da resposta pode nao sair nunca.
 */
export async function notificar(usuarioIds, { titulo, corpo, url, tag }, { exceto = null } = {}) {
  if (!pushConfigurado) return { enviados: 0 }
  const ids = [...new Set((usuarioIds ?? []).map(String))].filter((id) => id && id !== String(exceto ?? ''))
  if (ids.length === 0) return { enviados: 0 }

  try {
    const { rows } = await query(
      `SELECT p.id, p.endpoint, p.p256dh, p.auth
         FROM push_inscricao p JOIN usuario u ON u.id = p.usuario_id
        WHERE p.usuario_id = ANY($1::bigint[]) AND coalesce(u.ativo, true)`,
      [ids],
    )
    if (rows.length === 0) return { enviados: 0 }

    const carga = JSON.stringify({ titulo: curto(titulo, 80), corpo: curto(corpo), url: url ?? '/core/app', tag: tag ?? null })
    const mortas = []
    const enviados = await Promise.all(
      rows.map((r) =>
        webpush
          .sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, carga, {
            TTL: 60 * 60 * 12,
            urgency: 'high',
            timeout: 5000,
          })
          .then(() => r.id)
          .catch((erro) => {
            /* 404/410: o aparelho desinstalou o app ou tirou a permissao */
            if (erro.statusCode === 404 || erro.statusCode === 410) mortas.push(r.id)
            else logger.warn('push', `envio falhou (${erro.statusCode ?? erro.message})`)
            return null
          }),
      ),
    )
    const ok = enviados.filter(Boolean)
    if (mortas.length) await query('DELETE FROM push_inscricao WHERE id = ANY($1::bigint[])', [mortas])
    if (ok.length) await query('UPDATE push_inscricao SET usado_em = now() WHERE id = ANY($1::bigint[])', [ok])
    return { enviados: ok.length }
  } catch (erro) {
    /* banco sem a atualizacao 26: ninguem tem aparelho inscrito */
    if (erro.code !== '42P01') logger.error('push', erro.message)
    return { enviados: 0 }
  }
}

/** Todas as pessoas ativas (para o chat da equipe, que e de todo mundo). */
export async function todosAtivos() {
  const { rows } = await query('SELECT id FROM usuario WHERE coalesce(ativo, true)')
  return rows.map((l) => String(l.id))
}

/** As pessoas ativas dos setores (chaves de cargo) — para os avisos de etapa. */
export async function pessoasDosSetores(chaves) {
  const { rows } = await query(
    'SELECT id FROM usuario WHERE coalesce(ativo, true) AND cargo = ANY($1::text[])',
    [chaves],
  )
  return rows.map((l) => String(l.id))
}
