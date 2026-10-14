import { useState } from 'react'
import Button from '@/components/Button/Button'
import Avatar from '@/components/Avatar/Avatar'
import ThemeToggle from '@/components/ThemeToggle/ThemeToggle'
import useOutlook from '@/hooks/useOutlook'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { vincularOutlook } from '@/services/authService'
import { tokenAtual } from '@/services/api'
import outlookLogo from '@/assets/outlook.png'
import logoLight from '@/assets/LogoLWN.png'
import logoDark from '@/assets/LogoLWNWhite.png'
import './PortaoOutlook.css'

/**
 * A tela do meio: entrou com a senha, mas ainda nao vinculou o Outlook.
 *
 * Ela fica ENTRE o login e o sistema. Nao ha menu, nao ha barra lateral
 * e nao ha rota que passe por fora — quem nao vinculou nao ve obra,
 * cliente nem configuracao. Foi o pedido: a conta da empresa deixou de
 * ser opcional.
 *
 * Duas saidas, e so essas duas:
 *
 *   - "Entrar com a conta Microsoft", que vincula e libera o sistema;
 *   - "Sair", que devolve a pessoa para a tela de login.
 *
 * O vinculo casa pelo E-MAIL: a conta Microsoft tem de ser a MESMA do
 * cadastro. Entrar com a conta pessoal nao passa, e a mensagem de erro
 * diz exatamente qual e qual — sem isso a pessoa tenta tres vezes a
 * mesma conta errada sem entender por que nao entra.
 *
 * ---------------- A valvula de seguranca ----------------
 *
 * Este portao SO existe quando o servidor diz que o Outlook esta
 * configurado (`outlook.disponivel`). Sem essa condicao, um `.env` sem
 * as chaves da Microsoft — ou um registro que expirou — trancaria TODO
 * MUNDO para fora do sistema, inclusive quem poderia consertar, e sem
 * nenhuma tela por onde consertar. Quem decide isso e o `PortaoOutlook`
 * la no ProtectedRoute; aqui dentro a tela ja assume que ha por onde
 * entrar.
 */
export default function PortaoOutlook() {
  const { user, atualizarPerfil, logout } = useAuth()
  /* `isDark`, e nao `theme === 'dark'`: com o tema em "sistema" o
     `theme` vale 'system' e a logo sairia escura sobre fundo escuro */
  const { isDark } = useTheme()
  const outlook = useOutlook()

  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const entrar = async () => {
    setErro('')
    setOcupado(true)
    try {
      const { codigo, redirecionar } = await outlook.abrir()
      const resposta = await vincularOutlook(codigo, redirecionar, tokenAtual())
      /* atualizar o perfil e o que derruba este portao: o
         ProtectedRoute volta a deixar passar no mesmo instante */
      atualizarPerfil({
        outlook: true,
        outlookEmail: resposta.user?.outlookEmail ?? null,
        foto: resposta.user?.foto ?? user?.foto,
      })
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <main className="portao">
      <div className="portao__canto">
        <ThemeToggle />
      </div>

      <section className="portao__cartao vidro">
        <img
          className="portao__logo"
          src={isDark ? logoDark : logoLight}
          alt="LWN Engenharia"
        />

        <div className="portao__quem">
          <Avatar nome={user?.name} foto={user?.foto} tamanho={44} titulo={user?.name} />
          <div>
            <strong>{user?.name ?? 'Usuário'}</strong>
            <span>{user?.email}</span>
          </div>
        </div>

        <h1 className="portao__titulo">Falta entrar com a conta da empresa</h1>

        <p className="portao__texto">
          O acesso ao sistema passa pela sua conta Microsoft. Entre com{' '}
          <strong>{user?.email}</strong> — a mesma do seu cadastro — para liberar as obras,
          os clientes e o resto.
        </p>

        {erro && (
          <p className="portao__erro" role="alert">
            {erro}
          </p>
        )}

        <Button
          type="button"
          onClick={entrar}
          loading={ocupado}
          disabled={outlook.conferindo}
        >
          <img className="portao__marca" src={outlookLogo} alt="" />
          Entrar com a conta Microsoft
        </Button>

        <p className="portao__ajuda">
          A janela da Microsoft abre por cima desta tela. Se nada aparecer, libere os pop-ups
          para este endereço e tente de novo.
        </p>

        <button type="button" className="portao__sair" onClick={logout}>
          Sair e entrar com outro usuário
        </button>
      </section>
    </main>
  )
}
