import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/language';
import { useStrings } from '../../i18n/strings';
import { formatDate, postExcerpt, postImage } from './postUtils';

export default function PostCard({ post, headingLevel: Heading = 'h2' }) {
  const lang = useLanguage();
  const t = useStrings();
  return (
    <article className="post-card">
      <Link to={`/blog/${post.slug}`} className="post-card__media" tabIndex={-1} aria-hidden="true">
        <img
          src={postImage(post, 1200)}
          srcSet={`${postImage(post, 640)} 640w, ${postImage(post, 1200)} 1200w`}
          sizes="(max-width: 767px) 100vw, 50vw"
          alt=""
          width={post.imageWidth}
          height={post.imageHeight}
          loading="lazy"
          decoding="async"
        />
      </Link>
      <div className="post-card__body">
        <p className="post-card__meta">
          <span className="post-card__tag">{post.tag}</span>
          <time dateTime={post.date}>{formatDate(post.date, lang)}</time>
          <span aria-hidden="true">·</span>
          <span>{t.blog.readingTime(post.readingMinutes)}</span>
        </p>
        <Heading className="post-card__title">
          <Link to={`/blog/${post.slug}`}>{post.title}</Link>
        </Heading>
        <p className="post-card__excerpt">{postExcerpt(post)}</p>
        <Link to={`/blog/${post.slug}`} className="post-card__more" aria-label={t.blog.readMoreLabel(post.title)}>
          {t.blog.readMore}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
