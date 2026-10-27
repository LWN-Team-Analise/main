import { Router } from 'express'
import { emTransacao, query } from '../db.js'
import { cargoPode, exige, exigeSessao, meuCargo, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'
import {
  ANOTACAO_MAXIMA,
  CORES,
  COR_DA_OBRA,
  DIAS_MAXIMOS,
  SUBTITULO_MAXIMO,
  TITULO_MAXIMO,
  dataValida,
  diasEntre,
  lerHora,
  somarDias,
} from '../../src/domain/turnos.js'

/* ============================================================
   TURNOS — /api/turnos (atualizacao 31)

     GET    /?de=&ate=             os cronogramas (com as pessoas), os
                                   turnos do periodo e as anotacoes
     POST   /                      cria um turno (nasce sem compartilhar)
     POST   /colar                 cola os turnos copiados num dia de uma
                                   pessoa (ou dos turnos abertos)
     POST   /copiar-agenda         copia a agenda do periodo anterior para
                                   o atual
     POST   /compartilhar          compartilha com a equipe os escolhidos
                                   (ou todos os do periodo)
     PUT    /:id                   edita
     DELETE /:id                   apaga
     PUT    /anotacoes/:dia        a "Anotacao do dia" (vazia apaga)
     POST   /cronogramas           cria um cronograma
     PUT    /cronogramas/:id       renomeia e/ou troca as pessoas
     DELETE /cronogramas/:id       apaga (com os turnos dele)

   Os turnos que vem das OBRAS nao moram aqui: sao lidos das proprias
   obras a cada GET, e mudam por la — assim nao ha duas copias para
   ficarem diferentes:

     o check com horario   cada pessoa de cada data (o ponto de
                           encontro), na linha da pessoa;
     a execucao            os dias da execucao de cada obra (com o
                           carro reservado), na secao "Obras";
     os prazos             os checks com prazo ainda nao feitos, no dia
                           do prazo, na secao "Obras".

   Quem pode: ver_turnos ve; editar_turnos cria e muda turnos,
   anotacoes e cronogramas.

   COMPARTILHAR (atualizacao 32), como no Teams: o turno criado, colado
   ou copiado da agenda anterior nasce como RASCUNHO — quem edita ve (em
   italico, com o asterisco), a equipe nao. Ele passa a valer para todos
   no "Compartilhar com a equipe". Editar um turno ja compartilhado nao o
   tira da equipe.
   ============================================================ */

const router = Router()

const VER = 'ver_turnos'
const EDITAR = 'editar_turnos'

const texto = (valor) => String(valor ?? '').trim()
const idValido = (valor) => /^\d{1,15}$/.test(String(valor ?? ''))
/* o periodo de uma leitura: as duas semanas da tela, com folga */
const PERIODO_MAXIMO = 62
/* execucao sem os dias escolhidos (periodo corrido de antes da
   atualizacao 20): no maximo isto de dias */
const DIAS_CORRIDOS_MAXIMOS = 120

/** Tabela ou coluna que ainda nao existe (atualizacao nao rodada) vale como vazia. */
const vazioSeFaltar = (erro) => {
  if (erro.code === '42P01' || erro.code === '42703') return { rows: [] }
  throw erro
}

/** ['2026-10-06', '2026-10-07', '2026-10-09'] -> [['2026-10-06', '2026-10-07'], ['2026-10-09', '2026-10-09']] */
function trechos(dias) {
  const lista = []
  for (const dia of dias) {
    const ultimo = lista.at(-1)
    if (ultimo && somarDias(ultimo[1], 1) === dia) ultimo[1] = dia
    else lista.push([dia, dia])
  }
  return lista
}

function falhou(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro: 'O banco ainda não está atualizado para os Turnos (atualizações 31 e 32 em core/db). Rode npm run db:atualizar e suba a API de novo.',
    })
  }
  if (erro.code === '23505') return res.status(409).json({ erro: 'Já existe um cronograma com esse nome.', campo: 'nome' })
  if (erro.code === '23503') return res.status(400).json({ erro: 'A pessoa, a obra ou o cronograma não existe mais.' })
  return tratar(erro, res, onde)
}

function paraTurno(l) {
  return {
    id: String(l.id),
    origem: 'manual',
    cronogramaId: String(l.cronograma_id),
    usuarioId: l.usuario_id === null ? null : String(l.usuario_id),
    dataInicio: l.data_inicio,
    dataFim: l.data_fim,
    horaInicio: l.hora_inicio ?? null,
    horaFim: l.hora_fim ?? null,
    titulo: l.titulo,
    subtitulo: l.subtitulo ?? '',
    cor: l.cor,
    obraId: l.obra_id === null ? null : String(l.obra_id),
    checkId: l.check_id === null ? null : String(l.check_id),
    /* false = rascunho: so quem edita os turnos ve */
    compartilhado: l.compartilhado !== false,
  }
}

