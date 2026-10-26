import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Seletor from '@/components/Seletor/Seletor'
import { useDados } from '@/context/DadosContext'
import { corPorId, diaDaSemana, diasEntre, domingoDe, minutosDoTurno, somarDias } from '@/domain/turnos'
import * as turnosApi from '@/services/turnosService'
import { hojeISO } from '@/utils/formato'
import ModalTurno from './ModalTurno'
import ModalCronograma from './ModalCronograma'
import ModalAnotacao from './ModalAnotacao'
import './Turnos.css'

/* ============================================================
   TURNOS — a escala da equipe, no desenho dos Turnos do Teams

   No alto, o periodo (Hoje, as setas e "25 de outubro – 7 de novembro
   de 2026") e a visao (uma ou duas semanas). Embaixo, a grade:

     a linha dos dias     o dia, quantas pessoas trabalham e as horas;
     Anotacoes do dia     um recado por dia (quem edita escreve);
     os CRONOGRAMAS       Cronograma LWN, Cronograma Anapolis... (e os
                          que vierem), cada um abre e fecha. Dentro, os
                          "Turnos abertos" (ainda sem pessoa) e uma
                          linha por pessoa, com as horas do periodo.

   O turno e um bloco de fundo transparente, so com a BORDA na cor dele.
   O que cobre varios dias (a folga de 13/10 a 27/10) atravessa os dias.
   Varios no mesmo dia empilham.

   Os turnos vem de dois lugares: os criados aqui (a mao, ou a partir
   de uma tarefa de obra) e o check com horario das obras — o ponto de
   encontro de cada data, para cada pessoa daquele dia. Este muda pela
   obra; clicar nele mostra de onde vem.

   Quem tem `editar_turnos` clica num dia vazio para criar, num turno
   para editar, na anotacao para escrever, e cria e edita cronogramas.
   ============================================================ */

const SEMANA = ['do', 'se', 'te', 'qu', 'qu', 'se', 'sá']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const VISOES = [
  { valor: 'semana', rotulo: 'Semana', dias: 7 },
  { valor: 'duas', rotulo: 'Duas semanas', dias: 14 },
]

const CHAVE_VISAO = 'atmosfera.turnos.visao'
const CHAVE_FECHADOS = 'atmosfera.turnos.fechados'

function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave)
    return bruto === null ? padrao : JSON.parse(bruto)
  } catch {
    return padrao
  }
}

function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    /* modo privado: so nao lembra */
  }
}

const partes = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return { a, m, d }
}

/** "25 de outubro – 7 de novembro de 2026" (o mes e o ano so aparecem quando mudam). */
function rotuloDoPeriodo(de, ate) {
  const x = partes(de)
  const y = partes(ate)
  if (x.a !== y.a) return `${x.d} de ${MESES[x.m - 1]} de ${x.a} – ${y.d} de ${MESES[y.m - 1]} de ${y.a}`
  if (x.m !== y.m) return `${x.d} de ${MESES[x.m - 1]} – ${y.d} de ${MESES[y.m - 1]} de ${y.a}`
  return `${x.d} – ${y.d} de ${MESES[y.m - 1]} de ${y.a}`
}

/** 2981 h -> "2.981 H"; 9,5 h -> "9,5 H". */
const emHoras = (minutos) => `${(minutos / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} H`

const curta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Cada turno no seu lugar da linha: as colunas (do primeiro ao ultimo
 * dia que aparece) e a FAIXA — turnos que se cruzam vao para faixas
 * diferentes, um embaixo do outro.
 */
function colocar(turnos, dias) {
  const ultimo = dias.length - 1
  const lista = turnos
    .map((turno) => ({
      turno,
      ini: Math.max(0, diasEntre(dias[0], turno.dataInicio)),
      fim: Math.min(ultimo, diasEntre(dias[0], turno.dataFim)),
    }))
    .filter((c) => c.ini <= ultimo && c.fim >= 0 && c.ini <= c.fim)
    .sort((a, b) => a.ini - b.ini || b.fim - b.ini - (a.fim - a.ini) || String(a.turno.horaInicio ?? '').localeCompare(String(b.turno.horaInicio ?? '')))
  const fimDaFaixa = []
  lista.forEach((c) => {
    let faixa = fimDaFaixa.findIndex((fim) => fim < c.ini)
    if (faixa === -1) faixa = fimDaFaixa.length
    fimDaFaixa[faixa] = c.fim
    c.faixa = faixa
  })
  return { colocados: lista, faixas: Math.max(1, fimDaFaixa.length) }
}

