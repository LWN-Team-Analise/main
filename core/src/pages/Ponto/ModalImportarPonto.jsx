import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoArquivo } from '@/components/Campo/Campo'
import { dataBR, lerCalculoDiario, resumoDoArquivo } from '@/domain/ponto'
import { importarCalculo } from '@/services/pontoService'

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

/**
 * O texto do arquivo. O Calculo Diario sai em UTF-8; quem abre no Excel
 * e salva de novo costuma gravar em Windows-1252, e ai os acentos do
 * cabecalho ("Matrícula") viravam lixo e o arquivo era recusado. Se o
 * UTF-8 nao fecha, le no outro.
 */
async function lerTexto(arquivo) {
  const bytes = await arquivo.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/**
 * IMPORTAR — o "Calculo Diario" do sistema de ponto (.csv separado por
 * ";"). So esse modelo entra: as 22 colunas, com os nomes e na ordem do
 * arquivo do sistema (src/domain/ponto.js). A tela confere antes de
 * mandar e o servidor confere de novo; com qualquer linha errada, nada
 * entra.
 *
 * Importar o mesmo periodo de novo troca so os dias que mudaram.
 */
export default function ModalImportarPonto({ aberto, aoFechar, aoImportado }) {
  const [arquivo, setArquivo] = useState(null)
  const [lido, setLido] = useState(null)
  const [lendo, setLendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [detalhes, setDetalhes] = useState([])
  const [resultado, setResultado] = useState(null)

  /* cada abertura comeca do zero */
  useEffect(() => {
    if (!aberto) return
    setArquivo(null)
    setLido(null)
    setErro('')
    setDetalhes([])
    setResultado(null)
  }, [aberto])

  const escolher = async (escolhido) => {
    setErro('')
    setDetalhes([])
    setResultado(null)
    setLido(null)
    setArquivo({ nome: escolhido.name, tamanho: escolhido.size })
    if (!/\.csv$/i.test(escolhido.name)) {
      setErro('Escolha o .csv do Cálculo Diário, exportado do sistema de ponto.')
      return
    }
    setLendo(true)
    try {
      const conteudo = await lerTexto(escolhido)
      const leitura = lerCalculoDiario(conteudo)
      if (leitura.erros.length) {
        setErro(
          leitura.erros.length === 1 ? leitura.erros[0] : `O arquivo tem ${leitura.erros.length} problemas; nada será importado.`,
        )
        setDetalhes(leitura.erros.length === 1 ? [] : leitura.erros.slice(0, 8))
        return
      }
      setLido({ conteudo, nome: escolhido.name, resumo: resumoDoArquivo(leitura.registros), semCpf: leitura.semCpf })
    } catch {
      setErro('Não foi possível ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  const importar = async () => {
    if (!lido) return
    setEnviando(true)
    setErro('')
    setDetalhes([])
    try {
      const r = await importarCalculo({ conteudo: lido.conteudo, arquivo: lido.nome })
      setResultado(r)
      setLido(null)
      aoImportado?.(r)
    } catch (e) {
      setErro(e.message)
      setDetalhes(e.detalhes ?? [])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Importar folha de ponto"
      subtitulo="Cálculo Diário do sistema de ponto (.csv separado por ;)"
      largura={620}
    >
      <div className="pontoimp">
        <CampoArquivo
          rotulo="Arquivo"
          largo
          arquivo={arquivo}
          aceita=".csv,text/csv"
          ocupado={lendo || enviando}
          aoEscolher={escolher}
          aoRemover={() => {
            setArquivo(null)
            setLido(null)
            setErro('')
            setDetalhes([])
          }}
          dica="Só entra o Cálculo Diário, com as 22 colunas do modelo (CNPJ; Nome; Matrícula; ... Grupos). Importar o mesmo mês de novo atualiza os dias que mudaram."
        />

        {lido && (
          <div className="pontoimp__resumo" role="status">
            <p>
              <strong>{plural(lido.resumo.funcionarios, 'funcionário', 'funcionários')}</strong>,{' '}
              {plural(lido.resumo.dias, 'dia', 'dias')} de marcação, de {dataBR(lido.resumo.inicio)} a {dataBR(lido.resumo.fim)}.
            </p>
            {lido.semCpf.length > 0 && (
              <p className="pontoimp__aviso">
                Sem CPF no arquivo, fica de fora: {lido.semCpf.join(', ')}.
              </p>
            )}
          </div>
        )}

        {resultado && (
          <div className="pontoimp__resumo is-feito" role="status">
            <p>
              <strong>Importado.</strong> {plural(resultado.funcionarios, 'funcionário', 'funcionários')}, de{' '}
              {dataBR(resultado.inicio)} a {dataBR(resultado.fim)}: {plural(resultado.novos, 'dia novo', 'dias novos')},{' '}
              {plural(resultado.alterados, 'dia atualizado', 'dias atualizados')} e {plural(resultado.iguais, 'dia igual', 'dias iguais')}.
            </p>
            {resultado.semCpf?.length > 0 && (
              <p className="pontoimp__aviso">Sem CPF no arquivo, ficou de fora: {resultado.semCpf.join(', ')}.</p>
            )}
            {resultado.semUsuario?.length > 0 && (
              <p className="pontoimp__aviso">
                Sem usuário com o mesmo CPF (a folha fica guardada e aparece quando o CPF for incluído no cadastro):{' '}
                {resultado.semUsuario.join(', ')}.
              </p>
            )}
          </div>
        )}

        {erro && (
          <div className="pontoimp__erro" role="alert">
            <p>{erro}</p>
            {detalhes.length > 0 && (
              <ul>
                {detalhes.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <footer className="pontoimp__rodape">
          <Button onClick={importar} loading={enviando} disabled={!lido || lendo}>
            {lido ? `Importar ${plural(lido.resumo.dias, 'dia', 'dias')}` : 'Importar'}
          </Button>
        </footer>
      </div>
    </Modal>
  )
}
