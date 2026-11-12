import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Seletor from '@/components/Seletor/Seletor'
import { CampoData } from '@/components/CampoData/CampoData'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import {
  CABECALHO,
  DIAS_MAXIMOS,
  MESES,
  dataBR,
  dataValida,
  diasDoPeriodo,
  linhaDoArquivo,
  montarFolha,
  periodoDoMes,
  rotuloDoPeriodo,
} from '@/domain/ponto'
import { baixarPlanilha, paraNomeDeArquivo } from '@/utils/planilha'
import { carregarFolha, carregarPessoas, diasDaEmpresa } from '@/services/pontoService'
import FolhaPonto from './FolhaPonto'
import ModalImportarPonto from './ModalImportarPonto'
import ModalAssinar from './ModalAssinar'
import ModalAssinaturas from './ModalAssinaturas'
import { montarPdfDaFolha } from './pdfPonto'
import './Ponto.css'
import '../Administrativo/Administrativo.css'

/* ---- icones ---- */
const traco = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
const Seta = ({ lado }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...traco} strokeWidth="2.1" aria-hidden="true">
    <path d={lado === 'esq' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
  </svg>
)
const Importar = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} aria-hidden="true">
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </svg>
)
const Exportar = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} aria-hidden="true">
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14" />
  </svg>
)
const Lista = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} aria-hidden="true">
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path d="m3.6 6.4 1.2 1.2 2-2.2M3.6 11.9l1.2 1.2 2-2.2M4 17.5h2" />
  </svg>
)
const Pdf = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} aria-hidden="true">
    <path d="M6 3.5h8l4 4v13H6z" />
    <path d="M14 3.5v4h4M9 13h6M9 16.5h4" />
  </svg>
)
const Planilha = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...traco} aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 9.5h16M4 15h16M10 4v16" />
  </svg>
)

/* ---- datas ---- */
const doisDigitos = (n) => String(n).padStart(2, '0')
function mesAnterior() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}`
}
function somarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}`
}
/**
 * O periodo que veio no endereco (?inicio=&fim=, o link do aviso do Teams):
 * o mes inteiro abre no Mensal, outro trecho em Datas especificas. Sem ele
 * (ou com datas que nao existem), null: abre no mes anterior.
 */
function periodoDoEndereco(busca) {
  const inicio = busca.get('inicio')
  const fim = busca.get('fim')
  if (!dataValida(inicio) || !dataValida(fim) || fim < inicio || diasDoPeriodo(inicio, fim).length > DIAS_MAXIMOS) return null
  const doMes = periodoDoMes(inicio.slice(0, 7))
  if (doMes.inicio === inicio && doMes.fim === fim) return { modo: 'mes', mes: inicio.slice(0, 7), datas: doMes }
  return { modo: 'datas', mes: inicio.slice(0, 7), datas: { inicio, fim } }
}

/** 'DD/MM/AAAA HH:MM:SS', o "Documento gerado em" do espelho. */
function agora() {
  const d = new Date()
  return (
    `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}:${doisDigitos(d.getSeconds())}`
  )
}

/** O menu que abre embaixo do botao (Exportar). Fecha no clique fora e no Esc. */
function Menu({ rotulo, conteudo, titulo, desabilitado }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef(null)
  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => !caixa.current?.contains(e.target) && setAberto(false)
    const tecla = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])
  return (
    <div className="pontomenu" ref={caixa}>
      <button
        type="button"
        className="acao acao--fraca"
        aria-haspopup="true"
        aria-expanded={aberto}
        title={titulo}
        disabled={desabilitado}
        onClick={() => setAberto((v) => !v)}
      >
        {rotulo}
      </button>
      {aberto && (
        <div className="pontomenu__lista" role="menu">
          {conteudo(() => setAberto(false))}
        </div>
      )}
    </div>
  )
}

/**
 * PONTO — a folha de ponto (o espelho) de cada um.
 *
 * Todo mundo abre a aba e ve a PROPRIA folha, do mes ou de datas
 * escolhidas, e assina a conferencia no rodape. Quem tem
 * `gerenciar_ponto` (embaixo de Usuarios, no quadro de permissoes) ganha
 * o seletor de pessoa e o Importar; abre a folha de qualquer um, mas nao
 * assina por ninguem — o clique na assinatura de outra pessoa so avisa,
 * e a API recusa do mesmo jeito.
 *
 * As marcacoes chegam pelo Importar (o Calculo Diario do sistema de
 * ponto) e o Exportar devolve a folha em PDF (o espelho) e em Excel (no
 * formato do Calculo Diario).
 */
