// What BAL can talk about. Every answer is assembled from content the website
// already publishes (src/data) — nothing here is written for the bot itself —
// so when the site's copy changes, BAL's answers change with it.

import { Building2, Mail, Users, Wind, Wrench } from 'lucide-react';
import { CLIENT_CATEGORIES } from '../../data/clients';
import { POSTS } from '../../data/posts';
import { ROUTE } from '../../data/serviceRoute';
import { about, clientsIntro, company, contact, offices, services } from '../../data/site';

const home = (section) => ({ pathname: '/', hash: `#${section}` });
const joinNames = (names) => `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;

// "O que é uma sala limpa": the LWN blog article on clean rooms.
const CLEAN_ROOM_SLUG = 'salas-limpas-importancia-e-funcao-na-industria-controlada';
const cleanRoom = POSTS.find((post) => post.slug === CLEAN_ROOM_SLUG);
const cleanRoomBlocks = (() => {
  if (!cleanRoom) return [];
  const paragraphs = cleanRoom.blocks.filter((b) => b.type === 'p');
  const definition = paragraphs[0];
  const standard = paragraphs.find((b) => b.html.includes('ISO 14644-1'));
  const classes = paragraphs.find((b) => b.html.includes('ISO 1 a ISO 9'));
  const features = cleanRoom.blocks.find((b) => b.type === 'ul');
  return [
    definition && { type: 'html', html: definition.html },
    standard && { type: 'html', html: standard.html },
    features && { type: 'htmlList', items: features.items },
    classes && { type: 'html', html: classes.html },
  ].filter(Boolean);
})();

const clientCount = new Set(CLIENT_CATEGORIES.flatMap((category) => category.logos)).size;

/**
 * Each topic: the button label, what the visitor "asks", and BAL's answer as
 * content blocks, followed by links to where the site covers it in full.
 * Block types: text · list · timeline · stats · figure · groups · channels ·
 * offices · html / htmlList (the blog article's own markup).
 */
export const TOPICS = [
  {
    id: 'sobre',
    label: 'Sobre a LWN',
    Icon: Building2,
    answer: [
      { type: 'text', text: about.paragraphs[0] },
      { type: 'timeline', items: about.timeline },
      {
        type: 'stats',
        items: about.stats.map((s) => ({ value: `+${s.value.toLocaleString('pt-BR')}`, label: s.label.join(' ') })),
      },
    ],
    links: [{ label: 'Conheça a LWN', to: home('sobre') }],
  },
  {
    id: 'servicos',
    label: 'Serviços',
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
      { label: 'Ver serviços', to: home('servicos') },
      { label: 'Qualificação de gases', to: '/gases' },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    Icon: Users,
    answer: [
      { type: 'text', text: clientsIntro.text },
      { type: 'figure', value: clientCount, text: `empresas em ${CLIENT_CATEGORIES.length} setores` },
      { type: 'list', items: CLIENT_CATEGORIES.map((category) => category.name) },
      { type: 'text', text: `Atuação nacional: ${joinNames(ROUTE.map((stop) => stop.name))}.` },
    ],
    links: [
      { label: 'Ver todos os clientes', to: '/clientes' },
      { label: 'Nossos Clientes', to: home('clientes') },
    ],
  },
  {
    id: 'contato',
    label: 'Contato',
    Icon: Mail,
    answer: [
      { type: 'text', text: contact.lead },
      {
        type: 'channels',
        items: [
          { id: 'whatsapp', label: 'WhatsApp', value: company.phoneDisplay, href: company.whatsappHref, external: true },
          { id: 'phone', label: 'Telefone', value: company.phoneDisplay, href: company.phoneHref },
          { id: 'email', label: 'E-mail', value: company.email, href: `mailto:${company.email}` },
        ],
      },
      { type: 'offices', items: offices.map((o) => ({ city: o.city, lines: [o.street, `${o.region} · ${o.zip}`], map: o.map })) },
    ],
    links: [{ label: 'Ir para Contato', to: home('contato') }],
  },
  {
    id: 'sala-limpa',
    label: 'O que é uma sala limpa',
    Icon: Wind,
    answer: cleanRoomBlocks,
    links: cleanRoom ? [{ label: 'Ler o artigo completo', to: `/blog/${cleanRoom.slug}` }] : [],
  },
];
