/**
 * ONDE, NO MAPA, FICA UM CLIENTE.
 *
 * O cadastro guarda cidade e UF — nunca latitude e longitude. Para o
 * globo da tela inicial poder pousar a marca de cada obra no lugar
 * certo, a conversao acontece aqui, sem sair do navegador.
 *
 * A ancora e o CENTRO DO ESTADO, e nao a capital. Parece pior e e
 * melhor: metade das capitais brasileiras e litoranea, e qualquer
 * deslocamento para o leste joga a marca no mar. Do centro do estado,
 * o deslocamento cai em terra em qualquer direcao.
 *
 * ---------------- Sobre a precisao ----------------
 *
 * O globo tem cerca de 125px de raio para 180 graus de latitude: um
 * grau vale menos de um pixel. Sao Paulo e Campinas distam um grau —
 * ou seja, na tela, o MESMO ponto. Buscar coordenada de rua para este
 * uso seria gastar uma chamada de rede por cliente para mover a marca
 * meio pixel.
 *
 * O deslocamento por cidade existe so para duas obras de cidades
 * diferentes nao nascerem exatamente uma sobre a outra; e determinado
 * pelo nome, entao a mesma cidade cai sempre no mesmo lugar.
 */

/* Centro aproximado de cada estado, em graus. Conferido para cair em
   terra firme — nenhum destes pontos esta sobre agua. */
const CENTRO_DA_UF = {
  AC: [-9.0, -70.0],
  AL: [-9.6, -36.6],
  AP: [1.4, -51.8],
  AM: [-4.2, -64.6],
  BA: [-12.5, -41.7],
  CE: [-5.2, -39.6],
  DF: [-15.78, -47.86],
  ES: [-19.6, -40.6],
  GO: [-15.9, -49.6],
  MA: [-5.0, -45.3],
  MT: [-13.0, -55.9],
  MS: [-20.5, -54.5],
  MG: [-18.6, -44.6],
  PA: [-4.0, -52.9],
  PB: [-7.2, -36.7],
  PR: [-24.6, -51.6],
  PE: [-8.4, -37.9],
  PI: [-7.4, -42.8],
  RJ: [-22.2, -42.7],
  RN: [-5.8, -36.6],
  RS: [-29.7, -53.3],
  RO: [-10.9, -63.0],
  RR: [2.1, -61.4],
  SC: [-27.3, -50.5],
  SP: [-22.2, -48.7],
  SE: [-10.6, -37.4],
  TO: [-10.2, -48.3],
}

/* o quanto uma cidade pode se afastar do centro do estado, em graus.
   Pequeno de proposito: o suficiente para separar as marcas, pouco
   para nao empurrar ninguem para o estado vizinho. */
const ESPALHA = 0.42

/** Conta estavel sobre o texto: o mesmo nome devolve sempre o mesmo numero. */
function embaralhar(texto) {
  let h = 2166136261
  const s = String(texto ?? '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * A coordenada de um cliente, em graus. Devolve null quando a UF nao
 * diz nada (cadastro antigo, campo vazio, UF escrita errado) — e cabe a
 * quem chamou decidir o que fazer com uma obra sem lugar no mapa.
 */
export function coordenadaDoCliente(cliente) {
  const uf = String(cliente?.estado ?? '').trim().toUpperCase()
  const centro = CENTRO_DA_UF[uf]
  if (!centro) return null

  const semente = embaralhar(`${uf}:${String(cliente?.cidade ?? '').trim().toLowerCase()}`)
  /* dois numeros entre -1 e 1 tirados da mesma semente, um de cada
     metade dos bits: sem isso latitude e longitude andariam juntas e
     todas as cidades cairiam na mesma diagonal */
  const a = ((semente & 0xffff) / 0xffff) * 2 - 1
  const b = (((semente >>> 16) & 0xffff) / 0xffff) * 2 - 1

  return { lat: centro[0] + a * ESPALHA, lon: centro[1] + b * ESPALHA }
}

/** Quantas UFs o mapa conhece — usado pelo teste e pela documentacao. */
export const UFS_CONHECIDAS = Object.keys(CENTRO_DA_UF)

/**
 * O centro do estado, sem espalhamento nenhum.
 *
 * E o que serve para marcar a UF no globo: um pingo por estado, no
 * mesmo lugar sempre, independente de quantos clientes moram nele.
 * `coordenadaDoCliente` faz o contrario de proposito — ela espalha, para
 * duas cidades do mesmo estado nao virarem um ponto so.
 */
export function coordenadaDaUF(uf) {
  const centro = CENTRO_DA_UF[String(uf ?? '').trim().toUpperCase()]
  return centro ? { lat: centro[0], lon: centro[1] } : null
}
