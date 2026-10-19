/**
 * Traz para a aba Despesas o historico das listas do SharePoint
 * ("Despesas.xlsx", com as abas Refeicoes, Bonus e Despesas).
 *
 *   npm run db:despesas -- "C:\caminho\Despesas.xlsx"
 *   npm run db:despesas -- "<planilha>" --simular     so mostra o que faria
 *
 * Usa a mesma conexao da API (server/db.js). Rode antes o
 * db/atualizacao-24.sql.txt (ou `npm run db:atualizar`).
 *
 * Cada linha vira um envio (despesa_envio) de quem a criou:
 *
 *   QUEM — o "Criado por" e o nome da CONTA do SharePoint. Ele e
 *   procurado entre os usuarios pelas palavras do nome ("Cleber
 *   Rodrigues" -> Cleber Muniz Rodrigues; aceita um erro de digitacao
 *   por palavra). Nome de uma palavra so ("Tiago") so vale quando
 *   nenhuma outra conta da planilha comeca com ele — "Lucas" e
 *   "Gabriel" eram contas separadas de "Lucas Pereira" e "Gabriel
 *   Henrique", e nao da para saber de quem eram.
 *   Quem nao e achado (gente que saiu, contas de uso comum) vira um
 *   usuario DESATIVADO com o nome da planilha: e assim que o sistema
 *   guarda quem saiu (usuario.ativo), sem perder o historico. Ele nao
 *   entra no sistema e nao aparece nas listas da equipe.
 *
 *   CLIENTE — o "Cliente/Obra" era texto livre ("Apsen - São
 *   Paulo/SP"). Ele fica inteiro em cliente_texto, e o envio tambem
 *   aponta para o cliente do cadastro quando o nome bate.
 *
 *   O valor e o da planilha (a refeicao de antes tinha outro valor
 *   fixo), e "Criado" vira a hora do envio.
 *
 * Linha repetida (identica) entra uma vez. Linha sem tipo ou sem
 * valor e pulada e aparece no resumo. Rodar de novo nao duplica
 * nada: cada linha guarda a sua impressao digital (planilha_chave).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import bcrypt from 'bcryptjs'
import { dataDoExcel, lerAbas, momentoDoExcel } from './lerXlsx.js'

const args = process.argv.slice(2)
const simular = args.includes('--simular')
const caminho = args.find((a) => !a.startsWith('--'))

if (!caminho || !fs.existsSync(caminho)) {
  console.error('\nInforme o caminho da planilha .xlsx:\n')
  console.error('  npm run db:despesas -- "C:\\caminho\\Despesas.xlsx"\n')
  process.exit(1)
}

/* ------------------------------------------------------------
   As tres abas -> envios
   ------------------------------------------------------------ */

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const semAcento = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const TIPOS = {
  almoco: 'almoco',
  janta: 'janta',
  'bonus viagem': 'bonus_viagem',
  'bonus apartamento': 'bonus_apartamento',
  'vale transporte': 'vale_transporte',
  'transporte intermunicipal': 'transporte_intermunicipal',
  combustivel: 'combustivel',
  outros: 'outros',
}
const tipoDe = (v) => TIPOS[semAcento(texto(v))] ?? null

const valorDe = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** Uma aba da planilha -> [{ categoria, tipo, data, valor, cliente, observacao, quem, criado }] */
function lerEnvios(abas) {
  const achar = (nome) => Object.entries(abas).find(([k]) => semAcento(k).startsWith(nome))?.[1] ?? []
  const envios = []

  for (const l of achar('refeic')) {
    envios.push({
      aba: 'Refeicoes',
      categoria: 'refeicao',
      tipo: tipoDe(l['Tipo de refeição']),
      data: dataDoExcel(l['Data da refeição']),
      valor: valorDe(l['Valor da refeição']),
      cliente: texto(l['Cliente/Obra? (Refeição)']),
      observacao: null,
      quem: texto(l['Criado por']),
      criado: l['Criado'],
    })
  }
  for (const l of achar('bonus')) {
    const tipo = tipoDe(l['Tipo de bônus'])
    const viagem = tipo === 'bonus_viagem'
    envios.push({
      aba: 'Bonus',
      categoria: 'bonus',
      tipo,
      data: dataDoExcel(l['Data do bônus']),
      valor: valorDe(viagem ? l['Valor do Bônus Viagem'] : l['Valor do Bônus Apartamento']),
      cliente: texto(viagem ? l['Cliente Obra - Bônus Viagem?'] : l['Cliente Obra - Bônus apartamento?']),
      observacao: null,
      quem: texto(l['Criado por']),
      criado: l['Criado'],
    })
  }
  for (const l of achar('despesa')) {
    const obs = texto(l['Tem alguma observação?'])
    envios.push({
      aba: 'Despesas',
      categoria: 'despesa',
      tipo: tipoDe(l['Tipo de despesa']),
      data: dataDoExcel(l['Data da despesa']),
      valor: valorDe(l['Valor da Despesa']),
      cliente: texto(l['Cliente/Obra']),
      observacao: obs ? obs.slice(0, 1000) : null,
      quem: texto(l['Criado por']),
      criado: l['Criado'],
    })
  }
  return envios
}

