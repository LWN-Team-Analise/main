import { useCallback, useRef } from 'react'

/**
 * Acompanha o ponteiro sobre um elemento e escreve a posicao em CSS vars
 * (--px / --py, em %). Usado para o brilho especular do liquid glass.
 */
export default function usePointerGlow() {
  const ref = useRef(null)

  const onPointerMove = useCallback((event) => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    node.style.setProperty('--px', `${x.toFixed(2)}%`)
    node.style.setProperty('--py', `${y.toFixed(2)}%`)
  }, [])

  const onPointerLeave = useCallback(() => {
    const node = ref.current
    if (!node) return
    node.style.setProperty('--px', '50%')
    node.style.setProperty('--py', '0%')
  }, [])

  return { ref, onPointerMove, onPointerLeave }
}
