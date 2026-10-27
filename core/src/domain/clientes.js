/* ============================================================
   CLIENTES — as UNIDADES (atualizacao 33)

   Um cliente pode ter varias unidades, cada uma com o seu endereco:
   o Einstein tem a de Anapolis e a de Alphaville. Na aba Clientes fica
   um so card (o Einstein), com as unidades dentro; nas listas de
   escolher cliente (obra, comercial, reembolso...) aparecem o Einstein,
   o Einstein Anapolis e o Einstein Alphaville.

   No banco a unidade e um cliente com `matrizId` (o Einstein) e
   `unidade` (o nome curto, "Anapolis"). O `nome` dela e o inteiro —
   "Einstein Anapolis" —, montado aqui, para toda tela que mostra
   cliente.nome ja mostrar certo.

   Este arquivo nao tem React dentro: a API (server/routes/dados.js)
   importa o mesmo.
   ============================================================ */

export const UNIDADES_MAXIMO = 50
export const UNIDADE_MAXIMA = 80

const limpo = (texto) => String(texto ?? '').trim().replace(/\s+/g, ' ')

/**
 * O nome curto da unidade, sem repetir o do cliente: quem digita
 * "Einstein Anapolis" na unidade do Einstein fica com "Anapolis".
 */
export function nomeCurtoDaUnidade(nomeDoCliente, unidade) {
  const cliente = limpo(nomeDoCliente)
  const curto = limpo(unidade)
  if (cliente && curto.toLowerCase().startsWith(`${cliente.toLowerCase()} `)) {
    return curto.slice(cliente.length + 1).trim()
  }
  return curto
}

/** O nome inteiro da unidade, o das listas: "Einstein" + "Anapolis" = "Einstein Anapolis". */
export function nomeDaUnidade(nomeDoCliente, unidade) {
  const cliente = limpo(nomeDoCliente)
  const curto = nomeCurtoDaUnidade(cliente, unidade)
  return [cliente, curto].filter(Boolean).join(' ')
}

/** true para a linha que e unidade de outro cliente. */
export const ehUnidade = (cliente) => Boolean(cliente?.matrizId)

/** O id do cliente "de cima": o da matriz para a unidade, o proprio para o resto. */
export const raizDoCliente = (cliente) => (cliente?.matrizId ? String(cliente.matrizId) : String(cliente?.id ?? ''))