/* ------------------------------------------------------------
   Quem: o nome da conta do SharePoint -> usuario
   ------------------------------------------------------------ */

const PARTICULAS = new Set(['da', 'de', 'do', 'dos', 'das', 'e'])
const palavras = (t) =>
  semAcento(t)
    .replace(/\bjunior\b/g, 'jr')
    .split(/[^a-z0-9]+/)
    .filter((x) => x && !PARTICULAS.has(x))

/** Iguais, ou um erro de digitacao (palavras de 4+ letras). */
function parecidas(a, b) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false
  let i = 0
  let j = 0
  let diferencas = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1
      j += 1
      continue
    }
    diferencas += 1
    if (diferencas > 1) return false
    if (a.length > b.length) i += 1
    else if (b.length > a.length) j += 1
    else {
      i += 1
      j += 1
    }
  }
  return diferencas + (a.length - i) + (b.length - j) <= 1
}

/** { nome da planilha -> usuario | null } */
function casarPessoas(nomes, usuarios) {
  const primeiras = nomes.map((n) => palavras(n)[0])
  const resultado = new Map()
  for (const nome of nomes) {
    const p = palavras(nome)
    /* conta de uma palavra so, com outra conta da planilha comecando igual: de quem era? */
    if (p.length === 1 && primeiras.filter((x) => x === p[0]).length > 1) {
      resultado.set(nome, null)
      continue
    }
    const candidatos = usuarios.filter((u) => {
      const up = palavras(u.name)
      return p.every((x) => up.some((y) => parecidas(x, y)))
    })
    resultado.set(nome, candidatos.length === 1 ? candidatos[0] : null)
  }
  return resultado
}

/* ------------------------------------------------------------
   Cliente: o texto livre -> cliente do cadastro
   ------------------------------------------------------------ */

/** 'Cristália Unidade 3 - São Paulo/SP - Grande São Paulo' -> 'cristalia unidade 3' */
const nomeDoTexto = (t) =>
  semAcento(t)
    .replace(/\s*r\$\s*[\d.,]+\s*$/, '')
    .split(/\s+-\s*|\s*-\s+|-(?=\s)/)[0]
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** O cliente do cadastro cujo nome bate com o comeco do texto (ou null). */
function casarCliente(textoCliente, clientes) {
  const alvo = nomeDoTexto(textoCliente)
  if (!alvo) return null
  const alvoPalavras = alvo.split(' ')
  /* as unidades da LWN: "LWN- Santana", "LWN- Anápolis - Entrará..." ->
     o texto inteiro, sem espaco nem pontuacao, comeca com "lwnsantana" */
  const corrido = semAcento(textoCliente).replace(/[^a-z0-9]+/g, '')
  const candidatos = clientes.filter((c) => {
    const nome = semAcento(c.nome).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    const primeira = nome.split(' ')[0]
    if (primeira === 'lwn') return corrido.startsWith(nome.replace(/\s/g, ''))
    return primeira.length >= 3 && (alvoPalavras[0] === primeira || alvo === nome || alvo.startsWith(`${nome} `))
  })
  return candidatos.length === 1 ? candidatos[0] : null
}

/* ------------------------------------------------------------
   Leitura e resumo
   ------------------------------------------------------------ */

const lidos = lerEnvios(lerAbas(caminho))
const pulados = lidos.filter((e) => !e.tipo || !e.valor || !e.data || !e.quem)
const validos = lidos.filter((e) => e.tipo && e.valor && e.data && e.quem)

/* a impressao digital de cada linha: linhas identicas entram uma vez */
const vistos = new Set()
let repetidos = 0
const envios = []
for (const e of validos) {
  e.chave = crypto
    .createHash('sha1')
    .update([e.aba, e.quem, e.data, e.valor, e.tipo, e.cliente, e.observacao ?? '', e.criado ?? ''].join('|'))
    .digest('hex')
  if (vistos.has(e.chave)) {
    repetidos += 1
    continue
  }
  vistos.add(e.chave)
  envios.push(e)
}

