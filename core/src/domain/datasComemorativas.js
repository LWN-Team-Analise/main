/* ============================================================
   DATAS COMEMORATIVAS (atualizacao 59) — o calendario de marketing da
   Agenda da Empresa (aba Panorama). Nao vem do banco: sao calculadas para
   qualquer ano, inclusive as moveis (Carnaval, Pascoa, Corpus Christi,
   Dia das Maes, Dia dos Pais, Black Friday). Sem React dentro.

   Entram ao lado dos eventos cadastrados, com a marca `comemorativa`:
   ninguem edita nem exclui — sao do calendario, nao da empresa.
   ============================================================ */

/* as de dia fixo: 'MM-DD' e o nome */
const FIXAS = [
  ['01-01', 'Confraternização Universal (Ano-Novo)'],
  ['01-20', 'Dia do Farmacêutico'],
  ['03-08', 'Dia Internacional da Mulher'],
  ['03-15', 'Dia do Consumidor'],
  ['04-07', 'Dia Mundial da Saúde'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['05-12', 'Dia da Enfermagem'],
  ['06-05', 'Dia Mundial do Meio Ambiente'],
  ['06-12', 'Dia dos Namorados'],
  ['07-27', 'Dia Nacional de Prevenção de Acidentes do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida e Dia das Crianças'],
  ['10-18', 'Dia do Médico'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia da Consciência Negra'],
  ['12-11', 'Dia do Engenheiro'],
  ['12-25', 'Natal'],
  ['12-31', 'Véspera de Ano-Novo'],
]

const dois = (n) => String(n).padStart(2, '0')
const iso = (ano, mes, dia) => `${ano}-${dois(mes)}-${dois(dia)}`

/** 'AAAA-MM-DD' + n dias, sem fuso no caminho. */
function somar(dia, n) {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

/** O domingo de Pascoa do ano (o algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano) {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return iso(ano, mes, dia)
}

/** O n-esimo `semana` (0 = domingo) do mes: o 2o domingo de maio. */
function enesimo(ano, mes, semana, n) {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay()
  return iso(ano, mes, 1 + ((semana - primeiro + 7) % 7) + (n - 1) * 7)
}

/** A ultima sexta-feira de novembro (a Black Friday). */
function ultimaSextaDeNovembro(ano) {
  const ultimo = new Date(Date.UTC(ano, 11, 0))
  const volta = (ultimo.getUTCDay() - 5 + 7) % 7
  return iso(ano, 11, ultimo.getUTCDate() - volta)
}

/** As datas comemorativas de um ano: [{ id, dia, titulo, comemorativa: true }], em ordem. */
export function datasComemorativas(ano) {
  const domingoDePascoa = pascoa(ano)
  const moveis = [
    [somar(domingoDePascoa, -47), 'Carnaval'],
    [somar(domingoDePascoa, -2), 'Sexta-feira Santa'],
    [domingoDePascoa, 'Páscoa'],
    [enesimo(ano, 5, 0, 2), 'Dia das Mães'],
    [somar(domingoDePascoa, 60), 'Corpus Christi'],
    [enesimo(ano, 8, 0, 2), 'Dia dos Pais'],
    [ultimaSextaDeNovembro(ano), 'Black Friday'],
  ]
  return [...FIXAS.map(([mmdd, titulo]) => [`${ano}-${mmdd}`, titulo]), ...moveis]
    .map(([dia, titulo]) => ({ id: `comemorativa-${dia}-${titulo}`, dia, titulo, comemorativa: true }))
    .sort((x, y) => x.dia.localeCompare(y.dia))
}

/** As de `hoje` ('AAAA-MM-DD') ate `dias` adiante (o ano que vira entra junto). */
export function proximasComemorativas(hoje, dias = 365) {
  const ate = somar(hoje, dias)
  const ano = Number(hoje.slice(0, 4))
  return [...datasComemorativas(ano), ...datasComemorativas(ano + 1)].filter((d) => d.dia >= hoje && d.dia <= ate)
}
