import LegalDocument from '../components/legal/LegalDocument';
import { ACCESSIBILITY, ACCESSIBILITY_UPDATED } from '../data/accessibility';
import { useLanguage } from '../i18n/language';
import { useStrings } from '../i18n/strings';

/** Declaracao de acessibilidade do site, no idioma atual. */
export default function AccessibilityPage() {
  const lang = useLanguage();
  const t = useStrings();
  return (
    <LegalDocument
      tag="LBI"
      eyebrow={t.accessibility.eyebrow}
      title={t.accessibility.title}
      updated={ACCESSIBILITY_UPDATED}
      document={ACCESSIBILITY[lang]}
    />
  );
}
