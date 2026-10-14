import { useId, useRef, useState } from 'react'
import Avatar from '@/components/Avatar/Avatar'
import Seletor from '@/components/Seletor/Seletor'
import useAlturaAuto from '@/hooks/useAlturaAuto'
import { prepararImagem } from '@/utils/imagem'
import { reais } from '@/utils/formato'
import './Campo.css'

/** Moldura comum: rotulo em cima, controle embaixo, erro por ultimo. */
function Moldura({ id, rotulo, dica, erro, children, largo }) {
  return (
    <div className={`campo ${largo ? 'campo--largo' : ''} ${erro ? 'has-erro' : ''}`.trim()}>
      {rotulo && (
        <label className="campo__rotulo" htmlFor={id}>
          {rotulo}
        </label>
      )}
      {children}
      {(erro || dica) && (
        <span
          className={`campo__nota ${erro ? 'campo__nota--erro' : ''}`.trim()}
          role={erro ? 'alert' : undefined}
        >
          {erro || dica}
        </span>
      )}
    </div>
  )
}

export function CampoTexto({ rotulo, dica, erro, largo, ...rest }) {
  const id = useId()
  return (
    <Moldura id={id} rotulo={rotulo} dica={dica} erro={erro} largo={largo}>
      <input id={id} className="campo__controle" aria-invalid={Boolean(erro)} {...rest} />
    </Moldura>
  )
}

/**
 * A caixa cresce e encolhe sozinha conforme o texto quebra linha — a
 * alcinha do canto inferior direito saiu (ver `useAlturaAuto`).
 *
 * `linhas` continua sendo a altura MINIMA: e o tamanho com que a caixa
 * abre e ate onde ela volta ao ser esvaziada.
 */
export function CampoArea({ rotulo, dica, erro, largo, linhas = 3, ...rest }) {
  const id = useId()
  const campo = useAlturaAuto(rest.value)

  return (
    <Moldura id={id} rotulo={rotulo} dica={dica} erro={erro} largo={largo}>
      <textarea
        ref={campo}
        id={id}
        className="campo__controle campo__area"
        rows={linhas}
        {...rest}
      />
    </Moldura>
  )
}

/**
 * Escolha de um item. opcoes: lista de { valor, rotulo, cor? }
 *
 * Por dentro e o <Seletor>, nao o <select> do navegador — a lista aberta
 * do nativo nao aceita estilo e saia quadrada, com a fonte do sistema.
 * Quem chama continua recebendo `onChange` com evento, entao os
 * formularios antigos nao precisaram mudar.
 */
export function CampoSelecao({
  rotulo,
  dica,
  erro,
  largo,
  opcoes = [],
  vazio = 'Selecione...',
  value,
  onChange,
  disabled,
  'aria-label': rotuloAria,
}) {
  const id = useId()
  return (
    <Moldura id={id} rotulo={rotulo} dica={dica} erro={erro} largo={largo}>
      <Seletor
        id={id}
        largo
        valor={value}
        aoMudar={(novo) => onChange?.({ target: { value: novo } })}
        opcoes={opcoes}
        vazio={vazio}
        desabilitado={disabled}
        aria-label={rotuloAria ?? rotulo}
      />
    </Moldura>
  )
}

const Cadeado = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
  </svg>
)

/**
 * Valor em reais.
 *
 * O estado e em CENTAVOS (inteiro), nunca texto: `centavos` entra,
 * `aoMudar(centavos)` sai. A pessoa so digita numeros e eles entram
 * pela direita, como na maquininha — 4, 1, 5, 0 vira R$ 41,50. Nao ha
 * virgula para esquecer nem ponto para confundir com milhar, e letra
 * simplesmente nao entra.
 *
 * `travado` mostra o valor sem deixar mexer (a refeicao, que tem valor
 * fixo). E readOnly, e nao disabled: o numero continua legivel e
 * selecionavel, so nao muda.
 */
export function CampoDinheiro({ rotulo, dica, erro, largo, centavos, aoMudar, travado = false, ...rest }) {
  const id = useId()
  const mostrado = centavos === null || centavos === undefined ? '' : reais(centavos / 100)

  const mudar = (evento) => {
    /* 11 digitos = R$ 999.999.999,99: o teto de verdade quem da e a API */
    const digitos = evento.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11)
    aoMudar?.(digitos ? Number(digitos) : null)
  }

  return (
    <Moldura id={id} rotulo={rotulo} dica={dica} erro={erro} largo={largo}>
      <span className={`campo__dinheiro ${travado ? 'is-travado' : ''}`.trim()}>
        <input
          id={id}
          className="campo__controle"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="R$ 0,00"
          value={mostrado}
          onChange={travado ? undefined : mudar}
          readOnly={travado}
          aria-readonly={travado || undefined}
          aria-invalid={Boolean(erro)}
          {...rest}
        />
        {travado && (
          <span className="campo__cadeado" title="Valor fixo — não pode ser alterado">
            <Cadeado />
          </span>
        )}
      </span>
    </Moldura>
  )
}

