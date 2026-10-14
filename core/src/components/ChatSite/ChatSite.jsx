import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Conversa from '@/components/Chat/Conversa'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'

/**
 * A conversa geral da equipe.
 *
 * E separada do chat da obra de proposito: aquele morre com a obra e vira
 * historico dela; este e do dia a dia e nao pertence a obra nenhuma. Por isso
 * o botao que abre este some quando a pessoa entra numa obra — la dentro o
 * chat que importa e o da obra.
 *
 * O que da para fazer aqui e o MESMO do chat da obra — anexo, foto pela
 * camera, resposta, mencao com @ e as duas formas de apagar —, porque as
 * duas telas usam a mesma peca (`components/Chat/Conversa`).
 *
 * Antes esta era so uma caixa de texto: quem precisava mandar uma foto
 * para a equipe abria uma obra qualquer so para usar o chat dela.
 *
 * Nao exige permissao: conversar e de todo mundo que entra. O que se
 * controla e quem apaga PARA TODOS — cada um so faz isso com a propria
 * mensagem —, e a API confere de novo.
 */
export default function ChatSite({ aberto, aoFechar }) {
  const { user } = useAuth()
  const { equipe, carregarChatDoSite, enviarNoChatDoSite, apagarDoChatDoSite, pessoaPorId } =
    useDados()

  const [mensagens, setMensagens] = useState([])
  const [carregando, setCarregando] = useState(true)

  /* aqui a equipe inteira pode ser citada, em ordem alfabetica: esta
     conversa nao pertence a obra nenhuma, entao nao ha "participantes"
     para subir na lista como acontece no chat da obra */
  const mencionaveis = useMemo(
    () => [...equipe].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')),
    [equipe],
  )

  /* a conversa so e buscada quando o pop-up abre: ela nao entra na carga do
     quadro, que ja e grande */
  const buscar = useCallback(async () => {
    setCarregando(true)
    try {
      setMensagens(await carregarChatDoSite())
    } finally {
      setCarregando(false)
    }
  }, [carregarChatDoSite])

  useEffect(() => {
    if (aberto) buscar()
  }, [aberto, buscar])

  const enviar = async (campos) => {
    const nova = await enviarNoChatDoSite(campos)
    /* a mensagem entra na lista aqui mesmo: recarregar o chat inteiro para
       mostrar uma linha nova daria um piscar em toda a conversa */
    setMensagens((atual) => [...atual, nova])
  }

  const apagar = async (mensagem, escopo) => {
    await apagarDoChatDoSite(mensagem.id, escopo)
    setMensagens((atual) =>
      escopo === 'todos'
        ? atual.map((m) =>
            m.id === mensagem.id
              ? { ...m, apagada: true, texto: '', arquivo: null, editadaEm: null }
              : m,
          )
        : atual.filter((m) => m.id !== mensagem.id),
    )
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Chat da equipe"
      largura={640}
      /* o chat e pop-up de morar: quem passa o dia nele escolhe o
         tamanho uma vez e o sistema lembra */
      ajustavel="customers.chat-tamanho"
    >
      <Conversa
        aberto={aberto}
        mensagens={mensagens}
        carregando={carregando}
        mencionaveis={mencionaveis}
        usuario={user}
        pessoaPorId={pessoaPorId}
        vazio="Nenhuma mensagem ainda. Escreva a primeira aqui embaixo"
        aoEnviar={enviar}
        aoApagar={apagar}
      />
    </Modal>
  )
}