const SELECT_TURNO = `
  SELECT t.id, t.cronograma_id, t.usuario_id,
         to_char(t.data_inicio, 'YYYY-MM-DD') AS data_inicio, to_char(t.data_fim, 'YYYY-MM-DD') AS data_fim,
         to_char(t.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(t.hora_fim, 'HH24:MI') AS hora_fim,
         t.titulo, t.subtitulo, t.cor, t.obra_id, t.check_id, t.compartilhado
    FROM turno t`

/* ---------------- leitura ---------------- */

router.get('/', exigeSessao, exige(VER), async (req, res) => {
  /* o rascunho (ainda nao compartilhado) so aparece para quem edita */
  let edita = false
  try {
    edita = cargoPode(await meuCargo(req.dono.sub), EDITAR)
  } catch (erro) {
    return falhou(erro, res, 'turnos/ler')
  }
  const de = texto(req.query.de)
  const ate = texto(req.query.ate)
  if (!dataValida(de) || !dataValida(ate) || ate < de) return res.status(400).json({ erro: 'Período inválido.' })
  if (diasEntre(de, ate) > PERIODO_MAXIMO) return res.status(400).json({ erro: 'Período longo demais.' })
  try {
    const [cronogramas, membros, turnos, daObra, anotacoes, execucoes, reservas, prazos] = await Promise.all([
      query('SELECT id, nome, ordem FROM cronograma ORDER BY ordem, id'),
      query(
        `SELECT m.cronograma_id, m.usuario_id
           FROM cronograma_membro m
           JOIN usuario u ON u.id = m.usuario_id AND coalesce(u.ativo, true)
          ORDER BY lower(u.name)`,
      ),
      query(
        `${SELECT_TURNO}
          WHERE t.data_inicio <= $2 AND t.data_fim >= $1
            AND (t.compartilhado OR $3)
          ORDER BY t.data_inicio, t.hora_inicio NULLS FIRST, t.id`,
        [de, ate, edita],
      ),
      /* o check com horario das obras: cada pessoa de cada data */
      query(
        `SELECT h.obra_id, h.check_id, to_char(h.dia, 'YYYY-MM-DD') AS dia, to_char(h.hora, 'HH24:MI') AS hora,
                m.usuario_id, o.proposta, cl.nome AS cliente, ck.titulo AS check_titulo
           FROM obra_horario h
           JOIN obra_horario_membro m ON m.obra_id = h.obra_id AND m.check_id = h.check_id AND m.dia = h.dia
           JOIN obra o                ON o.id = h.obra_id
           LEFT JOIN cliente cl       ON cl.id = o.cliente_id
           JOIN etapa_check ck        ON ck.id = h.check_id
          WHERE h.dia BETWEEN $1 AND $2
          ORDER BY h.dia, h.hora`,
        [de, ate],
      ),
      query(
        `SELECT to_char(dia, 'YYYY-MM-DD') AS dia, texto FROM turno_anotacao WHERE dia BETWEEN $1 AND $2`,
        [de, ate],
      ),
      /* a execucao das obras que cai no periodo (atualizacoes 15 e 20) */
      query(
        `SELECT o.id, o.proposta, o.tipo, cl.nome AS cliente,
                to_char(o.execucao_inicio, 'YYYY-MM-DD') AS inicio,
                to_char(o.execucao_prazo, 'YYYY-MM-DD') AS prazo,
                to_char(o.data_inicio, 'YYYY-MM-DD') AS data_inicio,
                ARRAY(SELECT to_char(d, 'YYYY-MM-DD') FROM unnest(coalesce(o.execucao_dias, '{}'::date[])) d ORDER BY d) AS dias
           FROM obra o
           LEFT JOIN cliente cl ON cl.id = o.cliente_id
          WHERE o.execucao_prazo IS NOT NULL
            AND o.execucao_prazo >= $1
            AND coalesce(o.execucao_inicio, o.data_inicio, o.execucao_prazo) <= $2`,
        [de, ate],
      ).catch(vazioSeFaltar),
      /* o carro reservado de cada obra (atualizacao 23) */
      query(
        `SELECT r.obra_id, v.nome AS veiculo
           FROM obra_reserva_veiculo r JOIN veiculo v ON v.id = r.veiculo_id`,
      ).catch(vazioSeFaltar),
      /* os checks com prazo no periodo que ainda nao foram feitos (atualizacao 13) */
      query(
        `SELECT p.obra_id, p.check_id, to_char(p.prazo, 'YYYY-MM-DD') AS prazo, ck.titulo,
                o.proposta, cl.nome AS cliente
           FROM obra_prazo_check p
           JOIN etapa_check ck  ON ck.id = p.check_id
           JOIN obra o          ON o.id = p.obra_id AND o.concluida_em IS NULL
           LEFT JOIN cliente cl ON cl.id = o.cliente_id
          WHERE p.prazo BETWEEN $1 AND $2
            AND NOT EXISTS (SELECT 1 FROM obra_check oc WHERE oc.obra_id = p.obra_id AND oc.check_id = p.check_id)
          ORDER BY p.prazo`,
        [de, ate],
      ).catch(vazioSeFaltar),
    ])

    /* a execucao de cada obra, em trechos de dias seguidos */
    const carroDa = Object.fromEntries(reservas.rows.map((l) => [l.obra_id, l.veiculo]))
    const execucao = execucoes.rows.flatMap((l) => {
      let dias = l.dias ?? []
      if (dias.length === 0) {
        const comeco = l.inicio ?? l.data_inicio ?? l.prazo
        const total = comeco > l.prazo ? 0 : Math.min(diasEntre(comeco, l.prazo), DIAS_CORRIDOS_MAXIMOS)
        dias = Array.from({ length: total + 1 }, (_, i) => somarDias(comeco > l.prazo ? l.prazo : comeco, i))
      }
      const nome = [l.proposta, l.cliente].filter(Boolean).join(' - ') || 'Obra'
      return trechos(dias.filter((d) => d >= de && d <= ate)).map(([ini, fim]) => ({
        id: `exec-${l.id}-${ini}`,
        origem: 'execucao',
        linha: 'execucao',
        cronogramaId: null,
        usuarioId: null,
        dataInicio: ini,
        dataFim: fim,
        horaInicio: null,
        horaFim: null,
        titulo: l.cliente || l.proposta || 'Obra',
        subtitulo: ['Execução', l.proposta, carroDa[l.id]].filter(Boolean).join(' · '),
        cor: l.tipo === 'emergencia' ? 'vermelho' : 'verde',
        obraId: String(l.id),
        checkId: null,
        obraNome: nome,
        veiculo: carroDa[l.id] ?? null,
      }))
    })

    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    const prazosDeTarefas = prazos.rows.map((l) => ({
      id: `prazo-${l.obra_id}-${l.check_id}`,
      origem: 'prazo',
      linha: 'prazo',
      cronogramaId: null,
      usuarioId: null,
      dataInicio: l.prazo,
      dataFim: l.prazo,
      horaInicio: null,
      horaFim: null,
      titulo: l.titulo,
      subtitulo: [l.proposta, l.cliente].filter(Boolean).join(' - '),
      /* vencido em vermelho; o que ainda vem, em laranja */
      cor: l.prazo < hoje ? 'vermelho' : 'laranja',
      obraId: String(l.obra_id),
      checkId: String(l.check_id),
      obraNome: [l.proposta, l.cliente].filter(Boolean).join(' - ') || 'Obra',
    }))

    const pessoasDo = {}
    membros.rows.forEach((l) => (pessoasDo[l.cronograma_id] ??= []).push(String(l.usuario_id)))

    return res.json({
      cronogramas: cronogramas.rows.map((c) => ({
        id: String(c.id),
        nome: c.nome,
        ordem: c.ordem,
        membros: pessoasDo[c.id] ?? [],
      })),
      turnos: [
        ...turnos.rows.map(paraTurno),
        ...daObra.rows.map((l) => ({
          id: `obra-${l.obra_id}-${l.check_id}-${l.dia}-${l.usuario_id}`,
          origem: 'obra',
          /* sem cronograma: aparece na linha da pessoa em todo cronograma dela */
          cronogramaId: null,
          usuarioId: String(l.usuario_id),
          dataInicio: l.dia,
          dataFim: l.dia,
          horaInicio: l.hora,
          horaFim: null,
          titulo: l.cliente || l.proposta || 'Obra',
          subtitulo: [l.proposta, l.check_titulo].filter(Boolean).join(' · '),
          cor: COR_DA_OBRA,
          obraId: String(l.obra_id),
          checkId: String(l.check_id),
        })),
      ],
      anotacoes: Object.fromEntries(anotacoes.rows.map((l) => [l.dia, l.texto])),
      /* as tarefas das obras que nao tem pessoa: a secao "Obras" da grade */
      obras: [...execucao, ...prazosDeTarefas],
    })
  } catch (erro) {
    return falhou(erro, res, 'turnos/ler')
  }
})

