/**
 * LIMITE DE TENTATIVAS — o freio do login, do "esqueci minha senha" e
 * da sugestao do bot.
 *
 * Cada tentativa vira uma linha em `tentativa_acesso` (atualizacao 21)
 * com uma chave ("login:fulano@empresa.com", "login-ip:200.1.2.3"), e
 * o limite e "no maximo N linhas da chave nos ultimos M minutos".
 *
 * Mora no banco, e nao na memoria, porque na Vercel cada chamada pode
 * cair numa copia nova da funcao — um contador em memoria zeraria a
 * cada copia, e o freio nao freava nada.
 *
 * Banco sem a tabela (atualizacao 21 ainda nao rodou): o freio fica
 * desligado e o resto funciona. Login nenhum pode cair por causa dele.
 */
import { query } from './db.js'
import { logger } from './logger.js'

const SEM_TABELA = '42P01'

/**
 * O IP de quem chamou, ou null quando nao da para saber com seguranca.
 *
 * Na Vercel, o x-forwarded-for e escrito pela PROPRIA Vercel (o que o
 * cliente mandar nesse cabecalho e sobrescrito). Na maquina, sem nada
 * na frente, vale o endereco da conexao. Atras de um proxy que nao e a
 * Vercel o cabecalho poderia ser inventado pelo cliente, e o endereco
 * da conexao seria o do proxy — o mesmo para todo mundo, e um limite
 * por IP ali travaria a empresa inteira. Nesse caso: null, e o limite
 * por IP nao se aplica (o limite por conta continua).
 */
export function ipDe(req) {
  const repassado = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  if (process.env.VERCEL) return repassado || null
  if (repassado) return null
  return req.socket?.remoteAddress ?? null
}

/** Quantas tentativas a chave teve nos ultimos `minutos`. */
export async function tentativas(chave, minutos) {
  if (!chave) return 0
  try {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM tentativa_acesso
        WHERE chave = $1 AND criada_em > now() - make_interval(mins => $2)`,
      [chave, minutos],
    )
    return rows[0].n
  } catch (erro) {
    if (erro.code === SEM_TABELA) return 0
    throw erro
  }
}

/** Passou do limite? `limites` = [{ chave, maximo, minutos }]; chave null e pulada. */
export async function estourou(limites) {
  for (const { chave, maximo, minutos } of limites) {
    if (chave && (await tentativas(chave, minutos)) >= maximo) return true
  }
  return false
}

/** Anota uma tentativa em cada chave (as null sao puladas). */
export async function anotar(...chaves) {
  const validas = chaves.filter(Boolean)
  if (validas.length === 0) return
  try {
    await query('INSERT INTO tentativa_acesso (chave) SELECT unnest($1::text[])', [validas])
    /* a faxina: de vez em quando, o que passou de um dia sai */
    if (Math.random() < 0.05) {
      await query("DELETE FROM tentativa_acesso WHERE criada_em < now() - interval '1 day'")
    }
  } catch (erro) {
    if (erro.code === SEM_TABELA) return
    logger.error('limite/anotar', erro.message, { code: erro.code })
  }
}

/** Esquece as tentativas da chave (o login certo zera as falhas da conta). */
export async function esquecer(chave) {
  if (!chave) return
  await query('DELETE FROM tentativa_acesso WHERE chave = $1', [chave]).catch((erro) => {
    if (erro.code !== SEM_TABELA) logger.error('limite/esquecer', erro.message, { code: erro.code })
  })
}

/** 'Fulano@Empresa.com' e '123.456.789-09' viram a mesma chave de sempre. */
export function chaveDaConta(identificador) {
  const bruto = String(identificador ?? '').trim().toLowerCase()
  if (!bruto) return null
  return bruto.includes('@') ? bruto : bruto.replace(/\D/g, '') || bruto
}
