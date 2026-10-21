import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Avatar from '@/components/Avatar/Avatar'
import Button from '@/components/Button/Button'
import { CampoArea, CampoTexto } from '@/components/Campo/Campo'
import { emailValido } from '@/domain/comercial'
import { dataHora } from '@/utils/formato'
import * as comercial from '@/services/comercialService'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'

/**
 * O "Responder?" do cartao: escrever ao contato do negocio sem sair do
 * site — e o e-mail sai da caixa do Outlook de QUEM esta logado, como se
 * ele tivesse escrito no Outlook (fica nos Itens Enviados dele, e a
 * resposta do cliente volta para ele).
 *
 * Quando a API da Microsoft pode ler a caixa de entrada, a janela
 * mostra o ultimo e-mail do contato e a mensagem vai como RESPOSTA
 * dentro daquela conversa. Sem a leitura, vai como e-mail novo — e a
 * janela diz o que falta liberar.
 *
 * Quem envia aparece no topo com a foto do perfil do site — que e a
 * do Outlook: entrar ou vincular a conta Microsoft traz a foto de la.
 */
export default function ModalEmail({ aberto, negocio, aoFechar, aoEnviado }) {
  const [info, setInfo] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [form, setForm] = useState({ para: '', assunto: '', mensagem: '', responder: true })
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { user } = useAuth()
  const { equipe } = useDados()
  /* a foto da lista da equipe e a mais nova (a da sessao e a do login) */
  const pessoa = (id) => equipe.find((p) => String(p.id) === String(id)) ?? null
  const eu = pessoa(user?.id)
  const meuNome = eu?.nome ?? user?.name ?? ''
  const minhaFoto = eu?.foto ?? user?.foto ?? null

  useEffect(() => {
    if (!aberto || !negocio) return undefined
    let valido = true
    setInfo(null)
    setErros({})
    setErro('')
    setForm({ para: negocio.contatoEmail ?? '', assunto: negocio.titulo, mensagem: '', responder: true })
    setCarregando(true)
    comercial
      .carregarEmails(negocio.id)
      .then((r) => {
        if (!valido) return
        setInfo(r)
        if (r.ultimo?.assunto) {
          const assunto = /^re:/i.test(r.ultimo.assunto) ? r.ultimo.assunto : `RE: ${r.ultimo.assunto}`
          setForm((atual) => ({ ...atual, assunto }))
        }
      })
      .catch((e) => valido && setErro(e.message))
      .finally(() => valido && setCarregando(false))
    return () => {
      valido = false
    }
  }, [aberto, negocio])

  const mudar = (campo) => (evento) => {
    setForm((atual) => ({ ...atual, [campo]: evento.target.value }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
    setErro('')
  }

  const ultimo = info?.ultimo ?? null
  const respondendo = Boolean(ultimo) && form.responder
  const caixa = info?.email?.caixa ?? ''

  const enviar = async (evento) => {
    evento.preventDefault()
    const novos = {}
    if (!emailValido(form.para)) novos.para = 'Confira o e-mail do destinatário.'
    if (!respondendo && !form.assunto.trim()) novos.assunto = 'Escreva o assunto.'
    if (!form.mensagem.trim()) novos.mensagem = 'Escreva a mensagem.'
    setErros(novos)
    if (Object.keys(novos).length) return

    setEnviando(true)
    try {
      const r = await comercial.enviarEmail(negocio.id, {
        para: form.para.trim(),
        assunto: form.assunto.trim(),
        mensagem: form.mensagem,
        responder: respondendo,
      })
      aoEnviado(r.negocio, r.resposta ? `Resposta enviada da sua caixa (${caixa}).` : `E-mail enviado da sua caixa (${caixa}).`)
      aoFechar()
    } catch (e) {
      if (e.campo) setErros((atual) => ({ ...atual, [e.campo]: e.message }))
      else setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={ultimo ? 'Responder e-mail' : 'Enviar e-mail'}
      subtitulo={negocio ? `${negocio.titulo}${negocio.organizacao ? ` · ${negocio.organizacao}` : ''}` : undefined}
      largura={620}
    >
      <form className="emailneg" onSubmit={enviar} noValidate>
        {carregando && <p className="emailneg__nota">Abrindo a conversa...</p>}

        {ultimo && (
          <div className="emailneg__ultimo">
            <p className="emailneg__ultimo-topo">
              <strong>{negocio.contatoNome || form.para}</strong> escreveu em {dataHora(ultimo.recebidoEm)}
              {ultimo.aguardando && <span className="emailneg__espera">espera resposta</span>}
            </p>
            <p className="emailneg__ultimo-assunto">{ultimo.assunto || '(sem assunto)'}</p>
            {ultimo.previa && <p className="emailneg__ultimo-previa">{ultimo.previa}</p>}
            <label className="emailneg__responder">
              <input
                type="checkbox"
                checked={form.responder}
                onChange={(e) => setForm((atual) => ({ ...atual, responder: e.target.checked }))}
              />
              Responder dentro desta conversa
            </label>
          </div>
        )}

        {info && !info.email.leitura && (
          <p className="emailneg__nota">
            O e-mail sai como mensagem nova. Para responder dentro da conversa (e o cartão saber quem espera resposta),
            o administrador do Outlook precisa liberar a permissão <strong>Mail.Read</strong> do aplicativo no Entra ID.
          </p>
        )}
        {info?.erroLeitura && <p className="emailneg__nota">{info.erroLeitura}</p>}

        <div className="emailneg__de">
          <Avatar nome={meuNome} foto={minhaFoto} tamanho={42} titulo={meuNome} />
          <p>
            <span>De</span>
            <strong>{meuNome}</strong>
            <em>{caixa || 'sua caixa do Outlook'}</em>
          </p>
        </div>

        <CampoTexto
          rotulo="Para"
          type="email"
          largo
          value={form.para}
          onChange={mudar('para')}
          erro={erros.para}
          placeholder="nome@empresa.com.br"
        />
        {!respondendo && (
          <CampoTexto
            rotulo="Assunto"
            largo
            value={form.assunto}
            onChange={mudar('assunto')}
            erro={erros.assunto}
            maxLength={250}
          />
        )}
        <CampoArea
          rotulo="Mensagem"
          largo
          linhas={7}
          value={form.mensagem}
          onChange={mudar('mensagem')}
          erro={erros.mensagem}
          placeholder="Escreva aqui. A assinatura do Outlook não entra sozinha: inclua a sua no fim, se quiser."
        />

        {erro && (
          <p className="negform__erro" role="alert">
            {erro}
          </p>
        )}

        {info?.enviados?.length > 0 && (
          <details className="emailneg__historico">
            <summary>
              {info.enviados.length} e-mail{info.enviados.length === 1 ? '' : 's'} já enviado
              {info.enviados.length === 1 ? '' : 's'} por aqui
            </summary>
            <ul>
              {info.enviados.map((e) => (
                <li key={e.id}>
                  <Avatar
                    nome={e.usuarioNome || e.de}
                    foto={pessoa(e.usuarioId)?.foto ?? null}
                    tamanho={30}
                    titulo={e.usuarioNome || e.de}
                  />
                  <div>
                    <p>
                      <strong>{e.assunto}</strong> — {e.usuarioNome || e.de}, {dataHora(e.enviadoEm)}
                      {e.resposta && <span className="emailneg__selo">resposta</span>}
                    </p>
                    <p className="emailneg__corpo">{e.corpo}</p>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}

        <footer className="negform__rodape">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={enviando} disabled={info ? !info.email.envio : false}>
            {respondendo ? 'Responder' : 'Enviar'}
          </Button>
        </footer>
        {info && !info.email.envio && (
          <p className="negform__erro" role="alert">
            O envio pela API da Microsoft não está configurado no servidor.
          </p>
        )}
      </form>
    </Modal>
  )
}
