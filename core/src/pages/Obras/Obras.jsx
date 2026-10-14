import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Seletor from '@/components/Seletor/Seletor'
import { useDados } from '@/context/DadosContext'
import { useAuth } from '@/context/AuthContext'
import {
  cargosDoCheck,
  ordemDosClientes,
  PRIORIDADES,
  PRIORIDADE_PESO,
  situacaoDaObra,
} from '@/domain/obras'
import { dataExtensa, dataHora, hojeISO } from '@/utils/formato'
import CardObra from './CardObra'
import ModalObra from './ModalObra'
import ModalModeloObra from './ModalModeloObra'
import ModalMembros from './ModalMembros'
import ModalSetores from './ModalSetores'
import ModalObservacoes from './ModalObservacoes'
import './Obras.css'

const ORDENACOES = [
  { valor: 'prioridade', rotulo: 'Prioridade' },
  { valor: 'data', rotulo: 'Data de conclusão' },
  { valor: 'empresa', rotulo: 'Empresa' },
  { valor: 'recentes', rotulo: 'Mais recentes' },
]

/* o filtro de setor mostra ate cinco cargos; o resto vai para o "+N" */
/**
 * A fila de setores que cabe em UMA linha.
 *
 * O limite era um numero fixo (cinco). Numa tela larga sobrava espaco
 * para todos e mesmo assim aparecia o "+1"; num celular nem tres
 * cabiam, e a fila quebrava em duas alturas — que e o que se via.
 *
 * Aqui quem decide e a regua. O componente mede a largura de cada
 * pastilha uma vez (elas nao mudam de tamanho: o texto e fixo e nao
 * quebra), guarda as medidas, e a cada mudanca de largura da caixa
 * refaz a conta: quantas cabem, ja descontando o lugar do proprio
 * "+N". O numero no botao e o que sobrou de verdade.
 *
 * As escolhidas vem na frente da fila, mesmo que estivessem escondidas:
 * quem marca um setor pelo "+N" precisa ver a marca na linha, e nao
 * continuar atras do botao.
 */
function FilaDeSetores({ cargos, setores, aoAlternar, aoVerTodos }) {
  const linha = useRef(null)
  const medidas = useRef(new Map())
  const [cabem, setCabem] = useState(cargos.length)

  const ordenados = useMemo(() => {
    const escolhidos = cargos.filter((c) => setores.includes(c.chave))
    const resto = cargos.filter((c) => !setores.includes(c.chave))
    return [...escolhidos, ...resto]
  }, [cargos, setores])

  useLayoutEffect(() => {
    const caixa = linha.current
    if (!caixa) return undefined

    const contar = () => {
      /* guarda a largura de tudo que esta a vista; o que ja saiu da
         linha antes continua valendo pela medida guardada */
      for (const el of caixa.querySelectorAll('[data-chave]')) {
        medidas.current.set(el.dataset.chave, el.offsetWidth)
      }
      const botaoMais = caixa.querySelector('[data-mais]')
      const larguraMais = botaoMais?.offsetWidth ?? 44

      const folga = 6 // o mesmo gap do CSS
      const total = caixa.clientWidth
      let usado = 0
      let quantas = 0

      for (const cargo of ordenados) {
        const largura = medidas.current.get(cargo.chave)
        /* sem medida ainda (primeira pintura): conta como cabendo, e a
           proxima passada corrige */
        if (largura == null) {
          quantas += 1
          continue
        }
        const proximo = usado + (quantas ? folga : 0) + largura
        /* se ainda vai sobrar gente, o "+N" precisa de lugar tambem */
        const precisaDoMais = quantas + 1 < ordenados.length
        const teto = total - (precisaDoMais ? larguraMais + folga : 0)
        if (proximo > teto) break
        usado = proximo
        quantas += 1
      }

      setCabem(Math.max(1, quantas))
    }

    contar()
    const observador = new ResizeObserver(contar)
    observador.observe(caixa)
    return () => observador.disconnect()
  }, [ordenados])

  const visiveis = ordenados.slice(0, cabem)
  const sobraram = ordenados.length - visiveis.length

  return (
    <div className="filtro__linha filtro__linha--fila" ref={linha}>
      {visiveis.map((cargo) => {
        const ativo = setores.includes(cargo.chave)
        return (
          <button
            key={cargo.id}
            type="button"
            data-chave={cargo.chave}
            className={`chip ${ativo ? 'is-atual' : ''}`.trim()}
            style={ativo ? { '--tom': cargo.cor, '--tom-fg': '#fff' } : undefined}
            aria-pressed={ativo}
            onClick={() => aoAlternar(cargo.chave)}
          >
            {cargo.nome}
          </button>
        )
      })}

      {sobraram > 0 && (
        <button
          type="button"
          data-mais=""
          className="chip chip--mais"
          onClick={aoVerTodos}
          title={`Mais ${sobraram} setor${sobraram > 1 ? 'es' : ''} — ver todos`}
        >
          +{sobraram}
        </button>
      )}
    </div>
  )
}

