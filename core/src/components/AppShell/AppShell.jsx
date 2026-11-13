import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useDados } from '@/context/DadosContext'
import Avatar from '@/components/Avatar/Avatar'
import Busca from '@/components/Busca/Busca'
import IlhaAviso from '@/components/IlhaAviso/IlhaAviso'
import PedidoInclusao from '@/components/PedidoInclusao/PedidoInclusao'
import Confirma from '@/components/Confirma/Confirma'
import Estrelas from '@/components/Estrelas/Estrelas'
import ModalAvisoGeral from '@/components/AvisoGeral/ModalAvisoGeral'
import AvisoEntrada from '@/components/AvisoEntrada/AvisoEntrada'
import { ModalEvento } from '@/pages/Home/ModalAgenda'
import ModalSolicitarOS from '@/pages/Obras/ModalSolicitarOS'
import { ehAplicativo } from '@/utils/dispositivo'
import useNaoLidasChat from '@/hooks/useNaoLidasChat'
import { useNotificacoesAutomaticas } from '@/hooks/useNotificacoesCelular'
import { primeiroNome, saudacao } from '@/utils/pessoa'
import { dataHora } from '@/utils/formato'
import { painelPorChave } from '@/domain/permissoes'
/* O nome do arquivo diz para QUAL FUNDO a logo foi feita:
   ...White = para fundo branco (modo claro)
   ...Black = para fundo preto  (modo escuro) */
import logoModoClaro from '@/assets/firstLogoWhite.png'
import logoModoEscuro from '@/assets/firstLogoBlack.webp'
import './AppShell.css'

const traco = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const Icone = {
  inicio: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
    </svg>
  ),
  obras: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <path d="M4 20V6.5a1 1 0 0 1 .7-.95l7-2.2a1 1 0 0 1 1.3.95V20" />
      <path d="M13 10h6a1 1 0 0 1 1 1v9M3 20h18" />
      <path d="M7 8.5h2M7 12h2M7 15.5h2M16 13.5h1M16 16.5h1" />
    </svg>
  ),
  clientes: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M8.5 8V5.8A1.8 1.8 0 0 1 10.3 4h3.4a1.8 1.8 0 0 1 1.8 1.8V8" />
      <path d="M3 13h18M10.5 13v1.6h3V13" />
    </svg>
  ),
  /* Solicitar: a folha com o + (o "Solicitar OS" do Almoxarife) */
  solicitar: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M12 17.5v-6M9 14.5h6" />
    </svg>
  ),
  /* o "Mais" do alto da barra: a seta que alarga o menu (e encolhe, virada) */
  seta: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco} strokeWidth="1.9">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  /* a setinha das areas com submenu (Almoxarife, Administrativo) */
  chevron: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" {...traco} strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  /* Meu painel (o inicio do painel do setor): os cards */
  painel: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" {...traco}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </svg>
  ),
  /* pontos de encontro das obras: o alfinete do mapa */
  encontro: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  ),
  /* volta para o Atmosfera: o mesmo globo do LWN Control */
  atmosfera: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <path d="M21.54 15H17a2 2 0 0 0-2 2v4.54" />
      <path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17" />
      <path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  /* Ponto: a folha com o relogio no canto (a folha de ponto) */
  ponto: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <path d="M13 20.5H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5h9A1.5 1.5 0 0 1 16.5 5v4" />
      <path d="M8 8h5M8 11.5h3" />
      <circle cx="16.5" cy="16.5" r="4.5" />
      <path d="M16.5 14.2v2.3l1.6 1" />
    </svg>
  ),
  avaliacoes: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <path d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.99 6.75 19.75l1-5.85L3.5 9.75l5.9-.85z" />
    </svg>
  ),
  despesas: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <path d="M6 3.5h12v17l-2.4-1.5-2.4 1.5-2.4-1.5-2.4 1.5L6 20.5z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </svg>
  ),
  frotas: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  ),
  /* Almoxarife: a caixa de ferramentas */
  almoxarife: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2M3 13h18M10 13v2h4v-2" />
    </svg>
  ),
  /* o "fi fi-rr-calendar-clock" do Flaticon (UIcons, regular rounded), tirado
     da propria fonte de icones: e um desenho cheio, entao vai com fill e
     sem o traco dos outros. A caixa e maior que a dos outros icones
     porque o glifo ocupa o quadrado inteiro. */
  comercial: () => (
    <svg viewBox="-2 -26 28 28" width="21" height="21" fill="currentColor" aria-hidden="true">
      <path d="M16.96-14L17.04-14Q15.12-14 13.52-13.04Q11.92-12.08 10.96-10.48Q10-8.88 10-6.96Q10-5.04 10.96-3.44Q11.92-1.84 13.52-0.92Q15.12 0 17 0Q18.88 0 20.48-0.96Q22.08-1.92 23.04-3.52Q24-5.12 24-7Q24-8.88 23.04-10.48Q22.08-12.08 20.48-13.04Q18.88-14 16.96-14L16.96-14ZM16.96-2L17.04-2Q15.68-2 14.52-2.68Q13.36-3.36 12.68-4.48Q12-5.60 12-6.96Q12-8.32 12.68-9.48Q13.36-10.64 14.52-11.32Q15.68-12 17-12Q18.32-12 19.48-11.32Q20.64-10.64 21.32-9.48Q22-8.32 22-7Q22-5.68 21.32-4.52Q20.64-3.36 19.48-2.68Q18.32-2 16.96-2L16.96-2ZM18-7.44L18.72-6.72Q19.04-6.40 19.04-6Q19.04-5.60 18.72-5.28Q18.40-4.96 18-4.96Q17.60-4.96 17.28-5.28L17.28-5.28L16.32-6.32Q16-6.56 16-6.96L16-6.96L16-9.04Q16-9.44 16.28-9.72Q16.56-10 17-10Q17.44-10 17.72-9.72Q18-9.44 18-9.04L18-9.04L18-7.44ZM24-16.96L24-17.04L24-15.04Q24-14.56 23.72-14.28Q23.44-14 23-14Q22.56-14 22.28-14.28Q22-14.56 22-15.04L22-15.04L22-17.04Q22-18.24 21.12-19.12Q20.24-20 18.96-20L18.96-20L5.04-20Q3.76-20 2.88-19.12Q2-18.24 2-17.04L2-17.04L2-16L11.04-16Q11.44-16 11.72-15.72Q12-15.44 12-15Q12-14.56 11.72-14.28Q11.44-14 10.96-14L10.96-14L2-14L2-5.04Q2-3.76 2.88-2.88Q3.76-2 5.04-2L5.04-2L9.04-2Q9.44-2 9.72-1.72Q10-1.44 10-1Q10-0.56 9.72-0.28Q9.44 0 9.04 0L9.04 0L5.04 0Q3.68 0 2.52-0.68Q1.36-1.36 0.68-2.52Q0-3.68 0-5.04L0-5.04L0-17.04Q0-18.32 0.68-19.48Q1.36-20.64 2.52-21.32Q3.68-22 5.04-22L5.04-22L6-22L6-23.04Q6-23.44 6.28-23.72Q6.56-24 7-24Q7.44-24 7.72-23.72Q8-23.44 8-22.96L8-22.96L8-22L16-22L16-23.04Q16-23.44 16.28-23.72Q16.56-24 17-24Q17.44-24 17.72-23.72Q18-23.44 18-22.96L18-22.96L18-22L19.04-22Q20.32-22 21.48-21.32Q22.64-20.64 23.32-19.48Q24-18.32 24-16.96L24-16.96Z" />
    </svg>
  ),
  /* Turnos: o calendario com as faixas dos turnos dentro */
  turnos: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M7 13.2h5M7 16.6h7.5M14.5 13.2h2.5" />
    </svg>
  ),
  usuarios: () => (
    <svg viewBox="0 0 24 24" width="21" height="21" {...traco}>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M2.8 19.5a6.4 6.4 0 0 1 12.4 0" />
      <path d="M16.2 5.2a3.3 3.3 0 0 1 0 6.1M17.6 14.4a6.4 6.4 0 0 1 3.6 5.1" />
    </svg>
  ),
  config: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" {...traco}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1z" />
    </svg>
  ),
  sair: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" {...traco}>
      <path d="M14 20H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h8" />
      <path d="m17 15 3-3-3-3M20 12H10" />
    </svg>
  ),
  fechar: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" {...traco} strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  /* o "Enviar aviso" do menu do botao + */
  megafone: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" {...traco}>
      <path d="M4 10.2v3.6a1.2 1.2 0 0 0 1.2 1.2H7l5.6 3.6a.8.8 0 0 0 1.2-.7V6.1a.8.8 0 0 0-1.2-.7L7 9H5.2A1.2 1.2 0 0 0 4 10.2Z" />
      <path d="M17.2 9.2a4 4 0 0 1 0 5.6M19.6 6.8a7.4 7.4 0 0 1 0 10.4" />
    </svg>
  ),
  /* o "Marcar evento" do menu do botao + */
  calendario: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" {...traco}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.6" />
      <path d="M3.5 9.8h17M8 3.2v3.4M16 3.2v3.4" />
    </svg>
  ),
  mais: () => (
    <svg viewBox="0 0 24 24" width="22" height="22" {...traco} strokeWidth="2.2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  /* Tres barras, e nao um desenho: separadas, cada uma gira por conta
     propria. Abrindo, o conjunto inteiro da meia volta enquanto a de
     cima e a de baixo se cruzam e a do meio some — o X nasce girando,
     que e bem diferente de duas linhas que simplesmente viram X. */
  hamburguer: () => (
    <span className="ham" aria-hidden="true">
      <span className="ham__bar ham__bar--1" />
      <span className="ham__bar ham__bar--2" />
      <span className="ham__bar ham__bar--3" />
    </span>
  ),
  nota: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" {...traco}>
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 11h8M8 15h5" />
    </svg>
  ),
  chatPequeno: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" {...traco}>
      <path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
    </svg>
  ),
  cadeado: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" {...traco} strokeWidth="1.9">
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <path d="M12 14.4v2.2" />
    </svg>
  ),
  relogio: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" {...traco} strokeWidth="1.9">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.2 1.9" />
    </svg>
  ),
  sino: () => (
    <svg viewBox="0 0 24 24" width="19" height="19" {...traco}>
      <path d="M18 15V10a6 6 0 1 0-12 0v5l-1.5 2.5h15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  ),
}