/* ---------------- os turnos ---------------- */

/** Le e confere o turno do corpo. Devolve { erro, campo } ou { campos } (colunas). */
async function lerTurno(corpo) {
  const cronogramaId = texto(corpo?.cronogramaId)
  if (!idValido(cronogramaId)) return { erro: 'Escolha o cronograma.', campo: 'cronogramaId' }
  const { rows: cr } = await query('SELECT id FROM cronograma WHERE id = $1', [cronogramaId])
  if (!cr[0]) return { erro: 'Esse cronograma não existe mais.', campo: 'cronogramaId' }

  /* sem pessoa = turno aberto */
  const usuarioId = texto(corpo?.usuarioId) || null
  if (usuarioId) {
    if (!idValido(usuarioId)) return { erro: 'Pessoa inválida.', campo: 'usuarioId' }
    const { rows } = await query(
      'SELECT 1 FROM cronograma_membro WHERE cronograma_id = $1 AND usuario_id = $2',
      [cronogramaId, usuarioId],
    )
    if (!rows[0]) return { erro: 'Essa pessoa não está neste cronograma.', campo: 'usuarioId' }
  }

  const titulo = texto(corpo?.titulo)
  if (!titulo) return { erro: 'Dê um título ao turno.', campo: 'titulo' }
  if (titulo.length > TITULO_MAXIMO) return { erro: `O título passa de ${TITULO_MAXIMO} letras.`, campo: 'titulo' }
  const subtitulo = texto(corpo?.subtitulo)
  if (subtitulo.length > SUBTITULO_MAXIMO) {
    return { erro: `A observação passa de ${SUBTITULO_MAXIMO} letras.`, campo: 'subtitulo' }
  }

  const cor = texto(corpo?.cor) || CORES[0].id
  if (!CORES.some((c) => c.id === cor)) return { erro: 'Cor desconhecida.', campo: 'cor' }

  const dataInicio = texto(corpo?.dataInicio)
  const dataFim = texto(corpo?.dataFim) || dataInicio
  if (!dataValida(dataInicio)) return { erro: 'Informe a data de início.', campo: 'dataInicio' }
  if (!dataValida(dataFim)) return { erro: 'Informe a data de fim.', campo: 'dataFim' }
  if (dataFim < dataInicio) return { erro: 'O fim não pode ser antes do início.', campo: 'dataFim' }
  if (diasEntre(dataInicio, dataFim) >= DIAS_MAXIMOS) {
    return { erro: 'Um turno cobre no máximo um ano.', campo: 'dataFim' }
  }

  /* os dois horarios, ou nenhum (o dia inteiro) */
  const horaInicio = texto(corpo?.horaInicio) ? lerHora(corpo.horaInicio) : null
  const horaFim = texto(corpo?.horaFim) ? lerHora(corpo.horaFim) : null
  if (texto(corpo?.horaInicio) && !horaInicio) return { erro: 'Horário de início inválido.', campo: 'horaInicio' }
  if (texto(corpo?.horaFim) && !horaFim) return { erro: 'Horário de fim inválido.', campo: 'horaFim' }
  if (Boolean(horaInicio) !== Boolean(horaFim)) {
    return { erro: 'Informe o início e o fim — ou marque o dia inteiro.', campo: horaInicio ? 'horaFim' : 'horaInicio' }
  }

  /* a tarefa da obra, quando o turno veio de uma */
  const obraId = texto(corpo?.obraId) || null
  const checkId = texto(corpo?.checkId) || null
  if (obraId) {
    if (!idValido(obraId)) return { erro: 'Obra inválida.', campo: 'obraId' }
    const { rows } = await query('SELECT id FROM obra WHERE id = $1', [obraId])
    if (!rows[0]) return { erro: 'Essa obra não existe mais.', campo: 'obraId' }
  }
  if (checkId && (!obraId || !idValido(checkId))) return { erro: 'Tarefa inválida.', campo: 'checkId' }

  return {
    campos: {
      cronograma_id: cronogramaId,
      usuario_id: usuarioId,
      data_inicio: dataInicio,
      data_fim: dataFim,
      hora_inicio: horaInicio,
      hora_fim: horaFim,
      titulo,
      subtitulo: subtitulo || null,
      cor,
      obra_id: obraId,
      check_id: checkId,
    },
  }
}

