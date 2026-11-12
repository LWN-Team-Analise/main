/**
 * Pecas de sessao usadas por todas as rotas: quem esta falando, se ele
 * pode, e como transformar erro do Postgres em resposta util.
 */
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { query } from './db.js'
import { logger } from './logger.js'
/* a lista de permissoes e a MESMA da tela: um arquivo so, sem React
   dentro, importado pelos dois lados. Assim nao existe a chance de o
   servidor aceitar uma chave que a tela nao conhece (ou o contrario). */
import { normalizar, normalizarPessoais } from '../src/domain/permissoes.js'

export const SEGREDO = process.env.JWT_SECRET
if (!SEGREDO) {
  throw new Error('JWT_SECRET não está definido no ambiente. Defina esta variável de ambiente com uma string aleatória forte.')
}

/* ------------------------------------------------------------
   A SESSAO MORA NUM COOKIE QUE O JAVASCRIPT NAO LE

   O token ficava no localStorage: qualquer script que rodasse na pagina
   (uma falha de XSS, uma extensao, uma biblioteca comprometida) levava a
   sessao embora e usava de outro lugar ate ela vencer. Com HttpOnly, nem
   o proprio site consegue ler o token; ele so viaja nas chamadas.

     HttpOnly         o JavaScript nao enxerga
     Secure           so viaja em https
     SameSite=Strict  pedido que nasce em outro site vai sem o cookie
     __Host-          o navegador exige Secure, Path=/ e nenhum Domain,
                      entao um subdominio nao consegue plantar outro

   Em http://localhost o Secure e o __Host- ficam de fora: o Safari nao
   guarda cookie Secure fora de https, e o site nao abriria na maquina.
   ------------------------------------------------------------ */
export const PRODUCAO = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production'
export const COOKIE_DA_SESSAO = PRODUCAO ? '__Host-lwn_sessao' : 'lwn_sessao'
const OPCOES_DO_COOKIE = { httpOnly: true, secure: PRODUCAO, sameSite: 'strict', path: '/' }

/** O token do cookie da sessao, ou null. */
export function tokenDo(req) {
  const cabecalho = req.headers.cookie
  if (!cabecalho) return null
  for (const pedaco of cabecalho.split(';')) {
    const igual = pedaco.indexOf('=')
    if (igual > 0 && pedaco.slice(0, igual).trim() === COOKIE_DA_SESSAO) {
      return pedaco.slice(igual + 1).trim() || null
    }
  }
  return null
}

/**
 * Assina uma sessao nova e entrega no cookie. O `jti` e o numero dela: e
 * por ele que o "sair" derruba esta sessao e nao as outras.
 */
export function gravarSessao(res, { sub, senhaHash, expira }) {
  const token = jwt.sign({ sub, sh: marcaDaSenha(senhaHash), jti: crypto.randomUUID() }, SEGREDO, {
    expiresIn: expira,
    algorithm: 'HS256',
  })
  const { exp } = jwt.decode(token)
  res.cookie(COOKIE_DA_SESSAO, token, { ...OPCOES_DO_COOKIE, maxAge: Math.max(0, exp * 1000 - Date.now()) })
}

export function apagarSessao(res) {
  res.clearCookie(COOKIE_DA_SESSAO, OPCOES_DO_COOKIE)
}

/** O token foi assinado por este servidor e ainda vale? Nao olha o banco. */
export function tokenAssinado(token) {
  if (!token) return false
  try {
    jwt.verify(token, SEGREDO, { algorithms: ['HS256'] })
    return true
  } catch {
    return false
  }
}

/**
 * Marca a sessao como encerrada ate o prazo dela. Sem isso, sair da conta
 * so apagava a copia do navegador, e quem tivesse copiado o token seguia
 * entrando. As linhas vencidas saem aqui mesmo: depois do prazo o token
 * ja nao vale por si.
 */
export async function revogarSessao(jti, exp) {
  try {
    await query(
      'INSERT INTO sessao_revogada (jti, expira_em) VALUES ($1, to_timestamp($2)) ON CONFLICT (jti) DO NOTHING',
      [jti, exp],
    )
    await query('DELETE FROM sessao_revogada WHERE expira_em < now()')
  } catch (erro) {
    /* atualizacao 49 ainda nao rodou: sair continua funcionando no navegador */
    if (erro.code !== '42P01') throw erro
    logger.error('sessao/revogar', 'tabela sessao_revogada ausente: rode a atualizacao 49')
  }
}

