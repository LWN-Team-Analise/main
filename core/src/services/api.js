/**
 * O jeito unico de falar com a API.
 *
 * Cuida do token, do JSON e da mensagem de erro — as telas so recebem o
 * corpo pronto ou uma Error com texto que da para mostrar na tela.
 */

const CHAVE_SESSAO = 'customers.session'

function tokenGuardado() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_SESSAO) ?? 'null')?.token ?? null
  } catch {
    return null
  }
}

/**
 * O token tambem vive aqui na memoria — e esta copia e a que vale.
 *
 * Quem escreve no localStorage e um efeito do AuthContext, e efeito so
 * roda DEPOIS que a tela pinta. So que o DadosProvider e filho do
 * AuthProvider, e efeito de filho roda ANTES do efeito do pai: no
 * instante em que o login abria a sessao, a primeira carga do quadro ja
 * saia — e saia SEM token, porque o localStorage ainda estava vazio.
 * Voltava 401, a sessao recem-aberta era derrubada, e o login dizia
 * "sua sessao expirou" logo depois de a pessoa acertar a senha.
 *
 * Com a copia em memoria o token existe no mesmo instante em que o
 * login responde, sem depender de quando o efeito roda.
 */
let tokenNaMemoria = tokenGuardado()

/** Chamado pelo AuthContext no mesmo passo em que a sessao muda. */
export function guardarToken(token) {
  tokenNaMemoria = token ?? null
}

export function tokenAtual() {
  return tokenNaMemoria ?? tokenGuardado()
}

/**
 * O aviso de que a sessao morreu.
 *
 * O token vale 8 horas. Passado esse tempo, TODA chamada volta 401 — mas
 * a sessao continuava guardada aqui, entao a tela seguia com cara de
 * logada, mostrando os dados que ja tinha carregado, e so o primeiro
 * "salvar" e que revelava o problema.
 *
 * Agora, no primeiro 401 de sessao, a sessao e apagada e este evento
 * avisa o AuthContext, que manda a pessoa para o login.
 */
export const SESSAO_CAIU = 'customers:sessao-caiu'

function derrubarSessao() {
  tokenNaMemoria = null
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
  const token = tokenAtual()
  const numero = (numeroDaChamada += 1)
  const metodo = (opcoes.method ?? 'GET').toUpperCase()
  const querCarga = pedindoCarga > 0 && metodo !== 'GET'

  let resposta
  try {
    resposta = await fetch(`/api${caminho}`, {
      ...opcoes,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    /* `sessao: false` so vem quando o token morreu de verdade. Um 401 sem
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
