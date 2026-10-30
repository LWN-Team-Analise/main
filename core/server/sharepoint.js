/**
 * Os arquivos do sistema no SharePoint da empresa.
 *
 * Tudo mora na pasta do Atmosfera, na biblioteca "Documentos
 * Compartilhados" do site TimeCSeCX:
 *
 *   Principal / Departamento da Excelência / 00 - LWN / 05 - Atmosfera /
 *     01 - Anexos de obra / 2026 / Outubro / Agener União - LWN-888-01 / arquivo.pdf
 *     02 - Reembolso / Reembolso - Atmosfera LWN.xlsx
 *
 * O ano e o mes sao os da CRIACAO da obra (no fuso de Sao Paulo): todos
 * os anexos de uma obra ficam juntos. As pastas que faltam (o ano, o mes,
 * a obra) nascem no proprio envio — o Graph cria o caminho inteiro.
 *
 * Quem entra e o APLICATIVO (credenciais de cliente), e nao uma pessoa:
 * o anexo nao pode parar se a senha de alguem mudar. O registro no Entra
 * ID e o do login com Outlook, com a permissao de aplicativo
 * Sites.ReadWrite.All (consentida pelo administrador).
 *
 * O .env pode trocar o lugar (os padroes sao os de hoje):
 *
 *   SHAREPOINT_SITE=lwnengenhariacombr.sharepoint.com:/sites/TimeCSeCX
 *   SHAREPOINT_PASTA=Principal/Departamento da Excelência/00 - LWN/05 - Atmosfera
 *
 * Sem as credenciais, `sharepointConfigurado()` e false e o anexo volta a
 * ser gravado no banco, como antes.
 */
import { logger } from './logger.js'

const CLIENTE = process.env.OUTLOOK_CLIENT_ID || process.env.GRAPH_CLIENT_ID
const SEGREDO = process.env.OUTLOOK_CLIENT_SECRET || process.env.GRAPH_CLIENT_SECRET
/* credenciais de cliente pedem o diretorio de verdade ('organizations' nao
   serve); sem nenhum no .env, vale o dominio inicial do tenant da LWN */
const generico = (t) => !t || ['organizations', 'common', 'consumers'].includes(t)
const INQUILINO =
  process.env.GRAPH_TENANT_ID ||
  (generico(process.env.OUTLOOK_TENANT) ? 'lwnengenhariacombr.onmicrosoft.com' : process.env.OUTLOOK_TENANT)

const SITE = process.env.SHAREPOINT_SITE || 'lwnengenhariacombr.sharepoint.com:/sites/TimeCSeCX'
const PASTA = process.env.SHAREPOINT_PASTA || 'Principal/Departamento da Excelência/00 - LWN/05 - Atmosfera'
export const PASTA_ANEXOS = '01 - Anexos de obra'
export const PASTA_REEMBOLSO = '02 - Reembolso'
export const PLANILHA_REEMBOLSO = 'Reembolso - Atmosfera LWN.xlsx'
const GRAPH = 'https://graph.microsoft.com/v1.0'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export const sharepointConfigurado = () => Boolean(CLIENTE && SEGREDO)

/* ---------------- o token do aplicativo ---------------- */

let guardado = { token: null, vence: 0 }

async function tokenDoAplicativo() {
  if (guardado.token && Date.now() < guardado.vence) return guardado.token
  const resposta = await fetch(`https://login.microsoftonline.com/${INQUILINO}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENTE,
      client_secret: SEGREDO,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
    signal: AbortSignal.timeout(10000),
  })
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok || !corpo?.access_token) {
    throw new Error(corpo?.error_description?.split('\r\n')[0] ?? 'A Microsoft recusou as credenciais do aplicativo.')
  }
  guardado = { token: corpo.access_token, vence: Date.now() + (Number(corpo.expires_in ?? 3600) - 60) * 1000 }
  return guardado.token
}

async function graph(caminho, { metodo = 'GET', corpo, tipo } = {}) {
  const token = await tokenDoAplicativo()
  const resposta = await fetch(`${GRAPH}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(tipo ? { 'Content-Type': tipo } : {}) },
    body: corpo,
    signal: AbortSignal.timeout(30000),
  })
  const json = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    const erro = new Error(`${resposta.status} ${json?.error?.code ?? ''} ${json?.error?.message ?? ''}`.trim())
    erro.status = resposta.status
    throw erro
  }
  return json
}

