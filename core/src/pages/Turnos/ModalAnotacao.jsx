import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoArea } from '@/components/Campo/Campo'
import { ANOTACAO_MAXIMA } from '@/domain/turnos'
import * as turnosApi from '@/services/turnosService'
import { dataBR } from '@/utils/formato'

/** A "Anotacao do dia" da aba Turnos. Vazia, ela some. */
export default function ModalAnotacao({ aberto, dia, texto = '', aoFechar, aoSalvo }) {
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setValor(texto)
    setErro('')
  }, [aberto, texto])

  const salvar = async (novo) => {
    setSalvando(true)
    try {
      await turnosApi.salvarAnotacao(dia, novo)
      await aoSalvo()
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Anotação do dia" subtitulo={dia ? dataBR(dia) : undefined} largura={460}>
      <form
        className="turnoform"
        onSubmit={(e) => {
          e.preventDefault()
          salvar(valor.trim())
        }}
        noValidate
      >
        <CampoArea
          rotulo="Anotação"
          linhas={3}
          maxLength={ANOTACAO_MAXIMA}
          placeholder="Ex.: Feriado em Barueri"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          autoFocus
        />
        {erro && (
          <p className="formdesp__erro" role="alert">
            {erro}
          </p>
        )}
        <footer className="formobra__acoes">
          {texto && (
            <button type="button" className="formrot__apagar" onClick={() => salvar('')} disabled={salvando}>
              Apagar
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
  )
}
