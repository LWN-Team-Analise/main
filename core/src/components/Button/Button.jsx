import './Button.css'

export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  loading = false,
  disabled = false,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} ${loading ? 'is-loading' : ''}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      <span className="btn__glow" aria-hidden="true" />
      <span className="btn__label">
        {loading && <span className="btn__spinner" aria-hidden="true" />}
        {children}
      </span>
    </button>
  )
}
