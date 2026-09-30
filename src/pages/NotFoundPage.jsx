import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStrings } from '../i18n/strings';
import './Blog.css';

export default function NotFoundPage() {
  const t = useStrings();
  useDocumentTitle(t.notFound.title);

  return (
    <section className="blog-hero not-found" data-theme="dark">
      <div className="container">
        <p className="eyebrow eyebrow--dark">
          <span className="eyebrow__index">404</span>
          {t.notFound.title}
        </p>
        <h1 className="blog-hero__title">{t.notFound.heading}</h1>
        <Link to="/" className="button button--light" style={{ marginTop: '2rem' }}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t.notFound.back}
        </Link>
      </div>
    </section>
  );
}
