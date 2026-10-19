import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { useDados } from '@/context/DadosContext'
import { CHAVES } from '@/domain/permissoes'
import './ModalCargos.css'

/** As cores sugeridas para um setor (a lista e a tela do setor usam as mesmas). */
export const CORES_SETOR = [
  '#13b7c7', '#35b566', '#f2802a', '#3a63e8', '#9a5ce0',
  '#c2a23a', '#e0457b', '#0f9aa8', '#7a5c3e', '#5b6470',
]

/**
 * A lista dos SETORES (botao "Setor", em Usuarios).
 *
 * Aqui se faz o que e rapido: criar um setor, trocar o nome e excluir.
 * O clique num setor abre a TELA dele (/app/usuarios/setores/:id), com
 * as permissoes — que num pop-up nao cabiam e obrigavam a rolar uma
 * caixa dentro da outra.
 *
 * Setor novo nasce sem permissao nenhuma e ja abre a tela dele, para
 * marcar o que ele pode.
 *
 * Setor e o grupo da equipe, de onde saem as permissoes; o cargo de
 * cada pessoa (Analista, Coordenador) e texto livre no cadastro dela.
 * No banco o setor continua sendo a tabela `cargo`.
 */
export default function ModalCargos({ aberto, aoFechar }) {
  const navegar = useNavigate()
  const { cargos, equipe, adicionarCargo, atualizarCargo, removerCargo } = useDados()

  /* o setor com o nome em edicao, o que pede confirmacao para sair, e o novo */
  const [renomeando, setRenomeando] = useState(null)
  const [nomeNovo, setNomeNovo] = useState('')
  const [excluindo, setExcluindo] = useState(null)
  const [criando, setCriando] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (aberto) return
    setRenomeando(null)
    setExcluindo(null)
    setCriando('')
    setErro('')
  }, [aberto])

  const quantos = (chave) => equipe.filter((p) => p.cargo === chave).length
  const repetido = (nome, id = null) =>
    cargos.some((c) => c.id !== id && c.nome.trim().toLowerCase() === nome.trim().toLowerCase())

  const abrir = (cargo) => {
    aoFechar()
    navegar(`/app/usuarios/setores/${cargo.id}`)
  }

  const fazer = async (acao) => {
    setOcupado(true)
    setErro('')
    try {
      return await acao()
    } catch (e) {
      setErro(e.message)
      return null
    } finally {
      setOcupado(false)
    }
  }

  const renomear = async (evento, cargo) => {
    evento.preventDefault()
    const nome = nomeNovo.trim()
    if (!nome) return setErro('Informe o nome do setor.')
    if (repetido(nome, cargo.id)) return setErro('Já existe um setor com esse nome.')
    if (nome === cargo.nome) return setRenomeando(null)
    const feito = await fazer(() => atualizarCargo(cargo.id, { nome }))
    if (feito !== null) setRenomeando(null)
  }

  const excluir = async (cargo) => {
    const feito = await fazer(() => removerCargo(cargo.id))
    if (feito !== null) setExcluindo(null)
  }

  const criar = async (evento) => {
    evento.preventDefault()
    const nome = criando.trim()
    if (!nome) return setErro('Escreva o nome do novo setor.')
    if (repetido(nome)) return setErro('Já existe um setor com esse nome.')
    const novo = await fazer(() =>
      adicionarCargo({
        nome,
        cor: CORES_SETOR[cargos.length % CORES_SETOR.length],
        curto: '',
        acessoTotal: false,
        permissoes: [],
      }),
    )
    if (novo?.id) {
      setCriando('')
      abrir(novo)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Setores" subtitulo="Clique num setor para ver e mudar as permissões dele." largura={620}>
      <div className="cargos">
        <ul className="setores">
          {cargos.map((cargo) => {
            const pessoas = quantos(cargo.chave)
            const emEdicao = renomeando === cargo.id
            return (
              <li key={cargo.id} className="setores__linha" style={{ '--cargo-cor': cargo.cor }}>
                {emEdicao ? (
                  <form className="setores__renomear" onSubmit={(e) => renomear(e, cargo)}>
                    <span className="setores__cor" aria-hidden="true" />
                    <input
                      value={nomeNovo}
                      onChange={(e) => {
                        setNomeNovo(e.target.value)
                        setErro('')
                      }}
                      aria-label={`Novo nome de ${cargo.nome}`}
                      autoFocus
                      maxLength={60}
                    />
                    <button type="submit" className="setores__botao setores__botao--forte" disabled={ocupado}>
                      Salvar
                    </button>
                    <button type="button" className="setores__botao" onClick={() => setRenomeando(null)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <>
                    <button type="button" className="setores__abrir" onClick={() => abrir(cargo)} title={`Permissões de ${cargo.nome}`}>
                      <span className="setores__cor" aria-hidden="true" />
                      <span className="setores__texto">
                      <span className="setores__nome">{cargo.nome}</span>
                      <span className="setores__info">
                        {pessoas} pessoa{pessoas === 1 ? '' : 's'} ·{' '}
                        {cargo.acessoTotal
                          ? 'acesso total'
                          : `${(cargo.permissoes ?? []).length} de ${CHAVES.length} permissões`}
                      </span>
                      </span>
                      <span className="setores__seta" aria-hidden="true">
                        Permissões →
                      </span>
                    </button>
                    <span className="setores__acoes">
                      <button
                        type="button"
                        className="setores__botao"
                        onClick={() => {
                          setRenomeando(cargo.id)
                          setNomeNovo(cargo.nome)
                          setExcluindo(null)
                          setErro('')
                        }}
                      >
                        Renomear
                      </button>
                      <button
                        type="button"
                        className="setores__botao setores__botao--perigo"
                        onClick={() => {
                          setExcluindo(cargo.id)
                          setRenomeando(null)
                          setErro('')
                        }}
                        disabled={cargo.fixo}
                        title={cargo.fixo ? 'Setor usado pelas etapas da obra: não sai da lista' : undefined}
                      >
                        Excluir
                      </button>
                    </span>
                  </>
                )}

                {excluindo === cargo.id && (
                  <div className="setores__confirma" role="alert">
                    <span>
                      Excluir <strong>{cargo.nome}</strong>?
                      {pessoas > 0
                        ? ` ${pessoas} pessoa${pessoas === 1 ? ' está' : 's estão'} nele: mude o setor delas antes.`
                        : ' Não dá para desfazer.'}
                    </span>
                    {/* com gente dentro o servidor recusa: so explica */}
                    {pessoas === 0 && (
                      <button
                        type="button"
                        className="setores__botao setores__botao--perigo-forte"
                        onClick={() => excluir(cargo)}
                        disabled={ocupado}
                      >
                        Excluir setor
                      </button>
                    )}
                    <button type="button" className="setores__botao" onClick={() => setExcluindo(null)}>
                      {pessoas === 0 ? 'Cancelar' : 'Entendi'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <form className="setores__novo" onSubmit={criar}>
          <input
            value={criando}
            onChange={(e) => {
              setCriando(e.target.value)
              setErro('')
            }}
            placeholder="Nome do novo setor (ex.: Jurídico)"
            aria-label="Nome do novo setor"
            maxLength={60}
          />
          <Button type="submit" loading={ocupado && Boolean(criando.trim())}>
            Criar setor
          </Button>
        </form>

        {erro && (
          <p className="cargos__erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  )
}
