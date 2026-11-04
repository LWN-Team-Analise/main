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

let copiado = [vidro, barra, naColuna, ate1000, topo, sino, busca, orbe, pedido, avatarCss, modalCss, confirmaCss, cancelar].join('\n\n')

/* o pop-up do lwncontrol ja usa .modal: o do main vira .am-modal */
copiado = copiado.replace(/\.modal(?=[\s_:{,.])/g, '.am-modal')
/* o tema escuro do lwncontrol e o body.dark-mode */
copiado = copiado.split(":root[data-theme='dark']").join('body.dark-mode')

/* ---- as variaveis do main que o CSS copiado usa, renomeadas ---- */
const internas = new Set(['marca-x', 'marca-y', 'marca-l', 'marca-a', 'ind-x', 'ergue', 'afunda', 'dur-viagem', 'curva-viagem', 'avatar-anel', 'modal-topo'])
const usadas = new Set()
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

/* no celular: a barra cola nas bordas e a saudacao sai, para a busca caber */
@media (max-width: 768px) {
  #almox-topo {
    top: 10px;
    margin: 10px 10px 0;
    gap: 8px;
    padding-left: 10px;
  }

  #almox-topo .topbar__saudacao {
    display: none;
  }
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

/* no celular quem navega e a barra de baixo do lwncontrol */
@media (max-width: 768px) {
  .marca,
  .rail,
  .euzinho {
    display: none !important;
  }
}
`

fs.writeFileSync(SAIDA, cabecalho + copiado + cola)
console.log('ok; variaveis:', [...usadas].length)
