/**
 * Camada de autenticacao — fala com a API em /api/auth (server/routes/auth.js),
 * que por sua vez consulta o PostgreSQL. Em desenvolvimento o Vite faz o proxy
 * de /api para http://localhost:3001 (ver vite.config.js).
 */

export function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim())
}

export function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
}

/** Valida CPF pelos dois digitos verificadores. */
export function validateCPF(value) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  const digito = (tamanho) => {
    let soma = 0
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(cpf[i]) * (tamanho + 1 - i)
    }
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}

/** O campo de acesso aceita e-mail ou CPF. */
export function validateIdentifier(value = '') {
  return validateEmail(value) || validateCPF(value)
}

/** CPF mascarado para exibicao: 305.868.948-96 */
export function formatCPF(value) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11) return value
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

async function lerErro(resposta) {
  try {
    const dados = await resposta.json()
    return dados?.erro
  } catch {
    return null
  }
}

export async function signIn({ identifier, password }) {
  const valor = String(identifier ?? '').trim()

  // valida antes de ir na rede: erro imediato e uma requisicao a menos
  if (!validateIdentifier(valor)) {
    throw new Error('Informe um e-mail ou CPF válido.')
  }
  if (!password) {
    throw new Error('Informe sua senha.')
  }

  let resposta
  try {
    resposta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: valor, password }),
    })
  } catch {
    throw new Error('Não foi possível falar com o servidor. Ele está rodando? (npm run api)')
  }

  if (!resposta.ok) {
    throw new Error((await lerErro(resposta)) || 'Não foi possível entrar. Tente novamente.')
  }

  return resposta.json()
}

/**
 * Revalida a sessao guardada. Devolve uma de tres respostas:
 *
 *   { user }             — o token vale, e este e o cadastro de agora
 *   { expirada: true }   — o token morreu; a pessoa precisa entrar de novo
 *   { indefinido: true } — nao deu para perguntar (API fora do ar)
 *
 * A diferenca entre as duas ultimas e o que importa: sem ela, um
 * servidor momentaneamente fora do ar deslogaria todo mundo.
 */
export async function fetchMe(token) {
  let resposta
  try {
    resposta = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return { indefinido: true }
  }

  if (resposta.ok) {
    const { user } = await resposta.json().catch(() => ({}))
    return user ? { user } : { indefinido: true }
  }
  if (resposta.status === 401) return { expirada: true }
  return { indefinido: true }
}

export async function signOut() {
  // o token e sem estado no servidor: sair e apagar a sessao local
}

/* ============================================================
   Esqueci minha senha — os tres passos do pop-up
   ============================================================ */

async function falar(caminho, corpo, cabecalhos = {}) {
  let resposta
  try {
    resposta = await fetch(`/api/auth/${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cabecalhos },
      body: JSON.stringify(corpo),
    })
  } catch {
    throw new Error('Não foi possível falar com o servidor. Tente de novo.')
  }
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new Error(dados?.erro ?? 'Não foi possível completar a operação.')
  return dados ?? {}
}

/** 1º passo: manda o codigo para o e-mail do cadastro. */
export const pedirCodigo = (identificador) => falar('recuperar', { identificador })

/** 2º passo: confere o codigo e devolve a permissao do ultimo passo. */
export const conferirCodigo = (identificador, codigo) =>
  falar('codigo', { identificador, codigo })

/** 3º passo: grava a senha nova. */
export const redefinirSenha = (permissao, nova) => falar('redefinir', { permissao, nova })

/* ============================================================
   Outlook

   A tela abre uma janelinha no site da Microsoft; quando ela
   volta com o `code`, o servidor troca esse code por perfil e
   foto. Aqui so ficam as chamadas.
   ============================================================ */

/**
 * O botao do Outlook so aparece quando o servidor esta configurado.
 *
 * A resposta e guardada pela vida da pagina, e a promessa (nao o valor)
 * e o que fica no cache: o `ProtectedRoute` pergunta isso a CADA troca
 * de rota, e sem o cache seriam N requisicoes iguais — algumas delas
 * simultaneas, no primeiro pintar.
 *
 * Guardar so o valor nao bastaria: duas chamadas no mesmo tique
 * disparariam dois fetch antes de qualquer uma responder. Guardando a
 * promessa, a segunda espera a primeira.
 *
 * O que o servidor responde aqui so muda quando ele reinicia — e nesse
 * caso a pagina tambem recarrega, porque o front nao sobrevive a uma
 * API que sumiu no meio.
 *
 * A resposta tem TRES valores, e nao dois, porque as duas maneiras de
 * nao ter Outlook pedem recados diferentes:
 *
 *   'sim'          o servidor tem as chaves;
 *   'nao'          o servidor respondeu que nao tem;
 *   'sem-resposta' a API nao respondeu.
 *
 * Enquanto isso era um booleano so, API fora do ar virava "peça para a
 * diretoria preencher OUTLOOK_CLIENT_ID no .env" — e mandava procurar
 * defeito numa configuracao que estava certa o tempo todo.
 */
let configuracaoDoOutlook = null

export function outlookConfigurado() {
  configuracaoDoOutlook ??= (async () => {
    try {
      const resposta = await fetch('/api/auth/outlook/config')
      if (!resposta.ok) return 'sem-resposta'
      const { configurado } = await resposta.json()
      return configurado ? 'sim' : 'nao'
    } catch {
      /* servidor fora do ar. O cache e limpo para a proxima tentativa
         nao herdar o erro. */
      configuracaoDoOutlook = null
      return 'sem-resposta'
    }
  })()
  return configuracaoDoOutlook
}

export const inicioDoOutlook = (redirecionar) => falar('outlook/inicio', { redirecionar })

export const entrarComOutlook = (codigo, redirecionar) =>
  falar('outlook/entrar', { codigo, redirecionar })

export const vincularOutlook = (codigo, redirecionar, token) =>
  falar('outlook/vincular', { codigo, redirecionar }, { Authorization: `Bearer ${token}` })
