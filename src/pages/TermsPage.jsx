import LegalDocument from '../components/legal/LegalDocument';
import { TERMS, TERMS_UPDATED } from '../data/terms';
import { useLanguage } from '../i18n/language';
import { useStrings } from '../i18n/strings';

/** Termos de Uso do site, no idioma atual. */
export default function TermsPage() {
  const lang = useLanguage();
  const t = useStrings();
  return (
    <LegalDocument
      tag={t.terms.tag}
      eyebrow={t.terms.eyebrow}
      title={t.terms.title}
      updated={TERMS_UPDATED}
      document={TERMS[lang]}
    />
  );
}