console.log(`\nPlanilha: ${lidos.length} linhas, ${envios.length} envios, ${repetidos} repetidas, ${pulados.length} puladas`)
for (const c of ['refeicao', 'bonus', 'despesa']) {
  const da = envios.filter((e) => e.categoria === c)
  const soma = da.reduce((s, e) => s + e.valor, 0)
  console.log(`  ${c.padEnd(9)} ${String(da.length).padStart(5)}  R$ ${soma.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
}
if (pulados.length) {
  console.log('Puladas:', pulados.map((p) => `${p.aba} (${p.quem || 'sem nome'}, ${p.data ?? 'sem data'}, ${!p.tipo ? 'sem tipo' : 'sem valor'})`).join('; '))
}

const { pool } = await import('../db.js')
const cliente = await pool.connect()
try {
  const { rows: banco } = await cliente.query('SELECT current_database() AS banco')
  console.log(`\nBanco: ${banco[0].banco}${simular ? ' (simulação: nada é gravado)' : ''}`)

  const { rows: usuarios } = await cliente.query('SELECT id, name, ativo FROM usuario')
  const { rows: clientes } = await cliente.query('SELECT id, nome FROM cliente')

  const nomes = [...new Set(envios.map((e) => e.quem))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const pessoa = casarPessoas(nomes, usuarios)
  console.log('\nPessoas:')
  for (const n of nomes) {
    const u = pessoa.get(n)
    const quantos = envios.filter((e) => e.quem === n).length
    console.log(`  ${String(quantos).padStart(5)}  ${n.padEnd(36)} -> ${u ? u.name : 'NOVO usuário desativado'}`)
  }

  const textos = [...new Set(envios.map((e) => e.cliente).filter(Boolean))]
  const doTexto = new Map(textos.map((t) => [t, casarCliente(t, clientes)]))
  const casados = textos.filter((t) => doTexto.get(t))
  const comCliente = envios.filter((e) => doTexto.get(e.cliente)).length
  console.log(
    `\nClientes: ${textos.length} textos diferentes; ${casados.length} batem com o cadastro ` +
      `(${comCliente} de ${envios.length} envios). Os outros ficam só com o texto.`,
  )
  casados
    .sort()
    .forEach((t) => console.log(`  ${t.padEnd(60).slice(0, 60)} -> ${doTexto.get(t).nome}`))

  if (simular) {
    console.log('\nSimulação: nada foi gravado.\n')
  } else {
    await cliente.query('BEGIN')

    /* quem nao tem usuario vira um usuario DESATIVADO, com o nome da planilha */
    /* uma senha aleatoria que ninguem conhece: a conta desativada nunca entra */
    const senhaInutil = () => bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10)
    for (const n of nomes) {
      if (pessoa.get(n)) continue
      const { rows: existe } = await cliente.query(
        'SELECT id, name FROM usuario WHERE lower(btrim(name)) = lower($1) AND NOT ativo LIMIT 1',
        [n],
      )
      if (existe[0]) {
        pessoa.set(n, existe[0])
        continue
      }
      const { rows } = await cliente.query(
        `INSERT INTO usuario (name, cargo, senha_hash, ativo, avisos_email, cargo_titulo)
         VALUES ($1, 'historico', $2, false, false, 'Histórico do SharePoint')
         RETURNING id, name`,
        [n, senhaInutil()],
      )
      pessoa.set(n, rows[0])
    }

    let novos = 0
    for (const e of envios) {
      const { rowCount } = await cliente.query(
        `INSERT INTO despesa_envio (usuario_id, cliente_id, categoria, tipo, data, valor, observacao,
                                    cliente_texto, planilha_chave, criado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 coalesce($10::timestamp AT TIME ZONE 'America/Sao_Paulo', now()))
         ON CONFLICT (planilha_chave) WHERE planilha_chave IS NOT NULL DO NOTHING`,
        [
          pessoa.get(e.quem).id,
          doTexto.get(e.cliente)?.id ?? null,
          e.categoria,
          e.tipo,
          e.data,
          e.valor.toFixed(2),
          e.observacao,
          e.cliente ? e.cliente.slice(0, 300) : null,
          e.chave,
          momentoDoExcel(e.criado),
        ],
      )
      novos += rowCount
    }

    await cliente.query('COMMIT')
    console.log(`\n${novos} envios novos gravados (${envios.length - novos} já estavam lá).\n`)
  }
} catch (erro) {
  await cliente.query('ROLLBACK').catch(() => {})
  console.error('\nNada foi gravado:', erro.message)
  if (erro.code === '42703') console.error('Rode antes o db/atualizacao-24.sql.txt (npm run db:atualizar).')
  process.exitCode = 1
} finally {
  cliente.release()
  await pool.end().catch(() => {})
}
