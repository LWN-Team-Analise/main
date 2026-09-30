// Privacy policy of the website (Portuguese and English), written for Brazil's
// LGPD (Lei nº 13.709/2018). Company details come from site.js; anything the
// project does not state (e.g. a named data protection officer) is described
// generically rather than invented. What the site does with data here matches
// the code: no analytics or advertising cookies, theme and language kept in
// localStorage, fonts from Google Fonts, reviewer photos from Google.
import { company, offices } from './site';

export const PRIVACY_UPDATED = '2026-09-30';

const email = `<a href="mailto:${company.email}">${company.email}</a>`;
const phone = `<a href="${company.phoneHref}">${company.phoneDisplay}</a>`;
const officeList = offices.map((o) => `<strong>${o.city}</strong> — ${o.street}, ${o.region}, ${o.zip}`);

// Block types: { p: html } and { ul: [html, …] }.
const pt = {
  intro: [
    'O Grupo LWN Engenharia respeita a sua privacidade e trata dados pessoais com responsabilidade, transparência e em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD).',
    'Esta Política de Privacidade explica quais dados pessoais podem ser tratados quando você visita este site ou entra em contato conosco, para quais finalidades, com quem podem ser compartilhados e quais são os seus direitos.',
  ],
  sections: [
    {
      id: 'quem-somos',
      title: 'Quem somos',
      blocks: [
        {
          p: `Este site é mantido pelo <strong>Grupo LWN Engenharia</strong> (${company.name} / ${company.fullName}), especialista em qualificação e certificação de salas limpas, Smoke Test, gases medicinais e sistemas HVAC-R. Para os fins da LGPD, o Grupo LWN Engenharia é o controlador dos dados pessoais tratados por meio deste site.`,
        },
        { p: 'Nossas unidades:' },
        { ul: officeList },
      ],
    },
    {
      id: 'dados-coletados',
      title: 'Dados que podemos coletar',
      blocks: [
        {
          p: '<strong>Dados que você nos fornece.</strong> Quando você entra em contato conosco — por e-mail, telefone, WhatsApp ou por formulários, quando disponíveis no site —, podemos receber dados como nome, e-mail, telefone, empresa, cargo e o conteúdo da sua mensagem, incluindo informações sobre o seu projeto ou pedido de orçamento. Pedimos apenas o necessário para responder à sua solicitação.',
        },
        {
          p: '<strong>Dados de navegação e técnicos.</strong> Ao acessar o site, alguns dados técnicos podem ser registrados automaticamente pelos servidores e serviços que o mantêm no ar, como endereço IP, data e hora do acesso, páginas visitadas, tipo de navegador e de dispositivo e sistema operacional. Esses registros são usados para operar, proteger e melhorar o site.',
        },
        {
          p: '<strong>Preferências salvas no seu dispositivo.</strong> O site guarda no armazenamento local do seu navegador (localStorage) as suas preferências de tema (claro ou escuro) e de idioma. Essas informações ficam apenas no seu dispositivo, não identificam você e não são enviadas para nós. Você pode apagá-las a qualquer momento nas configurações do navegador.',
        },
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies e tecnologias semelhantes',
      blocks: [
        {
          p: 'Atualmente, o site não utiliza cookies de publicidade nem ferramentas de análise ou de rastreamento de visitantes. Algumas funcionalidades carregam conteúdo de terceiros, que podem receber dados técnicos do seu acesso (como o endereço IP) de acordo com as suas próprias políticas de privacidade:',
        },
        {
          ul: [
            'as fontes tipográficas do site, carregadas a partir do Google Fonts;',
            'as fotos de perfil exibidas junto às avaliações do Google;',
            'os links para WhatsApp, Google Maps, avaliações do Google e redes sociais (LinkedIn, Instagram, Facebook e YouTube), que só são acionados quando você clica neles.',
          ],
        },
        {
          p: 'Caso passemos a utilizar cookies de análise ou de marketing, esta política será atualizada e, quando exigido, pediremos o seu consentimento.',
        },
      ],
    },
    {
      id: 'finalidades',
      title: 'Para que usamos os dados',
      blocks: [
        {
          ul: [
            'responder a contatos, dúvidas e pedidos de orçamento;',
            'apresentar propostas e prestar informações sobre os nossos serviços;',
            'conduzir a relação comercial e a execução de contratos com clientes;',
            'operar, manter e proteger o site, prevenindo fraudes e abusos;',
            'cumprir obrigações legais e regulatórias;',
            'exercer direitos em processos judiciais, administrativos ou arbitrais.',
          ],
        },
      ],
    },
    {
      id: 'bases-legais',
      title: 'Bases legais',
      blocks: [
        { p: 'Tratamos dados pessoais com base nas hipóteses previstas no art. 7º da LGPD, conforme cada situação:' },
        {
          ul: [
            'execução de contrato ou de procedimentos preliminares relacionados a contrato, a seu pedido — por exemplo, a elaboração de um orçamento;',
            'legítimo interesse, para responder contatos, manter o relacionamento com clientes e proteger o site, sempre respeitando os seus direitos e as suas expectativas;',
            'cumprimento de obrigação legal ou regulatória;',
            'exercício regular de direitos;',
            'consentimento, quando necessário — que pode ser revogado a qualquer momento.',
          ],
        },
      ],
    },
    {
      id: 'compartilhamento',
      title: 'Compartilhamento de dados',
      blocks: [
        { p: 'Não vendemos nem alugamos dados pessoais. Podemos compartilhá-los apenas quando necessário:' },
        {
          ul: [
            'com prestadores de serviços que nos apoiam na operação — como hospedagem do site, e-mail, telefonia e ferramentas de comunicação e de tecnologia —, que tratam os dados de acordo com as nossas instruções e com obrigações de confidencialidade e segurança;',
            'com autoridades públicas, quando houver obrigação legal, ordem judicial ou requisição de autoridade competente;',
            'com terceiros, na defesa dos nossos direitos em processos judiciais, administrativos ou arbitrais.',
          ],
        },
        {
          p: 'Quando você utiliza serviços de terceiros a partir do site (como o WhatsApp), o tratamento dos seus dados por esses serviços segue as políticas de privacidade deles.',
        },
      ],
    },
    {
      id: 'transferencia-internacional',
      title: 'Transferência internacional',
      blocks: [
        {
          p: 'Alguns fornecedores de tecnologia podem armazenar ou processar dados fora do Brasil. Nesses casos, a transferência ocorre somente nas hipóteses permitidas pela LGPD e com salvaguardas adequadas de proteção.',
        },
      ],
    },
    {
      id: 'seguranca',
      title: 'Segurança',
      blocks: [
        {
          p: 'Adotamos medidas técnicas e administrativas razoáveis para proteger os dados pessoais contra acessos não autorizados e contra situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou difusão.',
        },
        {
          p: 'Nenhum sistema é totalmente imune a riscos. Se ocorrer um incidente de segurança que possa acarretar risco ou dano relevante aos titulares, adotaremos as providências previstas na LGPD, incluindo as comunicações cabíveis.',
        },
      ],
    },
    {
      id: 'retencao',
      title: 'Por quanto tempo guardamos os dados',
      blocks: [
        {
          p: 'Mantemos os dados pessoais apenas pelo tempo necessário para cumprir as finalidades para as quais foram coletados, pelos prazos exigidos em lei e em normas regulatórias, ou para o exercício regular de direitos. Encerrado esse período, os dados são eliminados ou anonimizados.',
        },
      ],
    },
    {
      id: 'seus-direitos',
      title: 'Os seus direitos',
      blocks: [
        { p: 'Nos termos do art. 18 da LGPD, você pode solicitar, a qualquer momento:' },
        {
          ul: [
            'a confirmação da existência de tratamento dos seus dados;',
            'o acesso aos seus dados;',
            'a correção de dados incompletos, inexatos ou desatualizados;',
            'a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD;',
            'a portabilidade dos dados a outro fornecedor de serviço ou produto, observadas as normas aplicáveis;',
            'a eliminação dos dados tratados com base no seu consentimento;',
            'informações sobre as entidades públicas e privadas com as quais compartilhamos os seus dados;',
            'informações sobre a possibilidade de não fornecer consentimento e sobre as consequências da negativa;',
            'a revogação do consentimento.',
          ],
        },
        {
          p: 'Você também pode se opor a tratamentos realizados com base em outras hipóteses legais, em caso de descumprimento da LGPD, e apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).',
        },
      ],
    },
    {
      id: 'contato',
      title: 'Como falar conosco sobre privacidade',
      blocks: [
        {
          p: `Para exercer os seus direitos ou tirar dúvidas sobre esta política e sobre o tratamento dos seus dados, entre em contato pelo e-mail ${email} ou pelo telefone ${phone}. Esse é também o canal para solicitações dirigidas ao encarregado pelo tratamento de dados pessoais.`,
        },
        {
          p: 'Para a sua segurança, poderemos solicitar informações que confirmem a sua identidade antes de atender ao pedido. Responderemos dentro dos prazos previstos na legislação.',
        },
      ],
    },
    {
      id: 'criancas',
      title: 'Crianças e adolescentes',
      blocks: [
        {
          p: 'O site é voltado a empresas e profissionais e não se destina a crianças. Não coletamos intencionalmente dados pessoais de crianças e adolescentes.',
        },
      ],
    },
    {
      id: 'outros-sites',
      title: 'Links para outros sites',
      blocks: [
        {
          p: 'O site contém links para sites e serviços de terceiros. Não somos responsáveis pelas práticas de privacidade desses terceiros e recomendamos a leitura das respectivas políticas.',
        },
      ],
    },
    {
      id: 'alteracoes',
      title: 'Alterações desta política',
      blocks: [
        {
          p: 'Podemos atualizar esta política para refletir mudanças no site, nos nossos serviços ou na legislação. A versão vigente estará sempre disponível nesta página, com a data da última atualização.',
        },
      ],
    },
  ],
};

const en = {
  intro: [
    'Grupo LWN Engenharia respects your privacy and handles personal data responsibly, transparently and in compliance with Brazil’s General Data Protection Law (Lei nº 13.709/2018 — LGPD).',
    'This Privacy Policy explains which personal data may be processed when you visit this website or contact us, for what purposes, with whom it may be shared and what your rights are.',
  ],
  sections: [
    {
      id: 'quem-somos',
      title: 'Who we are',
      blocks: [
        {
          p: `This website is maintained by <strong>Grupo LWN Engenharia</strong> (${company.name} / ${company.fullName}), a specialist in the qualification and certification of cleanrooms, Smoke Test, medical gases and HVAC-R systems. For the purposes of the LGPD, Grupo LWN Engenharia is the controller of the personal data processed through this website.`,
        },
        { p: 'Our offices:' },
        { ul: officeList },
      ],
    },
    {
      id: 'dados-coletados',
      title: 'Data we may collect',
      blocks: [
        {
          p: '<strong>Data you give us.</strong> When you contact us — by email, phone, WhatsApp or through forms, when available on the website — we may receive data such as your name, email address, phone number, company, job title and the content of your message, including information about your project or quote request. We only ask for what is needed to respond to your request.',
        },
        {
          p: '<strong>Browsing and technical data.</strong> When you access the website, some technical data may be recorded automatically by the servers and services that keep it online, such as your IP address, the date and time of access, the pages visited, your browser and device type and your operating system. These records are used to operate, protect and improve the website.',
        },
        {
          p: '<strong>Preferences saved on your device.</strong> The website stores your theme (light or dark) and language preferences in your browser’s local storage (localStorage). This information stays on your device only, does not identify you and is not sent to us. You can delete it at any time in your browser settings.',
        },
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies and similar technologies',
      blocks: [
        {
          p: 'The website currently does not use advertising cookies or visitor analytics or tracking tools. Some features load third-party content, and those third parties may receive technical data about your visit (such as your IP address) under their own privacy policies:',
        },
        {
          ul: [
            'the website’s typefaces, loaded from Google Fonts;',
            'the profile photos shown next to Google reviews;',
            'the links to WhatsApp, Google Maps, Google reviews and social networks (LinkedIn, Instagram, Facebook and YouTube), which are only triggered when you click them.',
          ],
        },
        {
          p: 'If we start using analytics or marketing cookies, this policy will be updated and, where required, we will ask for your consent.',
        },
      ],
    },
    {
      id: 'finalidades',
      title: 'What we use data for',
      blocks: [
        {
          ul: [
            'responding to enquiries, questions and quote requests;',
            'presenting proposals and providing information about our services;',
            'managing our business relationship and the performance of contracts with clients;',
            'operating, maintaining and protecting the website, preventing fraud and abuse;',
            'complying with legal and regulatory obligations;',
            'exercising our rights in judicial, administrative or arbitration proceedings.',
          ],
        },
      ],
    },
    {
      id: 'bases-legais',
      title: 'Legal bases',
      blocks: [
        { p: 'We process personal data on the legal bases set out in Article 7 of the LGPD, depending on each situation:' },
        {
          ul: [
            'performance of a contract or of preliminary procedures related to a contract, at your request — for example, preparing a quote;',
            'legitimate interest, to respond to enquiries, maintain our relationship with clients and protect the website, always respecting your rights and expectations;',
            'compliance with a legal or regulatory obligation;',
            'the regular exercise of rights;',
            'consent, where required — which you can withdraw at any time.',
          ],
        },
      ],
    },
    {
      id: 'compartilhamento',
      title: 'Sharing of data',
      blocks: [
        { p: 'We do not sell or rent personal data. We may share it only when necessary:' },
        {
          ul: [
            'with service providers that support our operations — such as website hosting, email, telephony and communication and technology tools — which process the data according to our instructions and under confidentiality and security obligations;',
            'with public authorities, where there is a legal obligation, a court order or a request from a competent authority;',
            'with third parties, to defend our rights in judicial, administrative or arbitration proceedings.',
          ],
        },
        {
          p: 'When you use third-party services from the website (such as WhatsApp), the processing of your data by those services is governed by their own privacy policies.',
        },
      ],
    },
    {
      id: 'transferencia-internacional',
      title: 'International transfers',
      blocks: [
        {
          p: 'Some technology providers may store or process data outside Brazil. In such cases, the transfer only takes place in the situations permitted by the LGPD and with appropriate safeguards.',
        },
      ],
    },
    {
      id: 'seguranca',
      title: 'Security',
      blocks: [
        {
          p: 'We adopt reasonable technical and administrative measures to protect personal data against unauthorized access and against accidental or unlawful destruction, loss, alteration, disclosure or dissemination.',
        },
        {
          p: 'No system is completely free of risk. If a security incident occurs that may pose a relevant risk or harm to data subjects, we will take the steps required by the LGPD, including the appropriate notifications.',
        },
      ],
    },
    {
      id: 'retencao',
      title: 'How long we keep data',
      blocks: [
        {
          p: 'We keep personal data only for as long as necessary to fulfil the purposes for which it was collected, for the periods required by law and regulations, or for the regular exercise of rights. After that period, the data is deleted or anonymized.',
        },
      ],
    },
    {
      id: 'seus-direitos',
      title: 'Your rights',
      blocks: [
        { p: 'Under Article 18 of the LGPD, you may request at any time:' },
        {
          ul: [
            'confirmation that your data is being processed;',
            'access to your data;',
            'correction of incomplete, inaccurate or outdated data;',
            'anonymization, blocking or deletion of unnecessary or excessive data, or of data processed in breach of the LGPD;',
            'portability of your data to another service or product provider, subject to the applicable regulations;',
            'deletion of data processed on the basis of your consent;',
            'information about the public and private entities with which we share your data;',
            'information about the possibility of not giving consent and the consequences of refusing;',
            'withdrawal of consent.',
          ],
        },
        {
          p: 'You may also object to processing carried out on other legal bases in the event of non-compliance with the LGPD, and lodge a complaint with Brazil’s National Data Protection Authority (ANPD).',
        },
      ],
    },
    {
      id: 'contato',
      title: 'How to contact us about privacy',
      blocks: [
        {
          p: `To exercise your rights or ask questions about this policy and how your data is handled, contact us by email at ${email} or by phone on ${phone}. This is also the channel for requests addressed to our data protection officer (encarregado).`,
        },
        {
          p: 'For your security, we may ask for information to confirm your identity before fulfilling a request. We will respond within the time limits set by law.',
        },
      ],
    },
    {
      id: 'criancas',
      title: 'Children and adolescents',
      blocks: [
        {
          p: 'The website is aimed at companies and professionals and is not intended for children. We do not knowingly collect personal data from children or adolescents.',
        },
      ],
    },
    {
      id: 'outros-sites',
      title: 'Links to other websites',
      blocks: [
        {
          p: 'The website contains links to third-party websites and services. We are not responsible for the privacy practices of those third parties and recommend reading their respective policies.',
        },
      ],
    },
    {
      id: 'alteracoes',
      title: 'Changes to this policy',
      blocks: [
        {
          p: 'We may update this policy to reflect changes to the website, our services or the law. The current version will always be available on this page, with the date of the latest update.',
        },
      ],
    },
  ],
};

export const PRIVACY = { pt, en };
