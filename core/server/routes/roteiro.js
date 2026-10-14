import { Router } from 'express'
import { query } from '../db.js'
import { exige, exigeSessao, tratar } from '../sessao.js'
import { descreverObra, registrarAtividade } from '../atividade.js'

const router = Router()

/**
 * Historico de uma mudanca no roteiro. A obra entra quando a mudanca
 * foi feita de dentro de uma (e o `obraId` que viaja na chamada).
 */
async function registrarRoteiro(req, acao, descricao, detalhes) {
  const obraId = obraDaChamada(req)
  await registrarAtividade(req, {
    acao,
    categoria: 'roteiro',
    entidade: obraId ? ['obra', obraId] : ['roteiro', null],
    descricao,
    detalhes: { ...(obraId ? await descreverObra(obraId) : {}), ...detalhes },
  })
}

/** Os nomes que o historico escreve: a etapa e o card de um check/card. */
async function nomesDoCard(cardId) {
  const { rows } = await query(
    `SELECT kd.titulo, et.nome AS etapa,
            (SELECT string_agg(c.nome, ' + ' ORDER BY cc.ordem)
               FROM etapa_card_cargo cc JOIN cargo c ON c.id = cc.cargo_id
              WHERE cc.card_id = kd.id) AS setores
       FROM etapa_card kd JOIN etapa et ON et.id = kd.etapa_id
      WHERE kd.id = $1`,
    [cardId],
  )
  const l = rows[0]
  return l ? { etapa: l.etapa, card: l.titulo || l.setores || null } : {}
}

/* ============================================================
   O roteiro anda para a FRENTE

   Regra da casa: mexer no roteiro dentro de uma obra vale para
   ELA e para as proximas — nunca para as que ja passaram. Uma
   obra fechada em marco nao pode ganhar um check novo em maio e
   voltar a aparecer como pendente.

   Como isso funciona: cada peca (etapa, card, check) tem uma
   JANELA DE VIGENCIA.

     vigente_de  = quando a peca passou a valer
     vigente_ate = quando ela saiu (NULL = ainda vale)

   Uma obra criada em X enxerga a peca quando
       vigente_de <= X  e  (vigente_ate IS NULL OU X < vigente_ate)

   Criar dentro da obra X carimba vigente_de com a data de X;
   excluir carimba vigente_ate com a mesma data. Por isso o
   `obraId` viaja junto em toda alteracao: e ele que diz a
   partir de quando a mudanca conta.

   Sem obraId (alteracao feita fora de uma obra), o carimbo e
   `now()`: vale so para as obras criadas dali em diante.
   ============================================================ */

/** O momento que carimba a alteracao: a criacao da obra, ou agora. */
async function momento(obraId) {
  if (!obraId) return new Date()
  const { rows } = await query('SELECT criado_em FROM obra WHERE id = $1', [obraId])
  return rows[0]?.criado_em ?? new Date()
}

/** De onde vem o obraId: corpo (POST/PATCH) ou query (DELETE). */
const obraDaChamada = (req) => req.body?.obraId ?? req.query?.obraId ?? null

/* ------------------------------------------------------------
   Leitura — o roteiro inteiro em uma resposta so.

   Vem em arvore (etapa > cards > checks) porque e assim que a
   tela desenha; montar isso no front custaria tres varreduras.

   Vem TUDO, inclusive o que ja saiu de circulacao: e a tela que
   filtra pela data de cada obra (src/domain/obras.js). Assim uma
   obra antiga continua desenhando o roteiro que ela teve.
   ------------------------------------------------------------ */

/** Tenta a leitura nova; sem as colunas novas (42703), cai na de antes. */
function comReserva(nova, antiga) {
  return query(nova).catch((erro) => {
    if (erro.code !== '42703') throw erro
    return query(antiga)
  })
}

