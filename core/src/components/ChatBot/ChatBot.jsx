import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Avatar from '@/components/Avatar/Avatar'
import { useAuth } from '@/context/AuthContext'
/* a marca da empresa responde no lugar de um desenho de robô: quem
   fala aqui é o sistema da LWN, e não um personagem */
/* o mesmo arquivo do icone da aba (ver index.html) */
import iconeLWN from '@/assets/icone-lwn.png'
import { conversarComBot, enviarSugestaoDoBot } from '@/services/botService'
import './ChatBot.css'

/**
 * LWN BOT — conversa com um agente.
 *
 * Esta tela é só a conversa: quem pensa é o modelo, do outro lado de
 * `POST /api/bot`, com o manual do sistema no contexto e uma ferramenta
 * para mandar sugestão por e-mail.
 *
 * ---------------- Por que não há botão "Enviar sugestão" ----------------
 *
 * Porque não é um formulário: é uma conversa. Quem quer sugerir escreve
 * o que quer mudar, o bot reconhece e redige — e aí, só aí, aparece na
 * própria conversa o cartão para conferir e mandar. Um botão fixo na
 * barra obrigaria a pessoa a saber, ANTES de escrever, se o que ela tem
 * na cabeça é "dúvida" ou "sugestão" — e quase sempre começa como
 * reclamação no meio de uma dúvida.
 *
 * ---------------- Por que o clique existe ----------------
 *
 * O modelo roda nesta máquina, e modelo pequeno não é confiável com
 * ferramenta: o llama3.2:3b chamou o envio de sugestão para a pergunta
 * "como eu troco minha senha?". Num recurso que manda e-mail anônimo
 * para a diretoria, tirar a decisão do modelo e devolvê-la à pessoa é a
 * troca certa — o bot propõe, quem manda é o clique.
 *
 * O texto vem editável de propósito: o que o modelo redigiu é um
 * rascunho, e quem assina (ou não) o recado é quem está lendo.
 *
 * ---------------- O interruptor ----------------
 *
 * Nasce em ANÔNIMO. É o padrão que protege quem não reparou no
 * controle: assinar sem querer é irreversível, e o contrário não.
 */

const ABERTURA = {
  papel: 'bot',
  texto:
    'Oi! Sobre o que você quer falar? Escolha um assunto aqui embaixo, ou pergunte do seu jeito.',
}

/**
 * Os assuntos que abrem a conversa.
 *
 * Cada um manda uma pergunta inicial ao modelo — não é um filtro nem
 * um menu de telas: é o jeito de quem abriu o chat sem saber o que
 * perguntar descobrir o que dá para perguntar.
 *
 * "Enviar sugestão" é o único que não faz uma pergunta: ele começa o
 * roteiro guiado do envio, que corre aqui na tela.
 */
const TOPICOS = [
  { id: 'site', rotulo: 'O site', pergunta: 'Como o sistema funciona, no geral?' },
  { id: 'obras', rotulo: 'Obras', pergunta: 'Como funcionam as obras e o quadro?' },
  { id: 'tarefas', rotulo: 'Tarefas', pergunta: 'Como funcionam as tarefas e os checks?' },
  { id: 'clientes', rotulo: 'Clientes', pergunta: 'Como funciona o cadastro de clientes?' },
  {
    id: 'concluidas',
    rotulo: 'Concluídas',
    pergunta: 'Como funciona a aba de obras concluídas?',
  },
  { id: 'etapas', rotulo: 'Etapas', pergunta: 'Como funcionam as etapas do roteiro?' },
  {
    id: 'rastreabilidade',
    rotulo: 'Rastreabilidade',
    pergunta: 'Como funciona a rastreabilidade da obra?',
  },
]