export default function Ponto() {
  const { user } = useAuth()
  const { pode } = useDados()
  const gestor = pode('gerenciar_ponto')
  const meuId = String(user?.id ?? '')

  /* o periodo do endereco vale so na abertura (o link do aviso do Teams) */
  const [busca] = useSearchParams()
  const [doEndereco] = useState(() => periodoDoEndereco(busca))
  const [modo, setModo] = useState(doEndereco?.modo ?? 'mes')
  const [mes, setMes] = useState(() => doEndereco?.mes ?? mesAnterior())
  const [datas, setDatas] = useState(() => doEndereco?.datas ?? periodoDoMes(mesAnterior()))
  const [usuarioId, setUsuarioId] = useState(meuId)

  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [pessoas, setPessoas] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [importando, setImportando] = useState(false)
  const [vendoAssinaturas, setVendoAssinaturas] = useState(false)
  const [assinando, setAssinando] = useState(false)
  const [exportando, setExportando] = useState('')

  /* o periodo que vale: o mes inteiro, ou as datas (se fizerem sentido) */
  const erroDatas = useMemo(() => {
    if (modo !== 'datas') return ''
    if (!datas.inicio || !datas.fim) return 'Escolha o início e o fim.'
    if (datas.fim < datas.inicio) return 'O fim vem antes do início.'
    if (diasDoPeriodo(datas.inicio, datas.fim).length > DIAS_MAXIMOS) return `O período vai até ${DIAS_MAXIMOS} dias.`
    return ''
  }, [modo, datas])
  const periodo = useMemo(() => (modo === 'mes' ? periodoDoMes(mes) : erroDatas ? null : datas), [modo, mes, datas, erroDatas])

  /* a folha: le de novo quando muda o periodo ou a pessoa. A resposta que
     chega atrasada (de um periodo que ja trocou) e descartada */
  const pedido = useRef(0)
  const ler = useCallback(async () => {
    if (!periodo) return
    const numero = (pedido.current += 1)
    setCarregando(true)
    setErro('')
    try {
      const r = await carregarFolha({ usuarioId: usuarioId === meuId ? null : usuarioId, ...periodo })
      if (numero === pedido.current) setDados(r)
    } catch (e) {
      if (numero === pedido.current) {
        setErro(e.message)
        setDados(null)
      }
    } finally {
      if (numero === pedido.current) setCarregando(false)
    }
  }, [periodo, usuarioId, meuId])

  useEffect(() => {
    ler()
  }, [ler])

  /* o seletor de pessoa: so para quem tem a permissao */
  const lerPessoas = useCallback(async () => {
    if (!gestor || !periodo) return
    try {
      setPessoas(await carregarPessoas(periodo))
    } catch {
      setPessoas(null)
    }
  }, [gestor, periodo])

  useEffect(() => {
    lerPessoas()
  }, [lerPessoas])

  useEffect(() => {
    if (!aviso) return undefined
    const t = setTimeout(() => setAviso(null), 7000)
    return () => clearTimeout(t)
  }, [aviso])

  const folha = useMemo(
    () => (dados && periodo && dados.dias?.length ? montarFolha(dados.dias, dados.inicio, dados.fim) : null),
    [dados, periodo],
  )
  const [geradoEm, setGeradoEm] = useState(agora)
  useEffect(() => setGeradoEm(agora()), [dados])

  const proprio = Boolean(dados?.proprio)
  const nomeDaPessoa = dados?.funcionario?.nome || dados?.usuario?.nome || ''
  const rotulo = periodo ? rotuloDoPeriodo(periodo.inicio, periodo.fim) : ''

  /* ---- o clique na area da assinatura ---- */
  const clicarAssinatura = () => {
    if (!dados) return
    if (!proprio) {
      setAviso({
        tom: 'alerta',
        texto: `Só ${nomeDaPessoa || 'o próprio funcionário'} pode assinar esta folha de ponto. Você pode ver a folha, mas não assina por outra pessoa.`,
      })
      return
    }
    if (dados.assinatura?.valida) {
      setAviso({
        tom: 'ok',
        texto: `Esta folha já está assinada desde ${new Date(dados.assinatura.assinadoEm).toLocaleString('pt-BR')}.`,
      })
      return
    }
    setAssinando(true)
  }

  /* ---- exportar ---- */
  const nomeDoArquivo = (prefixo, quem) =>
    `${prefixo}_${paraNomeDeArquivo(quem)}_${paraNomeDeArquivo(rotulo)}`.replace(/_+$/, '')

  const exportarPdf = async () => {
    if (!folha) return
    setExportando('pdf')
    try {
      const doc = await montarPdfDaFolha({
        folha,
        funcionario: dados.funcionario,
        usuario: dados.usuario,
        inicio: dados.inicio,
        fim: dados.fim,
        assinatura: dados.assinatura,
        geradoEm: agora(),
      })
      doc.save(`${nomeDoArquivo('EspelhoPonto', nomeDaPessoa)}.pdf`)
    } catch (e) {
      setAviso({ tom: 'alerta', texto: e.message || 'Não foi possível gerar o PDF.' })
    } finally {
      setExportando('')
    }
  }

  const planilha = (dias) => [
    {
      nome: 'Cálculo Diário',
      colunas: CABECALHO.map((titulo) => ({ titulo, tipo: 'texto', largura: LARGURA_EXCEL[titulo] ?? 14 })),
      linhas: dias.map(linhaDoArquivo),
    },
  ]

  const exportarExcel = () => {
    if (!dados?.dias?.length) return
    baixarPlanilha(planilha(dados.dias), nomeDoArquivo('CalculoDiario', nomeDaPessoa))
  }

  const exportarEmpresa = async () => {
    if (!periodo) return
    setExportando('empresa')
    try {
      const dias = await diasDaEmpresa(periodo)
      if (!dias.length) {
        setAviso({ tom: 'alerta', texto: `Nenhuma marcação importada de ${rotulo}.` })
        return
      }
      baixarPlanilha(planilha(dias), nomeDoArquivo('CalculoDiario', 'empresa'))
    } catch (e) {
      setAviso({ tom: 'alerta', texto: e.message })
    } finally {
      setExportando('')
    }
  }

  /* ---- as opcoes do seletor de pessoa ---- */
  const opcoesPessoa = useMemo(() => {
    const lista = pessoas?.pessoas ?? []
    const comigo = lista.some((p) => p.id === meuId) ? lista : [{ id: meuId, nome: user?.name ?? 'Eu', temFolha: true }, ...lista]
    return comigo.map((p) => ({
      valor: p.id,
      rotulo: `${p.nome}${p.id === meuId ? ' (você)' : ''}${
        p.assinada ? ' · assinada' : p.temCpf === false ? ' · sem CPF' : p.temFolha === false ? ' · sem folha' : ''
      }`,
    }))
  }, [pessoas, meuId, user])

  const [anoDoMes, numeroDoMes] = mes.split('-').map(Number)
  const opcoesAno = useMemo(() => {
    const atual = new Date().getFullYear()
    const anos = []
    for (let a = atual + 1; a >= 2020; a -= 1) anos.push({ valor: String(a), rotulo: String(a) })
    return anos
  }, [])

  const irParaMesDe = (data) => {
    setModo('mes')
    setMes(data.slice(0, 7))
  }

  return (
    <AppShell>
      <section className="ponto">
        <header className="ponto__topo">
          <div>
            {/* o Ponto mora na area administrativa: a volta e para o inicio dela */}
            <Link to="/app/administrativo" className="adm__voltar">
              <Seta lado="esq" />
              Administrativo
            </Link>
            <h1 className="tela__titulo">Ponto</h1>
            {!gestor && (
              <p className="tela__lead">A sua folha de ponto. Confira as marcações do período e assine no rodapé.</p>
            )}
          </div>
        </header>

        {/* ---------------- filtros, pessoa, importar e exportar ---------------- */}
        <div className="ponto__barra">
          <div className="ponto__filtros">
            <div className="ponto__modo" role="group" aria-label="Período">
              <button
                type="button"
                className={`chip ${modo === 'mes' ? 'is-atual' : ''}`.trim()}
                onClick={() => setModo('mes')}
                aria-pressed={modo === 'mes'}
              >
                Mensal
              </button>
              <button
                type="button"
                className={`chip ${modo === 'datas' ? 'is-atual' : ''}`.trim()}
                onClick={() => {
                  if (modo === 'mes') setDatas(periodoDoMes(mes))
                  setModo('datas')
                }}
                aria-pressed={modo === 'datas'}
              >
                Datas específicas
              </button>
            </div>

            {modo === 'mes' ? (
              <div className="ponto__periodo">
                <button type="button" className="ponto__passo" onClick={() => setMes((m) => somarMes(m, -1))} aria-label="Mês anterior">
                  <Seta lado="esq" />
                </button>
                <div className="ponto__mes">
                  <Seletor
                    valor={String(numeroDoMes)}
                    aoMudar={(m) => setMes(`${anoDoMes}-${doisDigitos(m)}`)}
                    opcoes={MESES.map((nome, i) => ({ valor: String(i + 1), rotulo: nome }))}
                    aria-label="Mês"
                  />
                </div>
                <div className="ponto__ano">
                  <Seletor
                    valor={String(anoDoMes)}
                    aoMudar={(a) => setMes(`${a}-${doisDigitos(numeroDoMes)}`)}
                    opcoes={opcoesAno}
                    aria-label="Ano"
                  />
                </div>
                <button type="button" className="ponto__passo" onClick={() => setMes((m) => somarMes(m, 1))} aria-label="Próximo mês">
                  <Seta lado="dir" />
                </button>
              </div>
            ) : (
              <div className="ponto__datas">
                <CampoData valor={datas.inicio} aoMudar={(v) => setDatas((d) => ({ ...d, inicio: v }))} vazio="Início" />
                <span className="ponto__ate">até</span>
                <CampoData valor={datas.fim} aoMudar={(v) => setDatas((d) => ({ ...d, fim: v }))} min={datas.inicio} vazio="Fim" />
              </div>
            )}
          </div>

          <div className="ponto__acoes">
            {gestor && (
              <div className="ponto__pessoa">
                <Seletor
                  largo
                  valor={usuarioId}
                  aoMudar={(v) => setUsuarioId(String(v))}
                  opcoes={opcoesPessoa}
                  aria-label="Funcionário"
                />
              </div>
            )}
            {gestor && (
              <button
                type="button"
                className="acao acao--fraca"
                onClick={() => setVendoAssinaturas(true)}
                disabled={!periodo}
                title="Ver quem assinou e quem não assinou a folha deste período"
              >
                <Lista />
                Assinaturas
              </button>
            )}
            {gestor && (
              <button
                type="button"
                className="acao acao--padrao"
                onClick={() => setImportando(true)}
                title="Importar o Cálculo Diário do sistema de ponto (.csv)"
              >
                <Importar />
                Importar
              </button>
            )}
            <Menu
              titulo="Exportar a folha em PDF ou em Excel"
              desabilitado={Boolean(exportando)}
              rotulo={
                <>
                  <Exportar />
                  {exportando ? 'Gerando...' : 'Exportar'}
                </>
              }
              conteudo={(fechar) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!folha}
                    onClick={() => {
                      fechar()
                      exportarPdf()
                    }}
                  >
                    <Pdf /> PDF (espelho de ponto)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!dados?.dias?.length}
                    onClick={() => {
                      fechar()
                      exportarExcel()
                    }}
                  >
                    <Planilha /> Excel (Cálculo Diário desta folha)
                  </button>
                  {gestor && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        fechar()
                        exportarEmpresa()
                      }}
                    >
                      <Planilha /> Excel de todos ({rotulo})
                    </button>
                  )}
                </>
              )}
            />
          </div>
        </div>

        {erroDatas && (
          <p className="ponto__erro" role="alert">
            {erroDatas}
          </p>
        )}

        {aviso && (
          <p className={`recado ponto__aviso ${aviso.tom === 'alerta' ? 'is-alerta' : ''}`.trim()} role={aviso.tom === 'alerta' ? 'alert' : 'status'}>
            {aviso.texto}
            <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}

        {gestor && pessoas?.semUsuario?.length > 0 && (
          <details className="ponto__soltos">
            <summary>
              {pessoas.semUsuario.length === 1
                ? '1 funcionário do arquivo não tem usuário com o mesmo CPF'
                : `${pessoas.semUsuario.length} funcionários do arquivo não têm usuário com o mesmo CPF`}
            </summary>
            <p>
              A folha deles fica guardada e aparece quando o CPF for incluído no cadastro (Usuários): {pessoas.semUsuario.join(', ')}.
            </p>
          </details>
        )}

        {/* ---------------- a ficha ---------------- */}
        <div className={`ponto__conteudo ${carregando ? 'is-carregando' : ''}`.trim()} aria-busy={carregando}>
          {erro ? (
            <p className="ponto__erro" role="alert">
              {erro}
            </p>
          ) : !dados ? (
            !erroDatas && <p className="ponto__vazio">Carregando a folha...</p>
          ) : dados.semCpf ? (
            <div className="ponto__vazio vidro">
              <strong>{proprio ? 'Seu cadastro ainda não tem CPF.' : `${dados.usuario.nome} ainda não tem CPF no cadastro.`}</strong>
              <p>
                A folha de ponto liga com o cadastro pelo CPF.{' '}
                {proprio ? 'Inclua o seu em Configurações para ver a sua folha.' : 'Inclua o CPF em Usuários para ver a folha.'}
              </p>
            </div>
          ) : !folha ? (
            <div className="ponto__vazio vidro">
              <strong>Nenhuma marcação importada de {dataBR(dados.inicio)} a {dataBR(dados.fim)}.</strong>
              {!gestor && <p>A folha aparece aqui quando o RH importar as marcações deste período.</p>}
              {dados.ultimaData && (
                <button type="button" className="acao acao--fraca" onClick={() => irParaMesDe(dados.ultimaData)}>
                  Ver {MESES[Number(dados.ultimaData.slice(5, 7)) - 1]} de {dados.ultimaData.slice(0, 4)} (a última folha importada)
                </button>
              )}
            </div>
          ) : (
            <FolhaPonto
              folha={folha}
              funcionario={dados.funcionario}
              usuario={dados.usuario}
              inicio={dados.inicio}
              fim={dados.fim}
              assinatura={dados.assinatura}
              geradoEm={geradoEm}
              proprio={proprio}
              aoClicarAssinatura={clicarAssinatura}
            />
          )}
        </div>
      </section>

      {gestor && periodo && (
        <ModalAssinaturas
          aberto={vendoAssinaturas}
          aoFechar={() => setVendoAssinaturas(false)}
          inicio={periodo.inicio}
          fim={periodo.fim}
          pessoas={pessoas?.pessoas}
          aoMudar={(id, mudou) =>
            setPessoas((atual) =>
              atual ? { ...atual, pessoas: atual.pessoas.map((p) => (p.id === id ? { ...p, ...mudou } : p)) } : atual,
            )
          }
          aoAbrirFolha={(id) => {
            setUsuarioId(String(id))
            setVendoAssinaturas(false)
          }}
        />
      )}

      {gestor && (
        <ModalImportarPonto
          aberto={importando}
          aoFechar={() => setImportando(false)}
          aoImportado={() => {
            ler()
            lerPessoas()
          }}
        />
      )}

      {dados && proprio && (
        <ModalAssinar
          aberto={assinando}
          aoFechar={() => setAssinando(false)}
          inicio={dados.inicio}
          fim={dados.fim}
          nome={nomeDaPessoa}
          desatualizada={Boolean(dados.assinatura) && !dados.assinatura.valida}
          aoAssinado={(assinatura) => {
            setAssinando(false)
            setDados((d) => (d ? { ...d, assinatura } : d))
            setAviso({ tom: 'ok', texto: `Folha de ponto assinada. O seu nome ficou impresso na folha de ${rotulo}.` })
            lerPessoas()
          }}
        />
      )}
    </AppShell>
  )
}

/* as larguras das colunas no Excel, para os textos longos caberem */
const LARGURA_EXCEL = {
  CNPJ: 20,
  Nome: 32,
  CPF: 14,
  Departamento: 18,
  Cargo: 26,
  'Jornada Esperada': 40,
  'Nome Escala': 34,
  'Natureza Dia': 22,
  'Marcações Válidas': 32,
  'Jornada Considerada': 30,
  Eventos: 34,
}
