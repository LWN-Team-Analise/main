import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Conversa from '@/components/Chat/Conversa'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import { CHAT_LIDO } from '@/hooks/useNaoLidasChat'
import useNotificacoesCelular from '@/hooks/useNotificacoesCelular'
import { marcarChatLido } from '@/services/dadosService'
import './ChatEquipe.css'

/* de quanto em quanto tempo a conversa e conferida com a tela aberta */
const INTERVALO = 12_000

/* o convite para ligar as notificacoes, fechado uma vez, nao volta */
const SEM_CONVITE = 'atmosfera.chat-sem-convite'

const lerSemConvite = () => {
  try {
    return localStorage.getItem(SEM_CONVITE) === '1'
  } catch {
    return false
  }
}

/** "Receber no celular": so aparece quando este aparelho pode ligar e ainda nao ligou. */
function ConviteNotificacao() {
  const notif = useNotificacoesCelular()
  const [fechado, setFechado] = useState(lerSemConvite)
  if (fechado || notif.estado !== 'desligado') return null
  const fechar = () => {
    setFechado(true)
    try {
      localStorage.setItem(SEM_CONVITE, '1')
    } catch {
      /* sem storage, o convite volta na proxima visita */
    }
  }
  return (
    <div className="chatpag__convite" role="note">
      <span>Receba as mensagens no celular, mesmo com o app fechado.</span>
      <button type="button" className="chatpag__ligar" onClick={notif.ligar} disabled={notif.ocupado}>
        {notif.ocupado ? 'Ligando...' : 'Ligar notificações'}
      </button>
      <button type="button" className="chatpag__fechar" onClick={fechar} aria-label="Fechar o convite">
        ×
      </button>
      {notif.erro && <span className="chatpag__erro">{notif.erro}</span>}
    </div>
  )
}

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

  /* a conversa so e buscada aqui: ela nao entra na carga do quadro, que
     ja e grande. A lista so e trocada quando algo mudou — trocar a cada
     busca faria a conversa pular para o fim enquanto alguem le */
  const assinatura = useRef('')
  const buscar = useCallback(
    async (primeira = false) => {
      if (primeira) setCarregando(true)
      try {
        const lista = await carregarChatDoSite()
        const nova = lista.map((m) => `${m.id}${m.apagada ? 'x' : ''}`).join(',')
        if (nova !== assinatura.current) {
          assinatura.current = nova
          setMensagens(lista)
        }
      } catch {
        /* sem rede: tenta de novo na proxima volta */
      } finally {
        if (primeira) setCarregando(false)
      }
    },
    [carregarChatDoSite],
  )

  /* mensagens novas aparecem sozinhas: a cada 12s com a tela visivel, ao
     voltar para a aba e na hora em que chega a notificacao do chat */
  useEffect(() => {
    buscar(true)
    const relogio = setInterval(() => document.visibilityState === 'visible' && buscar(), INTERVALO)
    const visivel = () => document.visibilityState === 'visible' && buscar()
    const doServiceWorker = (e) => e.data?.tipo === 'push' && e.data.tag === 'chat-equipe' && buscar()
    document.addEventListener('visibilitychange', visivel)
    navigator.serviceWorker?.addEventListener('message', doServiceWorker)
    return () => {
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', visivel)
      navigator.serviceWorker?.removeEventListener('message', doServiceWorker)
    }
  }, [buscar])

  /* o que esta na tela foi lido: o botao do chat zera em todas as telas */
  useEffect(() => {
    const ultima = mensagens.at(-1)
    if (!ultima || document.visibilityState !== 'visible') return
    marcarChatLido(ultima.id)
      .then(() => window.dispatchEvent(new Event(CHAT_LIDO)))
      .catch(() => {})
  }, [mensagens])

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

        <ConviteNotificacao />

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
