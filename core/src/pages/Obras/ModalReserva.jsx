import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { kmLegivel } from '@/domain/frotas'
import { janelaDaRetirada } from '@/domain/obras'
import { diaDaSemana, finaisLegiveis, finalDaPlaca, horariosLegiveis } from '@/domain/rodizio'
import * as frotasApi from '@/services/frotasService'
import { dataBR, dataHora } from '@/utils/formato'
import { IconeCarro } from '@/pages/Frotas/icones'
import './ModalAnexos.css'
import './ModalProposta.css'
import './ModalReserva.css'

/* ------------------------------------------------------------
   "Reserva de carro" — 1a etapa, Time Tecnico.

   So abre depois do "Prazo da execucao": a reserva e POR PERIODO, e e
   o periodo da execucao que diz quais carros estao livres (ver
   server/routes/frotas.js, carrosParaObra). Duas obras em semanas
   diferentes podem reservar o mesmo carro.

   O pop-up e a frota vista pelos dias da obra: o rodizio de cada dia da
   execucao e os carros em cartoes, com placa, modelo, ano, cor e KM, e
   a situacao de cada um no periodo. O supervisor escolhe clicando no
   cartao e confirma embaixo. E so a RESERVA: a saida do carro (KM,
   fotos, checklist) e registrada depois, na aba Frotas ou no check
   "Retirada do carro" — e a aba Frotas avisa quando o periodo chega.

   Depois que o carro sai, a reserva nao muda mais. Quem nao e
   supervisor so ve o que foi reservado.

   CONCEDER O CARRO (atualizacao 54): o carro reservado so sai a partir do
   primeiro dia da execucao. Quem tem `conceder_carro` libera a retirada na
   vespera, por aqui — e tira a liberacao, se mudar de ideia.
   ------------------------------------------------------------ */

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaCurto = (d) => `${SEMANA[diaDaSemana(d)]} ${dataBR(d).slice(0, 5)}`

/** 'seg 20/10, seg 27/10 e seg 03/11' */
function listaDeDias(dias) {
  const nomes = dias.map(diaCurto)
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : (nomes[0] ?? '')
}

/* a ordem dos cartoes: o desta obra, os livres sem rodizio, os livres
   com rodizio (menos dias primeiro), os sem placa, e os que nao da */
function peso(v) {
  if (v.situacao === 'esta') return 0
  if (v.situacao === 'livre') return v.placa ? 1 + v.rodizio.length / 100 : 2
  if (v.situacao === 'em_uso') return 3
  return 4
}

const selecionavel = (v) => v.situacao === 'livre' || v.situacao === 'esta'

/** O que o cartao diz da situacao do carro no periodo. */
function situacaoDoCarro(v) {
  if (v.situacao === 'reservado') {
    const quando = v.conflito?.de ? ` (${dataBR(v.conflito.de).slice(0, 5)} a ${dataBR(v.conflito.ate).slice(0, 5)})` : ''
    return { tom: 'ocupado', texto: `Reservado para ${v.conflito?.obra ?? 'outra obra'}${quando}` }
  }
  if (v.situacao === 'em_uso') return { tom: 'ocupado', texto: `Em uso com ${v.emUsoCom}` }
  if (v.situacao === 'esta') return { tom: 'esta', texto: 'Reservado para esta obra' }
  if (!v.placa) return { tom: 'aviso', texto: 'Livre · sem placa, rodízio não conferido' }
  if (v.rodizio.length) {
    return { tom: 'aviso', texto: `Livre · rodízio em ${v.rodizio.length} ${v.rodizio.length === 1 ? 'dia' : 'dias'}` }
  }
  return { tom: 'livre', texto: 'Livre no período' }
}

