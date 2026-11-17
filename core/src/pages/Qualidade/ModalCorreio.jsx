import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoArea, CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { CampoData } from '@/components/CampoData/CampoData'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import {
  CONTEUDOS_CORREIO,
  CORREIO_CANCELADA,
  CORREIO_NOME_MAXIMO,
  CORREIO_OBS_MAXIMA,
  CORREIO_RASTREIO_MAXIMO,
  CORREIO_TEXTO_MAXIMO,
  RASTREIO_CORREIOS,
  SERVICOS_CORREIO,
  SITUACOES_CORREIO,
  UFS,
  enderecoEmLinha,
  formatarCep,
  rotuloServicoCorreio,
  rotuloSituacaoCorreio,
} from '@/domain/qualidade'
import { buscarCEP } from '@/services/enderecoService'
import * as qualidade from '@/services/qualidadeService'
import { dataBR, dataHora, hojeISO, reais } from '@/utils/formato'

const VAZIO = {
  conteudo: '',
  obraId: '',
  clienteId: '',
  destinatario: '',
  contato: '',
  telefone: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  servico: 'sedex',
  prazo: '',
  observacao: '',
}

/**
 * O pedido de envio: pedir (`alvo.novo`) ou abrir (`alvo.solicitacao`).
 *
 * O formulario: o que vai (com os atalhos de sempre), a obra (opcional,
 * traz o cliente e o endereco do cadastro dele), para quem, o endereco (o
 * CEP preenche rua, bairro, cidade e UF), o servico e ate quando precisa
 * sair. Quem pediu edita enquanto o pedido esta "Solicitada"; quem atende,
 * sempre.
 *
 * Aberto, mostra ao lado o andamento e, para quem atende, a caixa de
 * atender: a nova situacao, o codigo de rastreio, o custo, as datas e um
 * recado. `alvo.atender` ('postada') ja abre a caixa nessa situacao — e o
 * que acontece ao soltar o cartao em "Postada" sem o rastreio. Quem pediu
 * cancela, com o motivo, enquanto ninguem pegou.
 */
