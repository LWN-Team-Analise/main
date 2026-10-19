/* ============================================================
   TRANSITO DA GRANDE SAO PAULO — as regras, num arquivo so.

   Sem React dentro: a aba Frotas (PainelCondicoes) e a API
   (server/routes/frotas.js, GET /api/frotas/condicoes) usam as
   mesmas regioes, os mesmos corredores e a mesma regua de nivel.

   O NIVEL de um trecho sai da velocidade de agora comparada com a
   velocidade dele sem transito (as duas vem do TomTom):

     agora / sem transito   nivel
     75% ou mais            Livre
     50% a 75%              Moderado
     30% a 50%              Intenso
     abaixo de 30%          Muito intenso
     via fechada            Interditado

   Os pontos de cada corredor sao um em cada PISTA (um por sentido),
   tirados do OpenStreetMap: o TomTom devolve a velocidade da pista em
   que o ponto cai, e um ponto solto no meio do mapa cai numa rua
   qualquer.
   ============================================================ */

export const NIVEIS = [
  { id: 'livre', rotulo: 'Livre', minimo: 0.75 },
  { id: 'moderado', rotulo: 'Moderado', minimo: 0.5 },
  { id: 'intenso', rotulo: 'Intenso', minimo: 0.3 },
  { id: 'muito_intenso', rotulo: 'Muito intenso', minimo: 0 },
]

export const INTERDITADO = { id: 'interditado', rotulo: 'Interditado' }

/** O nivel pela velocidade de agora e a sem transito (km/h). */
export function nivelPelaVelocidade(atual, semTransito, interditado = false) {
  if (interditado) return INTERDITADO.id
  if (!(semTransito > 0)) return null
  const razao = atual / semTransito
  return (NIVEIS.find((n) => razao >= n.minimo) ?? NIVEIS.at(-1)).id
}

export const rotuloDoNivel = (id) =>
  id === INTERDITADO.id ? INTERDITADO.rotulo : (NIVEIS.find((n) => n.id === id)?.rotulo ?? '—')

/** Do mais calmo ao pior — para ordenar "onde esta pior agora". */
export const PESO_DO_NIVEL = { livre: 0, moderado: 1, intenso: 2, muito_intenso: 3, interditado: 4 }

/** As regioes da Grande Sao Paulo, como o painel agrupa os corredores. */
export const REGIOES = [
  { id: 'capital', nome: 'Capital', cidades: 'São Paulo' },
  { id: 'norte', nome: 'Norte', cidades: 'Guarulhos, Mairiporã, Caieiras, Cajamar' },
  { id: 'leste', nome: 'Leste', cidades: 'Itaquaquecetuba, Suzano, Mogi das Cruzes, Arujá' },
  { id: 'abc', nome: 'ABC', cidades: 'Santo André, São Bernardo, São Caetano, Diadema, Mauá' },
  { id: 'oeste', nome: 'Oeste', cidades: 'Osasco, Barueri, Carapicuíba, Cotia' },
  { id: 'sudoeste', nome: 'Sudoeste', cidades: 'Taboão da Serra, Embu das Artes, Itapecerica' },
]

/**
 * Os 39 municipios da Regiao Metropolitana de Sao Paulo, pelo codigo
 * do IBGE (servicodados.ibge.gov.br). E por ele que os avisos do
 * INMET dizem onde valem.
 */
export const MUNICIPIOS_RMSP = {
  3550308: 'São Paulo',
  3503901: 'Arujá',
  3505708: 'Barueri',
  3506607: 'Biritiba Mirim',
  3509007: 'Caieiras',
  3509205: 'Cajamar',
  3510609: 'Carapicuíba',
  3513009: 'Cotia',
  3513801: 'Diadema',
  3515004: 'Embu das Artes',
  3515103: 'Embu-Guaçu',
  3515707: 'Ferraz de Vasconcelos',
  3516309: 'Francisco Morato',
  3516408: 'Franco da Rocha',
  3518305: 'Guararema',
  3518800: 'Guarulhos',
  3522208: 'Itapecerica da Serra',
  3522505: 'Itapevi',
  3523107: 'Itaquaquecetuba',
  3525003: 'Jandira',
  3526209: 'Juquitiba',
  3528502: 'Mairiporã',
  3529401: 'Mauá',
  3530607: 'Mogi das Cruzes',
  3534401: 'Osasco',
  3539103: 'Pirapora do Bom Jesus',
  3539806: 'Poá',
  3543303: 'Ribeirão Pires',
  3544103: 'Rio Grande da Serra',
  3545001: 'Salesópolis',
  3546801: 'Santa Isabel',
  3547304: 'Santana de Parnaíba',
  3547809: 'Santo André',
  3548708: 'São Bernardo do Campo',
  3548807: 'São Caetano do Sul',
  3549953: 'São Lourenço da Serra',
  3552502: 'Suzano',
  3552809: 'Taboão da Serra',
  3556453: 'Vargem Grande Paulista',
}

