import { Router } from 'express'
import { emTransacao, query } from '../db.js'
import { cargoPode, exige, exigeSessao, meuCargo, tratar } from '../sessao.js'
import { registrarAtividade } from '../atividade.js'
import { estadoDoTeams, linkDoSite, mandarNoTeams } from '../teams.js'
import {
  DIAS_MAXIMOS,
  dataBR,
  dataValida,
  diasDoPeriodo,
  lerCalculoDiario,
  resumoDoArquivo,
  rotuloDoPeriodo,
} from '../../src/domain/ponto.js'

/* ============================================================
   /api/ponto — a folha de ponto (db/atualizacao-51.sql.txt)

     GET  /folha?usuario&inicio&fim   a folha de uma pessoa no periodo.
                                      Sem `usuario`, a propria. A de outra
                                      pessoa so com `gerenciar_ponto`
     GET  /pessoas?inicio&fim         quem tem folha e quem ja assinou, para
                                      o seletor (`gerenciar_ponto`)
     GET  /exportar?inicio&fim        os dias de TODOS no periodo, para o
                                      Excel da empresa (`gerenciar_ponto`)
     POST /importar                   { conteudo, arquivo } — o Calculo
                                      Diario (.csv). So o modelo dele entra
                                      (`gerenciar_ponto`)
     POST /assinar                    { usuarioId?, inicio, fim, conferi,
                                      concordo } — a conferencia da folha
     POST /lembrar                    { usuarioId, inicio, fim } — o "Enviar
                                      aviso" das Assinaturas: mensagem no
                                      Teams pedindo para a pessoa assinar
                                      aquela folha (`gerenciar_ponto`)

   ASSINAR e so da propria folha. Quem ve a de todos (`gerenciar_ponto`)
   abre a de qualquer um, mas nao assina por ninguem: o `usuarioId` de
   outra pessoa volta 403, e quem assina e sempre quem esta no token.

   A folha liga com o usuario pelo CPF do cadastro (usuario.cpf).
   ============================================================ */

const router = Router()

const GERENCIAR = 'gerenciar_ponto'
/* ver a propria folha e assinar: a aba Ponto do menu (atualizacao 55) */
const VER = 'ver_ponto'

/* o arquivo chega como texto no JSON: um ano de uma empresa de 60 pessoas
   da uns 6 MB. O limite do corpo (8 MB, app.js) e da Vercel (4,5 MB) vem
   antes; aqui so se recusa o que nem e texto */
const ARQUIVO_MAXIMO = 7 * 1024 * 1024
/* linhas por INSERT: 23 parametros cada, longe do teto de 65535 */
const LOTE = 1000

/* o "Enviar aviso" fica no historico de quem mandou (tabela atividade, como
   o lembrete da senha padrao em avisosConta.js): e dali que a tela sabe
   quando foi o ultimo, e e por ele que o mesmo aviso nao sai de novo antes
   de uma hora */
const LEMBRETE = 'ponto.lembrete_assinatura'
const INTERVALO_LEMBRETE = "interval '1 hour'"

const idValido = (valor) => /^\d{1,15}$/.test(String(valor ?? ''))

/** { inicio, fim } conferidos, ou { erro }. */
function lerPeriodo(fonte) {
  const inicio = String(fonte?.inicio ?? '')
  const fim = String(fonte?.fim ?? '')
  if (!dataValida(inicio) || !dataValida(fim)) return { erro: 'Escolha o período (início e fim).' }
  if (fim < inicio) return { erro: 'O fim do período vem antes do início.' }
  if (diasDoPeriodo(inicio, fim).length > DIAS_MAXIMOS) {
    return { erro: `O período vai até ${DIAS_MAXIMOS} dias.` }
  }
  return { inicio, fim }
}

/* as colunas do arquivo, na ordem do INSERT */
const COLUNAS = [
  'cnpj', 'nome', 'matricula', 'pis', 'cpf', 'admissao', 'demissao', 'filial', 'departamento', 'cargo',
  'data', 'dia_semana', 'jornada_esperada', 'horas_esperadas', 'escala', 'natureza', 'marcacoes',
  'jornada_considerada', 'horas_trabalhadas', 'eventos', 'centro_custo', 'grupos',
]
const DO_REGISTRO = {
  dia_semana: 'diaSemana',
  jornada_esperada: 'jornadaEsperada',
  horas_esperadas: 'horasEsperadas',
  jornada_considerada: 'jornadaConsiderada',
  horas_trabalhadas: 'horasTrabalhadas',
  centro_custo: 'centroCusto',
}
const campoDe = (coluna) => DO_REGISTRO[coluna] ?? coluna

