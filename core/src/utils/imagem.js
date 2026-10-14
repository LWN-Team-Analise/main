/**
 * Preparo da imagem antes de subir.
 *
 * Foto de celular tem 4000px de lado e uns 6 MB. Em base64 isso vira uns
 * 8 MB de JSON — o suficiente para estourar o limite do servidor (a
 * gravacao voltava 500 sem explicacao) e para nao caber no localStorage
 * junto com a sessao.
 *
 * Aqui a imagem e reduzida no PROPRIO navegador antes de sair: cabe no
 * banco, viaja rapido e continua boa para avatar e logo.
 */

/** Lado maior e qualidade de saida; da uma foto de ~80-150 KB. */
const LADO_MAXIMO = 640
const QUALIDADE = 0.82

/** Acima disto a gente nem tenta: e arquivo grande demais para ser foto. */
const BYTES_MAXIMOS = 25 * 1024 * 1024

export class ImagemInvalida extends Error {}

/**
 * Le o arquivo, reduz e devolve uma data URL pronta para gravar.
 *
 * PNG com transparencia continua PNG (senao o fundo vira preto);
 * o resto sai como JPEG, que e bem menor.
 */
export async function prepararImagem(arquivo, { lado = LADO_MAXIMO } = {}) {
  if (!arquivo) return null

  if (!arquivo.type?.startsWith('image/')) {
    throw new ImagemInvalida('Escolha um arquivo de imagem.')
  }
  if (arquivo.size > BYTES_MAXIMOS) {
    throw new ImagemInvalida('A imagem é grande demais. Use uma de até 25 MB.')
  }

  const url = URL.createObjectURL(arquivo)
  try {
    const img = await carregar(url)

    const escala = Math.min(1, lado / Math.max(img.width, img.height))
    const largura = Math.max(1, Math.round(img.width * escala))
    const altura = Math.max(1, Math.round(img.height * escala))

    const tela = document.createElement('canvas')
    tela.width = largura
    tela.height = altura

    const ctx = tela.getContext('2d')
    ctx.imageSmoothingQuality = 'high'

    const transparente = arquivo.type === 'image/png' || arquivo.type === 'image/webp'
    if (!transparente) {
      // JPEG nao tem alfa: sem esse fundo, o transparente sairia preto
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, largura, altura)
    }
    ctx.drawImage(img, 0, 0, largura, altura)

    return transparente
      ? tela.toDataURL('image/png')
      : tela.toDataURL('image/jpeg', QUALIDADE)
  } catch (erro) {
    if (erro instanceof ImagemInvalida) throw erro
    throw new ImagemInvalida('Não foi possível ler esta imagem. Tente outra.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function carregar(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new ImagemInvalida('Não foi possível ler esta imagem.'))
    img.src = url
  })
}

/* ============================================================
   Recorte

   Enquadrar uma foto e escolher QUE PEDACO dela aparece na caixa
   que a tela reservou. Esse pedaco cabe em tres numeros:

     cx, cy — o centro do quadro, em fracao da imagem (0..1);
     zoom   — 1 e o maior quadro que cabe na imagem; 2 mostra
              metade de cada lado, e assim por diante.

   Sao tres numeros, e nao um retangulo em pixels, porque assim o
   mesmo recorte serve para qualquer tamanho de saida: o avatar de
   26px e o header de 1200px saem do mesmo enquadramento.

   Uma imagem pode ter VARIOS recortes ao mesmo tempo — o cliente
   tem dois, o da logo (quadrada) e o do header (faixa larga) —, e
   por isso o recorte anda separado da imagem em vez de gravado
   dentro dela.
   ============================================================ */

export const RECORTE_PADRAO = { cx: 0.5, cy: 0.5, zoom: 1 }

/** O quanto o zoom pode ir: alem disso a imagem vira um borrão. */
export const ZOOM_MAXIMO = 4

/** Largura ÷ altura do header da obra. O mesmo numero na previa e no recorte. */
export const PROPORCAO_HEADER = 1040 / 150

const entre = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo)

/**
 * O retangulo da imagem que aparece no quadro, em pixels DA IMAGEM.
 *
 * Com zoom 1 o quadro e o maior que cabe na imagem inteira mantendo a
 * proporcao pedida — e por isso nunca sobra borda vazia, em nenhum
 * zoom: o retangulo e sempre preso dentro da imagem.
 */
export function areaRecortada(largura, altura, proporcao, recorte) {
  const { cx, cy, zoom } = { ...RECORTE_PADRAO, ...(recorte ?? {}) }
  const z = entre(Number(zoom) || 1, 1, ZOOM_MAXIMO)

  const maisLarga = largura / altura > proporcao
  const baseL = maisLarga ? altura * proporcao : largura
  const baseA = maisLarga ? altura : largura / proporcao

  const sl = baseL / z
  const sa = baseA / z
  const sx = entre((Number(cx) || 0.5) * largura - sl / 2, 0, largura - sl)
  const sy = entre((Number(cy) || 0.5) * altura - sa / 2, 0, altura - sa)

  return { sx, sy, sl, sa }
}

/**
 * Aplica o recorte e devolve a imagem pronta para gravar.
 *
 * `largura` e o lado maior da saida; a altura sai da proporcao. PNG
 * continua PNG — senao a logo de fundo transparente ganharia um fundo
 * branco justamente onde ela nao deveria ter nenhum.
 */
export async function recortarImagem(origem, { proporcao = 1, recorte, largura = 512 } = {}) {
  if (!origem) return null

  const img = await carregar(origem)
  const { sx, sy, sl, sa } = areaRecortada(img.width, img.height, proporcao, recorte)

  const saidaL = Math.max(1, Math.round(Math.min(largura, sl)))
  const saidaA = Math.max(1, Math.round(saidaL / proporcao))

  const tela = document.createElement('canvas')
  tela.width = saidaL
  tela.height = saidaA

  const ctx = tela.getContext('2d')
  ctx.imageSmoothingQuality = 'high'

  const transparente = String(origem).startsWith('data:image/png')
  if (!transparente) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, saidaL, saidaA)
  }
  ctx.drawImage(img, sx, sy, sl, sa, 0, 0, saidaL, saidaA)

  return transparente ? tela.toDataURL('image/png') : tela.toDataURL('image/jpeg', QUALIDADE)
}
