import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { useDados } from '@/context/DadosContext'
import { TIPOS_DE_ITEM } from '@/domain/itensEnsaio'
import './ModalProposta.css'
import './ModalTipoEnsaio.css'

/* ------------------------------------------------------------
   "Tipo de ensaio" — 1a etapa, card do Comercial (atualizacao 54).

   O Comercial escolhe O QUE a obra vai ensaiar: ambientes, equipamentos,
   sistemas, pontos de uso — um ou mais, os mesmos tipos de item do
   Planejamento de ensaios (TIPOS_DE_ITEM). Salvar ja marca o check. No
   Planejamento, o "Tipo do item" fica travado nestes tipos: o Time
   Tecnico so cadastra item de um tipo que o Comercial escolheu, e o
   servidor recusa igual.

   Quem nao marca o check (outro setor) so ve o que foi escolhido.
   ------------------------------------------------------------ */
export default function ModalTipoEnsaio({ aberto, obra, check, nomeCard, podeEditar, marcado, aoDesmarcar, aoFechar }) {
  const { definirTipoEnsaio } = useDados()
  const [tipos, setTipos] = useState([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setTipos(obra?.tiposEnsaio ?? [])
    setErro('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, obra?.id])

  if (!check || !obra) return null

  const alternar = (id) => {
    setTipos((atual) => (atual.includes(id) ? atual.filter((t) => t !== id) : [...atual, id]))
    setErro('')
  }

  const salvar = async () => {
    if (tipos.length === 0) {
      setErro('Escolha ao menos um tipo de ensaio.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await definirTipoEnsaio(obra.id, tipos)
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const escolhidos = obra.tiposEnsaio ?? []
  const mudou = tipos.length !== escolhidos.length || tipos.some((t) => !escolhidos.includes(t))

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={check.titulo} subtitulo={nomeCard} largura={520}>
      <div className="proposta tipoensaio">
        <p className="proposta__texto">
          {podeEditar
            ? 'Escolha o que esta obra vai ensaiar. No Planejamento de ensaios, o Time Técnico só cadastra itens destes tipos.'
            : escolhidos.length
              ? 'O que esta obra vai ensaiar, escolhido pelo Comercial. É o que o Planejamento de ensaios usa no "Tipo do item".'
              : 'O Comercial ainda não escolheu o tipo de ensaio desta obra.'}
        </p>

        <div className="tipoensaio__opcoes" role="group" aria-label="Tipos de ensaio">
          {TIPOS_DE_ITEM.map((t) => {
            const ligado = tipos.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                className="tipoensaio__opcao"
                aria-pressed={ligado}
                disabled={!podeEditar}
                onClick={() => alternar(t.id)}
              >
                <span className="tipoensaio__marca" aria-hidden="true">
                  {ligado ? '✓' : ''}
                </span>
                <span className="tipoensaio__texto">
                  <strong>{t.rotulo}</strong>
                  <span>Ex.: {t.exemplo}</span>
                </span>
              </button>
            )
          })}
        </div>

        {erro && (
          <p className="anexos__erro" role="alert">
            {erro}
          </p>
        )}

        {podeEditar && (
          <footer className="proposta__rodape">
            {marcado ? (
              <button
                type="button"
                className="proposta__desmarcar"
                onClick={async () => {
                  await aoDesmarcar()
                  aoFechar()
                }}
                disabled={salvando}
              >
                Desmarcar o check
              </button>
            ) : (
              <span />
            )}
            {(mudou || !marcado) && (
              <Button onClick={salvar} loading={salvando} disabled={tipos.length === 0}>
                Salvar tipo de ensaio
              </Button>
            )}
          </footer>
        )}
      </div>
    </Modal>
  )
}
