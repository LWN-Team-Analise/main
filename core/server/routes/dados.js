import { Router } from 'express'
import { emTransacao, query } from '../db.js'
import { cargoPode, exige, exigeSessao, meuCargo, tratar } from '../sessao.js'
import { enviarAviso, temEmail } from '../email.js'
import { logger } from '../logger.js'
import { descreverObra, registrarAtividade } from '../atividade.js'
import { notificar, pessoasDosSetores, todosAtivos } from '../push.js'
import { IMAGEM_INVALIDA, imagemValida } from '../utils/imagem.js'
import { proximaProposta } from '../../src/domain/proposta.js'
import {
  SERVICO_MAXIMO,
  UNIDADES_MAXIMO,
  UNIDADE_MAXIMA,
  chaveDaUnidade,
  enderecoNasUnidades,
  localDoEndereco,
  nomeCurtoDaUnidade,
  nomeDaUnidade,
  primeiraUnidade,
  rotuloDaUnidade,
  servicoDaUnidade,
} from '../../src/domain/clientes.js'
import { codigoDoPais, ehBrasil, paisValido } from '../../src/domain/paises.js'
import { NOME_MAXIMO, TIPO_LINK, linkValido, nomeDoLink } from '../../src/domain/anexos.js'
import {
  CONDICOES,
  LIMITES_ITEM,
  SERVICOS,
  TIPOS_DE_ITEM,
  rotuloDaCondicao,
  rotuloDoServico,
} from '../../src/domain/itensEnsaio.js'

const router = Router()

const soDigitos = (valor) => String(valor ?? '').replace(/\D/g, '')
const texto = (valor) => String(valor ?? '').trim()

/**
 * O nome de quem esta logado, tirado do BANCO pelo id do token.
 *
 * Mensagem, observacao e anexo guardam o nome do autor. Ele vinha do
 * corpo do pedido (`autorNome`), e bastava chamar a API na mao com
 * outro nome para a mensagem aparecer assinada por outra pessoa. O
 * `autorNome` que a tela ainda manda e ignorado.
 */
async function nomeDoDono(req) {
  const { rows } = await query('SELECT name FROM usuario WHERE id = $1', [req.dono.sub])
  return rows[0]?.name ?? 'Usuário'
}

/** Texto longo encurtado para o historico: a primeira linha, ate 120 letras. */
const resumo = (valor) => {
  const linha = String(valor ?? '').split('\n')[0].trim()
  return linha.length > 120 ? `${linha.slice(0, 119)}…` : linha
}

/* ============================================================
   OBRA FECHADA E REGISTRO, NAO RASCUNHO

   Depois que alguem clica em "Concluir obra", nada mais entra
   nela: nem mensagem no chat, nem observacao, nem etiqueta,
   nem anexo, nem check. A tela ja esconde os botoes; isto aqui
   e o que impede chamar a API na mao — e o que garante que a
   ficha de rastreabilidade continue valendo como registro.

   Usa-se como middleware, antes do handler:

       router.post('/obras/:id/x', exigeSessao, obraAberta, ...)

   O id da obra sai de req.params.id, que e como todas as rotas
   de dentro da obra ja se chamam.
   ============================================================ */

async function obraAberta(req, res, next) {
  try {
    const { rows } = await query('SELECT concluida_em FROM obra WHERE id = $1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ erro: 'Obra não encontrada.' })
    if (rows[0].concluida_em) {
      return res.status(409).json({
        erro: 'Esta obra foi concluída. O conteúdo dela fica só para consulta.',
      })
    }
    return next()
  } catch (erro) {
    /* banco ainda sem a coluna nova: nao trava o sistema, so deixa de
       proteger — quem rodar db/atualizacao-2.sql.txt ganha a trava */
    if (erro.code === '42703') return next()
    return tratar(erro, res, 'dados/obra-aberta')
  }
}

/* ============================================================
   LEITURA — tudo o que o quadro precisa, numa resposta so.

   Sao poucas tabelas e o volume e pequeno (uma empresa, um
   quadro): buscar tudo de uma vez sai mais barato que uma
   chamada por tela e mantem o front sem estado pela metade.

   Duas coisas ficam DE FORA de proposito, porque sao pesadas e
   so interessam quando a pessoa abre a obra:
     - o conteudo dos anexos (aqui vem so nome/tamanho);
     - o chat (tem rota propria, /obras/:id/chat).
   ============================================================ */

const paraSetor = (l) => ({
  id: String(l.id),
  nome: l.nome,
  cor: l.cor,
})
/**
 * 'AAAA-MM-DD' a partir do que o Postgres devolveu para uma coluna DATE.
 *
 * O driver entrega um Date em meia-noite LOCAL. Formatar isso com
 * toISOString() faria a data pular um dia para tras em qualquer fuso a
 * oeste de Greenwich — que e o nosso caso. Por isso as tres partes saem
 * do proprio calendario local, sem passar por UTC.
 */
/** Tabela que ainda nao existe (atualizacao nao rodada) vale como vazia. */
function semTabelaVazia(erro) {
  if (erro.code === '42P01') return { rows: [] }
  throw erro
}

function soData(valor) {
  if (!valor) return null
  if (typeof valor === 'string') return valor.slice(0, 10)
  const mes = String(valor.getMonth() + 1).padStart(2, '0')
  const dia = String(valor.getDate()).padStart(2, '0')
  return `${valor.getFullYear()}-${mes}-${dia}`
}

/**
 * Os dias da execucao (obra.execucao_dias, atualizacao 20), ou null
 * quando o periodo e corrido: obra de antes da atualizacao, ou periodo
 * gravado por quem ainda mandava so o inicio e o prazo.
 *
 * A lista so vale se o primeiro e o ultimo dia batem com
 * execucao_inicio e execucao_prazo. Uma gravacao que trocou so os dois
 * (o codigo antigo ainda no ar, depois do deploy) deixou a lista velha
 * para tras — e o que vale e o que foi gravado por ultimo.
 */
function diasDaExecucao(o) {
  const dias = Array.isArray(o.execucao_dias) ? o.execucao_dias.map(soData).filter(Boolean) : []
  if (dias.length === 0) return null
  if (dias[0] !== soData(o.execucao_inicio) || dias.at(-1) !== soData(o.execucao_prazo)) return null
  return dias
}

const paraCliente = (l) => ({
  id: String(l.id),
  nome: l.nome,
  /* vem antes dos outros em toda lista, nesta ordem (atualizacao 23) */
  ordemPrioridade: l.ordem_prioridade ?? null,
  /* Na carga LEVE (server/carga.js) a logo e a capa nao vem: so a
     `imagemVersao`, a impressao digital das duas. A tela reaproveita as
     que ja tem quando ela bate — sao ~1 MB que deixam de viajar a cada
     gravacao. Sem as colunas, as chaves nem aparecem. */
  ...('logo' in l ? { logo: l.logo, capa: l.capa ?? null } : {}),
  imagemVersao: l.imagem_versao ?? null,
  /* A MESMA imagem, em dois enquadramentos: `logo` e o quadrado do
     card, `capa` e a faixa larga do header da obra.

     Cliente cadastrado antes disto so tem `logo`: a capa cai nela e a
     tela continua igual ao que era.

     A imagem INTEIRA (logo_original) fica de fora de proposito. Ela so
     serve para reabrir o editor, e mandar uma copia dela por cliente em
     toda carga do quadro dobraria o peso da lista para uma coisa que a
     tela nem desenha. Quem precisa dela busca em /clientes/:id/imagem,
     no clique. */
  recorteLogo: l.recorte_logo ?? null,
  recorteCapa: l.recorte_capa ?? null,
  /* o setor e opcional: cliente antigo, ou ainda nao classificado, vem
     com null e a tela mostra "sem setor" */
  setorId: l.setor_id === null || l.setor_id === undefined ? null : String(l.setor_id),
  endereco: l.endereco ?? '',
  bairro: l.bairro ?? '',
  cidade: l.cidade ?? '',
  estado: l.estado ?? '',
  cep: l.cep ?? '',
  /* o pais do endereco (atualizacao 35); sem a coluna, o Brasil */
  pais: codigoDoPais(l.pais),
  /* quem cadastrou (ou responde pela) empresa e o proximo contato
     (atualizacao 27). Sem as colunas, os dois vem vazios. */
  proprietarioId: l.proprietario_id === null || l.proprietario_id === undefined ? null : String(l.proprietario_id),
  proximoContato: l.proximo_contato ?? null,
  pessoas: (l.pessoas ?? []).map((p) => ({
    id: String(p.id),
    nome: p.nome,
    cargo: p.cargo ?? '',
    email: p.email ?? '',
    telefone: p.telefone ?? '',
  })),
  /* a UNIDADE (atualizacao 33): o cliente de que ela e unidade, o lugar
     ("Anapolis") e o servico dela (atualizacao 34, "Faturamento"). O
     `nome` ja vem inteiro ("Albert Einstein Anapolis - Faturamento"); a
     logo, a capa e o setor vem os do cliente (ver lerClientes). */
  matrizId: l.matriz_id === null || l.matriz_id === undefined ? null : String(l.matriz_id),
  unidade: l.unidade ?? null,
  servico: l.servico ?? null,
  criadoEm: l.criado_em,
})

/* ============================================================
   TERMOS DA EMPRESA

   As palavras que a empresa pode trocar sem mexer no codigo.
   Hoje sao duas — o singular e o plural de "Etapa" —, porque o
   roteiro pode um dia se chamar Fase, Marco ou Frente, e nesse
   dia TODA tela que escreve "3ª Etapa" tem de acompanhar junto.

   Chave/valor, e nao colunas: termo novo e uma linha, nao uma
   migracao.

   Os padroes daqui sao a rede de seguranca de quem ainda nao
   rodou db/atualizacao-3.sql.txt — sem a tabela, o sistema
   continua dizendo "Etapa" em vez de quebrar.
   ============================================================ */

const TERMOS_PADRAO = { termo_etapa: 'Etapa', termo_etapas: 'Etapas' }

async function lerTermos() {
  try {
    const { rows } = await query('SELECT chave, valor FROM configuracao')
    const lidos = Object.fromEntries(rows.map((l) => [l.chave, l.valor]))
    return { ...TERMOS_PADRAO, ...lidos }
  } catch (erro) {
    if (erro.code === '42P01') return { ...TERMOS_PADRAO }
    throw erro
  }
}

/* As colunas do cliente que a tela usa. A logo_original fica de fora
   sempre (ver paraCliente); a logo e a capa, so na carga leve.

   `c` e a linha; `i` e de onde vem a imagem, o setor e a prioridade:
   o proprio cliente, ou — na UNIDADE (atualizacao 33) — o cliente dela,
   para o Einstein Anapolis ter a logo e o setor do Einstein. */
const COLUNAS_CLIENTE = `c.id, c.nome, i.recorte_logo, i.recorte_capa, i.setor_id, c.endereco, c.bairro,
  c.cidade, c.estado, c.cep, c.pais, c.criado_em, i.ordem_prioridade, c.proprietario_id, c.proximo_contato,
  c.matriz_id, c.unidade, c.servico,
  md5(coalesce(i.logo, '') || '|' || coalesce(i.capa, '')) AS imagem_versao`

/* banco com o servico das unidades e sem o pais (sem a atualizacao 35) */
const COLUNAS_CLIENTE_34 = COLUNAS_CLIENTE.replace(' c.pais,', '')

/* banco com as unidades e sem o servico delas (sem a atualizacao 34) */
const COLUNAS_CLIENTE_33 = COLUNAS_CLIENTE_34.replace(' c.servico,', '')

/* as unidades na ordem em que foram cadastradas: a unidade 1 (o endereco
   que o cliente tinha, com a data de cadastro dele) primeiro */
const ORDEM_CLIENTES = 'ORDER BY i.ordem_prioridade NULLS LAST, lower(i.nome), i.id, c.matriz_id NULLS FIRST, c.criado_em, c.id'

/* a mesma lista de antes das unidades (banco sem a atualizacao 33) */
const COLUNAS_CLIENTE_ANTIGAS = `id, nome, recorte_logo, recorte_capa, setor_id, endereco, bairro,
  cidade, estado, cep, criado_em, ordem_prioridade, proprietario_id, proximo_contato,
  md5(coalesce(logo, '') || '|' || coalesce(capa, '')) AS imagem_versao`

async function lerClientes(imagens) {
  const [clientes, pessoas] = await Promise.all([
    query(
      /* os prioritarios (as unidades da LWN, atualizacao 23) primeiro, na
         ordem deles; cada unidade logo depois do cliente dela */
      `SELECT ${COLUNAS_CLIENTE}${imagens ? ', i.logo, i.capa' : ''}
         FROM cliente c
         JOIN cliente i ON i.id = coalesce(c.matriz_id, c.id)
        ${ORDEM_CLIENTES}`,
    )
      .catch((erro) => {
        /* banco sem o pais: o endereco e todo do Brasil */
        if (erro.code !== '42703') throw erro
        return query(
          `SELECT ${COLUNAS_CLIENTE_34}${imagens ? ', i.logo, i.capa' : ''}
             FROM cliente c
             JOIN cliente i ON i.id = coalesce(c.matriz_id, c.id)
            ${ORDEM_CLIENTES}`,
        )
      })
      .catch((erro) => {
        /* banco sem o servico das unidades: as unidades sem ele */
        if (erro.code !== '42703') throw erro
        return query(
          `SELECT ${COLUNAS_CLIENTE_33}${imagens ? ', i.logo, i.capa' : ''}
             FROM cliente c
             JOIN cliente i ON i.id = coalesce(c.matriz_id, c.id)
            ${ORDEM_CLIENTES}`,
        )
      })
      .catch((erro) => {
        /* banco sem as unidades: a lista de antes */
        if (erro.code !== '42703') throw erro
        return query(
          `SELECT ${COLUNAS_CLIENTE_ANTIGAS}${imagens ? ', logo, capa' : ''} FROM cliente ORDER BY ordem_prioridade NULLS LAST, lower(nome)`,
        )
      })
      .catch((erro) => {
        /* banco antigo, sem alguma das colunas: tudo, com as imagens */
        if (erro.code !== '42703') throw erro
        return query('SELECT * FROM cliente ORDER BY lower(nome)')
      }),
    /* as pessoas de contato (atualizacao 27); sem a tabela, ninguem */
    query('SELECT id, cliente_id, nome, cargo, email, telefone FROM cliente_pessoa ORDER BY cliente_id, ordem, id').catch(
      (erro) => {
        if (erro.code !== '42P01') throw erro
        return { rows: [] }
      },
    ),
  ])
  const porCliente = new Map()
  pessoas.rows.forEach((p) => {
    const chave = String(p.cliente_id)
    if (!porCliente.has(chave)) porCliente.set(chave, [])
    porCliente.get(chave).push(p)
  })
  clientes.rows.forEach((c) => {
    c.pessoas = porCliente.get(String(c.id)) ?? []
  })
  return clientes
}

/**
 * O quadro inteiro. `imagens: false` e a carga leve: os clientes vem
 * sem a logo e a capa (so a versao delas).
 */
export async function lerTudo(usuarioId, { imagens = true } = {}) {
  const [
    clientes,
    setores,
    obras,
    marcados,
    membros,
    observacoes,
    avisos,
    avisoCargos,
    avaliacoes,
    quadro,
    etiquetas,
    obraEtiquetas,
    anexos,
    lidos,
    termos,
    prazosEtapa,
    prazosCheck,
    ensaios,
    obraEnsaios,
    progressos,
    reservas,
    itensObra,
    linhasItem,
    parciais,
    horarios,
    horarioMembros,
  ] = await Promise.all([
    lerClientes(imagens),
    /* os setores vem junto: sao poucos e a tela de Clientes precisa
       deles para pintar a etiqueta de cada card */
    query('SELECT * FROM setor_cliente ORDER BY lower(nome)').catch(() => ({ rows: [] })),
    /* concluida_em sai da COLUNA da obra (o clique em "Concluir obra"),
       e nao mais da view obra_conclusao — que agora responde outra
       pergunta: "ja marcaram todos os checks?" */
    query(`SELECT o.*,
                  autor.name  AS criado_por_nome,
                  editor.name AS atualizado_por_nome,
                  fim.name    AS concluida_por_nome
             FROM obra o
             LEFT JOIN usuario autor    ON autor.id  = o.criado_por
             LEFT JOIN usuario editor   ON editor.id = o.atualizado_por
             LEFT JOIN usuario fim      ON fim.id    = o.concluida_por
            ORDER BY o.criado_em`),
    /* a resposta Sim/Nao vem da atualizacao 13; sem ela, os checks vem
       como sempre vieram (todos comuns) */
    query('SELECT obra_id, check_id, feito_por, feito_em, resposta FROM obra_check').catch((erro) => {
      if (erro.code !== '42703') throw erro
      return query('SELECT obra_id, check_id, feito_por, feito_em FROM obra_check')
    }),
    query('SELECT obra_id, usuario_id FROM obra_membro'),
    query('SELECT * FROM obra_observacao ORDER BY enviada_em DESC'),
    query(`SELECT a.*, u.name AS enviado_por_nome
             FROM obra_aviso a LEFT JOIN usuario u ON u.id = a.enviado_por
            ORDER BY a.enviado_em DESC`),
    query(`SELECT ac.aviso_id, c.chave
             FROM obra_aviso_cargo ac JOIN cargo c ON c.id = ac.cargo_id`),
    query('SELECT * FROM obra_avaliacao_item ORDER BY avaliado_em'),
    query('SELECT * FROM observacao_quadro ORDER BY enviada_em DESC'),
    query('SELECT * FROM etiqueta ORDER BY lower(nome)'),
    query('SELECT obra_id, etiqueta_id FROM obra_etiqueta'),
    query(
      `SELECT id, obra_id, nome, tipo, tamanho, autor_nome, enviado_por, enviado_em,
              CASE WHEN tipo = $1 THEN conteudo END AS link
         FROM obra_anexo ORDER BY enviado_em DESC`,
      [TIPO_LINK],
    ),
    query('SELECT aviso_id FROM aviso_leitura WHERE usuario_id = $1', [usuarioId]),
    lerTermos(),
    /* os prazos (atualizacao 13). Sem as tabelas, nenhuma obra tem prazo
       de etapa ou de check — e o quadro continua de pe */
    query('SELECT obra_id, etapa_id, prazo FROM obra_prazo_etapa').catch(semTabelaVazia),
    query('SELECT obra_id, check_id, prazo FROM obra_prazo_check').catch(semTabelaVazia),
    /* os ensaios (atualizacao 14): o catalogo, os planejados de cada
       obra e a execucao dia a dia. Sem as tabelas, nenhuma obra tem
       ensaio — e o resto do quadro continua de pe */
    query('SELECT * FROM ensaio ORDER BY ordem, lower(nome), id').catch(semTabelaVazia),
    query('SELECT obra_id, ensaio_id, ordem FROM obra_ensaio ORDER BY ordem, ensaio_id').catch(
      semTabelaVazia,
    ),
    query(`SELECT p.obra_id, p.ensaio_id, p.dia, p.percentual, p.registrado_por, p.registrado_em
             FROM obra_ensaio_progresso p ORDER BY p.dia`).catch(semTabelaVazia),
    /* a reserva de carro de cada obra (atualizacao 23) e a saida que
       retirou o carro. Sem a tabela, nenhuma obra tem reserva */
    query(`SELECT r.obra_id, r.veiculo_id, r.reservado_em, r.registro_id,
                  v.nome AS veiculo_nome, v.placa, u.name AS reservado_por_nome,
                  vr.data AS retirada_data, to_char(vr.hora, 'HH24:MI') AS retirada_hora,
                  vr.condutor_nome AS retirada_condutor, vr.km AS retirada_km
             FROM obra_reserva_veiculo r
             LEFT JOIN veiculo v           ON v.id = r.veiculo_id
             LEFT JOIN usuario u           ON u.id = r.reservado_por
             LEFT JOIN veiculo_registro vr ON vr.id = r.registro_id`).catch(semTabelaVazia),
    /* os ensaios POR ITEM (atualizacao 25): os itens de cada obra e as
       linhas (item + ensaio + condicao), com o resultado da execucao.
       Sem as tabelas, nenhuma obra tem item */
    query('SELECT * FROM obra_item ORDER BY ordem, id').catch(semTabelaVazia),
    query(`SELECT l.*, u.name AS registrado_por_nome
             FROM obra_item_ensaio l
             LEFT JOIN usuario u ON u.id = l.registrado_por
            ORDER BY l.item_id, l.ordem, l.id`).catch(semTabelaVazia),
    /* os membros parciais (atualizacao 30): incluidos a mao, com a
       resposta de cada um. Sem a tabela, nenhuma obra tem */
    query(`SELECT p.obra_id, p.usuario_id, p.status, p.motivo, p.incluido_por, p.incluido_em,
                  p.respondido_em, u.name AS incluido_por_nome
             FROM obra_membro_parcial p
             LEFT JOIN usuario u ON u.id = p.incluido_por
            ORDER BY p.incluido_em`).catch(semTabelaVazia),
    /* os horarios dos checks com horario (atualizacao 31): cada data da
       obra com o ponto de encontro e quem vai. Sem as tabelas, nenhum */
    query(`SELECT obra_id, check_id, to_char(dia, 'YYYY-MM-DD') AS dia, to_char(hora, 'HH24:MI') AS hora
             FROM obra_horario ORDER BY dia`).catch(semTabelaVazia),
    query(`SELECT obra_id, check_id, to_char(dia, 'YYYY-MM-DD') AS dia, usuario_id
             FROM obra_horario_membro`).catch(semTabelaVazia),
  ])

  const junta = (linhas, chave, monta) => {
    const mapa = {}
    linhas.forEach((l) => {
      const lista = mapa[l[chave]] ?? []
      lista.push(monta(l))
      mapa[l[chave]] = lista
    })
    return mapa
  }

  const checksDaObra = {}
  marcados.rows.forEach((l) => {
    const mapa = checksDaObra[l.obra_id] ?? {}
    mapa[String(l.check_id)] = {
      feitoPor: l.feito_por === null ? null : String(l.feito_por),
      feitoEm: l.feito_em,
      /* so em card de pergunta: true = sim, false = nao */
      resposta: l.resposta ?? null,
    }
    checksDaObra[l.obra_id] = mapa
  })

  /* prazo de cada etapa e de cada check, por obra, como 'AAAA-MM-DD' */
  const prazosDaObra = {}
  const prazoDe = (obraId) =>
    (prazosDaObra[obraId] ??= { etapas: {}, checks: {} })
  prazosEtapa.rows.forEach((l) => {
    prazoDe(l.obra_id).etapas[String(l.etapa_id)] = soData(l.prazo)
  })
  prazosCheck.rows.forEach((l) => {
    prazoDe(l.obra_id).checks[String(l.check_id)] = soData(l.prazo)
  })

  /* os ensaios planejados de cada obra, na ordem em que foram postos,
     e a execucao: ensaio -> [{ dia, percentual }] do dia mais antigo ao
     mais novo. O percentual de um dia e quanto o ensaio estava feito
     NAQUELE dia — o mais recente e o andamento de agora */
  const ensaiosDaObra = junta(obraEnsaios.rows, 'obra_id', (l) => String(l.ensaio_id))
  const execucaoDaObra = {}
  progressos.rows.forEach((l) => {
    const daObra = (execucaoDaObra[l.obra_id] ??= {})
    const lista = (daObra[String(l.ensaio_id)] ??= [])
    lista.push({
      dia: soData(l.dia),
      percentual: Number(l.percentual),
      registradoPor: l.registrado_por === null ? null : String(l.registrado_por),
      registradoEm: l.registrado_em,
    })
  })

  const membrosDaObra = junta(membros.rows, 'obra_id', (l) => String(l.usuario_id))
  /* o membro parcial que ACEITOU e membro como qualquer outro: fotos da
     obra, "em andamento" da pessoa, avaliacoes, chat. Pendente e
     recusado ficam so na lista de parciais da obra */
  parciais.rows.forEach((l) => {
    if (l.status !== 'aceito') return
    const lista = (membrosDaObra[l.obra_id] ??= [])
    if (!lista.includes(String(l.usuario_id))) lista.push(String(l.usuario_id))
  })
  /* obra -> check -> [{ dia, hora, membros }] */
  const quemVai = {}
  horarioMembros.rows.forEach((l) => {
    const chave = `${l.obra_id}|${l.check_id}|${l.dia}`
    ;(quemVai[chave] ??= []).push(String(l.usuario_id))
  })
  const horariosDaObra = {}
  horarios.rows.forEach((l) => {
    const daObra = (horariosDaObra[l.obra_id] ??= {})
    ;(daObra[String(l.check_id)] ??= []).push({
      dia: l.dia,
      hora: l.hora,
      membros: quemVai[`${l.obra_id}|${l.check_id}|${l.dia}`] ?? [],
    })
  })

  const parciaisDaObra = junta(parciais.rows, 'obra_id', (l) => ({
    usuarioId: String(l.usuario_id),
    status: l.status,
    motivo: l.motivo ?? '',
    incluidoPor: l.incluido_por === null ? null : String(l.incluido_por),
    incluidoPorNome: l.incluido_por_nome ?? null,
    incluidoEm: l.incluido_em,
    respondidoEm: l.respondido_em ?? null,
  }))
  const obsDaObra = junta(observacoes.rows, 'obra_id', (l) => ({
    id: String(l.id),
    autorId: l.usuario_id === null ? null : String(l.usuario_id),
    autorNome: l.autor_nome,
    texto: l.texto,
    enviadaEm: l.enviada_em,
    editadaEm: l.editada_em ?? null,
  }))

  const jaLidos = new Set(lidos.rows.map((l) => String(l.aviso_id)))
  const cargosDoAviso = junta(avisoCargos.rows, 'aviso_id', (l) => l.chave)
  const avisosDaObra = junta(avisos.rows, 'obra_id', (l) => ({
    id: String(l.id),
    etapa: l.etapa,
    mensagem: l.mensagem ?? '',
    setores: cargosDoAviso[l.id] ?? [],
    enviadoEm: l.enviado_em,
    enviadoPorNome: l.enviado_por_nome ?? null,
    lido: jaLidos.has(String(l.id)),
  }))

  /* a obra tem N notas (diretor, cliente, ...); a media delas e o que
     entra na media de cada participante — o gatilho do banco cuida */
  const notasDaObra = junta(avaliacoes.rows, 'obra_id', (l) => ({
    id: String(l.id),
    rotulo: l.rotulo,
    nota: Number(l.nota),
    descricao: l.descricao ?? '',
    avaliadaEm: l.avaliado_em,
  }))

  const etiquetasDaObra = junta(obraEtiquetas.rows, 'obra_id', (l) => String(l.etiqueta_id))

  /* os itens de cada obra, cada um com as linhas dele. Linha com data
     = feita: o resultado, o conforme e a observacao vem junto */
  const linhasDoItem = junta(linhasItem.rows, 'item_id', (l) => ({
    id: String(l.id),
    ensaioId: String(l.ensaio_id),
    condicao: l.condicao,
    data: soData(l.data ?? null),
    resultado: l.resultado ?? '',
    conforme: l.conforme ?? null,
    observacao: l.observacao ?? '',
    registradoPor: l.registrado_por === null ? null : String(l.registrado_por),
    registradoPorNome: l.registrado_por_nome ?? null,
    registradoEm: l.registrado_em ?? null,
  }))
  const itensDaObra = junta(itensObra.rows, 'obra_id', (l) => ({
    id: String(l.id),
    tipo: l.tipo,
    nome: l.nome,
    tag: l.tag ?? '',
    classe: l.classe ?? '',
    gas: l.gas ?? '',
    observacao: l.observacao ?? '',
    linhas: linhasDoItem[l.id] ?? [],
  }))
  /* veiculoId null = a obra nao vai usar carro da frota */
  const reservaDaObra = Object.fromEntries(
    reservas.rows.map((l) => [
      l.obra_id,
      {
        veiculoId: l.veiculo_id === null ? null : String(l.veiculo_id),
        veiculoNome: l.veiculo_nome ?? null,
        placa: l.placa ?? '',
        reservadoPorNome: l.reservado_por_nome ?? null,
        reservadoEm: l.reservado_em,
        retirada: l.registro_id
          ? {
              registroId: String(l.registro_id),
              data: l.retirada_data,
              hora: l.retirada_hora,
              condutorNome: l.retirada_condutor,
              km: l.retirada_km,
            }
          : null,
      },
    ]),
  )
  const anexosDaObra = junta(anexos.rows, 'obra_id', (l) => ({
    id: String(l.id),
    nome: l.nome,
    tipo: l.tipo ?? '',
    tamanho: l.tamanho ?? 0,
    /* o link (Google Drive, OneDrive...): abre direto, sem passar pela API */
    link: l.link ?? null,
    autorNome: l.autor_nome,
    enviadoPor: l.enviado_por === null ? null : String(l.enviado_por),
    enviadoEm: l.enviado_em,
  }))

  const media = (notas) => {
    if (!notas?.length) return null
    const soma = notas.reduce((total, n) => total + n.nota, 0)
    return {
      nota: Math.round((soma / notas.length) * 10) / 10,
      descricao: notas.map((n) => n.descricao).filter(Boolean).join(' | '),
      avaliadaEm: notas[notas.length - 1].avaliadaEm,
    }
  }

  return {
    termos,
    clientes: clientes.rows.map(paraCliente),
    setores: setores.rows.map(paraSetor),
    /* o catalogo inteiro, inclusive o que saiu (ativo = false): a obra
       que ja planejou um ensaio retirado continua mostrando o nome dele */
    ensaios: ensaios.rows.map(paraEnsaio),
    etiquetas: etiquetas.rows.map((l) => ({
      id: String(l.id),
      nome: l.nome,
      cor: l.cor,
    })),
    obras: obras.rows.map((o) => ({
      id: String(o.id),
      clienteId: String(o.cliente_id),
      /* o n. da proposta vem na frente do nome do cliente no card e no
         titulo da obra: e por ele que ela e procurada na empresa */
      proposta: o.proposta ?? '',
      descricao: o.descricao ?? '',
      tipo: o.tipo,
      prioridade: o.prioridade,
      dataInicio: o.data_inicio,
      /* o prazo que se escolhia no cadastro — so obras antigas tem; fica
         como historico (painel de atraso das fechadas, exportacao). O
         prazo final de agora e o dia do ultimo check (tela) */
      dataConclusao: o.data_conclusao,
      /* a entrada em campo — o periodo de execucao vai daqui ate o
         prazo da execucao. null = ainda nao definida (vale o inicio da obra) */
      execucaoInicio: soData(o.execucao_inicio ?? null),
      /* o prazo da ETAPA DE EXECUCAO (3a) — nao o da obra inteira. null =
         ainda nao definido */
      execucaoPrazo: soData(o.execucao_prazo ?? null),
      /* os dias da execucao, escolhidos um a um (atualizacao 20). null =
         periodo corrido, do inicio ao prazo da execucao */
      execucaoDias: diasDaExecucao(o),
      /* a obra ja tem os checks PROPRIOS (atualizacao 18): le so eles,
         e nao mais o roteiro */
      checksProprios: o.checks_proprios === true,
      criadoEm: o.criado_em,
      criadoPor: o.criado_por === null ? null : String(o.criado_por),
      criadoPorNome: o.criado_por_nome ?? null,
      atualizadoEm: o.atualizado_em,
      atualizadoPor: o.atualizado_por === null ? null : String(o.atualizado_por),
      atualizadoPorNome: o.atualizado_por_nome ?? null,
      /* os tres so aparecem na aba Concluidas; na obra aberta sao null */
      concluidaEm: o.concluida_em ?? null,
      concluidaPor:
        o.concluida_por === null || o.concluida_por === undefined
          ? null
          : String(o.concluida_por),
      concluidaPorNome: o.concluida_por_nome ?? null,
      conclusaoObs: o.conclusao_obs ?? '',
      checks: checksDaObra[o.id] ?? {},
      prazos: prazosDaObra[o.id] ?? { etapas: {}, checks: {} },
      ensaios: ensaiosDaObra[o.id] ?? [],
      execucao: execucaoDaObra[o.id] ?? {},
      /* o tipo de servico (atualizacao 25) e os itens com as linhas.
         itens vazio = a obra nao planeja por item */
      servico: o.servico ?? null,
      itens: itensDaObra[o.id] ?? [],
      membros: membrosDaObra[o.id] ?? [],
      /* os incluidos a mao: pendente, aceito ou recusado (com o motivo) */
      parciais: parciaisDaObra[o.id] ?? [],
      /* check com horario -> [{ dia, hora, membros }] (atualizacao 31) */
      horarios: horariosDaObra[o.id] ?? {},
      observacoes: obsDaObra[o.id] ?? [],
      avisos: avisosDaObra[o.id] ?? [],
      etiquetas: etiquetasDaObra[o.id] ?? [],
      anexos: anexosDaObra[o.id] ?? [],
      reserva: reservaDaObra[o.id] ?? null,
      notas: notasDaObra[o.id] ?? [],
      avaliacao: media(notasDaObra[o.id]),
    })),
    observacoesQuadro: quadro.rows.map((l) => ({
      id: String(l.id),
      autorId: l.usuario_id === null ? null : String(l.usuario_id),
      autorNome: l.autor_nome,
      texto: l.texto,
      enviadaEm: l.enviada_em,
      editadaEm: l.editada_em ?? null,
      /* A janela de validade, quando tem. Vai como 'AAAA-MM-DD' seco:
         a data e a mesma em qualquer fuso, e mandar um timestamp faria
         "ate 05/09" virar 04/09 para quem esta a oeste de Greenwich. */
      inicioEm: soData(l.inicio_em),
      fimEm: soData(l.fim_em),
    })),
  }
}

router.get('/', exigeSessao, async (req, res) => {
  try {
    return res.json(await lerTudo(req.dono.sub))
  } catch (erro) {
    return tratar(erro, res, 'dados/ler')
  }
})

/* ============================================================
   VITRINE — as logos dos clientes que giram na esfera do login

   E a UNICA rota de dados sem sessao, e de proposito: a esfera
   fica na tela de login, antes de existir token.

   Por isso ela devolve so a imagem, nada mais: nem nome, nem id,
   nem endereco. Quem abrir a resposta na mao ve um punhado de
   logos — a mesma coisa que ja ve na tela — e nada que ligue uma
   logo a um cadastro.

   O filtro `logo IS NOT NULL` e o que atende ao pedido de so
   aparecer quem TEM foto: cliente cadastrado sem logo (o "teste"
   da vida) simplesmente nao entra na esfera.
   ============================================================ */

const LIMITE_VITRINE = 24

router.get('/vitrine', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT logo FROM cliente
         WHERE logo IS NOT NULL AND logo <> ''
         ORDER BY lower(nome)
         LIMIT $1`,
      [LIMITE_VITRINE],
    )
    return res.json({ fotos: rows.map((l) => l.logo) })
  } catch (erro) {
    /* a esfera tem foto de reserva; um banco fora do ar nao pode
       derrubar a tela de login por causa de enfeite */
    logger.error('dados/vitrine', erro.message)
    return res.json({ fotos: [] })
  }
})

/* ------------------------------------------------------------
   Trocar um termo

   Mexer no vocabulario do sistema inteiro nao e edicao de
   cadastro: e configuracao. Por isso pede "editar_etapa" — quem
   ja manda no roteiro e quem decide como o roteiro se chama.
   ------------------------------------------------------------ */

const TERMOS_ACEITOS = Object.keys(TERMOS_PADRAO)

router.patch('/termos', exigeSessao, exige('editar_etapa'), async (req, res) => {
  const mudancas = Object.entries(req.body ?? {})
    .filter(([chave]) => TERMOS_ACEITOS.includes(chave))
    .map(([chave, valor]) => [chave, texto(valor)])

  if (mudancas.length === 0) return res.status(400).json({ erro: 'Nada para alterar.' })
  if (mudancas.some(([, valor]) => !valor)) {
    return res.status(400).json({ erro: 'O termo não pode ficar em branco.' })
  }
  if (mudancas.some(([, valor]) => valor.length > 30)) {
    return res.status(400).json({ erro: 'Use no máximo 30 caracteres.' })
  }

  try {
    for (const [chave, valor] of mudancas) {
      await query(
        `INSERT INTO configuracao (chave, valor, atualizado_por)
         VALUES ($1, $2, $3)
         ON CONFLICT (chave) DO UPDATE
            SET valor = excluded.valor,
                atualizado_em = now(),
                atualizado_por = excluded.atualizado_por`,
        [chave, valor, req.dono.sub],
      )
    }
    await registrarAtividade(req, {
      acao: 'termos.alterados',
      categoria: 'configuracao',
      descricao: 'Termos da empresa alterados',
      detalhes: Object.fromEntries(mudancas),
    })
    return res.json({ termos: await lerTermos() })
  } catch (e) {
    return tratar(e, res, 'dados/termos')
  }
})

/* ============================================================
   CLIENTES
   ============================================================ */

const ESTADO_MAXIMO = 80

const SEM_ENDERECO_NOVO =
  'O banco ainda não tem o endereço nas unidades e o país do cliente (atualização 35 em core/db). Rode npm run db:atualizar e suba a API de novo.'

/* a atualizacao 35 ja rodou? O "sim" fica guardado; o "nao" se pergunta
   de novo, para nao precisar subir a API outra vez depois do db:atualizar */
let comAtualizacao35 = false
async function bancoComPais() {
  if (comAtualizacao35) return true
  const { rows } = await query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cliente' AND column_name = 'pais'`,
  )
  comAtualizacao35 = rows.length > 0
  return comAtualizacao35
}

