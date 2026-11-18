import { useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import { CHECK_RESERVA, podeReservarCarro } from '@/domain/obras'
import ModalReserva from '@/pages/Obras/ModalReserva'

/**
 * A RESERVA DO CARRO aberta fora da obra (atualizacao 59): o calendario
 * da Localizacao (Frotas) e o cronograma de Turnos usam o MESMO pop-up da
 * obra (ModalReserva) — escolher, trocar ou tirar o carro dos dias da
 * execucao —, com as mesmas regras: quem reserva e o supervisor ou o
 * acesso total; quem concede e quem tem `conceder_carro`.
 *
 * `obraId` null = fechado. Obra sem o check "Reserva de carro" no roteiro
 * (as de antes da atualizacao 23) nao abre: la a reserva nao existe.
 */
export default function ReservarCarro({ obraId, aoFechar, aoMudou }) {
  const { user } = useAuth()
  const { obraPorId, roteiroDaObra, equipe, pode, recarregar } = useDados()
  const obra = obraId ? obraPorId(obraId) : null

  const check = useMemo(() => {
    if (!obra) return null
    for (const etapa of roteiroDaObra(obra)) {
      for (const card of etapa.cards ?? []) {
        const achado = (card.checks ?? []).find((k) => k.tipo === CHECK_RESERVA)
        if (achado) return achado
      }
    }
    return null
  }, [obra, roteiroDaObra])

  const cargoTitulo = equipe.find((p) => p.souEu)?.cargoTitulo ?? user?.cargoTitulo
  const aberta = Boolean(obra && !obra.concluidaEm)

  return (
    <ModalReserva
      aberto={aberta && Boolean(check)}
      obra={obra}
      check={check}
      nomeCard="Reserva pelo calendário"
      podeReservar={aberta && podeReservarCarro(user, cargoTitulo)}
      podeConceder={aberta && pode('conceder_carro')}
      aoMudou={async () => {
        await recarregar()
        await aoMudou?.()
      }}
      aoFechar={aoFechar}
    />
  )
}

/** A obra aberta tem a reserva de carro no roteiro dela? (o botao so aparece com ela) */
export function temReservaNoRoteiro(obra, roteiroDaObra) {
  if (!obra || obra.concluidaEm) return false
  return roteiroDaObra(obra).some((etapa) =>
    (etapa.cards ?? []).some((card) => (card.checks ?? []).some((k) => k.tipo === CHECK_RESERVA)),
  )
}
