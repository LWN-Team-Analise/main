import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoSelecao } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import { useTheme } from '@/context/ThemeContext'
import { corAdaptada } from '@/utils/cor'
import {
  candidatosADiretor,
  faixaDoNivel,
  montarOrganograma,
  nomeCurto,
  nomeDoTime,
} from '@/domain/organograma'
import logoClara from '@/assets/LogoLWN.png'
import logoEscura from '@/assets/LogoLWNWhite.png'
import './Organograma.css'

/**
 * ORGANOGRAMA (atualizacao 59) — na Area admin.
 *
 * O desenho da diretoria: a logo em cima, os diretores ligados por uma
 * linha e, abaixo de cada um, os times dele — cada setor uma coluna
 * arredondada com a cor dele e o nome embaixo. Dentro do time, as pessoas
 * descem por nivel do cargo (src/domain/organograma.js), com a foto num
 * anel da cor do nivel.
 *
 * Quem tem `editar_organograma` (o Administrativo) diz, pelo "Editar" de
 * cada time, a que diretor ele responde e quem fica no topo dele. O resto
 * vem de Usuarios: quem entra, sai, muda de setor ou de cargo muda aqui.
 *
 * O desenho e largo: fica numa caixa que rola para os lados, com o zoom
 * (−, +, Ajustar) para ver tudo de uma vez no celular.
 */
