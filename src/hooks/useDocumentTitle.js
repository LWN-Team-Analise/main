import { useEffect } from 'react';

const BASE = 'LWN Engenharia';
const HOME = 'LWN Engenharia — Qualificação e Certificação de Salas Limpas';

/** Sets the browser tab title for the current page. */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE}` : HOME;
  }, [title]);
}
