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

/* as cores dos turnos — so a BORDA leva a cor; o fundo e transparente.
   As 20 amostras, na ordem do circulo de cores. O id e o que vai para o
   banco (as nove primeiras de antes continuam com o mesmo id e a mesma
   cor). Fora delas, o turno pode ter qualquer cor em #RRGGBB, escolhida
   no "Outra cor" (corDoTurno) */
export const CORES = [
  { id: 'vermelho', rotulo: 'Vermelho', cor: '#d13438' },
  { id: 'vinho', rotulo: 'Vinho', cor: '#8e192e' },
  { id: 'coral', rotulo: 'Coral', cor: '#e8684a' },
  { id: 'laranja', rotulo: 'Laranja', cor: '#ca5010' },
  { id: 'amarelo', rotulo: 'Amarelo', cor: '#d6a000' },
  { id: 'lima', rotulo: 'Lima', cor: '#8cbd18' },
  { id: 'verde', rotulo: 'Verde', cor: '#4a8c1c' },
  { id: 'esmeralda', rotulo: 'Esmeralda', cor: '#00a36c' },
  { id: 'turquesa', rotulo: 'Turquesa', cor: '#038387' },
  { id: 'ceu', rotulo: 'Azul-claro', cor: '#3a96dd' },
  { id: 'azul', rotulo: 'Azul', cor: '#2f6fd6' },
  { id: 'marinho', rotulo: 'Azul-marinho', cor: '#1f3a8a' },
  { id: 'anil', rotulo: 'Anil', cor: '#5b5fc7' },
  { id: 'roxo', rotulo: 'Roxo', cor: '#8764b8' },
  { id: 'uva', rotulo: 'Uva', cor: '#5c2e91' },
  { id: 'rosa', rotulo: 'Rosa', cor: '#c239b3' },
  { id: 'pink', rotulo: 'Pink', cor: '#e3008c' },
  { id: 'marrom', rotulo: 'Marrom', cor: '#8e562e' },
  { id: 'cinza', rotulo: 'Cinza', cor: '#69797e' },
  { id: 'grafite', rotulo: 'Grafite', cor: '#3b3a39' },
]

/** A cor dos turnos que vem das obras (o ponto de encontro). */
export const COR_DA_OBRA = 'azul'

/** '#RRGGBB' (a cor escolhida no "Outra cor"), ou null. */
export function corHex(valor) {
  const t = String(valor ?? '').trim()
  return /^#[0-9a-f]{6}$/i.test(t) ? t.toLowerCase() : null
}

/** A cor que o turno pode gravar: uma das amostras (o id) ou um #RRGGBB. */
export const corValida = (valor) => CORES.some((c) => c.id === valor) || corHex(valor) !== null

/** O #RRGGBB de um turno, seja a cor uma amostra ou uma cor propria. */
export const corDoTurno = (valor) => corHex(valor) ?? corPorId(valor).cor

/* ---------------- o TIPO do turno (atualizacao 58) ----------------

   O turno de trabalho e o de sempre. Os outros quatro sao AUSENCIAS: o
   dia inteiro (sem horario), sem obra e sem tarefa, com titulo e cor ja
   sugeridos (os dois continuam editaveis). Nao contam como gente
   trabalhando no dia, e cruzar com um turno da mesma pessoa e conflito.

     ferias            de uma data a outra;
     atestado          o atestado medico;
     folga             a folga pedida pela pessoa;
     nao_operacional   o dia em que nao ha operacao. Sem pessoa, vale
                       para o cronograma inteiro: a coluna do dia fica
                       hachurada em todas as linhas dele. */
export const TIPOS = [
  { id: 'turno', rotulo: 'Turno', curto: 'Turno' },
  { id: 'ferias', rotulo: 'Férias', curto: 'Férias', cor: 'turquesa' },
  { id: 'atestado', rotulo: 'Atestado médico', curto: 'Atestado', cor: 'vermelho' },
  { id: 'folga', rotulo: 'Folga solicitada', curto: 'Folga', cor: 'amarelo' },
  { id: 'nao_operacional', rotulo: 'Dia não operacional', curto: 'Não operacional', cor: 'cinza' },
]

export const TIPO_PADRAO = 'turno'

export const tipoPorId = (id) => TIPOS.find((t) => t.id === id) ?? TIPOS[0]

/** O turno e uma ausencia (ferias, atestado, folga, dia nao operacional)? */
export const ehAusencia = (turno) => Boolean(turno?.tipo) && turno.tipo !== TIPO_PADRAO

/** O dia nao operacional do cronograma inteiro (sem pessoa). */
export const paradaDoCronograma = (turno) => turno?.tipo === 'nao_operacional' && !turno.usuarioId

export const TITULO_MAXIMO = 60
/* a observacao do turno: 500, como no Teams (os turnos importados de la trazem a
   lista de equipamentos inteira, e precisam continuar editaveis) */
export const SUBTITULO_MAXIMO = 500
export const ANOTACAO_MAXIMA = 500
/** Um turno cobre no maximo um ano de dias (a folga longa cabe). */
export const DIAS_MAXIMOS = 366

/* a cor que nao se conhece cai no azul, a cor padrao de antes */
export const corPorId = (id) => CORES.find((c) => c.id === id) ?? CORES.find((c) => c.id === COR_DA_OBRA)

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