async function descreverTurno(turnoId) {
  const { rows } = await query(
    `SELECT t.titulo, to_char(t.data_inicio, 'DD/MM/YYYY') AS de, to_char(t.data_fim, 'DD/MM/YYYY') AS ate,
            u.name AS pessoa, c.nome AS cronograma
       FROM turno t
       JOIN cronograma c  ON c.id = t.cronograma_id
       LEFT JOIN usuario u ON u.id = t.usuario_id
      WHERE t.id = $1`,
    [turnoId],
  )
  const l = rows[0]
  if (!l) return {}
  return {
    turno: l.titulo,
    pessoa: l.pessoa ?? 'turno aberto',
    cronograma: l.cronograma,
    dias: l.de === l.ate ? l.de : `${l.de} a ${l.ate}`,
  }
}

router.post('/', exigeSessao, exige(EDITAR), async (req, res) => {
  try {
    const lido = await lerTurno(req.body)
    if (lido.erro) return res.status(400).json(lido)
    /* nasce como rascunho: a equipe so ve depois do "Compartilhar" */
    const c = { ...lido.campos, criado_por: req.dono.sub, compartilhado: false }
    const colunas = Object.keys(c)
    const { rows } = await query(
      `INSERT INTO turno (${colunas.join(', ')})
       VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(c),
    )
    const { rows: novo } = await query(`${SELECT_TURNO} WHERE t.id = $1`, [rows[0].id])
    await registrarAtividade(req, {
      acao: 'turno.criado',
      categoria: 'turno',
      entidade: ['turno', rows[0].id],
      descricao: 'Turno criado',
      detalhes: await descreverTurno(rows[0].id),
    })
    return res.status(201).json({ turno: paraTurno(novo[0]) })
  } catch (erro) {
    return falhou(erro, res, 'turnos/criar')
  }
})

/* ---------------- copiar, colar e compartilhar ---------------- */

const COLUNAS_DA_COPIA = 'hora_inicio, hora_fim, titulo, subtitulo, cor, obra_id, check_id'

/**
 * Cola os turnos copiados num DIA de uma linha (pessoa, ou os turnos
 * abertos) de um cronograma. O primeiro deles cai no dia escolhido e os
 * outros guardam a distancia que tinham entre si; cada um mantem os
 * dias que cobria, o horario, o titulo e a cor. Os colados nascem como
 * rascunho.
 *
 * Os cards que vem das obras (ponto de encontro, execucao, prazo de
 * tarefa) nao sao linhas da tabela turno: chegam em `modelos`, com os
 * campos do card, e viram turnos feitos a mao (conferidos como no criar).
 *
 * { origem: [ids], modelos: [{ titulo, subtitulo, cor, dataInicio, dataFim,
 *   horaInicio, horaFim, obraId, checkId }], cronogramaId, usuarioId
 *   (vazio = aberto), dia }
 */
router.post('/colar', exigeSessao, exige(EDITAR), async (req, res) => {
  const origem = [...new Set((Array.isArray(req.body?.origem) ? req.body.origem : []).map(String))]
  const cronogramaId = texto(req.body?.cronogramaId)
  const usuarioId = texto(req.body?.usuarioId) || null
  const dia = texto(req.body?.dia)
  const modelos = Array.isArray(req.body?.modelos) ? req.body.modelos.filter((m) => m && typeof m === 'object') : []
  if (origem.length + modelos.length === 0 || origem.length + modelos.length > 100 || origem.some((id) => !idValido(id))) {
    return res.status(400).json({ erro: 'Copie um ou mais turnos antes de colar.' })
  }
  if (modelos.some((m) => !dataValida(texto(m.dataInicio)) || (texto(m.dataFim) && !dataValida(texto(m.dataFim))))) {
    return res.status(400).json({ erro: 'Um dos cards copiados está sem data.' })
  }
  if (!idValido(cronogramaId)) return res.status(400).json({ erro: 'Escolha onde colar.' })
  if (!dataValida(dia)) return res.status(400).json({ erro: 'Escolha o dia onde colar.' })
  try {
    if (usuarioId) {
      if (!idValido(usuarioId)) return res.status(400).json({ erro: 'Pessoa inválida.' })
      const { rows } = await query(
        'SELECT 1 FROM cronograma_membro WHERE cronograma_id = $1 AND usuario_id = $2',
        [cronogramaId, usuarioId],
      )
      if (!rows[0]) return res.status(400).json({ erro: 'Essa pessoa não está neste cronograma.' })
    }
    const { rows: fontes } = origem.length
      ? await query(
          `SELECT id, to_char(data_inicio, 'YYYY-MM-DD') AS inicio, to_char(data_fim, 'YYYY-MM-DD') AS fim
             FROM turno WHERE id = ANY($1::bigint[]) ORDER BY data_inicio, id`,
          [origem],
        )
      : { rows: [] }
    if (fontes.length + modelos.length === 0) return res.status(404).json({ erro: 'Os turnos copiados não existem mais.' })

    /* o primeiro de todos (turno ou card da obra) cai no dia escolhido */
    const primeiro = [...fontes.map((l) => l.inicio), ...modelos.map((m) => texto(m.dataInicio))].sort()[0]
    const deslocar = diasEntre(primeiro, dia)

    /* os cards das obras passam pela mesma conferencia do criar */
    const lidos = []
    for (const m of modelos) {
      const inicio = texto(m.dataInicio)
      const lido = await lerTurno({
        ...m,
        cronogramaId,
        usuarioId,
        dataInicio: somarDias(inicio, deslocar),
        dataFim: somarDias(texto(m.dataFim) || inicio, deslocar),
      })
      if (lido.erro) return res.status(400).json(lido)
      lidos.push(lido.campos)
    }

    const novos = await emTransacao(async (db) => {
      const ids = []
      for (const fonte of fontes) {
        const { rows } = await db.query(
          `INSERT INTO turno (cronograma_id, usuario_id, data_inicio, data_fim, ${COLUNAS_DA_COPIA},
                              criado_por, compartilhado)
           SELECT $2, $3, data_inicio + $4::int, data_fim + $4::int, ${COLUNAS_DA_COPIA}, $5, false
             FROM turno WHERE id = $1
           RETURNING id`,
          [fonte.id, cronogramaId, usuarioId, deslocar, req.dono.sub],
        )
        ids.push(rows[0].id)
      }
      for (const campos of lidos) {
        const c = { ...campos, criado_por: req.dono.sub, compartilhado: false }
        const colunas = Object.keys(c)
        const { rows } = await db.query(
          `INSERT INTO turno (${colunas.join(', ')})
           VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')})
           RETURNING id`,
          Object.values(c),
        )
        ids.push(rows[0].id)
      }
      return ids
    })
    await registrarAtividade(req, {
      acao: 'turno.colado',
      categoria: 'turno',
      entidade: ['cronograma', cronogramaId],
      descricao: novos.length === 1 ? 'Turno colado' : 'Turnos colados',
      detalhes: { turnos: novos.length, dia: dia.split('-').reverse().join('/') },
    })
    /* os ids voltam para a tela deixar os colados escolhidos (prontos para o "Compartilhar") */
    return res.status(201).json({ colados: novos.length, ids: novos.map(String) })
  } catch (erro) {
    return falhou(erro, res, 'turnos/colar')
  }
})

/**
 * O "Copiar agenda" do Teams: os turnos que comecam no periodo ANTERIOR
 * (do mesmo tamanho do que esta na tela) vem para este, os mesmos dias
 * da semana, como rascunho. Os das obras nao entram (eles vem das obras).
 * Copiar de novo nao duplica: o turno que ja tem a sua copia igual no
 * periodo (mesma linha, dias, horario e titulo) fica de fora.
 *
 * { de, ate } — o periodo que esta na tela.
 */
router.post('/copiar-agenda', exigeSessao, exige(EDITAR), async (req, res) => {
  const de = texto(req.body?.de)
  const ate = texto(req.body?.ate)
  if (!dataValida(de) || !dataValida(ate) || ate < de || diasEntre(de, ate) > PERIODO_MAXIMO) {
    return res.status(400).json({ erro: 'Período inválido.' })
  }
  const dias = diasEntre(de, ate) + 1
  try {
    const { rows } = await query(
      `INSERT INTO turno (cronograma_id, usuario_id, data_inicio, data_fim, ${COLUNAS_DA_COPIA},
                          criado_por, compartilhado)
       SELECT cronograma_id, usuario_id, data_inicio + $3::int, data_fim + $3::int, ${COLUNAS_DA_COPIA}, $4, false
         FROM turno o
        WHERE o.data_inicio BETWEEN ($1::date - $3::int) AND ($2::date - $3::int)
          AND NOT EXISTS (
                SELECT 1 FROM turno c
                 WHERE c.cronograma_id = o.cronograma_id
                   AND c.usuario_id IS NOT DISTINCT FROM o.usuario_id
                   AND c.data_inicio = o.data_inicio + $3::int
                   AND c.data_fim = o.data_fim + $3::int
                   AND c.hora_inicio IS NOT DISTINCT FROM o.hora_inicio
                   AND c.hora_fim IS NOT DISTINCT FROM o.hora_fim
                   AND c.titulo = o.titulo)
       RETURNING id`,
      [de, ate, dias, req.dono.sub],
    )
    await registrarAtividade(req, {
      acao: 'turno.agenda_copiada',
      categoria: 'turno',
      entidade: ['turno', 'agenda'],
      descricao: 'Agenda copiada do período anterior',
      detalhes: { turnos: rows.length, periodo: `${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}` },
    })
    return res.status(201).json({ copiados: rows.length, ids: rows.map((l) => String(l.id)) })
  } catch (erro) {
    return falhou(erro, res, 'turnos/copiar-agenda')
  }
})

/**
 * "Compartilhar com a equipe": { ids: [...] } compartilha os escolhidos;
 * sem ids, { de, ate } compartilha todos os rascunhos do periodo.
 */
router.post('/compartilhar', exigeSessao, exige(EDITAR), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(String))] : null
  const de = texto(req.body?.de)
  const ate = texto(req.body?.ate)
  if (ids && (ids.length === 0 || ids.some((id) => !idValido(id)))) {
    return res.status(400).json({ erro: 'Escolha os turnos para compartilhar.' })
  }
  if (!ids && (!dataValida(de) || !dataValida(ate) || ate < de)) {
    return res.status(400).json({ erro: 'Período inválido.' })
  }
  try {
    const { rowCount } = ids
      ? await query(
          `UPDATE turno SET compartilhado = true, compartilhado_em = now(), compartilhado_por = $2
            WHERE id = ANY($1::bigint[]) AND NOT compartilhado`,
          [ids, req.dono.sub],
        )
      : await query(
          `UPDATE turno SET compartilhado = true, compartilhado_em = now(), compartilhado_por = $3
            WHERE NOT compartilhado AND data_inicio <= $2 AND data_fim >= $1`,
          [de, ate, req.dono.sub],
        )
    if (rowCount) {
      await registrarAtividade(req, {
        acao: 'turno.compartilhado',
        categoria: 'turno',
        entidade: ['turno', 'equipe'],
        descricao: rowCount === 1 ? 'Turno compartilhado com a equipe' : 'Turnos compartilhados com a equipe',
        detalhes: { turnos: rowCount },
      })
    }
    return res.json({ compartilhados: rowCount })
  } catch (erro) {
    return falhou(erro, res, 'turnos/compartilhar')
  }
})

/* ---------------- anotacoes do dia ---------------- */

router.put('/anotacoes/:dia', exigeSessao, exige(EDITAR), async (req, res) => {
  const dia = req.params.dia
  if (!dataValida(dia)) return res.status(400).json({ erro: 'Data inválida.' })
  const valor = texto(req.body?.texto)
  if (valor.length > ANOTACAO_MAXIMA) {
    return res.status(400).json({ erro: `A anotação passa de ${ANOTACAO_MAXIMA} letras.` })
  }
  try {
    if (!valor) {
      await query('DELETE FROM turno_anotacao WHERE dia = $1', [dia])
    } else {
      await query(
        `INSERT INTO turno_anotacao (dia, texto, atualizado_por) VALUES ($1, $2, $3)
         ON CONFLICT (dia) DO UPDATE
            SET texto = EXCLUDED.texto, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()`,
        [dia, valor, req.dono.sub],
      )
    }
    return res.json({ dia, texto: valor })
  } catch (erro) {
    return falhou(erro, res, 'turnos/anotacao')
  }
})

/* ---------------- cronogramas ---------------- */

/** As pessoas da lista: todas ativas? Devolve os ids limpos, ou null. */
async function lerPessoas(bruto) {
  const ids = [...new Set((Array.isArray(bruto) ? bruto : []).map(String))]
  if (ids.some((id) => !idValido(id))) return null
  if (ids.length === 0) return ids
  const { rows } = await query('SELECT id FROM usuario WHERE id = ANY($1::bigint[]) AND ativo', [ids])
  return rows.length === ids.length ? ids : null
}

router.post('/cronogramas', exigeSessao, exige(EDITAR), async (req, res) => {
  const nome = texto(req.body?.nome).slice(0, 80)
  if (!nome) return res.status(400).json({ erro: 'Dê um nome ao cronograma.', campo: 'nome' })
  const pessoas = await lerPessoas(req.body?.membros)
  if (!pessoas) return res.status(400).json({ erro: 'Uma das pessoas não está mais na equipe.', campo: 'membros' })
  try {
    const id = await emTransacao(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO cronograma (nome, ordem)
         VALUES ($1, coalesce((SELECT max(ordem) FROM cronograma), -1) + 1) RETURNING id`,
        [nome],
      )
      if (pessoas.length) {
        await db.query(
          'INSERT INTO cronograma_membro (cronograma_id, usuario_id) SELECT $1, unnest($2::bigint[])',
          [rows[0].id, pessoas],
        )
      }
      return rows[0].id
    })
    await registrarAtividade(req, {
      acao: 'cronograma.criado',
      categoria: 'turno',
      entidade: ['cronograma', id],
      descricao: 'Cronograma criado',
      detalhes: { cronograma: nome, pessoas: pessoas.length },
    })
    return res.status(201).json({ cronograma: { id: String(id), nome, membros: pessoas } })
  } catch (erro) {
    return falhou(erro, res, 'turnos/cronograma-criar')
  }
})

