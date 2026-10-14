/**
 * Traz para a aba Frotas o historico da planilha do Microsoft Forms
 * ("Controle Saída e Devolução de Veículos.xlsx").
 *
 *   npm run db:frota -- "C:\caminho\Controle Saída e Devolução de Veículos.xlsx"
 *   npm run db:frota -- "<planilha>" --simular     so mostra o que faria
 *
 * Usa a mesma conexao da API (server/db.js, credenciais do .env). Rode
 * antes o db/atualizacao-22.sql.txt (ou `npm run db:atualizar`).
 *
 * O que entra:
 *
 *   - cada CARRO que aparece na planilha vira um veiculo (nome "Spin 01",
 *     modelo "Spin", marca "Chevrolet" — ver MARCAS). Placa, ano e cor a
 *     planilha nao tem: ficam em branco, com o "!" piscando na tela ate
 *     alguem completar em Frotas > editar veiculo;
 *   - cada LINHA vira um registro de saida, devolucao ou troca, com o
 *     que a pessoa respondeu. As fotos ficaram no SharePoint: o registro
 *     guarda os links (`fotos_externas`);
 *   - quem registrou e procurado pelo e-mail entre os usuarios; o
 *     condutor, pelo nome. Quem nao bate fica so com o nome escrito.
 *
 * O KM atual de cada veiculo passa a ser o do ultimo registro dele — e
 * o piso da proxima saida. O que a pessoa digitou fora do padrao ("76603km",
 * "91.671") e lido do jeito mais provavel; o que nao da para ler fica
 * sem KM e aparece no resumo.
 *
 * Rodar de novo nao duplica nada: cada linha guarda o Id do Forms
 * (`planilha_id`) e linha ja importada e pulada.
 *
 * A planilha e lida aqui mesmo, sem biblioteca: um .xlsx e um zip de
 * XMLs, e so precisamos de duas partes dele.
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const args = process.argv.slice(2)
const simular = args.includes('--simular')
const caminho = args.find((a) => !a.startsWith('--'))

if (!caminho || !fs.existsSync(caminho)) {
  console.error('\nInforme o caminho da planilha .xlsx:\n')
  console.error('  npm run db:frota -- "C:\\caminho\\Controle Saída e Devolução de Veículos.xlsx"\n')
  process.exit(1)
}

/* ------------------------------------------------------------
   O .xlsx: um zip. Le o diretorio central e descompacta as
   entradas pedidas.
   ------------------------------------------------------------ */

function lerZip(buffer, nomes) {
  let fim = buffer.length - 22
  while (fim >= 0 && buffer.readUInt32LE(fim) !== 0x06054b50) fim -= 1
  if (fim < 0) throw new Error('O arquivo não é um .xlsx válido.')

  const total = buffer.readUInt16LE(fim + 10)
  let p = buffer.readUInt32LE(fim + 16)
  const achados = {}

  for (let i = 0; i < total; i += 1) {
    const metodo = buffer.readUInt16LE(p + 10)
    const compactado = buffer.readUInt32LE(p + 20)
    const tamNome = buffer.readUInt16LE(p + 28)
    const tamExtra = buffer.readUInt16LE(p + 30)
    const tamComentario = buffer.readUInt16LE(p + 32)
    const local = buffer.readUInt32LE(p + 42)
    const nome = buffer.toString('utf8', p + 46, p + 46 + tamNome)

    if (nomes.includes(nome)) {
      const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
      const dados = buffer.subarray(inicio, inicio + compactado)
      achados[nome] = (metodo === 0 ? dados : zlib.inflateRawSync(dados)).toString('utf8')
    }
    p += 46 + tamNome + tamExtra + tamComentario
  }
  return achados
}

const desfazer = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

