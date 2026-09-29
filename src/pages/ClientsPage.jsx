import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import ClientLogo from '../components/clients/ClientLogo';
import Reveal from '../components/ui/Reveal';
import { CLIENT_CATEGORIES } from '../data/clients';
import { clientsIntro } from '../data/site';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './ClientsPage.css';

const slug = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

export default function ClientsPage() {
  useDocumentTitle('Clientes');
  const total = new Set(CLIENT_CATEGORIES.flatMap((c) => c.logos)).size;

  return (
    <div className="clients-page" data-theme="light">
      <header className="clients-page__hero">
        <div className="container">
          <Link to={{ pathname: '/', hash: '#clientes' }} className="back-link">
            <ArrowLeft size={16} aria-hidden="true" />
            Voltar
          </Link>
          <p className="eyebrow">
            <span className="eyebrow__index">{String(total).padStart(2, '0')}</span>
            Empresas atendidas
          </p>
          <h1 className="clients-page__title">{clientsIntro.title}</h1>
          <p className="clients-page__lead">{clientsIntro.text}</p>

          <nav className="clients-page__sectors" aria-label="Setores">
            {CLIENT_CATEGORIES.map((category) => (
              <a key={category.name} href={`#${slug(category.name)}`}>
                {category.name}
                <span>{category.logos.length}</span>
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="container">
        {CLIENT_CATEGORIES.map((category) => (
          <section key={category.name} id={slug(category.name)} className="sector" aria-labelledby={`${slug(category.name)}-title`}>
            <Reveal className="sector__head">
              <h2 className="sector__title" id={`${slug(category.name)}-title`}>
                {category.name}
              </h2>
              <span className="sector__count">{category.logos.length} clientes</span>
            </Reveal>
            <ul className="sector__grid">
              {category.logos.map((id) => (
                <li key={id} className="sector__cell">
                  <ClientLogo id={id} area={4200} max={58} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <Reveal className="clients-page__cta">
          <div>
            <h2>{clientsIntro.cta.title}</h2>
            <p>{clientsIntro.cta.text}</p>
          </div>
          <Link to={{ pathname: '/', hash: '#contato' }} className="button button--dark">
            Fale com um especialista
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </Reveal>
      </div>
    </div>
  );
}
