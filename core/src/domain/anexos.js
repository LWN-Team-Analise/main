/* ============================================================
   ANEXOS DA OBRA — um arquivo ou um LINK

   O anexo pode ser um arquivo (guardado no banco como data URL, ate
   4 MB) ou um LINK para o documento que mora em outra nuvem — Google
   Drive, OneDrive, SharePoint, Dropbox. O link ocupa poucos bytes no
   banco: o arquivo continua onde foi compartilhado.

   No banco o link e uma linha de obra_anexo como as outras, com
   `tipo` = 'text/uri-list' (o tipo MIME de lista de links) e o
   endereco em `conteudo`. Sem coluna nova, sem atualizacao do banco.

   Este arquivo nao tem React dentro: a API (server/routes/dados.js)
   importa o mesmo.
   ============================================================ */

export const TIPO_LINK = 'text/uri-list'
export const LINK_MAXIMO = 2000
export const NOME_MAXIMO = 200

/** true para o anexo que e link (o arquivo mora em outra nuvem). */
export const ehLink = (anexo) => anexo?.tipo === TIPO_LINK

/**
 * O endereco pronto para gravar, ou null se nao for um link http(s).
 * Quem cola "drive.google.com/..." sem o https:// ganha o https://.
 * Qualquer outro esquema (javascript:, data:, file:) e recusado: o
 * link vira um <a href> na tela de todo mundo que abre a obra.
 */
export function linkValido(texto) {
  let bruto = String(texto ?? '').trim()
  if (!bruto || bruto.length > LINK_MAXIMO || /\s/.test(bruto)) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(bruto)) bruto = `https://${bruto}`
  try {
    const url = new URL(bruto)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname.includes('.')) return null
    return url.href
  } catch {
    return null
  }
}

const SERVICOS = [
  [/(^|\.)(drive|docs)\.google\.com$/, 'Google Drive'],
  [/(^|\.)(onedrive\.live\.com|1drv\.ms)$/, 'OneDrive'],
  [/(^|\.)sharepoint\.com$/, 'SharePoint'],
  [/(^|\.)dropbox\.com$/, 'Dropbox'],
  [/(^|\.)(wetransfer\.com|we\.tl)$/, 'WeTransfer'],
]

/** Onde o documento mora: "Google Drive", "OneDrive"... ou o endereco do site. */
export function servicoDoLink(link) {
  try {
    const host = new URL(link).hostname.toLowerCase()
    const achado = SERVICOS.find(([padrao]) => padrao.test(host))
    return achado ? achado[1] : host.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** O nome do link que veio sem nome: "Link do Google Drive". */
export function nomeDoLink(link) {
  const servico = servicoDoLink(link)
  return servico ? `Link do ${servico}` : 'Link'
}
