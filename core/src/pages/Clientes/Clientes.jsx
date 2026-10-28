import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import { useTheme } from '@/context/ThemeContext'
import { corAdaptada, textoSobre } from '@/utils/cor'
import Avatar from '@/components/Avatar/Avatar'
import {
  CutoutCard,
  CutoutCardAction,
  CutoutCardContent,
  CutoutCardFooter,
  CutoutCardImage,
  CutoutCardInsetLabel,
  CutoutCardMedia,
  CutoutCardOverlay,
  CutoutCardPin,
} from '@/components/CutoutCard/CutoutCard'
import { useDados } from '@/context/DadosContext'
import { ordemDosClientes } from '@/domain/obras'
import {
  codigoPostal,
  enderecoCompleto,
  enderecoNasUnidades,
  localDoEndereco,
  locaisDasUnidades,
  ordemDasUnidades,
  raizDoCliente,
  rotuloDaUnidade,
} from '@/domain/clientes'
import { ehBrasil, nomeDoPais } from '@/domain/paises'
import Estrelas from '@/components/Estrelas/Estrelas'
import { dataBR, dataHora, hojeISO } from '@/utils/formato'
import useCorDaLogo from '@/hooks/useCorDaLogo'
import Confirma from '@/components/Confirma/Confirma'
import { carregarResumoClientes } from '@/services/comercialService'
import { baixarPlanilha } from '@/utils/planilha'
import ModalCliente from './ModalCliente'
import ModalSetores from './ModalSetores'
import './Clientes.css'

const Icone = {
  mais: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  lapis: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
    </svg>
  ),
  lixo: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 7h15M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </svg>
  ),
  setor: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5 11 4l8 3.5v9L11 20l-8-3.5z" />
      <path d="M3 7.5 11 11l8-3.5M11 11v9" />
    </svg>
  ),
  exportar: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
    </svg>
  ),
  pino: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  ),
}

