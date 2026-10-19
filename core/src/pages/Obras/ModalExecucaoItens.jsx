import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoArea, CampoPastilhas, CampoTexto } from '@/components/Campo/Campo'
import { CampoData } from '@/components/CampoData/CampoData'
import { useDados } from '@/context/DadosContext'
import { diasAte, diasDaExecucao, resumoDosDias } from '@/domain/obras'
import { LIMITES_ITEM, linhaFeita, nomeDoItem, resumoDasLinhas, rotuloDaCondicao } from '@/domain/itensEnsaio'
import { dataBR, hojeISO } from '@/utils/formato'
import './ModalEnsaios.css'
import './ModalItens.css'

/* acima disto a lista ganha a busca */
const BUSCA_A_PARTIR_DE = 8

const FILTROS = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'pendentes', rotulo: 'Pendentes' },
  { id: 'feitas', rotulo: 'Feitas' },
  { id: 'nao_conformes', rotulo: 'Não conformes' },
]

const passa = (filtro, l) =>
  filtro === 'pendentes'
    ? !linhaFeita(l)
    : filtro === 'feitas'
      ? linhaFeita(l)
      : filtro === 'nao_conformes'
        ? linhaFeita(l) && l.conforme === false
        : true

/** Quanto falta para o prazo da execucao — o mesmo texto da execucao dia a dia. */
function textoDoPrazo(restam) {
  if (restam < 0) return `atrasada há ${-restam} dia${restam < -1 ? 's' : ''}`
  if (restam === 0) return 'vence hoje'
  if (restam === 1) return 'vence amanhã'
  return `faltam ${restam} dias`
}

const quando = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * EXECUCAO DOS ENSAIOS POR LINHA — o check do Time Tecnico na 3a
 * etapa, na obra que planeja por item.
 *
 * Cada LINHA (item + ensaio + condicao) recebe o resultado: a data em
 * que foi feita, o valor medido, se ficou conforme e uma observacao.
 * Como encontrado e Como certificado sao linhas separadas — da para comparar
 * o antes e o depois dos ajustes.
 *
 * "Nao conforme" e resultado, nao pendencia: a linha conta como feita.
 * O % da execucao e a parte das linhas feitas, e o check so fecha com
 * todas — o servidor recusa do mesmo jeito.
 *
 * A data segue a execucao dia a dia: precisa do prazo da execucao,
 * nao vem antes da entrada em campo e nao passa de hoje.
 */
