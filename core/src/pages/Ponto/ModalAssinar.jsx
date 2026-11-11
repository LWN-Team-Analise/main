import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { dataBR } from '@/domain/ponto'
import { assinarFolha } from '@/services/pontoService'

/**
 * ASSINAR a conferencia da folha de ponto. O duplo check: a pessoa marca
 * que conferiu as marcacoes do periodo E que concorda com elas — so com
 * os dois o botao libera, e o servidor confere os dois de novo. O nome
 * completo que vai ficar impresso no lugar de "Assinatura Funcionário"
 * aparece antes, para ninguem assinar sem saber como.
 */
export default function ModalAssinar({ aberto, aoFechar, inicio, fim, nome, desatualizada, aoAssinado }) {
  const [conferi, setConferi] = useState(false)
  const [concordo, setConcordo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!aberto) return
    setConferi(false)
    setConcordo(false)
    setErro('')
  }, [aberto])

  const assinar = async () => {
    setEnviando(true)
    setErro('')
    try {
      const assinatura = await assinarFolha({ inicio, fim, conferi, concordo })
      aoAssinado?.(assinatura)
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Assinar folha de ponto"
      subtitulo={`Conferência de ${dataBR(inicio)} a ${dataBR(fim)}`}
      largura={500}
    >
      <div className="pontoass">
        <p className="pontoass__texto">
          Você vai assinar o <strong>documento de conferência da folha de ponto</strong> deste período. Depois de assinada,
          a folha mostra o seu nome completo no lugar de &ldquo;Assinatura Funcionário&rdquo;, também no PDF.
        </p>
        {desatualizada && (
          <p className="pontoass__alerta">
            As marcações mudaram depois da sua última assinatura (uma importação nova). Confira de novo antes de assinar.
          </p>
        )}

        <div className="pontoass__nome" aria-label="Nome que será impresso">
          <span>Nome impresso na folha</span>
          <strong>{nome}</strong>
        </div>

        <label className="pontoass__check">
          <input type="checkbox" checked={conferi} onChange={(e) => setConferi(e.target.checked)} />
          <span>
            Conferi todas as marcações de {dataBR(inicio)} a {dataBR(fim)} nesta folha de ponto.
          </span>
        </label>
        <label className="pontoass__check">
          <input type="checkbox" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} />
          <span>Concordo com as marcações registradas e assino a folha como {nome}.</span>
        </label>

        {erro && (
          <p className="pontoass__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="pontoass__rodape">
          <Button onClick={assinar} loading={enviando} disabled={!conferi || !concordo}>
            Assinar folha de ponto
          </Button>
        </footer>
      </div>
    </Modal>
  )
}
