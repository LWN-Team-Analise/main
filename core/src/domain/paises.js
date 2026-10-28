/* ============================================================
   PAISES — o pais do endereco do cliente e da unidade (atualizacao 35)

   O Brasil e o padrao: nele o estado e a UF ("SP"), o CEP tem 8
   digitos e as listas de estados e cidades vem do IBGE. Fora dele o
   estado e o nome ("Florida"), o codigo postal e livre e as listas vem
   de outra API (services/enderecoService.js).

   O pais se guarda pelo codigo de duas letras (ISO 3166-1): "BR", "US",
   "PY". O nome em portugues sai do proprio navegador (Intl), sem lista
   de nomes para manter aqui.

   Este arquivo nao tem React dentro: a API (server/routes/dados.js)
   importa o mesmo.
   ============================================================ */

export const PAIS_PADRAO = 'BR'

/* os codigos que a lista de paises oferece */
const CODIGOS = `AD AE AF AG AI AL AM AO AQ AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT
  BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ
  FK FM FO FR GA GB GD GE GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT
  JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO
  MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
  QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO
  TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`
  .trim()
  .split(/\s+/)

const CONHECIDOS = new Set(CODIGOS)

/** O codigo como veio, em maiusculas; vazio vira o Brasil. */
export const codigoDoPais = (pais) => String(pais ?? '').trim().toUpperCase() || PAIS_PADRAO

/** true para o Brasil (e para o endereco sem pais, que e de antes dele existir). */
export const ehBrasil = (pais) => codigoDoPais(pais) === PAIS_PADRAO

export const paisValido = (pais) => CONHECIDOS.has(codigoDoPais(pais))

let nomes = null

/** "Estados Unidos" para "US". Sem o Intl, fica o codigo. */
export function nomeDoPais(pais) {
  const codigo = codigoDoPais(pais)
  try {
    nomes ??= new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    return nomes.of(codigo) ?? codigo
  } catch {
    return codigo
  }
}

let lista = null

/** As opcoes da escolha do pais: o Brasil primeiro, os outros em ordem alfabetica. */
export function opcoesDePaises() {
  lista ??= [
    { valor: PAIS_PADRAO, rotulo: nomeDoPais(PAIS_PADRAO) },
    ...CODIGOS.filter((c) => c !== PAIS_PADRAO)
      .map((c) => ({ valor: c, rotulo: nomeDoPais(c) }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
  ]
  return lista
}
