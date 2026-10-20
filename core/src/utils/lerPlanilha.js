/* ============================================================
   LER PLANILHA — .xlsx ou .csv, no navegador, sem biblioteca

   O par de utils/planilha.js (que ESCREVE .xlsx). Serve para a
   importacao de negocios: o Pipedrive exporta os negocios em .xlsx
   ou .csv, e a tela le o arquivo aqui antes de mandar as linhas
   para a API.

   Um .xlsx e um zip de XMLs; o navegador descompacta sozinho
   (DecompressionStream 'deflate-raw') e o DOMParser le o XML. So a
   PRIMEIRA aba importa.

     const { cabecalho, linhas } = await lerPlanilha(arquivo)
     // cabecalho: ['Negócio - Título', ...]
     // linhas:    [['LWN-888-26-259 - Smoke Study', ...], ...]

   Texto vem como texto; numero (inclusive data, que no Excel e
   numero) vem como numero.
   ============================================================ */

/* ---------------- CSV ---------------- */

function lerCsv(texto) {
  const limpo = texto.replace(/^﻿/, '')
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? ''
  const contar = (c) => primeira.split(c).length - 1
  const separador = [';', ',', '\t'].sort((a, b) => contar(b) - contar(a))[0]

  const linhas = []
  let linha = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i]
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"'
        i += 1
      } else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === separador) {
      linha.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i += 1
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else campo += c
  }
  if (campo !== '' || linha.length) {
    linha.push(campo)
    linhas.push(linha)
  }
  return linhas.filter((l) => l.some((v) => String(v).trim() !== ''))
}

/* ---------------- XLSX ---------------- */

async function descompactar(bytes, metodo) {
  if (metodo === 0) return bytes
  if (metodo !== 8) throw new Error('A planilha usa uma compactação que o navegador não lê.')
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(fluxo).arrayBuffer())
}

/** As entradas do zip, por nome, ainda compactadas. */
function indiceDoZip(buffer) {
  const dv = new DataView(buffer)
  let fim = buffer.byteLength - 22
  while (fim >= 0 && dv.getUint32(fim, true) !== 0x06054b50) fim -= 1
  if (fim < 0) throw new Error('O arquivo não é um .xlsx válido.')
  const total = dv.getUint16(fim + 10, true)
  let p = dv.getUint32(fim + 16, true)
  const nomes = new TextDecoder()
  const entradas = {}
  for (let i = 0; i < total; i += 1) {
    const metodo = dv.getUint16(p + 10, true)
    const compactado = dv.getUint32(p + 20, true)
    const tamNome = dv.getUint16(p + 28, true)
    const tamExtra = dv.getUint16(p + 30, true)
    const tamComentario = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const nome = nomes.decode(new Uint8Array(buffer, p + 46, tamNome))
    entradas[nome] = { metodo, compactado, local }
    p += 46 + tamNome + tamExtra + tamComentario
  }
  return entradas
}

async function lerEntrada(buffer, entradas, nome) {
  const e = entradas[nome]
  if (!e) return null
  const dv = new DataView(buffer)
  const inicio = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true)
  const bytes = await descompactar(new Uint8Array(buffer, inicio, e.compactado), e.metodo)
  return new TextDecoder().decode(bytes)
}

const xml = (texto) => new DOMParser().parseFromString(texto, 'application/xml')

/** 'C12' -> 2 (a coluna, comecando em 0). */
function colunaDa(ref) {
  const letras = /^[A-Z]+/.exec(ref ?? '')?.[0] ?? ''
  let n = 0
  for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64)
  return n - 1
}

async function lerXlsx(buffer) {
  const entradas = indiceDoZip(buffer)

  /* a primeira aba: o caminho dela sai do workbook + rels */
  let caminho = 'xl/worksheets/sheet1.xml'
  const livro = await lerEntrada(buffer, entradas, 'xl/workbook.xml')
  const rels = await lerEntrada(buffer, entradas, 'xl/_rels/workbook.xml.rels')
  if (livro && rels) {
    const aba = xml(livro).getElementsByTagName('sheet')[0]
    const rid = aba?.getAttribute('r:id') ?? aba?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    const rel = [...xml(rels).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid)
    const alvo = rel?.getAttribute('Target')
    if (alvo) caminho = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`
  }

  const compartilhados = []
  const textos = await lerEntrada(buffer, entradas, 'xl/sharedStrings.xml')
  if (textos) {
    for (const si of xml(textos).getElementsByTagName('si')) {
      compartilhados.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''))
    }
  }

  const folha = await lerEntrada(buffer, entradas, caminho)
  if (!folha) throw new Error('A planilha não tem nenhuma aba.')

  const linhas = []
  for (const row of xml(folha).getElementsByTagName('row')) {
    const linha = []
    for (const c of row.getElementsByTagName('c')) {
      const tipo = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      let valor
      if (tipo === 's') valor = compartilhados[Number(v)] ?? ''
      else if (tipo === 'inlineStr') valor = [...c.getElementsByTagName('t')].map((t) => t.textContent).join('')
      else if (tipo === 'str' || tipo === 'e') valor = v
      else if (tipo === 'b') valor = v === '1'
      else valor = v === '' ? '' : Number(v)
      linha[colunaDa(c.getAttribute('r'))] = valor
    }
    linhas.push(Array.from(linha, (v) => v ?? ''))
  }
  return linhas.filter((l) => l.some((v) => String(v).trim() !== ''))
}

/* ---------------- entrada ---------------- */

export async function lerPlanilha(arquivo) {
  const nome = String(arquivo?.name ?? '').toLowerCase()
  let linhas
  if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
    linhas = lerCsv(await arquivo.text())
  } else if (nome.endsWith('.xlsx')) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador não abre .xlsx. Exporte em .csv ou atualize o navegador.')
    }
    linhas = await lerXlsx(await arquivo.arrayBuffer())
  } else {
    throw new Error('Escolha um arquivo .xlsx ou .csv.')
  }
  if (linhas.length < 2) throw new Error('A planilha não tem nenhuma linha além do cabeçalho.')
  const [cabecalho, ...resto] = linhas
  return { cabecalho: cabecalho.map((c) => String(c ?? '').trim()), linhas: resto }
}

/**
 * Uma data de planilha em 'AAAA-MM-DD': numero de serie do Excel,
 * '20/10/2026', '2026-10-20' ou '2026-10-20 14:00:00'. Sem jeito, ''.
 */
export function dataDaPlanilha(valor) {
  if (valor === null || valor === undefined || valor === '') return ''
  if (typeof valor === 'number' && valor > 20000 && valor < 90000) {
    return new Date(Math.round((valor - 25569) * 86400000)).toISOString().slice(0, 10)
  }
  const t = String(valor).trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}
