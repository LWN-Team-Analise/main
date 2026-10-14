/* ============================================================
   PLANILHA — o .xlsx montado aqui mesmo, sem biblioteca

   Um .xlsx e um ZIP com meia duzia de XML dentro. Para o que o
   sistema exporta — tabelas de texto, numero, data e dinheiro —
   isso cabe em um arquivo, e evita trazer uma biblioteca de
   planilha (as boas tem centenas de KB) para um botao que a
   pessoa usa uma vez por mes.

   Cada aba e:

     {
       nome: 'Envios',                     // o nome da aba (ate 31 letras)
       titulo: 'Meus envios — Set/2026',   // opcional: linha grande no topo
       info: [['Período', 'Setembro de 2026'], ...],  // opcional: rotulo / valor
       colunas: [{ titulo: 'Data', tipo: 'data', largura?: 12, soma?: true }],
       linhas: [['2026-09-01', ...], ...],
       total: 'Total',                     // opcional: linha de soma no fim
       tabela: 'Obras',                    // opcional: vira Tabela do Excel
     }

   Os tipos de coluna: texto, inteiro, decimal, reais, porcento
   (0 a 1), data ('AAAA-MM-DD' ou carimbo) e dataHora (carimbo).
   Data vai como DATA de verdade (numero de serie do Excel com
   formato dd/mm/aaaa), e nao como texto: so assim o filtro do
   Excel agrupa por mes e o Power BI reconhece a coluna sozinho.

   `tabela` e o que o Power BI le melhor: em "Obter dados > Excel"
   ele lista cada Tabela pelo nome, ja com o cabecalho certo. Aba
   com tabela comeca direto no cabecalho (sem titulo nem info) — e
   assim que o navegador do Power BI espera.
   ============================================================ */

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/* Os estilos, na ordem em que aparecem em <cellXfs> (ver ESTILOS). */
const S = {
  normal: 0,
  cabecalho: 1,
  reais: 2,
  data: 3,
  dataHora: 4,
  inteiro: 5,
  decimal: 6,
  porcento: 7,
  totalRotulo: 8,
  totalReais: 9,
  totalInteiro: 10,
  titulo: 11,
  rotulo: 12,
  totalDecimal: 13,
}

const ESTILO_DO_TIPO = {
  texto: S.normal,
  reais: S.reais,
  data: S.data,
  dataHora: S.dataHora,
  inteiro: S.inteiro,
  decimal: S.decimal,
  porcento: S.porcento,
}

const ESTILO_DO_TOTAL = {
  reais: S.totalReais,
  inteiro: S.totalInteiro,
  decimal: S.totalDecimal,
}

/* ------------------------------------------------------------
   Pecas pequenas
   ------------------------------------------------------------ */

/** 0 -> 'A', 25 -> 'Z', 26 -> 'AA'. */
function letraDaColuna(indice) {
  let n = indice + 1
  let letras = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    letras = String.fromCharCode(65 + resto) + letras
    n = Math.floor((n - 1) / 26)
  }
  return letras
}

/* XML 1.0 nao aceita caractere de controle (fora tab e quebra de
   linha): um so, vindo de um texto colado, e o Excel recusa o
   arquivo inteiro como corrompido. */
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g

