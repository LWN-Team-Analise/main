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
   ------------------------------------------------------------ */
export const AVISO_OS_SOLICITADA = 'lwn-os-solicitada'

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

  if (!obraId) return null
  const endereco = `${enderecoSolicitarOS(obraId)}${enderecoSolicitarOS(obraId).includes('?') ? '&' : '?'}embutido=1`

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Solicitar OS" largura={1040}>
      {enviada ? (
        <div className="solicitaros__feito" role="status">
          <strong>OS solicitada.</strong>
          <p>O check “Solicitar OS” é marcado quando o supervisor aprovar a OS no Almoxarife.</p>
          <button type="button" className="acao acao--padrao" onClick={aoFechar}>
            Voltar para a obra
          </button>
        </div>
      ) : (
        aberto && <iframe className="solicitaros__quadro" src={endereco} title="Solicitação de OS do Almoxarife" />
      )}
    </Modal>
  )
}
