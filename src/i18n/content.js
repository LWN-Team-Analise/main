import { CLIENT_CATEGORIES } from '../data/clients';
import { CATEGORY_NAMES } from '../data/en/clients';
import * as siteEn from '../data/en/site';
import * as sitePt from '../data/site';
import { useLanguage } from './language';

// Institutional content by language. The English file only overrides what it
// translates; everything language-neutral (phone, links, addresses…) is shared.
const SITE = { pt: sitePt, en: { ...sitePt, ...siteEn } };

const CATEGORIES = {
  pt: CLIENT_CATEGORIES,
  en: CLIENT_CATEGORIES.map((category) => ({ ...category, name: CATEGORY_NAMES[category.name] ?? category.name })),
};

/** The site content (src/data/site.js shape) for `lang`. */
export const siteFor = (lang) => SITE[lang] ?? SITE.pt;

/** The site content for the current language. */
export const useSite = () => siteFor(useLanguage());

/** The client sectors (src/data/clients.js) for `lang`, with translated names. */
export const categoriesFor = (lang) => CATEGORIES[lang] ?? CATEGORIES.pt;

export const useClientCategories = () => categoriesFor(useLanguage());

/** Dates and numbers in the reader's language. */
export const LOCALES = { pt: 'pt-BR', en: 'en-US' };