export default function Clientes() {
  const { isDark } = useTheme()
  const {
    clientes,
    setores,
    setorPorId,
    obras,
    adicionarCliente,
    atualizarCliente,
    removerCliente,
    concluida,
    pode,
    equipe,
  } = useDados()
  const navigate = useNavigate()

  /* sem a permissao a lista continua a mesma; o que some sao os
     botoes de cadastrar, editar e apagar */
  const podeMexer = pode('editar_clientes')
  const podeExportar = pode('exportar_clientes')

  /* os negocios de cada cliente (aba Comercial): ganhos, abertos e o
     ticket medio. Sem a tabela, ou sem resposta, fica tudo em zero. */
  const [resumo, setResumo] = useState({})
  useEffect(() => {
    let valido = true
    carregarResumoClientes()
      .then((r) => valido && setResumo(r))
      .catch(() => {})
    return () => {
      valido = false
    }
  }, [clientes])

  /* As UNIDADES (atualizacao 33): na aba fica so o cliente "de cima"; as
     unidades dele (Einstein Anapolis, Einstein Alphaville) entram no card
     dele, e as obras, as notas e os negocios delas somam no dele. */
  const { principais, unidadesDe, raizDe } = useMemo(() => {
    const unidades = new Map()
    clientes.forEach((c) => {
      if (!c.matrizId) return
      const chave = String(c.matrizId)
      if (!unidades.has(chave)) unidades.set(chave, [])
      unidades.get(chave).push(c)
    })
    unidades.forEach((lista) => lista.sort(ordemDasUnidades))
    return {
      principais: clientes.filter((c) => !c.matrizId),
      unidadesDe: unidades,
      raizDe: new Map(clientes.map((c) => [String(c.id), raizDoCliente(c)])),
    }
  }, [clientes])

  /* os negocios do Comercial somados por cliente "de cima": ganhos,
     abertos e o ticket medio pesado pelos ganhos de cada unidade */
  const resumoDoGrupo = useMemo(() => {
    const soma = {}
    Object.entries(resumo).forEach(([id, r]) => {
      const chave = raizDe.get(String(id)) ?? String(id)
      const atual = soma[chave] ?? { ganhos: 0, abertos: 0, valor: 0 }
      atual.ganhos += r?.ganhos ?? 0
      atual.abertos += r?.abertos ?? 0
      atual.valor += (r?.ticketMedio ?? 0) * (r?.ganhos ?? 0)
      soma[chave] = atual
    })
    Object.values(soma).forEach((r) => {
      r.ticketMedio = r.ganhos ? r.valor / r.ganhos : null
    })
    return soma
  }, [resumo, raizDe])

  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  /* A busca do topo manda o nome procurado no estado da rota: quem
     clicou em "Eurofirma" la em cima chega aqui com a lista ja
     filtrada nela, em vez de receber o cadastro inteiro e ter de
     procurar de novo o que acabou de digitar. */
  const { state } = useLocation()
  const [busca, setBusca] = useState(state?.busca ?? '')

  /* o efeito cuida da segunda vez: ja estando nesta tela, o estado
     inicial do useState nao roda de novo e o filtro ficaria no nome
     anterior */
  useEffect(() => {
    if (state?.busca) setBusca(state.busca)
  }, [state])
  const [apagando, setApagando] = useState(null)
  const [modalSetores, setModalSetores] = useState(false)
  /* null = todos os setores; um id filtra; "sem" mostra os nao classificados */
  const [setorFiltro, setSetorFiltro] = useState(null)

  const lista = useMemo(() => {
    const alvo = busca.trim().toLowerCase()
    /* a busca acha o cliente tambem pelo nome, pela cidade ou pelo pais de uma unidade */
    const bate = (c) =>
      `${c.nome} ${c.cidade} ${c.estado} ${c.cidade && !ehBrasil(c.pais) ? nomeDoPais(c.pais) : ''}`
        .toLowerCase()
        .includes(alvo)
    let filtrados = alvo
      ? principais.filter((c) => bate(c) || (unidadesDe.get(String(c.id)) ?? []).some(bate))
      : principais

    /* "sem" e uma escolha de verdade, nao a ausencia de filtro: e assim
       que se acha quem falta classificar */
    if (setorFiltro === 'sem') filtrados = filtrados.filter((c) => !c.setorId)
    else if (setorFiltro) {
      filtrados = filtrados.filter((c) => String(c.setorId) === String(setorFiltro))
    }

    /* as unidades da LWN (prioritarias) sempre na frente */
    return [...filtrados].sort(ordemDosClientes)
  }, [principais, unidadesDe, busca, setorFiltro])

  /* quantas obras cada cliente tem, e quantas ainda estao abertas */
  const contagem = useMemo(() => {
    const mapa = {}
    obras.forEach((o) => {
      /* a obra da unidade conta no cliente dela */
      const chave = raizDe.get(String(o.clienteId)) ?? String(o.clienteId)
      const atual = mapa[chave] ?? { total: 0, abertas: 0 }
      atual.total += 1
      if (!concluida(o)) atual.abertas += 1
      mapa[chave] = atual
    })
    return mapa
  }, [obras, concluida, raizDe])

  /**
   * A avaliacao de cada cliente.
   *
   * A nota do cliente e a MEDIA das obras avaliadas dele — a mesma conta que
   * a aba Avaliacoes faz por pessoa, so que agrupada por empresa. Obra sem
   * nota nao entra na media (e nao conta como zero, que puxaria a media para
   * baixo de graca).
   *
   * Junto vem a lista das obras avaliadas, ja com as notas separadas de cada
   * uma: e o que o card abre quando a pessoa quer ver de onde veio a media.
   */
  const avaliacoes = useMemo(() => {
    const mapa = {}
    obras.forEach((o) => {
      if (!o.avaliacao) return
      const chave = raizDe.get(String(o.clienteId)) ?? String(o.clienteId)
      const atual = mapa[chave] ?? { soma: 0, quantas: 0, obras: [] }
      atual.soma += Number(o.avaliacao.nota)
      atual.quantas += 1
      atual.obras.push(o)
      mapa[chave] = atual
    })

    Object.values(mapa).forEach((v) => {
      v.media = Math.round((v.soma / v.quantas) * 10) / 10
      /* da avaliacao mais recente para a mais antiga */
      v.obras.sort((a, b) =>
        String(b.avaliacao.avaliadaEm ?? b.criadoEm).localeCompare(
          String(a.avaliacao.avaliadaEm ?? a.criadoEm),
        ),
      )
    })
    return mapa
  }, [obras, raizDe])

  const abrirNovo = () => {
    setEditando(null)
    setModal(true)
  }

  const abrirEdicao = (cliente) => {
    setEditando(cliente)
    setModal(true)
  }

  /* O banco apaga as obras do cliente junto (server/routes/dados.js);
     a confirmacao avisa quantas sao antes de mandar. */
  const confirmarExclusao = () => {
    if (apagando) removerCliente(apagando.id)
  }

  /**
   * A planilha do cadastro inteiro: uma linha por empresa, com o que a
   * tela tem e o que o sistema calcula (negocios do Comercial e a nota
   * das obras avaliadas). A segunda aba traz as pessoas de contato, uma
   * por linha.
   */
  const exportarClientes = () => {
    const nomeDe = (id) => equipe.find((p) => String(p.id) === String(id))?.nome ?? ''
    const ordenados = [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const nomeDoCliente = (id) => clientes.find((x) => String(x.id) === String(id))?.nome ?? ''
    /* o cliente com unidade sai sem endereco: o de cada unidade esta na
       linha dela */
    const vitrine = (c) => !c.matrizId && enderecoNasUnidades((unidadesDe.get(String(c.id)) ?? []).length)
    baixarPlanilha(
      [
        {
          nome: 'Clientes',
          tabela: 'Clientes',
          colunas: [
            { titulo: 'Empresa', tipo: 'texto', largura: 34 },
            { titulo: 'Unidade de', tipo: 'texto', largura: 26 },
            { titulo: 'Endereço', tipo: 'texto', largura: 48 },
            { titulo: 'Cidade', tipo: 'texto', largura: 18 },
            { titulo: 'Estado', tipo: 'texto', largura: 14 },
            { titulo: 'País', tipo: 'texto', largura: 14 },
            { titulo: 'Setor', tipo: 'texto', largura: 18 },
            { titulo: 'Pessoas', tipo: 'texto', largura: 46 },
            { titulo: 'Negócios fechados', tipo: 'inteiro', largura: 12 },
            { titulo: 'Negócios em aberto', tipo: 'inteiro', largura: 12 },
            { titulo: 'Ticket médio', tipo: 'reais', largura: 14 },
            { titulo: 'Próximo contato', tipo: 'data', largura: 14 },
            { titulo: 'Proprietário', tipo: 'texto', largura: 22 },
            { titulo: 'Nota de satisfação média', tipo: 'decimal', largura: 12 },
          ],
          linhas: ordenados.map((c) => [
            c.nome,
            c.matrizId ? nomeDoCliente(c.matrizId) : '',
            vitrine(c) ? '' : enderecoCompleto(c),
            vitrine(c) ? '' : c.cidade,
            vitrine(c) ? '' : c.estado,
            vitrine(c) || !c.cidade ? '' : nomeDoPais(c.pais),
            setorPorId(c.setorId)?.nome ?? '',
            (c.pessoas ?? []).map((p) => (p.email ? `${p.nome} <${p.email}>` : p.nome)).join('; '),
            resumo[c.id]?.ganhos ?? 0,
            resumo[c.id]?.abertos ?? 0,
            resumo[c.id]?.ticketMedio ?? null,
            c.proximoContato || null,
            nomeDe(c.proprietarioId),
            /* a nota fica na linha do cliente, ja somando as unidades */
            c.matrizId ? null : (avaliacoes[c.id]?.media ?? null),
          ]),
        },
        {
          nome: 'Pessoas',
          tabela: 'Pessoas',
          colunas: [
            { titulo: 'Empresa', tipo: 'texto', largura: 34 },
            { titulo: 'Nome', tipo: 'texto', largura: 28 },
            { titulo: 'Cargo', tipo: 'texto', largura: 22 },
            { titulo: 'E-mail', tipo: 'texto', largura: 32 },
            { titulo: 'Telefone', tipo: 'texto', largura: 18 },
          ],
          linhas: ordenados.flatMap((c) =>
            (c.pessoas ?? []).map((p) => [c.nome, p.nome, p.cargo, p.email, p.telefone]),
          ),
        },
      ],
      `clientes-${hojeISO()}.xlsx`,
    )
  }

  const salvar = (campos) => {
    if (editando) atualizarCliente(editando.id, campos)
    else adicionarCliente(campos)
  }

  return (
    <AppShell>
      <section className="clientes">
        {/* titulo, filtro e acao na mesma linha */}
        <header className="clientes__topo">
          <h1 className="clientes__titulo">Clientes</h1>

          <label className="procura">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar empresa ou cidade..."
              aria-label="Buscar cliente"
            />
          </label>

          {/* `acao--fraca`, e nao `acao` pelada: a classe base traz
              `color: #fff` e nenhum fundo — ela existe para receber uma
              variante que pinte o botao. Sozinha, o que saia era texto
              branco por cima do que estivesse atras, que no tema claro
              e branco tambem. Era o unico botao do sistema assim. */}
          {podeMexer && (
            <button
              type="button"
              className="acao acao--fraca"
              onClick={() => setModalSetores(true)}
              title="Criar, editar ou excluir setores"
            >
              <Icone.setor />
              Setores
            </button>
          )}

          {podeExportar && (
            <button
              type="button"
              className="acao acao--fraca"
              onClick={exportarClientes}
              disabled={principais.length === 0}
              title="Baixar todos os clientes numa planilha do Excel"
            >
              <Icone.exportar />
              Exportar clientes
            </button>
          )}

          {podeMexer && (
            <button type="button" className="acao acao--padrao" onClick={abrirNovo}>
              <Icone.mais />
              Novo cliente
            </button>
          )}
        </header>

        {/* Filtro por setor. So aparece quando ha setor cadastrado — uma
            linha de filtro vazia so ocuparia espaco. */}
        {setores.length > 0 && (
          <div className="clientes__setores">
            <button
              type="button"
              className={`chip ${setorFiltro === null ? 'is-atual' : ''}`.trim()}
              onClick={() => setSetorFiltro(null)}
            >
              Todos
            </button>

            {setores.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`chip ${String(setorFiltro) === String(s.id) ? 'is-atual' : ''}`.trim()}
                /* a cor CRUA nao serve: um setor escuro some no tema
                   escuro e um claro some no claro. `corAdaptada` clareia
                   ou escurece sem mudar o matiz, e `textoSobre` escolhe
                   entre preto e branco por cima dela — em vez do branco
                   fixo, que sumia em cima de setor amarelo ou bege. */
                style={{ '--tom': corAdaptada(s.cor, isDark), '--tom-fg': textoSobre(s.cor, isDark) }}
                onClick={() =>
                  setSetorFiltro((atual) =>
                    String(atual) === String(s.id) ? null : String(s.id),
                  )
                }
              >
                {s.nome}
              </button>
            ))}

            {principais.some((c) => !c.setorId) && (
              <button
                type="button"
                className={`chip ${setorFiltro === 'sem' ? 'is-atual' : ''}`.trim()}
                onClick={() => setSetorFiltro((a) => (a === 'sem' ? null : 'sem'))}
              >
                Sem setor
              </button>
            )}
          </div>
        )}

        {lista.length === 0 ? (
          <p className="clientes__vazio">
            {busca ? 'Nenhum cliente encontrado com esse termo.' : 'Nenhum cliente cadastrado.'}
          </p>
        ) : (
          <ul className="clientes__grade">
            {lista.map((cliente) => (
              <CardCliente
                key={cliente.id}
                cliente={cliente}
                unidades={unidadesDe.get(String(cliente.id)) ?? []}
                numeros={contagem[cliente.id] ?? { total: 0, abertas: 0 }}
                nota={avaliacoes[cliente.id] ?? null}
                setor={setorPorId(cliente.setorId)}
                podeMexer={podeMexer}
                aoEditar={() => abrirEdicao(cliente)}
                aoEditarUnidade={(unidade) => abrirEdicao(unidade)}
                aoApagar={() => setApagando(cliente)}
                aoVer={() => navigate('/app/obras')}
              />
            ))}
          </ul>
        )}
      </section>

      <ModalSetores aberto={modalSetores} aoFechar={() => setModalSetores(false)} />

      <ModalCliente
        aberto={modal}
        cliente={editando}
        resumo={editando && !editando.matrizId ? resumoDoGrupo[editando.id] ?? null : null}
        nota={editando ? avaliacoes[editando.id] ?? null : null}
        aoFechar={() => setModal(false)}
        aoSalvar={salvar}
      />

      <Confirma
        aberto={Boolean(apagando)}
        titulo={`Apagar ${apagando?.nome ?? 'cliente'}?`}
        mensagem={
          (unidadesDe.get(String(apagando?.id)) ?? []).length > 0
            ? `O cadastro e as ${unidadesDe.get(String(apagando.id)).length} unidade(s) dele saem da lista, e não dá para desfazer.`
            : 'O cadastro sai da lista e não dá para desfazer.'
        }
        aviso={
          (contagem[apagando?.id]?.total ?? 0) > 0
            ? `Este cliente tem ${contagem[apagando.id].total} obra(s), somando as unidades. Elas serão apagadas junto, com as etapas, observações e avaliações.`
            : undefined
        }
        rotuloConfirmar="Apagar cliente"
        aoConfirmar={confirmarExclusao}
        aoFechar={() => setApagando(null)}
      />
    </AppShell>
  )
}

