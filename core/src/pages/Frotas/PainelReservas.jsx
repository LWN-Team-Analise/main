import { Link } from 'react-router-dom'
import { diasAte } from '@/domain/obras'
import { dataBR } from '@/utils/formato'
import { IconeAlerta, IconeCarro, IconeSaida } from './icones'

/* a partir de quantos dias antes do inicio da execucao o alerta aparece */
export const AVISAR_DIAS_ANTES = 2

const curta = (d) => dataBR(d).slice(0, 5)

/**
 * Em que pe esta a reserva, olhando o periodo da execucao:
 *   futura   ainda falta mais que AVISAR_DIAS_ANTES para comecar
 *   perto    comeca em ate AVISAR_DIAS_ANTES dias (ou hoje)
 *   atrasada o periodo ja comecou e a saida nao foi registrada
 *   acabou   o periodo terminou sem a saida
 *   sem      reserva antiga, sem periodo
 */
export function momentoDaReserva(r, hoje) {
  if (!r.de) return { tipo: 'sem', texto: 'sem período definido' }
  if (r.ate < hoje) return { tipo: 'acabou', texto: `o período acabou em ${curta(r.ate)} sem a saída` }
  const falta = diasAte(r.de, hoje)
  if (falta < 0) return { tipo: 'atrasada', texto: `a execução começou em ${curta(r.de)}` }
  if (falta === 0) return { tipo: 'perto', texto: 'a execução começa hoje' }
  if (falta === 1) return { tipo: 'perto', texto: `a execução começa amanhã (${curta(r.de)})` }
  if (falta <= AVISAR_DIAS_ANTES) return { tipo: 'perto', texto: `a execução começa em ${falta} dias (${curta(r.de)})` }
  return { tipo: 'futura', texto: `começa em ${falta} dias` }
}

/**
 * As RESERVAS de carro na aba Frotas (GET /frotas/reservas).
 *
 * Reservar (na obra) so prende o carro; a SAIDA — KM, fotos, checklist
 * — continua sendo registrada aqui. Por isso, quando o periodo da
 * execucao chega (ou ja comecou) e a saida ainda nao foi feita, o
 * painel abre um alerta com o botao "Dar saida", que ja vem com o carro
 * e a obra escolhidos. Registrada a saida, a reserva sai da lista.
 */
export default function PainelReservas({ reservas, hoje, podeRegistrar, aoDarSaida }) {
  if (!reservas?.length) return null

  const comMomento = reservas.map((r) => ({ ...r, momento: momentoDaReserva(r, hoje) }))
  const alertas = comMomento.filter((r) => r.momento.tipo === 'perto' || r.momento.tipo === 'atrasada')

  return (
    <section className="reservas" aria-labelledby="reservas-titulo">
      {alertas.map((r) => (
        <div key={`alerta-${r.obraId}`} className="reservas__alerta" data-tipo={r.momento.tipo} role="alert">
          <span className="reservas__alertaicone" aria-hidden="true">
            <IconeAlerta />
          </span>
          <p>
            <strong>
              {r.veiculoNome} reservado para {r.obra}:
            </strong>{' '}
            {r.momento.texto}. A reserva já está feita, mas falta dar a saída do carro para registrar o KM, as fotos e o
            checklist.
          </p>
          {podeRegistrar && (
            <button type="button" className="reservas__saida" onClick={() => aoDarSaida(r)}>
              <IconeSaida />
              Dar saída
            </button>
          )}
        </div>
      ))}

      <header className="reservas__cabeca">
        <h2 id="reservas-titulo" className="frotas__subtitulo">
          Reservas
        </h2>
        <p className="frotas__resumo">
          {reservas.length} {reservas.length === 1 ? 'carro reservado' : 'carros reservados'} para obras, ainda sem
          saída registrada
        </p>
      </header>

      <ul className="reservas__lista">
        {comMomento.map((r) => (
          <li key={r.obraId} className="reservas__linha" data-tipo={r.momento.tipo}>
            <span className="reservas__carro">
              <IconeCarro tamanho={18} />
              <strong>{r.veiculoNome}</strong>
              {r.placa && <span className="veiculo__placa">{r.placa}</span>}
            </span>
            <span className="reservas__obra">
              <Link to={`/app/obras/${r.obraId}`}>{r.obra}</Link>
              <span>
                {r.de ? `${dataBR(r.de)} a ${dataBR(r.ate)} · ${r.dias} ${r.dias === 1 ? 'dia' : 'dias'}` : 'sem período'}
                {r.reservadoPorNome ? ` · reservado por ${r.reservadoPorNome}` : ''}
              </span>
            </span>
            <span className="reservas__momento">{r.momento.texto}</span>
            {podeRegistrar && r.momento.tipo !== 'acabou' && (
              <button type="button" className="reservas__saidapequena" onClick={() => aoDarSaida(r)}>
                Dar saída
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
