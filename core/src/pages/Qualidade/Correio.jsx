import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Seletor from '@/components/Seletor/Seletor'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import {
  SITUACOES_CORREIO,
  diasDesde,
  rotuloServicoCorreio,
  rotuloSituacaoCorreio,
} from '@/domain/qualidade'
import * as qualidade from '@/services/qualidadeService'
import { dataBR, hojeISO } from '@/utils/formato'
import { IconeArquivo, IconeFunil, IconeInfo, IconeMais, IconePessoa } from '@/pages/Comercial/icones'
import QuadroEtapas, { arrastoDoCartao } from './QuadroEtapas'
import ModalCorreio from './ModalCorreio'
import SeloPrazo from './SeloPrazo'
import '@/pages/Comercial/Comercial.css'
import './Qualidade.css'

const GUARDA = 'qualidade.correio'

function lerGuardado() {
  try {
    return JSON.parse(localStorage.getItem(GUARDA) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

const VISOES = [
  { id: 'funil', rotulo: 'Quadro', Icone: IconeFunil },
  { id: 'arquivo', rotulo: 'Arquivados (canceladas e entregues há mais de 30 dias)', Icone: IconeArquivo },
]

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

const semAcento = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * SOLICITACAO DE CORREIO — a segunda aba da Area da qualidade
 * (atualizacao 58), no mesmo quadro do Comercial.
 *
 * Quem precisa mandar alguma coisa pelo correio (a pasta fisica da obra,
 * certificados, um contrato) pede o envio: o que vai, para quem, o
 * endereco (o CEP preenche o resto; a obra traz o cadastro do cliente),
 * o servico e ate quando precisa sair. O pedido nasce em "Solicitada".
 *
 * Quem atende (`gerenciar_correio`) arrasta o cartao pelas colunas — gerou
 * a etiqueta, postou (pede o codigo de rastreio), entregou — ou faz o mesmo
 * dentro do pedido. Quem pediu ainda edita ou cancela enquanto ninguem
 * pegou. Os cancelados e os entregues ha mais de 30 dias vao para os
 * Arquivados.
 */
export default function Correio() {
  const { user } = useAuth()
  const { pode, pessoaPorId } = useDados()
  const atende = pode('gerenciar_correio')
  const hoje = hojeISO()

  const guardado = useMemo(lerGuardado, [])
  const [visao, setVisao] = useState(guardado.visao === 'arquivo' ? 'arquivo' : 'funil')
  const [de, setDe] = useState(guardado.de === 'meus' ? 'meus' : '')
  const [busca, setBusca] = useState('')
  const [solicitacoes, setSolicitacoes] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  /* o pop-up: { solicitacao, atender? } ou { novo: true } */
  const [aberto, setAberto] = useState(null)

  const arquivo = visao === 'arquivo'

  useEffect(() => {
    try {
      localStorage.setItem(GUARDA, JSON.stringify({ visao, de }))
    } catch {
      /* modo privado */
    }
  }, [visao, de])

  const ler = useCallback(async () => {
    setErro('')
    setSolicitacoes(null)
    try {
      setSolicitacoes(await qualidade.carregarSolicitacoes({ arquivados: arquivo }))
    } catch (falha) {
      setErro(falha.message)
      setSolicitacoes([])
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

  const trocar = (atualizada) =>
    setSolicitacoes((lista) => {
      const noQuadro = atualizada.situacao !== 'cancelada'
      const fica = arquivo ? !noQuadro : noQuadro
      const sem = (lista ?? []).filter((s) => s.id !== atualizada.id)
      if (!fica) return sem
      const existia = (lista ?? []).some((s) => s.id === atualizada.id)
      return existia ? (lista ?? []).map((s) => (s.id === atualizada.id ? atualizada : s)) : [...sem, atualizada]
    })

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim())
    const eu = String(user?.id ?? '')
    return (solicitacoes ?? []).filter((s) => {
      if (de === 'meus' && s.solicitanteId !== eu) return false
      if (!termo) return true
      return semAcento(
        [s.conteudo, s.destinatario, s.contato, s.cidade, s.uf, s.rastreio, s.clienteNome, s.obraProposta, s.solicitanteNome].join(' '),
      ).includes(termo)
    })
  }, [solicitacoes, de, busca, user])

  /* soltar em "Postada" sem o codigo de rastreio abre o pedido para
     preencher; o resto anda direto */
  const mover = async (s, situacao) => {
    if (situacao === 'postada' && !s.rastreio) {
      setAberto({ solicitacao: s, atender: 'postada' })
      return
    }
    trocar({ ...s, situacao, situacaoDesde: new Date().toISOString() })
    try {
      trocar(await qualidade.mudarSituacaoEnvio(s.id, { situacao }))
      setAviso(`Envio para ${s.destinatario}: ${rotuloSituacaoCorreio(situacao).toLowerCase()}.`)
    } catch (falha) {
      trocar(s)
      setAviso(falha.message)
    }
  }

  const pendentes = visiveis.filter((s) => s.situacao === 'solicitada').length

  return (
    <AppShell>
      <section className="comercial qualidade">
        <header className="comercial__topo">
          <h1 className="comercial__titulo">
            Solicitação de correio
            <span
              className="comercial__info"
              title="Peça aqui o envio de documentos pelo correio. Quem atende gera a etiqueta, posta e informa o rastreio."
              aria-label="Peça aqui o envio de documentos pelo correio. Quem atende gera a etiqueta, posta e informa o rastreio."
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

          <button type="button" className="comercial__verde" onClick={() => setAberto({ novo: true })}>
            <IconeMais />
            Solicitar envio
          </button>

          <span className="comercial__espaco" />

          <p className="comercial__conta">
            {solicitacoes === null ? 'Carregando...' : plural(visiveis.length, 'envio', 'envios')}
            {!arquivo && pendentes > 0 && atende && (
              <span className="qualidade__alerta">{plural(pendentes, 'esperando', 'esperando')}</span>
            )}
          </p>

          <label className="qualidade__busca">
            <span className="sr-only">Buscar envio</span>
            <input
              type="search"
              placeholder="Buscar destinatário, cidade, rastreio..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>

          <div className="comercial__funil">
            <span className="comercial__funil-icone" aria-hidden="true">
              <IconePessoa tamanho={16} />
            </span>
            <Seletor
              valor={de}
              aoMudar={setDe}
              opcoes={[
                { valor: '', rotulo: 'Todos os pedidos' },
                { valor: 'meus', rotulo: 'Os meus pedidos' },
              ]}
              aria-label="De quem"
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

        {solicitacoes === null ? (
          <p className="qualidade__vazio">Carregando os envios...</p>
        ) : arquivo ? (
          <ListaArquivados solicitacoes={visiveis} aoAbrir={(s) => setAberto({ solicitacao: s })} />
        ) : (
          <>
            <QuadroEtapas
              etapas={SITUACOES_CORREIO}
              itens={visiveis}
              etapaDe={(s) => s.situacao}
              resumo={(lista) => plural(lista.length, 'envio', 'envios')}
              podeArrastar={() => atende}
              aoMover={mover}
              cartao={(s, arrasto) => (
                <CartaoEnvio
                  key={s.id}
                  envio={s}
                  hoje={hoje}
                  solicitante={pessoaPorId(s.solicitanteId)}
                  arrasto={arrasto}
                  aoAbrir={() => setAberto({ solicitacao: s })}
                />
              )}
            />
            {(solicitacoes ?? []).length === 0 && (
              <div className="qualidade__vazio qualidade__vazio--quadro">
                <strong>Nenhum envio no quadro</strong>
                <span>Use "Solicitar envio" para pedir que algo seja mandado pelo correio.</span>
              </div>
            )}
          </>
        )}
      </section>

      <ModalCorreio
        alvo={aberto}
        atende={atende}
        aoFechar={() => setAberto(null)}
        aoSalvar={(s, recado) => {
          trocar(s)
          if (recado) setAviso(recado)
        }}
        aoExcluir={(s) => {
          setSolicitacoes((lista) => (lista ?? []).filter((x) => x.id !== s.id))
          setAviso('Pedido de envio excluído.')
        }}
      />
    </AppShell>
  )
}

/** O cartao do envio no quadro. */
function CartaoEnvio({ envio: s, hoje, solicitante, arrasto, aoAbrir }) {
  const parado = diasDesde(s.situacaoDesde)
  const cidade = [s.cidade, s.uf].filter(Boolean).join('/')
  return (
    <article
      className="cartaoneg qcartao"
      role="button"
      tabIndex={0}
      aria-label={`${s.conteudo}, para ${s.destinatario}`}
      onClick={aoAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          aoAbrir()
        }
      }}
      {...arrastoDoCartao(s.id, arrasto)}
    >
      <p className="qcartao__selos">
        <span className="qcartao__tipo" data-servico={s.servico}>
          {rotuloServicoCorreio(s.servico)}
        </span>
        {s.rastreio && <span className="qcartao__codigo" title="Código de rastreio">{s.rastreio}</span>}
      </p>
      <h4 className="cartaoneg__titulo">{s.conteudo}</h4>
      <p className="cartaoneg__linha">
        Para <strong>{s.destinatario}</strong>
      </p>
      {cidade && <p className="cartaoneg__linha">{cidade}</p>}

      <div className="cartaoneg__rodape">
        <span className="cartaoneg__dono" title={`Pedido por ${s.solicitanteNome || '—'}`}>
          {solicitante ? (
            <Avatar nome={solicitante.nome} foto={solicitante.foto} tamanho={22} />
          ) : (
            <span className="cartaoneg__boneco">
              <IconePessoa tamanho={13} />
            </span>
          )}
        </span>
        <span className="qcartao__sinais">
          {s.situacao !== 'entregue' && parado >= 1 && (
            <span className="qcartao__parado" data-muito={parado >= 3 ? 'sim' : undefined} title={`Há ${plural(parado, 'dia', 'dias')} nesta coluna`}>
              {parado}d
            </span>
          )}
          {s.situacao === 'entregue' && s.entregueEm && <span className="qcartao__entregue">{dataBR(s.entregueEm).slice(0, 5)}</span>}
          {['solicitada', 'preparando'].includes(s.situacao) && <SeloPrazo prazo={s.prazo} hoje={hoje} />}
        </span>
      </div>
    </article>
  )
}

/** Os arquivados: os cancelados e os entregues ha mais de 30 dias. */
function ListaArquivados({ solicitacoes, aoAbrir }) {
  if (solicitacoes.length === 0) {
    return (
      <div className="qualidade__vazio">
        <strong>Nenhum envio arquivado</strong>
        <span>Os cancelados e os entregues há mais de 30 dias aparecem aqui.</span>
      </div>
    )
  }
  return (
    <div className="qlista">
      <table>
        <thead>
          <tr>
            <th>O que foi</th>
            <th>Para</th>
            <th>Situação</th>
            <th>Rastreio</th>
            <th>Pedido por</th>
          </tr>
        </thead>
        <tbody>
          {solicitacoes.map((s) => (
            <tr key={s.id} onClick={() => aoAbrir(s)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && aoAbrir(s)}>
              <td>
                <strong>{s.conteudo}</strong>
                <span className="qlista__sub">{rotuloServicoCorreio(s.servico)}</span>
              </td>
              <td>
                {s.destinatario}
                <span className="qlista__sub">{[s.cidade, s.uf].filter(Boolean).join('/')}</span>
              </td>
              <td>
                <span className="qlista__status" data-status={s.situacao === 'cancelada' ? 'cancelado' : 'concluido'}>
                  {rotuloSituacaoCorreio(s.situacao)}
                </span>
                <span className="qlista__sub">
                  {s.situacao === 'entregue' && s.entregueEm ? dataBR(s.entregueEm) : s.resposta}
                </span>
              </td>
              <td>{s.rastreio || '—'}</td>
              <td>{s.solicitanteNome || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
