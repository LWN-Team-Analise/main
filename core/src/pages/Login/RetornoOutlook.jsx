import { useEffect, useState } from 'react'

/**
 * A pagina para onde a Microsoft devolve a janelinha do login.
 *
 * Ela nao mostra nada de util: pega o `code` do endereco, entrega para
 * a janela que abriu (a tela de Login ou a de Configuracoes) e se
 * fecha. Quem faz o resto — trocar o code por perfil e foto — e o
 * servidor, para o segredo do aplicativo nunca chegar ao navegador.
 *
 * Se a janelinha tiver sido bloqueada e a Microsoft tiver voltado na
 * aba principal, a pagina explica o que fazer em vez de ficar branca.
 */
export default function RetornoOutlook() {
  const [recado, setRecado] = useState('Concluindo a entrada...')

  useEffect(() => {
    const endereco = new URLSearchParams(window.location.search)
    const codigo = endereco.get('code')
    const erro = endereco.get('error_description') || endereco.get('error')

    const aviso = { origem: 'outlook', codigo, erro, estado: endereco.get('state') }

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(aviso, window.location.origin)
      window.close()
      // se o navegador nao deixar fechar, ao menos o recado muda
      setRecado('Pode fechar esta janela.')
      return
    }

    setRecado(
      erro
        ? `A Microsoft recusou a entrada: ${erro}`
        : 'Entrada concluída. Volte para a aba do sistema e tente de novo.',
    )
  }, [])

  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100dvh',
        padding: 24,
        textAlign: 'center',
        font: '15px/1.6 Inter, system-ui, sans-serif',
        color: 'var(--text-base)',
      }}
    >
      <p>{recado}</p>
    </main>
  )
}
