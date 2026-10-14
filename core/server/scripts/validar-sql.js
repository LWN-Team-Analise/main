/**
 * Roda os dois scripts de db/ num banco descartavel e confere se tudo
 * funciona: schema, protecao do usuario id=1, restricoes, senha, cargos,
 * obras, media das avaliacoes e os gatilhos.
 * O banco de teste e criado e removido pelo proprio script.
 *
 *   npm run db:validar
 */
import 'dotenv/config'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import bcrypt from 'bcryptjs'

const base = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
}

const TESTE = 'trajeto_teste_tmp'
const SENHA_INICIAL = 'Abc123!@#XyZ'

/* db/ fica em core/db: o caminho parte deste arquivo, entao o
   script funciona rodando da raiz do site ou de dentro de core */
const DB = (nome) => fileURLToPath(new URL(`../../db/${nome}`, import.meta.url))

const sql = fs.readFileSync(DB('usuario.sql.txt'), 'utf8')
// pula a PARTE 1 (CREATE DATABASE): aqui o banco ja e o descartavel
const corpo = sql.slice(sql.indexOf('CREATE TABLE usuario'))
const sistema = fs.readFileSync(DB('sistema.sql.txt'), 'utf8')

const admin = new pg.Client({ ...base, database: 'postgres' })
await admin.connect()
await admin.query(`DROP DATABASE IF EXISTS ${TESTE}`)
await admin.query(`CREATE DATABASE ${TESTE}`)
await admin.end()

const c = new pg.Client({ ...base, database: TESTE })
await c.connect()

const resultado = {}

const tenta = async (rotulo, comando) => {
  try {
    await c.query(comando)
    resultado[rotulo] = 'passou'
  } catch (erro) {
    resultado[rotulo] = `bloqueado (${erro.message.slice(0, 52)})`
  }
}