/** Duas letras do nome da empresa, para o cartao sem logo. */
function iniciais(nome) {
  return String(nome ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase()
}

/**
 * Card do cliente, em dois estados.
 *
 * FECHADO ele e so uma linha — logo, nome e a setinha. Com muitos
 * clientes a lista fica curta e da para achar de bater o olho.
 *
 * ABERTO ele vira o cartao de quinas recortadas: a logo ocupa o topo,
 * a cidade fica na tarja vazada de baixo e a contagem de obras no selo
 * de cima. Foi o pedido: o cartao recortado e o do cliente ABERTO.
 *
 * A PASSAGEM entre os dois: o card e UM SO nos dois estados, e o
 * cabecalho nunca sai do lugar.
 *
 * Antes ele era dois cards diferentes — uma linha, que desmontava, e um
 * cartao, que nascia no lugar dela. Nenhuma animacao segurava esse
 * troco: o <li> mudava de altura no mesmo quadro em que o cartao
 * comecava a aparecer, e o resultado era o pulo. Fechar era pior ainda,
 * porque a animacao de saida precisava de um timer para o React so
 * desmontar depois — e no fim do timer a altura despencava de uma vez.
 *
 * Agora o cabecalho fica montado o tempo todo e as duas partes que
 * entram e saem (a foto em cima, o conteudo embaixo) vivem em regioes
 * que crescem de 0fr a 1fr. A altura do card e sempre a soma delas, em
 * transicao, entao nada salta: o cabecalho fica parado enquanto o resto
 * se abre em volta dele, com um fade e uma escala curtos por cima.
 *
 * Sem timer, sem estado de "fechando" e sem desmontar nada — fechar e
 * exatamente a mesma transicao no sentido contrario.
 *
 * Fecha por tres caminhos, e os tres valem: o botao "Fechar" sobre a
 * foto, o proprio cabecalho (a faixa da logo com o nome) e QUALQUER
 * ponto do card aberto que nao seja um botao. Clicar de novo onde se
 * clicou para abrir e o gesto que a mao ja espera — e o resto do
 * cartao, que antes era area morta, agora responde igual.
 */
function CardCliente({ cliente, unidades = [], numeros, nota, setor, podeMexer, aoEditar, aoEditarUnidade, aoApagar, aoVer }) {
  const { isDark } = useTheme()
  const cor = useCorDaLogo(cliente.logo, cliente.nome)
  const [aberto, setAberto] = useState(false)
  /* com unidade o card e a vitrine delas: o endereco e o de cada
     unidade, e a tarja de baixo da foto diz onde elas estao */
  const vitrine = enderecoNasUnidades(unidades.length)
  const proprio = localDoEndereco(cliente)
  const locais = vitrine || !proprio ? locaisDasUnidades(unidades) : [proprio]
  const onde = locais.length > 2 ? `${locais.slice(0, 2).join(' · ')} +${locais.length - 2}` : locais.join(' · ')
  /* a lista das obras avaliadas fica fechada ate alguem pedir: o card ja
     mostra a media, e a media e o que responde "esse cliente foi bem?" */
  const [verNotas, setVerNotas] = useState(false)

  const fechar = () => {
    setAberto(false)
    /* a lista de notas volta recolhida na próxima abertura */
    setVerNotas(false)
  }

  const alternar = () => (aberto ? fechar() : setAberto(true))

  /**
   * Com o card ABERTO, clicar em QUALQUER lugar dele fecha.
   *
   * Antes só a faixa do cabeçalho (a que tem a setinha) fechava, e o
   * resto do cartão — a foto, o endereço, a avaliação — era uma área
   * morta: a mão clicava, nada acontecia, e era preciso procurar de
   * volta a setinha lá em cima.
   *
   * O que continua clicável é o que tem função própria: os botões
   * (editar, apagar, "Ver no quadro", abrir as notas), os links e os
   * campos. Por isso o clique só fecha quando NÃO saiu de um desses —
   * senão apagar um cliente fecharia o card no mesmo gesto.
   */
  const cliqueNoCard = (evento) => {
    if (!aberto) return
    if (evento.target.closest('button, a, input, textarea, select, [role="button"]')) return
    fechar()
  }

  const cabeca = (
    <button
      type="button"
      className="cliente__topo"
      onClick={alternar}
      aria-expanded={aberto}
      title={aberto ? 'Fechar' : 'Ver endereço e obras'}
    >
      <Avatar nome={cliente.nome} foto={cliente.logo} tamanho={40} quadrado titulo={cliente.nome} />
      {/* nome e selos num bloco que QUEBRA linha: com nota e setor na
          mesma linha do nome, num card estreito o nome encolhia ate
          sobrar uma letra por linha. Agora os selos descem para baixo
          do nome quando nao cabem ao lado. */}
      <span className="cliente__titulo">
        <h2 className="cliente__nome">{cliente.nome}</h2>

        {/* ---- a nota, na linha do nome ----
            Antes ela só existia dentro do card aberto, no pino sobre a
            foto. Mas "esse cliente foi bem?" é a pergunta que se faz
            VARRENDO a lista, e não abrindo cliente por cliente para
            descobrir — então ela sobe para o cabeçalho, que é a única
            parte sempre visível. Dentro do card ela continua, com as
            notas obra a obra. */}
        {(nota || setor || unidades.length > 0) && (
          <span className="cliente__selos">
            {nota && (
              <span
                className="cliente__nota"
                title={`Média de ${nota.quantas} obra${nota.quantas === 1 ? '' : 's'} avaliada${
                  nota.quantas === 1 ? '' : 's'
                }`}
              >
                <Estrelas nota={nota.media} tamanho={12} />
                <strong>{nota.media.toFixed(1)}</strong>
              </span>
            )}

            {setor && (
              <span className="cliente__setor" style={{ '--setor-cor': corAdaptada(setor.cor, isDark) }}>
                {setor.nome}
              </span>
            )}

            {unidades.length > 0 && (
              <span className="cliente__qtdunid" title={unidades.map((u) => u.nome).join(', ')}>
                {unidades.length} unidade{unidades.length === 1 ? '' : 's'}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="cliente__seta" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>
  )

  return (
    <li>
      <CutoutCard
        className={`cliente ${aberto ? 'cliente--aberto' : ''}`.trim()}
        style={{ '--cor-logo': cor, '--corte-cor': cor }}
        destaque={aberto}
        onClick={cliqueNoCard}
      >
        {/* a foto entra por cima do cabeçalho, e é a primeira das duas
            regiões que crescem */}
        <div className="cliente__dobra" data-aberto={aberto}>
          <div className="cliente__dobra-int">
            <CutoutCardMedia altura={170}>
              <CutoutCardImage
                src={cliente.logo}
                alt=""
                iniciais={iniciais(cliente.nome)}
                cor={cor}
              />
              <CutoutCardOverlay />

              <CutoutCardPin>
                {/* a nota vale mais que a contagem no canto: e o primeiro numero
                    que se procura ao abrir um cliente */}
                {nota ? (
                  <span className="cliente__pino cliente__pino--nota">
                    <Estrelas nota={nota.media} tamanho={12} />
                    {nota.media.toFixed(1)}
                  </span>
                ) : (
                  <span className="cliente__pino">
                    {numeros.total} obra{numeros.total === 1 ? '' : 's'}
                  </span>
                )}
              </CutoutCardPin>

              {onde && (
                <CutoutCardInsetLabel title={locais.join(', ')}>
                  <Icone.pino />
                  {onde}
                </CutoutCardInsetLabel>
              )}

              <CutoutCardAction>
                <button type="button" className="cliente__fechar" onClick={fechar}>
                  Fechar
                </button>
              </CutoutCardAction>
            </CutoutCardMedia>
          </div>
        </div>

        {/* o cabeçalho é o ponto fixo: ele não entra em região nenhuma,
            então não se mexe quando o card abre ou fecha */}
        {cabeca}

        <div className="cliente__dobra" data-aberto={aberto}>
          <div className="cliente__dobra-int">
        <CutoutCardContent>
          <dl className="cliente__dados">
            {!vitrine && (
              <>
                <div>
                  <dt>Endereço</dt>
                  <dd>{cliente.endereco || '—'}</dd>
                </div>
                <div>
                  <dt>Bairro</dt>
                  <dd>{cliente.bairro || '—'}</dd>
                </div>
                <div>
                  <dt>{ehBrasil(cliente.pais) ? 'CEP' : 'Código postal'}</dt>
                  <dd>{codigoPostal(cliente.cep, cliente.pais) || '—'}</dd>
                </div>
                {!ehBrasil(cliente.pais) && (
                  <div>
                    <dt>País</dt>
                    <dd>{nomeDoPais(cliente.pais)}</dd>
                  </div>
                )}
              </>
            )}
            <div>
              <dt>Setor</dt>
              <dd>
                {setor ? (
                  <span className="cliente__setor" style={{ '--setor-cor': corAdaptada(setor.cor, isDark) }}>
                    {setor.nome}
                  </span>
                ) : (
                  <em className="cliente__semsetor">sem setor</em>
                )}
              </dd>
            </div>
          </dl>

          {/* as unidades: o lugar, o servico e o endereco de cada uma. Quem
              pode mexer abre a unidade no clique (o endereco e as pessoas
              dela se editam ali). */}
          {unidades.length > 0 && (
            <div className="cliente__unidades">
              <p className="cliente__unidtitulo">Unidades</p>
              <ul>
                {unidades.map((u) => {
                  const endereco = enderecoCompleto(u)
                  return (
                    <li key={u.id}>
                      {podeMexer ? (
                        <button
                          type="button"
                          className="cliente__unidade"
                          onClick={() => aoEditarUnidade(u)}
                          title={`Editar ${u.nome}`}
                        >
                          <strong>{rotuloDaUnidade(u)}</strong>
                          <span>{endereco}</span>
                        </button>
                      ) : (
                        <>
                          <strong>{rotuloDaUnidade(u)}</strong>
                          <span>{endereco}</span>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* ---------------- Avaliação do cliente ----------------

              A media de TODAS as obras avaliadas dele. Abrindo, sai de onde
              ela veio: cada obra com a data, as estrelas e o que foi
              comentado — e, quando a obra teve mais de uma nota (diretor,
              cliente, ...), as duas aparecem separadas, porque a media da
              obra sozinha esconde uma nota baixa ao lado de uma alta. */}
          <div className="clinota">
            {nota ? (
              <>
                <button
                  type="button"
                  className={`clinota__topo ${verNotas ? 'is-aberto' : ''}`.trim()}
                  onClick={() => setVerNotas((v) => !v)}
                  aria-expanded={verNotas}
                >
                  <span className="clinota__rotulo">Avaliação geral</span>
                  <Estrelas nota={nota.media} tamanho={14} />
                  <strong className="clinota__media">{nota.media.toFixed(1)}</strong>
                  <span className="clinota__quantas">
                    {nota.quantas} obra{nota.quantas === 1 ? '' : 's'} avaliada
                    {nota.quantas === 1 ? '' : 's'}
                  </span>
                  <span className="clinota__seta" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>

                {verNotas && (
                  <ul className="clinota__obras">
                    {nota.obras.map((o) => (
                      <li key={o.id} className="clinota__obra" data-tipo={o.tipo}>
                        <p className="clinota__obratopo">
                          <strong className="clinota__obradesc">
                            {o.proposta ? `${o.proposta} — ` : ''}
                            {o.descricao || 'obra sem descrição'}
                          </strong>
                          <span className="clinota__obradata">
                            {dataBR(String(o.criadoEm).slice(0, 10))}
                          </span>
                        </p>

                        <p className="clinota__obranota">
                          <Estrelas nota={o.avaliacao.nota} tamanho={13} />
                          <strong>{Number(o.avaliacao.nota).toFixed(1)}</strong>
                          {o.notas?.length > 1 && (
                            <em>média de {o.notas.length} avaliações</em>
                          )}
                        </p>

                        {/* cada nota separada, com o que foi comentado nela */}
                        {o.notas?.length > 0 && (
                          <ul className="clinota__linhas">
                            {o.notas.map((n) => (
                              <li key={n.id}>
                                <span className="clinota__quem">{n.rotulo}</span>
                                <span className="clinota__valor">
                                  {Number(n.nota).toFixed(1)}
                                </span>
                                {n.descricao ? (
                                  <span className="clinota__obs">{n.descricao}</span>
                                ) : (
                                  <span className="clinota__obs clinota__obs--vazia">
                                    sem observação
                                  </span>
                                )}
                                {n.avaliadaEm && (
                                  <time className="clinota__quando">
                                    {dataHora(n.avaliadaEm)}
                                  </time>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="clinota__sem">
                Nenhuma obra deste cliente foi avaliada ainda.
              </p>
            )}
          </div>
        </CutoutCardContent>

        <CutoutCardFooter>
          <span className="cliente__obras">
            <strong>{numeros.total}</strong> obra{numeros.total === 1 ? '' : 's'}
            {numeros.abertas > 0 && <em>{numeros.abertas} em andamento</em>}
          </span>

          {podeMexer && (
            <span className="cliente__botoes">
              <button type="button" onClick={aoEditar} aria-label={`Editar ${cliente.nome}`} title="Editar">
                <Icone.lapis />
              </button>
              <button type="button" onClick={aoApagar} aria-label={`Apagar ${cliente.nome}`} title="Apagar">
                <Icone.lixo />
              </button>
            </span>
          )}

          <button type="button" className="cliente__ver" onClick={aoVer}>
            Ver no quadro
          </button>
        </CutoutCardFooter>
          </div>
        </div>
      </CutoutCard>
    </li>
  )
}
