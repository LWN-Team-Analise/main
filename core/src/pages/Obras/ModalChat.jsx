import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Conversa from '@/components/Chat/Conversa'
import { useDados } from '@/context/DadosContext'
import { useAuth } from '@/context/AuthContext'
import { tituloDaObra } from '@/domain/obras'

/**
 * O chat da obra.
 *
 * Cada obra tem a sua conversa, e ela fica gravada no banco — abrir
 * pelo botao "Abrir chat" (ao lado de Membros) ou pelo "+" do canto
 * leva ao mesmo lugar.
 *
 * A conversa em si — escrever, anexar, tirar foto, responder,
 * mencionar com @, apagar — mora em `components/Chat/Conversa`, e e a
 * MESMA do chat da equipe. Aqui ficam so as tres coisas que sao desta
 * obra: quais mensagens carregar, quem pode ser citado e o que fazer
 * quando alguem envia ou apaga.
 *
 * `somenteLeitura` e o chat da obra CONCLUIDA. A conversa inteira
 * continua a vista — e ela costuma ser a melhor explicacao do que
 * aconteceu na obra —, mas a caixa de escrever some, junto com o
 * responder e o apagar de cada mensagem. Uma obra encerrada nao recebe
 * mais nada: se recebesse, o registro dela mudaria depois de fechado.
 */
export default function ModalChat({ aberto, obra, somenteLeitura = false, aoFechar }) {
  const { user } = useAuth()
  const { equipe, pessoaPorId, clientePorId, carregarChat, enviarMensagem, apagarMensagem } =
    useDados()

  const [mensagens, setMensagens] = useState([])
  const [carregando, setCarregando] = useState(true)

  const cliente = obra ? clientePorId(obra.clienteId) : null

  /* quem participa da obra vem primeiro na lista de mencao; o resto da
     equipe continua disponivel, so mais abaixo */
  const mencionaveis = useMemo(() => {
    const daObra = new Set((obra?.membros ?? []).map(String))
    return [...equipe].sort((a, b) => {
      const pesoA = daObra.has(String(a.id)) ? 0 : 1
      const pesoB = daObra.has(String(b.id)) ? 0 : 1
      if (pesoA !== pesoB) return pesoA - pesoB
      return String(a.nome).localeCompare(String(b.nome), 'pt-BR')
    })
  }, [equipe, obra?.membros])

  const buscar = useCallback(async () => {
    if (!obra) return
    setCarregando(true)
    try {
      setMensagens(await carregarChat(obra.id))
    } finally {
      setCarregando(false)
    }
  }, [obra, carregarChat])

  useEffect(() => {
    if (aberto) buscar()
  }, [aberto, buscar])

  const enviar = async (campos) => {
    const nova = await enviarMensagem(obra.id, campos)
    setMensagens((atual) => [...atual, nova])
  }

  const apagar = async (mensagem, escopo) => {
    await apagarMensagem(obra.id, mensagem.id, escopo)
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

  if (!obra) return null

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={`Chat — ${tituloDaObra(obra, cliente)}`}
      largura={640}
    >
      <Conversa
        aberto={aberto}
        mensagens={mensagens}
        carregando={carregando}
        mencionaveis={mencionaveis}
        usuario={user}
        pessoaPorId={pessoaPorId}
        somenteLeitura={somenteLeitura}
        vazio={
          somenteLeitura
            ? 'Esta obra foi concluída sem nenhuma mensagem no chat.'
            : 'Nenhuma mensagem ainda. Escreva a primeira aqui embaixo'
        }
        aoEnviar={enviar}
        aoApagar={apagar}
      />
    </Modal>
  )
}
