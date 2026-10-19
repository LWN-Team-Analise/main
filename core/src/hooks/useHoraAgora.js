import { useEffect, useState } from 'react'

const agoraHHMM = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * A hora de agora ('HH:MM'), no relogio de quem esta olhando, que vira
 * sozinha a cada minuto.
 *
 * E o que deixa a aba Frotas acompanhar o rodizio com ela aberta: o
 * aviso entra as 7h, sai as 10h e volta as 17h sem ninguem recarregar.
 * O primeiro tique cai na virada do minuto, e nao 60s depois de abrir.
 */
export default function useHoraAgora() {
  const [agora, setAgora] = useState(agoraHHMM)

  useEffect(() => {
    let relogio
    const virada = setTimeout(() => {
      setAgora(agoraHHMM())
      relogio = setInterval(() => setAgora(agoraHHMM()), 60_000)
    }, 60_000 - (Date.now() % 60_000) + 50)
    return () => {
      clearTimeout(virada)
      clearInterval(relogio)
    }
  }, [])

  return agora
}
