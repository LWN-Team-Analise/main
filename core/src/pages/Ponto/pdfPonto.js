/* ============================================================
   O PDF da folha — o "Demonstrativo de Espelho de Ponto", no
   desenho do PDF do sistema de ponto: paisagem, fonte Times, a
   logo, os dados, a tabela dos dias e o rodape com os totais e a
   assinatura.

   O jsPDF e o autoTable sao as copias do proprio site (as mesmas do
   LWN Control, em public/almoxarife/vendor) e so descem no primeiro
   clique em Exportar > PDF: ninguem baixa 400 KB para olhar a folha.
   ============================================================ */
import { COLUNAS_DO_ESPELHO, cpfComMascara, dataBR, rotuloDoPeriodo } from '@/domain/ponto'
import { empresaDaFolha } from './empresa'

const SCRIPTS = ['/almoxarife/vendor/jspdf.umd.min.js', '/almoxarife/vendor/jspdf.plugin.autotable.min.js']
/* a logo reduzida (600x208): no PDF ela sai com 80pt de largura */
const LOGO = '/assets/LogoLWN-pdf.png'

let carregando = null

function carregarScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.onload = resolve
    script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca de PDF.'))
    document.head.appendChild(script)
  })
}

function carregarBiblioteca() {
  if (window.jspdf?.jsPDF) return Promise.resolve()
  if (!carregando) {
    carregando = (async () => {
      for (const src of SCRIPTS) await carregarScript(src)
      if (!window.jspdf?.jsPDF) throw new Error('A biblioteca de PDF não inicializou.')
    })().catch((erro) => {
      carregando = null
      throw erro
    })
  }
  return carregando
}