/** O banco sem a atualizacao 35 so guarda endereco do Brasil, e sem a coluna do pais. */
function semPaisNoBanco(linha) {
  if (!('pais' in linha)) return { linha }
  if (!ehBrasil(linha.pais)) return { erro: SEM_ENDERECO_NOVO }
  const { pais, ...resto } = linha
  return { linha: resto }
}

/**
 * O endereco que veio da tela (do cliente ou de uma unidade), no formato
 * do banco. No Brasil o estado e a UF e o CEP tem 8 digitos; fora dele o
 * estado e o nome ("Florida" — e pode faltar: Monaco nao tem) e o codigo
 * postal e livre. `qual` e a unidade, nos recados.
 *
 * Devolve { erro } ou { endereco }.
 */
function lerEndereco(corpo, qual = '') {
  const da = qual ? ` da unidade ${qual}` : ''
  const pais = codigoDoPais(corpo?.pais)
  if (!paisValido(pais)) return { erro: `Escolha o país${da}.` }
  const cidade = texto(corpo?.cidade)
  if (!cidade) return { erro: `Informe a cidade${da}.` }
  const comum = { pais, endereco: texto(corpo?.endereco) || null, bairro: texto(corpo?.bairro) || null, cidade }

  if (ehBrasil(pais)) {
    const estado = texto(corpo?.estado).toUpperCase()
    const cep = soDigitos(corpo?.cep)
    if (!/^[A-Z]{2}$/.test(estado)) return { erro: qual ? `Informe o estado${da}.` : 'Informe a UF com duas letras.' }
    if (cep && cep.length !== 8) return { erro: `O CEP${da} precisa ter 8 dígitos.` }
    return { endereco: { ...comum, estado, cep: cep || null } }
  }

  const estado = texto(corpo?.estado)
  const cep = texto(corpo?.cep).toUpperCase().replace(/\s+/g, ' ')
  if (estado.length > ESTADO_MAXIMO) return { erro: `O estado${da} passa de ${ESTADO_MAXIMO} letras.` }
  if (cep && !/^[A-Z0-9 -]{1,12}$/.test(cep)) return { erro: `O código postal${da} aceita até 12 letras e números.` }
  return { endereco: { ...comum, estado: estado || null, cep: cep || null } }
}

/**
 * Campos do cliente vindos da tela, ja no formato do banco: { coluna: valor }.
 *
 * O cliente com unidade (`vitrine`) nao tem endereco: o que vier nem e
 * lido, e quem grava tira o que havia (enderecoSaiDoCliente).
 */
function camposCliente(corpo, { vitrine = false } = {}) {
  const nome = texto(corpo?.nome)
  if (!nome) return { erro: 'Informe o nome da empresa.' }
  /* setor vazio vira NULL, e nao a string "": a coluna e uma chave
     estrangeira e so aceita id de verdade ou nada */
  const setor = texto(corpo?.setorId) || null
  if (vitrine) return { campos: { nome, setor_id: setor } }

  const { erro, endereco } = lerEndereco(corpo)
  if (erro) return { erro }
  return { campos: { nome, ...endereco, setor_id: setor } }
}

/** Quantas unidades o cliente tem no banco (0 no banco sem a atualizacao 33). */
async function contarUnidades(clienteId) {
  try {
    const { rows } = await query('SELECT count(*)::int AS n FROM cliente WHERE matriz_id = $1', [clienteId])
    return rows[0]?.n ?? 0
  } catch (erro) {
    if (erro.code === '42703') return 0
    throw erro
  }
}

/**
 * O cliente com unidade fica sem endereco proprio: ele e a vitrine, e o
 * endereco e o de cada unidade (src/domain/clientes.js). Roda depois de
 * toda gravacao que pode ter dado a ele a primeira unidade — e quem
 * chama ja levou o endereco dele para a unidade 1. Sem unidade, nao
 * mexe em nada.
 */
async function enderecoSaiDoCliente(clienteId, db = { query }) {
  try {
    await db.query(
      `UPDATE cliente c SET endereco = NULL, bairro = NULL, cep = NULL, cidade = NULL, estado = NULL
        WHERE c.id = $1 AND c.cidade IS NOT NULL
          AND EXISTS (SELECT 1 FROM cliente u WHERE u.matriz_id = c.id)`,
      [clienteId],
    )
  } catch (erro) {
    /* banco sem as unidades: ninguem e vitrine */
    if (erro.code !== '42703') throw erro
  }
}

/**
 * A linha da unidade no banco: { coluna: valor }. O nome e o inteiro
 * ("Albert Einstein Anapolis - Faturamento"); `servico` so no banco com a
 * atualizacao 34.
 */
const linhaDaUnidade = (u, nomeDoCliente, comServico) => ({
  nome: nomeDaUnidade(nomeDoCliente, u.unidade, u.servico),
  unidade: u.unidade || null,
  endereco: u.endereco || null,
  bairro: u.bairro || null,
  cidade: u.cidade,
  estado: u.estado || null,
  cep: u.cep || null,
  pais: codigoDoPais(u.pais),
  ...(comServico ? { servico: u.servico || null } : {}),
})

/* "(a, b) VALUES ($1, $2)" e os valores, para o INSERT de uma linha { coluna: valor } */
function paraInserir(linha) {
  const colunas = Object.keys(linha)
  return [`(${colunas.join(', ')}) VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(linha)]
}

/* "a = $1, b = $2" e os valores, para o UPDATE; o WHERE usa os $ seguintes */
function paraAtualizar(linha) {
  const colunas = Object.keys(linha)
  return [colunas.map((coluna, i) => `${coluna} = $${i + 1}`).join(', '), Object.values(linha)]
}

/**
 * O endereco que o cliente ainda tem, quando ele ja tem unidade, vira a
 * UNIDADE 1 (primeiraUnidade) — com a data de cadastro dele, para vir
 * antes das outras — e sai dele. E o caminho de quem cria unidade sem a
 * lista do cadastro: o "Unidade de" e a API chamada direto. Pede a
 * atualizacao 35 (quem chama confere antes).
 */
async function enderecoViraUnidade(clienteId) {
  await emTransacao(async (db) => {
    const { rows } = await db.query(
      `SELECT id, nome, endereco, bairro, cidade, estado, cep, pais, criado_em
         FROM cliente WHERE id = $1 AND matriz_id IS NULL FOR UPDATE`,
      [clienteId],
    )
    const cliente = rows[0]
    if (!cliente?.cidade) return
    const { rows: irmas } = await db.query(
      'SELECT unidade, servico, endereco, cidade, estado, cep, pais FROM cliente WHERE matriz_id = $1',
      [clienteId],
    )
    if (!irmas.length) return
    const primeira = primeiraUnidade(cliente, irmas)
    if (primeira) {
      const [partes, valores] = paraInserir({
        ...linhaDaUnidade(primeira, cliente.nome, true),
        matriz_id: cliente.id,
        criado_em: cliente.criado_em,
      })
      await db.query(`INSERT INTO cliente ${partes}`, valores)
    }
    await enderecoSaiDoCliente(cliente.id, db)
  })
}

/**
 * O endereco que veio no corpo junto com as unidades (a tela de antes
 * desta versao, ou a API chamada direto) vira a unidade 1, na frente das
 * outras. A tela de agora ja manda a unidade 1 pronta (`doCliente`) e o
 * endereco do cliente vazio: ai nao ha o que fazer.
 */
function comAPrimeira(corpo, unidades, nomeDoCliente) {
  if (!unidades?.length || unidades.some((u) => u.doCliente) || !texto(corpo?.cidade)) return unidades
  const { endereco } = lerEndereco(corpo)
  const primeira = endereco && primeiraUnidade({ nome: nomeDoCliente, ...endereco }, unidades)
  if (!primeira) return unidades
  const lida = lerUnidade({ ...primeira, doCliente: true }, nomeDoCliente)
  return lida.unidade ? [lida.unidade, ...unidades] : unidades
}

const PESSOAS_MAXIMO = 50

/**
 * Uma UNIDADE como veio da tela: o lugar ("Anapolis"), o servico
 * ("Faturamento", atualizacao 34) — um dos dois, pelo menos — e o
 * endereco. `doCliente` marca a unidade 1, a que nasceu do endereco do
 * cliente: nova, ela ganha a data de cadastro dele. Devolve { erro } ou
 * { unidade }.
 */
function lerUnidade(u, nomeDoCliente) {
  const curto = nomeCurtoDaUnidade(nomeDoCliente, u?.unidade)
  const servico = servicoDaUnidade(nomeDoCliente, u?.servico)
  if (!curto && !servico) return { erro: 'Dê um nome ou um serviço a cada unidade (ex.: Anápolis, Faturamento).' }
  if (curto.length > UNIDADE_MAXIMA) return { erro: `O nome da unidade passa de ${UNIDADE_MAXIMA} letras.` }
  if (servico.length > SERVICO_MAXIMO) return { erro: `O serviço da unidade passa de ${SERVICO_MAXIMO} letras.` }
  const qual = rotuloDaUnidade({ unidade: curto, servico })
  const { erro, endereco } = lerEndereco(u, qual)
  if (erro) return { erro }
  return {
    unidade: {
      id: /^\d{1,15}$/.test(texto(u?.id)) ? texto(u.id) : null,
      unidade: curto || null,
      servico: servico || null,
      ...endereco,
      doCliente: u?.doCliente === true,
      chave: chaveDaUnidade(nomeDoCliente, curto, servico),
      rotulo: qual,
    },
  }
}

/**
 * As UNIDADES do cliente (atualizacao 33), como vieram da tela: a lista
 * inteira, como as pessoas — a que veio com id e atualizada, a sem id
 * e nova, a que sumiu sai. Sem `unidades` no corpo, elas nao mudam.
 *
 * Devolve { erro } ou { unidades } (null = nao mexer).
 */
function lerUnidades(corpo, nomeDoCliente) {
  if (!Array.isArray(corpo?.unidades)) return { unidades: null }
  if (corpo.unidades.length > UNIDADES_MAXIMO) return { erro: `No máximo ${UNIDADES_MAXIMO} unidades por cliente.` }
  const vistas = new Set()
  const unidades = []
  for (const u of corpo.unidades) {
    const lida = lerUnidade(u, nomeDoCliente)
    if (lida.erro) return lida
    /* duas unidades iguais (mesmo lugar e mesmo servico) nao se distinguem na lista */
    if (vistas.has(lida.unidade.chave)) return { erro: `Há duas unidades "${lida.unidade.rotulo}".` }
    vistas.add(lida.unidade.chave)
    unidades.push(lida.unidade)
  }
  return { unidades }
}

const SEM_UNIDADES = 'O banco ainda não tem as unidades de cliente (atualização 33 em core/db). Rode npm run db:atualizar e suba a API de novo.'
const SEM_SERVICO = 'O banco ainda não tem o serviço das unidades (atualização 34 em core/db). Rode npm run db:atualizar e suba a API de novo.'

/**
 * Grava com a coluna `servico` (atualizacao 34) e, num banco sem ela,
 * sem — a nao ser que um servico tenha vindo, que ai nao da para
 * perder calado. `gravar(comServico)` faz a gravacao.
 */
async function comOuSemServico(temServico, gravar) {
  try {
    return await gravar(true)
  } catch (erro) {
    if (erro.code === '42703' && /servico/.test(erro.message)) {
      if (temServico) throw Object.assign(new Error(SEM_SERVICO), { status: 400 })
      return gravar(false)
    }
    /* a regra da atualizacao 33 ainda pede o lugar: unidade so com servico */
    if (erro.code === '23514' && erro.constraint === 'cliente_unidade_forma') {
      throw Object.assign(new Error(SEM_SERVICO), { status: 400 })
    }
    throw erro
  }
}

/**
 * A unidade que repete outra do mesmo cliente (mesmo lugar e mesmo
 * servico) — fora a propria, na edicao. Devolve o recado, ou null.
 */
async function unidadeRepetida(matriz, unidade, propriaId = null) {
  const { rows } = await query('SELECT id, unidade, servico FROM cliente WHERE matriz_id = $1', [matriz.id]).catch(
    (erro) => {
      if (erro.code !== '42703') throw erro
      return query('SELECT id, unidade, NULL AS servico FROM cliente WHERE matriz_id = $1', [matriz.id])
    },
  )
  const igual = rows.find(
    (r) => String(r.id) !== String(propriaId) && chaveDaUnidade(matriz.nome, r.unidade, r.servico) === unidade.chave,
  )
  return igual ? `${matriz.nome} já tem a unidade ${unidade.rotulo}.` : null
}

/**
 * Antes de gravar: a unidade que sai da lista nao pode ter obra (a obra
 * ficaria sem cliente). Devolve o recado, ou null.
 */
async function unidadeQueNaoPodeSair(clienteId, unidades) {
  if (!unidades) return null
  const ficam = unidades.filter((u) => u.id).map((u) => u.id)
  try {
    const { rows } = await query(
      `SELECT c.nome, count(o.id)::int AS obras
         FROM cliente c JOIN obra o ON o.cliente_id = c.id
        WHERE c.matriz_id = $1 AND NOT (c.id = ANY($2::bigint[]))
        GROUP BY c.id, c.nome
        ORDER BY c.nome
        LIMIT 1`,
      [clienteId, ficam],
    )
    if (!rows[0]) return null
    return `A unidade ${rows[0].nome} tem ${rows[0].obras} obra${rows[0].obras === 1 ? '' : 's'}: troque o cliente dessas obras antes de tirar a unidade.`
  } catch (erro) {
    if (erro.code === '42703') return unidades.length ? SEM_UNIDADES : null
    throw erro
  }
}

/**
 * Grava as unidades do cliente e acerta o nome inteiro de todas elas
 * ("Albert Einstein" + "Anapolis" + "Faturamento") — tambem quando so o
 * nome do cliente mudou. A unidade 1 nova (`doCliente`) entra com a data
 * de cadastro do cliente, para vir antes das outras.
 *
 * `comPais`: o banco tem a atualizacao 35. Sem ela, so endereco do Brasil.
 */
async function gravarUnidades(clienteId, nomeDoCliente, unidades, comPais) {
  const gravar = (comServico) =>
    emTransacao(async (db) => {
      const { rows: atuais } = await db.query(
        `SELECT id, unidade, ${comServico ? 'servico' : 'NULL AS servico'} FROM cliente WHERE matriz_id = $1`,
        [clienteId],
      )
      if (unidades) {
        const ficam = new Set(unidades.filter((u) => u.id).map((u) => String(u.id)))
        const saem = atuais.filter((a) => !ficam.has(String(a.id))).map((a) => a.id)
        if (saem.length) await db.query('DELETE FROM cliente WHERE matriz_id = $1 AND id = ANY($2::bigint[])', [clienteId, saem])
        const { rows: cadastro } = await db.query('SELECT criado_em FROM cliente WHERE id = $1', [clienteId])
        for (const u of unidades) {
          const completa = linhaDaUnidade(u, nomeDoCliente, comServico)
          const { erro, linha } = comPais ? { linha: completa } : semPaisNoBanco(completa)
          if (erro) throw Object.assign(new Error(erro), { status: 400 })
          if (u.id && atuais.some((a) => String(a.id) === String(u.id))) {
            const [sets, valores] = paraAtualizar(linha)
            await db.query(
              `UPDATE cliente SET ${sets} WHERE id = $${valores.length + 1} AND matriz_id = $${valores.length + 2}`,
              [...valores, u.id, clienteId],
            )
          } else {
            const nova = { ...linha, matriz_id: clienteId }
            if (u.doCliente && cadastro[0]) nova.criado_em = cadastro[0].criado_em
            const [partes, valores] = paraInserir(nova)
            await db.query(`INSERT INTO cliente ${partes}`, valores)
          }
        }
      } else {
        /* sem lista nova: so o nome inteiro acompanha o do cliente */
        for (const a of atuais) {
          await db.query('UPDATE cliente SET nome = $1 WHERE id = $2', [
            nomeDaUnidade(nomeDoCliente, a.unidade, a.servico),
            a.id,
          ])
        }
      }
    })
  try {
    await comOuSemServico(
      (unidades ?? []).some((u) => u.servico),
      gravar,
    )
  } catch (erro) {
    /* banco sem a atualizacao 33: sem unidade para gravar, segue */
    if (erro.code === '42703') {
      if (unidades?.length) throw Object.assign(new Error(SEM_UNIDADES), { status: 400 })
      return
    }
    if (erro.code === '23503') {
      throw Object.assign(new Error('Uma das unidades tiradas ainda tem obra ligada a ela.'), { status: 400 })
    }
    throw erro
  }
}

/**
 * As pessoas de contato, o proprietario e o proximo contato do cliente
 * (atualizacao 27). Vem depois do INSERT/UPDATE do cadastro, numa
 * transacao propria: banco sem as colunas novas continua gravando o
 * resto do cliente.
 *
 * As pessoas sao a lista INTEIRA que a tela tem: a que veio com id e
 * atualizada (o id se mantem, e os negocios ligados a ela tambem), a
 * sem id e nova, e a que sumiu da lista sai.
 *
 * Devolve um recado de erro, ou null.
 */
function lerExtrasDoCliente(corpo) {
  const pessoas = Array.isArray(corpo?.pessoas) ? corpo.pessoas : null
  if (pessoas && pessoas.length > PESSOAS_MAXIMO) return { erro: `No máximo ${PESSOAS_MAXIMO} pessoas por cliente.` }
  const limpas = []
  for (const p of pessoas ?? []) {
    const nome = texto(p?.nome).slice(0, 200)
    const email = texto(p?.email).toLowerCase().slice(0, 200)
    if (!nome && !email) continue
    if (!nome) return { erro: 'Toda pessoa de contato precisa de nome.' }
    if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return { erro: `O e-mail de ${nome} não parece certo.` }
    limpas.push({
      id: /^\d{1,15}$/.test(texto(p?.id)) ? texto(p.id) : null,
      nome,
      cargo: texto(p?.cargo).slice(0, 120) || null,
      email: email || null,
      telefone: texto(p?.telefone).slice(0, 40) || null,
    })
  }
  const proximo = texto(corpo?.proximoContato).slice(0, 10)
  if (proximo && !/^\d{4}-\d{2}-\d{2}$/.test(proximo)) return { erro: 'Confira a data do próximo contato.' }
  const dono = texto(corpo?.proprietarioId)
  return {
    pessoas: pessoas ? limpas : null,
    proximoContato: proximo || null,
    proprietarioId: /^\d{1,15}$/.test(dono) ? dono : null,
  }
}

async function gravarExtrasDoCliente(clienteId, extras, { novo, usuarioId }) {
  try {
    await emTransacao(async (db) => {
      await db.query('UPDATE cliente SET proprietario_id = $1, proximo_contato = $2 WHERE id = $3', [
        /* cliente novo sem dono escolhido: e de quem cadastrou */
        extras.proprietarioId ?? (novo ? usuarioId : null),
        extras.proximoContato,
        clienteId,
      ])
      if (!extras.pessoas) return
      const ficam = extras.pessoas.filter((p) => p.id).map((p) => p.id)
      await db.query('DELETE FROM cliente_pessoa WHERE cliente_id = $1 AND NOT (id = ANY($2::bigint[]))', [clienteId, ficam])
      for (const [ordem, p] of extras.pessoas.entries()) {
        if (p.id) {
          await db.query(
            `UPDATE cliente_pessoa SET nome = $1, cargo = $2, email = $3, telefone = $4, ordem = $5
              WHERE id = $6 AND cliente_id = $7`,
            [p.nome, p.cargo, p.email, p.telefone, ordem, p.id, clienteId],
          )
        } else {
          await db.query(
            `INSERT INTO cliente_pessoa (cliente_id, nome, cargo, email, telefone, ordem)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [clienteId, p.nome, p.cargo, p.email, p.telefone, ordem],
          )
        }
      }
    })
  } catch (erro) {
    /* banco ainda sem a atualizacao 27: o cadastro em si ja foi gravado */
    if (erro.code === '42P01' || erro.code === '42703') return
    if (erro.code === '23503') throw Object.assign(new Error('O proprietário escolhido não existe mais.'), { status: 400 })
    throw erro
  }
}

