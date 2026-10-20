/**
 * Cria (ou atualiza) a conta da TELEVISAO da empresa — o "LWN Painel".
 *
 *   npm run db:painel -- email@lwnengenharia.com.br "SenhaDaTV"
 *
 * A conta entra no setor "Painel TV" (db/atualizacao-27.sql.txt):
 *
 *   - so abre a pagina inicial, sem o painel de graficos e sem o
 *     historico;
 *   - a pagina alterna Grade e Quadro sozinha, descendo a lista
 *     (src/pages/Home/useModoTv.js);
 *   - e o UNICO login que nao passa pelo Outlook: entra com e-mail e
 *     senha, e a sessao dura 30 dias, para a TV nao pedir login todo dia.
 *
 * Rodar de novo com o mesmo e-mail troca a senha e devolve a conta ao
 * setor da TV. Usa a mesma conexao da API (server/db.js, .env); para o
 * banco da nuvem, rode com o DATABASE_URL dele no ambiente.
 */
import bcrypt from 'bcryptjs'
import { pool, query } from '../db.js'
import { validarForcaSenha } from '../utils/senha.js'

const NOME = 'LWN Painel'

const email = String(process.argv[2] ?? '').trim().toLowerCase()
const senha = String(process.argv[3] ?? '')

if (!email || !senha) {
  console.error('Uso: npm run db:painel -- email@lwnengenharia.com.br "SenhaDaTV"')
  process.exit(1)
}
if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
  console.error('O e-mail não parece certo.')
  process.exit(1)
}
const forca = validarForcaSenha(senha)
if (!forca.valido) {
  console.error(`Senha fraca:\n  - ${forca.erros.join('\n  - ')}`)
  process.exit(1)
}

try {
  const setor = await query("SELECT id, nome FROM cargo WHERE chave = 'painel_tv' AND painel_tv")
  if (!setor.rows[0]) {
    console.error('O setor "Painel TV" não existe. Rode antes: npm run db:atualizar (atualização 27).')
    process.exit(1)
  }
  /* usuario.cargo guarda o NOME do setor, como o cadastro da tela grava */
  const { id: cargoId, nome: nomeSetor } = setor.rows[0]
  const hash = await bcrypt.hash(senha, 12)

  const existe = await query('SELECT id FROM usuario WHERE lower(email) = $1', [email])
  if (existe.rows[0]) {
    await query(
      `UPDATE usuario
          SET name = $1, senha_hash = $2, cargo_id = $3, cargo = $4,
              outlook = false, ativo = true, senha_temporaria = false
        WHERE id = $5`,
      [NOME, hash, cargoId, nomeSetor, existe.rows[0].id],
    )
    console.log(`\nConta ${email} atualizada: senha nova e setor "Painel TV".\n`)
  } else {
    await query(
      `INSERT INTO usuario (name, email, senha_hash, cargo_id, cargo, outlook, ativo, senha_temporaria)
       VALUES ($1, $2, $3, $4, $5, false, true, false)`,
      [NOME, email, hash, cargoId, nomeSetor],
    )
    console.log(`\nConta ${email} criada no setor "Painel TV".\n`)
  }
  console.log('Na TV: abra /core/login e entre com esse e-mail e a senha (sem o Outlook).\n')
} catch (erro) {
  console.error('Não foi possível criar a conta:', erro.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
