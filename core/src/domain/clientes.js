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

/** true para a linha que e unidade de outro cliente. */
export const ehUnidade = (cliente) => Boolean(cliente?.matrizId)

/** O id do cliente "de cima": o da matriz para a unidade, o proprio para o resto. */
export const raizDoCliente = (cliente) => (cliente?.matrizId ? String(cliente.matrizId) : String(cliente?.id ?? ''))
