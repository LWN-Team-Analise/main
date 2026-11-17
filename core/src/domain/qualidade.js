/* ============================================================
   QUALIDADE — o acompanhamento dos documentos e as solicitacoes
   de correio (atualizacao 58).

   Um arquivo so, sem React e sem import, lido pela tela e pela API
   (core/server/routes/qualidade.js): os funis, as etapas, as situacoes
   e os limites sao os MESMOS dos dois lados. A chave (id) e o que vai
   para o banco; o rotulo e so o que aparece, e muda sem migracao.
   ============================================================ */

/* ---------------- os DOCUMENTOS ----------------

   Como no Comercial: cada documento e um cartao que anda pelas etapas
   do funil dele. Sao tres funis, na ordem em que a Qualidade trabalha:
   o protocolo antes da obra, o relatorio depois dela e os documentos
   que nao sao de obra (certificados, procedimentos...). */
export const FUNIS_DOCUMENTOS = [
  {
    id: 'protocolos',
    rotulo: 'Protocolos',
    descricao: 'Antes da execução: da elaboração do protocolo até a aprovação do cliente e o uso em campo.',
    tipoPadrao: 'protocolo',
    etapas: [
      { id: 'a_elaborar', rotulo: 'A elaborar' },
      { id: 'elaboracao', rotulo: 'Em elaboração' },
      { id: 'revisao_interna', rotulo: 'Revisão interna' },
      { id: 'revisao_cliente', rotulo: 'Revisão do cliente' },
      { id: 'ajustes', rotulo: 'Ajustes' },
      { id: 'aprovado', rotulo: 'Aprovado' },
      { id: 'em_campo', rotulo: 'Execução em campo' },
    ],
  },
  {
    id: 'relatorios',
    rotulo: 'Relatórios',
    descricao: 'Depois da execução: dos dados de campo até o relatório emitido, assinado e entregue.',
    tipoPadrao: 'relatorio',
    etapas: [
      { id: 'aguardando_dados', rotulo: 'Aguardando dados de campo' },
      { id: 'elaboracao', rotulo: 'Em elaboração' },
      { id: 'revisao_pos_obra', rotulo: 'Revisão pós-obra' },
      { id: 'revisao_interna', rotulo: 'Revisão interna' },
      { id: 'revisao_cliente', rotulo: 'Revisão do cliente' },
      { id: 'ajustes', rotulo: 'Ajustes' },
      { id: 'emissao', rotulo: 'Emissão e assinatura' },
      { id: 'entregue', rotulo: 'Entregue ao cliente' },
    ],
  },
  {
    id: 'gerais',
    rotulo: 'Documentos gerais',
    descricao: 'Certificados, laudos, procedimentos e os outros documentos da Qualidade.',
    tipoPadrao: 'certificado',
    etapas: [
      { id: 'recebido', rotulo: 'Recebido' },
      { id: 'analise', rotulo: 'Em análise' },
      { id: 'revisao', rotulo: 'Em revisão' },
      { id: 'aprovacao', rotulo: 'Aguardando aprovação' },
      { id: 'aprovado', rotulo: 'Aprovado' },
      { id: 'publicado', rotulo: 'Publicado / arquivado' },
    ],
  },
]

export const FUNIL_DOC_PADRAO = 'protocolos'

export const funilDoc = (id) => FUNIS_DOCUMENTOS.find((f) => f.id === id) ?? null

/** A etapa dentro do funil, ou null se ela nao existe nele. */
export const etapaDoc = (funilId, etapaId) => funilDoc(funilId)?.etapas.find((e) => e.id === etapaId) ?? null

export const rotuloEtapaDoc = (funilId, etapaId) => etapaDoc(funilId, etapaId)?.rotulo ?? etapaId

export const TIPOS_DOCUMENTO = [
  { id: 'protocolo', rotulo: 'Protocolo', curto: 'PROT' },
  { id: 'relatorio', rotulo: 'Relatório', curto: 'REL' },
  { id: 'certificado', rotulo: 'Certificado', curto: 'CERT' },
  { id: 'laudo', rotulo: 'Laudo', curto: 'LAU' },
  { id: 'procedimento', rotulo: 'Procedimento (POP)', curto: 'POP' },
  { id: 'outro', rotulo: 'Outro', curto: 'DOC' },
]

export const tipoDoc = (id) => TIPOS_DOCUMENTO.find((t) => t.id === id) ?? TIPOS_DOCUMENTO.at(-1)

/* a prioridade pinta a faixa do alto do cartao */
export const PRIORIDADES_DOC = [
  { id: 'baixa', rotulo: 'Baixa', cor: '#9aa1ad' },
  { id: 'normal', rotulo: 'Normal', cor: '#3b6fe0' },
  { id: 'alta', rotulo: 'Alta', cor: '#f08a24' },
  { id: 'urgente', rotulo: 'Urgente', cor: '#e5484d' },
]

export const prioridadeDoc = (id) => PRIORIDADES_DOC.find((p) => p.id === id) ?? PRIORIDADES_DOC[1]

