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
   O que estava marcado dentro da aba desmarcada fica GUARDADO
   (sem valer) e volta com ela — ver `separar`, mais abaixo.

   Setor novo nasce com a lista VAZIA: quem administra marca
   uma a uma. A unica excecao e o setor com `acessoTotal`
   (diretoria), que passa por tudo sem depender da lista.
   ============================================================ */

/**
 * As abas e os poderes de dentro do Almoxarife, com a chave que o
 * lwncontrol usava (PERMISSOES_MODULOS, em public/almoxarife). No main
 * cada uma vira `almox_<chave>`, embaixo de "Almoxarife".
 *
 * "manutencao_somente_leitura" e uma RESTRICAO, nao um acesso: o setor
 * ve a Manutencao inteira, mas nao mexe. Por isso o acesso total nao a
 * ganha (ver db/atualizacao-38.sql.txt, a view almox.usuarios).
 * "responsavel_obra" era uma marca do CARGO no lwncontrol (quem pode ser
 * escolhido como responsavel da O.S. e receber remanejamento).
 */
export const ALMOXARIFE_MODULOS = [
  ['dashboard', 'Painel'],
  ['solicitacoes', 'Solicitação de OS'],
  ['gerenciar_os', 'Editar OS (ver todas, editar e excluir)'],
  ['aprovar_todas_os', 'Aprovar / editar qualquer OS'],
  ['conferencia', 'Retirada de OS'],
  ['separar_tags', 'Separar TAGs / bipagem de OS'],
  ['devolutiva', 'Devolutiva de OS'],
  ['conferir_devolucao', 'Conferir devolução (checar o que voltou da obra)'],
  ['prorrogar_os', 'Solicitar prorrogação de OS'],
  ['aceitar_prorrogacao', 'Aceitar prorrogação (aprovar, editar ou rejeitar)'],
  ['aprovar_remanejamento', 'Aprovar remanejamento'],
  ['concluidos', 'OS concluídas'],
  ['certificados', 'Certificados'],
  ['baias', 'Localização'],
  ['instrumentos', 'Inventário'],
  ['remanejamento', 'Remanejamento'],
  ['calibracao', 'Calibração'],
  ['relatorios', 'Dashboard do Almoxarife (página inicial)'],
  ['manutencao', 'Manutenção'],
  ['manutencao_somente_leitura', 'Manutenção — apenas visualizar'],
  ['responsavel_obra', 'Pode ser responsável por obra (OS e remanejamento)'],
]

