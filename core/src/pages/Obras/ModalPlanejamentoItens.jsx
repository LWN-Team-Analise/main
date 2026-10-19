import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoArea, CampoPastilhas, CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import {
  CONDICAO_PADRAO,
  CONDICOES,
  GASES,
  LIMITES_ITEM,
  SERVICOS,
  TIPOS_DE_ITEM,
  ensaioServeAoItem,
  linhaFeita,
  nomeDoItem,
  rotuloDaCondicao,
  tipoDoItem,
} from '@/domain/itensEnsaio'
import ModalEnsaios from './ModalEnsaios'
import './ModalEnsaios.css'
import './ModalItens.css'

/* "Outro" no seletor do gas: abre o campo para digitar */
const OUTRO_GAS = '__outro'

/* acima disto a lista de itens ganha a busca */
const BUSCA_A_PARTIR_DE = 8

/**
 * O item como o PUT espera: os ensaios agrupados, cada um com as
 * condicoes dele, na ordem do catalogo.
 */
function paraCorpo(item, ordemDoEnsaio) {
  const porEnsaio = new Map()
  for (const l of item.linhas ?? []) {
    const lista = porEnsaio.get(l.ensaioId) ?? []
    if (!lista.includes(l.condicao)) lista.push(l.condicao)
    porEnsaio.set(l.ensaioId, lista)
  }
  return {
    id: item.id ?? null,
    tipo: item.tipo,
    nome: item.nome,
    tag: item.tag ?? '',
    classe: item.classe ?? '',
    gas: item.gas ?? '',
    observacao: item.observacao ?? '',
    ensaios: [...porEnsaio.entries()]
      .sort(([a], [b]) => ordemDoEnsaio(a) - ordemDoEnsaio(b))
      .map(([ensaioId, condicoes]) => ({ ensaioId, condicoes })),
  }
}

/** O rascunho do editor a partir de um item (ou de nada, no item novo). */
function rascunhoDe(item, tipoInicial = 'ambiente') {
  const ensaios = {}
  for (const l of item?.linhas ?? []) {
    ensaios[l.ensaioId] = [...(ensaios[l.ensaioId] ?? []), l.condicao]
  }
  const gas = item?.gas ?? ''
  return {
    id: item?.id ?? null,
    tipo: item?.tipo ?? tipoInicial,
    nome: item?.nome ?? '',
    tag: item?.tag ?? '',
    classe: item?.classe ?? '',
    gasEscolhido: !gas ? '' : GASES.includes(gas) ? gas : OUTRO_GAS,
    gasOutro: gas && !GASES.includes(gas) ? gas : '',
    observacao: item?.observacao ?? '',
    ensaios,
  }
}

/** As linhas feitas do item que o rascunho tirou (o resultado delas sai junto). */
function resultadosQueSaem(item, rascunho) {
  if (!item) return []
  return (item.linhas ?? []).filter(
    (l) => linhaFeita(l) && !(rascunho.ensaios[l.ensaioId] ?? []).includes(l.condicao),
  )
}

/**
 * PLANEJAMENTO DE ENSAIOS POR ITEM — o check do Time Tecnico na 1a
 * etapa, na obra que planeja por item (ver domain/itensEnsaio.js).
 *
 * A obra cadastra O QUE vai ser ensaiado — ambientes, equipamentos com
 * TAG, sistemas e pontos de uso com o gas — e, em cada item, marca os
 * ensaios e a condicao de cada um: Como encontrado, Como certificado ou as
 * duas. Ambiente e equipamento mostram os ensaios de HVAC; ponto de
 * uso, os de gases; sistema, os dois.
 *
 * Cada item salvo ja vai para o banco: cadastrar trinta TAGs e perder
 * tudo por fechar o pop-up sem querer seria caro. O servico da obra
 * (um por obra) tambem grava assim que muda.
 *
 * "Concluir planejamento" pede o servico, ao menos um item e todo
 * item com ensaio — a mesma regra do servidor.
 */
