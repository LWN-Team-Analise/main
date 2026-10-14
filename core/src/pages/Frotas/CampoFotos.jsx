import { useRef, useState } from 'react'
import { POSICOES } from '@/domain/frotas'
import { prepararFoto } from './fotos'

const Camera = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.1l1.4-2h6l1.4 2h2.1A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="12.8" r="3.4" />
  </svg>
)

/** Uma das cinco: vazia ("Tirar foto") ou com a miniatura e "Refazer". */
function Quadro({ posicao, foto, ocupado, aoEscolher }) {
  const entrada = useRef(null)

  const escolher = (evento) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (arquivo) aoEscolher(arquivo)
  }

  return (
    <div className={`fotos__quadro ${foto ? 'tem-foto' : ''}`.trim()}>
      <button
        type="button"
        className="fotos__botao"
        onClick={() => entrada.current?.click()}
        disabled={ocupado}
        aria-label={foto ? `Refazer a foto: ${posicao.rotulo}` : `Tirar a foto: ${posicao.rotulo}`}
      >
        {foto ? (
          <img src={foto} alt="" className="fotos__miniatura" />
        ) : (
          <span className="fotos__vazio" aria-hidden="true">
            <Camera />
          </span>
        )}
        {ocupado && <span className="fotos__preparando">Preparando...</span>}
      </button>
      <span className="fotos__rotulo">
        {posicao.rotulo}
        {foto && !ocupado && <span className="fotos__refazer">Refazer</span>}
      </span>
      {/* capture: no celular abre direto a camera traseira */}
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={escolher}
        tabIndex={-1}
      />
    </div>
  )
}

/**
 * As cinco fotos de toda saida e devolucao: os quatro lados do carro
 * e o painel mostrando o KM.
 *
 * `valor` e { frente, traseira, ... } com o data URL de cada uma, ja
 * reduzida (ver fotos.js). Cada foto e preparada ao ser escolhida, e
 * nao no envio: o formulario so libera o Enviar com as cinco prontas.
 */
export default function CampoFotos({ rotulo, valor, aoMudar, erro }) {
  const [preparando, setPreparando] = useState({})
  const [falha, setFalha] = useState('')

  const escolher = (chave) => async (arquivo) => {
    setFalha('')
    setPreparando((atual) => ({ ...atual, [chave]: true }))
    try {
      const conteudo = await prepararFoto(arquivo)
      aoMudar((atual) => ({ ...atual, [chave]: conteudo }))
    } catch (e) {
      setFalha(e.message)
    } finally {
      setPreparando((atual) => ({ ...atual, [chave]: false }))
    }
  }

  const prontas = POSICOES.filter((p) => valor?.[p.chave]).length
  const recado = falha || erro

  return (
    <div className={`campo fotos ${recado ? 'has-erro' : ''}`.trim()} role="group" aria-label={rotulo}>
      <span className="campo__rotulo">
        {rotulo} <span className="fotos__conta">{prontas} de {POSICOES.length}</span>
      </span>
      <div className="fotos__grade">
        {POSICOES.map((p) => (
          <Quadro
            key={p.chave}
            posicao={p}
            foto={valor?.[p.chave]}
            ocupado={Boolean(preparando[p.chave])}
            aoEscolher={escolher(p.chave)}
          />
        ))}
      </div>
      {recado && (
        <span className="campo__nota campo__nota--erro" role="alert">
          {recado}
        </span>
      )}
    </div>
  )
}

/** true quando as cinco estao prontas. */
export const fotosCompletas = (valor) => POSICOES.every((p) => Boolean(valor?.[p.chave]))
