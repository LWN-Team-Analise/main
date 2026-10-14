import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Modal from '@/components/Modal/Modal'
import { useDados } from '@/context/DadosContext'
import { tituloDaObra } from '@/domain/obras'
import { dataBR, dataHora } from '@/utils/formato'
import './Concluidas.css'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/* a grade do calendario mostra os doze o ano inteiro, entao o nome curto */
const MESES_CURTOS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

const SetaEsq = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 6-6 6 6 6" />
  </svg>
)

const SetaDir = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 6 6 6-6 6" />
  </svg>
)

/* os dois tipos de obra, na ordem em que se leem no quadro */
const GRUPOS = [
  { id: 'padrao', rotulo: 'Obras padrão' },
  { id: 'emergencia', rotulo: 'Obras emergência' },
]

/**
 * Quando a obra fechou. Vale o carimbo do banco (obra.concluida_em, a
 * hora em que alguem clicou em "Concluir obra"); sem ele, cai na data de
 * conclusao e, em ultimo caso, na de criacao — assim nenhuma fica fora
 * do agrupamento.
 */
function quandoFechou(obra) {
  const iso = obra.concluidaEm ?? obra.dataConclusao ?? obra.criadoEm
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

export default function Concluidas() {
  const { obras, clientePorId, pessoaPorId, concluida } = useDados()
  const navigate = useNavigate()

  const [ano, setAno] = useState(null)
  const [mesAberto, setMesAberto] = useState(null)

  /* Excluir obra concluida MUDOU DE LUGAR: o botao agora vive no
     cabecalho da propria obra, ao lado de Anexos, e pede um segundo
     passo antes de apagar. Aqui ele era um lixo por linha numa lista
     de doze — um clique errado esperando acontecer, ao lado do botao
     de abrir. A permissao ('excluir_concluidas') continua a mesma, e
     agora e a tela da obra que a consulta.
  */

  /* agrupa as concluidas por ano e, dentro dele, por mes */
  const { anos, porAno } = useMemo(() => {
    const mapa = {}
    obras.filter(concluida).forEach((obra) => {
      const d = quandoFechou(obra)
      const a = d.getFullYear()
      const m = d.getMonth()
      mapa[a] ??= {}
      mapa[a][m] ??= []
      mapa[a][m].push(obra)
    })
    return {
      anos: Object.keys(mapa).map(Number).sort((x, y) => y - x),
      porAno: mapa,
    }
  }, [obras, concluida])

  const anoAtual = ano ?? anos[0] ?? new Date().getFullYear()
  const meses = porAno[anoAtual] ?? {}

  /* `anos` esta do mais novo para o mais antigo, entao andar +1 na lista e
     ir para TRAS no tempo — dai o sinal invertido aqui dentro. */
  const indiceDoAno = Math.max(0, anos.indexOf(anoAtual))
  const quantasNoAno = Object.values(meses).reduce((n, l) => n + l.length, 0)

  const trocarAno = (passo) => {
    const destino = anos[indiceDoAno - passo]
    if (destino === undefined) return
    setAno(destino)
    setMesAberto(null)
  }

  const total = obras.filter(concluida).length

  return (
    <AppShell>
      <section className="concluidas">
        <header className="concluidas__topo">
          <h1 className="tela__titulo">Concluídas</h1>
          <span className="concluidas__total">
            {total} obra{total === 1 ? '' : 's'}
          </span>
        </header>

        {anos.length === 0 ? (
          <p className="concluidas__vazio">Nenhuma obra concluída</p>
        ) : (
          <>
            {/* ---------------- Ano ----------------

                Uma seta de cada lado e o ano no meio, como num calendario de
                parede. Antes era uma fila de botoes: com dois anos ela ficava
                perdida na esquerda, e com oito nao caberia.

                As setas andam pelos anos QUE TEM OBRA, e nao de um em um: um
                ano vazio nao tem o que mostrar, e passar por ele so faria a
                pessoa clicar duas vezes. */}
            <div className="anos">
              <button
                type="button"
                className="anos__seta"
                onClick={() => trocarAno(-1)}
                disabled={indiceDoAno >= anos.length - 1}
                aria-label="Ano anterior"
                title="Ano anterior"
              >
                <SetaEsq />
              </button>

              <span className="anos__atual">
                <strong>{anoAtual}</strong>
                <span>
                  {quantasNoAno} obra{quantasNoAno === 1 ? '' : 's'}
                </span>
              </span>

              <button
                type="button"
                className="anos__seta"
                onClick={() => trocarAno(1)}
                disabled={indiceDoAno <= 0}
                aria-label="Próximo ano"
                title="Próximo ano"
              >
                <SetaDir />
              </button>
            </div>
            {/* ---------------- calendario: os doze meses do ano ----------------

                Os doze aparecem sempre, e nao so os que tem obra: e assim que
                se le um calendario, e o mes vazio tambem informa — foi um mes
                em que nada fechou. O mes sem obra nao abre.

                A grade ocupa a tela inteira, na largura e na altura: os
                cards crescem para preencher o que sobra em vez de ficar
                uma faixa de botoes no topo e o resto da pagina vazio.
                As obras do mes escolhido abrem em pop-up — antes elas
                nasciam ABAIXO da grade, e num calendario que agora vai
                ate o rodape isso significaria rolar a pagina para ver o
                que se acabou de clicar. */}
            <div className="calendario">
              {MESES_CURTOS.map((nome, m) => {
                const doMes = meses[m] ?? []
                const aberto = mesAberto === m
                const vazio = doMes.length === 0
                const emergencias = doMes.filter((o) => o.tipo === "emergencia").length
                return (
                  <button
                    key={nome}
                    type="button"
                    className={`calmes ${aberto ? "is-atual" : ""} ${vazio ? "is-vazio" : ""}`.trim()}
                    onClick={() => setMesAberto(aberto ? null : m)}
                    disabled={vazio}
                    aria-pressed={aberto}
                    title={vazio ? `Nenhuma obra fechou em ${MESES[m]}` : `${doMes.length} obra(s) em ${MESES[m]}`}
                  >
                    <span className="calmes__nome">{nome}</span>
                    <span className="calmes__quantas">{doMes.length}</span>
                    {emergencias > 0 && (
                      <span className="calmes__emerg" title={`${emergencias} emergência(s)`}>
                        {emergencias}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

          </>
        )}
      </section>

      {/* ---------------- o mes escolhido, em pop-up ----------------

          Clicar no mes abre a lista das obras dele; clicar em uma leva
          para a tela da obra. */}
      <Modal
        aberto={mesAberto !== null && (meses[mesAberto]?.length ?? 0) > 0}
        aoFechar={() => setMesAberto(null)}
        titulo={mesAberto === null ? '' : `${MESES[mesAberto]} de ${anoAtual}`}
        subtitulo={(() => {
          const doMes = mesAberto === null ? [] : (meses[mesAberto] ?? [])
          if (doMes.length === 0) return undefined
          const avaliadas = doMes.filter((o) => o.avaliacao)
          const media =
            avaliadas.length > 0
              ? avaliadas.reduce((sm, o) => sm + Number(o.avaliacao.nota), 0) / avaliadas.length
              : null
          const quantas = `${doMes.length} obra${doMes.length === 1 ? '' : 's'}`
          return media === null
            ? `${quantas} · sem avaliação`
            : `${quantas} · nota média ${media.toFixed(1)}`
        })()}
        largura={780}
      >
        {mesAberto !== null && (
          <div className="mesaberto">
            {/* Padrao e emergencia em blocos separados: sao dois tipos de
                trabalho diferentes, e misturados na mesma lista a conta de
                emergencias do mes se perde. */}
            {GRUPOS.map((grupo) => {
              const doGrupo = (meses[mesAberto] ?? []).filter((o) => o.tipo === grupo.id)
              if (doGrupo.length === 0) return null
              return (
                <div key={grupo.id} className="grupo" data-tipo={grupo.id}>
                  <h3 className="grupo__titulo">
                    {grupo.rotulo}
                    <span className="grupo__quantas">{doGrupo.length}</span>
                  </h3>

                  <ul className="mes__obras">
                    {doGrupo.map((obra) => {
                          const cliente = clientePorId(obra.clienteId)
                          const pessoas = obra.membros.map(pessoaPorId).filter(Boolean)
                          return (
                            <li key={obra.id} className="fechada__linha">
                              <button
                                type="button"
                                className="fechada"
                                data-tipo={obra.tipo}
                                onClick={() => navigate(`/app/concluidas/${obra.id}`)}
                                title="Abrir a obra com a rastreabilidade completa"
                              >
                                <Avatar
                                  nome={cliente?.nome}
                                  foto={cliente?.logo}
                                  tamanho={32}
                                  quadrado
                                />
                                <span className="fechada__quem">
                                  {/* "1042/2026 - Acme", igual ao card do quadro */}
                                  <strong>{tituloDaObra(obra, cliente)}</strong>
                                  <span>
                                    {obra.descricao || (
                                      <em className="fechada__semdesc">sem descrição</em>
                                    )}
                                  </span>
                                </span>

                                <span className="fechada__data">
                                  {dataBR(quandoFechou(obra).toISOString().slice(0, 10))}
                                  {obra.concluidaPorNome && (
                                    <em>por {obra.concluidaPorNome}</em>
                                  )}
                                </span>

                                <span className="fechada__nota">
                                  {obra.avaliacao ? (
                                    Number(obra.avaliacao.nota).toFixed(1)
                                  ) : (
                                    <em>—</em>
                                  )}
                                </span>

                                <span className="fechada__avatares">
                                  {pessoas.slice(0, 3).map((pe) => (
                                    <Avatar key={pe.id} nome={pe.nome} foto={pe.foto} tamanho={22} />
                                  ))}
                                </span>
                              </button>

                            </li>
                          )
                        })}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

    </AppShell>
  )
}
