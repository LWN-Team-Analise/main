import crypto from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../db.js'
import { donoDoToken, marcaDaSenha, SEGREDO, tokenDo } from '../sessao.js'
import { anotar, chaveDaConta, esquecer, estourou, ipDe } from '../limite.js'
import { enviarCodigo, temEmail } from '../email.js'
import { configurado as temOutlook, perfilDoCodigo, urlDeEntrada } from '../outlook.js'
import { normalizar } from '../../src/domain/permissoes.js'
import { regraDoUsuario } from '../../src/domain/regrasCheck.js'
import { logger } from '../logger.js'
import { validarForcaSenha } from '../utils/senha.js'
import { registrarAtividade } from '../atividade.js'
import { avisarSenhaPadrao } from '../avisosConta.js'

const router = Router()

const EXPIRA = process.env.JWT_EXPIRES || '8h'
const EXPIRA_TV = '30d'

/** O codigo do "esqueci minha senha" vale 3 minutos, como pedido. */
const MINUTOS_DO_CODIGO = 3
/** Depois de cinco palpites errados, o codigo morre. */
const TENTATIVAS_MAXIMAS = 5

/* O freio da forca bruta (server/limite.js). A janela e de 15 minutos:
   oito senhas erradas numa conta travam aquela conta; quarenta vindas
   do mesmo endereco travam o endereco — e o que pega quem testa uma
   senha em muitas contas. */
const JANELA = 15
const ERROS_POR_CONTA = 8
const ERROS_POR_IP = 40
const CODIGOS_POR_CONTA = 3
const CODIGOS_POR_IP = 10
const PALPITES_POR_IP = 20
const MUITAS = 'Muitas tentativas. Aguarde 15 minutos e tente de novo.'

/* hash de uma senha que ninguem tem: a conta que NAO existe tambem paga
   o bcrypt, e o tempo da resposta deixa de dizer quem esta cadastrado */
const HASH_VAZIO = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12)

const soDigitos = (valor) => String(valor ?? '').replace(/\D/g, '')
const texto = (valor) => String(valor ?? '').trim()

/** Converte a linha do banco no formato que o front consome. */
function paraUsuario(linha) {
  return {
    id: linha.id,
    name: linha.name,
    email: linha.email,
    cpf: linha.cpf,
    dataNascimento: linha.data_nascimento,
    telefone: linha.telefone,
    /* `cargo` aqui e o SETOR (a tabela cargo, onde moram as permissoes);
       o cargo especifico da pessoa vem em cargoTitulo, logo abaixo */
    cargo: linha.cargo,
    permissoes: linha.permissoes ?? [],
    avaliacao: linha.avaliacao === null ? null : Number(linha.avaliacao),
    outlook: linha.outlook ?? false,
    outlookEmail: linha.outlook_email ?? null,
    foto: linha.foto ?? null,
    // o cargo vem da tabela cargo (db/sistema.sql.txt): e dele que saem a
    // cor das etiquetas e a permissao de editar etapa de outro setor
    cargoId: linha.cargo_id ? String(linha.cargo_id) : null,
    cargoChave: linha.cargo_chave ?? null,
    cargoNome: linha.cargo_nome ?? linha.cargo,
    cargoCor: linha.cargo_cor ?? null,
    // "Analista de Qualidade" — texto livre, nao decide permissao nenhuma
    cargoTitulo: linha.cargo_titulo ?? '',
    cargoTituloId: linha.cargo_titulo_id ? String(linha.cargo_titulo_id) : null,
    // o que o cargo (ou a propria pessoa) marca dentro do setor: a partir de
    // que etapa e quais checks ficam de fora (atualizacao 37). null = todos
    regraCheck: regraDoUsuario(linha.cargo_regras_check, linha.id, linha.cargo_titulo_id),
    // com a atualizacao 37, o check e so de quem esta na obra (ou do setor
    // com check_todas_obras); sem ela, vale so o setor, como antes
    checkSoNaObra: linha.cargo_regras_check !== null && linha.cargo_regras_check !== undefined,
    acessoTotal: linha.acesso_total ?? false,
    // o que o cargo pode fazer; e por esta lista que o menu e os botoes
    // se escondem (db/atualizacao.sql.txt cria a coluna)
    cargoPermissoes: normalizar(linha.cargo_permissoes ?? []),
    // true = ainda esta com a senha padrao; a tela obriga a trocar no primeiro acesso
    senhaTemporaria: linha.senha_temporaria ?? false,
    // setor da TV da empresa (atualizacao 27): tela inicial que se troca
    // sozinha, e o unico login que nao passa pelo Outlook
    painelTv: linha.painel_tv === true,
    // cadastrado so pelo e-mail: falta a pessoa completar nome, nascimento e CPF
    cadastroPendente: !linha.cpf,
  }
}