async function carregarLogo() {
  try {
    const resposta = await fetch(LOGO)
    if (!resposta.ok) return null
    const blob = await resposta.blob()
    return await new Promise((resolve) => {
      const leitor = new FileReader()
      leitor.onload = () => resolve(leitor.result)
      leitor.onerror = () => resolve(null)
      leitor.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const limpo = (v) => (v && v !== '-' ? String(v) : '')

/* as larguras das colunas, na proporcao do espelho do sistema de ponto */
const LARGURAS = [76, 63, 138, 136, 138, 96, 86, 89, 77, 52, 52, 134]

/**
 * Monta o PDF e devolve o documento do jsPDF (quem chama decide se
 * baixa: `doc.save(nome)`).
 */
export async function montarPdfDaFolha({ folha, funcionario, usuario, inicio, fim, assinatura, geradoEm }) {
  await carregarBiblioteca()
  const { jsPDF } = window.jspdf
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', compress: true })
  const pagW = doc.internal.pageSize.getWidth()
  const pagH = doc.internal.pageSize.getHeight()
  const margem = 30
  const util = pagW - margem * 2
  const empresa = empresaDaFolha(funcionario)

  /* ---- cabecalho ---- */
  const logo = await carregarLogo()
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', margem, 22, 80, 28)
    } catch {
      /* segue sem a logo */
    }
  }
  doc.setFont('times', 'bold')
  doc.setFontSize(17)
  doc.text('Demonstrativo de Espelho de Ponto', pagW / 2, 46, { align: 'center' })
  doc.setFont('times', 'normal')
  doc.setFontSize(8.5)
  doc.text(`Documento gerado em ${geradoEm}`, pagW - margem, 30, { align: 'right' })
  doc.text(`${dataBR(inicio)} - ${dataBR(fim)}`, pagW - margem, 41, { align: 'right' })
  doc.text(rotuloDoPeriodo(inicio, fim), pagW - margem, 52, { align: 'right' })

  doc.setLineWidth(0.6)
  doc.line(margem, 64, pagW - margem, 64)

  /* ---- dados: tres colunas de "Rotulo: valor" ---- */
  const campo = (x, y, pares) => {
    let cx = x
    pares.forEach(([rotulo, valor]) => {
      doc.setFont('times', 'bold')
      doc.text(rotulo, cx, y)
      cx += doc.getTextWidth(rotulo) + 3
      doc.setFont('times', 'normal')
      const v = String(valor ?? '')
      doc.text(v, cx, y)
      cx += doc.getTextWidth(v) + 8
    })
  }
  doc.setFontSize(8.5)
  const c2 = margem + util * 0.425
  const c3 = margem + util * 0.705
  campo(margem, 76, [['Empresa:', empresa.nome]])
  campo(margem, 87, [
    ['CNPJ:', empresa.cnpj],
    ['CEP:', empresa.cep],
  ])
  campo(margem, 98, [['Endereço:', empresa.endereco]])
  campo(c2, 76, [['Nome:', funcionario?.nome || usuario?.nome || '']])
  campo(c2, 87, [['Matrícula:', limpo(funcionario?.matricula)]])
  campo(c2, 98, [
    ['PIS:', limpo(funcionario?.pis)],
    ['CPF:', funcionario?.cpf ? cpfComMascara(funcionario.cpf) : ''],
  ])
  campo(c3, 76, [['Data de admissão:', funcionario?.admissao ? dataBR(funcionario.admissao) : '']])
  campo(c3, 87, [['Departamento:', limpo(funcionario?.departamento)]])
  campo(c3, 98, [['Cargo:', limpo(funcionario?.cargo)]])
  doc.line(margem, 106, pagW - margem, 106)

  /* ---- a tabela dos dias ---- */
  const soma = LARGURAS.reduce((a, b) => a + b, 0)
  const largura = (i) => (LARGURAS[i] / soma) * util
  const estiloBase = {
    font: 'times',
    fontSize: 7.2,
    textColor: 0,
    lineColor: 0,
    lineWidth: 0.5,
    cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
    valign: 'middle',
    fillColor: false,
  }
  const meio = new Set([5, 6, 7, 8, 9, 10])
  doc.autoTable({
    startY: 112,
    margin: { left: margem, right: margem, top: 30, bottom: 30 },
    theme: 'grid',
    styles: estiloBase,
    headStyles: { fontStyle: 'bold', halign: 'center', fillColor: false, textColor: 0, lineWidth: 0.5, lineColor: 0 },
    columnStyles: Object.fromEntries(
      LARGURAS.map((_, i) => [i, { cellWidth: largura(i), halign: meio.has(i) ? 'center' : 'left' }]),
    ),
    head: [
      [
        ...COLUNAS_DO_ESPELHO.slice(0, 9).map((c) => ({ content: c, rowSpan: 2 })),
        { content: 'Horas Compensadas', colSpan: 2 },
        { content: 'Eventos', rowSpan: 2 },
      ],
      ['Débito', 'Crédito'],
    ],
    body: folha.linhas.map((l) => [l.rotulo, ...l.celulas]),
    showHead: 'everyPage',
  })

  /* ---- rodape: os totais a esquerda, a assinatura a direita ---- */
  let y = doc.lastAutoTable.finalY + 14
  if (y + 80 > pagH - 20) {
    doc.addPage()
    y = 40
  }
  const totaisL = util * 0.735
  const proporcao = [282, 230, 103, 245]
  const somaT = proporcao.reduce((a, b) => a + b, 0)
  doc.autoTable({
    startY: y,
    margin: { left: margem },
    tableWidth: totaisL,
    theme: 'grid',
    styles: { ...estiloBase, fontSize: 7.4, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
    headStyles: { fontStyle: 'bold', halign: 'center', fillColor: false, textColor: 0, lineWidth: 0.5, lineColor: 0 },
    columnStyles: Object.fromEntries(proporcao.map((p, i) => [i, { cellWidth: (p / somaT) * totaisL }])),
    head: [['Totais Gerais', 'Creditos e Débitos no Período', 'Banco Horas', 'Horas a Pagar ou Descontar']],
    body: [
      [
        `Total Trabalhado: ${folha.totais.trabalhadoTexto}\nTotal H. Normais Esperadas: ${folha.totais.esperadoTexto}`,
        '',
        '',
        [folha.totais.aPagar, folha.totais.noturnaTexto].filter(Boolean).join('\n'),
      ],
    ],
  })

  const xa = margem + totaisL + 16
  const xm = (xa + pagW - margem) / 2
  doc.setFont('times', 'normal')
  doc.setFontSize(8.5)
  doc.text('Concordo com as marcações acima registradas', xm, y + 8, { align: 'center' })
  if (assinatura?.valida) {
    doc.setFont('times', 'italic')
    doc.setFontSize(11)
    doc.text(assinatura.nome, xm, y + 36, { align: 'center', maxWidth: pagW - margem - xa })
  }
  doc.setLineWidth(0.6)
  doc.line(xa, y + 42, pagW - margem, y + 42)
  doc.setFont('times', 'normal')
  doc.setFontSize(8.5)
  doc.text('Assinatura Funcionário', xm, y + 53, { align: 'center' })
  if (assinatura?.valida) {
    doc.setFontSize(6.5)
    doc.text(`Assinado eletronicamente em ${new Date(assinatura.assinadoEm).toLocaleString('pt-BR')}`, xm, y + 62, {
      align: 'center',
    })
  }

  return doc
}
