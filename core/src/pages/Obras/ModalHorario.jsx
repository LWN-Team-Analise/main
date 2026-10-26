import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Avatar from '@/components/Avatar/Avatar'
import Seletor from '@/components/Seletor/Seletor'
import { useDados } from '@/context/DadosContext'
import { diasDaExecucao } from '@/domain/obras'
import { dataBR } from '@/utils/formato'
import './ModalHorario.css'

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaDaSemana = (iso) => SEMANA[new Date(`${iso}T12:00:00`).getDay()]

/**
 * O CHECK COM HORARIO (atualizacao 31) — ex.: "Ponto de encontro".
 *
 * Uma linha por DATA da obra: os dias da execucao (o calendario do
 * "Prazo da execucao") e as datas que alguem acrescentou aqui. Em cada
 * uma, o HORARIO (06:30) e QUEM VAI naquele dia.
 *
 *   - quem vai e ainda nao e membro da obra recebe a solicitacao de
 *     inclusao (o membro parcial) — e o "adicionar membros" por aqui;
 *   - cada pessoa de cada data vira um turno na aba Turnos;
 *   - o check e marcado AQUI, na caixa do rodape (e so com ao menos uma
 *     data com horario).
 *
 * Data sem horario nao e gravada. Quem nao marca o check (outro setor,
 * obra fechada) ve tudo, sem mexer.
 */
