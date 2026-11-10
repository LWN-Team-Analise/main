import LegalDocument from '../components/legal/LegalDocument';
import { PRIVACY, PRIVACY_UPDATED } from '../data/privacy';
import { useLanguage } from '../i18n/language';
import { useStrings } from '../i18n/strings';

/** Politica de Privacidade (LGPD), no idioma atual. */
export default function PrivacyPage() {
  const lang = useLanguage();
  const t = useStrings();
  return (
    <LegalDocument
      tag="LGPD"
      eyebrow={t.privacy.eyebrow}
      title={t.privacy.title}
      updated={PRIVACY_UPDATED}
      document={PRIVACY[lang]}
    />
  );
}
