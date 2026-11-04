/**
 * Traz para o Almoxarife (schema almox, db/atualizacao-38.sql.txt) os
 * dados do banco do LWN Control — o lwncontrol, que era um site separado.
 *
 * O banco do lwncontrol so e LIDO. O do main e o da API (server/db.js,
 * credenciais do .env — local, ou o Neon pelo DATABASE_URL). O endereco
 * do lwncontrol vai numa variavel propria, so para esta execucao:
 *
 *   LWNCONTROL_DATABASE_URL="postgres://..." npm run db:almoxarife -- --preparar
 *   LWNCONTROL_DATABASE_URL="postgres://..." npm run db:almoxarife
 *   LWNCONTROL_DATABASE_URL="postgres://..." npm run db:almoxarife -- --gravar
 *
 * (no PowerShell: $env:LWNCONTROL_DATABASE_URL="postgres://..." antes do npm)
 *
 * Ou, sem copiar o endereco, apontando o .env do proprio lwncontrol (a
 * linha DATABASE_URL de la):
 *
 *   npm run db:almoxarife -- --origem-env=C:\Users\...\lwncontrol\.env --preparar
 *
 * Sao tres passos, nesta ordem:
 *
 *   --preparar   escreve almoxarife-clientes.csv (na pasta onde rodou):
 *                uma linha por cliente do lwncontrol, com o cliente do
 *                main que parece ser o mesmo. Abra no Excel e confira a
 *                coluna `destino`:
 *                  o numero de um cliente do main   = e o mesmo cliente;
 *                  novo                             = cadastrar no main;
 *                Clientes repetidos no lwncontrol (Ferring e Ferring Ltda,
 *                Cristalia 3 e Cristalia 5...) podem ir para o MESMO numero.
 *                A coluna `confianca` diz de onde veio a sugestao: exato
 *                (mesmo nome e cidade), nome (so o nome bate), parecido
 *                (um nome comeca com o outro) ou vazio (nada parecido).
 *
 *   (sem nada)   SIMULA: le o csv e mostra o que faria — quantas linhas de
 *                cada tabela, que clientes serao criados e ligados, quem do
 *                lwncontrol nao tem conta no main. Nao grava nada.
 *
 *   --gravar     grava tudo numa transacao so: ou entra tudo, ou nada.
 *                Recusa se o Almoxarife ja tiver O.S. (rodar de novo nao
 *                duplica nada).
 *
 * O que muda no caminho:
 *
 *   - os COLABORADORES sao os do main: cada um do lwncontrol e procurado
 *     pelo e-mail (o do cadastro ou o do Outlook), depois pelo CPF,
 *     depois pelo nome. Os ids gravados nas O.S., nos remanejamentos, nas
 *     prorrogacoes e nos logs passam a ser os do main. Quem nao tem conta
 *     no main fica com o NOME escrito no historico (como sempre esteve) e
 *     o id vazio — a lista sai no fim, para cadastrar no main;
 *   - os CLIENTES sao os do main, pelo csv acima. A O.S. antiga continua
 *     com o nome do cliente como estava, e ganha o cliente_id do main
 *     quando o nome bate;
 *   - as configuracoes de cargo do lwncontrol (permissoes_cargos,
 *     cargos_custom, cargos_removidos, cargos_responsaveis) nao vem: no
 *     main a permissao e do SETOR (Usuarios > Setores, as chaves do
 *     Almoxarife);
 *   - login, rosto, sessoes e inscricoes de notificacao ficam para tras:
 *     cada um liga as notificacoes de novo em Configuracoes.
 *
 * Os ids das tabelas do lwncontrol sao mantidos (as O.S. guardam ids de
 * ferramenta e de baia dentro dos JSON), e as sequencias seguem do maior.
 */
import fs from 'node:fs'
import dotenv from 'dotenv'
import pg from 'pg'
import { pool } from '../db.js'

const args = process.argv.slice(2)
const preparar = args.includes('--preparar')
const gravar = args.includes('--gravar')
const ARQUIVO = (args.find((a) => a.startsWith('--arquivo=')) ?? '--arquivo=almoxarife-clientes.csv').slice(10)

