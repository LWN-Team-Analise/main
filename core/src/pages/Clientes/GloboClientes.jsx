import { useEffect, useMemo, useRef, useState } from 'react'
import Globo from '@/components/Globo/Globo'
import { useDados } from '@/context/DadosContext'
import { useTheme } from '@/context/ThemeContext'
import { coordenadaDaUF } from '@/domain/geo'
import { ehBrasil } from '@/domain/paises'
import './GloboClientes.css'

/* A cor do pingo no globo. Fica aqui, e nao nos tokens, por um motivo
   pratico: o canvas nao le variavel de CSS — ele precisa da cor
   resolvida em texto. E o mesmo azul do orbe da barra de busca. */
const CLIENTE_NO_MAPA = '#4d8ff0'

/**
 * O globo dos clientes, no fim da aba Clientes, embaixo da lista. Ja
 * morou no vazio da Grade e no pe do Panorama da pagina inicial; aqui ele
 * fica junto do cadastro que ele desenha.
 *
 * So PONTOS, sem as letras do desenho original: a terra e uma malha de
 * pontinhos reforcados (`letters: 0` e `pontos`), que se le melhor na
 * caixa pequena.
 *
 * Um pingo por ESTADO, e nao por cliente nem por obra: oito clientes
 * em Sao Paulo dariam oito pingos empilhados no mesmo lugar, e o globo
 * passaria a responder "quantas obras" em vez de ONDE a empresa esta.
 * Azul e sem clique: ele diz onde tem cliente, nao e um botao
 * disfarcado de enfeite. Embaixo, quantos clientes sao.
 *
 * O canvas anima sem parar, e o globo fica abaixo da dobra, depois da
 * lista inteira. Por isso ele so e desenhado quando esta
 * perto da tela (IntersectionObserver), e para quando sai dela. A
 * caixa continua com a mesma altura, entao a pagina nao pula.
 */
export default function GloboClientes() {
  const { isDark } = useTheme()
  const { clientes } = useDados()
  const caixa = useRef(null)
  const [aVista, setAVista] = useState(false)

  useEffect(() => {
    const alvo = caixa.current
    if (!alvo) return undefined
    /* navegador sem o observador: desenha sempre, como era antes */
    if (typeof IntersectionObserver === 'undefined') {
      setAVista(true)
      return undefined
    }
    const olho = new IntersectionObserver(([e]) => setAVista(e.isIntersecting), { rootMargin: '200px 0px' })
    olho.observe(alvo)
    return () => olho.disconnect()
  }, [])

  const marcas = useMemo(() => {
    const porUF = new Map()
    for (const cliente of clientes) {
      /* o estado de fora do Brasil nao e UF: "AL" no Alabama nao e Alagoas */
      if (!ehBrasil(cliente?.pais)) continue
      const uf = String(cliente?.estado ?? '').trim().toUpperCase()
      if (porUF.has(uf)) continue
      /* UF em branco ou escrita errada nao tem lugar no mapa: o cliente
         continua no sistema, so nao aparece no globo */
      const onde = coordenadaDaUF(uf)
      if (!onde) continue
      porUF.set(uf, { chave: uf, cor: CLIENTE_NO_MAPA, ...onde })
    }
    return [...porUF.values()]
  }, [clientes])

  /* a unidade (Einstein Anapolis) nao e outro cliente: conta so o de cima */
  const total = clientes.filter((c) => !c.matrizId).length

  return (
    <section className="pglobo" aria-label="Onde estão os clientes">
      <div ref={caixa} className="pglobo__mapa">
        {aVista && (
          <Globo
            /* a tinta do globo segue o tema; o fundo dele e transparente */
            baseColor={isDark ? '#e2e4e9' : '#1d2633'}
            /* o preset do autor foi calibrado para uma tela de 1200x800;
               nesta caixa de 340px a malha do mar sumia. A densidade devolve
               a esfera no tamanho dela, e `pontos` engrossa e escurece os
               pontinhos da terra, que ficam no lugar das letras */
            density={95}
            pontos={190}
            marcas={marcas}
            /* o giro parado, a pouco mais de um quarto do padrao: os 210
               de fabrica, numa caixa de 340px, viram um piao. Arrastar
               continua com a leveza de sempre */
            globe={{ drift: 55, letters: 0 }}
            /* zoom pela roda desligado: ligado, ele comeria a rolagem da
               pagina de quem so passou o cursor por cima */
            pointer={{ zoom: 0, light: 100, pins: 7 }}
          />
        )}
      </div>

      {/* sem esta linha o pingo azul seria enfeite. O numero e o de
          CLIENTES, e nao o de estados: quem olha quer o tamanho da carteira */}
      {total > 0 && (
        <p className="pglobo__legenda">
          <span className="pglobo__ponto" aria-hidden="true" />
          {total} cliente{total === 1 ? '' : 's'}
        </p>
      )}
    </section>
  )
}