const CAMPOS_DIA = `p.cpf, to_char(p.data, 'YYYY-MM-DD') AS data, p.nome, p.matricula, p.pis, p.cnpj,
  to_char(p.admissao, 'YYYY-MM-DD') AS admissao, to_char(p.demissao, 'YYYY-MM-DD') AS demissao,
  p.filial, p.departamento, p.cargo, p.dia_semana, p.jornada_esperada, p.horas_esperadas, p.escala,
  p.natureza, p.marcacoes, p.jornada_considerada, p.horas_trabalhadas, p.eventos, p.centro_custo,
  p.grupos, p.importado_em`

/** A linha do banco no formato do registro (src/domain/ponto.js). */
function paraDia(l) {
  return {
    ...Object.fromEntries(COLUNAS.map((c) => [campoDe(c), l[c] ?? ''])),
    admissao: l.admissao ?? null,
    demissao: l.demissao ?? null,
    importadoEm: l.importado_em ?? null,
  }
}

/**
 * A impressao digital das marcacoes de um CPF num periodo: o que a
 * assinatura guarda. Muda quando uma importacao nova muda algum dia (ou
 * traz um dia que faltava).
 */
const RESUMO = `md5(coalesce(string_agg(concat_ws('|', p.data::text, p.natureza, p.jornada_esperada,
  p.horas_esperadas, p.marcacoes, p.jornada_considerada, p.horas_trabalhadas, p.eventos), chr(10)
  ORDER BY p.data), ''))`

async function resumoDe(cpf, inicio, fim) {
  const { rows } = await query(
    `SELECT ${RESUMO} AS resumo, count(*)::int AS dias
       FROM ponto_dia p WHERE p.cpf = $1 AND p.data BETWEEN $2 AND $3`,
    [cpf, inicio, fim],
  )
  return { resumo: rows[0].resumo, dias: rows[0].dias }
}

/**
 * A assinatura que vale para o periodo: a mais nova que COBRE ele inteiro
 * (assinar setembro vale para qualquer pedaco de setembro). `valida` diz
 * se as marcacoes ainda sao as que estavam na hora de assinar.
 */
async function assinaturaDe(cpf, inicio, fim) {
  const { rows } = await query(
    `SELECT a.id, a.nome, a.assinado_em, to_char(a.inicio, 'YYYY-MM-DD') AS inicio,
            to_char(a.fim, 'YYYY-MM-DD') AS fim, a.resumo
       FROM ponto_assinatura a
      WHERE a.cpf = $1 AND a.inicio <= $2 AND a.fim >= $3
      ORDER BY a.assinado_em DESC, a.id DESC
      LIMIT 1`,
    [cpf, inicio, fim],
  )
  const a = rows[0]
  if (!a) return null
  const atual = await resumoDe(cpf, a.inicio, a.fim)
  return {
    nome: a.nome,
    assinadoEm: a.assinado_em,
    inicio: a.inicio,
    fim: a.fim,
    valida: atual.resumo === a.resumo,
  }
}

async function ultimaDataDe(cpf) {
  const { rows } = await query(`SELECT to_char(max(data), 'YYYY-MM-DD') AS ultima FROM ponto_dia WHERE cpf = $1`, [cpf])
  return rows[0]?.ultima ?? null
}

async function usuarioPorId(id) {
  const { rows } = await query('SELECT id, name, cpf, ativo FROM usuario WHERE id = $1', [id])
  return rows[0] ?? null
}

/* ------------------------------------------------------------
   A folha
   ------------------------------------------------------------ */

