import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoSelecao } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import { corAdaptada } from '@/utils/cor'
import { faixaDoNivel, montarOrganograma, nomeCurto, nomeDoTime } from '@/domain/organograma'
import logo from '@/assets/LogoLWN.png'
import './Organograma.css'

/**
 * ORGANOGRAMA (atualizacao 59) — na Area admin.
 *
 * E a folha da diretoria: uma folha A4 deitada, com o titulo e a logo em
 * cima, os diretores (o setor Diretor) ligados por uma linha e, abaixo
 * deles, todos os times na ordem da folha — Albert Einstein, Tecnico,
 * Anapolis, Qualidade, Comercial, Excelencia, Administrativo e Almoxarife
 * (ORDEM_DOS_TIMES, em src/domain/organograma.js). Cada time e uma coluna
 * arredondada com a cor do setor e o nome embaixo; dentro dele as pessoas
 * descem pelo nivel do cargo, com a foto num anel da cor do nivel.
 *
 * O desenho cabe sempre inteiro na folha (a escala sai da medida dele). O
 * zoom so aumenta a folha na tela, e o "Exportar" baixa a folha como
 * imagem A4 (3508 x 2480, 300 dpi), igual ao que esta na tela.
 *
 * Quem tem `editar_organograma` escolhe, pelo "Editar" de cada time, quem
 * fica no topo dele. O resto vem de Usuarios: quem entra, sai, muda de
 * setor ou de cargo muda aqui.
 */

/* A4 deitada: 297 x 210 mm; a imagem sai a 300 dpi */
const PROPORCAO = 210 / 297
const LARGURA_DA_IMAGEM = 3508

