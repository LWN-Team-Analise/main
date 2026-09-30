import { formatDate } from '../components/blog/postUtils';
import { PRIVACY, PRIVACY_UPDATED } from '../data/privacy';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useLanguage } from '../i18n/language';
import { useStrings } from '../i18n/strings';
import './Blog.css';
import './PrivacyPage.css';

// The policy text is first-party content from src/data/privacy.js (inline
// <strong> and <a> only), rendered like the blog articles.
function Block({ block }) {
  if (block.ul) {
    return (
      <ul>
        {block.ul.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>
    );
  }
  return <p dangerouslySetInnerHTML={{ __html: block.p }} />;
}

/** Política de Privacidade / Privacy Policy (LGPD), in the current language. */
export default function PrivacyPage() {
  const lang = useLanguage();
  const t = useStrings();
  const policy = PRIVACY[lang];
  useDocumentTitle(t.privacy.title);

  return (
    <article className="privacy">
      <header className="blog-hero" data-theme="dark">
        <div className="container">
          <p className="eyebrow eyebrow--dark">
            <span className="eyebrow__index">LGPD</span>
            {t.privacy.eyebrow}
          </p>
          <h1 className="blog-hero__title">{t.privacy.title}</h1>
          <p className="privacy__updated">
            {t.privacy.updated}: <time dateTime={PRIVACY_UPDATED}>{formatDate(PRIVACY_UPDATED, lang)}</time>
          </p>
        </div>
      </header>

      <div className="privacy__body" data-theme="light">
        <div className="container privacy__grid">
          <nav className="privacy__toc" aria-label={t.privacy.contents}>
            <p className="privacy__toc-title">{t.privacy.contents}</p>
            <ol>
              {policy.sections.map((section, i) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="article__prose privacy__prose">
            {policy.intro.map((text, i) => (
              <p key={i} className="privacy__lead">
                {text}
              </p>
            ))}
            {policy.sections.map((section, i) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
                <h2 id={`${section.id}-title`}>
                  <span className="privacy__num">{String(i + 1).padStart(2, '0')}</span>
                  {section.title}
                </h2>
                {section.blocks.map((block, b) => (
                  <Block key={b} block={block} />
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
