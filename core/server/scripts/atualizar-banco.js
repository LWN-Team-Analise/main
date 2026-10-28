/**
 * Aplica no banco os arquivos de ATUALIZACAO de db/, na ordem.
 *
 *   npm run db:atualizar
 *
 * Usa a mesma conexao da API (server/db.js, credenciais do .env), entao
 * nao precisa de psql no PATH nem de digitar senha.
 *
 * SO os arquivos de atualizacao entram aqui. Os de instalacao
 * (usuario.sql.txt, sistema.sql.txt, quadro.sql.txt) ficam de fora de
 * proposito: num banco que ja roda eles nao acrescentam nada, e o
 * sistema.sql.txt ainda desfaz o que o quadro.sql.txt fez — ele repoe
 * as views antigas, que olham a tabela obra_tarefa. Instalacao nova
 * continua sendo pelos arquivos, na ordem do README.
 *
 * Todos sao idempotentes: rodar de novo nao quebra nada, e e assim que
 * se descobre se falta algum.
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pool, query } from '../db.js'

/* Os caminhos de ARQUIVOS sao relativos a core/: resolvidos a partir
   deste arquivo, o script funciona rodando da raiz do site ou de dentro
   de core. */
const naPasta = (arquivo) => fileURLToPath(new URL(`../../${arquivo}`, import.meta.url))

const ARQUIVOS = [
  'db/atualizacao.sql.txt',
  'db/setores-e-chat.sql.txt',
  'db/atualizacao-2.sql.txt',
  'db/atualizacao-3.sql.txt',
  'db/atualizacao-4.sql.txt',
  'db/atualizacao-5.sql.txt',
  'db/atualizacao-6.sql.txt',
  'db/atualizacao-7.sql.txt',
  'db/atualizacao-8.sql.txt',
  'db/atualizacao-9.sql.txt',
  'db/atualizacao-10.sql.txt',
  'db/atualizacao-11.sql.txt',
  'db/atualizacao-12.sql.txt',
  'db/atualizacao-13.sql.txt',
  'db/atualizacao-14.sql.txt',
  'db/atualizacao-15.sql.txt',
  'db/atualizacao-16.sql.txt',
  'db/atualizacao-17.sql.txt',
  'db/atualizacao-18.sql.txt',
  'db/atualizacao-19.sql.txt',
  'db/atualizacao-20.sql.txt',
  'db/atualizacao-21.sql.txt',
  'db/atualizacao-22.sql.txt',
  'db/atualizacao-23.sql.txt',
  'db/atualizacao-24.sql.txt',
  'db/atualizacao-25.sql.txt',
  'db/atualizacao-26.sql.txt',
  'db/atualizacao-27.sql.txt',
  'db/atualizacao-28.sql.txt',
  'db/atualizacao-29.sql.txt',
  'db/atualizacao-30.sql.txt',
  'db/atualizacao-31.sql.txt',
  'db/atualizacao-32.sql.txt',
  'db/atualizacao-33.sql.txt',
  'db/atualizacao-34.sql.txt',
  'db/atualizacao-35.sql.txt',
]

/**
 * O que cada arquivo tinha de deixar pronto.
 *
 * Serve para o script responder "deu certo?" sem a pessoa ter de ler
 * o SQL: se alguma linha vier FALTA, aquele arquivo nao passou.
 */
