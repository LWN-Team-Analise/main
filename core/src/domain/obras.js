/* ============================================================
   Regras de dominio das obras.

   O roteiro (etapas > cards > checks) NAO mora mais aqui: ele e
   cadastro, vem do banco e a tela de obra cria e apaga etapa,
   card e check. O que sobra neste arquivo sao as regras que leem
   esse roteiro — quem fechou, quem falta, quem pode marcar.

   Vocabulario:
     roteiro  = [{ id, numero, nome, cards: [...] }]
     card     = { id, titulo, cargos: ['gq', ...], checks: [...] }
     marcados = { [checkId]: { feitoPor, feitoEm } } — o que a obra ja fez

   Tudo aqui e funcao pura (sem React) para servir tanto as telas
   quanto o contexto.
   ============================================================ */

import { podeFazer } from './permissoes'
import { resumoDasLinhas } from './itensEnsaio'

export const PRIORIDADES = [
  { id: 'baixa', rotulo: 'Baixa' },
  { id: 'media', rotulo: 'Média' },
  { id: 'alta', rotulo: 'Alta' },
]

/**
 * Como a prioridade se escreve na tela.
 *
 * As tres so com a inicial maiuscula. Quem faz a alta saltar da lista e a
 * COR (vermelho), nao a caixa alta — que gritava no meio de um card ja
 * cheio de informacao.
 *
 * Vive aqui, e nao em cada tela, porque o card do quadro, a tela da obra,
 * o filtro e o pop-up de cadastro escrevem a MESMA palavra — e ja houve
 * o dia em que um deles dizia "média" e o outro "Media".
 */
export const PRIORIDADE_ROTULO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }

/** O rotulo de uma prioridade, com reserva para valor desconhecido. */
export function rotuloDaPrioridade(id) {
  return PRIORIDADE_ROTULO[id] ?? id ?? "—"
}

export const PRIORIDADE_PESO = { alta: 3, media: 2, baixa: 1 }

export const TIPOS = [
  { id: 'padrao', rotulo: 'Obra padrão' },
  { id: 'emergencia', rotulo: 'Obra emergência' },
]

/** Emergencia nasce e continua alta: a tela nem oferece a escolha. */
export const PRIORIDADE_FIXA = { emergencia: 'alta' }

export function prioridadeDaObra({ tipo, prioridade }) {
  return PRIORIDADE_FIXA[tipo] ?? prioridade
}

/* ------------------------------------------------------------
   A prioridade da EMERGENCIA se escreve "Urgente"

   No banco ela continua sendo 'alta' — e o gatilho que garante isso,
   e mexer no valor gravado obrigaria a migrar a coluna, o CHECK e
   todas as obras antigas para ganhar uma palavra.

   O que muda e a LEITURA. "Alta" numa obra de emergencia nao
   distinguia nada: a obra padrao tambem podia ser alta, e as duas
   apareciam iguais no quadro. "Urgente" e a palavra que so a
   emergencia usa.

   A escolha do formulario continua sendo entre as TRES de sempre — e
   so na obra padrao. Urgente nao e uma quarta opcao a marcar; e o
   nome que a emergencia da a prioridade que ela ja tem.
   ------------------------------------------------------------ */

/** Como a prioridade DESTA obra se escreve. */
export function rotuloPrioridadeObra(obra) {
  if (obra?.tipo === 'emergencia') return 'Urgente'
  return rotuloDaPrioridade(obra?.prioridade)
}

/**
 * O tom da pastilha: 'urgente' na emergencia, a propria prioridade nas
 * outras. E o que o `data-pri` do CSS le para pintar.
 */
export function tomPrioridadeObra(obra) {
  return obra?.tipo === 'emergencia' ? 'urgente' : obra?.prioridade
}

export function prioridadeTravada(tipo) {
  return tipo in PRIORIDADE_FIXA
}

/** O rotulo da etapa sai da posicao: 1 -> "1ª Etapa". */
export function rotuloDaEtapa(numero) {
  return `${numero}ª Etapa`
}

/* ------------------------------------------------------------
   O nome da obra na tela

   Uma obra se chama "Agener Uniao - LWN-888-01 - SMOKE": primeiro
   a empresa, depois o n. da proposta (como foi digitado). Era o
   contrario ate 29/10; a empresa veio para a frente para as obras
   de um mesmo cliente ficarem juntas e serem achadas de relance.
   A busca continua achando pelo numero da proposta.

   Vive aqui, e nao em cada tela, porque o card do quadro, a
   capa da obra, a lista de Concluidas, o chat e o sininho
   escrevem o MESMO nome — e obra antiga, sem proposta, precisa
   cair no nome do cliente sozinho em todos eles.
   ------------------------------------------------------------ */

export function tituloDaObra(obra, cliente) {
  const nome = cliente?.nome ?? 'Cliente removido'
  const proposta = String(obra?.proposta ?? '').trim()
  return proposta ? `${nome} - ${proposta}` : nome
}

