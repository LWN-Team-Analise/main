import { useState } from 'react'
import { sortearExemplo } from '@/utils/exemplos'

/**
 * Um exemplo sorteado no meio de um texto (rotulo, explicacao).
 *
 * Sorteia uma vez, ao montar: dentro de um pop-up isso e a cada abertura,
 * e redesenhar a tela nao troca a palavra na frente da pessoa.
 */
export default function ExemploSorteado({ chave }) {
  const [exemplo] = useState(() => sortearExemplo(chave))
  return exemplo
}
