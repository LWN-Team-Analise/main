import { Component } from 'react'
import './Barreira.css'

/**
 * Barreira de erro.
 *
 * Sem ela, um unico componente que estoura derruba a arvore inteira do
 * React e a tela fica BRANCA — parece que o site caiu. Com ela, o erro
 * para aqui e a pessoa ganha dois caminhos de volta: tentar de novo,
 * sem perder a pagina, ou recarregar.
 *
 * O que a tela NAO mostra mais: o titulo alarmante, a explicacao sobre
 * o banco e a mensagem tecnica do erro ("useDados precisa estar dentro
 * de <DadosProvider>"). Nenhum dos tres ajudava quem estava usando o
 * sistema — o texto assustava e a mensagem so faz sentido para quem
 * escreve o codigo. Ela continua inteira no console do navegador, com
 * a pilha, que e onde se conserta.
 *
 * Precisa ser classe: hoje so classe tem componentDidCatch.
 */
export default class Barreira extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    // no dev isso aparece no console do navegador, com a pilha inteira
    console.error('[barreira]', erro, info?.componentStack)
  }

  render() {
    const { erro } = this.state
    if (!erro) return this.props.children

    return (
      <div className="barreira" role="alert">
        <div className="barreira__caixa">
          <div className="barreira__acoes">
            <button
              type="button"
              className="barreira__btn barreira__btn--forte"
              onClick={() => this.setState({ erro: null })}
            >
              Tentar de novo
            </button>
            <button
              type="button"
              className="barreira__btn"
              onClick={() => window.location.reload()}
            >
              Recarregar a página
            </button>
          </div>
        </div>
      </div>
    )
  }
}