router.get('/folha', exigeSessao, exige(VER), async (req, res) => {
  const periodo = lerPeriodo(req.query)
  if (periodo.erro) return res.status(400).json({ erro: periodo.erro })
  const { inicio, fim } = periodo

  const pedido = req.query.usuario ? String(req.query.usuario) : String(req.dono.sub)
  if (!idValido(pedido)) return res.status(400).json({ erro: 'Usuário inválido.' })
  const proprio = pedido === String(req.dono.sub)

  try {
    if (!proprio && !cargoPode(await meuCargo(req.dono.sub), GERENCIAR)) {
      return res.status(403).json({ erro: 'Você só pode ver a sua própria folha de ponto.' })
    }

    const usuario = await usuarioPorId(pedido)
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' })

    const base = {
      usuario: { id: String(usuario.id), nome: usuario.name },
      proprio,
      inicio,
      fim,
    }
    if (!usuario.cpf) {
      return res.json({ ...base, semCpf: true, funcionario: null, dias: [], assinatura: null })
    }

    const [dias, ultimo, assinatura] = await Promise.all([
      query(
        `SELECT ${CAMPOS_DIA} FROM ponto_dia p
          WHERE p.cpf = $1 AND p.data BETWEEN $2 AND $3
          ORDER BY p.data`,
        [usuario.cpf, inicio, fim],
      ),
      /* os dados do funcionario saem do dia mais novo do periodo; sem dia
         nenhum no periodo, do mais novo que houver */
      query(
        `SELECT ${CAMPOS_DIA} FROM ponto_dia p
          WHERE p.cpf = $1
          ORDER BY (p.data BETWEEN $2 AND $3) DESC, p.data DESC
          LIMIT 1`,
        [usuario.cpf, inicio, fim],
      ),
      assinaturaDe(usuario.cpf, inicio, fim),
    ])

    const f = ultimo.rows[0]
    return res.json({
      ...base,
      semCpf: false,
      /* o dia mais novo importado desta pessoa: com o periodo vazio, a tela
         oferece ir para o mes dele */
      ultimaData: f ? (dias.rows.length ? null : await ultimaDataDe(usuario.cpf)) : null,
      funcionario: f
        ? {
            nome: f.nome,
            matricula: f.matricula,
            pis: f.pis,
            cpf: f.cpf,
            cnpj: f.cnpj,
            admissao: f.admissao,
            demissao: f.demissao,
            filial: f.filial,
            departamento: f.departamento,
            cargo: f.cargo,
          }
        : null,
      dias: dias.rows.map(paraDia),
      assinatura,
    })
  } catch (erro) {
    return tratar(erro, res, 'ponto/folha')
  }
})

/* ------------------------------------------------------------
   Quem tem folha (o seletor de quem ve a de todos)
   ------------------------------------------------------------ */

