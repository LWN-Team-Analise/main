import { useState } from 'react'
import { Link } from 'react-router-dom'
import './CookieConsent.css'

const STORAGE_KEY = 'customers.cookies'

/**
 * Escolha do usuario sobre cookies.
 * 'essential' = so o necessario para o login funcionar.
 * 'all'       = essenciais + analise.
 */
export function readCookieConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.value === 'all' || parsed?.value === 'essential' ? parsed : null
  } catch {
    return null
  }
}

/** Use antes de disparar analytics: `if (hasAnalyticsConsent()) { ... }`. */
export function hasAnalyticsConsent() {
  return readCookieConsent()?.value === 'all'
}

export function clearCookieConsent() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage bloqueado */
  }
}

export default function CookieConsent() {
  const [consent, setConsent] = useState(readCookieConsent)

  const decide = (value) => {
    const record = { value, date: new Date().toISOString() }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    } catch {
    }
    setConsent(record)
  }

  if (consent) return null

  return (
    <aside className="cookie" role="dialog" aria-label="Aviso de cookies">
      <p className="cookie__text">
        Usamos cookies essenciais para manter você conectado. Com sua permissão, também
        usamos cookies de análise para entender o uso e melhorar o produto.{' '}
        <Link to="/politica-de-privacidade">Política de privacidade</Link>
      </p>

      <div className="cookie__actions">
        <button type="button" className="cookie__btn" onClick={() => decide('essential')}>
          Apenas essenciais
        </button>
        <button
          type="button"
          className="cookie__btn cookie__btn--primary"
          onClick={() => decide('all')}
        >
          Aceitar todos
        </button>
      </div>
    </aside>
  )
}
