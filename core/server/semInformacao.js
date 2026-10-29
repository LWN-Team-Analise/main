/**
 * O CHECK CONCLUIDO SEM A INFORMACAO (atualizacao 36).
 *
 * O setor com a permissao `check_sem_informacao` conclui o check que
 * pede informacao (a resposta Sim/Nao, o horario, os ensaios, o prazo
 * da execucao, a proposta tecnica, a reserva e a retirada do carro) sem
 * preenche-la. A linha de obra_check fica com `sem_informacao = true`,
 * e e essa marca que:
 *
 *   - a tela mostra no check ("sem informação");
 *   - impede o sistema de reabrir sozinho os checks dos ensaios
 *     (conferirEnsaios, em routes/dados.js);
 *   - deixa desmarcar os checks do sistema que normalmente so
 *     acompanham outra coisa (o prazo da execucao, a reserva e a
 *     retirada do carro).
 *
 * A marca sai quando a informacao chega pelo caminho de sempre: a
 * resposta, o horario, o prazo, os ensaios, a reserva, a retirada.
 *
 * A coluna so existe depois de db/atualizacao-36.sql.txt. Sem ela nada
 * aqui quebra: `temSemInformacao` responde false e o resto nao faz nada.
 */
import { pool } from './db.js'

/* uma vez criada, a coluna nao some: o "sim" fica guardado, o "nao" e
   perguntado de novo (a atualizacao pode rodar com a API no ar) */
let existe = false

/**
 * true quando o banco ja tem obra_check.sem_informacao.
 *
 * Pergunta ao catalogo em vez de tentar e pegar o erro: dentro de uma
 * transacao, um erro anularia a transacao inteira.
 */
export async function temSemInformacao(db = pool) {
  if (existe) return true
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'obra_check'
                       AND column_name = 'sem_informacao') AS ok`,
  )
  existe = rows[0]?.ok === true
  return existe
}

/**
 * A informacao do check chegou: tira a marca de "sem informacao" dele
 * nesta obra, se ele tinha. Serve dentro de transacao tambem: ai `db` e
 * o cliente dela.
 */
export async function informacaoChegou(obraId, checkId, db = pool) {
  if (!checkId || !(await temSemInformacao(db))) return
  await db.query(
    'UPDATE obra_check SET sem_informacao = false WHERE obra_id = $1 AND check_id = $2 AND sem_informacao',
    [obraId, checkId],
  )
}

/** true quando ESTE check foi concluido sem a informacao nesta obra. */
export async function concluidoSemInformacao(obraId, checkId) {
  if (!(await temSemInformacao())) return false
  const { rows } = await pool.query('SELECT sem_informacao FROM obra_check WHERE obra_id = $1 AND check_id = $2', [
    obraId,
    checkId,
  ])
  return rows[0]?.sem_informacao === true
}
