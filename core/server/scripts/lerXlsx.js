/**
 * Leitura de .xlsx para os scripts de importacao — sem biblioteca.
 *
 * Um .xlsx e um zip de XMLs. Para importar uma planilha exportada (do
 * Forms, do SharePoint) bastam tres partes dele: a lista de abas, os
 * textos compartilhados e a aba em si. O resto (estilos, conexoes,
 * tabelas) nao interessa aqui.
 *
 *   const abas = lerAbas('planilha.xlsx')   // { 'Despesas': [ {coluna: valor}, ... ], ... }
 *
 * Cada linha vira um objeto com o cabecalho (a 1a linha) como chave,
 * ja sem espacos nas pontas. Texto vem como texto; numero (inclusive
 * data e hora, que no Excel sao numeros) vem como numero.
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

/** As entradas pedidas do zip, como texto. */
export function lerZip(buffer, quais) {
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

    if (!quais || quais.includes(nome)) {
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

const coluna = (ref) => [...ref.match(/^[A-Z]+/)[0]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

function linhasDaAba(xmlAba, textos) {
  const linhas = []
  for (const r of xmlAba.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
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
  const [cabeca = [], ...corpo] = linhas
  return corpo.map((l) => Object.fromEntries(cabeca.map((h, i) => [String(h ?? '').trim(), l[i] ?? null])))
}

/** Todas as abas da planilha: { 'nome da aba': [linha, ...] }. */
export function lerAbas(arquivo) {
  const partes = lerZip(fs.readFileSync(arquivo))
  const textos = [...(partes['xl/sharedStrings.xml'] ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desfazer(t[1])).join(''),
  )

  /* o nome de cada aba esta no workbook; o arquivo dela, nos rels */
  const alvos = Object.fromEntries(
    [...(partes['xl/_rels/workbook.xml.rels'] ?? '').matchAll(/<Relationship [^>]*>/g)].map((m) => [
      m[0].match(/Id="([^"]+)"/)?.[1],
      m[0].match(/Target="([^"]+)"/)?.[1],
    ]),
  )
  const abas = {}
  for (const m of (partes['xl/workbook.xml'] ?? '').matchAll(/<sheet [^>]*>/g)) {
    const nome = desfazer(m[0].match(/name="([^"]+)"/)?.[1] ?? '')
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1]
    const alvo = String(alvos[rid] ?? '').replace(/^\/?(xl\/)?/, '')
    const xmlAba = partes[`xl/${alvo}`]
    if (nome && xmlAba) abas[nome] = linhasDaAba(xmlAba, textos)
  }
  return abas
}

/** A data do Excel (dias desde 30/12/1899) -> 'AAAA-MM-DD'. */
export function dataDoExcel(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null
  return new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
}

/** Data e hora do Excel -> 'AAAA-MM-DD HH:MM:SS' (o relogio de quem exportou, sem fuso). */
export function momentoDoExcel(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null
  return new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().slice(0, 19).replace('T', ' ')
}
