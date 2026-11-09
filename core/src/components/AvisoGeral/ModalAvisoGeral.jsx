import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoArea, CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { CampoData } from '@/components/CampoData/CampoData'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import { chaveDoCargo } from '@/domain/obras'
import * as avisosApi from '@/services/avisosService'
import { dataBR, dataHora, hojeISO } from '@/utils/formato'
import './ModalAvisoGeral.css'

const TODOS = 'Todos os setores'

/** Para quem foi o aviso. */
const paraQuem = (aviso) => aviso.setorNome ?? TODOS

/** Em que pe o aviso esta: quando termina, ou quando terminou. */
function fimDoAviso(aviso) {
  if (aviso.situacao === 'encerrado') {
    return `Encerrado em ${dataHora(aviso.encerradoEm).split(' às ')[0]}${
      aviso.encerradoPorNome ? ` por ${aviso.encerradoPorNome}` : ''
    }`
  }
  if (aviso.situacao === 'expirado') return `Expirou em ${dataBR(aviso.expiraEm)}`
  return aviso.expiraEm ? `Expira em ${dataBR(aviso.expiraEm)}` : 'Sem expiração'
}

/**
 * O aviso geral inteiro, aberto pelo card do Panorama ou pelo historico.
 *
 * Quem tem `enviar_avisos` encerra por aqui (ele sai do Panorama e fica
 * no historico) e exclui (some de vez). Excluir tem duplo check: a
 * confirmacao so libera o botao depois de marcar a caixinha, porque
 * excluir e o unico gesto que tira o aviso do historico.
 */
export function ModalLerAviso({ aviso, podeApagar, nivel = 0, aoFechar }) {
  const [apagando, setApagando] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (aviso) setErro('')
  }, [aviso])

  /* so fecha o aviso se deu certo; a falha aparece dentro dele */
  const fazer = (acao) => async () => {
    try {
      await acao(aviso.id)
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
        nivel={nivel}
      >
        {aviso && (
          <div className="avisogeral">
            <p className="avisogeral__dados">
              {aviso.importante && (
                <span className="avisogeral__selo">
                  <span className="avisogeral__pingo" aria-hidden="true" />
                  Importante
                </span>
              )}
              <span className="avisogeral__dado">{paraQuem(aviso)}</span>
              <span className="avisogeral__dado">{fimDoAviso(aviso)}</span>
            </p>

            {/* sem texto, so o titulo (no alto do pop-up) */}
            {aviso.mensagem && <p className="avisogeral__texto">{aviso.mensagem}</p>}

            {erro && (
              <p className="avisogeral__erro" role="alert">
                {erro}
              </p>
            )}

            {podeApagar && (
              <footer className="formobra__acoes">
                <button type="button" className="formrot__apagar avisogeral__apagar" onClick={() => setApagando(true)}>
                  Excluir aviso
                </button>
                {aviso.situacao === 'ativo' && <Button onClick={() => setEncerrando(true)}>Encerrar aviso</Button>}
              </footer>
            )}
          </div>
        )}
      </Modal>

      <Confirma
        aberto={encerrando}
        nivel={nivel + 1}
        tom="acao"
        titulo="Encerrar aviso"
        mensagem={aviso ? `"${aviso.titulo}" sai do Panorama e fica no histórico de avisos.` : ''}
        rotuloConfirmar="Encerrar"
        aoConfirmar={fazer(avisosApi.encerrarAviso)}
        aoFechar={() => setEncerrando(false)}
      />

      <Confirma
        aberto={apagando}
        nivel={nivel + 1}
        titulo="Excluir aviso"
        mensagem={aviso ? `"${aviso.titulo}" será apagado de vez, inclusive do histórico.` : ''}
        ciencia="Entendi que este aviso não vai ficar no histórico."
        rotuloConfirmar="Excluir"
        aoConfirmar={fazer(avisosApi.apagarAviso)}
        aoFechar={() => setApagando(false)}
      />
    </>
  )
}

/** Uma linha do historico; o clique abre o aviso inteiro. */
function LinhaDoHistorico({ aviso, aoAbrir }) {
  return (
    <li>
      <button
        type="button"
        className="avisoshist__linha"
        data-importante={aviso.importante ? 'sim' : undefined}
        onClick={() => aoAbrir(aviso)}
      >
        <span className="avisoshist__ponto" aria-hidden="true" />
        <span className="avisoshist__corpo">
          <strong>{aviso.titulo}</strong>
          {aviso.mensagem && <span className="avisoshist__texto">{aviso.mensagem}</span>}
          <span className="avisoshist__dados">
            {paraQuem(aviso)} · {fimDoAviso(aviso)}
          </span>
        </span>
        <time className="avisoshist__data" dateTime={aviso.enviadoEm}>
          {dataHora(aviso.enviadoEm).split(' às ')[0]}
        </time>
      </button>
    </li>
  )
}

/**
 * O historico de avisos: todos os avisos que nao foram excluidos, os que
 * ainda estao valendo em cima e os que ja sairam do Panorama embaixo.
 *
 * Quem tem `enviar_avisos` ve os de todos os setores (a API decide) e e
 * por aqui que encerra o aviso mandado para um setor que nao e o dele.
 */
