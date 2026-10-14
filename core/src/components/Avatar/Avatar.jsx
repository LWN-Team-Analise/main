import { corDoNome, iniciaisDe } from '@/utils/formato'
import './Avatar.css'

/**
 * Foto redonda de pessoa ou empresa. Sem foto, cai nas iniciais sobre uma
 * cor derivada do proprio nome — o mesmo nome sempre gera a mesma cor.
 */
export default function Avatar({ nome, foto, tamanho = 28, quadrado = false, titulo, className = '' }) {
  const estilo = {
    width: tamanho,
    height: tamanho,
    fontSize: Math.max(9, Math.round(tamanho * 0.38)),
  }

  if (!foto) estilo.background = corDoNome(nome)

  return (
    <span
      className={`avatarfig ${quadrado ? 'avatarfig--quadrado' : ''} ${className}`.trim()}
      style={estilo}
      title={titulo ?? nome}
      aria-hidden={titulo ? undefined : 'true'}
    >
      {foto ? <img src={foto} alt={titulo ?? nome ?? ''} /> : iniciaisDe(nome)}
    </span>
  )
}

/** Pilha de avatares sobrepostos, com "+N" quando passa do limite. */
export function PilhaAvatares({ pessoas = [], tamanho = 26, limite = 3 }) {
  const visiveis = pessoas.slice(0, limite)
  const resto = pessoas.length - visiveis.length

  return (
    <span className="pilha">
      {visiveis.map((p) => (
        <Avatar key={p.id ?? p.nome} nome={p.nome} foto={p.foto} tamanho={tamanho} titulo={p.nome} />
      ))}
      {resto > 0 && (
        <span className="pilha__resto" style={{ width: tamanho, height: tamanho }}>
          +{resto}
        </span>
      )}
    </span>
  )
}