export async function lerRoteiro() {
  /* As colunas novas (fixa/papel da etapa, informacoes do card,
     sim_nao/informacoes/tipo do check) vem das atualizacoes 13 e 14.
     Num banco sem elas as colunas nao existem, e o roteiro inteiro nao
     pode parar por isso: cada leitura cai na de antes, e as pecas vem
     como sempre vieram (etapa editavel, card e check comuns). */
  const [etapas, cards, cargos, checks, cargosCheck, etiquetas] = await Promise.all([
    comReserva(
      `SELECT id, ordem, nome, descricao, fixa, papel, vigente_de, vigente_ate
         FROM etapa ORDER BY ordem, id`,
      'SELECT id, ordem, nome, descricao, vigente_de, vigente_ate FROM etapa ORDER BY ordem, id',
    ),
    comReserva(
      `SELECT id, etapa_id, ordem, titulo, informacoes, vigente_de, vigente_ate
         FROM etapa_card ORDER BY ordem, id`,
      `SELECT id, etapa_id, ordem, titulo, vigente_de, vigente_ate
         FROM etapa_card ORDER BY ordem, id`,
    ),
    query(`SELECT cc.card_id, c.chave, cc.ordem
             FROM etapa_card_cargo cc JOIN cargo c ON c.id = cc.cargo_id
            ORDER BY cc.ordem`),
    /* tres degraus: com os checks proprios das obras (18), so com o
       tipo do check (13/14), ou como sempre foi */
    query(
      `SELECT id, card_id, ordem, titulo, sim_nao, informacoes, tipo, obra_id, origem_id,
              vigente_de, vigente_ate
         FROM etapa_check ORDER BY ordem, id`,
    ).catch((erro) => {
      if (erro.code !== '42703') throw erro
      return comReserva(
        `SELECT id, card_id, ordem, titulo, sim_nao, informacoes, tipo, vigente_de, vigente_ate
           FROM etapa_check ORDER BY ordem, id`,
        `SELECT id, card_id, ordem, titulo, vigente_de, vigente_ate
           FROM etapa_check ORDER BY ordem, id`,
      )
    }),
    query(`SELECT kc.check_id, c.chave, kc.ordem
             FROM etapa_check_cargo kc JOIN cargo c ON c.id = kc.cargo_id
            ORDER BY kc.ordem`),
    /* as etiquetas do card. Num banco sem a atualizacao 7 a tabela nao
       existe, e o roteiro inteiro nao pode parar por causa disso: o
       catch devolve lista vazia e os cards vem sem etiqueta */
    query(`SELECT ce.card_id, e.id, e.nome, e.cor
             FROM card_etiqueta ce JOIN etiqueta_card e ON e.id = ce.etiqueta_id
            ORDER BY lower(e.nome)`).catch((erro) => {
      if (erro.code === '42P01') return { rows: [] }
      throw erro
    }),
  ])

  const etiquetasDoCard = {}
  etiquetas.rows.forEach((l) => {
    const lista = etiquetasDoCard[l.card_id] ?? []
    lista.push({ id: String(l.id), nome: l.nome, cor: l.cor })
    etiquetasDoCard[l.card_id] = lista
  })

  const cargosDoCard = {}
  cargos.rows.forEach((l) => {
    const lista = cargosDoCard[l.card_id] ?? []
    lista.push(l.chave)
    cargosDoCard[l.card_id] = lista
  })

  /* cargos: [] = o check segue o card. Com nomes aqui, esta lista manda. */
  const cargosDoCheck = {}
  cargosCheck.rows.forEach((l) => {
    const lista = cargosDoCheck[l.check_id] ?? []
    lista.push(l.chave)
    cargosDoCheck[l.check_id] = lista
  })

  const checksDoCard = {}
  checks.rows.forEach((l) => {
    const lista = checksDoCard[l.card_id] ?? []
    lista.push({
      id: String(l.id),
      ordem: l.ordem,
      titulo: l.titulo,
      cargos: cargosDoCheck[l.id] ?? [],
      /* check de pergunta: marcar pede Sim ou Nao. E do CHECK, nao do
         card — no mesmo card um pede resposta e o do lado nao */
      simNao: l.sim_nao ?? false,
      /* o que o check pede — a dica que aparece ao passar o mouse */
      informacoes: l.informacoes ?? '',
      /* 'comum', ou um do sistema: 'planejamento_ensaios' e
         'execucao_ensaios' (atualizacao 14), 'material_gases' (17),
         'prazo_execucao' (19) */
      tipo: l.tipo ?? 'comum',
      /* check PROPRIO de uma obra (atualizacao 18): so ela o enxerga.
         null = check do roteiro */
      obraId: l.obra_id ? String(l.obra_id) : null,
      origemId: l.origem_id ? String(l.origem_id) : null,
      vigenteDe: l.vigente_de,
      vigenteAte: l.vigente_ate,
    })
    checksDoCard[l.card_id] = lista
  })

  const cardsDaEtapa = {}
  cards.rows.forEach((l) => {
    const lista = cardsDaEtapa[l.etapa_id] ?? []
    lista.push({
      id: String(l.id),
      ordem: l.ordem,
      titulo: l.titulo,
      /* o que o card faz — a dica que aparece ao passar o mouse */
      informacoes: l.informacoes ?? '',
      cargos: cargosDoCard[l.id] ?? [],
      etiquetas: etiquetasDoCard[l.id] ?? [],
      checks: checksDoCard[l.id] ?? [],
      vigenteDe: l.vigente_de,
      vigenteAte: l.vigente_ate,
    })
    cardsDaEtapa[l.etapa_id] = lista
  })

  return etapas.rows.map((e) => ({
    id: String(e.id),
    ordem: e.ordem,
    // numero e recalculado por obra na tela; aqui vai a posicao geral
    numero: e.ordem,
    nome: e.nome,
    /* a linha de apoio embaixo do nome ("aguardando aprovacao").
       Texto livre e opcional: etapa sem descricao mostra so o nome. */
    descricao: e.descricao ?? '',
    /* etapa de fabrica: nao se renomeia, nao se reordena, nao se exclui */
    fixa: e.fixa ?? false,
    /* 'planejamento' | 'intermediaria' | 'execucao' nas tres primeiras
       fixas; null nas outras */
    papel: e.papel ?? null,
    cards: cardsDaEtapa[e.id] ?? [],
    vigenteDe: e.vigente_de,
    vigenteAte: e.vigente_ate,
  }))
}

router.get('/', exigeSessao, async (_req, res) => {
  try {
    return res.json({ etapas: await lerRoteiro() })
  } catch (erro) {
    return tratar(erro, res, 'roteiro/ler')
  }
})

/* ------------------------------------------------------------
   Etapas

   As etapas de FABRICA (etapa.fixa, atualizacao 14) sao o
   esqueleto do fluxo — planejamento, intermediaria, execucao — e
   nao se renomeiam, nao se reordenam e nao se excluem. So as
   criadas a mao seguem editaveis. A tela esconde o lapis; aqui e
   o que impede chamar a API na mao.
   ------------------------------------------------------------ */

const ETAPA_FIXA =
  'Esta etapa é fixa do fluxo da obra: não pode ser renomeada, reordenada nem excluída. Só as etapas criadas manualmente podem ser editadas.'

/** A etapa e fixa? Banco sem a coluna (sem a atualizacao 14): nenhuma e. */
async function etapaFixa(id) {
  try {
    const { rows } = await query('SELECT fixa FROM etapa WHERE id = $1', [id])
    return rows[0]?.fixa === true
  } catch (erro) {
    if (erro.code === '42703') return false
    throw erro
  }
}

router.post('/etapas', exigeSessao, exige('editar_etapa'), async (req, res) => {
  const nome = String(req.body?.nome ?? '').trim()
  const descricao = String(req.body?.descricao ?? '').trim()
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da etapa.' })

  try {
    const desde = await momento(obraDaChamada(req))
    const { rows } = await query(
      `INSERT INTO etapa (ordem, nome, descricao, vigente_de)
       VALUES (coalesce((SELECT max(ordem) FROM etapa), 0) + 1, $1, $2, $3)
       RETURNING id, ordem, nome, descricao, vigente_de`,
      [nome, descricao || null, desde],
    )
    await registrarRoteiro(req, 'etapa.criada', 'Etapa criada no roteiro', { etapa: nome })
    return res.status(201).json({
      etapa: {
        id: String(rows[0].id),
        numero: rows[0].ordem,
        ordem: rows[0].ordem,
        nome: rows[0].nome,
        descricao: rows[0].descricao ?? '',
        cards: [],
        vigenteDe: rows[0].vigente_de,
        vigenteAte: null,
      },
    })
  } catch (erro) {
    return tratar(erro, res, 'roteiro/etapa-criar')
  }
})