/** Toda permissao de visualizacao. A ordem e a que aparece na tela. */
export const VISUALIZACAO = [
  { chave: 'ver_inicio', rotulo: 'Página inicial', rota: '/app' },
  { chave: 'ver_obras', rotulo: 'Obras', rota: '/app/obras' },
  { chave: 'ver_clientes', rotulo: 'Clientes', rota: '/app/clientes' },
  { chave: 'ver_concluidas', rotulo: 'Concluídas', rota: '/app/concluidas' },
  { chave: 'ver_despesas', rotulo: 'Reembolso', rota: '/app/despesas' },
  { chave: 'ver_frotas', rotulo: 'Frotas', rota: '/app/frotas' },
  /* o Almoxarife (o antigo lwncontrol, atualizacao 38): a aba abre a tela
     dele, em /almoxarife. As abas de dentro dele sao as almox_* de baixo */
  { chave: 'ver_almoxarife', rotulo: 'Almoxarife', rota: '/app/control' },
  { chave: 'ver_comercial', rotulo: 'Comercial', rota: '/app/comercial' },
  { chave: 'ver_turnos', rotulo: 'Turnos', rota: '/app/turnos' },
  { chave: 'ver_avaliacoes', rotulo: 'Avaliações', rota: '/app/avaliacoes' },
  /* a aba Usuarios: ver a equipe (os cards, o setor, o cargo, o contato).
     Cadastrar, editar e excluir continuam nas alteracoes de baixo */
  { chave: 'ver_usuarios', rotulo: 'Usuários', rota: '/app/usuarios' },
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
  { chave: 'ver_dashboard', rotulo: 'Ver dashboard (gráficos)', dependeDe: 'ver_inicio' },
  /* o Historico embaixo da Grade (o que ja foi feito). Todo setor que ja
     via a pagina inicial ganhou esta junto (atualizacao 27); a tela da TV
     nao tem. */
  { chave: 'ver_historico', rotulo: 'Ver histórico', dependeDe: 'ver_inicio' },
  { chave: 'editar_usuario', rotulo: 'Adicionar / editar usuário', dependeDe: 'ver_usuarios' },
  { chave: 'editar_cargo', rotulo: 'Adicionar / editar setor', dependeDe: 'ver_usuarios' },
  { chave: 'editar_cargo_titulo', rotulo: 'Adicionar / editar cargo', dependeDe: 'ver_usuarios' },
  /* o CPF dos colegas: incluir, corrigir e tirar, no editar usuario. Antes
     era trava de setor (so a diretoria); o proprio CPF cada um mexe em
     Configuracoes */
  { chave: 'editar_cpf', rotulo: 'Incluir / editar / excluir CPF', dependeDe: 'ver_usuarios' },
  { chave: 'editar_avaliacoes', rotulo: 'Adicionar / editar avaliações', dependeDe: 'ver_avaliacoes' },
  { chave: 'editar_clientes', rotulo: 'Adicionar / editar clientes', dependeDe: 'ver_clientes' },
  /* a planilha do Excel com o cadastro inteiro (Clientes > Exportar) */
  { chave: 'exportar_clientes', rotulo: 'Exportar clientes (Excel)', dependeDe: 'ver_clientes' },
  /* criar a obra (o card em Obras) e permissao propria (atualizacao 37):
     so o Comercial e o acesso total criam. A `editar_obras` continua
     mexendo na obra que ja existe (anexos, etiquetas, concluir) */
  { chave: 'criar_obras', rotulo: 'Criar obra', dependeDe: 'ver_obras' },
  { chave: 'editar_obras', rotulo: 'Editar obras', dependeDe: 'ver_obras' },
  { chave: 'excluir_concluidas', rotulo: 'Excluir obra concluída', dependeDe: 'ver_concluidas' },
  { chave: 'check_todas_etapas', rotulo: 'Check em todas as etapas', dependeDe: 'ver_obras' },
  /* o check e de quem esta NA OBRA (Membros > Incluir membro; quem ja
     marcou check nela tambem conta). Com esta, o setor marca os checks
     dele em qualquer obra, sem ser incluido (atualizacao 37) */
  { chave: 'check_todas_obras', rotulo: 'Marcar check em obra sem ser membro', dependeDe: 'ver_obras' },
  /* concluir o check que PEDE informacao (a resposta Sim/Nao, o horario,
     os ensaios, o prazo da execucao, o documento da proposta, a reserva
     e a retirada do carro) sem preencher a informacao (atualizacao 36).
     Nao abre o check de outro setor: quem marca o que continua sendo a
     regra de sempre (podeEditarCheck). Vale tambem para a Retirada e a
     Devolucao das ferramentas, que fora daqui so o LWN Control marca */
  { chave: 'check_sem_informacao', rotulo: 'Concluir check sem preencher a informação', dependeDe: 'ver_obras' },
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
  /* membro parcial: quem foi a obra sem marcar check e foi incluido a
     mao (atualizacao 30). Incluir qualquer um pode — a pessoa aceita
     ou recusa; TIRAR da obra depois e so com esta */
  { chave: 'excluir_membro_parcial', rotulo: 'Excluir membro parcial da obra', dependeDe: 'ver_obras' },
  { chave: 'enviar_avisos', rotulo: 'Enviar avisos', dependeDe: 'ver_avisos' },
  /* Despesas: ver a aba (e os proprios envios) e `ver_despesas`;
     ENVIAR despesa, refeicao ou bonus e `alterar_despesas`; abrir os
     envios dos OUTROS (Despesas > Envios gerais) e `revisar_despesa_geral`;
     EXCLUIR um lancamento e a ultima — os proprios, ou os de qualquer um
     quando o setor tambem revisa. */
  { chave: 'alterar_despesas', rotulo: 'Alterar despesas', dependeDe: 'ver_despesas' },
  { chave: 'revisar_despesa_geral', rotulo: 'Revisar despesa geral', dependeDe: 'ver_despesas' },
  { chave: 'excluir_despesas', rotulo: 'Excluir lançamento de despesa', dependeDe: 'ver_despesas' },
  /* os valores pre-definidos do reembolso (almoco, janta, bonus
     apartamento...) e quais tipos sao pre-definidos */
  { chave: 'definir_valores_reembolso', rotulo: 'Editar valores pré-definidos', dependeDe: 'ver_despesas' },
  /* Frotas: ver a aba e os registros de todos os veiculos e
     `ver_frotas`; dar SAIDA e DEVOLUCAO e `registrar_frota`;
     cadastrar e editar os veiculos (e corrigir o KM atual de um
     deles) e `editar_veiculos`. */
  { chave: 'registrar_frota', rotulo: 'Registrar saída e devolução de veículo', dependeDe: 'ver_frotas' },
  { chave: 'editar_veiculos', rotulo: 'Adicionar / editar veículos', dependeDe: 'ver_frotas' },
  /* apagar uma saida, troca ou devolucao registrada (Saidas e devolucoes) */
  { chave: 'excluir_registro_frota', rotulo: 'Excluir saída e devolução', dependeDe: 'ver_frotas' },
  /* quem RECEBE no Teams o aviso da devolucao com o tanque abaixo da
     metade (atualizacao 39). E aviso, e nao acesso: vale so para o setor
     que tem a chave marcada — o acesso total nao entra sozinho */
  { chave: 'alerta_combustivel_frota', rotulo: 'Receber alerta no Teams: devolução com menos de 50% de combustível', dependeDe: 'ver_frotas' },
  /* Almoxarife (atualizacao 38): as abas e os poderes de dentro dele, os
     mesmos do lwncontrol. A chave do lwncontrol e o que vem depois de
     "almox_" — e assim que a view almox.usuarios entrega para a tela
     dele (ALMOXARIFE, mais abaixo). "Usuarios", "Alterar cargo", "Criar
     cargos" e "Cadastrar facial" nao vieram: quem cuida disso e o main. */
  ...ALMOXARIFE_MODULOS.map(([chave, rotulo]) => ({ chave: `almox_${chave}`, rotulo, dependeDe: 'ver_almoxarife' })),
  /* Comercial: ver a aba e os funis e `ver_comercial`; criar, editar e
     mover negocio (e marcar ganho ou perdido) e `editar_negocios`;
     apagar de vez e `excluir_negocios`; mandar e-mail ao contato pela
     propria caixa do Outlook, sem sair do site, e `responder_emails`. */
  { chave: 'editar_negocios', rotulo: 'Adicionar / editar negócios', dependeDe: 'ver_comercial' },
  { chave: 'excluir_negocios', rotulo: 'Excluir negócio', dependeDe: 'ver_comercial' },
  { chave: 'responder_emails', rotulo: 'Responder e-mails pelo site', dependeDe: 'ver_comercial' },
  /* Turnos (atualizacao 31): ver a aba e `ver_turnos`; criar e mudar
     turnos, anotacoes do dia e cronogramas e `editar_turnos` */
  { chave: 'editar_turnos', rotulo: 'Adicionar / editar turnos e cronogramas', dependeDe: 'ver_turnos' },
]

