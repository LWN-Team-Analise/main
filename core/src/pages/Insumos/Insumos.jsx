import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoArea, CampoTexto } from '@/components/Campo/Campo'
import { dataHora } from '@/utils/formato'
import { cancelarPedido, carregarPedidos, pedirInsumo, responderPedido } from '@/services/insumosService'
import './Insumos.css'

const SITUACAO = {
  pendente: 'Pendente',
  atendido: 'Atendido',
  recusado: 'Recusado',
}

/* os filtros da lista de todos: os pendentes primeiro, que sao o trabalho */
const FILTROS = [
  { id: 'pendente', rotulo: 'Pendentes' },
  { id: 'atendido', rotulo: 'Atendidos' },
  { id: 'recusado', rotulo: 'Recusados' },
  { id: 'todos', rotulo: 'Todos' },
]

const Mais = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/**
 * INSUMOS — os pedidos de material (atualizacao 57).
 *
 * Duas telas no menu por area:
 *
 *   "Pedir insumos" (/app/insumos, no Seu espaco): o Novo pedido (o que
 *   precisa, quantos e uma observacao) e a lista dos proprios pedidos,
 *   com a situacao e a resposta de quem atendeu. O pendente ainda pode
 *   ser cancelado.
 *
 *   "Insumos" (/app/insumos/pedidos, `equipe`, na Area admin): os pedidos
 *   de todo mundo, para quem tem `gerenciar_insumos` marcar como atendido,
 *   recusar com o motivo ou reabrir.
 */
