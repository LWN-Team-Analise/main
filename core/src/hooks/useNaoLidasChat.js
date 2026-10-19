import { useCallback, useEffect, useState } from 'react'
import { naoLidasDoChat } from '@/services/dadosService'

/* de quanto em quanto tempo o numero e conferido com a aba aberta */
const INTERVALO = 45_000

/** O evento que a tela do chat dispara quando marca tudo como lido. */
export const CHAT_LIDO = 'atmosfera:chat-lido'

/**
 * Quantas mensagens do chat da equipe a pessoa ainda nao leu — o
 * numero do botao do chat.
 *
 * Confere ao abrir, a cada 45s com a aba visivel, quando a aba volta a
 * ficar visivel e na hora em que chega uma notificacao do chat (o
 * service worker avisa as abas abertas). Zera quando a tela do chat
 * marca as mensagens como lidas.
 */
export default function useNaoLidasChat(ativo = true) {
  const [naoLidas, setNaoLidas] = useState(0)

  const conferir = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    try {
      setNaoLidas(await naoLidasDoChat())
    } catch {
      /* sem rede, o numero fica como estava */
    }
  }, [])

  useEffect(() => {
    if (!ativo) return undefined
    conferir()
    const relogio = setInterval(conferir, INTERVALO)
    const visivel = () => document.visibilityState === 'visible' && conferir()
    const lido = () => setNaoLidas(0)
    const doServiceWorker = (e) => {
      if (e.data?.tipo === 'push' && e.data.tag === 'chat-equipe') conferir()
    }
    document.addEventListener('visibilitychange', visivel)
    window.addEventListener(CHAT_LIDO, lido)
    navigator.serviceWorker?.addEventListener('message', doServiceWorker)
    return () => {
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', visivel)
      window.removeEventListener(CHAT_LIDO, lido)
      navigator.serviceWorker?.removeEventListener('message', doServiceWorker)
    }
  }, [ativo, conferir])

  return naoLidas
}