function xml(texto) {
  return String(texto ?? '')
    .replace(CONTROLE, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* O Excel conta os dias a partir de 30/12/1899 (o "dia zero" do
   sistema 1900, com o bug do 29/02/1900 ja descontado). */
const DIA_ZERO = Date.UTC(1899, 11, 30)
const UM_DIA = 86_400_000

/**
 * Data -> numero de serie do Excel, no calendario LOCAL.
 *
 * 'AAAA-MM-DD' e lido como esta, sem Date (sem fuso); carimbo ISO
 * vira a hora de quem exporta — e a hora que a tela mostra.
 */
function serie(valor, comHora) {
  if (valor === null || valor === undefined || valor === '') return null
  const texto = String(valor)
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (soData) {
    const [, a, m, d] = soData.map(Number)
    return (Date.UTC(a, m - 1, d) - DIA_ZERO) / UM_DIA
  }
  const quando = new Date(valor)
  if (Number.isNaN(quando.getTime())) return null
  const local = Date.UTC(
    quando.getFullYear(),
    quando.getMonth(),
    quando.getDate(),
    comHora ? quando.getHours() : 0,
    comHora ? quando.getMinutes() : 0,
    comHora ? quando.getSeconds() : 0,
  )
  return (local - DIA_ZERO) / UM_DIA
}

/** Numero que da para gravar, ou null. */
function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

/**
 * Nome de aba que o Excel aceita: ate 31 letras, sem : \ / ? * [ ],
 * sem apostrofo nas pontas e sem repetir (o Excel compara sem caixa).
 */
function nomesDeAba(nomes) {
  const usados = new Set()
  return nomes.map((bruto, i) => {
    let base = String(bruto ?? '')
      .replace(/[:\\/?*[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^'+|'+$/g, '')
    if (!base) base = `Aba ${i + 1}`
    base = base.slice(0, 31).trim()

    let nome = base
    let n = 2
    while (usados.has(nome.toLowerCase())) {
      const sufixo = ` (${n})`
      nome = `${base.slice(0, 31 - sufixo.length).trim()}${sufixo}`
      n += 1
    }
    usados.add(nome.toLowerCase())
    return nome
  })
}

/* ------------------------------------------------------------
   Textos compartilhados

   O Excel guarda cada texto uma vez so, numa lista, e a celula
   aponta para ela. E o formato que todo programa entende — o texto
   "dentro da celula" existe, mas cabecalho de Tabela escrito assim
   faz o Excel abrir o arquivo pedindo para repara-lo.
   ------------------------------------------------------------ */

function criarTextos() {
  const indice = new Map()
  const lista = []
  let usos = 0
  return {
    id(texto) {
      const t = String(texto)
      usos += 1
      if (!indice.has(t)) {
        indice.set(t, lista.length)
        lista.push(t)
      }
      return indice.get(t)
    },
    xml() {
      const itens = lista
        .map((t) => {
          const limpo = xml(t)
          /* espaco na ponta some sem o `preserve` */
          return /^\s|\s$/.test(t) ? `<si><t xml:space="preserve">${limpo}</t></si>` : `<si><t>${limpo}</t></si>`
        })
        .join('')
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${usos}" uniqueCount="${lista.length}">${itens}</sst>`
    },
  }
}

/* ------------------------------------------------------------
   A aba
   ------------------------------------------------------------ */

function celulaTexto(ref, texto, estilo, textos) {
  if (texto === null || texto === undefined || texto === '') return ''
  const s = estilo ? ` s="${estilo}"` : ''
  return `<c r="${ref}" t="s"${s}><v>${textos.id(texto)}</v></c>`
}

function celulaNumero(ref, valor, estilo) {
  if (valor === null) return ''
  const s = estilo ? ` s="${estilo}"` : ''
  return `<c r="${ref}"${s}><v>${valor}</v></c>`
}

function celula(ref, valor, coluna, textos) {
  const tipo = coluna.tipo ?? 'texto'
  if (tipo === 'texto') return celulaTexto(ref, valor, S.normal, textos)
  if (tipo === 'data') return celulaNumero(ref, serie(valor, false), S.data)
  if (tipo === 'dataHora') return celulaNumero(ref, serie(valor, true), S.dataHora)
  return celulaNumero(ref, numero(valor), ESTILO_DO_TIPO[tipo] ?? S.normal)
}

/** Largura da coluna: o titulo ou o texto mais comprido, com teto. */
function larguraDa(coluna, indice, linhas) {
  if (coluna.largura) return coluna.largura
  const fixa = { data: 12, dataHora: 17, reais: 15, inteiro: 10, decimal: 11, porcento: 10 }[coluna.tipo]
  let maior = String(coluna.titulo ?? '').length
  if (fixa) return Math.max(fixa, maior + 2)
  for (const linha of linhas.slice(0, 400)) {
    const v = linha[indice]
    if (v !== null && v !== undefined) maior = Math.max(maior, String(v).length)
  }
  return Math.min(Math.max(maior + 2, 8), 60)
}

function montarAba(aba, textos, primeira) {
  const colunas = aba.colunas
  const ultimaLetra = letraDaColuna(colunas.length - 1)
  const linhasXml = []
  let r = 0

  /* titulo e informacoes: so em aba SEM Tabela (ver o topo) */
  if (!aba.tabela) {
    if (aba.titulo) {
      r += 1
      linhasXml.push(`<row r="${r}" ht="22" customHeight="1">${celulaTexto(`A${r}`, aba.titulo, S.titulo, textos)}</row>`)
    }
    for (const [rotulo, valor] of aba.info ?? []) {
      r += 1
      linhasXml.push(
        `<row r="${r}">${celulaTexto(`A${r}`, rotulo, S.rotulo, textos)}${celulaTexto(`B${r}`, valor, S.normal, textos)}</row>`,
      )
    }
    if (r > 0) r += 1 /* uma linha em branco antes do cabecalho */
  }

  /* cabecalho */
  r += 1
  const linhaCabecalho = r
  const estiloCabecalho = aba.tabela ? S.normal : S.cabecalho
  linhasXml.push(
    `<row r="${r}">${colunas
      .map((c, i) => celulaTexto(`${letraDaColuna(i)}${r}`, c.titulo, estiloCabecalho, textos))
      .join('')}</row>`,
  )

  /* os dados */
  const primeiraDeDados = r + 1
  for (const linha of aba.linhas) {
    r += 1
    const celulas = colunas.map((c, i) => celula(`${letraDaColuna(i)}${r}`, linha[i], c, textos)).join('')
    linhasXml.push(`<row r="${r}">${celulas}</row>`)
  }
  const ultimaDeDados = r

  /* a Tabela precisa de pelo menos uma linha embaixo do cabecalho */
  const fimDaTabela = Math.max(ultimaDeDados, linhaCabecalho + 1)

  /* a linha de total: SOMA de verdade (com o valor ja calculado, para
     quem abre num leitor que nao recalcula) */
  if (aba.total && !aba.tabela) {
    r += 1
    const celulas = colunas.map((c, i) => {
      const ref = `${letraDaColuna(i)}${r}`
      if (i === 0) return celulaTexto(ref, aba.total, S.totalRotulo, textos)
      if (!c.soma) return `<c r="${ref}" s="${S.totalRotulo}"/>`
      const estilo = ESTILO_DO_TOTAL[c.tipo] ?? S.totalInteiro
      const soma = aba.linhas.reduce((s, l) => s + (numero(l[i]) ?? 0), 0)
      const valor = Math.round(soma * 100) / 100
      if (aba.linhas.length === 0) return `<c r="${ref}" s="${estilo}"><v>0</v></c>`
      const letra = letraDaColuna(i)
      return `<c r="${ref}" s="${estilo}"><f>SUM(${letra}${primeiraDeDados}:${letra}${ultimaDeDados})</f><v>${valor}</v></c>`
    })
    linhasXml.push(`<row r="${r}">${celulas.join('')}</row>`)
  }

  const cols = colunas
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${larguraDa(c, i, aba.linhas)}" customWidth="1"/>`)
    .join('')

  /* o cabecalho fica parado quando a lista rola */
  const painel = `<pane ySplit="${linhaCabecalho}" topLeftCell="A${linhaCabecalho + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${linhaCabecalho + 1}" sqref="A${linhaCabecalho + 1}"/>`
  const visao = `<sheetViews><sheetView workbookViewId="0"${primeira ? ' tabSelected="1"' : ''}>${painel}</sheetView></sheetViews>`

  const intervalo = `A${linhaCabecalho}:${ultimaLetra}${aba.tabela ? fimDaTabela : Math.max(ultimaDeDados, linhaCabecalho)}`
  /* com Tabela, o filtro e dela; sem, vai na aba */
  const filtro = !aba.tabela && aba.linhas.length > 0 ? `<autoFilter ref="${intervalo}"/>` : ''
  const partes = aba.tabela ? '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>' : ''

  const folha =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `${visao}<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols>` +
    `<sheetData>${linhasXml.join('')}</sheetData>${filtro}` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    `${partes}</worksheet>`

  return { folha, intervalo: aba.tabela ? intervalo : null }
}

function montarTabela(id, nome, intervalo, colunas) {
  const nomesColunas = colunas
    .map((c, i) => `<tableColumn id="${i + 1}" name="${xml(c.titulo)}"/>`)
    .join('')
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${id}" name="${nome}" displayName="${nome}" ref="${intervalo}" totalsRowShown="0">` +
    `<autoFilter ref="${intervalo}"/>` +
    `<tableColumns count="${colunas.length}">${nomesColunas}</tableColumns>` +
    '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>' +
    '</table>'
  )
}

/* ------------------------------------------------------------
   O resto do pacote
   ------------------------------------------------------------ */

const FONTE = '<sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/>'

/* "R$" fixo na frente, e o separador de milhar e o decimal do idioma
   de quem abre — no Excel em portugues, R$ 1.234,56 */
const ESTILOS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="4">' +
  '<numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/>' +
  '<numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>' +
  '<numFmt numFmtId="166" formatCode="dd/mm/yyyy\\ hh:mm"/>' +
  '<numFmt numFmtId="167" formatCode="#,##0.0"/>' +
  '</numFmts>' +
  '<fonts count="4">' +
  `<font>${FONTE}</font>` +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
  `<font><b/>${FONTE}</font>` +
  '<font><b/><sz val="14"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
  '</fonts>' +
  '<fills count="4">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF123B7A"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE6ECF5"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top style="thin"><color rgb="FF123B7A"/></top><bottom/><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="14">' +
  /* 0 normal */ '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  /* 1 cabecalho */ '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  /* 2 reais */ '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  /* 3 data */ '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  /* 4 dataHora */ '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  /* 5 inteiro */ '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  /* 6 decimal */ '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  /* 7 porcento */ '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  /* 8 total: rotulo */ '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  /* 9 total: reais */ '<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  /* 10 total: inteiro */ '<xf numFmtId="3" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  /* 11 titulo */ '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  /* 12 rotulo */ '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  /* 13 total: decimal */ '<xf numFmtId="167" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

/**
 * As abas viram os arquivos do pacote: { 'xl/workbook.xml': '...', ... }.
 * Separado do ZIP para dar para conferir o XML sem descompactar nada.
 */
export function arquivosDaPlanilha(abas) {
  const textos = criarTextos()
  const nomes = nomesDeAba(abas.map((a) => a.nome))
  const arquivos = {}
  const tipos = []
  let tabelas = 0

  abas.forEach((aba, i) => {
    const n = i + 1
    const { folha, intervalo } = montarAba(aba, textos, i === 0)
    arquivos[`xl/worksheets/sheet${n}.xml`] = folha
    tipos.push(
      `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )

    if (aba.tabela) {
      tabelas += 1
      arquivos[`xl/tables/table${tabelas}.xml`] = montarTabela(tabelas, aba.tabela, intervalo, aba.colunas)
      arquivos[`xl/worksheets/_rels/sheet${n}.xml.rels`] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        `<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/table" Target="../tables/table${tabelas}.xml"/></Relationships>`
      tipos.push(
        `<Override PartName="/xl/tables/table${tabelas}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`,
      )
    }
  })

  arquivos['xl/workbook.xml'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}">` +
    '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
    nomes.map((nome, i) => `<sheet name="${xml(nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    /* recalcula as somas ao abrir: o valor gravado e so a reserva */
    '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'

  arquivos['xl/_rels/workbook.xml.rels'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<Relationships xmlns="${PKG_REL}">` +
    abas
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('') +
    `<Relationship Id="rId${abas.length + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${abas.length + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` +
    '</Relationships>'

  arquivos['xl/styles.xml'] = ESTILOS
  /* por ultimo: so agora todas as abas ja registraram os textos delas */
  arquivos['xl/sharedStrings.xml'] = textos.xml()

  arquivos['_rels/.rels'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`

  arquivos['[Content_Types].xml'] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    tipos.join('') +
    '</Types>'

  return arquivos
}

/* ------------------------------------------------------------
   O ZIP

   Sem compressao (metodo "store"): o arquivo sai maior, mas uma
   planilha de despesas do mes tem dezenas de KB, e o ZIP sem
   compressao e meia pagina de codigo que nao tem como dar errado.
   ------------------------------------------------------------ */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zipar(arquivos) {
  const codificar = new TextEncoder()
  const agora = new Date()
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | Math.floor(agora.getSeconds() / 2)
  const dia = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate()

  /* [Content_Types].xml na frente: nao e regra, mas e o que todo
     programa de planilha faz, e alguns leitores contam com isso */
  const ordem = Object.keys(arquivos).sort((a, b) =>
    a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : 0,
  )

  const locais = []
  const centrais = []
  let deslocamento = 0

  for (const caminho of ordem) {
    const nome = codificar.encode(caminho)
    const dados = codificar.encode(arquivos[caminho])
    const crc = crc32(dados)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) /* nomes em UTF-8 */
    local.setUint16(8, 0, true) /* store */
    local.setUint16(10, hora, true)
    local.setUint16(12, dia, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, dados.length, true)
    local.setUint32(22, dados.length, true)
    local.setUint16(26, nome.length, true)
    local.setUint16(28, 0, true)
    locais.push(new Uint8Array(local.buffer), nome, dados)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, hora, true)
    central.setUint16(14, dia, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, dados.length, true)
    central.setUint32(24, dados.length, true)
    central.setUint16(28, nome.length, true)
    central.setUint16(30, 0, true)
    central.setUint16(32, 0, true)
    central.setUint16(34, 0, true)
    central.setUint16(36, 0, true)
    central.setUint32(38, 0, true)
    central.setUint32(42, deslocamento, true)
    centrais.push(new Uint8Array(central.buffer), nome)

    deslocamento += 30 + nome.length + dados.length
  }

  const tamanhoCentral = centrais.reduce((s, p) => s + p.length, 0)
  const fim = new DataView(new ArrayBuffer(22))
  fim.setUint32(0, 0x06054b50, true)
  fim.setUint16(8, ordem.length, true)
  fim.setUint16(10, ordem.length, true)
  fim.setUint32(12, tamanhoCentral, true)
  fim.setUint32(16, deslocamento, true)

  const partes = [...locais, ...centrais, new Uint8Array(fim.buffer)]
  const saida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let pos = 0
  for (const p of partes) {
    saida.set(p, pos)
    pos += p.length
  }
  return saida
}

/* ------------------------------------------------------------
   O que as telas usam
   ------------------------------------------------------------ */

/** As abas viram os bytes do .xlsx. */
export function montarPlanilha(abas) {
  if (!abas?.length) throw new Error('Nada para exportar.')
  return zipar(arquivosDaPlanilha(abas))
}

/** Monta e entrega o arquivo para o navegador baixar. */
export function baixarPlanilha(abas, nomeDoArquivo) {
  const blob = new Blob([montarPlanilha(abas)], { type: TIPO_XLSX })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeDoArquivo.endsWith('.xlsx') ? nomeDoArquivo : `${nomeDoArquivo}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  /* o clique so agenda o download; revogar na hora cancelaria */
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** 'Setembro de 2026' -> 'setembro-de-2026': pedaco de nome de arquivo. */
export function paraNomeDeArquivo(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