/* --origem-env=<arquivo>: o endereco do lwncontrol sai do .env dele, sem
   passar pela tela */
const ORIGEM_ENV = args.find((a) => a.startsWith('--origem-env='))?.slice(13)
let doArquivo = null
if (ORIGEM_ENV) {
  if (!fs.existsSync(ORIGEM_ENV)) {
    console.error(`\nNao achei o arquivo ${ORIGEM_ENV}.\n`)
    process.exit(1)
  }
  const lido = dotenv.parse(fs.readFileSync(ORIGEM_ENV))
  doArquivo = lido.LWNCONTROL_DATABASE_URL || lido.DATABASE_URL || null
}
const URL_ORIGEM = (process.env.LWNCONTROL_DATABASE_URL || doArquivo)?.trim()
if (!URL_ORIGEM) {
  console.error('\nFalta o endereco do banco do lwncontrol na variavel LWNCONTROL_DATABASE_URL.\n')
  console.error('  PowerShell:  $env:LWNCONTROL_DATABASE_URL="postgres://..."; npm run db:almoxarife -- --preparar')
  console.error('  Bash:        LWNCONTROL_DATABASE_URL="postgres://..." npm run db:almoxarife -- --preparar\n')
  process.exit(1)
}

/* a origem devolve data e hora como TEXTO: entram no main do jeito que
   estavam, sem passar por fuso nenhum */
const TEXTO = new Set([1082, 1114, 1184])
const origem = new pg.Pool({
  connectionString: URL_ORIGEM,
  ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(URL_ORIGEM) ? false : { rejectUnauthorized: false },
  max: 2,
  types: { getTypeParser: (oid, formato) => (TEXTO.has(oid) ? (v) => v : pg.types.getTypeParser(oid, formato)) },
})

const semAcento = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/* "ABL - Sumaré/SP" -> "ABL" (o main guarda a cidade e o estado a parte) */
const nomeBase = (nome) =>
  String(nome ?? '').replace(/\s*[-–]\s*[^-–]+\/[A-Za-z]{2}\s*$/, '').trim() || String(nome ?? '').trim()

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '')

/* a sigla do cliente no lwncontrol; um endereco digitado no campo (o da
   Visoflex: "R. ANDRÉ ADOLFO FERRARI, 104") nao e sigla */
const siglaValida = (sigla) => {
  const t = String(sigla ?? '').trim()
  return !t || (/\d/.test(t) && t.includes(',')) ? null : t
}

/* o main so aceita a sigla de duas letras (cliente_uf_forma) */
const ufValida = (uf) => {
  const t = String(uf ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(t) ? t : null
}

/* ------------------------------------------------------------
   CSV (separado por ponto e virgula, como o Excel em portugues abre)
   ------------------------------------------------------------ */

const celula = (v) => {
  const t = String(v ?? '')
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

function lerCsv(texto) {
  const linhas = []
  let campo = ''
  let linha = []
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === ';') { linha.push(campo); campo = '' }
    else if (c === '\n') { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); linha = []; campo = '' }
    else campo += c
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }
  const [cabecalho, ...resto] = linhas.filter((l) => l.some((c) => c.trim()))
  return resto.map((l) => Object.fromEntries(cabecalho.map((nome, i) => [nome.replace(/^﻿/, '').trim(), (l[i] ?? '').trim()])))
}

/* ------------------------------------------------------------
   Os clientes: a sugestao de par
   ------------------------------------------------------------ */

async function clientesDoMain() {
  const { rows } = await pool.query(
    `SELECT c.id, c.nome, c.cidade, c.estado, c.unidade, m.nome AS matriz
       FROM cliente c LEFT JOIN cliente m ON m.id = c.matriz_id
      ORDER BY c.nome`,
  )
  return rows.map((c) => ({
    ...c,
    rotulo: c.matriz ? [c.matriz, c.unidade].filter(Boolean).join(' ') : c.nome,
    chave: semAcento(c.matriz ? [c.matriz, c.unidade].filter(Boolean).join(' ') : c.nome),
    chaveMatriz: semAcento(c.matriz ?? c.nome),
    chaveCidade: semAcento(c.cidade),
  }))
}