/* ------------------------------------------------------------
   O roteiro que CADA obra enxerga

   O roteiro anda para a frente: o que e criado dentro de uma
   obra vale para ela e para as proximas, e o que e excluido
   some dela em diante — as anteriores continuam com o roteiro
   que tinham no dia em que nasceram.

   Quem carimba isso e o servidor, em vigenteDe/vigenteAte de
   cada etapa, card e check. Aqui a gente so aplica a janela:

       vigenteDe <= nascimento < vigenteAte

   Depois de filtrar, as etapas sao renumeradas (1ª, 2ª, 3ª...)
   dentro da propria obra: se a 2ª etapa saiu do roteiro em
   maio, a obra de junho ve a antiga 3ª como a sua 2ª.
   ------------------------------------------------------------ */

const dentroDaJanela = (peca, quando) => {
  if (!quando) return !peca?.vigenteAte
  const t = new Date(quando).getTime()
  const de = peca?.vigenteDe ? new Date(peca.vigenteDe).getTime() : -Infinity
  const ate = peca?.vigenteAte ? new Date(peca.vigenteAte).getTime() : Infinity
  return de <= t && t < ate
}

/**
 * O roteiro como ele estava (e continua) para uma obra criada em
 * `nascimento`. Sem data, devolve o roteiro que vale hoje.
 */
export function roteiroVigente(roteiro, nascimento, obra = null) {
  const quando = nascimento ?? new Date().toISOString()
  /* Obra com checks PROPRIOS (obra.checksProprios, atualizacao 18) le so
     as copias dela: mexer num check dentro de uma obra vale so para
     aquela obra. As outras leem so os checks do roteiro — o check de uma
     obra nao aparece em nenhuma outra. */
  const proprios = Boolean(obra?.checksProprios)
  const doCheck = (check) =>
    proprios
      ? String(check.obraId) === String(obra.id) && !check.vigenteAte
      : !check.obraId && dentroDaJanela(check, quando)

  return (roteiro ?? [])
    .filter((etapa) => dentroDaJanela(etapa, quando))
    .map((etapa, indice) => ({
      ...etapa,
      // a numeracao e da OBRA, nao do cadastro: sem buraco na fila
      numero: indice + 1,
      cards: (etapa.cards ?? [])
        .filter((card) => dentroDaJanela(card, quando))
        .map((card) => ({
          ...card,
          checks: (card.checks ?? []).filter(doCheck),
        })),
    }))
}

/* ------------------------------------------------------------
   Leitura do que ja foi feito
   ------------------------------------------------------------ */

const feito = (marcados, checkId) => Boolean(marcados?.[checkId])

/**
 * Os checks que a obra COBRA no card. O check opcional (o "Material de
 * gases" na obra sem ensaio de gases — ver aplicarRegraDosGases) fica
 * de fora: pode ser marcado, mas nao segura card, etapa nem conclusao.
 */
export const checksExigidos = (card) => (card?.checks ?? []).filter((c) => !c.opcional)

/**
 * Card sem nenhum check nao entra na conta de nada.
 *
 * E o estado de quem acabou de criar o card e ainda nao escreveu os
 * checks. Se ele contasse, um card vazio deixaria a etapa travada em
 * TODAS as obras ate alguem lembrar de preencher — e ninguem ia
 * descobrir o porque.
 */
const cardVale = (card) => checksExigidos(card).length > 0

/** Card fechado = todos os checks cobrados dele marcados. */
export function cardConcluido(card, marcados) {
  if (!cardVale(card)) return false
  return checksExigidos(card).every((c) => feito(marcados, c.id))
}

/** Etapa fecha quando todos os cards que valem fecharam. */
export function etapaConcluida(etapa, marcados) {
  const valem = (etapa?.cards ?? []).filter(cardVale)
  if (valem.length === 0) return false
  return valem.every((card) => cardConcluido(card, marcados))
}

/** Cargos que ainda devem informacao na etapa — vira [téc] [gq] no card. */
export function setoresPendentes(roteiro, marcados, numeroEtapa) {
  const etapa = roteiro?.find((e) => e.numero === numeroEtapa)
  if (!etapa) return []
  const pendentes = etapa.cards
    .filter((card) => cardVale(card) && !cardConcluido(card, marcados))
    .flatMap((card) => card.cargos)
  return [...new Set(pendentes)]
}

/** Quantos cards da etapa contam para o placar "2/3". */
export function cardsQueValem(etapa) {
  return (etapa?.cards ?? []).filter(cardVale)
}

/** Etapa em andamento: a primeira que ainda nao fechou. */
export function etapaAtual(roteiro, marcados) {
  const aberta = roteiro?.find((e) => !etapaConcluida(e, marcados))
  return aberta ? aberta.numero : (roteiro?.length ?? 1)
}

/**
 * true quando todas as etapas do roteiro fecharam.
 *
 * ATENCAO: isto e "marcou tudo", nao "a obra acabou". Sao coisas
 * diferentes desde que a conclusao virou um clique:
 *
 *   obraConcluida()  -> nao sobrou check em aberto. E o que faz o
 *                       botao "Concluir obra" aparecer;
 *   obraFechada()    -> alguem clicou nele. E o que tira a obra do
 *                       quadro e a leva para Concluidas.
 *
 * Antes as duas eram a mesma coisa, e um check marcado por engano
 * mandava a obra inteira para o arquivo sem ninguem decidir nada.
 */
