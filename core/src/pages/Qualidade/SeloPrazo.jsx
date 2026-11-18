import { situacaoDoPrazo } from '@/domain/qualidade'
import { dataBR } from '@/utils/formato'

const ROTULO_PRAZO = {
  atrasado: 'Atrasado',
  hoje: 'Vence hoje',
  perto: 'Vence logo',
  ok: 'No prazo',
}

/**
 * O selo do prazo nos cartoes e nas listas da Qualidade: o dia e o mes,
 * na cor da situacao (vermelho atrasado, laranja hoje ou nos proximos 3
 * dias, cinza no prazo). `fechado` (o documento concluido) fica sem cor.
 */
export default function SeloPrazo({ prazo, hoje, fechado = false }) {
  if (!prazo) return null
  const situacao = fechado ? 'ok' : situacaoDoPrazo(prazo, hoje)
  return (
    <span
      className="qcartao__prazo"
      data-situacao={situacao}
      title={fechado ? `Prazo: ${dataBR(prazo)}` : `${ROTULO_PRAZO[situacao]}: ${dataBR(prazo)}`}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
        <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" />
      </svg>
      {dataBR(prazo).slice(0, 5)}
    </span>
  )
}
