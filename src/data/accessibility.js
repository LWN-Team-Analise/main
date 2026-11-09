// Declaracao de acessibilidade do site (portugues e ingles), pedida pelo art. 63
// da Lei Brasileira de Inclusao. Cada recurso listado aqui existe no site: mudou
// o site, mude esta lista e a data.
import { company } from './site';

export const ACCESSIBILITY_UPDATED = '2026-11-09';

const email = `<a href="mailto:${company.email}">${company.email}</a>`;
const phone = `<a href="${company.phoneHref}">${company.phoneDisplay}</a>`;

const pt = {
  intro: [
    'Queremos que todas as pessoas, inclusive pessoas com deficiência, consigam usar este site. Esta página descreve o que o site oferece, o que ainda tem limitações e como pedir ajuda, em atenção ao art. 63 da Lei Brasileira de Inclusão (Lei nº 13.146/2015).',
  ],
  sections: [
    {
      id: 'referencia',
      title: 'Referência adotada',
      blocks: [
        {
          p: 'Usamos como referência as Diretrizes de Acessibilidade para Conteúdo Web (WCAG), nível AA. O site é verificado com ferramentas automáticas e testes de navegação por teclado, mas ainda não passou por uma auditoria independente nem por testes com pessoas com deficiência.',
        },
      ],
    },
    {
      id: 'recursos',
      title: 'O que o site oferece',
      blocks: [
        {
          ul: [
            'navegação completa pelo teclado, com o foco sempre visível;',
            'atalho “Pular para o conteúdo”, que aparece na primeira tecla Tab;',
            'descrição em texto nas imagens que transmitem informação;',
            'títulos, listas e regiões marcados para leitores de tela;',
            'temas claro e escuro, no botão do topo da página;',
            'botões para pausar o vídeo de abertura e os carrosséis;',
            'menos animações quando o seu dispositivo está configurado para reduzir movimento;',
            'conteúdo em português e em inglês.',
          ],
        },
      ],
    },
    {
      id: 'limitacoes',
      title: 'Limitações conhecidas',
      blocks: [
        {
          ul: [
            'o site não tem tradução em Libras nem audiodescrição;',
            'o vídeo de abertura é decorativo e não tem áudio;',
            'o globo e o mapa animados são complementares: as unidades e os canais de contato também estão em texto, no fim da página.',
          ],
        },
        { p: 'A área do colaborador é um sistema interno e não faz parte desta declaração.' },
      ],
    },
    {
      id: 'contato',
      title: 'Encontrou uma barreira?',
      blocks: [
        {
          p: `Se você teve dificuldade para acessar alguma informação, fale conosco por ${email} ou ${phone}. Conte qual página e o que aconteceu, e enviaremos a informação em um formato acessível.`,
        },
      ],
    },
  ],
};

const en = {
  intro: [
    'We want everyone, including people with disabilities, to be able to use this website. This page describes what the website offers, where it still has limitations and how to ask for help, in line with Article 63 of the Brazilian Inclusion Act (Law 13,146/2015).',
  ],
  sections: [
    {
      id: 'referencia',
      title: 'Standard used',
      blocks: [
        {
          p: 'We use the Web Content Accessibility Guidelines (WCAG), level AA, as our reference. The website is checked with automated tools and keyboard navigation tests, but it has not yet undergone an independent audit or testing with people with disabilities.',
        },
      ],
    },
    {
      id: 'recursos',
      title: 'What the website offers',
      blocks: [
        {
          ul: [
            'full keyboard navigation, with a visible focus indicator;',
            'a “Skip to content” shortcut, shown on the first press of the Tab key;',
            'text descriptions on images that convey information;',
            'headings, lists and regions marked up for screen readers;',
            'light and dark themes, using the button at the top of the page;',
            'buttons to pause the opening video and the carousels;',
            'fewer animations when your device is set to reduce motion;',
            'content in Portuguese and English.',
          ],
        },
      ],
    },
    {
      id: 'limitacoes',
      title: 'Known limitations',
      blocks: [
        {
          ul: [
            'the website has no Brazilian Sign Language (Libras) translation or audio description;',
            'the opening video is decorative and has no sound;',
            'the animated globe and map are complementary: offices and contact channels are also available as text at the end of the page.',
          ],
        },
        { p: 'The employee area is an internal system and is not covered by this statement.' },
      ],
    },
    {
      id: 'contato',
      title: 'Found a barrier?',
      blocks: [
        {
          p: `If you had trouble accessing any information, contact us at ${email} or ${phone}. Tell us which page and what happened, and we will send you the information in an accessible format.`,
        },
      ],
    },
  ],
};

export const ACCESSIBILITY = { pt, en };
