// Gera public/almoxarife/estilo-main.css a partir do CSS do proprio main:
// a barra lateral do AppShell, o vidro, o Avatar e a confirmacao (Modal +
// Confirma), com as variaveis renomeadas para --am-* (o lwncontrol tem
// variaveis com os mesmos nomes e valores diferentes). E o que deixa o menu
// do Almoxarife IGUAL ao do resto do sistema.
//
//   node scripts/estilo-almoxarife.mjs
//
// Rode de novo sempre que o menu do main (AppShell.css, comum.css,
// tokens.css, Avatar, Modal, Confirma) mudar.
import fs from 'node:fs'
import path from 'node:path'
const RAIZ = path.resolve(import.meta.dirname, '..')
const MAIN = path.join(RAIZ, 'core/src') + '/'
const SAIDA = path.join(RAIZ, 'public/almoxarife/estilo-main.css')
const ler = (arq) => fs.readFileSync(MAIN + arq, 'utf8').split(String.fromCharCode(13, 10)).join('\n')
const linhas = (texto, de, ate) => texto.split('\n').slice(de - 1, ate).join('\n')

const appshell = ler('components/AppShell/AppShell.css')
const comum = ler('styles/comum.css')
const avatar = ler('components/Avatar/Avatar.css')
const modal = ler('components/Modal/Modal.css')
const confirma = ler('components/Confirma/Confirma.css')
const busca = ler('components/Busca/Busca.css')
const orbe = ler('components/ParticleInterlock/ParticleInterlock.css')
const pedido = ler('components/PedidoInclusao/PedidoInclusao.css')
/* o Seletor (a lista de escolha do main): public/almoxarife/seletor.js o
   poe no lugar de cada <select> do Control */
