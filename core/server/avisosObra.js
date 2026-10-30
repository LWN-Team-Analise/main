/**
 * Os avisos da obra no Teams (server/teams.js).
 *
 * Quem recebe e quem ESTA na obra: quem marcou check nela e os incluidos
 * em Membros que aceitaram. A excecao e a propria inclusao, que vai para
 * a pessoa incluida (ainda pendente).
 *
 *   inclusao         "Fulano (cargo) incluiu voce na obra X; aceite
 *                    para fazer parte";
 *   etapa concluida  "A 1a Etapa foi concluida agora pela equipe
 *                    Comercial; entramos na 2a Etapa e as suas tarefas
 *                    sao...", e os parabens a quem terminou todas as
 *                    etapas do setor dele;
 *   obra concluida   os parabens a todos;
 *   chat             "chegou uma mensagem no chat da obra" (sem o texto);
 *   avaliacao        a nota geral da obra e a nova nota de cada um.
 *
 * Nada aqui derruba quem chamou: o aviso que falhar fica no log.
 */
import { query } from './db.js'
import { descreverObra, registrarAtividade } from './atividade.js'
import { logger } from './logger.js'
import { linkDoSite, mandarNoTeams } from './teams.js'

/* a etapa fechada ha mais tempo que isto nao e anunciada: e o que impede
   o primeiro check depois da implantacao de anunciar etapas antigas */
const JANELA_DA_ETAPA = 15 * 60 * 1000

/** "Agener Uniao - LWN-888-01": a empresa primeiro, como no resto do sistema. */
async function nomeDaObra(obraId) {
  const { obra, cliente } = await descreverObra(obraId)
  return [cliente, obra].filter(Boolean).join(' - ') || 'obra'
}

/** Os membros: quem marcou check e os parciais que ACEITARAM. */
async function membrosDaObra(obraId) {
  const { rows } = await query(
    `SELECT usuario_id FROM obra_membro WHERE obra_id = $1
      UNION
     SELECT usuario_id FROM obra_membro_parcial WHERE obra_id = $1 AND status = 'aceito'`,
    [obraId],
  )
  return rows.map((l) => String(l.usuario_id))
}

const linkDaObra = (obraId) => linkDoSite(`/core/app/obras/${obraId}`)

/** 8.5 -> "8,5" */
const nota = (valor) =>
  valor === null || valor === undefined ? '—' : Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

/* ------------------------------------------------------------
   Inclusao
   ------------------------------------------------------------ */

/** A pessoa incluida (pendente) recebe quem a incluiu, com o cargo, e o pedido de aceitar. */
export async function avisarInclusao({ obraId, usuarioId, quemId }) {
  try {
    const { rows } = await query(
      `SELECT u.name, coalesce(nullif(t.nome, ''), nullif(u.cargo_titulo, ''), c.nome) AS cargo
         FROM usuario u
         LEFT JOIN cargo_titulo t ON t.id = u.cargo_titulo_id
         LEFT JOIN cargo c        ON c.id = u.cargo_id
        WHERE u.id = $1`,
      [quemId],
    )
    const quem = rows[0] ? `${rows[0].name}${rows[0].cargo ? ` (${rows[0].cargo})` : ''}` : 'Alguém da equipe'
    const obra = await nomeDaObra(obraId)
    await mandarNoTeams([usuarioId], {
      titulo: 'Você foi incluído em uma obra',
      linhas: [
        `${quem} incluiu você na obra **${obra}**.`,
        'A inclusão está pendente: aceite para fazer parte da obra e marcar os checks do seu setor.',
      ],
      link: linkDaObra(obraId),
      rotuloLink: 'Abrir a obra',
    })
  } catch (erro) {
    logger.error('avisos/inclusao', erro.message)
  }
}

/* ------------------------------------------------------------
   Etapa concluida
   ------------------------------------------------------------ */

/*
 * O roteiro DESTA obra, com o que ja foi feito: as mesmas regras da
 * conclusao da obra (routes/dados.js) — a janela de vigencia, os checks
 * proprios, o "Material de gases" que so conta com ensaio de gases e a
 * "Retirada do carro" que so conta com carro reservado.
 */
