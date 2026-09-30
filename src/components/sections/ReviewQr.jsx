import { ArrowUpRight } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import { company } from '../../data/site';
import { useStrings } from '../../i18n/strings';
import Reveal from '../ui/Reveal';
import './ReviewQr.css';

export default function ReviewQr() {
  const t = useStrings();
  return (
    <section className="review-qr" data-theme="light" aria-labelledby="avalie-title">
      <div className="container">
        <Reveal className="review-qr__card">
          <div className="review-qr__copy">
            <FcGoogle size={28} aria-hidden="true" />
            <h2 className="review-qr__title" id="avalie-title">
              {t.reviewQr.title}
            </h2>
            <p className="review-qr__text">{t.reviewQr.text}</p>
            <a className="button button--dark" href={company.googleReview} target="_blank" rel="noopener noreferrer">
              {t.reviewQr.button}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>

          <a
            className="review-qr__code"
            href={company.googleReview}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.reviewQr.qr}
          >
            <img src="/assets/google-review-qr.svg" alt="" width="168" height="168" loading="lazy" />
            <span className="review-qr__hint">{t.reviewQr.hint}</span>
          </a>
        </Reveal>
      </div>
    </section>
  );
}
