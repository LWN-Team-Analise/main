import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Seletor from '@/components/Seletor/Seletor'
import { CampoArquivo, CampoSelecao } from '@/components/Campo/Campo'
import { FUNIS, funilPorId } from '@/domain/comercial'
import { dataDaPlanilha, lerPlanilha } from '@/utils/lerPlanilha'
import * as comercial from '@/services/comercialService'

/** "Negócio - Data da próxima atividade" -> "negocio data da proxima atividade" */
const normal = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/* Os campos do negocio e como achar a coluna de cada um no arquivo
   exportado do Pipedrive (em portugues ou em ingles). */
const CAMPOS = [
  { id: 'titulo', rotulo: 'Título', acha: (n) => /\b(titulo|title)\b/.test(n) },
  { id: 'organizacao', rotulo: 'Organização', acha: (n) => /organiza|organization|empresa/.test(n) && !/endereco|address|\bid\b/.test(n) },
  { id: 'valor', rotulo: 'Valor', acha: (n) => /\b(valor|value)\b/.test(n) && !/moeda|currency|ponderad|weighted/.test(n) },
  { id: 'contatoNome', rotulo: 'Pessoa de contato', acha: (n) => /pessoa de contato|contact person|^pessoa nome$|^pessoa$/.test(n) },
  { id: 'contatoEmail', rotulo: 'E-mail do contato', acha: (n) => /\be ?mail\b/.test(n) },
  { id: 'contatoTelefone', rotulo: 'Telefone do contato', acha: (n) => /telefone|phone/.test(n) },
  { id: 'etapa', rotulo: 'Etapa', acha: (n) => /\b(etapa|stage)\b/.test(n) },
  { id: 'funil', rotulo: 'Funil', acha: (n) => /\b(funil|pipeline)\b/.test(n) },
  { id: 'responsavel', rotulo: 'Proprietário', acha: (n) => /proprietario|owner|responsavel/.test(n) },
  { id: 'proximaAtividade', rotulo: 'Próxima atividade', acha: (n) => /proxima atividade|next activity/.test(n) },
  { id: 'previsaoFechamento', rotulo: 'Fechamento esperado', acha: (n) => /fechamento esperad|expected close/.test(n) },
  { id: 'status', rotulo: 'Status', acha: (n) => /\b(status|situacao)\b/.test(n) },
]

/** O funil do Pipedrive ("VENDAS NOVAS", "RENOVAÇÃO"...) no nosso. */
function funilDoTexto(texto) {
  const n = normal(texto)
  if (!n) return null
  if (/renov/.test(n)) return 'renovacao'
  if (/resgat/.test(n)) return 'resgate'
  if (/prospec/.test(n)) return 'prospeccao'
  if (/venda|novo|nova/.test(n)) return 'novos'
  return null
}

/**
 * Trazer negocios de uma planilha — a exportacao do Pipedrive
 * (Negócios > ... > Exportar), em .xlsx ou .csv.
 *
 * Cada coluna do arquivo e casada com um campo do negocio pelo nome;
 * o que nao casou da para escolher na mao. Com a coluna "Funil", cada
 * linha vai para o funil dela (VENDAS NOVAS -> Novos negócios,
 * RENOVAÇÃO -> renovação...); sem ela, ou com um funil que nao existe
 * aqui, vai para o funil escolhido.
 */
