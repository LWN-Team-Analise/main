import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoArea, CampoTexto } from '@/components/Campo/Campo'
import * as avisosApi from '@/services/avisosService'
import { dataHora } from '@/utils/formato'
import './ModalAvisoGeral.css'

/**
 * O aviso geral inteiro, aberto pelo card do Panorama: o card mostra
 * duas linhas do texto, aqui ele aparece todo, com quem mandou e quando.
 * Quem tem `enviar_avisos` exclui por aqui (com confirmacao).
 */
export function ModalLerAviso({ aviso, podeApagar, aoFechar }) {
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (aviso) setErro('')
  }, [aviso])

  const apagar = async () => {
    setApagando(false)
    try {
      await avisosApi.apagarAviso(aviso.id)
      aoFechar()
    } catch (falha) {
      setErro(falha.message)
    }
  }

  return (
    <>
      <Modal
        aberto={Boolean(aviso)}
        aoFechar={aoFechar}
        titulo={aviso?.titulo ?? ''}
        subtitulo={
          aviso
            ? [aviso.enviadoPorNome && `Enviado por ${aviso.enviadoPorNome}`, dataHora(aviso.enviadoEm)]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        largura={480}
      >
        {aviso && (
          <div className="avisogeral">
            {aviso.importante && (
              <span className="avisogeral__selo">
                <span className="avisogeral__pingo" aria-hidden="true" />
                Importante
              </span>
            )}
            {/* sem texto, so o titulo (no alto do pop-up) */}
            {aviso.mensagem && <p className="avisogeral__texto">{aviso.mensagem}</p>}

            {erro && (
              <p className="avisogeral__erro" role="alert">
                {erro}
              </p>
            )}

            <footer className="formobra__acoes">
              {podeApagar && (
                <button type="button" className="formrot__apagar avisogeral__apagar" onClick={() => setApagando(true)}>
                  Excluir aviso
                </button>
              )}
              <Button onClick={aoFechar}>Fechar</Button>
            </footer>
          </div>
        )}
      </Modal>

      <Confirma
        aberto={apagando}
        nivel={1}
        titulo="Excluir aviso"
        mensagem={aviso ? `"${aviso.titulo}" sai do Panorama de todo mundo.` : ''}
        rotuloConfirmar="Excluir"
        aoConfirmar={apagar}
        aoFechar={() => setApagando(false)}
      />
    </>
  )
}

/**
 * O "Enviar aviso" do botao "+" (AppShell): um recado para a empresa
 * inteira, que aparece no card "Avisos e Comunicados" do Panorama, na
 * pagina inicial (atualizacao 46).
 *
 * Titulo obrigatorio; o texto e opcional ("Ponto facultativo — 14/11"
 * ja diz tudo). "Importante" pinta o pingo do card de laranja e deixa
 * o aviso sempre no topo do card.
 * Depois de enviar, o pop-up confirma e oferece abrir o Panorama.
 *
 * Quem ve o botao e quem tem `enviar_avisos`; a API confere de novo.
 */
export default function ModalAvisoGeral({ aberto, aoFechar }) {
  const navegar = useNavigate()
  const [campos, setCampos] = useState({ titulo: '', mensagem: '', importante: false })
  const [erro, setErro] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setCampos({ titulo: '', mensagem: '', importante: false })
    setErro({})
    setEnviado(false)
  }, [aberto])

  const mudar = (campo, valor) => {
    setCampos((atual) => ({ ...atual, [campo]: valor }))
    setErro((atual) => ({ ...atual, [campo]: undefined, geral: undefined }))
  }

  const enviar = async (e) => {
    e.preventDefault()
    const titulo = campos.titulo.trim()
    if (!titulo) return setErro({ titulo: 'Dê um título ao aviso.' })

    setEnviando(true)
    try {
      await avisosApi.enviarAviso({ ...campos, titulo, mensagem: campos.mensagem.trim() })
      setEnviado(true)
    } catch (falha) {
      setErro({ geral: falha.message })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={enviado ? 'Aviso enviado' : 'Enviar aviso'}
      largura={480}
    >
      {enviado ? (
        <div className="avisogeral avisogeral--feito">
          <span className="avisogeral__ok" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          </span>
          <p>
            <strong>{campos.titulo.trim()}</strong> já está no Panorama, na página inicial, para todo mundo.
          </p>
          <footer className="formobra__acoes">
            <button type="button" className="formobra__cancelar" onClick={aoFechar}>
              Fechar
            </button>
            <Button
              onClick={() => {
                aoFechar()
                navegar('/app')
              }}
            >
              Ver no Panorama
            </Button>
          </footer>
        </div>
      ) : (
        <form className="avisogeral" onSubmit={enviar} noValidate>
          <CampoTexto
            rotulo="Título"
            placeholder="Ex.: Manutenção no sistema LWN Core"
            maxLength={120}
            value={campos.titulo}
            onChange={(e) => mudar('titulo', e.target.value)}
            erro={erro.titulo}
            autoFocus
          />

          <CampoArea
            rotulo="Texto (opcional)"
            placeholder="Ex.: O sistema ficará indisponível no dia 10/11 das 18h às 20h."
            linhas={3}
            maxLength={2000}
            value={campos.mensagem}
            onChange={(e) => mudar('mensagem', e.target.value)}
          />

          <label className="avisogeral__importante">
            <input
              type="checkbox"
              checked={campos.importante}
              onChange={(e) => mudar('importante', e.target.checked)}
            />
            <span className="avisogeral__pingo" aria-hidden="true" />
            <strong>Importante</strong>
          </label>

          {erro.geral && (
            <p className="avisogeral__erro" role="alert">
              {erro.geral}
            </p>
          )}

          <footer className="formobra__acoes">
            <button type="button" className="formobra__cancelar" onClick={aoFechar}>
              Cancelar
            </button>
            <Button type="submit" loading={enviando}>
              Enviar aviso
            </Button>
          </footer>
        </form>
      )}
    </Modal>
  )
}