/** 'São Paulo, Guarulhos, Osasco e mais 9 cidades' — onde um aviso vale. */
export function cidadesLegiveis(nomes, mostrar = 3) {
  if (nomes.length >= Object.keys(MUNICIPIOS_RMSP).length) return 'toda a região metropolitana'
  if (nomes.length <= mostrar + 1) {
    return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : (nomes[0] ?? '')
  }
  const resto = nomes.length - mostrar
  return `${nomes.slice(0, mostrar).join(', ')} e mais ${resto} cidade${resto > 1 ? 's' : ''}`
}

/**
 * Os corredores monitorados, com um ponto em cada pista (um por
 * sentido). Os pontos sairam do OpenStreetMap (a pista de mao unica
 * mais perto do lugar escolhido) e foram conferidos no TomTom: cada um
 * cai na pista e no sentido do rotulo. Para acrescentar um corredor,
 * pegue as duas pistas no OpenStreetMap e confira antes.
 */
export const CORREDORES = [
  {
    id: 'marginal-tiete',
    nome: 'Marginal Tietê',
    regiao: 'capital',
    pontos: [
      { sentido: 'sentido Castello Branco', lat: -23.518405, lon: -46.630051 },
      { sentido: 'sentido Ayrton Senna', lat: -23.519355, lon: -46.631097 },
    ],
  },
  {
    id: 'marginal-pinheiros',
    nome: 'Marginal Pinheiros',
    regiao: 'capital',
    pontos: [
      { sentido: 'sentido Interlagos', lat: -23.584279, lon: -46.692959 },
      { sentido: 'sentido Castello Branco', lat: -23.583782, lon: -46.691585 },
    ],
  },
  {
    id: '23-de-maio',
    nome: 'Av. 23 de Maio',
    regiao: 'capital',
    pontos: [
      { sentido: 'sentido centro', lat: -23.580086, lon: -46.648107 },
      { sentido: 'sentido bairro', lat: -23.579181, lon: -46.64717 },
    ],
  },
  {
    id: 'radial-leste',
    nome: 'Radial Leste',
    regiao: 'capital',
    pontos: [
      { sentido: 'sentido centro', lat: -23.543866, lon: -46.590556 },
      { sentido: 'sentido bairro', lat: -23.543895, lon: -46.589923 },
    ],
  },
  {
    id: 'bandeirantes-av',
    nome: 'Av. dos Bandeirantes',
    regiao: 'capital',
    pontos: [
      { sentido: 'sentido Marginal Pinheiros', lat: -23.612896, lon: -46.670858 },
      { sentido: 'sentido Imigrantes', lat: -23.612906, lon: -46.671246 },
    ],
  },
  {
    id: 'dutra',
    nome: 'Via Dutra',
    regiao: 'norte',
    pontos: [
      { sentido: 'sentido São Paulo', lat: -23.474546, lon: -46.523597 },
      { sentido: 'sentido Rio', lat: -23.474969, lon: -46.52378 },
    ],
  },
  {
    id: 'fernao-dias',
    nome: 'Rod. Fernão Dias',
    regiao: 'norte',
    pontos: [
      { sentido: 'sentido São Paulo', lat: -23.422908, lon: -46.576393 },
      { sentido: 'sentido Belo Horizonte', lat: -23.42313, lon: -46.576077 },
    ],
  },
  {
    id: 'anhanguera',
    nome: 'Rod. Anhanguera',
    regiao: 'norte',
    pontos: [
      { sentido: 'sentido capital', lat: -23.438693, lon: -46.786019 },
      { sentido: 'sentido interior', lat: -23.442711, lon: -46.78662 },
    ],
  },
  {
    id: 'bandeirantes-rod',
    nome: 'Rod. dos Bandeirantes',
    regiao: 'norte',
    pontos: [
      { sentido: 'sentido capital', lat: -23.412664, lon: -46.766792 },
      { sentido: 'sentido interior', lat: -23.412983, lon: -46.76633 },
    ],
  },
  {
    id: 'ayrton-senna',
    nome: 'Rod. Ayrton Senna',
    regiao: 'leste',
    pontos: [
      { sentido: 'sentido capital', lat: -23.470025, lon: -46.399431 },
      { sentido: 'sentido interior', lat: -23.470225, lon: -46.399215 },
    ],
  },
  {
    id: 'rodoanel-leste',
    nome: 'Rodoanel Leste',
    regiao: 'leste',
    pontos: [
      { sentido: 'sentido Dutra', lat: -23.499369, lon: -46.337108 },
      { sentido: 'sentido ABC', lat: -23.495103, lon: -46.337094 },
    ],
  },
  {
    id: 'jacu-pessego',
    nome: 'Av. Jacu-Pêssego',
    regiao: 'leste',
    pontos: [
      { sentido: 'sentido Guarulhos', lat: -23.568795, lon: -46.446918 },
      { sentido: 'sentido ABC', lat: -23.570637, lon: -46.447035 },
    ],
  },
  {
    id: 'anchieta',
    nome: 'Via Anchieta',
    regiao: 'abc',
    pontos: [
      { sentido: 'sentido capital', lat: -23.693085, lon: -46.563653 },
      { sentido: 'sentido litoral', lat: -23.688941, lon: -46.565144 },
    ],
  },
  {
    id: 'imigrantes',
    nome: 'Rod. dos Imigrantes',
    regiao: 'abc',
    pontos: [
      { sentido: 'sentido capital', lat: -23.751119, lon: -46.59513 },
      { sentido: 'sentido litoral', lat: -23.743045, lon: -46.598597 },
    ],
  },
  {
    id: 'av-estados',
    nome: 'Av. dos Estados',
    regiao: 'abc',
    pontos: [
      { sentido: 'sentido capital', lat: -23.641091, lon: -46.533489 },
      { sentido: 'sentido Mauá', lat: -23.641419, lon: -46.533653 },
    ],
  },
  {
    id: 'rodoanel-sul',
    nome: 'Rodoanel Sul',
    regiao: 'abc',
    pontos: [
      { sentido: 'sentido Régis Bittencourt', lat: -23.725011, lon: -46.488632 },
      { sentido: 'sentido Mauá', lat: -23.723963, lon: -46.487507 },
    ],
  },
  {
    id: 'castello',
    nome: 'Rod. Castello Branco',
    regiao: 'oeste',
    pontos: [
      { sentido: 'sentido capital', lat: -23.509978, lon: -46.819254 },
      { sentido: 'sentido interior', lat: -23.509234, lon: -46.818048 },
    ],
  },
  {
    id: 'raposo',
    nome: 'Rod. Raposo Tavares',
    regiao: 'oeste',
    pontos: [
      { sentido: 'sentido capital', lat: -23.592976, lon: -46.836122 },
      { sentido: 'sentido interior', lat: -23.592925, lon: -46.83629 },
    ],
  },
  {
    id: 'rodoanel-oeste',
    nome: 'Rodoanel Oeste',
    regiao: 'oeste',
    pontos: [
      { sentido: 'sentido Anhanguera', lat: -23.547972, lon: -46.820248 },
      { sentido: 'sentido Régis Bittencourt', lat: -23.54788, lon: -46.820498 },
    ],
  },
  {
    id: 'regis',
    nome: 'Rod. Régis Bittencourt',
    regiao: 'sudoeste',
    pontos: [
      { sentido: 'sentido capital', lat: -23.619616, lon: -46.810173 },
      { sentido: 'sentido Curitiba', lat: -23.617946, lon: -46.80532 },
    ],
  },
]
