import { POSTS } from '../data/posts';
import { POSTS_EN } from '../data/en/posts';
import { useLanguage } from './language';

// The blog articles by language (kept apart from content.js so the articles only
// load with the pages that show them).
const BY_LANGUAGE = {
  pt: POSTS,
  en: POSTS.map((post) => ({ ...post, ...POSTS_EN[post.slug] })),
};

export const postsFor = (lang) => BY_LANGUAGE[lang] ?? BY_LANGUAGE.pt;

/** The articles in the current language. */
export const usePosts = () => postsFor(useLanguage());
