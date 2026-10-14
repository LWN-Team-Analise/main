import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

const STORAGE_KEY = 'customers.theme'
const DEFAULT_THEME = 'light'

const ThemeContext = createContext(null)

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme)
  const limpeza = useRef(0)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* storage bloqueado: o tema vale so para esta sessao */
    }
  }, [theme])

  useEffect(() => () => window.clearTimeout(limpeza.current), [])

  /* A classe entra no <html> so durante a troca: enquanto ela existe, as
     cores deslizam de um tema para o outro (regra em global.css). Depois sai,
     para nao atropelar as transicoes proprias de hover/foco. */
  /** Liga a transicao suave e aplica o tema escolhido. */
  const aplicar = useCallback((proximo) => {
    const root = document.documentElement
    const semAnimacao = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!semAnimacao) {
      root.classList.add('theme-switching')
      window.clearTimeout(limpeza.current)
      limpeza.current = window.setTimeout(() => {
        root.classList.remove('theme-switching')
      }, 500)
    }

    setTheme(proximo)
  }, [])

  /** Escolhe um tema direto (usado pelo seletor Claro/Escuro do painel). */
  const selectTheme = useCallback(
    (valor) => {
      if (valor === 'light' || valor === 'dark') aplicar(valor)
    },
    [aplicar],
  )

  const toggleTheme = useCallback(() => {
    aplicar(theme === 'light' ? 'dark' : 'light')
  }, [aplicar, theme])

  const value = useMemo(
    () => ({ theme, isDark: theme === 'dark', toggleTheme, selectTheme }),
    [theme, toggleTheme, selectTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>')
  return ctx
}