router.put('/cronogramas/:id', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Cronograma inválido.' })
  const nome = req.body?.nome === undefined ? null : texto(req.body.nome).slice(0, 80)
  if (nome === '') return res.status(400).json({ erro: 'Dê um nome ao cronograma.', campo: 'nome' })
  const pessoas = req.body?.membros === undefined ? undefined : await lerPessoas(req.body.membros)
  if (pessoas === null) {
    return res.status(400).json({ erro: 'Uma das pessoas não está mais na equipe.', campo: 'membros' })
  }
  try {
    const achou = await emTransacao(async (db) => {
      const { rows } = await db.query('SELECT nome FROM cronograma WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!rows[0]) return null
      if (nome) await db.query('UPDATE cronograma SET nome = $1 WHERE id = $2', [nome, req.params.id])
      if (pessoas) {
        await db.query(
          'DELETE FROM cronograma_membro WHERE cronograma_id = $1 AND NOT (usuario_id = ANY($2::bigint[]))',
          [req.params.id, pessoas],
        )
        if (pessoas.length) {
          await db.query(
            `INSERT INTO cronograma_membro (cronograma_id, usuario_id)
             SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING`,
            [req.params.id, pessoas],
          )
        }
        /* quem saiu do cronograma leva junto os turnos que tinha nele */
        await db.query(
          'DELETE FROM turno WHERE cronograma_id = $1 AND usuario_id IS NOT NULL AND NOT (usuario_id = ANY($2::bigint[]))',
          [req.params.id, pessoas],
        )
      }
      return rows[0].nome
    })
    if (achou === null) return res.status(404).json({ erro: 'Cronograma não encontrado.' })
    await registrarAtividade(req, {
      acao: 'cronograma.editado',
      categoria: 'turno',
      entidade: ['cronograma', req.params.id],
      descricao: 'Cronograma editado',
      detalhes: { cronograma: nome || achou, pessoas: pessoas?.length },
    })
    return res.json({ ok: true })
  } catch (erro) {
    return falhou(erro, res, 'turnos/cronograma-editar')
  }
})

