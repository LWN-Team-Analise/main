import { Link } from 'react-router-dom'
import ThemeToggle from '@/components/ThemeToggle/ThemeToggle'
import './Privacy.css'

/**
 * Pagina de politica de privacidade.
 * O texto abaixo e um esqueleto: quem escreve o conteudo juridico e a empresa.
 */
export default function Privacy() {
  return (
    <main className="privacy">
      <ThemeToggle />
      <div className="privacy__inner">
        <Link className="privacy__back" to="/login">
          ← Voltar para o login
        </Link>

        <h1 className="privacy__title">Política de privacidade</h1>
        <p className="privacy__updated">Última atualização: a definir</p>

        <section>
          <h2>Dados que coletamos</h2>
          <p>
            Coletamos os dados necessários para criar e manter sua conta: nome, e-mail ou
            CPF e registros de acesso.
          </p>
        </section>

        <section>
          <h2>Cookies</h2>
          <p>
            Cookies essenciais mantêm sua sessão ativa e não podem ser desligados. Cookies
            de análise só são usados se você aceitar no aviso exibido no primeiro acesso —
            a escolha fica guardada no seu navegador e pode ser refeita limpando os dados
            do site.
          </p>
        </section>

        <section>
          <h2>Seus direitos</h2>
          <p>
            Você pode solicitar acesso, correção ou exclusão dos seus dados pelos canais de
            atendimento da empresa.
          </p>
        </section>

        <p className="privacy__note">
          Conteúdo provisório — substituir pelo texto oficial antes de publicar.
        </p>
      </div>
    </main>
  )
}