const CONFERENCIA = [
  ['etiqueta', "SELECT to_regclass('public.etiqueta') IS NOT NULL AS ok"],
  ['obra_anexo', "SELECT to_regclass('public.obra_anexo') IS NOT NULL AS ok"],
  ['obra_chat', "SELECT to_regclass('public.obra_chat') IS NOT NULL AS ok"],
  ['cargo.permissoes', col('cargo', 'permissoes')],
  ['setor_cliente', "SELECT to_regclass('public.setor_cliente') IS NOT NULL AS ok"],
  ['obra.proposta', col('obra', 'proposta')],
  ['obra.concluida_em', col('obra', 'concluida_em')],
  ['obra.concluida_por', col('obra', 'concluida_por')],
  ['obra.conclusao_obs', col('obra', 'conclusao_obs')],
  ['usuario.cargo_titulo', col('usuario', 'cargo_titulo')],
  ['obra.descricao aceita NULL', nulavel('obra', 'descricao')],
  ['usuario.email aceita NULL', nulavel('usuario', 'email')],
  ['gatilho obra_check_sai', "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='obra_check_sai_tg') AS ok"],
  ['configuracao', "SELECT to_regclass('public.configuracao') IS NOT NULL AS ok"],
  ['termo_etapa', "SELECT EXISTS (SELECT 1 FROM configuracao WHERE chave='termo_etapa') AS ok"],
  ['obra_chat.apagada_em', col('obra_chat', 'apagada_em')],
  ['obra_chat_oculta', "SELECT to_regclass('public.obra_chat_oculta') IS NOT NULL AS ok"],
  ['cargo_titulo', "SELECT to_regclass('public.cargo_titulo') IS NOT NULL AS ok"],
  ['usuario.cargo_titulo_id', col('usuario', 'cargo_titulo_id')],
  ['cliente.capa', col('cliente', 'capa')],
  ['cliente.logo_original', col('cliente', 'logo_original')],
  ['usuario.foto_original', col('usuario', 'foto_original')],
  ['usuario.data_nascimento aceita NULL', nulavel('usuario', 'data_nascimento')],
  ['etapa.descricao', col('etapa', 'descricao')],
  ['observacao_quadro.inicio_em', col('observacao_quadro', 'inicio_em')],
  ['observacao_quadro.fim_em', col('observacao_quadro', 'fim_em')],
  ['usuario.avisos_email', col('usuario', 'avisos_email')],
  ['chat_site.arquivo_conteudo', col('chat_site', 'arquivo_conteudo')],
  ['chat_site.responde_a', col('chat_site', 'responde_a')],
  ['chat_site.texto aceita NULL', nulavel('chat_site', 'texto')],
  ['chat_site_mencao', "SELECT to_regclass('public.chat_site_mencao') IS NOT NULL AS ok"],
  ['chat_site_oculta', "SELECT to_regclass('public.chat_site_oculta') IS NOT NULL AS ok"],
  ['etiqueta_card', "SELECT to_regclass('public.etiqueta_card') IS NOT NULL AS ok"],
  ['card_etiqueta', "SELECT to_regclass('public.card_etiqueta') IS NOT NULL AS ok"],
  ['despesa_envio', "SELECT to_regclass('public.despesa_envio') IS NOT NULL AS ok"],
  ['despesa_anexo', "SELECT to_regclass('public.despesa_anexo') IS NOT NULL AS ok"],
  ['atividade', "SELECT to_regclass('public.atividade') IS NOT NULL AS ok"],
  ['despesa_envio.cliente_id', col('despesa_envio', 'cliente_id')],
  ['ver_dashboard no acesso total', permissaoNoAcessoTotal('ver_dashboard')],
  ['excluir_despesas no acesso total', permissaoNoAcessoTotal('excluir_despesas')],
  ['usuario.cpf aceita NULL', nulavel('usuario', 'cpf')],
  ['etapa_check.sim_nao', col('etapa_check', 'sim_nao')],
  ['etapa_check.informacoes', col('etapa_check', 'informacoes')],
  ['etapa_card.informacoes', col('etapa_card', 'informacoes')],
  ['obra_check.resposta', col('obra_check', 'resposta')],
  ['obra_prazo_etapa', "SELECT to_regclass('public.obra_prazo_etapa') IS NOT NULL AS ok"],
  ['obra_prazo_check', "SELECT to_regclass('public.obra_prazo_check') IS NOT NULL AS ok"],
  ['definir_prazos no acesso total', permissaoNoAcessoTotal('definir_prazos')],
  ['etapa.fixa', col('etapa', 'fixa')],
  ['etapa.papel', col('etapa', 'papel')],
  ['etapa de execucao', "SELECT EXISTS (SELECT 1 FROM etapa WHERE papel = 'execucao') AS ok"],
  ['etapa_check.tipo', col('etapa_check', 'tipo')],
  ['check Planejamento de ensaios', "SELECT EXISTS (SELECT 1 FROM etapa_check WHERE tipo = 'planejamento_ensaios') AS ok"],
  ['check Execucao dos ensaios', "SELECT EXISTS (SELECT 1 FROM etapa_check WHERE tipo = 'execucao_ensaios') AS ok"],
  ['ensaio', "SELECT to_regclass('public.ensaio') IS NOT NULL AS ok"],
  ['obra_ensaio', "SELECT to_regclass('public.obra_ensaio') IS NOT NULL AS ok"],
  ['obra_ensaio_progresso', "SELECT to_regclass('public.obra_ensaio_progresso') IS NOT NULL AS ok"],
  ['obra.execucao_inicio', col('obra', 'execucao_inicio')],
  ['gerenciar_ensaios no acesso total', permissaoNoAcessoTotal('gerenciar_ensaios')],
  ['obra.execucao_prazo', col('obra', 'execucao_prazo')],
  [
    'etapas fixas com o nome automatico',
    "SELECT NOT EXISTS (SELECT 1 FROM etapa WHERE fixa AND vigente_ate IS NULL AND nome IN ('Comercial', 'Planejamento', 'Execução', 'Entrega', 'Encerramento')) AS ok",
  ],
  ['ensaio.classificacao', col('ensaio', 'classificacao')],
  ['etapa_check.obra_id', col('etapa_check', 'obra_id')],
  ['check prazo_execucao', "SELECT EXISTS (SELECT 1 FROM etapa_check WHERE tipo = 'prazo_execucao') AS ok"],
  ['obra.checks_proprios', col('obra', 'checks_proprios')],
  [
    'check Material de gases',
    "SELECT EXISTS (SELECT 1 FROM etapa_check WHERE tipo = 'material_gases' AND vigente_ate IS NULL) AS ok",
  ],
  ['obra.execucao_dias', col('obra', 'execucao_dias')],
  ['tentativa_acesso', "SELECT to_regclass('public.tentativa_acesso') IS NOT NULL AS ok"],
  ['veiculo', "SELECT to_regclass('public.veiculo') IS NOT NULL AS ok"],
  ['veiculo_registro', "SELECT to_regclass('public.veiculo_registro') IS NOT NULL AS ok"],
  ['veiculo_foto', "SELECT to_regclass('public.veiculo_foto') IS NOT NULL AS ok"],
  ['ver_frotas no acesso total', permissaoNoAcessoTotal('ver_frotas')],
  ['cliente.ordem_prioridade', col('cliente', 'ordem_prioridade')],
  ['check Reserva de carro', "SELECT EXISTS (SELECT 1 FROM etapa_check WHERE tipo = 'reserva_carro' AND vigente_ate IS NULL) AS ok"],
  ['check Retirada do carro', "SELECT EXISTS (SELECT 1 FROM etapa_check WHERE tipo = 'retirada_carro' AND vigente_ate IS NULL) AS ok"],
  ['obra_reserva_veiculo', "SELECT to_regclass('public.obra_reserva_veiculo') IS NOT NULL AS ok"],
  ['despesa_envio.cliente_texto', col('despesa_envio', 'cliente_texto')],
  ['despesa_envio.planilha_chave', col('despesa_envio', 'planilha_chave')],
  ['obra.servico', col('obra', 'servico')],
  ['obra_item', "SELECT to_regclass('public.obra_item') IS NOT NULL AS ok"],
  ['obra_item_ensaio', "SELECT to_regclass('public.obra_item_ensaio') IS NOT NULL AS ok"],
  ['push_inscricao', "SELECT to_regclass('public.push_inscricao') IS NOT NULL AS ok"],
  ['chat_site_leitura', "SELECT to_regclass('public.chat_site_leitura') IS NOT NULL AS ok"],
  ['cliente_pessoa', "SELECT to_regclass('public.cliente_pessoa') IS NOT NULL AS ok"],
  ['negocio', "SELECT to_regclass('public.negocio') IS NOT NULL AS ok"],
  ['negocio_email', "SELECT to_regclass('public.negocio_email') IS NOT NULL AS ok"],
  ['cliente.proprietario_id', col('cliente', 'proprietario_id')],
  ['cargo.painel_tv', col('cargo', 'painel_tv')],
  ['setor Painel TV', "SELECT EXISTS (SELECT 1 FROM cargo WHERE chave = 'painel_tv' AND painel_tv) AS ok"],
  ['ver_comercial no acesso total', permissaoNoAcessoTotal('ver_comercial')],
  ['presenca', "SELECT to_regclass('public.presenca') IS NOT NULL AS ok"],
  ['negocio.moeda', col('negocio', 'moeda')],
  ['negocio.probabilidade', col('negocio', 'probabilidade')],
  ['negocio.contato_tipo', col('negocio', 'contato_tipo')],
  ['cliente_pessoa.cliente_id aceita NULL', nulavel('cliente_pessoa', 'cliente_id')],
  ['negocio.obra_id', col('negocio', 'obra_id')],
  ['obra_membro_parcial', "SELECT to_regclass('public.obra_membro_parcial') IS NOT NULL AS ok"],
  ['excluir_membro_parcial no acesso total', permissaoNoAcessoTotal('excluir_membro_parcial')],
  ['etapa_check.horario', col('etapa_check', 'horario')],
  ['obra_horario', "SELECT to_regclass('public.obra_horario') IS NOT NULL AS ok"],
  ['cronograma', "SELECT to_regclass('public.cronograma') IS NOT NULL AS ok"],
  ['turno', "SELECT to_regclass('public.turno') IS NOT NULL AS ok"],
  ['ver_turnos no acesso total', permissaoNoAcessoTotal('ver_turnos')],
  ['turno.compartilhado', col('turno', 'compartilhado')],
  ['cliente.matriz_id', col('cliente', 'matriz_id')],
  ['cliente.servico', col('cliente', 'servico')],
  ['cliente.cidade aceita NULL', nulavel('cliente', 'cidade')],
]