export default function ModalHorario({ aberto, obra, check, somenteLeitura = false, aoFechar }) {
  const { equipe, pessoaPorId, cargoPorChave, definirHorarios } = useDados()
  const [linhas, setLinhas] = useState([])
  const [marcado, setMarcado] = useState(false)
  const [novaData, setNovaData] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const execucao = useMemo(() => new Set(obra ? diasDaExecucao(obra) : []), [obra])

  useEffect(() => {
    if (!aberto || !obra || !check) return
    const salvos = obra.horarios?.[check.id] ?? []
    const dias = [...new Set([...execucao, ...salvos.map((h) => h.dia)])].sort()
    setLinhas(
      dias.map((dia) => {
        const salvo = salvos.find((h) => h.dia === dia)
        return { dia, hora: salvo?.hora ?? '', membros: salvo?.membros ?? [] }
      }),
    )
    setMarcado(Boolean(obra.checks?.[check.id]))
    setNovaData('')
    setErro('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, check?.id])

  /* quem pode ir: a equipe ativa, sem a conta da TV */
  const pessoas = useMemo(
    () =>
      equipe
        .filter((p) => p.ativo !== false && !cargoPorChave(p.cargo)?.painelTv)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [equipe, cargoPorChave],
  )

  if (!obra || !check) return null

  const mudar = (dia, campo, valor) => {
    setLinhas((atual) => atual.map((l) => (l.dia === dia ? { ...l, [campo]: valor } : l)))
    setErro('')
  }

  const acrescentarData = () => {
    if (!novaData) return
    if (linhas.some((l) => l.dia === novaData)) {
      setErro('Essa data já está na lista.')
      return
    }
    setLinhas((atual) => [...atual, { dia: novaData, hora: '', membros: [] }].sort((a, b) => a.dia.localeCompare(b.dia)))
    setNovaData('')
    setErro('')
  }

  const comHorario = linhas.filter((l) => l.hora)

  const salvar = async (evento) => {
    evento.preventDefault()
    const semHora = linhas.find((l) => !l.hora && l.membros.length > 0)
    if (semHora) {
      setErro(`Informe o horário de ${dataBR(semHora.dia).slice(0, 5)}: há pessoas nesse dia.`)
      return
    }
    if (marcado && comHorario.length === 0) {
      setErro('Defina o horário de ao menos uma data para marcar o check.')
      return
    }
    setSalvando(true)
    try {
      const jaEstava = Boolean(obra.checks?.[check.id])
      await definirHorarios(obra.id, check.id, {
        dias: comHorario.map(({ dia, hora, membros }) => ({ dia, hora, membros })),
        marcar: marcado !== jaEstava ? marcado : undefined,
      })
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={check.titulo} subtitulo="O horário de cada data e quem vai" largura={640}>
      <form className="horario" onSubmit={salvar} noValidate>
        {linhas.length === 0 ? (
          <p className="horario__vazio">
            A obra ainda não tem as datas da execução. Defina o período de execução ou acrescente uma data abaixo.
          </p>
        ) : (
          <ul className="horario__lista">
            {linhas.map((l) => {
              const opcoes = pessoas
                .filter((p) => !l.membros.includes(String(p.id)))
                .map((p) => ({ valor: String(p.id), rotulo: p.nome }))
              return (
                <li key={l.dia} className={`horario__linha ${l.hora ? 'is-definida' : ''}`.trim()}>
                  <span className="horario__data">
                    <em>{diaDaSemana(l.dia)}</em>
                    <strong>{dataBR(l.dia).slice(0, 5)}</strong>
                  </span>

                  <label className="horario__hora">
                    <span className="sr-only">Horário de {dataBR(l.dia)}</span>
                    <input
                      type="time"
                      value={l.hora}
                      onChange={(e) => mudar(l.dia, 'hora', e.target.value)}
                      disabled={somenteLeitura}
                    />
                  </label>

                  <div className="horario__pessoas">
                    {l.membros.map((id) => {
                      const p = pessoaPorId(id)
                      return (
                        <span key={id} className="horario__pessoa">
                          <Avatar nome={p?.nome} foto={p?.foto} tamanho={22} titulo={p?.nome} />
                          <span>{p?.nome?.split(' ')[0] ?? 'Pessoa'}</span>
                          {!somenteLeitura && (
                            <button
                              type="button"
                              onClick={() => mudar(l.dia, 'membros', l.membros.filter((m) => m !== id))}
                              aria-label={`Tirar ${p?.nome ?? 'a pessoa'} de ${dataBR(l.dia)}`}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      )
                    })}
                    {!somenteLeitura && opcoes.length > 0 && (
                      <div className="horario__adicionar">
                        <Seletor
                          valor=""
                          aoMudar={(id) => id && mudar(l.dia, 'membros', [...l.membros, String(id)])}
                          opcoes={opcoes}
                          vazio="+ Pessoa"
                          aria-label={`Adicionar pessoa em ${dataBR(l.dia)}`}
                        />
                      </div>
                    )}
                    {somenteLeitura && l.membros.length === 0 && <span className="horario__ninguem">ninguém</span>}
                  </div>

                  {/* a data que nao e da execucao (acrescentada aqui) sai no x */}
                  {!somenteLeitura && !execucao.has(l.dia) ? (
                    <button
                      type="button"
                      className="horario__tirar"
                      onClick={() => setLinhas((atual) => atual.filter((x) => x.dia !== l.dia))}
                      aria-label={`Tirar a data ${dataBR(l.dia)}`}
                      title="Tirar esta data"
                    >
                      ×
                    </button>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {!somenteLeitura && (
          <div className="horario__nova">
            <input
              type="date"
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
              aria-label="Outra data"
            />
            <button type="button" className="ferramenta" onClick={acrescentarData} disabled={!novaData}>
              Acrescentar data
            </button>
          </div>
        )}

        <label className={`horario__marcar ${marcado ? 'is-marcado' : ''}`.trim()}>
          <input
            type="checkbox"
            checked={marcado}
            onChange={(e) => {
              setMarcado(e.target.checked)
              setErro('')
            }}
            disabled={somenteLeitura}
          />
          <span>
            Check concluído
            <em>{comHorario.length ? `${comHorario.length} data${comHorario.length > 1 ? 's' : ''} com horário` : 'nenhuma data com horário'}</em>
          </span>
        </label>

        {erro && (
          <p className="formrot__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            {somenteLeitura ? 'Fechar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <Button type="submit" loading={salvando}>
              Salvar
            </Button>
          )}
        </footer>
      </form>
    </Modal>
  )
}
