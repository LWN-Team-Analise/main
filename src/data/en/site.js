// English version of the institutional content in ../site.js — same shape,
// translated from the Portuguese. Only the exports that carry text are listed
// here; everything else (phone, addresses, links, Google reviews, which stay in
// the customers' own words) comes from ../site.js.
import { leaders as leadersPt, navLinks as navLinksPt, seals as sealsPt, services as servicesPt } from '../site';

const NAV_LABELS = {
  inicio: 'Home',
  sobre: 'About us',
  servicos: 'Services',
  clientes: 'Clients',
  contato: 'Contact',
  blog: 'Blog',
};

export const navLinks = navLinksPt.map((link) => ({ ...link, label: NAV_LABELS[link.id] ?? link.label }));

export const hero = {
  eyebrow: 'LWN Engenharia · Team Análise',
  headline: 'The National Reference in Qualification and Certification of Cleanrooms and Industrial Gases',
  emphasis: ['Cleanrooms', 'Industrial Gases'],
  description: [
    { text: 'We work in the qualification and certification of' },
    { text: 'controlled environments, technical testing', strong: true },
    { text: 'and the assessment of' },
    { text: 'HVAC-R systems and industrial gases,', strong: true },
    { text: 'with a focus on reliable results, traceability and meeting the applicable requirements.' },
  ],
};

export const about = {
  eyebrow: 'Who we are',
  title: 'A track record built on technical knowledge, trust and a commitment to excellence.',
  paragraphs: [
    'Since 2014, LWN Engenharia has built its track record with a focus on technical excellence, reliability and innovation. Founded by Willian Ito, the company specializes in the qualification and certification of cleanrooms, as well as testing and technical services for HVAC-R systems, including TAB. Its work is guided by technical rigor, data integrity and a commitment to safety and regulatory compliance, meeting the demands of controlled industrial environments.',
    'With an established track record and more than 50 clients served, LWN Engenharia has strengthened its position in the market for the qualification and certification of cleanrooms and HVAC-R systems.',
    'In March 2024, the integration of Análise Consultoria e Testes de Sistemas de Ar into Grupo LWN Engenharia marked a new stage of expansion, broadening the technical and operational capacity and the scope of the services offered.',
    'Today, the Group brings together more than 30 qualified professionals, more than 15 complete sets of measuring instruments and 28 years of combined experience. This structure supports work guided by technical rigor, data integrity and compliance with ANVISA regulatory requirements and the applicable international standards.',
    'More than expanding our structure, this evolution reinforces our commitment to reliable results, continuous improvement and excellence in every delivery.',
  ],
  timeline: [
    { when: '2014', what: 'LWN Engenharia is founded' },
    { when: '2019', what: 'Expansion and restructuring of the company' },
    { when: '2023', what: 'Services provided in Georgia, USA' },
    { when: '2024', what: 'Merger with Análise Consultoria' },
    { when: '2025', what: 'Consolidation of the group and 2 more offices' },
    { when: '2026', what: 'Opening of Avanbio, part of the group' },
  ],
  stats: [
    { value: 100, label: ['Active', 'Clients'] },
    { value: 30, label: ['Years of', 'Experience'] },
    { value: 1100, label: ['Services', 'Completed'] },
    { value: 15, label: ['Instrument', 'Sets'] },
    { value: 30, label: ['Specialized', 'Technicians'] },
  ],
};

export const commitment = {
  title: 'Commitment to quality, innovation and compliance',
  paragraphs: [
    'With a culture focused on excellence, we work with technical rigor, following ANVISA standards and the international regulations required by the pharmaceutical, hospital and laboratory sectors.',
    'Our commitment is to deliver safe, efficient and innovative solutions, exceeding expectations and building long-term relationships with our clients.',
  ],
  pillars: ['Quality', 'Innovation', 'Compliance'],
  sectors: ['Pharmaceutical', 'Hospital', 'Laboratory'],
};

const ROLES = {
  'Diretor Executivo': 'Executive Director',
  'Diretor Técnico': 'Technical Director',
  'Gerente de Operações': 'Operations Manager',
  'Gerente Comercial': 'Commercial Manager',
  'Coordenador Técnico': 'Technical Coordinator',
};

export const leaders = leadersPt.map((leader) => ({ ...leader, role: ROLES[leader.role] ?? leader.role }));

