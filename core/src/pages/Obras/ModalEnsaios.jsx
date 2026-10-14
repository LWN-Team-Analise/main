import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import './ModalEnsaios.css'

/** As duas classificacoes de ensaio — so elas. */
const CLASSIFICACOES = [
  { id: 'hvac', rotulo: 'HVAC' },
  { id: 'gases', rotulo: 'GASES' },
]

/**
 * HVAC | GASES, como duas pastilhas. Sem `aoMudar`, so mostra (e o
 * ensaio antigo, ainda sem classificacao, aparece como tal).
 */
function Classificacao({ valor, aoMudar, desabilitado = false, rotulo }) {
  if (!aoMudar) {
    const atual = CLASSIFICACOES.find((c) => c.id === valor)
    return (
      <span className="classe classe--selo" data-classe={valor ?? 'nenhuma'}>
        {atual?.rotulo ?? 'sem classificação'}
      </span>
    )
  }
  return (
    <span className="classe" role="radiogroup" aria-label={rotulo}>
      {CLASSIFICACOES.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={valor === c.id}
          className="classe__opcao"
          data-classe={c.id}
          disabled={desabilitado}
          onClick={() => valor !== c.id && aoMudar(c.id)}
        >
          {c.rotulo}
        </button>
      ))}
    </span>
  )
}

/**
 * O CATALOGO de ensaios — separado das obras.
 *
 * E a lista de onde o Planejamento de ensaios escolhe. Quem mexe aqui e
 * quem tem "Adicionar / editar ensaios" (gerenciar_ensaios); a API
 * recusa os outros do mesmo jeito.
 *
 * Renomear vale para todas as obras (e o mesmo ensaio). Excluir tira do
 * catalogo: as obras que ja planejaram aquele ensaio continuam com ele,
 * e com a execucao registrada.
 *
 * Todo ensaio e HVAC ou GASES — escolhido ao criar, e trocavel na lista.
 * Obra com ensaio de GASES torna obrigatorio o check "Material de gases"
 * da 2a etapa (ver aplicarRegraDosGases em src/domain/obras.js).
 */
export default function ModalEnsaios({ aberto, aoFechar }) {
  const { ensaiosAtivos, adicionarEnsaio, atualizarEnsaio, removerEnsaio, pode } = useDados()
  const podeMexer = pode('gerenciar_ensaios')

  const [novo, setNovo] = useState('')
  const [classeNova, setClasseNova] = useState(null)
  const [editando, setEditando] = useState(null) // { id, nome }
  const [apagando, setApagando] = useState(null) // id
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setNovo('')
    setClasseNova(null)
    setEditando(null)
    setApagando(null)
    setErro('')
  }, [aberto])

  const fazer = async (acao) => {
    setOcupado(true)
    setErro('')
    try {
      await acao()
      return true
    } catch (e) {
      setErro(e.message)
      return false
    } finally {
      setOcupado(false)
    }
  }

  const adicionar = async (evento) => {
    evento.preventDefault()
    if (!novo.trim()) return
    if (!classeNova) {
      setErro('Escolha se o ensaio é HVAC ou GASES.')
      return
    }
    if (await fazer(() => adicionarEnsaio({ nome: novo.trim(), classificacao: classeNova }))) {
      setNovo('')
      setClasseNova(null)
    }
  }

  const renomear = async (evento) => {
    evento.preventDefault()
    if (!editando?.nome.trim()) {
      setErro('Escreva o nome do ensaio.')
      return
    }
    if (await fazer(() => atualizarEnsaio(editando.id, { nome: editando.nome.trim() }))) {
      setEditando(null)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Ensaios"
      largura={480}
      nivel={1}
    >
      <div className="catalogo">
        <ul className="catalogo__lista">
          {ensaiosAtivos.map((e) => (
            <li key={e.id} className="catalogo__item">
              {editando?.id === e.id ? (
                <form className="catalogo__edicao" onSubmit={renomear}>
                  <input
                    className="catalogo__campo"
                    value={editando.nome}
                    onChange={(ev) => setEditando({ ...editando, nome: ev.target.value })}
                    aria-label="Nome do ensaio"
                    autoFocus
                  />
                  <button type="submit" className="catalogo__botao" disabled={ocupado}>
                    Salvar
                  </button>
                  <button type="button" className="catalogo__botao" onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <span className="catalogo__nome">{e.nome}</span>
                  <Classificacao
                    valor={e.classificacao}
                    rotulo={`Classificação de ${e.nome}`}
                    desabilitado={ocupado}
                    aoMudar={
                      podeMexer && apagando !== e.id
                        ? (classificacao) => fazer(() => atualizarEnsaio(e.id, { classificacao }))
                        : undefined
                    }
                  />
                  {podeMexer &&
                    (apagando === e.id ? (
                      <>
                        <span className="catalogo__pergunta">Excluir?</span>
                        <button
                          type="button"
                          className="catalogo__botao catalogo__botao--perigo"
                          disabled={ocupado}
                          onClick={async () => {
                            if (await fazer(() => removerEnsaio(e.id))) setApagando(null)
                          }}
                        >
                          Excluir
                        </button>
                        <button type="button" className="catalogo__botao" onClick={() => setApagando(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="catalogo__botao"
                          onClick={() => {
                            setApagando(null)
                            setEditando({ id: e.id, nome: e.nome })
                          }}
                        >
                          Renomear
                        </button>
                        <button
                          type="button"
                          className="catalogo__botao catalogo__botao--perigo"
                          onClick={() => {
                            setEditando(null)
                            setApagando(e.id)
                          }}
                        >
                          Excluir
                        </button>
                      </>
                    ))}
                </>
              )}
            </li>
          ))}
          {ensaiosAtivos.length === 0 && (
            <li className="ensaios__vazio">Nenhum ensaio no catálogo ainda.</li>
          )}
        </ul>

        {podeMexer && (
          <form className="catalogo__novo" onSubmit={adicionar}>
            <CampoTexto
              rotulo="Novo ensaio"
              placeholder="Ex.: Vazão"
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
            />
            <div className="catalogo__classe">
              <span className="campo__rotulo">Classificação</span>
              <Classificacao valor={classeNova} aoMudar={setClasseNova} rotulo="Classificação do novo ensaio" />
            </div>
            <Button type="submit" loading={ocupado} disabled={!novo.trim() || !classeNova}>
              Adicionar
            </Button>
          </form>
        )}

        {erro && (
          <p className="formrot__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Fechar
          </button>
        </footer>
      </div>
    </Modal>
  )
}
