import { useLayoutEffect, useMemo, useRef, useState } from 'react'

const Mais = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/**
 * O QUADRO da Qualidade — o mesmo funil do Comercial (as classes .funil
 * de pages/Comercial/Comercial.css): uma coluna por etapa, o cabecalho
 * em forma de seta, os cartoes embaixo.
 *
 *   etapas         [{ id, rotulo }]
 *   itens          os cartoes; `etapaDe(item)` diz a coluna de cada um
 *                  (o que nao tem coluna cai na primeira)
 *   resumo(lista)  a linha embaixo do nome da etapa ("3 documentos")
 *   cartao(item, { arrastavel, aoComecar, aoTerminar })  o cartao
 *   podeArrastar(item)  arrastar para outra coluna chama aoMover(item, etapaId)
 *   aoNovo(etapaId)     o "+" do topo da coluna (sem ele, nao aparece)
 *   rotuloNovo          "Novo documento em"
 *
 * No celular nao ha arrastar: a etapa muda dentro do cartao.
 */
export default function QuadroEtapas({
  etapas,
  itens,
  etapaDe,
  resumo,
  cartao,
  podeArrastar = () => false,
  aoMover,
  aoNovo,
  rotuloNovo = 'Novo em',
}) {
  const [arrastando, setArrastando] = useState(null)
  const [sobre, setSobre] = useState(null)

  const porEtapa = useMemo(() => {
    const mapa = Object.fromEntries(etapas.map((e) => [e.id, []]))
    itens.forEach((item) => {
      ;(mapa[etapaDe(item)] ?? mapa[etapas[0].id]).push(item)
    })
    return mapa
  }, [etapas, itens, etapaDe])

  const terminar = () => {
    setArrastando(null)
    setSobre(null)
  }

  /* a altura do cabecalho vira a altura de cada ">" que desce entre os
     corpos (--seta-altura, no CSS do Comercial), como no QuadroFunil */
  const colunas = useRef(null)
  const chave = etapas.map((e) => e.id).join('|')
  useLayoutEffect(() => {
    const quadro = colunas.current
    const cabeca = quadro?.querySelector('.funil__cabeca')
    if (!cabeca) return undefined
    const medir = () => quadro.style.setProperty('--seta-altura', `${cabeca.offsetHeight}px`)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(cabeca)
    return () => observador.disconnect()
  }, [chave])

  return (
    <div className="funil" data-arrastando={arrastando ? 'sim' : undefined}>
      <div ref={colunas} className="funil__colunas" style={{ '--etapas': etapas.length }}>
        {etapas.map((etapa, i) => {
          const lista = porEtapa[etapa.id]
          const alvo = `etapa:${etapa.id}`
          return (
            <section
              key={etapa.id}
              className="funil__coluna"
              data-sobre={sobre === alvo ? 'sim' : undefined}
              aria-label={etapa.rotulo}
              onDragOver={(e) => {
                if (!arrastando) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (sobre !== alvo) setSobre(alvo)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget) && sobre === alvo) setSobre(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const item = arrastando
                terminar()
                if (item && etapaDe(item) !== etapa.id) aoMover?.(item, etapa.id)
              }}
            >
              <header className="funil__cabeca" data-primeira={i === 0 ? 'sim' : undefined}>
                <h3 title={etapa.rotulo}>{etapa.rotulo}</h3>
                <p>{resumo(lista)}</p>
              </header>

              <div className="funil__corpo">
                {aoNovo && (
                  <button
                    type="button"
                    className="funil__mais"
                    onClick={() => aoNovo(etapa.id)}
                    aria-label={`${rotuloNovo} ${etapa.rotulo}`}
                    title={`${rotuloNovo} ${etapa.rotulo}`}
                  >
                    <Mais />
                  </button>
                )}
                {lista.map((item) =>
                  cartao(item, {
                    arrastavel: podeArrastar(item),
                    aoComecar: () => setArrastando(item),
                    aoTerminar: terminar,
                  }),
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Os atributos do cartao arrastavel (o Firefox so arrasta com algum dado dentro). */
export function arrastoDoCartao(id, { arrastavel, aoComecar, aoTerminar }) {
  if (!arrastavel) return { draggable: false }
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(id))
      aoComecar()
    },
    onDragEnd: () => aoTerminar(),
  }
}
