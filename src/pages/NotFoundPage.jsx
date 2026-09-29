import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './Blog.css';

export default function NotFoundPage() {
  useDocumentTitle('Página não encontrada');

  return (
    <section className="blog-hero not-found" data-theme="dark">
      <div className="container">
        <p className="eyebrow eyebrow--dark">
          <span className="eyebrow__index">404</span>
          Página não encontrada
        </p>
        <h1 className="blog-hero__title">Não encontramos esta página.</h1>
        <Link to="/" className="button button--light" style={{ marginTop: '2rem' }}>
          <ArrowLeft size={18} aria-hidden="true" />
          Voltar ao início
        </Link>
      </div>
    </section>
  );
}
