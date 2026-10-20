/* O n° da proposta da obra nova. Arquivo proprio, sem import nenhum:
   a tela e a API (core/server/routes/dados.js) usam o mesmo. */
/**
 * O n° da proposta que vem sugerido numa obra nova: o da ULTIMA obra
 * cadastrada, mais um. O primeiro grupo de digitos e o contador — e o
 * que sobe; o resto fica como esta, com os mesmos zeros a esquerda:
 *
 *   '8234'      -> '8235'
 *   '1042/2026' -> '1043/2026'
 *   '0099'      -> '0100'
 *
 * Sem digito nenhum (ou sem obra ainda), nao ha o que sugerir: ''.
 * `ocupadas` (minusculas) pula os numeros que ja existem.
 */
export function proximaProposta(ultima, ocupadas = new Set()) {
  const texto = String(ultima ?? '').trim()
  const achado = /\d+/.exec(texto)
  if (!achado) return ''
  const [digitos] = achado
  let n = BigInt(digitos)
  for (let i = 0; i < 1000; i += 1) {
    n += 1n
    const proximo = String(n).padStart(digitos.length, '0')
    const candidata = texto.slice(0, achado.index) + proximo + texto.slice(achado.index + digitos.length)
    if (!ocupadas.has(candidata.toLowerCase())) return candidata
  }
  return ''
}