/**
 * Etapa VAZIA não segura a obra.
 *
 * `etapaConcluida` devolve false para a etapa sem card com check —
 * e está certa no contexto dela, que é a FILA: uma etapa sem nada
 * escrito ainda não foi preenchida, e liberar a seguinte por causa
 * disso seria pular o trabalho.
 *
 * Aqui a pergunta é outra: "sobrou alguma coisa por marcar?". Uma
 * etapa sem nenhum check não tem o que marcar, então não pode ser o
 * motivo de a obra nunca poder ser encerrada. Enquanto ela contava,
 * bastava UMA etapa vazia no roteiro — a última criada e ainda sem
 * cards, por exemplo — para o botão "Concluir obra" não aparecer
 * nunca mais, em obra nenhuma que tivesse esse roteiro.
 */
export function obraConcluida(roteiro, marcados) {
  const comTrabalho = (roteiro ?? []).filter((e) => (e?.cards ?? []).some(cardVale))
  if (comTrabalho.length === 0) return false
  return comTrabalho.every((e) => etapaConcluida(e, marcados))
}

/**
 * O MOMENTO em que a obra ficou pronta: o carimbo do ULTIMO check
 * marcado, quando nao sobra nenhum por marcar — a 5a etapa inclusive.
 * Enquanto faltar check, null.
 */
export function prontaEm(roteiro, obra) {
  if (!obra || !obraConcluida(roteiro, obra.checks)) return null
  return (
    Object.values(obra.checks ?? {})
      .map((m) => m?.feitoEm)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  )
}

/**
 * O PRAZO FINAL da obra: o DIA em que o ultimo check foi marcado.
 *
 * Ele nao se escolhe mais no cadastro. A obra chega a 5a etapa, os
 * checks vao sendo marcados, e quando o ultimo usuario marca o ultimo
 * check que faltava para concluir, o prazo final aparece — e e esse dia.
 * Antes disso a obra nao tem prazo final.
 *
 * 'AAAA-MM-DD' no fuso local, ou null. O `dataConclusao` que as obras
 * antigas ainda guardam (o prazo que se escolhia no cadastro) continua
 * no banco, mas nao aparece mais nem pinta o card.
 */
