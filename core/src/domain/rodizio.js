/* ============================================================
   RODIZIO MUNICIPAL DE SAO PAULO — a regra, num arquivo so.

   Sem React dentro: a aba Frotas e a API (server/routes/frotas.js,
   GET /api/frotas/rodizio) usam a mesma conta.

   A regra e da Prefeitura (CET) e nao tem API oficial: e fixa por lei.

     segunda  finais 1 e 2      quinta  finais 7 e 8
     terca    finais 3 e 4      sexta   finais 9 e 0
     quarta   finais 5 e 6

   Das 7h as 10h e das 17h as 20h, so no Centro Expandido (o
   minianel viario). Sabado, domingo e feriado: livre. A CET as vezes
   SUSPENDE o rodizio (Carnaval, fim de ano) — os feriados e a quarta
   de cinzas a API ja conhece; uma suspensao avulsa, nao.
   ============================================================ */

/** dia da semana (0 = domingo) -> os finais de placa que nao circulam */
export const FINAIS = { 1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8], 5: [9, 0] }

export const HORARIOS = [
  { de: '07:00', ate: '10:00' },
  { de: '17:00', ate: '20:00' },
]

export const AREA = 'Centro Expandido (minianel viário)'

export const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

/** 0 = domingo ... 6 = sabado, de uma data 'AAAA-MM-DD', sem passar por fuso. */
export function diaDaSemana(iso) {
  const [a, m, d] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

/** O ultimo digito da placa (ABC1D23 -> 3), ou null sem placa. */
export function finalDaPlaca(placa) {
  const achado = String(placa ?? '').trim().match(/(\d)$/)
  return achado ? Number(achado[1]) : null
}

/** Os finais que nao circulam naquele dia da semana ([] no fim de semana). */
export const finaisDoDia = (dia) => FINAIS[dia] ?? []

/** O horario do rodizio em que 'HH:MM' cai ({ de, ate }), ou null fora deles. */
export const horarioDe = (hhmm) => HORARIOS.find((h) => hhmm >= h.de && hhmm < h.ate) ?? null

/** 'HH:MM' esta dentro de um dos horarios do rodizio? */
export const noHorario = (hhmm) => horarioDe(hhmm) !== null

/** '10:00' -> '10h' */
export const horaCurta = (hhmm) => `${Number(String(hhmm).slice(0, 2))}h`

/** 'das 7h às 10h e das 17h às 20h' */
export const horariosLegiveis = () =>
  HORARIOS.map((h) => `das ${Number(h.de.slice(0, 2))}h às ${Number(h.ate.slice(0, 2))}h`).join(' e ')

/** '5 e 6' */
export const finaisLegiveis = (finais) => (finais.length ? finais.join(' e ') : '—')
