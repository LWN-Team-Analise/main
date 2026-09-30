import { Outlet } from 'react-router-dom';
import BalBot from '../components/bal/BalBot';
import Header from '../components/header/Header';
import Footer from '../components/layout/Footer';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { useStrings } from '../i18n/strings';

export default function SiteLayout() {
  useScrollRestoration();
  const t = useStrings();

  return (
    <>
      <a className="skip-link" href="#conteudo">
        {t.site.skipLink}
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
