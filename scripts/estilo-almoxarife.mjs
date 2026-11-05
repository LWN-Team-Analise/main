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

/* na ordem em que o main carrega: o vidro (comum.css), o ajuste do menu
   e da barra de cima em comum.css e so depois o AppShell.css — e o .rail
   e o .topbar de la que valem */
const vidro =
  regra(comum, '.vidro') + '\n\n' + regra(comum, '.vidro > *') + '\n\n' + regra(comum, '.rail,\n.topbar')

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
const marcaMenu = '/* ------------------------------------------------------------\n   O MENU LATERAL'
const ham = appshell.slice(appshell.indexOf('/* ------------------------------------------------------------\n   O hambúrguer'), appshell.indexOf(marcaMenu))
const menulado = appshell.slice(appshell.indexOf(marcaMenu))
if (!celular.startsWith('@media') || !ham.includes('.ham {') || !menulado.includes('.menulado__painel')) {
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
])
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

.rail .menu-item.rail__btn svg {
  width: 21px;
  height: 21px;
  opacity: 1;
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
`

fs.writeFileSync(SAIDA, cabecalho + copiado + cola)
console.log('ok; variaveis:', [...usadas].length)