export default function Organograma() {
  const { cargos, equipe, pode } = useDados()
  const { isDark } = useTheme()
  const edita = pode('editar_organograma')
  const [editando, setEditando] = useState(null)
  const grupos = useMemo(() => montarOrganograma(cargos, equipe), [cargos, equipe])
  const zoom = useZoom()

  return (
    <AppShell>
      <section className="organograma">
        <header className="organograma__topo">
          <div>
            <h1 className="tela__titulo">Organograma</h1>
            <p className="tela__lead">
              Os diretores, os times de cada um e quem está em cada time, pelo cargo.
              {edita ? ' Use "Editar" em cada time para dizer a que diretor ele responde.' : ''}
            </p>
          </div>
          <div className="orgzoom" role="group" aria-label="Zoom do organograma">
            <button type="button" onClick={zoom.menos} aria-label="Diminuir" disabled={zoom.valor <= zoom.minimo}>
              −
            </button>
            <span aria-live="polite">{Math.round(zoom.valor * 100)}%</span>
            <button type="button" onClick={zoom.mais} aria-label="Aumentar" disabled={zoom.valor >= zoom.maximo}>
              +
            </button>
            <button type="button" className="orgzoom__ajustar" onClick={zoom.ajustar} aria-pressed={zoom.ajustado}>
              Ajustar
            </button>
          </div>
        </header>

        {grupos.length === 0 ? (
          <p className="organograma__vazio">Nenhum setor cadastrado.</p>
        ) : (
          <div className="orgcaixa" ref={zoom.caixa}>
            <div
              className="orgcaixa__palco"
              style={{ width: zoom.tamanho.largura * zoom.valor, height: zoom.tamanho.altura * zoom.valor }}
            >
              <div className="orgmapa" ref={zoom.mapa} style={{ transform: `scale(${zoom.valor})` }}>
                <img className="orgmapa__logo" src={isDark ? logoEscura : logoClara} alt="LWN" />
                <span className="orgelo" aria-hidden="true" />
                <ul className="orglinha orglinha--grupos">
                  {grupos.map((grupo) => (
                    <li key={grupo.diretor?.id ?? 'sem-diretor'} className="orggrupo">
                      <Fio lado="cima" />
                      {grupo.diretor ? (
                        <Pessoa pessoa={grupo.diretor} nivel={0} destaque />
                      ) : (
                        <div className="orgp orgp--vago">
                          <span className="orgp__foto">?</span>
                          <strong className="orgp__cargo">Sem diretor definido</strong>
                        </div>
                      )}
                      {grupo.times.length > 0 && (
                        <>
                          <span className="orgelo" aria-hidden="true" />
                          <ul className="orglinha orglinha--times">
                            {grupo.times.map((time) => (
                              <Time
                                key={time.setor.id}
                                time={time}
                                cor={corAdaptada(time.setor.cor ?? '#6b7280', isDark)}
                                aoEditar={edita ? () => setEditando(time.setor) : null}
                              />
                            ))}
                          </ul>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      <ModalLugar setor={editando} aoFechar={() => setEditando(null)} />
    </AppShell>
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
        <Avatar nome={pessoa.nome} foto={pessoa.foto} tamanho={destaque ? 60 : 48} />
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
                  <li key={pessoa.id} className="orgtime__pessoa">
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

const ZOOM_MINIMO = 0.35
const ZOOM_MAXIMO = 1.5
const PASSO = 0.1

/**
 * O zoom do desenho. Comeca ajustado a largura da tela (nunca maior que
 * 100%) e segue ajustado ate a pessoa mexer no − ou no +. O desenho e
 * medido sem a escala (o transform nao muda o offsetWidth), e o palco em
 * volta ganha o tamanho ja escalado, para a rolagem bater.
 */
function useZoom() {
  const caixa = useRef(null)
  const mapa = useRef(null)
  const [valor, setValor] = useState(1)
  const [ajustado, setAjustado] = useState(true)
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 })

  const encaixar = useCallback(() => {
    if (!caixa.current || !mapa.current) return
    const largura = mapa.current.offsetWidth
    const altura = mapa.current.offsetHeight
    setTamanho((atual) => (atual.largura === largura && atual.altura === altura ? atual : { largura, altura }))
    if (ajustado && largura > 0) {
      const cabe = caixa.current.clientWidth / largura
      setValor(Math.max(ZOOM_MINIMO, Math.min(1, Math.floor(cabe * 100) / 100)))
    }
  }, [ajustado])

  useLayoutEffect(() => {
    encaixar()
  })

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const observador = new ResizeObserver(() => encaixar())
    if (caixa.current) observador.observe(caixa.current)
    if (mapa.current) observador.observe(mapa.current)
    return () => observador.disconnect()
  }, [encaixar])

  const mudar = (delta) => {
    setAjustado(false)
    setValor((atual) => Math.max(ZOOM_MINIMO, Math.min(ZOOM_MAXIMO, Math.round((atual + delta) * 100) / 100)))
  }

  return {
    caixa,
    mapa,
    valor,
    tamanho,
    ajustado,
    minimo: ZOOM_MINIMO,
    maximo: ZOOM_MAXIMO,
    menos: () => mudar(-PASSO),
    mais: () => mudar(PASSO),
    ajustar: () => setAjustado(true),
  }
}

/** O lugar do time: a que diretor responde e quem fica no topo. */
function ModalLugar({ setor, aoFechar }) {
  const { cargos, equipe, atualizarOrganograma } = useDados()
  const [diretorId, setDiretorId] = useState('')
  const [liderId, setLiderId] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!setor) return
    setDiretorId(setor.diretorId ?? '')
    setLiderId(setor.liderId ?? '')
    setErro('')
  }, [setor])

  const rotulo = (p) => `${p.nome}${p.cargoTitulo ? ` · ${p.cargoTitulo}` : p.cargoNome ? ` (${p.cargoNome})` : ''}`

  const diretores = useMemo(
    () => candidatosADiretor(cargos, equipe).map((p) => ({ valor: String(p.id), rotulo: rotulo(p) })),
    [cargos, equipe],
  )

  /* as pessoas do proprio time primeiro: e de la que o topo costuma sair */
  const pessoas = useMemo(() => {
    if (!setor) return []
    const ativos = equipe.filter((p) => p.ativo !== false)
    const doTime = ativos.filter((p) => p.cargo === setor.chave).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const outros = ativos.filter((p) => p.cargo !== setor.chave).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return [...doTime, ...outros].map((p) => ({ valor: String(p.id), rotulo: rotulo(p) }))
  }, [equipe, setor])

  const salvar = async (e) => {
    e.preventDefault()
    setSalvando(true)
    try {
      await atualizarOrganograma(setor.id, { diretorId: diretorId || null, liderId: liderId || null })
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
      titulo="Lugar no organograma"
      subtitulo={setor ? nomeDoTime(setor) : ''}
      largura={460}
    >
      <form className="orgform" onSubmit={salvar} noValidate>
        <CampoSelecao
          rotulo="Responde a (diretor)"
          vazio="Sem diretor definido"
          opcoes={[{ valor: '', rotulo: 'Sem diretor definido' }, ...diretores]}
          value={diretorId}
          onChange={(ev) => {
            setDiretorId(ev.target.value)
            setErro('')
          }}
        />
        <CampoSelecao
          rotulo="Topo do time"
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
