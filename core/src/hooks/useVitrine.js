import { useEffect, useState } from 'react'
import { carregarVitrine } from '@/services/dadosService'

/**
 * As fotos que giram na esfera do login.
 *
 * Sao as logos dos clientes cadastrados — e SO as de quem tem logo. Cliente
 * sem foto (o "teste" de sempre) nao vira placa em branco: ele simplesmente
 * nao entra.
 *
 * A lista tambem manda na QUANTIDADE de placas: dois clientes com logo, duas
 * placas. Nada de repetir a mesma imagem para encher a esfera. Sem nenhuma
 * foto ainda, fica so o nucleo aceso — que e o certo, e nao uma bola de
 * retangulos vazios.
 */
export default function useVitrine() {
  const [fotos, setFotos] = useState([])

  useEffect(() => {
    let vivo = true

    carregarVitrine()
      .then((lista) => {
        if (vivo) setFotos(lista)
      })
      .catch(() => {
        /* API fora do ar: fica so o nucleo, e a tela de login segue
           funcionando normalmente */
      })

    return () => {
      vivo = false
    }
  }, [])

  return { fotos, temClientes: fotos.length > 0 }
}