export function prazoFinalDaObra(roteiro, obra) {
  const quando = prontaEm(roteiro, obra)
  if (!quando) return null
  const d = new Date(quando)
  if (Number.isNaN(d.getTime())) return String(quando).slice(0, 10)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * A obra foi ENCERRADA por alguem?
 *
 * O carimbo vem do banco (obra.concluida_em), gravado no clique do
 * "Concluir obra". Enquanto ele for nulo a obra continua no quadro,
 * mesmo com todos os checks marcados.
 */
export function obraFechada(obra) {
  return Boolean(obra?.concluidaEm)
}

/**
 * A obra esta pronta para ser concluida?
 *
 * Tres condicoes, e as tres precisam valer:
 *   - ainda esta aberta (nao adianta concluir duas vezes);
 *   - o roteiro dela tem check (obra sem roteiro nao "acaba");
 *   - nao sobrou nenhum check por marcar.
 */
export function prontaParaConcluir(roteiro, obra) {
  if (obraFechada(obra)) return false
  return obraConcluida(roteiro, obra?.checks)
}

/** Percentual concluido da obra (0–100), usado nas barras de progresso. */
export function progressoDaObra(roteiro, marcados) {
  const todos = (roteiro ?? []).flatMap((e) => e.cards.flatMap(checksExigidos))
  if (todos.length === 0) return 0
  return Math.round((todos.filter((c) => feito(marcados, c.id)).length / todos.length) * 100)
}

/**
 * Estado da etapa na tela de detalhe:
 *  'concluida' | 'atual' | 'bloqueada'
 *
 * Obra PADRAO anda em fila: so a etapa atual aceita marcacao e as
 * seguintes ficam com cadeado ate a anterior fechar.
 * Obra EMERGENCIA abre todas de uma vez — numa emergencia ninguem pode
 * ficar esperando a etapa anterior fechar para agir.
 */
export function estadoDaEtapa(roteiro, obra, numero) {
  const marcados = obra?.checks ?? {}
  const etapa = roteiro?.find((e) => e.numero === numero)
  if (etapaConcluida(etapa, marcados)) return 'concluida'
  if (obra?.tipo === 'emergencia') return 'atual'
  const anteriores = (roteiro ?? []).filter((e) => e.numero < numero)
  return anteriores.every((e) => etapaConcluida(e, marcados)) ? 'atual' : 'bloqueada'
}

/* ------------------------------------------------------------
   As etapas do FLUXO

   As tres primeiras etapas de fabrica tem um papel fixo (vem do
   banco, etapa.papel — ver db/atualizacao-14.sql.txt). E so para o
   sistema saber onde esta cada coisa; na tela ele nao aparece — a
   etapa e "1ª Etapa", "2ª Etapa"...:

     planejamento   1a — mora ali o "Planejamento de ensaios";
     intermediaria  2a;
     execucao       3a — exige o prazo DA EXECUCAO, e e ali que os
                    ensaios sao executados dia a dia.

   Etapa FIXA (etapa.fixa) e de fabrica: nao se renomeia, nao se
   reordena e nao se exclui. So a criada a mao segue editavel.
   ------------------------------------------------------------ */

/** A etapa de execucao do roteiro desta obra (ou null). */
export function etapaDeExecucao(roteiro) {
  return (roteiro ?? []).find((e) => e.papel === 'execucao') ?? null
}

/** Os checks do sistema: o que abre a escolha, o que abre a execucao e o de gases. */
export const CHECK_PLANEJAMENTO = 'planejamento_ensaios'
export const CHECK_EXECUCAO = 'execucao_ensaios'
export const CHECK_GASES = 'material_gases'
/* o "Prazo da execucao" da 1a etapa (atualizacao 19): definir o prazo
   da execucao marca ele, e a 3a etapa so mostra o prazo, travado */
export const CHECK_PRAZO_EXECUCAO = 'prazo_execucao'

/**
 * Onde ESTA obra define o prazo da execucao: { etapa, card, check } do
 * check "Prazo da execucao", ou null — a obra criada antes da
 * atualizacao 19 nao tem esse check, e define o prazo na propria etapa
 * de execucao, como sempre.
 */
export function checkDoPrazoDaExecucao(roteiro) {
  for (const etapa of roteiro ?? []) {
    for (const card of etapa.cards ?? []) {
      const check = (card.checks ?? []).find((c) => c.tipo === CHECK_PRAZO_EXECUCAO)
      if (check) return { etapa, card, check }
    }
  }
  return null
}

/* ------------------------------------------------------------
   A "Proposta tecnica" (1a etapa)

   O check "Proposta tecnica" da 1a etapa pede o documento: o clique
   abre o pop-up de anexo, e e anexar que marca ele. O arquivo vai para
   os Anexos da obra com o nome comecando por PREFIXO_PROPOSTA — e por
   esse nome que o check acha o seu documento, sem coluna nova no banco.
   ------------------------------------------------------------ */

export const PREFIXO_PROPOSTA = 'Proposta técnica - '

const semAcento = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** true para o check "Proposta tecnica" da 1a etapa. */
export function ehPropostaTecnica(etapa, check) {
  return etapa?.numero === 1 && semAcento(check?.titulo).startsWith('proposta tecnica')
}

/** O documento da proposta tecnica desta obra: o anexo mais recente dela (ou null). */
export function anexoDaProposta(obra) {
  return (
    (obra?.anexos ?? [])
      .filter((a) => String(a.nome ?? '').startsWith(PREFIXO_PROPOSTA))
      .sort((a, b) => String(b.enviadoEm ?? '').localeCompare(String(a.enviadoEm ?? '')))[0] ?? null
  )
}

/** O nome do arquivo como a pessoa o enviou, sem o prefixo da proposta. */
export const nomeDaProposta = (anexo) => String(anexo?.nome ?? '').slice(PREFIXO_PROPOSTA.length)

/* ------------------------------------------------------------
   A reserva de carro (atualizacao 23)

   "Reserva de carro" (1a etapa, Time Tecnico): o SUPERVISOR escolhe um
   carro da frota que esteja na garagem; reservar e que marca o check.
   "Retirada do carro" (3a etapa): so existe na obra que reservou um
   carro — sem reserva ele sai do roteiro dela (nao aparece e nao
   conta). Registrar a saida do carro, ali mesmo, e que marca o check,
   e a saida fica salva na aba Frotas.
   ------------------------------------------------------------ */

export const CHECK_RESERVA = 'reserva_carro'
export const CHECK_RETIRADA = 'retirada_carro'

/** O roteiro da obra sem o "Retirada do carro" quando ela nao reservou carro. */
export function aplicarRegraDaReserva(roteiro, obra) {
  if (obra?.reserva?.veiculoId) return roteiro
  const tem = (roteiro ?? []).some((e) =>
    (e.cards ?? []).some((c) => (c.checks ?? []).some((k) => k.tipo === CHECK_RETIRADA)),
  )
  if (!tem) return roteiro
  return roteiro.map((etapa) => ({
    ...etapa,
    cards: etapa.cards.map((card) => ({
      ...card,
      checks: card.checks.filter((check) => check.tipo !== CHECK_RETIRADA),
    })),
  }))
}

/**
 * Quem reserva o carro: o SUPERVISOR — o cargo da pessoa (Supervisor),
 * nao o setor — ou quem esta num setor com acesso total. `cargoTitulo`
 * e o nome do cargo como a equipe o le (src/context/DadosContext).
 */
export function podeReservarCarro(usuario, cargoTitulo) {
  if (usuario?.acessoTotal) return true
  return semAcento(cargoTitulo ?? usuario?.cargoTitulo).startsWith('supervisor')
}

/**
 * A ordem das listas de clientes: os PRIORITARIOS primeiro, na posicao
 * deles (as unidades da LWN, atualizacao 23), depois o resto em ordem
 * alfabetica.
 */
export function ordemDosClientes(a, b) {
  const pa = a.ordemPrioridade ?? Infinity
  const pb = b.ordemPrioridade ?? Infinity
  return pa !== pb ? pa - pb : a.nome.localeCompare(b.nome, 'pt-BR')
}

/** true para os checks do sistema (nao se excluem nem se renomeiam). */
export function checkDoSistema(check) {
  return Boolean(check?.tipo) && check.tipo !== 'comum'
}

/* ------------------------------------------------------------
   O check "Material de gases" (2a etapa, Qualidade)

   Cada ensaio do catalogo e HVAC ou GASES. O check de gases (tipo
   'material_gases', atualizacao 17) so e OBRIGATORIO na obra que
   tem algum ensaio de GASES planejado; nas outras ele fica opcional.
   O servidor faz a mesma conta na conclusao da obra.
   ------------------------------------------------------------ */

/** Os ensaios de GASES planejados na obra. */
export function ensaiosDeGases(obra, ensaioPorId) {
  return (obra?.ensaios ?? [])
    .map((id) => ensaioPorId(id))
    .filter((e) => e?.classificacao === 'gases')
}

/**
 * O roteiro da obra com o check de gases resolvido:
 *   - sem ensaio de gases: `opcional: true` (fica fora da conta);
 *   - com ensaio de gases: `exigidoPor` traz os nomes deles, que a
 *     tela mostra ao passar o mouse.
 */
export function aplicarRegraDosGases(roteiro, gases) {
  const tem = (roteiro ?? []).some((e) =>
    (e.cards ?? []).some((c) => (c.checks ?? []).some((k) => k.tipo === CHECK_GASES)),
  )
  if (!tem) return roteiro
  const nomes = (gases ?? []).map((e) => e.nome)
  return roteiro.map((etapa) => ({
    ...etapa,
    cards: etapa.cards.map((card) => ({
      ...card,
      checks: card.checks.map((check) =>
        check.tipo === CHECK_GASES
          ? { ...check, opcional: nomes.length === 0, exigidoPor: nomes }
          : check,
      ),
    })),
  }))
}

/* ------------------------------------------------------------
   As datas da obra, e o que cada uma diz:

     dataInicio                        o comeco da obra (cadastro);
     execucaoInicio -> execucaoPrazo   so a ETAPA DE EXECUCAO (3a),
                                       definido dentro da obra. Nao
                                       mexe na cor nem no tipo;
     prazo final                       NAO se escolhe: e o dia em que o
                                       ultimo check da obra foi marcado
                                       (prazoFinalDaObra). So existe com
                                       a obra pronta.

   O TIPO e o do cadastro: so e Obra Emergencial a que foi aberta como
   emergencia. Execucao curta (hoje, amanha) nao transforma obra padrao
   em emergencia.
   ------------------------------------------------------------ */

/* ------------------------------------------------------------
   A execucao dos ENSAIOS

   O Planejamento de ensaios escolhe os ensaios da obra
   (obra.ensaios, a lista de ids). Na execucao, cada ensaio ganha um
   percentual por DIA (obra.execucao[ensaioId] = [{ dia, percentual }],
   do dia mais antigo ao mais novo). O andamento de agora de um
   ensaio e o percentual do dia mais recente; o da execucao inteira e
   a media dos ensaios. Ela so fecha com todos em 100%.
   ------------------------------------------------------------ */

/**
 * { itens: [{ id, nome, percentual, dias }], geral, dias, completo },
 * ou null quando a obra nao planejou ensaio nenhum.
 */
export function progressoExecucao(obra, nomeDoEnsaio = (id) => id) {
  const ids = obra?.ensaios ?? []
  if (ids.length === 0) return null
  const itens = ids.map((id) => {
    const dias = obra.execucao?.[id] ?? []
    return {
      id,
      nome: nomeDoEnsaio(id),
      percentual: dias.length > 0 ? dias[dias.length - 1].percentual : 0,
      dias,
    }
  })
  /* na obra que planeja por item a execucao inteira e a parte das
     LINHAS feitas (cada linha pesa igual), e nao a media dos ensaios */
  const linhas = resumoDasLinhas(obra.itens)
  const geral =
    linhas.total > 0
      ? linhas.percentual
      : Math.round(itens.reduce((soma, i) => soma + i.percentual, 0) / itens.length)
  const dias = [...new Set(itens.flatMap((i) => i.dias.map((d) => d.dia)))].sort()
  return { itens, geral, dias, completo: itens.every((i) => i.percentual >= 100) }
}

/* ------------------------------------------------------------
   Prazos e a COR do card no quadro

   O tom do card, do mais calmo ao mais urgente:

     verde    ('ok')          obra padrao em dia;
     azul     ('emergencia')  obra de emergencia em dia;
     amarelo  ('atraso')      um check passou do prazo dele — ou esta a
                              3 dias de vencer.

   Vale o MAIS urgente de todos os motivos.

   O PRAZO FINAL da obra nao pinta mais o card: ele deixou de ser uma
   data escolhida no cadastro e passou a ser o dia em que o ultimo check
   foi marcado (prazoFinalDaObra) — quando ele existe, nao ha mais nada
   para atrasar. O prazo DA EXECUCAO tambem nao entra.

   (laranja, vermelho e vencido continuam no PESO_DO_TOM e no CSS: eram
   do prazo final escolhido no cadastro.)

   Check ja feito nao atrasa nada, mesmo com o prazo no passado: o
   prazo serviu.
   ------------------------------------------------------------ */

export const AVISO_ANTES_DIAS = 3
export const PERTO_DE_TERMINAR = 80

/** O peso de cada tom: o card fica com o mais pesado. */
export const PESO_DO_TOM = { ok: 0, emergencia: 0, atraso: 1, laranja: 2, vermelho: 3, vencido: 4 }

/** Dias de `hoje` ate `data` ('AAAA-MM-DD'); negativo quando ja passou. */
export function diasAte(data, hoje) {
  const emDias = (iso) => {
    const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number)
    return Date.UTC(a, m - 1, d) / 86400000
  }
  return Math.round(emDias(data) - emDias(hoje))
}

