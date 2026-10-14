import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import EscolhaCor from '@/components/EscolhaCor/EscolhaCor'
import { useDados } from '@/context/DadosContext'
import './ModalSetores.css'

const CORES_SUGERIDAS = [
  '#13b7c7', '#35b566', '#f2802a', '#3a63e8', '#9a5ce0',
  '#c2a23a', '#e0457b', '#0f9aa8', '#7a5c3e', '#5b6470',
]

const Mais = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/**
 * Os setores do cliente — o ramo em que a empresa atua.
 *
 * Mesma forma da tela de Cargos: a lista e uma linha de etiquetas com a
 * contagem de quantos clientes estao em cada uma, e clicar numa delas abre a
 * edicao num pop-up por cima.
 *
 * Apagar um setor NAO apaga os clientes dele: eles voltam para "sem setor" e
 * a pessoa reclassifica com calma. A trava disso e do banco (ON DELETE SET
 * NULL), nao daqui.
 */
export default function ModalSetores({ aberto, aoFechar }) {
  const { setores, clientes } = useDados()

  /* null = so a lista | { setor } = editando | { novo: true } = criando */
  const [editando, setEditando] = useState(null)

  useEffect(() => {
    if (!aberto) setEditando(null)
  }, [aberto])

  const quantos = (id) => clientes.filter((c) => String(c.setorId) === String(id)).length

  return (
    <>
      <Modal
        aberto={aberto}
        aoFechar={aoFechar}
        titulo="Setores"
        largura={520}
      >
        <div className="setores">
          <ul className="setores__linha">
            {setores.map((setor) => (
              <li key={setor.id}>
                <button
                  type="button"
                  className="setores__etiqueta"
                  style={{ '--setor-cor': setor.cor }}
                  onClick={() => setEditando({ setor })}
                  title={`Editar ${setor.nome}`}
                >
                  {setor.nome}
                  <span className="setores__quantos">{quantos(setor.id)}</span>
                </button>
              </li>
            ))}

            <li>
              <button
                type="button"
                className="setores__novo"
                onClick={() => setEditando({ novo: true })}
              >
                <Mais />
                Novo setor
              </button>
            </li>
          </ul>

          {setores.length === 0 && (
            <p className="setores__nota">
              Nenhum setor ainda. Crie o primeiro e depois classifique os clientes no cadastro
              de cada um.
            </p>
          )}
        </div>
      </Modal>

      <ModalSetor
        aberto={Boolean(editando)}
        setor={editando?.setor ?? null}
        emUso={editando?.setor ? quantos(editando.setor.id) : 0}
        aoFechar={() => setEditando(null)}
      />
    </>
  )
}

/** Um setor: cria ou edita, com Excluir ao lado de Salvar. */
function ModalSetor({ aberto, setor = null, emUso = 0, aoFechar }) {
  const { setores, adicionarSetor, atualizarSetor, removerSetor } = useDados()

  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES_SUGERIDAS[0])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(false)

  const editando = Boolean(setor)

  useEffect(() => {
    if (!aberto) return
    setNome(setor?.nome ?? '')
    setCor(setor?.cor ?? CORES_SUGERIDAS[0])
    setErro('')
    setApagando(false)
  }, [aberto, setor])

  const enviar = async (evento) => {
    evento.preventDefault()
    const limpo = nome.trim()
    if (!limpo) {
      setErro('Informe o nome do setor.')
      return
    }

    const repetido = setores.some(
      (s) => s.id !== setor?.id && s.nome.toLowerCase() === limpo.toLowerCase(),
    )
    if (repetido) {
      setErro('Já existe um setor com esse nome.')
      return
    }

    setSalvando(true)
    try {
      if (editando) await atualizarSetor(setor.id, { nome: limpo, cor })
      else await adicionarSetor({ nome: limpo, cor })
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const apagar = async () => {
    setSalvando(true)
    try {
      await removerSetor(setor.id)
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
      setApagando(false)
    }
  }

  return (
    <>
      <Modal
        aberto={aberto}
        aoFechar={aoFechar}
        nivel={1}
        titulo={editando ? `Editar ${setor.nome}` : 'Novo setor'}
        subtitulo={
          editando
            ? `${emUso} cliente${emUso === 1 ? '' : 's'} neste setor.`
            : 'A cor pinta a etiqueta no card do cliente.'
        }
        largura={460}
      >
        <form className="setores__form" onSubmit={enviar}>
          <label className="setores__campo">
            <span>Nome</span>
            <input
              value={nome}
              onChange={(e) => {
                setNome(e.target.value)
                setErro('')
              }}
              placeholder="Ex.: Farmacêutico"
              autoFocus
            />
          </label>

          <EscolhaCor valor={cor} aoMudar={setCor} rotulo="Cor" />

          <div className="setores__paleta">
            {CORES_SUGERIDAS.map((c) => (
              <button
                key={c}
                type="button"
                className={`setores__cor ${cor.toLowerCase() === c ? 'is-atual' : ''}`.trim()}
                style={{ background: c }}
                onClick={() => setCor(c)}
                aria-label={`Usar a cor ${c}`}
              />
            ))}
          </div>

          <div className="setores__previa">
            <span className="setores__previanome">Como a etiqueta fica</span>
            <span className="setores__etiqueta is-previa" style={{ '--setor-cor': cor }}>
              {nome.trim() || 'Nome do setor'}
            </span>
          </div>

          {erro && (
            <p className="setores__erro" role="alert">
              {erro}
            </p>
          )}

          <footer className="formobra__acoes">
            {editando && (
              <button
                type="button"
                className="formrot__apagar"
                onClick={() => setApagando(true)}
                disabled={salvando}
              >
                Excluir
              </button>
            )}
            <button type="button" className="formobra__cancelar" onClick={aoFechar}>
              Cancelar
            </button>
            <Button type="submit" loading={salvando}>
              Salvar
            </Button>
          </footer>
        </form>
      </Modal>

      <Confirma
        aberto={apagando}
        titulo={`Apagar o setor ${setor?.nome ?? ''}?`}
        mensagem="O setor sai da lista e não dá para desfazer."
        aviso={
          emUso > 0
            ? `${emUso} cliente(s) estão neste setor. Eles NÃO são apagados — ficam sem setor até você reclassificar.`
            : undefined
        }
        rotuloConfirmar="Apagar setor"
        aoConfirmar={apagar}
        aoFechar={() => setApagando(false)}
      />
    </>
  )
}
