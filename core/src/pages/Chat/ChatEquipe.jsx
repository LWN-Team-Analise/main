import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Conversa from '@/components/Chat/Conversa'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import './ChatEquipe.css'

/**
 * A CONVERSA GERAL da equipe, numa tela propria (/app/chat).
 *
 * Antes era um pop-up por cima da tela em que a pessoa estava. Virou
 * tela inteira porque e conversa de morar: com a altura toda, cabe mais
 * mensagem, e o campo de escrever fica sempre embaixo. O "Voltar", no
 * canto de cima a esquerda, leva para a pagina inicial.
 *
 * E separada do chat da obra de proposito: aquele morre com a obra e vira
 * historico dela; este e do dia a dia e nao pertence a obra nenhuma.
 *
 * O que da para fazer aqui e o MESMO do chat da obra — anexo, foto pela
 * camera, resposta, mencao com @ e as duas formas de apagar —, porque as
 * duas telas usam a mesma peca (`components/Chat/Conversa`).
 *
 * Nao exige permissao: conversar e de todo mundo que entra. O que se
 * controla e quem apaga PARA TODOS — cada um so faz isso com a propria
 * mensagem —, e a API confere de novo.
 */
export default function ChatEquipe() {
  const navegar = useNavigate()
  const { user } = useAuth()
  const { equipe, carregarChatDoSite, enviarNoChatDoSite, apagarDoChatDoSite, pessoaPorId } = useDados()

  const [mensagens, setMensagens] = useState([])
  const [carregando, setCarregando] = useState(true)

  /* aqui a equipe inteira pode ser citada, em ordem alfabetica: esta
     conversa nao pertence a obra nenhuma, entao nao ha "participantes"
     para subir na lista como acontece no chat da obra */
  const mencionaveis = useMemo(
    () => [...equipe].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')),
    [equipe],
  )

  /* a conversa so e buscada quando a tela abre: ela nao entra na carga
     do quadro, que ja e grande */
  const buscar = useCallback(async () => {
    setCarregando(true)
    try {
      setMensagens(await carregarChatDoSite())
    } finally {
      setCarregando(false)
    }
  }, [carregarChatDoSite])

  useEffect(() => {
    buscar()
  }, [buscar])

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
            m.id === mensagem.id ? { ...m, apagada: true, texto: '', arquivo: null, editadaEm: null } : m,
          )
        : atual.filter((m) => m.id !== mensagem.id),
    )
  }

  return (
    <AppShell semChat>
      <section className="chatpag" aria-labelledby="chatpag-titulo">
        <header className="chatpag__topo">
          <button type="button" className="chatpag__voltar" onClick={() => navegar('/app')}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            Voltar
          </button>
          <div className="chatpag__titulos">
            <h1 id="chatpag-titulo" className="chatpag__titulo">
              Chat da equipe
            </h1>
            <p className="chatpag__sub">A conversa geral, para toda a equipe. O chat de cada obra fica dentro dela.</p>
          </div>
        </header>

        <div className="chatpag__caixa">
          <Conversa
            mensagens={mensagens}
            carregando={carregando}
            mencionaveis={mencionaveis}
            usuario={user}
            pessoaPorId={pessoaPorId}
            vazio="Nenhuma mensagem ainda. Escreva a primeira aqui embaixo"
            aoEnviar={enviar}
            aoApagar={apagar}
          />
        </div>
      </section>
    </AppShell>
  )
}