router.delete('/cronogramas/:id', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Cronograma inválido.' })
  try {
    const { rows } = await query('DELETE FROM cronograma WHERE id = $1 RETURNING nome', [req.params.id])
    if (!rows[0]) return res.status(404).json({ erro: 'Cronograma não encontrado.' })
    await registrarAtividade(req, {
      acao: 'cronograma.excluido',
      categoria: 'turno',
      entidade: ['cronograma', req.params.id],
      descricao: 'Cronograma excluído',
      detalhes: { cronograma: rows[0].nome },
    })
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'turnos/cronograma-apagar')
  }
})

/* ---------------- editar e apagar um turno (depois das rotas fixas) ---------------- */

router.put('/:id', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Turno inválido.' })
  try {
    const lido = await lerTurno(req.body)
    if (lido.erro) return res.status(400).json(lido)
    const c = lido.campos
    const colunas = Object.keys(c)
    const { rowCount } = await query(
      `UPDATE turno SET ${colunas.map((col, i) => `${col} = $${i + 1}`).join(', ')}, atualizado_em = now()
        WHERE id = $${colunas.length + 1}`,
      [...Object.values(c), req.params.id],
    )
    if (!rowCount) return res.status(404).json({ erro: 'Turno não encontrado.' })
    const { rows } = await query(`${SELECT_TURNO} WHERE t.id = $1`, [req.params.id])
    await registrarAtividade(req, {
      acao: 'turno.editado',
      categoria: 'turno',
      entidade: ['turno', req.params.id],
      descricao: 'Turno editado',
      detalhes: await descreverTurno(req.params.id),
    })
    return res.json({ turno: paraTurno(rows[0]) })
  } catch (erro) {
    return falhou(erro, res, 'turnos/editar')
  }
})

router.delete('/:id', exigeSessao, exige(EDITAR), async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Turno inválido.' })
  try {
    const detalhes = await descreverTurno(req.params.id)
    const { rowCount } = await query('DELETE FROM turno WHERE id = $1', [req.params.id])
    if (!rowCount) return res.status(404).json({ erro: 'Turno não encontrado.' })
    await registrarAtividade(req, {
      acao: 'turno.excluido',
      categoria: 'turno',
      entidade: ['turno', req.params.id],
      descricao: 'Turno excluído',
      detalhes,
    })
    return res.status(204).end()
  } catch (erro) {
    return falhou(erro, res, 'turnos/apagar')
  }
})

export default router
