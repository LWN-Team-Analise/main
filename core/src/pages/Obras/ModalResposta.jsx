import Modal from '@/components/Modal/Modal'
import './ModalResposta.css'

/**
 * A pergunta de um check de card Sim/Nao ("Hospedagem — há ou não?").
 *
 * Os dois botoes MARCAM o check: Sim com o tique de sempre, Nao com um
 * X e a palavra "Nao" do lado. O "nao" e uma resposta, nao uma
 * pendencia — a etapa anda igual.
 *
 * Check ja respondido abre aqui de novo para TROCAR a resposta ou
 * desmarcar; trocar mantem quem marcou primeiro.
 */
export default function ModalResposta({
  aberto,
  check,
  nomeCard,
  resposta = null,
  marcado = false,
  aoResponder,
  aoDesmarcar,
  aoFechar,
}) {
  if (!check) return null

  const escolher = (valor) => {
    aoResponder(valor)
    aoFechar()
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={check.titulo} subtitulo={nomeCard} largura={420}>
      <div className="resposta">
        <p className="resposta__pergunta">
          {marcado
            ? `Respondido: ${resposta === false ? 'Não' : 'Sim'}. Quer trocar a resposta?`
            : 'Responda para marcar este check:'}
        </p>

        <div className="resposta__opcoes">
          <button
            type="button"
            className={`resposta__opcao resposta__opcao--sim ${marcado && resposta !== false ? 'is-atual' : ''}`.trim()}
            onClick={() => escolher(true)}
          >
            <span className="resposta__glifo" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7" />
              </svg>
            </span>
            Sim
          </button>

          <button
            type="button"
            className={`resposta__opcao resposta__opcao--nao ${marcado && resposta === false ? 'is-atual' : ''}`.trim()}
            onClick={() => escolher(false)}
          >
            <span className="resposta__glifo" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
              </svg>
            </span>
            Não
          </button>
        </div>

        {marcado && (
          <button
            type="button"
            className="resposta__desmarcar"
            onClick={() => {
              aoDesmarcar()
              aoFechar()
            }}
          >
            Desmarcar o check
          </button>
        )}
      </div>
    </Modal>
  )
}
