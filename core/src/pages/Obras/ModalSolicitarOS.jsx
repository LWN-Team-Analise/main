import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import { enderecoSolicitarOS } from '@/domain/obras'
import './ModalSolicitarOS.css'

/* ------------------------------------------------------------
   "Solicitar OS" sem sair da obra.

   O check "Solicitar OS" (2a etapa) abre aqui, num pop-up por cima da
   obra, a mesma tela de Solicitação de OS do Almoxarife — ja com o
   cliente, a obra e as datas travados (o ?obra=). Ela vem no modo
   EMBUTIDO (?embutido=1): sem o menu, sem a barra de cima e sem o
   "Voltar" (public/almoxarife/sessao.js e estilo-main.css).

   Enviada a OS, a tela do Almoxarife avisa por postMessage
   (enviarSolicitacaoFinal, em public/almoxarife/almoxarife.js), o pop-up
   diz que foi e a obra recarrega. O check continua esperando: quem marca
   e a aprovacao da OS no Almoxarife.

   Sem a obra (o "Solicitar" do menu), o mesmo pop-up abre o pedido em
   branco: a pessoa escolhe o cliente e a obra la dentro, e continua na
   tela em que estava.
   ------------------------------------------------------------ */
export const AVISO_OS_SOLICITADA = 'lwn-os-solicitada'
/* o pedido em branco, sem obra (public/almoxarife/endereco.js) */
const ENDERECO_SOLICITAR = '/core/app/control/solicitar'

export default function ModalSolicitarOS({ aberto, obraId, aoEnviada, aoFechar }) {
  const [enviada, setEnviada] = useState(false)
  /* a obra passa uma funcao nova a cada desenho: se ela entrasse nas
     dependencias do efeito, o recarregar da obra (que ela mesma chama)
     refazia o efeito e o "OS solicitada" voltava na hora para o formulario */
  const avisarObra = useRef(aoEnviada)
  useEffect(() => {
    avisarObra.current = aoEnviada
  }, [aoEnviada])

  useEffect(() => {
    if (!aberto) return undefined
    setEnviada(false)
    const ouvir = (e) => {
      if (e.origin !== window.location.origin || e.data?.tipo !== AVISO_OS_SOLICITADA) return
      setEnviada(true)
      avisarObra.current?.()
    }
    window.addEventListener('message', ouvir)
    return () => window.removeEventListener('message', ouvir)
  }, [aberto])

  const base = obraId ? enderecoSolicitarOS(obraId) : ENDERECO_SOLICITAR
  const endereco = `${base}${base.includes('?') ? '&' : '?'}embutido=1`

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Solicitar OS" largura={1040}>
      {enviada ? (
        <div className="solicitaros__feito" role="status">
          <strong>OS solicitada.</strong>
          <p>
            {obraId
              ? 'O check “Solicitar OS” é marcado quando o supervisor aprovar a OS no Almoxarife.'
              : 'Ela foi para a aprovação do supervisor, no Almoxarife.'}
          </p>
          <button type="button" className="acao acao--padrao" onClick={aoFechar}>
            {obraId ? 'Voltar para a obra' : 'Fechar'}
          </button>
        </div>
      ) : (
        aberto && <iframe className="solicitaros__quadro" src={endereco} title="Solicitação de OS do Almoxarife" />
      )}
    </Modal>
  )
}
