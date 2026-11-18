import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoArea, CampoSelecao } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import { MOTIVOS_CANCELAMENTO } from '@/domain/obras'

const OPCOES = MOTIVOS_CANCELAMENTO.map((m) => ({ valor: m.id, rotulo: m.rotulo }))

/**
 * CANCELAR A OBRA (atualizacao 59) — o motivo e obrigatorio; "Outro
 * motivo" pede a observacao. A obra fecha como a concluida: sai do quadro,
 * fica so para leitura em Concluidas (com o selo de cancelada) e aparece
 * em "Obras canceladas", na area do Almoxarife.
 *
 * Quem abre e quem tem `cancelar_obras`; a API confere de novo.
 */
export default function ModalCancelarObra({ aberto, obra, nomeDaObra, aoFechar, aoCancelada }) {
  const { cancelarObra } = useDados()
  const [motivo, setMotivo] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setMotivo('')
    setObservacao('')
    setErro({})
  }, [aberto])

  const enviar = async (e) => {
    e.preventDefault()
    if (!motivo) return setErro({ motivo: 'Escolha o motivo do cancelamento.' })
    if (motivo === 'outro' && !observacao.trim()) return setErro({ observacao: 'Escreva qual foi o motivo.' })
    setSalvando(true)
    try {
      await cancelarObra(obra.id, { motivo, observacao: observacao.trim() })
      aoCancelada()
    } catch (falha) {
      setErro({ [falha.campo ?? 'geral']: falha.message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Cancelar esta obra?" subtitulo={nomeDaObra} largura={480}>
      <form className="formobs" onSubmit={enviar} noValidate>
        <CampoSelecao
          rotulo="Motivo do cancelamento"
          largo
          opcoes={OPCOES}
          vazio="Escolha o motivo..."
          value={motivo}
          onChange={(ev) => {
            setMotivo(ev.target.value)
            setErro({})
          }}
          erro={erro.motivo}
        />
        <CampoArea
          rotulo={motivo === 'outro' ? 'Qual foi o motivo?' : 'Observação (opcional)'}
          largo
          linhas={3}
          maxLength={1000}
          placeholder="O que precisa ficar registrado sobre o cancelamento?"
          value={observacao}
          onChange={(ev) => {
            setObservacao(ev.target.value)
            setErro({})
          }}
          erro={erro.observacao}
        />
        <p className="formobs__aviso">
          A obra sai do quadro e fica só para leitura em Concluídas, marcada como cancelada. Não dá para desfazer.
        </p>
        {erro.geral && (
          <p className="formobs__erro" role="alert">
            {erro.geral}
          </p>
        )}
        <footer className="formobra__acoes">
          <Button type="submit" loading={salvando}>
            Cancelar obra
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