function sugerir(lwn, main) {
  const base = semAcento(nomeBase(lwn.nome))
  const sigla = semAcento(lwn.abreviacao)
  const cidade = semAcento(lwn.cidade)
  const iguais = main.filter((m) => m.chave === base || m.chaveMatriz === base || (sigla && m.chave === sigla))
  const naCidade = iguais.filter((m) => cidade && m.chaveCidade === cidade)
  if (naCidade.length) return { cliente: naCidade[0], confianca: 'exato' }
  if (iguais.length) return { cliente: iguais[0], confianca: 'nome' }
  const parecidos = main.filter(
    (m) => base.length >= 3 && (m.chave.startsWith(`${base} `) || base.startsWith(`${m.chave} `) || base.startsWith(`${m.chaveMatriz} `)),
  )
  const parecidoNaCidade = parecidos.find((m) => cidade && m.chaveCidade === cidade)
  if (parecidoNaCidade || parecidos.length) return { cliente: parecidoNaCidade ?? parecidos[0], confianca: 'parecido' }
  return { cliente: null, confianca: '' }
}

async function passoPreparar() {
  const { rows: clientes } = await origem.query('SELECT id, nome, abreviacao, cidade, uf FROM clientes ORDER BY nome')
  const { rows: usos } = await origem.query('SELECT cliente, count(*)::int AS n FROM solicitacoes GROUP BY cliente')
  const usoPorNome = new Map(usos.map((u) => [String(u.cliente ?? ''), u.n]))
  const main = await clientesDoMain()

  const linhas = [['lwn_id', 'cliente_lwncontrol', 'abreviacao', 'cidade', 'uf', 'os', 'confianca', 'destino', 'cliente_no_main']]
  const conta = { exato: 0, nome: 0, parecido: 0, '': 0 }
  for (const c of clientes) {
    const { cliente, confianca } = sugerir(c, main)
    conta[confianca]++
    linhas.push([
      c.id,
      c.nome,
      c.abreviacao,
      c.cidade ?? '',
      c.uf ?? '',
      usoPorNome.get(String(c.nome)) ?? 0,
      confianca,
      cliente ? cliente.id : 'novo',
      cliente ? [cliente.rotulo, cliente.cidade ? `(${cliente.cidade})` : ''].filter(Boolean).join(' ') : '',
    ])
  }
  /* com BOM: o Excel abre o acento certo */
  fs.writeFileSync(ARQUIVO, `﻿${linhas.map((l) => l.map(celula).join(';')).join('\r\n')}\r\n`)
  console.log(`\n${clientes.length} clientes do lwncontrol escritos em ${ARQUIVO}`)
  console.log(`  ${conta.exato} com par exato (nome e cidade), ${conta.nome} so pelo nome, ${conta.parecido} parecidos, ${conta['']} sem par (novos)`)
  console.log('\nConfira a coluna "destino" (numero do cliente do main, ou "novo") e rode de novo sem --preparar para simular.\n')
  console.log('Os clientes do main, para consulta (id - nome - cidade):')
  main.forEach((m) => console.log(`  ${m.id} - ${m.rotulo}${m.cidade ? ` - ${m.cidade}` : ''}`))
}

/* ------------------------------------------------------------
   Os colaboradores: lwncontrol -> main
   ------------------------------------------------------------ */