export default function Organograma() {
  const { cargos, equipe, pode } = useDados()
  const edita = pode('editar_organograma')
  const [editando, setEditando] = useState(null)
  const [exportando, setExportando] = useState(false)
  const [erro, setErro] = useState('')
  const desenho = useMemo(() => montarOrganograma(cargos, equipe), [cargos, equipe])
  const folha = useFolha()

  const exportar = async () => {
    if (!folha.folha.current) return
    setExportando(true)
    setErro('')
    try {
      const no = folha.folha.current
      const imagem = await toPng(no, {
        pixelRatio: LARGURA_DA_IMAGEM / no.offsetWidth,
        backgroundColor: '#ffffff',
        cacheBust: true,
        /* o "Editar" e da tela, nao do papel */
        filter: (elemento) => !elemento.classList?.contains('orgtime__editar'),
        /* na imagem a folha e a pagina inteira: sem a sombra e o canto da tela */
        style: { borderRadius: '0', boxShadow: 'none', margin: '0' },
      })
      const link = document.createElement('a')
      link.href = imagem
      link.download = `organograma-${new Date().toISOString().slice(0, 10)}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (falha) {
      setErro(`Não foi possível gerar a imagem: ${falha?.message ?? 'erro desconhecido'}.`)
    } finally {
      setExportando(false)
    }
  }

  return (
    <AppShell>
      <section className="organograma">
        <header className="organograma__topo">
          <div>
            <h1 className="tela__titulo">Organograma</h1>
            <p className="tela__lead">
              A diretoria e os times, cada pessoa no nível do cargo.
              {edita ? ' Use "Editar" em cada time para dizer quem fica no topo dele.' : ''}
            </p>
          </div>
          <div className="organograma__acoes">
            <div className="orgzoom" role="group" aria-label="Zoom da folha">
              <button type="button" onClick={folha.menos} aria-label="Diminuir" disabled={folha.zoom <= ZOOM_MINIMO}>
                −
              </button>
              <span aria-live="polite">{Math.round(folha.zoom * 100)}%</span>
              <button type="button" onClick={folha.mais} aria-label="Aumentar" disabled={folha.zoom >= ZOOM_MAXIMO}>
                +
              </button>
              <button type="button" className="orgzoom__ajustar" onClick={folha.ajustar} disabled={folha.zoom === 1}>
                Ajustar
              </button>
            </div>
            <Button onClick={exportar} loading={exportando} disabled={desenho.times.length === 0}>
              Exportar
            </Button>
          </div>
        </header>

        {erro && (
          <p className="organograma__erro" role="alert">
            {erro}
          </p>
        )}

        <div className="orgcaixa" ref={folha.caixa}>
          <div
            className="orgfolha"
            ref={folha.folha}
            style={{ width: folha.largura, height: folha.largura * PROPORCAO, '--w': `${folha.largura}px` }}
          >
            <Ondas />
            <h2 className="orgfolha__titulo">Organograma</h2>
            <div className="orgfolha__area" ref={folha.area}>
              <div
                className="orgmapa"
                ref={folha.mapa}
                style={{ transform: `translate(${folha.encaixe.x}px, 0) scale(${folha.encaixe.escala})` }}
              >
                <img className="orgmapa__logo" src={logo} alt="LWN" />
                <span className="orgelo" aria-hidden="true" />
                <ul className="orglinha orglinha--diretores">
                  {desenho.diretores.length === 0 ? (
                    <li>
                      <Fio lado="cima" />
                      <div className="orgp orgp--vago">
                        <span className="orgp__foto">?</span>
                        <strong className="orgp__cargo">Diretoria</strong>
                      </div>
                      <Fio lado="baixo" />
                    </li>
                  ) : (
                    desenho.diretores.map((pessoa) => (
                      <li key={pessoa.id}>
                        <Fio lado="cima" />
                        <Pessoa pessoa={pessoa} nivel={0} destaque />
                        <Fio lado="baixo" />
                      </li>
                    ))
                  )}
                </ul>
                {desenho.times.length > 0 && (
                  <>
                    <span className="orgelo" aria-hidden="true" />
                    <ul className="orglinha orglinha--times">
                      {desenho.times.map((time) => (
                        <Time
                          key={time.setor.id}
                          time={time}
                          cor={corAdaptada(time.setor.cor ?? '#6b7280', false)}
                          aoEditar={edita ? () => setEditando(time.setor) : null}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ModalTopo setor={editando} aoFechar={() => setEditando(null)} />
    </AppShell>
  )
}

/** As ondas azuis do fundo da folha, como no papel da diretoria. */
function Ondas() {
  return (
    <svg className="orgfolha__ondas" viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="orgonda" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9d8f5" />
          <stop offset="1" stopColor="#5fa3e6" />
        </linearGradient>
      </defs>
      <path d="M0 250 C 180 150 320 330 520 230 S 860 120 1000 190 L 1000 420 L 0 420 Z" fill="url(#orgonda)" opacity="0.22" />
      <path d="M0 300 C 220 210 380 380 600 280 S 880 200 1000 250 L 1000 420 L 0 420 Z" fill="url(#orgonda)" opacity="0.2" />
      <path d="M0 350 C 200 300 420 420 640 330 S 900 290 1000 320 L 1000 420 L 0 420 Z" fill="url(#orgonda)" opacity="0.18" />
      <path d="M0 200 C 240 120 360 300 560 190 S 840 90 1000 140" fill="none" stroke="#7fb5ec" strokeWidth="1.2" opacity="0.35" />
      <path d="M0 230 C 250 160 380 330 580 220 S 850 130 1000 170" fill="none" stroke="#7fb5ec" strokeWidth="1" opacity="0.3" />
    </svg>
  )
}

/**
 * O fio de uma linha do desenho: a barra que liga o primeiro ao ultimo da
 * linha e o pino ate cada um. `lado` = 'cima' (a barra em cima da pessoa)
 * ou 'baixo' (embaixo, ligando a linha a de baixo).
 */
const Fio = ({ lado }) => <span className={`orgfio orgfio--${lado}`} aria-hidden="true" />

/** A pessoa: a foto no anel da cor do nivel, o cargo e o nome. */
function Pessoa({ pessoa, nivel, destaque = false }) {
  return (
    <div className="orgp" data-faixa={faixaDoNivel(nivel)} data-destaque={destaque ? 'sim' : undefined} title={pessoa.nome}>
      <span className="orgp__foto">
        <Avatar nome={pessoa.nome} foto={pessoa.foto} tamanho={destaque ? 56 : 44} />
      </span>
      <strong className="orgp__cargo">{pessoa.cargoTitulo || pessoa.cargoNome || 'Sem cargo'}</strong>
      <span className="orgp__nome">{nomeCurto(pessoa.nome)}</span>
    </div>
  )
}

/** Um time: a coluna arredondada com a cor do setor, as linhas e o nome embaixo. */
function Time({ time, cor, aoEditar }) {
  const { setor, linhas } = time
  return (
    <li className="orgtime" style={{ '--cor': cor }}>
      <Fio lado="cima" />
      <div className="orgtime__corpo">
        {linhas.length === 0 ? (
          <p className="orgtime__vazio">Ninguém neste time</p>
        ) : (
          linhas.map((linha, i) => (
            <div key={i} className="orgtime__nivel">
              {i > 0 && <span className="orgelo" aria-hidden="true" />}
              <ul className="orglinha">
                {linha.map(({ pessoa, nivel }) => (
                  <li key={pessoa.id}>
                    {i > 0 && <Fio lado="cima" />}
                    <Pessoa pessoa={pessoa} nivel={nivel} />
                    {i < linhas.length - 1 && <Fio lado="baixo" />}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <footer className="orgtime__rodape">
          <strong className="orgtime__nome">{nomeDoTime(setor)}</strong>
          {aoEditar && (
            <button type="button" className="orgtime__editar" onClick={aoEditar}>
              Editar
            </button>
          )}
        </footer>
      </div>
    </li>
  )
}

const ZOOM_MINIMO = 1
const ZOOM_MAXIMO = 4
const PASSO = 0.25

/**
 * A folha na tela e o encaixe do desenho nela.
 *
 * A folha ocupa a largura da tela (zoom 100%) e cresce com o +; a caixa em
 * volta rola. O desenho e medido sem a escala (o transform nao muda o
 * offsetWidth) e cabe inteiro na area da folha, centrado na largura.
 */
function useFolha() {
  const caixa = useRef(null)
  const folha = useRef(null)
  const area = useRef(null)
  const mapa = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [larguraDaCaixa, setLarguraDaCaixa] = useState(0)
  const [encaixe, setEncaixe] = useState({ escala: 1, x: 0 })

  const largura = Math.max(320, larguraDaCaixa) * zoom

  const medir = useCallback(() => {
    if (caixa.current) setLarguraDaCaixa((atual) => (atual === caixa.current.clientWidth ? atual : caixa.current.clientWidth))
    if (!area.current || !mapa.current) return
    const aw = area.current.clientWidth
    const ah = area.current.clientHeight
    const mw = mapa.current.offsetWidth
    const mh = mapa.current.offsetHeight
    if (!aw || !ah || !mw || !mh) return
    const escala = Math.min(aw / mw, ah / mh)
    const x = Math.max(0, (aw - mw * escala) / 2)
    setEncaixe((atual) =>
      Math.abs(atual.escala - escala) < 0.0005 && Math.abs(atual.x - x) < 0.5 ? atual : { escala, x },
    )
  }, [])

  useLayoutEffect(() => {
    medir()
  })

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const observador = new ResizeObserver(() => medir())
    ;[caixa, area, mapa].forEach((ref) => ref.current && observador.observe(ref.current))
    return () => observador.disconnect()
  }, [medir])

  const mudar = (delta) => setZoom((atual) => Math.max(ZOOM_MINIMO, Math.min(ZOOM_MAXIMO, atual + delta)))

  return {
    caixa,
    folha,
    area,
    mapa,
    zoom,
    largura,
    encaixe,
    menos: () => mudar(-PASSO),
    mais: () => mudar(PASSO),
    ajustar: () => setZoom(1),
  }
}

/** Quem fica no topo do time. */
function ModalTopo({ setor, aoFechar }) {
  const { equipe, atualizarOrganograma } = useDados()
  const [liderId, setLiderId] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!setor) return
    setLiderId(setor.liderId ?? '')
    setErro('')
  }, [setor])

  /* as pessoas do proprio time primeiro: e de la que o topo costuma sair */
  const pessoas = useMemo(() => {
    if (!setor) return []
    const rotulo = (p) => `${p.nome}${p.cargoTitulo ? ` · ${p.cargoTitulo}` : p.cargoNome ? ` (${p.cargoNome})` : ''}`
    const ativos = equipe.filter((p) => p.ativo !== false)
    const doTime = ativos.filter((p) => p.cargo === setor.chave).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const outros = ativos.filter((p) => p.cargo !== setor.chave).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return [...doTime, ...outros].map((p) => ({ valor: String(p.id), rotulo: rotulo(p) }))
  }, [equipe, setor])

  const salvar = async (e) => {
    e.preventDefault()
    setSalvando(true)
    try {
      await atualizarOrganograma(setor.id, { liderId: liderId || null })
      aoFechar()
    } catch (falha) {
      setErro(falha.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={Boolean(setor)}
      aoFechar={aoFechar}
      titulo="Topo do time"
      subtitulo={setor ? nomeDoTime(setor) : ''}
      largura={460}
    >
      <form className="orgform" onSubmit={salvar} noValidate>
        <CampoSelecao
          rotulo="Quem fica no topo"
          dica="Sem ninguém marcado, o cargo de cada pessoa decide a ordem."
          vazio="O cargo de cada um decide"
          opcoes={[{ valor: '', rotulo: 'O cargo de cada um decide' }, ...pessoas]}
          value={liderId}
          onChange={(ev) => {
            setLiderId(ev.target.value)
            setErro('')
          }}
        />
        {erro && (
          <p className="orgform__erro" role="alert">
            {erro}
          </p>
        )}
        <footer className="orgform__rodape">
          <Button type="submit" loading={salvando}>
            Salvar
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
