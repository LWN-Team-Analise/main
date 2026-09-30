// What BAL can talk about. Every answer is assembled from content the website
// already publishes (src/data, in the visitor's language) — nothing here is
// written for the bot itself — so when the site's copy changes, BAL's answers
// change with it.

import { Building2, Mail, Users, Wind, Wrench } from 'lucide-react';
import { ROUTE } from '../../data/serviceRoute';
import { categoriesFor, LOCALES, siteFor } from '../../i18n/content';
import { postsFor } from '../../i18n/posts';

const home = (section) => ({ pathname: '/', hash: `#${section}` });

// The bot's own words for each topic: its name and where its links lead.
const LABELS = {
  pt: {
    about: 'Sobre a LWN',
    aboutLink: 'Conheça a LWN',
    services: 'Serviços',
    servicesLink: 'Ver serviços',
    gasesLink: 'Qualificação de gases',
    clients: 'Clientes',
    clientsAll: 'Ver todos os clientes',
    clientsSection: 'Nossos Clientes',
    inSectors: (n) => `empresas em ${n} setores`,
    nationwide: (states) => `Atuação nacional: ${states.slice(0, -1).join(', ')} e ${states[states.length - 1]}.`,
    contact: 'Contato',
    contactLink: 'Ir para Contato',
    channels: { whatsapp: 'WhatsApp', phone: 'Telefone', email: 'E-mail' },
    cleanRoom: 'O que é uma sala limpa',
    cleanRoomLink: 'Ler o artigo completo',
  },
  en: {
    about: 'About LWN',
    aboutLink: 'Get to know LWN',
    services: 'Services',
    servicesLink: 'View services',
    gasesLink: 'Gas qualification',
    clients: 'Clients',
    clientsAll: 'View all clients',
    clientsSection: 'Our Clients',
    inSectors: (n) => `companies in ${n} sectors`,
    nationwide: (states) => `Nationwide: ${states.slice(0, -1).join(', ')} and ${states[states.length - 1]}.`,
    contact: 'Contact',
    contactLink: 'Go to Contact',
    channels: { whatsapp: 'WhatsApp', phone: 'Phone', email: 'Email' },
    cleanRoom: 'What is a cleanroom',
    cleanRoomLink: 'Read the full article',
  },
};

// "O que é uma sala limpa": the LWN blog article on cleanrooms.
const CLEAN_ROOM_SLUG = 'salas-limpas-importancia-e-funcao-na-industria-controlada';

function cleanRoomAnswer(article) {
  if (!article) return [];
  const paragraphs = article.blocks.filter((b) => b.type === 'p');
  const definition = paragraphs[0];
  const standard = paragraphs.find((b) => b.html.includes('ISO 14644-1'));
  const classes = paragraphs.find((b) => /ISO 1 (a|to) ISO 9/.test(b.html));
  const features = article.blocks.find((b) => b.type === 'ul');
  return [
    definition && { type: 'html', html: definition.html },
    standard && { type: 'html', html: standard.html },
    features && { type: 'htmlList', items: features.items },
    classes && { type: 'html', html: classes.html },
  ].filter(Boolean);
}

/**
 * Each topic: the button label, and BAL's answer as content blocks, followed by
 * links to where the site covers it in full.
 * Block types: text · list · timeline · stats · figure · groups · channels ·
 * offices · html / htmlList (the blog article's own markup).
 */
function buildTopics(lang) {
  const l = LABELS[lang];
  const { about, clientsIntro, company, contact, offices, services } = siteFor(lang);
  const categories = categoriesFor(lang);
  const article = postsFor(lang).find((post) => post.slug === CLEAN_ROOM_SLUG);
  const clientCount = new Set(categories.flatMap((category) => category.logos)).size;

  return [
    {
      id: 'sobre',
      label: l.about,
      Icon: Building2,
      answer: [
        { type: 'text', text: about.paragraphs[0] },
        { type: 'timeline', items: about.timeline },
        {
          type: 'stats',
          items: about.stats.map((s) => ({ value: `+${s.value.toLocaleString(LOCALES[lang])}`, label: s.label.join(' ') })),
        },
      ],
      links: [{ label: l.aboutLink, to: home('sobre') }],
    },
    {
      id: 'servicos',
      label: l.services,
      Icon: Wrench,
      answer: [
        { type: 'text', text: services.intro },
        {
          type: 'groups',
          items: services.groups.map((group) => ({
            title: group.title,
            text: (group.gases ?? group.items.map((item) => item.title)).join(' · '),
          })),
        },
      ],
      links: [
        { label: l.servicesLink, to: home('servicos') },
        { label: l.gasesLink, to: '/gases' },
      ],
    },
    {
      id: 'clientes',
      label: l.clients,
      Icon: Users,
      answer: [
        { type: 'text', text: clientsIntro.text },
        { type: 'figure', value: clientCount, text: l.inSectors(categories.length) },
        { type: 'list', items: categories.map((category) => category.name) },
        { type: 'text', text: l.nationwide(ROUTE.map((stop) => stop.name)) },
      ],
      links: [
        { label: l.clientsAll, to: '/clientes' },
        { label: l.clientsSection, to: home('clientes') },
      ],
    },
    {
      id: 'contato',
      label: l.contact,
      Icon: Mail,
      answer: [
        { type: 'text', text: contact.lead },
        {
          type: 'channels',
          items: [
            { id: 'whatsapp', label: l.channels.whatsapp, value: company.phoneDisplay, href: company.whatsappHref, external: true },
            { id: 'phone', label: l.channels.phone, value: company.phoneDisplay, href: company.phoneHref },
            { id: 'email', label: l.channels.email, value: company.email, href: `mailto:${company.email}` },
          ],
        },
        { type: 'offices', items: offices.map((o) => ({ city: o.city, lines: [o.street, `${o.region} · ${o.zip}`], map: o.map })) },
      ],
      links: [{ label: l.contactLink, to: home('contato') }],
    },
    {
      id: 'sala-limpa',
      label: l.cleanRoom,
      Icon: Wind,
      answer: cleanRoomAnswer(article),
      links: article ? [{ label: l.cleanRoomLink, to: `/blog/${article.slug}` }] : [],
    },
  ];
}

const cache = {};

/** BAL's topics in `lang` ('pt' | 'en'). */
export const topicsFor = (lang) => (cache[lang] ??= buildTopics(lang));