/**
 * Barra lateral: icone + descricao embaixo.
 *
 * `permissao` e a chave que o cargo precisa ter para o item aparecer.
 * Usuarios nao tem permissao de VISUALIZACAO propria: quem entra la e
 * quem pode mexer em usuario ou em cargo.
 *
 * Item SEM `permissao` nem `permissoes` e de todo mundo (`semTv`: menos
 * da TV da empresa; `quandoNao`: so para quem NAO tem aquela permissao).
 * `tambem` sao as outras rotas que acendem o item.
 */
const MENU = [
  { id: 'inicio', rotulo: 'Página inicial', rota: '/app', exato: true, permissao: 'ver_inicio' },
  /* Concluidas saiu do menu: virou o botao "Concluídas" de Obras, e a tela
     dela (/app/concluidas) acende Obras aqui */
  { id: 'obras', rotulo: 'Obras', rota: '/app/obras', permissao: 'ver_obras', tambem: ['/app/concluidas'] },
  /* o "Solicitar OS" do Almoxarife: abre o pedido num pop-up por cima da
     tela em que a pessoa esta (ModalSolicitarOS, sem obra), sem levar ao
     Almoxarife. A rota continua abrindo a tela dele, para quem chega pelo
     endereco */
  { id: 'solicitar', rotulo: 'Solicitar', rota: '/app/control/solicitar', permissao: 'almox_solicitacoes', semTv: true },
  { id: 'clientes', rotulo: 'Clientes', rota: '/app/clientes', permissao: 'ver_clientes' },
  /* o Ponto (a folha de ponto) e o Ponto de encontro das obras, cada um
     com a permissao dele (atualizacao 55: a area Administrativo saiu) */
  { id: 'ponto', rotulo: 'Ponto', rota: '/app/ponto', permissao: 'ver_ponto', semTv: true },
  { id: 'encontros', icone: 'encontro', rotulo: 'Ponto de encontro', rota: '/app/encontros', permissao: 'ver_encontros', semTv: true },
  { id: 'despesas', rotulo: 'Reembolso', rota: '/app/despesas', permissao: 'ver_despesas' },
  { id: 'frotas', rotulo: 'Frotas', rota: '/app/frotas', permissao: 'ver_frotas' },
  /* o Almoxarife (o antigo lwncontrol) abre a tela dele, em /almoxarife */
  { id: 'almoxarife', rotulo: 'Almoxarife', rota: '/app/control', permissao: 'ver_almoxarife' },
  { id: 'comercial', rotulo: 'Comercial', rota: '/app/comercial', permissao: 'ver_comercial' },
  { id: 'turnos', rotulo: 'Turnos', rota: '/app/turnos', permissao: 'ver_turnos' },
  { id: 'avaliacoes', rotulo: 'Avaliações', rota: '/app/avaliacoes', permissao: 'ver_avaliacoes' },
  {
    id: 'usuarios',
    rotulo: 'Usuários',
    rota: '/app/usuarios',
    permissao: 'ver_usuarios',
  },
]

/* ------------------------------------------------------------
   As que ficam na barra do celular

   No computador a bolha e vertical e cabe o menu inteiro. No
   celular ela deita no rodape, e seis itens ali so cabiam rolando
   de lado — uma barra que rola e uma barra onde ninguem acha o
   quarto item, porque nada indica que ha um quarto item.

   Entao ficam as tres do dia a dia — Pagina inicial, Obras e
   Despesas — e, na ponta direita, o Menu (o hamburguer), que abre
   o MENU LATERAL pela direita com o resto: a foto, o nome e a
   avaliacao de quem esta logado, Configuracoes e as outras abas.
   ------------------------------------------------------------ */
const PRINCIPAIS = ['inicio', 'obras', 'despesas']

/* o item do menu que abre o pop-up do Solicitar OS, e nao uma tela */
const ID_SOLICITAR = 'solicitar'

/**
 * As abas do Almoxarife no menu completo (o hamburguer). Sao as do menu
 * dele (public/almoxarife/almoxarife.html), cada uma com a permissao
 * `almox_<modulo>` e o endereco que abre a aba direto
 * (public/almoxarife/endereco.js). O Solicitar mora no Atmosfera.
 */
const ALMOX_ABAS = [
  { id: 'almox-painel', rotulo: 'Painel', caminho: '', permissoes: ['almox_dashboard'] },
  { id: 'almox-retirada', rotulo: 'Retirada', caminho: '/retirada', permissoes: ['almox_conferencia'] },
  { id: 'almox-devolutiva', rotulo: 'Devolutiva', caminho: '/devolutiva', permissoes: ['almox_devolutiva'] },
  { id: 'almox-concluidos', rotulo: 'OS Concluídas', caminho: '/concluidos', permissoes: ['almox_concluidos'] },
  { id: 'almox-certificados', rotulo: 'Certificados', caminho: '/certificados', permissoes: ['almox_certificados'] },
  { id: 'almox-localizacao', rotulo: 'Localização', caminho: '/localizacao', permissoes: ['almox_baias'] },
  { id: 'almox-inventario', rotulo: 'Inventário', caminho: '/inventario', permissoes: ['almox_instrumentos'] },
  {
    id: 'almox-manutencao',
    rotulo: 'Manutenção',
    caminho: '/manutencao',
    permissoes: ['almox_manutencao', 'almox_manutencao_somente_leitura'],
  },
  { id: 'almox-remanejamento', rotulo: 'Remanejamento', caminho: '/remanejamento', permissoes: ['almox_remanejamento'] },
  { id: 'almox-calibracao', rotulo: 'Calibração', caminho: '/calibracao', permissoes: ['almox_calibracao'] },
]

/* Os icones das abas do Almoxarife, os mesmos do menu dele
   (public/almoxarife/almoxarife.html) — e o submenu do menu largo. */
