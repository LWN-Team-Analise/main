import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import { carregarLocalizacao } from '@/services/frotasService'
import { dataBR, hojeISO } from '@/utils/formato'
import { IconeVoltar } from './icones'
import './Localizacao.css'

/**
 * LOCALIZACAO DOS CARROS (Frotas > Localização)
 *
 * Onde esta cada carro, dia a dia: o mes em grade e, embaixo, o dia
 * escolhido (hoje, ao abrir) com TODOS os carros e a situacao de cada um:
 *
 *   em uso      na rua naquele dia (saida registrada, ainda sem devolucao
 *               ou devolvido depois), com o condutor e o destino;
 *   reservado   reservado para a obra naquele dia e ainda nao retirado;
 *   na empresa  nem uso, nem reserva.
 *
 * Num dia que ja passou, "em uso" vira "utilizado": e quem usou o carro.
 * Num dia que ainda vem, so a reserva diz alguma coisa (o carro que esta
 * na rua agora aparece com o aviso de que ainda nao voltou).
 *
 * Cada carro tem uma cor (tirada do id), a mesma na grade e na lista.
 */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const SEMANA_LONGA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const CORES = ['#2f6fd6', '#d9822b', '#2e9e6a', '#9b4fd1', '#d64f6f', '#1f9bb0', '#8a6d2c', '#5b6bd6']
/* quantos chips cabem num dia da grade; o resto vira "+N" */
const CHIPS_NO_DIA = 3

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

