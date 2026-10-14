import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import './ModalTitulos.css'

const Mais = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/**
 * Cadastro de CARGOS — "Analista de Qualidade", "Coordenador de Obras".
 *
 * Nao confundir com Setor, que e o vizinho de botao: o setor e o grupo
 * da equipe, tem cor e carrega as permissoes; o cargo e so o titulo da
 * pessoa dentro dele.
 *
 * Por isso o cargo NAO tem cor. Duas paletas no mesmo card — uma do
 * setor, outra do cargo — brigariam sem dizer nada a mais: quem
 * identifica pela cor no quadro inteiro e o setor.
 *
 * A lista e uma linha de etiquetas que quebra no fim do pop-up. Clicar
 * em uma abre a edicao em OUTRO pop-up por cima deste, igual ao de
 * setor — assim o formulario nao disputa a tela com a lista.
 */
export default function ModalTitulos({ aberto, aoFechar }) {
  const { titulos, equipe } = useDados()

  /* null = fechado | { titulo } = editando | { novo: true } = criando */
  const [editando, setEditando] = useState(null)

  useEffect(() => {
    if (!aberto) setEditando(null)
  }, [aberto])

  const quantos = (id) =>
    equipe.filter((p) => String(p.cargoTituloId ?? '') === String(id)).length

  return (
    <>
      <Modal aberto={aberto} aoFechar={aoFechar} titulo="Cargos" largura={520}>
        <div className="titulos">
          {titulos.length === 0 && (
            <p className="titulos__vazio">Nenhum cargo cadastrado ainda.</p>
          )}

          <ul className="titulos__linha">
            {titulos.map((titulo) => (
              <li key={titulo.id}>
                <button
                  type="button"
                  className="titulos__etiqueta"
                  onClick={() => setEditando({ titulo })}
                  title={`Editar ${titulo.nome}`}
                >
                  {titulo.nome}
                  <span className="titulos__quantos">{quantos(titulo.id)}</span>
                </button>
              </li>
            ))}

            <li>
              <button
                type="button"
                className="titulos__novo"
                onClick={() => setEditando({ novo: true })}
              >
                <Mais />
                Novo cargo
              </button>
            </li>
          </ul>
        </div>
      </Modal>

      {/* por cima da lista: nivel={1} */}
      <FormTitulo
        aberto={Boolean(editando)}
        titulo={editando?.titulo ?? null}
        emUso={editando?.titulo ? quantos(editando.titulo.id) : 0}
        aoFechar={() => setEditando(null)}
      />
    </>
  )
}

/** Um cargo: cria ou renomeia, com Excluir ao lado de Salvar. */
function FormTitulo({ aberto, titulo = null, emUso = 0, aoFechar }) {
  const { titulos, adicionarTitulo, atualizarTitulo, removerTitulo } = useDados()

  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const editando = Boolean(titulo)

  useEffect(() => {
    if (!aberto) return
    setNome(titulo?.nome ?? '')
    setErro('')
    setConfirmando(false)
  }, [aberto, titulo])

  const enviar = async (evento) => {
    evento.preventDefault()

    const limpo = nome.trim()
    if (!limpo) {
      setErro('Informe o nome do cargo.')
      return
    }

    const repetido = titulos.some(
      (t) => t.id !== titulo?.id && t.nome.toLowerCase() === limpo.toLowerCase(),
    )
    if (repetido) {
      setErro('Já existe um cargo com esse nome.')
      return
    }

    setSalvando(true)
    try {
      if (editando) await atualizarTitulo(titulo.id, { nome: limpo })
      else await adicionarTitulo({ nome: limpo })
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
      await removerTitulo(titulo.id)
      aoFechar()
    } catch (e) {
      setErro(e.message)
      setConfirmando(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      nivel={1}
      titulo={editando ? `Editar ${titulo.nome}` : 'Novo cargo'}
      subtitulo={
        editando ? `${emUso} pessoa${emUso === 1 ? '' : 's'} neste cargo.` : undefined
      }
      largura={440}
    >
      <form className="titulos__form" onSubmit={enviar} noValidate>
        <CampoTexto
          rotulo="Nome do cargo"
          largo
          autoFocus
          placeholder="Ex.: Analista de Qualidade"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value)
            setErro('')
          }}
          erro={erro}
        />

        <footer className="formobra__acoes">
          {editando &&
            (confirmando ? (
              <button
                type="button"
                className="formrot__apagar is-confirmando"
                onClick={apagar}
                disabled={salvando}
              >
                Confirmar exclusão
              </button>
            ) : (
              <button
                type="button"
                className="formrot__apagar"
                onClick={() => setConfirmando(true)}
                disabled={salvando}
              >
                Excluir
              </button>
            ))}
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={salvando}>
            Salvar
          </Button>
        </footer>

        {confirmando && (
          <p className="formrot__aviso" role="alert">
            O cargo sai da lista. Quem estiver nele fica sem cargo.
          </p>
        )}
      </form>
    </Modal>
  )
}