export function ModalHistoricoAvisos({ aberto, podeApagar, aoFechar }) {
  /* null = ainda carregando */
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [lendo, setLendo] = useState(null)

  useEffect(() => {
    if (!aberto) return undefined
    let vivo = true
    const ler = () =>
      avisosApi
        .carregarHistorico()
        .then((novos) => {
          if (!vivo) return
          setDados(novos)
          setErro('')
        })
        .catch((falha) => vivo && setErro(falha.message))
    setDados(null)
    ler()
    /* encerrar ou excluir la dentro: a lista se refaz sozinha */
    window.addEventListener(avisosApi.AVISOS_MUDARAM, ler)
    return () => {
      vivo = false
      window.removeEventListener(avisosApi.AVISOS_MUDARAM, ler)
    }
  }, [aberto])

  const grupos = dados
    ? [
        { titulo: 'Em andamento', avisos: dados.ativos },
        { titulo: 'Encerrados', avisos: dados.encerrados },
      ].filter((g) => g.avisos.length > 0)
    : []

  return (
    <>
      <Modal aberto={aberto} aoFechar={aoFechar} titulo="Histórico de avisos" largura={600}>
        <div className="avisoshist">
          {erro && (
            <p className="avisogeral__erro" role="alert">
              {erro}
            </p>
          )}
          {!erro && dados === null && <p className="avisoshist__vazio">Carregando...</p>}
          {dados && grupos.length === 0 && <p className="avisoshist__vazio">Nenhum aviso por aqui.</p>}
          {grupos.map((g) => (
            <section key={g.titulo}>
              <h3 className="avisoshist__grupo">{g.titulo}</h3>
              <ul className="avisoshist__lista">
                {g.avisos.map((a) => (
                  <LinhaDoHistorico key={a.id} aviso={a} aoAbrir={setLendo} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Modal>

      <ModalLerAviso aviso={lendo} podeApagar={podeApagar} nivel={1} aoFechar={() => setLendo(null)} />
    </>
  )
}

const CAMPOS_VAZIOS = { titulo: '', mensagem: '', importante: false, setor: '', expiraEm: '' }

/**
 * O "Enviar aviso" do botao "+" (AppShell): um recado para a empresa
 * inteira ou para um setor so, que aparece no card "Avisos e
 * Comunicados" do Panorama (atualizacoes 46 e 47).
 *
 * Titulo obrigatorio; o texto e opcional ("Ponto facultativo — 14/11"
 * ja diz tudo). "Importante" pinta o pingo do card de laranja e deixa
 * o aviso sempre no topo do card. Com data de expiracao, o aviso vale
 * ate o fim daquele dia e vai sozinho para o historico; sem ela, fica
 * ate alguem encerrar.
 *
 * Quem ve o botao e quem tem `enviar_avisos`; a API confere de novo.
 */
export default function ModalAvisoGeral({ aberto, aoFechar }) {
  const navegar = useNavigate()
  const { user } = useAuth()
  const { cargos } = useDados()
  const [campos, setCampos] = useState(CAMPOS_VAZIOS)
  const [erro, setErro] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setCampos(CAMPOS_VAZIOS)
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

  /* a tela da TV nao tem Panorama: nao ha quem leia o aviso la */
  const setores = (cargos ?? []).filter((c) => !c.painelTv)
  const nomeDoSetor = setores.find((c) => c.chave === campos.setor)?.nome
  /* so oferece abrir o Panorama quando o aviso aparece no de quem enviou */
  const chegaEmMim = !campos.setor || campos.setor === chaveDoCargo(user)

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={enviado ? 'Aviso enviado' : 'Enviar aviso'} largura={480}>
      {enviado ? (
        <div className="avisogeral avisogeral--feito">
          <span className="avisogeral__ok" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          </span>
          <p>
            <strong>{campos.titulo.trim()}</strong> já está no Panorama{' '}
            {nomeDoSetor ? `do setor ${nomeDoSetor}` : 'de todos os setores'}.
          </p>
          {chegaEmMim && (
            <footer className="formobra__acoes">
              <Button
                onClick={() => {
                  aoFechar()
                  navegar('/app')
                }}
              >
                Ver no Panorama
              </Button>
            </footer>
          )}
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

          <div className="avisogeral__linha">
            <CampoSelecao
              rotulo="Setor"
              value={campos.setor}
              onChange={(e) => mudar('setor', e.target.value)}
              vazio={TODOS}
              opcoes={[{ valor: '', rotulo: TODOS }, ...setores.map((c) => ({ valor: c.chave, rotulo: c.nome }))]}
            />
            <div className="avisogeral__expira">
              <CampoData
                rotulo="Expira em"
                valor={campos.expiraEm}
                aoMudar={(v) => mudar('expiraEm', v)}
                min={hojeISO()}
                vazio="Sem expiração"
                erro={erro.expiraEm}
              />
              {/* o calendario escolhe um dia, mas nao desfaz a escolha */}
              {campos.expiraEm && (
                <button type="button" className="avisogeral__limpar" onClick={() => mudar('expiraEm', '')}>
                  Sem expiração
                </button>
              )}
            </div>
          </div>

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
            <Button type="submit" loading={enviando}>
              Enviar aviso
            </Button>
          </footer>
        </form>
      )}
    </Modal>
  )
}