async function roteiroDaObra(obraId) {
  const { rows } = await query(
    `SELECT et.id AS etapa_id, et.ordem AS etapa_ordem, et.nome AS etapa_nome,
            kd.id AS card_id, kd.titulo AS card_titulo,
            ec.id AS check_id, ec.titulo AS check_titulo,
            m.feito_em, m.feito_por,
            coalesce((SELECT array_agg(c.chave ORDER BY kc.ordem)
                        FROM etapa_check_cargo kc JOIN cargo c ON c.id = kc.cargo_id
                       WHERE kc.check_id = ec.id), '{}') AS setores_check,
            coalesce((SELECT array_agg(c.chave ORDER BY cc.ordem)
                        FROM etapa_card_cargo cc JOIN cargo c ON c.id = cc.cargo_id
                       WHERE cc.card_id = kd.id), '{}') AS setores_card,
            ((ec.tipo <> 'material_gases'
               OR EXISTS (SELECT 1 FROM obra_ensaio oe JOIN ensaio en ON en.id = oe.ensaio_id
                           WHERE oe.obra_id = o.id AND en.classificacao = 'gases'))
             AND (ec.tipo <> 'retirada_carro'
               OR EXISTS (SELECT 1 FROM obra_reserva_veiculo rv
                           WHERE rv.obra_id = o.id AND rv.veiculo_id IS NOT NULL))) AS conta
       FROM obra o
       JOIN etapa_check ec ON CASE WHEN o.checks_proprios
                                   THEN ec.obra_id = o.id AND ec.vigente_ate IS NULL
                                   ELSE ec.obra_id IS NULL
                                        AND ec.vigente_de <= o.criado_em
                                        AND (ec.vigente_ate IS NULL OR o.criado_em < ec.vigente_ate)
                              END
       JOIN etapa_card kd ON kd.id = ec.card_id
                         AND kd.vigente_de <= o.criado_em
                         AND (kd.vigente_ate IS NULL OR o.criado_em < kd.vigente_ate)
       JOIN etapa et      ON et.id = kd.etapa_id
                         AND et.vigente_de <= o.criado_em
                         AND (et.vigente_ate IS NULL OR o.criado_em < et.vigente_ate)
       LEFT JOIN obra_check m ON m.obra_id = o.id AND m.check_id = ec.id
      WHERE o.id = $1 AND o.concluida_em IS NULL
      ORDER BY et.ordem, kd.ordem, ec.ordem`,
    [obraId],
  )

  const etapas = []
  const porId = new Map()
  rows.forEach((l) => {
    if (!porId.has(l.etapa_id)) {
      const etapa = { id: String(l.etapa_id), ordem: l.etapa_ordem, nome: l.etapa_nome, cards: new Map() }
      porId.set(l.etapa_id, etapa)
      etapas.push(etapa)
    }
    const etapa = porId.get(l.etapa_id)
    if (!etapa.cards.has(l.card_id)) {
      etapa.cards.set(l.card_id, { titulo: l.card_titulo, setores: l.setores_card, checks: [] })
    }
    etapa.cards.get(l.card_id).checks.push({
      titulo: l.check_titulo,
      /* o dono proprio do check manda; sem ele, o do card */
      setores: l.setores_check.length > 0 ? l.setores_check : l.setores_card,
      conta: l.conta === true,
      feitoEm: l.feito_em ? new Date(l.feito_em).getTime() : null,
      feitoPor: l.feito_por ? String(l.feito_por) : null,
    })
  })

  return etapas.map((e) => {
    const cards = [...e.cards.values()]
    const contados = cards.flatMap((c) => c.checks).filter((k) => k.conta)
    return {
      ...e,
      cards,
      contados,
      completa: contados.length > 0 && contados.every((k) => k.feitoEm),
      setores: new Set(contados.flatMap((k) => k.setores)),
    }
  })
}

/* a etapa ja foi anunciada? O historico guarda o anuncio */
async function jaAnunciada(obraId, etapa) {
  const { rows } = await query(
    `SELECT 1 FROM atividade
      WHERE acao = 'obra.etapa_concluida' AND entidade_tipo = 'obra' AND entidade_id = $1
        AND detalhes ->> 'etapa' = $2
      LIMIT 1`,
    [String(obraId), etapa.nome],
  )
  return rows.length > 0
}

/** "Comercial", "Qualidade + Excelencia": os nomes dos setores. */
async function nomesDosSetores() {
  const { rows } = await query('SELECT chave, nome FROM cargo')
  return Object.fromEntries(rows.map((l) => [l.chave, l.nome]))
}

/**
 * Depois de marcar check: a etapa que FECHOU agora (todos os checks que
 * contam feitos, o ultimo ha menos de 15 minutos) e ainda nao foi
 * anunciada vai para os membros da obra — cada um com as tarefas DELE na
 * proxima etapa, e os parabens a quem terminou todas as etapas do setor.
 * O anuncio fica no historico ("1° Etapa concluida"), e e ele que impede
 * anunciar de novo quem desmarca e marca outra vez.
 *
 * Basta o id da obra: serve para qualquer caminho que marca check (o
 * clique, o prazo, os ensaios, a reserva, o horario).
 */
