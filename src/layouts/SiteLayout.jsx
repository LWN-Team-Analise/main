import { Outlet } from 'react-router-dom';
import BalBot from '../components/bal/BalBot';
import Header from '../components/header/Header';
import Footer from '../components/layout/Footer';
import { useScrollRestoration } from '../hooks/useScrollRestoration';

export default function SiteLayout() {
  useScrollRestoration();

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <BalBot />
    </>
  );
}
