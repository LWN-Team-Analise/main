import { useState } from 'react'
import Button from '@/components/Button/Button'
import { useDados } from '@/context/DadosContext'
import { useTheme } from '@/context/ThemeContext'
import { textoSobre } from '@/utils/cor'
import './ModalEtiquetas.css'

/**
 * Etiquetas do CARD do roteiro — um bloco, e nao uma caixa propria.
 *
 * Ele mora DENTRO do formulario de editar card. Tinha um botao so
 * para ele no cabecalho do card, e era um botao a mais numa fila que
 * ja disputava espaco com o titulo: em card de nome comprido, as
 * ferramentas abriam por cima do texto. Etiquetar e editar o card sao
 * a mesma ida — agora sao a mesma tela.
 *
 * Irmao de `ModalEtiquetas`, que faz o mesmo para a OBRA, e separado
 * dele de proposito, do banco ate aqui:
 *
 *   a etiqueta da OBRA diz o que aquela obra e ("retrabalho",
 *   "garantia"); a do CARD diz o que aquele pedaco do roteiro e
 *   ("depende do cliente", "precisa de ART").
 *
 * Catalogos separados (`etiqueta` e `etiqueta_card` no banco)
 * significam que a lista de sugestoes de uma NAO aparece na outra, e
 * que renomear do lado da obra nao mexe na etiqueta do card.
 *
 * Como ele vive dentro de um <form>, nada aqui e <form> nem
 * `type="submit"`: um Enter no nome da etiqueta salvaria o CARD.
 */

const CORES = [
  '#d93a34', '#e08a1e', '#2f8f5b', '#2a4fd6',
  '#8244c9', '#0f9aa8', '#c2a23a', '#5b6470',
]

const Icone = {
  mais: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  x: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
}

export default function EtiquetasCard({ card }) {
  const { etiquetasDeCard, etiquetarCard, tirarEtiquetaCard } = useDados()
  const { isDark } = useTheme()

  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES[0])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (!card) return null

  const postas = card.etiquetas ?? []
  const jaPosta = (e) => postas.some((p) => String(p.id) === String(e.id))
  /* o catalogo menos o que ja esta neste card: sugerir o que ja
     esta colado ali so daria um clique que nao faz nada */
  const sugestoes = etiquetasDeCard.filter((e) => !jaPosta(e))

  const guardar = async (campos) => {
    setSalvando(true)
    setErro('')
    try {
      await etiquetarCard(card.id, campos)
      setCriando(false)
      setNome('')
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const criar = async () => {
    if (!nome.trim()) {
      setErro('Escreva o nome da etiqueta.')
      return
    }
    await guardar({ nome: nome.trim(), cor })
  }

  const tirar = async (etiqueta) => {
    setErro('')
    try {
      await tirarEtiquetaCard(card.id, etiqueta.id)
    } catch (e) {
      setErro(e.message)
    }
  }

  return (
    <section className="etiqc">
      <span className="formrot__rotulo">Etiquetas do card</span>

      <div className="etiq">
        {criando ? (
          <div className="etiq__form">
            <input
              className="etiqc__campo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da etiqueta"
              maxLength={40}
              autoFocus
              aria-label="Nome da etiqueta"
            />

            <div className="etiq__cores" role="radiogroup" aria-label="Cor da etiqueta">
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={cor === c}
                  aria-label={`Cor ${c}`}
                  className={`etiq__cor ${cor === c ? 'is-atual' : ''}`.trim()}
                  style={{ background: c }}
                  onClick={() => setCor(c)}
                />
              ))}
            </div>

            <footer className="etiqc__acoes">
              <button type="button" className="formobra__cancelar" onClick={() => setCriando(false)}>
                Cancelar
              </button>
              <Button type="button" loading={salvando} onClick={criar}>
                Adicionar
              </Button>
            </footer>
          </div>
        ) : (
          <button type="button" className="etiq__novo" onClick={() => setCriando(true)}>
            <Icone.mais />
            Adicionar etiqueta
          </button>
        )}

        {erro && (
          <p className="etiq__erro" role="alert">
            {erro}
          </p>
        )}

        {postas.length === 0 ? (
          <p className="etiq__vazio">Nenhuma etiqueta neste card ainda.</p>
        ) : (
          <ul className="etiqc__lista">
            {postas.map((e) => (
              <li key={e.id}>
                <span
                  className="etiqc__pastilha"
                  style={{ background: e.cor, color: textoSobre(e.cor, isDark) }}
                >
                  {e.nome}
                </span>
                <button
                  type="button"
                  className="etiqc__tirar"
                  onClick={() => tirar(e)}
                  title="Tirar esta etiqueta do card"
                  aria-label={`Tirar ${e.nome}`}
                >
                  <Icone.x />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* reaproveitar uma que ja existe em outro card. A lista vem do
            catalogo dos CARDS — as etiquetas de obra nao entram aqui */}
        {sugestoes.length > 0 && (
          <div className="etiqc__reusar">
            <p className="etiqc__reusartopo">Usar uma que já existe</p>
            <div className="etiqc__reusarlista">
              {sugestoes.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="etiqc__pastilha etiqc__pastilha--botao"
                  style={{ background: e.cor, color: textoSobre(e.cor, isDark) }}
                  onClick={() => guardar({ etiquetaId: e.id, nome: e.nome, cor: e.cor })}
                  disabled={salvando}
                >
                  {e.nome}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
