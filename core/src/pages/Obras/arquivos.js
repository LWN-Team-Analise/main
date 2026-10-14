/**
 * O que os documentos da obra tem em comum, onde quer que sejam
 * anexados (Anexos da obra, Proposta tecnica).
 *
 * O arquivo e guardado no banco como data URL, igual a foto de perfil.
 * Por isso o teto de 4 MB por arquivo: acima disso o JSON nao passa no
 * limite da API.
 */

export const BYTES_MAXIMOS = 4 * 1024 * 1024

export const tamanhoLegivel = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function lerArquivo(arquivo) {
  return new Promise((resolver, recusar) => {
    const leitor = new FileReader()
    leitor.onload = () => resolver(leitor.result)
    leitor.onerror = () => recusar(new Error('Não foi possível ler este arquivo.'))
    leitor.readAsDataURL(arquivo)
  })
}

/** Entrega o arquivo baixado (data URL) ao navegador, com o nome dele. */
export function salvarArquivo(conteudo, nome) {
  const link = document.createElement('a')
  link.href = conteudo
  link.download = nome
  link.click()
}
