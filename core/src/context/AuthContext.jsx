import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as authService from '@/services/authService'
import { SESSAO_CAIU } from '@/services/api'

const STORAGE_KEY = 'customers.session'

const AuthContext = createContext(null)

/* o token nao passa por aqui (cookie HttpOnly), e o que fica guardado no
   aparelho e so o que a tela precisa para abrir antes de o servidor
   responder: documento e telefone voltam com o /me e ficam na memoria */
function semDadosPessoais({ user, ...resto }) {
  if (!user) return resto
  const { cpf: _cpf, telefone: _telefone, dataNascimento: _nascimento, ...publico } = user
  return { ...resto, user: publico }
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStoredSession())
  const [loading, setLoading] = useState(false)
  /* true = a sessao caiu sozinha (prazo vencido), nao foi a pessoa que saiu.
     E o que faz o login explicar o motivo em vez de so aparecer do nada. */
  const [expirou, setExpirou] = useState(false)

  const aplicarSessao = useCallback((proxima) => {
    setSession(proxima)
  }, [])

  useEffect(() => {
    try {
      if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(semDadosPessoais(session)))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* modo privado / storage bloqueado: sessao fica so em memoria */
    }
  }, [session])

  /**
   * Qualquer chamada que volte "sessao morta" derruba a sessao aqui.
   *
   * Sem isto, a sessao vencia depois de 8 horas e a tela continuava com
   * cara de logada: os dados ja carregados seguiam na tela e so o
   * primeiro "salvar" e que mostrava o erro.
   */
  useEffect(() => {
    const caiu = () => {
      setSession((atual) => {
        if (!atual) return atual
        setExpirou(true)
        return null
      })
    }
    window.addEventListener(SESSAO_CAIU, caiu)
    return () => window.removeEventListener(SESSAO_CAIU, caiu)
  }, [])

  /**
   * Ao abrir o site, confere se a sessao ainda vale.
   *
   * So derruba quando o servidor DIZ que a sessao morreu. Se a API estiver
   * fora do ar, a sessao fica de pe — senao uma queda de rede deslogaria
   * todo mundo.
   */
  const jaConferiu = useRef(false)
  const temSessao = Boolean(session?.user)
  useEffect(() => {
    if (jaConferiu.current || !temSessao) return
    jaConferiu.current = true

    /* sem "desligar" a resposta quando o efeito refaz: o provedor vive o app
       inteiro, e e esta resposta que traz o CPF e o telefone, que nao ficam
       guardados no aparelho */
    authService.fetchMe().then((resultado) => {
      if (resultado.expirada) {
        setExpirou(true)
        aplicarSessao(null)
        return
      }
      // aproveita e atualiza o cadastro: cargo, permissoes e foto de agora
      if (resultado.user) {
        setSession((atual) => (atual ? { ...atual, user: resultado.user } : atual))
      }
    })
  }, [temSessao, aplicarSessao])

  const login = useCallback(async (credentials) => {
    setLoading(true)
    try {
      const result = await authService.signIn(credentials)
      setExpirou(false)
      aplicarSessao(result)
      return result
    } finally {
      setLoading(false)
    }
  }, [aplicarSessao])

  /**
   * Abre a sessao com o que o servidor ja devolveu pronto.
   *
   * E o caminho do login pelo Outlook: quem conversou com a Microsoft
   * foi o servidor, e ele volta com { user } e o cookie prontos — nao ha
   * senha para o `login` conferir.
   */
  const entrarComSessao = useCallback((resultado) => {
    if (resultado?.user) {
      setExpirou(false)
      aplicarSessao(resultado)
    }
    return resultado
  }, [aplicarSessao])

  /** Atualiza o usuario da sessao (foto, nome, telefone...). */
  const atualizarPerfil = useCallback((campos) => {
    setSession((atual) => (atual ? { ...atual, user: { ...atual.user, ...campos } } : atual))
  }, [])

  const logout = useCallback(async () => {
    await authService.signOut()
    setExpirou(false)
    aplicarSessao(null)
  }, [aplicarSessao])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session?.user),
      loading,
      expirou,
      login,
      entrarComSessao,
      logout,
      atualizarPerfil,
    }),
    [session, loading, expirou, login, entrarComSessao, logout, atualizarPerfil],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
