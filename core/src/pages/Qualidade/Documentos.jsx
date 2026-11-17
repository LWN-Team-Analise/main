import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Seletor from '@/components/Seletor/Seletor'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import {
  FUNIL_DOC_PADRAO,
  FUNIS_DOCUMENTOS,
  ROTULO_STATUS_DOC,
  diasDesde,
  funilDoc,
  prioridadeDoc,
  rotuloEtapaDoc,
  rotuloRevisao,
  situacaoDoPrazo,
  tipoDoc,
} from '@/domain/qualidade'
import * as qualidade from '@/services/qualidadeService'
import { hojeISO } from '@/utils/formato'
import { IconeArquivo, IconeFunil, IconeInfo, IconeLista, IconeMais, IconePessoa } from '@/pages/Comercial/icones'
import QuadroEtapas, { arrastoDoCartao } from './QuadroEtapas'
import ModalDocumento from './ModalDocumento'
import SeloPrazo from './SeloPrazo'
import '@/pages/Comercial/Comercial.css'
import './Qualidade.css'

/* ---------------- o que a tela lembra (so neste navegador) ---------------- */

const GUARDA = 'qualidade.documentos'

function lerGuardado() {
  try {
    return JSON.parse(localStorage.getItem(GUARDA) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

function guardar(valor) {
  try {
    localStorage.setItem(GUARDA, JSON.stringify(valor))
  } catch {
    /* modo privado: so nao lembra */
  }
}

const VISOES = [
  { id: 'funil', rotulo: 'Funil', Icone: IconeFunil },
  { id: 'lista', rotulo: 'Lista', Icone: IconeLista },
  { id: 'arquivo', rotulo: 'Arquivados (concluídos e cancelados)', Icone: IconeArquivo },
]

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

const semAcento = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * ACOMPANHAMENTO DOS DOCUMENTOS — a primeira aba da Area da qualidade
 * (atualizacao 58), no desenho do Comercial.
 *
 * Tres funis (Protocolos, Relatorios, Documentos gerais), cada um com as
 * etapas dele. Cada documento e um cartao: o tipo e o codigo, a revisao,
 * o titulo, o cliente e a obra, o responsavel, o prazo (vermelho quando
 * passou) e ha quantos dias esta parado na etapa. Arrastar o cartao muda
 * a etapa; clicar abre o documento, com o historico e os comentarios.
 *
 * Visoes: o Funil, a Lista (todos os do funil numa tabela) e os
 * Arquivados (concluidos e cancelados). Quem tem `editar_documentos`
 * cria, edita, move, conclui e exclui; quem so ve, comenta.
 */
export default function Documentos() {
  const { user } = useAuth()
  const { pode, pessoaPorId, equipe } = useDados()
  const podeEditar = pode('editar_documentos')
  const hoje = hojeISO()

  const guardado = useMemo(lerGuardado, [])
  const [funilId, setFunilId] = useState(funilDoc(guardado.funil) ? guardado.funil : FUNIL_DOC_PADRAO)
  const [visao, setVisao] = useState(VISOES.some((v) => v.id === guardado.visao) ? guardado.visao : 'funil')
  const [responsavel, setResponsavel] = useState(guardado.responsavel ?? '')
  const [busca, setBusca] = useState('')

  const [documentos, setDocumentos] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  /* o pop-up: { documento } ou { inicial } (novo) */
  const [aberto, setAberto] = useState(null)

  const arquivo = visao === 'arquivo'
  const funil = funilDoc(funilId)

  useEffect(() => {
    guardar({ funil: funilId, visao, responsavel })
  }, [funilId, visao, responsavel])

  const ler = useCallback(async () => {
    setErro('')
    setDocumentos(null)
    try {
      setDocumentos(await qualidade.carregarDocumentos({ arquivados: arquivo }))
    } catch (falha) {
      setErro(falha.message)
      setDocumentos([])
    }
  }, [arquivo])

  useEffect(() => {
    ler()
  }, [ler])

  useEffect(() => {
    if (!aviso) return undefined
    const t = setTimeout(() => setAviso(''), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  /* troca o documento que mudou, sem ler a lista de novo; o que saiu do
     andamento (concluido, cancelado) ou voltou a ele muda de lista */
  const trocar = (atualizado) =>
    setDocumentos((lista) => {
      const fica = arquivo ? atualizado.status !== 'aberto' : atualizado.status === 'aberto'
      const sem = (lista ?? []).filter((d) => d.id !== atualizado.id)
      if (!fica) return sem
      const existia = (lista ?? []).some((d) => d.id === atualizado.id)
      return existia ? (lista ?? []).map((d) => (d.id === atualizado.id ? atualizado : d)) : [...sem, atualizado]
    })

  const tirar = (id) => setDocumentos((lista) => (lista ?? []).filter((d) => d.id !== id))

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim())
    const eu = String(user?.id ?? '')
    return (documentos ?? []).filter((d) => {
      if (!arquivo && d.funil !== funilId) return false
      if (responsavel === 'meus' && d.responsavelId !== eu) return false
      if (responsavel && responsavel !== 'meus' && d.responsavelId !== responsavel) return false
      if (!termo) return true
      return semAcento([d.titulo, d.codigo, d.clienteNome, d.obraProposta, d.responsavelNome].join(' ')).includes(termo)
    })
  }, [documentos, funilId, responsavel, busca, arquivo, user])

  const mover = async (doc, etapa) => {
    /* a tela anda na hora; se a API recusar, volta */
    trocar({ ...doc, etapa, etapaDesde: new Date().toISOString() })
    try {
      trocar(await qualidade.moverDocumento(doc.id, etapa))
    } catch (falha) {
      trocar(doc)
      setAviso(falha.message)
    }
  }

  const pessoas = equipe
    .filter((p) => p.ativo !== false)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))

  const atrasados = visiveis.filter((d) => d.status === 'aberto' && situacaoDoPrazo(d.prazo, hoje) === 'atrasado').length

  return (
    <AppShell>
      <section className="comercial qualidade">
        <header className="comercial__topo">
          <h1 className="comercial__titulo">
            Acompanhamento dos documentos
            <span
              className="comercial__info"
              title={arquivo ? 'Os documentos concluídos e cancelados.' : funil.descricao}
              aria-label={arquivo ? 'Os documentos concluídos e cancelados.' : funil.descricao}
            >
              <IconeInfo tamanho={17} />
            </span>
          </h1>
        </header>

        <div className="comercial__barra">
          <div className="comercial__visoes" role="tablist" aria-label="Visão">
            {VISOES.map(({ id, rotulo, Icone }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={visao === id}
                className={visao === id ? 'is-atual' : ''}
                title={rotulo}
                aria-label={rotulo}
                onClick={() => setVisao(id)}
              >
                <Icone />
              </button>
            ))}
          </div>

          {podeEditar && !arquivo && (
            <button type="button" className="comercial__verde" onClick={() => setAberto({ inicial: { funil: funilId } })}>
              <IconeMais />
              Documento
            </button>
          )}

          <span className="comercial__espaco" />

          <p className="comercial__conta">
            {documentos === null ? 'Carregando...' : plural(visiveis.length, 'documento', 'documentos')}
            {atrasados > 0 && <span className="qualidade__alerta">{plural(atrasados, 'atrasado', 'atrasados')}</span>}
          </p>

          <label className="qualidade__busca">
            <span className="sr-only">Buscar documento</span>
            <input
              type="search"
              placeholder="Buscar título, código, cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>

          {!arquivo && (
            <div className="comercial__funil">
              <span className="comercial__funil-icone" aria-hidden="true">
                <IconeFunil />
              </span>
              <Seletor
                valor={funilId}
                aoMudar={setFunilId}
                opcoes={FUNIS_DOCUMENTOS.map((f) => ({ valor: f.id, rotulo: f.rotulo }))}
                aria-label="Funil"
              />
            </div>
          )}

          <div className="comercial__funil">
            <span className="comercial__funil-icone" aria-hidden="true">
              <IconePessoa tamanho={16} />
            </span>
            <Seletor
              valor={responsavel}
              aoMudar={setResponsavel}
              opcoes={[
                { valor: '', rotulo: 'Todos' },
                { valor: 'meus', rotulo: 'Meus documentos' },
                ...pessoas.map((p) => ({ valor: String(p.id), rotulo: p.nome })),
              ]}
              aria-label="Responsável"
            />
          </div>
        </div>

        {aviso && (
          <p className="recado" role="status">
            {aviso}
            <button type="button" onClick={() => setAviso('')} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}
        {erro && (
          <p className="qualidade__erro" role="alert">
            {erro}
          </p>
        )}

        {documentos === null ? (
          <p className="qualidade__vazio">Carregando os documentos...</p>
        ) : visao === 'funil' ? (
          <>
            <QuadroEtapas
              etapas={funil.etapas}
              itens={visiveis}
              etapaDe={(d) => d.etapa}
              resumo={(lista) => {
                const atrasadosNaEtapa = lista.filter((d) => situacaoDoPrazo(d.prazo, hoje) === 'atrasado').length
                return `${plural(lista.length, 'documento', 'documentos')}${atrasadosNaEtapa ? ` · ${atrasadosNaEtapa} atrasado${atrasadosNaEtapa > 1 ? 's' : ''}` : ''}`
              }}
              podeArrastar={() => podeEditar}
              aoMover={mover}
              aoNovo={podeEditar ? (etapa) => setAberto({ inicial: { funil: funilId, etapa } }) : undefined}
              rotuloNovo="Novo documento em"
              cartao={(d, arrasto) => (
                <CartaoDocumento
                  key={d.id}
                  documento={d}
                  hoje={hoje}
                  dono={pessoaPorId(d.responsavelId)}
                  arrasto={arrasto}
                  aoAbrir={() => setAberto({ documento: d })}
                />
              )}
            />
            {(documentos ?? []).filter((d) => d.funil === funilId).length === 0 && (
              <div className="qualidade__vazio qualidade__vazio--quadro">
                <strong>Nenhum documento em {funil.rotulo.toLowerCase()} ainda</strong>
                <span>
                  {podeEditar
                    ? 'Use "+ Documento" (ou o "+" no topo de uma coluna) para começar o acompanhamento.'
                    : 'Quando a Qualidade cadastrar um documento, ele aparece aqui.'}
                </span>
              </div>
            )}
          </>
        ) : (
          <ListaDocumentos
            documentos={visiveis}
            hoje={hoje}
            arquivo={arquivo}
            pessoaPorId={pessoaPorId}
            aoAbrir={(d) => setAberto({ documento: d })}
          />
        )}
      </section>

      <ModalDocumento
        alvo={aberto}
        podeEditar={podeEditar}
        aoFechar={() => setAberto(null)}
        aoSalvar={(doc, recado) => {
          trocar(doc)
          if (recado) setAviso(recado)
          /* o documento salvo em outro funil leva a tela junto */
          if (!arquivo && doc.status === 'aberto' && doc.funil !== funilId) setFunilId(doc.funil)
        }}
        aoExcluir={(doc) => {
          tirar(doc.id)
          setAviso(`"${doc.titulo}" foi excluído.`)
        }}
      />
    </AppShell>
  )
}

/** O cartao do documento no funil. */
function CartaoDocumento({ documento: d, hoje, dono, arrasto, aoAbrir }) {
  const tipo = tipoDoc(d.tipo)
  const prioridade = prioridadeDoc(d.prioridade)
  const parado = diasDesde(d.etapaDesde)
  const vinculo = [d.clienteNome, d.obraProposta].filter(Boolean).join(' · ')
  return (
    <article
      className="cartaoneg qcartao"
      role="button"
      tabIndex={0}
      aria-label={`${d.titulo}${vinculo ? `, ${vinculo}` : ''}`}
      onClick={aoAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          aoAbrir()
        }
      }}
      {...arrastoDoCartao(d.id, arrasto)}
    >
      <span
        className="cartaoneg__etiqueta"
        style={{ '--etiqueta': prioridade.cor }}
        title={`Prioridade ${prioridade.rotulo.toLowerCase()}`}
        aria-hidden="true"
      />
      <p className="qcartao__selos">
        <span className="qcartao__tipo" title={tipo.rotulo}>
          {tipo.curto}
        </span>
        {d.codigo && <span className="qcartao__codigo">{d.codigo}</span>}
        <span className="qcartao__rev">{rotuloRevisao(d.revisao)}</span>
      </p>
      <h4 className="cartaoneg__titulo">{d.titulo}</h4>
      {vinculo && <p className="cartaoneg__linha">{vinculo}</p>}

      <div className="cartaoneg__rodape">
        <span className="cartaoneg__dono" title={d.responsavelNome || 'Sem responsável'}>
          {dono ? (
            <Avatar nome={dono.nome} foto={dono.foto} tamanho={22} />
          ) : (
            <span className="cartaoneg__boneco">
              <IconePessoa tamanho={13} />
            </span>
          )}
        </span>
        <span className="qcartao__sinais">
          {d.comentarios > 0 && (
            <span className="qcartao__comentarios" title={plural(d.comentarios, 'comentário', 'comentários')}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 5h14v10H9l-4 4z" />
              </svg>
              {d.comentarios}
            </span>
          )}
          {parado >= 1 && (
            <span className="qcartao__parado" data-muito={parado >= 7 ? 'sim' : undefined} title={`Há ${plural(parado, 'dia', 'dias')} nesta etapa`}>
              {parado}d
            </span>
          )}
          <SeloPrazo prazo={d.prazo} hoje={hoje} />
        </span>
      </div>
    </article>
  )
}