/** 'AAAA-MM-DD' + n dias (n pode ser negativo). Sem fuso no caminho. */
export function somarDias(iso, n) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

/* periodo corrido antigo maior que isto vira so o comeco: protege a tela
   de um inicio de execucao digitado com o ano errado */
const MAX_DIAS_CORRIDOS = 400

/**
 * Os DIAS da execucao, do primeiro ao ultimo ('AAAA-MM-DD').
 *
 * Desde a atualizacao 20 eles sao escolhidos um a um no calendario
 * (obra.execucaoDias): uma execucao de 5 dias pode ser so nos dias
 * uteis, pular uma semana, cair num feriado. A obra que definiu o
 * periodo antes disso tem so o inicio e o prazo, e os dias dela sao
 * todos os do meio — o periodo corrido de sempre.
 *
 * Lista vazia = sem prazo da execucao.
 */
export function diasDaExecucao(obra) {
  if (obra?.execucaoDias?.length) return obra.execucaoDias
  const prazo = obra?.execucaoPrazo
  if (!prazo) return []
  const inicio = obra.execucaoInicio ?? obra.dataInicio ?? prazo
  if (inicio > prazo) return [prazo]
  const total = Math.min(diasAte(prazo, inicio), MAX_DIAS_CORRIDOS)
  return Array.from({ length: total + 1 }, (_, i) => somarDias(inicio, i))
}