function lerPlanilha(arquivo) {
  const partes = lerZip(fs.readFileSync(arquivo), ['xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml'])
  if (!partes['xl/worksheets/sheet1.xml']) throw new Error('A planilha não tem a primeira aba.')

  const textos = [...(partes['xl/sharedStrings.xml'] ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desfazer(t[1])).join(''),
  )

  const coluna = (ref) => [...ref.match(/^[A-Z]+/)[0]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

  const linhas = []
  for (const r of partes['xl/worksheets/sheet1.xml'].matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const linha = []
    for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tipo = c[2].match(/t="(\w+)"/)?.[1]
      const corpo = c[3] ?? ''
      const v = corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let valor = null
      if (tipo === 's') valor = textos[Number(v)]
      else if (tipo === 'inlineStr') valor = desfazer(corpo.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '')
      else if (v !== undefined) valor = tipo === 'str' ? desfazer(v) : Number(v)
      linha[coluna(c[1])] = valor
    }
    linhas.push(linha)
  }

  const [cabeca, ...corpo] = linhas
  return corpo.map((l) => Object.fromEntries(cabeca.map((h, i) => [String(h).trim(), l[i] ?? null])))
}

/* ------------------------------------------------------------
   Leitura de cada campo
   ------------------------------------------------------------ */

const texto = (v) => {
  const t = String(v ?? '').trim()
  return t ? t : null
}

/** A data do Excel e o numero de dias desde 30/12/1899. */
function dataDoExcel(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 10)
}

/** Data e hora do Excel -> 'AAAA-MM-DD HH:MM:SS' (hora de Brasilia, sem fuso). */
function momentoDoExcel(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * O que a pessoa digitou no KM, lido do jeito mais provavel:
 *   '363335' e '76603km' -> o numero;
 *   '91.671'             -> 91671 (ponto de milhar);
 *   '4287,7' e '1232.8'  -> 4287 e 1232 (a casa decimal do hodometro).
 * O resto ('Troca', 'Não identificado', '0000') fica sem KM: zero nao e
 * leitura de hodometro, e quem nao sabia o KM digitava zeros.
 */
function lerKmDaPlanilha(valor) {
  const t = String(valor ?? '').trim().toLowerCase().replace(/\s|km/g, '')
  let km = null
  if (/^\d+$/.test(t)) km = Number(t)
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) km = Number(t.replace(/\./g, ''))
  else if (/^\d+[.,]\d{1,2}$/.test(t)) km = Math.floor(Number(t.replace(',', '.')))
  return km ? km : null
}

/**
 * A hora digitada no Forms, que era um campo de texto livre: '06.35',
 * '16h00', '7h', '0700', '13::15', "18'30", 'O6:52'... Devolve 'HH:MM'
 * ou null. '19:40 - 20:10' fica com a primeira.
 */
