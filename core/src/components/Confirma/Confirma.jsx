import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import './Confirma.css'

/**
 * A confirmacao do sistema, no lugar do window.confirm — que em alguns
 * navegadores nem chega a aparecer.
 *
 * Serve para dois casos:
 *
 *   DESTRUTIVO (padrao) — apagar. O botao sai vermelho.
 *   `tom="acao"`        — criar, sair, gravar. O botao sai na cor do
 *                         sistema, porque pintar de vermelho um "Criar
 *                         obra" faz a pessoa hesitar sem motivo.
 *
 * `aviso` e o recado extra que pesa na decisao ("isso apaga tambem as 2
 * obras"); `detalhes` e a conferencia do que vai ser feito — e onde o
 * cadastro de colaborador mostra o que o cargo escolhido libera.
 *
 * `nivel` sobe a confirmacao acima de um pop-up que ja esteja aberto:
 * sem ele, confirmar de dentro de um formulario abriria a caixa ATRAS
 * dele.
 *
 * `ciencia` acrescenta um SEGUNDO passo: uma caixinha que precisa ser
 * marcada antes de o botao liberar. E para o que nao tem desfazer — um
 * clique so, num botao que ja estava debaixo do cursor, nao e decisao
 * suficiente para apagar o registro de uma obra inteira. Sem a prop, a
 * caixa continua sendo de um passo, como sempre foi.
 */
export default function Confirma({
  aberto,
  titulo,
  mensagem,
  aviso,
  detalhes,
  tom = 'perigo',
  nivel = 0,
  ciencia,
  rotuloConfirmar = 'Apagar',
  aoConfirmar,
  aoFechar,
}) {
  const [ciente, setCiente] = useState(false)

  /* a caixinha volta desmarcada toda vez que a confirmacao abre: uma
     marca que sobra da vez anterior transforma o segundo passo em
     nenhum passo */
  useEffect(() => {
    if (aberto) setCiente(false)
  }, [aberto])

  const travado = Boolean(ciencia) && !ciente

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo} largura={430} nivel={nivel}>
      <div className="confirma">
        {/* sem mensagem, nem o parágrafo: um <p> vazio deixaria um vão
            entre o título e os botões */}
        {mensagem && <p className="confirma__texto">{mensagem}</p>}

        {detalhes && <div className="confirma__detalhes">{detalhes}</div>}

        {aviso && <p className="confirma__aviso">{aviso}</p>}

        {ciencia && (
          <label className="confirma__ciencia">
            <input
              type="checkbox"
              checked={ciente}
              onChange={(e) => setCiente(e.target.checked)}
            />
            {ciencia}
          </label>
        )}

        <footer className="confirma__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className={`confirma__ok confirma__ok--${tom}`}
            disabled={travado}
            onClick={async () => {
              /* a exclusao grava no banco e pode falhar; o motivo aparece
                 na faixa do AppShell, entao aqui so nao deixamos a
                 promessa estourar sem ninguem pegar */
              try {
                await aoConfirmar()
              } catch {
                /* ja mostrado ao usuario */
              }
              aoFechar()
            }}
          >
            {rotuloConfirmar}
          </button>
        </footer>
      </div>
    </Modal>
  )
}
