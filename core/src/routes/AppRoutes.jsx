import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import Login from '@/pages/Login/Login'
import Home from '@/pages/Home/Home'
import Privacy from '@/pages/Privacy/Privacy'
import Obras from '@/pages/Obras/Obras'
import ObraDetalhe from '@/pages/Obras/ObraDetalhe'
import Clientes from '@/pages/Clientes/Clientes'
import Concluidas from '@/pages/Concluidas/Concluidas'
import Ponto from '@/pages/Ponto/Ponto'
import Encontros from '@/pages/Encontros/Encontros'
import Atualizacoes from '@/pages/Frotas/Atualizacoes'
import CalendarioReservas from '@/pages/Frotas/CalendarioReservas'
import Avaliacoes from '@/pages/Avaliacoes/Avaliacoes'
import Usuarios from '@/pages/Usuarios/Usuarios'
import SetorPagina from '@/pages/Usuarios/SetorPagina'
import Configuracoes from '@/pages/Configuracoes/Configuracoes'
import Despesas from '@/pages/Despesas/Despesas'
import MeusEnvios from '@/pages/Despesas/MeusEnvios'
import EnviosGerais, { EnviosDaPessoa } from '@/pages/Despesas/EnviosGerais'
import Frotas from '@/pages/Frotas/Frotas'
import Comercial from '@/pages/Comercial/Comercial'
import Turnos from '@/pages/Turnos/Turnos'
import Registros from '@/pages/Frotas/Registros'
import RetornoOutlook from '@/pages/Login/RetornoOutlook'
import ChatEquipe from '@/pages/Chat/ChatEquipe'
import ProtectedRoute from './ProtectedRoute'

/* O LWN Control (o Almoxarife) e a tela do lwncontrol (public/almoxarife),
   fora do React: o servidor entrega a pagina dele em /core/app/control
   (vercel.json, vite.config.js). Chegando aqui por um link de dentro do
   React, basta carregar o endereco de verdade. A sessao vai junto pelo
   localStorage.

   A marca em sessionStorage evita o laco: a pagina do LWN Control a apaga
   ao abrir (sessao.js); se ela ainda esta aqui, o servidor devolveu o
   React de novo e recarregar nao adianta. */
const MARCA_CONTROL = 'lwn-control-recarga'
function LwnControl() {
  const { pathname } = window.location
  const destino = pathname.startsWith('/core/app/control') ? pathname : '/core/app/control'
  let tentou = false
  try {
    tentou = Date.now() - Number(sessionStorage.getItem(MARCA_CONTROL) || 0) < 10000
    sessionStorage.setItem(MARCA_CONTROL, String(Date.now()))
  } catch {
    tentou = false
  }
  if (tentou) return <p style={{ padding: 24 }}>Não foi possível abrir o LWN Control. Recarregue a página.</p>
  window.location.replace(destino)
  return null
}

/**
 * O endereco que mudou de lugar: leva para o novo com o que vinha depois
 * do "?" (o periodo do link do aviso do Ponto, no Teams) e o :usuarioId.
 */
