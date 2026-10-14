import { FOTO_BYTES_MAXIMOS, bytesDoDataUrl } from '@/domain/frotas'
import { ImagemInvalida, carregar } from '@/utils/imagem'

/**
 * A foto do carro pronta para enviar: JPEG, reduzida no proprio
 * aparelho.
 *
 * Foto de celular tem 4000px e 4-8 MB. As cinco vao num pedido so, e
 * o servidor nao aceita pedido acima de 4,5 MB — entao cada uma sai
 * daqui abaixo de 600 KB. Com 1600px de lado da para ler a placa, um
 * risco na lataria e o numero do painel; se ainda passar do teto, ela
 * desce de tamanho ate caber.
 */
const TENTATIVAS = [
  { lado: 1600, qualidade: 0.8 },
  { lado: 1280, qualidade: 0.74 },
  { lado: 1024, qualidade: 0.7 },
  { lado: 800, qualidade: 0.66 },
]

export async function prepararFoto(arquivo) {
  if (!arquivo?.type?.startsWith('image/')) throw new ImagemInvalida('Escolha uma foto.')
  if (arquivo.size > 40 * 1024 * 1024) throw new ImagemInvalida('A foto é grande demais.')

  const url = URL.createObjectURL(arquivo)
  try {
    const img = await carregar(url)
    for (const { lado, qualidade } of TENTATIVAS) {
      const escala = Math.min(1, lado / Math.max(img.width, img.height))
      const tela = document.createElement('canvas')
      tela.width = Math.max(1, Math.round(img.width * escala))
      tela.height = Math.max(1, Math.round(img.height * escala))
      const ctx = tela.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, tela.width, tela.height)
      ctx.drawImage(img, 0, 0, tela.width, tela.height)
      const conteudo = tela.toDataURL('image/jpeg', qualidade)
      if (bytesDoDataUrl(conteudo) <= FOTO_BYTES_MAXIMOS) return conteudo
    }
    throw new ImagemInvalida('Não foi possível reduzir esta foto. Tire outra.')
  } catch (erro) {
    if (erro instanceof ImagemInvalida) throw erro
    throw new ImagemInvalida('Não foi possível ler esta foto. Tire outra.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
