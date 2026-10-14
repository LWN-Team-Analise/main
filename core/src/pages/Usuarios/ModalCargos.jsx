import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import { useDados } from '@/context/DadosContext'
import ModalCargo from './ModalCargo'
import './ModalCargos.css'

const Mais = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/**
 * Lista dos SETORES, em linha unica que quebra quando chega no fim do
 * pop-up:  ADM | GQ | EXCELENCIA ...
 *
 * Setor e o grupo da equipe, de onde saem as permissoes; o cargo de cada
 * pessoa (Analista, Coordenador) e texto livre no cadastro dela. No
 * banco o setor continua sendo a tabela `cargo`, e por isso o codigo
 * daqui ainda usa esse nome.
 *
 * Clicar em um deles ja abre a edicao, em OUTRO pop-up por cima deste —
 * antes o formulario ficava embaixo da lista e os dois disputavam a
 * mesma tela.
 */
export default function ModalCargos({ aberto, aoFechar }) {
  const { cargos, equipe } = useDados()

  /* null = fechado | { cargo } = editando | { novo: true } = criando */
  const [editando, setEditando] = useState(null)

  useEffect(() => {
    if (!aberto) setEditando(null)
  }, [aberto])

  const quantos = (chave) => equipe.filter((p) => p.cargo === chave).length

  return (
    <>
      <Modal
        aberto={aberto}
        aoFechar={aoFechar}
        titulo="Setor"
        largura={560}
      >
        <div className="cargos">
          <ul className="cargos__linha">
            {cargos.map((cargo) => (
              <li key={cargo.id}>
                <button
                  type="button"
                  className="cargos__etiqueta"
                  style={{ '--cargo-cor': cargo.cor }}
                  onClick={() => setEditando({ cargo })}
                  title={`Editar ${cargo.nome}`}
                >
                  {cargo.nome}
                  <span className="cargos__quantos">{quantos(cargo.chave)}</span>
                </button>
              </li>
            ))}

            <li>
              <button
                type="button"
                className="cargos__novo"
                onClick={() => setEditando({ novo: true })}
              >
                <Mais />
                Novo setor
              </button>
            </li>
          </ul>
        </div>
      </Modal>

      {/* por cima da lista: nivel={1} */}
      <ModalCargo
        aberto={Boolean(editando)}
        cargo={editando?.cargo ?? null}
        aoFechar={() => setEditando(null)}
      />
    </>
  )
}
