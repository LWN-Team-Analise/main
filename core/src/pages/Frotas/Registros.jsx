import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Modal from '@/components/Modal/Modal'
import Seletor from '@/components/Seletor/Seletor'
import { CHECKLIST, POSICOES, TIPOS, kmLegivel } from '@/domain/frotas'
import * as frotasApi from '@/services/frotasService'
import { dataBR } from '@/utils/formato'
import { IconeAlerta, IconeSeta, IconeVoltar } from './icones'
import './Frotas.css'

/**
 * Todas as saidas, trocas e devolucoes, da mais nova para a mais
 * antiga — a rastreabilidade da frota.
 *
 * Os filtros moram no endereco (?veiculo=3&tipo=devolucao...): o
 * "Ver registros" de um veiculo abre aqui ja filtrado, e o voltar do
 * navegador desfaz o ultimo filtro.
 *
 * Cada registro abre no clique e mostra tudo o que foi respondido. Na
 * devolucao, o NAO de uma pergunta importante fica em vermelho — e o
 * registro inteiro ganha a marca de pendencia ja na lista fechada.
 */

const FILTROS_TIPO = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'saida', rotulo: 'Saídas' },
  { valor: 'devolucao', rotulo: 'Devoluções' },
  { valor: 'troca', rotulo: 'Trocas' },
  { valor: 'alertas', rotulo: 'Com pendência' },
]

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** Os ultimos 36 meses, do atual para tras: { valor: 'AAAA-MM', rotulo: 'Outubro de 2026' }. */
function ultimosMeses() {
  const hoje = new Date()
  return Array.from({ length: 36 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    return {
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: `${MESES[d.getMonth()]} de ${d.getFullYear()}`,
    }
  })
}

const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

/** A resposta de sim/nao: verde, vermelho (o NAO importante) ou neutra. */
function Resposta({ valor, importante }) {
  if (valor === true) return <span className="resp resp--sim">Sim</span>
  if (valor === false) return <span className={`resp ${importante ? 'resp--nao' : 'resp--neutra'}`}>Não</span>
  return <span className="resp resp--vazia">Sem resposta</span>
}

