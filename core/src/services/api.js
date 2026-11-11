/**
 * O jeito unico de falar com a API.
 *
 * Cuida do JSON e da mensagem de erro — as telas so recebem o corpo
 * pronto ou uma Error com texto que da para mostrar na tela.
 *
 * A sessao viaja num cookie HttpOnly que o navegador manda sozinho: o
 * JavaScript nao ve o token, entao nada aqui guarda ou le token.
 */

const CHAVE_SESSAO = 'customers.session'

/**
 * Quem estava logado quando o site passou a usar cookie ainda tem o token
 * no localStorage. Ele e trocado pelo cookie uma vez, antes de a tela
 * montar, e sai do armazenamento. Sem rede, fica para a proxima visita.
 */
export async function trocarTokenAntigo() {
  let guardada
  try {
    guardada = JSON.parse(localStorage.getItem(CHAVE_SESSAO) ?? 'null')
  } catch {
    return
  }
  if (!guardada?.token) return
  const { token, ...resto } = guardada
  try {
    await fetch('/api/auth/migrar', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  } catch {
    return
  }
  try {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(resto))
  } catch {
    /* storage bloqueado: nao ha o que limpar */
  }
}

/**
 * O aviso de que a sessao morreu.
 *
 * A sessao vale 8 horas. Passado esse tempo, TODA chamada volta 401 — mas
 * a sessao continuava guardada aqui, entao a tela seguia com cara de
 * logada, mostrando os dados que ja tinha carregado, e so o primeiro
 * "salvar" e que revelava o problema.
 *
 * Agora, no primeiro 401 de sessao, a sessao e apagada e este evento
 * avisa o AuthContext, que manda a pessoa para o login.
 */
export const SESSAO_CAIU = 'customers:sessao-caiu'

function derrubarSessao() {
  try {
    localStorage.removeItem(CHAVE_SESSAO)
  } catch {
    /* storage bloqueado: o evento abaixo ja resolve nesta aba */
  }
  window.dispatchEvent(new CustomEvent(SESSAO_CAIU))
}

/** Erro que a tela sabe distinguir: o servidor nao respondeu. */
export class SemServidor extends Error {
  constructor() {
    super('Sem conexão com o servidor. Suas alterações não foram salvas.')
    this.name = 'SemServidor'
  }
}

/* ------------------------------------------------------------
   A carga que volta JUNTO da gravacao (server/carga.js)

   Enquanto uma gravacao do contexto roda (`comCarga`), toda chamada
   que grava sai com `X-Carga: leve`, e a resposta volta com os dados
   ja relidos em `__carga`. Gravar e reler viram UMA ida ao servidor —
   antes eram seis: a gravacao e mais cinco leituras.

   Cada chamada leva um numero, na ordem em que saiu. Fica guardada a
   carga da chamada mais nova que voltou; a gravacao usa essa carga se
   ela veio de uma chamada feita depois que ela comecou.
   ------------------------------------------------------------ */
let pedindoCarga = 0
let numeroDaChamada = 0
let cargaRecebida = null

/**
 * Roda `acao` pedindo a carga junto. Devolve { resposta, carga }; a
 * carga e null quando nao veio (rota que responde 204, erro na leitura
 * dela...) — ai quem chamou rele do jeito de sempre.
 */
export async function comCarga(acao) {
  const desde = numeroDaChamada + 1
  pedindoCarga += 1
  try {
    const resposta = await acao()
    const veio = cargaRecebida && cargaRecebida.numero >= desde ? cargaRecebida.carga : null
    return { resposta, carga: veio }
  } finally {
    pedindoCarga -= 1
  }
}

/**
 * Chama a API. Devolve o corpo (ou {} em 204).
 * Lanca SemServidor quando nem deu para falar com o servidor, e Error
 * comum quando o servidor respondeu recusando.
 */
export async function chamar(caminho, opcoes = {}) {
  const numero = (numeroDaChamada += 1)
  const metodo = (opcoes.method ?? 'GET').toUpperCase()
  const querCarga = pedindoCarga > 0 && metodo !== 'GET'

  let resposta
  try {
    resposta = await fetch(`/api${caminho}`, {
      ...opcoes,
      headers: {
        'Content-Type': 'application/json',
        ...(querCarga ? { 'X-Carga': 'leve' } : {}),
        ...opcoes.headers,
      },
      body: opcoes.corpo === undefined ? opcoes.body : JSON.stringify(opcoes.corpo),
    })
  } catch {
    throw new SemServidor()
  }

  if (resposta.status === 204) return {}

  const corpo = await resposta.json().catch(() => null)

  if (!resposta.ok) {
    /* `sessao: false` so vem quando a sessao morreu de verdade. Um 401 sem
       essa marca e outra coisa — a troca de senha, por exemplo, responde
       401 quando a senha atual esta errada, e ali derrubar a sessao seria
       o pior a fazer. */
    if (resposta.status === 401 && corpo?.sessao === false) {
      derrubarSessao()
      throw new Error(corpo.erro ?? 'Sessão expirada. Entre de novo.')
    }
    // 5xx sem corpo util e servidor fora do ar para efeito da tela
    if (resposta.status >= 500 && !corpo?.erro) throw new SemServidor()
    const falha = new Error(corpo?.erro ?? 'Não foi possível completar a operação.')
    /* a rota que sabe QUAL campo recusou manda `campo` junto, e o
       formulario acende o campo certo em vez de so mostrar o recado */
    if (corpo?.campo) falha.campo = corpo.campo
    /* a lista do que estava errado (a importacao do ponto manda as linhas) */
    if (Array.isArray(corpo?.detalhes)) falha.detalhes = corpo.detalhes
    throw falha
  }

  if (corpo && typeof corpo === 'object' && '__carga' in corpo) {
    const { __carga: carga, ...resto } = corpo
    if (!cargaRecebida || numero > cargaRecebida.numero) cargaRecebida = { numero, carga }
    return resto
  }

  return corpo ?? {}
}

export const get = (caminho) => chamar(caminho)
export const post = (caminho, corpo) => chamar(caminho, { method: 'POST', corpo })
export const patch = (caminho, corpo) => chamar(caminho, { method: 'PATCH', corpo })
export const put = (caminho, corpo) => chamar(caminho, { method: 'PUT', corpo })
export const del = (caminho) => chamar(caminho, { method: 'DELETE' })
