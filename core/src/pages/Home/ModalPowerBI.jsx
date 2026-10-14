import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import { ESCOPOS, exportarParaPowerBI } from './exportarPowerBI'

/**
 * "Exportar para o Power BI" do Dashboard.
 *
 * Uma escolha so — o que vai no arquivo: tudo, so obras ou so
 * despesas — e o botao. O arquivo e uma planilha do Excel com uma
 * Tabela por assunto, que o Power BI abre em "Obter dados > Pasta de
 * trabalho do Excel" (ver exportarPowerBI.js).
 */
export default function ModalPowerBI({ aberto, aoFechar, aoExportado }) {
  const { user } = useAuth()
  const { obras, roteiroDaObra, clientePorId, equipe, nomeDoCargo, concluida, pode } = useDados()
  const revisor = pode('revisar_despesa_geral')

  const [escopo, setEscopo] = useState('tudo')
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState(false)

  useEffect(() => {
    if (aberto) setErro('')
  }, [aberto])

  const exportar = async (evento) => {
    evento.preventDefault()
    setGerando(true)
    setErro('')
    try {
      const tabelas = await exportarParaPowerBI({
        escopo,
        dados: { obras, roteiroDaObra, clientePorId, equipe, nomeDoCargo, concluida },
        revisor,
        quem: user?.name,
      })
      aoExportado?.(
        `Arquivo do Power BI gerado — ${tabelas
          .map((t) => `${t.tabela}: ${t.linhas} linha${t.linhas === 1 ? '' : 's'}`)
          .join(' · ')}.`,
      )
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Exportar para o Power BI" largura={500}>
      <form className="powerbi" onSubmit={exportar} noValidate>
        <p className="powerbi__lead">
          Sai uma planilha do Excel com o histórico completo, uma tabela por assunto. No Power BI
          Desktop: <strong>Obter dados › Pasta de trabalho do Excel</strong>, e marque as tabelas.
        </p>

        <fieldset className="powerbi__opcoes">
          <legend>O que exportar</legend>
          {Object.entries(ESCOPOS).map(([valor, { rotulo, descricao }]) => (
            <label key={valor} className={`powerbi__opcao ${escopo === valor ? 'is-atual' : ''}`.trim()}>
              <input
                type="radio"
                name="escopo"
                value={valor}
                checked={escopo === valor}
                onChange={() => setEscopo(valor)}
              />
              <span>
                <strong>{rotulo}</strong>
                <em>{descricao}</em>
              </span>
            </label>
          ))}
        </fieldset>

        {escopo !== 'obras' && !revisor && (
          <p className="powerbi__nota">
            As despesas saem somadas por dia, categoria e tipo, sem o nome de quem enviou — o detalhe
            por pessoa é de quem revisa as despesas.
          </p>
        )}

        {erro && (
          <p className="powerbi__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={gerando}>
            Exportar
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
