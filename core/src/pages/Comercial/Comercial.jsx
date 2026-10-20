import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import Seletor from '@/components/Seletor/Seletor'
import { CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import { useAuth } from '@/context/AuthContext'
import {
  ETIQUETAS,
  FUNIS,
  FUNIL_PADRAO,
  ORDENS,
  ROTULO_SITUACAO,
  ROTULO_STATUS,
  comparar,
  funilPorId,
  rotuloDaEtapa,
  situacaoDaAtividade,
} from '@/domain/comercial'
import * as comercial from '@/services/comercialService'
import { baixarPlanilha } from '@/utils/planilha'
import { hojeISO } from '@/utils/formato'
import QuadroFunil from './QuadroFunil'
import { ListaNegocios, PrevisaoNegocios } from './Visoes'
import ModalNegocio from './ModalNegocio'
import ModalEmail from './ModalEmail'
import ModalImportar from './ModalImportar'
import {
  IconeArquivo,
  IconeCaret,
  IconeExportar,
  IconeFiltro,
  IconeFunil,
  IconeImportar,
  IconeInfo,
  IconeLista,
  IconeMais,
  IconePino,
  IconePrevisao,
  IconeReticencias,
  IconeSetaCima,
} from './icones'
import './Comercial.css'

/* ---------------- o que a tela lembra (so neste navegador) ---------------- */

const GUARDA = 'comercial.tela'

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
  { id: 'previsao', rotulo: 'Previsão', Icone: IconePrevisao },
  { id: 'arquivo', rotulo: 'Arquivados (ganhos e perdidos)', Icone: IconeArquivo },
]

/* as condicoes do "Adicionar condição" */
const CONDICOES = [
  { id: 'texto', rotulo: 'Título, organização ou contato contém' },
  { id: 'etiqueta', rotulo: 'Etiqueta é' },
  { id: 'atividade', rotulo: 'Próxima atividade' },
  { id: 'valorMin', rotulo: 'Valor a partir de (R$)' },
]

const rotuloDaCondicao = (c) => {
  if (c.campo === 'texto') return `contém “${c.valor}”`
  if (c.campo === 'etiqueta') return `etiqueta ${ETIQUETAS.find((e) => e.id === c.valor)?.rotulo.toLowerCase() ?? c.valor}`
  if (c.campo === 'atividade') return ROTULO_SITUACAO[c.valor]?.toLowerCase() ?? c.valor
  if (c.campo === 'valorMin') return `valor ≥ R$ ${Number(c.valor).toLocaleString('pt-BR')}`
  return c.valor
}

function passa(n, c, hoje) {
  if (c.campo === 'texto') {
    const alvo = String(c.valor).toLowerCase()
    return [n.titulo, n.organizacao, n.contatoNome, n.contatoEmail].some((t) => String(t ?? '').toLowerCase().includes(alvo))
  }
  if (c.campo === 'etiqueta') return n.etiqueta === c.valor
  if (c.campo === 'atividade') return situacaoDaAtividade(n.proximaAtividade, hoje) === c.valor
  if (c.campo === 'valorMin') return Number(n.valor) >= Number(c.valor)
  return true
}

/* ---------------- menu suspenso pequeno ---------------- */

function Menu({ rotulo, conteudo, children, classe = '', alinhar = 'esquerda', titulo }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef(null)

  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => {
      if (!caixa.current?.contains(e.target)) setAberto(false)
    }
    const tecla = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  return (
    <div className={`commenu ${classe}`.trim()} ref={caixa}>
      <button
        type="button"
        className="commenu__botao"
        aria-haspopup="true"
        aria-expanded={aberto}
        title={titulo}
        onClick={() => setAberto((v) => !v)}
      >
        {rotulo}
      </button>
      {aberto && (
        <div className="commenu__lista" data-alinhar={alinhar} role="menu">
          {typeof conteudo === 'function' ? conteudo(() => setAberto(false)) : children}
        </div>
      )}
    </div>
  )
}

