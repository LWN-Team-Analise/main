import { ArrowUpRight } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import { company } from '../../data/site';
import Reveal from '../ui/Reveal';
import './ReviewQr.css';

export default function ReviewQr() {
  return (
    <section className="review-qr" data-theme="light" aria-labelledby="avalie-title">
      <div className="container">
        <Reveal className="review-qr__card">
          <div className="review-qr__copy">
            <FcGoogle size={28} aria-hidden="true" />
            <h2 className="review-qr__title" id="avalie-title">
              Avalie a LWN no Google
            </h2>
            <p className="review-qr__text">Sua avaliação é muito importante para nós.</p>
            <a className="button button--dark" href={company.googleReview} target="_blank" rel="noopener noreferrer">
              Avaliar no Google
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>

          <a
            className="review-qr__code"
            href={company.googleReview}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="QR code da página de avaliação da LWN no Google (abre em nova aba)"
          >
            <img src="/assets/google-review-qr.svg" alt="" width="168" height="168" loading="lazy" />
            <span className="review-qr__hint">Aponte a câmera</span>
          </a>
        </Reveal>
      </div>
    </section>
  );
}