/**
 * A tela de Setores mostra cada alteracao EMBAIXO da visualizacao de
 * que ela depende. Alguma que nao dependa de nenhuma iria num grupo
 * proprio, no fim (hoje nao ha: as de Usuarios ficaram embaixo de
 * "Usuários").
 */
export const GRUPOS = [
  ...VISUALIZACAO.map((v) => ({
    visualizacao: v,
    alteracoes: ALTERACAO.filter((a) => a.dependeDe === v.chave),
  })),
  { visualizacao: null, rotulo: 'Outras', alteracoes: ALTERACAO.filter((a) => !a.dependeDe) },
].filter((g) => g.visualizacao || g.alteracoes.length > 0)

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

const USUARIOS_ANTES = ['editar_usuario', 'editar_cargo', 'editar_cargo_titulo']

/**
 * Limpa a lista antes de gravar: alteracao sem a visualizacao dela
 * nao entra, e chave desconhecida some. E o mesmo tratamento no
 * servidor, para nao depender do que a tela mandou.
 */
export function normalizar(lista) {
  const marcadas = new Set((lista ?? []).filter((c) => CHAVES.includes(c)))
  /* Antes de existir `ver_usuarios`, a aba Usuarios abria com qualquer
     uma destas tres. O setor gravado assim continua vendo a aba (e
     mexendo no que mexia) sem precisar de atualizacao no banco: na
     proxima vez que for salvo, a lista ja vai com a `ver_usuarios`. */
  if (!marcadas.has('ver_usuarios') && USUARIOS_ANTES.some((c) => marcadas.has(c))) marcadas.add('ver_usuarios')
  Object.entries(DEPENDENCIA).forEach(([alteracao, visualizacao]) => {
    if (!marcadas.has(visualizacao)) marcadas.delete(alteracao)
  })
  return CHAVES.filter((c) => marcadas.has(c))
}

