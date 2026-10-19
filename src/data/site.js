// Institutional content of LWN Engenharia. Everything here comes from
// https://lwnengenharia.com.br/ or from copy supplied by LWN — edit here, not in components.

export const company = {
  name: 'LWN Engenharia',
  fullName: 'LWN Team Análise',
  // With Brazil's country code (+55), so it reads right for callers from abroad too.
  phoneDisplay: '+55 11 4116-9210',
  phoneHref: 'tel:+551141169210',
  whatsappHref: 'https://wa.me/+551141169210',
  email: 'contato@lwnengenharia.com.br',
  gasesSite: 'https://gases.lwnengenharia.com.br/',
  // Official Google review link used on the current website (also encoded in the QR code).
  googleReview: 'https://g.page/r/CfSDapWb-5LxEAE/review',
};

export const credit = { label: '@oluuiss', href: 'https://oluuiss.com/' };

// The privacy policy page (the same page in both languages; /privacy-policy also leads there).
export const privacyPath = '/politica-de-privacidade';

// Atmosfera LWN, the employees' management platform: a separate app served under this path (core/).
export const corePath = '/core/';

// `section` links scroll to a block of the home page; `route` links open a page.
export const navLinks = [
  { id: 'inicio', label: 'Início', section: 'inicio' },
  { id: 'sobre', label: 'Sobre nós', section: 'sobre' },
  { id: 'servicos', label: 'Serviços', section: 'servicos' },
  { id: 'clientes', label: 'Clientes', section: 'clientes' },
  { id: 'contato', label: 'Contato', section: 'contato' },
  { id: 'blog', label: 'Blog', route: '/blog' },
];