export default function ModalImportar({ aberto, funilInicial, aoFechar, aoImportado }) {
  const [arquivo, setArquivo] = useState(null)
  const [planilha, setPlanilha] = useState(null)
  const [mapa, setMapa] = useState({})
  const [funil, setFunil] = useState(funilInicial)
  const [lendo, setLendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!aberto) return
    setArquivo(null)
    setPlanilha(null)
    setMapa({})
    setErro('')
    setFunil(funilInicial)
  }, [aberto, funilInicial])

  const escolher = async (file) => {
    setErro('')
    setArquivo({ nome: file.name, tamanho: file.size })
    setLendo(true)
    try {
      const lida = await lerPlanilha(file)
      const normais = lida.cabecalho.map(normal)
      const achado = {}
      CAMPOS.forEach((c) => {
        const i = normais.findIndex((n, j) => c.acha(n) && !Object.values(achado).includes(j))
        if (i >= 0) achado[c.id] = i
      })
      setPlanilha(lida)
      setMapa(achado)
    } catch (e) {
      setPlanilha(null)
      setErro(e.message)
    } finally {
      setLendo(false)
    }
  }

  /* as linhas ja no formato da API, separadas pelo funil de destino */
  const porFunil = useMemo(() => {
    if (!planilha) return {}
    const valor = (linha, campo) => (mapa[campo] === undefined ? '' : linha[mapa[campo]] ?? '')
    const grupos = {}
    planilha.linhas.forEach((linha) => {
      const destino = funilDoTexto(valor(linha, 'funil')) ?? funil
      ;(grupos[destino] ??= []).push({
        titulo: String(valor(linha, 'titulo')).trim(),
        organizacao: String(valor(linha, 'organizacao')).trim(),
        valor: valor(linha, 'valor'),
        contatoNome: String(valor(linha, 'contatoNome')).trim(),
        contatoEmail: String(valor(linha, 'contatoEmail')).trim(),
        contatoTelefone: String(valor(linha, 'contatoTelefone')).trim(),
        etapa: String(valor(linha, 'etapa')).trim(),
        responsavel: String(valor(linha, 'responsavel')).trim(),
        proximaAtividade: dataDaPlanilha(valor(linha, 'proximaAtividade')),
        previsaoFechamento: dataDaPlanilha(valor(linha, 'previsaoFechamento')),
        status: String(valor(linha, 'status')).trim(),
      })
    })
    return grupos
  }, [planilha, mapa, funil])

  const total = Object.values(porFunil).reduce((s, l) => s + l.length, 0)
  const semTitulo = mapa.titulo === undefined

  const importar = async () => {
    setEnviando(true)
    setErro('')
    let importados = 0
    let ignorados = 0
    try {
      for (const [destino, linhas] of Object.entries(porFunil)) {
        const r = await comercial.importarNegocios(destino, linhas)
        importados += r.importados
        ignorados += r.ignorados?.length ?? 0
      }
      aoImportado(
        `${importados} negócio${importados === 1 ? '' : 's'} importado${importados === 1 ? '' : 's'}` +
          (ignorados
            ? ` (${ignorados === 1 ? '1 linha sem título ficou' : `${ignorados} linhas sem título ficaram`} de fora).`
            : '.'),
      )
      aoFechar()
    } catch (e) {
      setErro(
        importados
          ? `${importados} entraram antes do erro: ${e.message}`
          : e.message,
      )
    } finally {
      setEnviando(false)
    }
  }

  const opcoesColuna = (planilha?.cabecalho ?? []).map((c, i) => ({ valor: String(i), rotulo: c || `Coluna ${i + 1}` }))

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Importar negócios" subtitulo="Planilha exportada do Pipedrive (.xlsx ou .csv)" largura={720}>
      <div className="importar">
        <CampoArquivo
          rotulo="Arquivo"
          largo
          arquivo={arquivo}
          aceita=".xlsx,.csv"
          ocupado={lendo}
          aoEscolher={escolher}
          aoRemover={() => {
            setArquivo(null)
            setPlanilha(null)
          }}
          dica="No Pipedrive: Negócios > Lista > ⋯ > Exportar resultados do filtro."
        />

        <CampoSelecao
          rotulo="Funil de destino"
          largo
          value={funil}
          onChange={(e) => setFunil(e.target.value)}
          opcoes={FUNIS.map((f) => ({ valor: f.id, rotulo: f.rotulo }))}
          dica="Linhas com a coluna Funil vão para o funil delas; as outras, para este."
        />

        {planilha && (
          <>
            <h3 className="importar__titulo">Colunas do arquivo</h3>
            <div className="importar__mapa">
              {CAMPOS.map((c) => (
                <label key={c.id} className="importar__campo">
                  <span>{c.rotulo}</span>
                  <Seletor
                    largo
                    valor={mapa[c.id] === undefined ? '' : String(mapa[c.id])}
                    aoMudar={(v) =>
                      setMapa((atual) => {
                        const novo = { ...atual }
                        if (v === '') delete novo[c.id]
                        else novo[c.id] = Number(v)
                        return novo
                      })
                    }
                    vazio="Não importar"
                    opcoes={[{ valor: '', rotulo: 'Não importar' }, ...opcoesColuna]}
                    aria-label={`Coluna de ${c.rotulo}`}
                  />
                </label>
              ))}
            </div>

            <p className="importar__resumo">
              {total} linha{total === 1 ? '' : 's'}:{' '}
              {Object.entries(porFunil)
                .map(([id, l]) => `${l.length} em ${funilPorId(id)?.rotulo ?? id}`)
                .join(', ')}
              .
            </p>
            {semTitulo && (
              <p className="negform__erro" role="alert">
                Escolha a coluna do Título: sem ela nenhum negócio entra.
              </p>
            )}
          </>
        )}

        {erro && (
          <p className="negform__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="negform__rodape">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button onClick={importar} loading={enviando} disabled={!planilha || semTitulo || total === 0}>
            {total ? `Importar ${total} negócio${total === 1 ? '' : 's'}` : 'Importar'}
          </Button>
        </footer>
      </div>
    </Modal>
  )
}