const CAMPOS_BASE = `u.id, u.name, u.email, u.cpf, u.data_nascimento, u.telefone,
                     u.cargo, u.permissoes, u.avaliacao, u.outlook, u.senha_hash, u.ativo,
                     u.senha_temporaria`

const CAMPOS_CARGO = `, u.foto, u.cargo_id, u.cargo_titulo, u.outlook_email,
                      c.chave AS cargo_chave, c.nome AS cargo_nome,
                      c.cor AS cargo_cor, c.acesso_total,
                      c.permissoes AS cargo_permissoes,
                      (to_jsonb(u) ->> 'cargo_titulo_id') AS cargo_titulo_id,
                      (to_jsonb(c) -> 'regras_check') AS cargo_regras_check,
                      (to_jsonb(c) ->> 'painel_tv')::boolean AS painel_tv`

/**
 * Busca o usuario ja com o cargo. Se db/sistema.sql.txt ainda nao foi
 * rodado, a tabela cargo (ou a coluna cargo_id) nao existe: o Postgres
 * devolve 42P01/42703 e caimos na consulta simples, sem cargo. Assim o
 * login continua funcionando em quem so rodou a PARTE 1.
 */
async function buscarUsuario(condicao, valores) {
  try {
    return await query(
      `SELECT ${CAMPOS_BASE}${CAMPOS_CARGO}
         FROM usuario u LEFT JOIN cargo c ON c.id = u.cargo_id
        WHERE ${condicao} LIMIT 1`,
      valores,
    )
  } catch (erro) {
    if (erro.code !== '42P01' && erro.code !== '42703') throw erro
    return query(`SELECT ${CAMPOS_BASE} FROM usuario u WHERE ${condicao} LIMIT 1`, valores)
  }
}

/**
 * O token de sessao. O `sh` e a marca da senha (server/sessao.js):
 * trocar a senha derruba todo token emitido com a antiga.
 */
function tokenDeSessao(id, senhaHash, expira = EXPIRA) {
  return jwt.sign({ sub: id, sh: marcaDaSenha(senhaHash) }, SEGREDO, {
    expiresIn: expira,
    algorithm: 'HS256',
  })
}

/** Monta o token e carimba o ultimo acesso. */
async function abrirSessao(linha) {
  const usuario = paraUsuario(linha)
  /* a TV fica ligada dias seguidos, sem ninguem para entrar de novo a
     cada 8 horas; a conta dela so ve a pagina inicial */
  const token = tokenDeSessao(usuario.id, linha.senha_hash, usuario.painelTv ? EXPIRA_TV : EXPIRA)
  await query('UPDATE usuario SET ultimo_acesso = now() WHERE id = $1', [usuario.id])
  return { token, user: usuario }
}

