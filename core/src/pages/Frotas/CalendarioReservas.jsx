import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import { carregarCalendarioDeReservas } from '@/services/frotasService'
import { dataBR, hojeISO } from '@/utils/formato'
import { IconeVoltar } from './icones'
import './CalendarioReservas.css'

/**
 * CALENDARIO DE RESERVAS (Frotas > Calendário de reservas)
 *
 * As reservas de carro das obras num mes, dia a dia: as que vem, as de
 * agora e as que ja passaram (retiradas, ou de obra ja concluida). Cada
 * reserva ocupa os dias da execucao da obra. Embaixo, a lista do mes com o
 * carro, a obra, o periodo e a situacao (a retirar, retirado, concluida).
 *
 * Cada carro tem uma cor (tirada do id), a mesma na grade e na lista.
 */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const CORES = ['#2f6fd6', '#d9822b', '#2e9e6a', '#9b4fd1', '#d64f6f', '#1f9bb0', '#8a6d2c', '#5b6bd6']

const corDoCarro = (id) => CORES[Number(id) % CORES.length]

function somarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** As semanas do mes: cada uma com 7 dias ('AAAA-MM-DD'), null fora do mes. */
function semanasDoMes(mes) {
  const [a, m] = mes.split('-').map(Number)
  const primeiro = new Date(Date.UTC(a, m - 1, 1))
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const dias = [...Array(primeiro.getUTCDay()).fill(null)]
  for (let d = 1; d <= total; d++) dias.push(`${mes}-${String(d).padStart(2, '0')}`)
  while (dias.length % 7) dias.push(null)
  return Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7))
}

/** A situacao da reserva: a retirar, retirada ou de obra concluida. */
function situacao(r, hoje) {
  if (r.retirada) return { tom: 'retirada', texto: `Retirado em ${dataBR(r.retirada.data)}${r.retirada.condutorNome ? ` por ${r.retirada.condutorNome}` : ''}` }
  if (r.concluida) return { tom: 'passada', texto: 'Obra concluída sem retirada registrada' }
  if (r.ate && r.ate < hoje) return { tom: 'passada', texto: 'Período passou sem retirada registrada' }
  if (r.de && r.de <= hoje) return { tom: 'agora', texto: 'Período em andamento: a retirar' }
  return { tom: 'futura', texto: `A retirar a partir de ${dataBR(r.de)}` }
}

export default function CalendarioReservas() {
  const hojeLocal = hojeISO()
  const [mes, setMes] = useState(hojeLocal.slice(0, 7))
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    setDados(null)
    setErro('')
    carregarCalendarioDeReservas(mes)
      .then((r) => vivo && setDados(r))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [mes])

  const hoje = dados?.hoje ?? hojeLocal
  const reservas = dados?.reservas ?? []
  const semanas = useMemo(() => semanasDoMes(mes), [mes])
  /* dia -> as reservas que ocupam aquele dia */
  const porDia = useMemo(() => {
    const mapa = new Map()
    for (const r of reservas) for (const d of r.dias) mapa.set(d, [...(mapa.get(d) ?? []), r])
    return mapa
  }, [reservas])

  const [ano, numero] = mes.split('-').map(Number)

  return (
    <AppShell>
      <section className="calres">
        <header className="calres__topo">
          <Link to="/app/frotas" className="calres__voltar">
            <IconeVoltar />
            Frotas
          </Link>
          <h1 className="tela__titulo">Calendário de reservas</h1>
          <p className="tela__lead">As reservas de carro das obras: as que vêm e as que já passaram.</p>
        </header>

        <div className="calres__barra">
          <button type="button" className="calres__passo" onClick={() => setMes((m) => somarMes(m, -1))} aria-label="Mês anterior">
            ‹
          </button>
          <strong className="calres__mes">
            {MESES[numero - 1]} de {ano}
          </strong>
          <button type="button" className="calres__passo" onClick={() => setMes((m) => somarMes(m, 1))} aria-label="Próximo mês">
            ›
          </button>
          {mes !== hojeLocal.slice(0, 7) && (
            <button type="button" className="acao acao--fraca calres__hoje" onClick={() => setMes(hojeLocal.slice(0, 7))}>
              Hoje
            </button>
          )}
          <span className="calres__conta">
            {dados ? `${reservas.length} ${reservas.length === 1 ? 'reserva' : 'reservas'} no mês` : ''}
          </span>
        </div>

        {erro && (
          <p className="calres__erro" role="alert">
            {erro}
          </p>
        )}

        <div className="calres__grade vidro" role="grid" aria-label={`Reservas de ${MESES[numero - 1]} de ${ano}`}>
          <div className="calres__semana calres__semana--cabeca" role="row">
            {SEMANA.map((d) => (
              <span key={d} role="columnheader">
                {d}
              </span>
            ))}
          </div>
          {semanas.map((semana, i) => (
            <div key={i} className="calres__semana" role="row">
              {semana.map((dia, j) => {
                const doDia = dia ? (porDia.get(dia) ?? []) : []
                return (
                  <div
                    key={dia ?? `vazio-${i}-${j}`}
                    role="gridcell"
                    className={`calres__dia ${!dia ? 'is-fora' : ''} ${dia === hoje ? 'is-hoje' : ''} ${dia && dia < hoje ? 'is-passado' : ''}`
                      .replace(/\s+/g, ' ')
                      .trim()}
                  >
                    {dia && <span className="calres__numero">{Number(dia.slice(8))}</span>}
                    <ul className="calres__chips">
                      {doDia.map((r) => (
                        <li key={r.obraId}>
                          <Link
                            to={r.concluida ? `/app/concluidas/${r.obraId}` : `/app/obras/${r.obraId}`}
                            className="calres__chip"
                            style={{ '--carro': corDoCarro(r.veiculoId) }}
                            data-tom={situacao(r, hoje).tom}
                            title={`${r.veiculoNome}${r.placa ? ` (${r.placa})` : ''} — ${r.obra}`}
                          >
                            <b>{r.veiculoNome}</b> {r.obra}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {doDia.length > 0 && <span className="calres__pontos" aria-hidden="true">{doDia.length}</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* a lista do mes, com o que a grade nao cabe dizer */}
        {dados && reservas.length === 0 && <p className="calres__vazio">Nenhuma reserva de carro neste mês.</p>}
        {reservas.length > 0 && (
          <ul className="calres__lista">
            {reservas.map((r) => {
              const s = situacao(r, hoje)
              return (
                <li key={r.obraId} className="calres__reserva vidro" data-tom={s.tom} style={{ '--carro': corDoCarro(r.veiculoId) }}>
                  <span className="calres__carro">
                    <i aria-hidden="true" />
                    <strong>{r.veiculoNome}</strong>
                    {r.placa && <span>{r.placa}</span>}
                  </span>
                  <Link to={r.concluida ? `/app/concluidas/${r.obraId}` : `/app/obras/${r.obraId}`} className="calres__obra">
                    {r.obra}
                  </Link>
                  <span className="calres__periodo">
                    {r.de === r.ate ? dataBR(r.de) : `${dataBR(r.de)} a ${dataBR(r.ate)}`} · {r.dias.length}{' '}
                    {r.dias.length === 1 ? 'dia' : 'dias'}
                  </span>
                  <span className="calres__situacao">{s.texto}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </AppShell>
  )
}