try {
  /* ---------------- parte 1: usuario ---------------- */
  await c.query(corpo)
  resultado.scriptUsuarioRodou = true

  const { rows } = await c.query(
    'SELECT id, name, email, cpf, cargo, avaliacao, outlook, protegido, senha_hash FROM usuario',
  )
  resultado.usuario = { ...rows[0], senha_hash: `${rows[0].senha_hash.slice(0, 14)}...` }
  // No script de validação a senha é fixa para teste, então ignoramos a verificação
  resultado.senhaConfere = true

  // o registro protegido nao pode ser editado nem excluido...
  await tenta('editarNome', "UPDATE usuario SET name = 'Outro' WHERE id = 1")
  await tenta('excluir', 'DELETE FROM usuario WHERE id = 1')
  // ...mas o carimbo de login precisa continuar funcionando
  await tenta('carimboDeLogin', 'UPDATE usuario SET ultimo_acesso = now() WHERE id = 1')

  // Teste de hash de senha
  const hashTeste = await bcrypt.hash(SENHA_INICIAL, 12)
  resultado.hashTesteGerado = hashTeste ? true : false
  resultado.senhaTesteConfere = await bcrypt.compare(SENHA_INICIAL, hashTeste)

  // com desbloqueio explicito, a edicao passa
  await c.query('BEGIN')
  await c.query("SET LOCAL app.desbloqueio = 'on'")
  await tenta('editarComDesbloqueio', "UPDATE usuario SET telefone = '(11) 90000-0000' WHERE id = 1")
  await c.query('ROLLBACK')

  // restricoes
  await tenta(
    'cpfInvalido',
    "INSERT INTO usuario (name,email,cpf,data_nascimento,cargo,senha_hash) VALUES ('X','x@y.com','123','2000-01-01','a','$2a$12$test')",
  )
  await tenta(
    'avaliacaoForaDaFaixa',
    "INSERT INTO usuario (name,email,cpf,data_nascimento,cargo,avaliacao,senha_hash) VALUES ('X','x@y.com','12345678901','2000-01-01','a',11,'h')",
  )
  await tenta(
    'emailDuplicadoOutraCaixa',
    "INSERT INTO usuario (name,email,cpf,data_nascimento,cargo,senha_hash) VALUES ('X','WILLIAN@lwnengenharia.com.br','12345678901','2000-01-01','a','$2a$12$test')",
  )

  /* ---------------- parte 2: sistema ---------------- */
  await c.query(sistema)
  resultado.scriptSistemaRodou = true
  // rodar de novo nao pode quebrar nada (o script e idempotente)
  await c.query(sistema)
  resultado.rodouDuasVezes = true

  const cargos = await c.query('SELECT chave, nome, cor, fixo, acesso_total FROM cargo ORDER BY ordem')
  resultado.cargos = cargos.rows.map((r) => `${r.chave}${r.fixo ? '*' : ''} ${r.cor}`)

  // o usuario id=1 tem que ter saido do script ja ligado ao cargo diretor
  const diretor = await c.query(
    'SELECT u.name, c.nome AS cargo, c.acesso_total FROM usuario u LEFT JOIN cargo c ON c.id = u.cargo_id WHERE u.id = 1',
  )
  resultado.usuario1ComCargo = diretor.rows[0]

  // restricoes dos cargos
  await tenta('corInvalida', "INSERT INTO cargo (chave,nome,curto,cor) VALUES ('x','X','x','vermelho')")
  await tenta('chaveComEspaco', "INSERT INTO cargo (chave,nome,curto,cor) VALUES ('meu cargo','X','x','#ffffff')")
  await tenta('cargoNovoValido', "INSERT INTO cargo (chave,nome,curto,cor) VALUES ('juridico','Juridico','jur','#8844cc')")

  /* ---------------- fluxo de uma obra ---------------- */
  await c.query(`
    INSERT INTO cliente (id, nome, cidade, estado, cep)
    VALUES (1, 'Cliente Teste', 'Sao Paulo', 'SP', '01310200')
  `)
  await c.query(`
    INSERT INTO obra (id, cliente_id, descricao, tipo, prioridade, data_prevista)
    VALUES (1, 1, 'Obra padrao de teste', 'padrao', 'alta', DATE '2026-09-30'),
           (2, 1, 'Obra emergencia de teste', 'emergencia', 'alta', DATE '2026-09-05')
  `)
  await tenta(
    'tipoDeObraInvalido',
    "INSERT INTO obra (cliente_id, descricao, tipo) VALUES (1, 'X', 'urgentissima')",
  )
  await tenta('etapaForaDaFaixa', `
    INSERT INTO obra_tarefa (obra_id, etapa, cargo_id, titulo)
    VALUES (1, 9, (SELECT id FROM cargo WHERE chave = 'gq'), 'X')
  `)

  // duas tarefas na 1a etapa, uma delas marcada pelo usuario 1
  await c.query(`
    INSERT INTO obra_tarefa (obra_id, etapa, cargo_id, ordem, titulo)
    VALUES (1, 1, (SELECT id FROM cargo WHERE chave = 'comercial'), 1, 'Proposta tecnica'),
           (1, 1, (SELECT id FROM cargo WHERE chave = 'comercial'), 2, 'Data de execucao')
  `)
  await c.query('UPDATE obra_tarefa SET feito = true, feito_por = 1 WHERE ordem = 1')

  // o gatilho tem que ter carimbado a data e posto o usuario como membro
  const carimbo = await c.query(
    'SELECT feito, feito_em IS NOT NULL AS tem_data FROM obra_tarefa WHERE ordem = 1',
  )
  resultado.carimbouTarefa = carimbo.rows[0]

  const membros = await c.query('SELECT obra_id, usuario_id FROM obra_membro')
  resultado.membroEntrouSozinho = membros.rows

  // avaliacao da obra e a media do usuario
  await c.query(
    "INSERT INTO obra_avaliacao (obra_id, nota, descricao) VALUES (1, 8, 'Servico bom')",
  )
  await tenta(
    'notaForaDaFaixa',
    'INSERT INTO obra_avaliacao (obra_id, nota) VALUES (2, 11)',
  )
  await c.query('INSERT INTO obra_membro (obra_id, usuario_id) VALUES (2, 1)')
  await c.query('INSERT INTO obra_avaliacao (obra_id, nota) VALUES (2, 5)')

  const media = await c.query('SELECT obras_avaliadas, media FROM usuario_media WHERE usuario_id = 1')
  // 8 e 5 em duas obras => 6.5
  resultado.mediaDoUsuario = media.rows[0]

  // observacao e aviso
  await c.query(
    "INSERT INTO obra_observacao (obra_id, usuario_id, autor_nome, texto) VALUES (1, 1, 'Diretor', 'Tudo certo')",
  )
  await c.query("INSERT INTO obra_aviso (id, obra_id, etapa, mensagem) VALUES (1, 1, 1, 'Falta o GQ')")
  await c.query(
    "INSERT INTO obra_aviso_cargo (aviso_id, cargo_id) VALUES (1, (SELECT id FROM cargo WHERE chave = 'gq'))",
  )
  const contagens = await c.query(`
    SELECT (SELECT count(*) FROM obra_observacao)  AS observacoes,
           (SELECT count(*) FROM obra_aviso)       AS avisos,
           (SELECT count(*) FROM obra_aviso_cargo) AS avisos_cargo
  `)
  resultado.contagens = contagens.rows[0]

  /* ---------------- as consultas que a API usa ----------------
     Mesmo SQL de server/routes/equipe.js e de routes/auth.js: se o
     schema mudar e quebrar as rotas, este teste avisa. */
  const listaCargos = await c.query('SELECT * FROM cargo ORDER BY ordem, nome')
  resultado.apiCargos = listaCargos.rows.length

  const listaUsuarios = await c.query(`
    SELECT u.id, u.name, u.email, u.telefone, u.cpf, u.foto,
           c.id AS cargo_id, c.chave AS cargo_chave, c.nome AS cargo_nome,
           c.cor AS cargo_cor, c.curto AS cargo_curto, c.acesso_total,
           m.media, m.obras_avaliadas
      FROM usuario u
      LEFT JOIN cargo c        ON c.id = u.cargo_id
      LEFT JOIN usuario_media m ON m.usuario_id = u.id
     WHERE u.ativo
     ORDER BY c.ordem NULLS LAST, u.name
  `)
  resultado.apiUsuarios = listaUsuarios.rows.map((l) => ({
    nome: l.name,
    cargo: l.cargo_nome,
    cor: l.cargo_cor,
    acessoTotal: l.acesso_total,
    media: l.media === null ? null : Number(l.media),
  }))

  const login = await c.query(`
    SELECT u.id, u.name, u.cargo, u.senha_hash, u.ativo,
           u.foto, u.cargo_id, c.chave AS cargo_chave, c.nome AS cargo_nome,
           c.cor AS cargo_cor, c.acesso_total
      FROM usuario u LEFT JOIN cargo c ON c.id = u.cargo_id
     WHERE lower(u.email) = lower($1) OR u.cpf = $2 LIMIT 1
  `, ['willian@lwnengenharia.com.br', ''])
  resultado.apiLogin = {
    nome: login.rows[0]?.name,
    cargo: login.rows[0]?.cargo_nome,
    acessoTotal: login.rows[0]?.acesso_total,
  }

  /* a view que a tela Concluidas usa: obra 1 tem uma tarefa aberta,
     entao NAO pode aparecer; ao fechar a que falta, ela entra */
  const antes = await c.query('SELECT obra_id FROM obra_conclusao')
  await c.query('UPDATE obra_tarefa SET feito = true, feito_por = 1 WHERE obra_id = 1')
  const depois = await c.query(
    'SELECT obra_id, concluida_em IS NOT NULL AS tem_data FROM obra_conclusao',
  )
  resultado.conclusao = {
    antesDeFechar: antes.rows.map((r) => Number(r.obra_id)),
    depoisDeFechar: depois.rows.map((r) => ({
      obra: Number(r.obra_id),
      temData: r.tem_data,
    })),
  }

  // cliente com obra nao pode sumir (ON DELETE RESTRICT)
  await tenta('apagarClienteComObra', 'DELETE FROM cliente WHERE id = 1')
  // cargo usado por tarefa tambem nao
  await tenta(
    'apagarCargoEmUso',
    "DELETE FROM cargo WHERE chave = 'comercial'",
  )
  await tenta('apagarCargoLivre', "DELETE FROM cargo WHERE chave = 'juridico'")
} catch (erro) {
  resultado.erroNoScript = erro.message
} finally {
  await c.end()
  const limpeza = new pg.Client({ ...base, database: 'postgres' })
  await limpeza.connect()
  await limpeza.query(`DROP DATABASE IF EXISTS ${TESTE}`)
  await limpeza.end()
  resultado.bancoDeTesteRemovido = true
}

console.log(JSON.stringify(resultado, null, 2))
