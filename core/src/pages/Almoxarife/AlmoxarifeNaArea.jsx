import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import './AlmoxarifeNaArea.css'

/* a tela do Almoxarife (public/almoxarife), fora do React */
const BASE = '/core/app/control'
/* o nome no endereco -> o id da aba la dentro (o mesmo de
   public/almoxarife/endereco.js) */
const DO_ENDERECO = { '': 'dashboard', painel: 'dashboard', retirada: 'conferencia' }

/**
 * A AREA ALMOXARIFE dentro do Atmosfera (/app/almoxarife/<aba>).
 *
 * As abas do Almoxarife abriam a tela dele, com o menu dele: trocava o
 * menu inteiro. Agora a tela dele mora num quadro aqui dentro, no modo
 * AREA (?embutido=area: sem o menu e a barra de cima de la), e quem troca
 * de aba e o menu do Atmosfera, como nas outras areas.
 *
 * Os dois lados conversam:
 *   - o menu trocou de aba: com o quadro ja aberto, chama o switchTab de
 *     la (sem recarregar); senao, abre o endereco da aba no quadro;
 *   - trocou de aba la dentro (um atalho do Painel, o voltar): o
 *     endereco.js avisa (postMessage 'almox-aba') e o endereco daqui
 *     acompanha, sem recarregar o quadro — e o menu acende a aba certa.
 *
 * O que vem depois do "?" (a OS em destaque dos checks da obra) vai junto
 * para o quadro na abertura.
 */
export default function AlmoxarifeNaArea() {
  const { '*': resto = '' } = useParams()
  const { search } = useLocation()
  const navegar = useNavigate()
  const quadro = useRef(null)

  const aba = resto.replace(/^\/+|\/+$/g, '').split('/')[0] ?? ''
  const destino = aba ? `${BASE}/${encodeURIComponent(aba)}` : BASE
  const comBusca = (extra) => {
    const busca = new URLSearchParams(extra)
    busca.set('embutido', 'area')
    return `${destino}?${busca.toString()}`
  }
  /* o endereco da abertura: depois o quadro anda sozinho */
  const [inicial] = useState(() => comBusca(search))
  const primeira = useRef(true)

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false
      return
    }
    const el = quadro.current
    if (!el) return
    try {
      const janela = el.contentWindow
      /* ainda abrindo o endereco da abertura */
      if (!janela || janela.location.href === 'about:blank') return
      if (janela.location.pathname === destino) return
      if (typeof janela.switchTab === 'function' && janela.location.pathname.startsWith(BASE)) {
        janela.switchTab(DO_ENDERECO[aba] ?? aba)
        return
      }
    } catch {
      /* o quadro nao respondeu: abre o endereco de novo */
    }
    el.src = comBusca('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino, aba])

  /* a aba trocou la dentro: o endereco daqui acompanha (sem nova entrada no
     historico: o quadro ja empilhou a dele) */
  useEffect(() => {
    const ouvir = (e) => {
      if (e.origin !== window.location.origin || e.source !== quadro.current?.contentWindow) return
      if (e.data?.tipo !== 'almox-aba') return
      const caminho = String(e.data.caminho ?? '')
      if (!caminho.startsWith(BASE)) return
      navegar(`/app/almoxarife${caminho.slice(BASE.length)}`, { replace: true })
    }
    window.addEventListener('message', ouvir)
    return () => window.removeEventListener('message', ouvir)
  }, [navegar])

  return (
    <AppShell>
      <section className="almoxarea">
        <iframe ref={quadro} className="almoxarea__quadro" src={inicial} title="Almoxarife" />
      </section>
    </AppShell>
  )
}