/** 'Hoje · sexta-feira, 13/11' */
function rotuloDoDia(dia, hoje) {
  const d = new Date(`${dia}T12:00:00`)
  const nome = `${SEMANA_LONGA[d.getDay()]}, ${dataBR(dia).slice(0, 5)}`
  if (dia === hoje) return `Hoje · ${nome}`
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/** O uso cobre o dia? O trecho aberto (ainda na rua) vai ate hoje. */
const usoNoDia = (u, dia, hoje) => u.de <= dia && dia <= (u.ate ?? hoje)

/**
 * A situacao de um carro num dia:
 *   { tom: 'uso' | 'reserva' | 'empresa', uso?, reserva?, aberto? }
 */
function situacaoNoDia(veiculoId, dia, hoje, usos, reservas) {
  const reserva = reservas.find((r) => r.veiculoId === veiculoId && r.dias.includes(dia) && !r.retirada) ?? null
  if (dia <= hoje) {
    const uso = usos.filter((u) => u.veiculoId === veiculoId && usoNoDia(u, dia, hoje)).at(-1)
    if (uso) return { tom: 'uso', uso }
    if (reserva) return { tom: 'reserva', reserva }
    return { tom: 'empresa' }
  }
  if (reserva) return { tom: 'reserva', reserva }
  /* no futuro, o carro que esta na rua agora e ainda nao voltou */
  const aberto = usos.find((u) => u.veiculoId === veiculoId && u.ate === null)
  if (aberto) return { tom: 'uso', uso: aberto, aberto: true }
  return { tom: 'empresa' }
}

const linkDaObra = (obraId, concluida) => (concluida ? `/app/concluidas/${obraId}` : `/app/obras/${obraId}`)

export default function Localizacao() {
  const hojeLocal = hojeISO()
  const [mes, setMes] = useState(hojeLocal.slice(0, 7))
  const [dia, setDia] = useState(hojeLocal)
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    setDados(null)
    setErro('')
    carregarLocalizacao(mes)
      .then((r) => vivo && setDados(r))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [mes])

  const hoje = dados?.hoje ?? hojeLocal
  const reservas = useMemo(() => dados?.reservas ?? [], [dados])
  const usos = useMemo(() => dados?.usos ?? [], [dados])
  const veiculos = useMemo(() => dados?.veiculos ?? [], [dados])
  const semanas = useMemo(() => semanasDoMes(mes), [mes])
  const nomeDoCarro = useMemo(() => new Map(veiculos.map((v) => [v.id, v.nome])), [veiculos])

  /* dia -> os chips daquele dia: os carros na rua e os reservados */
  const porDia = useMemo(() => {
    const mapa = new Map()
    const juntar = (d, chip) => mapa.set(d, [...(mapa.get(d) ?? []), chip])
    for (const semana of semanas) {
      for (const d of semana) {
        if (!d || d > hoje) continue
        for (const u of usos) {
          if (usoNoDia(u, d, hoje)) juntar(d, { chave: `u-${u.veiculoId}-${u.de}`, tom: 'uso', veiculoId: u.veiculoId, texto: u.condutorNome })
        }
      }
    }
    for (const r of reservas) {
      if (r.retirada) continue
      for (const d of r.dias) juntar(d, { chave: `r-${r.obraId}`, tom: 'reserva', veiculoId: r.veiculoId, texto: r.obra })
    }
    return mapa
  }, [semanas, usos, reservas, hoje])

  /* o dia escolhido: todos os carros, na ordem em uso, reservado, empresa */
  const doDia = useMemo(() => {
    const ordem = { uso: 0, reserva: 1, empresa: 2 }
    return veiculos
      .map((v) => ({ veiculo: v, ...situacaoNoDia(v.id, dia, hoje, usos, reservas) }))
      .sort((a, b) => ordem[a.tom] - ordem[b.tom] || a.veiculo.nome.localeCompare(b.veiculo.nome, 'pt-BR'))
  }, [veiculos, dia, hoje, usos, reservas])

  const contagem = doDia.reduce((n, c) => ({ ...n, [c.tom]: (n[c.tom] ?? 0) + 1 }), {})
  const passado = dia < hoje
  const [ano, numero] = mes.split('-').map(Number)
  /* trocar de mes leva o dia escolhido junto: hoje, se for o mes de hoje,
     senao o dia 1 */
  const trocarMes = (n) => {
    const novo = somarMes(mes, n)
    setMes(novo)
    setDia(novo === hojeLocal.slice(0, 7) ? hojeLocal : `${novo}-01`)
  }

  const irParaHoje = () => {
    setMes(hojeLocal.slice(0, 7))
    setDia(hojeLocal)
  }

  return (
    <AppShell>
      <section className="calres">
        <header className="calres__topo">
          <Link to="/app/frotas" className="calres__voltar">
            <IconeVoltar />
            Frotas
          </Link>
          <h1 className="tela__titulo">Localização</h1>
          <p className="tela__lead">
            Onde está cada carro: em uso, reservado para uma obra ou na empresa. Nos dias que já passaram, quem usou
            cada um.
          </p>
        </header>

        <div className="calres__barra">
          <button type="button" className="calres__passo" onClick={() => trocarMes(-1)} aria-label="Mês anterior">
            ‹
          </button>
          <strong className="calres__mes">
            {MESES[numero - 1]} de {ano}
          </strong>
          <button type="button" className="calres__passo" onClick={() => trocarMes(1)} aria-label="Próximo mês">
            ›
          </button>
          {(mes !== hojeLocal.slice(0, 7) || dia !== hojeLocal) && (
            <button type="button" className="acao acao--fraca calres__hoje" onClick={irParaHoje}>
              Hoje
            </button>
          )}
          <span className="calres__legenda" aria-hidden="true">
            <span data-tom="uso">Em uso</span>
            <span data-tom="reserva">Reservado</span>
          </span>
        </div>

        {erro && (
          <p className="calres__erro" role="alert">
            {erro}
          </p>
        )}

        <div className="calres__grade vidro" role="grid" aria-label={`Carros em ${MESES[numero - 1]} de ${ano}`}>
          <div className="calres__semana calres__semana--cabeca" role="row">
            {SEMANA.map((d) => (
              <span key={d} role="columnheader">
                {d}
              </span>
            ))}
          </div>
          {semanas.map((semana, i) => (
            <div key={i} className="calres__semana" role="row">
              {semana.map((d, j) => {
                if (!d) return <div key={`vazio-${i}-${j}`} role="gridcell" className="calres__dia is-fora" />
                const chips = porDia.get(d) ?? []
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    aria-selected={d === dia}
                    aria-label={`${rotuloDoDia(d, hoje)}: ${chips.length} ${chips.length === 1 ? 'carro' : 'carros'} fora ou reservados`}
                    onClick={() => setDia(d)}
                    className={`calres__dia ${d === hoje ? 'is-hoje' : ''} ${d < hoje ? 'is-passado' : ''} ${d === dia ? 'is-escolhido' : ''}`
                      .replace(/\s+/g, ' ')
                      .trim()}
                  >
                    <span className="calres__numero">{Number(d.slice(8))}</span>
                    <span className="calres__chips">
                      {chips.slice(0, CHIPS_NO_DIA).map((c) => (
                        <span key={c.chave} className="calres__chip" data-tom={c.tom} style={{ '--carro': corDoCarro(c.veiculoId) }}>
                          <b>{nomeDoCarro.get(c.veiculoId) ?? 'Carro'}</b> {c.texto}
                        </span>
                      ))}
                      {chips.length > CHIPS_NO_DIA && <span className="calres__maischips">+{chips.length - CHIPS_NO_DIA}</span>}
                    </span>
                    {chips.length > 0 && <span className="calres__pontos" aria-hidden="true">{chips.length}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* o dia escolhido, com todos os carros */}
        {dados && (
          <section className="calres__nodia" aria-labelledby="calres-dia">
            <header className="calres__diacabeca">
              <h2 id="calres-dia">{rotuloDoDia(dia, hoje)}</h2>
              <span className="calres__conta">
                {[
                  contagem.uso ? `${contagem.uso} ${passado ? (contagem.uso === 1 ? 'utilizado' : 'utilizados') : 'em uso'}` : '',
                  contagem.reserva ? `${contagem.reserva} ${contagem.reserva === 1 ? 'reservado' : 'reservados'}` : '',
                  contagem.empresa ? `${contagem.empresa} na empresa` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </header>

            {veiculos.length === 0 ? (
              <p className="calres__vazio">Nenhum carro cadastrado.</p>
            ) : (
              <ul className="calres__lista">
                {doDia.map(({ veiculo, tom, uso, reserva, aberto }) => (
                  <li key={veiculo.id} className="calres__reserva vidro" data-tom={tom} style={{ '--carro': corDoCarro(veiculo.id) }}>
                    <span className="calres__carro">
                      <i aria-hidden="true" />
                      <strong>{veiculo.nome}</strong>
                      {veiculo.placa && <span>{veiculo.placa}</span>}
                      <em className="calres__estado" data-tom={tom}>
                        {tom === 'uso' ? (passado ? 'Utilizado' : 'Em uso') : tom === 'reserva' ? 'Reservado' : 'Na empresa'}
                      </em>
                    </span>

                    {tom === 'uso' && (
                      <>
                        <span className="calres__quem">
                          {uso.condutorNome || 'Condutor não informado'}
                          {uso.destino ? ` · ${uso.destino}` : ''}
                        </span>
                        {uso.obraId && (
                          <Link to={linkDaObra(uso.obraId)} className="calres__obra">
                            {uso.obra}
                          </Link>
                        )}
                        <span className="calres__situacao">
                          {aberto
                            ? `Na rua desde ${dataBR(uso.de)}, ainda sem devolução registrada`
                            : uso.ate === null
                              ? `Saiu em ${dataBR(uso.de)} e ainda não voltou`
                              : uso.de === uso.ate
                                ? `Saiu e voltou em ${dataBR(uso.de)}`
                                : `De ${dataBR(uso.de)} a ${dataBR(uso.ate)}`}
                        </span>
                      </>
                    )}

                    {tom === 'reserva' && (
                      <>
                        <Link to={linkDaObra(reserva.obraId, reserva.concluida)} className="calres__obra">
                          {reserva.obra}
                        </Link>
                        <span className="calres__situacao">
                          {reserva.de === reserva.ate ? dataBR(reserva.de) : `${dataBR(reserva.de)} a ${dataBR(reserva.ate)}`}
                          {passado ? ' · período passou sem retirada registrada' : ' · a retirar'}
                        </span>
                      </>
                    )}

                    {tom === 'empresa' && (
                      <span className="calres__situacao">
                        {passado ? 'Ficou na empresa' : veiculo.ativo ? 'Disponível na empresa' : 'Desativado'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </section>
    </AppShell>
  )
}
