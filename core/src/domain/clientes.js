/* ============================================================
   CLIENTES — as UNIDADES (atualizacoes 33 e 34)

   Um cliente pode ter varias unidades, cada uma com o seu endereco:
   o Albert Einstein tem a de Anapolis e a de Alphaville. Na aba
   Clientes fica um so card (o Albert Einstein), com as unidades
   dentro; nas listas de escolher cliente (obra, comercial,
   reembolso...) aparecem ele e cada unidade com o nome inteiro.

   A unidade tem dois nomes, e os dois sao opcionais (mas um deles
   nao):

     `unidade`  o LUGAR — "Anapolis". Na tela, ele se completa
                sozinho com a cidade do endereco;
     `servico`  o TITULO, o servico que a unidade presta para o
                cliente — "Faturamento", "Obra" (atualizacao 34).

   O nome inteiro, o das listas:

     Albert Einstein Anapolis - Faturamento
     Albert Einstein Anapolis
     Albert Einstein - Administracao

   No banco a unidade e um cliente com `matrizId` (o Albert Einstein),
   `unidade` e `servico`. O `nome` dela e o inteiro, montado aqui, para
   toda tela que mostra cliente.nome ja mostrar certo.

   Este arquivo nao tem React dentro: a API (server/routes/dados.js)
   importa o mesmo.
   ============================================================ */

import { codigoDoPais, ehBrasil, nomeDoPais } from './paises.js'

export const UNIDADES_MAXIMO = 50
export const UNIDADE_MAXIMA = 80
export const SERVICO_MAXIMO = 80

const limpo = (texto) => String(texto ?? '').trim().replace(/\s+/g, ' ')

/** Tira o nome do cliente da frente: "Albert Einstein - Obra" na unidade do Albert Einstein vira "Obra". */
function semOCliente(nomeDoCliente, texto) {
  const cliente = limpo(nomeDoCliente)
  const curto = limpo(texto)
  if (!cliente || !curto.toLowerCase().startsWith(cliente.toLowerCase())) return curto
  const resto = curto.slice(cliente.length)
  /* so quando o nome do cliente e uma palavra inteira ali: "Einsteins" fica */
  if (resto && !/^[\s\-–—:]/.test(resto)) return curto
  return resto.replace(/^[\s\-–—:]+/, '').trim()
}

/**
 * O nome curto da unidade (o lugar), sem repetir o do cliente: quem
 * digita "Einstein Anapolis" na unidade do Einstein fica com "Anapolis".
 */
export const nomeCurtoDaUnidade = (nomeDoCliente, unidade) => semOCliente(nomeDoCliente, unidade)

/** O servico (o titulo), sem repetir o do cliente: "Albert Einstein - Obra" vira "Obra". */
export const servicoDaUnidade = (nomeDoCliente, servico) => semOCliente(nomeDoCliente, servico)

/**
 * O nome inteiro da unidade, o das listas:
 * "Albert Einstein" + "Anapolis" + "Faturamento" = "Albert Einstein Anapolis - Faturamento".
 */
export function nomeDaUnidade(nomeDoCliente, unidade, servico = '') {
  const cliente = limpo(nomeDoCliente)
  const lugar = nomeCurtoDaUnidade(cliente, unidade)
  const titulo = servicoDaUnidade(cliente, servico)
  const base = [cliente, lugar].filter(Boolean).join(' ')
  return titulo ? `${base} - ${titulo}` : base
}

/** O que diferencia uma unidade das irmas: o lugar e o servico juntos. */
export const chaveDaUnidade = (nomeDoCliente, unidade, servico = '') =>
  `${nomeCurtoDaUnidade(nomeDoCliente, unidade)}|${servicoDaUnidade(nomeDoCliente, servico)}`.toLowerCase()

/** Como a unidade aparece dentro do card do cliente: "Anapolis - Faturamento". */
export const rotuloDaUnidade = (unidade) =>
  [limpo(unidade?.unidade), limpo(unidade?.servico)].filter(Boolean).join(' - ') || limpo(unidade?.nome)

/**
 * Com UNIDADE, o endereco e o de cada unidade: o cliente vira so a
 * vitrine delas (logo, nome, setor, pessoas), e o estado, a cidade e o
 * resto do endereco dele saem — no banco ficam vazios (atualizacao 35).
 * O endereco que ele tinha nao se perde: vira a UNIDADE 1 (ver
 * primeiraUnidade), e a unidade cadastrada vem depois dela.
 */
