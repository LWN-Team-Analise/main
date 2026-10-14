import crypto from 'node:crypto'

/**
 * Validação de força de senha.
 *
 * Requisitos:
 * - Mínimo de 8 caracteres
 * - Pelo menos uma letra maiúscula
 * - Pelo menos uma letra minúscula
 * - Pelo menos um número
 * - Pelo menos um caractere especial
 */

/**
 * Valida se a senha atende aos requisitos mínimos de segurança.
 * @param {string} senha - A senha a ser validada
 * @returns {object} { valido: boolean, erros: string[] }
 */
export function validarForcaSenha(senha) {
  const erros = []

  if (!senha || typeof senha !== 'string') {
    return { valido: false, erros: ['A senha é obrigatória.'] }
  }

  if (senha.length < 8) {
    erros.push('A senha precisa ter pelo menos 8 caracteres.')
  }

  if (!/[A-Z]/.test(senha)) {
    erros.push('A senha precisa ter pelo menos uma letra maiúscula.')
  }

  if (!/[a-z]/.test(senha)) {
    erros.push('A senha precisa ter pelo menos uma letra minúscula.')
  }

  if (!/[0-9]/.test(senha)) {
    erros.push('A senha precisa ter pelo menos um número.')
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(senha)) {
    erros.push('A senha precisa ter pelo menos um caractere especial (!@#$%^&* etc).')
  }

  // Verifica senhas comuns e fracas
  const senhasComuns = [
    'password',
    '12345678',
    'qwerty',
    'abc123',
    'letmein',
    'welcome',
    'admin123',
    'senha123',
  ]
  if (senhasComuns.includes(senha.toLowerCase())) {
    erros.push('Esta senha é muito comum. Escolha uma mais segura.')
  }

  return {
    valido: erros.length === 0,
    erros,
  }
}

/**
 * Gera uma senha forte aleatória.
 * @param {number} tamanho - Tamanho da senha (padrão: 16)
 * @returns {string} Senha gerada
 */
export function gerarSenhaForte(tamanho = 16) {
  const letrasMaiusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const letrasMinusculas = 'abcdefghijklmnopqrstuvwxyz'
  const numeros = '0123456789'
  const especiais = '!@#$%^&*()_+-=[]{}|;:,.<>?'

  const todos = letrasMaiusculas + letrasMinusculas + numeros + especiais
  /* crypto, e nao Math.random: a senha temporaria e um segredo, e a
     sequencia do Math.random da para prever */
  const sorteio = (texto) => texto[crypto.randomInt(texto.length)]

  // Garante pelo menos um de cada tipo
  const letras = [
    sorteio(letrasMaiusculas),
    sorteio(letrasMinusculas),
    sorteio(numeros),
    sorteio(especiais),
  ]

  // Preenche o resto
  while (letras.length < tamanho) letras.push(sorteio(todos))

  // Embaralha (Fisher-Yates: o sort com aleatorio nao embaralha por igual)
  for (let i = letras.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[letras[i], letras[j]] = [letras[j], letras[i]]
  }
  return letras.join('')
}