/** Os minutos de um turno dentro do periodo (as horas de cada dia que aparece). */
function minutosNoPeriodo(turno, dias) {
  const ini = turno.dataInicio > dias[0] ? turno.dataInicio : dias[0]
  const fim = turno.dataFim < dias.at(-1) ? turno.dataFim : dias.at(-1)
  if (fim < ini) return 0
  return minutosDoTurno(turno) * (diasEntre(ini, fim) + 1)
}

const IconePessoas = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 6a3 3 0 0 1 0 5.6M17.5 14a5.5 5.5 0 0 1 3 5" />
  </svg>
)

const IconeSeta = ({ esquerda }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={esquerda ? 'M19 12H5M11 6l-6 6 6 6' : 'M5 12h14M13 6l6 6-6 6'} />
  </svg>
)

/** Uma linha da grade: a coluna de quem (presa a esquerda) e os dias, com os turnos por cima. */
function Linha({ quem, turnos, dias, hoje, edita, aoCriar, aoAbrir }) {
  const { colocados, faixas } = colocar(turnos, dias)
  return (
    <div className="turnos__linha">
      <div className="turnos__canto">{quem}</div>
      <div className="turnos__faixa" style={{ gridTemplateRows: `repeat(${faixas}, minmax(64px, auto))` }}>
        {dias.map((dia, i) => {
          const classe = `turnos__celula ${dia === hoje ? 'is-hoje' : ''}`.trim()
          const lugar = { gridColumn: i + 1, gridRow: `1 / span ${faixas}` }
          /* o dia vazio: quem edita clica nele para criar o turno */
          return edita ? (
            <button
              key={dia}
              type="button"
              className={classe}
              style={lugar}
              onClick={() => aoCriar(dia)}
              aria-label={`Novo turno em ${curta(dia)}`}
            />
          ) : (
            <div key={dia} className={classe} style={lugar} />
          )
        })}
        {colocados.map(({ turno, ini, fim, faixa }) => {
          const varios = turno.dataInicio !== turno.dataFim
          const linha2 = turno.subtitulo || (varios ? `${curta(turno.dataInicio)} – ${curta(turno.dataFim)}` : '')
          const hora = turno.horaInicio ? (turno.horaFim ? `${turno.horaInicio} – ${turno.horaFim}` : turno.horaInicio) : ''
          return (
            <button
              key={turno.id}
              type="button"
              className={`turno ${turno.origem === 'obra' ? 'is-obra' : ''}`.trim()}
              style={{ gridColumn: `${ini + 1} / ${fim + 2}`, gridRow: faixa + 1, '--turno-cor': corPorId(turno.cor).cor }}
              onClick={() => aoAbrir(turno)}
              title={[turno.titulo, turno.subtitulo, varios ? `${curta(turno.dataInicio)} – ${curta(turno.dataFim)}` : '', hora]
                .filter(Boolean)
                .join(' · ')}
            >
              <strong>{turno.titulo}</strong>
              {linha2 && <span>{linha2}</span>}
              {hora && <em>{hora}</em>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function Turnos() {
  const { pode, pessoaPorId } = useDados()
  const edita = pode('editar_turnos')
  const hoje = hojeISO()

  const [visao, setVisao] = useState(() => (ler(CHAVE_VISAO, 'duas') === 'semana' ? 'semana' : 'duas'))
  const [inicio, setInicio] = useState(() => domingoDe(hoje))
  const nDias = VISOES.find((v) => v.valor === visao)?.dias ?? 14
  const dias = useMemo(() => Array.from({ length: nDias }, (_, i) => somarDias(inicio, i)), [inicio, nDias])

  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [fechados, setFechados] = useState(() => new Set(ler(CHAVE_FECHADOS, [])))
  /* os pop-ups: o turno ({ turno } ou { base }), a anotacao (o dia) e o cronograma ('novo' ou ele) */
  const [editando, setEditando] = useState(null)
  const [anotando, setAnotando] = useState(null)
  const [cronograma, setCronograma] = useState(null)

  const de = dias[0]
  const ate = dias.at(-1)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try {
      setDados(await turnosApi.carregar(de, ate))
      setErro('')
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [de, ate])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  const mudarVisao = (valor) => {
    setVisao(valor)
    guardar(CHAVE_VISAO, valor)
  }

  const alternar = (id) => {
    setFechados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      guardar(CHAVE_FECHADOS, [...novo])
      return novo
    })
  }

  /* ---- as contas da grade ---- */
  const contas = useMemo(() => {
    if (!dados) return null
    const turnos = dados.turnos ?? []
    const daLinha = (cronogramaId, usuarioId) =>
      turnos.filter((t) =>
        usuarioId
          ? t.usuarioId === usuarioId && (t.origem === 'obra' || t.cronogramaId === cronogramaId)
          : !t.usuarioId && t.cronogramaId === cronogramaId,
      )

    /* por dia: horas e pessoas, sem contar duas vezes o turno da obra
       que aparece em mais de um cronograma */
    const porDia = Object.fromEntries(dias.map((d) => [d, { minutos: 0, pessoas: new Set() }]))
    turnos.forEach((t) => {
      if (!t.usuarioId) return
      dias.forEach((d) => {
        if (d < t.dataInicio || d > t.dataFim) return
        porDia[d].minutos += minutosDoTurno(t)
        porDia[d].pessoas.add(t.usuarioId)
      })
    })

    const grupos = (dados.cronogramas ?? []).map((c) => {
      const pessoas = c.membros.map((id) => {
        const lista = daLinha(c.id, id)
        return { id, turnos: lista, minutos: lista.reduce((s, t) => s + minutosNoPeriodo(t, dias), 0) }
      })
      return {
        ...c,
        abertos: daLinha(c.id, null),
        pessoas,
        minutos: pessoas.reduce((s, p) => s + p.minutos, 0),
      }
    })

    return {
      porDia,
      grupos,
      total: Object.values(porDia).reduce((s, d) => s + d.minutos, 0),
    }
  }, [dados, dias])

  const novoTurno = (base) => setEditando({ base })
  const visaoAtual = VISOES.find((v) => v.valor === visao)

  return (
    <AppShell>
      <section className="turnos">
        <header className="turnos__topo">
          <h1 className="tela__titulo">Turnos</h1>
          <div className="turnos__barra">
            <button type="button" className="turnos__hoje" onClick={() => setInicio(domingoDe(hoje))}>
              Hoje
            </button>
            <button
              type="button"
              className="turnos__passo"
              onClick={() => setInicio(somarDias(inicio, -nDias))}
              aria-label="Período anterior"
              title="Período anterior"
            >
              <IconeSeta esquerda />
            </button>
            <button
              type="button"
              className="turnos__passo"
              onClick={() => setInicio(somarDias(inicio, nDias))}
              aria-label="Próximo período"
              title="Próximo período"
            >
              <IconeSeta />
            </button>
            <span className="turnos__periodo">{rotuloDoPeriodo(de, ate)}</span>
            {carregando && dados && <span className="turnos__lendo">Atualizando...</span>}

            <span className="turnos__espaco" />

            <div className="turnos__visao">
              <Seletor
                valor={visao}
                aoMudar={mudarVisao}
                opcoes={VISOES.map((v) => ({ valor: v.valor, rotulo: v.rotulo }))}
                aria-label="Visão"
              />
            </div>
            {edita && (
              <button type="button" className="ferramenta" onClick={() => setCronograma('novo')}>
                + Cronograma
              </button>
            )}
            {edita && (dados?.cronogramas?.length ?? 0) > 0 && (
              <button
                type="button"
                className="acao acao--padrao"
                onClick={() =>
                  novoTurno({
                    cronogramaId: dados.cronogramas[0].id,
                    usuarioId: null,
                    dia: hoje >= de && hoje <= ate ? hoje : de,
                  })
                }
              >
                + Turno
              </button>
            )}
          </div>
        </header>

        {erro && (
          <p className="formdesp__erro" role="alert">
            {erro}
          </p>
        )}

        {!contas ? (
          !erro && <p className="turnos__vazio">Carregando os turnos...</p>
        ) : (
          <div className="turnos__quadro" style={{ '--dias': nDias }}>
            <div className="turnos__grade">
              {/* os dias: o numero, o dia da semana, quantas pessoas e quantas horas */}
              <div className="turnos__linha turnos__linha--dias">
                <div className="turnos__canto turnos__total">
                  {visaoAtual?.rotulo}: <strong>{emHoras(contas.total)}</strong>
                </div>
                <div className="turnos__faixa">
                  {dias.map((d) => {
                    const dia = contas.porDia[d]
                    return (
                      <div key={d} className={`turnos__dia ${d === hoje ? 'is-hoje' : ''}`.trim()}>
                        <span className="turnos__numero">{Number(d.slice(8, 10))}</span>
                        <span className="turnos__pessoas" title={`${dia.pessoas.size} pessoas`}>
                          <IconePessoas />
                          {dia.pessoas.size}
                        </span>
                        <span className="turnos__semana">{SEMANA[diaDaSemana(d)]}</span>
                        <span className="turnos__horas">{emHoras(dia.minutos)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* as anotacoes do dia */}
              <div className="turnos__linha turnos__linha--notas">
                <div className="turnos__canto turnos__rotulo">Anotações do dia</div>
                <div className="turnos__faixa">
                  {dias.map((d) => {
                    const texto = dados.anotacoes?.[d] ?? ''
                    return edita ? (
                      <button
                        key={d}
                        type="button"
                        className={`turnos__nota ${d === hoje ? 'is-hoje' : ''}`.trim()}
                        onClick={() => setAnotando(d)}
                        title={texto || 'Escrever a anotação do dia'}
                      >
                        {texto}
                      </button>
                    ) : (
                      <div key={d} className={`turnos__nota ${d === hoje ? 'is-hoje' : ''}`.trim()} title={texto || undefined}>
                        {texto}
                      </div>
                    )
                  })}
                </div>
              </div>

              {contas.grupos.length === 0 && (
                <p className="turnos__vazio">Nenhum cronograma ainda.{edita ? ' Crie o primeiro no "+ Cronograma".' : ''}</p>
              )}

              {/* os cronogramas */}
              {contas.grupos.map((g) => {
                const aberto = !fechados.has(g.id)
                return (
                  <div key={g.id} className={`turnos__grupo ${aberto ? 'is-aberto' : ''}`.trim()}>
                    <div className="turnos__grupotopo">
                      <button type="button" className="turnos__abrir" onClick={() => alternar(g.id)} aria-expanded={aberto}>
                        <span className="turnos__caret" aria-hidden="true">
                          ▸
                        </span>
                        <strong>{g.nome}</strong>
                        <span className="turnos__info">{emHoras(g.minutos)}</span>
                        <span className="turnos__info">
                          <IconePessoas />
                          {g.pessoas.length}
                        </span>
                      </button>
                      {edita && (
                        <button type="button" className="turnos__editar" onClick={() => setCronograma(g)}>
                          Editar
                        </button>
                      )}
                    </div>

                    {aberto && (
                      <>
                        <Linha
                          quem={
                            <span className="turnos__quem">
                              <span className="turnos__aberto" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                  <path d="M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2M12 8v4l2 2" />
                                </svg>
                              </span>
                              <span className="turnos__nome">
                                <strong>Turnos abertos</strong>
                                <em>
                                  {g.abertos.length} turno{g.abertos.length === 1 ? '' : 's'}
                                </em>
                              </span>
                            </span>
                          }
                          turnos={g.abertos}
                          dias={dias}
                          hoje={hoje}
                          edita={edita}
                          aoCriar={(dia) => novoTurno({ cronogramaId: g.id, usuarioId: null, dia })}
                          aoAbrir={(turno) => setEditando({ turno })}
                        />
                        {g.pessoas.map((p) => {
                          const pessoa = pessoaPorId(p.id)
                          return (
                            <Linha
                              key={p.id}
                              quem={
                                <span className="turnos__quem">
                                  <Avatar nome={pessoa?.nome} foto={pessoa?.foto} tamanho={34} titulo={pessoa?.nome} />
                                  <span className="turnos__nome">
                                    <strong title={pessoa?.nome}>{pessoa?.nome ?? 'Pessoa'}</strong>
                                    <em>{emHoras(p.minutos)}</em>
                                  </span>
                                </span>
                              }
                              turnos={p.turnos}
                              dias={dias}
                              hoje={hoje}
                              edita={edita}
                              aoCriar={(dia) => novoTurno({ cronogramaId: g.id, usuarioId: p.id, dia })}
                              aoAbrir={(turno) => setEditando({ turno })}
                            />
                          )
                        })}
                        {g.pessoas.length === 0 && (
                          <p className="turnos__semgente">
                            Ninguém neste cronograma.{edita ? ' Adicione as pessoas no "Editar".' : ''}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <ModalTurno
        aberto={Boolean(editando)}
        turno={editando?.turno ?? null}
        base={editando?.base ?? null}
        cronogramas={dados?.cronogramas ?? []}
        edita={edita}
        aoFechar={() => setEditando(null)}
        aoSalvo={recarregar}
      />

      <ModalAnotacao
        aberto={Boolean(anotando)}
        dia={anotando}
        texto={anotando ? (dados?.anotacoes?.[anotando] ?? '') : ''}
        aoFechar={() => setAnotando(null)}
        aoSalvo={recarregar}
      />

      <ModalCronograma
        aberto={Boolean(cronograma)}
        cronograma={cronograma === 'novo' ? null : cronograma}
        aoFechar={() => setCronograma(null)}
        aoSalvo={recarregar}
      />
    </AppShell>
  )
}
