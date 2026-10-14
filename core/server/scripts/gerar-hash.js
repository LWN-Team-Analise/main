/**
 * Gera o hash bcrypt de uma senha, para usar direto no SQL.
 *
 *   npm run db:senha -- "MinhaSenhaForte"
 */
import bcrypt from 'bcryptjs'

const senha = process.argv[2]

if (!senha) {
  console.error('Uso: npm run db:senha -- "SuaSenha"')
  process.exit(1)
}

const hash = await bcrypt.hash(senha, 12)
console.log(hash)