export default function ModalExecucaoItens({
  aberto,
  obra,
  /* registra e conclui: quem marca o check (o setor dele) */
  podeEditar,
  marcado,
  /* quem pode definir o periodo (definir_prazos) */
  podePeriodo,
  aoDefinirPeriodo,
  aoConcluir,
  aoDesmarcar,
  aoFechar,
}) {
  const { ensaioPorId, registrarLinhas } = useDados()
  const hoje = hojeISO()

  const [filtro, setFiltro] = useState('todas')
  const [busca, setBusca] = useState('')
  /* null = a lista; { linhaId, ... } = registrando uma linha */
  const [form, setForm] = useState(null)
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setForm(null)
    setErros({})
    setErro('')
    setBusca('')
    /* abre nas pendentes quando ainda ha alguma: e o que se vem fazer */
    const resumo = resumoDasLinhas(obra?.itens)
    setFiltro(resumo.feitas < resumo.total ? 'pendentes' : 'todas')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, obra?.id])

  const itens = useMemo(() => obra?.itens ?? [], [obra])
  const resumo = resumoDasLinhas(itens)
  /* todas as linhas, na ordem do planejamento, cada uma com o item dela */
  const todas = useMemo(
    () => itens.flatMap((item) => (item.linhas ?? []).map((linha) => ({ item, linha }))),
    [itens],
  )

  const planejados = useMemo(() => (obra ? diasDaExecucao(obra) : []), [obra])
  const inicio = planejados[0] ?? obra?.execucaoInicio ?? obra?.dataInicio ?? null
  const prazo = obra?.execucaoPrazo ?? null
  const semPrazo = !prazo
  const restam = prazo ? diasAte(prazo, hoje) : null
  const registra = podeEditar && !semPrazo

  const nomeDoEnsaio = (id) => ensaioPorId(id)?.nome ?? 'Ensaio removido'

  /* ---- o formulario de uma linha ---- */
  const abrir = (item, linha, dataSugerida) => {
    setForm({
      linhaId: linha.id,
      item,
      linha,
      data: linha.data ?? dataSugerida ?? (hoje >= (inicio ?? hoje) ? hoje : ''),
      resultado: linha.resultado ?? '',
      conforme: linha.conforme === true ? 'sim' : linha.conforme === false ? 'nao' : '',
      observacao: linha.observacao ?? '',
    })
    setErros({})
    setErro('')
  }

  const mudar = (campo) => (e) => {
    const valor = e?.target ? e.target.value : e
    setForm((f) => ({ ...f, [campo]: valor }))
    setErros((x) => ({ ...x, [campo]: undefined }))
  }

  /* a proxima linha pendente depois desta, na ordem do planejamento */
  const proximaPendente = (linhaId) => {
    const posicao = todas.findIndex((x) => x.linha.id === linhaId)
    return [...todas.slice(posicao + 1), ...todas.slice(0, posicao)].find(
      (x) => x.linha.id !== linhaId && !linhaFeita(x.linha),
    )
  }

  const salvar = async (seguir) => {
    const e = {}
    if (!form.data) e.data = 'Escolha a data em que o ensaio foi feito.'
    else if (inicio && form.data < inicio) e.data = `O período de execução começa em ${dataBR(inicio)}.`
    else if (form.data > hoje) e.data = 'A data ainda não chegou.'
    if (!form.resultado.trim()) e.resultado = 'Informe o resultado medido.'
    if (!form.conforme) e.conforme = 'Diga se ficou conforme.'
    setErros(e)
    if (Object.keys(e).length > 0) return

    const proxima = seguir ? proximaPendente(form.linhaId) : null
    const data = form.data
    setSalvando(true)
    setErro('')
    try {
      await registrarLinhas(obra.id, [
        {
          id: form.linhaId,
          data,
          resultado: form.resultado.trim(),
          conforme: form.conforme === 'sim',
          observacao: form.observacao.trim(),
        },
      ])
      /* "Salvar e próxima": a mesma data, que costuma ser o mesmo dia de campo */
      if (proxima) abrir(proxima.item, proxima.linha, data)
      else setForm(null)
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  const apagar = async () => {
    setSalvando(true)
    setErro('')
    try {
      await registrarLinhas(obra.id, [{ id: form.linhaId, apagar: true }])
      setForm(null)
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  const termo = busca.trim().toLowerCase()
  const grupos = itens
    .map((item) => ({
      item,
      linhas: (item.linhas ?? []).filter(
        (l) =>
          passa(filtro, l) &&
          (!termo || `${nomeDoItem(item)} ${nomeDoEnsaio(l.ensaioId)}`.toLowerCase().includes(termo)),
      ),
    }))
    .filter((g) => g.linhas.length > 0)

  const contagem = {
    todas: resumo.total,
    pendentes: resumo.total - resumo.feitas,
    feitas: resumo.feitas,
    nao_conformes: resumo.naoConformes,
  }

  const completo = resumo.total > 0 && resumo.feitas === resumo.total

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={form ? 'Resultado do ensaio' : 'Execução dos ensaios'}
      largura={760}
    >
      {form ? (
        /* ================= o resultado de uma linha ================= */
        <form
          className="itens itens--editor"
          onSubmit={(e) => {
            e.preventDefault()
            salvar(false)
          }}
          noValidate
        >
          <div className="linha__sobre">
            <span className="itens__tipo" data-tipo={form.item.tipo}>
              {nomeDoItem(form.item)}
            </span>
            <strong>{nomeDoEnsaio(form.linha.ensaioId)}</strong>
            <span className="itens__condicao" data-condicao={form.linha.condicao} aria-pressed="true">
              {rotuloDaCondicao(form.linha.condicao)}
            </span>
          </div>

          {registra ? (
            <>
              <div className="itens__par">
                <CampoData
                  rotulo="Data"
                  valor={form.data}
                  aoMudar={mudar('data')}
                  min={inicio ?? undefined}
                  max={hoje}
                  erro={erros.data}
                />
                <CampoPastilhas
                  rotulo="Ficou conforme?"
                  valor={form.conforme}
                  aoMudar={mudar('conforme')}
                  opcoes={[
                    { valor: 'sim', rotulo: 'Conforme', tom: 'conforme' },
                    { valor: 'nao', rotulo: 'Não conforme', tom: 'nao-conforme' },
                  ]}
                  erro={erros.conforme}
                />
              </div>
              <CampoTexto
                rotulo="Resultado"
                maxLength={LIMITES_ITEM.resultado}
                placeholder="O valor medido, com a unidade. Ex.: 0,45 m/s"
                value={form.resultado}
                onChange={mudar('resultado')}
                erro={erros.resultado}
              />
              <CampoArea
                rotulo="Observação (opcional)"
                linhas={2}
                maxLength={LIMITES_ITEM.observacao}
                value={form.observacao}
                onChange={mudar('observacao')}
              />
            </>
          ) : (
            <dl className="linha__lida">
              <div>
                <dt>Situação</dt>
                <dd>
                  {!linhaFeita(form.linha) ? 'Pendente' : form.linha.conforme ? 'Conforme' : 'Não conforme'}
                </dd>
              </div>
              {linhaFeita(form.linha) && (
                <>
                  <div>
                    <dt>Data</dt>
                    <dd>{dataBR(form.linha.data)}</dd>
                  </div>
                  <div>
                    <dt>Resultado</dt>
                    <dd>{form.linha.resultado}</dd>
                  </div>
                  {form.linha.observacao && (
                    <div>
                      <dt>Observação</dt>
                      <dd>{form.linha.observacao}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          )}

          {linhaFeita(form.linha) && (form.linha.registradoPorNome || form.linha.registradoEm) && (
            <p className="formrot__dica formrot__dica--colada">
              Registrado{form.linha.registradoPorNome ? ` por ${form.linha.registradoPorNome}` : ''}
              {form.linha.registradoEm ? ` em ${quando(form.linha.registradoEm)}` : ''}.
            </p>
          )}

          {erro && (
            <p className="formrot__erro" role="alert">
              {erro}
            </p>
          )}

          <footer className="formobra__acoes ensaios__acoes">
            {registra && linhaFeita(form.linha) && (
              <button type="button" className="ensaios__catalogo linha__apagar" onClick={apagar} disabled={salvando}>
                Apagar resultado
              </button>
            )}
            <button type="button" className="formobra__cancelar" onClick={() => setForm(null)}>
              Voltar
            </button>
            {registra && (
              <>
                {proximaPendente(form.linhaId) && (
                  <Button type="button" variant="ghost" loading={salvando} onClick={() => salvar(true)}>
                    Salvar e próxima
                  </Button>
                )}
                <Button type="submit" loading={salvando}>
                  Salvar
                </Button>
              </>
            )}
          </footer>
        </form>
      ) : (
        /* ================= a lista de linhas ================= */
        <div className="execucao">
          <div className="execucao__periodo" data-tom={semPrazo ? 'vencido' : undefined}>
            <span className="execucao__rotulo">Período de execução</span>
            {semPrazo ? (
              <strong>Sem prazo da execução</strong>
            ) : (
              <strong title={resumoDosDias(planejados)}>
                {dataBR(inicio)} → {dataBR(prazo)} · {planejados.length} {planejados.length > 1 ? 'dias' : 'dia'}
              </strong>
            )}
            {!semPrazo && <em className="execucao__selo">{textoDoPrazo(restam)}</em>}
            {podePeriodo && (
              <button type="button" className="execucao__periodobotao" onClick={aoDefinirPeriodo}>
                {semPrazo ? 'Definir período' : 'Alterar período'}
              </button>
            )}
          </div>

          {semPrazo && (
            <p className="ensaios__aviso" role="alert">
              A execução precisa do prazo dela: sem ele não há período para registrar.{' '}
              {podePeriodo ? 'Defina o período acima.' : 'Peça a quem pode definir prazos para preenchê-lo.'}
            </p>
          )}

          {resumo.total === 0 ? (
            <p className="ensaios__vazio">
              Nenhum ensaio foi planejado para esta obra. Os itens e os ensaios são escolhidos no check
              "Planejamento de ensaios", na 1ª etapa.
            </p>
          ) : (
            <>
              <section className="execucao__geral">
                <header>
                  <span className="execucao__rotulo">Execução geral</span>
                  <strong>{resumo.percentual}%</strong>
                </header>
                <span className="execucao__barra" role="img" aria-label={`${resumo.percentual}% executado`}>
                  <span style={{ width: `${resumo.percentual}%` }} />
                </span>
                <p className="linhas__conta">
                  {resumo.feitas} de {resumo.total} {resumo.total === 1 ? 'linha feita' : 'linhas feitas'}
                  {resumo.naoConformes > 0 && (
                    <>
                      {' · '}
                      <b className="linhas__nc">
                        {resumo.naoConformes} não conforme{resumo.naoConformes > 1 ? 's' : ''}
                      </b>
                    </>
                  )}
                </p>
              </section>

              <div className="linhas__filtros" role="tablist" aria-label="Mostrar">
                {FILTROS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={filtro === f.id}
                    className="linhas__filtro"
                    data-filtro={f.id}
                    onClick={() => setFiltro(f.id)}
                  >
                    {f.rotulo} <span>{contagem[f.id]}</span>
                  </button>
                ))}
              </div>

              {itens.length >= BUSCA_A_PARTIR_DE && (
                <input
                  type="search"
                  className="campo__controle itens__busca"
                  placeholder="Procurar item ou ensaio"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  aria-label="Procurar item ou ensaio"
                />
              )}

              {grupos.length === 0 ? (
                <p className="ensaios__vazio">
                  {filtro === 'pendentes'
                    ? 'Nenhuma linha pendente.'
                    : filtro === 'nao_conformes'
                      ? 'Nenhuma linha não conforme.'
                      : 'Nada encontrado.'}
                </p>
              ) : (
                <div className="linhas">
                  {grupos.map(({ item, linhas }) => {
                    const total = (item.linhas ?? []).length
                    const feitas = (item.linhas ?? []).filter(linhaFeita).length
                    return (
                      <section key={item.id} className="linhas__item" aria-label={nomeDoItem(item)}>
                        <header className="linhas__cabeca">
                          <span className="itens__tipo" data-tipo={item.tipo}>
                            {nomeDoItem(item)}
                          </span>
                          <span className="linhas__fracao" data-pronto={feitas === total ? 'sim' : undefined}>
                            {feitas}/{total}
                          </span>
                        </header>
                        <ul className="linhas__lista">
                          {linhas.map((l) => {
                            const feita = linhaFeita(l)
                            const situacao = !feita ? 'pendente' : l.conforme ? 'conforme' : 'nao-conforme'
                            return (
                              <li key={l.id}>
                                <button
                                  type="button"
                                  className="linha"
                                  data-situacao={situacao}
                                  onClick={() => abrir(item, l)}
                                >
                                  <span className="linha__ensaio">{nomeDoEnsaio(l.ensaioId)}</span>
                                  <span className="itens__sigla" data-condicao={l.condicao}>
                                    {rotuloDaCondicao(l.condicao)}
                                  </span>
                                  <span className="linha__situacao">
                                    {!feita ? (
                                      registra ? 'Registrar' : 'Pendente'
                                    ) : (
                                      <>
                                        <b>{l.conforme ? '✓' : '✗'}</b> {l.resultado}
                                        <small> · {dataBR(l.data).slice(0, 5)}</small>
                                      </>
                                    )}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {podeEditar && !marcado && resumo.total > 0 && !completo && (
            <p className="formrot__dica formrot__dica--colada">
              O check só fecha com todas as linhas registradas. Faltam {resumo.total - resumo.feitas}.
            </p>
          )}

          {erro && (
            <p className="formrot__erro" role="alert">
              {erro}
            </p>
          )}

          <footer className="formobra__acoes">
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
                disabled={!completo || semPrazo}
                title={completo ? undefined : 'Só conclui com todas as linhas registradas'}
                onClick={async () => {
                  await aoConcluir()
                  aoFechar()
                }}
              >
                Concluir execução dos ensaios
              </Button>
            )}
          </footer>
        </div>
      )}
    </Modal>
  )
}
