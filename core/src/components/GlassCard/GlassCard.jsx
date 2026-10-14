import './GlassCard.css'

/**
 * Superficie "liquid glass": desfoque do fundo, borda luminosa e refracao.
 * Cada uso pode desligar essas camadas pelo CSS — o cartao de login, por
 * exemplo, e totalmente transparente.
 */
export default function GlassCard({
  children,
  className = '',
  refraction = true,
  ...rest
}) {
  return (
    <div className={`glass ${className}`.trim()} {...rest}>
      {refraction && <span className="glass__refraction" aria-hidden="true" />}
      <span className="glass__edge" aria-hidden="true" />
      <div className="glass__content">{children}</div>
    </div>
  )
}
