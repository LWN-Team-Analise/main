/* ============================================================
   Permissoes do SETOR.

   O vocabulario desta versao, porque os dois se parecem:

     SETOR — o grupo da equipe (Comercial, Excelência, GQ...).
             E ele que carrega as permissoes, a cor e os cards
             da obra. No banco continua sendo a tabela `cargo`,
             e no codigo continua com esse nome: renomear a
             tabela derrubaria as chaves estrangeiras de meia
             duzia de outras sem mudar nada do que o sistema
             faz. Na TELA, ele se chama Setor.
     CARGO — o que a pessoa e dentro do setor (Analista,
             Coordenador). Tem cadastro proprio (tabela
             `cargo_titulo`), nao tem cor e nao decide permissao
             nenhuma. Quem cadastra e quem ATRIBUI um cargo a
             alguem e so quem tem `editar_cargo_titulo`.

   Sao dois grupos de permissao:

     VISUALIZACAO — que abas o setor enxerga no menu;
     ALTERACAO    — o que ele pode mexer dentro delas.

   A regra que amarra os dois: alteracao SEMPRE depende da
   visualizacao correspondente. Se o setor nao ve Obras, ele
   nao edita obra, nem etapa, nem card, nem check — a tela
   trava sozinha (`dependeDe`) e o servidor recusa igual.

   Setor novo nasce com a lista VAZIA: quem administra marca
   uma a uma. A unica excecao e o setor com `acessoTotal`
   (diretoria), que passa por tudo sem depender da lista.
   ============================================================ */

/** Toda permissao de visualizacao. A ordem e a que aparece na tela. */
export const VISUALIZACAO = [
  { chave: 'ver_inicio', rotulo: 'Página inicial', rota: '/app' },
  { chave: 'ver_obras', rotulo: 'Obras', rota: '/app/obras' },
  { chave: 'ver_clientes', rotulo: 'Clientes', rota: '/app/clientes' },
  { chave: 'ver_concluidas', rotulo: 'Concluídas', rota: '/app/concluidas' },
  { chave: 'ver_despesas', rotulo: 'Visualizar despesas', rota: '/app/despesas' },
  { chave: 'ver_avaliacoes', rotulo: 'Avaliações', rota: '/app/avaliacoes' },
  { chave: 'ver_avisos', rotulo: 'Enviar avisos', rota: null },
]

/**
 * Toda permissao de alteracao.
 *
 * `dependeDe` e a permissao de visualizacao que ela exige. Sem
 * aquela marcada, esta fica travada na tela e cai fora na hora de
 * salvar — nao adianta o cargo poder editar obra se ele nem
 * consegue abrir a aba.
 */
export const ALTERACAO = [
  /* O Dashboard da pagina inicial: os numeros da empresa inteira (tempo
     de obra, prazo, despesas) e a exportacao para o Power BI. Nao e de
     todo mundo — por isso tem chave propria, embaixo de "Pagina inicial":
     sem ela, a pessoa ve a Grade e o Quadro, e a aba Dashboard some. */
  { chave: 'ver_dashboard', rotulo: 'Ver dashboard', dependeDe: 'ver_inicio' },
  { chave: 'editar_usuario', rotulo: 'Adicionar / editar usuário', dependeDe: null },
  { chave: 'editar_cargo', rotulo: 'Adicionar / editar setor', dependeDe: null },
  { chave: 'editar_cargo_titulo', rotulo: 'Adicionar / editar cargo', dependeDe: null },
  { chave: 'editar_avaliacoes', rotulo: 'Adicionar / editar avaliações', dependeDe: 'ver_avaliacoes' },
  { chave: 'editar_clientes', rotulo: 'Adicionar / editar clientes', dependeDe: 'ver_clientes' },
  { chave: 'editar_obras', rotulo: 'Adicionar / editar obras', dependeDe: 'ver_obras' },
  { chave: 'excluir_concluidas', rotulo: 'Excluir obra concluída', dependeDe: 'ver_concluidas' },
  { chave: 'check_todas_etapas', rotulo: 'Check em todas as etapas', dependeDe: 'ver_obras' },
  { chave: 'editar_etapa', rotulo: 'Adicionar / alterar etapa', dependeDe: 'ver_obras' },
  { chave: 'editar_cards', rotulo: 'Adicionar / alterar cards', dependeDe: 'ver_obras' },
  { chave: 'editar_cargos_card', rotulo: 'Adicionar / alterar setores no card', dependeDe: 'ver_obras' },
  { chave: 'editar_checks', rotulo: 'Adicionar / alterar checks', dependeDe: 'ver_obras' },
  /* a data limite de um check (ou de uma etapa inteira) dentro de cada
     obra, e o prazo final da execucao. E ela que muda a cor do card do
     quadro quando o prazo aperta ou vence */
  { chave: 'definir_prazos', rotulo: 'Pode definir prazo para checks', dependeDe: 'ver_obras' },
  /* o catalogo de ensaios de onde o Planejamento de ensaios escolhe */
  { chave: 'gerenciar_ensaios', rotulo: 'Adicionar / editar ensaios', dependeDe: 'ver_obras' },
  { chave: 'enviar_avisos', rotulo: 'Enviar avisos', dependeDe: 'ver_avisos' },
  /* Despesas: ver a aba (e os proprios envios) e `ver_despesas`;
     ENVIAR despesa, refeicao ou bonus e `alterar_despesas`; abrir os
     envios dos OUTROS (Despesas > Envios gerais) e `revisar_despesa_geral`;
     EXCLUIR um lancamento e a ultima — os proprios, ou os de qualquer um
     quando o setor tambem revisa. */
  { chave: 'alterar_despesas', rotulo: 'Alterar despesas', dependeDe: 'ver_despesas' },
  { chave: 'revisar_despesa_geral', rotulo: 'Revisar despesa geral', dependeDe: 'ver_despesas' },
  { chave: 'excluir_despesas', rotulo: 'Excluir lançamento de despesa', dependeDe: 'ver_despesas' },
]

