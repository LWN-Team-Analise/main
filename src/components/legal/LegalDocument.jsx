import { formatDate } from '../blog/postUtils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useLanguage } from '../../i18n/language';
import { useStrings } from '../../i18n/strings';
import '../../pages/Blog.css';
import '../../pages/PrivacyPage.css';

// O texto vem dos arquivos de src/data (conteudo proprio, so com <strong>, <a>
// e <mark> dentro), e e desenhado como os artigos do blog.
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

/**
 * Pagina de documento: politica de privacidade, termos de uso e declaracao de
 * acessibilidade usam este mesmo desenho, com sumario ao lado do texto.
 */
export default function LegalDocument({ tag, eyebrow, title, updated, document: doc }) {
  const lang = useLanguage();
  const t = useStrings();
  useDocumentTitle(title);

  return (
    <article className="privacy">
      <header className="blog-hero" data-theme="dark">
        <div className="container">
          <p className="eyebrow eyebrow--dark">
            <span className="eyebrow__index">{tag}</span>
            {eyebrow}
          </p>
          <h1 className="blog-hero__title">{title}</h1>
          <p className="privacy__updated">
            {t.privacy.updated}: <time dateTime={updated}>{formatDate(updated, lang)}</time>
          </p>
        </div>
      </header>

      <div className="privacy__body" data-theme="light">
        <div className="container privacy__grid">
          <nav className="privacy__toc" aria-label={t.privacy.contents}>
            <p className="privacy__toc-title">{t.privacy.contents}</p>
            <ol>
              {doc.sections.map((section, i) => (
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
            {doc.intro.map((text, i) => (
              <p key={i} className="privacy__lead">
                {text}
              </p>
            ))}
            {doc.sections.map((section, i) => (
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