const glifoAlmox = (conteudo) => () => (
  <svg viewBox="0 0 24 24" width="19" height="19" {...traco}>
    {conteudo}
  </svg>
)
const ICONE_ALMOX = {
  'almox-painel': glifoAlmox(
    <>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </>,
  ),
  'almox-retirada': glifoAlmox(
    <>
      <path d="M12 21l-8-4.5v-9l8-4.5 8 4.5v4.5" />
      <path d="M12 12l8-4.5M12 12v9M12 12 4 7.5M15 18h7M19 15l3 3-3 3" />
    </>,
  ),
  'almox-devolutiva': glifoAlmox(
    <>
      <path d="M9 10 4 15l5 5" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </>,
  ),
  'almox-concluidos': glifoAlmox(
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </>,
  ),
  'almox-certificados': glifoAlmox(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8" />
    </>,
  ),
  'almox-localizacao': glifoAlmox(
    <>
      <circle cx="12" cy="10" r="3" />
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
    </>,
  ),
  'almox-inventario': glifoAlmox(<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />),
  'almox-manutencao': glifoAlmox(
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  ),
  'almox-remanejamento': glifoAlmox(
    <>
      <path d="m17 1 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 23-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>,
  ),
  'almox-calibracao': glifoAlmox(
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>,
  ),
}

/* ------------------------------------------------------------
   O MENU LARGO (o "Mais" do alto da barra, no computador)

   A barra continua a mesma; o "Mais" a alarga, com o nome de cada aba ao
   lado do icone, e a PAGINA se ajusta a largura dela — nada fica atras de
   veu. Almoxarife e Administrativo viram areas com submenu: o clique abre,
   ao lado, as abas delas (SubmenuArea). A escolha fica guardada no aparelho
   e vale para todas as telas.
   ------------------------------------------------------------ */
const CHAVE_MENU_LARGO = 'customers.menu-largo'
let menuLargo = (() => {
  try {
    return localStorage.getItem(CHAVE_MENU_LARGO) === 'sim'
  } catch {
    return false
  }
})()

/* as areas com submenu no menu largo */
const AREAS_COM_SUBMENU = ['almoxarife']

/** O item entra no menu de quem esta logado? A mesma regra para todo menu. */
function itemVisivel(item, pode, painelTv) {
  if (item.semTv && painelTv) return false
  if (item.quandoNao && pode(item.quandoNao)) return false
  if (item.permissoes) return item.permissoes.some((p) => pode(p))
  return item.permissao ? pode(item.permissao) : true
}

/* ------------------------------------------------------------
   Onde o indicador estava na tela anterior

   Isto e uma variavel de MODULO, e nao um estado — de proposito.

   Cada tela monta o proprio AppShell (`<AppShell>` esta dentro de
   Home, de Obras, de Clientes...). Entao trocar de tela nao muda
   a barra: DESTROI uma e cria outra. O indicador que nasce ja
   nasce no lugar certo, e nunca houve o que animar — era essa a
   animacao "travada e seca": nao havia animacao nenhuma, so uma
   peca nova aparecendo no destino.

   Guardada fora do React, a posicao sobrevive a troca. A barra
   nova comeca onde a antiga terminou e so entao anda ate o novo
   item, que e o que se ve como deslizar.
   ------------------------------------------------------------ */
let ultimaMarca = { x: 0, y: 0, l: 0, a: 0, ix: 0, ergue: 0, pronta: false }

/* O item que estava ACESO na tela anterior. A tela nova nasce com ele
   aceso e so na moldura seguinte passa a acender o dela: e isso que da
   aos icones (e nao so ao indicador) o caminho de um item para o outro.
   Sem isso o icone novo ja nascia erguido e o antigo ja nascia no chao,
   enquanto o indicador ainda estava a caminho. */
let ultimoMostrado = null

/* a rolagem da lista do computador, pelo mesmo motivo: a barra nova
   nasceria rolada para o topo e o item clicado pularia de lugar */
let ultimaRolagem = 0

/** Qual item do menu corresponde ao endereco — a mesma regra do NavLink. */
function itemDaRota(abas, caminho) {
  const item = abas.find(
    (i) =>
      matchPath({ path: i.rota, end: Boolean(i.exato) }, caminho) ||
      (i.tambem ?? []).some((rota) => matchPath({ path: rota, end: false }, caminho)),
  )
  return item?.id ?? null
}

/* Posicao de `el` medida a partir da caixa de `ate`, somando os offsets.
   Offset e medida de LAYOUT: ignora transform, entao nem o icone erguido
   nem uma transicao pela metade entortam a conta. */
function posicaoDentro(el, ate) {
  let x = 0
  let y = 0
  let no = el
  while (no && no !== ate) {
    x += no.offsetLeft
    y += no.offsetTop
    no = no.offsetParent
  }
  return no === ate ? { x, y } : null
}

/** Avatar do rodape: abre o menu de Configuracoes / Sair. */
/**
 * `naBarra` e a copia que mora DENTRO da barra de cima, no celular.
 *
 * A outra copia flutua no canto, em `position: fixed`. Flutuando, ela
 * passava por cima do campo de busca — e onde ela cai depende do
 * recorte do aparelho (a area segura do iPhone), entao nao havia conta
 * que a deixasse alinhada em todo telefone.
 *
 * Dentro da barra ela e um item como os outros: nao ha o que alinhar, e
 * nao ha como sobrepor. As duas copias existem ao mesmo tempo no HTML e
 * o CSS mostra uma de cada vez — a do canto no computador, a da barra
 * no celular.
 */
