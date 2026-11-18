/**
 * OS TURNOS DO TEAMS -> os Turnos do site (atualizacao 59, parte 8)
 *
 * O que a empresa lanca no app Turnos (Shifts) do Teams aparece sozinho
 * na aba Turnos: turno novo entra, turno mudado muda, turno apagado sai.
 * E so de la para ca — o turno que veio do Teams fica so de leitura no
 * site (muda-se no Teams), e o resto da aba continua igual.
 *
 * Como chega
 *   - Ao abrir a aba Turnos (e a cada minuto com ela aberta), o GET de
 *     /api/turnos sincroniza o periodo da tela, se a ultima vez daquele
 *     periodo foi ha mais de INTERVALO_MS. Quem edita os turnos tem ainda
 *     o "Atualizar do Teams", que forca na hora.
 *   - O cron da Vercel (vercel.json) sincroniza as proximas semanas uma
 *     vez por dia, para a aba ja abrir em dia.
 *
 * O que vira o que
 *   grupo do Teams (schedulingGroup)  -> cronograma (pelo id; o de mesmo
 *                                        nome e aproveitado na primeira vez)
 *   turno compartilhado (sharedShift) -> turno, com hora, titulo, observacao
 *                                        e a cor do tema
 *   folga (timeOff)                   -> ausencia do dia inteiro: ferias,
 *                                        atestado, folga ou dia nao operacional,
 *                                        pelo nome do motivo
 *   turno aberto (openShift)          -> turno aberto (sem pessoa)
 *   Rascunho do Teams (ainda nao compartilhado) nao vem: a equipe tambem
 *   nao ve ele la.
 *
 * A pessoa e achada pela conta Microsoft: usuario.outlook_id (quem ja
 * entrou com o Outlook) ou, com a permissao User.Read.All, pelo e-mail.
 * Turno de quem nao esta no site fica de fora (conta no resumo).
 *
 * O que precisa (passo a passo no README)
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID e GRAPH_CLIENT_SECRET — o mesmo
 *   aplicativo do e-mail, com a permissao de APLICATIVO Schedule.Read.All
 *   (e, para achar pelo e-mail, User.Read.All), com o consentimento do
 *   administrador;
 *   TEAMS_TURNOS_EQUIPE — o id do time do Teams onde estao os turnos;
 *   TEAMS_TURNOS_COMO (opcional) — o id de um dono do time, se a Microsoft
 *   pedir o cabecalho MS-APP-ACTS-AS.
 * Sem eles, nada acontece e a aba segue so com o que e feito no site.
 */
import { emTransacao, query } from './db.js'
import { logger } from './logger.js'
import { aplicativoConfigurado, tokenDoAplicativo } from './graph.js'
import { CORES, TIPOS, TITULO_MAXIMO, SUBTITULO_MAXIMO, somarDias } from '../src/domain/turnos.js'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const EQUIPE = String(process.env.TEAMS_TURNOS_EQUIPE ?? '').trim()
const COMO = String(process.env.TEAMS_TURNOS_COMO ?? '').trim()
const FUSO = 'America/Sao_Paulo'
const CHAVE = 'teams_turnos'

/* o mesmo periodo nao vai ao Teams mais de uma vez a cada 3 minutos */
const INTERVALO_MS = 3 * 60 * 1000
/* a tela nao espera o Teams mais do que isto: passou, abre com o que tem */
const ESPERA_MS = 9000
/* a folga comeca antes do periodo (ferias de 30 dias que ja estavam correndo) */
const FOLGA_ANTES_DIAS = 40

export const integracaoConfigurada = () => Boolean(EQUIPE && aplicativoConfigurado())

/* ---------------- o Graph ---------------- */

function erroDoGraph(status, corpo) {
  const codigo = corpo?.error?.code ?? ''
  const texto = corpo?.error?.message ?? ''
  let mensagem = `Teams respondeu ${status} ${codigo} ${texto}`.trim()
  if (status === 401 || status === 403) {
    mensagem =
      'O aplicativo da Microsoft ainda não pode ler os turnos do Teams: falta a permissão de aplicativo ' +
      'Schedule.Read.All com o consentimento do administrador.'
  } else if (status === 404) {
    mensagem = 'O time do Teams não foi encontrado (confira TEAMS_TURNOS_EQUIPE) ou ele não tem o app Turnos.'
  }
  const erro = new Error(mensagem)
  erro.status = status
  return erro
}

