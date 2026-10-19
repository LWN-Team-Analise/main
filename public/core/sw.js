/* ============================================================
   Service worker do Atmosfera LWN — SO as notificacoes no celular.

   Nao guarda pagina nenhuma em cache: o app continua sempre buscando
   a versao nova no servidor. O que ele faz:

     push               chega uma notificacao do servidor
                        (core/server/push.js) e ela aparece na tela,
                        mesmo com o app fechado; as abas abertas ficam
                        sabendo (para o contador do chat andar na hora)
     notificationclick  o toque na notificacao abre o app na tela dela
                        (o chat, a obra...) ou traz para frente a aba
                        que ja estava aberta

   Escopo: /core/ (registrado em core/src/main.jsx).
   ============================================================ */

const ICONE = '/core/icone-app-192.png'
const SELO = '/core/icone-notificacao.png'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()))

self.addEventListener('push', (evento) => {
  let dados = {}
  try {
    dados = evento.data ? evento.data.json() : {}
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : '' }
  }
  const titulo = dados.titulo || 'Atmosfera LWN'
  evento.waitUntil(
    (async () => {
      await self.registration.showNotification(titulo, {
        body: dados.corpo || '',
        icon: ICONE,
        badge: SELO,
        tag: dados.tag || undefined,
        /* a mesma conversa substitui a notificacao anterior, mas avisa de novo */
        renotify: Boolean(dados.tag),
        data: { url: dados.url || '/core/app' },
      })
      const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      abertas.forEach((aba) => aba.postMessage({ tipo: 'push', tag: dados.tag || null }))
    })(),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const url = new URL(evento.notification.data?.url || '/core/app', self.location.origin).href
  evento.waitUntil(
    (async () => {
      const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const doApp = abertas.find((aba) => new URL(aba.url).pathname.startsWith('/core/'))
      if (doApp) {
        await doApp.focus()
        /* a aba aberta troca de tela sozinha, sem recarregar o app */
        doApp.postMessage({ tipo: 'abrir', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