export default function Insumos({ equipe = false }) {
  const [pedidos, setPedidos] = useState(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('pendente')
  const [novo, setNovo] = useState(false)
  /* o pedido sendo respondido: { pedido, situacao } */
  const [respondendo, setRespondendo] = useState(null)
  const [cancelando, setCancelando] = useState(null)
  const [aviso, setAviso] = useState('')

  const ler = useCallback(async () => {
    setErro('')
    try {
      setPedidos(await carregarPedidos({ todos: equipe }))
    } catch (falha) {
      setErro(falha.message)
      setPedidos([])
    }
  }, [equipe])

  useEffect(() => {
    ler()
  }, [ler])

  useEffect(() => {
    if (!aviso) return undefined
    const t = setTimeout(() => setAviso(''), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  /* troca o pedido que mudou, sem ler a lista de novo */
  const trocar = (atualizado) => setPedidos((lista) => (lista ?? []).map((p) => (p.id === atualizado.id ? atualizado : p)))

  const contagem = useMemo(() => {
    const c = { pendente: 0, atendido: 0, recusado: 0, todos: 0 }
    for (const p of pedidos ?? []) {
      c[p.situacao] += 1
      c.todos += 1
    }
    return c
  }, [pedidos])

  const visiveis = useMemo(
    () => (!equipe || filtro === 'todos' ? pedidos ?? [] : (pedidos ?? []).filter((p) => p.situacao === filtro)),
    [pedidos, filtro, equipe],
  )

  const reabrir = async (pedido) => {
    try {
      trocar(await responderPedido(pedido.id, { situacao: 'pendente' }))
      setAviso(`O pedido de ${pedido.usuarioNome} voltou para os pendentes.`)
    } catch (falha) {
      setAviso(falha.message)
    }
  }

  const cancelar = async () => {
    const pedido = cancelando
    setCancelando(null)
    try {
      await cancelarPedido(pedido.id)
      setPedidos((lista) => (lista ?? []).filter((p) => p.id !== pedido.id))
      setAviso('Pedido cancelado.')
    } catch (falha) {
      setAviso(falha.message)
      ler()
    }
  }

  return (
    <AppShell>
      <section className="insumos">
        <header className="insumos__topo">
          <div>
            <h1 className="tela__titulo">{equipe ? 'Insumos' : 'Pedir insumos'}</h1>
            <p className="tela__lead">
              {equipe
                ? 'Os pedidos de material da equipe. Marque como atendido ou recuse com o motivo.'
                : 'Peça o material de que precisa e acompanhe aqui a resposta.'}
            </p>
          </div>
          {!equipe && (
            <Button type="button" onClick={() => setNovo(true)}>
              <Mais />
              Novo pedido
            </Button>
          )}
        </header>

        {equipe && (
          <div className="insumos__filtros" role="group" aria-label="Quais pedidos mostrar">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`chip ${filtro === f.id ? 'is-atual' : ''}`.trim()}
                aria-pressed={filtro === f.id}
                onClick={() => setFiltro(f.id)}
              >
                {f.rotulo}
                <span className="insumos__conta">{contagem[f.id]}</span>
              </button>
            ))}
          </div>
        )}

        {aviso && (
          <p className="recado" role="status">
            {aviso}
            <button type="button" onClick={() => setAviso('')} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}

        {erro && (
          <p className="insumos__erro" role="alert">
            {erro}
          </p>
        )}

        {pedidos === null ? (
          <p className="insumos__vazio">Carregando os pedidos...</p>
        ) : visiveis.length === 0 ? (
          <div className="insumos__vazio">
            <strong>{equipe ? 'Nenhum pedido aqui' : 'Nenhum pedido ainda'}</strong>
            <span>
              {equipe
                ? 'Quando alguém pedir um insumo, o pedido aparece nesta lista.'
                : 'Use "Novo pedido" para pedir o material de que você precisa.'}
            </span>
          </div>
        ) : (
          <ul className="insumos__lista">
            {visiveis.map((p) => (
              <li key={p.id} className="pedido" data-situacao={p.situacao}>
                <div className="pedido__miolo">
                  <p className="pedido__item">
                    <strong>{p.item}</strong>
                    <span className="pedido__qtd">
                      {p.quantidade} {p.quantidade === 1 ? 'unidade' : 'unidades'}
                    </span>
                  </p>
                  <p className="pedido__meta">
                    {equipe && <span className="pedido__quem">{p.usuarioNome}</span>}
                    <span>Pedido em {dataHora(p.criadoEm)}</span>
                  </p>
                  {p.observacao && <p className="pedido__obs">{p.observacao}</p>}
                  {p.situacao !== 'pendente' && (
                    <p className="pedido__resposta">
                      {SITUACAO[p.situacao]}
                      {p.respondidoPorNome ? ` por ${p.respondidoPorNome}` : ''}
                      {p.respondidoEm ? ` em ${dataHora(p.respondidoEm)}` : ''}
                      {p.resposta ? `: ${p.resposta}` : ''}
                    </p>
                  )}
                </div>

                <div className="pedido__lado">
                  <span className="pedido__situacao" data-situacao={p.situacao}>
                    {SITUACAO[p.situacao]}
                  </span>
                  {equipe && p.situacao === 'pendente' && (
                    <div className="pedido__acoes">
                      <button
                        type="button"
                        className="acao acao--padrao"
                        onClick={() => setRespondendo({ pedido: p, situacao: 'atendido' })}
                      >
                        Atendido
                      </button>
                      <button
                        type="button"
                        className="acao acao--fraca"
                        onClick={() => setRespondendo({ pedido: p, situacao: 'recusado' })}
                      >
                        Recusar
                      </button>
                    </div>
                  )}
                  {equipe && p.situacao !== 'pendente' && (
                    <button type="button" className="acao acao--fraca" onClick={() => reabrir(p)}>
                      Reabrir
                    </button>
                  )}
                  {!equipe && p.situacao === 'pendente' && (
                    <button type="button" className="acao acao--fraca" onClick={() => setCancelando(p)}>
                      Cancelar pedido
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ModalNovoPedido
        aberto={novo}
        aoFechar={() => setNovo(false)}
        aoPedir={(pedido) => {
          setPedidos((lista) => [pedido, ...(lista ?? [])])
          setAviso('Pedido enviado. A resposta aparece aqui.')
        }}
      />

      <ModalResposta
        alvo={respondendo}
        aoFechar={() => setRespondendo(null)}
        aoResponder={(pedido) => {
          trocar(pedido)
          setAviso(`Pedido de ${pedido.usuarioNome} ${pedido.situacao === 'atendido' ? 'atendido' : 'recusado'}.`)
        }}
      />

      <Confirma
        aberto={Boolean(cancelando)}
        titulo="Cancelar pedido"
        mensagem={cancelando ? `O pedido de "${cancelando.item}" sai da lista de quem atende.` : ''}
        rotuloConfirmar="Cancelar pedido"
        aoConfirmar={cancelar}
        aoFechar={() => setCancelando(null)}
      />
    </AppShell>
  )
}

/** O formulario do pedido: o que, quantos e uma observacao. */
function ModalNovoPedido({ aberto, aoFechar, aoPedir }) {
  const [campos, setCampos] = useState({ item: '', quantidade: '1', observacao: '' })
  const [erro, setErro] = useState({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setCampos({ item: '', quantidade: '1', observacao: '' })
    setErro({})
  }, [aberto])

  const mudar = (campo, valor) => {
    setCampos((atual) => ({ ...atual, [campo]: valor }))
    setErro((atual) => ({ ...atual, [campo]: undefined, geral: undefined }))
  }

  const enviar = async (e) => {
    e.preventDefault()
    const item = campos.item.trim()
    const quantidade = Number(campos.quantidade)
    if (!item) return setErro({ item: 'Diga o que você precisa.' })
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 9999) {
      return setErro({ quantidade: 'A quantidade vai de 1 a 9999.' })
    }
    setSalvando(true)
    try {
      const pedido = await pedirInsumo({ item, quantidade, observacao: campos.observacao.trim() })
      aoPedir(pedido)
      aoFechar()
    } catch (falha) {
      setErro({ [falha.campo ?? 'geral']: falha.message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Novo pedido" subtitulo="Vai para quem atende os insumos" largura={460}>
      <form className="insumos__form" onSubmit={enviar} noValidate>
        <CampoTexto
          rotulo="O que você precisa"
          placeholder="Ex.: Caixa de luvas nitrílicas"
          maxLength={120}
          value={campos.item}
          onChange={(e) => mudar('item', e.target.value)}
          erro={erro.item}
          autoFocus
        />
        <CampoTexto
          rotulo="Quantidade"
          type="number"
          inputMode="numeric"
          min={1}
          max={9999}
          step={1}
          value={campos.quantidade}
          onChange={(e) => mudar('quantidade', e.target.value)}
          erro={erro.quantidade}
        />
        <CampoArea
          rotulo="Observação (opcional)"
          placeholder="Ex.: Tamanho M, para a obra da semana que vem"
          maxLength={500}
          value={campos.observacao}
          onChange={(e) => mudar('observacao', e.target.value)}
          erro={erro.observacao}
        />
        {erro.geral && (
          <p className="insumos__erro" role="alert">
            {erro.geral}
          </p>
        )}
        <footer className="insumos__rodape">
          <Button type="submit" loading={salvando}>
            Enviar pedido
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

/** Atender (com um recado opcional) ou recusar (com o motivo). */
function ModalResposta({ alvo, aoFechar, aoResponder }) {
  const [resposta, setResposta] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const recusa = alvo?.situacao === 'recusado'

  useEffect(() => {
    if (!alvo) return
    setResposta('')
    setErro('')
  }, [alvo])

  const enviar = async (e) => {
    e.preventDefault()
    const texto = resposta.trim()
    if (recusa && !texto) return setErro('Diga o motivo da recusa.')
    setSalvando(true)
    try {
      const pedido = await responderPedido(alvo.pedido.id, { situacao: alvo.situacao, resposta: texto })
      aoResponder(pedido)
      aoFechar()
    } catch (falha) {
      setErro(falha.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={Boolean(alvo)}
      aoFechar={aoFechar}
      titulo={recusa ? 'Recusar pedido' : 'Pedido atendido'}
      subtitulo={alvo ? `${alvo.pedido.item} · ${alvo.pedido.usuarioNome}` : ''}
      largura={460}
    >
      <form className="insumos__form" onSubmit={enviar} noValidate>
        <CampoArea
          rotulo={recusa ? 'Motivo da recusa' : 'Recado (opcional)'}
          placeholder={recusa ? 'Ex.: Já temos no almoxarife, retire lá' : 'Ex.: Deixei na sua mesa'}
          maxLength={500}
          value={resposta}
          onChange={(e) => {
            setResposta(e.target.value)
            setErro('')
          }}
          erro={erro}
          autoFocus
        />
        <footer className="insumos__rodape">
          <Button type="submit" loading={salvando}>
            {recusa ? 'Recusar' : 'Marcar como atendido'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