/**
 * Renomear vale para todas as obras: e a mesma etapa, so trocou o
 * nome. A descricao segue a mesma regra — ela conta o ESTADO da
 * etapa ("aguardando aprovacao"), e esse estado e um so.
 *
 * `descricao` vem separada do `nome` de proposito: mandar so uma das
 * duas nao apaga a outra, e e isso que deixa a tela salvar o campo
 * que a pessoa mexeu sem ter de reenviar o resto.
 */
router.patch('/etapas/:id', exigeSessao, exige('editar_etapa'), async (req, res) => {
  const temNome = req.body?.nome !== undefined
  const temDescricao = req.body?.descricao !== undefined
  const nome = String(req.body?.nome ?? '').trim()
  const descricao = String(req.body?.descricao ?? '').trim()

  if (temNome && !nome) return res.status(400).json({ erro: 'Informe o nome da etapa.' })
  if (!temNome && !temDescricao) {
    return res.status(400).json({ erro: 'Nada para alterar na etapa.' })
  }

  try {
    if (await etapaFixa(req.params.id)) return res.status(409).json({ erro: ETAPA_FIXA })
    const { rows } = await query(
      `UPDATE etapa
          SET nome      = coalesce($1, nome),
              descricao = CASE WHEN $2::boolean THEN $3 ELSE descricao END
        WHERE id = $4
      RETURNING id, nome`,
      [temNome ? nome : null, temDescricao, descricao || null, req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Etapa não encontrada.' })
    await registrarRoteiro(req, 'etapa.editada', 'Etapa editada', { etapa: rows[0].nome })
    return res.json({ ok: true })
  } catch (erro) {
    return tratar(erro, res, 'roteiro/etapa-editar')
  }
})

/**
 * Excluir NAO apaga: fecha a janela de vigencia.
 *
 * A etapa some desta obra e das proximas, e continua inteira nas
 * anteriores — com os cards, os checks e o que elas ja marcaram. Se
 * fosse DELETE de verdade, o historico das obras antigas ia junto.
 */
router.delete('/etapas/:id', exigeSessao, exige('editar_etapa'), async (req, res) => {
  try {
    if (await etapaFixa(req.params.id)) return res.status(409).json({ erro: ETAPA_FIXA })
    const ate = await momento(obraDaChamada(req))
    const { rows } = await query(
      'UPDATE etapa SET vigente_ate = $1 WHERE id = $2 AND vigente_ate IS NULL RETURNING nome',
      [ate, req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Etapa não encontrada.' })
    await registrarRoteiro(req, 'etapa.excluida', 'Etapa excluída do roteiro', { etapa: rows[0].nome })
    return res.status(204).end()
  } catch (erro) {
    return tratar(erro, res, 'roteiro/etapa-apagar')
  }
})

/* ------------------------------------------------------------
   Cards — um card e de UM setor

   Card de varios setores (com o gradiente das cores deles, e
   qualquer um marcando qualquer check) saiu: o card e do setor, e
   quem marca cada check e decidido NO CHECK ("Quem marca este
   check"). Card antigo que ja tinha mais de um setor continua de
   pe; so nao se cria nem se troca para mais de um.
   ------------------------------------------------------------ */

/** Regrava o setor do card. Lista vazia nao passa: card sem dono nao marca nada. */
async function gravarCargos(cardId, chaves) {
  const limpas = [...new Set((chaves ?? []).map((c) => String(c).trim()).filter(Boolean))]
  if (limpas.length === 0) return { erro: 'Escolha o setor do card.' }
  if (limpas.length > 1) {
    return {
      erro: 'O card é de um setor só. Para outro setor marcar um check, escolha em "Quem marca este check".',
    }
  }

  const { rows } = await query('SELECT id, chave FROM cargo WHERE chave = ANY($1)', [limpas])
  if (rows.length !== limpas.length) return { erro: 'Cargo não encontrado.' }

  await query('DELETE FROM etapa_card_cargo WHERE card_id = $1', [cardId])
  for (const [i, chave] of limpas.entries()) {
    const cargo = rows.find((r) => r.chave === chave)
    await query('INSERT INTO etapa_card_cargo (card_id, cargo_id, ordem) VALUES ($1, $2, $3)', [
      cardId,
      cargo.id,
      i,
    ])
  }
  return { ok: true }
}

/** O texto de "Informacoes" (do card ou do check): vazio vira NULL, e com teto. */
const informacoesDoCorpo = (valor) => String(valor ?? '').trim().slice(0, 600) || null

router.post('/etapas/:id/cards', exigeSessao, exige('editar_cards'), async (req, res) => {
  const titulo = String(req.body?.titulo ?? '').trim() || null
  const informacoes = informacoesDoCorpo(req.body?.informacoes)

  try {
    const etapa = await query('SELECT id FROM etapa WHERE id = $1', [req.params.id])
    if (!etapa.rows[0]) return res.status(404).json({ erro: 'Etapa não encontrada.' })

    const desde = await momento(obraDaChamada(req))
    /* sem a atualizacao 13 nao ha coluna de informacoes: o card nasce
       sem a dica, mas nasce */
    const { rows } = await query(
      `INSERT INTO etapa_card (etapa_id, ordem, titulo, informacoes, vigente_de)
       VALUES ($1, coalesce((SELECT max(ordem) FROM etapa_card WHERE etapa_id = $1), -1) + 1, $2, $3, $4)
       RETURNING id`,
      [req.params.id, titulo, informacoes, desde],
    ).catch((erro) => {
      if (erro.code !== '42703') throw erro
      return query(
        `INSERT INTO etapa_card (etapa_id, ordem, titulo, vigente_de)
         VALUES ($1, coalesce((SELECT max(ordem) FROM etapa_card WHERE etapa_id = $1), -1) + 1, $2, $3)
         RETURNING id`,
        [req.params.id, titulo, desde],
      )
    })

    const posto = await gravarCargos(rows[0].id, req.body?.cargos)
    if (posto.erro) {
      await query('DELETE FROM etapa_card WHERE id = $1', [rows[0].id])
      return res.status(400).json({ erro: posto.erro })
    }

    await registrarRoteiro(req, 'card.criado', 'Card criado no roteiro', await nomesDoCard(rows[0].id))
    return res.status(201).json({ id: String(rows[0].id) })
  } catch (erro) {
    return tratar(erro, res, 'roteiro/card-criar')
  }
})

router.patch('/cards/:id', exigeSessao, exige('editar_cards'), async (req, res) => {
  try {
    const card = await query('SELECT id FROM etapa_card WHERE id = $1', [req.params.id])
    if (!card.rows[0]) return res.status(404).json({ erro: 'Card não encontrado.' })

    if (req.body?.titulo !== undefined) {
      await query('UPDATE etapa_card SET titulo = $1 WHERE id = $2', [
        String(req.body.titulo).trim() || null,
        req.params.id,
      ])
    }
    if (req.body?.informacoes !== undefined) {
      await query('UPDATE etapa_card SET informacoes = $1 WHERE id = $2', [
        informacoesDoCorpo(req.body.informacoes),
        req.params.id,
      ])
    }
    /* trocar o cargo dono do card e permissao propria: da para deixar
       alguem organizar cards sem poder mudar de quem eles sao.

       So conta como TROCA se a lista mudou. A tela mandava os cargos em
       toda edicao, iguais aos de antes, e quem tinha "alterar cards" sem
       "alterar setores no card" levava 403 ate para renomear o card. */
    if (req.body?.cargos !== undefined) {
      const atuais = await query(
        `SELECT c.chave FROM etapa_card_cargo cc JOIN cargo c ON c.id = cc.cargo_id
          WHERE cc.card_id = $1 ORDER BY cc.ordem`,
        [req.params.id],
      )
      const pedidos = [...new Set((req.body.cargos ?? []).map((c) => String(c).trim()).filter(Boolean))]
      const mudou = pedidos.join('|') !== atuais.rows.map((l) => l.chave).join('|')

      if (mudou) {
        if (!req.cargo?.acessoTotal && !(req.cargo?.permissoes ?? []).includes('editar_cargos_card')) {
          return res.status(403).json({ erro: 'Seu setor não pode alterar os setores do card.' })
        }
        const posto = await gravarCargos(req.params.id, req.body.cargos)
        if (posto.erro) return res.status(400).json({ erro: posto.erro })
      }
    }
    await registrarRoteiro(req, 'card.editado', 'Card editado', await nomesDoCard(req.params.id))
    return res.json({ ok: true })
  } catch (erro) {
    return tratar(erro, res, 'roteiro/card-editar')
  }
})

router.delete('/cards/:id', exigeSessao, exige('editar_cards'), async (req, res) => {
  try {
    const ate = await momento(obraDaChamada(req))
    const { rowCount } = await query(
      'UPDATE etapa_card SET vigente_ate = $1 WHERE id = $2 AND vigente_ate IS NULL',
      [ate, req.params.id],
    )
    if (rowCount === 0) return res.status(404).json({ erro: 'Card não encontrado.' })
    await registrarRoteiro(req, 'card.excluido', 'Card excluído do roteiro', await nomesDoCard(req.params.id))
    return res.status(204).end()
  } catch (erro) {
    return tratar(erro, res, 'roteiro/card-apagar')
  }
})

/* ------------------------------------------------------------
   Checks

   ONDE a mudanca vale depende de onde ela e feita:

     dentro de uma obra (`obraId` na chamada) — SO naquela obra. Na
       primeira mudanca de check dentro dela, a obra ganha uma copia
       dos checks que enxerga (garantirChecksProprios) e dali em diante
       mexe so na copia: nem as proximas obras nem as que ja passaram
       sentem nada;
     no modelo da obra (o "Editar" do quadro, sem `obraId`) — nas
       obras criadas DAQUI EM DIANTE. As que ja existem continuam como
       estavam (o check visto por alguma delas vira versao nova).

   Tudo o que diz como o check se COMPORTA mora nele:
     sim_nao      "Obrigatorio responder Sim ou Nao?";
     informacoes  a dica ao passar o mouse;
     cargos       quem marca (vazio = o setor do card).

   Os checks do SISTEMA (tipo 'planejamento_ensaios' e
   'execucao_ensaios', atualizacao 14; 'material_gases',
   atualizacao 17) sustentam o fluxo dos ensaios: nao se excluem,
   nao mudam de nome e nao viram pergunta. Quem marca e a dica
   continuam editaveis.
   ------------------------------------------------------------ */

const CHECK_DO_SISTEMA =
  'Este check é do sistema (fluxo dos ensaios): não pode ser excluído, renomeado nem virar pergunta.'

/** O tipo do check ('comum' num banco sem a atualizacao 14), ou null se nao existe. */
async function tipoDoCheck(id) {
  try {
    const { rows } = await query('SELECT tipo FROM etapa_check WHERE id = $1', [id])
    return rows[0] ? rows[0].tipo : null
  } catch (erro) {
    if (erro.code !== '42703') throw erro
    const { rows } = await query('SELECT id FROM etapa_check WHERE id = $1', [id])
    return rows[0] ? 'comum' : null
  }
}

/**
 * Regrava os cargos donos de UM check.
 *
 * Lista vazia apaga a excecao: o check volta a seguir o cargo do card.
 */
async function gravarCargosDoCheck(checkId, chaves) {
  const limpas = [...new Set((chaves ?? []).map((c) => String(c).trim()).filter(Boolean))]

  await query('DELETE FROM etapa_check_cargo WHERE check_id = $1', [checkId])
  if (limpas.length === 0) return { ok: true }

  const { rows } = await query('SELECT id, chave FROM cargo WHERE chave = ANY($1)', [limpas])
  if (rows.length !== limpas.length) return { erro: 'Cargo não encontrado.' }

  for (const [i, chave] of limpas.entries()) {
    const cargo = rows.find((r) => r.chave === chave)
    await query(
      'INSERT INTO etapa_check_cargo (check_id, cargo_id, ordem) VALUES ($1, $2, $3)',
      [checkId, cargo.id, i],
    )
  }
  return { ok: true }
}

/* ------------------------------------------------------------
   Os checks PROPRIOS de uma obra (atualizacao 18)
   ------------------------------------------------------------ */

/**
 * Na primeira mudanca de check dentro da obra, ela ganha a copia dos
 * checks que enxerga — com os donos de cada um — e as marcas e os prazos
 * dela passam para as copias. Uma instrucao so: ou tudo, ou nada.
 * Obra que ja tem os checks proprios passa direto.
 */
async function garantirChecksProprios(obraId) {
  await query(
    `WITH o AS (
       SELECT id, criado_em FROM obra WHERE id = $1 AND NOT checks_proprios FOR UPDATE
     ),
     base AS (
       SELECT ck.*
         FROM o
         JOIN etapa_check ck ON ck.obra_id IS NULL
                            AND ck.vigente_de <= o.criado_em
                            AND (ck.vigente_ate IS NULL OR o.criado_em < ck.vigente_ate)
         JOIN etapa_card kd  ON kd.id = ck.card_id
                            AND kd.vigente_de <= o.criado_em
                            AND (kd.vigente_ate IS NULL OR o.criado_em < kd.vigente_ate)
         JOIN etapa et       ON et.id = kd.etapa_id
                            AND et.vigente_de <= o.criado_em
                            AND (et.vigente_ate IS NULL OR o.criado_em < et.vigente_ate)
     ),
     novos AS (
       INSERT INTO etapa_check (card_id, ordem, titulo, sim_nao, informacoes, tipo,
                                vigente_de, obra_id, origem_id)
       SELECT b.card_id, b.ordem, b.titulo, b.sim_nao, b.informacoes, b.tipo,
              o.criado_em, o.id, b.id
         FROM base b CROSS JOIN o
       RETURNING id, origem_id
     ),
     donos AS (
       INSERT INTO etapa_check_cargo (check_id, cargo_id, ordem)
       SELECT n.id, kc.cargo_id, kc.ordem
         FROM novos n JOIN etapa_check_cargo kc ON kc.check_id = n.origem_id
     ),
     marcas AS (
       UPDATE obra_check m SET check_id = n.id
         FROM novos n
        WHERE m.obra_id = $1 AND m.check_id = n.origem_id
     ),
     prazos AS (
       UPDATE obra_prazo_check p SET check_id = n.id
         FROM novos n
        WHERE p.obra_id = $1 AND p.check_id = n.origem_id
     )
     UPDATE obra SET checks_proprios = true WHERE id = (SELECT id FROM o)`,
    [obraId],
  )
}

/** A copia, nesta obra, do check que a tela mandou (o id do roteiro ou o da propria copia). */
async function checkDaObra(obraId, checkId) {
  const { rows } = await query(
    `SELECT id, card_id, titulo, sim_nao, informacoes, tipo, vigente_ate
       FROM etapa_check
      WHERE obra_id = $1 AND (id = $2 OR origem_id = $2)
      ORDER BY (id = $2) DESC, id DESC
      LIMIT 1`,
    [obraId, checkId],
  )
  return rows[0] ?? null
}

/* ------------------------------------------------------------
   O MODELO: check que alguma obra ja enxerga nao muda para tras

   Mudar no modelo um check (nome, Sim/Nao, informacoes, quem marca,
   lugar) vale para as obras criadas daqui em diante. Se alguma obra
   que existe hoje — e que ainda le o roteiro, sem checks proprios —
   ja enxerga o check, ele e VERSIONADO: o de antes sai agora
   (vigente_ate = agora) e um novo, com a mudanca, entra no mesmo
   instante. Check que nenhuma obra enxerga ainda (criado agora no
   modelo) muda no proprio lugar.
   ------------------------------------------------------------ */

/** Alguma obra que existe hoje (e le o roteiro) enxerga este check? */
async function vistoPorObras(checkId) {
  const { rows } = await query(
    `SELECT EXISTS (
       SELECT 1 FROM etapa_check ck JOIN obra o
           ON o.criado_em >= ck.vigente_de
          AND (ck.vigente_ate IS NULL OR o.criado_em < ck.vigente_ate)
          AND NOT o.checks_proprios
        WHERE ck.id = $1
     ) AS visto`,
    [checkId],
  )
  return rows[0]?.visto === true
}

/** As chaves dos cargos donos do check (vazio = segue o card). */
async function cargosDoCheck(checkId) {
  const { rows } = await query(
    `SELECT c.chave FROM etapa_check_cargo kc JOIN cargo c ON c.id = kc.cargo_id
      WHERE kc.check_id = $1 ORDER BY kc.ordem`,
    [checkId],
  )
  return rows.map((l) => l.chave)
}

const limparCargos = (chaves) => [...new Set((chaves ?? []).map((c) => String(c).trim()).filter(Boolean))]

/** Todos os cargos da lista existem? (antes de versionar, para nao fechar o check a toa) */
async function cargosExistem(chaves) {
  if (chaves.length === 0) return true
  const { rows } = await query('SELECT count(*)::int AS n FROM cargo WHERE chave = ANY($1)', [chaves])
  return rows[0]?.n === chaves.length
}

/**
 * Fecha o check do roteiro agora e abre a versao nova, com `mudancas`
 * por cima do que ele tinha. Devolve o id da versao nova.
 *
 * O de antes fecha PRIMEIRO: os checks do sistema tem indice unico por
 * tipo entre os que valem. Se a versao nova nao entrar, o de antes
 * reabre.
 */
async function versionarCheck(checkId, mudancas = {}) {
  const { rows: antes } = await query('SELECT * FROM etapa_check WHERE id = $1', [checkId])
  const atual = antes[0]
  const cargos = mudancas.cargos ?? (await cargosDoCheck(checkId))
  const agora = new Date()

  await query('UPDATE etapa_check SET vigente_ate = $1 WHERE id = $2', [agora, checkId])
  try {
    const { rows } = await query(
      `INSERT INTO etapa_check (card_id, ordem, titulo, sim_nao, informacoes, tipo, vigente_de)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        mudancas.cardId ?? atual.card_id,
        mudancas.ordem ?? atual.ordem,
        mudancas.titulo ?? atual.titulo,
        mudancas.simNao ?? atual.sim_nao,
        mudancas.informacoes !== undefined ? mudancas.informacoes : atual.informacoes,
        atual.tipo,
        agora,
      ],
    )
    await gravarCargosDoCheck(rows[0].id, cargos)
    return String(rows[0].id)
  } catch (erro) {
    await query('UPDATE etapa_check SET vigente_ate = $1 WHERE id = $2', [atual.vigente_ate, checkId])
    throw erro
  }
}

router.post('/cards/:id/checks', exigeSessao, exige('editar_checks'), async (req, res) => {
  const titulo = String(req.body?.titulo ?? '').trim()
  if (!titulo) return res.status(400).json({ erro: 'Escreva o que precisa ser feito.' })

  try {
    const card = await query('SELECT id FROM etapa_card WHERE id = $1', [req.params.id])
    if (!card.rows[0]) return res.status(404).json({ erro: 'Card não encontrado.' })

    const obraId = obraDaChamada(req)
    const desde = await momento(obraId)
    const simNao = req.body?.simNao === true
    const informacoes = informacoesDoCorpo(req.body?.informacoes)

    let rows
    if (obraId) {
      /* dentro da obra: o check nasce SO nela */
      await garantirChecksProprios(obraId)
      ;({ rows } = await query(
        `INSERT INTO etapa_check (card_id, ordem, titulo, sim_nao, informacoes, vigente_de, obra_id)
         VALUES ($1, coalesce((SELECT max(ordem) FROM etapa_check
                                WHERE card_id = $1 AND obra_id = $6), -1) + 1,
                 $2, $3, $4, $5, $6)
         RETURNING id, ordem, titulo, vigente_de`,
        [req.params.id, titulo, simNao, informacoes, desde, obraId],
      ))
    } else {
      /* no modelo: vale para as obras criadas daqui em diante. Sem as
         atualizacoes 13/18 o check nasce comum e sem dica — mas nasce */
      ;({ rows } = await query(
        `INSERT INTO etapa_check (card_id, ordem, titulo, sim_nao, informacoes, vigente_de)
         VALUES ($1, coalesce((SELECT max(ordem) FROM etapa_check
                                WHERE card_id = $1 AND obra_id IS NULL), -1) + 1, $2, $3, $4, $5)
         RETURNING id, ordem, titulo, vigente_de`,
        [req.params.id, titulo, simNao, informacoes, desde],
      ).catch((erro) => {
        if (erro.code !== '42703') throw erro
        return query(
          `INSERT INTO etapa_check (card_id, ordem, titulo, vigente_de)
           VALUES ($1, coalesce((SELECT max(ordem) FROM etapa_check WHERE card_id = $1), -1) + 1, $2, $3)
           RETURNING id, ordem, titulo, vigente_de`,
          [req.params.id, titulo, desde],
        )
      }))
    }

    if (req.body?.cargos !== undefined) {
      const posto = await gravarCargosDoCheck(rows[0].id, req.body.cargos)
      if (posto.erro) {
        await query('DELETE FROM etapa_check WHERE id = $1', [rows[0].id])
        return res.status(400).json({ erro: posto.erro })
      }
    }

    await registrarRoteiro(req, 'check.criado', obraId ? 'Check criado nesta obra' : 'Check criado no roteiro', {
      ...(await nomesDoCard(req.params.id)),
      check: titulo,
    })
    return res.status(201).json({
      check: {
        id: String(rows[0].id),
        ordem: rows[0].ordem,
        titulo: rows[0].titulo,
        cargos: req.body?.cargos ?? [],
        simNao,
        informacoes: informacoes ?? '',
        tipo: 'comum',
        obraId: obraId ? String(obraId) : null,
        vigenteDe: rows[0].vigente_de,
        vigenteAte: null,
      },
    })
  } catch (erro) {
    return tratar(erro, res, 'roteiro/check-criar')
  }
})

router.patch('/checks/:id', exigeSessao, exige('editar_checks'), async (req, res) => {
  try {
    const obraId = obraDaChamada(req)
    if (obraId) await garantirChecksProprios(obraId)

    /* o check que muda: dentro da obra, a copia dela; no modelo, o do roteiro */
    const { rows: lidos } = obraId
      ? { rows: [await checkDaObra(obraId, req.params.id)].filter(Boolean) }
      : await query(
          'SELECT id, card_id, titulo, sim_nao, informacoes, tipo, vigente_ate FROM etapa_check WHERE id = $1',
          [req.params.id],
        )
    const atual = lidos[0]
    if (!atual) return res.status(404).json({ erro: 'Check não encontrado.' })
    const tipo = atual.tipo ?? 'comum'
    const cargosAtuais = await cargosDoCheck(atual.id)

    /* o check como ele fica: o que veio na chamada por cima do que ele tem */
    const novo = {
      titulo: atual.titulo,
      simNao: atual.sim_nao === true,
      informacoes: atual.informacoes ?? null,
      cargos: cargosAtuais,
    }
    if (req.body?.titulo !== undefined) {
      novo.titulo = String(req.body.titulo).trim()
      if (!novo.titulo) return res.status(400).json({ erro: 'Escreva o que precisa ser feito.' })
      if (tipo !== 'comum' && atual.titulo !== novo.titulo) {
        return res.status(409).json({ erro: CHECK_DO_SISTEMA })
      }
    }
    if (req.body?.simNao !== undefined) {
      if (tipo !== 'comum' && req.body.simNao === true) {
        return res.status(409).json({ erro: CHECK_DO_SISTEMA })
      }
      novo.simNao = req.body.simNao === true
    }
    if (req.body?.informacoes !== undefined) novo.informacoes = informacoesDoCorpo(req.body.informacoes)
    if (req.body?.cargos !== undefined) {
      novo.cargos = limparCargos(req.body.cargos)
      if (!(await cargosExistem(novo.cargos))) return res.status(400).json({ erro: 'Cargo não encontrado.' })
    }

    const mudou =
      novo.titulo !== atual.titulo ||
      novo.simNao !== (atual.sim_nao === true) ||
      novo.informacoes !== (atual.informacoes ?? null) ||
      novo.cargos.join('|') !== cargosAtuais.join('|')
    if (!mudou) return res.json({ ok: true, id: String(atual.id), versionado: false })

    /* no modelo, check que alguma obra ja enxerga vira versao nova */
    const versionar = !obraId && !atual.vigente_ate && (await vistoPorObras(atual.id))
    let id = String(atual.id)
    if (versionar) {
      id = await versionarCheck(atual.id, novo)
    } else {
      await query('UPDATE etapa_check SET titulo = $1, sim_nao = $2, informacoes = $3 WHERE id = $4', [
        novo.titulo,
        novo.simNao,
        novo.informacoes,
        atual.id,
      ])
      await gravarCargosDoCheck(atual.id, novo.cargos)
    }

    await registrarRoteiro(
      req,
      'check.editado',
      obraId ? 'Check editado nesta obra' : 'Check do roteiro editado (vale para as próximas obras)',
      { ...(await nomesDoCard(atual.card_id)), check: novo.titulo },
    )
    return res.json({ ok: true, id, versionado: versionar })
  } catch (erro) {
    return tratar(erro, res, 'roteiro/check-editar')
  }
})

/* ------------------------------------------------------------
   A ORDEM dos checks — arrastar para cima, para baixo, ou para
   outro card (de qualquer setor, de qualquer etapa)

   PUT /roteiro/cards/:id/checks/ordem  { checkIds: [...], obraId? }

   `checkIds` e a fila inteira do card de destino, na ordem nova — e
   pode trazer um check que estava em outro card (o que foi arrastado
   para ca).

   Dentro de uma obra mexe so nos checks proprios dela. No modelo, o
   check que alguma obra ja enxerga e muda de lugar vira versao nova
   (so as obras criadas daqui em diante o veem no lugar novo).

   Os checks do sistema mudam de ordem e de card, mas nao saem da
   etapa deles: e por ela que o fluxo dos ensaios os encontra.
   ------------------------------------------------------------ */

router.put('/cards/:id/checks/ordem', exigeSessao, exige('editar_checks'), async (req, res) => {
  const pedidos = [...new Set((req.body?.checkIds ?? []).map((id) => String(id)))]
  if (pedidos.length === 0) return res.status(400).json({ erro: 'Diga a ordem dos checks.' })
  const obraId = obraDaChamada(req)

  try {
    const { rows: cards } = await query('SELECT id, etapa_id FROM etapa_card WHERE id = $1', [req.params.id])
    const destino = cards[0]
    if (!destino) return res.status(404).json({ erro: 'Card não encontrado.' })

    /* dentro da obra, os ids viram os das copias dela */
    let ids = pedidos
    if (obraId) {
      await garantirChecksProprios(obraId)
      const locais = []
      for (const id of pedidos) {
        const copia = await checkDaObra(obraId, id)
        if (!copia || copia.vigente_ate) {
          return res.status(404).json({ erro: 'Check não encontrado (ele pode ter saído desta obra).' })
        }
        locais.push(String(copia.id))
      }
      ids = locais
    }

    const { rows: checks } = await query(
      `SELECT ck.id, ck.card_id, ck.ordem, ck.titulo, ck.tipo, ck.obra_id, ck.vigente_ate, kd.etapa_id
         FROM etapa_check ck JOIN etapa_card kd ON kd.id = ck.card_id
        WHERE ck.id = ANY($1::bigint[])`,
      [ids],
    )
    if (checks.length !== ids.length || checks.some((c) => c.vigente_ate)) {
      return res.status(404).json({ erro: 'Check não encontrado (ele pode ter saído do roteiro).' })
    }
    if (!obraId && checks.some((c) => c.obra_id)) {
      return res.status(400).json({ erro: 'Check de uma obra só se mexe dentro dela.' })
    }
    const sistemaForaDaEtapa = checks.find(
      (c) => c.tipo !== 'comum' && String(c.etapa_id) !== String(destino.etapa_id),
    )
    if (sistemaForaDaEtapa) {
      return res.status(409).json({
        erro: `"${sistemaForaDaEtapa.titulo}" é do sistema: muda de ordem e de card, mas não sai da etapa dele.`,
      })
    }

    const fila = []
    const versionados = []
    for (const [ordem, id] of ids.entries()) {
      const check = checks.find((c) => String(c.id) === id)
      const mudaDeCard = String(check.card_id) !== String(destino.id)
      if (!mudaDeCard && check.ordem === ordem) {
        fila.push(id)
        continue
      }
      if (!obraId && (await vistoPorObras(id))) {
        const novoId = await versionarCheck(id, { cardId: destino.id, ordem })
        versionados.push({ de: id, para: novoId, titulo: check.titulo })
        fila.push(novoId)
      } else {
        await query('UPDATE etapa_check SET card_id = $1, ordem = $2 WHERE id = $3', [destino.id, ordem, id])
        fila.push(id)
      }
    }

    const movidos = checks.filter((c) => String(c.card_id) !== String(destino.id))
    await registrarRoteiro(
      req,
      movidos.length > 0 ? 'check.movido' : 'check.reordenado',
      movidos.length > 0 ? 'Check levado para outro card' : 'Ordem dos checks alterada',
      {
        ...(await nomesDoCard(destino.id)),
        ...(movidos.length > 0 ? { check: movidos.map((c) => c.titulo).join(', ') } : {}),
      },
    )
    return res.json({ ok: true, checkIds: fila, versionados })
  } catch (erro) {
    return tratar(erro, res, 'roteiro/check-ordem')
  }
})

router.delete('/checks/:id', exigeSessao, exige('editar_checks'), async (req, res) => {
  try {
    const obraId = obraDaChamada(req)
    if (obraId) {
      /* dentro da obra: sai SO dela */
      await garantirChecksProprios(obraId)
      const copia = await checkDaObra(obraId, req.params.id)
      if (!copia || copia.vigente_ate) return res.status(404).json({ erro: 'Check não encontrado.' })
      if (copia.tipo && copia.tipo !== 'comum') return res.status(409).json({ erro: CHECK_DO_SISTEMA })
      await query('UPDATE etapa_check SET vigente_ate = now() WHERE id = $1', [copia.id])
      await registrarRoteiro(req, 'check.excluido', 'Check removido desta obra', {
        ...(await nomesDoCard(copia.card_id)),
        check: copia.titulo,
      })
      return res.status(204).end()
    }

    const tipo = await tipoDoCheck(req.params.id)
    if (tipo && tipo !== 'comum') return res.status(409).json({ erro: CHECK_DO_SISTEMA })
    const ate = await momento(null)
    const { rows } = await query(
      `UPDATE etapa_check SET vigente_ate = $1 WHERE id = $2 AND vigente_ate IS NULL
       RETURNING card_id, titulo`,
      [ate, req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Check não encontrado.' })
    await registrarRoteiro(req, 'check.excluido', 'Check removido do roteiro', {
      ...(await nomesDoCard(rows[0].card_id)),
      check: rows[0].titulo,
    })
    return res.status(204).end()
  } catch (erro) {
    return tratar(erro, res, 'roteiro/check-apagar')
  }
})

/* ------------------------------------------------------------
   Etiquetas de CARD

   Catalogo proprio (`etiqueta_card`), separado do das obras. As
   duas etiquetagens respondem a perguntas diferentes — a da obra
   diz o que a obra e, a do card diz o que aquele pedaco do
   roteiro e —, e compartilhar o catalogo faria a sugestao de uma
   aparecer na outra e uma renomeada de um lado mexer no outro.

   Precisa da atualizacao 7 do banco (db/atualizacao-7.sql.txt).
   Sem ela as tabelas nao existem, e as rotas respondem 501 em vez
   de derrubar a tela.
   ------------------------------------------------------------ */

const semTabela = (erro, res) =>
  erro.code === '42P01'
    ? res.status(501).json({
        erro: 'Etiquetas de card ainda não foram habilitadas no banco (atualização 7).',
      })
    : null

router.post('/cards/:id/etiquetas', exigeSessao, exige('editar_cards'), async (req, res) => {
  const nome = String(req.body?.nome ?? '').trim()
  const cor = String(req.body?.cor ?? '').trim() || '#6b7280'
  if (!nome) return res.status(400).json({ erro: 'Escreva o nome da etiqueta.' })
  if (!/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(cor)) {
    return res.status(400).json({ erro: 'Cor inválida.' })
  }

  try {
    let etiqueta
    /* etiqueta escolhida da lista: reaproveita sem mexer no nome nem
       na cor dela — renomear e outra acao, com rota propria */
    if (req.body?.etiquetaId) {
      const achada = await query('SELECT * FROM etiqueta_card WHERE id = $1', [req.body.etiquetaId])
      etiqueta = achada.rows[0]
    }
    if (!etiqueta) {
      const criada = await query(
        `INSERT INTO etiqueta_card (nome, cor) VALUES ($1, $2)
         ON CONFLICT (lower(btrim(nome))) DO UPDATE SET cor = excluded.cor
         RETURNING *`,
        [nome, cor],
      )
      etiqueta = criada.rows[0]
    }

    await query(
      'INSERT INTO card_etiqueta (card_id, etiqueta_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, etiqueta.id],
    )

    return res.status(201).json({
      etiqueta: { id: String(etiqueta.id), nome: etiqueta.nome, cor: etiqueta.cor },
    })
  } catch (erro) {
    if (semTabela(erro, res)) return undefined
    if (erro.code === '23503') return res.status(404).json({ erro: 'Card não encontrado.' })
    return tratar(erro, res, 'roteiro/etiqueta-card-criar')
  }
})

router.patch('/cards/etiquetas/:id', exigeSessao, exige('editar_cards'), async (req, res) => {
  const campos = []
  const valores = []

  if (req.body?.nome !== undefined) {
    const nome = String(req.body.nome ?? '').trim()
    if (!nome) return res.status(400).json({ erro: 'Escreva o nome da etiqueta.' })
    valores.push(nome)
    campos.push(`nome = $${valores.length}`)
  }
  if (req.body?.cor !== undefined) {
    const cor = String(req.body.cor ?? '').trim()
    if (!/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(cor)) {
      return res.status(400).json({ erro: 'Cor inválida.' })
    }
    valores.push(cor)
    campos.push(`cor = $${valores.length}`)
  }
  if (campos.length === 0) return res.status(400).json({ erro: 'Nada para alterar.' })

  valores.push(req.params.id)
  try {
    const { rows } = await query(
      `UPDATE etiqueta_card SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING *`,
      valores,
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Etiqueta não encontrada.' })
    return res.json({
      etiqueta: { id: String(rows[0].id), nome: rows[0].nome, cor: rows[0].cor },
    })
  } catch (erro) {
    if (semTabela(erro, res)) return undefined
    if (erro.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma etiqueta de card com esse nome.' })
    }
    return tratar(erro, res, 'roteiro/etiqueta-card-editar')
  }
})

/** Tira a etiqueta DESTE card; ela continua no catalogo para os outros. */
router.delete('/cards/:id/etiquetas/:etiquetaId', exigeSessao, exige('editar_cards'), async (req, res) => {
  try {
    await query('DELETE FROM card_etiqueta WHERE card_id = $1 AND etiqueta_id = $2', [
      req.params.id,
      req.params.etiquetaId,
    ])
    return res.status(204).end()
  } catch (erro) {
    if (semTabela(erro, res)) return undefined
    return tratar(erro, res, 'roteiro/etiqueta-card-tirar')
  }
})

export default router