const tamanhoLegivel = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const Clipe = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5" />
  </svg>
)

/**
 * Um arquivo so, escolhido pelo botao ou arrastado para cima dele.
 *
 * O campo nao le nem valida o arquivo: ele entrega o File em
 * `aoEscolher` e mostra o que recebeu em `arquivo` ({ nome, tamanho }).
 * Quem chama decide o que aceitar — e e quem sabe o que fazer com o
 * arquivo (reduzir a foto, conferir o tamanho...).
 */
export function CampoArquivo({ rotulo, dica, erro, largo, arquivo, aoEscolher, aoRemover, aceita, ocupado = false }) {
  const id = useId()
  const entrada = useRef(null)
  const [arrastando, setArrastando] = useState(false)

  const escolher = (evento) => {
    const escolhido = evento.target.files?.[0]
    evento.target.value = ''
    if (escolhido) aoEscolher?.(escolhido)
  }

  const soltar = (evento) => {
    evento.preventDefault()
    setArrastando(false)
    const escolhido = evento.dataTransfer?.files?.[0]
    if (escolhido && !ocupado) aoEscolher?.(escolhido)
  }

  return (
    <Moldura id={id} rotulo={rotulo} dica={dica} erro={erro} largo={largo}>
      <div
        className={`arquivo ${arrastando ? 'is-arrastando' : ''} ${arquivo ? 'tem-arquivo' : ''}`.trim()}
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
      >
        <span className="arquivo__icone" aria-hidden="true">
          <Clipe />
        </span>

        {arquivo ? (
          <span className="arquivo__nome">
            <strong>{arquivo.nome}</strong>
            <span>{ocupado ? 'Preparando...' : tamanhoLegivel(arquivo.tamanho)}</span>
          </span>
        ) : (
          <span className="arquivo__nome arquivo__nome--vazio">
            <strong>{ocupado ? 'Preparando o arquivo...' : 'Nenhum arquivo escolhido'}</strong>
            <span>Clique em escolher ou arraste o arquivo para cá</span>
          </span>
        )}

        <span className="arquivo__acoes">
          <button
            type="button"
            id={id}
            className="foto__btn"
            onClick={() => entrada.current?.click()}
            disabled={ocupado}
            aria-invalid={Boolean(erro)}
          >
            {arquivo ? 'Trocar' : 'Escolher'}
          </button>
          {arquivo && aoRemover && (
            <button type="button" className="foto__btn foto__btn--fraco" onClick={aoRemover} disabled={ocupado}>
              Remover
            </button>
          )}
        </span>

        <input
          ref={entrada}
          type="file"
          accept={aceita}
          className="sr-only"
          onChange={escolher}
          tabIndex={-1}
        />
      </div>
    </Moldura>
  )
}

/** Escolha em pastilhas — usado nas prioridades e nos setores. */
export function CampoPastilhas({ rotulo, dica, erro, valor, aoMudar, opcoes = [], largo }) {
  return (
    <Moldura rotulo={rotulo} dica={dica} erro={erro} largo={largo}>
      <div className="pastilhas" role="radiogroup" aria-label={rotulo}>
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={valor === o.valor}
            className={`pastilha ${valor === o.valor ? 'is-atual' : ''}`.trim()}
            data-tom={o.tom ?? o.valor}
            onClick={() => aoMudar(o.valor)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </Moldura>
  )
}

/**
 * Foto/logo: abre o seletor de arquivos e guarda a imagem como data URL,
 * que e o formato que o store sabe persistir hoje.
 */
export function CampoFoto({ rotulo, nome, valor, aoMudar, dica }) {
  const entrada = useRef(null)
  const [erro, setErro] = useState('')

  const escolher = async (evento) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivo) return
    try {
      aoMudar(await prepararImagem(arquivo))
      setErro('')
    } catch (e) {
      setErro(e.message)
    }
  }

  return (
    <Moldura rotulo={rotulo} dica={dica} erro={erro}>
      <div className="foto">
        <Avatar nome={nome || '?'} foto={valor} tamanho={62} quadrado titulo={nome} />
        <div className="foto__acoes">
          <button type="button" className="foto__btn" onClick={() => entrada.current?.click()}>
            {valor ? 'Trocar imagem' : 'Enviar imagem'}
          </button>
          {valor && (
            <button
              type="button"
              className="foto__btn foto__btn--fraco"
              onClick={() => aoMudar(null)}
            >
              Remover
            </button>
          )}
        </div>
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={escolher}
          tabIndex={-1}
        />
      </div>
    </Moldura>
  )
}
