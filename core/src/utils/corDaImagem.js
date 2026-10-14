/**
 * Cor predominante de uma imagem, para pintar a borda do card do cliente.
 *
 * A logo e desenhada num canvas pequeno e os pixels sao agrupados em
 * baldes de cor. Ganha o balde mais frequente entre os pixels que tem
 * cor de verdade — branco, preto e cinza de fundo sao descartados, senao
 * quase toda logo devolveria "branco".
 */

const cache = new Map()

/** Converte para HSL so para medir saturacao e luminosidade. */
function saturacaoELuz(r, g, b) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const luz = (max + min) / 2
  if (max === min) return { sat: 0, luz }
  const d = max - min
  const sat = luz > 0.5 ? d / (2 - max - min) : d / (max + min)
  return { sat, luz }
}

const paraHex = (r, g, b) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/**
 * Devolve uma promessa com a cor em hex, ou null se nao der para ler a
 * imagem (canvas sujo, arquivo quebrado, sem imagem).
 */
export function corDominante(fonte) {
  if (!fonte) return Promise.resolve(null)
  if (cache.has(fonte)) return Promise.resolve(cache.get(fonte))

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onerror = () => resolve(null)
    img.onload = () => {
      try {
        const lado = 32
        const canvas = document.createElement('canvas')
        canvas.width = lado
        canvas.height = lado
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)

        ctx.drawImage(img, 0, 0, lado, lado)
        const { data } = ctx.getImageData(0, 0, lado, lado)

        const baldes = new Map()
        let melhorCinza = null

        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
          if (a < 128) continue // transparente nao conta

          const { sat, luz } = saturacaoELuz(r, g, b)

          // guarda um cinza de reserva, caso a logo seja preto e branco
          if (sat < 0.18 || luz > 0.94 || luz < 0.06) {
            if (luz > 0.15 && luz < 0.85 && !melhorCinza) melhorCinza = [r, g, b]
            continue
          }

          // agrupa em baldes de 32 tons por canal: cores parecidas somam juntas
          const chave = `${r >> 5}|${g >> 5}|${b >> 5}`
          const atual = baldes.get(chave) ?? { n: 0, r: 0, g: 0, b: 0, peso: 0 }
          atual.n += 1
          atual.r += r
          atual.g += g
          atual.b += b
          // pixel mais saturado pesa mais: e ele que da a identidade da marca
          atual.peso += 1 + sat
          baldes.set(chave, atual)
        }

        if (baldes.size === 0) {
          const cor = melhorCinza ? paraHex(...melhorCinza) : null
          cache.set(fonte, cor)
          return resolve(cor)
        }

        const vencedor = [...baldes.values()].sort((a, b) => b.peso - a.peso)[0]
        const cor = paraHex(vencedor.r / vencedor.n, vencedor.g / vencedor.n, vencedor.b / vencedor.n)
        cache.set(fonte, cor)
        return resolve(cor)
      } catch {
        // canvas "sujo" por imagem de outra origem: nada a fazer
        return resolve(null)
      }
    }

    img.src = fonte
  })
}