const Mais = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/* o relogio com a seta para tras: o historico das observacoes */
const Historico = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4v5h5" />
    <path d="M3.1 13.2A9 9 0 1 0 6.1 6.1L3 9" />
    <path d="M12 8v4.3l3.4 1.9" />
  </svg>
)

/* o icone da opcao "Adicionar observação" no botao flutuante */
const NotaGlifo = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M8 11h8M8 15h5" />
  </svg>
)

export default function Obras() {
  const {
    obras,
    clientes,
    cargos,
    observacoesQuadro,
    historicoObservacoes,
    clientePorId,
    pessoaPorId,
    adicionarObra,
    concluida,
    etapaDaObra,
    roteiro,
    roteiroDaObra,
    pendentesDaObra,
    rotuloEtapa,
    pode,
  } = useDados()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [modalObra, setModalObra] = useState(null) // 'padrao' | 'emergencia' | null
  /* o modelo da obra: editar o roteiro sem entrar numa obra */
  const [modelo, setModelo] = useState(false)
  const [modalMembros, setModalMembros] = useState(false)
  const [modalSetores, setModalSetores] = useState(false)
  /* qual aba do pop-up de observacoes abrir: 'atuais', 'historico' ou
     null quando ele esta fechado */
  const [modalObs, setModalObs] = useState(null)
  const [recado, setRecado] = useState('')

  /* sem a permissao, o botao nem aparece — e a API recusa igual */
  const podeCriarObra = pode('editar_obras')
  const podeModelo = pode('editar_etapa') || pode('editar_cards') || pode('editar_checks')

  const [prioridade, setPrioridade] = useState(null)
  const [ateData, setAteData] = useState('')
  const [setores, setSetores] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('prioridade')

  /**
   * Os clientes que aparecem no filtro: so os que tem obra ABERTA.
   *
   * A lista vinha do cadastro inteiro, e num cadastro de sessenta
   * empresas o filtro do quadro oferecia cinquenta e cinco escolhas
   * que so podiam devolver tela vazia — a obra daquelas ja fechou, e o
   * quadro nao mostra obra concluida.
   *
   * O cliente ESCOLHIDO fica na lista mesmo que a ultima obra dele
   * feche enquanto a tela esta aberta: some-lo dali deixaria o filtro
   * ligado num cliente que nao da para desmarcar.
   */
  const clientesComObra = useMemo(() => {
    const ativos = new Set(
      obras.filter((o) => !concluida(o)).map((o) => String(o.clienteId)),
    )
    return clientes
      .filter((c) => ativos.has(String(c.id)) || String(c.id) === String(clienteId))
      .sort(ordemDosClientes)
  }, [obras, clientes, concluida, clienteId])

  /**
   * Os setores do filtro "Setor pendente": so os que sao DONOS de algum
   * check — no roteiro de alguma obra aberta ou no modelo de hoje.
   *
   * A lista vinha do cadastro de setores inteiro: o Diretor, que nao tem
   * check nenhum, e os setores com nome de cliente apareciam ali, e
   * escolher qualquer um deles so podia devolver o quadro vazio.
   *
   * O setor ESCOLHIDO fica na lista mesmo que deixe de ter check: some-lo
   * dali deixaria o filtro ligado num setor que nao da para desmarcar.
   */
  const setoresDoFiltro = useMemo(() => {
    const donos = new Set()
    const juntar = (etapas) =>
      etapas.forEach((etapa) =>
        etapa.cards.forEach((card) =>
          (card.checks ?? []).forEach((check) =>
            cargosDoCheck(check, card).forEach((s) => donos.add(s)),
          ),
        ),
      )
    juntar(roteiro)
    obras.filter((o) => !concluida(o)).forEach((obra) => juntar(roteiroDaObra(obra)))
    return cargos.filter((c) => donos.has(c.chave) || setores.includes(c.chave))
  }, [cargos, roteiro, obras, concluida, roteiroDaObra, setores])

  const alternarSetor = (id) =>
    setSetores((atual) => (atual.includes(id) ? atual.filter((s) => s !== id) : [...atual, id]))

  /* ------- filtro + ordenacao (as obras concluidas saem do quadro) ------- */
  const visiveis = useMemo(() => {
    const alvo = busca.trim().toLowerCase()

    const filtradas = obras.filter((obra) => {
      if (concluida(obra)) return false
      if (prioridade && obra.prioridade !== prioridade) return false
      if (clienteId && String(obra.clienteId) !== String(clienteId)) return false
      if (ateData && obra.dataConclusao && obra.dataConclusao > ateData) return false

      if (setores.length > 0) {
        const pendentes = pendentesDaObra(obra)
        if (!setores.some((s) => pendentes.includes(s))) return false
      }

      if (alvo) {
        /* a busca acha pelo n. da proposta também — é por ele que a obra
           costuma ser procurada, e a descrição agora pode estar vazia */
        const empresa = clientePorId(obra.clienteId)?.nome ?? ''
        const texto = `${obra.proposta ?? ''} ${empresa} ${obra.descricao ?? ''}`.toLowerCase()
        if (!texto.includes(alvo)) return false
      }

      return true
    })

    const comparar = {
      prioridade: (a, b) => PRIORIDADE_PESO[b.prioridade] - PRIORIDADE_PESO[a.prioridade],
      data: (a, b) => String(a.dataConclusao ?? '9999').localeCompare(String(b.dataConclusao ?? '9999')),
      empresa: (a, b) =>
        (clientePorId(a.clienteId)?.nome ?? '').localeCompare(
          clientePorId(b.clienteId)?.nome ?? '',
          'pt-BR',
        ),
      recentes: (a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)),
    }[ordem]

    return [...filtradas].sort(comparar)
  }, [
    obras,
    prioridade,
    clienteId,
    ateData,
    setores,
    busca,
    ordem,
    clientePorId,
    concluida,
    pendentesDaObra,
  ])

  /**
   * O QUADRO: uma coluna por etapa do roteiro, lado a lado, e na ponta
   * direita as obras de emergencia — com as observacoes do quadro logo
   * embaixo delas.
   *
   *   1ª Etapa | 2ª Etapa | 3ª Etapa | ... | Obras emergenciais
   *                                         Observações
   *
   * A obra PADRAO entra na coluna da etapa em que esta agora — e e o
   * tamanho das pilhas que responde, de longe, "onde as obras estao
   * paradas". A EMERGENCIA abre todas as etapas de uma vez, entao nao
   * tem "etapa em que esta": vai inteira para a ultima coluna, e o card
   * diz em que etapa ela anda.
   *
   * As colunas saem do roteiro de HOJE, e todas aparecem, mesmo vazias:
   * etapa sem obra e uma coluna em branco, nao um buraco no quadro.
   * Obra antiga cujo roteiro tinha mais etapas que o de hoje cai na
   * ultima coluna, para nao sumir.
   */
  const colunas = useMemo(() => {
    const etapas =
      roteiro.length > 0 ? roteiro : [{ id: 'sem-etapa', numero: 1, nome: '' }]
    /* o mesmo cabecalho da etapa dentro da obra: o NOME no titulo
       ("1° Etapa"; sem nome, o rotulo automatico) e a descricao embaixo
       ("Comercial") */
    const base = etapas.map((etapa) => ({
      id: etapa.id,
      numero: etapa.numero,
      rotulo: etapa.nome || rotuloEtapa(etapa.numero),
      descricao: etapa.descricao ?? '',
      obras: [],
    }))
    visiveis
      .filter((o) => o.tipo !== 'emergencia')
      .forEach((obra) => {
        const indice = Math.min(Math.max(etapaDaObra(obra), 1), base.length) - 1
        base[indice].obras.push(obra)
      })
    return base
  }, [roteiro, rotuloEtapa, visiveis, etapaDaObra])

  const emergencia = visiveis.filter((o) => o.tipo === 'emergencia')

  /* a cor de cada card: verde, azul, ou a escala do prazo do amarelo
     ao vermelho (ver situacaoDaObra) */
  const hoje = hojeISO()
  const situacaoDe = (obra) => situacaoDaObra(roteiroDaObra(obra), obra, hoje)

  const pessoasDa = (obra) => obra.membros.map(pessoaPorId).filter(Boolean)

  /* Membros do cabecalho: so quem esta participando das obras em
     exibicao — nao a equipe inteira. */
  const participantes = useMemo(() => {
    const ids = new Set(visiveis.flatMap((o) => o.membros.map(String)))
    return [...ids].map(pessoaPorId).filter(Boolean)
  }, [visiveis, pessoaPorId])

  return (
    /* Aqui o botao flutuante ganha uma segunda opcao: alem do chat da
       equipe, a observacao do quadro — que so existe nesta tela. Com duas
       coisas a acrescentar, ele vira um "+" e pergunta qual. */
    <AppShell
      acoesFlutuantes={[
        {
          id: 'obs-quadro',
          rotulo: 'Adicionar observação',
          Glifo: NotaGlifo,
          aoClicar: () => setModalObs('atuais'),
        },
      ]}
    >
      <section className="obras">
        {/* ---------------- cabecalho de filtros ----------------

            Sempre aberto. Havia um botao "Filtros" na barra de baixo
            que escondia este painel; ele saiu porque escondia
            justamente o que a tela usa o tempo todo — e um filtro
            fechado e um filtro esquecido ligado, que faz a pessoa
            procurar a obra que "sumiu".

            Cada filtro se desfaz nele mesmo — clicar de novo na pastilha
            marcada a solta, e a lista de clientes tem o "Todos". O botao
            de limpar tudo saiu: ele so aparecia quando havia filtro
            ligado, entao entrava e saia da barra e empurrava o que
            estava do lado a cada clique. */}
        <div className="painel vidro">
            <div className="painel__filtros">
              {/* `--prioridade` existe so para o celular: la ele toma a
                  linha inteira, porque as tres pastilhas cabem numa linha
                  so e os outros filtros se arrumam em duas colunas. */}
              <div className="filtro filtro--prioridade">
                <span className="filtro__nome">Prioridade</span>
                <div className="filtro__linha">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip ${prioridade === p.id ? 'is-atual' : ''}`.trim()}
                      data-tom={p.id}
                      aria-pressed={prioridade === p.id}
                      onClick={() => setPrioridade((atual) => (atual === p.id ? null : p.id))}
                    >
                      {p.rotulo}
                    </button>
                  ))}
                </div>
              </div>

              {/* com muitos clientes, a lista e o caminho mais rapido ate a obra */}
              <div className="filtro">
                <span className="filtro__nome">Cliente</span>
                <div className="filtro__linha">
                  <Seletor
                    valor={clienteId}
                    aoMudar={setClienteId}
                    vazio="Todos os clientes"
                    aria-label="Filtrar por cliente"
                    opcoes={[
                      { valor: '', rotulo: 'Todos os clientes' },
                      ...clientesComObra.map((c) => ({ valor: c.id, rotulo: c.nome })),
                    ]}
                  />
                </div>
              </div>

              <div className="filtro">
                <span className="filtro__nome">
                  Data <em>até</em>
                </span>
                <div className="filtro__linha">
                  <input
                    type="date"
                    className="filtro__data"
                    value={ateData}
                    onChange={(e) => setAteData(e.target.value)}
                    aria-label="Mostrar obras com conclusão até esta data"
                  />
                  {ateData && <span className="filtro__dataleg">{dataExtensa(ateData)}</span>}
                </div>
              </div>

              {/* uma linha SO: o que nao couber vira o "+N" (ver
                  `FilaDeSetores`, no alto do arquivo) */}
              <div className="filtro filtro--setores">
                <span className="filtro__nome">Setor pendente</span>
                <FilaDeSetores
                  cargos={setoresDoFiltro}
                  setores={setores}
                  aoAlternar={alternarSetor}
                  aoVerTodos={() => setModalSetores(true)}
                />
              </div>
            </div>

            {/* Membros: a SEGUNDA coluna da grade do painel, presa no
                alto da direita. O rotulo fica na altura de
                "Prioridade" e as fotos na altura das pastilhas.
                Dentro da fila dos filtros ele caia para a linha de
                baixo — ali sobrava sempre um pouco menos do que ele
                precisava. */}
            <div className="filtro filtro--membros">
              <span className="filtro__nome">Membros</span>
              <button
                type="button"
                className="equipe"
                onClick={() => setModalMembros(true)}
                title="Ver em que obra cada um está"
                disabled={participantes.length === 0}
              >
                {participantes.length === 0 ? (
                  <span className="equipe__vazio">ninguém ainda</span>
                ) : (
                  <>
                    <span className="equipe__avatares">
                      {participantes.slice(0, 5).map((p) => (
                        <Avatar
                          key={p.id}
                          nome={p.nome}
                          foto={p.foto}
                          tamanho={30}
                          titulo={p.nome}
                        />
                      ))}
                    </span>
                    {participantes.length > 5 && (
                      <span className="equipe__resto">+{participantes.length - 5}</span>
                    )}
                  </>
                )}
              </button>
            </div>
        </div>

        {/* ---------------- barra de acoes ---------------- */}
        <div className="barra">
          <p className="barra__total">
            <strong>{visiveis.length}</strong> Obras
          </p>

          {/* Os dois ANDAM JUNTOS, dentro da mesma caixa: eles sao a
              mesma decisao — criar obra — vista de dois lados, e no
              celular e essa caixa que os divide meio a meio.

              "Adicionar" saiu do rotulo. Com ele, os dois nao cabiam na
              mesma linha de um telefone, e o que sobrava era um botao
              embaixo do outro ocupando duas alturas para dizer quase a
              mesma coisa. O "+" na frente ja diz que e para adicionar. */}
          {podeCriarObra && (
            <div className="barra__criar">
              <button
                type="button"
                className="acao acao--obra-padrao"
                onClick={() => setModalObra('padrao')}
                title="Adicionar obra padrão"
              >
                <Mais />
                Obra padrão
              </button>
              <button
                type="button"
                className="acao acao--obra-emergencia"
                onClick={() => setModalObra('emergencia')}
                title="Adicionar obra emergência"
              >
                <Mais />
                Obra emergência
              </button>
              {podeModelo && (
                <button
                  type="button"
                  className="acao acao--modelo"
                  onClick={() => setModelo(true)}
                  title="Editar as etapas, os cards e os checks das próximas obras"
                >
                  Editar
                </button>
              )}
            </div>
          )}

          {/* sem permissao de criar obra, o Editar fica sozinho */}
          {!podeCriarObra && podeModelo && (
            <div className="barra__criar">
              <button
                type="button"
                className="acao acao--modelo"
                onClick={() => setModelo(true)}
                title="Editar as etapas, os cards e os checks das próximas obras"
              >
                Editar
              </button>
            </div>
          )}

          <div className="barra__direita">
            <label className="procura">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar proposta, obra ou empresa..."
                aria-label="Buscar obra ou empresa"
              />
            </label>

            {/* largura fixa: "Data de conclusão" e a opcao mais longa, e
                sem espaco para ela o botao cortava o proprio rotulo com
                reticencias — a pessoa lia "Data de conclu..." e nao
                sabia por que a lista estava naquela ordem */}
            <div className="barra__ordem">
              <Seletor
                valor={ordem}
                aoMudar={setOrdem}
                aria-label="Ordenar por"
                opcoes={ORDENACOES.map((o) => ({ valor: o.valor, rotulo: o.rotulo }))}
              />
            </div>
          </div>
        </div>

        {recado && (
          <p className="recado" role="status">
            {recado}
            <button type="button" onClick={() => setRecado('')} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}

        {/* ---------------- quadro ----------------
            Uma coluna por etapa, lado a lado, ocupando a largura. Na
            ponta direita, a coluna das emergencias e, EMBAIXO dela, as
            observacoes do quadro. */}
        <div className="areaquadro">
          <div className="quadro" style={{ '--colunas': colunas.length }}>
            {colunas.map((coluna) => (
              <Coluna
                key={coluna.id}
                titulo={coluna.rotulo}
                subtitulo={coluna.descricao}
                tom="etapa"
                total={coluna.obras.length}
              >
                {coluna.obras.map((obra) => (
                  <CardObra
                    key={obra.id}
                    obra={obra}
                    cliente={clientePorId(obra.clienteId)}
                    pessoas={pessoasDa(obra)}
                    situacao={situacaoDe(obra)}
                    aoAbrir={() => navigate(`/app/obras/${obra.id}`)}
                  />
                ))}
              </Coluna>
            ))}
          </div>

          <div className="lateral">
            <Coluna
              titulo="Obras emergenciais"
              tom="emergencia"
              total={emergencia.length}
            >
              {emergencia.map((obra) => (
                <CardObra
                  key={obra.id}
                  obra={obra}
                  cliente={clientePorId(obra.clienteId)}
                  pessoas={pessoasDa(obra)}
                  situacao={situacaoDe(obra)}
                  aoAbrir={() => navigate(`/app/obras/${obra.id}`)}
                />
              ))}
            </Coluna>

            {/* ---------------- observacoes do quadro ----------------
                Valem para o quadro inteiro, nao para uma obra: e o
                bloco de recados da equipe sobre as obras em geral.
                Ficam embaixo das obras emergenciais. */}
            <aside className="quadroobs">
              <header className="quadroobs__topo">
                <h2 className="quadroobs__titulo">Observações</h2>
                <span className="quadroobs__contagem">{observacoesQuadro.length}</span>
                {/* O historico e o lugar da observacao que TINHA duracao e
                    venceu: ela sai do painel sozinha, mas nao e apagada.
                    Sem esta porta, o unico jeito de chegar la era abrir o
                    pop-up por outro motivo e reparar na aba.

                    O botao fica no lugar mesmo com o historico vazio —
                    cabecalho que muda de forma e cabecalho que ninguem
                    aprende. Vazio, ele abre a aba que explica em uma linha
                    o que entra ali.

                    So existe para as observacoes do QUADRO: as de dentro
                    de uma obra nao tem duracao, entao nunca vencem e nao
                    tem historico para abrir. */}
                <button
                  type="button"
                  className={`quadroobs__historico ${
                    historicoObservacoes.length > 0 ? 'is-contando' : ''
                  }`.trim()}
                  onClick={() => setModalObs('historico')}
                  title="Histórico de observações"
                  aria-label={
                    historicoObservacoes.length === 0
                      ? 'Histórico de observações'
                      : historicoObservacoes.length === 1
                        ? 'Histórico: 1 observação vencida'
                        : `Histórico: ${historicoObservacoes.length} observações vencidas`
                  }
                >
                  <Historico />
                  {historicoObservacoes.length > 0 && <em>{historicoObservacoes.length}</em>}
                </button>
                <button
                  type="button"
                  className="quadroobs__mais"
                  onClick={() => setModalObs('atuais')}
                  title="Nova observação"
                  aria-label="Nova observação"
                >
                  <Mais />
                </button>
              </header>

              {observacoesQuadro.length === 0 ? (
                <p className="quadroobs__vazio">
                  Nada registrado ainda. Use o + para escrever a primeira.
                </p>
              ) : (
                <ul className="quadroobs__lista">
                  {observacoesQuadro.slice(0, 6).map((o) => (
                    <li key={o.id} className="quadroobs__item">
                      <Avatar nome={o.autorNome} foto={pessoaPorId(o.autorId)?.foto} tamanho={28} />
                      <div>
                        <p className="quadroobs__quem">
                          <strong>{o.autorNome}</strong>
                          <span>{dataHora(o.enviadaEm)}</span>
                        </p>
                        <p className="quadroobs__texto">{o.texto}</p>
                      </div>
                    </li>
                  ))}
                  {observacoesQuadro.length > 6 && (
                    <li>
                      <button
                        type="button"
                        className="quadroobs__ver"
                        onClick={() => setModalObs('atuais')}
                      >
                        Ver as {observacoesQuadro.length} observações
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </aside>
          </div>
        </div>
      </section>

      <ModalModeloObra aberto={modelo} aoFechar={() => setModelo(false)} />

      <ModalObra
        aberto={modalObra !== null}
        tipo={modalObra ?? 'padrao'}
        clientes={clientes}
        aoFechar={() => setModalObra(null)}
        aoSalvar={(campos) => adicionarObra(campos)}
      />

      <ModalSetores
        aberto={modalSetores}
        aoFechar={() => setModalSetores(false)}
        setores={setoresDoFiltro}
        obras={visiveis}
        selecionados={setores}
        aoFiltrar={alternarSetor}
      />

      <ModalMembros
        aberto={modalMembros}
        aoFechar={() => setModalMembros(false)}
        pessoas={participantes}
      />

      <ModalObservacoes
        aberto={modalObs !== null}
        abaInicial={modalObs ?? 'atuais'}
        aoFechar={() => setModalObs(null)}
        autor={user}
      />
    </AppShell>
  )
}

/**
 * Coluna do quadro: titulo (e a descricao da etapa, quando ha), contador e a
 * pilha de cards. Vazia, fica em branco — a etapa sem obra aparece, so
 * que sem nada dentro.
 *
 * Nao tem "+": obra nova nasce SO pelos botoes "+ Obra padrao" e
 * "+ Obra emergencia" da barra, e nao de dentro das colunas.
 */
function Coluna({ titulo, subtitulo, tom, total, children }) {
  return (
    <section className="coluna" data-tom={tom}>
      <header className="coluna__topo">
        <span className="coluna__titulo" data-tom={tom}>
          {titulo}
        </span>
        {subtitulo && <span className="coluna__subtitulo">{subtitulo}</span>}
        <span className="coluna__contador">{total}</span>
      </header>

      <div className="coluna__pilha">{total > 0 && children}</div>
    </section>
  )
}