router.get('/pessoas', exigeSessao, exige(GERENCIAR), async (req, res) => {
  const periodo = lerPeriodo(req.query)
  if (periodo.erro) return res.status(400).json({ erro: periodo.erro })
  const { inicio, fim } = periodo

  try {
    const [pessoas, soltos] = await Promise.all([
      query(
        `SELECT u.id, u.name, u.cpf IS NOT NULL AS tem_cpf,
                EXISTS (SELECT 1 FROM ponto_dia p WHERE p.cpf = u.cpf AND p.data BETWEEN $1 AND $2) AS tem_folha,
                a.resumo AS assinada_resumo, a.assinado_em, r.atual,
                av.criado_em AS avisado_em, av.por AS avisado_por
           FROM usuario u
           LEFT JOIN cargo c ON c.id = u.cargo_id
           LEFT JOIN LATERAL (
             SELECT x.resumo, x.inicio, x.fim, x.assinado_em FROM ponto_assinatura x
              WHERE x.cpf = u.cpf AND x.inicio <= $1 AND x.fim >= $2
              ORDER BY x.assinado_em DESC, x.id DESC LIMIT 1
           ) a ON true
           LEFT JOIN LATERAL (
             SELECT ${RESUMO} AS atual FROM ponto_dia p
              WHERE a.resumo IS NOT NULL AND p.cpf = u.cpf AND p.data BETWEEN a.inicio AND a.fim
           ) r ON true
           /* o ultimo "Enviar aviso" desta folha (o mesmo periodo) */
           LEFT JOIN LATERAL (
             SELECT t.criado_em, quem.name AS por FROM atividade t
               LEFT JOIN usuario quem ON quem.id = t.usuario_id
              WHERE t.acao = '${LEMBRETE}' AND t.entidade_tipo = 'usuario' AND t.entidade_id = u.id::text
                AND t.detalhes ->> 'inicio' = $1::text AND t.detalhes ->> 'fim' = $2::text
              ORDER BY t.criado_em DESC LIMIT 1
           ) av ON true
          WHERE u.ativo AND NOT coalesce(c.painel_tv, false)
          ORDER BY u.name`,
        [inicio, fim],
      ),
      /* quem veio no arquivo e nao tem usuario com aquele CPF: so o nome */
      query(
        `SELECT DISTINCT ON (p.cpf) p.nome
           FROM ponto_dia p
          WHERE p.data BETWEEN $1 AND $2
            AND NOT EXISTS (SELECT 1 FROM usuario u WHERE u.ativo AND u.cpf = p.cpf)
          ORDER BY p.cpf, p.data DESC`,
        [inicio, fim],
      ),
    ])
    return res.json({
      pessoas: pessoas.rows.map((l) => ({
        id: String(l.id),
        nome: l.name,
        temCpf: l.tem_cpf,
        temFolha: l.tem_folha,
        assinada: Boolean(l.assinada_resumo) && l.assinada_resumo === l.atual,
        assinadaEm: l.assinado_em ?? null,
        /* assinou, mas uma importacao nova mudou a folha: precisa assinar de novo */
        desatualizada: Boolean(l.assinada_resumo) && l.assinada_resumo !== l.atual,
        avisadoEm: l.avisado_em ?? null,
        avisadoPor: l.avisado_por ?? null,
      })),
      semUsuario: soltos.rows.map((l) => l.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    })
  } catch (erro) {
    return tratar(erro, res, 'ponto/pessoas')
  }
})

router.get('/exportar', exigeSessao, exige(GERENCIAR), async (req, res) => {
  const periodo = lerPeriodo(req.query)
  if (periodo.erro) return res.status(400).json({ erro: periodo.erro })
  try {
    const { rows } = await query(
      `SELECT ${CAMPOS_DIA} FROM ponto_dia p
        WHERE p.data BETWEEN $1 AND $2
        ORDER BY p.nome, p.cpf, p.data`,
      [periodo.inicio, periodo.fim],
    )
    return res.json({ dias: rows.map(paraDia) })
  } catch (erro) {
    return tratar(erro, res, 'ponto/exportar')
  }
})

/* ------------------------------------------------------------
   Cobrar a assinatura (o "Enviar aviso" das Assinaturas)
   ------------------------------------------------------------ */

router.post('/lembrar', exigeSessao, exige(GERENCIAR), async (req, res) => {
  const periodo = lerPeriodo(req.body)
  if (periodo.erro) return res.status(400).json({ erro: periodo.erro })
  const { inicio, fim } = periodo
  const alvo = String(req.body?.usuarioId ?? '')
  if (!idValido(alvo)) return res.status(400).json({ erro: 'Escolha o funcionário.' })

  try {
    const pessoa = await usuarioPorId(alvo)
    if (!pessoa || pessoa.ativo === false) return res.status(404).json({ erro: 'Funcionário não encontrado.' })
    if (!pessoa.cpf) {
      return res.status(400).json({ erro: `${pessoa.name} não tem CPF no cadastro: não há folha para assinar.` })
    }

    const atual = await resumoDe(pessoa.cpf, inicio, fim)
    if (atual.dias === 0) {
      return res.status(400).json({ erro: `${pessoa.name} não tem marcações importadas neste período.` })
    }
    const assinatura = await assinaturaDe(pessoa.cpf, inicio, fim)
    if (assinatura?.valida) return res.status(409).json({ erro: `${pessoa.name} já assinou esta folha de ponto.` })

    const recente = await query(
      `SELECT 1 FROM atividade
        WHERE acao = $1 AND entidade_tipo = 'usuario' AND entidade_id = $2
          AND detalhes ->> 'inicio' = $3 AND detalhes ->> 'fim' = $4
          AND criado_em > now() - ${INTERVALO_LEMBRETE}
        LIMIT 1`,
      [LEMBRETE, String(pessoa.id), inicio, fim],
    )
    if (recente.rows.length) {
      return res.status(429).json({ erro: `O aviso desta folha já foi enviado para ${pessoa.name} há menos de uma hora.` })
    }

    const teams = await estadoDoTeams()
    if (!teams.appConfigurado || !teams.conectado) {
      return res.status(503).json({
        erro: 'O envio pelo Teams não está ligado: em Configurações > Notificações no Teams, conecte a conta da empresa.',
      })
    }

    const { rows: euRows } = await query('SELECT name FROM usuario WHERE id = $1', [req.dono.sub])
    const quemPede = euRows[0]?.name ?? null
    const rotulo = rotuloDoPeriodo(inicio, fim)
    const { enviados } = await mandarNoTeams([pessoa.id], {
      titulo: 'Assine a sua folha de ponto',
      linhas: [
        assinatura
          ? `A sua folha de ponto de **${dataBR(inicio)} a ${dataBR(fim)}** (${rotulo}) mudou depois da sua assinatura e precisa ser assinada de novo.`
          : `A sua folha de ponto de **${dataBR(inicio)} a ${dataBR(fim)}** (${rotulo}) está esperando a sua assinatura.`,
        'Abra a aba Ponto, confira as marcações e clique em "Assinatura Funcionário", no rodapé da folha, para assinar.',
        quemPede ? `Aviso enviado por ${quemPede}.` : null,
      ],
      link: linkDoSite(`/core/app/ponto?inicio=${inicio}&fim=${fim}`),
      rotuloLink: 'Abrir a folha de ponto',
    })
    if (enviados === 0) {
      return res.status(502).json({
        erro: `A mensagem no Teams não saiu para ${pessoa.name}. Confira se a pessoa tem a conta Microsoft (Outlook) vinculada ou o e-mail da empresa no cadastro.`,
      })
    }

    await registrarAtividade(req, {
      acao: LEMBRETE,
      categoria: 'ponto',
      entidade: ['usuario', pessoa.id],
      descricao: 'Aviso para assinar a folha de ponto enviado no Teams',
      detalhes: { pessoa: pessoa.name, periodo: `${dataBR(inicio)} a ${dataBR(fim)}`, inicio, fim },
    })
    return res.status(201).json({ avisadoEm: new Date().toISOString(), avisadoPor: quemPede })
  } catch (erro) {
    return tratar(erro, res, 'ponto/lembrar')
  }
})

/* ------------------------------------------------------------
   Importar o Calculo Diario
   ------------------------------------------------------------ */

router.post('/importar', exigeSessao, exige(GERENCIAR), async (req, res) => {
  const conteudo = req.body?.conteudo
  if (typeof conteudo !== 'string' || !conteudo.trim()) {
    return res.status(400).json({ erro: 'Escolha o arquivo do Cálculo Diário (.csv).' })
  }
  if (conteudo.length > ARQUIVO_MAXIMO) {
    return res.status(413).json({ erro: 'O arquivo é grande demais. Importe um mês por vez.' })
  }
  const arquivo = String(req.body?.arquivo ?? '').slice(0, 200)
  if (arquivo && !/\.csv$/i.test(arquivo)) {
    return res.status(400).json({ erro: 'O arquivo precisa ser o .csv do Cálculo Diário.' })
  }

  /* a mesma leitura da tela: o servidor nao confia no que ela ja conferiu */
  const { registros, erros, semCpf } = lerCalculoDiario(conteudo)
  if (erros.length) {
    return res.status(400).json({
      erro: erros.length === 1 ? erros[0] : `O arquivo tem ${erros.length} problemas; nada foi importado.`,
      detalhes: erros.slice(0, 8),
    })
  }

  try {
    const contagem = await emTransacao(async (db) => {
      let novos = 0
      let alterados = 0
      for (let i = 0; i < registros.length; i += LOTE) {
        const lote = registros.slice(i, i + LOTE)
        const valores = []
        const linhas = lote.map((r) => {
          const marcas = COLUNAS.map((c) => {
            valores.push(r[campoDe(c)] === '' ? null : r[campoDe(c)])
            return `$${valores.length}`
          })
          valores.push(req.dono.sub)
          marcas.push(`$${valores.length}`)
          return `(${marcas.join(', ')})`
        })
        /* so troca o dia que mudou: o que veio igual nao mexe no
           importado_em, e nao volta no RETURNING */
        const conteudoDoDia = COLUNAS.filter((c) => c !== 'cpf' && c !== 'data')
        const { rows } = await db.query(
          `INSERT INTO ponto_dia (${COLUNAS.join(', ')}, importado_por)
           VALUES ${linhas.join(', ')}
           ON CONFLICT (cpf, data) DO UPDATE SET
             ${conteudoDoDia.map((c) => `${c} = EXCLUDED.${c}`).join(', ')},
             importado_em = now(), importado_por = EXCLUDED.importado_por
           WHERE (${conteudoDoDia.map((c) => `ponto_dia.${c}`).join(', ')})
                 IS DISTINCT FROM (${conteudoDoDia.map((c) => `EXCLUDED.${c}`).join(', ')})
           RETURNING (xmax = 0) AS novo`,
          valores,
        )
        rows.forEach((l) => (l.novo ? (novos += 1) : (alterados += 1)))
      }
      return { novos, alterados }
    })

    const resumo = resumoDoArquivo(registros)
    const cpfs = [...new Set(registros.map((r) => r.cpf))]
    const ligados = await query('SELECT cpf FROM usuario WHERE ativo AND cpf = ANY($1)', [cpfs])
    const comUsuario = new Set(ligados.rows.map((l) => l.cpf))
    const nomes = new Map(registros.map((r) => [r.cpf, r.nome]))
    const semUsuario = cpfs
      .filter((c) => !comUsuario.has(c))
      .map((c) => nomes.get(c))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))

    await registrarAtividade(req, {
      acao: 'ponto.importado',
      categoria: 'ponto',
      entidade: ['ponto', null],
      descricao: 'Folha de ponto importada',
      detalhes: {
        periodo: `${dataBR(resumo.inicio)} a ${dataBR(resumo.fim)}`,
        funcionarios: resumo.funcionarios,
        dias: resumo.dias,
      },
    })

    return res.status(201).json({
      ...resumo,
      novos: contagem.novos,
      alterados: contagem.alterados,
      iguais: registros.length - contagem.novos - contagem.alterados,
      semUsuario,
      semCpf,
    })
  } catch (erro) {
    return tratar(erro, res, 'ponto/importar')
  }
})

