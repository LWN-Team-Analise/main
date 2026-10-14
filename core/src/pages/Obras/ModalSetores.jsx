import Modal from '@/components/Modal/Modal'
import { useDados } from '@/context/DadosContext'
import './ModalSetores.css'

/**
 * O que cada SETOR esta devendo. Abre pelo botao "+N" da linha de
 * setores, quando ha mais deles do que cabem no filtro.
 *
 * `obras` sao as que estao em exibicao no quadro — a conta e sobre elas,
 * nao sobre o sistema inteiro. `setores` e a mesma lista do filtro (so
 * os que tem check); sem ela, vao todos os setores do cadastro.
 */
export default function ModalSetores({ aberto, aoFechar, obras = [], aoFiltrar, selecionados = [], setores }) {
  const { cargos: todos, clientePorId, roteiroDaObra, etapaDaObra, pendentesDaObra } = useDados()
  const cargos = setores ?? todos

  /* para cada setor, as obras em que ele ainda deve algo na etapa atual */
  const pendencias = cargos.map((cargo) => {
    const devendo = obras
      .filter((o) => pendentesDaObra(o).includes(cargo.chave))
      .map((o) => ({
        obra: o,
        cliente: clientePorId(o.clienteId),
        etapa: etapaDaObra(o),
      }))
    return { cargo, devendo }
  })

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Setores pendentes"
      subtitulo="O que cada setor ainda deve nas obras em exibição."
      largura={600}
    >
      <div className="setores">
        {pendencias.map(({ cargo, devendo }) => {
          const ativo = selecionados.includes(cargo.chave)
          return (
            <article key={cargo.id} className={`setores__cargo ${ativo ? 'is-ativo' : ''}`.trim()}>
              <header className="setores__topo">
                <span
                  className="setores__bolha"
                  style={{ background: cargo.cor }}
                  aria-hidden="true"
                />
                <span className="setores__quem">
                  <strong>{cargo.nome}</strong>
                  {/* o acesso total do setor nao aparece: quem tem, tem */}
                  <span>sigla {cargo.curto}</span>
                </span>

                <span
                  className={`setores__contagem ${devendo.length > 0 ? 'is-devendo' : ''}`.trim()}
                >
                  {devendo.length > 0
                    ? `${devendo.length} pendente${devendo.length === 1 ? '' : 's'}`
                    : 'em dia'}
                </span>

                {aoFiltrar && (
                  <button
                    type="button"
                    className="setores__filtrar"
                    onClick={() => {
                      aoFiltrar(cargo.chave)
                      aoFechar()
                    }}
                  >
                    {ativo ? 'Tirar do filtro' : 'Filtrar'}
                  </button>
                )}
              </header>

              {devendo.length > 0 && (
                <ul className="setores__obras">
                  {devendo.map(({ obra, cliente, etapa }) => (
                    <li key={obra.id}>
                      <span className="setores__tipo" data-tipo={obra.tipo} aria-hidden="true" />
                      <span className="setores__obra">
                        {cliente?.nome ?? 'Cliente removido'}
                        {obra.descricao && <em>{obra.descricao}</em>}
                      </span>
                      <span className="setores__etapa">
                        {etapa}ª —{' '}
                        {roteiroDaObra(obra)
                          .find((e) => e.numero === etapa)
                          ?.nome?.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}
      </div>
    </Modal>
  )
}