/**
 * A tela de Setores mostra cada alteracao EMBAIXO da visualizacao de
 * que ela depende. As que nao dependem de nenhuma (as de Usuarios, aba
 * que abre com qualquer uma delas) vao num grupo proprio, no fim.
 */
export const GRUPOS = [
  ...VISUALIZACAO.map((v) => ({
    visualizacao: v,
    alteracoes: ALTERACAO.filter((a) => a.dependeDe === v.chave),
  })),
  { visualizacao: null, rotulo: 'Usuários', alteracoes: ALTERACAO.filter((a) => !a.dependeDe) },
]

export const TODAS = [...VISUALIZACAO, ...ALTERACAO]

/** So as chaves, na ordem — e o que vai para o banco. */
export const CHAVES = TODAS.map((p) => p.chave)

const PARA_ROTA = Object.fromEntries(
  VISUALIZACAO.filter((p) => p.rota).map((p) => [p.rota, p.chave]),
)

/** A permissao de visualizacao que uma rota exige, ou null se e livre. */
export function permissaoDaRota(rota) {
  return PARA_ROTA[rota] ?? null
}

const DEPENDENCIA = Object.fromEntries(
  ALTERACAO.filter((p) => p.dependeDe).map((p) => [p.chave, p.dependeDe]),
)

/**
 * Limpa a lista antes de gravar: alteracao sem a visualizacao dela
 * nao entra, e chave desconhecida some. E o mesmo tratamento no
 * servidor, para nao depender do que a tela mandou.
 */
export function normalizar(lista) {
  const marcadas = new Set((lista ?? []).filter((c) => CHAVES.includes(c)))
  Object.entries(DEPENDENCIA).forEach(([alteracao, visualizacao]) => {
    if (!marcadas.has(visualizacao)) marcadas.delete(alteracao)
  })
  return CHAVES.filter((c) => marcadas.has(c))
}

/** true quando a permissao de alteracao esta travada pela falta da visualizacao. */
export function travada(chave, lista) {
  const exigida = DEPENDENCIA[chave]
  return Boolean(exigida) && !(lista ?? []).includes(exigida)
}

/** As alteracoes que caem junto quando essa visualizacao e desmarcada. */
export function dependentes(chaveVisualizacao) {
  return ALTERACAO.filter((p) => p.dependeDe === chaveVisualizacao).map((p) => p.chave)
}

/* ------------------------------------------------------------
   Leitura no resto do sistema
   ------------------------------------------------------------ */

/**
 * O usuario pode?
 *
 * Setor com acesso total passa sempre — e a diretoria, e ela nao
 * fica travada por lista. Fora isso, vale o que esta marcado no
 * setor. Sem setor nenhum, nao pode nada.
 */
export function podeFazer(usuario, chave) {
  if (!usuario) return false
  if (usuario.acessoTotal) return true
  return (usuario.cargoPermissoes ?? usuario.permissoes ?? []).includes(chave)
}

/** As abas do menu que este usuario enxerga. */
export function abasVisiveis(usuario) {
  return VISUALIZACAO.filter((p) => p.rota && podeFazer(usuario, p.chave)).map((p) => p.rota)
}