// The order is intentional: LinkedIn, Instagram, Facebook, YouTube, WhatsApp.
export const socialLinks = [
  { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/company/lwnengenharia/' },
  { id: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/lwnengenharia/' },
  { id: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/lwnengenharia' },
  { id: 'youtube', label: 'YouTube', href: 'https://www.youtube.com/@LWNEngenharia' },
  { id: 'whatsapp', label: 'WhatsApp', href: 'https://wa.me/+551141169210' },
];

export const hero = {
  eyebrow: 'LWN Engenharia · Team Análise',
  headline:
    'Referência Nacional em Qualificação e Certificação de Salas Limpas e Gases Industriais',
  // The two service families, emphasised inside the headline.
  emphasis: ['Salas Limpas', 'Gases Industriais'],
  // Segments marked `strong` are emphasised.
  description: [
    { text: 'Atuamos na qualificação e certificação de' },
    { text: 'ambientes controlados, ensaios técnicos', strong: true },
    { text: 'e avaliação de' },
    { text: 'sistemas HVAC-R e gases industriais,', strong: true },
    { text: 'com foco em confiabilidade dos resultados, rastreabilidade e atendimento aos requisitos aplicáveis.' },
  ],
};

export const about = {
  eyebrow: 'Quem somos',
  title: 'Uma trajetória construída com conhecimento técnico, confiança e compromisso com a excelência.',
  paragraphs: [
    'Desde 2014, a LWN Engenharia constrói sua trajetória com foco em excelência técnica, confiabilidade e inovação. Fundada por Willian Ito, a empresa é especializada em qualificação e certificação de salas limpas, além de ensaios e serviços técnicos em sistemas HVAC-R, incluindo TAB. Sua atuação é pautada pelo rigor técnico, pela integridade dos dados e pelo compromisso com a segurança e a conformidade regulatória, atendendo às exigências de ambientes industriais controlados.',
    'Com uma trajetória consolidada e mais de 50 clientes atendidos, a LWN Engenharia fortaleceu sua atuação no mercado de qualificação e certificação de salas limpas e sistemas HVAC-R.',
    'Em março de 2024, a integração da Análise Consultoria e Testes de Sistemas de Ar ao Grupo LWN Engenharia marcou uma nova etapa de expansão, ampliando a capacidade técnica, operacional e a abrangência dos serviços oferecidos.',
    'Atualmente, o Grupo reúne mais de 30 profissionais capacitados, mais de 15 conjuntos completos de instrumentos de medição e 28 anos de experiência acumulada. Essa estrutura sustenta uma atuação orientada pelo rigor técnico, pela integridade dos dados e pelo atendimento aos requisitos regulatórios da ANVISA e às normas internacionais aplicáveis.',
    'Mais do que ampliar nossa estrutura, essa evolução reforça nosso compromisso com a confiabilidade dos resultados, a melhoria contínua e a excelência em cada entrega.',
  ],
  // The group's evolution, as in LWN's own "Evolução do Grupo" chart.
  timeline: [
    { when: '2014', what: 'Fundação da LWN Engenharia' },
    { when: '2019', what: 'Expansão e estruturação da empresa' },
    { when: '2023', what: 'Prestação de serviço na Geórgia, EUA' },
    { when: '2024', what: 'Fusão com a Análise Consultoria' },
    { when: '2025', what: 'Consolidação do grupo e +2 escritórios' },
    { when: '2026', what: 'Abertura da Avanbio, pertencente ao grupo' },
  ],
  // The key-number counters of the official "Quem somos" block (lwnengenharia.com.br).
  stats: [
    { value: 100, label: ['Clientes', 'Ativos'] },
    { value: 30, label: ['Anos de', 'Experiência'] },
    { value: 1100, label: ['Serviços', 'Finalizados'] },
    { value: 15, label: ['Conjuntos de', 'Instrumentos'] },
    { value: 30, label: ['Técnicos', 'Especializados'] },
  ],
};

export const commitment = {
  title: 'Compromisso com qualidade, inovação e conformidade',
  paragraphs: [
    'Com uma cultura voltada para a excelência, atuamos com rigor técnico, seguindo os padrões da ANVISA e normas internacionais exigidas pelo setor farmacêutico, hospitalar e laboratorial.',
    'Nosso compromisso é entregar soluções seguras, eficientes e inovadoras, superando expectativas e construindo relações de longo prazo com nossos clientes.',
  ],
  pillars: ['Qualidade', 'Inovação', 'Conformidade'],
  sectors: ['Farmacêutico', 'Hospitalar', 'Laboratorial'],
};

export const leaders = [
  { name: 'Willian Ito', role: 'Diretor Executivo', photo: '306a9888', linkedin: 'https://www.linkedin.com/in/willian-ito/' },
  { name: 'Rinaldo Almeida', role: 'Diretor Técnico', photo: '306a9762', linkedin: 'https://www.linkedin.com/in/rinaldo-almeida-0a855840/' },
  { name: 'Erinaldo Jatobá', role: 'Gerente de Operações', photo: '306a0065', linkedin: 'https://www.linkedin.com/in/erinaldo-jatob%C3%A1-573371173/' },
  { name: 'Cassio Mendonça', role: 'Gerente Comercial', photo: '306a0026', linkedin: 'https://www.linkedin.com/in/cassiomendonca/' },
  { name: 'Fabio Santos', role: 'Gerente de Operações', photo: '306a0110' },
  { name: 'Roberto Damasco', role: 'Coordenador Técnico', photo: 'roberto', linkedin: 'https://www.linkedin.com/in/roberto-fonseca-damasco-0685512a1/' },
];

export const leaderPhoto = (id, size) => `/assets/leaders/${id}-${size}.webp`;

export const services = {
  intro:
    'Ambientes controlados exigem precisão, confiabilidade e atendimento a requisitos técnicos rigorosos. A LWN Engenharia oferece soluções especializadas para assegurar o desempenho dos sistemas, a rastreabilidade dos resultados e a conformidade com as normas aplicáveis.',
  groups: [
    {
      id: 'certificacao',
      title: 'Certificação & Qualificação',
      summary:
        'Serviços especializados em qualificação e certificação de salas limpas, equipamentos de ar limpo e sistemas HVAC-R, incluindo ensaios técnicos, elaboração e execução de protocolos de qualificação e programas de requalificação periódica.',
      items: [
        { title: 'Salas limpas e ambientes controlados', text: 'Ensaios e qualificações para avaliação das condições ambientais e atendimento aos requisitos aplicáveis.' },
        { title: 'Equipamentos de ar limpo', text: 'Ensaios técnicos em filtros, capelas, cabines e unidades de tratamento de ar, conforme o escopo de cada equipamento.' },
        { title: 'Protocolos QI, QO e QP', text: 'Elaboração e execução de protocolos de qualificação de instalação, operação e desempenho.' },
        { title: 'Contratos de requalificação', text: 'Programas periódicos de requalificação, estruturados conforme as necessidades operacionais e regulatórias de cada cliente.' },
      ],
    },
    {
      id: 'ensaios',
      title: 'Ensaios Técnicos e Comissionamento',
      summary:
        'Ensaios que seguem rigorosos padrões técnicos e legislações vigentes, como a Instrução Técnica IT-13 do Corpo de Bombeiros — da fase de instalação até a validação final.',
      items: [
        { title: 'TAB — Teste, Ajuste e Balanceamento', text: 'Avaliação e ajuste de vazões de ar para o balanceamento e desempenho dos sistemas de climatização e ventilação.' },
        { title: 'Ensaios de fumaça (Smoke Test)', text: 'Visualização dos padrões de fluxo de ar para avaliação do comportamento aerodinâmico em ambientes controlados.' },
        { title: 'Pressurização de escadas', text: 'Ensaios de desempenho dos sistemas de pressurização, conforme os requisitos técnicos e regulamentares aplicáveis.' },
        { title: 'Ensaios de estanqueidade em dutos', text: 'Avaliação de vazamentos em redes de dutos para verificação das condições de estanqueidade.' },
        { title: 'Mapeamento térmico', text: 'Monitoramento e análise da distribuição de temperatura em ambientes e equipamentos com condições térmicas controladas.' },
      ],
    },
    {
      id: 'consultoria',
      title: 'Consultoria e Projetos HVAC',
      summary:
        'Desenvolvemos soluções de engenharia e consultoria para sistemas HVAC, considerando os requisitos técnicos, regulatórios e operacionais de cada projeto, com foco em desempenho, eficiência e confiabilidade.',
      items: [
        { title: 'Retrofit de sistemas HVAC', text: 'Modernização de sistemas existentes para aprimorar o desempenho, a eficiência operacional e a adequação aos requisitos aplicáveis.' },
        { title: 'Projetos técnicos e memoriais descritivos', text: 'Desenvolvimento de projetos e documentação técnica, considerando critérios de engenharia, requisitos normativos e necessidades operacionais.' },
        { title: 'Equipe técnica residente', text: 'Disponibilização de profissionais especializados para suporte técnico contínuo e acompanhamento das atividades nas instalações do cliente.' },
        { title: 'Consultoria para atendimento ao Anexo 1 das GMP', text: 'Avaliação técnica e suporte à adequação de ambientes e sistemas críticos aos requisitos aplicáveis do Anexo 1 das GMP.' },
      ],
    },
    {
      id: 'gases',
      title: 'Qualificação de Gases',
      summary:
        'Realizamos ensaios e qualificação de gases utilizados em processos industriais e ambientes controlados, avaliando parâmetros de qualidade conforme a aplicação, os requisitos técnicos e as normas aplicáveis. Nossa atuação contribui para a confiabilidade dos sistemas e a segurança dos processos.',
      gases: ['Ar comprimido', 'Ar respirável', 'Nitrogênio', 'Oxigênio', 'Dióxido de carbono', 'Hidrogênio', 'Hélio', 'Acetileno', 'Argônio'],
      norms: ['ANVISA', 'RDC 658/2022', 'ISO 8573', 'BPF'],
      items: [
        { title: 'Atender auditorias e órgãos reguladores' },
        { title: 'Garantir a pureza e segurança dos gases utilizados' },
        { title: 'Validar o desempenho de sistemas de distribuição' },
        { title: 'Reduzir riscos de contaminação em áreas limpas' },
      ],
      link: { label: 'Certificação e qualificação de gases', route: '/gases' },
    },
  ],
};

// Branch addresses without room numbers, as requested by LWN. lat/lon: the exact
// pin of each office's Google Maps link below, used by the globe in "Onde encontrar".
export const offices = [
  {
    id: 'saoPaulo',
    city: 'São Paulo',
    uf: 'SP',
    lat: -23.5146589,
    lon: -46.6260394,
    street: 'R. Voluntários da Pátria, 654',
    region: 'São Paulo - SP',
    zip: '02010-000',
    map: 'https://maps.app.goo.gl/PXp7zX9ax6kqAoMx5',
  },
  {
    id: 'barueri',
    city: 'Barueri',
    uf: 'SP',
    lat: -23.5097114,
    lon: -46.8751234,
    street: 'R. Campos Sales, 226',
    region: 'Barueri - SP',
    zip: '06401-000',
    map: 'https://maps.app.goo.gl/2oLM5aBVdcUo4X6a7',
  },
  {
    id: 'anapolis',
    city: 'Anápolis',
    uf: 'GO',
    lat: -16.3346432,
    lon: -48.9493138,
    street: 'Av. Juscelino Kubitschek, 500',
    region: 'Anápolis - GO',
    zip: '75110-390',
    map: 'https://maps.app.goo.gl/47fSx3hkiiR4eq9N7',
  },
];

// Google reviews shown on the current website (Trustindex widget), unchanged.
export const reviews = [
  { name: 'Roberto Damasco', date: '13/06/2025', rating: 5, avatar: 'https://lh3.googleusercontent.com/a-/ALV-UjU7s1aTOtkpRrMRC965GJJEmbbPMAtw8mlItMUGJ0Y8zss47ZU=w80-h80-c-rp-mo-br100', text: 'Uma empresa séria e comprometida com os clientes, embasada em normas, procura trazer à luz da verdade, o melhor resultado que os sistemas de HVAC podem oferecer.' },
  { name: 'Giovanna I', date: '11/06/2025', rating: 5, avatar: 'https://lh3.googleusercontent.com/a/ACg8ocJhbAAeBpsSxUCccl3eAXwOM1XvRC9jxaTnYCRGTtKqu292BO0t=w80-h80-c-rp-mo-br100', text: 'Excelente experiência! Profissionais preparados e serviço feito com eficiência. Voltaria a contratar com certeza.' },
  { name: 'Livia Cruzatto Brito', date: '11/06/2025', rating: 5, avatar: 'https://lh3.googleusercontent.com/a-/ALV-UjXRQjTE8uA7DeV6jZtG8BYZ-zut2lWwtVGyXZ-LHKOzOcwYtj1EAA=w80-h80-c-rp-mo-br100', text: 'LWN Engenharia é uma empresa responsável e extremamente competente, além de preocupada com a qualidade e segurança dos seus ensaios! Recomendo os serviços da empresa com total confiança!' },
  { name: 'Kézia D Souza Dias', date: '11/06/2025', rating: 5, avatar: 'https://lh3.googleusercontent.com/a-/ALV-UjV1IghOUW78QDhz1_Ki-J0KaSwTGl7PLDwpSW2OGceH60R526g=w80-h80-c-rp-mo-br100', text: 'Colocam o cliente e seus funcionários em primeiro lugar. Gratificante fazer parte da equipe LWN!' },
  { name: 'Juraci Rodrigues de Lima', date: '10/06/2025', rating: 5, avatar: 'https://lh3.googleusercontent.com/a/ACg8ocIKMF3B7BPz-qXo2o5QTaRQj0RNzQi1wH9tfps8X4f8t2Zr=w80-h80-c-rp-mo-br100', text: 'Empresa seria, serviço de primeira e ótimo atendimento' },
  { name: 'Larissa Carvalho', date: '09/06/2025', rating: 5, avatar: 'https://lh3.googleusercontent.com/a-/ALV-UjVR1ygbW205RLeHKHihdcJA_1qDUNPHQlsUQ-fzIl_WJabJU97Miw=w80-h80-c-rp-mo-br100', text: 'Eles tem ótimos serviços para oferecer e uma equipe muito comprometida e dedicada.' },
  { name: 'Marileide Paula Morais', date: '09/06/2025', rating: 5, avatar: 'https://lh3.googleusercontent.com/a-/ALV-UjVrwClGrdNaYYwpSNlzE_RLwREpr8koHk0A0Dg56N7UQf15SlgN=w80-h80-c-rp-mo-ba4-br100', text: 'Empresa que pensa no colaborador' },
  { name: 'Gabriel Silva Costa', date: '09/06/2025', rating: 5, avatar: 'https://lh3.googleusercontent.com/a-/ALV-UjU92l4BFOjuxs3GcJ0GK5V3jBPcz3NTBfkkAA-4uT7t4yGxTFdT=w80-h80-c-rp-mo-ba3-br100', text: 'Engenharia aplicada em sistemas de HVAC e gases medicinais, com Equipes totalmente Qualificada e Instrumentos de Ponta. A maior da América Latina . Orgulho de fazer parte do Time' },
  { name: 'Vanessa Paranhos', date: '09/06/2025', rating: 5, avatar: 'https://lh3.googleusercontent.com/a/ACg8ocJfFYNBg-ejbaYf-Fh8QCpGGLuVkB81YxG0KF9iBzKYd-AAmw=w80-h80-c-rp-mo-br100', text: 'Excelência e perfeição em todos os serviços oferecidos!!!' },
  { name: 'Leticia Nogueira Gonçalves', date: '09/06/2025', rating: 5, avatar: 'https://lh3.googleusercontent.com/a/ACg8ocLBk_JuPPMlkz7YLS_DxydL6Q4VkILAO2juLJqiy4GC4qy07GaE=w80-h80-c-rp-mo-br100', text: 'Ótima empresa, excelente comprometimento e profissionais únicos! Empresa de muito sucesso!' },
];

// Seals from the current website. The third image is the INEG / QTQ seal; its
// caption follows the text printed on the seal itself.
export const seals = [
  {
    image: '/assets/seals/selos-320.webp',
    title: 'Destaque do Ano SMACNA',
    text: 'Comissionador no Hemocentro de Ribeirão Preto',
  },
  {
    image: '/assets/seals/empresa-associada-2025-320.webp',
    title: 'Empresa Associada SBCC',
    text: 'Sociedade Brasileira de Controle de Contaminação',
  },
  {
    image: '/assets/seals/selo-ineg-320.webp',
    title: 'INEG · QTQ',
    text: 'Instituto Nacional de Excelência de Gestão de Qualidade Total Quality',
  },
];

export const clientsIntro = {
  title: 'Nossos Clientes',
  text: 'Já ajudamos empresas de todos os portes a alcançarem resultados reais com soluções inteligentes.',
  cta: {
    title: 'Seja o próximo grande case da LWN Engenharia.',
    text: 'Já ajudamos empresas de todos os portes a alcançarem resultados reais com soluções inteligentes. Que tal conversarmos sobre o seu projeto?',
  },
};

export const contact = {
  title: 'Entre em contato',
  lead: 'Fale com um especialista. Entre em contato e solicite um orçamento.',
};