async function lerDoGraph(token, caminho) {
  const itens = []
  let url = `${GRAPH}${caminho}`
  for (let pagina = 0; url && pagina < 200; pagina += 1) {
    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, ...(COMO ? { 'MS-APP-ACTS-AS': COMO } : {}) },
      signal: AbortSignal.timeout(15000),
    })
    const corpo = await resposta.json().catch(() => null)
    if (!resposta.ok) throw erroDoGraph(resposta.status, corpo)
    if (Array.isArray(corpo?.value)) itens.push(...corpo.value)
    else if (corpo) itens.push(corpo)
    url = corpo?.['@odata.nextLink'] ?? null
  }
  return itens
}

/* ---------------- datas: o Teams fala em UTC, o site no dia de Sao Paulo ---------------- */

const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** '2026-11-20T11:00:00Z' -> { dia: '2026-11-20', hora: '08:00' } em Sao Paulo. */
function local(iso, menosMinutos = 0) {
  const data = new Date(new Date(iso).getTime() - menosMinutos * 60000)
  const p = Object.fromEntries(formato.formatToParts(data).map((x) => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}

/** A meia-noite de Sao Paulo de um dia, em UTC, para o filtro do Graph. */
function meiaNoite(dia) {
  /* Sao Paulo nao tem horario de verao desde 2019: -03:00 o ano todo */
  return new Date(`${dia}T00:00:00-03:00`).toISOString()
}

/* ---------------- o que vira o que ---------------- */

const TEMA_PARA_COR = {
  white: 'cinza',
  gray: 'cinza',
  blue: 'ceu',
  darkBlue: 'marinho',
  green: 'esmeralda',
  darkGreen: 'verde',
  purple: 'roxo',
  darkPurple: 'uva',
  pink: 'rosa',
  darkPink: 'pink',
  yellow: 'amarelo',
  darkYellow: 'laranja',
}
const corDoTema = (tema) => (CORES.some((c) => c.id === TEMA_PARA_COR[tema]) ? TEMA_PARA_COR[tema] : 'azul')

const semAcento = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** O motivo da folga do Teams -> o tipo de ausencia do site. */
function tipoDoMotivo(nome) {
  const t = semAcento(nome)
  if (/ferias/.test(t)) return 'ferias'
  if (/atest|medic|doen|saude|licenca/.test(t)) return 'atestado'
  if (/nao operacional|feriado|recesso/.test(t)) return 'nao_operacional'
  return 'folga'
}

const corte = (texto, maximo) => String(texto ?? '').trim().slice(0, maximo)

/** As horas do turno: o fim a meia-noite do dia seguinte vira 23:59 do mesmo dia. */
function periodoDoTurno(inicio, fim) {
  const a = local(inicio)
  const b = local(fim)
  if (b.hora === '00:00' && b.dia > a.dia) {
    return { data_inicio: a.dia, data_fim: somarDias(b.dia, -1), hora_inicio: a.hora, hora_fim: '23:59' }
  }
  return { data_inicio: a.dia, data_fim: b.dia < a.dia ? a.dia : b.dia, hora_inicio: a.hora, hora_fim: b.hora }
}

/* ---------------- as pessoas ---------------- */

/* conta Microsoft -> usuario do site; o que o e-mail resolveu fica guardado */
const pessoaPorConta = new Map()
let semUsersReadAll = false

async function mapaDePessoas(token, contas) {
  const { rows } = await query(
    `SELECT id, lower(outlook_id) AS conta, lower(email) AS email, lower(outlook_email) AS outlook_email
       FROM usuario WHERE coalesce(ativo, true)`,
  )
  const porConta = new Map()
  const porEmail = new Map()
  rows.forEach((r) => {
    if (r.conta) porConta.set(r.conta, String(r.id))
    if (r.email) porEmail.set(r.email, String(r.id))
    if (r.outlook_email) porEmail.set(r.outlook_email, String(r.id))
  })
  const resultado = new Map()
  for (const conta of contas) {
    const chave = String(conta).toLowerCase()
    if (porConta.has(chave)) {
      resultado.set(chave, porConta.get(chave))
      continue
    }
    if (pessoaPorConta.has(chave)) {
      const email = pessoaPorConta.get(chave)
      if (email && porEmail.has(email)) resultado.set(chave, porEmail.get(email))
      continue
    }
    if (semUsersReadAll) continue
    try {
      const [u] = await lerDoGraph(token, `/users/${encodeURIComponent(conta)}?$select=mail,userPrincipalName`)
      const email = String(u?.mail || u?.userPrincipalName || '').toLowerCase()
      pessoaPorConta.set(chave, email || null)
      if (email && porEmail.has(email)) resultado.set(chave, porEmail.get(email))
    } catch (erro) {
      /* sem User.Read.All: fica so o outlook_id, sem perguntar de novo a cada turno */
      if (erro.status === 401 || erro.status === 403) semUsersReadAll = true
      else pessoaPorConta.set(chave, null)
    }
  }
  return resultado
}

/* ---------------- os cronogramas ---------------- */

async function cronogramasDosGrupos(cliente, grupos) {
  const { rows } = await cliente.query('SELECT id, nome, ordem, teams_grupo_id FROM cronograma')
  const porGrupo = new Map(rows.filter((r) => r.teams_grupo_id).map((r) => [r.teams_grupo_id, String(r.id)]))
  const porNome = new Map(rows.filter((r) => !r.teams_grupo_id).map((r) => [r.nome.trim().toLowerCase(), r]))
  let ordem = Math.max(0, ...rows.map((r) => r.ordem ?? 0))
  for (const grupo of grupos) {
    if (porGrupo.has(grupo.id)) continue
    const nome = corte(grupo.nome, 60) || 'Teams'
    const mesmoNome = porNome.get(nome.toLowerCase())
    if (mesmoNome) {
      await cliente.query('UPDATE cronograma SET teams_grupo_id = $2 WHERE id = $1', [mesmoNome.id, grupo.id])
      porGrupo.set(grupo.id, String(mesmoNome.id))
      porNome.delete(nome.toLowerCase())
      continue
    }
    ordem += 1
    const { rows: novo } = await cliente.query(
      `INSERT INTO cronograma (nome, ordem, teams_grupo_id) VALUES ($1, $2, $3)
       ON CONFLICT (nome) DO UPDATE SET teams_grupo_id = EXCLUDED.teams_grupo_id
       RETURNING id`,
      [nome, ordem, grupo.id],
    )
    porGrupo.set(grupo.id, String(novo[0].id))
  }
  return porGrupo
}

/* ---------------- sincronizar ---------------- */

const SEM_GRUPO = 'sem-grupo'

/**
 * Traz do Teams o que cai entre `de` e `ate` ('AAAA-MM-DD') e deixa o site
 * igual: cria, muda e apaga. Devolve o resumo.
 */
export async function sincronizar(de, ate) {
  if (!integracaoConfigurada()) return { configurada: false }
  const token = await tokenDoAplicativo()
  const base = `/teams/${encodeURIComponent(EQUIPE)}/schedule`
  const dia0 = somarDias(de, -1)
  const dia1 = somarDias(ate, 1)
  const folga0 = somarDias(de, -FOLGA_ANTES_DIAS)
  const filtro = (campo, inicio) =>
    `$filter=${encodeURIComponent(`${campo}/startDateTime ge ${meiaNoite(inicio)} and ${campo}/endDateTime le ${meiaNoite(somarDias(dia1, 1))}`)}`

  /* os turnos sao obrigatorios (sem eles nao ha o que sincronizar); o resto,
     se a Microsoft recusar, fica de fora sem apagar nada daquele tipo */
  const avisos = []
  const opcional = async (nome, promessa) => {
    try {
      return await promessa
    } catch (erro) {
      avisos.push(`${nome}: ${erro.message}`)
      return null
    }
  }
  const [grupos, turnos, folgas, motivos, abertos] = await Promise.all([
    lerDoGraph(token, `${base}/schedulingGroups`),
    lerDoGraph(token, `${base}/shifts?${filtro('sharedShift', dia0)}`),
    opcional('folgas', lerDoGraph(token, `${base}/timesOff?${filtro('sharedTimeOff', folga0)}`)),
    opcional('motivos das folgas', lerDoGraph(token, `${base}/timeOffReasons`)),
    opcional('turnos abertos', lerDoGraph(token, `${base}/openShifts?${filtro('sharedOpenShift', dia0)}`)),
  ])

  const nomeDoMotivo = new Map((motivos ?? []).map((m) => [m.id, m.displayName]))
  const contas = new Set()
  grupos.forEach((g) => (g.userIds ?? []).forEach((id) => contas.add(id)))
  turnos.forEach((t) => t.userId && contas.add(t.userId))
  ;(folgas ?? []).forEach((f) => f.userId && contas.add(f.userId))
  const pessoas = await mapaDePessoas(token, [...contas])
  const pessoaDe = (conta) => (conta ? pessoas.get(String(conta).toLowerCase()) ?? null : null)

  const linhas = []
  let semPessoa = 0
  const grupoDe = (id) => (id && grupos.some((g) => g.id === id) ? id : SEM_GRUPO)

  for (const t of turnos) {
    const s = t.sharedShift
    if (!s?.startDateTime || !s?.endDateTime) continue
    const usuario = pessoaDe(t.userId)
    if (!usuario) {
      semPessoa += 1
      continue
    }
    const atividade = (s.activities ?? []).find((a) => a.displayName)?.displayName
    linhas.push({
      teams_id: `turno:${t.id}`,
      grupo: grupoDe(t.schedulingGroupId),
      usuario_id: usuario,
      ...periodoDoTurno(s.startDateTime, s.endDateTime),
      titulo: corte(s.displayName || atividade || 'Turno', TITULO_MAXIMO),
      subtitulo: corte(s.notes, SUBTITULO_MAXIMO) || null,
      cor: corDoTema(s.theme),
      tipo: 'turno',
      alterado: t.lastModifiedDateTime ?? null,
    })
  }

  for (const f of folgas ?? []) {
    const s = f.sharedTimeOff
    if (!s?.startDateTime || !s?.endDateTime) continue
    const usuario = pessoaDe(f.userId)
    if (!usuario) {
      semPessoa += 1
      continue
    }
    const motivo = nomeDoMotivo.get(s.timeOffReasonId) ?? ''
    const tipo = tipoDoMotivo(motivo)
    const inicio = local(s.startDateTime).dia
    const fim = local(s.endDateTime, 1).dia
    linhas.push({
      teams_id: `folga:${f.id}`,
      grupo: SEM_GRUPO,
      grupoDaPessoa: true,
      usuario_id: usuario,
      data_inicio: inicio,
      data_fim: fim < inicio ? inicio : fim,
      hora_inicio: null,
      hora_fim: null,
      titulo: corte(motivo || TIPOS.find((x) => x.id === tipo)?.rotulo || 'Folga', TITULO_MAXIMO),
      subtitulo: corte(s.notes, SUBTITULO_MAXIMO) || null,
      cor: TIPOS.find((x) => x.id === tipo)?.cor ?? 'amarelo',
      tipo,
      alterado: f.lastModifiedDateTime ?? null,
    })
  }

  for (const a of abertos ?? []) {
    const s = a.sharedOpenShift
    if (!s?.startDateTime || !s?.endDateTime) continue
    linhas.push({
      teams_id: `aberto:${a.id}`,
      grupo: grupoDe(a.schedulingGroupId),
      usuario_id: null,
      ...periodoDoTurno(s.startDateTime, s.endDateTime),
      titulo: corte(s.displayName || 'Turno aberto', TITULO_MAXIMO),
      subtitulo: corte(s.notes, SUBTITULO_MAXIMO) || null,
      cor: corDoTema(s.theme),
      tipo: 'turno',
      alterado: a.lastModifiedDateTime ?? null,
    })
  }

  const resumo = await emTransacao(async (cliente) => {
    /* os cronogramas: um por grupo do Teams (e o "Teams" para o que vem sem grupo) */
    const precisa = new Map(grupos.map((g) => [g.id, { id: g.id, nome: g.displayName }]))
    if (linhas.some((l) => l.grupo === SEM_GRUPO && !l.grupoDaPessoa)) precisa.set(SEM_GRUPO, { id: SEM_GRUPO, nome: 'Teams' })
    const cronograma = await cronogramasDosGrupos(cliente, [...precisa.values()])

    /* a folga nao tem grupo no Teams: vai para o cronograma onde a pessoa ja esta */
    const { rows: membros } = await cliente.query('SELECT cronograma_id, usuario_id FROM cronograma_membro')
    const cronogramaDaPessoa = new Map()
    membros.forEach((m) => {
      if (!cronogramaDaPessoa.has(String(m.usuario_id))) cronogramaDaPessoa.set(String(m.usuario_id), String(m.cronograma_id))
    })
    grupos.forEach((g) =>
      (g.userIds ?? []).forEach((conta) => {
        const usuario = pessoaDe(conta)
        if (usuario && !cronogramaDaPessoa.has(usuario)) cronogramaDaPessoa.set(usuario, cronograma.get(g.id))
      }),
    )

    const registros = []
    for (const l of linhas) {
      let cronogramaId = l.grupoDaPessoa ? cronogramaDaPessoa.get(l.usuario_id) : cronograma.get(l.grupo)
      if (!cronogramaId) {
        if (!cronograma.has(SEM_GRUPO)) {
          const extra = await cronogramasDosGrupos(cliente, [{ id: SEM_GRUPO, nome: 'Teams' }])
          cronograma.set(SEM_GRUPO, extra.get(SEM_GRUPO))
        }
        cronogramaId = cronograma.get(SEM_GRUPO)
      }
      const { grupo: _g, grupoDaPessoa: _p, ...resto } = l
      registros.push({ ...resto, cronograma_id: cronogramaId })
    }

    /* as pessoas de cada grupo (e de cada turno) entram no cronograma: e
       a linha delas que mostra o turno. Ninguem sai por aqui */
    const pares = new Set()
    grupos.forEach((g) =>
      (g.userIds ?? []).forEach((conta) => {
        const usuario = pessoaDe(conta)
        if (usuario) pares.add(`${cronograma.get(g.id)}:${usuario}`)
      }),
    )
    registros.forEach((r) => r.usuario_id && pares.add(`${r.cronograma_id}:${r.usuario_id}`))
    if (pares.size > 0) {
      await cliente.query(
        `INSERT INTO cronograma_membro (cronograma_id, usuario_id)
         SELECT split_part(p, ':', 1)::bigint, split_part(p, ':', 2)::bigint FROM unnest($1::text[]) p
         ON CONFLICT DO NOTHING`,
        [[...pares]],
      )
    }

    let gravados = 0
    if (registros.length > 0) {
      const { rowCount } = await cliente.query(
        `INSERT INTO turno (cronograma_id, usuario_id, data_inicio, data_fim, hora_inicio, hora_fim,
                            titulo, subtitulo, cor, tipo, compartilhado, compartilhado_em, teams_id, teams_alterado_em)
         SELECT r.cronograma_id, r.usuario_id, r.data_inicio, r.data_fim, r.hora_inicio, r.hora_fim,
                r.titulo, r.subtitulo, r.cor, r.tipo, true, now(), r.teams_id, r.alterado
           FROM jsonb_to_recordset($1::jsonb) AS r(
                  cronograma_id bigint, usuario_id bigint, data_inicio date, data_fim date,
                  hora_inicio time, hora_fim time, titulo text, subtitulo text, cor text,
                  tipo text, teams_id text, alterado timestamptz)
         ON CONFLICT (teams_id) DO UPDATE
            SET cronograma_id = EXCLUDED.cronograma_id, usuario_id = EXCLUDED.usuario_id,
                data_inicio = EXCLUDED.data_inicio, data_fim = EXCLUDED.data_fim,
                hora_inicio = EXCLUDED.hora_inicio, hora_fim = EXCLUDED.hora_fim,
                titulo = EXCLUDED.titulo, subtitulo = EXCLUDED.subtitulo, cor = EXCLUDED.cor,
                tipo = EXCLUDED.tipo, compartilhado = true,
                teams_alterado_em = EXCLUDED.teams_alterado_em, atualizado_em = now()
          WHERE turno.teams_alterado_em IS DISTINCT FROM EXCLUDED.teams_alterado_em
             OR turno.cronograma_id IS DISTINCT FROM EXCLUDED.cronograma_id
             OR turno.usuario_id IS DISTINCT FROM EXCLUDED.usuario_id`,
        [JSON.stringify(registros)],
      )
      gravados = rowCount
    }

    /* o que sumiu do Teams sai daqui — so do tipo que veio, e so dentro do
       periodo que foi perguntado (o de fora nao foi conferido) */
    const apagar = async (prefixo, inicio) => {
      const ids = registros.filter((r) => r.teams_id.startsWith(prefixo)).map((r) => r.teams_id)
      const { rowCount } = await cliente.query(
        `DELETE FROM turno
          WHERE teams_id LIKE $1 AND data_inicio >= $2 AND data_fim <= $3
            AND NOT (teams_id = ANY($4::text[]))`,
        [`${prefixo}%`, inicio, dia1, ids],
      )
      return rowCount
    }
    let removidos = await apagar('turno:', dia0)
    if (folgas) removidos += await apagar('folga:', folga0)
    if (abertos) removidos += await apagar('aberto:', dia0)

    return { gravados, removidos, semPessoa }
  })

  return { configurada: true, ...resumo, recebidos: linhas.length + semPessoa, avisos }
}

/* ---------------- quando sincronizar ---------------- */

const ultimaPorPeriodo = new Map()
const emAndamento = new Map()

async function gravarEstado(estado) {
  await query(
    `INSERT INTO configuracao (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [CHAVE, JSON.stringify(estado)],
  ).catch((erro) => logger.error('turnos-teams', erro.message))
}

/** O que a tela mostra: ligado? quando foi a ultima? deu erro? */
export async function estadoDoTeams() {
  if (!integracaoConfigurada()) return { configurada: false }
  try {
    const { rows } = await query('SELECT valor FROM configuracao WHERE chave = $1', [CHAVE])
    const guardado = rows[0] ? JSON.parse(rows[0].valor) : {}
    return { configurada: true, ultima: guardado.ultima ?? null, erro: guardado.erro ?? null, avisos: guardado.avisos ?? [] }
  } catch {
    return { configurada: true, ultima: null, erro: null, avisos: [] }
  }
}

/** Sincroniza o periodo agora (o mesmo periodo nao roda duas vezes ao mesmo tempo). */
export function sincronizarAgora(de, ate) {
  const chave = `${de}:${ate}`
  if (emAndamento.has(chave)) return emAndamento.get(chave)
  const promessa = sincronizar(de, ate)
    .then(async (resumo) => {
      ultimaPorPeriodo.set(chave, Date.now())
      await gravarEstado({ ultima: new Date().toISOString(), erro: null, avisos: resumo.avisos ?? [], resumo })
      return resumo
    })
    .catch(async (erro) => {
      /* tabela ou coluna que ainda nao existe: a atualizacao 59 nao rodou */
      const mensagem =
        erro.code === '42703' || erro.code === '42P01'
          ? 'O banco ainda não tem os turnos do Teams (atualização 59 em core/db).'
          : erro.message
      ultimaPorPeriodo.set(chave, Date.now())
      logger.error('turnos-teams', mensagem)
      await gravarEstado({ ultima: new Date().toISOString(), erro: mensagem, avisos: [] })
      throw new Error(mensagem)
    })
    .finally(() => emAndamento.delete(chave))
  emAndamento.set(chave, promessa)
  return promessa
}

/**
 * Para o GET da aba: sincroniza o periodo se a ultima vez dele ja passou de
 * INTERVALO_MS, sem fazer a tela esperar mais do que ESPERA_MS, e nunca
 * derruba a leitura. Devolve o estado para a tela.
 */
export async function sincronizarSeVelho(de, ate) {
  if (!integracaoConfigurada()) return { configurada: false }
  const chave = `${de}:${ate}`
  if (Date.now() - (ultimaPorPeriodo.get(chave) ?? 0) >= INTERVALO_MS) {
    await Promise.race([
      sincronizarAgora(de, ate).catch(() => null),
      new Promise((pronto) => setTimeout(pronto, ESPERA_MS)),
    ])
  }
  return estadoDoTeams()
}