/**
 * O "Fixar no topo das listas" do cadastro: a ordem_prioridade (atualizacao
 * 23), a mesma que poe as unidades da LWN na frente de toda lista de
 * cliente. Marcado, o cliente ganha a proxima posicao depois dos que ja
 * estao fixados — quem ja tinha posicao fica com a dele; desmarcado, volta
 * para a ordem alfabetica. Sem o campo no corpo, nada muda.
 */
async function fixarNoTopo(clienteId, fixado) {
  if (typeof fixado !== 'boolean') return
  try {
    if (fixado) {
      await query(
        `UPDATE cliente SET ordem_prioridade = (SELECT coalesce(max(ordem_prioridade), 0) + 1 FROM cliente)
          WHERE id = $1 AND ordem_prioridade IS NULL`,
        [clienteId],
      )
    } else {
      await query('UPDATE cliente SET ordem_prioridade = NULL WHERE id = $1', [clienteId])
    }
  } catch (erro) {
    /* banco sem a atualizacao 23: o resto do cadastro ja foi gravado */
    if (erro.code !== '42703') throw erro
  }
}

/** O cliente como a tela le, ja com as pessoas. */
async function lerClienteCompleto(id) {
  const todos = await lerClientes(false)
  const achado = todos.rows.find((c) => String(c.id) === String(id))
  return achado ? paraCliente(achado) : null
}

/**
 * As cinco colunas da imagem, ou null quando a tela NAO mexeu nela.
 *
 * Elas andam juntas de proposito: a logo, o header e os dois recortes
 * saem todos do mesmo gesto no editor, e gravar um sem os outros
 * deixaria o cliente com um recorte que nao corresponde a imagem.
 *
 * O null tem funcao: editar o endereco de um cliente nao pode apagar a
 * logo dele. A tela so manda `imagem` quando alguem realmente trocou,
 * reenquadrou ou removeu — e nos outros casos as colunas ficam como
 * estao, em vez de receberem o nada que veio no corpo.
 */
function camposImagem(corpo) {
  const imagem = corpo?.imagem
  if (!imagem) return null

  return {
    logo: imagem.logo || null,
    logo_original: imagem.logoOriginal || null,
    recorte_logo: imagem.recorteLogo ? JSON.stringify(imagem.recorteLogo) : null,
    capa: imagem.capa || null,
    recorte_capa: imagem.recorteCapa ? JSON.stringify(imagem.recorteCapa) : null,
  }
}

/** A logo, a original e a capa: so imagem de verdade (server/utils/imagem.js). */
const imagemDoClienteValida = (imagem) =>
  imagemValida(imagem.logo) && imagemValida(imagem.logo_original) && imagemValida(imagem.capa)

/* ============================================================
   SETORES DO CLIENTE

   O ramo em que a empresa atua. Quem mexe e quem pode mexer em
   cliente — e a mesma tela e a mesma decisao.

   Apagar um setor NAO apaga os clientes dele: a chave estrangeira
   e ON DELETE SET NULL, entao eles voltam para "sem setor" e a
   pessoa reclassifica com calma.
   ============================================================ */


const SEM_TABELA_SETOR = 'A tabela de setores ainda não existe. Rode o SQL de db/setores-e-chat.sql.txt.'

router.post('/setores', exigeSessao, exige('editar_clientes'), async (req, res) => {
  const nome = texto(req.body?.nome)
  const cor = texto(req.body?.cor) || '#3a63e8'
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do setor.' })

  try {
    const { rows } = await query(
      'INSERT INTO setor_cliente (nome, cor) VALUES ($1, $2) RETURNING *',
      [nome, cor],
    )
    await registrarAtividade(req, {
      acao: 'setor_cliente.criado',
      categoria: 'cliente',
      entidade: ['setor_cliente', rows[0].id],
      descricao: 'Setor de cliente criado',
      detalhes: { setor: nome },
    })
    return res.status(201).json({ setor: paraSetor(rows[0]) })
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ erro: 'Já existe um setor com esse nome.' })
    }
    if (e.code === '42P01') return res.status(503).json({ erro: SEM_TABELA_SETOR })
    return tratar(e, res, 'dados/setor-criar')
  }
})

router.patch('/setores/:id', exigeSessao, exige('editar_clientes'), async (req, res) => {
  const nome = texto(req.body?.nome)
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do setor.' })

  try {
    const { rows } = await query(
      'UPDATE setor_cliente SET nome = $1, cor = coalesce($2, cor) WHERE id = $3 RETURNING *',
      [nome, texto(req.body?.cor) || null, req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Setor não encontrado.' })
    await registrarAtividade(req, {
      acao: 'setor_cliente.editado',
      categoria: 'cliente',
      entidade: ['setor_cliente', rows[0].id],
      descricao: 'Setor de cliente editado',
      detalhes: { setor: nome },
    })
    return res.json({ setor: paraSetor(rows[0]) })
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ erro: 'Já existe um setor com esse nome.' })
    }
    if (e.code === '42P01') return res.status(503).json({ erro: SEM_TABELA_SETOR })
    return tratar(e, res, 'dados/setor-editar')
  }
})

router.delete('/setores/:id', exigeSessao, exige('editar_clientes'), async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM setor_cliente WHERE id = $1 RETURNING nome', [
      req.params.id,
    ])
    if (!rows[0]) return res.status(404).json({ erro: 'Setor não encontrado.' })
    await registrarAtividade(req, {
      acao: 'setor_cliente.excluido',
      categoria: 'cliente',
      entidade: ['setor_cliente', req.params.id],
      descricao: 'Setor de cliente excluído',
      detalhes: { setor: rows[0].nome },
    })
    return res.status(204).end()
  } catch (e) {
    if (e.code === '42P01') return res.status(503).json({ erro: SEM_TABELA_SETOR })
    return tratar(e, res, 'dados/setor-apagar')
  }
})

/**
 * A UNIDADE nova de um cliente que ja existe — o "Unidade de" do Novo
 * cliente. Ela nasce com o lugar, o servico e o endereco dela, e com as
 * pessoas, o proprietario e o proximo contato que a tela trouxe (a tela
 * copia os do cliente, para so mexer no que muda). A logo, a capa e o
 * setor sao os do cliente (ver lerClientes).
 *
 * Com ela o cliente vira a vitrine: o endereco que ele ainda tinha vira
 * a unidade 1 (enderecoViraUnidade), e esta fica depois.
 */
async function criarUnidade(req, res) {
  const matrizId = texto(req.body?.matrizId)
  if (!/^\d{1,15}$/.test(matrizId)) return res.status(400).json({ erro: 'Escolha o cliente desta unidade.' })
  const extras = lerExtrasDoCliente(req.body)
  if (extras.erro) return res.status(400).json({ erro: extras.erro })

  try {
    if (!(await bancoComPais())) return res.status(400).json({ erro: SEM_ENDERECO_NOVO })
    const { rows: achadas } = await query('SELECT id, nome, matriz_id FROM cliente WHERE id = $1', [matrizId])
    const matriz = achadas[0]
    if (!matriz) return res.status(404).json({ erro: 'Cliente não encontrado.' })
    if (matriz.matriz_id) return res.status(400).json({ erro: 'Uma unidade não tem unidades: escolha o cliente principal.' })

    const lida = lerUnidade({ ...req.body, id: null }, matriz.nome)
    if (lida.erro) return res.status(400).json({ erro: lida.erro })
    const u = lida.unidade
    const repetida = await unidadeRepetida(matriz, u)
    if (repetida) return res.status(400).json({ erro: repetida })

    const { rows } = await comOuSemServico(Boolean(u.servico), (comServico) => {
      const [partes, valores] = paraInserir({ ...linhaDaUnidade(u, matriz.nome, comServico), matriz_id: matriz.id })
      return query(`INSERT INTO cliente ${partes} RETURNING id, nome, cidade, estado, pais`, valores)
    })
    await registrarAtividade(req, {
      acao: 'cliente.criado',
      categoria: 'cliente',
      entidade: ['cliente', rows[0].id],
      descricao: 'Nova unidade de cliente cadastrada',
      detalhes: { cliente: rows[0].nome, 'unidade de': matriz.nome, cidade: localDoEndereco(rows[0]) },
    })
    await gravarExtrasDoCliente(rows[0].id, extras, { novo: true, usuarioId: req.dono.sub })
    await enderecoViraUnidade(matriz.id)
    return res.status(201).json({ cliente: await lerClienteCompleto(rows[0].id) })
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ erro: e.message })
    if (e.code === '42703') return res.status(400).json({ erro: SEM_UNIDADES })
    return tratar(e, res, 'dados/unidade-criar')
  }
}

/**
 * A UNIDADE editada sozinha (o clique nela, no card do cliente): o
 * lugar, o servico, o endereco, as pessoas, o proprietario e o proximo
 * contato. O nome inteiro se refaz com o do cliente.
 */
async function editarUnidade(req, res, matrizId) {
  if (Array.isArray(req.body?.unidades) && req.body.unidades.length) {
    return res.status(400).json({ erro: 'Uma unidade não tem unidades: cadastre-as no cliente principal.' })
  }
  const extras = lerExtrasDoCliente(req.body)
  if (extras.erro) return res.status(400).json({ erro: extras.erro })

  const { rows: achadas } = await query('SELECT id, nome FROM cliente WHERE id = $1', [matrizId])
  const matriz = achadas[0]
  if (!matriz) return res.status(404).json({ erro: 'Cliente não encontrado.' })
  const lida = lerUnidade({ ...req.body, id: req.params.id }, matriz.nome)
  if (lida.erro) return res.status(400).json({ erro: lida.erro })
  const u = lida.unidade
  const repetida = await unidadeRepetida(matriz, u, req.params.id)
  if (repetida) return res.status(400).json({ erro: repetida })
  const comPais = await bancoComPais()

  const { rows } = await comOuSemServico(Boolean(u.servico), (comServico) => {
    const completa = linhaDaUnidade(u, matriz.nome, comServico)
    const { erro, linha } = comPais ? { linha: completa } : semPaisNoBanco(completa)
    if (erro) throw Object.assign(new Error(erro), { status: 400 })
    const [sets, valores] = paraAtualizar(linha)
    return query(`UPDATE cliente SET ${sets} WHERE id = $${valores.length + 1} RETURNING id, nome`, [
      ...valores,
      req.params.id,
    ])
  })
  if (!rows[0]) return res.status(404).json({ erro: 'Cliente não encontrado.' })
  await registrarAtividade(req, {
    acao: 'cliente.editado',
    categoria: 'cliente',
    entidade: ['cliente', rows[0].id],
    descricao: 'Unidade de cliente editada',
    detalhes: { cliente: rows[0].nome, 'unidade de': matriz.nome },
  })
  await gravarExtrasDoCliente(rows[0].id, extras, { novo: false, usuarioId: req.dono.sub })
  return res.json({ cliente: await lerClienteCompleto(rows[0].id) })
}

router.post('/clientes', exigeSessao, exige('editar_clientes'), async (req, res) => {
  /* "Unidade de" escolhido no Novo cliente: e uma unidade, nao um cliente */
  if (req.body?.matrizId) return criarUnidade(req, res)

  const lidas = lerUnidades(req.body, texto(req.body?.nome))
  if (lidas.erro) return res.status(400).json({ erro: lidas.erro })
  /* com unidade, o endereco e o delas (enderecoNasUnidades) */
  const vitrine = enderecoNasUnidades(lidas.unidades?.length ?? 0)
  const { erro, campos } = camposCliente(req.body, { vitrine })
  if (erro) return res.status(400).json({ erro })
  const extras = lerExtrasDoCliente(req.body)
  if (extras.erro) return res.status(400).json({ erro: extras.erro })

  const imagem = camposImagem(req.body) ?? {}
  if (!imagemDoClienteValida(imagem)) return res.status(400).json({ erro: IMAGEM_INVALIDA })

  try {
    const comPais = await bancoComPais()
    /* a vitrine nasce sem endereco, e isso e da atualizacao 35 */
    if (vitrine && !comPais) return res.status(400).json({ erro: SEM_ENDERECO_NOVO })
    const sem = comPais ? { linha: campos } : semPaisNoBanco(campos)
    if (sem.erro) return res.status(400).json({ erro: sem.erro })
    const unidades = vitrine ? comAPrimeira(req.body, lidas.unidades, campos.nome) : lidas.unidades
    const [partes, valores] = paraInserir({ ...sem.linha, ...imagem })

    const { rows } = await query(`INSERT INTO cliente ${partes} RETURNING *`, valores)
    await registrarAtividade(req, {
      acao: 'cliente.criado',
      categoria: 'cliente',
      entidade: ['cliente', rows[0].id],
      descricao: 'Novo cliente cadastrado',
      detalhes: {
        cliente: rows[0].nome,
        cidade: vitrine ? `${unidades.length} unidade${unidades.length === 1 ? '' : 's'}` : localDoEndereco(rows[0]),
      },
    })
    await gravarExtrasDoCliente(rows[0].id, extras, { novo: true, usuarioId: req.dono.sub })
    await fixarNoTopo(rows[0].id, req.body?.fixado)
    if (unidades?.length) await gravarUnidades(rows[0].id, rows[0].nome, unidades, comPais)
    return res.status(201).json({ cliente: (await lerClienteCompleto(rows[0].id)) ?? paraCliente(rows[0]) })
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ erro: e.message })
    return tratar(e, res, 'dados/cliente-criar')
  }
})

router.patch('/clientes/:id', exigeSessao, exige('editar_clientes'), async (req, res) => {
  /* a UNIDADE se edita pelo que e dela (ver editarUnidade) */
  try {
    const linha = await query('SELECT matriz_id FROM cliente WHERE id = $1', [req.params.id]).catch((e) =>
      e.code === '42703' ? { rows: [] } : Promise.reject(e),
    )
    if (linha.rows[0]?.matriz_id) return await editarUnidade(req, res, String(linha.rows[0].matriz_id))
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ erro: e.message })
    return tratar(e, res, 'dados/unidade-editar')
  }

  const lidas = lerUnidades(req.body, texto(req.body?.nome))
  if (lidas.erro) return res.status(400).json({ erro: lidas.erro })
  const extras = lerExtrasDoCliente(req.body)
  if (extras.erro) return res.status(400).json({ erro: extras.erro })

  /* a imagem so entra no UPDATE quando a tela mexeu nela; sem isso,
     salvar um endereco novo apagaria a logo do cliente */
  const imagem = camposImagem(req.body) ?? {}
  if (!imagemDoClienteValida(imagem)) return res.status(400).json({ erro: IMAGEM_INVALIDA })

  try {
    /* com unidade, o endereco e o delas: o UPDATE nao mexe nele, e
       enderecoSaiDoCliente tira o que havia */
    const vitrine = enderecoNasUnidades(lidas.unidades ? lidas.unidades.length : await contarUnidades(req.params.id))
    const { erro, campos } = camposCliente(req.body, { vitrine })
    if (erro) return res.status(400).json({ erro })
    const comPais = await bancoComPais()
    if (vitrine && !comPais) return res.status(400).json({ erro: SEM_ENDERECO_NOVO })
    const sem = comPais ? { linha: campos } : semPaisNoBanco(campos)
    if (sem.erro) return res.status(400).json({ erro: sem.erro })
    const unidades = vitrine ? comAPrimeira(req.body, lidas.unidades, campos.nome) : lidas.unidades

    if (unidades) {
      const barrada = await unidadeQueNaoPodeSair(req.params.id, unidades)
      if (barrada) return res.status(400).json({ erro: barrada })
    }
    const [sets, valores] = paraAtualizar({ ...sem.linha, ...imagem })
    const { rows } = await query(`UPDATE cliente SET ${sets} WHERE id = $${valores.length + 1} RETURNING *`, [
      ...valores,
      req.params.id,
    ])
    if (!rows[0]) return res.status(404).json({ erro: 'Cliente não encontrado.' })
    await registrarAtividade(req, {
      acao: 'cliente.editado',
      categoria: 'cliente',
      entidade: ['cliente', rows[0].id],
      descricao: 'Cliente editado',
      detalhes: { cliente: rows[0].nome, imagem: Object.keys(imagem).length ? 'imagem alterada' : null },
    })
    await gravarExtrasDoCliente(rows[0].id, extras, { novo: false, usuarioId: req.dono.sub })
    await fixarNoTopo(rows[0].id, req.body?.fixado)
    /* as unidades (e o nome inteiro delas, se o do cliente mudou) */
    if (!rows[0].matriz_id) await gravarUnidades(rows[0].id, rows[0].nome, unidades, comPais)
    /* a lista veio da tela: o endereco do cliente ja esta na unidade 1.
       Sem lista, o que ele ainda tiver vira a unidade 1 aqui */
    if (vitrine) await (unidades ? enderecoSaiDoCliente(rows[0].id) : enderecoViraUnidade(rows[0].id))
    return res.json({ cliente: (await lerClienteCompleto(rows[0].id)) ?? paraCliente(rows[0]) })
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ erro: e.message })
    return tratar(e, res, 'dados/cliente-editar')
  }
})

/**
 * A imagem INTEIRA do cliente — a que o editor precisa para
 * reenquadrar sem recortar o recorte anterior.
 *
 * Rota propria porque ela e pesada e serve a um clique so. Cliente
 * cadastrado antes do editor nao tem original: volta a logo mesmo, que
 * e o melhor que existe ali.
 */
router.get('/clientes/:id/imagem', exigeSessao, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT coalesce(logo_original, logo) AS original FROM cliente WHERE id = $1',
      [req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Cliente não encontrado.' })
    return res.json({ logoOriginal: rows[0].original })
  } catch (e) {
    return tratar(e, res, 'dados/cliente-imagem')
  }
})

/**
 * Apagar cliente leva junto as obras dele — a tela ja avisa disso. As
 * UNIDADES dele (atualizacao 33) saem antes, com as obras delas.
 */
router.delete('/clientes/:id', exigeSessao, exige('editar_clientes'), async (req, res) => {
  try {
    const obras = await query(
      'DELETE FROM obra WHERE cliente_id = $1 OR cliente_id IN (SELECT id FROM cliente WHERE matriz_id = $1)',
      [req.params.id],
    ).catch((erro) => {
      if (erro.code !== '42703') throw erro
      return query('DELETE FROM obra WHERE cliente_id = $1', [req.params.id])
    })
    await query('DELETE FROM cliente WHERE matriz_id = $1', [req.params.id]).catch((erro) => {
      if (erro.code !== '42703') throw erro
    })
    const { rows } = await query('DELETE FROM cliente WHERE id = $1 RETURNING nome', [
      req.params.id,
    ])
    if (!rows[0]) return res.status(404).json({ erro: 'Cliente não encontrado.' })
    await registrarAtividade(req, {
      acao: 'cliente.excluido',
      categoria: 'cliente',
      entidade: ['cliente', req.params.id],
      descricao: 'Cliente excluído',
      detalhes: {
        cliente: rows[0].nome,
        obras: obras.rowCount ? `${obras.rowCount} obra(s) excluída(s) junto` : null,
      },
    })
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/cliente-apagar')
  }
})

/* ============================================================
   CHAT DO SITE

   A conversa geral da equipe — a que o botao flutuante abre em
   qualquer tela. E separada do chat da obra de proposito: aquele
   morre com a obra e vira historico dela; este e do dia a dia e
   nao pertence a obra nenhuma.

   Nao exige permissao: conversar e de todo mundo que entra. O que
   se controla e QUEM APAGA — cada um tira so a propria mensagem.
   ============================================================ */

const SEM_TABELA_CHAT = 'O chat do site ainda não existe no banco. Rode o SQL de db/setores-e-chat.sql.txt.'

/**
 * Uma linha de chat_site como a tela consome.
 *
 * O formato e o MESMO do chat da obra (`paraMensagem`, mais abaixo), de
 * proposito: as duas conversas sao lidas pelo mesmo componente, e um
 * campo com nome diferente para a mesma coisa seria o comeco de dois
 * jeitos de tratar a mesma coisa.
 */
const paraMensagemSite = (l) => {
  const apagada = Boolean(l.apagada_em)
  return {
    id: String(l.id),
    autorId: l.usuario_id === null ? null : String(l.usuario_id),
    autorNome: l.autor_nome,
    texto: apagada ? '' : (l.texto ?? ''),
    respondeA: l.responde_a === null || l.responde_a === undefined ? null : String(l.responde_a),
    arquivo:
      !apagada && l.arquivo_nome
        ? { nome: l.arquivo_nome, tipo: l.arquivo_tipo ?? '', conteudo: l.arquivo_conteudo }
        : null,
    enviadaEm: l.enviada_em,
    editadaEm: apagada ? null : (l.editada_em ?? null),
    apagada,
    apagadaEm: l.apagada_em ?? null,
    mencoes: [],
  }
}

/* As 300 ultimas. E conversa de equipe, nao arquivo: ninguem rola tres
   mil mensagens para tras, e mandar todas engorda a resposta a toa. */
const LIMITE_CHAT = 300

/**
 * A mensagem nova no celular de quem deve saber dela (server/push.js):
 * `destinos` recebem "Fulano: texto"; quem foi citado com @ recebe
 * "Fulano mencionou voce". Quem escreveu nao recebe nada.
 */
async function avisarNoCelular({ destinos, mencoes, linha, onde, url, tag }) {
  const fala = linha.texto || (linha.arquivo_nome ? `enviou ${linha.arquivo_nome}` : 'enviou um arquivo')
  const citados = (mencoes ?? []).map(String)
  const autor = linha.usuario_id
  await Promise.all([
    notificar(
      (destinos ?? []).map(String).filter((id) => !citados.includes(id)),
      { titulo: onde, corpo: `${linha.autor_nome}: ${fala}`, url, tag },
      { exceto: autor },
    ),
    notificar(citados, { titulo: `${linha.autor_nome} mencionou você`, corpo: `${onde}: ${fala}`, url, tag }, { exceto: autor }),
  ])
}

/* ------------------------------------------------------------
   Mensagens NAO LIDAS do chat da equipe (atualizacao 26)

   chat_site_leitura guarda ate qual mensagem cada pessoa leu. As nao
   lidas sao as de OUTRAS pessoas depois dela (as que a pessoa apagou
   para si nao contam). Quem ainda nao tem linha comeca "em dia": a
   primeira consulta grava a ultima mensagem de agora — senao, no dia
   em que isto entrasse no ar, cada um teria 300 nao lidas.
   ------------------------------------------------------------ */

router.get('/chat/nao-lidas', exigeSessao, async (req, res) => {
  try {
    const { rows: leu } = await query('SELECT lido_ate FROM chat_site_leitura WHERE usuario_id = $1', [req.dono.sub])
    if (!leu[0]) {
      await query(
        `INSERT INTO chat_site_leitura (usuario_id, lido_ate)
         SELECT $1, coalesce(max(id), 0) FROM chat_site
         ON CONFLICT (usuario_id) DO NOTHING`,
        [req.dono.sub],
      )
      return res.json({ naoLidas: 0 })
    }
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM chat_site c
        WHERE c.id > $2 AND c.usuario_id IS DISTINCT FROM $1 AND c.apagada_em IS NULL
          AND NOT EXISTS (SELECT 1 FROM chat_site_oculta o WHERE o.mensagem_id = c.id AND o.usuario_id = $1)`,
      [req.dono.sub, leu[0].lido_ate],
    )
    return res.json({ naoLidas: rows[0].n })
  } catch (e) {
    /* banco sem a atualizacao 26: o botao so nao mostra o numero */
    if (e.code === '42P01' || e.code === '42703') return res.json({ naoLidas: 0 })
    return tratar(e, res, 'dados/chat-nao-lidas')
  }
})

/** { ateId } — li ate esta mensagem. So anda para a frente. */
router.post('/chat/lido', exigeSessao, async (req, res) => {
  const ateId = String(req.body?.ateId ?? '')
  if (!/^\d+$/.test(ateId)) return res.status(400).json({ erro: 'Mensagem inválida.' })
  try {
    await query(
      `INSERT INTO chat_site_leitura (usuario_id, lido_ate) VALUES ($1, $2)
       ON CONFLICT (usuario_id) DO UPDATE
          SET lido_ate = GREATEST(chat_site_leitura.lido_ate, EXCLUDED.lido_ate), atualizado_em = now()`,
      [req.dono.sub, ateId],
    )
    return res.json({ ok: true })
  } catch (e) {
    if (e.code === '42P01') return res.json({ ok: true })
    return tratar(e, res, 'dados/chat-lido')
  }
})

router.get('/chat', exigeSessao, async (req, res) => {
  try {
    const [mensagens, mencoes] = await Promise.all([
      /* o "apagar para mim" e por pessoa: a mensagem escondida por
         alguem continua inteira na conversa de todos os outros, e por
         isso ela sai aqui, na leitura, e nao do banco */
      query(
        `SELECT * FROM (
           SELECT c.* FROM chat_site c
            WHERE NOT EXISTS (
                  SELECT 1 FROM chat_site_oculta o
                   WHERE o.mensagem_id = c.id AND o.usuario_id = $2
              )
            ORDER BY c.enviada_em DESC LIMIT $1
         ) t ORDER BY enviada_em`,
        [LIMITE_CHAT, req.dono.sub],
      ).catch((e) =>
        /* banco sem as tabelas novas ainda: le a conversa inteira, sem
           esconder nada. O chat continua funcionando como antes. */
        e.code === '42P01'
          ? query(
              'SELECT * FROM (SELECT * FROM chat_site ORDER BY enviada_em DESC LIMIT $1) t ORDER BY enviada_em',
              [LIMITE_CHAT],
            )
          : Promise.reject(e),
      ),
      query('SELECT mensagem_id, usuario_id FROM chat_site_mencao').catch((e) =>
        e.code === '42P01' ? { rows: [] } : Promise.reject(e),
      ),
    ])

    const porMensagem = {}
    mencoes.rows.forEach((l) => {
      const lista = porMensagem[l.mensagem_id] ?? []
      lista.push(String(l.usuario_id))
      porMensagem[l.mensagem_id] = lista
    })

    return res.json({
      mensagens: mensagens.rows.map((l) => ({
        ...paraMensagemSite(l),
        mencoes: porMensagem[l.id] ?? [],
      })),
    })
  } catch (e) {
    if (e.code === '42P01') return res.status(503).json({ erro: SEM_TABELA_CHAT })
    return tratar(e, res, 'dados/chat-site-ler')
  }
})

router.post('/chat', exigeSessao, async (req, res) => {
  const conteudo = texto(req.body?.texto)
  const arquivo = req.body?.arquivo ?? null

  if (!conteudo && !arquivo?.conteudo) {
    return res.status(400).json({ erro: 'Escreva uma mensagem ou anexe um arquivo.' })
  }
  if (arquivo?.conteudo && !String(arquivo.conteudo).startsWith('data:')) {
    return res.status(400).json({ erro: 'Arquivo inválido.' })
  }

  try {
    const { rows } = await query(
      `INSERT INTO chat_site (usuario_id, autor_nome, texto, responde_a,
                              arquivo_nome, arquivo_tipo, arquivo_conteudo)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.dono.sub,
        await nomeDoDono(req),
        conteudo || null,
        req.body?.respondeA || null,
        arquivo?.nome ? texto(arquivo.nome) : null,
        arquivo?.tipo ? texto(arquivo.tipo) : null,
        arquivo?.conteudo ?? null,
      ],
    )

    const mencoes = [
      ...new Set((req.body?.mencoes ?? []).map((n) => Number(n)).filter(Number.isFinite)),
    ]
    if (mencoes.length > 0) {
      await query(
        `INSERT INTO chat_site_mencao (mensagem_id, usuario_id)
         SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING`,
        [rows[0].id, mencoes],
      )
    }

    await avisarNoCelular({
      destinos: await todosAtivos(),
      mencoes,
      linha: rows[0],
      onde: 'Chat da equipe',
      url: '/core/app/chat',
      tag: 'chat-equipe',
    })

    return res.status(201).json({
      mensagem: { ...paraMensagemSite(rows[0]), mencoes: mencoes.map(String) },
    })
  } catch (e) {
    if (e.code === '42P01') return res.status(503).json({ erro: SEM_TABELA_CHAT })
    return tratar(e, res, 'dados/chat-site-criar')
  }
})

