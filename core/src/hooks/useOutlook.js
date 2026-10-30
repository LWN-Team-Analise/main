import { useCallback, useEffect, useRef, useState } from 'react'
import { inicioDoOutlook, outlookConfigurado } from '@/services/authService'
import { BASE } from '@/base'

/**
 * A janelinha do login com Outlook.
 *
 * Duas telas usam o mesmo caminho — a de Login (para entrar) e a de
 * Configuracoes (para vincular) —, e as duas precisam da MESMA coisa:
 * abrir a janela da Microsoft e esperar o `code` voltar.
 *
 * Uso:
 *     const outlook = useOutlook()
 *     const { codigo, redirecionar } = await outlook.abrir()
 *
 * `abrir(inicio)` aceita outro pedido de janela no lugar do login: e
 * por ele que Configuracoes conecta a conta que manda as mensagens no
 * Teams (outros escopos, o mesmo endereco de retorno).
 *
 * `outlook.disponivel` diz se o servidor esta configurado; enquanto
 * nao estiver, a tela mostra o recado em vez do botao. `outlook.motivo`
 * diz POR QUE nao esta — sem chave no servidor ou API sem responder —,
 * que sao dois problemas com duas solucoes diferentes.
 */

/** O endereco que a Microsoft chama de volta (ver src/routes/AppRoutes.jsx).
    Precisa estar cadastrado no app da Microsoft exatamente assim. */
const RETORNO = () => `${window.location.origin}${BASE}/outlook`

export default function useOutlook() {
  const [disponivel, setDisponivel] = useState(false)
  /* 'sim' | 'nao' | 'sem-resposta' — ver authService.outlookConfigurado */
  const [motivo, setMotivo] = useState('nao')
  const [conferindo, setConferindo] = useState(true)
  const janela = useRef(null)

  useEffect(() => {
    let vivo = true
    outlookConfigurado().then((resposta) => {
      if (!vivo) return
      setMotivo(resposta)
      setDisponivel(resposta === 'sim')
      setConferindo(false)
    })
    return () => {
      vivo = false
    }
  }, [])

  /* se a pessoa sair da tela com a janelinha aberta, fecha junto */
  useEffect(
    () => () => {
      if (janela.current && !janela.current.closed) janela.current.close()
    },
    [],
  )

  const abrir = useCallback(async (inicio = inicioDoOutlook) => {
    const redirecionar = RETORNO()
    /* o `estado` volta da Microsoft no retorno: so o codigo que traz o
       MESMO estado e desta janela. Sem a conferencia, um codigo de outra
       conta, empurrado para o /outlook, entraria no lugar do nosso. */
    const { url, estado } = await inicio(redirecionar)

    /* a janela e aberta ANTES do await sempre que possivel; como aqui
       ela vem depois de uma chamada, alguns navegadores podem barrar —
       por isso o recado especifico quando `popup` volta nulo */
    const popup = window.open(url, 'outlook-lwn', 'width=520,height=680')
    janela.current = popup
    if (!popup) {
      throw new Error('O navegador bloqueou a janela do Outlook. Libere os pop-ups e tente de novo.')
    }

    return new Promise((resolver, recusar) => {
      let fim = false

      const terminar = (acao, valor) => {
        if (fim) return
        fim = true
        window.removeEventListener('message', ouvir)
        window.clearInterval(vigia)
        acao(valor)
      }

      const ouvir = (evento) => {
        if (evento.origin !== window.location.origin) return
        if (evento.data?.origem !== 'outlook') return
        if (evento.data.erro) terminar(recusar, new Error(evento.data.erro))
        else if (estado && evento.data.estado !== estado) {
          terminar(recusar, new Error('A resposta da Microsoft não é desta janela. Tente de novo.'))
        }
        else if (evento.data.codigo) terminar(resolver, { codigo: evento.data.codigo, redirecionar })
        else terminar(recusar, new Error('A Microsoft não devolveu o código de entrada.'))
      }

      /* fechar a janelinha no X tambem tem que encerrar a espera, senao
         a tela ficaria travada em "entrando..." para sempre */
      const vigia = window.setInterval(() => {
        if (popup.closed) terminar(recusar, new Error('Entrada com Outlook cancelada.'))
      }, 600)

      window.addEventListener('message', ouvir)
    })
  }, [])

  return { disponivel, motivo, conferindo, abrir }
}
