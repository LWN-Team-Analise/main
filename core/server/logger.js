/**
 * Sistema de logging configurável por ambiente.
 *
 * Em desenvolvimento: logs detalhados no console
 * Em produção: logs mais restritos, sem informações sensíveis
 */
const isProduction = process.env.NODE_ENV === 'production'
const isDevelopment = process.env.NODE_ENV === 'development'

const niveis = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
}

/**
 * Remove informações sensíveis do objeto antes de logar
 */
function sanitizar(objeto) {
  if (!objeto || typeof objeto !== 'object') return objeto

  const sensivel = [
    'password',
    'senha',
    'secret',
    'token',
    'authorization',
    'senha_hash',
    'client_secret',
    'refresh_token',
  ]

  const copia = { ...objeto }
  sensivel.forEach((chave) => {
    if (chave in copia) {
      copia[chave] = '[REMOVIDO]'
    }
  })

  return copia
}

function logar(nivel, modulo, mensagem, dados) {
  const timestamp = new Date().toISOString()
  const dadosSanitizados = dados ? sanitizar(dados) : undefined

  // Em produção, só mostra ERROR e WARN
  if (isProduction && (nivel === niveis.DEBUG || nivel === niveis.INFO)) {
    return
  }

  const linha = `[${timestamp}] [${nivel}] [${modulo}] ${mensagem}`

  switch (nivel) {
    case niveis.ERROR:
      console.error(linha, dadosSanitizados)
      break
    case niveis.WARN:
      console.warn(linha, dadosSanitizados)
      break
    case niveis.INFO:
      console.info(linha, dadosSanitizados)
      break
    case niveis.DEBUG:
      console.debug(linha, dadosSanitizados)
      break
    default:
      console.log(linha, dadosSanitizados)
  }
}

export const logger = {
  error: (modulo, mensagem, dados) => logar(niveis.ERROR, modulo, mensagem, dados),
  warn: (modulo, mensagem, dados) => logar(niveis.WARN, modulo, mensagem, dados),
  info: (modulo, mensagem, dados) => logar(niveis.INFO, modulo, mensagem, dados),
  debug: (modulo, mensagem, dados) => logar(niveis.DEBUG, modulo, mensagem, dados),
  niveis,
}