function lerHoraDaPlanilha(valor) {
  let t = String(valor ?? '').trim().toLowerCase().replace(/o/g, '0')
  if (!t) return null
  t = t.split(/\s*-\s*/)[0]
  let h
  let m
  let achado = t.match(/^(\d{1,2})\s*[:.;'h/ ]+\s*(\d{1,2})?$/)
  if (achado) {
    h = Number(achado[1])
    m = Number(achado[2] ?? 0)
  } else if ((achado = t.match(/^(\d{1,2})$/))) {
    h = Number(achado[1])
    m = 0
  } else if ((achado = t.match(/^(\d{2})(\d{2})$/))) {
    h = Number(achado[1])
    m = Number(achado[2])
  } else {
    return null
  }
  if (h > 23 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const simNao = (v) => {
  const t = String(v ?? '').trim().toLowerCase()
  if (t === 'sim') return true
  if (t === 'não' || t === 'nao') return false
  return null
}

const semAcento = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const TIPO = { saida: 'saida', devolucao: 'devolucao', 'troca de motorista': 'troca' }

/* A marca de cada modelo da frota. Sao modelos de uma marca so (a Spin
   so existe Chevrolet, o Oroch so Renault...), entao da para preencher
   sem perguntar. Placa, ano e cor nao tem de onde sair: ficam em branco,
   e a tela mostra o "!" ate alguem completar. */
const MARCAS = { spin: 'Chevrolet', etios: 'Toyota', fielder: 'Toyota', yaris: 'Toyota', oroch: 'Renault' }

const C = {
  id: 'Id',
  conclusao: 'Hora de conclusão',
  email: 'Email',
  nome: 'Nome',
  condutor: 'Nome do condutor do veículo?',
  carro: 'Qual modelo do carro?',
  tipo: 'Está saindo ou devolvendo o veículo?',
  kmSaida: 'KM de saída ou troca (Apenas números)',
  dataSaida: 'Data de saída ou troca',
  horaSaida: 'Horário de saída ou troca de motorista (HH:MM)',
  destino: 'Destino/Obra',
  obsSaida: 'Observações saída ou troca',
  fotosSaida: 'Insira imagem do carro saída ou troca',
  kmDev: 'KM de devolução? (Apenas números)',
  dataDev: 'Data de devolução',
  horaDev: 'Horário de devolução (HH:MM)',
  pneus: 'Houve calibração dos pneus',
  oleo: 'Foi verificado o nível de óleo?',
  agua: 'Foi verificado o nível de água do reservatório do para-brisa?',
  abastecido: 'O carro está abastecido?',
  semParar: 'Foi utilizado o "Sem Parar" para abastecer o carro?',
  posto: 'Em qual Posto e qual valor aproximado do abastecimento? (Exemplo: Posto Ipiranga barueri, R$ 20,50)',
  limpoInterno: 'O carro encontra-se limpo internamente?',
  limpoExterno: 'O carro encontra-se limpo externamente?',
  farois: 'Foi verificado se os faróis estão funcionando?',
  obsDev: 'Observações devolução',
  fotosDev: 'Insira imagem do carro devolução',
}

/** Uma linha da planilha -> o registro, ou { pulada: motivo }. */
function paraRegistro(l) {
  const tipo = TIPO[semAcento(l[C.tipo])]
  const planilhaId = Number(l[C.id])
  const veiculo = texto(l[C.carro])
  if (!Number.isInteger(planilhaId)) return { pulada: 'sem Id' }
  if (!tipo) return { pulada: `tipo desconhecido "${l[C.tipo]}"`, planilhaId }
  if (!veiculo) return { pulada: 'sem carro', planilhaId }

  const devolve = tipo === 'devolucao'
  const kmBruto = devolve ? l[C.kmDev] : l[C.kmSaida]
  const horaBruta = devolve ? l[C.horaDev] : l[C.horaSaida]
  const fotos = String((devolve ? l[C.fotosDev] : l[C.fotosSaida]) ?? '')
    .split(';')
    .map((u) => u.trim())
    .filter((u) => /^https:\/\//.test(u))

  const registro = {
    planilhaId,
    tipo,
    veiculo,
    usuarioEmail: texto(l[C.email])?.toLowerCase() ?? null,
    usuarioNome: texto(l[C.nome]),
    condutorNome: texto(l[C.condutor]) ?? texto(l[C.nome]) ?? 'Não informado',
    km: lerKmDaPlanilha(kmBruto),
    kmBruto: texto(kmBruto),
    data: dataDoExcel(devolve ? l[C.dataDev] : l[C.dataSaida]) ?? dataDoExcel(l[C.conclusao]),
    hora: lerHoraDaPlanilha(horaBruta),
    horaBruta: texto(horaBruta),
    destino: devolve ? null : texto(l[C.destino]),
    observacao: texto(devolve ? l[C.obsDev] : l[C.obsSaida]),
    fotos,
    criadoEm: momentoDoExcel(l[C.conclusao]),
    checklist: devolve
      ? {
          pneus: simNao(l[C.pneus]),
          oleo: simNao(l[C.oleo]),
          agua: simNao(l[C.agua]),
          abastecido: simNao(l[C.abastecido]),
          semParar: simNao(l[C.semParar]),
          limpoInterno: simNao(l[C.limpoInterno]),
          limpoExterno: simNao(l[C.limpoExterno]),
          farois: simNao(l[C.farois]),
        }
      : null,
    posto: devolve ? texto(l[C.posto]) : null,
  }
  return registro
}

/** A ordem do que aconteceu: data, hora (ou a do envio) e o Id do Forms. */
function ordem(a, b) {
  const chave = (r) => `${r.data} ${r.hora ?? (r.criadoEm ?? '').slice(11, 16)}`
  return chave(a).localeCompare(chave(b)) || a.planilhaId - b.planilhaId
}

/** '1.234.567' */
const n = (v) => Number(v).toLocaleString('pt-BR')

/* ------------------------------------------------------------
   Leitura e resumo
   ------------------------------------------------------------ */

const linhas = lerPlanilha(caminho)
const lidos = linhas.map(paraRegistro)
const puladas = lidos.filter((r) => r.pulada)
/* a planilha exportada tem linhas repetidas (mesmo Id do Forms, mesmo
   conteudo): fica uma de cada */
const vistos = new Set()
let repetidas = 0
const registros = lidos
  .filter((r) => !r.pulada)
  .filter((r) => {
    if (vistos.has(r.planilhaId)) {
      repetidas += 1
      return false
    }
    vistos.add(r.planilhaId)
    return true
  })
  .sort(ordem)

const porVeiculo = new Map()
for (const r of registros) {
  const lista = porVeiculo.get(r.veiculo) ?? []
  lista.push(r)
  porVeiculo.set(r.veiculo, lista)
}

const veiculos = [...porVeiculo.entries()]
  .map(([nome, lista]) => {
    const comKm = lista.filter((r) => r.km !== null)
    const ultimo = lista[lista.length - 1]
    return {
      nome,
      modelo: nome.replace(/\s*\d+$/, '').trim() || nome,
      marca: MARCAS[semAcento(nome.replace(/\s*\d+$/, ''))] ?? null,
      registros: lista.length,
      kmAtual: comKm.length ? comKm[comKm.length - 1].km : null,
      emUso: ultimo.tipo !== 'devolucao',
      ultimo,
    }
  })
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))

console.log(
  `\nPlanilha: ${linhas.length} linhas, ${registros.length} registros, ` +
    `${repetidas} linhas repetidas, ${puladas.length} puladas`,
)
for (const t of ['saida', 'devolucao', 'troca']) {
  console.log(`  ${t.padEnd(10)} ${registros.filter((r) => r.tipo === t).length}`)
}
console.log('\nVeículos:')
for (const v of veiculos) {
  const u = v.ultimo
  console.log(
    `  ${v.nome.padEnd(11)} ${String(v.registros).padStart(4)} registros  KM atual ${v.kmAtual === null ? '—' : n(v.kmAtual).padStart(9)}  ` +
      `${v.emUso ? `EM USO com ${u.condutorNome} desde ${u.data}` : `disponível (devolvido em ${u.data})`}`,
  )
}

const kmLidoDiferente = registros.filter((r) => r.kmBruto && String(r.km) !== r.kmBruto)
const horaLidaDiferente = registros.filter((r) => r.horaBruta && r.hora !== r.horaBruta)
console.log(`\nKM fora do padrão: ${kmLidoDiferente.length}`)
kmLidoDiferente.forEach((r) => console.log(`  Id ${r.planilhaId}: "${r.kmBruto}" -> ${r.km ?? 'sem KM'}`))
console.log(`Hora fora do padrão: ${horaLidaDiferente.length} (ex.: ${horaLidaDiferente.slice(0, 6).map((r) => `"${r.horaBruta}" -> ${r.hora ?? 'sem hora'}`).join(', ')})`)
if (puladas.length) console.log(`Puladas: ${puladas.map((p) => `${p.planilhaId ?? '?'} (${p.pulada})`).join(', ')}`)

if (simular) {
  console.log('\nSimulação: nada foi gravado.\n')
  process.exit(0)
}

/* ------------------------------------------------------------
   Gravacao — tudo numa transacao so: ou entra a planilha
   inteira, ou nada.
   ------------------------------------------------------------ */

const { pool } = await import('../db.js')
const cliente = await pool.connect()
let novos = 0
try {
  const { rows: banco } = await cliente.query('SELECT current_database() AS banco')
  console.log(`\nBanco: ${banco[0].banco}`)

  await cliente.query('BEGIN')

  const { rows: usuarios } = await cliente.query('SELECT id, name, lower(email) AS email FROM usuario')
  const porEmail = new Map(usuarios.filter((u) => u.email).map((u) => [u.email, u]))
  const porNome = new Map(usuarios.map((u) => [semAcento(u.name), u]))

  const idDoVeiculo = new Map()
  for (const v of veiculos) {
    const { rows } = await cliente.query(
      `INSERT INTO veiculo (nome, modelo, marca)
       VALUES ($1, $2, $3)
       ON CONFLICT ((lower(btrim(nome)))) DO UPDATE
          SET modelo = coalesce(veiculo.modelo, EXCLUDED.modelo),
              marca = coalesce(veiculo.marca, EXCLUDED.marca)
       RETURNING id`,
      [v.nome, v.modelo, v.marca],
    )
    idDoVeiculo.set(v.nome, rows[0].id)
  }

  for (const r of registros) {
    const quem = r.usuarioEmail ? porEmail.get(r.usuarioEmail) : null
    const condutor = porNome.get(semAcento(r.condutorNome)) ?? null
    const c = r.checklist ?? {}
    const { rowCount } = await cliente.query(
      `INSERT INTO veiculo_registro (
         veiculo_id, tipo, usuario_id, usuario_nome, condutor_id, condutor_nome,
         km, data, hora, destino, observacao,
         pneus, oleo, agua, abastecido, sem_parar, posto, limpo_interno, limpo_externo, farois,
         fotos_externas, planilha_id, criado_em
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22, coalesce($23::timestamp AT TIME ZONE 'America/Sao_Paulo', now())
       )
       ON CONFLICT (planilha_id) WHERE planilha_id IS NOT NULL DO NOTHING`,
      [
        idDoVeiculo.get(r.veiculo),
        r.tipo,
        quem?.id ?? null,
        r.usuarioNome ?? quem?.name ?? null,
        condutor?.id ?? null,
        r.condutorNome,
        r.km,
        r.data,
        r.hora,
        r.destino,
        r.observacao,
        c.pneus ?? null,
        c.oleo ?? null,
        c.agua ?? null,
        c.abastecido ?? null,
        c.semParar ?? null,
        r.posto,
        c.limpoInterno ?? null,
        c.limpoExterno ?? null,
        c.farois ?? null,
        r.fotos.length ? r.fotos : null,
        r.planilhaId,
        r.criadoEm,
      ],
    )
    novos += rowCount
  }

  /* o KM atual de cada veiculo NOVO: o do ultimo registro dele que tem
     KM. Veiculo que ja tinha KM fica como esta — dali em diante quem
     cuida dele sao as saidas e devolucoes, e rodar a importacao de novo
     desfaria uma correcao feita na tela. */
  await cliente.query(`
    UPDATE veiculo v
       SET km_atual = u.km
      FROM (
        SELECT DISTINCT ON (veiculo_id) veiculo_id, km
          FROM veiculo_registro
         WHERE km IS NOT NULL
         ORDER BY veiculo_id, data DESC, hora DESC NULLS LAST, criado_em DESC, id DESC
      ) u
     WHERE u.veiculo_id = v.id
       AND v.km_atual IS NULL
  `)

  await cliente.query('COMMIT')
  console.log(`\n${novos} registros novos gravados (${registros.length - novos} já estavam lá).\n`)
} catch (erro) {
  await cliente.query('ROLLBACK').catch(() => {})
  console.error('\nNada foi gravado:', erro.message)
  if (erro.code === '42P01') console.error('Rode antes o db/atualizacao-22.sql.txt (npm run db:atualizar).')
  process.exitCode = 1
} finally {
  cliente.release()
  await pool.end().catch(() => {})
}
