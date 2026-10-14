import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as dados from '@/services/dadosService'
import * as equipeApi from '@/services/equipeService'
import * as roteiroApi from '@/services/roteiroService'
import { comCarga } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { corAdaptada, corSuave, textoSobre } from '@/utils/cor'
import { hojeISO } from '@/utils/formato'
import { podeFazer } from '@/domain/permissoes'
import {
  aplicarRegraDosGases,
  chaveDoCargo,
  ensaiosDeGases,
  estadoDaEtapa,
  etapaAtual,
  obraFechada,
  podeEditarCheck,
  progressoDaObra,
  progressoExecucao,
  prontaParaConcluir as roteiroCompleto,
  roteiroVigente,
  setoresPendentes,
} from '@/domain/obras'

/**
 * Estado compartilhado do sistema — e o unico lugar que fala com a API.
 *
 * Tudo aqui e gravado no banco na hora: nao ha "salvar" para clicar nem
 * copia no localStorage. Cada acao muda a tela primeiro (para nao ficar
 * travada esperando a rede) e, se o servidor recusar, desfaz e conta o
 * motivo em `erro`.
 */
const DadosContext = createContext(null)

/* Os termos que a empresa troca pela tela. Os valores daqui são a
   reserva de enquanto a carga não voltou (e de quem ainda não rodou
   db/atualizacao-3.sql.txt): o sistema diz "Etapa" em vez de piscar
   um campo vazio. */
const TERMOS_PADRAO = { termo_etapa: 'Etapa', termo_etapas: 'Etapas' }

/** Uma carga do servidor ({ quadro, equipe, roteiro }) no formato do estado. */
const doServidor = (c, clientes, usuarios) => ({
  clientes,
  setores: c.quadro?.setores ?? [],
  obras: c.quadro?.obras ?? [],
  observacoesQuadro: c.quadro?.observacoesQuadro ?? [],
  etiquetas: c.quadro?.etiquetas ?? [],
  ensaios: c.quadro?.ensaios ?? [],
  termos: { ...TERMOS_PADRAO, ...(c.quadro?.termos ?? {}) },
  cargos: c.equipe?.cargos ?? [],
  titulos: c.equipe?.titulos ?? [],
  equipe: usuarios,
  roteiro: c.roteiro ?? [],
})

const INICIAL = {
  clientes: [],
  setores: [],
  obras: [],
  observacoesQuadro: [],
  etiquetas: [],
  ensaios: [],
  cargos: [],
  titulos: [],
  equipe: [],
  roteiro: [],
  termos: TERMOS_PADRAO,
}

