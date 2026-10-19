import React from 'react'
import ReactDOM from 'react-dom/client'
/* a base entra ANTES do App: assim o CSS de cada componente pode
   ajustar o que vem de global/comum, e nao o contrario */
import './styles/global.css'
import App from './App'

/* o service worker so cuida das notificacoes no celular (public/core/sw.js);
   registrar cedo deixa ele pronto para quando a pessoa ligar os avisos */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/core/sw.js', { scope: '/core/' }).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
