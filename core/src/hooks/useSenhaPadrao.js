import { useEffect, useState } from 'react'
import { carregarSenhaPadrao } from '@/services/equipeService'

/**
 * Quem ainda esta com a senha padrao: um Set de ids (em texto), para o
 * "!" dos cards de Usuarios. So pergunta com `ativo` (a permissao
 * `ver_senha_padrao`).
 *
 * Vem de lote em lote porque o servidor confere senha por senha, e cada
 * conferencia e lenta de proposito: os sinais vao aparecendo com a tela
 * ja em uso. Se a API falhar, o card so fica sem o sinal.
 */
export default function useSenhaPadrao(ativo) {
  const [ids, setIds] = useState(() => new Set())

  useEffect(() => {
    if (!ativo) return undefined
    let vivo = true

    const buscar = async () => {
      const achados = new Set()
      try {
        let desde = 0
        while (vivo && desde !== null) {
          const lote = await carregarSenhaPadrao(desde)
          lote.ids.forEach((id) => achados.add(id))
          if (vivo) setIds(new Set(achados))
          desde = lote.proximo
        }
      } catch {
        /* sem a resposta, nada a mostrar */
      }
    }
    buscar()

    return () => {
      vivo = false
    }
  }, [ativo])

  return ids
}
