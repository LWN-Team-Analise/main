import { useEffect, useState } from 'react'
import { carregarPresenca, marcarPresenca, sairDaPresenca } from '@/services/presencaService'

/* ============================================================
   PRESENCA — a bolinha da tela de Usuarios

     verde     a pessoa esta com o sistema aberto e na frente;
     vermelho  aberto, mas em segundo plano (outra aba, janela
               minimizada, celular com outro app na frente);
     cinza     offline: fechou, ou nenhuma aba avisou em 3 minutos.

   Cada aba avisa o servidor a cada minuto e na hora em que fica
   visivel ou vai para segundo plano; fechar a aba avisa na hora.
   ============================================================ */

/* de quanto em quanto tempo a aba aberta avisa que continua ali */
const AVISO = 60_000
/* de quanto em quanto tempo a tela de Usuarios rele as bolinhas */
const LEITURA = 30_000

/* uma por carregamento da pagina: recarregar abre outra (e a velha
   avisa que saiu); duas abas sao duas linhas, e vale a melhor delas */
const ABA =
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

const visivel = () => document.visibilityState === 'visible'

/** Liga os avisos desta aba enquanto `ligado` (a pessoa esta logada). */
export default function usePresenca(ligado) {
  useEffect(() => {
    if (!ligado) return undefined
    let adiado = 0
    const avisar = () => marcarPresenca(ABA, visivel())
    /* Indo para segundo plano, o aviso espera meio segundo. Fechar a aba
       tambem dispara "segundo plano" — e logo antes do pagehide. Sem a
       espera, esse aviso chegava ao servidor DEPOIS do "saiu" e
       recriava a linha: a pessoa fechava o site e ficava vermelha por
       3 minutos. Com ela, o pagehide cancela o aviso antes de ele sair. */
    const mudou = () => {
      clearTimeout(adiado)
      if (visivel()) avisar()
      else adiado = setTimeout(avisar, 500)
    }
    /* voltou do cache de paginas (botao "voltar" depois de sair do site) */
    const voltou = (e) => e.persisted && avisar()
    const saiu = () => {
      clearTimeout(adiado)
      sairDaPresenca(ABA)
    }

    avisar()
    const relogio = setInterval(avisar, AVISO)
    document.addEventListener('visibilitychange', mudou)
    window.addEventListener('pageshow', voltou)
    window.addEventListener('pagehide', saiu)
    return () => {
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', mudou)
      window.removeEventListener('pageshow', voltou)
      window.removeEventListener('pagehide', saiu)
      /* desligou porque a pessoa saiu da conta */
      saiu()
    }
  }, [ligado])
}

/**
 * A presenca da equipe: { [usuarioId]: 'ativo' | 'segundo_plano' }.
 * Rele a cada 30 s com a tela visivel e quando ela volta a ficar visivel.
 */
export function usePresencaDaEquipe() {
  const [presenca, setPresenca] = useState({})

  useEffect(() => {
    let vivo = true
    const ler = async () => {
      if (!visivel()) return
      try {
        const lida = await carregarPresenca()
        if (vivo) setPresenca(lida)
      } catch {
        /* sem rede, as bolinhas ficam como estavam */
      }
    }
    ler()
    const relogio = setInterval(ler, LEITURA)
    document.addEventListener('visibilitychange', ler)
    return () => {
      vivo = false
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', ler)
    }
  }, [])

  return presenca
}
