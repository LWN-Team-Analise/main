/* ============================================================
   COMERCIAL — os funis de venda e os negocios dentro deles.

   Um arquivo so, sem React dentro, importado pela tela e pela API
   (core/server/routes/comercial.js): os funis, as etapas e as
   regras de validacao sao os MESMOS dos dois lados.

   Os quatro funis e as colunas de cada um sao fixos — vieram do
   funil que a equipe usava no Pipedrive. A chave da etapa e o que
   vai para o banco; o rotulo e so o que aparece na tela, e pode
   mudar sem migracao.
   ============================================================ */

export const FUNIS = [
  {
    id: 'novos',
    rotulo: 'Novos negócios',
    descricao: 'Pedidos novos: da demanda recebida até o agendamento da execução.',
    etapas: [
      { id: 'demanda_recebida', rotulo: 'Demanda Recebida' },
      { id: 'aguardando_documentacao', rotulo: 'Aguardando Documentação' },
      { id: 'proposta_elaboracao', rotulo: 'Proposta em Elaboração' },
      { id: 'proposta_enviada', rotulo: 'Proposta Enviada' },
      { id: 'construtora_concorrencia', rotulo: 'Construtora Aguardando Concorrência' },
      { id: 'negociacao', rotulo: 'Negociação/Aprovação Interna' },
      { id: 'aguardando_execucao', rotulo: 'Aguardando Agendamento/Execução' },
    ],
  },
  {
    id: 'renovacao',
    rotulo: 'Funil de renovação',
    descricao: 'Contratos e serviços que vencem: do aviso da demanda futura até a execução.',
    etapas: [
      { id: 'demanda_futura', rotulo: 'Demanda Futura' },
      { id: 'contato_cliente', rotulo: 'Contato com o Cliente' },
      { id: 'autorizado_renovacao', rotulo: 'Autorizado Renovação de Proposta' },
      { id: 'proposta_enviada', rotulo: 'Proposta Enviada' },
      { id: 'negociacao', rotulo: 'Negociação/Aprovação interna' },
      { id: 'aguardando_pedido', rotulo: 'Aguardando Pedido de Compras' },
      { id: 'aguardando_execucao', rotulo: 'Aguardando Execução' },
    ],
  },
  {
    id: 'resgate',
    rotulo: 'Funil de Resgate',
    descricao: 'Clientes parados: retomar o contato e trazer de volta.',
    etapas: [
      { id: 'retomar_contato', rotulo: 'Retomar Contato' },
      { id: 'contato_agendado', rotulo: 'Contato Agendado' },
      { id: 'proposta', rotulo: 'Proposta' },
      { id: 'negociacao', rotulo: 'Negociação' },
      { id: 'fechamento', rotulo: 'Fechamento' },
    ],
  },
  {
    id: 'prospeccao',
    rotulo: 'Funil Prospecção',
    descricao: 'Empresas que ainda não são clientes: da identificação até a proposta.',
    etapas: [
      { id: 'empresa_alvo', rotulo: 'Empresa-Alvo Identificada' },
      { id: 'enriquecer_dados', rotulo: 'Enriquecer dados' },
      { id: 'contato_iniciado', rotulo: 'Contato Iniciado' },
      { id: 'interesse_conversa', rotulo: 'Interesse em Conversa Técnica' },
      { id: 'demanda_identificada', rotulo: 'Demanda Identificada' },
      { id: 'elaboracao_proposta', rotulo: 'Elaboração Proposta' },
    ],
  },
]

export const FUNIL_PADRAO = 'novos'

export const funilPorId = (id) => FUNIS.find((f) => f.id === id) ?? null

/** A etapa dentro do funil, ou null se ela nao existe nele. */
export const etapaDoFunil = (funilId, etapaId) =>
  funilPorId(funilId)?.etapas.find((e) => e.id === etapaId) ?? null

export const rotuloDaEtapa = (funilId, etapaId) => etapaDoFunil(funilId, etapaId)?.rotulo ?? etapaId

/* A faixa colorida no topo do cartao (a etiqueta do Pipedrive). */
export const ETIQUETAS = [
  { id: 'azul', rotulo: 'Azul', cor: '#5b7cfa' },
  { id: 'laranja', rotulo: 'Laranja', cor: '#f08a24' },
  { id: 'cinza', rotulo: 'Cinza', cor: '#9aa1ad' },
  { id: 'verde', rotulo: 'Verde', cor: '#2f9e5c' },
  { id: 'vermelho', rotulo: 'Vermelho', cor: '#e5484d' },
  { id: 'roxo', rotulo: 'Roxo', cor: '#8e5cf0' },
]