const seletor = ler('components/Seletor/Seletor.css')
const tokens = ler('styles/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '')

/* um bloco do CSS do main pelo seletor de abertura, ate o } que fecha */
function regra(texto, seletor) {
  const i = texto.indexOf(seletor + ' {')
  if (i < 0) throw new Error('regra nao achada: ' + seletor)
  const f = texto.indexOf('\n}', i)
  return texto.slice(i, f + 2)
}

/* ---- os pedacos, na ordem do main ---- */
const ini = appshell.indexOf('/* ---------------- Logo ----------------')
const fim = appshell.indexOf('/* ---------------- Coluna direita ---------------- */')
const barra = appshell.slice(ini, fim)
const naColuna = regra(appshell.slice(appshell.indexOf('/* o menu do avatar abre para a direita')), '.euzinho__menu')
const ate1000 = (() => {
  const i = appshell.indexOf('@media (max-width: 1000px) {')
  const bloco = appshell.slice(i, appshell.indexOf('@media (max-width: 860px)', i))
  return bloco.replace(/  \.shell \{[\s\S]*?\n  \}\n\n/, '')
})()

/* na ordem em que o main carrega: o vidro (comum.css), o vidro do que
   flutua (o bloco inteiro de comum.css, entre as duas marcas) e so depois
   o AppShell.css — e o .rail e o .topbar de la que valem */
const flutuaIni = comum.indexOf('/* ---- o que flutua: inicio ---- */')
const flutuaFim = comum.indexOf('/* ---- o que flutua: fim ---- */')
if (flutuaIni < 0 || flutuaFim < 0) throw new Error('as marcas do vidro flutuante sumiram do comum.css')
const vidro = regra(comum, '.vidro') + '\n\n' + regra(comum, '.vidro > *') + '\n\n' + comum.slice(flutuaIni, flutuaFim)

/* a barra de cima (a saudacao, o campo com o orbe e o sino) e o painel do sino */
const topo = appshell.slice(
  appshell.indexOf('/* ---------------- Barra superior ---------------- */'),
  appshell.indexOf('/* ---------------- Conteudo ---------------- */'),
)
const sinoIni = appshell.indexOf('/* ============================================================\n   Sininho e o painel de notificacoes')
const sino = appshell.slice(sinoIni, appshell.indexOf('/* ============================================================', sinoIni + 10))
const cancelar = regra(comum, '.formobra__cancelar') + '\n\n' + regra(comum, '.formobra__cancelar:hover')
const avatarCss = regra(avatar, '.avatarfig') + '\n\n' + regra(avatar, '.avatarfig img')
const modalCss = ['.modal', '.modal__caixa', '.modal__caixa:focus', '.modal__topo', '.modal__titulo', '.modal__x', '.modal__x:hover', '.modal__corpo']
  .map((sel) => regra(modal, sel))
  .join('\n\n') + '\n\n' + regra(modal, '@keyframes modal-entra') + '\n\n' + regra(modal, '@keyframes modal-sobe')
const confirmaCss = ['.confirma', '.confirma__texto', '.confirma__acoes', '.confirma__ok', '.confirma__ok--acao', '.confirma__ok:hover', '.confirma__ok:active']
  .map((sel) => regra(confirma, sel))
  .join('\n\n')

/* o celular: a bolha deita no rodape (o indicador que desliza, o icone
   aceso que sobe para dentro dele, o Mais na ponta), o avatar vai para a
   barra de cima, o hamburguer vira X girando e o menu lateral do Mais */
const celular = appshell.slice(
  appshell.indexOf('@media (max-width: 860px) {'),
  appshell.indexOf('/* ---------------- Recado de falha'),
)
/* o menu lateral do celular (.menulado) saiu do AppShell.css quando o main
   trocou ele pelo menu completo: o do Almoxarife mora em
   scripts/almoxarife-menulado.css */
const marcaCompleto = '/* ------------------------------------------------------------\n   O MENU COMPLETO'
const ham = appshell.slice(appshell.indexOf('/* ------------------------------------------------------------\n   O hambúrguer'), appshell.indexOf(marcaCompleto))
const menulado = fs.readFileSync(path.join(RAIZ, 'scripts/almoxarife-menulado.css'), 'utf8').split(String.fromCharCode(13, 10)).join('\n')
if (!celular.startsWith('@media') || !ham.includes('.ham {') || appshell.indexOf(marcaCompleto) < 0 || !menulado.includes('.menulado__painel')) {
  throw new Error('o celular, o hamburguer ou o menu lateral mudaram de lugar no AppShell.css')
}

let copiado = [vidro, barra, naColuna, ate1000, topo, sino, busca, orbe, pedido, avatarCss, modalCss, confirmaCss, cancelar, celular, ham, menulado, seletor].join('\n\n')

/* o pop-up do lwncontrol ja usa .modal: o do main vira .am-modal */
copiado = copiado.replace(/\.modal(?=[\s_:{,.])/g, '.am-modal')
/* o tema escuro do lwncontrol e o body.dark-mode */
copiado = copiado.split(":root[data-theme='dark']").join('body.dark-mode')

/* ---- as variaveis do main que o CSS copiado usa, renomeadas ---- */
const internas = new Set(['marca-x', 'marca-y', 'marca-l', 'marca-a', 'ind-x', 'ergue', 'afunda', 'dur-viagem', 'curva-viagem', 'avatar-anel', 'modal-topo', 'i', 'menulado-curva', 'menulado-entra', 'menulado-sai', 'pastilha-cor'])
/* a cor das estrelas da nota no menu lateral (components/Estrelas): so a
   cola usa */
const usadas = new Set([
  'pri-media',
  /* os selects com a cara do Seletor do main (a cola, no fim) */
  'vidro-borda', 'vidro-fundo', 'vidro-fundo-forte', 'vidro-realce', 'radius-pill', 'glass-blur',
  'text-strong', 'control-border', 'accent', 'surface', 'dur-fast', 'ease-out',
  'line', 'control-bg', 'control-bg-hover', 'text-faint',
  /* a lista nativa de reserva e a Solicitacao travada pela obra */
  'vidro-menu', 'radius-md', 'glass-shadow', 'text-muted',
  /* o vidro nas janelas do lwncontrol (a cola) */
  'vidro-janela', 'vidro-aro', 'vidro-filtro', 'vidro-texto-suave', 'glass-border', 'modal-sombra', 'modal-veu',
])
/* quem o CSS copiado DECLARA tambem muda de nome: e o vidro trocando
   --text-muted e cia. so dentro das superficies dele */
copiado = copiado.replace(/(^|[\s;{])--([a-z0-9-]+)(?=\s*:)/g, (m, antes, nome) =>
  internas.has(nome) ? m : `${antes}--am-${nome}`,
)
copiado = copiado.replace(/var\(--([a-z0-9-]+)/g, (m, nome) => {
  if (internas.has(nome)) return m
  usadas.add(nome)
  return `var(--am-${nome}`
})
const blocos = [...tokens.matchAll(/(:root(?:\[data-theme='dark'\])?)\s*\{([^}]*)\}/g)]
const valores = { claro: {}, escuro: {} }
for (const [, sel, corpo] of blocos) {
  const alvo = sel.includes('dark') ? valores.escuro : valores.claro
  for (const m of corpo.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) alvo[m[1]] = m[2].replace(/\s+/g, ' ').trim()
}
const faltam = [...usadas].filter((n) => !(n in valores.claro))
if (faltam.length) throw new Error('variaveis sem valor no main: ' + faltam.join(', '))
const declarar = (lado) =>
  [...usadas]
    .filter((n) => n in lado)
    .sort()
    .map((n) => `  --am-${n}: ${lado[n].replace(/var\(--([a-z0-9-]+)/g, (m, x) => `var(--am-${x}`)};`)
    .join('\n')

const cabecalho = `/* ============================================================
   O MENU DO ATMOSFERA LWN NO ALMOXARIFE

   GERADO por scripts/estilo-almoxarife.mjs a partir do CSS do proprio
   main — nao editar a mao a parte copiada (rode o script de novo). Ela e a barra lateral do AppShell (core/src/components/
   AppShell/AppShell.css: a logo, a bolha de vidro, a marca que DESLIZA
   de um item para o outro com o anel girando, o item aceso e o avatar
   com o menu de Configurações / Sair), o vidro (styles/comum.css), o
   Avatar e a confirmacao "Sair do sistema?" (Modal + Confirma).

   Duas trocas, so de nome:
     - as variaveis do main viram --am-* (o lwncontrol tem --text-muted,
       --danger... com outros valores), com os valores de
       styles/tokens.css logo abaixo;
     - o .modal do main vira .am-modal (o lwncontrol ja usa .modal) e o
       tema escuro e o body.dark-mode do lwncontrol.

   O que mede e move a marca e public/almoxarife/menu-main.js — a mesma
   conta do AppShell.jsx. No fim do arquivo, a cola com o layout do
   lwncontrol (a coluna, os contadores dos itens e o celular).
   ============================================================ */

:root {
${declarar(valores.claro)}
}

body.dark-mode {
${declarar({ ...valores.claro, ...valores.escuro })}
}

`

const cola = `

/* ============================================================
   A COLA COM O LWNCONTROL (escrita a mao)
   ============================================================ */

/* a coluna da esquerda do lwncontrol deixa de ser um painel: as pecas
   (logo, bolha, avatar) sao fixas, como no main. O conteudo comeca onde
   comeca no main (.shell { padding-left: 86px }) */
:root {
  --sidebar-width: 86px;
}

#sidebar {
  width: 0;
  overflow: visible;
  background: transparent;
  border-right: 0;
  box-shadow: none;
}

/* a lista do lwncontrol dentro da bolha: sem o recheio dela */
.rail .sidebar-menu.rail__lista {
  flex: 1 1 auto;
  padding: 0;
  gap: 3px;
}

/* o item do lwncontrol (.menu-item) com o desenho do main (.rail__btn) */
.rail .menu-item.rail__btn,
.rail .menu-item.rail__btn:hover,
.rail .menu-item.rail__btn.active,
body.dark-mode .rail .menu-item.rail__btn,
body.dark-mode .rail .menu-item.rail__btn:hover,
body.dark-mode .rail .menu-item.rail__btn.active,
.rail .sidebar-menu .menu-item.active[onclick*="certificados"] {
  background: transparent !important;
  box-shadow: none !important;
  letter-spacing: normal;
  white-space: normal;
  font-size: inherit;
}

.rail .menu-item.rail__btn {
  font-weight: 400;
  color: var(--am-text-muted);
}

.rail .menu-item.rail__btn:hover {
  color: var(--am-text-strong);
}

.rail .menu-item.rail__btn.is-atual,
.rail .sidebar-menu .menu-item.is-atual[onclick*="certificados"] {
  color: var(--am-text-strong) !important;
  font-weight: 600 !important;
}

/* o almoxarife.css pinta de azul o icone do Certificados aceso (uma regra
   so dele, mais forte que esta): no circulo azul do item atual o icone
   sumia, azul no azul. Aqui o icone segue a cor do texto — branco no
   circulo, como os outros itens e como no main */
.rail .menu-item.rail__btn svg,
.rail .sidebar-menu .menu-item.active[onclick*="certificados"] svg {
  width: 21px;
  height: 21px;
  opacity: 1 !important;
  stroke: currentColor !important;
}

/* os contadores do lwncontrol (Retirada, Devolutiva, Manutenção...) no
   canto do item */
.rail .menu-item.rail__btn .badge {
  position: absolute;
  top: 3px;
  right: 5px;
  z-index: 3;
  margin: 0 !important;
  padding: 0 0.3rem !important;
  min-width: 1rem;
  font-size: 0.55rem !important;
  line-height: 1rem;
}

/* no main o menu do avatar, a confirmacao, a lista da busca, o painel e o
   selo do sino so existem quando abertos (o React os monta); aqui eles
   ficam no HTML com o atributo hidden — e o display do CSS copiado
   passaria por cima dele */
.euzinho__menu[hidden],
.am-modal[hidden],
.busca__caixa[hidden],
.sininho__painel[hidden],
.sininho__selo[hidden] {
  display: none !important;
}

/* A barra de cima flutua sobre o conteudo, como no main (.topbar e
   position: sticky). O almoxarife.css e o responsivo.css poem
   overflow-x: hidden no html e no body, e hidden transforma o body numa
   caixa de rolagem que nunca rola: o sticky se prendia a ela e a barra
   subia junto com a pagina. clip corta do mesmo jeito sem criar a caixa
   (e o que o global.css do main faz). */
html,
body {
  overflow-x: clip;
}

/* a barra de cima no lugar do header do lwncontrol, com a folga da coluna
   do main (.shell__coluna: 18px) e o respiro ate o conteudo
   (.shell__conteudo: 18px) */
#almox-topo {
  margin: 18px 18px 0;
}

#almox-topo + .content-container {
  margin-top: 18px;
}

/* As abas do Almoxarife tem palavras mais compridas que as do main:
   "Certificados", "Localização", "Manutenção" e "Remanejamento" nao
   cabem na largura do item no tamanho do main e quebrariam no meio da
   palavra. Essas quatro ficam um ponto menores — e mais um pouco abaixo de
   1000px, onde a bolha estreita para 66px (como no main) */
.rail__btn[onclick*="'certificados'"] .rail__rotulo,
.rail__btn[onclick*="'localizacao'"] .rail__rotulo,
.rail__btn[onclick*="'manutencao'"] .rail__rotulo,
.rail__btn[onclick*="'remanejamento'"] .rail__rotulo {
  font-size: 0.5rem;
  letter-spacing: -0.02em;
  overflow-wrap: normal;
}

.rail__btn[onclick*="'remanejamento'"] .rail__rotulo {
  font-size: 0.46rem;
}

@media (max-width: 1000px) {
  .rail__btn[onclick*="'certificados'"] .rail__rotulo,
  .rail__btn[onclick*="'localizacao'"] .rail__rotulo,
  .rail__btn[onclick*="'manutencao'"] .rail__rotulo {
    font-size: 0.46rem;
  }

  .rail__btn[onclick*="'remanejamento'"] .rail__rotulo {
    font-size: 0.42rem;
  }
}

/* a logo certa para cada tema */
.marca .logo-escuro,
body.dark-mode .marca .logo-claro {
  display: none;
}

body.dark-mode .marca .logo-escuro {
  display: block;
}

@media (max-width: 1000px) {
  :root {
    --sidebar-width: 78px;
  }
}

/* ---- o celular: o mesmo do main ----
   A bolha deita no rodape com Painel, Solicitar, Certificados e o Mais
   (o hamburguer), e o Mais abre o menu lateral com o resto. A barra de
   baixo e a gaveta do lwncontrol saem. */

/* Solicitar so existe na barra do celular: no computador ele e o botao
   SOLICITAR do Painel Geral */
.rail__lista > li[data-so-celular] {
  display: none;
}

@media (max-width: 860px) {
  .rail__lista > li[data-so-celular] {
    display: block;
  }

  /* a ordem na barra: Painel · Solicitar · Certificados · Mais */
  .rail__lista > li[data-id='dashboard'] {
    order: 1;
  }

  .rail__lista > li[data-id='solicitar'] {
    order: 2;
  }

  .rail__lista > li[data-id='certificados'] {
    order: 3;
  }

  /* o "Certificados" encolhido do computador volta ao rotulo do celular */
  .rail__btn[onclick*="'certificados'"] .rail__rotulo {
    font-size: 0.54rem;
    letter-spacing: normal;
  }

  /* a coluna do lwncontrol vira gaveta no celular (transform). Com
     transform num ancestral, o fixed da barra passa a contar a partir dele
     e a barra sairia da tela junto com a gaveta */
  #sidebar {
    transform: none !important;
  }

  :root {
    --sidebar-width: 0px;
  }

  /* o conteudo usa a largura toda e termina acima da barra
     (.shell__coluna do main: 104px) */
  #main-content {
    margin-left: 0;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 104px);
  }

  #almox-topo {
    margin: 14px 14px 0;
  }

  #almox-topo + .content-container {
    margin-top: 14px;
  }

  #bottom-nav,
  #bnav-more-drawer,
  #bnav-more-overlay,
  #sidebar-backdrop {
    display: none !important;
  }
}

/* o almoxarife.css pinta todo link de azul no tema escuro: a linha
   Atmosfera, a unica que e link, destoava das outras */
body.dark-mode a.menulado__item:not(.is-atual),
body.dark-mode a.menulado__item:not(.is-atual):hover {
  color: var(--am-text-strong);
}

/* no main as linhas do menu lateral sao links (NavLink); aqui as abas sao
   botoes (o switchTab): sem a cara de botao do navegador */
button.menulado__item {
  width: 100%;
  border: 0;
  border-radius: 0;
  background: none;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

/* ---- os selects: com a cara do Seletor do main ----
   O main nao usa o <select> do navegador: a escolha e o componente Seletor
   (src/components/Seletor), uma pilula de vidro com a setinha. Aqui os
   selects continuam os do navegador (a lista aberta e a do sistema), mas
   fechados tem o desenho dele: a mesma borda, o mesmo vidro, o mesmo
   anel azul no foco. Vale para TODOS — os do HTML e os que as telas
   montam —, e o !important passa por cima do estilo escrito direto em
   varios deles. */
select:not([multiple]):not([size]) {
  -webkit-appearance: none !important;
  appearance: none !important;
  min-height: 42px;
  padding: 9px 38px 9px 15px !important;
  border: 1px solid var(--am-vidro-borda) !important;
  border-radius: var(--am-radius-pill) !important;
  background-color: var(--am-vidro-fundo) !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important;
  background-position: right 14px center !important;
  background-size: 14px 14px !important;
  box-shadow: var(--am-vidro-realce) !important;
  backdrop-filter: blur(var(--am-glass-blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--am-glass-blur)) saturate(150%);
  color: var(--am-text-strong) !important;
  font-family: inherit;
  font-size: 0.84rem !important;
  line-height: 1.3;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: border-color var(--am-dur-fast) var(--am-ease-out),
    background-color var(--am-dur-fast) var(--am-ease-out), box-shadow var(--am-dur-fast) var(--am-ease-out);
}

body.dark-mode select:not([multiple]):not([size]) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
}

select:not([multiple]):not([size]):hover:not(:disabled) {
  border-color: var(--am-control-border) !important;
  background-color: var(--am-vidro-fundo-forte) !important;
}

select:not([multiple]):not([size]):focus {
  outline: none !important;
  border-color: var(--am-accent) !important;
  box-shadow: var(--am-vidro-realce), 0 0 0 3px color-mix(in srgb, var(--am-accent) 22%, transparent) !important;
}

select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* a lista aberta (a do sistema) legivel nos dois temas */
select option {
  background: var(--am-surface);
  color: var(--am-text-strong);
}

/* ---- o Seletor do main nos selects (public/almoxarife/seletor.js) ----
   O <select> fica na pagina, escondido, guardando o valor; o botao e a
   lista sao os do Seletor (o CSS copiado acima). */
select.sel-nativo:not([multiple]):not([size]) {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
  overflow: hidden !important;
  clip-path: inset(50%) !important;
}

.sel.sel--controle {
  min-width: 0;
}

/* ---- o vidro nas janelas do lwncontrol ----
   As mesmas tintas do pop-up do main. Com !important porque boa parte das
   janelas traz o fundo escrito direto no HTML que o JS monta.

   O veu perde o desfoque dele: com backdrop-filter no veu, a janela (filha
   dele) nao enxerga a pagina, e o desfoque da janela nao teria o que borrar. */
.modal-overlay {
  background-color: var(--am-modal-veu) !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

.modal-container,
.modal-content,
#rem-termo-aviso-almox > div,
.gantt-tooltip,
.convite-notif,
.toast {
  --text-muted: var(--am-vidro-texto-suave);
  background: var(--am-vidro-janela) !important;
  box-shadow: var(--am-modal-sombra), var(--am-vidro-aro) !important;
  -webkit-backdrop-filter: var(--am-vidro-filtro) !important;
  backdrop-filter: var(--am-vidro-filtro) !important;
}

/* a borda do aviso (.toast) fica de fora: o fio colorido dela diz o tipo */
.modal-container,
.modal-content,
#rem-termo-aviso-almox > div,
.gantt-tooltip,
.convite-notif {
  border: 1px solid var(--am-glass-border) !important;
}

.toast {
  border-top-color: var(--am-glass-border);
  border-right-color: var(--am-glass-border);
  border-bottom-color: var(--am-glass-border);
}

/* o cabecalho e o rodape eram faixas de cor cheia dentro da janela */
.modal-header,
.modal-footer {
  background: transparent !important;
}

/* dentro das janelas do lwncontrol o botao e solido, como no pop-up do main */
.modal-container .sel__botao,
.modal-content .sel__botao {
  background: var(--am-control-bg);
  border-color: var(--am-control-border);
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

/* acima das janelas do lwncontrol (que chegam a z-index 9999) */
.sel__lista {
  z-index: 100000;
}

/* a busca das listas compridas (clientes, responsaveis), presa no alto */
.sel__busca {
  position: sticky;
  top: -6px;
  z-index: 1;
  margin: -6px -6px 4px;
  padding: 8px;
  background: inherit;
  /* a lista e de vidro: sem isto as opcoes passariam nitidas por tras */
  -webkit-backdrop-filter: var(--am-vidro-filtro);
  backdrop-filter: var(--am-vidro-filtro);
  border-bottom: 1px solid var(--am-line);
}

.sel__busca input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--am-control-border);
  border-radius: var(--am-radius-pill);
  background: var(--am-control-bg);
  color: var(--am-text-strong);
  font: inherit;
  font-size: 0.82rem;
  outline: none;
}

.sel__busca input:focus {
  border-color: var(--am-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--am-accent) 22%, transparent);
}

/* o titulo do grupo (optgroup) */
.sel__grupo {
  padding: 8px 11px 4px;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--am-text-faint);
}

/* a opcao andada pelas setas */
.sel__item.is-foco {
  background: var(--am-control-bg-hover);
  color: var(--am-text-strong);
}

.sel__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ---- reserva: a lista NATIVA com a cara do Seletor ----
   Todo select da pagina vira o Seletor (seletor.js). Se algum escapar
   (a pagina velha guardada pelo navegador, o script que nao carregou), a
   lista aberta do proprio navegador sai com o mesmo vidro, a mesma
   fonte e o azul na escolhida, onde o navegador deixa (Chrome e Edge
   135+). Nos outros, fica a lista do sistema. */
@supports (appearance: base-select) {
  select:not(.sel-nativo):not([multiple]):not([size]),
  select:not(.sel-nativo):not([multiple]):not([size])::picker(select) {
    appearance: base-select !important;
  }

  select:not(.sel-nativo):not([multiple]):not([size])::picker-icon {
    display: none;
  }

  select:not(.sel-nativo):not([multiple]):not([size])::picker(select) {
    margin-top: 6px;
    padding: 6px;
    max-height: min(320px, 60vh);
    border: 1px solid var(--am-vidro-borda);
    border-radius: var(--am-radius-md);
    background: var(--am-vidro-menu);
    box-shadow: var(--am-glass-shadow), var(--am-vidro-aro);
    backdrop-filter: var(--am-vidro-filtro);
  }

  select:not(.sel-nativo):not([multiple]):not([size]) option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 11px;
    border-radius: 10px;
    background: transparent;
    color: var(--am-text-strong);
    font-size: 0.84rem;
    cursor: pointer;
  }

  select:not(.sel-nativo):not([multiple]):not([size]) option:hover,
  select:not(.sel-nativo):not([multiple]):not([size]) option:focus-visible {
    outline: none;
    background: var(--am-control-bg-hover);
  }

  select:not(.sel-nativo):not([multiple]):not([size]) option:checked {
    color: var(--am-accent);
    font-weight: 600;
  }

  select:not(.sel-nativo):not([multiple]):not([size]) option::checkmark {
    order: 1;
    margin-left: auto;
    color: var(--am-accent);
  }

  /* o "Selecione..." vazio, apagado como o texto do botao vazio */
  select:not(.sel-nativo):not([multiple]):not([size]) option[value=''] {
    color: var(--am-text-faint);
  }
}

/* ---- a Solicitacao pedida pelo check "Solicitar OS" da obra ----
   (public/almoxarife/obra-da-os.js) o cliente, a obra e as datas vem do
   Atmosfera LWN e nao se trocam: a faixa no alto diz de onde, e cada
   campo travado leva o cadeado — preenchido, sem o apagado do desabilitado */
.almox-da-obra {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 1rem;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--am-accent) 28%, transparent);
  border-radius: var(--am-radius-md);
  background: linear-gradient(135deg,
      color-mix(in srgb, var(--am-accent) 12%, transparent),
      color-mix(in srgb, #0ea5e9 8%, transparent));
}

.almox-da-obra__icone {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: linear-gradient(135deg, var(--am-accent), #0ea5e9);
  color: #fff;
  box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--am-accent) 70%, transparent);
}

.almox-da-obra__icone svg {
  width: 16px;
  height: 16px;
}

.almox-da-obra__texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 0.8rem;
  color: var(--am-text-muted);
  line-height: 1.45;
}

.almox-da-obra__texto strong {
  font-size: 0.9rem;
  color: var(--am-text-strong);
}

.almox-da-obra__texto b {
  color: var(--am-accent);
}

.almox-cadeado {
  display: inline-flex;
  margin-left: 6px;
  vertical-align: -1px;
  color: var(--am-accent);
}

.almox-travado .sel__botao:disabled,
.almox-travado input:disabled {
  opacity: 1 !important;
  cursor: not-allowed !important;
  border-style: dashed !important;
  border-color: color-mix(in srgb, var(--am-accent) 35%, transparent) !important;
  background: color-mix(in srgb, var(--am-accent) 6%, var(--am-control-bg)) !important;
  color: var(--am-text-strong) !important;
  -webkit-text-fill-color: var(--am-text-strong);
}

.almox-travado .sel__botao:disabled .sel__seta {
  display: none;
}

/* ---- a OS pedida pelos checks "Retirada" e "Devolução das ferramentas"
   da obra: o cartao dela pulsa na lista da aba ---- */
.conf-card-os.is-pedida {
  animation: almox-os-pedida 1.4s var(--am-ease-out) 4;
  border-color: var(--am-accent) !important;
}

@keyframes almox-os-pedida {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--am-accent) 45%, transparent);
  }
  100% {
    box-shadow: 0 0 0 14px color-mix(in srgb, var(--am-accent) 0%, transparent);
  }
}

/* a aba Configurações: a tela do main num iframe que vai ate o pe da
   janela (menu-main.js mede a altura) e rola por dentro */
.almox-config {
  display: block;
  width: 100%;
  min-height: 360px;
  border: 0;
  background: transparent;
  color-scheme: normal;
}

/* com ela aberta a pagina nao rola: quem rola e o iframe */
#main-content:has(#configuracoes-tab.active) {
  padding-bottom: 0;
}

/* a nota embaixo do nome: as estrelas de components/Estrelas do main */
.menulado__nota .estrelas {
  display: inline-flex;
  gap: 1px;
}

.menulado__nota .estrelas svg {
  display: block;
}

/* O menu lateral do celular (scripts/almoxarife-menulado.css) saiu do main:
   o comum.css nao o conta mais entre as superficies de vidro, e o
   AppShell.css nao o esconde mais no computador. As duas coisas ficam
   aqui. */
.menulado__painel {
  --am-text-muted: var(--am-vidro-texto-suave);
  --am-text-faint: var(--am-vidro-texto-fraco);
  --am-danger: var(--am-vidro-perigo);
}

@media (min-width: 861px) {
  .menulado {
    display: none;
  }
}

/* ---- o "Mais": o menu largo, como no main (o O MENU LARGO do
   AppShell.css) ----
   A seta no alto da barra (menu-main.js, montarMais) liga a classe
   menu-largo no <html>: a barra alarga com o nome de cada aba ao lado do
   icone e o conteudo anda junto (--sidebar-width). So no computador. */
@media (min-width: 861px) {
  #main-content {
    transition: margin-left 0.32s cubic-bezier(0.32, 0.72, 0, 1);
  }

  .rail {
    transition: width 0.32s cubic-bezier(0.32, 0.72, 0, 1);
  }

  html.menu-largo {
    --sidebar-width: 248px;
  }

  /* a barra de cima (a saudacao e a Busca) NAO anda com o menu largo, como
     no main: so o conteudo embaixo dela vai para a direita. A margem
     negativa devolve o que o --sidebar-width a mais empurrou (248px menos
     os 86px de sempre; os 18px sao a folga de sempre), no mesmo passo */
  #almox-topo {
    transition: margin-left 0.32s cubic-bezier(0.32, 0.72, 0, 1);
  }

  html.menu-largo #almox-topo {
    margin-left: calc(18px - 162px);
  }

  html.menu-largo .rail {
    width: 228px;
    align-items: stretch;
    padding: 8px;
  }

  html.menu-largo .rail .rail__btn,
  html.menu-largo .rail .menu-item.rail__btn {
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
    width: 100%;
    height: 44px;
    padding: 0 12px;
    border-radius: 14px;
    text-align: left;
  }

  /* o nome inteiro, numa linha so (os quatro nomes compridos encolhidos
     acima voltam ao tamanho dos outros) */
  html.menu-largo .rail .rail__rotulo {
    font-size: 0.86rem !important;
    font-weight: 600;
    letter-spacing: normal !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    -webkit-line-clamp: 1;
  }

  /* o contador do item vai para o fim da linha */
  html.menu-largo .rail .menu-item.rail__btn .badge {
    top: 50%;
    right: 10px;
    translate: 0 -50%;
  }

  html.menu-largo .rail__marca {
    border-radius: 14px;
  }

  html.menu-largo .rail__marca::after {
    border-radius: 11px;
  }

  /* o "Mais" vira "Menos": a seta da meia volta */
  .rail__seta {
    transition: rotate 0.32s cubic-bezier(0.32, 0.72, 0, 1);
  }

  html.menu-largo .rail__seta {
    rotate: 180deg;
  }

  html.menu-largo .rail__tudo {
    height: 44px;
  }
}

/* entre 861px e 1000px a barra de sempre tem 78px de recuo: a barra de cima
   devolve a diferenca certa */
@media (min-width: 861px) and (max-width: 1000px) {
  html.menu-largo #almox-topo {
    margin-left: calc(18px - 170px);
  }
}

/* ---- o modo EMBUTIDO (?embutido=1, o sessao.js liga a classe) ----
   A Solicitação de OS aberta dentro da obra, no pop-up do check
   "Solicitar OS" (core/src/pages/Obras/ModalSolicitarOS.jsx): so o
   formulario, sem a logo, o menu, o avatar, a barra de cima, o "Voltar" e
   os botoes do Painel Geral. */
html.embutido {
  --sidebar-width: 0px;
}

html.embutido .marca,
html.embutido #almox-rail,
html.embutido .euzinho,
html.embutido #almox-topo,
html.embutido #painel-voltar-linha,
html.embutido #painel-acoes,
html.embutido .menulado,
html.embutido #bottom-nav {
  display: none !important;
}

html.embutido #main-content {
  margin-left: 0;
  padding-bottom: 12px;
}

html.embutido #almox-topo + .content-container,
html.embutido .content-container {
  margin-top: 0;
}
`

fs.writeFileSync(SAIDA, cabecalho + copiado + cola)
console.log('ok; variaveis:', [...usadas].length)