export const enderecoNasUnidades = (quantasUnidades) => quantasUnidades > 0

const campo = (texto) => limpo(texto).toLowerCase()
const digitos = (texto) => String(texto ?? '').replace(/\D/g, '')

/**
 * A UNIDADE 1: o endereco que o cliente tinha quando ganhou a primeira
 * unidade. O lugar dela e a cidade dele; se uma irma ja tem esse nome,
 * ela vira "Cidade - Matriz". Devolve null quando nao ha endereco, ou
 * quando uma irma ja e ele (o mesmo nome no mesmo endereco).
 *
 * `irmas`: as unidades que ficam ao lado dela.
 */
export function primeiraUnidade(cliente, irmas = []) {
  const cidade = limpo(cliente?.cidade)
  if (!cidade) return null
  const chave = chaveDaUnidade(cliente.nome, cidade, '')
  const xara = irmas.find((u) => chaveDaUnidade(cliente.nome, u?.unidade, u?.servico) === chave)
  const mesmoEndereco = (u) =>
    ['cidade', 'estado', 'endereco'].every((k) => campo(u?.[k]) === campo(cliente[k])) &&
    digitos(u?.cep) === digitos(cliente.cep) &&
    codigoDoPais(u?.pais) === codigoDoPais(cliente.pais)
  if (xara && mesmoEndereco(xara)) return null
  return {
    unidade: cidade,
    servico: xara ? 'Matriz' : '',
    pais: codigoDoPais(cliente.pais),
    cep: limpo(cliente.cep),
    endereco: limpo(cliente.endereco),
    bairro: limpo(cliente.bairro),
    estado: limpo(cliente.estado),
    cidade,
  }
}

/** O CEP com a mascara do Brasil ("01310-100"); o codigo postal de fora, como veio. */
export function codigoPostal(cep, pais) {
  if (!ehBrasil(pais)) return limpo(cep)
  const d = digitos(cep)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** "Anápolis/GO"; fora do Brasil, com o pais: "Miami/Florida (Estados Unidos)". */
export function localDoEndereco(e) {
  const lugar = [limpo(e?.cidade), limpo(e?.estado)].filter(Boolean).join('/')
  if (ehBrasil(e?.pais)) return lugar
  return lugar ? `${lugar} (${nomeDoPais(e.pais)})` : nomeDoPais(e.pais)
}

/** O endereco inteiro numa linha: rua, bairro, cidade/estado e CEP. */
export const enderecoCompleto = (e) =>
  [limpo(e?.endereco), limpo(e?.bairro), localDoEndereco(e), codigoPostal(e?.cep, e?.pais)].filter(Boolean).join(' — ')

/** As unidades na ordem do cadastro: a Unidade 1 (o endereco que o cliente tinha) primeiro. */
export const ordemDasUnidades = (a, b) =>
  String(a.criadoEm ?? '').localeCompare(String(b.criadoEm ?? '')) || Number(a.id) - Number(b.id)

/** Onde as unidades estao, sem repetir: ['Anápolis/GO', 'Barueri/SP']. */
export function locaisDasUnidades(unidades = []) {
  const locais = unidades.map(localDoEndereco).filter(Boolean)
  return [...new Set(locais)]
}

/** true para a linha que e unidade de outro cliente. */
export const ehUnidade = (cliente) => Boolean(cliente?.matrizId)

/**
 * Os clientes que se ESCOLHEM numa lista (a empresa da obra, a do
 * negocio, a do reembolso): o cliente com unidades e so a vitrine delas
 * e sai — escolhe-se a unidade ("Ache Sao Paulo", "Ache Guarulhos").
 * Continua na lista o que ja estava escolhido: a obra antiga ligada ao
 * cliente "de cima" segue mostrando quem ela e.
 *
 * O "Unidade de" do Novo cliente NAO usa esta lista: ali e justamente o
 * cliente de cima que se escolhe.
 */
export function clientesParaEscolher(clientes = [], escolhido = null) {
  const comUnidade = new Set(clientes.filter((c) => c.matrizId).map((c) => String(c.matrizId)))
  return clientes.filter((c) => !comUnidade.has(String(c.id)) || String(c.id) === String(escolhido ?? ''))
}

/** O id do cliente "de cima": o da matriz para a unidade, o proprio para o resto. */
export const raizDoCliente = (cliente) => (cliente?.matrizId ? String(cliente.matrizId) : String(cliente?.id ?? ''))
