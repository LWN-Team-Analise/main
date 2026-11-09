import { useState } from 'react'
import { Link } from 'react-router-dom'
import './CookieConsent.css'

const STORAGE_KEY = 'customers.cookies'

function jaViu() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY))
  } catch {
    return false
  }
}

/**
 * Aviso de armazenamento do sistema.
 *
 * E um aviso, nao um pedido de consentimento: o sistema nao usa cookie de
 * analise nem de publicidade, e a sessao fica no armazenamento local. Antes
 * o texto falava em "cookies de analise" que nao existem e oferecia uma
 * escolha que nao mudava nada. Se um dia entrar analytics, ele so pode
 * carregar depois de um aceite de verdade, e este aviso precisa dessa escolha.
 */
export default function CookieConsent() {
  const [visto, setVisto] = useState(jaViu)

  const fechar = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ value: 'ciente', date: new Date().toISOString() }))
    } catch {
      /* storage bloqueado: o aviso volta na proxima visita */
    }
    setVisto(true)
  }

  if (visto) return null

  return (
    <aside className="cookie" aria-label="Aviso de cookies">
      <p className="cookie__text">
        Este sistema não usa cookies de publicidade nem de análise. Guardamos no seu navegador só o necessário para
        manter você conectado e lembrar as suas preferências.{' '}
        <Link to="/politica-de-privacidade">Política de privacidade</Link>
      </p>

      <div className="cookie__actions">
        <button type="button" className="cookie__btn cookie__btn--primary" onClick={fechar}>
          Entendi
        </button>
      </div>
    </aside>
  )
}