/**
 * Os dias agrupados em trechos seguidos:
 *   ['06/10', '07/10', '08/10', '13/10'] -> [['06/10', '08/10'], ['13/10', '13/10']]
 * (em 'AAAA-MM-DD', ja em ordem).
 */
export function trechosDosDias(dias) {
  const trechos = []
  for (const dia of dias) {
    const ultimo = trechos.at(-1)
    if (ultimo && somarDias(ultimo[1], 1) === dia) ultimo[1] = dia
    else trechos.push([dia, dia])
  }
  return trechos
}

/** '06/10 a 08/10, 13/10' — os trechos por extenso, para dica e resumo. */
export function resumoDosDias(dias) {
  const curta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  return trechosDosDias(dias)
    .map(([a, b]) => (a === b ? curta(a) : `${curta(a)} a ${curta(b)}`))
    .join(', ')
}

/**
 * O relogio do prazo final da obra: 'ok' | 'atraso' (amarelo) |
 * 'laranja' | 'vermelho' | 'vencido'.
 *
 * Mede o que RESTA do periodo (do inicio ao prazo):
 *   - mais da metade e mais de 3 dias ........ verde;
 *   - metade ou menos, ou 3 dias ou menos .... amarelo;
 *   - um quarto ou menos, ou 2 dias .......... laranja;
 *   - 1 dia (amanha) ou o proprio dia ........ vermelho;
 *   - passou ................................. vencido.
 */
export function urgenciaDoPrazo(inicio, prazo, hoje) {
  if (!prazo) return null
  const restam = diasAte(prazo, hoje)
  if (restam < 0) return 'vencido'
  if (restam <= 1) return 'vermelho'
  const total = inicio ? Math.max(1, diasAte(prazo, inicio)) : null
  const fracao = total ? restam / total : 1
  if (restam <= 2 || fracao <= 0.25) return 'laranja'
  if (restam <= AVISO_ANTES_DIAS || fracao <= 0.5) return 'atraso'
  return 'ok'
}

/**
 * A situacao da obra no quadro.
 *
 * Devolve { tom, motivos }. `tom` e um dos de PESO_DO_TOM e cada motivo
 *   { tom, venceu, alvo: 'obra' | 'check', prazo, dias, numero?,
 *     titulo?, setores: [chaves] }
 * — do mais urgente para o menos. Os `setores` sao quem ainda deve
 * naquele prazo: e o "atraso por causa de um setor" que a tela escreve.
 */
export function situacaoDaObra(roteiro, obra, hoje) {
  const tomBase = obra?.tipo === 'emergencia' ? 'emergencia' : 'ok'
  if (!obra || obraFechada(obra)) return { tom: tomBase, motivos: [] }

  const marcados = obra.checks ?? {}
  const prazos = obra.prazos ?? {}
  const motivos = []

  /* o prazo de um CHECK: venceu, ou vence em ate 3 dias — amarelo */
  ;(roteiro ?? []).forEach((etapa) => {
    ;(etapa.cards ?? []).forEach((card) => {
      ;(card.checks ?? []).forEach((check) => {
        const prazo = prazos.checks?.[check.id]
        if (!prazo || feito(marcados, check.id)) return
        const dias = diasAte(prazo, hoje)
        if (dias > AVISO_ANTES_DIAS) return
        motivos.push({
          tom: 'atraso',
          venceu: dias < 0,
          alvo: 'check',
          prazo,
          dias,
          numero: etapa.numero,
          titulo: check.titulo,
          setores: cargosDoCheck(check, card),
        })
      })
    })
  })

  motivos.sort(
    (a, b) =>
      PESO_DO_TOM[b.tom] - PESO_DO_TOM[a.tom] ||
      Number(b.venceu) - Number(a.venceu) ||
      a.dias - b.dias,
  )
  return { tom: motivos.length > 0 ? motivos[0].tom : tomBase, motivos }
}