/** POST /api/auth/login — aceita e-mail ou CPF no mesmo campo. */
router.post('/login', async (req, res) => {
  const identificador = String(req.body?.identifier ?? '').trim()
  const senha = String(req.body?.password ?? '')

  if (!identificador || !senha) {
    return res.status(400).json({ erro: 'Informe seu e-mail ou CPF e a senha.' })
  }

  const contaChave = `login:${chaveDaConta(identificador)}`
  const ip = ipDe(req)
  const ipChave = ip ? `login-ip:${ip}` : null

  try {
    if (
      await estourou([
        { chave: contaChave, maximo: ERROS_POR_CONTA, minutos: JANELA },
        { chave: ipChave, maximo: ERROS_POR_IP, minutos: JANELA },
      ])
    ) {
      return res.status(429).json({ erro: MUITAS })
    }

    const { rows } = await buscarUsuario(
      'lower(u.email) = lower($1) OR u.cpf = $2',
      [identificador, soDigitos(identificador)],
    )

    const linha = rows[0]
    // mensagem unica para usuario inexistente e senha errada: nao entrega
    // ao atacante a informacao de qual e-mail/CPF existe no sistema
    const generica = 'E-mail/CPF ou senha incorretos.'

    /* a senha e conferida ANTES de qualquer outra resposta, e a conta
       que nao existe compara com um hash qualquer: nem o tempo nem o
       "acesso desativado" contam a quem nao sabe a senha que a conta
       existe */
    const confere = await bcrypt.compare(senha, linha?.senha_hash || HASH_VAZIO)
    if (!linha || !linha.senha_hash || !confere) {
      await anotar(contaChave, ipChave)
      return res.status(401).json({ erro: generica })
    }

    if (linha.ativo === false) {
      return res.status(403).json({ erro: 'Este acesso está desativado. Fale com o administrador.' })
    }

    await esquecer(contaChave)
    return res.json(await abrirSessao(linha))
  } catch (erro) {
    if (erro.code === '42P01') {
      return res
        .status(503)
        .json({ erro: 'A tabela "usuario" ainda não existe no banco. Rode o SQL de db/usuario.sql.txt.' })
    }
    logger.error('auth/login', erro.message)
    return res.status(500).json({ erro: 'Não foi possível entrar agora. Tente de novo.' })
  }
})

/** GET /api/auth/me — devolve o usuario do token. */
router.get('/me', async (req, res) => {
  const token = tokenDo(req)
  if (!token) return res.status(401).json({ erro: 'Sessão não informada.', sessao: false })

  try {
    const dono = await donoDoToken(token)
    if (!dono) return res.status(401).json({ erro: 'Sessão expirada. Entre de novo.', sessao: false })
    const { rows } = await buscarUsuario('u.id = $1', [dono.sub])
    if (!rows[0]) return res.status(401).json({ erro: 'Sessão inválida.', sessao: false })
    return res.json({ user: paraUsuario(rows[0]) })
  } catch (erro) {
    logger.error('auth/me', erro.message)
    return res.status(503).json({ erro: 'Não foi possível conferir a sessão agora.' })
  }
})

/**
 * POST /api/auth/senha — troca a propria senha.
 *
 * E por onde o colaborador novo sai da senha temporária: ao trocar,
 * senha_temporaria vira false e a tela para de cobrar.
 */
router.post('/senha', async (req, res) => {
  const token = tokenDo(req)
  if (!token) return res.status(401).json({ erro: 'Sessão não informada.', sessao: false })

  const atual = String(req.body?.atual ?? '')
  const nova = String(req.body?.nova ?? '')

  if (nova.length < 6) return res.status(400).json({ erro: 'A nova senha precisa de 6 caracteres ou mais.' })
  if (nova === atual) return res.status(400).json({ erro: 'A nova senha precisa ser diferente da atual.' })

  // Validação de força de senha
  const validacao = validarForcaSenha(nova)
  if (!validacao.valido) {
    return res.status(400).json({
      erro: 'A senha não atende aos requisitos de segurança.',
      detalhes: validacao.erros,
    })
  }

  try {
    const dono = await donoDoToken(token)
    if (!dono) return res.status(401).json({ erro: 'Sessão expirada. Entre de novo.', sessao: false })
    const { sub } = dono
    const { rows } = await query('SELECT senha_hash FROM usuario WHERE id = $1', [sub])
    if (!rows[0]) return res.status(401).json({ erro: 'Sessão inválida.', sessao: false })

    const confere = await bcrypt.compare(atual, rows[0].senha_hash)
    if (!confere) return res.status(401).json({ erro: 'A senha atual não confere.' })

    const hash = await bcrypt.hash(nova, 12)
    await query('UPDATE usuario SET senha_hash = $1, senha_temporaria = false WHERE id = $2', [
      hash,
      sub,
    ])
    await registrarAtividade(sub, {
      acao: 'senha.alterada',
      categoria: 'conta',
      entidade: ['usuario', sub],
      descricao: 'Senha alterada',
    })
    /* a senha nova derruba as sessoes abertas com a antiga — inclusive
       esta. O token novo volta junto para quem trocou nao cair. */
    return res.json({ ok: true, token: tokenDeSessao(sub, hash) })
  } catch (erro) {
    if (erro.name === 'JsonWebTokenError' || erro.name === 'TokenExpiredError') {
      return res.status(401).json({ erro: 'Sessão expirada. Entre de novo.', sessao: false })
    }
    // o usuario id=1 e protegido por gatilho: a troca de senha e uma alteracao de conteudo
    if (erro.message?.includes('protegido')) {
      return res.status(409).json({
        erro: 'Este usuário está protegido no banco. Troque a senha pelo SQL, com SET LOCAL app.desbloqueio.',
      })
    }
    logger.error('auth/senha', erro.message)
    return res.status(500).json({ erro: 'Não foi possível trocar a senha agora.' })
  }
})