/* ------------------------------------------------------------
   As GUARDADAS (atualizacao 45)

   Desmarcar a aba ("Obras") tira so a aba. As alteracoes de dentro
   que estavam marcadas nao valem mais — `normalizar` as tira da lista
   que vale —, mas ficam guardadas a parte (cargo.permissoes_guardadas)
   e voltam do jeito que estavam quando a aba for marcada de novo.
   Antes elas caiam junto, e reabrir a aba era marcar tudo outra vez.

   Na tela, a lista do setor e uma so (as `marcadas`: as que valem mais
   as guardadas); `separar` e que divide na hora de gravar.
   ------------------------------------------------------------ */

/** As alteracoes marcadas cuja aba esta desmarcada, na ordem de CHAVES. */
export function guardadas(marcadas) {
  const lista = new Set((marcadas ?? []).filter((c) => CHAVES.includes(c)))
  return ALTERACAO.filter((p) => p.dependeDe && lista.has(p.chave) && !lista.has(p.dependeDe)).map((p) => p.chave)
}

/**
 * As marcadas da tela, divididas no que vai para o banco: `permissoes`
 * (o que vale) e `guardadas`. As guardadas saem ANTES do `normalizar`:
 * senao a regra antiga de Usuarios (editar usuario sem `ver_usuarios`
 * devolve a aba) marcava "Usuários" de volta sozinha.
 */
export function separar(marcadas) {
  const fora = guardadas(marcadas)
  return {
    permissoes: normalizar((marcadas ?? []).filter((c) => !fora.includes(c))),
    guardadas: fora,
  }
}

/**
 * As guardadas que ainda fazem sentido diante da lista que vale: so
 * alteracao, so com a aba DESMARCADA e que nao esteja valendo. Guardada
 * cuja aba voltou por outro caminho (uma atualizacao do banco que marcou
 * a aba para todos) nao volta a valer sozinha: ela sai, e a tela mostra
 * a aba sem ela — o que vale e so o que esta em `permissoes`.
 */
export function limparGuardadas(lista, permissoes) {
  const valem = new Set(permissoes ?? [])
  const pedidas = new Set(lista ?? [])
  return ALTERACAO.filter(
    (p) => p.dependeDe && pedidas.has(p.chave) && !valem.has(p.dependeDe) && !valem.has(p.chave),
  ).map((p) => p.chave)
}

/** true quando a permissao de alteracao esta travada pela falta da visualizacao. */
export function travada(chave, lista) {
  const exigida = DEPENDENCIA[chave]
  return Boolean(exigida) && !(lista ?? []).includes(exigida)
}

/**
 * As alteracoes de uma visualizacao. Desmarcar a aba so as derruba
 * quando o banco ainda nao tem as guardadas (sem a atualizacao 45).
 */
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
