import { useState } from 'react';
import { Link } from 'react-router-dom';
import { privacyPath } from '../../data/site';
import { useStrings } from '../../i18n/strings';
import './CookieNotice.css';

const STORAGE_KEY = 'lwn-cookie-notice';

function jaViu() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * Aviso de cookies do site. E um aviso, nao um pedido de consentimento: o site
 * nao tem cookie de publicidade nem rastreamento, entao nao ha o que aceitar ou
 * recusar. Se um dia entrar uma ferramenta dessas, ela so pode carregar depois
 * de um "aceito" de verdade, e este aviso precisa ganhar essa escolha.
 */
export default function CookieNotice() {
  const [hidden, setHidden] = useState(jaViu);
  const t = useStrings();

  if (hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      /* armazenamento bloqueado: o aviso volta na proxima visita */
    }
    setHidden(true);
  };

  return (
    <aside className="cookie-notice" data-theme="light" aria-label={t.cookies.label}>
      <p>
        {t.cookies.text}{' '}
        <Link to={{ pathname: privacyPath, hash: '#cookies' }}>{t.cookies.more}</Link>
      </p>
      <button type="button" className="button button--dark cookie-notice__ok" onClick={dismiss}>
        {t.cookies.ok}
      </button>
    </aside>
  );
}