async function casarUsuarios() {
  const { rows: lwn } = await origem.query('SELECT id, nome, cpf, email, cargo, ativo FROM usuarios ORDER BY nome')
  const { rows: main } = await pool.query('SELECT id, name, cpf, email, outlook_email FROM usuario')
  const porEmail = new Map()
  main.forEach((u) => [u.email, u.outlook_email].filter(Boolean).forEach((e) => porEmail.set(e.trim().toLowerCase(), u)))
  const porCpf = new Map(main.filter((u) => soDigitos(u.cpf).length === 11).map((u) => [soDigitos(u.cpf), u]))
  const porNome = new Map()
  main.forEach((u) => {
    const k = semAcento(u.name)
    porNome.set(k, porNome.has(k) ? null : u) // nome repetido no main nao serve
  })

  const mapa = new Map()
  const faltam = []
  for (const u of lwn) {
    const achado =
      (u.email && porEmail.get(u.email.trim().toLowerCase())) ||
      (soDigitos(u.cpf).length === 11 && porCpf.get(soDigitos(u.cpf))) ||
      porNome.get(semAcento(u.nome)) ||
      null
    if (achado) mapa.set(Number(u.id), { id: Number(achado.id), nome: achado.name, de: u })
    else faltam.push(u)
  }
  return { mapa, faltam, total: lwn.length }
}

/* ------------------------------------------------------------
   A copia
   ------------------------------------------------------------ */

/* na ordem das chaves estrangeiras; `usuarios` sao as colunas com id de
   colaborador (vao para o id do main ou ficam vazias) */
const TABELAS = [
  { nome: 'baias' },
  { nome: 'ferramentas', depois: ['baia_pai_id'] },
  {
    nome: 'solicitacoes',
    usuarios: ['solicitante_id', 'responsavel_id', 'aprovado_por_id', 'rejeitado_por_id', 'solicitado_por_id', 'reprovado_por_id', 'editada_por_id'],
  },
  { nome: 'certificados' },
  { nome: 'manutencoes' },
  { nome: 'remanejamentos', usuarios: ['aprovado_por_id'] },
  { nome: 'os_historico' },
  { nome: 'os_prorrogacoes', usuarios: ['solicitado_por_id', 'decidido_por_id'] },
  { nome: 'baia_historico' },
  { nome: 'logs_atividade', usuarios: ['usuario_id'] },
  { nome: 'configuracoes', fora: (l) => ['permissoes_cargos', 'cargos_custom', 'cargos_removidos', 'cargos_responsaveis'].includes(l.chave) },
  { nome: 'ativo_codigos_barras' },
  { nome: 'notificacoes_enviadas' },
]

async function colunas(db, schema, tabela) {
  const { rows } = await db.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
    [schema, tabela],
  )
  return rows.map((r) => r.column_name)
}

async function copiar(cliente, t, usuarios, clientePorNome) {
  const daOrigem = await colunas(origem, 'public', t.nome)
  const doMain = await colunas(cliente, 'almox', t.nome)
  const comuns = daOrigem.filter((c) => doMain.includes(c))
  const lista = comuns.map((c) => `"${c}"`).join(', ')
  const { rows } = await origem.query(`SELECT ${lista} FROM ${t.nome} ORDER BY 1`)
  const linhas = rows.filter((l) => !t.fora?.(l))

  let semDono = 0
  for (const l of linhas) {
    for (const col of t.usuarios ?? []) {
      if (l[col] === null || l[col] === undefined) continue
      const novo = usuarios.mapa.get(Number(l[col]))
      if (!novo) semDono++
      l[col] = novo ? novo.id : null
    }
    for (const col of t.depois ?? []) {
      l[`_${col}`] = l[col]
      l[col] = null
    }
  }
  if (t.nome === 'solicitacoes') {
    for (const l of linhas) l.cliente_id = clientePorNome.get(String(l.cliente ?? '')) ?? null
  }

  const destino = t.nome === 'solicitacoes' ? [...comuns, 'cliente_id'] : comuns
  const listaDestino = destino.map((c) => `"${c}"`).join(', ')
  for (let i = 0; i < linhas.length; i += 100) {
    const lote = linhas.slice(i, i + 100)
    await cliente.query(
      `INSERT INTO almox.${t.nome} (${listaDestino})
       SELECT ${listaDestino} FROM json_populate_recordset(NULL::almox.${t.nome}, $1::json)`,
      [JSON.stringify(lote)],
    )
  }
  for (const col of t.depois ?? []) {
    for (const l of linhas.filter((x) => x[`_${col}`] !== null && x[`_${col}`] !== undefined)) {
      await cliente.query(`UPDATE almox.${t.nome} SET "${col}" = $1 WHERE id = $2`, [l[`_${col}`], l.id])
    }
  }
  if (doMain.includes('id')) {
    await cliente.query(
      `SELECT setval(pg_get_serial_sequence('almox.${t.nome}', 'id'), coalesce((SELECT max(id) FROM almox.${t.nome}), 0) + 1, false)`,
    )
  }
  return { linhas: linhas.length, semDono }
}

