import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import GlassCard from '@/components/GlassCard/GlassCard'
import TextField from '@/components/TextField/TextField'
import Button from '@/components/Button/Button'
import SocialRow from '@/components/SocialRow/SocialRow'
import SphereGallery from '@/components/SphereGallery/SphereGallery'
import ThemeToggle from '@/components/ThemeToggle/ThemeToggle'
import useMediaQuery from '@/hooks/useMediaQuery'
import useOutlook from '@/hooks/useOutlook'
import useVitrine from '@/hooks/useVitrine'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { entrarComOutlook } from '@/services/authService'
import ModalSenha from './ModalSenha'
import logoLight from '@/assets/LogoLWN.png'
import logoDark from '@/assets/LogoLWNWhite.png'
import './Login.css'

const SERVICES = ['Venda', 'Agendamento', 'Elaboração']

/* O nucleo da esfera puxa a cor do sistema, nao um azul solto.
   O alfa de cada cor E o brilho: coreColor manda no halo, lineColor na
   opacidade dos fios. */
const NUCLEO = {
  coreSize: 14,
  coreColor: '#7db4ffc4',
  lineColor: '#6aa2f042',
}

/**
 * Placa maior quando ha poucas logos.
 *
 * A esfera tem uma placa por cliente com foto. Com trinta elas se tocam e o
 * tamanho de fabrica serve; com duas, o mesmo tamanho deixa dois selinhos
 * perdidos em volta do nucleo. Entao o tamanho acompanha a contagem.
 */
function tamanhoDaPlaca(quantas) {
  if (quantas <= 3) return 52
  if (quantas <= 6) return 44
  if (quantas <= 12) return 36
  return 28
}

export default function Login() {
  const { login, entrarComSessao, loading, expirou } = useAuth()
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const outlook = useOutlook()
  /* as placas da esfera sao as logos dos clientes cadastrados */
  const { fotos } = useVitrine()

  const [form, setForm] = useState({ identifier: '', password: '' })
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [esqueci, setEsqueci] = useState(false)
  const [entrandoPeloOutlook, setEntrandoPeloOutlook] = useState(false)

  const redirectTo = location.state?.from?.pathname ?? '/app'

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
    if (error) setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await login({ ...form, remember })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível entrar. Tente novamente.')
    }
  }

  /**
   * Entrada pela conta Microsoft.
   *
   * So funciona para quem ja vinculou o Outlook em Configuracoes: a
   * primeira vez tem que ser com CPF/e-mail e senha, senao qualquer
   * conta Microsoft com o mesmo e-mail entraria sem nunca ter passado
   * pela senha do sistema.
   */
  const entrarOutlook = async () => {
    setError('')
    setEntrandoPeloOutlook(true)
    try {
      const { codigo, redirecionar } = await outlook.abrir()
      const sessao = await entrarComOutlook(codigo, redirecionar)
      entrarComSessao(sessao)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível entrar com o Outlook.')
    } finally {
      setEntrandoPeloOutlook(false)
    }
  }

  /* No desktop o titulo mora no cartao; no mobile ele sobe para a foto.
     E o mesmo bloco nos dois casos — nada de markup duplicado. */
  const head = (
    <header className="head">
      <h2 className="head__title">Acesse sua conta</h2>
      <span className="head__accent" aria-hidden="true" />
      <p className="head__lead">Entre com seu e-mail ou CPF e senha.</p>
    </header>
  )

  return (
    <main className="login">
      <ThemeToggle />
      {/* ---------------- Foto: faixas recortadas sobre a imagem ---------------- */}
      <section className="hero" aria-label="Apresentação">
        {/* importada pelo bundler: o caminho e resolvido no build,
            nao depende da pasta public */}
        <img className="hero__logo" src={isDark ? logoDark : logoLight} alt="LWN" />

        {/* esfera de fotos: gira sozinha, obedece ao arrasto e se
            inclina na direcao do cursor — mas sem zoom: a roda do mouse
            rola a pagina, nao aproxima a esfera */}
        <div className="hero__esfera">
          {/* uma placa por logo cadastrada, ate 34 — quem conta e a lista */}
          <SphereGallery
            images={fotos}
            size={tamanhoDaPlaca(fotos.length)}
            scale={82}
            zoom={false}
            core={NUCLEO}
            rotulo="Clientes atendidos pela LWN"
          />
        </div>

        {/* alinhado verticalmente com o meio do cartao de login */}
        <div className="hero__brand">
          <h1 className="hero__wordmark">Atmosfera LWN</h1>
          <p className="hero__tagline">Plataforma integrada de gestão corporativa.</p>
          <p className="hero__pitch">
            Ambiente digital centralizado para conectar processos, informações e
            operações, promovendo mais integração, organização e eficiência no dia a
            dia.
          </p>
          {isMobile && head}
        </div>
      </section>

      {/* ---------------- Acesso ---------------- */}
      <section className="panel" aria-label="Acesso">
        <GlassCard className="panel__card">
          {!isMobile && head}

          <form className="panel__form" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Email ou CPF"
              name="identifier"
              type="text"
              autoComplete="username"
              value={form.identifier}
              onChange={handleChange('identifier')}
            />

            <TextField
              label="Senha"
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange('password')}
            />

            <label className="check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <span className="check__box" aria-hidden="true" />
              <span className="check__label">Manter conectado</span>
            </label>

            <button type="button" className="panel__link" onClick={() => setEsqueci(true)}>
              Esqueci minha senha
            </button>

            {/* a sessao caiu sozinha: explica, em vez de deixar a pessoa
                achando que o sistema a chutou sem motivo */}
            {expirou && !error && (
              <p className="panel__aviso" role="status">
                Sua sessão expirou por tempo. Entre de novo para continuar.
              </p>
            )}

            {error && (
              <p className="panel__error" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <SocialRow
            ocupado={entrandoPeloOutlook || outlook.conferindo}
            rotulo={
              outlook.disponivel
                ? 'Entrar com Outlook'
                : outlook.motivo === 'sem-resposta'
                  ? 'A API não respondeu — o botão do Outlook volta quando ela voltar'
                  : 'Login com Outlook ainda não configurado no servidor'
            }
            onSelect={() =>
              outlook.disponivel
                ? entrarOutlook()
                : setError(
                    /* API fora do ar e chave faltando davam o MESMO recado, e
                       o recado era o da chave: mandava procurar defeito numa
                       configuração que estava certa o tempo todo. */
                    outlook.motivo === 'sem-resposta'
                      ? 'A API não respondeu. O login com Outlook volta assim que ela voltar; por enquanto, entre com e-mail ou CPF e senha.'
                      : 'O login com Outlook ainda não foi configurado no servidor. Entre com e-mail ou CPF e senha.',
                  )
            }
          />
        </GlassCard>
      </section>

      <ul className="login__services">
        {SERVICES.map((service) => (
          <li key={service}>{service}</li>
        ))}
      </ul>

      <footer className="login__footer">
        <Link className="login__policy" to="/politica-de-privacidade">
          Política de privacidade
        </Link>
        <span className="login__restricted">Acesso restrito à equipe LWN Team Análise</span>
      </footer>

      <ModalSenha
        aberto={esqueci}
        aoFechar={() => setEsqueci(false)}
        identificadorInicial={form.identifier}
      />
    </main>
  )
}