function col(tabela, coluna) {
  return `SELECT EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='${tabela}' AND column_name='${coluna}') AS ok`
}

/* ok quando nenhum setor de acesso total ficou sem a chave */
function permissaoNoAcessoTotal(chave) {
  return `SELECT NOT EXISTS (SELECT 1 FROM cargo
            WHERE acesso_total AND NOT ('${chave}' = ANY (permissoes))) AS ok`
}

function nulavel(tabela, coluna) {
  return `SELECT coalesce((SELECT is_nullable='YES' FROM information_schema.columns
            WHERE table_schema='public' AND table_name='${tabela}' AND column_name='${coluna}'), false) AS ok`
}

let falhou = false

try {
  const { rows } = await query('SELECT current_database() AS banco')
  console.log(`\nBanco: ${rows[0].banco}\n`)

  for (const arquivo of ARQUIVOS) {
    if (!fs.existsSync(naPasta(arquivo))) {
      console.log(`  pulado  ${arquivo} (arquivo nao encontrado)`)
      continue
    }
    try {
      await query(fs.readFileSync(naPasta(arquivo), 'utf8'))
      console.log(`  ok      ${arquivo}`)
    } catch (erro) {
      falhou = true
      console.log(`  ERRO    ${arquivo}`)
      console.log(`          ${erro.message}`)
    }
  }

  console.log('\nConferindo o que ficou no banco:\n')
  for (const [rotulo, consulta] of CONFERENCIA) {
    try {
      const { rows: r } = await query(consulta)
      const ok = r[0]?.ok === true
      if (!ok) falhou = true
      console.log(`  ${ok ? 'ok     ' : 'FALTA  '} ${rotulo}`)
    } catch (erro) {
      falhou = true
      console.log(`  ERRO    ${rotulo}: ${erro.message}`)
    }
  }
} catch (erro) {
  falhou = true
  console.error('\nNao foi possivel falar com o banco:', erro.message)
  console.error('Confira DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_NAME no .env.')
} finally {
  await pool.end().catch(() => {})
}

console.log(
  falhou
    ? '\nAlgo nao passou. Nada foi perdido: os arquivos so acrescentam, e da para rodar de novo.\n'
    : '\nBanco atualizado. Suba a API de novo (npm run api) para ela enxergar as colunas novas.\n',
)
process.exit(falhou ? 1 : 0)