/* ============================================================
   ESQUECI MINHA SENHA

   Tres passos, e a tela caminha por eles sem sair do pop-up:

     1. /recuperar  — informa e-mail ou CPF; sai um codigo por e-mail
     2. /codigo     — confere o codigo e devolve uma permissao curta
     3. /redefinir  — com essa permissao, grava a senha nova

   Duas decisoes de seguranca que valem explicar:

   - o passo 1 responde SEMPRE a mesma coisa, exista ou nao a conta.
     Se respondesse diferente, qualquer um descobriria quais e-mails
     estao cadastrados so testando um por um.
   - o codigo nunca e guardado como esta: vai o hash. Quem lesse a
     tabela nao conseguiria entrar na conta de ninguem.
   ============================================================ */

/* crypto, e nao Math.random: o Math.random nao e feito para segredo, e
   da para prever a sequencia dele a partir de saidas anteriores */
const seisDigitos = () => String(crypto.randomInt(100000, 1000000))

router.post('/recuperar', async (req, res) => {
  const identificador = texto(req.body?.identificador)
  if (!identificador) {
    return res.status(400).json({ erro: 'Informe seu e-mail ou CPF.' })
  }

  /* a resposta e a mesma para conta que existe e conta que nao existe —
     inclusive sem o e-mail mascarado, que so a conta que existe tinha e
     por isso respondia "existe" para quem estivesse testando */
  const resposta = {
    ok: true,
    validoPor: MINUTOS_DO_CODIGO * 60,
    recado: 'Se essa conta existir, o código chega em instantes no e-mail cadastrado.',
  }

  if (!temEmail()) {
    return res.status(503).json({
      erro: 'O envio de e-mail não está configurado no servidor. Fale com a diretoria.',
    })
  }

  /* cada pedido manda um e-mail de verdade: sem freio, dava para
     encher a caixa de alguem de codigos */
  const contaChave = `recuperar:${chaveDaConta(identificador)}`
  const ip = ipDe(req)
  const ipChave = ip ? `recuperar-ip:${ip}` : null

  try {
    if (
      await estourou([
        { chave: contaChave, maximo: CODIGOS_POR_CONTA, minutos: JANELA },
        { chave: ipChave, maximo: CODIGOS_POR_IP, minutos: JANELA },
      ])
    ) {
      return res.status(429).json({ erro: 'Muitos pedidos de código. Aguarde 15 minutos e tente de novo.' })
    }
    await anotar(contaChave, ipChave)

    const { rows } = await query(
      `SELECT id, name, email FROM usuario
        WHERE ativo AND (lower(email) = lower($1) OR cpf = $2) LIMIT 1`,
      [identificador, soDigitos(identificador)],
    )
    const pessoa = rows[0]
    if (!pessoa) return res.json(resposta)

    // pedido novo invalida o anterior: so o ultimo codigo funciona
    await query(
      `UPDATE senha_codigo SET usado_em = now()
        WHERE usuario_id = $1 AND usado_em IS NULL`,
      [pessoa.id],
    )

    const codigo = seisDigitos()
    await query(
      `INSERT INTO senha_codigo (usuario_id, codigo_hash, expira_em)
       VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [pessoa.id, await bcrypt.hash(codigo, 10), String(MINUTOS_DO_CODIGO)],
    )

    const envio = await enviarCodigo({
      para: pessoa.email,
      nome: pessoa.name,
      codigo,
      minutos: MINUTOS_DO_CODIGO,
    })
    if (!envio.ok) {
      /* a falha fica no log; a resposta continua a mesma, senao ela
         diria que a conta existe */
      logger.error('auth/recuperar', `envio falhou: ${envio.motivo}`)
    }
    return res.json(resposta)
  } catch (erro) {
    if (erro.code === '42P01') {
      return res.status(503).json({
        erro: 'O banco ainda não tem a tabela de códigos. Rode o SQL de db/atualizacao.sql.txt.',
      })
    }
    logger.error('auth/recuperar', erro.message)
    return res.status(500).json({ erro: 'Não foi possível enviar o código agora.' })
  }
})

router.post('/codigo', async (req, res) => {
  const identificador = texto(req.body?.identificador)
  const codigo = soDigitos(req.body?.codigo)

  if (codigo.length !== 6) return res.status(400).json({ erro: 'O código tem 6 dígitos.' })

  /* cada codigo morre em 5 palpites; o freio por endereco pega quem
     tenta muitos codigos (de muitas contas) seguidos */
  const ip = ipDe(req)
  const ipChave = ip ? `codigo-ip:${ip}` : null

  try {
    if (await estourou([{ chave: ipChave, maximo: PALPITES_POR_IP, minutos: JANELA }])) {
      return res.status(429).json({ erro: MUITAS })
    }
    const pessoa = await query(
      `SELECT id FROM usuario
        WHERE ativo AND (lower(email) = lower($1) OR cpf = $2) LIMIT 1`,
      [identificador, soDigitos(identificador)],
    )
    if (!pessoa.rows[0]) return res.status(400).json({ erro: 'Código inválido ou expirado.' })

    const { rows } = await query(
      `SELECT id, codigo_hash, tentativas FROM senha_codigo
        WHERE usuario_id = $1 AND usado_em IS NULL AND expira_em > now()
        ORDER BY criado_em DESC LIMIT 1`,
      [pessoa.rows[0].id],
    )
    const guardado = rows[0]
    if (!guardado) {
      return res.status(400).json({ erro: 'Código expirado. Peça um novo.' })
    }
    if (guardado.tentativas >= TENTATIVAS_MAXIMAS) {
      await query('UPDATE senha_codigo SET usado_em = now() WHERE id = $1', [guardado.id])
      return res.status(429).json({ erro: 'Muitas tentativas. Peça um código novo.' })
    }

    const confere = await bcrypt.compare(codigo, guardado.codigo_hash)
    if (!confere) {
      await anotar(ipChave)
      await query('UPDATE senha_codigo SET tentativas = tentativas + 1 WHERE id = $1', [
        guardado.id,
      ])
      return res.status(400).json({ erro: 'Código incorreto.' })
    }

    /* permissao curta para o ultimo passo: 10 minutos, e so serve para
       redefinir a senha (o `uso` no token impede reaproveitar em /me) */
    const permissao = jwt.sign(
      { sub: pessoa.rows[0].id, uso: 'redefinir', cod: guardado.id },
      SEGREDO,
      { expiresIn: '10m', algorithm: 'HS256' },
    )
    return res.json({ ok: true, permissao })
  } catch (erro) {
    if (erro.code === '42P01') {
      return res.status(503).json({
        erro: 'O banco ainda não tem a tabela de códigos. Rode o SQL de db/atualizacao.sql.txt.',
      })
    }
    logger.error('auth/codigo', erro.message)
    return res.status(500).json({ erro: 'Não foi possível conferir o código agora.' })
  }
})

router.post('/redefinir', async (req, res) => {
  const permissao = texto(req.body?.permissao)
  const nova = String(req.body?.nova ?? '')

  if (nova.length < 6) {
    return res.status(400).json({ erro: 'A nova senha precisa de 6 caracteres ou mais.' })
  }

  // Validação de força de senha
  const validacao = validarForcaSenha(nova)
  if (!validacao.valido) {
    return res.status(400).json({
      erro: 'A senha não atende aos requisitos de segurança.',
      detalhes: validacao.erros,
    })
  }

  try {
    const dono = jwt.verify(permissao, SEGREDO, { algorithms: ['HS256'] })
    if (dono.uso !== 'redefinir') {
      return res.status(401).json({ erro: 'Permissão inválida. Recomece a recuperação.' })
    }

    const codigo = await query(
      'SELECT id FROM senha_codigo WHERE id = $1 AND usado_em IS NULL',
      [dono.cod],
    )
    if (!codigo.rows[0]) {
      return res.status(400).json({ erro: 'Este código já foi usado. Peça um novo.' })
    }

    const hash = await bcrypt.hash(nova, 12)
    await query(
      'UPDATE usuario SET senha_hash = $1, senha_temporaria = false WHERE id = $2',
      [hash, dono.sub],
    )
    await query('UPDATE senha_codigo SET usado_em = now() WHERE id = $1', [dono.cod])
    await registrarAtividade(dono.sub, {
      acao: 'senha.redefinida',
      categoria: 'conta',
      entidade: ['usuario', dono.sub],
      descricao: 'Senha redefinida pelo código do e-mail',
    })

    return res.json({ ok: true })
  } catch (erro) {
    if (erro.name === 'JsonWebTokenError' || erro.name === 'TokenExpiredError') {
      return res.status(401).json({ erro: 'O tempo acabou. Recomece a recuperação.' })
    }
    if (erro.message?.includes('protegido')) {
      return res.status(409).json({
        erro: 'Este usuário está protegido no banco e não pode trocar a senha pela tela.',
      })
    }
    logger.error('auth/redefinir', erro.message)
    return res.status(500).json({ erro: 'Não foi possível gravar a senha nova.' })
  }
})

/* ============================================================
   OUTLOOK

   Dois usos do mesmo fluxo:

     entrar   — sem estar logado, no lugar de CPF/e-mail + senha
     vincular — ja logado, em Configuracoes, para passar a poder
                entrar pelo botao (e para o sistema puxar a foto)

   O vinculo casa pelo E-MAIL: a conta Microsoft precisa ser a mesma
   que esta no cadastro. E por isso que o e-mail do usuario nao pode
   mais ser trocado pela propria tela.
   ============================================================ */

router.get('/outlook/config', (_req, res) => {
  res.json({ configurado: temOutlook() })
})

router.post('/outlook/inicio', (req, res) => {
  if (!temOutlook()) {
    return res.status(503).json({
      erro: 'O login com Outlook ainda não foi configurado no servidor (OUTLOOK_CLIENT_ID).',
    })
  }
  const redirecionar = texto(req.body?.redirecionar)
  if (!redirecionar) return res.status(400).json({ erro: 'Endereço de retorno não informado.' })

  const estado = crypto.randomBytes(16).toString('base64url')
  return res.json({ url: urlDeEntrada({ redirecionar, estado }), estado })
})

/** Entra no sistema com a conta Microsoft ja vinculada. */
router.post('/outlook/entrar', async (req, res) => {
  if (!temOutlook()) {
    return res.status(503).json({ erro: 'O login com Outlook ainda não foi configurado.' })
  }

  try {
    const perfil = await perfilDoCodigo(texto(req.body?.codigo), texto(req.body?.redirecionar))
    if (!perfil.email) {
      return res.status(400).json({ erro: 'A conta Microsoft não tem e-mail.' })
    }

    const { rows } = await buscarUsuario(
      'lower(u.email) = $1 OR lower(u.outlook_email) = $1',
      [perfil.email],
    )
    const linha = rows[0]
    if (!linha) {
      return res.status(404).json({
        erro: `Nenhum cadastro com o e-mail ${perfil.email}. Entre com CPF e senha e vincule o Outlook em Configurações.`,
      })
    }
    if (linha.ativo === false) {
      return res.status(403).json({ erro: 'Este acesso está desativado. Fale com o administrador.' })
    }
    if (!linha.outlook) {
      return res.status(403).json({
        erro: 'Esta conta ainda não foi vinculada ao Outlook. Entre com a senha e vincule em Configurações.',
      })
    }

    // a foto do Outlook e a mais atual; se a conta tiver uma, ela entra
    if (perfil.foto) {
      await query('UPDATE usuario SET foto = $1 WHERE id = $2', [perfil.foto, linha.id])
      linha.foto = perfil.foto
    }

    const sessao = await abrirSessao(linha)
    /* entrou pelo Outlook e a senha do site ainda e a padrao: o Teams pede
       para trocar (no maximo uma vez por dia) */
    await avisarSenhaPadrao({ usuarioIds: [linha.id] })
    return res.json(sessao)
  } catch (erro) {
    logger.error('auth/outlook-entrar', erro.message)
    return res.status(400).json({ erro: erro.message || 'Não foi possível entrar com o Outlook.' })
  }
})

/**
 * Vincula a conta Microsoft ao usuario logado.
 *
 * Depois de vincular, `senha_temporaria` volta a true de proposito: a
 * tela passa a cobrar que a senha do site vire a mesma do Outlook,
 * como pedido — assim ninguem fica com duas senhas para lembrar.
 */
router.post('/outlook/vincular', async (req, res) => {
  const token = tokenDo(req)
  if (!token) return res.status(401).json({ erro: 'Sessão não informada.', sessao: false })
  if (!temOutlook()) {
    return res.status(503).json({ erro: 'O login com Outlook ainda não foi configurado.' })
  }

  try {
    const dono = await donoDoToken(token)
    if (!dono) return res.status(401).json({ erro: 'Sessão expirada. Entre de novo.', sessao: false })
    const { sub } = dono
    const perfil = await perfilDoCodigo(texto(req.body?.codigo), texto(req.body?.redirecionar))

    const meu = await query('SELECT email FROM usuario WHERE id = $1', [sub])
    if (!meu.rows[0]) return res.status(401).json({ erro: 'Sessão inválida.', sessao: false })

    /* a conta Microsoft tem que ser a mesma do cadastro: senao alguem
       vincularia a conta pessoal e entraria como outra pessoa */
    if (perfil.email !== String(meu.rows[0].email).toLowerCase()) {
      return res.status(409).json({
        erro: `Esta conta Microsoft é ${perfil.email}, e o seu cadastro é ${meu.rows[0].email}. Entre com a conta da empresa.`,
      })
    }

    const jaUsada = await query(
      'SELECT id FROM usuario WHERE lower(outlook_email) = $1 AND id <> $2',
      [perfil.email, sub],
    )
    if (jaUsada.rows[0]) {
      return res.status(409).json({ erro: 'Esta conta Microsoft já está vinculada a outro usuário.' })
    }

    await query(
      `UPDATE usuario
          SET outlook = true, outlook_email = $1, outlook_id = $2, outlook_em = now(),
              foto = coalesce($3, foto), senha_temporaria = true
        WHERE id = $4`,
      [perfil.email, perfil.id ?? null, perfil.foto, sub],
    )
    await registrarAtividade(sub, {
      acao: 'outlook.vinculado',
      categoria: 'conta',
      entidade: ['usuario', sub],
      descricao: 'Conta Microsoft (Outlook) vinculada',
      detalhes: { conta: perfil.email },
    })

    const { rows } = await buscarUsuario('u.id = $1', [sub])
    return res.json({
      user: paraUsuario(rows[0]),
      recado:
        'Outlook vinculado. Agora troque a senha do site para a mesma do Outlook — assim você não confunde as duas.',
    })
  } catch (erro) {
    if (erro.name === 'JsonWebTokenError' || erro.name === 'TokenExpiredError') {
      return res.status(401).json({ erro: 'Sessão expirada. Entre de novo.', sessao: false })
    }
    if (erro.message?.includes('protegido')) {
      return res.status(409).json({
        erro: 'Este usuário está protegido no banco. Vincule pelo SQL, com SET LOCAL app.desbloqueio.',
      })
    }
    logger.error('auth/outlook-vincular', erro.message)
    return res.status(400).json({ erro: erro.message || 'Não foi possível vincular o Outlook.' })
  }
})

export default router