export const STATUS_DOC = ['aberto', 'concluido', 'cancelado']
export const ROTULO_STATUS_DOC = { aberto: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado' }

/* o que entra no historico do documento (qualidade_documento_evento) */
export const EVENTOS_DOC = ['criado', 'editado', 'etapa', 'revisao', 'concluido', 'cancelado', 'reaberto', 'comentario']

export const DOC_TITULO_MAXIMO = 200
export const DOC_CODIGO_MAXIMO = 40
export const DOC_OBS_MAXIMA = 2000
export const DOC_COMENTARIO_MAXIMO = 1000
export const DOC_REVISAO_MAXIMA = 99

/**
 * A situacao do prazo — o selo do cartao:
 *   sem       sem prazo;
 *   atrasado  ja passou;
 *   hoje      e hoje;
 *   perto     nos proximos 3 dias;
 *   ok        mais longe.
 * As datas sao 'AAAA-MM-DD' (comparam como texto).
 */
export function situacaoDoPrazo(prazo, hoje) {
  if (!prazo) return 'sem'
  if (prazo < hoje) return 'atrasado'
  if (prazo === hoje) return 'hoje'
  const dias = Math.round((Date.parse(`${prazo}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86400000)
  return dias <= 3 ? 'perto' : 'ok'
}

/** Quantos dias inteiros desde um instante (o documento parado na etapa). */
export function diasDesde(instante, agora = Date.now()) {
  const t = Date.parse(instante ?? '')
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((agora - t) / 86400000))
}

/** "Rev. 00", "Rev. 03". */
export const rotuloRevisao = (n) => `Rev. ${String(Math.max(0, Number(n) || 0)).padStart(2, '0')}`

/* ---------------- as SOLICITACOES DE CORREIO ----------------

   Alguem pede para mandar alguma coisa pelo correio (a pasta fisica
   da obra, os certificados, um contrato): o que vai, para quem e para
   onde. Quem atende (`gerenciar_correio`) leva o pedido pelas colunas:
   gera a etiqueta, posta (com o codigo de rastreio) e marca a entrega.
   O cancelado sai do quadro e fica nos arquivados. */
export const SITUACOES_CORREIO = [
  { id: 'solicitada', rotulo: 'Solicitada', descricao: 'Esperando quem envia' },
  { id: 'preparando', rotulo: 'Etiqueta gerada', descricao: 'Embalado, com a etiqueta pronta' },
  { id: 'postada', rotulo: 'Postada', descricao: 'Nos Correios ou com o portador' },
  { id: 'entregue', rotulo: 'Entregue', descricao: 'Chegou ao destinatário' },
]

export const CORREIO_CANCELADA = 'cancelada'
export const TODAS_SITUACOES_CORREIO = [...SITUACOES_CORREIO.map((s) => s.id), CORREIO_CANCELADA]

export const rotuloSituacaoCorreio = (id) =>
  id === CORREIO_CANCELADA ? 'Cancelada' : (SITUACOES_CORREIO.find((s) => s.id === id)?.rotulo ?? id)

export const SERVICOS_CORREIO = [
  { id: 'sedex', rotulo: 'SEDEX' },
  { id: 'sedex10', rotulo: 'SEDEX 10' },
  { id: 'pac', rotulo: 'PAC' },
  { id: 'carta_registrada', rotulo: 'Carta registrada' },
  { id: 'motoboy', rotulo: 'Motoboy / portador' },
  { id: 'outro', rotulo: 'Outro' },
]

export const rotuloServicoCorreio = (id) => SERVICOS_CORREIO.find((s) => s.id === id)?.rotulo ?? id

/* o que costuma ir: os atalhos do "O que vai" */
export const CONTEUDOS_CORREIO = ['Pasta física da obra', 'Certificados', 'Relatório impresso', 'Contrato assinado', 'Nota fiscal']

export const CORREIO_TEXTO_MAXIMO = 300
export const CORREIO_NOME_MAXIMO = 150
export const CORREIO_OBS_MAXIMA = 1000
export const CORREIO_RASTREIO_MAXIMO = 40
export const CORREIO_CUSTO_MAXIMO = 99999

/** A pagina de rastreamento dos Correios (o codigo vai a parte, para copiar). */
export const RASTREIO_CORREIOS = 'https://rastreamento.correios.com.br/app/index.php'

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

/** '01310100' -> '01310-100'; o que nao tem 8 digitos volta como veio. */
export function formatarCep(valor) {
  const d = String(valor ?? '').replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(valor ?? '')
}

/** O endereco numa linha so: "Rua X, 120 - sala 3, Centro, Campinas/SP, 13010-000". */
export function enderecoEmLinha(s) {
  const rua = [s?.logradouro, s?.numero].filter(Boolean).join(', ')
  const comComplemento = [rua, s?.complemento].filter(Boolean).join(' - ')
  const cidade = [s?.cidade, s?.uf].filter(Boolean).join('/')
  return [comComplemento, s?.bairro, cidade, s?.cep ? formatarCep(s.cep) : ''].filter(Boolean).join(', ')
}
