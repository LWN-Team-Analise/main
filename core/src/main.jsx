import React from 'react'
import ReactDOM from 'react-dom/client'
/* a base entra ANTES do App: assim o CSS de cada componente pode
   ajustar o que vem de global/comum, e nao o contrario */
import './styles/global.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
