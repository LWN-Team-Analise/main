import { useState } from 'react'
import { useDados } from '@/context/DadosContext'
import { dataHora } from '@/utils/formato'
import './PedidoInclusao.css'

/**
 * A solicitacao de inclusao como MEMBRO PARCIAL de uma obra, do lado de
 * quem foi incluido (atualizacao 30): quem incluiu, quando, e os dois
 * botoes.
 *
 *   Aceitar — a pessoa passa a ser membro da obra (fotos, avaliacoes,
 *             chat), como quem marcou check.
 *   Recusar — abre o campo do MOTIVO, que e obrigatorio: quem incluiu
 *             recebe a recusa com ele. Voltar desiste sem responder.
 *
 * Aparece no sino (as solicitacoes ficam no alto ate serem
 * respondidas), na tela da obra e no pop-up de membros dela. A recusa
 * e escrita ali mesmo, sem abrir outro pop-up: dentro do sino, um
 * pop-up por cima fecharia o proprio sino.
 *
 * `obra` e o nome da obra, para quando o pedido aparece fora dela (o
 * sino); dentro da obra fica de fora.
 */
export default function PedidoInclusao({ pedido, obra = null }) {
  const { responderInclusao } = useDados()
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(null)

  const responder = async (aceitar) => {
    const texto = motivo.trim()
    if (!aceitar && !texto) {
      setErro('Escreva o motivo da recusa.')
      return
    }
    setErro('')
    setEnviando(aceitar ? 'aceitar' : 'recusar')
    try {
      await responderInclusao(pedido.obraId, aceitar ? { aceitar: true } : { aceitar: false, motivo: texto })
    } catch (e) {
      setErro(e.message)
      setEnviando(null)
    }
  }

  return (
    <div className="pedido" role="group" aria-label="Solicitação de inclusão na obra">
      <p className="pedido__texto">
        <strong>{pedido.incluidoPorNome ?? 'Alguém'}</strong> incluiu você como membro
        {obra ? (
          <>
            {' '}
            da obra <strong>{obra}</strong>
          </>
        ) : (
          ' desta obra'
        )}
        .
      </p>
      {pedido.incluidoEm && <p className="pedido__quando">{dataHora(pedido.incluidoEm)}</p>}

      {recusando && (
        <label className="pedido__motivo">
          <span>Motivo da recusa</span>
          <textarea
            rows={2}
            maxLength={500}
            value={motivo}
            placeholder="Ex.: não fui a esta obra"
            onChange={(e) => {
              setMotivo(e.target.value)
              setErro('')
            }}
            aria-invalid={Boolean(erro)}
            autoFocus
          />
        </label>
      )}

      {erro && (
        <p className="pedido__erro" role="alert">
          {erro}
        </p>
      )}

      <div className="pedido__acoes">
        {recusando ? (
          <>
            <button
              type="button"
              className="pedido__botao"
              onClick={() => {
                setRecusando(false)
                setMotivo('')
                setErro('')
              }}
              disabled={Boolean(enviando)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="pedido__botao pedido__botao--recusar"
              onClick={() => responder(false)}
              disabled={Boolean(enviando)}
            >
              {enviando === 'recusar' ? 'Recusando...' : 'Recusar inclusão'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="pedido__botao"
              onClick={() => setRecusando(true)}
              disabled={Boolean(enviando)}
            >
              Recusar
            </button>
            <button
              type="button"
              className="pedido__botao pedido__botao--aceitar"
              onClick={() => responder(true)}
              disabled={Boolean(enviando)}
            >
              {enviando === 'aceitar' ? 'Aceitando...' : 'Aceitar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
