import Modal from '@/components/Modal/Modal'
import Avatar from '@/components/Avatar/Avatar'
import { useDados } from '@/context/DadosContext'
import { cardConcluido, nomeProprioDaEtapa, tituloDaObra } from '@/domain/obras'
import './ModalMembros.css'

/**
 * Quem esta em quais obras. Abre ao clicar na fila de avatares do
 * cabecalho do quadro: por pessoa, as obras em que ela entrou, a etapa
 * de cada uma e se o setor dela ja fechou aquela etapa.
 */
export default function ModalMembros({ aberto, aoFechar, pessoas = [] }) {
  const { obrasDaPessoa, cargoPorChave, roteiroDaObra, etapaDaObra, rotuloEtapa } = useDados()

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Membros nas obras"
      largura={620}
    >
      <div className="membros">
        {pessoas.length === 0 && (
          <p className="membros__vazio">Ninguém marcou tarefa nas obras em exibição.</p>
        )}

        {pessoas.map((pessoa) => {
          const cargo = cargoPorChave(pessoa.cargo)
          const participacoes = obrasDaPessoa(pessoa.id)

          return (
            <article key={pessoa.id} className="membros__pessoa">
              <header className="membros__topo">
                <Avatar nome={pessoa.nome} foto={pessoa.foto} tamanho={38} titulo={pessoa.nome} />
                <div className="membros__quem">
                  <strong>{pessoa.nome}</strong>
                  <span
                    className="membros__cargo"
                    style={{ '--cargo-cor': cargo?.cor ?? '#6b7280' }}
                  >
                    {cargo?.nome ?? pessoa.cargoNome ?? 'Sem setor'}
                  </span>
                </div>
                <span className="membros__contagem">
                  {participacoes.length} obra{participacoes.length === 1 ? '' : 's'}
                </span>
              </header>

              {participacoes.length === 0 ? (
                <p className="membros__semobra">Sem obra em andamento no momento.</p>
              ) : (
                <ul className="membros__obras">
                  {participacoes.map(({ obra, cliente }) => {
                    const numero = etapaDaObra(obra)
                    /* cada obra le o roteiro que ela mesma tem */
                    const modelo = roteiroDaObra(obra).find((e) => e.numero === numero)
                    /* os cards desta etapa que sao do cargo dele; sem
                       nenhum, a etapa nao cobra nada desta pessoa */
                    const meusCards = (modelo?.cards ?? []).filter((c) =>
                      c.cargos.includes(pessoa.cargo),
                    )
                    const fechou =
                      meusCards.length === 0
                        ? null
                        : meusCards.every((c) => cardConcluido(c, obra.checks))

                    /* "4ª — 4ª Etapa" era o que saia aqui: a etapa sem
                       nome proprio se chama "4ª Etapa", e o numero na
                       frente repetia o que o nome ja dizia. Agora o
                       numero e fixo e o nome so entra quando ele
                       ACRESCENTA alguma coisa ("4ª · fundação"). */
                    const proprio = nomeProprioDaEtapa(modelo?.nome, rotuloEtapa(numero))

                    return (
                      <li key={obra.id} className="membros__obra">
                        <span className="membros__tipo" data-tipo={obra.tipo} aria-hidden="true" />
                        {/* a etapa vem ANTES do cliente: e por ela que se
                            varre a lista procurando quem esta em que ponto */}
                        <span className="membros__etapa">
                          {numero}ª{proprio && <em>{proprio.toLowerCase()}</em>}
                        </span>
                        <span className="membros__nomeobra">
                          {tituloDaObra(obra, cliente)}
                          {obra.descricao && <em>{obra.descricao}</em>}
                        </span>
                        {fechou !== null && (
                          <span
                            className={`membros__estado ${fechou ? 'is-ok' : 'is-devendo'}`.trim()}
                          >
                            {fechou ? 'em dia' : 'pendente'}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </article>
          )
        })}
      </div>
    </Modal>
  )
}