export async function avisarEtapasConcluidas(obraId) {
  try {
    const etapas = await roteiroDaObra(obraId)
    const agora = Date.now()
    const fechadas = []
    for (const etapa of etapas) {
      if (!etapa.completa) continue
      const ultimo = etapa.contados.reduce((a, b) => (b.feitoEm > a.feitoEm ? b : a))
      if (agora - ultimo.feitoEm > JANELA_DA_ETAPA) continue
      if (await jaAnunciada(obraId, etapa)) continue
      fechadas.push({ etapa, ultimo })
    }
    if (fechadas.length === 0) return

    const [obra, sobre, membros, setores] = await Promise.all([
      nomeDaObra(obraId),
      descreverObra(obraId),
      membrosDaObra(obraId),
      nomesDosSetores(),
    ])
    const nomeDoSetor = (chave) => setores[chave] ?? chave
    const nomeDoCard = (card) => card.titulo || card.setores.map(nomeDoSetor).join(' + ') || 'Card'

    for (const { etapa, ultimo } of fechadas) {
      const equipe = ultimo.setores.map(nomeDoSetor).join(' + ') || 'equipe'
      /* o anuncio antes do envio: dois cliques ao mesmo tempo nao anunciam duas vezes */
      await registrarAtividade(ultimo.feitoPor, {
        acao: 'obra.etapa_concluida',
        categoria: 'obra',
        entidade: ['obra', obraId],
        descricao: `${etapa.nome} concluída`,
        detalhes: { ...sobre, etapa: etapa.nome, equipe },
      })

      const depois = etapas.filter((e) => e.ordem > etapa.ordem && e.contados.length > 0)
      const proxima = depois.find((e) => !e.completa) ?? null

      await mandarNoTeams(membros, (pessoa) => {
        const linhas = [`A **${etapa.nome}** da obra **${obra}** foi concluída agora pela equipe ${equipe}.`]
        if (proxima) {
          linhas.push(`Entramos na **${proxima.nome}**.`)
          /* as tarefas DELA na proxima: os checks do setor dela, card a card */
          const tarefas = proxima.cards
            .map((card) => ({
              card,
              checks: card.checks.filter((k) => k.conta && !k.feitoEm && k.setores.includes(pessoa.setor)),
            }))
            .filter((t) => t.checks.length > 0)
            .map((t) => `- ${nomeDoCard(t.card)}: ${t.checks.map((k) => k.titulo).join(', ')}`)
          if (tarefas.length > 0) linhas.push(`Suas tarefas:\n${tarefas.join('\n')}`)
        } else if (depois.every((e) => e.completa)) {
          linhas.push('Todas as etapas da obra foram concluídas.')
        }
        /* os parabens: o setor dela trabalhou nesta etapa e todas as etapas
           dele na obra estao feitas (o tecnico que termina na 3a) */
        const doSetor = etapas.filter((e) => e.setores.has(pessoa.setor))
        if (etapa.setores.has(pessoa.setor) && doSetor.every((e) => e.completa)) {
          linhas.push('**Parabéns!** Você concluiu todas as etapas em que estava atribuído nesta obra.')
        }
        return {
          titulo: `${etapa.nome} concluída`,
          linhas,
          link: linkDaObra(obraId),
          rotuloLink: 'Abrir a obra',
        }
      })
    }
  } catch (erro) {
    logger.error('avisos/etapa', erro.message)
  }
}

/* ------------------------------------------------------------
   Obra concluida, chat e avaliacao
   ------------------------------------------------------------ */

/** A obra concluida: os parabens a quem fez parte dela. */
export async function avisarObraConcluida(obraId) {
  try {
    const [obra, membros] = await Promise.all([nomeDaObra(obraId), membrosDaObra(obraId)])
    await mandarNoTeams(membros, {
      titulo: 'Obra concluída',
      linhas: [`**Parabéns!** A obra **${obra}** foi concluída. Obrigado pela participação.`],
      link: linkDoSite(`/core/app/concluidas/${obraId}`),
      rotuloLink: 'Ver a obra',
    })
  } catch (erro) {
    logger.error('avisos/conclusao', erro.message)
  }
}

/** Mensagem nova no chat da obra: so o aviso, sem o texto, para os membros (menos quem escreveu). */
export async function avisarChat(obraId, autorId) {
  try {
    const [obra, membros] = await Promise.all([nomeDaObra(obraId), membrosDaObra(obraId)])
    await mandarNoTeams(
      membros,
      {
        titulo: 'Nova mensagem no chat da obra',
        linhas: [`Chegou uma nova mensagem no chat da obra **${obra}**.`],
        link: linkDaObra(obraId),
        rotuloLink: 'Abrir a obra',
      },
      { exceto: autorId },
    )
  } catch (erro) {
    logger.error('avisos/chat', erro.message)
  }
}

/** A obra avaliada: a nota geral dela e a nova nota de cada membro. */
export async function avisarAvaliacao(obraId) {
  try {
    const [obra, membros, geral] = await Promise.all([
      nomeDaObra(obraId),
      membrosDaObra(obraId),
      query('SELECT nota FROM obra_avaliacao WHERE obra_id = $1', [obraId]),
    ])
    if (membros.length === 0) return
    const { rows } = await query('SELECT usuario_id, media FROM usuario_media WHERE usuario_id = ANY($1::bigint[])', [
      membros,
    ])
    const media = Object.fromEntries(rows.map((l) => [String(l.usuario_id), l.media]))
    await mandarNoTeams(membros, (pessoa) => ({
      titulo: 'Obra avaliada',
      linhas: [
        `A obra **${obra}** foi avaliada.`,
        `Nota geral da obra: **${nota(geral.rows[0]?.nota)}**`,
        `Sua nova nota: **${nota(media[pessoa.id])}**`,
      ],
      link: linkDaObra(obraId),
      rotuloLink: 'Abrir a obra',
    }))
  } catch (erro) {
    logger.error('avisos/avaliacao', erro.message)
  }
}