function MenuUsuario({ naBarra = false }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [aberto, setAberto] = useState(false)
  const meuPainel = painelPorChave(user?.painel)
  /* sair fecha a sessao e leva embora o que estiver aberto: pergunta antes */
  const [saindo, setSaindo] = useState(false)
  const caixa = useRef(null)

  /* fecha ao clicar fora ou no Esc */
  useEffect(() => {
    if (!aberto) return undefined

    const foraDaCaixa = (evento) => {
      if (!caixa.current?.contains(evento.target)) setAberto(false)
    }
    const aoTeclar = (evento) => {
      if (evento.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', foraDaCaixa)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  const sair = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`euzinho ${naBarra ? 'euzinho--barra' : ''}`.trim()} ref={caixa}>
      {aberto && (
        <div className="euzinho__menu" role="menu">
          <p className="euzinho__quem">
            <strong>{user?.name ?? 'Usuário'}</strong>
            <span>{user?.cargoNome ?? user?.email ?? ''}</span>
          </p>
          {/* o painel do setor (atualizacao 53), logo acima de Configuracoes:
              leva ao inicio dele. Setor sem painel nao ve o botao */}
          {meuPainel && !user?.painelTv && (
            <button
              type="button"
              role="menuitem"
              className="euzinho__item"
              onClick={() => {
                setAberto(false)
                navigate(meuPainel.rota)
              }}
              title={`O painel do seu setor: ${meuPainel.rotulo}`}
            >
              <Icone.painel />
              Meu painel
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="euzinho__item"
            onClick={() => {
              setAberto(false)
              navigate('/app/configuracoes')
            }}
          >
            <Icone.config />
            Configurações
          </button>
          <button
            type="button"
            role="menuitem"
            className="euzinho__item euzinho__item--sair"
            onClick={() => {
              setAberto(false)
              setSaindo(true)
            }}
          >
            <Icone.sair />
            Sair
          </button>
        </div>
      )}

      <button
        type="button"
        className={`euzinho__botao ${aberto ? 'is-aberto' : ''}`.trim()}
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Conta e configurações"
        title={user?.name ?? 'Conta'}
      >
        <Avatar nome={user?.name} foto={user?.foto} tamanho={naBarra ? 32 : 40} />
      </button>

      <Confirma
        aberto={saindo}
        titulo="Sair do sistema?"
        tom="acao"
        rotuloConfirmar="Sair"
        aoConfirmar={sair}
        aoFechar={() => setSaindo(false)}
      />
    </div>
  )
}

/**
 * Sininho das notificacoes.
 *
 * O selo vermelho conta os avisos que chegaram para o SETOR de quem
 * esta logado e que ainda nao foram abertos. Abrir o painel marca
 * todos como lidos — que e o gesto que a pessoa espera.
 *
 * "Para o setor" e literal: quem e da Excelencia nao recebe a cobranca
 * de um check pendente do Comercial. Nao ha nada que essa pessoa possa
 * fazer a respeito, e um sino cheio de aviso de outro setor e um sino
 * que ninguem mais abre. Quem quiser a visao geral tem a coluna de
 * pendencias na tela de Obras. Quem decide isso e `minhasNotificacoes`,
 * no contexto.
 *
 * No alto do painel vem as SOLICITACOES: as inclusoes como membro
 * parcial de uma obra que esperam a resposta da pessoa (atualizacao
 * 30), com Aceitar e Recusar ali mesmo. Elas contam no selo e so saem
 * dali respondidas — abrir o sino nao as dispensa.
 */
function Notificacoes() {
  const navigate = useNavigate()
  const {
    minhasNotificacoes,
    naoLidas,
    marcarNotificacoesLidas,
    minhasSolicitacoes,
    clientePorId,
    cargoPorChave,
    rotuloEtapa,
  } = useDados()

  const [aberto, setAberto] = useState(false)
  const caixa = useRef(null)

  useEffect(() => {
    if (!aberto) return undefined

    const fora = (evento) => {
      if (!caixa.current?.contains(evento.target)) setAberto(false)
    }
    const tecla = (evento) => {
      if (evento.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  const abrir = () => {
    const proximo = !aberto
    setAberto(proximo)
    if (proximo && naoLidas > 0) marcarNotificacoesLidas()
  }

  const lista = minhasNotificacoes.slice(0, 20)
  const pedidos = minhasSolicitacoes ?? []
  /* o selo conta o que nao foi lido e o que espera resposta */
  const selo = naoLidas + pedidos.length

  return (
    <div className="sininho" ref={caixa}>
      <button
        type="button"
        className={`topbar__sino ${aberto ? 'is-aberto' : ''}`.trim()}
        onClick={abrir}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={
          selo > 0
            ? `Notificações — ${[
                naoLidas > 0 && `${naoLidas} não lidas`,
                pedidos.length > 0 && `${pedidos.length} ${pedidos.length === 1 ? 'solicitação' : 'solicitações'}`,
              ]
                .filter(Boolean)
                .join(', ')}`
            : 'Notificações'
        }
        title="Notificações"
      >
        <Icone.sino />
        {selo > 0 && (
          <span className="sininho__selo" aria-hidden="true">
            {selo > 99 ? '99+' : selo}
          </span>
        )}
      </button>

      {aberto && (
        <div className="sininho__painel" role="menu">
          <header className="sininho__topo">
            <h2>Notificações</h2>
            <span>{minhasNotificacoes.length + pedidos.length}</span>
          </header>

          {/* as inclusoes em obra que esperam resposta: no alto */}
          {pedidos.length > 0 && (
            <ul className="sininho__lista sininho__pedidos" aria-label="Solicitações">
              {pedidos.map((pedido) => {
                const cliente = clientePorId(pedido.clienteId)
                const obra = [cliente?.nome, pedido.proposta].filter(Boolean).join(' - ') || 'Obra'
                return (
                  <li key={`${pedido.obraId}-${pedido.usuarioId}`} className="sininho__pedido">
                    <span className="sininho__marca" data-tipo={pedido.obraTipo} aria-hidden="true" />
                    <div className="sininho__corpo">
                      <button
                        type="button"
                        className="sininho__obra"
                        onClick={() => {
                          setAberto(false)
                          navigate(`/app/obras/${pedido.obraId}`)
                        }}
                      >
                        Solicitação · {obra}
                      </button>
                      <PedidoInclusao pedido={pedido} obra={obra} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {lista.length === 0 ? (
            pedidos.length === 0 && <p className="sininho__vazio">Nenhuma notificação pendente.</p>
          ) : (
            <ul className="sininho__lista">
              {lista.map((aviso) => {
                const cliente = clientePorId(aviso.clienteId)
                const setores = aviso.setores
                  .map((s) => cargoPorChave(s)?.nome ?? s)
                  .join(', ')
                return (
                  <li key={aviso.id}>
                    <button
                      type="button"
                      className={`sininho__item ${aviso.lido ? '' : 'is-nova'}`.trim()}
                      onClick={() => {
                        setAberto(false)
                        navigate(`/app/obras/${aviso.obraId}`)
                      }}
                    >
                      <span className="sininho__marca" data-tipo={aviso.obraTipo} aria-hidden="true" />
                      <span className="sininho__corpo">
                        <strong>{cliente?.nome ?? 'Obra'}</strong>
                        <span className="sininho__texto">
                          {aviso.mensagem || `Pendência na ${rotuloEtapa(aviso.etapa)}.`}
                        </span>
                        <span className="sininho__meta">
                          {setores && <em>para {setores}</em>}
                          {aviso.enviadoPorNome && <em>por {aviso.enviadoPorNome}</em>}
                          <em>{dataHora(aviso.enviadoEm)}</em>
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * O SUBMENU de uma area no menu largo: o cartao que abre ao lado da barra,
 * na altura do item clicado, com as abas da area (Almoxarife ou
 * Administrativo) — so as que a permissao da pessoa abre. O titulo leva ao
 * inicio da area. Fecha no clique fora, no Esc, na setinha e ao trocar de
 * tela. As abas do Almoxarife sao links de pagina inteira.
 */
function SubmenuArea({ area, ancora, aoFechar }) {
  const { user } = useAuth()
  const { pode } = useDados()
  const caixa = useRef(null)

  useEffect(() => {
    const fora = (e) => {
      if (caixa.current?.contains(e.target) || e.target.closest?.('[data-submenu]')) return
      aoFechar()
    }
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    /* a janela mudou: a altura do item de onde ele saiu tambem */
    window.addEventListener('resize', aoFechar)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', aoFechar)
    }
  }, [aoFechar])

  const ve = (item) => itemVisivel(item, pode, user?.painelTv)
  /* hoje a unica area com submenu e o Almoxarife */
  const itens = ALMOX_ABAS.filter(ve).map((aba) => ({ ...aba, href: `/core/app/control${aba.caminho}`, Glifo: ICONE_ALMOX[aba.id] }))
  const Titulo = Icone[area]

  /* na altura do item; perto do pe da tela, sobe ate caber */
  const alto = 64 + itens.length * 38
  const top = Math.max(12, Math.min(ancora.top - 6, window.innerHeight - alto - 12))
  const classe = ({ isActive }) => `submenu__item ${isActive ? 'is-atual' : ''}`.trim()

  return (
    <div className="submenu" role="menu" ref={caixa} style={{ top, left: ancora.right + 12 }}>
      <header className="submenu__topo">
        <span className="submenu__icone" aria-hidden="true">
          <Titulo />
        </span>
        <a href="/core/app/control" className="submenu__titulo">
          Almoxarife
        </a>
        <button type="button" className="submenu__fechar" onClick={aoFechar} aria-label="Fechar o submenu">
          <Icone.chevron />
        </button>
      </header>
      {itens.length === 0 ? (
        <p className="submenu__vazio">Nenhuma aba liberada para você aqui.</p>
      ) : (
        <ul className="submenu__lista">
          {itens.map(({ id, rotulo, href, rota, exato, Glifo }) => (
            <li key={id}>
              {href ? (
                <a href={href} className="submenu__item" role="menuitem">
                  <span className="submenu__glifo">{Glifo && <Glifo />}</span>
                  {rotulo}
                </a>
              ) : (
                <NavLink to={rota} end={exato} className={classe} role="menuitem" onClick={aoFechar}>
                  <span className="submenu__glifo">{Glifo && <Glifo />}</span>
                  {rotulo}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * O MENU COMPLETO, o do hamburguer: o sistema inteiro, dividido pelas
 * areas — Atmosfera (as abas de sempre), Administrativo e Almoxarife —,
 * cada uma so com o que a permissao de visualizacao da pessoa abre. Area
 * sem nenhum item nao aparece.
 *
 * No computador o hamburguer fica no alto da barra e o menu abre pela
 * esquerda, por cima dela; no celular ele e o Menu da barra de baixo e
 * abre pela direita, com a foto, o nome e a avaliacao de quem esta
 * logado no alto. "Voltar" (ou o veu, ou o Esc) fecha; trocar de tela
 * tambem.
 *
 * As abas do Almoxarife sao links de pagina inteira: a tela dele mora
 * fora do React (/core/app/control).
 *
 * Fica MONTADO mesmo fechado (escondido por visibility): desmontando, o
 * fechar seria instantaneo, sem o painel deslizar de volta.
 */
function MenuCompleto({ aberto, aoFechar, aoSolicitar }) {
  const { user } = useAuth()
  const { mediaDoUsuario, pode } = useDados()
  const { media, obrasAvaliadas } = mediaDoUsuario(user?.id)
  const painel = useRef(null)

  useEffect(() => {
    if (!aberto) return undefined
    painel.current?.focus()
    const tecla = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aberto, aoFechar])

  const secoes = useMemo(() => {
    const ve = (item) => itemVisivel(item, pode, user?.painelTv)
    /* o Almoxarife do Atmosfera vira a area dele, logo abaixo */
    const atmosfera = MENU.filter((item) => item.id !== 'almoxarife' && ve(item))
    const almoxarife = pode('ver_almoxarife')
      ? ALMOX_ABAS.filter(ve).map((aba) => ({ ...aba, href: `/core/app/control${aba.caminho}` }))
      : []
    return [
      { id: 'atmosfera', titulo: 'Atmosfera', itens: atmosfera },
      { id: 'almoxarife', titulo: 'Almoxarife', itens: almoxarife },
    ].filter((s) => s.itens.length > 0)
  }, [pode, user?.painelTv])

  const fora = aberto ? undefined : -1
  const classe = ({ isActive }) => `menutudo__item ${isActive ? 'is-atual' : ''}`.trim()

  return (
    <div className={`menutudo ${aberto ? 'is-aberto' : ''}`.trim()} aria-hidden={!aberto}>
      <button type="button" className="menutudo__veu" tabIndex={-1} aria-label="Fechar o menu" onClick={aoFechar} />
      <aside className="menutudo__painel" id="menu-completo" aria-label="Menu completo" tabIndex={-1} ref={painel}>
        <button type="button" className="menutudo__voltar" onClick={aoFechar} tabIndex={fora}>
          <svg viewBox="0 0 24 24" width="18" height="18" {...traco} strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Voltar
        </button>

        {/* so no celular: quem esta logado (no computador a foto mora no canto) */}
        <header className="menutudo__perfil">
          <Avatar nome={user?.name} foto={user?.foto} tamanho={46} />
          <div className="menutudo__quem">
            <strong>{user?.name ?? 'Usuário'}</strong>
            {media === null ? (
              <span className="menutudo__nota">Sem avaliação ainda</span>
            ) : (
              <span className="menutudo__nota">
                <Estrelas nota={media} tamanho={13} />
                <b>{media.toFixed(1)}</b>
                <em>
                  {obrasAvaliadas} obra{obrasAvaliadas === 1 ? '' : 's'}
                </em>
              </span>
            )}
          </div>
        </header>

        <nav className="menutudo__secoes" aria-label="Todas as telas">
          {secoes.map((secao) => (
            <section key={secao.id} className="menutudo__secao" aria-labelledby={`menutudo-${secao.id}`}>
              <h2 id={`menutudo-${secao.id}`} className="menutudo__titulo">
                {secao.titulo}
              </h2>
              <ul className="menutudo__lista">
                {secao.itens.map((item) => (
                  <li key={item.id}>
                    {item.id === ID_SOLICITAR ? (
                      <button type="button" className="menutudo__item" onClick={aoSolicitar} tabIndex={fora}>
                        {item.rotulo}
                      </button>
                    ) : item.href ? (
                      <a href={item.href} className="menutudo__item" tabIndex={fora}>
                        {item.rotulo}
                      </a>
                    ) : (
                      <NavLink to={item.rota} end={item.exato} className={classe} onClick={aoFechar} tabIndex={fora}>
                        {item.rotulo}
                      </NavLink>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <footer className="menutudo__rodape">
          <NavLink to="/app/configuracoes" className={classe} onClick={aoFechar} tabIndex={fora}>
            <Icone.config />
            Configurações
          </NavLink>
        </footer>
      </aside>
    </div>
  )
}

/* ---------------- onde o botao mora ----------------

   O canto inferior direito e o padrao, e continua sendo: quem nunca
   arrastar nunca vai saber que da. Mas o botao flutua POR CIMA da tela,
   e numa tabela larga ele acaba pousando justo sobre a ultima coluna —
   dai a vontade de empurrar o botao para o lado, e nao de mudar a
   tabela de lugar.

   A posicao e guardada como o canto superior esquerdo do botao, em
   pixels. Guardar "encostado a direita" seria mais elegante, mas o
   botao pode parar no meio da tela: nao ha borda a que se referir. */
const CANTO = 'customers.bolhachat-posicao'
const BORDA = 12
/* o menu tem ~200px de altura e 210px de largura, contra 54px de botao:
   ele sobra uns 160px para o lado de fora */
const MENU_ALTO = 220
const MENU_SOBRA = 170

function lerCanto() {
  try {
    const cru = JSON.parse(localStorage.getItem(CANTO) ?? 'null')
    if (!cru || typeof cru.x !== 'number' || typeof cru.y !== 'number') return null
    return cru
  } catch {
    return null
  }
}

/* a janela encolhe e o botao guardado ficaria do lado de fora, sem
   volta: todo ponto e trazido para dentro antes de virar estilo */
function dentroDaTela({ x, y }, larg, alt) {
  return {
    x: Math.min(Math.max(BORDA, x), Math.max(BORDA, window.innerWidth - larg - BORDA)),
    y: Math.min(Math.max(BORDA, y), Math.max(BORDA, window.innerHeight - alt - BORDA)),
  }
}

/**
 * O botao redondo do canto inferior direito.
 *
 * E SEMPRE o "+" com menu, em todas as abas: o chat da equipe e uma das
 * opcoes, e as outras dependem da tela e de quem esta nela — a
 * observacao do quadro em Obras, o "Enviar aviso" para quem tem
 * `publicar_avisos`. Antes, sem opcao extra, ele era o atalho direto do
 * chat (o balao), e o mesmo botao mudava de cara de uma aba para outra.
 *
 * O Chat LWN (o bot) saiu do menu: o componente e a rota /api/bot
 * continuam no codigo, so nao ha mais por onde abri-lo.
 *
 * Dentro de uma obra ele nao aparece: la o chat que vale e o da obra, e
 * dois botoes de chat na mesma tela so confundiriam.
 */
function BotaoChat({ acoes = [], aoAbrirChat, naoLidas = 0 }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef(null)
  const [canto, setCanto] = useState(lerCanto)
  /* o arrasto em curso; enquanto vale, o clique nao conta */
  const arrasto = useRef(null)
  /* quando o ultimo arrasto terminou. O clique que o navegador dispara
     no fim de um arrasto chega logo depois do pointerup: e por essa
     distancia no relogio que ele e reconhecido e descartado. */
  const fimDoArrasto = useRef(0)



  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => {
      if (!caixa.current?.contains(e.target)) setAberto(false)
    }
    const tecla = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  /* a janela mudou de tamanho: o botao volta para dentro dela */
  useEffect(() => {
    if (!canto) return undefined
    const caber = () => {
      const alvo = caixa.current
      if (!alvo) return
      const r = alvo.getBoundingClientRect()
      setCanto((atual) => (atual ? dentroDaTela(atual, r.width, r.height) : atual))
    }
    window.addEventListener('resize', caber)
    return () => window.removeEventListener('resize', caber)
  }, [canto])

  /**
   * Arrastar o botao.
   *
   * O mesmo gesto que abre o chat e o que muda o botao de lugar, entao
   * um dos dois tem de ceder: ate 4px de caminho ainda e um clique
   * (ninguem acerta o pixel), e do quinto em diante vira arrasto e o
   * clique nao acontece mais. E a mesma regra que a ilha do topo usa
   * para nao confundir toque com rolagem.
   */
  const pegar = (evento) => {
    const alvo = caixa.current
    if (!alvo || evento.button !== 0) return
    const r = alvo.getBoundingClientRect()
    arrasto.current = {
      dx: evento.clientX - r.left,
      dy: evento.clientY - r.top,
      larg: r.width,
      alt: r.height,
      andou: false,
      onde: null,
    }

    const mover = (e) => {
      const a = arrasto.current
      if (!a) return
      if (
        !a.andou &&
        Math.abs(e.clientX - (r.left + a.dx)) < 4 &&
        Math.abs(e.clientY - (r.top + a.dy)) < 4
      ) {
        return
      }
      a.andou = true
      /* o menu aberto atrapalha a mira: ele fecha no primeiro milimetro */
      setAberto(false)
      a.onde = dentroDaTela({ x: e.clientX - a.dx, y: e.clientY - a.dy }, a.larg, a.alt)
      setCanto(a.onde)
    }

    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      const a = arrasto.current
      if (a?.andou && a.onde) {
        fimDoArrasto.current = Date.now()
        try {
          localStorage.setItem(CANTO, JSON.stringify(a.onde))
        } catch {
          /* sem storage o lugar novo vale ate recarregar */
        }
      }
      arrasto.current = null
    }

    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  /* dois cliques na bolha devolvem o canto de fabrica */
  const devolver = () => {
    setCanto(null)
    try {
      localStorage.removeItem(CANTO)
    } catch {
      /* sem storage nao ha o que limpar */
    }
  }

  /* De onde o menu sai. Ele nasce ACIMA do botao e alinhado pela
     direita, que e o certo no canto de origem. Arrastado para perto do
     topo ou da borda esquerda, essa mesma abertura cairia fora da tela
     — as medidas abaixo sao a altura e a sobra lateral do menu, e nao a
     metade da tela: o que decide e se o menu CABE, nao em que lado do
     monitor o botao esta. */
  const lados = canto
    ? `${canto.y < MENU_ALTO ? 'is-parabaixo' : ''} ${
        canto.x < MENU_SOBRA ? 'is-esquerda' : ''
      }`.trim()
    : ''

  const itens = [
    ...acoes,
    {
      id: 'chat',
      rotulo: naoLidas > 0 ? `Chat da equipe (${naoLidas > 99 ? '99+' : naoLidas})` : 'Chat da equipe',
      Glifo: Icone.chatPequeno,
      aoClicar: aoAbrirChat,
    },
  ]

  return (
    <div
      className={`bolhachat ${lados}`.trim()}
      ref={caixa}
      style={canto ? { left: canto.x, top: canto.y, right: 'auto', bottom: 'auto' } : undefined}
    >
      {aberto && (
        <div className="bolhachat__menu" role="menu">
          {itens.map(({ id, rotulo, Glifo, aoClicar }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className="bolhachat__item"
              onClick={() => {
                setAberto(false)
                aoClicar()
              }}
            >
              <Glifo />
              {rotulo}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className={`bolhachat__botao ${aberto ? 'is-aberto' : ''}`.trim()}
        onPointerDown={pegar}
        onDoubleClick={devolver}
        onClick={() => {
          /* o botao andou junto com o ponteiro, entao o clique do fim do
             arrasto cai nele mesmo — e abriria o menu a cada vez que
             alguem so quis mudar o botao de lugar */
          if (Date.now() - fimDoArrasto.current < 300) return
          setAberto((v) => !v)
        }}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Abrir o menu: ${itens.map((i) => i.rotulo.replace(/ \(\d+\+?\)$/, '').toLowerCase()).join(', ')}${
          naoLidas > 0 ? ` — ${naoLidas} ${naoLidas === 1 ? 'mensagem não lida' : 'mensagens não lidas'}` : ''
        }`}
        title="Adicionar — arraste para mudar de lugar, dois cliques voltam ao canto"
      >
        <Icone.mais />
        {/* as mensagens do chat da equipe que a pessoa ainda nao leu */}
        {naoLidas > 0 && (
          <span className="bolhachat__selo" aria-hidden="true">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>
    </div>
  )
}

/**
 * `semChat` tira o botao flutuante da tela — e o que a tela da obra usa,
 * porque la o chat que vale e o da obra, e a propria tela do chat da
 * equipe. Fora delas, o botao e o "+" com menu: o chat da equipe
 * (/app/chat), o "Enviar aviso" (`publicar_avisos`), o "Marcar evento"
 * (`publicar_agenda`) e o que a tela acrescentar.
 *
 * `acoesFlutuantes` acrescenta opcoes da propria tela ao menu do botao
 * (a observacao do quadro, em Obras).
 */
export default function AppShell({
  children,
  busca,
  aoBuscar,
  placeholderBusca,
  semChat = false,
  acoesFlutuantes = [],
}) {
  const { user } = useAuth()
  const { isDark } = useTheme()
  const { erro, limparErro, pode } = useDados()
  const navegar = useNavigate()
  /* fora da tela do chat, o botao mostra quantas mensagens faltam ler */
  const naoLidas = useNaoLidasChat(!semChat)
  /* o pop-up do "Enviar aviso", aberto pelo menu do botao + */
  const [enviandoAviso, setEnviandoAviso] = useState(false)
  /* o "Marcar evento": null fechado, {} evento novo. Fica no estado para o
     objeto ser o mesmo a cada render (uma recarga nao limpa o formulario) */
  const [eventoNovo, setEventoNovo] = useState(null)
  /* o quadro de avisos e a agenda sao de quem a PESSOA pode publicar
     (atualizacao 53), e nao do setor */
  const podeAvisar = pode('publicar_avisos')
  const podeMarcarEvento = pode('publicar_agenda')
  /* as notificacoes no celular se ligam sozinhas (o aparelho pergunta no
     primeiro clique, uma vez): nao ha cartao em Configuracoes */
  useNotificacoesAutomaticas(Boolean(user))

  /* o toque numa notificacao do celular com o app ja aberto: o service
     worker manda o endereco, e a tela troca sem recarregar o app */
  useEffect(() => {
    const sw = navigator.serviceWorker
    if (!sw) return undefined
    const abrir = (e) => {
      if (e.data?.tipo !== 'abrir' || !e.data.url) return
      const caminho = new URL(e.data.url, window.location.origin).pathname.replace(/^\/core/, '')
      navegar(caminho || '/app')
    }
    sw.addEventListener('message', abrir)
    return () => sw.removeEventListener('message', abrir)
  }, [navegar])

  /* a tela pode assumir o campo de busca; se nao assumir, ele e do
     sistema e abre a lista de resultados por conta propria */
  const controlada = typeof busca === 'string'

  const principais = PRINCIPAIS

  /* cada cargo enxerga so as abas que a permissao dele abre */
  const abas = useMemo(
    () => MENU.filter((item) => itemVisivel(item, pode, user?.painelTv)),
    [pode, user?.painelTv],
  )

  /* O MENU LARGO (o "Mais"): a barra com o nome das abas e a pagina
     ajustada a ela. A escolha fica guardada no aparelho. */
  const [largo, setLargo] = useState(menuLargo)
  const alternarLargo = () =>
    setLargo((atual) => {
      const novo = !atual
      menuLargo = novo
      try {
        localStorage.setItem(CHAVE_MENU_LARGO, novo ? 'sim' : 'nao')
      } catch {
        /* sem storage, vale ate recarregar */
      }
      return novo
    })
  /* as abas da barra: as mesmas no menu largo e no de sempre */
  const abasNaBarra = abas
  /* o submenu aberto de uma area: { area, ancora } */
  const [submenu, setSubmenu] = useState(null)
  const fecharSubmenu = useCallback(() => setSubmenu(null), [])
  const comSubmenu = (item) => largo && AREAS_COM_SUBMENU.includes(item.id)

  /* A ilha do aviso de senha. So no modo APLICATIVO — ver o comentario
     la embaixo, onde ela e desenhada. O shell precisa saber disso aqui
     em cima porque e ele quem reserva o espaco dela no alto da tela. */
  const avisoDeSenha = Boolean(user?.senhaTemporaria) && ehAplicativo()

  /* ------------------------------------------------------------
     Onde a marca do item atual tem que estar

     A posicao e medida do proprio botao, nao calculada de indice
     vezes altura: no celular a barra deita e os itens rolam por
     dentro dela, entao a conta daria errado. Ler o offset resolve
     os dois sentidos com o mesmo codigo.

     `pronta` so vira true depois da PRIMEIRA medida. Sem isso a
     marca entrava deslizando do canto 0,0 a cada carga de tela.
     ------------------------------------------------------------ */
  const barra = useRef(null)
  const lista = useRef(null)
  const local = useLocation()
  const [marca, setMarca] = useState(ultimaMarca)
  /* o menu completo do hamburguer (MenuCompleto): o alto da barra no
     computador, o Menu da barra de baixo no celular */
  const [gaveta, setGaveta] = useState(false)
  const fecharGaveta = useCallback(() => setGaveta(false), [])
  /* o pop-up do "Solicitar" do menu */
  const [solicitando, setSolicitando] = useState(false)

  /* O item da tela aberta, e o item que esta ACESO. Sao dois porque a
     tela nova nasce com o aceso da anterior (ver `ultimoMostrado`) e so
     depois de desenhada passa ao dela — e essa troca, com a barra ja na
     tela, que as transicoes do CSS conseguem animar. */
  const ativo = itemDaRota(abas, local.pathname)
  const [mostrado, setMostrado] = useState(() =>
    ultimoMostrado && abas.some((i) => i.id === ultimoMostrado) ? ultimoMostrado : ativo,
  )

  useEffect(() => {
    ultimoMostrado = mostrado
  }, [mostrado])

  /* As transicoes de lugar so ligam depois da primeira pintura. Na
     primeira carga do sistema o indicador nao tem de onde vir: sem
     esta trava ele entraria deslizando do canto esquerdo da barra. */
  const [viaja, setViaja] = useState(false)
  useEffect(() => {
    const quadro = requestAnimationFrame(() => setViaja(true))
    return () => cancelAnimationFrame(quadro)
  }, [])

  /* Duas molduras, e nao uma: a primeira ainda cai antes da pintura
     da barra nova, e trocar ali seria trocar sem ter desenhado o
     ponto de partida — o indicador nasceria no destino. */
  useEffect(() => {
    if (mostrado === ativo) return undefined
    let segunda = 0
    const primeira = requestAnimationFrame(() => {
      segunda = requestAnimationFrame(() => setMostrado(ativo))
    })
    return () => {
      cancelAnimationFrame(primeira)
      cancelAnimationFrame(segunda)
    }
  }, [ativo, mostrado])

  /* trocou de tela, fecha: deixar aberta esconderia a tela que a
     pessoa acabou de escolher */
  useEffect(() => {
    setGaveta(false)
    setSubmenu(null)
  }, [local.pathname])

  /* o menu encolheu: o submenu fica sem a area de onde saiu */
  useEffect(() => {
    if (!largo) setSubmenu(null)
  }, [largo])

  /* a lista do computador volta rolada onde a anterior estava */
  useLayoutEffect(() => {
    const caixa = lista.current
    if (!caixa) return undefined
    caixa.scrollTop = ultimaRolagem
    const guardar = () => {
      ultimaRolagem = caixa.scrollTop
    }
    caixa.addEventListener('scroll', guardar, { passive: true })
    return () => caixa.removeEventListener('scroll', guardar)
  }, [])

  useLayoutEffect(() => {
    const nav = barra.current
    const caixa = lista.current
    if (!nav || !caixa) return undefined

    /* guarda fora do React antes de avisar o React: e essa copia que a
       proxima tela vai encontrar ao montar */
    const aplicar = (nova) => {
      ultimaMarca = nova
      setMarca((atual) =>
        Object.keys(nova).every((k) => atual[k] === nova[k]) ? atual : nova,
      )
    }

    const medir = () => {
      const btn = mostrado
        ? caixa.querySelector(`li[data-id="${mostrado}"] > .rail__btn`)
        : null
      const glifo = btn?.querySelector('.rail__glifo')

      /* O quanto o centro do circulo fica ABAIXO da borda de cima da
         barra. Mora no CSS (`--afunda`), junto do desenho das curvas
         que dependem dele; aqui so e lido. */
      const estilo = getComputedStyle(nav)
      const afunda = parseFloat(estilo.getPropertyValue('--afunda')) || 0

      /* `offsetParent` nulo = o botao esta escondido. Acontece no
         celular quando a tela aberta e uma das que foram para a
         gaveta: o indicador apaga no lugar onde estava, em vez de
         encolher para o canto 0,0. */
      const noGlifo = glifo && btn.offsetParent !== null ? posicaoDentro(glifo, nav) : null
      if (!noGlifo) {
        aplicar({ ...ultimaMarca, pronta: false })
        return
      }

      /* Tudo sai do CENTRO do icone, medido na caixa da barra — a
         mesma caixa em que o indicador e posicionado. Medir na lista
         (como antes) deixava o indicador deslocado o tamanho do
         recheio da barra. */
      const cx = noGlifo.x + glifo.offsetWidth / 2
      const cy = noGlifo.y + glifo.offsetHeight / 2

      /* O batente: a curva lateral do indicador pinta ~7px alem do
         circulo, e perto das pontas ela sairia pela quina arredondada
         da barra. So pesa em telas abaixo de ~340px. */
      const meia = 28
      const folga = 14
      const ix = Math.min(Math.max(cx, folga + meia), nav.clientWidth - folga - meia)

      aplicar({
        x: btn.offsetLeft,
        y: btn.offsetTop,
        l: btn.offsetWidth,
        a: btn.offsetHeight,
        ix,
        /* quanto o icone precisa subir para o centro dele cair no
           centro do indicador — que fica `afunda` px abaixo da borda
           de cima da barra, e nao em cima dela: so um pouco para fora */
        ergue: cy - afunda,
        pronta: true,
      })
    }

    medir()

    /* a barra muda de forma na virada para o celular e quando a janela
       muda de largura: a marca tem que reencontrar o botao */
    const observador = new ResizeObserver(medir)
    observador.observe(nav)
    observador.observe(caixa)
    return () => observador.disconnect()
  }, [mostrado, abasNaBarra])

  return (
    <div
      className={`shell ${avisoDeSenha ? 'tem-ilha' : ''} ${gaveta ? 'tem-gaveta' : ''} ${largo ? 'tem-menu-largo' : ''}`
        .replace(/\s+/g, ' ')
        .trim()}
    >
      {/* logo e avatar vivem fora da bolha, mas alinhados ao centro dela */}
      <Link to="/app" className="marca" aria-label="Página inicial">
        <img src={isDark ? logoModoEscuro : logoModoClaro} alt="LWN" />
      </Link>

      <nav
        ref={barra}
        className={`rail vidro ${viaja ? 'is-viaja' : ''}`.trim()}
        aria-label="Navegação principal"
        /* as medidas do item atual moram na BARRA, e nao so na marca:
           o indicador do celular le as mesmas para saber onde pousar.
           `--marca-*` e o botao inteiro, medido na lista (anel do
           computador); `--ind-x` e `--ergue` sao o centro do icone,
           medido na propria barra (indicador do celular). */
        style={{
          '--marca-x': `${marca.x}px`,
          '--marca-y': `${marca.y}px`,
          '--marca-l': `${marca.l}px`,
          '--marca-a': `${marca.a}px`,
          '--ind-x': `${marca.ix}px`,
          ...(marca.ergue ? { '--ergue': `${marca.ergue}px` } : null),
        }}
      >
        {/* ---------------- o indicador (so no celular) ----------------

            Um circulo DA COR DA BARRA que desliza ate o item escolhido.
            Ele sobe metade para fora da faixa, e duas pecas nas laterais
            preenchem o vinco que sobraria entre o circulo e a linha reta
            da barra — e o que faz a silhueta subir em curva em vez de
            ter um circulo encostado num retangulo.

            A cor viva nao esta aqui: quem acende e o PROPRIO icone do
            item, que sobe para dentro deste circulo um instante depois
            de ele chegar. Essa espera e o efeito. */}
        <span
          className={`rail__indicador ${marca.pronta ? 'is-pronta' : ''}`.trim()}
          aria-hidden="true"
        />

        {/* O "Mais" do computador, no alto da barra: alarga o menu, com o
            nome de cada aba, e a pagina se ajusta (o "Menos" volta). No
            celular quem abre o menu inteiro e o Menu da barra de baixo. */}
        <button
          type="button"
          className="rail__btn rail__tudo"
          onClick={alternarLargo}
          aria-expanded={largo}
          title={largo ? 'Encolher o menu' : 'Mostrar o menu com os nomes das abas'}
        >
          <span className="rail__glifo rail__seta">
            <Icone.seta />
          </span>
          <span className="rail__rotulo">{largo ? 'Menos' : 'Mais'}</span>
        </button>

        <ul className="rail__lista" ref={lista}>
          {/* Uma peca so, que MUDA DE LUGAR — e o que faz o anel deslizar de
              um item para o outro em vez de piscar no destino. Ela e irma dos
              botoes, nao filha: se cada botao tivesse o seu, nao haveria o
              que animar entre eles. */}
          <span
            className={`rail__marca ${marca.pronta ? 'is-pronta' : ''}`.trim()}
            aria-hidden="true"
          >
            <span className="rail__marca-anel" />
          </span>

          {abasNaBarra.map((item) => {
            const Glifo = Icone[item.icone ?? item.id]
            /* no menu largo, Almoxarife e Administrativo abrem o submenu */
            if (comSubmenu(item)) {
              const aberto = submenu?.area === item.id
              return (
                <li key={item.id} data-id={item.id} data-principal="nao">
                  <button
                    type="button"
                    className={`rail__btn rail__area ${aberto ? 'is-aberta' : ''}`.trim()}
                    data-submenu
                    aria-haspopup="menu"
                    aria-expanded={aberto}
                    onClick={(e) => {
                      const ancora = e.currentTarget.getBoundingClientRect()
                      setSubmenu((atual) => (atual?.area === item.id ? null : { area: item.id, ancora }))
                    }}
                  >
                    <span className="rail__glifo">
                      <Glifo />
                    </span>
                    <span className="rail__rotulo">{item.rotulo}</span>
                    <span className="rail__chevron" aria-hidden="true">
                      <Icone.chevron />
                    </span>
                  </button>
                </li>
              )
            }
            /* o Solicitar abre o pop-up do pedido, sem sair da tela */
            if (item.id === ID_SOLICITAR) {
              return (
                <li key={item.id} data-id={item.id} data-principal="nao">
                  <button type="button" className="rail__btn" title={item.rotulo} onClick={() => setSolicitando(true)}>
                    <span className="rail__glifo">
                      <Glifo />
                    </span>
                    <span className="rail__rotulo">{item.rotulo}</span>
                  </button>
                </li>
              )
            }
            return (
              /* `data-principal` e o que o CSS le para esconder, no
                 celular, quem nao e uma das tres */
              <li
                key={item.id}
                data-id={item.id}
                data-principal={principais.includes(item.id) ? 'sim' : 'nao'}
              >
                <NavLink
                  to={item.rota}
                  end={item.exato}
                  /* aceso pelo `mostrado`, e nao pelo `isActive`: ver o
                     comentario de `ultimoMostrado`. O aria-current do
                     NavLink continua seguindo a rota de verdade. */
                  className={`rail__btn ${item.id === mostrado ? 'is-atual' : ''}`.trim()}
                  title={item.rotulo}
                >
                  <span className="rail__glifo">
                    <Glifo />
                  </span>
                  <span className="rail__rotulo">{item.rotulo}</span>
                </NavLink>
              </li>
            )
          })}

          {/* O Menu (hamburguer). So aparece no celular, na PONTA
              DIREITA da barra, com cara de item como os outros. Abre o
              menu completo: todas as areas e Configuracoes. */}
          <li className="rail__somobile">
            <button
              type="button"
              className="rail__btn rail__menu"
              onClick={() => setGaveta((v) => !v)}
              aria-expanded={gaveta}
              aria-controls="menu-completo"
              title="Menu"
            >
              <span className="rail__glifo">
                <Icone.hamburguer />
              </span>
              <span className="rail__rotulo">Menu</span>
            </button>
          </li>
        </ul>

      </nav>

      <MenuCompleto
        aberto={gaveta}
        aoFechar={fecharGaveta}
        aoSolicitar={() => {
          fecharGaveta()
          setSolicitando(true)
        }}
      />
      <ModalSolicitarOS aberto={solicitando} aoFechar={() => setSolicitando(false)} />

      {submenu && <SubmenuArea area={submenu.area} ancora={submenu.ancora} aoFechar={fecharSubmenu} />}

      <MenuUsuario />

      <div className="shell__coluna">
        <header className="topbar vidro">
          <p className="topbar__saudacao">
            {/* a TV da empresa fala com todo mundo de uma vez */}
            {saudacao()}, <strong>{user?.painelTv ? 'Time' : primeiroNome(user?.name)}</strong>!
          </p>

          {/* Procura em cliente, obra, pessoa, tela e ajuste de uma vez
              só. A tela que quiser o campo para si passa `busca` e
              `aoBuscar`; sem isso ele é do sistema inteiro. */}
          <Busca
            valor={controlada ? busca : undefined}
            aoMudar={controlada ? aoBuscar : undefined}
            placeholder={placeholderBusca}
          />

          {/* a escolha de tema mora so em Configuracoes > Aparencia */}
          <div className="topbar__acoes">
            <Notificacoes />
            <MenuUsuario naBarra />
          </div>
        </header>

        {/* falha de gravacao aparece aqui, em cima de qualquer tela */}
        {erro && (
          <p className="shell__erro" role="alert">
            {erro}
            <button type="button" onClick={limparErro} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}

        <main className="shell__conteudo">{children}</main>
      </div>

      {!semChat && (
        <BotaoChat
          acoes={[
            ...acoesFlutuantes,
            /* o aviso para a empresa inteira, que cai no Panorama, e o evento
               da agenda: cada um de quem a PESSOA pode publicar */
            ...(podeAvisar
              ? [{ id: 'aviso', rotulo: 'Enviar aviso', Glifo: Icone.megafone, aoClicar: () => setEnviandoAviso(true) }]
              : []),
            ...(podeMarcarEvento
              ? [{ id: 'evento', rotulo: 'Marcar evento', Glifo: Icone.calendario, aoClicar: () => setEventoNovo({}) }]
              : []),
          ]}
          aoAbrirChat={() => navegar('/app/chat')}
          naoLidas={naoLidas}
        />
      )}

      {podeAvisar && <ModalAvisoGeral aberto={enviandoAviso} aoFechar={() => setEnviandoAviso(false)} />}
      {podeMarcarEvento && <ModalEvento evento={eventoNovo} aoFechar={() => setEventoNovo(null)} />}

      {/* senha padrao e cadastro incompleto: uma vez a cada entrada no site */}
      <AvisoEntrada />

      {/* ---------------- a senha ainda e a padrao ----------------

          `senhaTemporaria` vem do banco (usuario.senha_temporaria) e so
          cai quando a pessoa troca a senha de verdade — trocar pela tela
          ou pelo "esqueci minha senha" zera a coluna. Enquanto ela for
          true a ilha esta aqui, em TODA tela de dentro do sistema,
          porque o AppShell e o que toda tela veste.

          Nao ha como dispensar o aviso: "Agora nao" recolhe a ilha para
          a pilula e ela continua no alto da tela. Senha que outra pessoa
          escolheu e senha que outra pessoa sabe.

          SO NO IPHONE. A ilha e a citacao de uma peca que so existe la:
          no iPhone ela pousa onde o aparelho ja tem uma, e a pessoa
          reconhece o gesto antes de ler o texto.

          SO NO MODO APLICATIVO. No navegador comum ela dividia o alto
          da tela com a barra de endereco e com a propria barra de
          busca do sistema, e o que se via era uma pastilha preta por
          cima do campo de procurar. Instalado na tela de inicio nao ha
          barra de endereco: o alto da tela e so do aviso, e o resto do
          sistema comeca abaixo dele (ver `.shell.tem-ilha` no CSS).

          O aviso nao se perde para quem usa pelo navegador: o bloco
          Senha, em Configuracoes, diz a mesma coisa em toda tela e em
          todo aparelho. */}
      {avisoDeSenha && (
        <IlhaAviso
          chave="customers.ilha-senha"
          Glifo={Icone.cadeado}
          titulo="Troque a sua senha"
          subtitulo="A senha que você está usando foi definida por outra pessoa e continua valendo. Este aviso fica aqui até você criar a sua."
          acoes={[
            {
              id: 'trocar',
              rotulo: 'Trocar a senha agora',
              Glifo: Icone.cadeado,
              /* leva ate o bloco Senha em Configuracoes e o acende la */
              aoClicar: () => navegar('/app/configuracoes', { state: { focar: 'senha' } }),
            },
            {
              id: 'depois',
              rotulo: 'Agora não',
              Glifo: Icone.relogio,
              /* sem acao: recolher para a pilula ja e o que este botao faz */
            },
          ]}
        />
      )}
    </div>
  )
}
