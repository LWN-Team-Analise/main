import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import { useAuth } from '@/context/AuthContext'
import PainelEnvios from './PainelEnvios'
import { IconeVoltar } from './icones'
import './Despesas.css'

/**
 * Meus envios — SO os da pessoa logada, para todo mundo.
 *
 * Os envios dos outros moram em "Envios gerais" (EnviosGerais.jsx), que
 * e de quem tem `revisar_despesa_geral`. Aqui nao ha filtro de pessoa:
 * a API responde "os meus" quando a chamada nao diz de quem.
 */
export default function MeusEnvios() {
  const { user } = useAuth()
  return (
    <AppShell>
      <section className="envios">
        <header className="envios__topo">
          <Link to="/app/despesas" className="envios__voltar">
            <IconeVoltar />
            Despesas
          </Link>
          <h1 className="tela__titulo">Meus envios</h1>
          <p className="tela__lead">
            O que você enviou, por mês (dia a dia) ou por ano (mês a mês).
          </p>
        </header>

        <PainelEnvios quem={user?.name} />
      </section>
    </AppShell>
  )
}