/* ------------------------------------------------------------
   Assinar a conferencia
   ------------------------------------------------------------ */

router.post('/assinar', exigeSessao, exige(VER), async (req, res) => {
  /* quem assina e sempre quem esta no token. Pedir por outra pessoa e
     recusado com o motivo, e nada e gravado */
  const pedido = req.body?.usuarioId
  if (pedido !== undefined && pedido !== null && String(pedido) !== String(req.dono.sub)) {
    return res.status(403).json({ erro: 'Só o próprio funcionário pode assinar a folha de ponto dele.' })
  }

  const periodo = lerPeriodo(req.body)
  if (periodo.erro) return res.status(400).json({ erro: periodo.erro })
  const { inicio, fim } = periodo

  /* o duplo check da tela: conferiu as marcacoes e concorda com elas */
  if (req.body?.conferi !== true || req.body?.concordo !== true) {
    return res.status(400).json({ erro: 'Marque as duas confirmações para assinar.' })
  }

  try {
    const eu = await usuarioPorId(req.dono.sub)
    if (!eu) return res.status(404).json({ erro: 'Usuário não encontrado.' })
    if (!eu.cpf) {
      return res.status(400).json({ erro: 'Seu cadastro ainda não tem CPF: sem ele a folha de ponto não aparece.' })
    }

    const atual = await resumoDe(eu.cpf, inicio, fim)
    if (atual.dias === 0) {
      return res.status(400).json({ erro: 'Não há marcações importadas neste período para assinar.' })
    }

    const ja = await assinaturaDe(eu.cpf, inicio, fim)
    if (ja?.valida) return res.status(409).json({ erro: 'Esta folha de ponto já está assinada.' })

    /* o nome impresso e o nome completo do sistema de ponto (o mesmo do
       cabecalho da folha); sem ele, o do cadastro */
    const { rows: doPonto } = await query(
      `SELECT nome FROM ponto_dia WHERE cpf = $1 AND data BETWEEN $2 AND $3 ORDER BY data DESC LIMIT 1`,
      [eu.cpf, inicio, fim],
    )
    const nome = String(doPonto[0]?.nome || eu.name).trim()

    const { rows } = await query(
      `INSERT INTO ponto_assinatura (usuario_id, cpf, inicio, fim, nome, resumo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING assinado_em`,
      [eu.id, eu.cpf, inicio, fim, nome, atual.resumo],
    )

    return res.status(201).json({
      assinatura: { nome, assinadoEm: rows[0].assinado_em, inicio, fim, valida: true },
    })
  } catch (erro) {
    return tratar(erro, res, 'ponto/assinar')
  }
})

export default router
