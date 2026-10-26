/* ============================================================
   TURNOS — a aba no desenho dos Turnos do Teams

   Os grupos sao os CRONOGRAMAS (Cronograma LWN, Cronograma
   Anapolis... e os que vierem). Cada um tem as suas pessoas, e cada
   pessoa os seus turnos na grade de dias:

     turno manual    criado na propria aba: titulo ("ADM"), uma linha
                     embaixo ("Alinhamento"), a cor, os dias (um so ou
                     um trecho, como a folga de 13/10 a 27/10) e, se
                     tiver, o horario. Sem horario e o dia inteiro.
                     Pode vir de uma tarefa de obra (a obra e o check).
     turno da obra   o check com horario das obras ("Ponto de
                     encontro"): cada pessoa de cada data vira um
                     turno, com o horario do encontro. Muda pela obra.
     turno aberto    o turno ainda sem pessoa.

   Este arquivo nao tem React dentro: a API (server/routes/turnos.js)
   importa o mesmo.
   ============================================================ */

/* as cores dos turnos — so a BORDA leva a cor; o fundo e transparente */
export const CORES = [
  { id: 'azul', rotulo: 'Azul', cor: '#2f6fd6' },
  { id: 'roxo', rotulo: 'Roxo', cor: '#8764b8' },
  { id: 'verde', rotulo: 'Verde', cor: '#4a8c1c' },
  { id: 'amarelo', rotulo: 'Amarelo', cor: '#d6a000' },
  { id: 'laranja', rotulo: 'Laranja', cor: '#ca5010' },
  { id: 'vermelho', rotulo: 'Vermelho', cor: '#d13438' },
  { id: 'rosa', rotulo: 'Rosa', cor: '#c239b3' },
  { id: 'turquesa', rotulo: 'Turquesa', cor: '#038387' },
  { id: 'cinza', rotulo: 'Cinza', cor: '#69797e' },
]

/** A cor dos turnos que vem das obras (o ponto de encontro). */
export const COR_DA_OBRA = 'azul'

export const TITULO_MAXIMO = 60
export const SUBTITULO_MAXIMO = 120
export const ANOTACAO_MAXIMA = 500
/** Um turno cobre no maximo um ano de dias (a folga longa cabe). */
export const DIAS_MAXIMOS = 366

export const corPorId = (id) => CORES.find((c) => c.id === id) ?? CORES[0]

/** 'HH:MM' valido, ou null. */
export function lerHora(valor) {
  const t = String(valor ?? '').trim()
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null
}

const minutos = (hora) => {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/**
 * Os minutos do turno em UM dia: do inicio ao fim (o que passa da
 * meia-noite soma as 24h). Sem horario (dia inteiro, folga) ou sem o
 * fim (o ponto de encontro da obra), 0 — nao entra na conta de horas.
 */
export function minutosDoTurno(turno) {
  if (!turno?.horaInicio || !turno?.horaFim) return 0
  const d = minutos(turno.horaFim) - minutos(turno.horaInicio)
  return d > 0 ? d : d + 24 * 60
}

/* ---------------- datas, sem fuso ---------------- */

const emUtc = (iso) => new Date(`${iso}T00:00:00Z`)
const paraIso = (data) => data.toISOString().slice(0, 10)

export function somarDias(iso, n) {
  const d = emUtc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return paraIso(d)
}

export function diasEntre(de, ate) {
  return Math.round((emUtc(ate) - emUtc(de)) / 86400000)
}

/** O domingo da semana do dia (a semana dos Turnos comeca no domingo, como no Teams). */
export function domingoDe(iso) {
  return somarDias(iso, -emUtc(iso).getUTCDay())
}

export function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? ''))) return false
  const d = emUtc(valor)
  return !Number.isNaN(d.getTime()) && paraIso(d) === valor && d.getUTCFullYear() >= 2000
}

/** 0 = domingo. */
export const diaDaSemana = (iso) => emUtc(iso).getUTCDay()
