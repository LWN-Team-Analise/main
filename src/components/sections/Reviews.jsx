import { Star } from 'lucide-react';
import { useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { reviews } from '../../data/site';
import { LOCALES } from '../../i18n/content';
import { useLanguage } from '../../i18n/language';
import { useStrings } from '../../i18n/strings';
import Marquee from '../ui/Marquee';
import Reveal from '../ui/Reveal';
import './Reviews.css';

const initials = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

function Avatar({ name, src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="review__avatar review__avatar--initials" aria-hidden="true">
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      className="review__avatar"
      src={src}
      alt=""
      width="40"
      height="40"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

// Review dates are stored as dd/mm/yyyy (as shown on Google).
const isoDate = (date) => date.split('/').reverse().join('-');

function ReviewCard({ review }) {
  const t = useStrings();
  const lang = useLanguage();
  const date = new Intl.DateTimeFormat(LOCALES[lang], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate(review.date)}T12:00:00Z`));
  return (
    <article className="review">
      <div className="review__head">
        <Avatar name={review.name} src={review.avatar} />
        <div className="review__who">
          <span className="review__name">{review.name}</span>
          <time className="review__date" dateTime={isoDate(review.date)}>
            {date}
          </time>
        </div>
        <FcGoogle className="review__source" size={20} aria-label={t.reviews.source} />
      </div>
      <div className="review__stars" role="img" aria-label={t.reviews.stars(review.rating)}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={15} aria-hidden="true" className={i < review.rating ? 'is-on' : undefined} />
        ))}
      </div>
      {/* The customer's own words, as written on Google. */}
      <blockquote className="review__text" lang="pt-BR">
        {review.text}
      </blockquote>
    </article>
  );
}

export default function Reviews() {
  const t = useStrings();
  return (
    <section className="reviews" data-theme="light" aria-labelledby="avaliacoes-title">
      {/* Heading and cards share the header's width, so the carousel never runs to the screen edges. */}
      <div className="reviews__inner">
        <Reveal className="reviews__head">
          <p className="eyebrow">
            <span className="eyebrow__index">07</span>
            {t.reviews.eyebrow}
          </p>
          <h2 className="reviews__title" id="avaliacoes-title">
            {t.reviews.title}
          </h2>
        </Reveal>

        <Reveal className="reviews__rail" delay={0.1}>
          <Marquee speed={32} label={t.reviews.carousel}>
            {reviews.map((review) => (
              <ReviewCard key={review.name} review={review} />
            ))}
          </Marquee>
        </Reveal>
      </div>
    </section>
  );
}