function Mudou({ para }) {
  const { search } = useLocation()
  const { usuarioId } = useParams()
  const destino = usuarioId ? `${para}/${encodeURIComponent(usuarioId)}` : para
  return <Navigate to={{ pathname: destino, search }} replace />
}

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
      {/* Concluidas nao esta mais no menu: abre pelo botao "Concluídas" de
          Obras. O endereco continua o mesmo, e os links antigos (o do Teams,
          em server/avisosObra.js, e a busca) seguem abrindo a tela */}
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
      {/* a folha de ponto (atualizacao 51), com `ver_ponto` (atualizacao 55):
          cada um ve e assina a sua (e o link do aviso do Teams). Ver a dos
          outros e importar e `gerenciar_ponto`, que a API confere */}
      <Route
        path="/app/ponto"
        element={
          <Interna permissao="ver_ponto">
            <Ponto />
          </Interna>
        }
      />
      {/* os horarios dos checks com horario das obras (o ponto de encontro) */}
      <Route
        path="/app/encontros"
        element={
          <Interna permissao="ver_encontros">
            <Encontros />
          </Interna>
        }
      />
      {/* A area Administrativo saiu (atualizacao 55): os enderecos dela levam
          para as telas de sempre, com o que vinha depois do "?" */}
      <Route path="/app/administrativo" element={<Navigate to="/app" replace />} />
      <Route path="/app/administrativo/ponto" element={<Mudou para="/app/ponto" />} />
      <Route path="/app/administrativo/reembolso" element={<Mudou para="/app/despesas/gerais" />} />
      <Route path="/app/administrativo/reembolso/:usuarioId" element={<Mudou para="/app/despesas/gerais" />} />
      <Route path="/app/administrativo/encontros" element={<Mudou para="/app/encontros" />} />
      <Route path="/app/administrativo/frotas" element={<Mudou para="/app/frotas/atualizacoes" />} />
      <Route path="/app/administrativo/turnos" element={<Mudou para="/app/turnos" />} />
      {/* os funis de venda (os negocios do Pipedrive); a API confere a
          mesma chave em cada chamada de /api/comercial */}
      <Route
        path="/app/comercial"
        element={
          <Interna permissao="ver_comercial">
            <Comercial />
          </Interna>
        }
      />
      {/* os turnos da equipe, no desenho dos Turnos do Teams (atualizacao 31) */}
      <Route
        path="/app/turnos"
        element={
          <Interna permissao="ver_turnos">
            <Turnos />
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
          <Interna permissao="ver_usuarios">
            <Usuarios />
          </Interna>
        }
      />
      {/* a tela de um setor (nome, cor e permissoes): so quem edita setor */}
      <Route
        path="/app/usuarios/setores/:id"
        element={
          <Interna permissao="editar_cargo">
            <SetorPagina />
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
      {/* Envios gerais: os envios da equipe, com o filtro por tipo e por
          periodo. revisar_despesa_geral depende de ver_despesas, e a API
          confere as duas em cada chamada. */}
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
      {/* Frotas abre com ver_frotas, e a lista de registros tambem: a API
          confere a mesma chave em cada chamada de /api/frotas. */}
      <Route
        path="/app/frotas"
        element={
          <Interna permissao="ver_frotas">
            <Frotas />
          </Interna>
        }
      />
      <Route
        path="/app/frotas/registros"
        element={
          <Interna permissao="ver_frotas">
            <Registros />
          </Interna>
        }
      />
      {/* os carros em uso e os que voltaram pedindo atencao (era o Frotas da
          area Administrativo) e o calendario das reservas */}
      <Route
        path="/app/frotas/atualizacoes"
        element={
          <Interna permissao="ver_frotas">
            <Atualizacoes />
          </Interna>
        }
      />
      <Route
        path="/app/frotas/calendario"
        element={
          <Interna permissao="ver_frotas">
            <CalendarioReservas />
          </Interna>
        }
      />
      <Route
        path="/app/control/*"
        element={
          <Interna permissao="ver_almoxarife">
            <LwnControl />
          </Interna>
        }
      />
      {/* o endereco antigo */}
      <Route path="/app/almoxarife" element={<Navigate to="/app/control" replace />} />
      {/* Configuracoes nao tem trava: e onde todo mundo cuida da propria conta */}
      <Route
        path="/app/configuracoes"
        element={
          <Interna>
            <Configuracoes />
          </Interna>
        }
      />
      {/* a mesma tela sem o menu do Atmosfera: a aba Configurações do LWN
          Control (public/almoxarife) a mostra num iframe */}
      <Route
        path="/app/configuracoes/embutida"
        element={
          <Interna>
            <Configuracoes embutida />
          </Interna>
        }
      />
      {/* o chat da equipe tambem nao: conversar e de todo mundo que entra */}
      <Route
        path="/app/chat"
        element={
          <Interna>
            <ChatEquipe />
          </Interna>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