/* A conta do token e se esta sessao ja foi encerrada, numa ida so ao banco.
   Sem a tabela (atualizacao 49 pendente) o site continua de pe e o "sair"
   vale so para o navegador, ate o banco ser atualizado. */
async function contaDaSessao(sub, jti) {
  try {
    const { rows } = await query(
      `SELECT u.ativo, u.senha_hash,
              EXISTS (SELECT 1 FROM sessao_revogada r WHERE r.jti = $2) AS revogada
         FROM usuario u WHERE u.id = $1`,
      [sub, jti],
    )
    return rows[0]
  } catch (erro) {
    if (erro.code !== '42P01') throw erro
    const { rows } = await query('SELECT ativo, senha_hash FROM usuario WHERE id = $1', [sub])
    return rows[0]
  }
}

/**
 * A impressao curta do hash da senha. Vai dentro do token de sessao
 * (`sh`): quando a senha muda, o hash muda, e todo token emitido com a
 * senha antiga deixa de valer — inclusive o de quem roubou a sessao.
 */
export const marcaDaSenha = (hash) =>
  crypto.createHash('sha256').update(String(hash ?? '')).digest('base64url').slice(0, 16)

/**
 * O dono de um token de SESSAO, conferido no banco — ou null.
 *
 * So a assinatura nao basta:
 *
 *   - o token do "esqueci minha senha" (`uso: 'redefinir'`) e assinado
 *     com o mesmo segredo, e sem esta trava ele abria todas as rotas;
 *   - colaborador desativado continuava entrando com o token que ja
 *     tinha, ate ele vencer (8 horas);
 *   - trocar a senha nao derrubava a sessao aberta em outro aparelho;
 *   - sair da conta nao encerrava nada no servidor.
 *
 * Token sem `jti` e da epoca do localStorage: so serve uma vez, para ser
 * trocado pelo cookie em /api/auth/migrar.
 */
export async function donoDoToken(token) {
  if (!token) return null
  let dono
  try {
    dono = jwt.verify(token, SEGREDO, { algorithms: ['HS256'] })
  } catch {
    return null
  }
  if (dono.uso || !dono.sub || !dono.jti) return null

  const conta = await contaDaSessao(dono.sub, dono.jti)
  if (!conta || conta.ativo === false || conta.revogada) return null
  if (dono.sh !== marcaDaSenha(conta.senha_hash)) return null
  return dono
}

/**
 * Toda rota protegida passa por aqui. Deixa o dono em req.dono.
 *
 * O `sessao: false` na resposta e o que diz a tela "a sessao morreu,
 * mande a pessoa entrar de novo". Ele existe porque 401 sozinho nao
 * basta: a troca de senha tambem devolve 401 quando a senha atual esta
 * errada, e ali derrubar a sessao seria o pior a fazer — a pessoa
 * perderia o que estava mexendo por causa de um erro de digitacao.
 */
export async function exigeSessao(req, res, next) {
  let dono
  try {
    dono = await donoDoToken(tokenDo(req))
  } catch (erro) {
    return tratar(erro, res, 'sessao/token')
  }
  if (!dono) {
    return res.status(401).json({ erro: 'Sessão expirada. Entre de novo.', sessao: false })
  }
  req.dono = dono
  return next()
}

/** Tabela que ainda nao existe vira recado, nao 500. */
export function tratar(erro, res, onde) {
  if (erro.code === '42P01' || erro.code === '42703') {
    return res.status(503).json({
      erro:
        'O banco ainda não tem as tabelas novas. Rode, na ordem, os arquivos de db/: ' +
        'atualizacao.sql.txt, atualizacao-2.sql.txt, atualizacao-3.sql.txt, ' +
        'atualizacao-4.sql.txt e atualizacao-5.sql.txt. Ou, de uma vez: npm run db:atualizar.',
    })
  }
  /* id que nao e numero, data que nao existe: o pedido e que veio errado,
     e isso nao e erro do servidor */
  if (['22P02', '22007', '22008', '22003'].includes(erro.code)) {
    return res.status(400).json({ erro: 'Dados inválidos.' })
  }
  logger.error(onde, erro.message, { code: erro.code })
  return res.status(500).json({ erro: 'Não foi possível completar a operação.' })
}