export default function ChatBot({ aberto, aoFechar }) {
  const { user } = useAuth()
  const [falas, setFalas] = useState([ABERTURA])
  const [texto, setTexto] = useState('')
  const [anonima, setAnonima] = useState(true)
  const [pensando, setPensando] = useState(false)
  /**
   * O roteiro da sugestão, quando ele está em curso:
   *
   *   'como'      — perguntando se vai anônima ou assinada
   *   'texto'     — esperando a mensagem
   *   'confere'   — mostrando o resumo para a última confirmação
   *
   * null = ninguém está sugerindo nada, e o chat é só conversa.
   */
  const [etapa, setEtapa] = useState(null)
  const [proposta, setProposta] = useState(null)
  const [mandando, setMandando] = useState(false)
  const fim = useRef(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [falas, pensando, proposta, etapa])

  const dizer = (papel, texto, extra = {}) =>
    setFalas((atuais) => [...atuais, { papel, texto, ...extra }])

  /** Começa o roteiro da sugestão: primeiro o como, depois o quê. */
  const comecarSugestao = () => {
    setEtapa('como')
    dizer('eu', 'Quero enviar uma sugestão')
    dizer(
      'bot',
      "Boa! Antes de você escrever: quer mandar de forma anônima?\n\n" +
        'Anônima quer dizer sem o seu nome, sem o seu e-mail e sem o seu setor — a Excelência lê a ' +
        'sugestão e mais nada, e não fica registrado em lugar nenhum quem escreveu.',
    )
  }

  /** A resposta do "anônima ou assinada?" */
  const escolherComo = (sem) => {
    setAnonima(sem)
    setEtapa('texto')
    dizer('eu', sem ? 'Anônima' : 'Pode assinar')
    dizer(
      'bot',
      sem
        ? 'Combinado, vai sem o seu nome. Agora escreva a sugestão aí embaixo.'
        : 'Combinado, vai com o seu nome e setor. Agora escreva a sugestão aí embaixo.',
    )
  }

  /** Um assunto dos chips vira uma pergunta ao modelo. */
  const abrirTopico = async (topico) => {
    if (pensando) return
    if (topico.id === 'sugestao') return comecarSugestao()

    const comigo = [...falas, { papel: 'eu', texto: topico.pergunta }]
    setFalas(comigo)
    setPensando(true)
    try {
      const resultado = await conversarComBot(comigo.slice(1))
      dizer('bot', resultado.resposta)
    } catch (erro) {
      dizer('bot', erro.message || 'Não consegui responder agora.', { falhou: true })
    } finally {
      setPensando(false)
    }
  }

  const enviar = async (evento) => {
    evento.preventDefault()
    const limpo = texto.trim()
    if (!limpo || pensando) return

    /* no meio do roteiro, o que a pessoa escreve é a sugestão — e não
       uma pergunta para o modelo */
    if (etapa === 'texto') {
      if (limpo.length < 10) {
        dizer('bot', 'Escreva um pouco mais — com uma linha só não dá para agir.')
        return
      }
      setTexto('')
      dizer('eu', limpo)
      setProposta(limpo)
      setEtapa('confere')
      return
    }

    const comigo = [...falas, { papel: 'eu', texto: limpo }]
    setFalas(comigo)
    setTexto('')
    setPensando(true)

    try {
      /* a abertura não sobe: ela é fala da tela, não do modelo, e
         mandá-la de volta faria o bot responder a si mesmo */
      const resultado = await conversarComBot(comigo.slice(1))
      setFalas((atuais) => [...atuais, { papel: 'bot', texto: resultado.resposta }])
      if (resultado.sugestao) setProposta(resultado.sugestao)
    } catch (erro) {
      setFalas((atuais) => [
        ...atuais,
        { papel: 'bot', texto: erro.message || 'Não consegui responder agora.', falhou: true },
      ])
    } finally {
      setPensando(false)
    }
  }

  const mandar = async () => {
    setMandando(true)
    try {
      const { como } = await enviarSugestaoDoBot(proposta, anonima)
      setProposta(null)
      setEtapa(null)
      setFalas((atuais) => [
        ...atuais,
        {
          papel: 'bot',
          texto:
            como === 'anônima'
              ? 'Mandei para a Excelência sem o seu nome: eles leem a sugestão e mais nada.'
              : 'Mandei para a Excelência com o seu nome e setor — dá para responderem direto.',
          enviou: como,
        },
      ])
    } catch (erro) {
      dizer('bot', erro.message || 'Não consegui enviar agora.', { falhou: true })
    } finally {
      setMandando(false)
    }
  }

  const desistir = () => {
    setProposta(null)
    setEtapa(null)
    dizer('bot', 'Tudo bem, não mandei nada. Se quiser, é só chamar de novo.')
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Chat LWN"
      largura={560}
      ajustavel="customers.bot-tamanho"
    >
      <div className="bot">
        <div className="bot__fita">
          {falas.map((fala, i) => (
            <article key={i} className={`bot__fala ${fala.papel === 'eu' ? 'is-minha' : ''}`.trim()}>
              <span className="bot__cara" aria-hidden="true">
                {fala.papel === 'bot' ? (
                  <img src={iconeLWN} alt="" />
                ) : (
                  <Avatar nome={user?.name} foto={user?.foto} tamanho={30} />
                )}
              </span>
              <div
                className="bot__balao"
                data-estado={fala.enviou ? 'feito' : fala.falhou ? 'falhou' : undefined}
              >
                {fala.texto.split('\n\n').map((paragrafo, p) => (
                  <p key={p}>{paragrafo}</p>
                ))}
                {fala.enviou && (
                  <p className="bot__carimbo">
                    {fala.enviou === 'anônima'
                      ? 'Enviada sem o seu nome'
                      : 'Enviada com o seu nome'}
                  </p>
                )}
              </div>
            </article>
          ))}

          {/* ---- a proposta de sugestão ----
              Aparece dentro da conversa, no lugar onde a resposta
              parou: é a continuação do que estava sendo falado, e não
              um formulário que abre por cima. */}
          {/* ---- o passo "anônima ou assinada?" ---- */}
          {etapa === 'como' && (
            <div className="bot__escolhas">
              <button type="button" className="bot__escolha" onClick={() => escolherComo(true)}>
                Sim, anônima
              </button>
              <button type="button" className="bot__escolha" onClick={() => escolherComo(false)}>
                Não, pode assinar
              </button>
            </div>
          )}

          {/* ---- a última conferência ----
              Tudo o que vai sair daqui, escrito antes de sair: o texto,
              para quem vai e com que nome. É o passo que separa "eu
              escrevi" de "eu mandei". */}
          {etapa === 'confere' && proposta !== null && (
            <article className="bot__proposta">
              <p className="bot__propostatopo">Confere e manda?</p>
          <textarea
                className="bot__propostatexto"
                rows={3}
                value={proposta}
                onChange={(e) => setProposta(e.target.value)}
                aria-label="Texto da sugestão, editável antes de enviar"
              />
              <dl className="bot__resumo">
                <div>
                  <dt>Para</dt>
                  <dd>Setor de Excelência</dd>
                </div>
                <div>
                  <dt>Assinatura</dt>
                  <dd>
                    {anonima ? 'Anônima — sem o seu nome' : 'Com o seu nome, setor e e-mail'}{' '}
                    <button type="button" onClick={() => setAnonima((v) => !v)}>
                      {anonima ? 'assinar' : 'tirar meu nome'}
                    </button>
                  </dd>
                </div>
              </dl>
              <div className="bot__propostaacoes">
                <button
                  type="button"
                  className="bot__descartar"
                  onClick={desistir}
                  disabled={mandando}
                >
                  Deixa pra lá
                </button>
                <Button
                  type="button"
                  onClick={mandar}
                  loading={mandando}
                  disabled={proposta.trim().length < 10}
                >
                  Enviar assim mesmo
                </Button>
              </div>
            </article>
          )}

          {pensando && (
            <article className="bot__fala">
              <span className="bot__cara" aria-hidden="true">
                <img src={iconeLWN} alt="" />
              </span>
              <div className="bot__balao bot__balao--pensando" aria-label="escrevendo">
                <i />
                <i />
                <i />
              </div>
            </article>
          )}
          <span ref={fim} />
        </div>

        <form className="bot__escrever" onSubmit={enviar}>
          {/* ---- os assuntos ----
          Ficam junto do campo, como os anexos de um chat: são o que
          dá para "anexar" à conversa. Somem enquanto o roteiro da
          sugestão está em curso — ali a conversa tem um caminho, e
          oferecer sete desvios no meio dele só atrapalha. */}
          {etapa === null && (
          <div className="bot__topicos">
          {TOPICOS.map((t) => (
          <button
          key={t.id}
          type="button"
          className="bot__topico"
          onClick={() => abrirTopico(t)}
          disabled={pensando}
          >
          {t.rotulo}
          </button>
          ))}
          <button
          type="button"
          className="bot__topico"
          onClick={comecarSugestao}
          disabled={pensando}
          >
          Enviar sugestão
          </button>
          </div>
          )}

          <textarea
            className="bot__campo"
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              etapa === 'texto'
                ? 'Escreva a sua sugestão'
                : 'Pergunte alguma coisa sobre o sistema'
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviar(e)
              }
            }}
          />


          <div className="bot__acoes">
            <Button type="submit" disabled={!texto.trim()} loading={pensando}>
              Enviar
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
