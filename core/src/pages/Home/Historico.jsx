import { useCallback, useEffect, useRef, useState } from 'react'
import Seletor from '@/components/Seletor/Seletor'
import { carregarAtividades } from '@/services/atividadesService'
import { dataBR, hojeISO } from '@/utils/formato'
import './Historico.css'

/**
 * HISTORICO — o que voce fez no sistema, do mais novo para o mais antigo.
 *
 * Cada linha foi gravada pela API no momento da acao (server/atividade.js),
 * com a foto do que era na hora: o nome do cliente, o n° da obra, o
 * valor. Por isso ela nao muda se o cliente for renomeado depois — e
 * continua ali se a obra for apagada.
 *
 * So as SUAS: a API nao tem como devolver as de outra pessoa. E so os
 * ultimos 7 dias, e o filtro de tipo: os dois cortes sao da API, no
 * SELECT — a tela nao esconde nada do que recebe.
 */

const FILTROS = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'checks', rotulo: 'Checks' },
  { valor: 'despesas', rotulo: 'Envios de despesas' },
]

const NADA = {
  todos: 'Nenhuma atividade nos últimos 7 dias.',
  checks: 'Nenhum check nos últimos 7 dias.',
  despesas: 'Nenhum envio de despesa nos últimos 7 dias.',
}

/* a ordem em que os detalhes aparecem, e o rotulo de cada um. Os da
   primeira linha sao "o que" (sem rotulo); os outros vao com rotulo. */
const PRINCIPAIS = ['tipo', 'check', 'card', 'etapa', 'obra', 'cliente', 'setor', 'pessoa', 'cargo', 'arquivo', 'etiqueta', 'avaliacao']
const ROTULOS = {
  valor: 'Valor',
  nota: 'Nota',
  data: 'Data',
  alterado: 'Alterado',
  texto: 'Texto',
  observacao: 'Observação',
  setores: 'Para',
  cidade: 'Cidade',
  conta: 'Conta',
  comprovante: 'Comprovante',
  obras: 'Obras',
  permissoes: 'Permissões',
  imagem: 'Imagem',
  termo_etapa: 'Etapa (singular)',
  termo_etapas: 'Etapas (plural)',
  resposta: 'Resposta',
  prazo: 'Prazo',
  prazo_final: 'Prazo final',
  inicio: 'Início',
  prazo_execucao: 'Prazo da execução',
  dias: 'Dias',
  dia: 'Dia',
  ensaio: 'Ensaio',
  ensaios: 'Ensaios',
  motivo: 'Motivo',
}

function horaDe(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 'AAAA-MM-DD' do carimbo, no fuso de quem esta olhando. */
function diaDe(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ontemISO() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Linha({ atividade }) {
  const detalhes = atividade.detalhes ?? {}
  /* a etapa so e "o que" quando e a propria etapa que mudou; num check
     ela e contexto e vai com rotulo, junto do resto */
  const principais = PRINCIPAIS.filter((k) => k !== 'etapa' || !detalhes.check).filter((k) => detalhes[k])
  const extras = Object.keys(detalhes).filter((k) => !principais.includes(k) && detalhes[k])

  return (
    <li className="hist__item" data-categoria={atividade.categoria}>
      <span className="hist__hora">{horaDe(atividade.criadoEm)}</span>
      <span className="hist__ponto" aria-hidden="true" />
      <div className="hist__corpo">
        <strong className="hist__acao">{atividade.descricao}</strong>
        {principais.length > 0 && (
          <span className="hist__objeto">{principais.map((k) => detalhes[k]).join(' — ')}</span>
        )}
        {extras.length > 0 && (
          <span className="hist__extra">
            {extras.map((k) => (
              <span key={k}>
                {k === 'etapa' ? 'Etapa' : (ROTULOS[k] ?? k)}: <b>{String(detalhes[k])}</b>
              </span>
            ))}
          </span>
        )}
      </div>
    </li>
  )
}

export default function Historico() {
  const [tipo, setTipo] = useState('todos')
  const [atividades, setAtividades] = useState([])
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  /* trocar o filtro no meio de uma carga: so a resposta do ultimo
     pedido entra na tela */
  const carga = useRef(0)

  const carregar = useCallback(
    async (antes) => {
      const minha = (carga.current += 1)
      setCarregando(true)
      setErro('')
      if (!antes) setAtividades([])
      try {
        const resposta = await carregarAtividades({ antes, tipo })
        if (minha !== carga.current) return
        setAtividades((atual) => (antes ? [...atual, ...resposta.atividades] : resposta.atividades))
        setTemMais(Boolean(resposta.temMais))
        setAviso(resposta.aviso ?? '')
      } catch (e) {
        if (minha === carga.current) setErro(e.message)
      } finally {
        if (minha === carga.current) setCarregando(false)
      }
    },
    [tipo],
  )

  useEffect(() => {
    carregar()
  }, [carregar])

  /* agrupado por dia, na ordem em que veio (a mais nova primeiro) */
  const dias = []
  atividades.forEach((a) => {
    const dia = diaDe(a.criadoEm)
    const ultimo = dias[dias.length - 1]
    if (ultimo?.dia === dia) ultimo.itens.push(a)
    else dias.push({ dia, itens: [a] })
  })

  const hoje = hojeISO()
  const ontem = ontemISO()

  return (
    <section className="hist vidro" aria-labelledby="hist-titulo">
      <header className="hist__topo">
        <h2 id="hist-titulo">Histórico</h2>
        <div className="hist__filtro">
          <Seletor largo valor={tipo} aoMudar={setTipo} opcoes={FILTROS} aria-label="Tipo de atividade" />
        </div>
      </header>

      {erro && (
        <p className="hist__erro" role="alert">
          {erro}{' '}
          <button type="button" onClick={() => carregar()}>
            Tentar de novo
          </button>
        </p>
      )}

      {aviso && <p className="hist__vazio">{aviso}</p>}

      {!erro && !aviso && !carregando && atividades.length === 0 && (
        <p className="hist__vazio">{NADA[tipo]}</p>
      )}

      {/* a chave leva a posicao: a lista vem na ordem do id, e se um
          carimbo sair do passo (relogio acertado, carga antiga) o mesmo
          dia pode formar dois grupos */}
      {dias.map(({ dia, itens }, i) => (
        <div key={`${i}-${dia}`} className="hist__dia">
          <h3 className="hist__data">
            {dataBR(dia)}
            {dia === hoje && <em>hoje</em>}
            {dia === ontem && <em>ontem</em>}
          </h3>
          <ul className="hist__lista">
            {itens.map((a) => (
              <Linha key={a.id} atividade={a} />
            ))}
          </ul>
        </div>
      ))}

      {carregando && atividades.length === 0 && !erro && <p className="hist__vazio">Carregando...</p>}

      {temMais && (
        <button
          type="button"
          className="acao acao--fraca hist__mais"
          onClick={() => carregar(atividades[atividades.length - 1]?.id)}
          disabled={carregando}
        >
          {carregando ? 'Carregando...' : 'Ver mais'}
        </button>
      )}
    </section>
  )
}
