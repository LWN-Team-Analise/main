import { Navigate, Route, Routes } from 'react-router-dom'
import Login from '@/pages/Login/Login'
import Home from '@/pages/Home/Home'
import Privacy from '@/pages/Privacy/Privacy'
import Obras from '@/pages/Obras/Obras'
import ObraDetalhe from '@/pages/Obras/ObraDetalhe'
import Clientes from '@/pages/Clientes/Clientes'
import Concluidas from '@/pages/Concluidas/Concluidas'
import Avaliacoes from '@/pages/Avaliacoes/Avaliacoes'
import Usuarios from '@/pages/Usuarios/Usuarios'
import Configuracoes from '@/pages/Configuracoes/Configuracoes'
import Despesas from '@/pages/Despesas/Despesas'
import MeusEnvios from '@/pages/Despesas/MeusEnvios'
import EnviosGerais, { EnviosDaPessoa } from '@/pages/Despesas/EnviosGerais'
import RetornoOutlook from '@/pages/Login/RetornoOutlook'
import ProtectedRoute from './ProtectedRoute'

/**
 * Envolve a rota interna na guarda de sessao — e, quando a tela pede,
 * tambem na de permissao do cargo.
 */
function Interna({ children, ...guarda }) {
  return <ProtectedRoute {...guarda}>{children}</ProtectedRoute>
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/politica-de-privacidade" element={<Privacy />} />
      {/* para onde a Microsoft devolve a janelinha do login com Outlook */}
      <Route path="/outlook" element={<RetornoOutlook />} />

      <Route
        path="/app"
        element={
          <Interna permissao="ver_inicio">
            <Home />
          </Interna>
        }
      />
      <Route
        path="/app/obras"
        element={
          <Interna permissao="ver_obras">
            <Obras />
          </Interna>
        }
      />
      <Route
        path="/app/obras/:id"
        element={
          <Interna permissao="ver_obras">
            <ObraDetalhe />
          </Interna>
        }
      />
      <Route
        path="/app/clientes"
        element={
          <Interna permissao="ver_clientes">
            <Clientes />
          </Interna>
        }
      />
      <Route
        path="/app/concluidas"
        element={
          <Interna permissao="ver_concluidas">
            <Concluidas />
          </Interna>
        }
      />
      {/* A MESMA tela da obra, so que travada: abre por dentro de Concluidas
          e volta para la. Obra encerrada e registro — da para ver tudo, mas
          nao da para mexer em nada. */}
      <Route
        path="/app/concluidas/:id"
        element={
          <Interna permissao="ver_concluidas">
            <ObraDetalhe somenteLeitura voltarPara="/app/concluidas" />
          </Interna>
        }
      />
      <Route
        path="/app/avaliacoes"
        element={
          <Interna permissao="ver_avaliacoes">
            <Avaliacoes />
          </Interna>
        }
      />
      <Route
        path="/app/usuarios"
        element={
          <Interna permissoes={['editar_usuario', 'editar_cargo', 'editar_cargo_titulo']}>
            <Usuarios />
          </Interna>
        }
      />
      {/* Despesas abre com ver_despesas — a API confere a mesma chave em
          cada chamada de /api/despesas, entao digitar o endereco ou chamar
          a API na mao da no mesmo. */}
      <Route
        path="/app/despesas"
        element={
          <Interna permissao="ver_despesas">
            <Despesas />
          </Interna>
        }
      />
      <Route
        path="/app/despesas/envios"
        element={
          <Interna permissao="ver_despesas">
            <MeusEnvios />
          </Interna>
        }
      />
      {/* Envios gerais: so quem revisa. revisar_despesa_geral depende de
          ver_despesas (sem ela, a lista do setor ja chega sem esta), e a
          API confere as duas em cada chamada. */}
      <Route
        path="/app/despesas/gerais"
        element={
          <Interna permissao="revisar_despesa_geral">
            <EnviosGerais />
          </Interna>
        }
      />
      <Route
        path="/app/despesas/gerais/:usuarioId"
        element={
          <Interna permissao="revisar_despesa_geral">
            <EnviosDaPessoa />
          </Interna>
        }
      />
      {/* Configuracoes nao tem trava: e onde todo mundo cuida da propria conta */}
      <Route
        path="/app/configuracoes"
        element={
          <Interna>
            <Configuracoes />
          </Interna>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
