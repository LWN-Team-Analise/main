import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import Avatar from '@/components/Avatar/Avatar'
import { CampoArea, CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { CampoData } from '@/components/CampoData/CampoData'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import {
  DOC_CODIGO_MAXIMO,
  DOC_COMENTARIO_MAXIMO,
  DOC_OBS_MAXIMA,
  DOC_TITULO_MAXIMO,
  FUNIS_DOCUMENTOS,
  PRIORIDADES_DOC,
  ROTULO_STATUS_DOC,
  TIPOS_DOCUMENTO,
  diasDesde,
  funilDoc,
  rotuloRevisao,
} from '@/domain/qualidade'
import * as qualidade from '@/services/qualidadeService'
import { dataHora } from '@/utils/formato'

const VAZIO = {
  funil: '',
  etapa: '',
  titulo: '',
  tipo: '',
  codigo: '',
  revisao: '0',
  obraId: '',
  clienteId: '',
  responsavelId: '',
  prazo: '',
  prioridade: 'normal',
  observacao: '',
}

/* o rotulo de uma etapa em qualquer funil: o historico guarda so a chave,
   e o documento pode ter trocado de funil depois */
function rotuloDaEtapa(id) {
  for (const f of FUNIS_DOCUMENTOS) {
    const e = f.etapas.find((x) => x.id === id)
    if (e) return e.rotulo
  }
  return id
}

/** O que cada evento do historico diz. */
function textoDoEvento(e) {
  switch (e.tipo) {
    case 'criado':
      return `criou o documento${e.para ? ` em ${rotuloDaEtapa(e.para)}` : ''}`
    case 'editado':
      return e.de && e.para
        ? `passou o documento de ${funilDoc(e.de)?.rotulo ?? e.de} para ${funilDoc(e.para)?.rotulo ?? e.para}`
        : 'editou os dados do documento'
    case 'etapa':
      return `moveu de ${rotuloDaEtapa(e.de)} para ${rotuloDaEtapa(e.para)}`
    case 'revisao':
      return `abriu a ${rotuloRevisao(e.para)}`
    case 'concluido':
      return 'concluiu o documento'
    case 'cancelado':
      return 'cancelou o documento'
    case 'reaberto':
      return 'reabriu o documento'
    default:
      return 'comentou'
  }
}

/**
 * O documento: criar (`alvo.inicial`) ou abrir (`alvo.documento`).
 *
 * Aberto, mostra ao lado o andamento (a situacao, a etapa e ha quantos dias
 * esta nela), as acoes — Nova revisao, Concluir, Cancelar (com o motivo),
 * Reabrir e Excluir — e o historico, com a caixa de comentario (quem so ve
 * o documento tambem comenta). Mudar a etapa no formulario move o cartao,
 * como arrastar no funil.
 */
export default function ModalDocumento({ alvo, podeEditar, aoFechar, aoSalvar, aoExcluir }) {
  const { user } = useAuth()
  const { obras, clientes, clientePorId, equipe, concluida, pessoaPorId } = useDados()
  const documento = alvo?.documento ?? null
  const novo = Boolean(alvo) && !documento

  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [eventos, setEventos] = useState(null)
  const [comentario, setComentario] = useState('')
  const [comentando, setComentando] = useState(false)
  /* 'cancelar' | 'revisao' | 'excluir' | null */
  const [pedindo, setPedindo] = useState(null)
  const [motivo, setMotivo] = useState('')
  /* o documento como esta agora (as acoes atualizam sem fechar) */
  const [atual, setAtual] = useState(null)

  useEffect(() => {
    if (!alvo) return
    setErros({})
    setComentario('')
    setPedindo(null)
    setMotivo('')
    if (documento) {
      setAtual(documento)
      setForm({
        funil: documento.funil,
        etapa: documento.etapa,
        titulo: documento.titulo,
        tipo: documento.tipo,
        codigo: documento.codigo ?? '',
        revisao: String(documento.revisao ?? 0),
        obraId: documento.obraId ?? '',
        clienteId: documento.clienteId ?? '',
        responsavelId: documento.responsavelId ?? '',
        prazo: documento.prazo ?? '',
        prioridade: documento.prioridade ?? 'normal',
        observacao: documento.observacao ?? '',
      })
      setEventos(null)
      qualidade
        .carregarEventos(documento.id)
        .then(setEventos)
        .catch(() => setEventos([]))
    } else {
      const f = funilDoc(alvo.inicial?.funil) ?? FUNIS_DOCUMENTOS[0]
      setAtual(null)
      setEventos(null)
      setForm({
        ...VAZIO,
        funil: f.id,
        etapa: f.etapas.some((e) => e.id === alvo.inicial?.etapa) ? alvo.inicial.etapa : f.etapas[0].id,
        tipo: f.tipoPadrao,
        responsavelId: String(user?.id ?? ''),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo])

  const funil = funilDoc(form.funil) ?? FUNIS_DOCUMENTOS[0]
  const fechado = atual && atual.status !== 'aberto'
  const travado = !podeEditar || fechado

  const mudar = (campo) => (evento) => {
    const valor = evento?.target ? evento.target.value : evento
    setForm((antes) => {
      const proximo = { ...antes, [campo]: valor }
      if (campo === 'funil') {
        const f = funilDoc(valor)
        if (f && !f.etapas.some((e) => e.id === antes.etapa)) proximo.etapa = f.etapas[0].id
        /* o tipo acompanha o funil enquanto ainda e o sugerido */
        if (f && antes.tipo === funilDoc(antes.funil)?.tipoPadrao) proximo.tipo = f.tipoPadrao
      }
      /* a obra decide o cliente */
      if (campo === 'obraId') {
        const obra = obras.find((o) => String(o.id) === String(valor))
        proximo.clienteId = obra?.clienteId ? String(obra.clienteId) : valor ? '' : antes.clienteId
      }
      return proximo
    })
    setErros((antes) => ({ ...antes, [campo]: undefined, geral: undefined }))
  }

  const nomeDaObra = (o) => [clientePorId(o.clienteId)?.nome, o.proposta].filter(Boolean).join(' - ') || 'Obra'
  const opcoesObra = useMemo(
    () => [
      { valor: '', rotulo: 'Nenhuma' },
      ...obras
        .filter((o) => !concluida(o) || String(o.id) === String(form.obraId))
        .map((o) => ({ valor: String(o.id), rotulo: nomeDaObra(o) }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obras, form.obraId],
  )
  const opcoesCliente = useMemo(
    () => [
      { valor: '', rotulo: 'Nenhum' },
      ...(clientes ?? [])
        .map((c) => ({ valor: String(c.id), rotulo: c.nome }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    ],
    [clientes],
  )
  const opcoesPessoa = useMemo(
    () => [
      { valor: '', rotulo: 'Sem responsável' },
      ...equipe
        .filter((p) => p.ativo !== false)
        .map((p) => ({ valor: String(p.id), rotulo: p.nome }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    ],
    [equipe],
  )

  const salvar = async (evento) => {
    evento.preventDefault()
    if (!form.titulo.trim()) {
      setErros({ titulo: 'Dê um título ao documento.' })
      return
    }
    setSalvando(true)
    try {
      const campos = {
        funil: form.funil,
        etapa: form.etapa,
        titulo: form.titulo.trim(),
        tipo: form.tipo,
        codigo: form.codigo.trim(),
        revisao: Number(form.revisao) || 0,
        obraId: form.obraId || null,
        clienteId: form.clienteId || null,
        responsavelId: form.responsavelId || null,
        prazo: form.prazo || null,
        prioridade: form.prioridade,
        observacao: form.observacao.trim(),
      }
      let salvo
      if (novo) {
        salvo = await qualidade.criarDocumento(campos)
        aoSalvar(salvo, `"${salvo.titulo}" entrou em ${funil.rotulo.toLowerCase()}.`)
      } else {
        salvo = await qualidade.editarDocumento(atual.id, campos)
        /* a etapa escolhida no formulario: anda como no arrastar */
        if (form.etapa !== salvo.etapa && salvo.funil === form.funil) salvo = await qualidade.moverDocumento(atual.id, form.etapa)
        aoSalvar(salvo, 'Documento salvo.')
      }
      aoFechar()
    } catch (e) {
      setErros(e.campo ? { [e.campo]: e.message } : { geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  /* as acoes do documento aberto: atualizam a tela e o historico */
  const agir = async (acao, recado) => {
    setSalvando(true)
    setErros({})
    try {
      const salvo = await acao()
      setAtual(salvo)
      setForm((antes) => ({ ...antes, revisao: String(salvo.revisao), etapa: salvo.etapa }))
      aoSalvar(salvo, recado)
      setEventos(await qualidade.carregarEventos(salvo.id).catch(() => eventos))
      return salvo
    } catch (e) {
      setErros({ geral: e.message })
      return null
    } finally {
      setSalvando(false)
    }
  }

  const comentar = async (evento) => {
    evento.preventDefault()
    const texto = comentario.trim()
    if (!texto) return
    setComentando(true)
    try {
      const salvo = await qualidade.comentarDocumento(atual.id, texto)
      setComentario('')
      setAtual(salvo)
      aoSalvar(salvo)
      setEventos(await qualidade.carregarEventos(atual.id))
    } catch (e) {
      setErros({ comentario: e.message })
    } finally {
      setComentando(false)
    }
  }

  const excluir = async () => {
    setPedindo(null)
    setSalvando(true)
    try {
      await qualidade.excluirDocumento(atual.id)
      aoExcluir(atual)
      aoFechar()
    } catch (e) {
      setErros({ geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  const titulo = novo ? 'Novo documento' : atual?.titulo ?? 'Documento'
  const parado = atual ? diasDesde(atual.etapaDesde) : 0

  return (
    <Modal
      aberto={Boolean(alvo)}
      aoFechar={aoFechar}
      titulo={titulo}
      subtitulo={novo ? funil.rotulo : `${funil.rotulo} · ${rotuloRevisao(atual?.revisao)}`}
      largura={novo ? 600 : 960}
    >
      <div className={novo ? 'qdoc' : 'qdoc qdoc--aberto'}>
        <form className="qdoc__form" onSubmit={salvar} noValidate>
          <fieldset disabled={travado}>
            <div className="qdoc__dupla">
              <CampoSelecao
                rotulo="Funil"
                value={form.funil}
                onChange={mudar('funil')}
                opcoes={FUNIS_DOCUMENTOS.map((f) => ({ valor: f.id, rotulo: f.rotulo }))}
                disabled={travado}
              />
              <CampoSelecao
                rotulo="Etapa"
                value={form.etapa}
                onChange={mudar('etapa')}
                opcoes={funil.etapas.map((e) => ({ valor: e.id, rotulo: e.rotulo }))}
                disabled={travado}
              />
            </div>

            <CampoTexto
              rotulo="Título"
              placeholder="Ex.: Protocolo de qualificação térmica — Sala limpa 2"
              value={form.titulo}
              onChange={mudar('titulo')}
              erro={erros.titulo}
              maxLength={DOC_TITULO_MAXIMO}
              autoFocus={novo}
            />

            <div className="qdoc__tripla">
              <CampoSelecao
                rotulo="Tipo"
                value={form.tipo}
                onChange={mudar('tipo')}
                opcoes={TIPOS_DOCUMENTO.map((t) => ({ valor: t.id, rotulo: t.rotulo }))}
                erro={erros.tipo}
                disabled={travado}
              />
              <CampoTexto
                rotulo="Código (opcional)"
                placeholder="Ex.: PQ-0123"
                value={form.codigo}
                onChange={mudar('codigo')}
                erro={erros.codigo}
                maxLength={DOC_CODIGO_MAXIMO}
              />
              <CampoTexto
                rotulo="Revisão"
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={form.revisao}
                onChange={mudar('revisao')}
                erro={erros.revisao}
              />
            </div>

            <div className="qdoc__dupla">
              <CampoSelecao
                rotulo="Obra (opcional)"
                value={form.obraId}
                onChange={mudar('obraId')}
                opcoes={opcoesObra}
                vazio="Nenhuma"
                erro={erros.obraId}
                disabled={travado}
              />
              <CampoSelecao
                rotulo="Cliente (opcional)"
                value={form.clienteId}
                onChange={mudar('clienteId')}
                opcoes={opcoesCliente}
                vazio="Nenhum"
                erro={erros.clienteId}
                disabled={travado || Boolean(form.obraId)}
              />
            </div>

            <div className="qdoc__dupla">
              <CampoSelecao
                rotulo="Responsável"
                value={form.responsavelId}
                onChange={mudar('responsavelId')}
                opcoes={opcoesPessoa}
                vazio="Sem responsável"
                erro={erros.responsavelId}
                disabled={travado}
              />
              <CampoData rotulo="Prazo (opcional)" valor={form.prazo} aoMudar={mudar('prazo')} erro={erros.prazo} />
            </div>

            <div className="campo">
              <span className="campo__rotulo" id="qdoc-prioridade">
                Prioridade
              </span>
              <div className="qdoc__prioridades" role="radiogroup" aria-labelledby="qdoc-prioridade">
                {PRIORIDADES_DOC.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={form.prioridade === p.id}
                    className="qdoc__prioridade"
                    style={{ '--cor': p.cor }}
                    onClick={() => mudar('prioridade')(p.id)}
                    disabled={travado}
                  >
                    {p.rotulo}
                  </button>
                ))}
              </div>
            </div>

            <CampoArea
              rotulo="Observação (opcional)"
              placeholder="O que falta, com quem está, o que o cliente pediu..."
              value={form.observacao}
              onChange={mudar('observacao')}
              erro={erros.observacao}
              maxLength={DOC_OBS_MAXIMA}
              linhas={3}
            />
          </fieldset>

          {erros.geral && (
            <p className="qualidade__erro" role="alert">
              {erros.geral}
            </p>
          )}

          {!travado && (
            <footer className="formobra__acoes">
              {!novo && (
                <button type="button" className="formrot__apagar" onClick={() => setPedindo('excluir')} disabled={salvando}>
                  Excluir
                </button>
              )}
              <Button type="submit" loading={salvando}>
                {novo ? 'Criar documento' : 'Salvar'}
              </Button>
            </footer>
          )}
          {fechado && podeEditar && (
            <p className="qdoc__fechado">
              Documento {ROTULO_STATUS_DOC[atual.status].toLowerCase()}. Para mudar os dados, reabra-o.
            </p>
          )}
        </form>

        {!novo && atual && (
          <aside className="qdoc__lado">
            <div className="qdoc__andamento">
              <span className="qlista__status" data-status={atual.status}>
                {ROTULO_STATUS_DOC[atual.status]}
              </span>
              <p>
                {atual.status === 'aberto' ? (
                  <>
                    Em <strong>{rotuloDaEtapa(atual.etapa)}</strong>
                    {parado > 0 ? ` há ${parado} ${parado === 1 ? 'dia' : 'dias'}` : ' desde hoje'}
                  </>
                ) : (
                  <>Arquivado em {dataHora(atual.concluidoEm ?? atual.atualizadoEm)}</>
                )}
              </p>
              <p className="qdoc__criado">
                Criado por {atual.criadoPorNome || '—'} em {dataHora(atual.criadoEm)}
              </p>
            </div>

            {podeEditar && (
              <div className="qdoc__acoes">
                {atual.status === 'aberto' ? (
                  <>
                    <button
                      type="button"
                      className="comercial__verde"
                      disabled={salvando}
                      onClick={() => agir(() => qualidade.mudarStatusDocumento(atual.id, 'concluido'), `"${atual.titulo}" concluído.`)}
                    >
                      Concluir
                    </button>
                    <button type="button" className="comercial__botao" disabled={salvando} onClick={() => setPedindo('revisao')}>
                      Nova revisão
                    </button>
                    <button type="button" className="comercial__botao" disabled={salvando} onClick={() => setPedindo('cancelar')}>
                      Cancelar documento
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="comercial__botao"
                    disabled={salvando}
                    onClick={() => agir(() => qualidade.mudarStatusDocumento(atual.id, 'aberto'), `"${atual.titulo}" voltou para o funil.`)}
                  >
                    Reabrir
                  </button>
                )}
              </div>
            )}

            {(pedindo === 'cancelar' || pedindo === 'revisao') && (
              <form
                className="qdoc__motivo"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const texto = motivo.trim()
                  if (pedindo === 'cancelar' && !texto) {
                    setErros({ motivo: 'Diga por que o documento foi cancelado.' })
                    return
                  }
                  const salvo = await agir(
                    () =>
                      pedindo === 'cancelar'
                        ? qualidade.mudarStatusDocumento(atual.id, 'cancelado', texto)
                        : qualidade.novaRevisao(atual.id, texto),
                    pedindo === 'cancelar' ? `"${atual.titulo}" cancelado.` : 'Nova revisão aberta.',
                  )
                  if (salvo) {
                    setPedindo(null)
                    setMotivo('')
                  }
                }}
              >
                <CampoArea
                  rotulo={pedindo === 'cancelar' ? 'Motivo do cancelamento' : `O que muda na ${rotuloRevisao((atual.revisao ?? 0) + 1)} (opcional)`}
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.target.value)
                    setErros({})
                  }}
                  erro={erros.motivo}
                  maxLength={DOC_COMENTARIO_MAXIMO}
                  linhas={2}
                  autoFocus
                />
                <div className="qdoc__motivo-acoes">
                  <button type="button" className="comercial__botao" onClick={() => setPedindo(null)}>
                    Voltar
                  </button>
                  <button type="submit" className="comercial__verde" disabled={salvando}>
                    {pedindo === 'cancelar' ? 'Cancelar documento' : 'Abrir a revisão'}
                  </button>
                </div>
              </form>
            )}

            <section className="qdoc__historico" aria-label="Histórico e comentários">
              <h3>Histórico</h3>
              <form className="qdoc__comentar" onSubmit={comentar}>
                <CampoArea
                  rotulo="Comentar"
                  placeholder="Escreva um comentário para a equipe"
                  value={comentario}
                  onChange={(e) => {
                    setComentario(e.target.value)
                    setErros((antes) => ({ ...antes, comentario: undefined }))
                  }}
                  erro={erros.comentario}
                  maxLength={DOC_COMENTARIO_MAXIMO}
                  linhas={2}
                />
                <button type="submit" className="comercial__botao" disabled={comentando || !comentario.trim()}>
                  {comentando ? 'Enviando...' : 'Comentar'}
                </button>
              </form>
              {eventos === null ? (
                <p className="qdoc__vazio">Carregando o histórico...</p>
              ) : eventos.length === 0 ? (
                <p className="qdoc__vazio">Nada por aqui ainda.</p>
              ) : (
                <ol className="qdoc__eventos">
                  {eventos.map((e) => (
                    <li key={e.id} data-tipo={e.tipo}>
                      <Avatar nome={e.usuarioNome || '?'} foto={pessoaPorId(e.usuarioId)?.foto} tamanho={24} />
                      <div>
                        <p>
                          <strong>{e.usuarioNome || 'Alguém'}</strong> {textoDoEvento(e)}
                        </p>
                        {e.texto && <p className="qdoc__texto">{e.texto}</p>}
                        <time dateTime={e.criadoEm}>{dataHora(e.criadoEm)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>
        )}
      </div>

      <Confirma
        aberto={pedindo === 'excluir'}
        titulo="Excluir este documento?"
        mensagem={atual ? `"${atual.titulo}" sai do acompanhamento, com o histórico e os comentários. Para guardar, use Concluir ou Cancelar.` : ''}
        rotuloConfirmar="Excluir"
        nivel={1}
        aoConfirmar={excluir}
        aoFechar={() => setPedindo(null)}
      />
    </Modal>
  )
}
