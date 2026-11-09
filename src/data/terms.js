// Termos de Uso do site (portugues e ingles). Fala so do que o site faz de
// verdade: e institucional, nao vende nada e nao tem cadastro. Rascunho a ser
// revisado por advogado antes de valer como texto definitivo.
import { identificacaoDaEmpresa, faltaPreencher } from './legal';
import { company, privacyPath } from './site';

export const TERMS_UPDATED = '2026-11-09';

const email = `<a href="mailto:${company.email}">${company.email}</a>`;
const phone = `<a href="${company.phoneHref}">${company.phoneDisplay}</a>`;
const identificacao = identificacaoDaEmpresa ? `, ${identificacaoDaEmpresa}` : '';

const pt = {
  intro: [
    'Estes Termos de Uso regulam o acesso e o uso deste site, mantido pelo Grupo LWN Engenharia. Ao navegar por ele, você concorda com as condições abaixo. Se não concordar, não utilize o site.',
    'Estes Termos tratam apenas do uso do site. A contratação dos nossos serviços é regida pelas propostas e pelos contratos firmados com cada cliente.',
  ],
  sections: [
    {
      id: 'o-site',
      title: 'Sobre o site',
      blocks: [
        {
          p: `Este é o site institucional do <strong>Grupo LWN Engenharia</strong> (${company.name} / ${company.fullName}${identificacao})${identificacaoDaEmpresa ? '' : faltaPreencher('razão social e CNPJ')}. Ele apresenta a empresa, os serviços, artigos e canais de contato. O site não realiza vendas nem contratações e não exige cadastro.`,
        },
      ],
    },
    {
      id: 'uso-permitido',
      title: 'Uso permitido',
      blocks: [
        { p: 'Você pode navegar pelo site e compartilhar links para as suas páginas. Não é permitido:' },
        {
          ul: [
            'usar o site para fins ilícitos ou que violem direitos de terceiros;',
            'tentar acessar áreas restritas, sistemas ou dados sem autorização;',
            'interferir no funcionamento ou na segurança do site, inclusive com programas maliciosos ou sobrecarga intencional;',
            'copiar o conteúdo em massa por meios automatizados sem autorização;',
            'apresentar-se falsamente como o Grupo LWN Engenharia ou como pessoa ligada a ele.',
          ],
        },
      ],
    },
    {
      id: 'propriedade-intelectual',
      title: 'Propriedade intelectual',
      blocks: [
        {
          p: 'Os textos, fotografias, vídeos, ilustrações, marcas, logotipos, o mascote BAL e o projeto visual deste site pertencem ao Grupo LWN Engenharia ou aos seus respectivos titulares e são protegidos pela legislação brasileira, em especial pela Lei de Direitos Autorais (Lei nº 9.610/1998) e pela Lei da Propriedade Industrial (Lei nº 9.279/1996).',
        },
        {
          p: 'É proibido reproduzir, modificar, distribuir ou usar comercialmente esse conteúdo sem autorização prévia e por escrito, ressalvadas as limitações previstas em lei, como a citação de trechos com indicação da fonte.',
        },
      ],
    },
    {
      id: 'marcas-de-terceiros',
      title: 'Marcas de terceiros',
      blocks: [
        {
          p: 'Os nomes, marcas e logotipos de clientes, parceiros e entidades exibidos no site pertencem aos respectivos titulares. Eles aparecem apenas para identificar empresas atendidas ou entidades com as quais temos relação, e sua exibição não significa patrocínio, endosso ou afiliação.',
        },
        {
          p: `O titular que desejar a retirada da sua marca ou tiver qualquer dúvida sobre esse uso pode nos escrever para ${email}.`,
        },
      ],
    },
    {
      id: 'conteudo-tecnico',
      title: 'Conteúdo técnico e informativo',
      blocks: [
        {
          p: 'As informações do site, incluindo artigos e referências a normas, têm caráter geral e informativo. Elas não substituem uma análise técnica do caso concreto, um laudo ou um parecer profissional, e as normas podem mudar: confirme sempre a versão vigente.',
        },
        {
          p: 'Números e resultados apresentados refletem a nossa experiência e não constituem garantia de resultado em um projeto específico.',
        },
      ],
    },
    {
      id: 'assistente-bal',
      title: 'Assistente BAL',
      blocks: [
        {
          p: 'O BAL é um assistente virtual com respostas prontas, baseadas no próprio conteúdo do site. Ele não é um atendimento humano, não tem campo para digitar e não coleta dados pessoais. Para falar com a nossa equipe, use os canais de contato.',
        },
      ],
    },
    {
      id: 'avaliacoes',
      title: 'Avaliações',
      blocks: [
        {
          p: `Os comentários exibidos foram publicados pelos seus autores no Google e expressam a opinião deles. Quem preferir que o seu comentário não apareça no site pode pedir a retirada por ${email}.`,
        },
      ],
    },
    {
      id: 'links',
      title: 'Links para terceiros',
      blocks: [
        {
          p: 'O site tem links para serviços de terceiros, como WhatsApp, Google Maps e redes sociais. Não controlamos esses serviços e não respondemos pelo seu conteúdo, disponibilidade ou práticas.',
        },
      ],
    },
    {
      id: 'disponibilidade',
      title: 'Disponibilidade e responsabilidade',
      blocks: [
        {
          p: 'Procuramos manter o site funcionando e atualizado, mas não garantimos que ele estará sempre disponível ou livre de erros, e podemos alterar, suspender ou encerrar qualquer parte dele.',
        },
        {
          p: 'Nos limites da lei, não respondemos por danos decorrentes de falhas de internet ou de dispositivos, de conteúdo de terceiros ou de uso indevido do site. Nada nestes Termos afasta direitos que não possam ser limitados por lei, inclusive os previstos no Código de Defesa do Consumidor, quando aplicável.',
        },
      ],
    },
    {
      id: 'area-colaborador',
      title: 'Área do colaborador',
      blocks: [
        {
          p: 'A área do colaborador é de uso restrito a pessoas autorizadas pela empresa e segue regras próprias. Tentativas de acesso sem autorização são proibidas.',
        },
      ],
    },
    {
      id: 'privacidade',
      title: 'Privacidade',
      blocks: [
        {
          p: `O tratamento de dados pessoais está descrito na nossa <a href="${privacyPath}">Política de Privacidade</a>.`,
        },
      ],
    },
    {
      id: 'alteracoes',
      title: 'Alterações destes Termos',
      blocks: [
        {
          p: 'Podemos atualizar estes Termos para refletir mudanças no site ou na legislação. A versão vigente estará sempre nesta página, com a data da última atualização.',
        },
      ],
    },
    {
      id: 'lei-aplicavel',
      title: 'Lei aplicável',
      blocks: [
        {
          p: 'Estes Termos são regidos pelas leis da República Federativa do Brasil. Eventuais controvérsias serão resolvidas no foro competente, nos termos da lei, assegurado ao consumidor o foro do seu domicílio.',
        },
      ],
    },
    {
      id: 'contato',
      title: 'Contato',
      blocks: [{ p: `Dúvidas sobre estes Termos: ${email} ou ${phone}.` }],
    },
  ],
};

