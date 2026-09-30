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
    { text: 'LWN Engenharia specializes in the qualification and certification of' },
    { text: 'cleanrooms,', strong: true },
    { text: 'Smoke Test, Medical Gases', strong: true },
    { text: 'and' },
    { text: 'HVAC-R Systems,', strong: true },
    { text: 'ensuring quality, safety and compliance with the most rigorous standards.' },
  ],
};

export const about = {
  eyebrow: 'Who we are',
  title: 'National reference in the Qualification and Certification of Cleanrooms, Medical Gases, Smoke Test and HVAC-R systems',
  paragraphs: [
    'Since 2014, LWN Engenharia has established itself as a reference in cleanroom certification, offering specialized Certification, Qualification and TAB services for HVAC systems. Founded by Willian Ito, the company stands out for its technical excellence and data integrity, ensuring compliance with the most rigorous standards in the industry.',
    'With a solid track record of serving more than 50 clients, LWN reinforces its position as a leader in the cleanroom certification market. In March 2024, Análise Consultoria e Testes de Sistemas de Ar joined Grupo LWN Engenharia, forming one of the largest specialists in cleanroom certification and HVAC-R testing in Brazil.',
    'Today, Grupo LWN Engenharia has more than 30 highly qualified employees, 10 complete sets of measuring instruments and 28 years of combined experience. We work with technical rigor to meet ANVISA regulations and international standards, delivering efficient, high-quality services.',
    'This union strengthens our leadership and increases our clients’ confidence, allowing us to keep delivering innovative, excellent solutions in the sector.',
  ],
  timeline: [
    { when: '2014', what: 'LWN Engenharia is founded by Willian Ito' },
    { when: 'Mar. 2024', what: 'Análise Consultoria e Testes de Sistemas de Ar joins Grupo LWN Engenharia' },
    { when: 'Today', what: 'One of the largest specialists in cleanroom certification and HVAC-R testing in Brazil' },
  ],
  stats: [
    { value: 100, label: ['Active', 'Clients'] },
    { value: 30, label: ['Years of', 'Experience'] },
    { value: 1100, label: ['Services', 'Completed'] },
    { value: 10, label: ['Instrument', 'Sets'] },
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
      'A complete portfolio of services for the certification and qualification of cleanrooms, clean-air equipment and HVAC-R systems — from developing IQ, OQ and PQ protocols to ongoing requalification contracts.',
    items: [
      { title: 'Cleanrooms and controlled environments', text: 'Qualification and maintenance focused on performance, safety and compliance.' },
      { title: 'Clean-air equipment', text: 'Tests on filters, hoods, cabinets and AHUs to ensure air purity and control.' },
      { title: 'IQ, OQ, PQ protocols', text: 'Development and execution of Installation, Operation and Performance protocols.' },
      { title: 'Requalification contracts', text: 'Tailored plans to keep environments qualified, with ongoing technical support.' },
    ],
  },
  ensaios: {
    title: 'Technical Testing and Commissioning',
    summary:
      'Tests that follow rigorous technical standards and current legislation, such as Technical Instruction IT-13 of the Fire Department — from the installation phase through final validation.',
    items: [
      { title: 'TAB', text: 'Balancing of air systems for optimal air-conditioning and ventilation performance.' },
      { title: 'Smoke tests (Smoke Test)', text: 'Visual assessment of air movement and detection of faults in critical environments.' },
      { title: 'Stairwell pressurization', text: 'Tests in accordance with IT-13 for safety in emergencies.' },
      { title: 'Duct leakage', text: 'Leak detection to ensure airtightness and efficiency.' },
      { title: 'Thermal mapping', text: 'Temperature analysis of chambers and rooms for precise thermal control.' },
    ],
  },
  consultoria: {
    title: 'HVAC Consulting and Projects',
    summary:
      'Tailored solutions so that air-conditioning and ventilation systems meet regulatory requirements and each client’s operational demands, with a focus on energy efficiency and high performance.',
    items: [
      { title: 'HVAC system retrofit', text: 'Complete modernization focused on performance, savings and regulatory compliance.' },
      { title: 'Technical projects and descriptive reports', text: 'Clear, traceable documentation, fully compliant with regulatory requirements.' },
      { title: 'On-site resident team', text: 'Dedicated professionals working directly in the field, for ongoing support and integration with the plant’s routine.' },
      { title: 'Solutions for GMP Annex 1', text: 'Specialized consulting and implementation of practices in line with the pharmaceutical industry’s updated guidelines.' },
    ],
  },
  gases: {
    title: 'Gas Qualification',
    summary:
      'Impurities, microbiological contaminants, moisture, solid particles or oil residues in gases can compromise product quality, process safety and patient health.',
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
    'Controlled environments demand more than equipment: they demand precision, traceability and a rigorous commitment to national and international standards.',
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