export default function ModalPlanejamentoItens({
  aberto,
  obra,
  /* pode mexer: e quem marca o check (o setor dele), e a obra esta aberta */
  podeEditar,
  marcado,
  aoDesmarcar,
  aoFechar,
}) {
  const { ensaios: catalogo, ensaiosAtivos, ensaioPorId, planejarItens, pode } = useDados()

  /* null = a lista; { ...rascunho } = editando um item */
  const [rascunho, setRascunho] = useState(null)
  const [errosItem, setErrosItem] = useState({})
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendo] = useState(null)
  const [busca, setBusca] = useState('')
  const [gerenciar, setGerenciar] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setRascunho(null)
    setErrosItem({})
    setErro('')
    setBusca('')
  }, [aberto, obra?.id])

  const itens = useMemo(() => obra?.itens ?? [], [obra])
  const servico = obra?.servico ?? ''
  /* a obra que ainda planeja pela lista solta: ao salvar o primeiro
     item, a lista dela passa a sair dos itens */
  const listaAntiga = itens.length === 0 ? (obra?.ensaios ?? []) : []

  const ordemDoEnsaio = useMemo(() => {
    const posicao = new Map(catalogo.map((e, i) => [String(e.id), i]))
    return (id) => posicao.get(String(id)) ?? Number.MAX_SAFE_INTEGER
  }, [catalogo])

  const nomeDoEnsaio = (id) => ensaioPorId(id)?.nome ?? 'Ensaio removido'

  /* ---- gravar: o planejamento inteiro, com a mudanca ---- */
  const gravar = async (novosItens, { novoServico = servico, concluir = false } = {}) => {
    setSalvando(true)
    setErro('')
    try {
      await planejarItens(
        obra.id,
        { servico: novoServico || null, itens: novosItens.map((i) => paraCorpo(i, ordemDoEnsaio)) },
        concluir,
      )
      return true
    } catch (e) {
      setErro(e.message)
      return false
    } finally {
      setSalvando(false)
    }
  }

  const mudarServico = (novo) => gravar(itens, { novoServico: novo })

  /* ---- o editor de item ---- */
  const novoItem = () => {
    const ultimo = itens.at(-1)
    setRascunho(rascunhoDe(null, ultimo?.tipo ?? 'ambiente'))
    setErrosItem({})
    setErro('')
  }
  const editar = (item) => {
    setRascunho(rascunhoDe(item))
    setErrosItem({})
    setErro('')
  }
  /* a copia abre no editor, ainda sem gravar: e para trocar o nome */
  const duplicar = (item) => {
    const copia = rascunhoDe(item)
    setRascunho({ ...copia, id: null, nome: `${item.nome} (cópia)`.slice(0, LIMITES_ITEM.nome) })
    setErrosItem({})
    setErro('')
  }

  const mudarCampo = (campo) => (e) => {
    const valor = e?.target ? e.target.value : e
    setRascunho((r) => ({ ...r, [campo]: valor }))
    setErrosItem((x) => ({ ...x, [campo]: undefined }))
  }

  const alternarEnsaio = (id) => {
    setRascunho((r) => {
      const ensaios = { ...r.ensaios }
      if (ensaios[id]) delete ensaios[id]
      else ensaios[id] = [CONDICAO_PADRAO]
      return { ...r, ensaios }
    })
    setErrosItem((x) => ({ ...x, ensaios: undefined }))
  }

  /* a ultima condicao de um ensaio marcado nao sai: ensaio sem
     condicao nao e linha nenhuma — para tirar, desmarque o ensaio */
  const alternarCondicao = (id, condicao) =>
    setRascunho((r) => {
      const atuais = r.ensaios[id] ?? []
      const novas = atuais.includes(condicao) ? atuais.filter((c) => c !== condicao) : [...atuais, condicao]
      if (novas.length === 0) return r
      return { ...r, ensaios: { ...r.ensaios, [id]: novas } }
    })

  const condicaoEmTodos = (condicoes) =>
    setRascunho((r) => ({
      ...r,
      ensaios: Object.fromEntries(Object.keys(r.ensaios).map((id) => [id, [...condicoes]])),
    }))

  /* os ensaios que o editor mostra: os do catalogo que cabem no tipo
     de item, mais os que o item ja tem (um ensaio que saiu do catalogo,
     ou de outra classificacao, continua aparecendo para ser tirado) */
  const opcoes = useMemo(() => {
    if (!rascunho) return []
    const ids = new Set(ensaiosAtivos.filter((e) => ensaioServeAoItem(e, rascunho.tipo)).map((e) => String(e.id)))
    Object.keys(rascunho.ensaios).forEach((id) => ids.add(String(id)))
    return [...ids]
      .map((id) => ensaioPorId(id) ?? { id, nome: 'Ensaio removido', classificacao: null, ativo: false })
      .sort((a, b) => ordemDoEnsaio(a.id) - ordemDoEnsaio(b.id))
  }, [rascunho, ensaiosAtivos, ensaioPorId, ordemDoEnsaio])

  const grupos = useMemo(() => {
    const rotulo = { hvac: 'HVAC', gases: 'Gases' }
    const mapa = new Map()
    for (const e of opcoes) {
      const chave = e.classificacao ?? 'outros'
      if (!mapa.has(chave)) mapa.set(chave, { chave, rotulo: rotulo[chave] ?? 'Sem classificação', ensaios: [] })
      mapa.get(chave).ensaios.push(e)
    }
    return [...mapa.values()]
  }, [opcoes])

  const original = rascunho?.id ? itens.find((i) => i.id === rascunho.id) : null
  const saemDoItem = rascunho ? resultadosQueSaem(original, rascunho) : []
  const marcados = rascunho ? Object.keys(rascunho.ensaios).length : 0

  const salvarItem = async (evento) => {
    evento?.preventDefault()
    const r = rascunho
    const gas = r.gasEscolhido === OUTRO_GAS ? r.gasOutro.trim() : r.gasEscolhido
    const erros = {}
    if (!r.nome.trim()) erros.nome = 'Dê um nome ao item.'
    if (r.tipo === 'ponto_uso' && !gas) {
      erros[r.gasEscolhido === OUTRO_GAS ? 'gasOutro' : 'gasEscolhido'] = 'Diga qual é o gás deste ponto de uso.'
    }
    if (marcados === 0) erros.ensaios = 'Marque ao menos um ensaio para este item.'
    setErrosItem(erros)
    if (Object.keys(erros).length > 0) return

    const item = {
      id: r.id,
      tipo: r.tipo,
      nome: r.nome.trim(),
      tag: r.tag.trim(),
      classe: r.tipo === 'ambiente' ? r.classe.trim() : '',
      gas: r.tipo === 'ponto_uso' ? gas : '',
      observacao: r.observacao.trim(),
      linhas: Object.entries(r.ensaios).flatMap(([ensaioId, condicoes]) =>
        CONDICOES.filter((c) => condicoes.includes(c.id)).map((c) => ({ ensaioId, condicao: c.id })),
      ),
    }
    const novos = r.id ? itens.map((i) => (i.id === r.id ? item : i)) : [...itens, item]
    if (await gravar(novos)) setRascunho(null)
  }

  const remover = async () => {
    const alvo = removendo
    setRemovendo(null)
    await gravar(itens.filter((i) => i.id !== alvo.id))
  }

  const concluir = () => gravar(itens, { concluir: true })

  /* o que ainda falta para concluir, na ordem em que se resolve */
  const semEnsaio = itens.filter((i) => (i.linhas ?? []).length === 0)
  const falta = !servico
    ? 'Escolha o serviço da obra.'
    : itens.length === 0
      ? 'Cadastre ao menos um item.'
      : semEnsaio.length > 0
        ? `${semEnsaio.map((i) => i.nome).join(', ')} ${semEnsaio.length > 1 ? 'estão' : 'está'} sem ensaio.`
        : ''

  const totalLinhas = itens.reduce((n, i) => n + (i.linhas ?? []).length, 0)
  const termo = busca.trim().toLowerCase()
  const visiveis = termo
    ? itens.filter((i) => nomeDoItem(i).toLowerCase().includes(termo))
    : itens

  const titulo = rascunho ? (rascunho.id ? 'Editar item' : 'Novo item') : 'Planejamento de ensaios'

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      subtitulo={
        rascunho
          ? 'O que vai ser ensaiado e em que condição.'
          : 'O que a obra vai ensaiar, item a item.'
      }
      largura={760}
    >
      {rascunho ? (
        /* ================= o editor de item ================= */
        <form className="itens itens--editor" onSubmit={salvarItem} noValidate>
          <CampoPastilhas
            rotulo="Tipo do item"
            valor={rascunho.tipo}
            aoMudar={mudarCampo('tipo')}
            opcoes={TIPOS_DE_ITEM.map((t) => ({ valor: t.id, rotulo: t.rotulo, tom: 'neutro' }))}
            largo
          />

          <div className="itens__par">
            <CampoTexto
              rotulo="Nome"
              maxLength={LIMITES_ITEM.nome}
              placeholder={`Ex.: ${tipoDoItem(rascunho.tipo)?.exemplo ?? ''}`}
              value={rascunho.nome}
              onChange={mudarCampo('nome')}
              erro={errosItem.nome}
            />
            <CampoTexto
              rotulo="TAG (opcional)"
              maxLength={LIMITES_ITEM.tag}
              placeholder="Ex.: CSB-03"
              value={rascunho.tag}
              onChange={mudarCampo('tag')}
            />
          </div>

          {rascunho.tipo === 'ambiente' && (
            <CampoTexto
              rotulo="Classe (opcional)"
              maxLength={LIMITES_ITEM.classe}
              placeholder="Ex.: ISO 7 / Grau C"
              value={rascunho.classe}
              onChange={mudarCampo('classe')}
            />
          )}

          {rascunho.tipo === 'ponto_uso' && (
            <div className="itens__par">
              <CampoSelecao
                rotulo="Gás"
                vazio="Escolha o gás"
                value={rascunho.gasEscolhido}
                onChange={mudarCampo('gasEscolhido')}
                opcoes={[...GASES.map((g) => ({ valor: g, rotulo: g })), { valor: OUTRO_GAS, rotulo: 'Outro' }]}
                erro={errosItem.gasEscolhido}
              />
              {rascunho.gasEscolhido === OUTRO_GAS && (
                <CampoTexto
                  rotulo="Qual gás"
                  maxLength={LIMITES_ITEM.gas}
                  placeholder="Ex.: Argônio-hidrogênio"
                  value={rascunho.gasOutro}
                  onChange={mudarCampo('gasOutro')}
                  erro={errosItem.gasOutro}
                />
              )}
            </div>
          )}

          <CampoArea
            rotulo="Observação (opcional)"
            linhas={2}
            maxLength={LIMITES_ITEM.observacao}
            value={rascunho.observacao}
            onChange={mudarCampo('observacao')}
          />

          {/* ---- os ensaios do item ---- */}
          <section className="itens__ensaios" aria-labelledby="itens-ensaios-titulo">
            <header className="itens__ensaiostopo">
              <h3 id="itens-ensaios-titulo" className="campo__rotulo">
                Ensaios <span className="ensaios__conta">{marcados}</span>
              </h3>
              {marcados > 1 && (
                <div className="itens__todos" role="group" aria-label="Condição de todos os marcados">
                  <span>Todos:</span>
                  {CONDICOES.map((c) => (
                    <button key={c.id} type="button" onClick={() => condicaoEmTodos([c.id])}>
                      {c.rotulo}
                    </button>
                  ))}
                  <button type="button" onClick={() => condicaoEmTodos(CONDICOES.map((c) => c.id))}>
                    As duas
                  </button>
                </div>
              )}
            </header>

            {/* o que cada condicao quer dizer, sempre a vista: e o que
                decide se o ensaio e feito uma vez ou duas */}
            <ul className="itens__explica">
              {CONDICOES.map((c) => (
                <li key={c.id}>
                  <span className="itens__sigla" data-condicao={c.id}>
                    {c.rotulo}
                  </span>{' '}
                  {c.explicacao}.
                </li>
              ))}
            </ul>

            {grupos.length === 0 ? (
              <p className="ensaios__vazio">
                Nenhum ensaio do catálogo serve para {tipoDoItem(rascunho.tipo)?.plural}.
              </p>
            ) : (
              grupos.map((g) => (
                <div key={g.chave} className="itens__grupo">
                  {grupos.length > 1 && (
                    <span className="itens__grupotitulo" data-classe={g.chave}>
                      {g.rotulo}
                    </span>
                  )}
                  <ul className="itens__opcoes">
                    {g.ensaios.map((e) => {
                      const id = String(e.id)
                      const condicoes = rascunho.ensaios[id]
                      return (
                        <li key={id} className={`itens__opcao ${condicoes ? 'is-marcado' : ''}`.trim()}>
                          <label className="itens__marca" title={e.descricao || undefined}>
                            <input type="checkbox" checked={Boolean(condicoes)} onChange={() => alternarEnsaio(id)} />
                            <span>
                              {e.nome}
                              {e.ativo === false && <em className="itens__fora"> · fora do catálogo</em>}
                              {!ensaioServeAoItem(e, rascunho.tipo) && e.ativo !== false && (
                                <em className="itens__fora"> · de {e.classificacao === 'gases' ? 'gases' : 'HVAC'}</em>
                              )}
                            </span>
                          </label>
                          {condicoes && (
                            <div className="itens__condicoes" role="group" aria-label={`Condições de ${e.nome}`}>
                              {CONDICOES.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className="itens__condicao"
                                  data-condicao={c.id}
                                  aria-pressed={condicoes.includes(c.id)}
                                  onClick={() => alternarCondicao(id, c.id)}
                                  title={
                                    condicoes.length === 1 && condicoes.includes(c.id)
                                      ? 'Ao menos uma condição. Para tirar o ensaio, desmarque-o.'
                                      : `${c.rotulo}: ${c.explicacao}`
                                  }
                                >
                                  {c.rotulo}
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))
            )}
            {errosItem.ensaios && (
              <p className="formrot__erro" role="alert">
                {errosItem.ensaios}
              </p>
            )}
          </section>

          {saemDoItem.length > 0 && (
            <p className="ensaios__aviso" role="alert">
              Ao salvar, {saemDoItem.length === 1 ? 'sai o resultado já registrado de' : `saem os ${saemDoItem.length} resultados já registrados de`}{' '}
              {saemDoItem.map((l) => `${nomeDoEnsaio(l.ensaioId)} (${rotuloDaCondicao(l.condicao)})`).join(', ')}.
            </p>
          )}

          {erro && (
            <p className="formrot__erro" role="alert">
              {erro}
            </p>
          )}

          <footer className="formobra__acoes ensaios__acoes">
            <button type="button" className="formobra__cancelar" onClick={() => setRascunho(null)}>
              Voltar
            </button>
            <Button type="submit" loading={salvando}>
              {rascunho.id ? 'Salvar item' : 'Adicionar item'}
            </Button>
          </footer>
        </form>
      ) : (
        /* ================= a lista de itens ================= */
        <div className="itens">
          <div className="itens__servico">
            <CampoSelecao
              rotulo="Serviço da obra"
              vazio="Escolha o serviço"
              value={servico}
              onChange={(e) => mudarServico(e.target.value)}
              opcoes={SERVICOS.map((s) => ({ valor: s.id, rotulo: s.rotulo }))}
              disabled={!podeEditar || salvando}
            />
          </div>

          {listaAntiga.length > 0 && (
            <p className="ensaios__aviso">
              Esta obra tinha os ensaios escolhidos pela lista ({listaAntiga.map(nomeDoEnsaio).join(', ')}).
              Ao adicionar o primeiro item, a lista passa a sair dos itens.
            </p>
          )}

          <section className="itens__lista" aria-labelledby="itens-titulo">
            <header className="ensaios__topo">
              <h3 id="itens-titulo">Itens da obra</h3>
              <span className="ensaios__conta">{itens.length}</span>
              {itens.length > 0 && (
                <span className="itens__legenda">
                  {totalLinhas} {totalLinhas === 1 ? 'linha' : 'linhas'} ·{' '}
                  {CONDICOES.map((c) => `${c.sigla} = ${c.rotulo.toLowerCase()}`).join(' · ')}
                </span>
              )}
            </header>

            {itens.length >= BUSCA_A_PARTIR_DE && (
              <input
                type="search"
                className="campo__controle itens__busca"
                placeholder="Procurar item, TAG ou gás"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Procurar item"
              />
            )}

            {itens.length === 0 ? (
              <p className="ensaios__vazio itens__vazio">
                {podeEditar
                  ? 'Cadastre o que vai ser ensaiado: ambientes, equipamentos com TAG, sistemas e pontos de uso.'
                  : 'Nenhum item planejado ainda.'}
              </p>
            ) : (
              <ul className="itens__cards">
                {visiveis.map((item) => {
                  const linhas = item.linhas ?? []
                  const feitas = linhas.filter(linhaFeita).length
                  const porEnsaio = []
                  for (const l of linhas) {
                    const achado = porEnsaio.find((x) => x.ensaioId === l.ensaioId)
                    if (achado) achado.condicoes.push(l.condicao)
                    else porEnsaio.push({ ensaioId: l.ensaioId, condicoes: [l.condicao] })
                  }
                  return (
                    <li key={item.id} className="itens__card">
                      <div className="itens__cabeca">
                        <span className="itens__tipo" data-tipo={item.tipo}>
                          {tipoDoItem(item.tipo)?.rotulo}
                        </span>
                        <strong className="itens__nome">{nomeDoItem(item)}</strong>
                        {feitas > 0 && (
                          <span className="ensaio__selo" title="Linhas com resultado registrado">
                            {feitas} de {linhas.length} feitas
                          </span>
                        )}
                        {podeEditar && (
                          <span className="itens__acoes">
                            <button type="button" className="catalogo__botao" onClick={() => editar(item)} disabled={salvando}>
                              Editar
                            </button>
                            <button type="button" className="catalogo__botao" onClick={() => duplicar(item)} disabled={salvando}>
                              Duplicar
                            </button>
                            <button
                              type="button"
                              className="catalogo__botao catalogo__botao--perigo"
                              onClick={() => setRemovendo(item)}
                              disabled={salvando}
                            >
                              Remover
                            </button>
                          </span>
                        )}
                      </div>
                      {porEnsaio.length === 0 ? (
                        <p className="itens__semensaio">Sem ensaio: edite o item para escolher.</p>
                      ) : (
                        <ul className="itens__resumo">
                          {porEnsaio.map((e) => (
                            <li key={e.ensaioId}>
                              <span>{nomeDoEnsaio(e.ensaioId)}</span>
                              {CONDICOES.filter((c) => e.condicoes.includes(c.id)).map((c) => (
                                <abbr key={c.id} className="itens__sigla" data-condicao={c.id} title={c.rotulo}>
                                  {c.sigla}
                                </abbr>
                              ))}
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.observacao && <p className="itens__obs">{item.observacao}</p>}
                    </li>
                  )
                })}
                {visiveis.length === 0 && <li className="ensaios__vazio">Nenhum item com “{busca.trim()}”.</li>}
              </ul>
            )}

            {podeEditar && (
              <button type="button" className="itens__novo" onClick={novoItem} disabled={salvando}>
                + Adicionar item
              </button>
            )}
          </section>

          {podeEditar && !marcado && falta && itens.length > 0 && (
            <p className="formrot__dica formrot__dica--colada">Para concluir: {falta}</p>
          )}

          {erro && (
            <p className="formrot__erro" role="alert">
              {erro}
            </p>
          )}

          <footer className="formobra__acoes ensaios__acoes">
            {pode('gerenciar_ensaios') && (
              <button
                type="button"
                className="ensaios__catalogo"
                onClick={() => setGerenciar(true)}
                title="Adicionar, renomear ou excluir ensaios do catálogo"
              >
                Gerenciar ensaios
              </button>
            )}
            {podeEditar && marcado && (
              <button
                type="button"
                className="formobra__cancelar"
                onClick={async () => {
                  await aoDesmarcar()
                  aoFechar()
                }}
              >
                Reabrir o check
              </button>
            )}
            <button type="button" className="formobra__cancelar" onClick={aoFechar}>
              Fechar
            </button>
            {podeEditar && !marcado && (
              <Button
                type="button"
                loading={salvando}
                disabled={Boolean(falta)}
                title={falta || undefined}
                onClick={async () => {
                  if (await concluir()) aoFechar()
                }}
              >
                Concluir planejamento
              </Button>
            )}
          </footer>
        </div>
      )}

      <Confirma
        aberto={Boolean(removendo)}
        nivel={1}
        titulo="Remover item"
        mensagem={removendo ? `Remover "${nomeDoItem(removendo)}" e os ensaios dele?` : ''}
        aviso={(() => {
          const feitas = (removendo?.linhas ?? []).filter(linhaFeita).length
          if (feitas === 0) return undefined
          return feitas === 1
            ? 'O resultado já registrado neste item será apagado.'
            : `Os ${feitas} resultados já registrados neste item serão apagados.`
        })()}
        rotuloConfirmar="Remover"
        aoConfirmar={remover}
        aoFechar={() => setRemovendo(null)}
      />

      <ModalEnsaios aberto={gerenciar} aoFechar={() => setGerenciar(false)} />
    </Modal>
  )
}
