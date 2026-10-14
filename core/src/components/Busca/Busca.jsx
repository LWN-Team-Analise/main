import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ParticleInterlock from '@/components/ParticleInterlock/ParticleInterlock'
import { useDados } from '@/context/DadosContext'
import { useTheme } from '@/context/ThemeContext'
import { agrupar, procurar } from '@/domain/busca'
import './Busca.css'

/**
 * A barra de busca do topo.
 *
 * Ate aqui ela era um campo que aceitava texto e nao fazia nada — o
 * placeholder prometia cliente, obra e configuracoes, e digitar
 * qualquer um dos tres nao levava a lugar nenhum.
 *
 * Agora ela procura nas tres coisas ao mesmo tempo e abre a lista
 * debaixo do campo. Duas letras ja bastam; menos que isso traria meio
 * cadastro e nao ajudaria ninguem.
 *
 * `valor`/`aoMudar` existem para a tela que quiser TOMAR o campo para
 * si (filtrar a propria lista com ele). Nesse caso a lista de
 * resultados nao aparece: quem manda no campo e a tela, e abrir uma
 * segunda lista por cima da que ela esta filtrando seria responder
 * duas vezes a mesma pergunta.
 */
export default function Busca({ valor, aoMudar, placeholder }) {
  const navegar = useNavigate()
  const { isDark, selectTheme } = useTheme()
  const dados = useDados()

  const daTela = typeof valor === 'string'
  const [meuTermo, setMeuTermo] = useState('')
  const termo = daTela ? valor : meuTermo

  const [aberta, setAberta] = useState(false)
  /* qual linha esta sob as setas do teclado; -1 = nenhuma */
  const [ativo, setAtivo] = useState(-1)
  const caixa = useRef(null)
  const campo = useRef(null)

  const resultados = useMemo(
    () => (daTela ? [] : procurar(termo, dados)),
    [daTela, termo, dados],
  )
  const grupos = useMemo(() => agrupar(resultados), [resultados])

  /* termo novo, contagem nova: manter a linha 3 marcada depois de
     apagar uma letra deixaria o Enter abrindo outra coisa */
  useEffect(() => {
    setAtivo(-1)
  }, [termo])

  const fechar = useCallback(() => {
    setAberta(false)
    setAtivo(-1)
  }, [])

  /* clique fora e Esc fecham; o campo continua com o que foi digitado,
     para quem so quis conferir a lista e voltar ao que estava fazendo */
  useEffect(() => {
    if (!aberta) return undefined
    const fora = (evento) => {
      if (!caixa.current?.contains(evento.target)) fechar()
    }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberta, fechar])

  const escolher = useCallback(
    (item) => {
      fechar()
      if (!daTela) setMeuTermo('')
      campo.current?.blur()

      /* o tema troca ONDE SE ESTA. Mandar para Configuracoes para
         clicar num botao seria a resposta certa para a pergunta
         errada: quem digitou "modo noturno" quer o modo noturno, e
         nao a tela onde ele mora. */
      if (item.acao === 'tema:light') return selectTheme('light')
      if (item.acao === 'tema:dark') return selectTheme('dark')

      /* `destacar` vai como estado da rota: a tela de destino usa ele
         para ja abrir filtrada no que foi procurado, em vez de
         entregar a lista inteira e deixar a pessoa procurar de novo */
      navegar(item.rota, item.destacar ? { state: { busca: item.destacar } } : undefined)
    },
    [daTela, fechar, navegar, selectTheme],
  )

  const teclar = (evento) => {
    if (evento.key === 'Escape') {
      fechar()
      return
    }
    if (!aberta || resultados.length === 0) return

    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      setAtivo((i) => (i + 1) % resultados.length)
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setAtivo((i) => (i <= 0 ? resultados.length - 1 : i - 1))
    } else if (evento.key === 'Enter') {
      evento.preventDefault()
      /* sem linha marcada, o Enter abre a primeira: e o que a lista
         ja estava sugerindo ao deixa-la no topo */
      escolher(resultados[ativo >= 0 ? ativo : 0])
    }
  }

  const mostrar = aberta && !daTela && termo.trim().length >= 2
  /* a posicao de cada item na lista corrida, para as setas andarem
     entre grupos sem tropecar nos titulos */
  let posicao = -1

  return (
    <div className="busca" ref={caixa}>
      <form className="omni" onSubmit={(evento) => evento.preventDefault()} role="search">
        {/* o orbe se anima pelo relogio, nao pelo nascimento do
            elemento: trocar de aba remonta o header e a volta
            continua de onde estava */}
        <ParticleInterlock
          className="omni__orb"
          tamanho={26}
          cor={isDark ? '#e8f0ff' : '#1b4386'}
          destaque={isDark ? '#7db4ff' : '#4d8ff0'}
          densidade={96}
          pontoTamanho={112}
        />
        <input
          ref={campo}
          className="omni__campo"
          value={termo}
          onChange={(evento) => {
            const texto = evento.target.value
            if (daTela) aoMudar?.(texto)
            else setMeuTermo(texto)
            setAberta(true)
          }}
          onFocus={() => setAberta(true)}
          onKeyDown={teclar}
          placeholder={placeholder ?? 'Buscar cliente, obra ou configurações'}
          aria-label="Buscar"
          aria-expanded={mostrar}
          aria-controls="busca-resultados"
          role="combobox"
          autoComplete="off"
        />
      </form>

      {mostrar && (
        <div className="busca__caixa" id="busca-resultados" role="listbox">
          {resultados.length === 0 ? (
            <p className="busca__nada">
              Nada encontrado para <strong>{termo.trim()}</strong>.
            </p>
          ) : (
            grupos.map((grupo) => (
              <section key={grupo.nome} className="busca__grupo">
                <h3 className="busca__rotulo">{grupo.nome}</h3>
                {grupo.itens.map((item) => {
                  posicao += 1
                  const meu = posicao
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={ativo === meu}
                      className={`busca__item ${ativo === meu ? 'is-ativo' : ''}`.trim()}
                      /* o ponteiro marca a linha em vez de so pintar no
                         hover: assim o teclado e o mouse concordam sobre
                         qual e "a linha atual" */
                      onMouseEnter={() => setAtivo(meu)}
                      onClick={() => escolher(item)}
                    >
                      <span className="busca__texto">
                        <strong>{item.titulo}</strong>
                        {item.detalhe && <small>{item.detalhe}</small>}
                      </span>
                      {item.etiqueta && (
                        <span
                          className="busca__marca"
                          data-fechada={item.fechada ? 'sim' : 'nao'}
                        >
                          {item.etiqueta}
                        </span>
                      )}
                    </button>
                  )
                })}
              </section>
            ))
          )}
        </div>
      )}
    </div>
  )
}
