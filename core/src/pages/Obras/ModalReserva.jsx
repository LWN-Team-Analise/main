import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoSelecao } from '@/components/Campo/Campo'
import * as frotasApi from '@/services/frotasService'
import { dataBR, dataHora } from '@/utils/formato'
import './ModalAnexos.css'
import './ModalProposta.css'

/* ------------------------------------------------------------
   "Reserva de carro" — 1a etapa, Time Tecnico (atualizacao 23).

   O supervisor escolhe, entre os carros da frota que estao na
   garagem e sem reserva de outra obra, o que vai para esta obra.
   Reservar marca o check e faz aparecer, na 3a etapa, o "Retirada do
   carro". Tambem da para dizer que a obra nao vai usar carro da frota
   (o check fecha sem reserva, e a retirada nao aparece).

   Depois que o carro sai, a reserva nao muda mais. Quem nao e
   supervisor so ve o que foi reservado.
   ------------------------------------------------------------ */

const Carro = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 16.5V12l1.7-4.6A1.6 1.6 0 0 1 8.2 6.3h7.6a1.6 1.6 0 0 1 1.5 1.1L19 12v4.5" />
    <path d="M4 16.5h16M5 12h14" />
    <circle cx="8" cy="16.6" r="1.7" />
    <circle cx="16" cy="16.6" r="1.7" />
  </svg>
)

const rotuloDoCarro = (v) =>
  [v.nome, v.placa, [v.marca, v.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ')

export default function ModalReserva({ aberto, obra, check, nomeCard, podeReservar, aoFechar, aoMudou }) {
  const reserva = obra?.reserva ?? null
  const retirado = Boolean(reserva?.retirada)
  const mexe = podeReservar && !retirado

  const [livres, setLivres] = useState(null)
  const [escolhido, setEscolhido] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(null)

  useEffect(() => {
    if (!aberto) return
    setErro('')
    setEscolhido(reserva?.veiculoId ?? '')
    if (!mexe) return
    let vivo = true
    setLivres(null)
    frotasApi
      .carregarDisponiveis(obra.id)
      .then((lista) => vivo && setLivres(lista))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, obra?.id])

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

  const reservarCarro = () => {
    if (!escolhido) {
      setErro('Escolha o carro.')
      return
    }
    fazer(() => frotasApi.reservar(obra.id, { veiculoId: escolhido }), 'reservar')
  }

  const opcoes = (livres ?? []).map((v) => ({ valor: v.id, rotulo: rotuloDoCarro(v) }))
  const trocando = Boolean(reserva?.veiculoId) && escolhido && escolhido !== reserva.veiculoId

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={check.titulo} subtitulo={nomeCard} largura={480}>
      <div className="proposta">
        <p className="proposta__texto">
          {retirado
            ? 'O carro reservado já foi retirado.'
            : reserva?.veiculoId
              ? 'Carro reservado para esta obra. Na etapa de execução, o check "Retirada do carro" registra a saída dele.'
              : reserva
                ? 'Esta obra não vai usar carro da frota.'
                : 'Escolha o carro da frota que vai para esta obra.'}
        </p>

        {reserva?.veiculoId && (
          <div className="proposta__atual">
            <span className="anexos__icone" aria-hidden="true">
              <Carro />
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

        {mexe && (
          <>
            {livres === null && !erro && <p className="proposta__aviso">Carregando os carros disponíveis...</p>}
            {livres !== null && opcoes.length === 0 && (
              <p className="proposta__aviso">
                Nenhum carro disponível agora: todos estão em uso ou reservados para outra obra.
              </p>
            )}
            {opcoes.length > 0 && (
              <CampoSelecao
                rotulo={reserva?.veiculoId ? 'Trocar por' : 'Carro'}
                value={escolhido}
                onChange={(e) => {
                  setEscolhido(e.target.value)
                  setErro('')
                }}
                opcoes={opcoes}
                vazio="Escolha o carro..."
                dica="Só os carros na garagem e sem reserva de outra obra."
              />
            )}
          </>
        )}

        {erro && (
          <p className="anexos__erro" role="alert">
            {erro}
          </p>
        )}

        {!podeReservar && !retirado && (
          <p className="proposta__aviso">Só o supervisor reserva o carro da obra.</p>
        )}

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
            {opcoes.length > 0 && (!reserva?.veiculoId || trocando) && (
              <Button onClick={reservarCarro} loading={salvando === 'reservar'} disabled={!escolhido || Boolean(salvando)}>
                {trocando ? 'Trocar carro' : 'Reservar carro'}
              </Button>
            )}
          </footer>
        )}
      </div>
    </Modal>
  )
}
