import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { useAuth } from '@/context/AuthContext'
import { dispensarAvisoCadastro } from '@/services/authService'
import './AvisoEntrada.css'

/**
 * Os AVISOS DE ENTRADA: o que aparece uma vez a cada vez que a pessoa
 * entra no site (a cada sessao do navegador), por cima da primeira tela.
 *
 *   senha    ainda com a senha padrao (usuario.senha_temporaria): "Trocar"
 *            leva ao bloco Senha de Configuracoes; "Não agora" fecha, e o
 *            aviso volta na proxima entrada. Nao ha como dispensar de vez:
 *            senha que outra pessoa escolheu e senha que outra pessoa sabe.
 *   cadastro cadastro incompleto (sem CPF): "Completar" leva a
 *            Configuracoes, e o "Não me mostrar essa mensagem novamente"
 *            guarda a escolha na conta (atualizacao 53), em todo aparelho.
 *
 * Um de cada vez: a senha primeiro, o cadastro depois que ela fecha. A
 * TV da empresa nao ve nenhum, e Configuracoes tambem nao — e ali que os
 * dois se resolvem.
 *
 * O AppShell e montado de novo a cada tela, entao "uma vez por entrada"
 * mora no sessionStorage (e numa copia na memoria, para o navegador que
 * bloqueia o storage nao mostrar o aviso a cada clique).
 */
const CHAVE = 'customers.avisos-entrada'
const vistosNaMemoria = new Set()

function jaVisto(id) {
  if (vistosNaMemoria.has(id)) return true
  try {
    return (JSON.parse(sessionStorage.getItem(CHAVE) ?? '[]') ?? []).includes(id)
  } catch {
    return false
  }
}

function marcarVisto(id) {
  vistosNaMemoria.add(id)
  try {
    const lista = JSON.parse(sessionStorage.getItem(CHAVE) ?? '[]') ?? []
    if (!lista.includes(id)) sessionStorage.setItem(CHAVE, JSON.stringify([...lista, id]))
  } catch {
    /* sem storage, vale a copia da memoria ate recarregar */
  }
}

/** Os que valem para a pessoa agora, na ordem em que aparecem. */
function pendentes(user) {
  return [
    user?.senhaTemporaria && 'senha',
    user?.cadastroPendente && !user?.avisoCadastroDispensado && 'cadastro',
  ].filter(Boolean)
}

/**
 * A fila desta tela: os pendentes que ainda nao apareceram nesta entrada,
 * ja marcados como vistos. E montada UMA vez, na abertura da tela (e nao
 * num efeito, que o React roda duas vezes no desenvolvimento e pularia o
 * primeiro aviso).
 */
function montarFila(user, pathname) {
  const quem = user?.id ? String(user.id) : ''
  if (!quem || user?.painelTv || pathname.startsWith('/app/configuracoes')) return []
  const fila = pendentes(user).filter((id) => !jaVisto(`${quem}:${id}`))
  fila.forEach((id) => marcarVisto(`${quem}:${id}`))
  return fila
}

export default function AvisoEntrada() {
  const { user, atualizarPerfil } = useAuth()
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const [fila, setFila] = useState(() => montarFila(user, pathname))
  const [naoMostrar, setNaoMostrar] = useState(false)

  /* o da vez, se ainda vale (a senha trocada em outra aba tira o aviso) */
  const aberto = fila.find((id) => pendentes(user).includes(id)) ?? null

  /* cada aviso comeca com a caixa desmarcada */
  useEffect(() => {
    setNaoMostrar(false)
  }, [aberto])

  const fechar = () => {
    if (aberto === 'cadastro' && naoMostrar) {
      atualizarPerfil({ avisoCadastroDispensado: true })
      dispensarAvisoCadastro().catch(() => {
        /* sem gravar, o aviso volta na proxima entrada: nada se perde */
      })
    }
    setFila((atual) => atual.filter((id) => id !== aberto))
  }

  const irParaConfiguracoes = () => {
    const foco = aberto === 'senha' ? { state: { focar: 'senha' } } : undefined
    fechar()
    navegar('/app/configuracoes', foco)
  }

  if (aberto === 'senha') {
    return (
      <Modal aberto aoFechar={fechar} titulo="Troque a sua senha" largura={440}>
        <div className="avisoentrada">
          <p className="avisoentrada__texto">
            Você ainda está usando a senha padrão, definida por outra pessoa. Crie a sua para proteger a sua conta.
          </p>
          <div className="avisoentrada__acoes">
            <Button variant="ghost" onClick={fechar}>
              Não agora
            </Button>
            <Button onClick={irParaConfiguracoes}>Trocar</Button>
          </div>
        </div>
      </Modal>
    )
  }

  if (aberto === 'cadastro') {
    return (
      <Modal aberto aoFechar={fechar} titulo="Complete o seu cadastro" largura={440}>
        <div className="avisoentrada">
          <p className="avisoentrada__texto">
            Seu cadastro está incompleto. Confira o nome completo e preencha a data de nascimento e o CPF em
            Configurações.
          </p>
          <label className="avisoentrada__marca">
            <input type="checkbox" checked={naoMostrar} onChange={(e) => setNaoMostrar(e.target.checked)} />
            <span>Não me mostrar essa mensagem novamente</span>
          </label>
          <div className="avisoentrada__acoes">
            <Button variant="ghost" onClick={fechar}>
              Não agora
            </Button>
            <Button onClick={irParaConfiguracoes}>Completar</Button>
          </div>
        </div>
      </Modal>
    )
  }

  return null
}