export default function ModalCorreio({ alvo, atende, aoFechar, aoSalvar, aoExcluir }) {
  const { user } = useAuth()
  const { obras, clientePorId } = useDados()
  const solicitacao = alvo?.solicitacao ?? null
  const novo = Boolean(alvo?.novo)

  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [atual, setAtual] = useState(null)
  const [atendendo, setAtendendo] = useState({ situacao: '', rastreio: '', custo: '', postadoEm: '', entregueEm: '', resposta: '' })
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!alvo) return
    setErros({})
    setCancelando(false)
    setMotivo('')
    setCopiado(false)
    if (solicitacao) {
      setAtual(solicitacao)
      setForm({
        ...VAZIO,
        ...Object.fromEntries(Object.keys(VAZIO).map((k) => [k, solicitacao[k] ?? ''])),
        cep: formatarCep(solicitacao.cep),
      })
      const proxima = alvo.atender ?? proximaSituacao(solicitacao.situacao)
      setAtendendo({
        situacao: proxima,
        rastreio: solicitacao.rastreio ?? '',
        custo: solicitacao.custo === null || solicitacao.custo === undefined ? '' : String(solicitacao.custo).replace('.', ','),
        postadoEm: solicitacao.postadoEm ?? (proxima === 'postada' ? hojeISO() : ''),
        entregueEm: solicitacao.entregueEm ?? (proxima === 'entregue' ? hojeISO() : ''),
        resposta: '',
      })
    } else {
      setAtual(null)
      setForm(VAZIO)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo])

  const meu = atual && String(atual.solicitanteId) === String(user?.id ?? '')
  const editavel = novo || (atual && (atende || (meu && atual.situacao === 'solicitada')))

  const mudar = (campo) => (evento) => {
    const valor = evento?.target ? evento.target.value : evento
    setForm((antes) => ({ ...antes, [campo]: valor }))
    setErros((antes) => ({ ...antes, [campo]: undefined, geral: undefined }))
  }

  /* todas as obras, tambem as concluidas: a pasta fisica sai no encerramento */
  const nomeDaObra = (o) => [clientePorId(o.clienteId)?.nome, o.proposta].filter(Boolean).join(' - ') || 'Obra'
  const opcoesObra = useMemo(
    () => [
      { valor: '', rotulo: 'Nenhuma' },
      ...obras
        .map((o) => ({ valor: String(o.id), rotulo: nomeDaObra(o) }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obras],
  )

  /* a obra traz o cliente e o endereco do cadastro dele (que continua editavel) */
  const escolherObra = (evento) => {
    const valor = evento.target.value
    const obra = obras.find((o) => String(o.id) === String(valor))
    const cliente = obra ? clientePorId(obra.clienteId) : null
    setForm((antes) => ({
      ...antes,
      obraId: valor,
      clienteId: cliente ? String(cliente.id) : '',
      ...(cliente
        ? {
            destinatario: cliente.nome ?? antes.destinatario,
            cep: cliente.cep ? formatarCep(cliente.cep) : antes.cep,
            logradouro: cliente.endereco || antes.logradouro,
            bairro: cliente.bairro || antes.bairro,
            cidade: cliente.cidade || antes.cidade,
            uf: UFS.includes(String(cliente.estado ?? '').toUpperCase()) ? String(cliente.estado).toUpperCase() : antes.uf,
          }
        : {}),
    }))
    setErros({})
  }

  /* o CEP com 8 digitos preenche o resto pelo ViaCEP */
  const mudarCep = async (evento) => {
    const valor = evento.target.value
    mudar('cep')(valor)
    const digitos = valor.replace(/\D/g, '')
    if (digitos.length !== 8) return
    setBuscandoCep(true)
    try {
      const achado = await buscarCEP(digitos)
      if (!achado) {
        setErros((antes) => ({ ...antes, cep: 'CEP não encontrado: preencha o endereço à mão.' }))
        return
      }
      setForm((antes) => ({
        ...antes,
        cep: achado.cep,
        logradouro: achado.endereco || antes.logradouro,
        bairro: achado.bairro || antes.bairro,
        cidade: achado.cidade || antes.cidade,
        uf: achado.estado || antes.uf,
      }))
    } catch {
      setErros((antes) => ({ ...antes, cep: 'Não deu para consultar o CEP agora: preencha o endereço à mão.' }))
    } finally {
      setBuscandoCep(false)
    }
  }

  const salvar = async (evento) => {
    evento.preventDefault()
    const novos = {}
    if (!form.conteudo.trim()) novos.conteudo = 'Diga o que vai no envio.'
    if (!form.destinatario.trim()) novos.destinatario = 'Para quem vai?'
    if (!form.logradouro.trim()) novos.logradouro = 'Informe a rua, avenida...'
    if (!form.cidade.trim()) novos.cidade = 'Informe a cidade.'
    setErros(novos)
    if (Object.keys(novos).length) return
    setSalvando(true)
    try {
      const campos = { ...form, cep: form.cep.replace(/\D/g, ''), obraId: form.obraId || null, clienteId: form.clienteId || null, prazo: form.prazo || null }
      if (novo) {
        const salvo = await qualidade.solicitarEnvio(campos)
        aoSalvar(salvo, `Envio para ${salvo.destinatario} solicitado. Quem atende os envios já vê o pedido.`)
      } else {
        const salvo = await qualidade.editarSolicitacao(atual.id, campos)
        aoSalvar(salvo, 'Pedido de envio salvo.')
      }
      aoFechar()
    } catch (e) {
      setErros(e.campo ? { [e.campo]: e.message } : { geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  const atender = async (evento) => {
    evento.preventDefault()
    const a = atendendo
    if (a.situacao === 'postada' && !a.rastreio.trim() && atual.servico !== 'motoboy') {
      setErros({ rastreio: 'Informe o código de rastreio da postagem (ou deixe para depois escolhendo outra situação).' })
      return
    }
    if (a.situacao === CORREIO_CANCELADA && !a.resposta.trim()) {
      setErros({ resposta: 'Diga por que o envio foi cancelado.' })
      return
    }
    setSalvando(true)
    try {
      const salvo = await qualidade.mudarSituacaoEnvio(atual.id, {
        situacao: a.situacao,
        rastreio: a.rastreio.trim(),
        custo: a.custo.trim() || null,
        postadoEm: a.postadoEm || null,
        entregueEm: a.entregueEm || null,
        resposta: a.resposta.trim(),
      })
      aoSalvar(salvo, `Envio para ${salvo.destinatario}: ${rotuloSituacaoCorreio(salvo.situacao).toLowerCase()}.`)
      aoFechar()
    } catch (e) {
      setErros(e.campo ? { [e.campo]: e.message } : { geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  const cancelarMeu = async (evento) => {
    evento.preventDefault()
    if (!motivo.trim()) {
      setErros({ motivo: 'Diga por que o envio não é mais preciso.' })
      return
    }
    setSalvando(true)
    try {
      const salvo = await qualidade.mudarSituacaoEnvio(atual.id, { situacao: CORREIO_CANCELADA, resposta: motivo.trim() })
      aoSalvar(salvo, 'Pedido de envio cancelado.')
      aoFechar()
    } catch (e) {
      setErros({ motivo: e.message })
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    setExcluindo(false)
    setSalvando(true)
    try {
      await qualidade.excluirSolicitacao(atual.id)
      aoExcluir(atual)
      aoFechar()
    } catch (e) {
      setErros({ geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  const copiarRastreio = async () => {
    try {
      await navigator.clipboard.writeText(atual.rastreio)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      /* sem permissao de copiar: o codigo continua a vista */
    }
  }

  const mudarAtender = (campo) => (evento) => {
    const valor = evento?.target ? evento.target.value : evento
    setAtendendo((antes) => {
      const proximo = { ...antes, [campo]: valor }
      if (campo === 'situacao' && ['postada', 'entregue'].includes(valor) && !antes.postadoEm) proximo.postadoEm = hojeISO()
      if (campo === 'situacao' && valor === 'entregue' && !antes.entregueEm) proximo.entregueEm = hojeISO()
      return proximo
    })
    setErros((antes) => ({ ...antes, [campo]: undefined, geral: undefined }))
  }

  return (
    <Modal
      aberto={Boolean(alvo)}
      aoFechar={aoFechar}
      titulo={novo ? 'Solicitar envio pelo correio' : atual?.conteudo ?? 'Envio'}
      subtitulo={novo ? 'Vai para quem atende os envios' : atual ? `Para ${atual.destinatario} · ${rotuloSituacaoCorreio(atual.situacao)}` : ''}
      largura={novo ? 640 : 960}
    >
      <div className={novo ? 'qdoc' : 'qdoc qdoc--aberto'}>
        <form className="qdoc__form" onSubmit={salvar} noValidate>
          <fieldset disabled={!editavel}>
            <CampoTexto
              rotulo="O que vai"
              placeholder="Ex.: Pasta física da obra"
              value={form.conteudo}
              onChange={mudar('conteudo')}
              erro={erros.conteudo}
              maxLength={CORREIO_TEXTO_MAXIMO}
              autoFocus={novo}
            />
            {editavel && (
              <div className="qcorreio__atalhos" aria-label="Atalhos do que vai">
                {CONTEUDOS_CORREIO.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip ${form.conteudo === c ? 'is-atual' : ''}`.trim()}
                    aria-pressed={form.conteudo === c}
                    onClick={() => mudar('conteudo')(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            <CampoSelecao
              rotulo="Obra (opcional — traz o endereço do cliente)"
              value={form.obraId}
              onChange={escolherObra}
              opcoes={opcoesObra}
              vazio="Nenhuma"
              erro={erros.obraId}
              disabled={!editavel}
            />

            <div className="qdoc__dupla">
              <CampoTexto
                rotulo="Destinatário (pessoa ou empresa)"
                placeholder="Ex.: Laboratório Exemplo Ltda."
                value={form.destinatario}
                onChange={mudar('destinatario')}
                erro={erros.destinatario}
                maxLength={CORREIO_NOME_MAXIMO}
              />
              <CampoTexto
                rotulo="Aos cuidados de (opcional)"
                placeholder="Quem recebe"
                value={form.contato}
                onChange={mudar('contato')}
                maxLength={CORREIO_NOME_MAXIMO}
              />
            </div>

            <div className="qcorreio__endereco">
              <CampoTexto
                rotulo={buscandoCep ? 'CEP (buscando...)' : 'CEP'}
                placeholder="00000-000"
                inputMode="numeric"
                value={form.cep}
                onChange={mudarCep}
                erro={erros.cep}
                maxLength={9}
              />
              <CampoTexto
                rotulo="Rua / avenida"
                value={form.logradouro}
                onChange={mudar('logradouro')}
                erro={erros.logradouro}
                maxLength={200}
              />
              <CampoTexto rotulo="Número" value={form.numero} onChange={mudar('numero')} maxLength={20} />
            </div>

            <div className="qdoc__dupla">
              <CampoTexto
                rotulo="Complemento (opcional)"
                placeholder="Sala, bloco, andar"
                value={form.complemento}
                onChange={mudar('complemento')}
                maxLength={100}
              />
              <CampoTexto rotulo="Bairro" value={form.bairro} onChange={mudar('bairro')} maxLength={100} />
            </div>

            <div className="qcorreio__cidade">
              <CampoTexto rotulo="Cidade" value={form.cidade} onChange={mudar('cidade')} erro={erros.cidade} maxLength={100} />
              <CampoSelecao
                rotulo="UF"
                value={form.uf}
                onChange={mudar('uf')}
                opcoes={[{ valor: '', rotulo: '—' }, ...UFS.map((uf) => ({ valor: uf, rotulo: uf }))]}
                vazio="—"
                erro={erros.uf}
                disabled={!editavel}
              />
              <CampoTexto
                rotulo="Telefone (opcional)"
                inputMode="tel"
                value={form.telefone}
                onChange={mudar('telefone')}
                maxLength={40}
              />
            </div>

            <div className="campo">
              <span className="campo__rotulo" id="qcorreio-servico">
                Serviço
              </span>
              <div className="qdoc__prioridades" role="radiogroup" aria-labelledby="qcorreio-servico">
                {SERVICOS_CORREIO.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={form.servico === s.id}
                    className="qdoc__prioridade"
                    onClick={() => mudar('servico')(s.id)}
                    disabled={!editavel}
                  >
                    {s.rotulo}
                  </button>
                ))}
              </div>
            </div>

            <CampoData rotulo="Precisa sair até (opcional)" valor={form.prazo} aoMudar={mudar('prazo')} erro={erros.prazo} />

            <CampoArea
              rotulo="Observação (opcional)"
              placeholder="Ex.: Enviar junto a nota fiscal; o cliente pediu aviso por e-mail"
              value={form.observacao}
              onChange={mudar('observacao')}
              erro={erros.observacao}
              maxLength={CORREIO_OBS_MAXIMA}
              linhas={2}
            />
          </fieldset>

          {erros.geral && (
            <p className="qualidade__erro" role="alert">
              {erros.geral}
            </p>
          )}

          {editavel && (
            <footer className="formobra__acoes">
              {!novo && (atende || (meu && atual?.situacao === 'solicitada')) && (
                <button type="button" className="formrot__apagar" onClick={() => setExcluindo(true)} disabled={salvando}>
                  Excluir
                </button>
              )}
              <Button type="submit" loading={salvando}>
                {novo ? 'Solicitar envio' : 'Salvar'}
              </Button>
            </footer>
          )}
          {!novo && !editavel && (
            <p className="qdoc__fechado">O pedido já começou a andar: só quem atende os envios muda os dados.</p>
          )}
        </form>

        {!novo && atual && (
          <aside className="qdoc__lado">
            <div className="qdoc__andamento">
              <span className="qlista__status" data-status={atual.situacao === 'cancelada' ? 'cancelado' : atual.situacao === 'entregue' ? 'concluido' : 'aberto'}>
                {rotuloSituacaoCorreio(atual.situacao)}
              </span>
              <p>
                Pedido por <strong>{atual.solicitanteNome || '—'}</strong> em {dataHora(atual.criadoEm)}
              </p>
              <p className="qdoc__criado">{enderecoEmLinha(atual)}</p>
              <dl className="qcorreio__dados">
                <div>
                  <dt>Serviço</dt>
                  <dd>{rotuloServicoCorreio(atual.servico)}</dd>
                </div>
                {atual.prazo && (
                  <div>
                    <dt>Sair até</dt>
                    <dd>{dataBR(atual.prazo)}</dd>
                  </div>
                )}
                {atual.postadoEm && (
                  <div>
                    <dt>Postado em</dt>
                    <dd>{dataBR(atual.postadoEm)}</dd>
                  </div>
                )}
                {atual.entregueEm && (
                  <div>
                    <dt>Entregue em</dt>
                    <dd>{dataBR(atual.entregueEm)}</dd>
                  </div>
                )}
                {atual.custo !== null && atual.custo !== undefined && (
                  <div>
                    <dt>Custo</dt>
                    <dd>{reais(atual.custo)}</dd>
                  </div>
                )}
                {atual.atendidoPorNome && (
                  <div>
                    <dt>Atendido por</dt>
                    <dd>{atual.atendidoPorNome}</dd>
                  </div>
                )}
              </dl>
              {atual.rastreio && (
                <p className="qcorreio__rastreio">
                  <span>Rastreio</span>
                  <code>{atual.rastreio}</code>
                  <button type="button" className="comercial__botao" onClick={copiarRastreio}>
                    {copiado ? 'Copiado' : 'Copiar'}
                  </button>
                  <a href={RASTREIO_CORREIOS} target="_blank" rel="noreferrer noopener" className="comercial__botao">
                    Rastrear nos Correios
                  </a>
                </p>
              )}
              {atual.resposta && <p className="qdoc__texto">{atual.resposta}</p>}
            </div>

            {atende && atual.situacao !== CORREIO_CANCELADA && (
              <form className="qcorreio__atender" onSubmit={atender} noValidate>
                <h3>Atender</h3>
                <CampoSelecao
                  rotulo="Situação"
                  value={atendendo.situacao}
                  onChange={mudarAtender('situacao')}
                  opcoes={[
                    ...SITUACOES_CORREIO.map((s) => ({ valor: s.id, rotulo: `${s.rotulo} — ${s.descricao}` })),
                    { valor: CORREIO_CANCELADA, rotulo: 'Cancelada — não vai mais' },
                  ]}
                />
                {['postada', 'entregue'].includes(atendendo.situacao) && (
                  <div className="qdoc__dupla">
                    <CampoTexto
                      rotulo={atual.servico === 'motoboy' ? 'Código / protocolo (opcional)' : 'Código de rastreio'}
                      placeholder="Ex.: AB123456789BR"
                      value={atendendo.rastreio}
                      onChange={mudarAtender('rastreio')}
                      erro={erros.rastreio}
                      maxLength={CORREIO_RASTREIO_MAXIMO}
                    />
                    <CampoTexto
                      rotulo="Custo (opcional)"
                      placeholder="Ex.: 38,90"
                      inputMode="decimal"
                      value={atendendo.custo}
                      onChange={mudarAtender('custo')}
                      erro={erros.custo}
                    />
                  </div>
                )}
                {['postada', 'entregue'].includes(atendendo.situacao) && (
                  <div className="qdoc__dupla">
                    <CampoData rotulo="Postado em" valor={atendendo.postadoEm} aoMudar={mudarAtender('postadoEm')} erro={erros.postadoEm} />
                    {atendendo.situacao === 'entregue' && (
                      <CampoData rotulo="Entregue em" valor={atendendo.entregueEm} aoMudar={mudarAtender('entregueEm')} erro={erros.entregueEm} />
                    )}
                  </div>
                )}
                <CampoArea
                  rotulo={atendendo.situacao === CORREIO_CANCELADA ? 'Motivo do cancelamento' : 'Recado para quem pediu (opcional)'}
                  value={atendendo.resposta}
                  onChange={mudarAtender('resposta')}
                  erro={erros.resposta}
                  maxLength={CORREIO_OBS_MAXIMA}
                  linhas={2}
                />
                <div className="qdoc__motivo-acoes">
                  <button type="submit" className="comercial__verde" disabled={salvando}>
                    {atendendo.situacao === atual.situacao ? 'Salvar o atendimento' : `Mover para ${rotuloSituacaoCorreio(atendendo.situacao)}`}
                  </button>
                </div>
              </form>
            )}

            {!atende && meu && atual.situacao === 'solicitada' && (
              <div className="qcorreio__atender">
                {!cancelando ? (
                  <button type="button" className="comercial__botao" onClick={() => setCancelando(true)}>
                    Cancelar o pedido
                  </button>
                ) : (
                  <form onSubmit={cancelarMeu} className="qdoc__motivo">
                    <CampoArea
                      rotulo="Por que o envio não é mais preciso?"
                      value={motivo}
                      onChange={(e) => {
                        setMotivo(e.target.value)
                        setErros({})
                      }}
                      erro={erros.motivo}
                      maxLength={CORREIO_OBS_MAXIMA}
                      linhas={2}
                      autoFocus
                    />
                    <div className="qdoc__motivo-acoes">
                      <button type="button" className="comercial__botao" onClick={() => setCancelando(false)}>
                        Voltar
                      </button>
                      <button type="submit" className="comercial__verde" disabled={salvando}>
                        Cancelar o pedido
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      <Confirma
        aberto={excluindo}
        titulo="Excluir este pedido de envio?"
        mensagem={atual ? `"${atual.conteudo}" para ${atual.destinatario} sai do quadro de vez. Para guardar o registro, use Cancelar.` : ''}
        rotuloConfirmar="Excluir"
        nivel={1}
        aoConfirmar={excluir}
        aoFechar={() => setExcluindo(false)}
      />
    </Modal>
  )
}

/** A coluna seguinte do quadro (a sugestao da caixa de atender). */
function proximaSituacao(atual) {
  const ordem = SITUACOES_CORREIO.map((s) => s.id)
  const i = ordem.indexOf(atual)
  if (i < 0) return ordem[0]
  return ordem[Math.min(i + 1, ordem.length - 1)]
}
