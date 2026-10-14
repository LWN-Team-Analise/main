import { useCallback, useEffect, useState } from 'react'
import './IlhaAviso.css'

/**
 * A ILHA — o aviso que mora no alto da tela, no feitio da Dynamic
 * Island do iPhone.
 *
 * Dois estados, e a graca esta na passagem de um para o outro:
 *
 *   recolhida — uma pilula preta pequena, com o glifo e o recado em
 *               uma linha. E o estado de repouso: ocupa quase nada e
 *               nao tapa a tela de ninguem.
 *   aberta    — a mesma peca preta crescendo ate virar um cartao: o
 *               recado vira titulo, aparece a explicacao embaixo e a
 *               bandeja com o que fazer a respeito.
 *
 * O texto do titulo e o MESMO nos dois estados — ele so muda de
 * tamanho. E o que faz a abertura parecer uma peca unica crescendo, e
 * nao um cartao trocado por outro.
 *
 * ---------------- Por que ela nao tem X ----------------
 *
 * A ilha e para o aviso que nao aceita "ok, li": enquanto o problema
 * existir, ela existe. Fechar recolhe para a pilula — nunca some. Quem
 * precisa de um aviso que some tem a faixa de erro do AppShell ou o
 * pop-up; a ilha e o degrau acima.
 *
 * `chave` guarda na SESSAO do navegador se ela foi aberta, e nao no
 * componente: cada tela monta o seu AppShell, e sem isso o estado se
 * perderia a cada clique no menu.
 *
 * ---------------- Por que ela nasce RECOLHIDA ----------------
 *
 * Aberta, ela e um cartao de uns 280px — e caia bem em cima da barra
 * de busca, que mora no mesmo alto da tela. Quem entrava no sistema
 * encontrava o campo de procurar tapado por um aviso que nao pediu
 * naquele instante.
 *
 * Recolhida ela continua dizendo a mesma coisa ("Troque a sua senha",
 * com o cadeado), ocupa a faixa que o sistema ja reservou para ela e
 * nao cobre nada. Quem quiser o texto inteiro e as opcoes toca nela —
 * e ai o cartao passa por cima do conteudo, que e aceitavel porque foi
 * a propria pessoa que pediu.
 *
 * Toda acao recolhe a ilha depois de rodar: a pessoa acabou de decidir
 * o que fazer, e o cartao aberto por cima do que ela pediu so atrapalha.
 */
export default function IlhaAviso({ chave, Glifo, titulo, subtitulo, acoes = [] }) {
  const [aberta, setAberta] = useState(() => {
    try {
      return sessionStorage.getItem(chave) === 'aberta'
    } catch {
      /* modo privado / storage bloqueado: recolhida, que e o padrao */
      return false
    }
  })

  const guardar = useCallback(
    (proxima) => {
      setAberta(proxima)
      try {
        if (proxima) sessionStorage.setItem(chave, 'aberta')
        else sessionStorage.removeItem(chave)
      } catch {
        /* sem storage a ilha continua funcionando, so nao lembra */
      }
    },
    [chave],
  )

  /* Esc recolhe, como em todo o resto do sistema */
  useEffect(() => {
    if (!aberta) return undefined
    const tecla = (evento) => evento.key === 'Escape' && guardar(false)
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aberta, guardar])

  return (
    <div className="ilha" role="status" aria-live="polite">
      <div className={`ilha__caixa ${aberta ? 'is-aberta' : ''}`.trim()}>
        <button
          type="button"
          className="ilha__toque"
          onClick={() => guardar(!aberta)}
          aria-expanded={aberta}
          title={aberta ? 'Recolher o aviso' : 'Abrir o aviso'}
        >
          {/* o glifo e a marca da pilula; aberto, o titulo toma a linha
              inteira e ele encolhe para fora de cena */}
          <span className="ilha__glifo" aria-hidden="true">
            <Glifo />
          </span>
          <span className="ilha__titulo">{titulo}</span>
        </button>

        {/* 0fr -> 1fr: a altura abre sozinha, sem ninguem medir nada */}
        <div className="ilha__corpo" aria-hidden={!aberta}>
          <div className="ilha__corpo-interno">
            <p className="ilha__sub">{subtitulo}</p>

            <div className="ilha__bandeja">
              {acoes.map(({ id, rotulo, Glifo: GlifoAcao, aoClicar }) => (
                <button
                  key={id}
                  type="button"
                  className="ilha__acao"
                  tabIndex={aberta ? 0 : -1}
                  onClick={() => {
                    guardar(false)
                    aoClicar?.()
                  }}
                >
                  <span className="ilha__acaoglifo" aria-hidden="true">
                    <GlifoAcao />
                  </span>
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