const SERVICE_GROUPS = {
  certificacao: {
    title: 'Certification & Qualification',
    summary:
      'Specialized services for the qualification and certification of cleanrooms, clean-air equipment and HVAC-R systems, including technical testing, the preparation and execution of qualification protocols and periodic requalification programs.',
    items: [
      { title: 'Cleanrooms and controlled environments', text: 'Tests and qualifications to assess environmental conditions and meet the applicable requirements.' },
      { title: 'Clean-air equipment', text: 'Technical tests on filters, hoods, cabinets and air handling units, according to the scope of each piece of equipment.' },
      { title: 'IQ, OQ and PQ protocols', text: 'Preparation and execution of installation, operational and performance qualification protocols.' },
      { title: 'Requalification contracts', text: 'Periodic requalification programs, structured around each client’s operational and regulatory needs.' },
    ],
  },
  ensaios: {
    title: 'Technical Testing and Commissioning',
    summary:
      'Tests that follow rigorous technical standards and current legislation, such as Technical Instruction IT-13 of the Fire Department — from the installation phase through final validation.',
    items: [
      { title: 'TAB — Testing, Adjusting and Balancing', text: 'Assessment and adjustment of air flow rates for the balancing and performance of air-conditioning and ventilation systems.' },
      { title: 'Smoke tests (Smoke Test)', text: 'Visualization of air flow patterns to assess aerodynamic behavior in controlled environments.' },
      { title: 'Stairwell pressurization', text: 'Performance tests of pressurization systems, in line with the applicable technical and regulatory requirements.' },
      { title: 'Duct airtightness tests', text: 'Assessment of leaks in duct networks to verify their airtightness.' },
      { title: 'Thermal mapping', text: 'Monitoring and analysis of temperature distribution in rooms and equipment with controlled thermal conditions.' },
    ],
  },
  consultoria: {
    title: 'HVAC Consulting and Projects',
    summary:
      'We develop engineering and consulting solutions for HVAC systems, taking into account the technical, regulatory and operational requirements of each project, with a focus on performance, efficiency and reliability.',
    items: [
      { title: 'HVAC system retrofit', text: 'Modernization of existing systems to improve performance, operational efficiency and compliance with the applicable requirements.' },
      { title: 'Technical projects and descriptive reports', text: 'Development of projects and technical documentation, taking into account engineering criteria, regulatory requirements and operational needs.' },
      { title: 'Resident technical team', text: 'Specialized professionals for ongoing technical support and follow-up of the activities at the client’s facilities.' },
      { title: 'Consulting for GMP Annex 1 compliance', text: 'Technical assessment and support in bringing critical rooms and systems in line with the applicable requirements of GMP Annex 1.' },
    ],
  },
  gases: {
    title: 'Gas Qualification',
    summary:
      'We test and qualify the gases used in industrial processes and controlled environments, assessing quality parameters according to the application, the technical requirements and the applicable standards. Our work contributes to the reliability of the systems and the safety of the processes.',
    gases: ['Compressed air', 'Breathing air', 'Nitrogen', 'Oxygen', 'Carbon dioxide', 'Hydrogen', 'Helium', 'Acetylene', 'Argon'],
    norms: ['ANVISA', 'RDC 658/2022', 'ISO 8573', 'GMP'],
    items: [
      { title: 'Meet audits and regulatory bodies' },
      { title: 'Ensure the purity and safety of the gases used' },
      { title: 'Validate the performance of distribution systems' },
      { title: 'Reduce contamination risks in cleanrooms' },
    ],
    link: { label: 'Gas certification and qualification', route: '/gases' },
  },
};

export const services = {
  intro:
    'Controlled environments demand precision, reliability and compliance with rigorous technical requirements. LWN Engenharia offers specialized solutions to ensure system performance, traceable results and compliance with the applicable standards.',
  groups: servicesPt.groups.map((group) => ({ ...group, ...SERVICE_GROUPS[group.id] })),
};

const SEALS = [
  { title: 'SMACNA Highlight of the Year', text: 'Commissioning agent at the Ribeirão Preto Blood Center' },
  { title: 'SBCC Member Company', text: 'Brazilian Society for Contamination Control' },
  { title: 'INEG · QTQ', text: 'National Institute of Excellence in Quality Management — Total Quality' },
];

export const seals = sealsPt.map((seal, i) => ({ ...seal, ...SEALS[i] }));

export const clientsIntro = {
  title: 'Our Clients',
  text: 'We have helped companies of all sizes achieve real results with smart solutions.',
  cta: {
    title: 'Be LWN Engenharia’s next great success story.',
    text: 'We have helped companies of all sizes achieve real results with smart solutions. How about we talk about your project?',
  },
};

export const contact = {
  title: 'Get in touch',
  lead: 'Talk to a specialist. Get in touch and request a quote.',
};
