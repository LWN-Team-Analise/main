import Hero from '../components/hero/Hero';
import About from '../components/sections/About';
import Commitment from '../components/sections/Commitment';
import Contact from '../components/sections/Contact';
import GeoStory from '../components/sections/GeoStory';
import Leadership from '../components/sections/Leadership';
import ReviewQr from '../components/sections/ReviewQr';
import Reviews from '../components/sections/Reviews';
import Seals from '../components/sections/Seals';
import Services from '../components/sections/Services';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function HomePage() {
  useDocumentTitle();

  return (
    <>
      <Hero />
      <About />
      <Commitment />
      <Leadership />
      <Services />
      {/* Onde encontrar + Nossos Clientes, around one shared globe. */}
      <GeoStory />
      <Reviews />
      <ReviewQr />
      <Seals />
      <Contact />
    </>
  );
}
