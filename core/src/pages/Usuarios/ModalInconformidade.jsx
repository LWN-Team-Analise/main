import Modal from '@/components/Modal/Modal'

/**
 * O que o "!" do card de Usuarios abre: o que esta irregular naquela
 * conta. Hoje e uma coisa so, a senha padrao que a pessoa nao trocou.
 *
 * O valor da senha nao aparece aqui de proposito: quem le so precisa
 * saber que falta trocar.
 */
export default function ModalInconformidade({ pessoa, aoFechar }) {
  return (
    <Modal aberto={Boolean(pessoa)} aoFechar={aoFechar} titulo="Inconformidade" subtitulo={pessoa?.nome} largura={440}>
      <div className="inconforme">
        <span className="inconforme__sinal" aria-hidden="true">
          !
        </span>
        <div className="inconforme__texto">
          <h3>Senha padrão não alterada</h3>
          <p>{pessoa?.souEu ? 'Sua conta ainda está' : 'Esta conta ainda está'} com a senha padrão do sistema.</p>
          <p>
            Para regularizar, é preciso criar uma senha nova: pelo “Esqueci minha senha”, na tela de login, ou em
            Configurações, entrando pelo Outlook.
          </p>
        </div>
      </div>
    </Modal>
  )
}