/**
 * Como esta o prazo de UMA etapa ou de UM check, para a etiqueta dele:
 * 'vencido' | 'perto' | 'ok' — ou null quando nao ha prazo ou ja foi
 * feito. `andamento` e o percentual ja feito (0 para um check aberto).
 */
export function estadoDoPrazo(prazo, hoje, { feito: jaFeito = false, andamento = 0 } = {}) {
  if (!prazo || jaFeito) return null
  const dias = diasAte(prazo, hoje)
  if (dias < 0) return 'vencido'
  if (dias <= AVISO_ANTES_DIAS && andamento < PERTO_DE_TERMINAR) return 'perto'
  return 'ok'
}

/* ------------------------------------------------------------
   Quem pode o que
   ------------------------------------------------------------ */

/**
 * A chave do cargo de quem esta logado. Vem do banco
 * (usuario.cargoChave) e cai no texto de usuario.cargo quando a tabela
 * cargo ainda nao existe.
 */
export function chaveDoCargo(usuario) {
  if (!usuario) return null
  if (usuario.cargoChave) return usuario.cargoChave
  // sem a tabela cargo, normaliza o texto livre: "Técnico" -> "tecnico"
  return (
    String(usuario.cargo ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || null
  )
}

/**
 * Setor com acesso total (diretoria).
 *
 * Le SO a marca `acessoTotal`, que e a mesma coluna que o servidor
 * consulta em `meuCargo()`. Ja houve aqui dois atalhos a mais — o
 * texto 'todos' na lista antiga e a chave do setor ser "diretor" —
 * e eles eram a origem do check que marcava e desmarcava sozinho:
 * a tela liberava o clique, o servidor recusava a gravacao e o
 * recarregamento devolvia o check ao estado anterior. Cliente e
 * servidor precisam responder a MESMA coisa.
 */
export function temAcessoTotal(usuario) {
  return Boolean(usuario?.acessoTotal)
}

/* reexportado porque quase toda tela ja importa deste arquivo; a
   lista de permissoes em si mora em src/domain/permissoes.js */
export { podeFazer }

/**
 * Quem mexe no CPF dos OUTROS: quem tem a permissao "Incluir / editar /
 * excluir CPF" (`editar_cpf`; o acesso total passa por ela) e a
 * diretoria, que ja podia antes de a permissao existir. `pode` e o do
 * useDados, de quem esta logado.
 */
export function podeEditarCpf(usuario, pode) {
  return Boolean(pode?.('editar_cpf')) || chaveDoCargo(usuario) === 'diretor'
}

/**
 * Quem marca os checks de um card.
 *
 * Cada setor mexe so no que e dele: o ADM nao fecha check do Tecnico.
 * A excecao e o setor com acesso total (diretoria), que edita qualquer
 * card. (Card antigo, de antes de o card ser de um setor so, ainda pode
 * ter mais de um — e ai continua aceitando os que tem.)
 */
export function podeEditarCard(usuario, card) {
  if (!usuario) return false
  if (temAcessoTotal(usuario)) return true
  return (card?.cargos ?? []).includes(chaveDoCargo(usuario))
}

/**
 * De quem e um check.
 *
 * Normalmente e de quem e o card. Mas o check pode ter dono proprio — e
 * ai a lista DELE manda, e a do card nao entra. E o que permite pendurar
 * "Envio revisao externa" em GQ + Excelencia sem transformar o card
 * inteiro em "GQ + Excelencia".
 */
export function cargosDoCheck(check, card) {
  const proprios = check?.cargos ?? []
  return proprios.length > 0 ? proprios : (card?.cargos ?? [])
}

/** true quando o check tem dono diferente do card — a tela marca isso. */
export function checkTemDonoProprio(check) {
  return (check?.cargos ?? []).length > 0
}

/**
 * Quem marca ESTE check.
 *
 * A regra e "so o seu setor", com tres portas de saida:
 *   - acesso total (diretoria);
 *   - a permissao "check em todas as etapas";
 *   - a obra e de EMERGENCIA (obra.tipo === 'emergencia'): ali ninguem
 *     espera o setor certo, e QUALQUER setor marca qualquer check.
 *
 * Na obra padrao a trava por setor continua igual. O servidor
 * (podeMarcar, em server/routes/dados.js) responde a MESMA coisa — se
 * os dois divergirem, o check pisca: a tela libera e a API recusa.
 */
export function podeEditarCheck(usuario, check, card, obra) {
  if (!usuario) return false
  if (temAcessoTotal(usuario)) return true
  if (podeFazer(usuario, 'check_todas_etapas')) return true
  if (obra?.tipo === 'emergencia') return true
  return cargosDoCheck(check, card).includes(chaveDoCargo(usuario))
}

/* ------------------------------------------------------------
   Aparencia do card de setor: a cor do setor dono do card
   ------------------------------------------------------------ */

export function corDoCard(card, corDoCargo) {
  const cores = (card?.cargos ?? []).map(corDoCargo).filter(Boolean)
  if (cores.length === 0) return '#6b7280'
  return cores[0]
}

export function fundoDoCard(card, corDoCargo) {
  const cores = (card?.cargos ?? []).map(corDoCargo).filter(Boolean)
  if (cores.length === 0) return '#6b7280'
  if (cores.length === 1) return cores[0]
  return `linear-gradient(120deg, ${cores.join(', ')})`
}

/**
 * A cor do card no estilo NOVO (contorno, sem fundo): a cor SUAVE do
 * setor dono pinta o contorno e o nome. O card e de um setor so — o
 * gradiente de varios setores saiu. `cor` e a funcao de cor suave.
 */
export function corDoSetorDoCard(card, cor) {
  const primeira = (card?.cargos ?? []).map(cor).find(Boolean)
  return primeira ?? '#6b7280'
}

/** Nome que aparece no topo do card: o titulo escrito ou os cargos dele. */
export function nomeDoCard(card, nomeDoCargo) {
  if (card?.titulo) return card.titulo
  const nomes = (card?.cargos ?? []).map(nomeDoCargo).filter(Boolean)
  return nomes.length > 0 ? nomes.join(' + ') : 'Sem cargo'
}

/* ------------------------------------------------------------
   O fechamento da SUA parte numa etapa
   ------------------------------------------------------------ */

/**
 * O que anunciar depois de marcar `checkId` — ou null, quando nao ha
 * nada a anunciar.
 *
 * A pergunta que ele responde e "acabei a minha parte desta etapa?", e
 * ela so tem resposta interessante no instante da TRANSICAO: no check
 * que fecha o ultimo pendente do seu setor naquela etapa. Marcar o
 * penultimo nao anuncia nada, e desmarcar e remarcar nao repete o
 * anuncio de graca — e por isso que a conta olha o antes e o depois,
 * em vez de so o depois.
 *
 * Duas respostas possiveis:
 *
 *   fechou: true   — ninguem mais deve nada nesta etapa. A obra anda.
 *   fechou: false  — a sua parte acabou, mas `pendentes` ainda tem
 *                    setores. E o que a tela precisa dizer para
 *                    ninguem ficar esperando a obra andar sozinha.
 *
 * `marcados` e o mapa da obra ANTES da marcacao: quem chama esta
 * funcao acabou de clicar e ainda nao tem a resposta do banco.
 */
export function avisoDeEtapa(roteiro, marcados, checkId, cargo) {
  if (!cargo || !checkId) return null

  const etapa = (roteiro ?? []).find((e) =>
    (e.cards ?? []).some((c) => (c.checks ?? []).some((k) => String(k.id) === String(checkId))),
  )
  if (!etapa) return null

  const meus = (etapa.cards ?? []).flatMap((card) =>
    checksExigidos(card).filter((k) => cargosDoCheck(k, card).includes(cargo)),
  )
  if (meus.length === 0) return null

  const antes = marcados ?? {}
  const depois = { ...antes, [checkId]: true }

  /* so na virada: faltava alguma coisa sua, e agora nao falta mais */
  if (!meus.some((k) => !antes[k.id])) return null
  if (!meus.every((k) => depois[k.id])) return null

  /* quem mais deve check nesta etapa. O seu setor nao entra: ele
     acabou de fechar, e listar a si mesmo seria o aviso se contradizer */
  const pendentes = new Set()
  ;(etapa.cards ?? []).forEach((card) => {
    checksExigidos(card).forEach((k) => {
      if (depois[k.id]) return
      cargosDoCheck(k, card).forEach((c) => {
        if (c !== cargo) pendentes.add(c)
      })
    })
  })

  return {
    numero: etapa.numero,
    nome: etapa.nome ?? '',
    ultima: etapa.numero === (roteiro?.length ?? 0),
    pendentes: [...pendentes],
    fechou: pendentes.size === 0,
  }
}

/* ------------------------------------------------------------
   O nome da etapa acrescenta alguma coisa ao rotulo dela?
   ------------------------------------------------------------ */

/** Tira acento, indicador ordinal e pontuacao: "3ª Etapa" -> "3 etapa". */
function achatar(texto) {
  return String(texto ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ªº°]/g, '')
    .toLowerCase()
    /* o "a"/"o" solto que sobra do ordinal: "3a etapa" -> "3 etapa" */
    .replace(/(\d)[ao](?![a-z0-9])/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * O nome PROPRIO da etapa, ou string vazia quando ele so repete o
 * rotulo automatico.
 *
 * A tela mostra as duas coisas lado a lado — "3ª Etapa · Comercial" —,
 * e isso funciona enquanto a etapa tem nome de verdade. So que nada
 * impede alguem de chamar a etapa de "3° Etapa" no roteiro, e ai a
 * mesma informacao saia duas vezes, escrita de dois jeitos: "3ª Etapa
 * 3° Etapa".
 *
 * A comparacao ignora acento, indicador ordinal e pontuacao, porque e
 * exatamente ai que as duas grafias divergem: "3ª", "3º", "3°" e "3a"
 * sao a mesma coisa para quem le.
 */
export function nomeProprioDaEtapa(nome, rotulo) {
  const proprio = achatar(nome)
  if (!proprio) return ''
  return proprio === achatar(rotulo) ? '' : String(nome).trim()
}