export function DadosProvider({ children }) {
  const { user, isAuthenticated } = useAuth()
  const { isDark } = useTheme()
  const [estado, setEstado] = useState(INICIAL)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  /* a carga inicial pode voltar depois de sair da tela; o contador
     descarta resposta de uma carga que ja nao vale mais */
  const carga = useRef(0)

  const limparErro = useCallback(() => setErro(''), [])

  /* o estado de agora, para a carga reaproveitar as imagens que ja estao
     na tela sem esperar o proximo render */
  const estadoAgora = useRef(estado)
  estadoAgora.current = estado

  /* a primeira carga de cada sessao traz as imagens; as outras sao leves */
  const jaTemImagens = useRef(false)

  /**
   * Busca as logos/capas e as fotos que faltam e poe cada uma no lugar
   * — so se a versao ainda for a mesma (se mudou de novo no caminho, a
   * proxima carga busca a nova). Falhando, a tela segue com as iniciais.
   */
  const buscarImagens = useCallback(async (faltam) => {
    try {
      const veio = await dados.carregarImagens(faltam)
      const logos = new Map((veio.clientes ?? []).map((x) => [x.id, x]))
      const fotos = new Map((veio.usuarios ?? []).map((x) => [x.id, x]))
      setEstado((atual) => ({
        ...atual,
        clientes: atual.clientes.map((cli) => {
          const l = logos.get(cli.id)
          return l && l.imagemVersao === cli.imagemVersao ? { ...cli, logo: l.logo, capa: l.capa } : cli
        }),
        equipe: atual.equipe.map((u) => {
          const f = fotos.get(u.id)
          return f && f.fotoVersao === u.fotoVersao ? { ...u, foto: f.foto } : u
        }),
      }))
    } catch {
      /* sem a imagem a tela mostra as iniciais; a proxima carga tenta de novo */
    }
  }, [])

  /**
   * Poe uma carga ({ quadro, equipe, roteiro }, server/carga.js) na tela.
   *
   * A carga LEVE vem sem as imagens, so com a versao delas: o cliente e
   * a pessoa cuja versao bate com a de agora continuam com a logo e a
   * foto que ja tinham. Os que mudaram (ou sao novos) ficam sem imagem
   * por um instante e sao buscados em seguida, numa chamada so.
   */
  const aplicarCarga = useCallback(
    (c) => {
      const agora = estadoAgora.current
      const clienteDe = new Map(agora.clientes.map((x) => [x.id, x]))
      const pessoaDe = new Map(agora.equipe.map((x) => [x.id, x]))
      const faltam = { clientes: [], usuarios: [] }

      const clientes = (c.quadro?.clientes ?? []).map((cli) => {
        if ('logo' in cli) return cli
        const antes = clienteDe.get(cli.id)
        if (antes && 'logo' in antes && antes.imagemVersao === cli.imagemVersao) {
          return { ...cli, logo: antes.logo, capa: antes.capa }
        }
        faltam.clientes.push(cli.id)
        return cli
      })
      const usuarios = (c.equipe?.usuarios ?? []).map((u) => {
        if ('foto' in u) return u
        const antes = pessoaDe.get(u.id)
        if (antes && 'foto' in antes && antes.fotoVersao === u.fotoVersao) return { ...u, foto: antes.foto }
        faltam.usuarios.push(u.id)
        return u
      })

      /* uma releitura que ainda esteja no caminho ja nao vale: esta e mais nova */
      carga.current += 1
      setEstado(doServidor(c, clientes, usuarios))
      setErro('')
      setCarregando(false)
      if (faltam.clientes.length || faltam.usuarios.length) buscarImagens(faltam)
    },
    [buscarImagens],
  )

  /**
   * Le tudo de novo do banco, numa chamada so (GET /api/carga). A
   * primeira leitura da sessao traz as imagens; as outras sao leves.
   */
  const recarregar = useCallback(async () => {
    const minha = (carga.current += 1)
    try {
      const c = await dados.carregarCarga({ imagens: !jaTemImagens.current })
      if (minha !== carga.current) return
      jaTemImagens.current = true
      aplicarCarga(c)
    } catch (e) {
      if (minha !== carga.current) return
      setErro(e.message)
      setCarregando(false)
    }
  }, [aplicarCarga])

  useEffect(() => {
    if (!isAuthenticated) {
      jaTemImagens.current = false
      setEstado(INICIAL)
      setCarregando(false)
      return
    }
    setCarregando(true)
    recarregar()
  }, [isAuthenticated, recarregar])

  /**
   * Grava no banco e poe na tela o que ficou gravado. Se der errado, o
   * recado sobe para a tela e o estado volta a ser o do banco — nunca
   * fica um meio-termo.
   *
   * A releitura vem JUNTO da resposta da gravacao (`comCarga`, ver
   * src/services/api.js): uma ida ao servidor, e nao seis. So quando
   * ela nao vem (rota que responde sem corpo) e que a tela rele a parte.
   */
  const gravar = useCallback(
    async (acao) => {
      try {
        const { resposta, carga: veio } = await comCarga(acao)
        if (veio) aplicarCarga(veio)
        else await recarregar()
        return resposta
      } catch (e) {
        setErro(e.message)
        await recarregar()
        throw e
      }
    },
    [recarregar, aplicarCarga],
  )

  /* ============================================================
     Permissoes

     `pode('editar_obras')` e a pergunta que as telas fazem antes
     de mostrar um botao. A resposta sai do cargo de quem esta
     logado; a API repete a mesma checagem antes de gravar.
     ============================================================ */

  const pode = useCallback((chave) => podeFazer(user, chave), [user])

  /* ============================================================
     Cargos
     ============================================================ */

  const adicionarCargo = useCallback(
    (campos) => gravar(() => equipeApi.criarCargo(campos)),
    [gravar],
  )

  const atualizarCargo = useCallback(
    (id, campos) => gravar(() => equipeApi.editarCargo(id, campos)),
    [gravar],
  )

  const removerCargo = useCallback((id) => gravar(() => equipeApi.apagarCargo(id)), [gravar])

  const cargoPorChave = useCallback(
    (chave) => estado.cargos.find((c) => c.chave === chave) ?? null,
    [estado.cargos],
  )

  /**
   * Cor do cargo JA ajustada ao tema: cor escura demais clareia no modo
   * escuro, cor clara demais escurece no claro. O banco continua com a
   * cor que a pessoa escolheu — o ajuste e so na hora de pintar.
   */
  const corDoCargo = useCallback(
    (chave) => corAdaptada(cargoPorChave(chave)?.cor ?? '#6b7280', isDark),
    [cargoPorChave, isDark],
  )

  /**
   * A cor do setor em versao SUAVE (menos saturada, claridade presa ao
   * tema). E a que pinta contorno e texto dos cards de check e as
   * etiquetas de setor do quadro — nada de fundo chapado ali.
   */
  const corSuaveDoCargo = useCallback(
    (chave) => corSuave(cargoPorChave(chave)?.cor ?? '#6b7280', isDark),
    [cargoPorChave, isDark],
  )

  /** Preto ou branco por cima da cor do cargo, o que der para ler. */
  const corDoTextoNoCargo = useCallback(
    (chave) => textoSobre(cargoPorChave(chave)?.cor ?? '#6b7280', isDark),
    [cargoPorChave, isDark],
  )

  const nomeDoCargo = useCallback(
    (chave) => cargoPorChave(chave)?.nome ?? chave,
    [cargoPorChave],
  )

  /* ============================================================
     Cargos da equipe (o titulo da pessoa dentro do setor)

     Cadastro proprio, sem cor e sem permissao nenhuma. Quem mexe
     nele — e quem ATRIBUI um cargo a alguem — precisa de
     `editar_cargo_titulo`; a API confere de novo antes de gravar.
     ============================================================ */

  const adicionarTitulo = useCallback(
    (campos) => gravar(() => equipeApi.criarTitulo(campos)),
    [gravar],
  )

  const atualizarTitulo = useCallback(
    (id, campos) => gravar(() => equipeApi.editarTitulo(id, campos)),
    [gravar],
  )

  const removerTitulo = useCallback((id) => gravar(() => equipeApi.apagarTitulo(id)), [gravar])

  const tituloPorId = useCallback(
    (id) => estado.titulos.find((t) => String(t.id) === String(id)) ?? null,
    [estado.titulos],
  )

  /* ============================================================
     Clientes
     ============================================================ */

  const adicionarCliente = useCallback(
    (campos) => gravar(() => dados.criarCliente(campos)),
    [gravar],
  )

  const atualizarCliente = useCallback(
    (id, campos) => gravar(() => dados.editarCliente(id, campos)),
    [gravar],
  )

  const removerCliente = useCallback((id) => gravar(() => dados.apagarCliente(id)), [gravar])

  /* ---------------- Setores do cliente ---------------- */

  const adicionarSetor = useCallback((campos) => gravar(() => dados.criarSetor(campos)), [gravar])

  const atualizarSetor = useCallback(
    (id, campos) => gravar(() => dados.editarSetor(id, campos)),
    [gravar],
  )

  const removerSetor = useCallback((id) => gravar(() => dados.apagarSetor(id)), [gravar])

  const setorPorId = useCallback(
    (id) => estado.setores.find((s) => String(s.id) === String(id)) ?? null,
    [estado.setores],
  )

  /* ---------------- Chat do site ---------------- */

  const carregarChatDoSite = useCallback(() => dados.carregarChatDoSite(), [])

  /* campos: { texto, arquivo?, respondeA?, mencoes? } — os mesmos do
     chat da obra, porque as duas conversas usam a mesma caixa */
  const enviarNoChatDoSite = useCallback(
    (campos) => dados.enviarNoChatDoSite({ ...campos, autorNome: user?.name }),
    [user?.name],
  )

  const apagarDoChatDoSite = useCallback(
    (id, escopo = 'mim') => dados.apagarDoChatDoSite(id, escopo),
    [],
  )

  /* ============================================================
     Obras
     ============================================================ */

  const adicionarObra = useCallback((campos) => gravar(() => dados.criarObra(campos)), [gravar])

  const atualizarObra = useCallback(
    (id, campos) => gravar(() => dados.editarObra(id, campos)),
    [gravar],
  )

  const removerObra = useCallback((id) => gravar(() => dados.apagarObra(id)), [gravar])

  /**
   * Encerra a obra: e o clique em "Concluir obra".
   *
   * Marcar o ultimo check NAO fecha mais a obra sozinho — so faz o botao
   * aparecer. Fechar e uma decisao, com dupla confirmacao na tela, e o
   * que carimba quem fechou, quando e a observacao (opcional).
   */
  const concluirObra = useCallback(
    (id, observacao) => gravar(() => dados.concluirObra(id, observacao)),
    [gravar],
  )

  /**
   * Marca/desmarca um check.
   *
   * Este e o clique mais repetido do sistema, entao a tela muda na hora
   * e a gravacao vai atras. Se o servidor recusar (rede fora), recarrega
   * e o check volta como estava.
   *
   * Antes de mexer em qualquer coisa, porem, a mesma pergunta que o
   * servidor vai fazer: este check e seu? Sem esta guarda, um check de
   * outro setor MARCAVA na tela e desmarcava sozinho meio segundo
   * depois, quando a recusa chegava — que era exatamente o piscar que
   * fazia parecer defeito. Agora nao chega a piscar: nem sai do lugar.
   */
  const alternarCheck = useCallback(
    async (obraId, checkId) => {
      const obra = estado.obras.find((o) => o.id === obraId)
      if (!obra) return

      // obra encerrada e registro: nada mais entra nela
      if (obraFechada(obra)) {
        setErro('Esta obra foi concluída. O conteúdo dela fica só para consulta.')
        return
      }

      /* o roteiro que ESTA obra enxerga — o mesmo que a tela desenhou */
      const meuRoteiro = roteiroVigente(estado.roteiro, obra.criadoEm, obra)
      const card = meuRoteiro
        .flatMap((e) => e.cards)
        .find((c) => c.checks.some((k) => String(k.id) === String(checkId)))
      const check = card?.checks.find((k) => String(k.id) === String(checkId))

      if (check && !podeEditarCheck(user, check, card, obra)) {
        setErro('Este check é de outro setor.')
        return
      }

      const marcando = !obra.checks[checkId]

      setEstado((atual) => ({
        ...atual,
        obras: atual.obras.map((o) => {
          if (o.id !== obraId) return o
          const checks = { ...o.checks }
          if (marcando) checks[checkId] = { feitoPor: String(user?.id ?? ''), feitoEm: new Date().toISOString() }
          else delete checks[checkId]
          return { ...o, checks }
        }),
      }))

      try {
        /* o banco calcula membros e conclusao por gatilho: a carga que
           volta junto deixa os avatares e a tela de Concluidas certos */
        const { carga: veio } = await comCarga(() =>
          marcando ? dados.marcarCheck(obraId, checkId) : dados.desmarcarCheck(obraId, checkId),
        )
        if (veio) aplicarCarga(veio)
        else await recarregar()
      } catch (e) {
        setErro(e.message)
        await recarregar()
      }
    },
    [estado.obras, estado.roteiro, user, recarregar, aplicarCarga],
  )

  /**
   * Marca o check de um card de PERGUNTA com a resposta (true = sim,
   * false = nao) — ou troca a resposta de um ja marcado. Desmarcar
   * continua sendo `alternarCheck`.
   *
   * Mesma ida otimista do alternarCheck: a tela muda na hora e o
   * recarregar corrige se o servidor recusar.
   */
  const responderCheck = useCallback(
    async (obraId, checkId, resposta) => {
      const obra = estado.obras.find((o) => o.id === obraId)
      if (!obra) return
      if (obraFechada(obra)) {
        setErro('Esta obra foi concluída. O conteúdo dela fica só para consulta.')
        return
      }

      setEstado((atual) => ({
        ...atual,
        obras: atual.obras.map((o) => {
          if (o.id !== obraId) return o
          const antes = o.checks[checkId]
          return {
            ...o,
            checks: {
              ...o.checks,
              [checkId]: {
                feitoPor: antes?.feitoPor ?? String(user?.id ?? ''),
                feitoEm: antes?.feitoEm ?? new Date().toISOString(),
                resposta,
              },
            },
          }
        }),
      }))

      try {
        const { carga: veio } = await comCarga(() => dados.marcarCheck(obraId, checkId, resposta))
        if (veio) aplicarCarga(veio)
        else await recarregar()
      } catch (e) {
        setErro(e.message)
        await recarregar()
      }
    },
    [estado.obras, user, recarregar, aplicarCarga],
  )

  /** Prazo de uma etapa ({ etapaId }) ou de um check ({ checkId }); prazo vazio tira. */
  const definirPrazo = useCallback(
    (obraId, campos) => gravar(() => dados.definirPrazo(obraId, campos)),
    [gravar],
  )

  /* ============================================================
     Execucao e ENSAIOS

     O periodo de execucao (entrada em campo -> prazo da execucao), o
     Planejamento de ensaios (quais ensaios a obra vai fazer) e a
     execucao dia a dia (ensaio + dia + percentual). As regras
     moram no servidor; aqui so grava e recarrega.
     ============================================================ */

  /** { dias } — os dias da execucao ('AAAA-MM-DD'); o ultimo e o prazo dela. */
  const definirExecucao = useCallback(
    (obraId, campos) => gravar(() => dados.definirExecucao(obraId, campos)),
    [gravar],
  )

  /** A lista de ids na ordem escolhida; `concluir` ja marca o check. */
  const planejarEnsaios = useCallback(
    (obraId, ensaioIds, concluir) => gravar(() => dados.planejarEnsaios(obraId, ensaioIds, concluir)),
    [gravar],
  )

  /** Um dia: valores = [{ ensaioId, percentual }], percentual null apaga. */
  const registrarExecucaoDia = useCallback(
    (obraId, dia, valores) => gravar(() => dados.registrarExecucaoDia(obraId, dia, valores)),
    [gravar],
  )

  const adicionarEnsaio = useCallback((campos) => gravar(() => dados.criarEnsaio(campos)), [gravar])
  const atualizarEnsaio = useCallback(
    (id, campos) => gravar(() => dados.editarEnsaio(id, campos)),
    [gravar],
  )
  const removerEnsaio = useCallback((id) => gravar(() => dados.apagarEnsaio(id)), [gravar])

  const ensaioPorId = useCallback(
    (id) => estado.ensaios.find((e) => String(e.id) === String(id)) ?? null,
    [estado.ensaios],
  )

  /** O catalogo que ainda vale (o que saiu continua so nas obras que o tinham). */
  const ensaiosAtivos = useMemo(() => estado.ensaios.filter((e) => e.ativo), [estado.ensaios])

  /** O andamento da execucao dos ensaios desta obra (ver progressoExecucao). */
  const execucaoDaObra = useCallback(
    (obra) => progressoExecucao(obra, (id) => ensaioPorId(id)?.nome ?? 'Ensaio removido'),
    [ensaioPorId],
  )

  /* ---------------- Observacoes da obra ---------------- */

  const adicionarObservacao = useCallback(
    (obraId, campos) =>
      gravar(() =>
        dados.criarObservacao(obraId, {
          texto: campos.texto,
          autorNome: campos.autorNome ?? user?.name,
        }),
      ),
    [gravar, user?.name],
  )

  /** Cada um edita so a propria: a API confere de novo antes de gravar. */
  const editarObservacao = useCallback(
    (obraId, obsId, texto) => gravar(() => dados.editarObservacao(obraId, obsId, texto)),
    [gravar],
  )

  const removerObservacao = useCallback(
    (obraId, obsId) => gravar(() => dados.apagarObservacao(obraId, obsId)),
    [gravar],
  )

  /* ---------------- Observacoes do quadro ---------------- */

  /* campos: { texto, inicioEm?, fimEm? } — as duas datas juntas dao a
     DURACAO da observacao; sem elas ela vale ate alguem apagar */
  const adicionarObservacaoQuadro = useCallback(
    (campos) =>
      gravar(() => dados.criarObservacaoQuadro({ ...campos, autorNome: user?.name })),
    [gravar, user?.name],
  )

  const editarObservacaoQuadro = useCallback(
    (id, campos) => gravar(() => dados.editarObservacaoQuadro(id, campos)),
    [gravar],
  )

  const removerObservacaoQuadro = useCallback(
    (id) => gravar(() => dados.apagarObservacaoQuadro(id)),
    [gravar],
  )

  /* ---------------- Avisos ---------------- */

  const registrarAviso = useCallback(
    (obraId, { setores, mensagem, etapa }) =>
      gravar(() => dados.criarAviso(obraId, { setores, mensagem, etapa })),
    [gravar],
  )

  /**
   * Os avisos que chegaram para o SETOR de quem esta logado, do mais
   * novo para o mais antigo. E o que o sininho mostra.
   *
   * A regra e estrita: chega so o que foi endereçado ao seu setor. Quem
   * e da Excelencia nao recebe a cobranca de um check pendente do
   * Comercial — nao ha nada que essa pessoa possa fazer a respeito, e
   * um sininho cheio de aviso de outro setor e um sininho que ninguem
   * mais abre.
   *
   * Isso vale INCLUSIVE para a diretoria. Antes o acesso total trazia
   * tudo, e o sino dela virava o despejo do quadro inteiro; quem quer
   * ver o que falta em cada setor tem a coluna de pendencias na tela de
   * Obras, que mostra a mesma coisa organizada.
   *
   * A unica excecao e o aviso sem setor nenhum: esse e recado para a
   * empresa toda e chega para todo mundo.
   */
  const minhasNotificacoes = useMemo(() => {
    const meuSetor = chaveDoCargo(user)
    const lista = []

    estado.obras.forEach((obra) => {
      obra.avisos?.forEach((aviso) => {
        const alvos = aviso.setores ?? []
        const paraMim = alvos.length === 0 || alvos.includes(meuSetor)
        if (!paraMim) return
        lista.push({
          ...aviso,
          obraId: obra.id,
          obraTipo: obra.tipo,
          clienteId: obra.clienteId,
          proposta: obra.proposta,
          descricao: obra.descricao,
        })
      })
    })

    return lista.sort((a, b) => String(b.enviadoEm).localeCompare(String(a.enviadoEm)))
  }, [estado.obras, user])

  const naoLidas = useMemo(
    () => minhasNotificacoes.filter((a) => !a.lido).length,
    [minhasNotificacoes],
  )

  /** Zera o selo. Muda a tela na hora; a gravacao vai atras. */
  const marcarNotificacoesLidas = useCallback(
    async (ids) => {
      const alvos = ids ?? minhasNotificacoes.filter((a) => !a.lido).map((a) => a.id)
      if (alvos.length === 0) return

      setEstado((atual) => ({
        ...atual,
        obras: atual.obras.map((o) => ({
          ...o,
          avisos: (o.avisos ?? []).map((a) => (alvos.includes(a.id) ? { ...a, lido: true } : a)),
        })),
      }))

      try {
        await dados.marcarAvisosLidos(alvos)
      } catch {
        /* o selo volta na proxima leitura; nao vale interromper a tela */
      }
    },
    [minhasNotificacoes],
  )

  /* ---------------- Avaliacoes da obra ----------------
     Sao varias por obra (diretor, cliente, ...). A media delas e o
     que vale para a obra e para quem participou. */

  const adicionarAvaliacao = useCallback(
    (obraId, campos) => gravar(() => dados.criarAvaliacao(obraId, campos)),
    [gravar],
  )

  const atualizarAvaliacao = useCallback(
    (id, campos) => gravar(() => dados.editarAvaliacao(id, campos)),
    [gravar],
  )

  const removerAvaliacao = useCallback((id) => gravar(() => dados.apagarAvaliacao(id)), [gravar])

  const limparAvaliacao = useCallback(
    (obraId) => gravar(() => dados.limparAvaliacao(obraId)),
    [gravar],
  )

  /* ---------------- Etiquetas ---------------- */

  const marcarEtiqueta = useCallback(
    (obraId, campos) => gravar(() => dados.marcarEtiqueta(obraId, campos)),
    [gravar],
  )

  const atualizarEtiqueta = useCallback(
    (id, campos) => gravar(() => dados.editarEtiqueta(id, campos)),
    [gravar],
  )

  const tirarEtiqueta = useCallback(
    (obraId, etiquetaId) => gravar(() => dados.tirarEtiqueta(obraId, etiquetaId)),
    [gravar],
  )

  const etiquetaPorId = useCallback(
    (id) => estado.etiquetas.find((e) => String(e.id) === String(id)) ?? null,
    [estado.etiquetas],
  )

  /** As etiquetas de uma obra, ja resolvidas em { id, nome, cor }. */
  const etiquetasDaObra = useCallback(
    (obra) => (obra?.etiquetas ?? []).map(etiquetaPorId).filter(Boolean),
    [etiquetaPorId],
  )

  /* ---------------- Etiquetas do CARD ----------------

     Catalogo a parte. A etiqueta da obra diz o que a obra e; a do
     card diz o que aquele pedaco do roteiro e. Juntas num catalogo
     so, a sugestao de uma apareceria na outra e uma renomeada de um
     lado mexeria no outro sem ninguem pedir.

     Elas ja vem DENTRO do card no /roteiro (nao ha lista solta a
     resolver por id, como nas obras), e por isso nao ha um
     `etiquetaCardPorId`. */

  const etiquetarCard = useCallback(
    (cardId, campos) => gravar(() => roteiroApi.etiquetarCard(cardId, campos)),
    [gravar],
  )

  const atualizarEtiquetaCard = useCallback(
    (id, campos) => gravar(() => roteiroApi.editarEtiquetaCard(id, campos)),
    [gravar],
  )

  const tirarEtiquetaCard = useCallback(
    (cardId, etiquetaId) => gravar(() => roteiroApi.tirarEtiquetaCard(cardId, etiquetaId)),
    [gravar],
  )

  /**
   * Todas as etiquetas de card ja usadas, para a lista de sugestoes.
   *
   * Sai do proprio roteiro carregado — nao ha rota de catalogo: uma
   * etiqueta que ninguem colou em card nenhum nao tem para que ser
   * sugerida.
   */
  const etiquetasDeCard = useMemo(() => {
    const vistas = new Map()
    ;(estado.roteiro ?? []).forEach((etapa) =>
      (etapa.cards ?? []).forEach((card) =>
        (card.etiquetas ?? []).forEach((e) => vistas.set(String(e.id), e)),
      ),
    )
    return [...vistas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [estado.roteiro])

  /* ---------------- Anexos ---------------- */

  const adicionarAnexo = useCallback(
    (obraId, campos) =>
      gravar(() => dados.criarAnexo(obraId, { ...campos, autorNome: user?.name })),
    [gravar, user?.name],
  )

  /* o conteudo nao vem na carga do quadro: e buscado so no clique */
  const baixarAnexo = useCallback((id) => dados.baixarAnexo(id), [])

  const removerAnexo = useCallback((id) => gravar(() => dados.apagarAnexo(id)), [gravar])

  /* ---------------- Chat da obra ----------------
     Nao entra na carga geral: a conversa e buscada quando o
     pop-up abre, e cresce sozinha dali em diante. */

  const carregarChat = useCallback((obraId) => dados.carregarChat(obraId), [])

  const enviarMensagem = useCallback(
    (obraId, campos) =>
      dados.enviarMensagem(obraId, { ...campos, autorNome: user?.name }).catch((e) => {
        setErro(e.message)
        throw e
      }),
    [user?.name],
  )

  /**
   * Apaga uma mensagem do chat.
   *
   * `escopo` diz para quem: 'todos' tira da conversa de todo mundo e
   * deixa "mensagem apagada" no lugar dela; 'mim' some só da tela de
   * quem pediu e não muda nada para os outros.
   */
  const apagarMensagem = useCallback(
    (obraId, mensagemId, escopo = 'mim') =>
      dados.apagarMensagem(obraId, mensagemId, escopo).catch((e) => {
        setErro(e.message)
        throw e
      }),
    [],
  )

  /* ============================================================
     Termos da empresa

     Hoje e so um: como se chama "Etapa". Amanha o roteiro pode
     virar Fase, Marco ou Frente, e e daqui que TODA tela que
     escreve "3ª Etapa" vai buscar a palavra.

     `rotuloEtapa(3)` -> "3ª Etapa" e o que as telas usam; ele
     existe para que a concordancia (o "ª") fique num lugar so.
     ============================================================ */

  const termos = estado.termos ?? TERMOS_PADRAO

  const termoEtapa = termos.termo_etapa || TERMOS_PADRAO.termo_etapa
  const termoEtapas = termos.termo_etapas || TERMOS_PADRAO.termo_etapas

  const rotuloEtapa = useCallback((numero) => `${numero}ª ${termoEtapa}`, [termoEtapa])

  const salvarTermos = useCallback(
    (campos) => gravar(() => dados.salvarTermos(campos)),
    [gravar],
  )

  /* ============================================================
     Equipe
     ============================================================ */

  const adicionarPessoa = useCallback(
    (campos) => gravar(() => equipeApi.criarUsuario(campos)),
    [gravar],
  )

  const atualizarPessoa = useCallback(
    (id, campos) => gravar(() => equipeApi.editarUsuario(id, campos)),
    [gravar],
  )

  const removerPessoa = useCallback((id) => gravar(() => equipeApi.apagarUsuario(id)), [gravar])

  /* ============================================================
     Roteiro (etapas, cards e checks)

     Toda alteracao leva o `obraId` de onde ela partiu: e assim
     que a mudanca vale para esta obra e para as proximas, sem
     nunca mexer nas que ja passaram.
     ============================================================ */

  /* campos: { nome, descricao? } — a descricao e a linha de apoio que
     aparece embaixo do nome no card da etapa */
  const adicionarEtapa = useCallback(
    (campos, obraId) => gravar(() => roteiroApi.criarEtapa({ ...campos, obraId })),
    [gravar],
  )

  const editarEtapa = useCallback(
    (id, campos) => gravar(() => roteiroApi.editarEtapa(id, campos)),
    [gravar],
  )

  const removerEtapa = useCallback(
    (id, obraId) => gravar(() => roteiroApi.apagarEtapa(id, obraId)),
    [gravar],
  )

  const adicionarCard = useCallback(
    (etapaId, campos) => gravar(() => roteiroApi.criarCard(etapaId, campos)),
    [gravar],
  )

  const atualizarCard = useCallback(
    (id, campos) => gravar(() => roteiroApi.editarCard(id, campos)),
    [gravar],
  )

  const removerCard = useCallback(
    (id, obraId) => gravar(() => roteiroApi.apagarCard(id, obraId)),
    [gravar],
  )

  const adicionarCheck = useCallback(
    (cardId, campos) => gravar(() => roteiroApi.criarCheck(cardId, campos)),
    [gravar],
  )

  const atualizarCheck = useCallback(
    (id, campos) => gravar(() => roteiroApi.editarCheck(id, campos)),
    [gravar],
  )

  const removerCheck = useCallback(
    (id, obraId) => gravar(() => roteiroApi.apagarCheck(id, obraId)),
    [gravar],
  )

  /* arrastar: a fila do card de destino, na ordem nova (ver arrasteChecks.js) */
  const ordenarChecks = useCallback(
    (cardId, checkIds, obraId) => gravar(() => roteiroApi.ordenarChecks(cardId, checkIds, obraId)),
    [gravar],
  )

  /* ============================================================
     A equipe que as telas enxergam

     E a do banco. O usuario logado entra na frente so se, por algum
     motivo, ele nao vier na lista (cadastro inativo, por exemplo) —
     senao ele sumiria da propria tela de Usuarios.
     ============================================================ */

  const equipe = useMemo(() => {
    const lista = estado.equipe.map((p) =>
      String(p.id) === String(user?.id) ? { ...p, souEu: true } : p,
    )
    if (!user || lista.some((p) => p.souEu)) return lista
    return [
      {
        id: String(user.id),
        nome: user.name,
        email: user.email,
        telefone: user.telefone ?? null,
        cargo: chaveDoCargo(user),
        cargoNome: user.cargoNome ?? user.cargo,
        foto: user.foto ?? null,
        acessoTotal: Boolean(user.acessoTotal),
        souEu: true,
      },
      ...lista,
    ]
  }, [estado.equipe, user])

  /* ============================================================
     Regras do roteiro, ja amarradas ao roteiro carregado.

     Cada obra le o roteiro que valia quando ela nasceu — e por isso
     que tudo aqui passa por `roteiroDaObra` antes de decidir
     qualquer coisa. Uma obra de marco nao ganha o check criado em
     maio, e continua concluida.
     ============================================================ */

  const { roteiro: roteiroBruto } = estado

  /**
   * O roteiro como esta obra o enxerga (com as etapas renumeradas) — e
   * com o check "Material de gases" obrigatorio so se ela tem ensaio de
   * gases planejado (aplicarRegraDosGases).
   */
  const roteiroDaObra = useCallback(
    (obra) =>
      aplicarRegraDosGases(
        roteiroVigente(roteiroBruto, obra?.criadoEm, obra),
        ensaiosDeGases(obra, ensaioPorId),
      ),
    [roteiroBruto, ensaioPorId],
  )

  /** O roteiro que vale HOJE — para telas que nao falam de uma obra so. */
  const roteiro = useMemo(() => roteiroVigente(roteiroBruto), [roteiroBruto])

  /**
   * A obra esta ENCERRADA?
   *
   * Le o carimbo do banco (obra.concluidaEm), nao a contagem de checks.
   * Sao perguntas diferentes desde que a conclusao virou um clique:
   * marcar tudo apenas libera o botao "Concluir obra"; quem tira a obra
   * do quadro e o clique nele.
   */
  const concluida = useCallback((obra) => obraFechada(obra), [])

  /**
   * Ja da para concluir? E o que faz o botao aparecer ao lado do
   * Progresso: obra aberta, com roteiro, e sem nenhum check em aberto.
   *
   * A conta em si mora no dominio; aqui ela so ganha o roteiro que ESTA
   * obra enxerga — uma obra de marco nao e cobrada pelo check criado em
   * maio, e continua podendo ser concluida.
   */
  const prontaParaConcluir = useCallback(
    (obra) => roteiroCompleto(roteiroDaObra(obra), obra),
    [roteiroDaObra],
  )

  const etapaDaObra = useCallback(
    (obra) => etapaAtual(roteiroDaObra(obra), obra?.checks),
    [roteiroDaObra],
  )

  const progresso = useCallback(
    (obra) => progressoDaObra(roteiroDaObra(obra), obra?.checks),
    [roteiroDaObra],
  )

  const pendentesDaObra = useCallback(
    (obra, numero) => {
      const meu = roteiroDaObra(obra)
      return setoresPendentes(meu, obra?.checks, numero ?? etapaAtual(meu, obra?.checks))
    },
    [roteiroDaObra],
  )

  const estadoEtapa = useCallback(
    (obra, numero) => estadoDaEtapa(roteiroDaObra(obra), obra, numero),
    [roteiroDaObra],
  )

  /* ============================================================
     Media do usuario: a nota das obras avaliadas em que ele
     participou. Duas obras com 8 e 5 dao 6.5. Sem obra avaliada,
     a nota e null ("sem avaliacao").

     A nota de cada obra ja e a MEDIA das avaliacoes dela (diretor,
     cliente, ...) — quem calcula isso e o servidor.
     ============================================================ */

  const mediasPorUsuario = useMemo(() => {
    const acumulado = {}
    estado.obras.forEach((obra) => {
      if (!obra.avaliacao) return
      obra.membros.forEach((id) => {
        const atual = acumulado[id] ?? { soma: 0, quantas: 0 }
        atual.soma += Number(obra.avaliacao.nota)
        atual.quantas += 1
        acumulado[id] = atual
      })
    })
    return Object.fromEntries(
      Object.entries(acumulado).map(([id, { soma, quantas }]) => [
        id,
        { media: Math.round((soma / quantas) * 10) / 10, obrasAvaliadas: quantas },
      ]),
    )
  }, [estado.obras])

  const mediaDoUsuario = useCallback(
    (id) => mediasPorUsuario[String(id)] ?? { media: null, obrasAvaliadas: 0 },
    [mediasPorUsuario],
  )

  /* ---------------- Consultas ---------------- */

  const clientePorId = useCallback(
    (id) => estado.clientes.find((c) => String(c.id) === String(id)) ?? null,
    [estado.clientes],
  )

  const pessoaPorId = useCallback(
    (id) => equipe.find((p) => String(p.id) === String(id)) ?? null,
    [equipe],
  )

  const obraPorId = useCallback(
    (id) => estado.obras.find((o) => String(o.id) === String(id)) ?? null,
    [estado.obras],
  )

  /** Em que obras a pessoa esta, das que ainda nao fecharam. */
  const obrasDaPessoa = useCallback(
    (id) =>
      estado.obras
        .filter((o) => o.membros.map(String).includes(String(id)) && !concluida(o))
        .map((o) => ({ obra: o, cliente: clientePorId(o.clienteId) })),
    [estado.obras, clientePorId, concluida],
  )

  /* ============================================================
     Observacoes do quadro: as que valem HOJE e as que venceram

     A observacao pode ter uma DURACAO ("de 01/09 ate 05/09"). Passada
     a data final, ela sai do painel sozinha — ninguem precisa lembrar
     de voltar la e apagar, que era o que fazia o quadro virar mural de
     recado vencido.

     Ela nao e apagada: vai para o HISTORICO, que a aba do pop-up
     mostra. "O que estava valendo em marco?" e uma pergunta legitima, e
     a resposta sumiria junto com a linha.

     Observacao SEM duracao nunca vence: fica no painel ate alguem
     apagar, como sempre foi. E a apagada na mao nao aparece em lugar
     nenhum — o historico e para o que venceu sozinho; o que a pessoa
     apagou, ela apagou porque nao queria mais ver.

     O corte usa 'AAAA-MM-DD' comparado como texto. Nessa forma a ordem
     alfabetica E a ordem cronologica, entao nao ha Date nem fuso no
     meio para fazer a observacao sumir um dia antes.

     Quem decide a visibilidade e SO a data final. Uma observacao com
     inicio no futuro ("de 10/09 ate 15/09", escrita hoje) aparece
     desde ja, com as duas datas impressas no card. E de proposito: o
     que foi pedido e que ela SUMA na data, e uma observacao que nao
     aparece quando e salva faz o autor achar que nao gravou.
     ============================================================ */

  const hoje = hojeISO()
  const vigente = useCallback((o) => !o.fimEm || o.fimEm >= hoje, [hoje])

  const observacoesQuadro = useMemo(
    () => estado.observacoesQuadro.filter(vigente),
    [estado.observacoesQuadro, vigente],
  )

  /* do que venceu por ultimo para o que venceu primeiro: o historico se
     le de tras para frente, como toda lista de "o que houve" */
  const historicoObservacoes = useMemo(
    () =>
      estado.observacoesQuadro
        .filter((o) => !vigente(o))
        .sort((a, b) => String(b.fimEm).localeCompare(String(a.fimEm))),
    [estado.observacoesQuadro, vigente],
  )

  const valor = useMemo(
    () => ({
      ...estado,
      /* depois do spread de proposito: estas duas SUBSTITUEM a lista
         crua que veio do servidor */
      observacoesQuadro,
      historicoObservacoes,
      roteiro,
      roteiroDaObra,
      equipe,
      carregando,
      erro,
      limparErro,
      recarregar,
      pode,

      adicionarCargo,
      atualizarCargo,
      removerCargo,
      cargoPorChave,
      corDoCargo,
      corSuaveDoCargo,
      corDoTextoNoCargo,
      nomeDoCargo,

      adicionarTitulo,
      atualizarTitulo,
      removerTitulo,
      tituloPorId,

      adicionarCliente,
      atualizarCliente,
      removerCliente,

      adicionarSetor,
      atualizarSetor,
      removerSetor,
      setorPorId,

      carregarChatDoSite,
      enviarNoChatDoSite,
      apagarDoChatDoSite,

      adicionarObra,
      atualizarObra,
      removerObra,
      concluirObra,
      alternarCheck,
      responderCheck,
      definirPrazo,
      definirExecucao,
      planejarEnsaios,
      registrarExecucaoDia,
      adicionarEnsaio,
      atualizarEnsaio,
      removerEnsaio,
      ensaioPorId,
      ensaiosAtivos,
      execucaoDaObra,

      adicionarObservacao,
      editarObservacao,
      removerObservacao,
      adicionarObservacaoQuadro,
      editarObservacaoQuadro,
      removerObservacaoQuadro,

      registrarAviso,
      minhasNotificacoes,
      naoLidas,
      marcarNotificacoesLidas,

      adicionarAvaliacao,
      atualizarAvaliacao,
      removerAvaliacao,
      limparAvaliacao,

      marcarEtiqueta,
      atualizarEtiqueta,
      tirarEtiqueta,
      etiquetaPorId,
      etiquetasDaObra,
      etiquetasDeCard,
      etiquetarCard,
      atualizarEtiquetaCard,
      tirarEtiquetaCard,

      adicionarAnexo,
      baixarAnexo,
      removerAnexo,

      carregarChat,
      enviarMensagem,
      apagarMensagem,

      termoEtapa,
      termoEtapas,
      rotuloEtapa,
      salvarTermos,

      adicionarPessoa,
      atualizarPessoa,
      removerPessoa,

      adicionarEtapa,
      editarEtapa,
      removerEtapa,
      adicionarCard,
      atualizarCard,
      removerCard,
      adicionarCheck,
      atualizarCheck,
      removerCheck,
      ordenarChecks,

      concluida,
      prontaParaConcluir,
      etapaDaObra,
      progresso,
      pendentesDaObra,
      estadoEtapa,

      mediaDoUsuario,
      clientePorId,
      pessoaPorId,
      obraPorId,
      obrasDaPessoa,
    }),
    [
      estado,
      observacoesQuadro,
      historicoObservacoes,
      roteiro,
      roteiroDaObra,
      equipe,
      carregando,
      erro,
      limparErro,
      recarregar,
      pode,
      adicionarCargo,
      atualizarCargo,
      removerCargo,
      cargoPorChave,
      corDoCargo,
      corSuaveDoCargo,
      corDoTextoNoCargo,
      nomeDoCargo,
      adicionarTitulo,
      atualizarTitulo,
      removerTitulo,
      tituloPorId,
      adicionarCliente,
      atualizarCliente,
      removerCliente,
      adicionarSetor,
      atualizarSetor,
      removerSetor,
      setorPorId,
      carregarChatDoSite,
      enviarNoChatDoSite,
      apagarDoChatDoSite,
      adicionarObra,
      atualizarObra,
      removerObra,
      concluirObra,
      alternarCheck,
      responderCheck,
      definirPrazo,
      definirExecucao,
      planejarEnsaios,
      registrarExecucaoDia,
      adicionarEnsaio,
      atualizarEnsaio,
      removerEnsaio,
      ensaioPorId,
      ensaiosAtivos,
      execucaoDaObra,
      adicionarObservacao,
      editarObservacao,
      removerObservacao,
      adicionarObservacaoQuadro,
      editarObservacaoQuadro,
      removerObservacaoQuadro,
      registrarAviso,
      minhasNotificacoes,
      naoLidas,
      marcarNotificacoesLidas,
      adicionarAvaliacao,
      atualizarAvaliacao,
      removerAvaliacao,
      limparAvaliacao,
      marcarEtiqueta,
      atualizarEtiqueta,
      tirarEtiqueta,
      etiquetaPorId,
      etiquetasDaObra,
      etiquetasDeCard,
      etiquetarCard,
      atualizarEtiquetaCard,
      tirarEtiquetaCard,
      adicionarAnexo,
      baixarAnexo,
      removerAnexo,
      carregarChat,
      enviarMensagem,
      apagarMensagem,
      termoEtapa,
      termoEtapas,
      rotuloEtapa,
      salvarTermos,
      adicionarPessoa,
      atualizarPessoa,
      removerPessoa,
      adicionarEtapa,
      editarEtapa,
      removerEtapa,
      adicionarCard,
      atualizarCard,
      removerCard,
      adicionarCheck,
      atualizarCheck,
      removerCheck,
      ordenarChecks,
      concluida,
      prontaParaConcluir,
      etapaDaObra,
      progresso,
      pendentesDaObra,
      estadoEtapa,
      mediaDoUsuario,
      clientePorId,
      pessoaPorId,
      obraPorId,
      obrasDaPessoa,
    ],
  )

  return <DadosContext.Provider value={valor}>{children}</DadosContext.Provider>
}

export function useDados() {
  const ctx = useContext(DadosContext)
  if (!ctx) throw new Error('useDados precisa estar dentro de <DadosProvider>')
  return ctx
}
