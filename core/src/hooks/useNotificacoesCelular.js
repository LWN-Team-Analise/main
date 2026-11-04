import { useCallback, useEffect, useState } from 'react'
import * as pushApi from '@/services/pushService'

/* ============================================================
   As notificacoes no celular DESTE aparelho (server/push.js e
   public/core/sw.js).

   estado:
     'carregando'       conferindo
     'sem-suporte'      o navegador nao tem notificacao push
     'iphone-instalar'  iPhone: so funciona com o app na Tela de Inicio
     'sem-servidor'     o servidor ainda nao tem as chaves VAPID
     'bloqueado'        a pessoa negou a permissao (so se desfaz nas
                        configuracoes do navegador/celular)
     'desligado'        pode ligar
     'ligado'           este aparelho recebe
   ============================================================ */

const ehIphone = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const instalado = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

const temSuporte = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** A chave publica (base64 url) no formato que o navegador pede. */
function emBytes(base64) {
  const completo = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from([...atob(completo)].map((c) => c.charCodeAt(0)))
}

/** 'Chrome no Android' — so para a pessoa reconhecer o aparelho depois. */
function nomeDoAparelho() {
  const ua = navigator.userAgent
  const sistema = /android/i.test(ua) ? 'Android' : ehIphone() ? 'iPhone' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : 'outro sistema'
  const navegador = /edg\//i.test(ua)
    ? 'Edge'
    : /chrome|crios/i.test(ua)
      ? 'Chrome'
      : /firefox|fxios/i.test(ua)
        ? 'Firefox'
        : /safari/i.test(ua)
          ? 'Safari'
          : 'Navegador'
  return `${navegador} no ${sistema}`
}

async function registro() {
  const ja = await navigator.serviceWorker.getRegistration('/core/')
  if (!ja) await navigator.serviceWorker.register('/core/sw.js', { scope: '/core/' })
  return navigator.serviceWorker.ready
}

/**
 * Inscreve este aparelho (cria a inscricao no navegador se faltar) e a
 * entrega ao servidor, no nome de quem esta logado. So com a permissao
 * ja dada.
 */
async function garantirInscricao(chave) {
  const reg = await registro()
  let inscricao = await reg.pushManager.getSubscription()
  if (!inscricao) {
    try {
      inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: emBytes(chave) })
    } catch (e) {
      /* inscricao velha, de outra chave: sai dela e entra de novo */
      if (e.name !== 'InvalidStateError') throw e
      await (await reg.pushManager.getSubscription())?.unsubscribe()
      inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: emBytes(chave) })
    }
  }
  await pushApi.inscrever(inscricao.toJSON(), nomeDoAparelho())
}

/* ============================================================
   AS NOTIFICACOES AUTOMATICAS: ninguem precisa ir em Configuracoes
   ligar. O AppShell chama, e a conferencia roda uma vez por carga da
   pagina (cada tela monta o proprio AppShell):

     permissao ja dada     confere a inscricao deste aparelho (cria se
                           faltar) e a passa para quem esta logado;
     ainda nao perguntado  pergunta no PRIMEIRO clique ou tecla na tela:
                           o Safari e o Firefox so deixam perguntar a
                           partir de um gesto da pessoa, e perguntar sem
                           gesto faz o Chrome esconder a pergunta. Se a
                           pessoa fechar sem responder, so pergunta de
                           novo em 7 dias;
     bloqueado, sem suporte, iPhone fora do app instalado ou servidor
     sem as chaves         nao faz nada.
   ============================================================ */

let conferidoNestaCarga = false
const PERGUNTADO_EM = 'customers.notificacoes.perguntado'
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000

export function useNotificacoesAutomaticas(logado) {
  useEffect(() => {
    if (!logado || conferidoNestaCarga) return
    conferidoNestaCarga = true
    ;(async () => {
      if (!temSuporte()) return
      const chave = await pushApi.carregarChave().catch(() => null)
      if (!chave) return
      if (Notification.permission === 'granted') {
        await garantirInscricao(chave)
        return
      }
      if (Notification.permission !== 'default') return

      let perguntado = 0
      try {
        perguntado = Number(localStorage.getItem(PERGUNTADO_EM)) || 0
      } catch {
        perguntado = 0
      }
      if (Date.now() - perguntado < SETE_DIAS) return

      /* Os ouvintes ficam na JANELA, e nao no componente: trocar de tela
         desmonta o AppShell, e a pergunta continua esperando o gesto. A
         permissao e pedida ANTES de qualquer await — o navegador so a
         aceita dentro do gesto. */
      const eventos = ['click', 'keydown']
      const perguntar = () => {
        eventos.forEach((nome) => window.removeEventListener(nome, perguntar, true))
        try {
          localStorage.setItem(PERGUNTADO_EM, String(Date.now()))
        } catch {
          /* segue */
        }
        Notification.requestPermission()
          .then((permissao) => (permissao === 'granted' ? garantirInscricao(chave) : null))
          .catch(() => {})
      }
      eventos.forEach((nome) => window.addEventListener(nome, perguntar, true))
    })().catch(() => {})
  }, [logado])
}

export default function useNotificacoesCelular() {
  const [estado, setEstado] = useState('carregando')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const conferir = useCallback(async () => {
    if (!temSuporte()) {
      setEstado(ehIphone() && !instalado() ? 'iphone-instalar' : 'sem-suporte')
      return
    }
    const chave = await pushApi.carregarChave().catch(() => null)
    if (!chave) {
      setEstado('sem-servidor')
      return
    }
    if (Notification.permission === 'denied') {
      setEstado('bloqueado')
      return
    }
    const inscricao = await (await registro()).pushManager.getSubscription()
    if (inscricao && Notification.permission === 'granted') {
      /* o aparelho pode ter trocado de dono: confirma que ele e de quem
         esta logado agora (o servidor passa a inscricao para ele) */
      pushApi.inscrever(inscricao.toJSON(), nomeDoAparelho()).catch(() => {})
      setEstado('ligado')
    } else setEstado('desligado')
  }, [])

  useEffect(() => {
    conferir().catch(() => setEstado('sem-suporte'))
  }, [conferir])

  const ligar = async () => {
    setOcupado(true)
    setErro('')
    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') {
        setEstado(permissao === 'denied' ? 'bloqueado' : 'desligado')
        return
      }
      await garantirInscricao(await pushApi.carregarChave())
      setEstado('ligado')
    } catch (e) {
      setErro(e.message || 'Não foi possível ligar as notificações neste aparelho.')
    } finally {
      setOcupado(false)
    }
  }

  const desligar = async () => {
    setOcupado(true)
    setErro('')
    try {
      const inscricao = await (await registro()).pushManager.getSubscription()
      if (inscricao) {
        await pushApi.desligar(inscricao.endpoint).catch(() => {})
        await inscricao.unsubscribe()
      }
      setEstado('desligado')
    } catch (e) {
      setErro(e.message || 'Não foi possível desligar.')
    } finally {
      setOcupado(false)
    }
  }

  const testar = async () => {
    setErro('')
    try {
      const { enviados } = await pushApi.testar()
      if (!enviados) setErro('O servidor não achou este aparelho. Desligue e ligue de novo.')
      return enviados
    } catch (e) {
      setErro(e.message)
      return 0
    }
  }

  return { estado, ocupado, erro, ligar, desligar, testar }
}
