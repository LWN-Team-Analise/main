import { useMemo } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import { useDados } from '@/context/DadosContext'
import { motivoDoCancelamento, obraCancelada, resumoDosDias, diasDaExecucao, tituloDaObra } from '@/domain/obras'
import { dataHora } from '@/utils/formato'
import './ObrasCanceladas.css'

/**
 * OBRAS CANCELADAS (atualizacao 59) — na area do Almoxarife.
 *
 * As obras que o Comercial cancelou, da mais recente para a mais antiga:
 * quando, quem, o motivo e a observacao, os dias de execucao que estavam
 * previstos e quantas OS do Almoxarife ela tinha — o que pode precisar
 * ser cancelado ou devolvido. A obra cancelada ja saiu das listas de
 * obra aberta do Almoxarife (Solicitar OS so oferece obra aberta).
 *
 * Os dados vem com a carga de sempre (a obra traz o motivo e as OS).
 */
export default function ObrasCanceladas() {
  const { obras, clientePorId } = useDados()

  const canceladas = useMemo(
    () =>
      obras
        .filter(obraCancelada)
        .sort((a, b) => String(b.concluidaEm ?? '').localeCompare(String(a.concluidaEm ?? ''))),
    [obras],
  )

  return (
    <AppShell>
      <section className="canceladas">
        <header>
          <h1 className="tela__titulo">Obras canceladas</h1>
          <p className="tela__lead">
            As obras canceladas pelo Comercial, com o motivo. Confira se alguma OS precisa ser cancelada ou o material
            devolvido.
          </p>
        </header>

        {canceladas.length === 0 ? (
          <div className="canceladas__vazio">
            <strong>Nenhuma obra cancelada</strong>
            <span>Quando o Comercial cancelar uma obra, ela aparece aqui com o motivo.</span>
          </div>
        ) : (
          <ul className="canceladas__lista">
            {canceladas.map((obra) => {
              const cliente = clientePorId(obra.clienteId)
              const dias = diasDaExecucao(obra)
              const os = obra.ordensServico ?? []
              return (
                <li key={obra.id} className="cancelada">
                  <div className="cancelada__cabeca">
                    <Avatar nome={cliente?.nome} foto={cliente?.logo} tamanho={34} quadrado />
                    <p className="cancelada__quem">
                      <strong>{tituloDaObra(obra, cliente)}</strong>
                      <span>{obra.descricao || 'sem descrição'}</span>
                    </p>
                    <span className="cancelada__selo">Cancelada</span>
                  </div>
                  <p className="cancelada__motivo">
                    <strong>{motivoDoCancelamento(obra.cancelamentoMotivo)}</strong>
                    {obra.conclusaoObs ? ` — ${obra.conclusaoObs}` : ''}
                  </p>
                  <p className="cancelada__meta">
                    <span>
                      Em {dataHora(obra.concluidaEm)}
                      {obra.concluidaPorNome ? ` por ${obra.concluidaPorNome}` : ''}
                    </span>
                    {dias.length > 0 && <span>Execução prevista: {resumoDosDias(dias)}</span>}
                    <span className={os.length ? 'cancelada__os' : ''}>
                      {os.length === 0 ? 'Sem OS no Almoxarife' : os.length === 1 ? '1 OS no Almoxarife' : `${os.length} OS no Almoxarife`}
                    </span>
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </AppShell>
  )
}
