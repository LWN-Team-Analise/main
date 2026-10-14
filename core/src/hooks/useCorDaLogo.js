import { useEffect, useState } from 'react'
import { corDominante } from '@/utils/corDaImagem'
import { corDoNome } from '@/utils/formato'

/**
 * Cor da borda do card do cliente: a predominante da logo. Sem logo (ou
 * se a imagem nao puder ser lida), cai na cor derivada do nome — a mesma
 * do avatar de iniciais, entao o card nunca fica sem identidade.
 */
export default function useCorDaLogo(logo, nome) {
  const [cor, setCor] = useState(() => corDoNome(nome))

  useEffect(() => {
    let valido = true

    if (!logo) {
      setCor(corDoNome(nome))
      return () => {
        valido = false
      }
    }

    corDominante(logo).then((achada) => {
      if (valido) setCor(achada ?? corDoNome(nome))
    })

    return () => {
      valido = false
    }
  }, [logo, nome])

  return cor
}
