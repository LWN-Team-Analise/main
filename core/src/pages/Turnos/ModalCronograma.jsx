import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { SeletorMulti } from '@/components/Seletor/Seletor'
import { CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import * as turnosApi from '@/services/turnosService'

/**
 * Criar e editar um CRONOGRAMA da aba Turnos: o nome e quem esta nele.
 *
 * Tirar alguem do cronograma leva junto os turnos que a pessoa tinha
 * nele. Excluir o cronograma apaga ele e todos os turnos dele.
 */
export default function ModalCronograma({ aberto, cronograma = null, aoFechar, aoSalvo }) {
  const { equipe, cargoPorChave } = useDados()
  const [nome, setNome] = useState('')
  const [membros, setMembros] = useState([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setNome(cronograma?.nome ?? '')
    setMembros(cronograma?.membros ?? [])
    setErro('')
    setApagando(false)
  }, [aberto, cronograma])

  const opcoes = useMemo(
    () =>
      equipe
        .filter((p) => p.ativo !== false && !cargoPorChave(p.cargo)?.painelTv)
        .map((p) => ({ valor: String(p.id), rotulo: p.nome }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    [equipe, cargoPorChave],
  )

  const salvar = async (evento) => {
    evento.preventDefault()
    if (!nome.trim()) {
      setErro('Dê um nome ao cronograma.')
      return
    }
    setSalvando(true)
    try {
      if (cronograma) await turnosApi.editarCronograma(cronograma.id, { nome: nome.trim(), membros })
      else await turnosApi.criarCronograma({ nome: nome.trim(), membros })
      await aoSalvo()
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const apagar = async () => {
    setApagando(false)
    setSalvando(true)
    try {
      await turnosApi.apagarCronograma(cronograma.id)
      await aoSalvo()
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const saem = cronograma ? cronograma.membros.filter((id) => !membros.includes(id)).length : 0

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={cronograma ? 'Editar cronograma' : 'Novo cronograma'} largura={520}>
      <form className="turnoform" onSubmit={salvar} noValidate>
        <CampoTexto
          rotulo="Nome"
          placeholder="Ex.: Cronograma Anápolis"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value)
            setErro('')
          }}
          maxLength={80}
          autoFocus
        />
        <div className="campo">
          <span className="campo__rotulo">Pessoas ({membros.length})</span>
          <SeletorMulti
            largo
            valores={membros}
            aoMudar={setMembros}
            opcoes={opcoes}
            vazio="Escolha as pessoas..."
            aria-label="Pessoas do cronograma"
          />
        </div>
        {saem > 0 && (
          <p className="turnoform__aviso">
            {saem === 1 ? 'Uma pessoa sai' : `${saem} pessoas saem`} deste cronograma, com os turnos que tinha nele.
          </p>
        )}

        {erro && (
          <p className="formdesp__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes">
          {cronograma && (
            <button type="button" className="formrot__apagar" onClick={() => setApagando(true)} disabled={salvando}>
              Excluir
            </button>
          )}
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={salvando}>
            {cronograma ? 'Salvar' : 'Criar cronograma'}
          </Button>
        </footer>
      </form>

      <Confirma
        aberto={apagando}
        titulo={`Excluir ${cronograma?.nome ?? 'o cronograma'}?`}
        mensagem="O cronograma e todos os turnos dele são apagados. Os turnos das obras (ponto de encontro) continuam nas obras."
        rotuloConfirmar="Excluir"
        aoConfirmar={apagar}
        aoFechar={() => setApagando(false)}
      />
    </Modal>
  )
}
