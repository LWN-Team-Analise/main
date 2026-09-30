import { useEffect } from 'react';
import { useStrings } from '../i18n/strings';

/** Sets the browser tab title for the current page (pass it already in the current language). */
export function useDocumentTitle(title) {
  const { site } = useStrings();
  useEffect(() => {
    document.title = title ? `${title} · ${site.name}` : site.homeTitle;
  }, [title, site]);
}