const en = {
  intro: [
    'These Terms of Use govern access to and use of this website, maintained by Grupo LWN Engenharia. By browsing it, you agree to the conditions below. If you do not agree, please do not use the website.',
    'These Terms cover the use of the website only. Our services are governed by the proposals and contracts signed with each client.',
  ],
  sections: [
    {
      id: 'o-site',
      title: 'About the website',
      blocks: [
        {
          p: `This is the corporate website of <strong>Grupo LWN Engenharia</strong> (${company.name} / ${company.fullName}${identificacao})${identificacaoDaEmpresa ? '' : faltaPreencher('razão social e CNPJ')}. It presents the company, its services, articles and contact channels. The website does not sell or contract anything and requires no registration.`,
        },
      ],
    },
    {
      id: 'uso-permitido',
      title: 'Permitted use',
      blocks: [
        { p: 'You may browse the website and share links to its pages. You may not:' },
        {
          ul: [
            'use the website for unlawful purposes or in ways that infringe the rights of others;',
            'try to access restricted areas, systems or data without authorization;',
            'interfere with the operation or security of the website, including through malicious software or deliberate overload;',
            'copy content in bulk by automated means without authorization;',
            'falsely present yourself as Grupo LWN Engenharia or as someone connected to it.',
          ],
        },
      ],
    },
    {
      id: 'propriedade-intelectual',
      title: 'Intellectual property',
      blocks: [
        {
          p: 'The texts, photographs, videos, illustrations, trademarks, logos, the BAL mascot and the visual design of this website belong to Grupo LWN Engenharia or to their respective owners and are protected by Brazilian law, in particular the Copyright Act (Law 9,610/1998) and the Industrial Property Act (Law 9,279/1996).',
        },
        {
          p: 'Reproducing, modifying, distributing or commercially using this content without prior written authorization is prohibited, except for the limitations provided by law, such as quoting excerpts with attribution.',
        },
      ],
    },
    {
      id: 'marcas-de-terceiros',
      title: 'Third-party trademarks',
      blocks: [
        {
          p: 'The names, trademarks and logos of clients, partners and organizations shown on the website belong to their respective owners. They appear only to identify companies served or organizations we are connected with, and showing them does not imply sponsorship, endorsement or affiliation.',
        },
        {
          p: `Owners who wish to have their trademark removed, or who have any question about this use, can write to ${email}.`,
        },
      ],
    },
    {
      id: 'conteudo-tecnico',
      title: 'Technical and informational content',
      blocks: [
        {
          p: 'The information on the website, including articles and references to standards, is general and informational. It does not replace a technical analysis of a specific case, a report or a professional opinion, and standards may change: always confirm the current version.',
        },
        {
          p: 'Figures and results presented reflect our experience and do not guarantee results in any specific project.',
        },
      ],
    },
    {
      id: 'assistente-bal',
      title: 'BAL assistant',
      blocks: [
        {
          p: 'BAL is a virtual assistant with pre-written answers based on the website’s own content. It is not a human service, has no text input and collects no personal data. To talk to our team, use the contact channels.',
        },
      ],
    },
    {
      id: 'avaliacoes',
      title: 'Reviews',
      blocks: [
        {
          p: `The comments shown were posted by their authors on Google and express their own opinions. Anyone who prefers that their comment not appear on the website can request its removal at ${email}.`,
        },
      ],
    },
    {
      id: 'links',
      title: 'Links to third parties',
      blocks: [
        {
          p: 'The website links to third-party services such as WhatsApp, Google Maps and social networks. We do not control those services and are not responsible for their content, availability or practices.',
        },
      ],
    },
    {
      id: 'disponibilidade',
      title: 'Availability and liability',
      blocks: [
        {
          p: 'We try to keep the website working and up to date, but we do not guarantee that it will always be available or free of errors, and we may change, suspend or discontinue any part of it.',
        },
        {
          p: 'To the extent permitted by law, we are not liable for damage arising from internet or device failures, third-party content or misuse of the website. Nothing in these Terms excludes rights that cannot be limited by law, including those under the Brazilian Consumer Protection Code, where applicable.',
        },
      ],
    },
    {
      id: 'area-colaborador',
      title: 'Employee area',
      blocks: [
        {
          p: 'The employee area is restricted to people authorized by the company and follows its own rules. Unauthorized access attempts are prohibited.',
        },
      ],
    },
    {
      id: 'privacidade',
      title: 'Privacy',
      blocks: [
        {
          p: `The processing of personal data is described in our <a href="${privacyPath}">Privacy Policy</a>.`,
        },
      ],
    },
    {
      id: 'alteracoes',
      title: 'Changes to these Terms',
      blocks: [
        {
          p: 'We may update these Terms to reflect changes to the website or the law. The current version will always be on this page, with the date of the latest update.',
        },
      ],
    },
    {
      id: 'lei-aplicavel',
      title: 'Governing law',
      blocks: [
        {
          p: 'These Terms are governed by the laws of the Federative Republic of Brazil. Any dispute will be resolved in the competent court under the law, with consumers guaranteed the court of their own domicile.',
        },
      ],
    },
    {
      id: 'contato',
      title: 'Contact',
      blocks: [{ p: `Questions about these Terms: ${email} or ${phone}.` }],
    },
  ],
};

export const TERMS = { pt, en };