/**
 * COMERCIAL — os negocios, no desenho do Pipedrive que a equipe usava.
 *
 * Quatro funis (o seletor do canto direito): Novos negócios, Funil de
 * renovação, Funil de Resgate e Funil Prospecção — cada um com as
 * colunas dele (src/domain/comercial.js).
 *
 * A barra e a do Pipedrive: as quatro visoes (Funil, Lista, Previsão,
 * Arquivados), o "+ Negócio", a contagem, o funil, o Filtro (de quem e
 * o negocio) e o ⋯ (importar e exportar). Embaixo, Fixar filtros e
 * Adicionar condição a esquerda; Ordenar por e Mostrar negócios
 * fechados a direita.
 *
 * O "Responder?" do cartao manda e-mail ao contato pela caixa do
 * Outlook de quem esta logado (ModalEmail).
 */
export default function Comercial() {
  const { pode, equipe } = useDados()
  const { user } = useAuth()
  const guardado = useMemo(lerGuardado, [])

  const [funilId, setFunilId] = useState(funilPorId(guardado.funil) ? guardado.funil : FUNIL_PADRAO)
  const [visao, setVisao] = useState(VISOES.some((v) => v.id === guardado.visao) ? guardado.visao : 'funil')
  const [ordem, setOrdem] = useState(guardado.ordem ?? { campo: 'atividade', sentido: 'asc' })
  const [fixado, setFixado] = useState(Boolean(guardado.fixado))
  const [filtro, setFiltro] = useState(guardado.fixado ? guardado.filtro ?? 'todos' : 'todos')
  const [condicoes, setCondicoes] = useState(guardado.fixado ? guardado.condicoes ?? [] : [])
  const [mostrarFechados, setMostrarFechados] = useState(Boolean(guardado.mostrarFechados))

  const [negocios, setNegocios] = useState([])
  const [email, setEmail] = useState({ envio: false, leitura: false, caixa: '' })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')

  const [editando, setEditando] = useState(null) // { negocio } ou { inicial }
  const [escrevendo, setEscrevendo] = useState(null)
  const [importando, setImportando] = useState(false)
  const [excluindo, setExcluindo] = useState(null)
  const [perdendo, setPerdendo] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [movendo, setMovendo] = useState(null)
  const [destino, setDestino] = useState({ funil: '', etapa: '' })
  const [novaCondicao, setNovaCondicao] = useState({ campo: 'texto', valor: '' })

  const podeEditar = pode('editar_negocios')
  const podeExcluir = pode('excluir_negocios')
  const podeResponder = pode('responder_emails')
  const funil = funilPorId(funilId) ?? FUNIS[0]
  const hoje = hojeISO()

  /* lembra a escolha da tela; os filtros, so com o pino */
  useEffect(() => {
    guardar({
      funil: funilId,
      visao,
      ordem,
      fixado,
      mostrarFechados,
      ...(fixado ? { filtro, condicoes } : {}),
    })
  }, [funilId, visao, ordem, fixado, filtro, condicoes, mostrarFechados])

  /* ---------------- leitura ---------------- */

  const trocarUm = useCallback((novo) => {
    if (!novo) return
    setNegocios((lista) => {
      const sai = lista.filter((n) => n.id !== novo.id)
      return [novo, ...sai]
    })
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      /* os arquivados olham todos os funis; o resto, so o escolhido */
      const r = await comercial.carregarNegocios(visao === 'arquivo' ? null : funilId)
      setNegocios(r.negocios ?? [])
      setEmail(r.email ?? { envio: false, leitura: false, caixa: '' })

      /* com leitura da caixa, confere quem espera resposta — aos poucos,
         20 por vez, sem segurar a tela */
      if (r.email?.leitura) {
        for (let i = 0; i < 6; i += 1) {
          const c = await comercial.conferirEmails(visao === 'arquivo' ? null : funilId)
          c.negocios?.forEach((n) => setNegocios((lista) => lista.map((x) => (x.id === n.id ? n : x))))
          if (!c.restantes) break
        }
      }
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [funilId, visao])

  useEffect(() => {
    carregar()
  }, [carregar])

  /* ---------------- o que aparece ---------------- */

  const visiveis = useMemo(() => {
    let lista = negocios
    if (visao === 'arquivo') lista = lista.filter((n) => n.status !== 'aberto')
    else if (!mostrarFechados || visao === 'previsao') lista = lista.filter((n) => n.status === 'aberto')

    if (filtro === 'meus') lista = lista.filter((n) => String(n.responsavelId) === String(user?.id))
    else if (filtro !== 'todos') lista = lista.filter((n) => String(n.responsavelId) === String(filtro))
    condicoes.forEach((c) => {
      lista = lista.filter((n) => passa(n, c, hoje))
    })

    const cmp = comparar(ordem.campo)
    const sinal = ordem.sentido === 'desc' ? -1 : 1
    return [...lista].sort((a, b) => sinal * cmp(a, b))
  }, [negocios, visao, mostrarFechados, filtro, condicoes, ordem, user?.id, hoje])

  const donos = useMemo(() => new Map(equipe.map((p) => [String(p.id), p])), [equipe])
  const donoDe = useCallback((id) => (id ? donos.get(String(id)) ?? null : null), [donos])

  const responderEm = useCallback(
    (n) =>
      podeResponder &&
      email.envio &&
      n.status === 'aberto' &&
      Boolean(n.contatoEmail) &&
      /* sem ler a caixa nao da para saber quem espera: o botao fica em todo
         negocio com e-mail de contato */
      (email.leitura ? n.email.aguardando : true),
    [podeResponder, email],
  )

  const funilVazio =
    visao === 'funil' && !carregando && !erro && negocios.filter((n) => n.status === 'aberto').length === 0

  const nomeDoFiltro =
    filtro === 'todos' ? 'Todos' : filtro === 'meus' ? 'Meus negócios' : donoDe(filtro)?.nome ?? 'Responsável'

  /* ---------------- acoes ---------------- */

  const avisar = (texto) => setRecado(texto)

  const mover = async (n, etapa) => {
    const antes = negocios
    setNegocios((lista) => lista.map((x) => (x.id === n.id ? { ...x, etapa } : x)))
    try {
      const { negocio } = await comercial.moverNegocio(n.id, etapa)
      setNegocios((lista) => lista.map((x) => (x.id === negocio.id ? negocio : x)))
    } catch (e) {
      setNegocios(antes)
      avisar(e.message)
    }
  }

  const mudarStatus = async (n, status, motivoPerda) => {
    try {
      const { negocio } = await comercial.mudarStatus(n.id, status, motivoPerda)
      setNegocios((lista) => lista.map((x) => (x.id === negocio.id ? negocio : x)))
      setEditando(null)
      avisar(
        status === 'ganho'
          ? `“${negocio.titulo}” marcado como ganho.`
          : status === 'perdido'
            ? `“${negocio.titulo}” marcado como perdido.`
            : `“${negocio.titulo}” reaberto.`,
      )
    } catch (e) {
      avisar(e.message)
    }
  }

  const excluir = async () => {
    const n = excluindo
    if (!n) return
    try {
      await comercial.apagarNegocio(n.id)
      setNegocios((lista) => lista.filter((x) => x.id !== n.id))
      setEditando(null)
      avisar(`“${n.titulo}” excluído.`)
    } catch (e) {
      avisar(e.message)
    }
  }

  const confirmarMover = async () => {
    const n = movendo
    if (!n || !destino.funil || !destino.etapa) return
    try {
      const { negocio } = await comercial.moverNegocio(n.id, destino.etapa, destino.funil)
      setMovendo(null)
      if (negocio.funil === funilId) setNegocios((lista) => lista.map((x) => (x.id === negocio.id ? negocio : x)))
      else setNegocios((lista) => lista.filter((x) => x.id !== negocio.id))
      avisar(`“${negocio.titulo}” foi para ${funilPorId(negocio.funil)?.rotulo}, em ${rotuloDaEtapa(negocio.funil, negocio.etapa)}.`)
    } catch (e) {
      avisar(e.message)
    }
  }

  const abrirMover = (n) => {
    const outro = FUNIS.find((f) => f.id !== n.funil) ?? FUNIS[0]
    setDestino({ funil: outro.id, etapa: outro.etapas[0].id })
    setMovendo(n)
  }

  const exportar = () => {
    const nomeFunil = (id) => funilPorId(id)?.rotulo ?? id
    baixarPlanilha(
      [
        {
          nome: 'Negócios',
          tabela: 'Negocios',
          colunas: [
            { titulo: 'Título', tipo: 'texto', largura: 42 },
            { titulo: 'Valor', tipo: 'reais', largura: 14 },
            { titulo: 'Organização', tipo: 'texto', largura: 30 },
            { titulo: 'Pessoa de contato', tipo: 'texto', largura: 24 },
            { titulo: 'E-mail do contato', tipo: 'texto', largura: 28 },
            { titulo: 'Funil', tipo: 'texto', largura: 20 },
            { titulo: 'Etapa', tipo: 'texto', largura: 30 },
            { titulo: 'Responsável', tipo: 'texto', largura: 22 },
            { titulo: 'Status', tipo: 'texto', largura: 11 },
            { titulo: 'Próxima atividade', tipo: 'data', largura: 14 },
            { titulo: 'Fechamento esperado', tipo: 'data', largura: 14 },
            { titulo: 'Criado em', tipo: 'data', largura: 12 },
          ],
          linhas: visiveis.map((n) => [
            n.titulo,
            Number(n.valor),
            n.organizacao,
            n.contatoNome,
            n.contatoEmail,
            nomeFunil(n.funil),
            rotuloDaEtapa(n.funil, n.etapa),
            n.responsavelNome,
            ROTULO_STATUS[n.status],
            n.proximaAtividade || null,
            n.previsaoFechamento || null,
            n.criadoEm ? String(n.criadoEm).slice(0, 10) : null,
          ]),
        },
      ],
      `negocios-${visao === 'arquivo' ? 'arquivados' : funil.id}-${hoje}.xlsx`,
    )
  }

  const adicionarCondicao = (fechar) => {
    const valor = String(novaCondicao.valor ?? '').trim()
    if (!valor) return
    setCondicoes((atual) => [...atual.filter((c) => !(c.campo === novaCondicao.campo && c.campo !== 'texto')), { campo: novaCondicao.campo, valor }])
    setNovaCondicao({ campo: novaCondicao.campo, valor: '' })
    fechar()
  }

  /* ---------------- tela ---------------- */

  const totalAbertos = visiveis.length
  const pessoasDoFiltro = equipe
    .filter((p) => p.ativo !== false)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))

  return (
    <AppShell>
      <section className="comercial">
        <header className="comercial__topo">
          <h1 className="comercial__titulo">
            Negócios
            <span className="comercial__info" title={funil.descricao} aria-label={funil.descricao}>
              <IconeInfo tamanho={17} />
            </span>
          </h1>
        </header>

        {/* ---------------- a barra de cima ---------------- */}
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

          {podeEditar && (
            <div className="comercial__novo">
              <button type="button" className="comercial__verde" onClick={() => setEditando({ inicial: { funil: funil.id } })}>
                <IconeMais />
                Negócio
              </button>
              <Menu
                classe="comercial__novo-mais"
                alinhar="esquerda"
                titulo="Mais opções"
                rotulo={<IconeCaret />}
                conteudo={(fechar) => (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        fechar()
                        setEditando({ inicial: { funil: funil.id } })
                      }}
                    >
                      <IconeMais /> Novo negócio
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        fechar()
                        setImportando(true)
                      }}
                    >
                      <IconeImportar /> Importar negócios
                    </button>
                  </>
                )}
              />
            </div>
          )}

          <span className="comercial__espaco" />

          <p className="comercial__conta">
            {carregando ? 'Carregando...' : `${totalAbertos} ${totalAbertos === 1 ? 'negócio' : 'negócios'}`}
            <span title="Os negócios que passam pelo filtro e pelas condições" aria-hidden="true">
              <IconeInfo />
            </span>
          </p>

          {visao !== 'arquivo' && (
            <div className="comercial__funil">
              <span className="comercial__funil-icone" aria-hidden="true">
                <IconeFunil />
              </span>
              <Seletor
                valor={funilId}
                aoMudar={setFunilId}
                opcoes={FUNIS.map((f) => ({ valor: f.id, rotulo: f.rotulo }))}
                aria-label="Funil"
              />
            </div>
          )}

          <Menu
            classe="comercial__filtro"
            alinhar="direita"
            rotulo={
              <>
                <IconeFiltro />
                {filtro === 'todos' ? 'Filtro' : nomeDoFiltro}
                <IconeCaret />
              </>
            }
            conteudo={(fechar) => (
              <>
                <p className="commenu__titulo">Negócios de</p>
                {[
                  { id: 'todos', rotulo: 'Todos' },
                  { id: 'meus', rotulo: 'Meus negócios' },
                  ...pessoasDoFiltro.map((p) => ({ id: String(p.id), rotulo: p.nome })),
                ].map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={filtro === o.id}
                    onClick={() => {
                      setFiltro(o.id)
                      fechar()
                    }}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </>
            )}
          />

          <Menu
            classe="comercial__mais"
            alinhar="direita"
            titulo="Mais ações"
            rotulo={<IconeReticencias />}
            conteudo={(fechar) => (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    fechar()
                    exportar()
                  }}
                  disabled={visiveis.length === 0}
                >
                  <IconeExportar /> Exportar negócios (Excel)
                </button>
                {podeEditar && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      fechar()
                      setImportando(true)
                    }}
                  >
                    <IconeImportar /> Importar negócios
                  </button>
                )}
              </>
            )}
          />
        </div>

        {/* ---------------- a segunda linha: filtros e ordem ---------------- */}
        <div className="comercial__filtros">
          <div className="comercial__filtros-esq">
            <button
              type="button"
              className={`comercial__link ${fixado ? 'is-ligado' : ''}`.trim()}
              aria-pressed={fixado}
              onClick={() => setFixado((v) => !v)}
              title={fixado ? 'Os filtros ficam guardados neste navegador' : 'Guardar os filtros para a próxima visita'}
            >
              <IconePino />
              {fixado ? 'Filtros fixados' : 'Fixar filtros'}
            </button>

            <Menu
              classe="comercial__condicao"
              alinhar="esquerda"
              rotulo={
                <>
                  <IconeFiltro />
                  Adicionar condição
                </>
              }
              conteudo={(fechar) => (
                <form
                  className="condicao"
                  onSubmit={(e) => {
                    e.preventDefault()
                    adicionarCondicao(fechar)
                  }}
                >
                  <Seletor
                    largo
                    valor={novaCondicao.campo}
                    aoMudar={(campo) => setNovaCondicao({ campo, valor: '' })}
                    opcoes={CONDICOES.map((c) => ({ valor: c.id, rotulo: c.rotulo }))}
                    aria-label="Campo da condição"
                  />
                  {novaCondicao.campo === 'etiqueta' && (
                    <Seletor
                      largo
                      valor={novaCondicao.valor}
                      aoMudar={(valor) => setNovaCondicao((a) => ({ ...a, valor }))}
                      vazio="Escolha a etiqueta"
                      opcoes={ETIQUETAS.map((e) => ({ valor: e.id, rotulo: e.rotulo, cor: e.cor }))}
                      aria-label="Etiqueta"
                    />
                  )}
                  {novaCondicao.campo === 'atividade' && (
                    <Seletor
                      largo
                      valor={novaCondicao.valor}
                      aoMudar={(valor) => setNovaCondicao((a) => ({ ...a, valor }))}
                      vazio="Escolha a situação"
                      opcoes={Object.entries(ROTULO_SITUACAO).map(([valor, rotulo]) => ({ valor, rotulo }))}
                      aria-label="Situação da atividade"
                    />
                  )}
                  {(novaCondicao.campo === 'texto' || novaCondicao.campo === 'valorMin') && (
                    <input
                      className="condicao__entrada"
                      autoFocus
                      inputMode={novaCondicao.campo === 'valorMin' ? 'decimal' : undefined}
                      placeholder={novaCondicao.campo === 'valorMin' ? 'Ex.: 10000' : 'Ex.: Aché'}
                      value={novaCondicao.valor}
                      onChange={(e) =>
                        setNovaCondicao((a) => ({
                          ...a,
                          valor: a.campo === 'valorMin' ? e.target.value.replace(/[^\d]/g, '') : e.target.value,
                        }))
                      }
                    />
                  )}
                  <button type="submit" className="comercial__verde" disabled={!String(novaCondicao.valor).trim()}>
                    Adicionar
                  </button>
                </form>
              )}
            />

            {condicoes.map((c, i) => (
              <span key={`${c.campo}-${i}`} className="comercial__condicao-chip">
                {rotuloDaCondicao(c)}
                <button
                  type="button"
                  onClick={() => setCondicoes((atual) => atual.filter((_, j) => j !== i))}
                  aria-label={`Tirar a condição ${rotuloDaCondicao(c)}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="comercial__filtros-dir">
            <div className="comercial__ordem">
              <button
                type="button"
                className="comercial__sentido"
                data-sentido={ordem.sentido}
                onClick={() => setOrdem((o) => ({ ...o, sentido: o.sentido === 'asc' ? 'desc' : 'asc' }))}
                aria-label={ordem.sentido === 'asc' ? 'Ordem crescente' : 'Ordem decrescente'}
                title={ordem.sentido === 'asc' ? 'Crescente' : 'Decrescente'}
              >
                <IconeSetaCima />
              </button>
              <Menu
                classe="comercial__ordenar"
                alinhar="direita"
                rotulo={
                  <>
                    Ordenar por: {ORDENS.find((o) => o.id === ordem.campo)?.rotulo}
                    <IconeCaret />
                  </>
                }
                conteudo={(fechar) =>
                  ORDENS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={ordem.campo === o.id}
                      onClick={() => {
                        setOrdem((atual) => ({ ...atual, campo: o.id }))
                        fechar()
                      }}
                    >
                      {o.rotulo}
                    </button>
                  ))
                }
              />
            </div>

            {visao !== 'arquivo' && visao !== 'previsao' && (
              <button
                type="button"
                className={`comercial__link ${mostrarFechados ? 'is-ligado' : ''}`.trim()}
                aria-pressed={mostrarFechados}
                onClick={() => setMostrarFechados((v) => !v)}
              >
                {mostrarFechados ? 'Esconder negócios fechados' : 'Mostrar negócios fechados'}
              </button>
            )}
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

        {erro && (
          <p className="comercial__erro" role="alert">
            {erro}{' '}
            <button type="button" onClick={carregar}>
              Tentar de novo
            </button>
          </p>
        )}

        {/* ---------------- a visao ---------------- */}
        {visao === 'funil' && !erro && (
          <QuadroFunil
            funil={funil}
            negocios={visiveis}
            hoje={hoje}
            donoDe={donoDe}
            podeEditar={podeEditar}
            podeExcluir={podeExcluir}
            responderEm={responderEm}
            vazio={funilVazio}
            aoAbrir={(n) => setEditando({ negocio: n })}
            aoNovo={(etapa) => setEditando({ inicial: { funil: funil.id, etapa } })}
            aoImportar={() => setImportando(true)}
            aoResponder={setEscrevendo}
            aoMover={mover}
            aoGanhar={(n) => mudarStatus(n, 'ganho')}
            aoPerder={(n) => {
              setMotivo('')
              setPerdendo(n)
            }}
            aoExcluir={setExcluindo}
            aoMoverFunil={abrirMover}
          />
        )}

        {visao === 'lista' && !erro && (
          <ListaNegocios
            negocios={visiveis}
            hoje={hoje}
            aoAbrir={(n) => setEditando({ negocio: n })}
            vazio={carregando ? 'Carregando...' : 'Nenhum negócio neste funil.'}
          />
        )}

        {visao === 'previsao' && !erro && (
          <PrevisaoNegocios
            negocios={visiveis}
            hoje={hoje}
            donoDe={donoDe}
            responderEm={responderEm}
            aoAbrir={(n) => setEditando({ negocio: n })}
            aoResponder={setEscrevendo}
          />
        )}

        {visao === 'arquivo' && !erro && (
          <ListaNegocios
            negocios={visiveis}
            hoje={hoje}
            fechados
            funilDe={(id) => funilPorId(id)?.rotulo ?? id}
            aoAbrir={(n) => setEditando({ negocio: n })}
            vazio={carregando ? 'Carregando...' : 'Nenhum negócio ganho ou perdido ainda.'}
          />
        )}
      </section>

      <ModalNegocio
        aberto={Boolean(editando)}
        negocio={editando?.negocio ?? null}
        inicial={editando?.inicial ?? null}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        podeEmail={podeResponder && email.envio && Boolean(editando?.negocio?.contatoEmail)}
        aoFechar={() => setEditando(null)}
        aoSalvo={(n, novo) => {
          if (n.funil === funilId || visao === 'arquivo') trocarUm(n)
          else setNegocios((lista) => lista.filter((x) => x.id !== n.id))
          avisar(novo ? `Negócio “${n.titulo}” adicionado.` : `Negócio “${n.titulo}” salvo.`)
        }}
        aoGanhar={(n) => mudarStatus(n, 'ganho')}
        aoPerder={(n) => {
          setMotivo('')
          setPerdendo(n)
        }}
        aoReabrir={(n) => mudarStatus(n, 'aberto')}
        aoExcluir={setExcluindo}
        aoEmail={(n) => {
          setEditando(null)
          setEscrevendo(n)
        }}
      />

      <ModalEmail
        aberto={Boolean(escrevendo)}
        negocio={escrevendo}
        aoFechar={() => setEscrevendo(null)}
        aoEnviado={(n, texto) => {
          if (n) setNegocios((lista) => lista.map((x) => (x.id === n.id ? n : x)))
          avisar(texto)
        }}
      />

      <ModalImportar
        aberto={importando}
        funilInicial={funil.id}
        aoFechar={() => setImportando(false)}
        aoImportado={(texto) => {
          avisar(texto)
          carregar()
        }}
      />

      <Confirma
        aberto={Boolean(excluindo)}
        titulo={`Excluir “${excluindo?.titulo ?? ''}”?`}
        mensagem="O negócio sai do funil de vez, com os e-mails registrados nele. Não dá para desfazer."
        rotuloConfirmar="Excluir negócio"
        nivel={1}
        aoConfirmar={excluir}
        aoFechar={() => setExcluindo(null)}
      />

      {/* perdido pede o motivo, como no Pipedrive */}
      <Modal aberto={Boolean(perdendo)} aoFechar={() => setPerdendo(null)} titulo="Marcar como perdido" subtitulo={perdendo?.titulo} largura={440} nivel={1}>
        <form
          className="negform"
          onSubmit={(e) => {
            e.preventDefault()
            const n = perdendo
            setPerdendo(null)
            mudarStatus(n, 'perdido', motivo.trim())
          }}
        >
          <CampoTexto
            rotulo="Motivo da perda"
            largo
            autoFocus
            placeholder="Ex.: preço, prazo, escolheu concorrente"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={200}
          />
          <footer className="negform__rodape">
            <button type="button" className="formobra__cancelar" onClick={() => setPerdendo(null)}>
              Cancelar
            </button>
            <Button type="submit">Marcar como perdido</Button>
          </footer>
        </form>
      </Modal>

      {/* mover para outro funil (a faixa de baixo do arrastar) */}
      <Modal aberto={Boolean(movendo)} aoFechar={() => setMovendo(null)} titulo="Mover para outro funil" subtitulo={movendo?.titulo} largura={460} nivel={1}>
        <form
          className="negform"
          onSubmit={(e) => {
            e.preventDefault()
            confirmarMover()
          }}
        >
          <CampoSelecao
            rotulo="Funil"
            largo
            value={destino.funil}
            onChange={(e) => {
              const f = funilPorId(e.target.value)
              if (f) setDestino({ funil: f.id, etapa: f.etapas[0].id })
            }}
            opcoes={FUNIS.map((f) => ({ valor: f.id, rotulo: f.rotulo }))}
          />
          <CampoSelecao
            rotulo="Etapa"
            largo
            value={destino.etapa}
            onChange={(e) => setDestino((d) => ({ ...d, etapa: e.target.value }))}
            opcoes={(funilPorId(destino.funil)?.etapas ?? []).map((et) => ({ valor: et.id, rotulo: et.rotulo }))}
          />
          <footer className="negform__rodape">
            <button type="button" className="formobra__cancelar" onClick={() => setMovendo(null)}>
              Cancelar
            </button>
            <Button type="submit">Mover</Button>
          </footer>
        </form>
      </Modal>
    </AppShell>
  )
}
