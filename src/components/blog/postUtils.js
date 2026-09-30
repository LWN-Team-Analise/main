import { LOCALES } from '../../i18n/content';

const formats = {};

/** A post date (yyyy-mm-dd) written out in `lang` ('pt' | 'en'). */
export function formatDate(iso, lang = 'pt') {
  formats[lang] ??= new Intl.DateTimeFormat(LOCALES[lang], { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return formats[lang].format(new Date(`${iso}T12:00:00Z`));
}

export const postImage = (post, size) => `/assets/blog/${post.image}-${size}.webp`;

/** First paragraph of the article, trimmed to a sentence-friendly length. */
export function postExcerpt(post, max = 190) {
  const first = post.blocks.find((b) => b.type === 'p');
  const text = (first?.html ?? '').replace(/<[^>]+>/g, '');
  if (text.length <= max) return text;
  return `${text.slice(0, text.lastIndexOf(' ', max))}…`;
}
