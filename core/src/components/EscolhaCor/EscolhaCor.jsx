import { useId } from 'react'
import { montarCor, separarCor } from '@/utils/cor'
import './EscolhaCor.css'

/**
 * Escolha de cor com OPACIDADE.
 *
 * O <input type="color"> do navegador so devolve #RRGGBB — nao tem como
 * escolher transparencia nele. Aqui ele cuida so do matiz, e a barra ao
 * lado cuida do alfa; o valor sai como #RRGGBBAA quando a opacidade nao
 * e cheia, e como #RRGGBB quando e.
 *
 * O quadriculado atras da amostra e o truque de sempre para dar para ver
 * o quanto a cor esta transparente.
 */
export default function EscolhaCor({ valor, aoMudar, rotulo = 'Cor' }) {
  const id = useId()
  const c = separarCor(valor) ?? { r: 107, g: 114, b: 128, a: 1 }

  const soMatiz = montarCor({ ...c, a: 1 })
  const alfa = Math.round(c.a * 100)

  const mudarMatiz = (hex) => {
    const novo = separarCor(hex)
    if (novo) aoMudar(montarCor({ ...novo, a: c.a }))
  }

  const mudarAlfa = (pct) => aoMudar(montarCor({ ...c, a: Number(pct) / 100 }))

  return (
    <div className="cor">
      <span className="cor__rotulo" id={`${id}-rot`}>
        {rotulo}
      </span>

      <div className="cor__linha">
        {/* o seletor do navegador cuida do matiz */}
        <label className="cor__pote" title="Escolher a cor">
          <input
            type="color"
            value={soMatiz}
            onChange={(e) => mudarMatiz(e.target.value)}
            aria-labelledby={`${id}-rot`}
          />
          <span className="cor__amostra" style={{ background: soMatiz }} aria-hidden="true" />
        </label>

        {/* e a barra cuida da opacidade */}
        <div className="cor__alfa">
          <input
            id={`${id}-alfa`}
            type="range"
            min="10"
            max="100"
            step="1"
            value={alfa}
            onChange={(e) => mudarAlfa(e.target.value)}
            style={{ '--ate': soMatiz }}
            aria-label="Opacidade da cor"
          />
          <output htmlFor={`${id}-alfa`}>{alfa}%</output>
        </div>
      </div>
    </div>
  )
}