/* ---------------- onde gravar ---------------- */

/* a biblioteca "Documentos Compartilhados" do site: guardada, e uma ida so */
let biblioteca = null
async function idDaBiblioteca() {
  if (biblioteca) return biblioteca
  const site = await graph(`/sites/${SITE}?$select=id`)
  const { value: drives } = await graph(`/sites/${site.id}/drives?$select=id,name,webUrl`)
  const achada =
    drives.find((d) => decodeURIComponent(d.webUrl ?? '').endsWith('/Documentos Compartilhados')) ??
    drives.find((d) => decodeURIComponent(d.webUrl ?? '').endsWith('/Shared Documents')) ??
    (await graph(`/sites/${site.id}/drive?$select=id`))
  biblioteca = achada.id
  return biblioteca
}

/** O nome que o SharePoint aceita: sem " * : < > ? / \ | e sem ponto ou espaco no fim. */
export function nomeLimpo(texto, maximo = 120) {
  const limpo = String(texto ?? '')
    .replace(/["*:<>?/\\|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximo)
    .replace(/[. ]+$/, '')
  return limpo || 'sem nome'
}

/* o caminho inteiro, cada pedaco codificado */
const caminhoDe = (...partes) =>
  [...PASTA.split('/'), ...partes].filter(Boolean).map((p) => encodeURIComponent(p)).join('/')

/** Grava os bytes no caminho; as pastas que faltam nascem junto. Devolve o item. */
async function gravar(partes, nome, bytes, tipo, substituir) {
  const drive = await idDaBiblioteca()
  const conflito = substituir ? 'replace' : 'rename'
  return graph(
    `/drives/${drive}/root:/${caminhoDe(...partes, nomeLimpo(nome))}:/content?@microsoft.graph.conflictBehavior=${conflito}`,
    { metodo: 'PUT', corpo: bytes, tipo: tipo || 'application/octet-stream' },
  )
}

/* ---------------- o que o sistema grava ---------------- */

/** "2026" e "Outubro": o ano e o mes da criacao da obra, em Sao Paulo. */
export function anoEMesDaObra(criadaEm) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(criadaEm ?? Date.now()))
  const ano = partes.find((p) => p.type === 'year').value
  const mes = Number(partes.find((p) => p.type === 'month').value)
  return { ano, mes: MESES[mes - 1] }
}

/**
 * Um anexo da obra: 01 - Anexos de obra / ano / Mês / obra / arquivo.
 * Nome repetido na pasta ganha um numero (o SharePoint renomeia).
 * Devolve { webUrl, tamanho, nome }.
 */
export async function guardarAnexoDaObra({ obraNome, obraCriadaEm, nome, tipo, bytes }) {
  const { ano, mes } = anoEMesDaObra(obraCriadaEm)
  const item = await gravar([PASTA_ANEXOS, ano, mes, nomeLimpo(obraNome, 100)], nome, bytes, tipo, false)
  logger.info('sharepoint', `anexo gravado: ${item.name}`)
  return { webUrl: item.webUrl, tamanho: item.size ?? bytes.length, nome: item.name }
}

/** A planilha do reembolso: um arquivo so, trocado a cada mudanca. Devolve o webUrl. */
export async function guardarPlanilhaDoReembolso(bytes) {
  const item = await gravar(
    [PASTA_REEMBOLSO],
    PLANILHA_REEMBOLSO,
    bytes,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    true,
  )
  return item.webUrl
}

/** "data:application/pdf;base64,JVBER..." -> { tipo, bytes } */
export function bytesDoDataUrl(dataUrl) {
  const m = String(dataUrl ?? '').match(/^data:([^;,]*)(;base64)?,(.*)$/s)
  if (!m) return null
  const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8')
  return { tipo: m[1] || 'application/octet-stream', bytes }
}