/** As cinco fotos, lidas so quando o registro e aberto. */
function Fotos({ registro }) {
  const [fotos, setFotos] = useState(null)
  const [erro, setErro] = useState('')
  const [ampliada, setAmpliada] = useState(null)

  useEffect(() => {
    let vivo = true
    frotasApi
      .carregarFotos(registro.id)
      .then((lista) => vivo && setFotos(lista))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [registro.id])

  const rotulo = (posicao) => POSICOES.find((p) => p.chave === posicao)?.rotulo ?? posicao

  if (erro) return <p className="reg__nota reg__nota--erro">{erro}</p>
  if (!fotos) return <p className="reg__nota">Carregando as fotos...</p>

  return (
    <>
      <ul className="reg__fotos">
        {fotos.map((f) => (
          <li key={f.posicao}>
            <button type="button" onClick={() => setAmpliada(f)} aria-label={`Ampliar: ${rotulo(f.posicao)}`}>
              <img src={f.conteudo} alt={rotulo(f.posicao)} loading="lazy" />
            </button>
            <span>{rotulo(f.posicao)}</span>
          </li>
        ))}
      </ul>
      <Modal
        aberto={Boolean(ampliada)}
        aoFechar={() => setAmpliada(null)}
        titulo={ampliada ? rotulo(ampliada.posicao) : ''}
        subtitulo={`${registro.veiculoNome} · ${TIPOS[registro.tipo]?.rotulo} de ${dataBR(registro.data)}`}
        largura={960}
        nivel={1}
      >
        {ampliada && <img src={ampliada.conteudo} alt={rotulo(ampliada.posicao)} className="reg__ampliada" />}
      </Modal>
    </>
  )
}

/** Tudo o que foi respondido num registro. */
function Detalhe({ registro }) {
  const devolucao = registro.tipo === 'devolucao'
  return (
    <div className="reg__detalhe">
      <dl className="reg__dados">
        <div>
          <dt>{devolucao ? 'Quem deu a devolução' : 'Quem deu a saída'}</dt>
          <dd>{registro.usuarioNome || '—'}</dd>
        </div>
        <div>
          <dt>Condutor</dt>
          <dd>{registro.condutorNome}</dd>
        </div>
        <div>
          <dt>{devolucao ? 'KM de devolução' : 'KM de saída'}</dt>
          <dd>{kmLegivel(registro.km)}</dd>
        </div>
        {devolucao && registro.kmRodados !== null && (
          <div>
            <dt>Rodados</dt>
            <dd>{kmLegivel(registro.kmRodados)}</dd>
          </div>
        )}
        <div>
          <dt>Data e horário</dt>
          <dd>
            {dataBR(registro.data)}
            {registro.hora ? ` às ${registro.hora}` : ''}
          </dd>
        </div>
        {!devolucao && (
          <div className="reg__largo">
            <dt>Destino / Obra</dt>
            <dd>{registro.destino || '—'}</dd>
          </div>
        )}
        <div className="reg__largo">
          <dt>Observações</dt>
          <dd className="reg__texto">{registro.observacao || '—'}</dd>
        </div>
      </dl>

      {devolucao && registro.checklist && (
        <ul className="reg__checklist">
          {CHECKLIST.map((c) => {
            const valor = registro.checklist[c.chave]
            const ruim = c.importante && valor === false
            return (
              <li key={c.chave} className={ruim ? 'is-ruim' : undefined}>
                <span>{c.pergunta}</span>
                <Resposta valor={valor} importante={c.importante} />
                {c.chave === 'semParar' && valor === true && (
                  <span className="reg__posto">{registro.posto || 'Posto não informado'}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {registro.fotos > 0 && <Fotos registro={registro} />}

      {registro.fotosExternas.length > 0 && (
        <div className="reg__externas">
          <span>Fotos enviadas pelo Forms (abrem no SharePoint da empresa):</span>
          <ul>
            {registro.fotosExternas.map((url, i) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {/\.(mp4|mov|avi)$/i.test(url) ? 'Vídeo' : 'Foto'} {i + 1}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {registro.fotos === 0 && registro.fotosExternas.length === 0 && (
        <p className="reg__nota">Sem fotos neste registro.</p>
      )}
    </div>
  )
}

function Registro({ registro }) {
  const [aberto, setAberto] = useState(false)
  const pendencias = registro.alertas.length
  return (
    <li className={`reg ${pendencias ? 'tem-alerta' : ''} ${aberto ? 'is-aberto' : ''}`.trim()} data-tipo={registro.tipo}>
      <button type="button" className="reg__linha" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        <span className="reg__tipo">{TIPOS[registro.tipo]?.rotulo}</span>
        <span className="reg__principal">
          <strong>{registro.veiculoNome}</strong>
          <span>{registro.condutorNome}</span>
        </span>
        <span className="reg__quando">
          {dataBR(registro.data)}
          {registro.hora ? <span> {registro.hora}</span> : null}
        </span>
        <span className="reg__km">{kmLegivel(registro.km)}</span>
        {pendencias > 0 ? (
          <span className="reg__alerta" title="Respostas NÃO no checklist da devolução">
            <IconeAlerta />
            {pendencias} {pendencias === 1 ? 'pendência' : 'pendências'}
          </span>
        ) : (
          <span className="reg__alerta-vazio" aria-hidden="true" />
        )}
        <IconeSeta aberto={aberto} />
      </button>
      {aberto && <Detalhe registro={registro} />}
    </li>
  )
}

export default function Registros() {
  const [params, setParams] = useSearchParams()
  const veiculo = params.get('veiculo') ?? ''
  const tipo = params.get('tipo') ?? ''
  const mes = params.get('mes') ?? ''
  const busca = params.get('busca') ?? ''

  const [veiculos, setVeiculos] = useState([])
  const [registros, setRegistros] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [procura, setProcura] = useState(busca)

  /* cada leitura tem um numero: a resposta de um filtro antigo que
     chega atrasada nao pisa na do filtro novo */
  const leitura = useRef(0)

  useEffect(() => {
    frotasApi
      .carregarVeiculos()
      .then(setVeiculos)
      .catch(() => setVeiculos([]))
  }, [])

  const mudarFiltro = useCallback(
    (chave, valor) => {
      setParams(
        (atual) => {
          const novo = new URLSearchParams(atual)
          if (valor) novo.set(chave, valor)
          else novo.delete(chave)
          return novo
        },
        { replace: chave === 'busca' },
      )
    },
    [setParams],
  )

  /* a procura espera a pessoa parar de digitar */
  useEffect(() => {
    if (procura.trim() === busca) return undefined
    const espera = setTimeout(() => mudarFiltro('busca', procura.trim()), 350)
    return () => clearTimeout(espera)
  }, [procura, busca, mudarFiltro])

  const ler = useCallback(
    async (qualPagina) => {
      const numero = ++leitura.current
      setCarregando(true)
      setErro('')
      try {
        const resposta = await frotasApi.carregarRegistros({
          veiculo,
          tipo: tipo === 'alertas' ? '' : tipo,
          alertas: tipo === 'alertas',
          mes,
          busca,
          pagina: qualPagina,
        })
        if (numero !== leitura.current) return
        setRegistros((atuais) => (qualPagina === 1 ? resposta.registros : [...atuais, ...resposta.registros]))
        setTotal(resposta.total)
        setTemMais(resposta.temMais)
        setPagina(qualPagina)
      } catch (e) {
        if (numero === leitura.current) setErro(e.message)
      } finally {
        if (numero === leitura.current) setCarregando(false)
      }
    },
    [veiculo, tipo, mes, busca],
  )

  useEffect(() => {
    ler(1)
  }, [ler])

  const opcoesVeiculo = useMemo(
    () => [
      { valor: '', rotulo: 'Todos os veículos' },
      ...veiculos.map((v) => ({ valor: v.id, rotulo: v.ativo ? v.nome : `${v.nome} (desativado)` })),
    ],
    [veiculos],
  )

  const opcoesMes = useMemo(() => {
    const lista = ultimosMeses()
    /* um mes antigo que veio pelo endereco continua aparecendo escolhido */
    if (mes && !lista.some((m) => m.valor === mes)) {
      const [a, m] = mes.split('-').map(Number)
      if (a && m >= 1 && m <= 12) lista.push({ valor: mes, rotulo: `${MESES[m - 1]} de ${a}` })
    }
    return [{ valor: '', rotulo: 'Todos os meses' }, ...lista]
  }, [mes])

  const filtrando = Boolean(veiculo || tipo || mes || busca)

  return (
    <AppShell>
      <section className="registros">
        <header className="registros__topo">
          <Link to="/app/frotas" className="registros__voltar">
            <IconeVoltar />
            Frotas
          </Link>
          <h1 className="tela__titulo">Saídas e devoluções</h1>
          <p className="tela__lead">
            Cada registro com o condutor, o KM, o destino e as fotos. Na devolução, o “não” das verificações fica em
            vermelho.
          </p>
        </header>

        <div className="registros__filtros">
          <div className="registros__veiculo">
            <Seletor
              largo
              valor={veiculo}
              aoMudar={(v) => mudarFiltro('veiculo', v)}
              opcoes={opcoesVeiculo}
              vazio="Todos os veículos"
              aria-label="Veículo"
            />
          </div>
          <div className="registros__mes">
            <Seletor
              largo
              valor={mes}
              aoMudar={(v) => mudarFiltro('mes', v)}
              opcoes={opcoesMes}
              vazio="Todos os meses"
              aria-label="Mês"
            />
          </div>
          <label className="procura registros__procura">
            <span className="sr-only">Procurar</span>
            <input
              type="search"
              placeholder="Condutor, quem registrou ou destino"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
            />
          </label>
          <div className="registros__tipos" role="group" aria-label="Tipo de registro">
            {FILTROS_TIPO.map((f) => (
              <button
                key={f.valor || 'todos'}
                type="button"
                className={`chip ${tipo === f.valor ? 'is-atual' : ''}`.trim()}
                aria-pressed={tipo === f.valor}
                data-alerta={f.valor === 'alertas' || undefined}
                onClick={() => mudarFiltro('tipo', f.valor)}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="registros__contagem">
          <span>{carregando && pagina === 1 ? 'Carregando...' : plural(total, 'registro', 'registros')}</span>
          {filtrando && (
            <button
              type="button"
              className="registros__limpar"
              onClick={() => {
                setProcura('')
                setParams({})
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>

        {erro && (
          <p className="formdesp__erro" role="alert">
            {erro}
          </p>
        )}

        {!carregando && !erro && registros.length === 0 && (
          <p className="frotas__vazio">
            {filtrando ? 'Nenhum registro com estes filtros.' : 'Nenhuma saída ou devolução registrada ainda.'}
          </p>
        )}

        <ul className="registros__lista">
          {registros.map((r) => (
            <Registro key={r.id} registro={r} />
          ))}
        </ul>

        {temMais && (
          <button
            type="button"
            className="acao acao--fraca registros__mais"
            onClick={() => ler(pagina + 1)}
            disabled={carregando}
          >
            {carregando ? 'Carregando...' : 'Carregar mais'}
          </button>
        )}
      </section>
    </AppShell>
  )
}