export default function ModalReserva({ aberto, obra, check, nomeCard, podeReservar, podeConceder, aoFechar, aoMudou }) {
  const reserva = obra?.reserva ?? null
  const retirado = Boolean(reserva?.retirada)
  const mexe = podeReservar && !retirado
  /* desde quando o carro reservado sai: o primeiro dia, ou a vespera liberada */
  const janela = reserva?.veiculoId && !retirado ? janelaDaRetirada(obra) : null

  const [frota, setFrota] = useState(null)
  const [escolhido, setEscolhido] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(null)

  useEffect(() => {
    if (!aberto) return undefined
    setErro('')
    setEscolhido(reserva?.veiculoId ?? '')
    if (!mexe) return undefined
    let vivo = true
    setFrota(null)
    frotasApi
      .carregarDisponiveis(obra.id)
      .then((r) => vivo && setFrota(r))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, obra?.id])

  const carros = useMemo(() => [...(frota?.veiculos ?? [])].sort((a, b) => peso(a) - peso(b)), [frota])

  if (!check || !obra) return null

  const fazer = async (acao, oque) => {
    setErro('')
    setSalvando(oque)
    try {
      await acao()
      await aoMudou?.()
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(null)
    }
  }

  const carroEscolhido = carros.find((v) => v.id === escolhido) ?? null
  const trocando = Boolean(reserva?.veiculoId) && escolhido && escolhido !== reserva.veiculoId
  const podeConfirmar = carroEscolhido && selecionavel(carroEscolhido) && (!reserva?.veiculoId || trocando)
  const livres = carros.filter((v) => v.situacao === 'livre').length

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={check.titulo}
      subtitulo={nomeCard}
      largura={mexe ? 980 : 480}
    >
      <div className="proposta reservacar">
        <p className="proposta__texto">
          {retirado
            ? 'O carro reservado já foi retirado.'
            : reserva?.veiculoId
              ? 'Carro reservado para esta obra. A saída dele (KM, fotos e checklist) é registrada na aba Frotas ou no check "Retirada do carro".'
              : reserva
                ? 'Esta obra não vai usar carro da frota.'
                : 'Escolha, clicando no cartão, o carro que vai para esta obra no período da execução.'}
        </p>

        {reserva?.veiculoId && (!mexe || retirado) && (
          <div className="proposta__atual">
            <span className="anexos__icone" aria-hidden="true">
              <IconeCarro tamanho={18} />
            </span>
            <span className="anexos__quem">
              <strong>{[reserva.veiculoNome, reserva.placa].filter(Boolean).join(' · ')}</strong>
              <span>
                Reservado{reserva.reservadoPorNome ? ` por ${reserva.reservadoPorNome}` : ''} em {dataHora(reserva.reservadoEm)}
              </span>
              {retirado && (
                <span>
                  Retirado em {dataBR(reserva.retirada.data)}
                  {reserva.retirada.hora ? ` às ${reserva.retirada.hora}` : ''} por {reserva.retirada.condutorNome}
                </span>
              )}
            </span>
          </div>
        )}

        {/* quando o carro sai, e a liberacao da vespera para quem concede */}
        {janela && (
          <div className="reservacar__liberacao" data-liberada={janela.liberada ? 'sim' : undefined}>
            <p>
              {janela.liberada ? (
                <>
                  <strong>Retirada liberada a partir de {dataBR(janela.aPartirDe)}</strong>, a véspera da obra
                  {reserva.liberada?.porNome ? ` (por ${reserva.liberada.porNome})` : ''}.
                </>
              ) : (
                <>
                  O carro sai a partir de <strong>{dataBR(janela.primeiro)}</strong>, o primeiro dia da execução.
                  {podeConceder ? '' : ' Para retirar na véspera, peça a quem concede o carro.'}
                </>
              )}
            </p>
            {podeConceder &&
              (janela.liberada ? (
                <button
                  type="button"
                  className="proposta__desmarcar"
                  onClick={() => fazer(() => frotasApi.travarRetirada(obra.id), 'travar')}
                  disabled={Boolean(salvando)}
                >
                  Tirar a liberação
                </button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => fazer(() => frotasApi.liberarRetirada(obra.id), 'liberar')}
                  loading={salvando === 'liberar'}
                  disabled={Boolean(salvando)}
                >
                  Liberar a retirada na véspera ({dataBR(janela.vespera).slice(0, 5)})
                </Button>
              ))}
          </div>
        )}

        {mexe && !frota && !erro && <p className="proposta__aviso">Carregando a frota...</p>}

        {mexe && frota && (
          <>
            {/* ---- o periodo e o rodizio de cada dia dele ---- */}
            <section className="reservacar__periodo" aria-label="Rodízio nos dias da execução">
              <header>
                <strong>
                  Execução de {dataBR(frota.execucao.de)} a {dataBR(frota.execucao.ate)}
                </strong>
                <span>
                  {frota.execucao.dias} {frota.execucao.dias === 1 ? 'dia' : 'dias'} · rodízio no centro de São Paulo,{' '}
                  {horariosLegiveis()}
                </span>
              </header>
              <ol className="reservacar__dias">
                {frota.rodizio.map((d) => (
                  <li key={d.data} data-livre={d.livre ? 'sim' : undefined} title={d.livre ?? undefined}>
                    <span>{diaCurto(d.data)}</span>
                    <strong>{d.livre ? (d.livre.startsWith('Feriado') ? 'feriado' : 'livre') : finaisLegiveis(d.finais)}</strong>
                  </li>
                ))}
              </ol>
            </section>

            {/* ---- os carros ---- */}
            <p className="reservacar__conta">
              {livres} de {carros.length} {carros.length === 1 ? 'carro livre' : 'carros livres'} no período
            </p>
            <ul className="reservacar__grade">
              {carros.map((v) => {
                const s = situacaoDoCarro(v)
                const pode = selecionavel(v)
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="reservacar__carro"
                      data-tom={s.tom}
                      aria-pressed={escolhido === v.id}
                      disabled={!pode}
                      onClick={() => {
                        setEscolhido(v.id)
                        setErro('')
                      }}
                    >
                      <span className="reservacar__topo">
                        <span className="reservacar__icone" aria-hidden="true">
                          <IconeCarro tamanho={20} />
                        </span>
                        <strong>{v.nome}</strong>
                        <span className={`reservacar__placa ${v.placa ? '' : 'is-vazia'}`.trim()}>
                          {v.placa || 'sem placa'}
                        </span>
                      </span>
                      <span className="reservacar__ficha">
                        {[[v.marca, v.modelo].filter(Boolean).join(' '), v.ano, v.cor].filter(Boolean).join(' · ') || '—'}
                      </span>
                      <span className="reservacar__situacao">{s.texto}</span>
                      {v.situacao === 'livre' && v.emUsoCom && (
                        <span className="reservacar__nota">Na rua agora com {v.emUsoCom}</span>
                      )}
                      {pode && v.rodizio.length > 0 && (
                        <span className="reservacar__nota">Rodízio: {listaDeDias(v.rodizio)}</span>
                      )}
                      <span className="reservacar__km">KM {kmLegivel(v.kmAtual)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* o carro escolhido nao pode rodar no centro de Sao Paulo em algum dia de campo */}
            {carroEscolhido?.rodizio.length > 0 && (
              <p className="proposta__aviso reserva__rodizio" role="note">
                <strong>Rodízio:</strong> o {carroEscolhido.nome} (placa final {finalDaPlaca(carroEscolhido.placa)}) não
                circula no centro de São Paulo, {horariosLegiveis()}, em {carroEscolhido.rodizio.length}{' '}
                {carroEscolhido.rodizio.length === 1 ? 'dia' : 'dias'} da execução: {listaDeDias(carroEscolhido.rodizio)}.
                Se a obra fica no centro de São Paulo, prefira outro carro.
              </p>
            )}
          </>
        )}

        {erro && (
          <p className="anexos__erro" role="alert">
            {erro}
          </p>
        )}

        {!podeReservar && !retirado && <p className="proposta__aviso">Só o supervisor reserva o carro da obra.</p>}

        {mexe && (
          <footer className="proposta__rodape">
            <span className="reserva__links">
              {reserva && (
                <button
                  type="button"
                  className="proposta__desmarcar"
                  onClick={() => fazer(() => frotasApi.cancelarReserva(obra.id), 'cancelar')}
                  disabled={Boolean(salvando)}
                >
                  Cancelar reserva
                </button>
              )}
              {!reserva || reserva.veiculoId ? (
                <button
                  type="button"
                  className="proposta__desmarcar"
                  onClick={() => fazer(() => frotasApi.reservar(obra.id, { semCarro: true }), 'sem')}
                  disabled={Boolean(salvando)}
                >
                  Não vai usar carro
                </button>
              ) : null}
            </span>
            {podeConfirmar && (
              <Button
                onClick={() => fazer(() => frotasApi.reservar(obra.id, { veiculoId: escolhido }), 'reservar')}
                loading={salvando === 'reservar'}
                disabled={Boolean(salvando)}
              >
                {trocando ? `Trocar para ${carroEscolhido.nome}` : `Reservar ${carroEscolhido.nome}`}
              </Button>
            )}
          </footer>
        )}
      </div>
    </Modal>
  )
}
