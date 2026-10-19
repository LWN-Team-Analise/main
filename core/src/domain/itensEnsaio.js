/* ============================================================
   ENSAIOS POR ITEM — as regras, num arquivo so.

   Sem React dentro: a tela (Planejamento e Execucao dos ensaios) e a
   API (server/routes/dados.js) usam as mesmas listas e os mesmos
   limites.

   A obra cadastra O QUE vai ser ensaiado — os ITENS — e, em cada
   item, os ensaios com a condicao. Cada item + ensaio + condicao e
   uma LINHA, e e na linha que a execucao grava o resultado:

     Sala 101 (ISO 7)       Contagem de particulas   Como encontrado
     Sala 101 (ISO 7)       Contagem de particulas   Como certificado
     Cabine CSB-03          Velocidade de face — Inflow   Como certificado
     Ponto 12 (Nitrogenio)  Pureza do gas            Como certificado
   ============================================================ */

/** O tipo de servico da obra inteira (um por obra). */
export const SERVICOS = [
  { id: 'qualificacao', rotulo: 'Qualificação/Certificação' },
  { id: 'qi', rotulo: 'QI — instalação' },
  { id: 'qo', rotulo: 'QO — operação' },
  { id: 'qp', rotulo: 'QP — performance' },
  { id: 'tab', rotulo: 'TAB' },
  { id: 'comissionamento', rotulo: 'Comissionamento' },
  { id: 'requalificacao', rotulo: 'Requalificação' },
]

export const rotuloDoServico = (id) => SERVICOS.find((s) => s.id === id)?.rotulo ?? null

/**
 * O que pode ser ensaiado. `classes` sao as classificacoes do catalogo
 * que aparecem para escolher naquele tipo de item (o ensaio ainda sem
 * classificacao aparece em todos).
 */
export const TIPOS_DE_ITEM = [
  { id: 'ambiente', rotulo: 'Ambiente', plural: 'ambientes', exemplo: 'Sala 101 — Envase', classes: ['hvac'] },
  { id: 'equipamento', rotulo: 'Equipamento', plural: 'equipamentos', exemplo: 'Cabine de segurança biológica', classes: ['hvac'] },
  { id: 'sistema', rotulo: 'Sistema', plural: 'sistemas', exemplo: 'AHU-01', classes: ['hvac', 'gases'] },
  { id: 'ponto_uso', rotulo: 'Ponto de uso', plural: 'pontos de uso', exemplo: 'Ponto 12 — Laboratório', classes: ['gases'] },
]

export const tipoDoItem = (id) => TIPOS_DE_ITEM.find((t) => t.id === id) ?? null

/**
 * As duas condicoes de uma linha, na ordem em que sao feitas.
 *
 *   Como encontrado   o ensaio feito ANTES de qualquer ajuste: registra
 *                     como o sistema estava quando a equipe chegou (no
 *                     mercado, "As-Found");
 *   Como certificado  o ensaio DEPOIS dos ajustes: o resultado que vai
 *                     para o certificado.
 *
 * Fazer as duas permite comparar o antes e o depois. Os ids ficam como
 * estao no banco (as_found, como_certificado); so o que aparece na tela
 * e em portugues.
 */
export const CONDICOES = [
  {
    id: 'as_found',
    rotulo: 'Como encontrado',
    sigla: 'CE',
    explicacao: 'o ensaio feito antes de qualquer ajuste, para registrar como o sistema estava',
  },
  {
    id: 'como_certificado',
    rotulo: 'Como certificado',
    sigla: 'CC',
    explicacao: 'o ensaio depois dos ajustes, com o resultado que vai para o certificado',
  },
]

export const rotuloDaCondicao = (id) => CONDICOES.find((c) => c.id === id)?.rotulo ?? id

/** A condicao que um ensaio recem-marcado ja traz. */
export const CONDICAO_PADRAO = 'como_certificado'

/** Os gases dos pontos de uso; "Outro" abre o campo para digitar. */
export const GASES = [
  'Ar comprimido',
  'Ar respirável',
  'Nitrogênio',
  'Oxigênio',
  'Hidrogênio',
  'Dióxido de carbono',
  'Argônio',
  'Hélio',
  'Acetileno',
]

export const LIMITES_ITEM = {
  itens: 300,
  nome: 120,
  tag: 60,
  classe: 60,
  gas: 60,
  observacao: 500,
  resultado: 200,
}

/** O ensaio do catalogo cabe neste tipo de item? */
export function ensaioServeAoItem(ensaio, tipo) {
  if (!ensaio?.classificacao) return true
  return (tipoDoItem(tipo)?.classes ?? []).includes(ensaio.classificacao)
}

/** 'Sala 101 · ISO 7', 'CSB-03 · Cabine', 'Ponto 12 · Nitrogênio' — o nome do item com o que o identifica. */
export function nomeDoItem(item) {
  const extra = [item?.tag, item?.tipo === 'ambiente' ? item?.classe : null, item?.tipo === 'ponto_uso' ? item?.gas : null]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
  return [String(item?.nome ?? '').trim(), ...extra].filter(Boolean).join(' · ')
}

/** Linha feita = tem resultado registrado. */
export const linhaFeita = (linha) => Boolean(linha?.data)

/**
 * O resumo das linhas da obra: quantas ha, quantas estao feitas e
 * quantas ficaram nao conformes.
 */
export function resumoDasLinhas(itens) {
  const linhas = (itens ?? []).flatMap((i) => i.linhas ?? [])
  const feitas = linhas.filter(linhaFeita)
  return {
    total: linhas.length,
    feitas: feitas.length,
    naoConformes: feitas.filter((l) => l.conforme === false).length,
    percentual: linhas.length ? Math.floor((100 * feitas.length) / linhas.length) : 0,
  }
}

/**
 * A obra planeja por item? Sim quando ja tem item, e tambem quando
 * ainda nao planejou nada (a obra nova nasce assim). A obra que ja
 * escolheu ensaios pela lista solta continua nela.
 */
export const usaItens = (obra) => (obra?.itens?.length ?? 0) > 0 || (obra?.ensaios?.length ?? 0) === 0