async function passoImportar() {
  if (!fs.existsSync(ARQUIVO)) {
    console.error(`\nNao achei ${ARQUIVO}. Rode antes com --preparar e confira o arquivo.\n`)
    process.exit(1)
  }
  const { rows: tem } = await pool.query("SELECT to_regclass('almox.solicitacoes') IS NOT NULL AS ok")
  if (!tem[0].ok) {
    console.error('\nO banco do main ainda nao tem o schema almox. Rode antes: npm run db:atualizar\n')
    process.exit(1)
  }

  /* ---- os clientes, pelo csv ---- */
  const csv = lerCsv(fs.readFileSync(ARQUIVO, 'utf8'))
  const { rows: lwnClientes } = await origem.query('SELECT id, nome, abreviacao, cidade, uf FROM clientes')
  const lwnPorId = new Map(lwnClientes.map((c) => [String(c.id), c]))
  const main = await clientesDoMain()
  const mainPorId = new Map(main.map((m) => [String(m.id), m]))
  const ligar = []
  const criar = []
  const erros = []
  for (const linha of csv) {
    const c = lwnPorId.get(linha.lwn_id)
    if (!c) { erros.push(`linha com lwn_id ${linha.lwn_id}: esse cliente nao existe no lwncontrol`); continue }
    const destino = String(linha.destino ?? '').trim().toLowerCase()
    if (destino === 'novo' || destino === '') criar.push(c)
    else if (mainPorId.has(destino)) ligar.push({ de: c, para: mainPorId.get(destino) })
    else erros.push(`${c.nome}: destino "${linha.destino}" nao e um cliente do main nem "novo"`)
  }
  const noCsv = new Set(csv.map((l) => l.lwn_id))
  lwnClientes.filter((c) => !noCsv.has(String(c.id))).forEach((c) => erros.push(`${c.nome}: falta no csv (rode --preparar de novo)`))
  /* o mesmo nome base criado duas vezes vira um cliente so */
  const criarPorNome = new Map()
  criar.forEach((c) => {
    const k = `${semAcento(nomeBase(c.nome))}|${semAcento(c.cidade)}`
    if (!criarPorNome.has(k)) criarPorNome.set(k, [])
    criarPorNome.get(k).push(c)
  })

  const usuarios = await casarUsuarios()

  console.log(`\n${gravar ? 'GRAVANDO' : 'SIMULACAO (nada e gravado; para gravar, rode com --gravar)'}\n`)
  console.log(`Clientes do lwncontrol: ${lwnClientes.length}`)
  console.log(`  ligados a clientes do main: ${ligar.length}`)
  ligar.forEach(({ de, para }) => console.log(`    ${de.nome}  ->  ${para.id} ${para.rotulo}`))
  console.log(`  cadastrados como novos no main: ${criarPorNome.size} (de ${criar.length} linhas)`)
  ;[...criarPorNome.values()].forEach((grupo) =>
    console.log(`    ${nomeBase(grupo[0].nome)}${grupo[0].cidade ? ` - ${grupo[0].cidade}/${grupo[0].uf ?? ''}` : ''}${grupo.length > 1 ? `  (junta ${grupo.map((g) => g.nome).join(', ')})` : ''}`),
  )
  console.log(`\nColaboradores do lwncontrol: ${usuarios.total}`)
  console.log(`  com conta no main: ${usuarios.mapa.size}`)
  console.log(`  SEM conta no main (o nome fica no historico; cadastre no main para usarem o Almoxarife): ${usuarios.faltam.length}`)
  usuarios.faltam.forEach((u) => console.log(`    ${u.nome} — ${u.email || 'sem e-mail'} — ${u.cargo}${u.ativo === false ? ' (inativo no lwncontrol)' : ''}`))

  if (erros.length) {
    console.log('\nPROBLEMAS NO CSV (corrija e rode de novo):')
    erros.forEach((e) => console.log(`  ${e}`))
    process.exitCode = 1
    return
  }

  const contagem = {}
  for (const t of TABELAS) {
    const { rows } = await origem.query(`SELECT count(*)::int AS n FROM ${t.nome}`)
    contagem[t.nome] = rows[0].n
  }
  console.log('\nLinhas a copiar:')
  Object.entries(contagem).forEach(([t, n]) => console.log(`  ${t.padEnd(22)} ${n}`))

  if (!gravar) return

  const { rows: ja } = await pool.query('SELECT count(*)::int AS n FROM almox.solicitacoes')
  if (ja[0].n > 0) {
    console.error(`\nO Almoxarife do main ja tem ${ja[0].n} O.S.: a importacao ja foi feita. Nada foi gravado.\n`)
    process.exitCode = 1
    return
  }

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')

    /* clientes: cria os novos, completa a sigla dos ligados. A sigla so
       vem quando e uma so: Cristalia 1, 3, 5 e 8 vao para o mesmo
       cliente, e nenhuma delas e a sigla dele */
    const clientePorNomeLwn = new Map()
    const siglasPorDestino = new Map()
    for (const { de, para } of ligar) {
      clientePorNomeLwn.set(de.nome, Number(para.id))
      if (!siglasPorDestino.has(para.id)) siglasPorDestino.set(para.id, new Set())
      siglasPorDestino.get(para.id).add(siglaValida(de.abreviacao) ?? '')
    }
    for (const [id, siglas] of siglasPorDestino) {
      const [sigla] = [...siglas]
      if (siglas.size !== 1 || !sigla) continue
      await cliente.query("UPDATE cliente SET abreviacao = $2 WHERE id = $1 AND coalesce(abreviacao, '') = ''", [id, sigla])
    }
    for (const grupo of criarPorNome.values()) {
      const c = grupo[0]
      const { rows } = await cliente.query(
        'INSERT INTO cliente (nome, abreviacao, cidade, estado) VALUES ($1, $2, $3, $4) RETURNING id',
        [nomeBase(c.nome), siglaValida(c.abreviacao), c.cidade || null, ufValida(c.uf)],
      )
      grupo.forEach((g) => clientePorNomeLwn.set(g.nome, Number(rows[0].id)))
    }

    console.log('')
    for (const t of TABELAS) {
      const r = await copiar(cliente, t, usuarios, clientePorNomeLwn)
      console.log(`  ok  ${t.nome.padEnd(22)} ${r.linhas} linhas${r.semDono ? ` (${r.semDono} ids de colaborador sem conta no main ficaram vazios)` : ''}`)
    }
    const { rows: ligadas } = await cliente.query('SELECT count(*)::int AS n FROM almox.solicitacoes WHERE cliente_id IS NOT NULL')
    console.log(`\n  ${ligadas[0].n} O.S. ligadas a um cliente do main pelo nome`)

    await cliente.query('COMMIT')
    console.log('\nAlmoxarife importado. Confira em /core/app/control.\n')
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => {})
    console.error('\nERRO — nada foi gravado:', erro.message, '\n')
    process.exitCode = 1
  } finally {
    cliente.release()
  }
}

try {
  /* em qual banco do main vai mexer: o de producao ou o local */
  const { rows: [qual] } = await pool.query('SELECT current_database() AS banco')
  console.log(`\nBanco do main: ${qual.banco} — ${process.env.DATABASE_URL?.trim() ? 'o do DATABASE_URL (producao)' : 'o local, do .env'}`)
  if (preparar) await passoPreparar()
  else await passoImportar()
} catch (erro) {
  console.error('\nERRO:', erro.message, '\n')
  process.exitCode = 1
} finally {
  await origem.end().catch(() => {})
  await pool.end().catch(() => {})
}
