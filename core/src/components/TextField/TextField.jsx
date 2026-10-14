import { useId, useState } from 'react'
import './TextField.css'

const EyeIcon = ({ off }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="m4 20 16-16" strokeLinecap="round" />}
  </svg>
)

/**
 * Campo com label flutuante e linha de base luminosa (estilo da referencia).
 */
export default function TextField({
  label,
  type = 'text',
  value,
  onChange,
  error,
  autoComplete,
  name,
  required = false,
}) {
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword && revealed ? 'text' : type
  const filled = String(value ?? '').length > 0

  return (
    <div className={`field ${filled ? 'is-filled' : ''} ${error ? 'has-error' : ''}`.trim()}>
      <input
        id={id}
        name={name}
        type={inputType}
        className="field__input"
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        placeholder=" "
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <span className="field__line" aria-hidden="true" />

      {isPassword && (
        <button
          type="button"
          className="field__toggle"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? 'Ocultar senha' : 'Mostrar senha'}
        >
          <EyeIcon off={revealed} />
        </button>
      )}

      {error && (
        <span className="field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
