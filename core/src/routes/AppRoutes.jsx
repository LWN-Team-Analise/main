import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import Login from '@/pages/Login/Login'
import Home from '@/pages/Home/Home'
import Privacy from '@/pages/Privacy/Privacy'
import Obras from '@/pages/Obras/Obras'
import ObraDetalhe from '@/pages/Obras/ObraDetalhe'
import Clientes from '@/pages/Clientes/Clientes'
import Concluidas from '@/pages/Concluidas/Concluidas'
import Ponto from '@/pages/Ponto/Ponto'
import Administrativo from '@/pages/Administrativo/Administrativo'
import Encontros from '@/pages/Administrativo/Encontros'
import FrotasAdm from '@/pages/Administrativo/FrotasAdm'
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
import { useAuth } from '@/context/AuthContext'
import { podeFazer } from '@/domain/permissoes'

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

/** A tela da area administrativa: pede `ver_administrativo` e, se vier, a permissao da tela. */
function NaArea({ permissao, children }) {
  return (
    <ProtectedRoute permissao="ver_administrativo">
      {permissao ? <ProtectedRoute permissao={permissao}>{children}</ProtectedRoute> : children}
    </ProtectedRoute>
  )
}

/**
 * O Ponto mora em dois enderecos, pela permissao da area: quem tem
 * `ver_administrativo` abre em /app/administrativo/ponto (com o menu da
 * area); quem nao tem, em /app/ponto (com o menu de sempre). Cada endereco
 * leva ao certo, com o periodo do link do aviso do Teams.
 */
function PontoDaArea() {
  const { user } = useAuth()
  return podeFazer(user, 'ver_administrativo') ? <Ponto /> : <Mudou para="/app/ponto" />
}

function PontoForaDaArea() {
  const { user } = useAuth()
  return podeFazer(user, 'ver_administrativo') ? <Mudou para="/app/administrativo/ponto" /> : <Ponto />
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
      {/* A AREA ADMINISTRATIVA (era a aba Ponto), com `ver_administrativo`.
          Entrar nela troca o menu pelo dela (MENU_ADM, no AppShell). O inicio
          e os cards; cada tela pede a permissao da area E a dela */}
      <Route
        path="/app/administrativo"
        element={
          <NaArea>
            <Administrativo />
          </NaArea>
        }
      />
      {/* o Ponto da area. Quem nao tem a area vai para /app/ponto (a mesma
          tela, com o menu de sempre), com o periodo do endereco */}
      <Route
        path="/app/administrativo/ponto"
        element={
          <Interna>
            <PontoDaArea />
          </Interna>
        }
      />
      {/* o antigo "Envios gerais" do Reembolso: os envios da equipe */}
      <Route
        path="/app/administrativo/reembolso"
        element={
          <NaArea permissao="revisar_despesa_geral">
            <EnviosGerais />
          </NaArea>
        }
      />
      <Route
        path="/app/administrativo/reembolso/:usuarioId"
        element={
          <NaArea permissao="revisar_despesa_geral">
            <EnviosDaPessoa />
          </NaArea>
        }
      />
      {/* os horarios dos checks com horario das obras (o ponto de encontro) */}
      <Route
        path="/app/administrativo/encontros"
        element={
          <NaArea permissao="ver_obras">
            <Encontros />
          </NaArea>
        }
      />
      {/* os carros em uso e os que voltaram pedindo atencao */}
      <Route
        path="/app/administrativo/frotas"
        element={
          <NaArea permissao="ver_frotas">
            <FrotasAdm />
          </NaArea>
        }
      />
      {/* a mesma tela da aba Turnos, com o menu da area (quem edita, edita daqui) */}
      <Route
        path="/app/administrativo/turnos"
        element={
          <NaArea permissao="ver_turnos">
            <Turnos />
          </NaArea>
        }
      />
      {/* a folha de ponto (atualizacao 51) de quem nao tem a area: de todo
          mundo, cada um ve a sua (e o link do aviso do Teams). Ver a dos
          outros e importar e `gerenciar_ponto`, que a API confere */}
      <Route
        path="/app/ponto"
        element={
          <Interna>
            <PontoForaDaArea />
          </Interna>
        }
      />
      {/* o endereco antigo do Envios gerais */}
      <Route path="/app/despesas/gerais" element={<Mudou para="/app/administrativo/reembolso" />} />
      <Route path="/app/despesas/gerais/:usuarioId" element={<Mudou para="/app/administrativo/reembolso" />} />
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
      {/* Envios gerais mudou para a area administrativa (card Reembolso):
          /app/administrativo/reembolso. revisar_despesa_geral depende de
          ver_despesas, e a API confere as duas em cada chamada. */}
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
