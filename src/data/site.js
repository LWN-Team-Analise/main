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
    { text: 'A LWN Engenharia é especialista em qualificação e certificação de' },
    { text: 'salas limpas,', strong: true },
    { text: 'Smoke Test, Gases Medicinais', strong: true },
    { text: 'e' },
    { text: 'Sistemas HVAC-R,', strong: true },
    { text: 'garantindo qualidade, segurança e conformidade com as normas mais rigorosas.' },
  ],
};

export const about = {
  eyebrow: 'Quem somos',
  title:
    'Referência nacional em Qualificação e Certificação de Salas limpas, Gases Medicinais, Smoke Test e sistemas HVAC-R',
  paragraphs: [
    'Desde 2014, a LWN Engenharia se consolidou como referência em certificação de salas limpas, oferecendo serviços especializados em Certificação, Qualificação e TAB de sistemas HVAC. Fundada por Willian Ito, a empresa destaca-se pela excelência técnica e pela integridade de dados, garantindo conformidade com as normas mais rigorosas do setor.',
    'Com um sólido histórico de atendimento a mais de 50 clientes, a LWN reforça sua posição como líder no mercado de certificação de salas limpas. Em março de 2024, a Análise Consultoria e Testes de Sistemas de Ar passou a integrar o Grupo LWN Engenharia, formando uma das maiores especialistas em certificação de salas limpas e ensaios em HVAC-R do Brasil.',
    'Hoje, o Grupo LWN Engenharia conta com mais de 30 colaboradores altamente capacitados, 10 conjuntos completos de instrumentos de medição e 28 anos de experiência acumulada. Atuamos com rigor técnico para atender às normas da ANVISA e aos padrões internacionais, oferecendo serviços eficientes e de alta qualidade.',
    'Essa união fortalece nossa liderança e aumenta a confiança dos clientes, permitindo que continuemos a entregar soluções inovadoras e de excelência no setor.',
  ],
  // Milestones and figures quoted from the paragraphs above.
  timeline: [
    { when: '2014', what: 'Fundação da LWN Engenharia por Willian Ito' },
    { when: 'Mar. 2024', what: 'A Análise Consultoria e Testes de Sistemas de Ar passa a integrar o Grupo LWN Engenharia' },
    { when: 'Hoje', what: 'Uma das maiores especialistas em certificação de salas limpas e ensaios em HVAC-R do Brasil' },
  ],
  // The key-number counters of the official "Quem somos" block (lwnengenharia.com.br).
  stats: [
    { value: 100, label: ['Clientes', 'Ativos'] },
    { value: 30, label: ['Anos de', 'Experiência'] },
    { value: 1100, label: ['Serviços', 'Finalizados'] },
    { value: 10, label: ['Conjuntos de', 'Instrumentos'] },
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
  { name: 'Cassio Mendonça', role: 'Gerente Comercial', photo: '306a0026', linkedin: 'https://www.linkedin.com/in/cassiocmendonca/' },
  { name: 'Fabio Santos', role: 'Gerente de Operações', photo: '306a0110' },
  { name: 'Roberto Damasco', role: 'Coordenador Técnico', photo: 'roberto', linkedin: 'https://www.linkedin.com/in/roberto-fonseca-damasco-0685512a1/' },
];

export const leaderPhoto = (id, size) => `/assets/leaders/${id}-${size}.webp`;

export const services = {
  intro:
    'Ambientes controlados exigem mais do que equipamentos: exigem precisão, rastreabilidade e um compromisso rigoroso com normas nacionais e internacionais.',
  groups: [
    {
      id: 'certificacao',
      title: 'Certificação & Qualificação',
      summary:
        'Portfólio completo de serviços voltados à certificação e qualificação de salas limpas, equipamentos de ar limpo e sistemas HVAC-R — desde o desenvolvimento de protocolos QI, QO e QP até contratos de requalificação contínua.',
      items: [
        { title: 'Salas limpas e ambientes controlados', text: 'Qualificação e manutenção com foco em performance, segurança e conformidade.' },
        { title: 'Equipamentos de ar limpo', text: 'Ensaios em filtros, capelas, cabines e UTAs para garantir pureza e controle do ar.' },
        { title: 'Protocolos QI, QO, QP', text: 'Desenvolvimento e execução de protocolos de Instalação, Operação e Performance.' },
        { title: 'Contratos de requalificação', text: 'Planos sob medida para manter ambientes qualificados com suporte técnico contínuo.' },
      ],
    },
    {
      id: 'ensaios',
      title: 'Ensaios Técnicos e Comissionamento',
      summary:
        'Ensaios que seguem rigorosos padrões técnicos e legislações vigentes, como a Instrução Técnica IT-13 do Corpo de Bombeiros — da fase de instalação até a validação final.',
      items: [
        { title: 'TAB', text: 'Balanceamento de sistemas de ar para desempenho ideal de climatização e ventilação.' },
        { title: 'Ensaios de fumaça (Smoke Test)', text: 'Avaliação visual da movimentação do ar e detecção de falhas em ambientes críticos.' },
        { title: 'Pressurização de escadas', text: 'Ensaios conforme a IT-13 para segurança em emergências.' },
        { title: 'Vazamento em dutos', text: 'Detecção de perdas para garantir estanqueidade e eficiência.' },
        { title: 'Mapeamento térmico', text: 'Análise de temperatura em câmaras e ambientes para controle térmico preciso.' },
      ],
    },
    {
      id: 'consultoria',
      title: 'Consultoria e Projetos HVAC',
      summary:
        'Soluções personalizadas para que sistemas de climatização e ventilação atendam às exigências normativas e às demandas operacionais de cada cliente, com foco em eficiência energética e alto desempenho.',
      items: [
        { title: 'Retrofit de sistemas HVAC', text: 'Modernização completa com foco em desempenho, economia e aderência às normas.' },
        { title: 'Projetos técnicos e memoriais descritivos', text: 'Elaboração clara, rastreável e totalmente em conformidade com os requisitos regulatórios.' },
        { title: 'Equipe residente no cliente', text: 'Profissionais dedicados, atuando diretamente no campo para suporte contínuo e integração com a rotina da planta.' },
        { title: 'Soluções para o Anexo 1 da GMP', text: 'Consultoria especializada e implementação de práticas conforme as diretrizes atualizadas da indústria farmacêutica.' },
      ],
    },
    {
      id: 'gases',
      title: 'Qualificação de Gases',
      summary:
        'Impurezas, contaminantes microbiológicos, umidade, partículas sólidas ou resíduos de óleo nos gases podem comprometer a qualidade dos produtos, a segurança dos processos e a saúde dos pacientes.',
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
