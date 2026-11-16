import { useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Seletor from '@/components/Seletor/Seletor'
import { useDados } from '@/context/DadosContext'
import Painel from '@/pages/Home/Painel'
import ModalPowerBI from '@/pages/Home/ModalPowerBI'
import { CHAVE_GRAFICOS, SeletorMes, mesDe } from '@/pages/Home/Home'
import '@/pages/Home/Home.css'

const Exportar = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
  </svg>
)

/**
 * DASHBOARD — a tela da Area da diretoria.
 *
 * Era a aba Dashboard da pagina inicial: os numeros da empresa inteira
 * (tempo de obra, resposta de cada setor, prazo, despesas, frota,
 * almoxarife e comercial) e a exportacao para o Power BI. Saiu de la para
 * a area da diretoria no menu por area; o que ela mostra continua o mesmo
 * (Painel.jsx), e quem abre continua sendo quem tem `ver_dashboard`.
 *
 * O mes, o passo (Diario / Mensal) e o filtro de graficos ficam na barra
 * de cima, como ficavam ao lado das abas da pagina inicial.
 */
export default function Dashboard() {
  const { pode } = useDados()
  const [mes, setMes] = useState(() => {
    const agora = new Date()
    return mesDe(agora.getFullYear(), agora.getMonth())
  })
  const [passo, setPasso] = useState('mes')
  const [powerBI, setPowerBI] = useState(false)
  const [recado, setRecado] = useState('')

  /* o filtro "Gráficos": todos, ou um grupo so. Fica lembrado neste
     navegador, na mesma chave de quando morava na pagina inicial */
  const [graficos, setGraficosEstado] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_GRAFICOS) || 'todos'
    } catch {
      return 'todos'
    }
  })
  const setGraficos = (valor) => {
    setGraficosEstado(valor)
    try {
      localStorage.setItem(CHAVE_GRAFICOS, valor)
    } catch {
      /* sem storage, vale so ate recarregar */
    }
  }
  /* o grupo Comercial so para quem ve o Comercial */
  const secao = pode('ver_comercial') || graficos !== 'comercial' ? graficos : 'todos'

  return (
    <AppShell>
      <section className="inicio">
        <header>
          <h1 className="tela__titulo">Dashboard</h1>
          <p className="tela__lead">Os números da empresa inteira: obras, setores, prazos, despesas e frota.</p>
        </header>

        <div className="inicio__barra">
          <SeletorMes mes={mes} aoMudar={setMes} />

          {/* o passo: um modo de olhar, e nao um controle de dentro de um cartao */}
          <div className="escopo" role="group" aria-label="Passo do tempo">
            <button
              type="button"
              className={passo === 'mes' ? 'is-atual' : ''}
              onClick={() => setPasso('mes')}
              title="O mês escolhido, dia a dia"
            >
              Diário
            </button>
            <button
              type="button"
              className={passo === 'ano' ? 'is-atual' : ''}
              onClick={() => setPasso('ano')}
              title="De janeiro até o mês escolhido, mês a mês"
            >
              Mensal
            </button>
          </div>

          {/* quais graficos o Painel mostra: todos, ou so os de um grupo */}
          <div className="inicio__graficos">
            <Seletor
              valor={secao}
              aoMudar={setGraficos}
              aria-label="Quais gráficos mostrar"
              opcoes={[
                { valor: 'todos', rotulo: 'Todos os gráficos' },
                { valor: 'obras', rotulo: 'Obras' },
                { valor: 'despesas', rotulo: 'Despesas' },
                { valor: 'frotas', rotulo: 'Frotas' },
                ...(pode('ver_almoxarife') && pode('almox_relatorios') ? [{ valor: 'almoxarife', rotulo: 'Almoxarife' }] : []),
                ...(pode('ver_comercial') ? [{ valor: 'comercial', rotulo: 'Comercial' }] : []),
              ]}
            />
          </div>

          {/* os dados do Dashboard, para o Power BI: tudo, so obras ou so
              despesas (ModalPowerBI) */}
          <button
            type="button"
            className="acao acao--fraca inicio__exportar"
            onClick={() => setPowerBI(true)}
            title="Baixar os dados do Dashboard numa planilha que o Power BI abre"
          >
            <Exportar />
            Exportar para o Power BI
          </button>
        </div>

        {recado && (
          <p className="recado" role="status">
            {recado}
            <button type="button" onClick={() => setRecado('')} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}

        <Painel mes={mes} passo={passo} secao={secao} />
      </section>

      <ModalPowerBI aberto={powerBI} aoFechar={() => setPowerBI(false)} aoExportado={setRecado} />
    </AppShell>
  )
}
