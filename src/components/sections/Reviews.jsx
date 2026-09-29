import { Star } from 'lucide-react';
import { useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { reviews } from '../../data/site';
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

function ReviewCard({ review }) {
  return (
    <article className="review">
      <div className="review__head">
        <Avatar name={review.name} src={review.avatar} />
        <div className="review__who">
          <span className="review__name">{review.name}</span>
          <time className="review__date" dateTime={review.date.split('/').reverse().join('-')}>
            {review.date}
          </time>
        </div>
        <FcGoogle className="review__source" size={20} aria-label="Avaliação no Google" />
      </div>
      <div className="review__stars" role="img" aria-label={`${review.rating} de 5 estrelas`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={15} aria-hidden="true" className={i < review.rating ? 'is-on' : undefined} />
        ))}
      </div>
      <blockquote className="review__text">{review.text}</blockquote>
    </article>
  );
}

export default function Reviews() {
  return (
    <section className="reviews" data-theme="light" aria-labelledby="avaliacoes-title">
      {/* Heading and cards share the header's width, so the carousel never runs to the screen edges. */}
      <div className="reviews__inner">
        <Reveal className="reviews__head">
          <p className="eyebrow">
            <span className="eyebrow__index">07</span>
            Avaliações no Google
          </p>
          <h2 className="reviews__title" id="avaliacoes-title">
            O que dizem sobre nós
          </h2>
        </Reveal>

        <Reveal className="reviews__rail" delay={0.1}>
          <Marquee speed={32} label="Avaliações de clientes no Google">
            {reviews.map((review) => (
              <ReviewCard key={review.name} review={review} />
            ))}
          </Marquee>
        </Reveal>
      </div>
    </section>
  );
}
