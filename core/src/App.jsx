import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/context/ThemeContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { DadosProvider } from '@/context/DadosContext'
import Barreira from '@/components/Barreira/Barreira'
import LiquidGlassDefs from '@/components/LiquidGlass/LiquidGlassDefs'
import CookieConsent from '@/components/CookieConsent/CookieConsent'
import AppRoutes from '@/routes/AppRoutes'
import usePresenca from '@/hooks/usePresenca'
import { BASE } from '@/base'

/** Avisa o servidor que esta aba esta aberta (a bolinha da tela de Usuarios). */
function Presenca() {
  const { isAuthenticated } = useAuth()
  usePresenca(isAuthenticated)
  return null
}

/**
 * Duas barreiras de proposito:
 *
 *  - a de dentro segura o erro de uma TELA. Os contextos continuam de
 *    pe, entao "Tentar de novo" costuma resolver sem recarregar nada.
 *  - a de fora e a rede de seguranca do resto (contexto, tema, rota).
 *
 * Sem elas, um componente que estoura leva a arvore inteira junto e a
 * tela fica branca — que era o que parecia o site ter caido.
 */
export default function App() {
  return (
    <Barreira>
      <ThemeProvider>
        {/* o sistema mora em /customers dentro do site da LWN (src/base.js) */}
        <BrowserRouter basename={BASE}>
          <AuthProvider>
            <Presenca />
            <DadosProvider>
              <LiquidGlassDefs />
              <Barreira>
                <AppRoutes />
              </Barreira>
              <CookieConsent />
            </DadosProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </Barreira>
  )
}
