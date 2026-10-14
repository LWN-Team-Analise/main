/**
 * O roteiro de fabrica das obras: 5 etapas, os cards de cada etapa e os
 * checks de cada card.
 *
 * Mora aqui, e nao no .sql, por causa do acento: colar "Integracao" com
 * cedilha no psql do Windows depende do code page do terminal. Pela API
 * o texto vai em UTF-8 e chega inteiro.
 *
 * Roda sozinho quando a API sobe e SO age se a tabela etapa estiver
 * vazia — depois disso o roteiro e do usuario, e subir a API de novo nao
 * mexe em nada.
 */

/**
 * cargos: a chave do setor dono do card (um so).
 *
 * As tres primeiras etapas tem PAPEL no fluxo (planejamento,
 * intermediaria, execucao) e todas as de fabrica nascem FIXAS: nao se
 * renomeiam nem se excluem (ver db/atualizacao-14.sql.txt). Os checks
 * em objeto ({ titulo, tipo }) sao os do sistema — o Planejamento e a
 * Execucao dos ensaios.
 */
export const ROTEIRO = [
  {
    nome: 'Comercial',
    papel: 'planejamento',
    cards: [
      {
        cargos: ['comercial'],
        checks: [
          'Proposta técnica',
          'Data de execução',
          'Ciente da proposta de consultoria',
          'Reunião interna',
          'Apresentar todas as propostas',
          'Venda alinhada com técnica e qualidade',
        ],
      },
      {
        cargos: ['tecnico'],
        checks: [{ titulo: 'Planejamento de ensaios', tipo: 'planejamento_ensaios' }],
      },
    ],
  },
  {
    nome: 'Planejamento',
    papel: 'intermediaria',
    cards: [
      {
        cargos: ['adm'],
        checks: ['Integração', 'Liberação de documento', 'Hotel'],
      },
      {
        cargos: ['gq'],
        checks: [
          'Elaboração',
          'Determinar Focal Point',
          'Revisão interna',
          'Envio revisão externa',
          'Entrar em contato e se apresentar',
          'Mat. Gases',
        ],
      },
      {
        cargos: ['tecnico'],
        checks: ['Se tiver data inserir no agendamento do cliente'],
      },
    ],
  },
  {
    nome: 'Execução',
    papel: 'execucao',
    cards: [
      {
        cargos: ['tecnico'],
        checks: [
          { titulo: 'Execução dos ensaios', tipo: 'execucao_ensaios' },
          'Execução',
          'Cronograma de ensaio detalhado',
          'Lançar dados da obra em % de execução',
        ],
      },
      {
        cargos: ['gq'],
        checks: ['Execução em campo protocolo / escritório', 'Garantir integridade dos dados'],
      },
      { cargos: ['excelencia'], checks: ['Instrumentos'] },
      { cargos: ['comercial'], checks: ['Acompanhamento reuniões'] },
    ],
  },
  {
    nome: 'Entrega',
    cards: [
      {
        cargos: ['gq'],
        checks: [
          'Revisão pós obra',
          'Envio p/ revisão cliente',
          'Apresentação dos resultados p/ cliente',
        ],
      },
      { cargos: ['comercial'], checks: ['Fatura após término de obra'] },
      { cargos: ['adm'], checks: ['ADM'] },
    ],
  },
  {
    nome: 'Encerramento',
    cards: [
      { cargos: ['comercial'], checks: ['Faturar após envio de doc'] },
      { cargos: ['adm'], checks: ['Gerar etiqueta p/ pasta de correio'] },
      { cargos: ['gq'], checks: ['Envio pasta física.'] },
    ],
  },
]

/**
 * Planta o roteiro de fabrica se ainda nao houver nenhuma etapa.
 * Devolve quantas etapas criou (0 = ja existia roteiro, nada a fazer).
 */
export async function plantarRoteiro(pool) {
  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')

    // trava a tabela para duas APIs subindo juntas nao plantarem duas vezes
    await cliente.query('LOCK TABLE etapa IN EXCLUSIVE MODE')
    const { rows } = await cliente.query('SELECT count(*)::int AS n FROM etapa')
    if (rows[0].n > 0) {
      await cliente.query('COMMIT')
      return 0
    }

    const cargos = await cliente.query('SELECT id, chave FROM cargo')
    const idDoCargo = Object.fromEntries(cargos.rows.map((c) => [c.chave, c.id]))

    /* banco que ja tem as colunas da atualizacao 14 planta as etapas
       fixas e os checks do sistema prontos; sem elas, planta como antes
       e a atualizacao 14 marca tudo depois (pelo -infinity e pelo nome) */
    const { rows: colunas } = await cliente.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema = 'public'
          AND ((table_name = 'etapa' AND column_name IN ('fixa', 'papel'))
            OR (table_name = 'etapa_check' AND column_name = 'tipo'))`,
    )
    const completo = colunas[0].n === 3

    for (const [i, etapa] of ROTEIRO.entries()) {
      const { rows: nova } = completo
        ? await cliente.query(
            'INSERT INTO etapa (ordem, nome, fixa, papel) VALUES ($1, $2, true, $3) RETURNING id',
            [i + 1, etapa.nome, etapa.papel ?? null],
          )
        : await cliente.query('INSERT INTO etapa (ordem, nome) VALUES ($1, $2) RETURNING id', [
            i + 1,
            etapa.nome,
          ])

      for (const [j, card] of etapa.cards.entries()) {
        const { rows: novoCard } = await cliente.query(
          'INSERT INTO etapa_card (etapa_id, ordem) VALUES ($1, $2) RETURNING id',
          [nova[0].id, j],
        )

        for (const [k, chave] of card.cargos.entries()) {
          if (!idDoCargo[chave]) continue
          await cliente.query(
            'INSERT INTO etapa_card_cargo (card_id, cargo_id, ordem) VALUES ($1, $2, $3)',
            [novoCard[0].id, idDoCargo[chave], k],
          )
        }

        for (const [k, item] of card.checks.entries()) {
          const titulo = typeof item === 'string' ? item : item.titulo
          const tipo = typeof item === 'string' ? 'comum' : item.tipo
          if (completo) {
            await cliente.query(
              'INSERT INTO etapa_check (card_id, ordem, titulo, tipo) VALUES ($1, $2, $3, $4)',
              [novoCard[0].id, k, titulo, tipo],
            )
          } else {
            await cliente.query(
              'INSERT INTO etapa_check (card_id, ordem, titulo) VALUES ($1, $2, $3)',
              [novoCard[0].id, k, titulo],
            )
          }
        }
      }
    }

    await cliente.query('COMMIT')
    return ROTEIRO.length
  } catch (erro) {
    await cliente.query('ROLLBACK')
    throw erro
  } finally {
    cliente.release()
  }
}