/**
 * DELETE /chat/:id?escopo=todos|mim
 *
 * Os mesmos dois gestos do chat da obra, e a diferenca importa:
 *
 *   escopo=todos — sai da conversa de TODO MUNDO. A linha fica, mas
 *     vazia: texto e arquivo viram NULL e a tela mostra "mensagem
 *     apagada". O rastro evita o buraco — quem respondeu aquela
 *     mensagem continua entendendo a propria resposta. So o autor pode
 *     (e o cargo com acesso total, para o caso de alguem sair da
 *     empresa deixando algo indevido).
 *
 *   escopo=mim (padrao) — some so da MINHA tela. Vale para qualquer
 *     mensagem, minha ou de outra pessoa, e nao muda nada para ninguem.
 *
 * O padrao e o menos destrutivo: uma chamada sem `escopo` nao apaga a
 * mensagem de outras pessoas.
 */
router.delete('/chat/:id', exigeSessao, async (req, res) => {
  const paraTodos = String(req.query?.escopo ?? 'mim') === 'todos'

  try {
    const dona = await query('SELECT usuario_id FROM chat_site WHERE id = $1', [req.params.id])
    if (!dona.rows[0]) return res.status(204).end()

    if (!paraTodos) {
      await query(
        `INSERT INTO chat_site_oculta (mensagem_id, usuario_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, req.dono.sub],
      )
      return res.status(204).end()
    }

    const meu = await meuCargo(req.dono.sub)
    if (!meu.acessoTotal && String(dona.rows[0].usuario_id) !== String(req.dono.sub)) {
      return res.status(403).json({ erro: 'Você só apaga para todos as suas próprias mensagens.' })
    }

    /* o conteudo some de verdade; o que sobra e a marca de que houve
       uma mensagem ali. As mencoes vao junto: elas eram do texto. */
    await query(
      `UPDATE chat_site
          SET texto = NULL, arquivo_nome = NULL, arquivo_tipo = NULL,
              arquivo_conteudo = NULL, apagada_em = now(), apagada_por = $1
        WHERE id = $2`,
      [req.dono.sub, req.params.id],
    )
    await query('DELETE FROM chat_site_mencao WHERE mensagem_id = $1', [req.params.id]).catch(
      () => {},
    )

    return res.status(204).end()
  } catch (e) {
    if (e.code === '42P01') return res.status(503).json({ erro: SEM_TABELA_CHAT })
    return tratar(e, res, 'dados/chat-site-apagar')
  }
})

/* ============================================================
   OBRAS
   ============================================================ */

const PRIORIDADES = ['baixa', 'media', 'alta']

/* ------------------------------------------------------------
   As datas da obra:

     data_inicio                         o cadastro (vem com hoje);
     execucao_inicio -> execucao_prazo   so a ETAPA DE EXECUCAO (3a),
                                         definido dentro da obra
                                         (PUT /obras/:id/execucao).

   O PRAZO FINAL nao se escolhe mais: o cadastro e a edicao ignoram o
   data_conclusao. Ele e o dia em que o ultimo check da obra foi marcado
   — a tela tira dos proprios checks (prazoFinalDaObra, em
   src/domain/obras.js). O data_conclusao que obras antigas guardam
   fica no banco como historico (o painel de atraso das obras fechadas
   ainda le), mas nao trava mais data nenhuma.

   O TIPO e o do cadastro: so e emergencia a obra aberta como
   emergencia — data nenhuma (nem execucao em menos de 3 dias)
   transforma obra padrao em emergencia.
   ------------------------------------------------------------ */

/** Hoje no calendario do Brasil: o servidor pode estar rodando em UTC. */
function hojeNoBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

/** As datas da obra; banco sem as colunas da execucao (atualizacoes 14/15) vem sem elas. */
async function datasDaObra(obraId) {
  const { rows } = await query(
    'SELECT tipo, data_inicio, data_conclusao, execucao_inicio, execucao_prazo FROM obra WHERE id = $1',
    [obraId],
  ).catch((erro) => {
    if (erro.code !== '42703') throw erro
    return query('SELECT tipo, data_inicio, data_conclusao FROM obra WHERE id = $1', [obraId])
  })
  const o = rows[0]
  if (!o) return null
  return {
    tipo: o.tipo,
    inicio: soData(o.data_inicio),
    execucaoInicio: soData(o.execucao_inicio ?? null),
    execucaoPrazo: soData(o.execucao_prazo ?? null),
  }
}

/* o nome de cada coluna da obra como o historico escreve "o que mudou" */
const ROTULO_CAMPO_OBRA = {
  descricao: 'descrição',
  proposta: 'n° da proposta',
  cliente_id: 'cliente',
  data_inicio: 'início',
  data_conclusao: 'prazo final',
  tipo: 'tipo',
  prioridade: 'prioridade',
}

/**
 * O n° da proposta que a obra NOVA ja traz preenchido: o da ultima obra
 * cadastrada (concluida ou nao), mais um — 8234 vira 8235. Ele continua
 * editavel na tela; aqui so se pula o numero que ja existir.
 */
router.get('/obras/proxima-proposta', exigeSessao, exige('editar_obras'), async (_req, res) => {
  try {
    const [ultima, todas] = await Promise.all([
      query("SELECT proposta FROM obra WHERE proposta ~ '[0-9]' ORDER BY criado_em DESC, id DESC LIMIT 1"),
      query('SELECT lower(proposta) AS p FROM obra'),
    ])
    const ocupadas = new Set(todas.rows.map((l) => l.p))
    return res.json({ proposta: proximaProposta(ultima.rows[0]?.proposta, ocupadas) })
  } catch (e) {
    return tratar(e, res, 'dados/proxima-proposta')
  }
})

router.post('/obras', exigeSessao, exige('editar_obras'), async (req, res) => {
  const clienteId = texto(req.body?.clienteId)
  const proposta = texto(req.body?.proposta)
  /* a descricao virou opcional: quem identifica a obra e a dupla
     proposta + cliente, e obrigar um texto livre so fazia aparecer
     "obra" e "-" no lugar dela */
  const descricao = texto(req.body?.descricao)
  const dataInicio = texto(req.body?.dataInicio) || hojeNoBrasil()

  /* o tipo e o do botao que abriu o cadastro, e so ele */
  const tipo = req.body?.tipo === 'emergencia' ? 'emergencia' : 'padrao'
  // emergencia e sempre alta; o gatilho do banco garante, aqui so evita ida a toa
  const prioridade = tipo === 'emergencia' ? 'alta' : (req.body?.prioridade ?? 'media')

  if (!dataValida(dataInicio)) return res.status(400).json({ erro: 'Data inválida.' })

  if (!clienteId) return res.status(400).json({ erro: 'Escolha a empresa.' })
  if (!proposta) return res.status(400).json({ erro: 'Informe o n° da proposta.' })
  if (!PRIORIDADES.includes(prioridade)) return res.status(400).json({ erro: 'Prioridade inválida.' })

  try {
    const { rows } = await query(
      `INSERT INTO obra (cliente_id, proposta, descricao, tipo, prioridade,
                         data_inicio, criado_por, atualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING id`,
      [clienteId, proposta, descricao, tipo, prioridade, dataInicio, req.dono.sub],
    )
    await registrarAtividade(req, {
      acao: 'obra.criada',
      categoria: 'obra',
      entidade: ['obra', rows[0].id],
      descricao: tipo === 'emergencia' ? 'Nova obra de emergência criada' : 'Nova obra criada',
      detalhes: await descreverObra(rows[0].id),
    })
    return res.status(201).json({ id: String(rows[0].id), tipo })
  } catch (e) {
    if (e.code === '23503') return res.status(400).json({ erro: 'Cliente não encontrado.' })
    return tratar(e, res, 'dados/obra-criar')
  }
})

router.patch('/obras/:id', exigeSessao, exige('editar_obras'), obraAberta, async (req, res) => {
  const campos = []
  const valores = []
  const por = (coluna, valor) => {
    valores.push(valor)
    campos.push(`${coluna} = $${valores.length}`)
  }

  if (req.body?.descricao !== undefined) por('descricao', texto(req.body.descricao))
  if (req.body?.proposta !== undefined) {
    const proposta = texto(req.body.proposta)
    if (!proposta) return res.status(400).json({ erro: 'Informe o n° da proposta.' })
    por('proposta', proposta)
  }
  if (req.body?.clienteId !== undefined) por('cliente_id', req.body.clienteId)
  if (req.body?.dataInicio !== undefined) por('data_inicio', req.body.dataInicio || null)
  /* o prazo final (dataConclusao) nao se edita: e o dia do ultimo check */
  const novoInicio = texto(req.body?.dataInicio)
  if (novoInicio && !dataValida(novoInicio)) return res.status(400).json({ erro: 'Data inválida.' })
  if (req.body?.tipo !== undefined) {
    if (!['padrao', 'emergencia'].includes(req.body.tipo)) {
      return res.status(400).json({ erro: 'Tipo de obra inválido.' })
    }
    por('tipo', req.body.tipo)
  }

  /* o inicio novo contra a execucao ja definida dentro da obra */
  if (req.body?.dataInicio !== undefined) {
    try {
      const antes = await datasDaObra(req.params.id)
      if (!antes) return res.status(404).json({ erro: 'Obra não encontrada.' })
      const erroDeDatas = conferirDatas({ ...antes, inicio: novoInicio || null })
      if (erroDeDatas) return res.status(400).json({ erro: erroDeDatas })
    } catch (e) {
      return tratar(e, res, 'dados/obra-editar-datas')
    }
  }
  if (req.body?.prioridade !== undefined) {
    if (!PRIORIDADES.includes(req.body.prioridade)) {
      return res.status(400).json({ erro: 'Prioridade inválida.' })
    }
    por('prioridade', req.body.prioridade)
  }
  if (campos.length === 0) return res.status(400).json({ erro: 'Nada para alterar.' })

  // toda edicao carimba quem mexeu; o atualizado_em fica com o gatilho
  por('atualizado_por', req.dono.sub)

  valores.push(req.params.id)
  try {
    const { rows } = await query(
      `UPDATE obra SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING id`,
      valores,
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Obra não encontrada.' })

    await registrarAtividade(req, {
      acao: 'obra.editada',
      categoria: 'obra',
      entidade: ['obra', req.params.id],
      descricao: 'Obra editada',
      detalhes: {
        ...(await descreverObra(req.params.id)),
        alterado: campos
          .map((c) => ROTULO_CAMPO_OBRA[c.split(' ')[0]])
          .filter(Boolean)
          .join(', '),
      },
    })
    return res.json({ ok: true })
  } catch (e) {
    if (e.code === '23503') return res.status(400).json({ erro: 'Cliente não encontrado.' })
    return tratar(e, res, 'dados/obra-editar')
  }
})

/**
 * DELETE /api/dados/obras/:id — apaga a obra.
 *
 * Duas permissoes diferentes, porque sao dois gestos diferentes:
 *
 *   obra ABERTA    -> "editar_obras". Apagar uma obra em andamento e
 *                     parte de tocar o quadro;
 *   obra CONCLUIDA -> "excluir_concluidas". Ali nao se apaga trabalho
 *                     em andamento, apaga-se o REGISTRO do que a
 *                     empresa entregou — e isso e de quem tem essa
 *                     permissao marcada no setor, nao de quem edita
 *                     obra no dia a dia.
 */
router.delete('/obras/:id', exigeSessao, async (req, res) => {
  try {
    const alvo = await query('SELECT concluida_em FROM obra WHERE id = $1', [req.params.id])
      .catch((e) => (e.code === '42703' ? { rows: [{ concluida_em: null }] } : Promise.reject(e)))
    if (!alvo.rows[0]) return res.status(404).json({ erro: 'Obra não encontrada.' })

    const fechada = Boolean(alvo.rows[0].concluida_em)
    const meu = await meuCargo(req.dono.sub)
    const chave = fechada ? 'excluir_concluidas' : 'editar_obras'

    if (!cargoPode(meu, chave)) {
      return res.status(403).json({
        erro: fechada
          ? 'Seu setor não tem permissão para excluir obra concluída.'
          : 'Seu setor não tem permissão para excluir obras.',
      })
    }

    /* o nome e lido ANTES: depois do DELETE nao ha mais o que ler */
    const antes = await descreverObra(req.params.id)
    const { rowCount } = await query('DELETE FROM obra WHERE id = $1', [req.params.id])
    if (rowCount === 0) return res.status(404).json({ erro: 'Obra não encontrada.' })
    await registrarAtividade(req, {
      acao: fechada ? 'obra.concluida_excluida' : 'obra.excluida',
      categoria: 'obra',
      entidade: ['obra', req.params.id],
      descricao: fechada ? 'Obra concluída excluída' : 'Obra excluída',
      detalhes: antes,
    })
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/obra-apagar')
  }
})

/* ------------------------------------------------------------
   Concluir a obra

   A obra NAO fecha sozinha ao marcar o ultimo check. Marcar tudo
   so faz o botao "Concluir obra" aparecer ao lado do Progresso;
   fechar mesmo e o clique — com dupla confirmacao na tela e, se
   houver, uma observacao de encerramento.

   Antes o fechamento era automatico (view obra_conclusao), e um
   check marcado por engano mandava a obra inteira para o arquivo
   sem ninguem decidir nada.

   A trava daqui e a mesma da tela: so fecha quem PODE editar a
   obra, e so quando nao sobrou nenhum check do roteiro DELA.
   ------------------------------------------------------------ */

router.post('/obras/:id/concluir', exigeSessao, exige('editar_obras'), async (req, res) => {
  const observacao = texto(req.body?.observacao)

  try {
    const obra = await query('SELECT concluida_em FROM obra WHERE id = $1', [req.params.id])
    if (!obra.rows[0]) return res.status(404).json({ erro: 'Obra não encontrada.' })
    if (obra.rows[0].concluida_em) {
      return res.status(409).json({ erro: 'Esta obra já foi concluída.' })
    }

    /* "ja marcou tudo?"

       A conta e feita AQUI, e nao mais lida da view obra_conclusao.
       A view existe em duas versoes: a primeira cobrava todo check do
       cadastro, e a segunda (db/atualizacao.sql.txt) so os que valiam
       quando a obra nasceu. Num banco que ficou com a versao antiga, a
       obra fechava 100% na tela, o botao aparecia, e o clique voltava
       "ainda ha check em aberto" por causa de um check criado DEPOIS
       dela — que ela nem enxerga. Escrita aqui, a regra nao depende de
       ninguem ter rodado a atualizacao: e a mesma janela de vigencia
       que o roteiro da tela aplica (src/domain/obras.js).

       vigenteDe <= nascimento < vigenteAte, nos tres niveis — etapa,
       card e check —, porque apagar a etapa apaga junto o que estava
       dentro dela.

       O check "Material de gases" (tipo material_gases) so conta na
       obra que tem ensaio de GASES planejado; nas outras e opcional. O
       "Retirada do carro" (retirada_carro, atualizacao 23) so conta na
       obra que reservou um carro; nas outras ele nem aparece.

       Obra com checks PROPRIOS (atualizacao 18) conta os dela, e nao os
       do roteiro. Os tres degraus: 18, 14/17, e a conta de sempre. */
    const contar = (nivel) =>
      query(
        `SELECT count(*)                                  AS total,
                count(*) FILTER (WHERE m.obra_id IS NULL) AS abertos
           FROM obra o
           JOIN etapa_check ec ON ${
             nivel >= 2
               ? `CASE WHEN o.checks_proprios
                       THEN ec.obra_id = o.id AND ec.vigente_ate IS NULL
                       ELSE ec.obra_id IS NULL
                            AND ec.vigente_de <= o.criado_em
                            AND (ec.vigente_ate IS NULL OR o.criado_em < ec.vigente_ate)
                  END`
               : `ec.vigente_de <= o.criado_em
                  AND (ec.vigente_ate IS NULL OR o.criado_em < ec.vigente_ate)`
           }
           JOIN etapa_card kd  ON kd.id = ec.card_id
                              AND kd.vigente_de <= o.criado_em
                              AND (kd.vigente_ate IS NULL OR o.criado_em < kd.vigente_ate)
           JOIN etapa et       ON et.id = kd.etapa_id
                              AND et.vigente_de <= o.criado_em
                              AND (et.vigente_ate IS NULL OR o.criado_em < et.vigente_ate)
           LEFT JOIN obra_check m ON m.obra_id = o.id AND m.check_id = ec.id
          WHERE o.id = $1
          ${nivel >= 1
            ? `AND (ec.tipo <> 'material_gases'
                   OR EXISTS (SELECT 1 FROM obra_ensaio oe
                                JOIN ensaio en ON en.id = oe.ensaio_id
                               WHERE oe.obra_id = o.id AND en.classificacao = 'gases'))`
            : ''}
          ${nivel >= 3
            ? `AND (ec.tipo <> 'retirada_carro'
                   OR EXISTS (SELECT 1 FROM obra_reserva_veiculo rv
                               WHERE rv.obra_id = o.id AND rv.veiculo_id IS NOT NULL))`
            : ''}`,
        [req.params.id],
      )
    /* banco sem as atualizacoes: o degrau de baixo */
    const semColuna = (erro) => ['42703', '42P01'].includes(erro.code)
    const conta = await contar(3).catch((erro3) =>
      semColuna(erro3)
        ? contar(2).catch((erro) =>
            semColuna(erro)
              ? contar(1).catch((e) => (semColuna(e) ? contar(0) : Promise.reject(e)))
              : Promise.reject(erro),
          )
        : Promise.reject(erro3),
    )

    const { total, abertos } = conta.rows[0] ?? { total: 0, abertos: 0 }

    /* obra sem check nenhum no roteiro dela nao "acaba": nao ha o que
       dar por feito, e fecha-la seria arquivar uma obra vazia */
    if (Number(total) === 0) {
      return res.status(409).json({
        erro: 'O roteiro desta obra não tem nenhum check. Sem check não há o que concluir.',
      })
    }

    if (Number(abertos) > 0) {
      return res.status(409).json({
        erro:
          Number(abertos) === 1
            ? 'Ainda há 1 check em aberto nesta obra. Conclua-o antes de encerrá-la.'
            : `Ainda há ${abertos} checks em aberto nesta obra. Conclua todos antes de encerrá-la.`,
      })
    }

    await query(
      `UPDATE obra
          SET concluida_em = now(), concluida_por = $1,
              conclusao_obs = $2, atualizado_por = $1
        WHERE id = $3`,
      [req.dono.sub, observacao || null, req.params.id],
    )
    await registrarAtividade(req, {
      acao: 'obra.concluida',
      categoria: 'obra',
      entidade: ['obra', req.params.id],
      descricao: 'Obra concluída',
      detalhes: { ...(await descreverObra(req.params.id)), observacao: observacao || null },
    })
    return res.json({ ok: true })
  } catch (e) {
    return tratar(e, res, 'dados/obra-concluir')
  }
})

/* ------------------------------------------------------------
   Marcar / desmarcar check

   A regra e a mesma da tela (podeEditarCheck, src/domain/obras.js):
   cada setor mexe no card que e dele. Repetida aqui porque a tela
   pode ser burlada e o banco, nao.

   Saidas dessa trava:
     - acesso total, ou a permissao "check em todas as etapas";
     - a obra e de EMERGENCIA (obra.tipo = 'emergencia'): ali ninguem
       espera por setor, e qualquer setor marca qualquer check.
   ------------------------------------------------------------ */

/** O nome do check e da etapa dele, para o historico. */
async function descreverCheck(checkId) {
  try {
    const { rows } = await query(
      `SELECT ck.titulo, et.nome AS etapa
         FROM etapa_check ck
         JOIN etapa_card kd ON kd.id = ck.card_id
         JOIN etapa et      ON et.id = kd.etapa_id
        WHERE ck.id = $1`,
      [checkId],
    )
    return { check: rows[0]?.titulo ?? null, etapa: rows[0]?.etapa ?? null }
  } catch {
    return {}
  }
}

async function podeMarcar(usuarioId, checkId, obraId) {
  const meu = await meuCargo(usuarioId)
  if (cargoPode(meu, 'check_todas_etapas')) return true

  /* obra de emergencia: a trava por setor nao vale */
  const obra = await query('SELECT tipo FROM obra WHERE id = $1', [obraId])
  if (obra.rows[0]?.tipo === 'emergencia') return true

  /* o check pode ter dono proprio; se tiver, e ele quem decide, e o
     cargo do card nao entra na conta */
  const proprio = await query(
    `SELECT c.chave
       FROM etapa_check_cargo kc JOIN cargo c ON c.id = kc.cargo_id
      WHERE kc.check_id = $1`,
    [checkId],
  )
  if (proprio.rows.length > 0) return proprio.rows.some((l) => l.chave === meu.chave)

  const { rows } = await query(
    `SELECT c.chave
       FROM etapa_check ck
       JOIN etapa_card_cargo cc ON cc.card_id = ck.card_id
       JOIN cargo c             ON c.id = cc.cargo_id
      WHERE ck.id = $1`,
    [checkId],
  )
  return rows.some((l) => l.chave === meu.chave)
}

/**
 * O que o check exige para ser marcado:
 *
 *   simNao  o check pede resposta Sim ou Nao. null quando o banco
 *           ainda nao tem a atualizacao 13 — ai nao existe pergunta
 *           nem coluna de resposta, e a marcacao segue como sempre;
 *   tipo    'comum', 'planejamento_ensaios', 'execucao_ensaios',
 *           'material_gases', 'prazo_execucao', 'reserva_carro' ou 'retirada_carro';
 *   papel   o papel da etapa dele. Na de 'execucao' nada se marca
 *           sem o prazo da execucao.
 */
async function regraDoCheck(checkId) {
  const sem14 = { tipo: 'comum', papel: null }
  try {
    const { rows } = await query(
      `SELECT ck.sim_nao, ck.tipo, et.papel
         FROM etapa_check ck
         JOIN etapa_card kd ON kd.id = ck.card_id
         JOIN etapa et      ON et.id = kd.etapa_id
        WHERE ck.id = $1`,
      [checkId],
    )
    if (!rows[0]) return { simNao: false, ...sem14 }
    return { simNao: rows[0].sim_nao === true, tipo: rows[0].tipo, papel: rows[0].papel }
  } catch (erro) {
    if (erro.code !== '42703') throw erro
  }
  /* sem a atualizacao 14: so a pergunta (13), ou nem ela */
  try {
    const { rows } = await query('SELECT sim_nao FROM etapa_check WHERE id = $1', [checkId])
    return { simNao: rows[0]?.sim_nao === true, ...sem14 }
  } catch (erro) {
    if (erro.code !== '42703') throw erro
    return { simNao: null, ...sem14 }
  }
}

/* ------------------------------------------------------------
   Os ENSAIOS da obra (atualizacao 14)

   O Planejamento de ensaios (1a etapa) escolhe quais ensaios a obra
   vai fazer; a Execucao dos ensaios (3a etapa) registra quanto cada
   um estava feito em cada dia. O andamento de AGORA de um ensaio e o
   percentual do dia mais recente — um dia nao apaga o outro.
   ------------------------------------------------------------ */

/** Os ensaios planejados da obra, cada um com o percentual de agora. */
async function andamentoDosEnsaios(obraId) {
  const { rows } = await query(
    `SELECT oe.ensaio_id, e.nome,
            (SELECT p.percentual FROM obra_ensaio_progresso p
              WHERE p.obra_id = oe.obra_id AND p.ensaio_id = oe.ensaio_id
              ORDER BY p.dia DESC LIMIT 1) AS percentual
       FROM obra_ensaio oe JOIN ensaio e ON e.id = oe.ensaio_id
      WHERE oe.obra_id = $1
      ORDER BY oe.ordem, oe.ensaio_id`,
    [obraId],
  ).catch(semTabelaVazia)
  return rows.map((l) => ({
    id: String(l.ensaio_id),
    nome: l.nome,
    percentual: Number(l.percentual ?? 0),
  }))
}

/**
 * O check do sistema de um tipo QUE ESTA OBRA ENXERGA (ou null): a copia
 * dela, se a obra tem checks proprios; senao o do roteiro que valia
 * quando ela nasceu — que nao e, necessariamente, o que vale hoje (o
 * modelo pode ter versionado o check depois).
 */
async function checkDoSistema(obraId, tipo) {
  const { rows } = await query(
    `SELECT ck.id
       FROM obra o
       JOIN etapa_check ck ON ck.tipo = $2
                          AND CASE WHEN o.checks_proprios
                                   THEN ck.obra_id = o.id AND ck.vigente_ate IS NULL
                                   ELSE ck.obra_id IS NULL
                                        AND ck.vigente_de <= o.criado_em
                                        AND (ck.vigente_ate IS NULL OR o.criado_em < ck.vigente_ate)
                              END
      WHERE o.id = $1
      ORDER BY ck.id DESC
      LIMIT 1`,
    [obraId, tipo],
  ).catch((erro) => {
    if (erro.code !== '42703') throw erro
    /* banco sem a atualizacao 18: o que vale hoje */
    return query('SELECT id FROM etapa_check WHERE tipo = $1 AND vigente_ate IS NULL ORDER BY id LIMIT 1', [
      tipo,
    ]).catch((e) => (e.code === '42703' ? { rows: [] } : Promise.reject(e)))
  })
  return rows[0] ? String(rows[0].id) : null
}

/**
 * Mantem as duas regras dos ensaios de pe DEPOIS de qualquer mudanca:
 *
 *   - "Planejamento de ensaios" marcado sem nenhum ensaio planejado
 *     volta a ficar em aberto;
 *   - "Execucao dos ensaios" marcado com algum ensaio abaixo de 100%
 *     (um dia corrigido para menos, um ensaio novo no planejamento)
 *     volta a ficar em aberto.
 *
 * O que for desmarcado assim entra no historico com o motivo.
 */
async function conferirEnsaios(req, obraId) {
  const ensaios = await andamentoDosEnsaios(obraId)
  const regras = [
    ['planejamento_ensaios', ensaios.length > 0, 'nenhum ensaio planejado'],
    [
      'execucao_ensaios',
      ensaios.length > 0 && ensaios.every((e) => e.percentual >= 100),
      'nem todos os ensaios estão em 100%',
    ],
  ]
  for (const [tipo, valendo, motivo] of regras) {
    if (valendo) continue
    const { rows } = await query(
      `DELETE FROM obra_check
        WHERE obra_id = $1
          AND check_id IN (SELECT id FROM etapa_check WHERE tipo = $2)
       RETURNING check_id`,
      [obraId, tipo],
    ).catch((erro) => (erro.code === '42703' ? { rows: [] } : Promise.reject(erro)))
    for (const l of rows) {
      await registrarAtividade(req, {
        acao: 'check.desmarcado',
        categoria: 'check',
        entidade: ['obra', obraId],
        descricao: 'Check reaberto pelo sistema',
        detalhes: {
          ...(await descreverObra(obraId)),
          ...(await descreverCheck(l.check_id)),
          motivo,
        },
      })
    }
  }
}

/** 'AAAA-MM-DD' -> 'dd/mm/aaaa', como o historico mostra. */
const dataLida = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : null)

const rotuloResposta = (resposta) => (resposta === true ? 'Sim' : resposta === false ? 'Não' : null)

/**
 * PUT marca o check.
 *
 * No card de PERGUNTA o corpo traz `resposta` (true = sim, false = nao)
 * e ela e obrigatoria: o "nao" tambem fecha o check — e uma resposta,
 * nao uma pendencia. Mandar de novo com a outra resposta TROCA a
 * resposta e mantem quem marcou primeiro. Nos cards comuns a resposta
 * e ignorada.
 */
router.put('/obras/:id/checks/:checkId', exigeSessao, obraAberta, async (req, res) => {
  try {
    if (!(await podeMarcar(req.dono.sub, req.params.checkId, req.params.id))) {
      return res.status(403).json({ erro: 'Este check é de outro setor.' })
    }

    const regra = await regraDoCheck(req.params.checkId)
    const pergunta = regra.simNao
    const resposta = req.body?.resposta

    /* o check com horario (atualizacao 31) marca no pop-up dele, com as
       datas e os horarios; sem horario nenhum definido, nao fecha */
    const { rows: comHorario } = await query(
      `SELECT ck.horario,
              EXISTS (SELECT 1 FROM obra_horario h WHERE h.obra_id = $2 AND h.check_id = ck.id) AS definido
         FROM etapa_check ck WHERE ck.id = $1`,
      [req.params.checkId, req.params.id],
    ).catch((erro) => {
      if (erro.code === '42703' || erro.code === '42P01') return { rows: [] }
      throw erro
    })
    if (comHorario[0]?.horario && !comHorario[0].definido) {
      return res.status(409).json({ erro: 'Defina o horário das datas no próprio check antes de marcar.' })
    }
    if (pergunta && typeof resposta !== 'boolean') {
      return res.status(400).json({ erro: 'Este check pede uma resposta: Sim ou Não.' })
    }

    /* A etapa de EXECUCAO nao anda sem o PRAZO DA EXECUCAO: e ele que
       diz ate quando a 3a etapa tem de fechar, e e dele que sai a
       urgencia do card no quadro enquanto ela esta aberta. (O prazo
       final da obra e outro — vale para a obra inteira.) */
    if (regra.papel === 'execucao') {
      const datas = await datasDaObra(req.params.id)
      if (!datas?.execucaoPrazo) {
        return res.status(409).json({
          erro: 'A etapa de execução exige o prazo da execução. Defina o período de execução antes de marcar os checks dela.',
        })
      }
    }

    /* A reserva e a retirada do carro (atualizacao 23) nao se marcam no
       clique: a reserva marca quando o supervisor escolhe o carro, e a
       retirada quando a saida do carro e registrada (ver
       server/routes/frotas.js). */
    if (regra.tipo === 'reserva_carro' || regra.tipo === 'retirada_carro') {
      return res.status(409).json({
        erro:
          regra.tipo === 'reserva_carro'
            ? 'Este check marca quando o supervisor reserva o carro da obra.'
            : 'Este check marca quando a retirada do carro é registrada.',
      })
    }

    /* O "Prazo da execucao" (1a etapa, atualizacao 19) nao se marca no
       clique: ele marca sozinho quando o prazo e definido (PUT
       /obras/:id/execucao). Sem o prazo, recusa com o motivo. */
    if (regra.tipo === 'prazo_execucao') {
      const datas = await datasDaObra(req.params.id)
      if (!datas?.execucaoPrazo) {
        return res.status(409).json({
          erro: 'Este check fecha quando o prazo da execução é definido. Abra o período de execução e escolha a data.',
        })
      }
    }

    /* os dois checks dos ensaios so fecham com o que eles pedem */
    if (regra.tipo === 'planejamento_ensaios' || regra.tipo === 'execucao_ensaios') {
      const ensaios = await andamentoDosEnsaios(req.params.id)
      if (ensaios.length === 0) {
        return res.status(409).json({
          erro:
            regra.tipo === 'planejamento_ensaios'
              ? 'Escolha ao menos um ensaio no Planejamento de ensaios antes de marcar este check.'
              : 'Nenhum ensaio foi planejado para esta obra. Faça o Planejamento de ensaios primeiro.',
        })
      }
      const faltam = ensaios.filter((e) => e.percentual < 100)
      if (regra.tipo === 'execucao_ensaios' && faltam.length > 0) {
        return res.status(409).json({
          erro: `A execução só fecha com todos os ensaios em 100%. Faltam: ${faltam
            .map((e) => `${e.nome} (${e.percentual}%)`)
            .join(', ')}.`,
        })
      }
    }

    /* `inserido` separa "marcou agora" de "trocou a resposta": e o
       xmax da linha, que so e zero quando o INSERT valeu */
    const marcado =
      pergunta === null
        ? await query(
            `INSERT INTO obra_check (obra_id, check_id, feito_por)
             VALUES ($1, $2, $3)
             ON CONFLICT (obra_id, check_id) DO NOTHING
             RETURNING true AS inserido`,
            [req.params.id, req.params.checkId, req.dono.sub],
          )
        : await query(
            `INSERT INTO obra_check (obra_id, check_id, feito_por, resposta)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (obra_id, check_id) DO UPDATE SET resposta = EXCLUDED.resposta
               WHERE obra_check.resposta IS DISTINCT FROM EXCLUDED.resposta
             RETURNING (xmax = 0) AS inserido`,
            [req.params.id, req.params.checkId, req.dono.sub, pergunta ? resposta : null],
          )

    /* ja estava marcado (e com a mesma resposta): nada aconteceu, nada
       entra no historico */
    if (marcado.rowCount > 0) {
      const novo = marcado.rows[0]?.inserido !== false
      await registrarAtividade(req, {
        acao: novo ? 'check.marcado' : 'check.resposta',
        categoria: 'check',
        entidade: ['obra', req.params.id],
        descricao: novo ? 'Check concluído' : 'Resposta do check alterada',
        detalhes: {
          ...(await descreverObra(req.params.id)),
          ...(await descreverCheck(req.params.checkId)),
          ...(pergunta ? { resposta: rotuloResposta(resposta) } : {}),
        },
      })
    }
    return res.json({ ok: true })
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra ou check não encontrado.' })
    return tratar(e, res, 'dados/check-marcar')
  }
})

router.delete('/obras/:id/checks/:checkId', exigeSessao, obraAberta, async (req, res) => {
  try {
    if (!(await podeMarcar(req.dono.sub, req.params.checkId, req.params.id))) {
      return res.status(403).json({ erro: 'Este check é de outro setor.' })
    }
    /* o do prazo acompanha o prazo: com a data definida, ele fica marcado */
    const { tipo } = await regraDoCheck(req.params.checkId)
    if (tipo === 'prazo_execucao') {
      return res.status(409).json({
        erro: 'Este check acompanha o prazo da execução. Para mudar, altere a data no período de execução.',
      })
    }
    /* os do carro acompanham a reserva e a saida (atualizacao 23) */
    if (tipo === 'reserva_carro' || tipo === 'retirada_carro') {
      return res.status(409).json({
        erro:
          tipo === 'reserva_carro'
            ? 'Para desfazer, cancele a reserva do carro no próprio check.'
            : 'A retirada do carro fica registrada na aba Frotas e não se desmarca.',
      })
    }
    const desmarcado = await query('DELETE FROM obra_check WHERE obra_id = $1 AND check_id = $2', [
      req.params.id,
      req.params.checkId,
    ])
    if (desmarcado.rowCount > 0) {
      await registrarAtividade(req, {
        acao: 'check.desmarcado',
        categoria: 'check',
        entidade: ['obra', req.params.id],
        descricao: 'Check desmarcado',
        detalhes: { ...(await descreverObra(req.params.id)), ...(await descreverCheck(req.params.checkId)) },
      })
    }
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/check-desmarcar')
  }
})

/* ------------------------------------------------------------
   Prazos da obra (atualizacao 13)

   Uma data limite para uma ETAPA inteira ou para UM check, nesta
   obra. Quem define e o setor com `definir_prazos`. Mandar prazo
   vazio (null ou '') tira o prazo.

   O prazo nao trava nada: ele so diz quando a coisa venceu. E a
   tela que pinta o card do quadro de amarelo com ele.
   ------------------------------------------------------------ */

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

/** 'AAAA-MM-DD' que existe no calendario (nada de 30/02). */
function dataValida(valor) {
  if (!DATA_ISO.test(valor)) return false
  const [a, m, d] = valor.split('-').map(Number)
  const data = new Date(Date.UTC(a, m - 1, d))
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d
}

router.put('/obras/:id/prazos', exigeSessao, exige('definir_prazos'), obraAberta, async (req, res) => {
  const etapaId = texto(req.body?.etapaId)
  const checkId = texto(req.body?.checkId)
  const prazo = texto(req.body?.prazo)

  if (Boolean(etapaId) === Boolean(checkId)) {
    return res.status(400).json({ erro: 'Informe a etapa OU o check do prazo.' })
  }
  if (prazo && !dataValida(prazo)) {
    return res.status(400).json({ erro: 'Data do prazo inválida.' })
  }
  if (!/^\d+$/.test(etapaId || checkId)) {
    return res.status(400).json({ erro: 'Etapa ou check inválido.' })
  }

  const tabela = etapaId ? 'obra_prazo_etapa' : 'obra_prazo_check'
  const coluna = etapaId ? 'etapa_id' : 'check_id'
  const alvoId = etapaId || checkId

  try {
    if (prazo) {
      await query(
        `INSERT INTO ${tabela} (obra_id, ${coluna}, prazo, definido_por)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (obra_id, ${coluna})
           DO UPDATE SET prazo = EXCLUDED.prazo, definido_por = EXCLUDED.definido_por,
                         definido_em = now()`,
        [req.params.id, alvoId, prazo, req.dono.sub],
      )
    } else {
      await query(`DELETE FROM ${tabela} WHERE obra_id = $1 AND ${coluna} = $2`, [
        req.params.id,
        alvoId,
      ])
    }

    const alvo = etapaId
      ? { etapa: (await query('SELECT nome FROM etapa WHERE id = $1', [etapaId])).rows[0]?.nome ?? null }
      : await descreverCheck(checkId)
    await registrarAtividade(req, {
      acao: prazo ? 'prazo.definido' : 'prazo.removido',
      categoria: 'obra',
      entidade: ['obra', req.params.id],
      descricao: prazo ? 'Prazo definido' : 'Prazo removido',
      /* a data vai como se le (dd/mm/aaaa): o historico mostra o texto cru */
      detalhes: {
        ...(await descreverObra(req.params.id)),
        ...alvo,
        prazo: prazo ? prazo.split('-').reverse().join('/') : null,
      },
    })
    return res.json({ ok: true })
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ erro: 'Etapa ou check não encontrado.' })
    if (e.code === '42P01') {
      return res.status(501).json({ erro: 'Prazos ainda não foram habilitados no banco (atualização 13).' })
    }
    return tratar(e, res, 'dados/prazo')
  }
})

/* ------------------------------------------------------------
   Periodo de EXECUCAO: os DIAS da execucao

   E o periodo SO da 3a etapa. Os dias sao escolhidos um a um no
   calendario (atualizacao 20): uma execucao de 5 dias pode ser so nos
   dias uteis, pular uma semana, cair num feriado. Eles vao para
   execucao_dias, e o primeiro e o ultimo continuam em execucao_inicio
   e execucao_prazo — e dali que o resto le o prazo da execucao.

   A obra continua depois da execucao, com a documentacao e a entrega;
   o prazo final dela e o dia do ultimo check (nao e escolhido). A
   etapa de execucao nao anda sem o prazo dela.

   Quem define e quem tem `definir_prazos` — a mesma permissao dos
   prazos de check — ou quem marca o check "Prazo da execucao" da 1a
   etapa (o Time Tecnico; atualizacao 19). Definir o prazo MARCA esse
   check. Periodo curto (hoje, amanha) nao muda o tipo da obra, e o
   prazo dela nao mexe na cor do card.
   ------------------------------------------------------------ */

/**
 * A ordem das datas, a mesma na criacao, na edicao e no periodo da
 * execucao.
 * Devolve o recado do primeiro problema, ou null.
 */
function conferirDatas({ inicio, execucaoInicio, execucaoPrazo }) {
  if (execucaoInicio && execucaoPrazo && execucaoInicio > execucaoPrazo) {
    return 'O início da execução não pode ser depois do prazo da execução.'
  }
  if (execucaoPrazo && inicio && execucaoPrazo < inicio) {
    return 'O prazo da execução não pode ser antes do início da obra.'
  }
  return null
}

/* um ano de dias, no maximo: mais que isso e engano */
const MAX_DIAS_EXECUCAO = 366

/** ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-13'] -> '06/10 a 08/10, 13/10' */
function resumoDosDias(dias) {
  const curta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  const seguinte = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
  const trechos = []
  for (const dia of dias) {
    const ultimo = trechos.at(-1)
    if (ultimo && seguinte(ultimo[1]) === dia) ultimo[1] = dia
    else trechos.push([dia, dia])
  }
  return trechos.map(([a, b]) => (a === b ? curta(a) : `${curta(a)} a ${curta(b)}`)).join(', ')
}

router.put('/obras/:id/execucao', exigeSessao, obraAberta, async (req, res) => {
  /* `dias`: os dias do calendario. Sem eles, o pedido de antes da
     atualizacao 20 (uma aba que ainda nao recarregou): so o inicio e o
     prazo, periodo corrido — e a lista de dias fica vazia */
  let dias = null
  let inicio
  let prazo
  if (Array.isArray(req.body?.dias)) {
    const lista = req.body.dias.map(texto)
    if (lista.length === 0) return res.status(400).json({ erro: 'Escolha ao menos um dia de execução.' })
    if (lista.some((dia) => !dataValida(dia))) return res.status(400).json({ erro: 'Data inválida.' })
    dias = [...new Set(lista)].sort()
    if (dias.length > MAX_DIAS_EXECUCAO) {
      return res.status(400).json({ erro: `São no máximo ${MAX_DIAS_EXECUCAO} dias de execução.` })
    }
    inicio = dias[0]
    prazo = dias.at(-1)
  } else {
    inicio = texto(req.body?.inicio) || null
    prazo = texto(req.body?.prazo)
    if (!prazo) return res.status(400).json({ erro: 'Informe o prazo da execução.' })
    for (const data of [inicio, prazo]) {
      if (data && !dataValida(data)) return res.status(400).json({ erro: 'Data inválida.' })
    }
  }

  try {
    /* o check do prazo que ESTA obra enxerga (null na obra criada antes
       da atualizacao 19 — ali so quem tem definir_prazos define) */
    const checkPrazo = await checkDoSistema(req.params.id, 'prazo_execucao').catch(() => null)
    const meu = await meuCargo(req.dono.sub)
    const pode =
      cargoPode(meu, 'definir_prazos') ||
      (checkPrazo !== null && (await podeMarcar(req.dono.sub, checkPrazo, req.params.id)))
    if (!pode) {
      return res.status(403).json({ erro: 'Seu setor não pode definir o prazo da execução.' })
    }

    const antes = await datasDaObra(req.params.id)
    if (!antes) return res.status(404).json({ erro: 'Obra não encontrada.' })
    /* os dias comecam no inicio da obra, ou depois */
    if (dias && antes.inicio && inicio < antes.inicio) {
      return res.status(400).json({
        erro: `Os dias da execução não podem ser antes do início da obra (${dataLida(antes.inicio)}).`,
      })
    }
    const erroDeDatas = conferirDatas({ ...antes, execucaoInicio: inicio, execucaoPrazo: prazo })
    if (erroDeDatas) return res.status(400).json({ erro: erroDeDatas })

    await query(
      `UPDATE obra
          SET execucao_inicio = $1, execucao_prazo = $2, execucao_dias = $3::date[], atualizado_por = $4
        WHERE id = $5`,
      [inicio, prazo, dias, req.dono.sub, req.params.id],
    )
    await registrarAtividade(req, {
      acao: 'prazo.execucao',
      categoria: 'obra',
      entidade: ['obra', req.params.id],
      descricao: 'Período de execução definido',
      detalhes: {
        ...(await descreverObra(req.params.id)),
        inicio: dataLida(inicio),
        prazo_execucao: dataLida(prazo),
        ...(dias ? { dias: `${dias.length} — ${resumoDosDias(dias)}` } : {}),
      },
    })

    /* o prazo definido fecha o check da 1a etapa */
    if (checkPrazo) {
      const marcou = await query(
        `INSERT INTO obra_check (obra_id, check_id, feito_por)
         VALUES ($1, $2, $3)
         ON CONFLICT (obra_id, check_id) DO NOTHING`,
        [req.params.id, checkPrazo, req.dono.sub],
      )
      if (marcou.rowCount > 0) {
        await registrarAtividade(req, {
          acao: 'check.marcado',
          categoria: 'check',
          entidade: ['obra', req.params.id],
          descricao: 'Check concluído',
          detalhes: { ...(await descreverObra(req.params.id)), ...(await descreverCheck(checkPrazo)) },
        })
      }
    }
    return res.json({ ok: true })
  } catch (e) {
    if (e.code === '42703') {
      return res.status(501).json({ erro: 'Os dias da execução ainda não existem no banco (atualizações 14, 15 e 20).' })
    }
    return tratar(e, res, 'dados/execucao-periodo')
  }
})

/* ------------------------------------------------------------
   Planejamento de ensaios (1a etapa)

   Troca a lista de ensaios da obra pela que veio, na ordem em que
   veio. Quem pode e quem marca o check "Planejamento de ensaios"
   (o setor dele, acesso total, check em todas as etapas ou obra de
   emergencia — a mesma regra de marcar check). Com `concluir`, o
   check ja fica marcado junto.

   Tirar um ensaio do planejamento NAO apaga a execucao dele: os
   dias registrados ficam guardados e voltam se ele for posto de novo.
   ------------------------------------------------------------ */

router.put('/obras/:id/ensaios', exigeSessao, obraAberta, async (req, res) => {
  const lista = Array.isArray(req.body?.ensaioIds) ? req.body.ensaioIds.map(String) : null
  if (!lista || lista.some((id) => !/^\d+$/.test(id))) {
    return res.status(400).json({ erro: 'Lista de ensaios inválida.' })
  }
  const ids = [...new Set(lista)]
  const concluir = req.body?.concluir === true

  try {
    const checkId = await checkDoSistema(req.params.id, 'planejamento_ensaios')
    if (!checkId) {
      return res.status(501).json({ erro: 'O roteiro não tem o check "Planejamento de ensaios" (atualização 14).' })
    }
    if (!(await podeMarcar(req.dono.sub, checkId, req.params.id))) {
      return res.status(403).json({ erro: 'O Planejamento de ensaios é de outro setor.' })
    }
    /* a lista daqui sai das linhas na obra que planeja por item */
    if (await usaItens(req.params.id)) {
      return res.status(409).json({ erro: 'Esta obra planeja os ensaios por item: a lista sai dos itens.' })
    }
    if (concluir && ids.length === 0) {
      return res.status(400).json({ erro: 'Escolha ao menos um ensaio para concluir o planejamento.' })
    }

    /* so entra ensaio que existe e esta no catalogo — ou que ja estava
       nesta obra (um ensaio retirado do catalogo nao some da obra) */
    if (ids.length > 0) {
      const { rows } = await query(
        `SELECT e.id FROM ensaio e
          WHERE e.id = ANY($1::bigint[])
            AND (e.ativo OR EXISTS (SELECT 1 FROM obra_ensaio oe
                                     WHERE oe.obra_id = $2 AND oe.ensaio_id = e.id))`,
        [ids, req.params.id],
      )
      if (rows.length !== ids.length) return res.status(400).json({ erro: 'Ensaio não encontrado.' })
    }

    await query('DELETE FROM obra_ensaio WHERE obra_id = $1 AND NOT (ensaio_id = ANY($2::bigint[]))', [
      req.params.id,
      ids,
    ])
    for (const [i, ensaioId] of ids.entries()) {
      await query(
        `INSERT INTO obra_ensaio (obra_id, ensaio_id, ordem, definido_por)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (obra_id, ensaio_id) DO UPDATE SET ordem = EXCLUDED.ordem`,
        [req.params.id, ensaioId, i, req.dono.sub],
      )
    }

    const nomes = ids.length
      ? (
          await query(
            'SELECT nome FROM obra_ensaio oe JOIN ensaio e ON e.id = oe.ensaio_id WHERE oe.obra_id = $1 ORDER BY oe.ordem',
            [req.params.id],
          )
        ).rows.map((l) => l.nome)
      : []
    await registrarAtividade(req, {
      acao: 'ensaios.planejados',
      categoria: 'check',
      entidade: ['obra', req.params.id],
      descricao: 'Planejamento de ensaios atualizado',
      detalhes: { ...(await descreverObra(req.params.id)), ensaios: nomes.join(', ') || 'nenhum' },
    })

    if (concluir) {
      const marcado = await query(
        `INSERT INTO obra_check (obra_id, check_id, feito_por) VALUES ($1, $2, $3)
         ON CONFLICT (obra_id, check_id) DO NOTHING RETURNING check_id`,
        [req.params.id, checkId, req.dono.sub],
      )
      if (marcado.rowCount > 0) {
        await registrarAtividade(req, {
          acao: 'check.marcado',
          categoria: 'check',
          entidade: ['obra', req.params.id],
          descricao: 'Check concluído',
          detalhes: { ...(await descreverObra(req.params.id)), ...(await descreverCheck(checkId)) },
        })
      }
    }

    await conferirEnsaios(req, req.params.id)
    return res.json({ ok: true })
  } catch (e) {
    if (e.code === '42P01') {
      return res.status(501).json({ erro: 'Ensaios ainda não existem no banco (atualização 14).' })
    }
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra ou ensaio não encontrado.' })
    return tratar(e, res, 'dados/ensaios-planejar')
  }
})

/* ------------------------------------------------------------
   Execucao dos ensaios (3a etapa): um DIA de cada vez

   Corpo: { dia: 'AAAA-MM-DD', valores: [{ ensaioId, percentual }] }.
   O percentual e quanto o ensaio estava feito NAQUELE dia (0-100);
   null tira o registro daquele dia. Cada dia e uma linha propria:
   registrar o dia 07 nao mexe no dia 06.

   O dia precisa estar no periodo de execucao — da entrada em campo
   (ou do inicio da obra) ate hoje — e o prazo da execucao tem de
   existir.
   Quem registra e quem marca o check "Execucao dos ensaios".
   ------------------------------------------------------------ */

router.put('/obras/:id/execucao/dia', exigeSessao, obraAberta, async (req, res) => {
  const dia = texto(req.body?.dia)
  const valores = Array.isArray(req.body?.valores) ? req.body.valores : null

  if (!dataValida(dia)) return res.status(400).json({ erro: 'Escolha o dia da execução.' })
  if (!valores || valores.length === 0) {
    return res.status(400).json({ erro: 'Informe o percentual de ao menos um ensaio.' })
  }
  for (const v of valores) {
    if (!/^\d+$/.test(String(v?.ensaioId ?? ''))) return res.status(400).json({ erro: 'Ensaio inválido.' })
    const p = v.percentual
    if (p !== null && p !== '' && !(Number.isInteger(Number(p)) && Number(p) >= 0 && Number(p) <= 100)) {
      return res.status(400).json({ erro: 'O percentual vai de 0 a 100, sem casas decimais.' })
    }
  }

  try {
    const checkId = await checkDoSistema(req.params.id, 'execucao_ensaios')
    if (!checkId) {
      return res.status(501).json({ erro: 'O roteiro não tem o check "Execução dos ensaios" (atualização 14).' })
    }
    if (!(await podeMarcar(req.dono.sub, checkId, req.params.id))) {
      return res.status(403).json({ erro: 'A Execução dos ensaios é de outro setor.' })
    }
    /* na obra que planeja por item o % sai das linhas feitas */
    if (await usaItens(req.params.id)) {
      return res.status(409).json({
        erro: 'Esta obra registra a execução por linha (item, ensaio e condição): o percentual sai delas.',
      })
    }

    const datas = await datasDaObra(req.params.id)
    if (!datas?.execucaoPrazo) {
      return res.status(409).json({
        erro: 'Defina o prazo da execução antes de registrar: é ele que fecha o período.',
      })
    }
    const comeco = datas.execucaoInicio ?? datas.inicio
    if (comeco && dia < comeco) {
      return res.status(400).json({ erro: `O período de execução começa em ${dataLida(comeco)}.` })
    }
    if (dia > hojeNoBrasil()) {
      return res.status(400).json({ erro: 'Não dá para registrar a execução de um dia que ainda não chegou.' })
    }

    const planejados = new Set((await andamentoDosEnsaios(req.params.id)).map((e) => e.id))
    if (valores.some((v) => !planejados.has(String(v.ensaioId)))) {
      return res.status(400).json({ erro: 'Só os ensaios do Planejamento de ensaios entram na execução.' })
    }

    for (const v of valores) {
      if (v.percentual === null || v.percentual === '') {
        await query('DELETE FROM obra_ensaio_progresso WHERE obra_id = $1 AND ensaio_id = $2 AND dia = $3', [
          req.params.id,
          v.ensaioId,
          dia,
        ])
      } else {
        await query(
          `INSERT INTO obra_ensaio_progresso (obra_id, ensaio_id, dia, percentual, registrado_por)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (obra_id, ensaio_id, dia)
             DO UPDATE SET percentual = EXCLUDED.percentual,
                           registrado_por = EXCLUDED.registrado_por,
                           registrado_em = now()`,
          [req.params.id, v.ensaioId, dia, Number(v.percentual), req.dono.sub],
        )
      }
    }

    const nomes = Object.fromEntries((await andamentoDosEnsaios(req.params.id)).map((e) => [e.id, e.nome]))
    await registrarAtividade(req, {
      acao: 'ensaios.execucao',
      categoria: 'check',
      entidade: ['obra', req.params.id],
      descricao: 'Execução dos ensaios registrada',
      detalhes: {
        ...(await descreverObra(req.params.id)),
        dia: dataLida(dia),
        ensaios: valores
          .map((v) => `${nomes[String(v.ensaioId)] ?? v.ensaioId}: ${
            v.percentual === null || v.percentual === '' ? 'apagado' : `${Number(v.percentual)}%`
          }`)
          .join(', '),
      },
    })

    await conferirEnsaios(req, req.params.id)
    return res.json({ ok: true })
  } catch (e) {
    if (e.code === '42P01' || e.code === '42703') {
      return res.status(501).json({ erro: 'Execução dos ensaios ainda não existe no banco (atualização 14).' })
    }
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra ou ensaio não encontrado.' })
    return tratar(e, res, 'dados/execucao-dia')
  }
})

/* ============================================================
   ENSAIOS POR ITEM (atualizacao 25)

   A obra cadastra O QUE vai ser ensaiado — ambientes (com a classe),
   sistemas, equipamentos (com a TAG) e pontos de uso (com o gas) — e,
   em cada item, os ensaios com a condicao: Como encontrado, Como
   Certificado ou as duas. Cada item + ensaio + condicao e uma LINHA,
   e e na linha que a execucao grava o resultado: a data, o valor
   medido, se ficou conforme e a observacao.

   O resto do sistema continua lendo as tabelas da lista solta: depois
   de qualquer mudanca, `sincronizarItens` refaz obra_ensaio (os
   ensaios distintos das linhas) e obra_ensaio_progresso (por ensaio e
   por dia: as linhas feitas ate aquele dia / as linhas do ensaio). O
   quadro, o check "Material de gases", a conclusao e as regras dos
   dois checks dos ensaios nao mudam.

   A obra que planejou pela lista solta e ja registrou execucao
   continua nela: passar para itens apagaria os dias registrados.
   ============================================================ */

/** A obra planeja por item? (banco sem a atualizacao 25: nao) */
async function usaItens(obraId) {
  const { rows } = await query('SELECT EXISTS (SELECT 1 FROM obra_item WHERE obra_id = $1) AS sim', [
    obraId,
  ]).catch(semTabelaVazia)
  return rows[0]?.sim === true
}

/** Pedido recusado no meio da transacao: vira a resposta com o status. */
const recusa = (status, erro) => Object.assign(new Error(erro), { recusa: { status, erro } })

/**
 * Refaz obra_ensaio e obra_ensaio_progresso a partir das linhas da
 * obra. Roda dentro da transacao (`db`) de quem mexeu nas linhas.
 */
async function sincronizarItens(db, obraId, usuarioId) {
  const { rows } = await db.query(
    `SELECT l.ensaio_id, l.data, l.registrado_por
       FROM obra_item_ensaio l JOIN obra_item i ON i.id = l.item_id
      WHERE i.obra_id = $1
      ORDER BY i.ordem, i.id, l.ordem, l.id`,
    [obraId],
  )
  /* ensaio -> as linhas dele, na ordem em que o ensaio aparece primeiro */
  const porEnsaio = new Map()
  for (const l of rows) {
    const id = String(l.ensaio_id)
    if (!porEnsaio.has(id)) porEnsaio.set(id, [])
    porEnsaio.get(id).push(l)
  }
  const ids = [...porEnsaio.keys()]

  await db.query('DELETE FROM obra_ensaio WHERE obra_id = $1 AND NOT (ensaio_id = ANY($2::bigint[]))', [
    obraId,
    ids,
  ])
  await db.query(
    `INSERT INTO obra_ensaio (obra_id, ensaio_id, ordem, definido_por)
     SELECT $1, t.ensaio_id, t.ordem - 1, $3
       FROM unnest($2::bigint[]) WITH ORDINALITY AS t(ensaio_id, ordem)
     ON CONFLICT (obra_id, ensaio_id) DO UPDATE SET ordem = EXCLUDED.ordem`,
    [obraId, ids, usuarioId],
  )

  /* o % de um ensaio num dia = as linhas dele feitas ate aquele dia /
     todas as linhas dele. Arredonda para baixo: 100% so com todas */
  const ensaios = []
  const dias = []
  const percentuais = []
  const quem = []
  for (const [ensaioId, linhas] of porEnsaio) {
    const feitas = linhas
      .filter((l) => l.data)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    const porDia = new Map()
    feitas.forEach((l, k) => porDia.set(soData(l.data), { feitas: k + 1, quem: l.registrado_por }))
    for (const [dia, valor] of porDia) {
      ensaios.push(ensaioId)
      dias.push(dia)
      percentuais.push(Math.floor((100 * valor.feitas) / linhas.length))
      quem.push(valor.quem)
    }
  }
  await db.query('DELETE FROM obra_ensaio_progresso WHERE obra_id = $1', [obraId])
  if (ensaios.length > 0) {
    await db.query(
      `INSERT INTO obra_ensaio_progresso (obra_id, ensaio_id, dia, percentual, registrado_por)
       SELECT $1, t.e, t.d, t.p, t.u
         FROM unnest($2::bigint[], $3::date[], $4::smallint[], $5::bigint[]) AS t(e, d, p, u)`,
      [obraId, ensaios, dias, percentuais, quem],
    )
  }
}

/** O texto aparado; vazio vira null. */
const opcional = (valor) => texto(valor) || null

const CAMPOS_DO_ITEM = [
  ['nome', 'o nome'],
  ['tag', 'a TAG'],
  ['classe', 'a classe'],
  ['gas', 'o gás'],
  ['observacao', 'a observação'],
]

/**
 * Le e confere os itens do corpo do planejamento. Devolve { itens } ou
 * { erro } — o erro ja diz qual item. Cada item sai com as linhas dele
 * (ensaio + condicao), na ordem: ensaio a ensaio, Como encontrado antes.
 */
function lerItensDoCorpo(lista) {
  if (!Array.isArray(lista)) return { erro: 'Lista de itens inválida.' }
  if (lista.length > LIMITES_ITEM.itens) {
    return { erro: `Uma obra tem no máximo ${LIMITES_ITEM.itens} itens.` }
  }
  const tipos = new Set(TIPOS_DE_ITEM.map((t) => t.id))
  const condicoes = CONDICOES.map((c) => c.id)
  const vistos = new Set()
  const itens = []

  for (const [k, bruto] of lista.entries()) {
    const nome = texto(bruto?.nome)
    const qual = nome ? `"${resumo(nome).slice(0, 40)}"` : `O item ${k + 1}`
    const id = bruto?.id === undefined || bruto?.id === null || bruto?.id === '' ? null : String(bruto.id)
    if (id !== null && (!/^\d+$/.test(id) || vistos.has(id))) return { erro: 'Item inválido.' }
    if (id) vistos.add(id)

    const tipo = texto(bruto?.tipo)
    if (!tipos.has(tipo)) return { erro: `${qual}: escolha o tipo do item.` }
    if (!nome) return { erro: `O item ${k + 1} está sem nome.` }

    const campos = {
      nome,
      tag: opcional(bruto?.tag),
      classe: tipo === 'ambiente' ? opcional(bruto?.classe) : null,
      gas: tipo === 'ponto_uso' ? opcional(bruto?.gas) : null,
      observacao: opcional(bruto?.observacao),
    }
    for (const [campo, rotulo] of CAMPOS_DO_ITEM) {
      if (campos[campo] && campos[campo].length > LIMITES_ITEM[campo]) {
        return { erro: `${qual}: ${rotulo} passa de ${LIMITES_ITEM[campo]} caracteres.` }
      }
    }
    if (tipo === 'ponto_uso' && !campos.gas) return { erro: `${qual}: diga qual é o gás do ponto de uso.` }

    if (!Array.isArray(bruto?.ensaios)) return { erro: `${qual}: lista de ensaios inválida.` }
    const linhas = []
    const ensaiosVistos = new Set()
    for (const e of bruto.ensaios) {
      const ensaioId = String(e?.ensaioId ?? '')
      if (!/^\d+$/.test(ensaioId) || ensaiosVistos.has(ensaioId)) return { erro: `${qual}: ensaio inválido.` }
      ensaiosVistos.add(ensaioId)
      const pedidas = Array.isArray(e?.condicoes) ? e.condicoes.map(String) : []
      if (pedidas.length === 0 || pedidas.some((c) => !condicoes.includes(c))) {
        return { erro: `${qual}: cada ensaio precisa de ao menos uma condição (Como encontrado ou Como certificado).` }
      }
      for (const c of condicoes) if (pedidas.includes(c)) linhas.push({ ensaioId, condicao: c })
    }

    itens.push({ id, tipo, ...campos, linhas })
  }
  return { itens }
}

/* ------------------------------------------------------------
   Planejamento POR ITEM (1a etapa)

   Corpo: { servico, itens: [{ id?, tipo, nome, tag, classe, gas,
   observacao, ensaios: [{ ensaioId, condicoes: ['as_found',
   'como_certificado'] }] }], concluir }.

   Troca o planejamento inteiro pelo que veio. Item com id e o mesmo
   item (as linhas que continuam guardam o resultado); sem id e novo.
   Item e linha que nao vieram saem — e o resultado deles sai junto,
   o que a tela avisa antes de salvar.

   Quem pode e quem marca o "Planejamento de ensaios" (a mesma regra
   da lista solta). `concluir` exige o servico, ao menos um item e
   todo item com ensaio, e ja marca o check.
   ------------------------------------------------------------ */

router.put('/obras/:id/planejamento-itens', exigeSessao, obraAberta, async (req, res) => {
  const obraId = req.params.id
  const corpo = req.body ?? {}
  const concluir = corpo.concluir === true
  const servico = texto(corpo.servico) || null
  if (servico && !SERVICOS.some((s) => s.id === servico)) {
    return res.status(400).json({ erro: 'Escolha o serviço da obra na lista.' })
  }
  const { itens, erro } = lerItensDoCorpo(corpo.itens)
  if (erro) return res.status(400).json({ erro })

  if (concluir) {
    if (!servico) return res.status(400).json({ erro: 'Escolha o serviço da obra para concluir o planejamento.' })
    if (itens.length === 0) {
      return res.status(400).json({ erro: 'Cadastre ao menos um item para concluir o planejamento.' })
    }
    const vazio = itens.find((i) => i.linhas.length === 0)
    if (vazio) {
      return res.status(400).json({
        erro: `"${vazio.nome}" está sem ensaio. Escolha os ensaios dele ou tire o item para concluir.`,
      })
    }
  }

  try {
    const checkId = await checkDoSistema(obraId, 'planejamento_ensaios')
    if (!checkId) {
      return res.status(501).json({ erro: 'O roteiro não tem o check "Planejamento de ensaios" (atualização 14).' })
    }
    if (!(await podeMarcar(req.dono.sub, checkId, obraId))) {
      return res.status(403).json({ erro: 'O Planejamento de ensaios é de outro setor.' })
    }

    /* a lista solta com execucao registrada nao passa para itens */
    const jaPorItem = await usaItens(obraId)
    if (!jaPorItem && itens.length > 0) {
      const { rows } = await query(
        'SELECT EXISTS (SELECT 1 FROM obra_ensaio_progresso WHERE obra_id = $1) AS tem',
        [obraId],
      ).catch(semTabelaVazia)
      if (rows[0]?.tem) {
        return res.status(409).json({
          erro: 'Esta obra já registrou execução pela lista de ensaios e continua nela: passar para itens apagaria os dias registrados.',
        })
      }
    }

    /* so entra ensaio que existe e esta no catalogo — ou que ja estava
       nesta obra (um ensaio retirado do catalogo nao some da obra) */
    const ensaioIds = [...new Set(itens.flatMap((i) => i.linhas.map((l) => l.ensaioId)))]
    if (ensaioIds.length > 0) {
      const { rows } = await query(
        `SELECT e.id FROM ensaio e
          WHERE e.id = ANY($1::bigint[])
            AND (e.ativo OR EXISTS (SELECT 1 FROM obra_ensaio oe
                                     WHERE oe.obra_id = $2 AND oe.ensaio_id = e.id))`,
        [ensaioIds, obraId],
      )
      if (rows.length !== ensaioIds.length) return res.status(400).json({ erro: 'Ensaio não encontrado no catálogo.' })
    }

    const { removidos, apagados } = await emTransacao(async (db) => {
      await db.query('UPDATE obra SET servico = $2 WHERE id = $1', [obraId, servico])

      const { rows: antes } = await db.query(
        'SELECT id, nome FROM obra_item WHERE obra_id = $1 ORDER BY ordem, id FOR UPDATE',
        [obraId],
      )
      const daObra = new Set(antes.map((l) => String(l.id)))
      if (itens.some((i) => i.id && !daObra.has(i.id))) {
        throw recusa(404, 'Um dos itens não existe mais nesta obra. Feche e abra o planejamento de novo.')
      }
      const { rows: linhasAntes } = await db.query(
        `SELECT l.id, l.item_id, l.ensaio_id, l.condicao, l.data IS NOT NULL AS feita
           FROM obra_item_ensaio l JOIN obra_item i ON i.id = l.item_id
          WHERE i.obra_id = $1`,
        [obraId],
      )

      /* os itens que nao vieram saem, com as linhas (e os resultados) */
      const ficam = new Set(itens.filter((i) => i.id).map((i) => i.id))
      const saem = antes.filter((l) => !ficam.has(String(l.id)))
      const idsQueSaem = new Set(saem.map((l) => String(l.id)))
      let resultadosApagados = linhasAntes.filter((l) => idsQueSaem.has(String(l.item_id)) && l.feita).length
      if (saem.length > 0) {
        await db.query('DELETE FROM obra_item WHERE id = ANY($1::bigint[])', [saem.map((l) => l.id)])
      }

      const comOrdem = itens.map((i, ordem) => ({ ...i, ordem }))
      const colunas = (lista) => [
        lista.map((i) => i.tipo),
        lista.map((i) => i.nome),
        lista.map((i) => i.tag),
        lista.map((i) => i.classe),
        lista.map((i) => i.gas),
        lista.map((i) => i.observacao),
        lista.map((i) => i.ordem),
      ]

      const existentes = comOrdem.filter((i) => i.id)
      if (existentes.length > 0) {
        await db.query(
          `UPDATE obra_item i
              SET tipo = t.tipo, nome = t.nome, tag = t.tag, classe = t.classe, gas = t.gas,
                  observacao = t.observacao, ordem = t.ordem
             FROM unnest($2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
                         $8::text[], $9::int[])
                  AS t(id, tipo, nome, tag, classe, gas, observacao, ordem)
            WHERE i.id = t.id AND i.obra_id = $1`,
          [obraId, existentes.map((i) => i.id), ...colunas(existentes)],
        )
      }

      const novos = comOrdem.filter((i) => !i.id)
      if (novos.length > 0) {
        const { rows } = await db.query(
          `INSERT INTO obra_item (obra_id, tipo, nome, tag, classe, gas, observacao, ordem, criado_por)
           SELECT $1, t.tipo, t.nome, t.tag, t.classe, t.gas, t.observacao, t.ordem, $9
             FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[])
                  AS t(tipo, nome, tag, classe, gas, observacao, ordem)
           RETURNING id, ordem`,
          [obraId, ...colunas(novos), req.dono.sub],
        )
        const porOrdem = new Map(rows.map((l) => [Number(l.ordem), String(l.id)]))
        novos.forEach((i) => {
          i.id = porOrdem.get(i.ordem)
        })
      }

      /* as linhas: as que continuam guardam o resultado; as tiradas saem */
      const chave = (itemId, ensaioId, condicao) => `${itemId}|${ensaioId}|${condicao}`
      const desejadas = comOrdem.flatMap((i) =>
        i.linhas.map((l, ordem) => ({ itemId: i.id, ensaioId: l.ensaioId, condicao: l.condicao, ordem })),
      )
      const querem = new Set(desejadas.map((d) => chave(d.itemId, d.ensaioId, d.condicao)))
      const tiradas = linhasAntes.filter(
        (l) => !idsQueSaem.has(String(l.item_id)) && !querem.has(chave(l.item_id, l.ensaio_id, l.condicao)),
      )
      if (tiradas.length > 0) {
        await db.query('DELETE FROM obra_item_ensaio WHERE id = ANY($1::bigint[])', [tiradas.map((l) => l.id)])
        resultadosApagados += tiradas.filter((l) => l.feita).length
      }
      if (desejadas.length > 0) {
        await db.query(
          `INSERT INTO obra_item_ensaio (item_id, ensaio_id, condicao, ordem)
           SELECT t.item_id, t.ensaio_id, t.condicao, t.ordem
             FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::int[]) AS t(item_id, ensaio_id, condicao, ordem)
           ON CONFLICT (item_id, ensaio_id, condicao) DO UPDATE SET ordem = EXCLUDED.ordem`,
          [
            desejadas.map((d) => d.itemId),
            desejadas.map((d) => d.ensaioId),
            desejadas.map((d) => d.condicao),
            desejadas.map((d) => d.ordem),
          ],
        )
      }

      /* a obra que tinha (ou passou a ter) item: a lista solta sai das linhas */
      if (jaPorItem || itens.length > 0) await sincronizarItens(db, obraId, req.dono.sub)
      return { removidos: saem.map((l) => l.nome), apagados: resultadosApagados }
    })

    const linhas = itens.reduce((n, i) => n + i.linhas.length, 0)
    await registrarAtividade(req, {
      acao: 'ensaios.planejados',
      categoria: 'check',
      entidade: ['obra', obraId],
      descricao: 'Planejamento de ensaios por item atualizado',
      detalhes: {
        ...(await descreverObra(obraId)),
        servico: rotuloDoServico(servico) ?? 'não escolhido',
        itens: itens.map((i) => `${i.nome} (${i.linhas.length})`).join(', ') || 'nenhum',
        linhas,
        ...(removidos.length > 0 ? { itens_removidos: removidos.join(', ') } : {}),
        ...(apagados > 0 ? { resultados_apagados: apagados } : {}),
      },
    })

    if (concluir) {
      const marcado = await query(
        `INSERT INTO obra_check (obra_id, check_id, feito_por) VALUES ($1, $2, $3)
         ON CONFLICT (obra_id, check_id) DO NOTHING RETURNING check_id`,
        [obraId, checkId, req.dono.sub],
      )
      if (marcado.rowCount > 0) {
        await registrarAtividade(req, {
          acao: 'check.marcado',
          categoria: 'check',
          entidade: ['obra', obraId],
          descricao: 'Check concluído',
          detalhes: { ...(await descreverObra(obraId)), ...(await descreverCheck(checkId)) },
        })
      }
    }

    await conferirEnsaios(req, obraId)
    return res.json({ ok: true })
  } catch (e) {
    if (e.recusa) return res.status(e.recusa.status).json({ erro: e.recusa.erro })
    if (e.code === '42P01' || e.code === '42703') {
      return res.status(501).json({ erro: 'Os ensaios por item ainda não existem no banco (atualização 25).' })
    }
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra ou ensaio não encontrado.' })
    return tratar(e, res, 'dados/planejamento-itens')
  }
})

/* ------------------------------------------------------------
   Execucao POR LINHA (3a etapa)

   Corpo: { linhas: [{ id, data, resultado, conforme, observacao }] }
   — ou { id, apagar: true }, que volta a linha para pendente.

   A data segue a regra da execucao dia a dia: precisa do prazo da
   execucao, nao vem antes da entrada em campo (ou do inicio da obra)
   e nao passa de hoje. "Nao conforme" e resultado, nao pendencia: a
   linha conta como feita.
   Quem registra e quem marca o check "Execucao dos ensaios".
   ------------------------------------------------------------ */

router.put('/obras/:id/execucao-itens', exigeSessao, obraAberta, async (req, res) => {
  const obraId = req.params.id
  const brutas = Array.isArray(req.body?.linhas) ? req.body.linhas : null
  if (!brutas || brutas.length === 0) return res.status(400).json({ erro: 'Informe ao menos uma linha.' })
  if (brutas.length > 500) return res.status(400).json({ erro: 'Linhas demais de uma vez.' })

  const linhas = []
  const vistas = new Set()
  for (const l of brutas) {
    const id = String(l?.id ?? '')
    if (!/^\d+$/.test(id) || vistas.has(id)) return res.status(400).json({ erro: 'Linha inválida.' })
    vistas.add(id)
    if (l.apagar === true) {
      linhas.push({ id, apagar: true })
      continue
    }
    const data = texto(l.data)
    if (!dataValida(data)) return res.status(400).json({ erro: 'Escolha a data em que o ensaio foi feito.' })
    const resultado = texto(l.resultado)
    if (!resultado) return res.status(400).json({ erro: 'Informe o resultado medido.' })
    if (resultado.length > LIMITES_ITEM.resultado) {
      return res.status(400).json({ erro: `O resultado passa de ${LIMITES_ITEM.resultado} caracteres.` })
    }
    if (typeof l.conforme !== 'boolean') {
      return res.status(400).json({ erro: 'Diga se o resultado ficou conforme ou não conforme.' })
    }
    const observacao = opcional(l.observacao)
    if (observacao && observacao.length > LIMITES_ITEM.observacao) {
      return res.status(400).json({ erro: `A observação passa de ${LIMITES_ITEM.observacao} caracteres.` })
    }
    linhas.push({ id, data, resultado, conforme: l.conforme, observacao })
  }

  try {
    const checkId = await checkDoSistema(obraId, 'execucao_ensaios')
    if (!checkId) {
      return res.status(501).json({ erro: 'O roteiro não tem o check "Execução dos ensaios" (atualização 14).' })
    }
    if (!(await podeMarcar(req.dono.sub, checkId, obraId))) {
      return res.status(403).json({ erro: 'A Execução dos ensaios é de outro setor.' })
    }

    const comData = linhas.filter((l) => !l.apagar)
    if (comData.length > 0) {
      const datas = await datasDaObra(obraId)
      if (!datas?.execucaoPrazo) {
        return res.status(409).json({
          erro: 'Defina o prazo da execução antes de registrar: é ele que fecha o período.',
        })
      }
      const comeco = datas.execucaoInicio ?? datas.inicio
      const hoje = hojeNoBrasil()
      for (const l of comData) {
        if (comeco && l.data < comeco) {
          return res.status(400).json({ erro: `O período de execução começa em ${dataLida(comeco)}.` })
        }
        if (l.data > hoje) {
          return res.status(400).json({ erro: 'Não dá para registrar um ensaio numa data que ainda não chegou.' })
        }
      }
    }

    const { rows: daObra } = await query(
      `SELECT l.id, i.nome AS item, e.nome AS ensaio, l.condicao
         FROM obra_item_ensaio l
         JOIN obra_item i ON i.id = l.item_id
         JOIN ensaio e    ON e.id = l.ensaio_id
        WHERE i.obra_id = $1 AND l.id = ANY($2::bigint[])`,
      [obraId, linhas.map((l) => l.id)],
    )
    if (daObra.length !== linhas.length) {
      return res.status(404).json({ erro: 'Uma das linhas não está mais no planejamento. Feche e abra a execução de novo.' })
    }

    await emTransacao(async (db) => {
      for (const l of linhas) {
        if (l.apagar) {
          await db.query(
            `UPDATE obra_item_ensaio
                SET data = NULL, resultado = NULL, conforme = NULL, observacao = NULL,
                    registrado_por = NULL, registrado_em = NULL
              WHERE id = $1`,
            [l.id],
          )
        } else {
          await db.query(
            `UPDATE obra_item_ensaio
                SET data = $2, resultado = $3, conforme = $4, observacao = $5,
                    registrado_por = $6, registrado_em = now()
              WHERE id = $1`,
            [l.id, l.data, l.resultado, l.conforme, l.observacao, req.dono.sub],
          )
        }
      }
      await sincronizarItens(db, obraId, req.dono.sub)
    })

    const sobre = Object.fromEntries(daObra.map((l) => [String(l.id), l]))
    await registrarAtividade(req, {
      acao: 'ensaios.execucao',
      categoria: 'check',
      entidade: ['obra', obraId],
      descricao: 'Execução dos ensaios registrada',
      detalhes: {
        ...(await descreverObra(obraId)),
        linhas: linhas
          .map((l) => {
            const s = sobre[l.id]
            const nome = `${s.item} · ${s.ensaio} · ${rotuloDaCondicao(s.condicao)}`
            return l.apagar
              ? `${nome}: resultado apagado`
              : `${nome}: ${l.resultado} (${l.conforme ? 'conforme' : 'não conforme'}, ${dataLida(l.data)})`
          })
          .join('; '),
      },
    })

    await conferirEnsaios(req, obraId)
    return res.json({ ok: true })
  } catch (e) {
    if (e.code === '42P01' || e.code === '42703') {
      return res.status(501).json({ erro: 'Os ensaios por item ainda não existem no banco (atualização 25).' })
    }
    return tratar(e, res, 'dados/execucao-itens')
  }
})

/* ------------------------------------------------------------
   Catalogo de ENSAIOS

   Separado das obras: e a lista de onde o Planejamento de ensaios
   escolhe. Quem mexe e quem tem `gerenciar_ensaios`.

   Excluir um ensaio que alguma obra ja planejou (ou executou) NAO o
   apaga: ele sai do catalogo (ativo = false) e continua nas obras que
   o tinham, com a execucao registrada. Sem uso nenhum, sai de vez.
   ------------------------------------------------------------ */

function paraEnsaio(l) {
  return {
    id: String(l.id),
    nome: l.nome,
    descricao: l.descricao ?? '',
    ordem: l.ordem,
    ativo: l.ativo,
    /* 'hvac' | 'gases' — null no ensaio antigo, ainda sem classificacao */
    classificacao: l.classificacao ?? null,
  }
}

const SEM_ENSAIO = 'Ensaios ainda não existem no banco (atualização 14).'
const SEM_CLASSIFICACAO = 'A classificação dos ensaios ainda não existe no banco (atualização 17).'

/** As duas classificacoes de ensaio. */
const CLASSIFICACOES = ['hvac', 'gases']

router.post('/ensaios', exigeSessao, exige('gerenciar_ensaios'), async (req, res) => {
  const nome = texto(req.body?.nome)
  const descricao = texto(req.body?.descricao).slice(0, 600) || null
  const classificacao = texto(req.body?.classificacao)
  if (!nome) return res.status(400).json({ erro: 'Escreva o nome do ensaio.' })
  /* todo ensaio novo nasce HVAC ou GASES: e a classificacao que decide
     se a obra precisa do check "Material de gases" */
  if (!CLASSIFICACOES.includes(classificacao)) {
    return res.status(400).json({ erro: 'Escolha a classificação do ensaio: HVAC ou GASES.' })
  }

  try {
    const { rows } = await query(
      `INSERT INTO ensaio (nome, descricao, classificacao, ordem, criado_por)
       VALUES ($1, $2, $3, coalesce((SELECT max(ordem) FROM ensaio), 0) + 1, $4)
       RETURNING *`,
      [nome, descricao, classificacao, req.dono.sub],
    )
    await registrarAtividade(req, {
      acao: 'ensaio.criado',
      categoria: 'roteiro',
      entidade: ['ensaio', rows[0].id],
      descricao: 'Ensaio criado no catálogo',
      detalhes: { ensaio: nome },
    })
    return res.status(201).json({ ensaio: paraEnsaio(rows[0]) })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Já existe um ensaio com esse nome.' })
    if (e.code === '42P01') return res.status(501).json({ erro: SEM_ENSAIO })
    if (e.code === '42703') return res.status(501).json({ erro: SEM_CLASSIFICACAO })
    return tratar(e, res, 'dados/ensaio-criar')
  }
})

router.patch('/ensaios/:id', exigeSessao, exige('gerenciar_ensaios'), async (req, res) => {
  const campos = []
  const valores = []
  if (req.body?.nome !== undefined) {
    const nome = texto(req.body.nome)
    if (!nome) return res.status(400).json({ erro: 'Escreva o nome do ensaio.' })
    valores.push(nome)
    campos.push(`nome = $${valores.length}`)
  }
  if (req.body?.descricao !== undefined) {
    valores.push(texto(req.body.descricao).slice(0, 600) || null)
    campos.push(`descricao = $${valores.length}`)
  }
  if (req.body?.classificacao !== undefined) {
    const classificacao = texto(req.body.classificacao)
    if (!CLASSIFICACOES.includes(classificacao)) {
      return res.status(400).json({ erro: 'A classificação do ensaio é HVAC ou GASES.' })
    }
    valores.push(classificacao)
    campos.push(`classificacao = $${valores.length}`)
  }
  if (campos.length === 0) return res.status(400).json({ erro: 'Nada para alterar.' })
  valores.push(req.params.id)

  try {
    const { rows } = await query(
      `UPDATE ensaio SET ${campos.join(', ')} WHERE id = $${valores.length} AND ativo RETURNING *`,
      valores,
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Ensaio não encontrado.' })
    await registrarAtividade(req, {
      acao: 'ensaio.editado',
      categoria: 'roteiro',
      entidade: ['ensaio', rows[0].id],
      descricao: 'Ensaio editado no catálogo',
      detalhes: { ensaio: rows[0].nome },
    })
    return res.json({ ensaio: paraEnsaio(rows[0]) })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Já existe um ensaio com esse nome.' })
    if (e.code === '42P01') return res.status(501).json({ erro: SEM_ENSAIO })
    if (e.code === '42703') return res.status(501).json({ erro: SEM_CLASSIFICACAO })
    return tratar(e, res, 'dados/ensaio-editar')
  }
})

router.delete('/ensaios/:id', exigeSessao, exige('gerenciar_ensaios'), async (req, res) => {
  try {
    /* "usado" e estar planejado em alguma obra OU ter execucao
       registrada — a execucao fica guardada mesmo depois de o ensaio
       sair do planejamento, e apagar o ensaio levaria ela junto */
    const usado = await query(
      `SELECT 1 FROM obra_ensaio WHERE ensaio_id = $1
       UNION ALL
       SELECT 1 FROM obra_ensaio_progresso WHERE ensaio_id = $1
       LIMIT 1`,
      [req.params.id],
    )
    const { rows } =
      usado.rows.length > 0
        ? await query('UPDATE ensaio SET ativo = false WHERE id = $1 AND ativo RETURNING nome', [
            req.params.id,
          ])
        : await query('DELETE FROM ensaio WHERE id = $1 RETURNING nome', [req.params.id])
    if (!rows[0]) return res.status(404).json({ erro: 'Ensaio não encontrado.' })
    await registrarAtividade(req, {
      acao: 'ensaio.excluido',
      categoria: 'roteiro',
      entidade: ['ensaio', req.params.id],
      descricao: 'Ensaio excluído do catálogo',
      detalhes: { ensaio: rows[0].nome },
    })
    return res.status(204).end()
  } catch (e) {
    if (e.code === '42P01') return res.status(501).json({ erro: SEM_ENSAIO })
    return tratar(e, res, 'dados/ensaio-apagar')
  }
})

/* ------------------------------------------------------------
   Observacoes da obra

   Cada um edita e apaga a PROPRIA observacao. Quando edita, fica
   o carimbo de editada_em — e a tela mostra "editada" no rodape.
   Cargo com acesso total continua podendo limpar qualquer uma.
   ------------------------------------------------------------ */

router.post('/obras/:id/observacoes', exigeSessao, obraAberta, async (req, res) => {
  const conteudo = texto(req.body?.texto)
  if (!conteudo) return res.status(400).json({ erro: 'Escreva a observação.' })

  try {
    const { rows } = await query(
      `INSERT INTO obra_observacao (obra_id, usuario_id, autor_nome, texto)
       VALUES ($1, $2, $3, $4) RETURNING id, enviada_em`,
      [req.params.id, req.dono.sub, await nomeDoDono(req), conteudo],
    )
    await registrarAtividade(req, {
      acao: 'observacao.criada',
      categoria: 'obra',
      entidade: ['obra', req.params.id],
      descricao: 'Observação na obra',
      detalhes: { ...(await descreverObra(req.params.id)), texto: resumo(conteudo) },
    })
    return res.status(201).json({ id: String(rows[0].id), enviadaEm: rows[0].enviada_em })
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra não encontrada.' })
    return tratar(e, res, 'dados/obs-criar')
  }
})

router.patch('/obras/:id/observacoes/:obsId', exigeSessao, obraAberta, async (req, res) => {
  const conteudo = texto(req.body?.texto)
  if (!conteudo) return res.status(400).json({ erro: 'Escreva a observação.' })

  try {
    const dona = await query('SELECT usuario_id FROM obra_observacao WHERE id = $1', [
      req.params.obsId,
    ])
    if (!dona.rows[0]) return res.status(404).json({ erro: 'Observação não encontrada.' })
    if (String(dona.rows[0].usuario_id) !== String(req.dono.sub)) {
      return res.status(403).json({ erro: 'Você só edita a sua própria observação.' })
    }

    const { rows } = await query(
      `UPDATE obra_observacao SET texto = $1, editada_em = now()
        WHERE id = $2 AND obra_id = $3 RETURNING editada_em`,
      [conteudo, req.params.obsId, req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Observação não encontrada.' })
    return res.json({ editadaEm: rows[0].editada_em })
  } catch (e) {
    return tratar(e, res, 'dados/obs-editar')
  }
})

router.delete('/obras/:id/observacoes/:obsId', exigeSessao, obraAberta, async (req, res) => {
  try {
    const dona = await query('SELECT usuario_id FROM obra_observacao WHERE id = $1', [
      req.params.obsId,
    ])
    if (!dona.rows[0]) return res.status(204).end()

    const meu = await meuCargo(req.dono.sub)
    if (!meu.acessoTotal && String(dona.rows[0].usuario_id) !== String(req.dono.sub)) {
      return res.status(403).json({ erro: 'Você só apaga a sua própria observação.' })
    }

    await query('DELETE FROM obra_observacao WHERE id = $1 AND obra_id = $2', [
      req.params.obsId,
      req.params.id,
    ])
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/obs-apagar')
  }
})

/* ------------------------------------------------------------
   Observacoes do quadro (tela de Obras, valem para o quadro todo)
   ------------------------------------------------------------ */

/**
 * A janela de validade da observacao, conferida.
 *
 * Devolve { inicio, fim } ou lanca com o recado pronto para a tela. As
 * duas datas andam JUNTAS: janela pela metade nao e janela, e o banco
 * recusa de qualquer jeito (observacao_quadro_janela_ck) — conferir
 * aqui e o que troca um erro de constraint por uma frase que a pessoa
 * entende.
 */
function janela(corpo) {
  const inicio = texto(corpo?.inicioEm) || null
  const fim = texto(corpo?.fimEm) || null

  if (!inicio && !fim) return { inicio: null, fim: null }
  if (!inicio || !fim) {
    throw Object.assign(new Error('Informe as duas datas da duração: de e até.'), { tela: true })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    throw Object.assign(new Error('As datas da duração vieram em formato inválido.'), {
      tela: true,
    })
  }
  if (fim < inicio) {
    throw Object.assign(new Error('A data final não pode ser antes da inicial.'), { tela: true })
  }
  return { inicio, fim }
}

router.post('/observacoes', exigeSessao, async (req, res) => {
  const conteudo = texto(req.body?.texto)
  if (!conteudo) return res.status(400).json({ erro: 'Escreva a observação.' })

  try {
    const { inicio, fim } = janela(req.body)
    const { rows } = await query(
      `INSERT INTO observacao_quadro (usuario_id, autor_nome, texto, inicio_em, fim_em)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, enviada_em, inicio_em, fim_em`,
      [req.dono.sub, await nomeDoDono(req), conteudo, inicio, fim],
    )
    await registrarAtividade(req, {
      acao: 'observacao_quadro.criada',
      categoria: 'obra',
      entidade: ['observacao_quadro', rows[0].id],
      descricao: 'Observação no quadro de obras',
      detalhes: { texto: resumo(conteudo) },
    })
    return res.status(201).json({
      id: String(rows[0].id),
      enviadaEm: rows[0].enviada_em,
      inicioEm: soData(rows[0].inicio_em),
      fimEm: soData(rows[0].fim_em),
    })
  } catch (e) {
    if (e.tela) return res.status(400).json({ erro: e.message })
    return tratar(e, res, 'dados/obs-quadro-criar')
  }
})

router.patch('/observacoes/:id', exigeSessao, async (req, res) => {
  const conteudo = texto(req.body?.texto)
  if (!conteudo) return res.status(400).json({ erro: 'Escreva a observação.' })

  try {
    const { inicio, fim } = janela(req.body)

    const dona = await query('SELECT usuario_id FROM observacao_quadro WHERE id = $1', [
      req.params.id,
    ])
    if (!dona.rows[0]) return res.status(404).json({ erro: 'Observação não encontrada.' })
    if (String(dona.rows[0].usuario_id) !== String(req.dono.sub)) {
      return res.status(403).json({ erro: 'Você só edita a sua própria observação.' })
    }

    /* a janela vem inteira na edicao: quem desmarcou "Adicionar
       duracao" manda as duas vazias, e e assim que a observacao volta
       a valer para sempre */
    const { rows } = await query(
      `UPDATE observacao_quadro
          SET texto = $1, inicio_em = $2, fim_em = $3, editada_em = now()
        WHERE id = $4
      RETURNING editada_em, inicio_em, fim_em`,
      [conteudo, inicio, fim, req.params.id],
    )
    return res.json({
      editadaEm: rows[0].editada_em,
      inicioEm: soData(rows[0].inicio_em),
      fimEm: soData(rows[0].fim_em),
    })
  } catch (e) {
    if (e.tela) return res.status(400).json({ erro: e.message })
    return tratar(e, res, 'dados/obs-quadro-editar')
  }
})

router.delete('/observacoes/:id', exigeSessao, async (req, res) => {
  try {
    const dona = await query('SELECT usuario_id FROM observacao_quadro WHERE id = $1', [
      req.params.id,
    ])
    if (!dona.rows[0]) return res.status(204).end()

    const meu = await meuCargo(req.dono.sub)
    if (!meu.acessoTotal && String(dona.rows[0].usuario_id) !== String(req.dono.sub)) {
      return res.status(403).json({ erro: 'Você só apaga a sua própria observação.' })
    }

    await query('DELETE FROM observacao_quadro WHERE id = $1', [req.params.id])
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/obs-quadro-apagar')
  }
})

/* ------------------------------------------------------------
   Avisos aos setores pendentes
   ------------------------------------------------------------ */

/**
 * O aviso tambem vai por E-MAIL.
 *
 * O sininho so cobra quem esta com o sistema aberto, e quem esta
 * devendo informacao costuma ser exatamente quem nao esta. Entao a
 * mesma cobranca sai para a caixa de entrada de quem e do setor, com o
 * que a pessoa precisa para decidir se para o que esta fazendo:
 * prioridade, proposta, cliente, descricao — e um botao que abre a
 * obra na tela onde o check e marcado.
 *
 * Quem recebe: TODO MUNDO do setor cobrado, inclusive quem apertou o
 * botao. Isso e diferente do sininho, que pula o autor de proposito —
 * e o selo vermelho existe para dizer "tem coisa nova para voce", e um
 * recado que a propria pessoa escreveu nao e novidade nenhuma.
 *
 * O e-mail responde outra pergunta. Ele e o REGISTRO da cobranca, e
 * quem esta no setor cobrado esta sendo cobrado — tenha ou nao apertado
 * o botao. Alem disso, uma pessoa que avisa o proprio setor e o caso
 * mais comum de todos ("a Excelencia esta devendo, e eu sou da
 * Excelencia"), e some-la da lista fazia justamente ela nao receber
 * nada. Receber copia do que se manda e o que qualquer e-mail faz.
 *
 * Duas coisas que esta funcao NAO faz, e de proposito:
 *
 *   - nao manda para quem desmarcou `avisos_email` no cadastro;
 *   - nao estoura. O aviso ja esta gravado quando ela roda, e um
 *     e-mail que nao saiu nao pode desfazer uma cobranca que saiu.
 *     O que der errado vira log e o motivo na resposta.
 */
async function avisarPorEmail({ obraId, setores, etapa, mensagem, quem }) {
  if (!temEmail()) return { enviados: 0, motivo: 'o envio de e-mail não está configurado' }

  const alvos = await query(
    `SELECT u.email
       FROM usuario u JOIN cargo c ON c.id = u.cargo_id
      WHERE c.chave = ANY($1)
        AND u.ativo
        AND coalesce(u.avisos_email, true)
        AND u.email IS NOT NULL AND u.email <> ''`,
    [setores],
  )
  const para = [...new Set(alvos.rows.map((l) => l.email))]
  if (para.length === 0) {
    return { enviados: 0, motivo: 'ninguém desse setor tem e-mail cadastrado' }
  }

  const dados = await query(
    `SELECT o.id, o.proposta, o.descricao, o.tipo, o.prioridade,
            cl.nome AS cliente_nome, cl.logo AS cliente_logo,
            quem.name AS remetente
       FROM obra o
       JOIN cliente cl        ON cl.id = o.cliente_id
       LEFT JOIN usuario quem ON quem.id = $2
      WHERE o.id = $1`,
    [obraId, quem],
  )
  const o = dados.rows[0]
  if (!o) return { enviados: 0, motivo: 'obra não encontrada' }

  /* os nomes dos setores cobrados, como a equipe os chama */
  const nomes = await query('SELECT nome FROM cargo WHERE chave = ANY($1)', [setores])
  const termos = await lerTermos()

  const envio = await enviarAviso({
    para,
    obra: {
      id: String(o.id),
      proposta: o.proposta ?? '',
      descricao: o.descricao ?? '',
      tipo: o.tipo,
      prioridade: o.prioridade,
      setores: nomes.rows.map((l) => l.nome).join(', '),
    },
    cliente: { nome: o.cliente_nome, logo: o.cliente_logo },
    etapa: `${etapa}ª ${termos.termo_etapa}`,
    mensagem,
    remetente: o.remetente ?? '',
  })

  if (!envio.ok) {
    logger.error('dados/aviso-email', envio.motivo)
    return { enviados: 0, motivo: envio.motivo }
  }
  return { enviados: para.length }
}

router.post('/obras/:id/avisos', exigeSessao, exige('enviar_avisos'), obraAberta, async (req, res) => {
  const setores = (req.body?.setores ?? []).map(texto).filter(Boolean)
  if (setores.length === 0) return res.status(400).json({ erro: 'Nenhum setor para avisar.' })

  const etapa = Number(req.body?.etapa) || 1
  const mensagem = texto(req.body?.mensagem)

  try {
    const { rows } = await query(
      `INSERT INTO obra_aviso (obra_id, etapa, mensagem, enviado_por)
       VALUES ($1, $2, $3, $4) RETURNING id, enviado_em`,
      [req.params.id, etapa, mensagem, req.dono.sub],
    )
    await query(
      `INSERT INTO obra_aviso_cargo (aviso_id, cargo_id)
       SELECT $1, id FROM cargo WHERE chave = ANY($2)`,
      [rows[0].id, setores],
    )
    /* quem disparou ja "leu" o proprio aviso: senao o sininho dele
       apitaria por um recado que ele mesmo escreveu */
    await query(
      'INSERT INTO aviso_leitura (aviso_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [rows[0].id, req.dono.sub],
    )

    /* o e-mail vem DEPOIS de gravar, e o que ele devolver nao muda o
       resultado da chamada — a tela ja pode dizer "aviso enviado" */
    const email = await avisarPorEmail({
      obraId: req.params.id,
      setores,
      etapa,
      mensagem,
      quem: req.dono.sub,
    }).catch((erro) => {
      logger.error('dados/aviso-email', erro.message)
      return { enviados: 0, motivo: erro.message }
    })

    /* e no celular de quem e dos setores avisados (menos quem mandou) */
    const sobre = await descreverObra(req.params.id)
    await notificar(
      await pessoasDosSetores(setores),
      {
        titulo: `Aviso — ${[sobre.obra, sobre.cliente].filter(Boolean).join(' - ') || 'obra'}`,
        corpo: mensagem || `Novo aviso da ${etapa}ª etapa.`,
        url: `/core/app/obras/${req.params.id}`,
        tag: `aviso-${rows[0].id}`,
      },
      { exceto: req.dono.sub },
    )

    const nomesSetores = await query('SELECT nome FROM cargo WHERE chave = ANY($1)', [setores])
    await registrarAtividade(req, {
      acao: 'aviso.enviado',
      categoria: 'aviso',
      entidade: ['obra', req.params.id],
      descricao: 'Aviso enviado',
      detalhes: {
        ...(await descreverObra(req.params.id)),
        setores: nomesSetores.rows.map((l) => l.nome).join(', '),
        texto: resumo(mensagem),
      },
    })

    return res.status(201).json({
      id: String(rows[0].id),
      enviadoEm: rows[0].enviado_em,
      /* quantos e-mails sairam, para a tela poder dizer "avisado por
         e-mail" em vez de so "avisado" */
      emails: email.enviados,
      emailMotivo: email.motivo ?? null,
    })
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra não encontrada.' })
    return tratar(e, res, 'dados/aviso-criar')
  }
})

/** Marca avisos como lidos — e o que zera o selo do sininho. */
router.post('/avisos/lidos', exigeSessao, async (req, res) => {
  const ids = (req.body?.ids ?? []).map((n) => Number(n)).filter(Number.isFinite)
  if (ids.length === 0) return res.json({ ok: true })

  try {
    await query(
      `INSERT INTO aviso_leitura (aviso_id, usuario_id)
       SELECT unnest($1::bigint[]), $2
       ON CONFLICT DO NOTHING`,
      [ids, req.dono.sub],
    )
    return res.json({ ok: true })
  } catch (e) {
    return tratar(e, res, 'dados/aviso-lido')
  }
})

/* ------------------------------------------------------------
   Avaliacoes da obra

   Sao varias por obra: a do diretor, a do cliente e quantas mais
   quiserem. A media delas e o que o banco guarda em
   obra_avaliacao (por gatilho) e o que entra na nota de cada
   participante. Uma obra avaliada precisa ter pelo menos uma.
   ------------------------------------------------------------ */

const nota = (valor) => {
  const n = Number(String(valor ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null
}

router.post('/obras/:id/avaliacoes', exigeSessao, exige('editar_avaliacoes'), async (req, res) => {
  const valor = nota(req.body?.nota)
  if (valor === null) return res.status(400).json({ erro: 'A nota vai de 0 a 10.' })

  try {
    const { rows } = await query(
      `INSERT INTO obra_avaliacao_item (obra_id, rotulo, nota, descricao, avaliado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, avaliado_em`,
      [
        req.params.id,
        texto(req.body?.rotulo) || 'Avaliação',
        valor,
        texto(req.body?.descricao) || null,
        req.dono.sub,
      ],
    )
    await registrarAtividade(req, {
      acao: 'avaliacao.criada',
      categoria: 'avaliacao',
      entidade: ['obra', req.params.id],
      descricao: 'Avaliação lançada',
      detalhes: {
        ...(await descreverObra(req.params.id)),
        avaliacao: texto(req.body?.rotulo) || 'Avaliação',
        nota: String(valor),
      },
    })
    return res.status(201).json({ id: String(rows[0].id), avaliadaEm: rows[0].avaliado_em })
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra não encontrada.' })
    return tratar(e, res, 'dados/avaliacao-criar')
  }
})

router.patch('/avaliacoes/:id', exigeSessao, exige('editar_avaliacoes'), async (req, res) => {
  const campos = []
  const valores = []
  const por = (coluna, valor) => {
    valores.push(valor)
    campos.push(`${coluna} = $${valores.length}`)
  }

  if (req.body?.nota !== undefined) {
    const valor = nota(req.body.nota)
    if (valor === null) return res.status(400).json({ erro: 'A nota vai de 0 a 10.' })
    por('nota', valor)
  }
  if (req.body?.rotulo !== undefined) por('rotulo', texto(req.body.rotulo) || 'Avaliação')
  if (req.body?.descricao !== undefined) por('descricao', texto(req.body.descricao) || null)
  if (campos.length === 0) return res.status(400).json({ erro: 'Nada para alterar.' })

  valores.push(req.params.id)
  try {
    const { rows } = await query(
      `UPDATE obra_avaliacao_item SET ${campos.join(', ')}
        WHERE id = $${valores.length} RETURNING id, obra_id, rotulo, nota`,
      valores,
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Avaliação não encontrada.' })
    await registrarAtividade(req, {
      acao: 'avaliacao.editada',
      categoria: 'avaliacao',
      entidade: ['obra', rows[0].obra_id],
      descricao: 'Avaliação editada',
      detalhes: {
        ...(await descreverObra(rows[0].obra_id)),
        avaliacao: rows[0].rotulo,
        nota: String(Number(rows[0].nota)),
      },
    })
    return res.json({ ok: true })
  } catch (e) {
    return tratar(e, res, 'dados/avaliacao-editar')
  }
})

router.delete('/avaliacoes/:id', exigeSessao, exige('editar_avaliacoes'), async (req, res) => {
  try {
    const alvo = await query('SELECT obra_id FROM obra_avaliacao_item WHERE id = $1', [
      req.params.id,
    ])
    if (!alvo.rows[0]) return res.status(204).end()

    /* obra avaliada tem que ficar com pelo menos uma nota: para tirar
       a avaliacao inteira existe o DELETE /obras/:id/avaliacao */
    const quantas = await query(
      'SELECT count(*)::int AS n FROM obra_avaliacao_item WHERE obra_id = $1',
      [alvo.rows[0].obra_id],
    )
    if (quantas.rows[0].n <= 1) {
      return res.status(409).json({
        erro: 'A obra precisa ficar com ao menos uma avaliação. Use "Remover avaliação" para tirar todas.',
      })
    }

    await query('DELETE FROM obra_avaliacao_item WHERE id = $1', [req.params.id])
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/avaliacao-apagar')
  }
})

/** Tira a avaliacao inteira da obra (todas as notas de uma vez). */
router.delete('/obras/:id/avaliacao', exigeSessao, exige('editar_avaliacoes'), async (req, res) => {
  try {
    const tiradas = await query('DELETE FROM obra_avaliacao_item WHERE obra_id = $1', [req.params.id])
    await query('DELETE FROM obra_avaliacao WHERE obra_id = $1', [req.params.id])
    if (tiradas.rowCount > 0) {
      await registrarAtividade(req, {
        acao: 'avaliacao.removida',
        categoria: 'avaliacao',
        entidade: ['obra', req.params.id],
        descricao: 'Avaliação da obra removida',
        detalhes: await descreverObra(req.params.id),
      })
    }
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/avaliacao-limpar')
  }
})

/* ------------------------------------------------------------
   Etiquetas

   A etiqueta e do sistema (da para reaproveitar em varias obras)
   e obra_etiqueta e quem usa qual. Criar uma etiqueta com nome
   que ja existe apenas reaproveita a que existe.
   ------------------------------------------------------------ */

router.post('/obras/:id/etiquetas', exigeSessao, exige('editar_obras'), obraAberta, async (req, res) => {
  const nome = texto(req.body?.nome)
  const cor = texto(req.body?.cor) || '#6b7280'
  if (!nome) return res.status(400).json({ erro: 'Escreva o nome da etiqueta.' })
  if (!/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(cor)) {
    return res.status(400).json({ erro: 'Cor inválida.' })
  }

  try {
    let etiqueta
    if (req.body?.etiquetaId) {
      const achada = await query('SELECT * FROM etiqueta WHERE id = $1', [req.body.etiquetaId])
      etiqueta = achada.rows[0]
    }
    if (!etiqueta) {
      const criada = await query(
        `INSERT INTO etiqueta (nome, cor) VALUES ($1, $2)
         ON CONFLICT (lower(btrim(nome))) DO UPDATE SET cor = excluded.cor
         RETURNING *`,
        [nome, cor],
      )
      etiqueta = criada.rows[0]
    }

    const posta = await query(
      'INSERT INTO obra_etiqueta (obra_id, etiqueta_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, etiqueta.id],
    )
    await query('UPDATE obra SET atualizado_por = $1 WHERE id = $2', [req.dono.sub, req.params.id])
    if (posta.rowCount > 0) {
      await registrarAtividade(req, {
        acao: 'etiqueta.marcada',
        categoria: 'obra',
        entidade: ['obra', req.params.id],
        descricao: 'Etiqueta na obra',
        detalhes: { ...(await descreverObra(req.params.id)), etiqueta: etiqueta.nome },
      })
    }

    return res.status(201).json({
      etiqueta: { id: String(etiqueta.id), nome: etiqueta.nome, cor: etiqueta.cor },
    })
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra não encontrada.' })
    return tratar(e, res, 'dados/etiqueta-criar')
  }
})

router.patch('/etiquetas/:id', exigeSessao, exige('editar_obras'), async (req, res) => {
  const campos = []
  const valores = []

  if (req.body?.nome !== undefined) {
    const nome = texto(req.body.nome)
    if (!nome) return res.status(400).json({ erro: 'Escreva o nome da etiqueta.' })
    valores.push(nome)
    campos.push(`nome = $${valores.length}`)
  }
  if (req.body?.cor !== undefined) {
    const cor = texto(req.body.cor)
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
      `UPDATE etiqueta SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING *`,
      valores,
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Etiqueta não encontrada.' })
    return res.json({
      etiqueta: { id: String(rows[0].id), nome: rows[0].nome, cor: rows[0].cor },
    })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Já existe uma etiqueta com esse nome.' })
    return tratar(e, res, 'dados/etiqueta-editar')
  }
})

/** Tira a etiqueta DESTA obra; a etiqueta continua existindo para as outras. */
router.delete('/obras/:id/etiquetas/:etiquetaId', exigeSessao, exige('editar_obras'), obraAberta, async (req, res) => {
  try {
    const nomeEtiqueta = await query('SELECT nome FROM etiqueta WHERE id = $1', [req.params.etiquetaId])
    const tirada = await query('DELETE FROM obra_etiqueta WHERE obra_id = $1 AND etiqueta_id = $2', [
      req.params.id,
      req.params.etiquetaId,
    ])
    if (tirada.rowCount > 0) {
      await registrarAtividade(req, {
        acao: 'etiqueta.tirada',
        categoria: 'obra',
        entidade: ['obra', req.params.id],
        descricao: 'Etiqueta tirada da obra',
        detalhes: {
          ...(await descreverObra(req.params.id)),
          etiqueta: nomeEtiqueta.rows[0]?.nome ?? null,
        },
      })
    }
    /* etiqueta que nao esta em nenhuma obra some da lista: senao a
       caixa de sugestoes vira um cemiterio de nomes antigos */
    await query(
      `DELETE FROM etiqueta e
        WHERE e.id = $1
          AND NOT EXISTS (SELECT 1 FROM obra_etiqueta oe WHERE oe.etiqueta_id = e.id)`,
      [req.params.etiquetaId],
    )
    await query('UPDATE obra SET atualizado_por = $1 WHERE id = $2', [req.dono.sub, req.params.id])
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/etiqueta-tirar')
  }
})

/* ------------------------------------------------------------
   Anexos da obra

   O conteudo (data URL) NAO vem na leitura do quadro: seria
   arrastar megabytes a cada carregamento. A lista traz nome e
   tamanho; o arquivo em si so quando alguem clica para baixar.

   O anexo tambem pode ser um LINK (Google Drive, OneDrive...): chega
   em `link`, vai para `conteudo` com o tipo TIPO_LINK e volta na
   carga, porque e curto (ver src/domain/anexos.js).
   ------------------------------------------------------------ */

router.post('/obras/:id/anexos', exigeSessao, exige('editar_obras'), obraAberta, async (req, res) => {
  const deLink = req.body?.link != null
  const link = deLink ? linkValido(req.body.link) : null
  if (deLink && !link) {
    return res.status(400).json({ erro: 'Esse link não parece certo. Copie o endereço inteiro, começando por https://.' })
  }
  const nome = texto(req.body?.nome).slice(0, NOME_MAXIMO) || (link ? nomeDoLink(link) : '')
  const conteudo = link ?? String(req.body?.conteudo ?? '')
  /* arquivo nunca passa por link: um .uri enviado vira texto comum */
  const tipo = link ? TIPO_LINK : texto(req.body?.tipo) === TIPO_LINK ? 'text/plain' : texto(req.body?.tipo) || null

  if (!nome) return res.status(400).json({ erro: 'O arquivo precisa de um nome.' })
  if (!link && !conteudo.startsWith('data:')) {
    return res.status(400).json({ erro: 'Arquivo inválido.' })
  }

  try {
    const { rows } = await query(
      `INSERT INTO obra_anexo (obra_id, nome, tipo, tamanho, conteudo, enviado_por, autor_nome)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, enviado_em`,
      [
        req.params.id,
        nome,
        tipo,
        link ? null : Number(req.body?.tamanho) || conteudo.length,
        conteudo,
        req.dono.sub,
        await nomeDoDono(req),
      ],
    )
    await query('UPDATE obra SET atualizado_por = $1 WHERE id = $2', [req.dono.sub, req.params.id])
    await registrarAtividade(req, {
      acao: 'anexo.enviado',
      categoria: 'documento',
      entidade: ['obra', req.params.id],
      descricao: link ? 'Link anexado à obra' : 'Documento anexado à obra',
      detalhes: { ...(await descreverObra(req.params.id)), arquivo: nome, ...(link ? { link } : {}) },
    })
    return res.status(201).json({ id: String(rows[0].id), enviadoEm: rows[0].enviado_em, nome, link })
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra não encontrada.' })
    return tratar(e, res, 'dados/anexo-criar')
  }
})

router.get('/anexos/:id', exigeSessao, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT nome, tipo, conteudo FROM obra_anexo WHERE id = $1',
      [req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Anexo não encontrado.' })
    return res.json({
      nome: rows[0].nome,
      tipo: rows[0].tipo ?? '',
      conteudo: rows[0].conteudo,
    })
  } catch (e) {
    return tratar(e, res, 'dados/anexo-ler')
  }
})

/* o anexo e apagado pelo id DELE, nao pelo da obra: a checagem de
   obra fechada precisa ser feita na mao aqui dentro */
router.delete('/anexos/:id', exigeSessao, exige('editar_obras'), async (req, res) => {
  try {
    const dono = await query(
      `SELECT o.concluida_em
         FROM obra_anexo a JOIN obra o ON o.id = a.obra_id
        WHERE a.id = $1`,
      [req.params.id],
    ).catch((e) => (e.code === '42703' ? { rows: [] } : Promise.reject(e)))

    if (dono.rows[0]?.concluida_em) {
      return res.status(409).json({
        erro: 'Esta obra foi concluída. Os anexos dela ficam só para consulta.',
      })
    }

    const apagado = await query('DELETE FROM obra_anexo WHERE id = $1 RETURNING obra_id, nome', [
      req.params.id,
    ])
    if (apagado.rows[0]) {
      await registrarAtividade(req, {
        acao: 'anexo.excluido',
        categoria: 'documento',
        entidade: ['obra', apagado.rows[0].obra_id],
        descricao: 'Documento excluído da obra',
        detalhes: {
          ...(await descreverObra(apagado.rows[0].obra_id)),
          arquivo: apagado.rows[0].nome,
        },
      })
    }
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/anexo-apagar')
  }
})

/* ------------------------------------------------------------
   Chat da obra

   Cada obra tem a sua conversa, e ela fica gravada. A mensagem
   pode responder outra, levar um arquivo e mencionar pessoas —
   as mencoes viram uma lista de ids, para a tela destacar.
   ------------------------------------------------------------ */

/**
 * A mensagem como a tela a recebe.
 *
 * Mensagem APAGADA PARA TODOS chega vazia de proposito: sem texto, sem
 * arquivo, so com o autor, a hora e a marca `apagada`. E o que permite
 * a conversa continuar fazendo sentido — quem respondeu aquela mensagem
 * ainda ve que houve algo ali — sem que o conteudo sobreviva ao pedido
 * de apagar.
 */
const paraMensagem = (l) => {
  const apagada = Boolean(l.apagada_em)
  return {
    id: String(l.id),
    autorId: l.usuario_id === null ? null : String(l.usuario_id),
    autorNome: l.autor_nome,
    texto: apagada ? '' : (l.texto ?? ''),
    respondeA: l.responde_a === null ? null : String(l.responde_a),
    arquivo:
      !apagada && l.arquivo_nome
        ? { nome: l.arquivo_nome, tipo: l.arquivo_tipo ?? '', conteudo: l.arquivo_conteudo }
        : null,
    enviadaEm: l.enviada_em,
    editadaEm: apagada ? null : (l.editada_em ?? null),
    apagada,
    apagadaEm: l.apagada_em ?? null,
    mencoes: [],
  }
}

router.get('/obras/:id/chat', exigeSessao, async (req, res) => {
  try {
    const [mensagens, mencoes] = await Promise.all([
      /* o "apagar para mim" e por pessoa: a mensagem escondida por
         alguem continua inteira na conversa de todos os outros, e por
         isso ela sai aqui, na leitura, e nao do banco */
      query(
        `SELECT c.* FROM obra_chat c
          WHERE c.obra_id = $1
            AND NOT EXISTS (
                SELECT 1 FROM obra_chat_oculta o
                 WHERE o.mensagem_id = c.id AND o.usuario_id = $2
            )
          ORDER BY c.enviada_em`,
        [req.params.id, req.dono.sub],
      ).catch((e) =>
        /* banco sem a tabela nova ainda: le a conversa inteira */
        e.code === '42P01'
          ? query('SELECT * FROM obra_chat WHERE obra_id = $1 ORDER BY enviada_em', [req.params.id])
          : Promise.reject(e),
      ),
      query(
        `SELECT m.mensagem_id, m.usuario_id
           FROM obra_chat_mencao m JOIN obra_chat c ON c.id = m.mensagem_id
          WHERE c.obra_id = $1`,
        [req.params.id],
      ),
    ])

    const porMensagem = {}
    mencoes.rows.forEach((l) => {
      const lista = porMensagem[l.mensagem_id] ?? []
      lista.push(String(l.usuario_id))
      porMensagem[l.mensagem_id] = lista
    })

    return res.json({
      mensagens: mensagens.rows.map((l) => ({
        ...paraMensagem(l),
        mencoes: porMensagem[l.id] ?? [],
      })),
    })
  } catch (e) {
    return tratar(e, res, 'dados/chat-ler')
  }
})

router.post('/obras/:id/chat', exigeSessao, obraAberta, async (req, res) => {
  const conteudo = texto(req.body?.texto)
  const arquivo = req.body?.arquivo ?? null

  if (!conteudo && !arquivo?.conteudo) {
    return res.status(400).json({ erro: 'Escreva uma mensagem ou anexe um arquivo.' })
  }
  if (arquivo?.conteudo && !String(arquivo.conteudo).startsWith('data:')) {
    return res.status(400).json({ erro: 'Arquivo inválido.' })
  }

  try {
    const { rows } = await query(
      `INSERT INTO obra_chat (obra_id, usuario_id, autor_nome, texto, responde_a,
                              arquivo_nome, arquivo_tipo, arquivo_conteudo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.params.id,
        req.dono.sub,
        await nomeDoDono(req),
        conteudo || null,
        req.body?.respondeA || null,
        arquivo?.nome ? texto(arquivo.nome) : null,
        arquivo?.tipo ? texto(arquivo.tipo) : null,
        arquivo?.conteudo ?? null,
      ],
    )

    const mencoes = [...new Set((req.body?.mencoes ?? []).map((n) => Number(n)).filter(Number.isFinite))]
    if (mencoes.length > 0) {
      await query(
        `INSERT INTO obra_chat_mencao (mensagem_id, usuario_id)
         SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING`,
        [rows[0].id, mencoes],
      )
    }

    /* quem participa da obra recebe; quem foi citado recebe com o @ */
    const membros = await membrosDaObraIds(req.params.id)
    const { obra: proposta, cliente } = await descreverObra(req.params.id)
    await avisarNoCelular({
      /* os do check e os parciais que aceitaram (membrosDaObraIds ja devolve os ids) */
      destinos: membros,
      mencoes,
      linha: rows[0],
      onde: `Chat da obra ${[proposta, cliente].filter(Boolean).join(' - ')}`.trim(),
      url: `/core/app/obras/${req.params.id}`,
      tag: `chat-obra-${req.params.id}`,
    })

    return res.status(201).json({
      mensagem: { ...paraMensagem(rows[0]), mencoes: mencoes.map(String) },
    })
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra não encontrada.' })
    return tratar(e, res, 'dados/chat-enviar')
  }
})

/**
 * DELETE /obras/:id/chat/:mensagemId?escopo=todos|mim
 *
 * Dois gestos diferentes, e a diferenca importa:
 *
 *   escopo=todos — a mensagem sai da conversa de TODO MUNDO. A linha
 *     fica, mas vazia: texto e arquivo viram NULL e no lugar dela a tela
 *     mostra "mensagem apagada". O rastro e o que evita o buraco na
 *     conversa — quem respondeu aquela mensagem continua entendendo a
 *     propria resposta. So o autor pode (e o cargo com acesso total,
 *     para o caso de alguem sair da empresa deixando algo indevido).
 *
 *   escopo=mim (padrao) — some so da MINHA tela. Vale para qualquer
 *     mensagem, minha ou de outra pessoa, e nao muda nada para ninguem.
 *
 * O padrao e o menos destrutivo dos dois: uma chamada sem `escopo` nao
 * apaga a mensagem de outras pessoas.
 */
router.delete('/obras/:id/chat/:mensagemId', exigeSessao, obraAberta, async (req, res) => {
  const paraTodos = String(req.query?.escopo ?? 'mim') === 'todos'

  try {
    const dona = await query('SELECT usuario_id FROM obra_chat WHERE id = $1 AND obra_id = $2', [
      req.params.mensagemId,
      req.params.id,
    ])
    if (!dona.rows[0]) return res.status(204).end()

    if (!paraTodos) {
      await query(
        `INSERT INTO obra_chat_oculta (mensagem_id, usuario_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.mensagemId, req.dono.sub],
      )
      return res.status(204).end()
    }

    const meu = await meuCargo(req.dono.sub)
    if (!meu.acessoTotal && String(dona.rows[0].usuario_id) !== String(req.dono.sub)) {
      return res.status(403).json({
        erro: 'Você só apaga para todos as suas próprias mensagens.',
      })
    }

    /* o conteudo some de verdade; o que sobra e a marca de que houve
       uma mensagem ali. As menções vao junto: elas eram do texto. */
    await query(
      `UPDATE obra_chat
          SET texto = NULL, arquivo_nome = NULL, arquivo_tipo = NULL,
              arquivo_conteudo = NULL, apagada_em = now(), apagada_por = $1
        WHERE id = $2 AND obra_id = $3`,
      [req.dono.sub, req.params.mensagemId, req.params.id],
    )
    await query('DELETE FROM obra_chat_mencao WHERE mensagem_id = $1', [req.params.mensagemId])
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/chat-apagar')
  }
})

/* ============================================================
   MEMBRO PARCIAL (atualizacao 30)

   Membro da obra e quem marcou check nela (obra_membro). Mas nem todo
   mundo que vai a obra marca check — nem ha check para todos. O membro
   PARCIAL e quem alguem incluiu na mao:

     POST   /obras/:id/parciais                      inclui { usuarioId }:
                                                     fica pendente ate a
                                                     pessoa responder
     POST   /obras/:id/parciais/:usuarioId/resposta  a PROPRIA pessoa aceita
                                                     { aceitar: true } ou
                                                     recusa { motivo }
     DELETE /obras/:id/parciais/:usuarioId           tira da obra

   Incluir: qualquer um que ve Obras — quem decide e a pessoa incluida,
   que recebe a solicitacao (no sino e no celular). Quem se inclui
   entra ja aceito: nao ha a quem perguntar.

   Tirar: quem tem `excluir_membro_parcial`. Sem ela, so quem incluiu,
   e so enquanto a pessoa ainda nao respondeu — e desfazer o engano.

   Recusada, a inclusao fica registrada com o motivo (quem incluiu ve
   por que) e pode ser refeita: incluir de novo volta a pendente.
   ============================================================ */

/** Quem recebe o que acontece na obra: os do check e os parciais que aceitaram. */
async function membrosDaObraIds(obraId) {
  const { rows } = await query(
    `SELECT usuario_id FROM obra_membro WHERE obra_id = $1
      UNION
     SELECT usuario_id FROM obra_membro_parcial WHERE obra_id = $1 AND status = 'aceito'`,
    [obraId],
  ).catch((erro) => {
    /* sem a atualizacao 30, so os do check */
    if (erro.code !== '42P01') throw erro
    return query('SELECT usuario_id FROM obra_membro WHERE obra_id = $1', [obraId])
  })
  return rows.map((l) => l.usuario_id)
}

const nomeDaObra = async (obraId) => {
  const { obra, cliente } = await descreverObra(obraId)
  return [obra, cliente].filter(Boolean).join(' - ') || 'obra'
}

const idValido = (valor) => /^\d{1,15}$/.test(String(valor ?? ''))

/**
 * Inclui a pessoa na obra como membro parcial: pendente ate ela
 * responder (aceito direto quando e a propria pessoa). Avisa no
 * celular e grava no historico.
 *
 * Devolve { status } — ou { ja: 'check' } (marcou check: ja e membro)
 * ou { ja: 'incluido' } (pendente ou aceita). { erro } se a obra ou a
 * pessoa nao existe.
 */
async function pedirInclusao(req, obraId, usuarioId) {
  const [obra, pessoa, comCheck] = await Promise.all([
    query('SELECT id FROM obra WHERE id = $1', [obraId]),
    query('SELECT name, coalesce(ativo, true) AS ativo FROM usuario WHERE id = $1', [usuarioId]),
    query('SELECT 1 FROM obra_membro WHERE obra_id = $1 AND usuario_id = $2', [obraId, usuarioId]),
  ])
  if (!obra.rows[0]) return { erro: 'Obra não encontrada.', status: 404 }
  if (!pessoa.rows[0]?.ativo) return { erro: 'Essa pessoa não está mais na equipe.', status: 404 }
  if (comCheck.rows[0]) return { ja: 'check' }

  const euMesmo = String(usuarioId) === String(req.dono.sub)
  /* incluir de novo quem tinha recusado volta a perguntar; quem esta
     pendente ou ja aceitou nao muda */
  const { rows } = await query(
    `INSERT INTO obra_membro_parcial (obra_id, usuario_id, incluido_por, status, respondido_em)
     VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'aceito' THEN now() END)
     ON CONFLICT (obra_id, usuario_id) DO UPDATE
        SET status = EXCLUDED.status, motivo = NULL, respondido_em = EXCLUDED.respondido_em,
            incluido_por = EXCLUDED.incluido_por, incluido_em = now()
      WHERE obra_membro_parcial.status = 'recusado'
     RETURNING status`,
    [obraId, usuarioId, req.dono.sub, euMesmo ? 'aceito' : 'pendente'],
  )
  if (!rows[0]) return { ja: 'incluido' }

  const nome = await nomeDaObra(obraId)
  await registrarAtividade(req, {
    acao: 'obra.membro_incluido',
    categoria: 'obra',
    entidade: ['obra', obraId],
    descricao: 'Membro parcial incluído na obra',
    detalhes: { ...(await descreverObra(obraId)), pessoa: pessoa.rows[0].name },
  })
  if (!euMesmo) {
    const { rows: eu } = await query('SELECT name FROM usuario WHERE id = $1', [req.dono.sub])
    await notificar([usuarioId], {
      titulo: 'Inclusão em obra',
      corpo: `${eu[0]?.name ?? 'Alguém'} incluiu você como membro da obra ${nome}. Aceite ou recuse.`,
      url: `/core/app/obras/${obraId}`,
      tag: `parcial-${obraId}`,
    })
  }
  return { status: rows[0].status }
}

router.post('/obras/:id/parciais', exigeSessao, exige('ver_obras'), async (req, res) => {
  const usuarioId = texto(req.body?.usuarioId)
  if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Obra inválida.' })
  if (!idValido(usuarioId)) return res.status(400).json({ erro: 'Escolha a pessoa.' })
  try {
    const feito = await pedirInclusao(req, req.params.id, usuarioId)
    if (feito.erro) return res.status(feito.status).json({ erro: feito.erro })
    if (feito.ja === 'check') {
      return res.status(409).json({ erro: 'Essa pessoa já é membro da obra: ela marcou check aqui.' })
    }
    if (feito.ja) return res.status(409).json({ erro: 'Essa pessoa já foi incluída nesta obra.' })
    return res.status(201).json({ status: feito.status })
  } catch (e) {
    if (e.code === '42P01') {
      return res.status(503).json({ erro: 'O banco ainda não tem o membro parcial (atualização 30). Rode npm run db:atualizar.' })
    }
    return tratar(e, res, 'dados/parcial-incluir')
  }
})

/* sem exige(): quem responde e a propria pessoa incluida, tenha o
   setor dela a aba Obras ou nao */
router.post('/obras/:id/parciais/:usuarioId/resposta', exigeSessao, async (req, res) => {
  if (!idValido(req.params.id) || !idValido(req.params.usuarioId)) {
    return res.status(400).json({ erro: 'Solicitação inválida.' })
  }
  if (String(req.params.usuarioId) !== String(req.dono.sub)) {
    return res.status(403).json({ erro: 'Só a pessoa incluída responde à solicitação.' })
  }
  const aceitar = req.body?.aceitar === true
  const motivo = aceitar ? null : texto(req.body?.motivo).slice(0, 500)
  if (!aceitar && !motivo) return res.status(400).json({ erro: 'Escreva o motivo da recusa.', campo: 'motivo' })
  try {
    const { rows } = await query(
      `UPDATE obra_membro_parcial
          SET status = $1, motivo = $2, respondido_em = now()
        WHERE obra_id = $3 AND usuario_id = $4 AND status = 'pendente'
        RETURNING incluido_por`,
      [aceitar ? 'aceito' : 'recusado', motivo, req.params.id, req.params.usuarioId],
    )
    if (!rows[0]) return res.status(409).json({ erro: 'Essa solicitação já foi respondida ou cancelada.' })

    const nome = await nomeDaObra(req.params.id)
    const { rows: eu } = await query('SELECT name FROM usuario WHERE id = $1', [req.dono.sub])
    const quem = eu[0]?.name ?? 'A pessoa'
    await registrarAtividade(req, {
      acao: aceitar ? 'obra.membro_aceitou' : 'obra.membro_recusou',
      categoria: 'obra',
      entidade: ['obra', req.params.id],
      descricao: aceitar ? 'Aceitou a inclusão na obra' : 'Recusou a inclusão na obra',
      detalhes: { ...(await descreverObra(req.params.id)), motivo },
    })
    /* quem incluiu fica sabendo da resposta */
    if (rows[0].incluido_por !== null) {
      await notificar([rows[0].incluido_por], {
        titulo: aceitar ? 'Inclusão aceita' : 'Inclusão recusada',
        corpo: aceitar
          ? `${quem} aceitou ser membro da obra ${nome}.`
          : `${quem} recusou ser membro da obra ${nome}: ${motivo}`,
        url: `/core/app/obras/${req.params.id}`,
        tag: `parcial-resposta-${req.params.id}-${req.params.usuarioId}`,
      })
    }
    return res.json({ status: aceitar ? 'aceito' : 'recusado' })
  } catch (e) {
    return tratar(e, res, 'dados/parcial-responder')
  }
})

router.delete('/obras/:id/parciais/:usuarioId', exigeSessao, exige('ver_obras'), async (req, res) => {
  if (!idValido(req.params.id) || !idValido(req.params.usuarioId)) {
    return res.status(400).json({ erro: 'Solicitação inválida.' })
  }
  try {
    const { rows } = await query(
      'SELECT p.status, p.incluido_por, u.name FROM obra_membro_parcial p JOIN usuario u ON u.id = p.usuario_id WHERE p.obra_id = $1 AND p.usuario_id = $2',
      [req.params.id, req.params.usuarioId],
    )
    if (!rows[0]) return res.status(404).json({ erro: 'Essa pessoa não está incluída nesta obra.' })

    const podeTirar = cargoPode(await meuCargo(req.dono.sub), 'excluir_membro_parcial')
    const desfazendo = rows[0].status === 'pendente' && String(rows[0].incluido_por) === String(req.dono.sub)
    if (!podeTirar && !desfazendo) {
      return res.status(403).json({ erro: 'Seu setor não tem permissão para tirar membro parcial da obra.' })
    }

    await query('DELETE FROM obra_membro_parcial WHERE obra_id = $1 AND usuario_id = $2', [
      req.params.id,
      req.params.usuarioId,
    ])
    await registrarAtividade(req, {
      acao: 'obra.membro_removido',
      categoria: 'obra',
      entidade: ['obra', req.params.id],
      descricao: desfazendo && !podeTirar ? 'Inclusão de membro cancelada' : 'Membro parcial tirado da obra',
      detalhes: { ...(await descreverObra(req.params.id)), pessoa: rows[0].name },
    })
    return res.status(204).end()
  } catch (e) {
    return tratar(e, res, 'dados/parcial-tirar')
  }
})

/* ============================================================
   O CHECK COM HORARIO (atualizacao 31)

     PUT /obras/:id/horarios/:checkId
         { dias: [{ dia: 'AAAA-MM-DD', hora: 'HH:MM', membros: [ids] }],
           marcar?: true | false }

   O pop-up do check (ex.: "Ponto de encontro") manda a lista inteira:
   cada data da obra com o horario e quem vai. Data que saiu da lista
   sai do banco. `marcar` marca ou desmarca o check no mesmo gesto
   (sem ele, o check fica como esta).

   Quem vai numa data e ainda nao e membro da obra recebe a solicitacao
   de inclusao (o membro parcial) — e o "adicionar membros" por aqui.
   Cada pessoa de cada data vira um turno na aba Turnos.

   Quem pode: quem marca o check (podeMarcar), na obra aberta.
   ============================================================ */

const DIAS_MAXIMOS = 120

router.put('/obras/:id/horarios/:checkId', exigeSessao, obraAberta, async (req, res) => {
  const { id: obraId, checkId } = req.params
  if (!idValido(obraId) || !idValido(checkId)) return res.status(400).json({ erro: 'Check inválido.' })

  const bruto = Array.isArray(req.body?.dias) ? req.body.dias : null
  if (!bruto) return res.status(400).json({ erro: 'Mande as datas e os horários.' })
  if (bruto.length > DIAS_MAXIMOS) return res.status(400).json({ erro: `No máximo ${DIAS_MAXIMOS} datas.` })
  const dias = []
  for (const item of bruto) {
    const dia = texto(item?.dia)
    const hora = texto(item?.hora)
    if (!dataValida(dia)) return res.status(400).json({ erro: 'Uma das datas é inválida.' })
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
      return res.status(400).json({ erro: `Informe o horário de ${dia.split('-').reverse().join('/')}.` })
    }
    if (dias.some((d) => d.dia === dia)) return res.status(400).json({ erro: 'Há uma data repetida.' })
    const membros = [...new Set((Array.isArray(item?.membros) ? item.membros : []).map(String))]
    if (membros.some((m) => !idValido(m))) return res.status(400).json({ erro: 'Uma das pessoas é inválida.' })
    dias.push({ dia, hora, membros })
  }
  const marcar = typeof req.body?.marcar === 'boolean' ? req.body.marcar : undefined

  try {
    if (!(await podeMarcar(req.dono.sub, checkId, obraId))) {
      return res.status(403).json({ erro: 'Este check é de outro setor.' })
    }
    const { rows: ck } = await query('SELECT horario FROM etapa_check WHERE id = $1', [checkId]).catch((erro) => {
      if (erro.code === '42703') return { rows: [] }
      throw erro
    })
    if (!ck[0]?.horario) return res.status(400).json({ erro: 'Este check não tem horário.' })

    const todos = [...new Set(dias.flatMap((d) => d.membros))]
    if (todos.length) {
      const { rows: ativos } = await query('SELECT id FROM usuario WHERE id = ANY($1::bigint[]) AND ativo', [todos])
      if (ativos.length !== todos.length) {
        return res.status(400).json({ erro: 'Uma das pessoas escolhidas não está mais na equipe.' })
      }
    }

    if (marcar === true) {
      if (dias.length === 0) {
        return res.status(400).json({ erro: 'Defina o horário de ao menos uma data antes de marcar o check.' })
      }
      const regra = await regraDoCheck(checkId)
      if (regra.papel === 'execucao') {
        const datas = await datasDaObra(obraId)
        if (!datas?.execucaoPrazo) {
          return res.status(409).json({
            erro: 'A etapa de execução exige o prazo da execução. Defina o período de execução antes de marcar os checks dela.',
          })
        }
      }
    }

    const marcouAgora = await emTransacao(async (db) => {
      await db.query(
        'DELETE FROM obra_horario WHERE obra_id = $1 AND check_id = $2 AND NOT (dia = ANY($3::date[]))',
        [obraId, checkId, dias.map((d) => d.dia)],
      )
      for (const d of dias) {
        await db.query(
          `INSERT INTO obra_horario (obra_id, check_id, dia, hora, atualizado_por)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (obra_id, check_id, dia) DO UPDATE
              SET hora = EXCLUDED.hora, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()`,
          [obraId, checkId, d.dia, d.hora, req.dono.sub],
        )
        await db.query('DELETE FROM obra_horario_membro WHERE obra_id = $1 AND check_id = $2 AND dia = $3', [
          obraId,
          checkId,
          d.dia,
        ])
        if (d.membros.length) {
          await db.query(
            `INSERT INTO obra_horario_membro (obra_id, check_id, dia, usuario_id)
             SELECT $1, $2, $3, unnest($4::bigint[])`,
            [obraId, checkId, d.dia, d.membros],
          )
        }
      }
      if (marcar === true) {
        const { rowCount } = await db.query(
          `INSERT INTO obra_check (obra_id, check_id, feito_por) VALUES ($1, $2, $3)
           ON CONFLICT (obra_id, check_id) DO NOTHING`,
          [obraId, checkId, req.dono.sub],
        )
        return rowCount > 0
      }
      if (marcar === false) {
        await db.query('DELETE FROM obra_check WHERE obra_id = $1 AND check_id = $2', [obraId, checkId])
      }
      return false
    })

    /* quem vai e ainda nao e membro da obra recebe a solicitacao */
    for (const usuarioId of todos) {
      await pedirInclusao(req, obraId, usuarioId).catch((erro) => {
        if (erro.code !== '42P01') throw erro
      })
    }

    const curta = (iso) => iso.split('-').reverse().slice(0, 2).join('/')
    await registrarAtividade(req, {
      acao: 'obra.horarios',
      categoria: 'obra',
      entidade: ['obra', obraId],
      descricao: 'Horários do check definidos',
      detalhes: {
        ...(await descreverObra(obraId)),
        ...(await descreverCheck(checkId)),
        datas: dias.map((d) => `${curta(d.dia)} ${d.hora}`).join('; ') || 'nenhuma',
      },
    })
    if (marcouAgora) {
      await registrarAtividade(req, {
        acao: 'check.marcado',
        categoria: 'check',
        entidade: ['obra', obraId],
        descricao: 'Check concluído',
        detalhes: { ...(await descreverObra(obraId)), ...(await descreverCheck(checkId)) },
      })
    }
    return res.json({ ok: true })
  } catch (e) {
    if (e.code === '42P01') {
      return res.status(503).json({ erro: 'O banco ainda não tem o check com horário (atualização 31). Rode npm run db:atualizar.' })
    }
    if (e.code === '23503') return res.status(404).json({ erro: 'Obra ou check não encontrado.' })
    return tratar(e, res, 'dados/horarios')
  }
})

export default router
