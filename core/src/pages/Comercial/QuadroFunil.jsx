import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { somaPorMoeda } from '@/domain/comercial'
import CartaoNegocio, { quebraNaBarra } from './CartaoNegocio'
import { IconeImportar, IconeMais } from './icones'

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

/**
 * O FUNIL — uma coluna por etapa, como no Pipedrive.
 *
 * O cabecalho de cada coluna e a "seta" do funil: o nome da etapa e,
 * embaixo, a soma dos valores e quantos negocios ha nela. O "+" que
 * cria um negocio naquela etapa fica logo abaixo do cabecalho, no topo
 * da coluna, e so aparece com o mouse em cima do CABECALHO — passar
 * pelos cartoes nao mostra nada.
 *
 * Arrastar um cartao para outra coluna muda a etapa. Enquanto ele
 * esta sendo arrastado, sobe do rodape a faixa do Pipedrive: soltar em
 * GANHO ou PERDIDO fecha o negocio, em MOVER leva para outro funil e
 * em EXCLUIR apaga (cada uma pede confirmacao na tela de fora).
 *
 * No celular nao ha arrastar: a etapa muda dentro do negocio.
 */
export default function QuadroFunil({
  funil,
  negocios,
  hoje,
  donoDe,
  podeEditar,
  podeExcluir,
  responderEm,
  vazio,
  aoAbrir,
  aoNovo,
  aoImportar,
  aoResponder,
  aoMover,
  aoGanhar,
  aoPerder,
  aoExcluir,
  aoMoverFunil,
}) {
  const [arrastando, setArrastando] = useState(null)
  const [sobre, setSobre] = useState(null)

  const porEtapa = useMemo(() => {
    const mapa = Object.fromEntries(funil.etapas.map((e) => [e.id, []]))
    negocios.forEach((n) => {
      /* negocio de uma etapa que nao existe mais cai na primeira */
      ;(mapa[n.etapa] ?? mapa[funil.etapas[0].id]).push(n)
    })
    return mapa
  }, [funil, negocios])

  const terminar = () => {
    setArrastando(null)
    setSobre(null)
  }

  /* o alvo do soltar: uma etapa (etapa:id) ou uma das faixas de baixo */
  const alvo = (chave, aoSoltar) => ({
    onDragOver: (e) => {
      if (!arrastando) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (sobre !== chave) setSobre(chave)
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget) && sobre === chave) setSobre(null)
    },
    onDrop: (e) => {
      e.preventDefault()
      const negocio = arrastando
      terminar()
      if (negocio) aoSoltar(negocio)
    },
  })

  /* a altura da fila de cabecalhos vira a altura de cada ">" que desce
     entre os corpos (--seta-altura, no CSS): assim eles tem o mesmo
     angulo do ">" do cabecalho. Os cabecalhos dividem a mesma linha da
     grade, entao medir o primeiro basta; ele muda quando o nome de uma
     etapa quebra linha (tela estreita, outro funil) */
  const colunas = useRef(null)
  useLayoutEffect(() => {
    const quadro = colunas.current
    const cabeca = quadro?.querySelector('.funil__cabeca')
    if (!cabeca) return undefined
    const medir = () => quadro.style.setProperty('--seta-altura', `${cabeca.offsetHeight}px`)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(cabeca)
    return () => observador.disconnect()
  }, [funil.id])

  return (
    <div className="funil" data-arrastando={arrastando ? 'sim' : undefined}>
      <div ref={colunas} className="funil__colunas" style={{ '--etapas': funil.etapas.length }}>
        {funil.etapas.map((etapa, i) => {
          const lista = porEtapa[etapa.id]
          /* a soma separada por moeda: real com dolar nao se soma */
          const total = somaPorMoeda(lista)
          return (
            <section
              key={etapa.id}
              className="funil__coluna"
              data-sobre={sobre === `etapa:${etapa.id}` ? 'sim' : undefined}
              aria-label={etapa.rotulo}
              {...alvo(`etapa:${etapa.id}`, (n) => n.etapa !== etapa.id && aoMover(n, etapa.id))}
            >
              <header className="funil__cabeca" data-primeira={i === 0 ? 'sim' : undefined}>
                <h3 title={etapa.rotulo}>{quebraNaBarra(etapa.rotulo)}</h3>
                <p title={`${total} · ${plural(lista.length, 'negócio', 'negócios')}`}>
                  {total}
                  {lista.length > 0 && ` · ${plural(lista.length, 'negócio', 'negócios')}`}
                </p>
              </header>

              <div className="funil__corpo">
                {podeEditar && (
                  <button
                    type="button"
                    className="funil__mais"
                    onClick={() => aoNovo(etapa.id)}
                    aria-label={`Novo negócio em ${etapa.rotulo}`}
                    title={`Novo negócio em ${etapa.rotulo}`}
                  >
                    <IconeMais tamanho={18} />
                  </button>
                )}
                {lista.map((n) => (
                  <CartaoNegocio
                    key={n.id}
                    negocio={n}
                    hoje={hoje}
                    dono={donoDe(n.responsavelId)}
                    arrastavel={podeEditar && n.status === 'aberto'}
                    responder={responderEm(n)}
                    aoAbrir={aoAbrir}
                    aoResponder={aoResponder}
                    aoComecarArrasto={setArrastando}
                    aoTerminarArrasto={terminar}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {/* o funil sem negocio nenhum: o recado do Pipedrive, por cima das
          colunas vazias */}
      {vazio && (
        <div className="funil__vazio">
          <div className="funil__arte" aria-hidden="true">
            <span />
            <span />
            <span>
              <i />
              <b />
              <b />
            </span>
            <em>
              <IconeMais tamanho={20} />
            </em>
          </div>
          <p>Nenhum negócio adicionado ainda</p>
          {podeEditar && (
            <div className="funil__vazio-acoes">
              <button type="button" className="comercial__verde" onClick={aoImportar}>
                <IconeImportar />
                Importar negócios
              </button>
              <button type="button" className="comercial__botao" onClick={() => aoNovo(funil.etapas[0].id)}>
                <IconeMais />
                Negócio
              </button>
            </div>
          )}
        </div>
      )}

      {/* a faixa de baixo enquanto arrasta */}
      {arrastando && (
        <div className="funil__zonas" role="group" aria-label="Soltar o negócio">
          {podeExcluir && (
            <div className="funil__zona" data-tipo="excluir" data-sobre={sobre === 'excluir' ? 'sim' : undefined} {...alvo('excluir', aoExcluir)}>
              Excluir
            </div>
          )}
          <div className="funil__zona" data-tipo="perdido" data-sobre={sobre === 'perdido' ? 'sim' : undefined} {...alvo('perdido', aoPerder)}>
            Perdido
          </div>
          <div className="funil__zona" data-tipo="ganho" data-sobre={sobre === 'ganho' ? 'sim' : undefined} {...alvo('ganho', aoGanhar)}>
            Ganho
          </div>
          <div className="funil__zona" data-tipo="mover" data-sobre={sobre === 'mover' ? 'sim' : undefined} {...alvo('mover', aoMoverFunil)}>
            Mover para outro funil
          </div>
        </div>
      )}
    </div>
  )
}
