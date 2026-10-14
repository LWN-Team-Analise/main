import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import useOutlook from '@/hooks/useOutlook'
import PortaoOutlook from '@/pages/Login/PortaoOutlook'
import { abasVisiveis, podeFazer } from '@/domain/permissoes'

/**
 * Bloqueia rotas internas em TRES portoes, nesta ordem:
 *
 *   1. sessao   — quem nao entrou vai para /login;
 *   2. Outlook  — quem entrou mas nao vinculou a conta da empresa para
 *                 na tela do meio (PortaoOutlook) e nao ve mais nada;
 *   3. cargo    — quem entrou e vinculou, mas cujo cargo nao abre AQUELA
 *                 aba, vai para a primeira que ele pode ver.
 *
 * Esconder o item do menu nao basta: qualquer um digitaria o endereco
 * na barra. Quem cai numa aba fechada e mandado para a primeira que
 * ele PODE ver — e nao para uma tela de erro, que so deixaria a pessoa
 * sem saida.
 *
 * `permissoes` (plural) e para as telas que abrem com mais de uma
 * chave, como Usuarios: entra quem mexe em usuario OU em cargo.
 *
 * ---------------- O portao do Outlook ----------------
 *
 * A conta Microsoft deixou de ser opcional: sem ela nao ha obra,
 * cliente nem configuracao. O portao vale para TODA rota interna, de
 * proposito — deixar Configuracoes de fora seria abrir a porta que a
 * regra fecha, porque e de la que se mexe no proprio cadastro.
 *
 * Ele SO aparece quando o servidor confirma que o login com Outlook
 * esta configurado. Essa condicao nao e conforto, e seguranca: com um
 * `.env` sem as chaves da Microsoft, ou com um segredo vencido, o
 * portao trancaria todo mundo para fora do sistema — inclusive quem
 * poderia consertar, e sem nenhuma tela por onde fazer isso. Enquanto
 * o servidor responder que nao ha por onde entrar, o sistema volta a
 * funcionar como antes.
 *
 * Enquanto a resposta do servidor nao chega (`conferindo`), ninguem e
 * barrado: um piscar de tela de bloqueio a cada F5 seria pior que a
 * fracao de segundo em que alguem passaria sem vinculo.
 */
export default function ProtectedRoute({ children, permissao, permissoes }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()
  const outlook = useOutlook()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (outlook.disponivel && !outlook.conferindo && !user?.outlook) {
    return <PortaoOutlook />
  }

  const exigidas = permissoes ?? (permissao ? [permissao] : [])
  const liberado = exigidas.length === 0 || exigidas.some((chave) => podeFazer(user, chave))

  if (!liberado) {
    /* Configuracoes e sempre livre: e onde a pessoa troca a propria
       senha e vincula o Outlook, entao ela nunca fica sem para onde ir. */
    const primeira = abasVisiveis(user)[0] ?? '/app/configuracoes'
    return <Navigate to={primeira} replace />
  }

  return children
}