/**
 * O cargo de quem esta logado — chave, nome, se manda em tudo e a
 * lista de permissoes marcadas nele.
 *
 * A coluna cargo.permissoes so existe depois de db/atualizacao.sql.txt.
 * Enquanto ela nao existe, a consulta cai na versao sem ela e o sistema
 * continua de pe (so o acesso_total decide).
 */
export async function meuCargo(usuarioId) {
  let rows
  try {
    ;({ rows } = await query(
      `SELECT c.chave, c.nome, c.acesso_total, c.permissoes
         FROM usuario u LEFT JOIN cargo c ON c.id = u.cargo_id
        WHERE u.id = $1`,
      [usuarioId],
    ))
  } catch (erro) {
    if (erro.code !== '42703' && erro.code !== '42P01') throw erro
    ;({ rows } = await query(
      `SELECT c.chave, c.nome, c.acesso_total
         FROM usuario u LEFT JOIN cargo c ON c.id = u.cargo_id
        WHERE u.id = $1`,
      [usuarioId],
    ))
  }

  return {
    chave: rows[0]?.chave ?? null,
    nome: rows[0]?.nome ?? null,
    acessoTotal: rows[0]?.acesso_total ?? false,
    permissoes: normalizar(rows[0]?.permissoes ?? []),
  }
}

/** Setor com acesso total (diretoria) passa por qualquer permissao. */
export function cargoPode(cargo, chave) {
  if (!cargo) return false
  if (cargo.acessoTotal) return true
  return (cargo.permissoes ?? []).includes(chave)
}

/**
 * Trava de rota por permissao. A tela ja esconde o botao; isto aqui e
 * o que impede alguem de chamar a API na mao.
 *
 *   router.post('/x', exigeSessao, exige('editar_obras'), handler)
 */
export function exige(chave) {
  return async function checar(req, res, next) {
    try {
      const cargo = await meuCargo(req.dono.sub)
      if (!cargoPode(cargo, chave)) {
        return res.status(403).json({ erro: 'Seu setor não tem permissão para esta ação.' })
      }
      req.cargo = cargo
      return next()
    } catch (erro) {
      return tratar(erro, res, 'sessao/permissao')
    }
  }
}

/**
 * As permissoes da PESSOA (atualizacao 53): colocar informacoes no quadro
 * de avisos e na agenda da pagina inicial. Nao sao do setor, e o acesso
 * total nao passa por elas (ver PESSOAIS em src/domain/permissoes.js).
 * Banco sem a coluna: vale a `enviar_avisos` do setor, como antes.
 */
export async function podePessoal(usuarioId, chave) {
  try {
    const { rows } = await query('SELECT permissoes_pessoais FROM usuario WHERE id = $1', [usuarioId])
    return normalizarPessoais(rows[0]?.permissoes_pessoais).includes(chave)
  } catch (erro) {
    if (erro.code !== '42703') throw erro
    return cargoPode(await meuCargo(usuarioId), 'enviar_avisos')
  }
}

/** A trava de rota das permissoes da pessoa, como `exige` e para as do setor. */
export function exigePessoal(chave) {
  return async function checar(req, res, next) {
    try {
      if (!(await podePessoal(req.dono.sub, chave))) {
        return res.status(403).json({ erro: 'Você não tem permissão para esta ação.' })
      }
      return next()
    } catch (erro) {
      return tratar(erro, res, 'sessao/permissao-pessoal')
    }
  }
}

/**
 * Quem edita o roteiro e os cadastros do quadro: cargo com acesso
 * total. Continua existindo para as rotas que sao mesmo de diretoria.
 */
export async function exigeAcessoTotal(req, res, next) {
  try {
    const { acessoTotal } = await meuCargo(req.dono.sub)
    if (!acessoTotal) {
      return res.status(403).json({ erro: 'Seu setor não tem permissão para esta alteração.' })
    }
    return next()
  } catch (erro) {
    return tratar(erro, res, 'sessao/acesso')
  }
}