/** A visao em lista: os documentos numa tabela (os do funil, ou os arquivados). */
function ListaDocumentos({ documentos, hoje, arquivo, pessoaPorId, aoAbrir }) {
  if (documentos.length === 0) {
    return (
      <div className="qualidade__vazio">
        <strong>{arquivo ? 'Nenhum documento arquivado' : 'Nenhum documento aqui'}</strong>
        <span>{arquivo ? 'Os documentos concluídos e cancelados aparecem nesta lista.' : 'Mude o filtro ou o funil, ou cadastre um documento.'}</span>
      </div>
    )
  }
  return (
    <div className="qlista">
      <table>
        <thead>
          <tr>
            <th>Documento</th>
            <th>Cliente / obra</th>
            <th>{arquivo ? 'Situação' : 'Etapa'}</th>
            <th>Responsável</th>
            <th>Prazo</th>
          </tr>
        </thead>
        <tbody>
          {documentos.map((d) => {
            const dono = pessoaPorId(d.responsavelId)
            return (
              <tr key={d.id} onClick={() => aoAbrir(d)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && aoAbrir(d)}>
                <td>
                  <span className="qlista__titulo">
                    <span className="qcartao__tipo">{tipoDoc(d.tipo).curto}</span>
                    <strong>{d.titulo}</strong>
                  </span>
                  <span className="qlista__sub">
                    {[d.codigo, rotuloRevisao(d.revisao)].filter(Boolean).join(' · ')}
                  </span>
                </td>
                <td>{[d.clienteNome, d.obraProposta].filter(Boolean).join(' · ') || '—'}</td>
                <td>
                  {arquivo ? (
                    <span className="qlista__status" data-status={d.status}>
                      {ROTULO_STATUS_DOC[d.status]}
                    </span>
                  ) : (
                    rotuloEtapaDoc(d.funil, d.etapa)
                  )}
                  {arquivo && <span className="qlista__sub">{funilDoc(d.funil)?.rotulo}</span>}
                </td>
                <td>
                  <span className="qlista__pessoa">
                    {dono && <Avatar nome={dono.nome} foto={dono.foto} tamanho={20} />}
                    {d.responsavelNome || '—'}
                  </span>
                </td>
                <td>{d.prazo ? <SeloPrazo prazo={d.prazo} hoje={hoje} fechado={d.status !== 'aberto'} /> : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