export const corDaEtiqueta = (id) => ETIQUETAS.find((e) => e.id === id)?.cor ?? null

export const STATUS = ['aberto', 'ganho', 'perdido']

export const ROTULO_STATUS = { aberto: 'Em aberto', ganho: 'Ganho', perdido: 'Perdido' }

/* Os limites, os mesmos na tela e na API. */
export const TITULO_MAXIMO = 200
export const TEXTO_MAXIMO = 200
export const VALOR_MAXIMO = 999_999_999_999
export const EMAIL_CORPO_MAXIMO = 20_000

/**
 * A situacao da proxima atividade — o icone do canto do cartao, como
 * no Pipedrive:
 *
 *   sem       nenhuma atividade marcada (o triangulo amarelo);
 *   atrasada  a data ja passou (o circulo vermelho);
 *   hoje      e hoje (o circulo verde);
 *   futura    esta marcada para depois (o circulo cinza).
 */
export function situacaoDaAtividade(data, hoje) {
  if (!data) return 'sem'
  if (data < hoje) return 'atrasada'
  if (data === hoje) return 'hoje'
  return 'futura'
}

export const ROTULO_SITUACAO = {
  sem: 'Nenhuma atividade agendada',
  atrasada: 'Atividade atrasada',
  hoje: 'Atividade para hoje',
  futura: 'Próxima atividade agendada',
}

const REAIS_INTEIRO = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const REAIS_CENTAVOS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * O valor como o Pipedrive escreve: "R$ 62.010" quando e redondo,
 * "R$ 84.632,50" quando tem centavos. O espaco fino que o Intl poe
 * depois do "R$" vira espaco comum, para nao quebrar a linha estranho.
 */
export function valorCurto(valor) {
  const n = Number(valor)
  const v = Number.isFinite(n) ? n : 0
  const texto = Number.isInteger(Math.round(v * 100) / 100) ? REAIS_INTEIRO.format(v) : REAIS_CENTAVOS.format(v)
  return texto.replace(/\s/g, ' ')
}

/**
 * Le um valor em reais digitado de qualquer jeito: "1.234,56",
 * "1234.56", "R$ 1.234", "1234". Devolve numero ou null.
 */
export function lerValor(entrada) {
  if (entrada === null || entrada === undefined || entrada === '') return 0
  if (typeof entrada === 'number') return Number.isFinite(entrada) ? entrada : null
  let t = String(entrada).replace(/[R$\s]/g, '')
  if (!t) return 0
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '')
  else if (/^\d{1,3}\.\d{3}$/.test(t)) t = t.replace('.', '')
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

export const emailValido = (email) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(email ?? '').trim())

/* As ordens do "Ordenar por", como no Pipedrive. */
export const ORDENS = [
  { id: 'atividade', rotulo: 'Próxima atividade' },
  { id: 'organizacao', rotulo: 'Organização vinculada' },
  { id: 'titulo', rotulo: 'Título do negócio' },
  { id: 'valor', rotulo: 'Valor do negócio' },
  { id: 'criado', rotulo: 'Data de criação' },
  { id: 'fechamento', rotulo: 'Data de fechamento esperada' },
]

/** Compara dois negocios pela ordem escolhida (crescente). */
export function comparar(ordem) {
  const texto = (v) => String(v ?? '').toLowerCase()
  const data = (v) => v || '9999-12-31'
  switch (ordem) {
    case 'organizacao':
      return (a, b) => texto(a.organizacao).localeCompare(texto(b.organizacao), 'pt-BR')
    case 'titulo':
      return (a, b) => texto(a.titulo).localeCompare(texto(b.titulo), 'pt-BR')
    case 'valor':
      return (a, b) => Number(a.valor) - Number(b.valor)
    case 'criado':
      return (a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm))
    case 'fechamento':
      return (a, b) => data(a.previsaoFechamento).localeCompare(data(b.previsaoFechamento))
    default:
      return (a, b) => data(a.proximaAtividade).localeCompare(data(b.proximaAtividade))
  }
}
