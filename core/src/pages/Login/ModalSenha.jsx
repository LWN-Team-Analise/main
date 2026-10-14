import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoTexto } from '@/components/Campo/Campo'
import { conferirCodigo, pedirCodigo, redefinirSenha } from '@/services/authService'
import './ModalSenha.css'

/**
 * "Esqueci minha senha", em tres passos dentro do mesmo pop-up:
 *
 *   1. quem e você   — e-mail ou CPF
 *   2. o código      — 6 dígitos que chegam por e-mail, válidos por
 *                      3 minutos; passou disso, e so pedir outro
 *   3. a senha nova  — duas vezes, para não errar
 *
 * O passo 1 responde a mesma coisa exista ou nao a conta: se dissesse
 * "esse e-mail nao existe", qualquer um descobriria quem esta
 * cadastrado testando um por um.
 */

/** Quanto tempo o codigo vale, em segundos. O servidor usa o mesmo. */
const VALIDADE = 180

const contador = (segundos) => {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ModalSenha({ aberto, aoFechar, identificadorInicial = '' }) {
  const [passo, setPasso] = useState(1)
  const [identificador, setIdentificador] = useState('')
  const [destino, setDestino] = useState('')
  const [codigo, setCodigo] = useState('')
  const [permissao, setPermissao] = useState('')
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')

  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [sobra, setSobra] = useState(0)

  const relogio = useRef(0)

  /* cada abertura comeca do zero, ja com o que a pessoa digitou no login */
  useEffect(() => {
    if (!aberto) return
    setPasso(1)
    setIdentificador(identificadorInicial)
    setDestino('')
    setCodigo('')
    setPermissao('')
    setNova('')
    setRepetida('')
    setErro('')
    setRecado('')
    setSobra(0)
  }, [aberto, identificadorInicial])

  /* a contagem regressiva do codigo */
  useEffect(() => {
    if (sobra <= 0) return undefined
    relogio.current = window.setTimeout(() => setSobra((s) => s - 1), 1000)
    return () => window.clearTimeout(relogio.current)
  }, [sobra])

  const enviarCodigo = async (evento) => {
    evento?.preventDefault()
    if (!identificador.trim()) {
      setErro('Informe seu e-mail ou CPF.')
      return
    }

    setOcupado(true)
    setErro('')
    try {
      const resposta = await pedirCodigo(identificador.trim())
      setDestino(resposta.destino ?? '')
      setSobra(resposta.validoPor ?? VALIDADE)
      setRecado(resposta.recado ?? '')
      setPasso(2)
      setCodigo('')
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const conferir = async (evento) => {
    evento.preventDefault()
    setOcupado(true)
    setErro('')
    try {
      const { permissao: chave } = await conferirCodigo(identificador.trim(), codigo)
      setPermissao(chave)
      setPasso(3)
      setRecado('')
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const gravar = async (evento) => {
    evento.preventDefault()
    if (nova.length < 6) {
      setErro('A nova senha precisa de 6 caracteres ou mais.')
      return
    }
    if (nova !== repetida) {
      setErro('A confirmação não bate com a nova senha.')
      return
    }

    setOcupado(true)
    setErro('')
    try {
      await redefinirSenha(permissao, nova)
      setPasso(4)
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const titulos = {
    1: 'Esqueci minha senha',
    2: 'Confira o código',
    3: 'Nova senha',
    4: 'Senha trocada',
  }

  const subtitulos = {
    1: 'Informe o e-mail ou o CPF do seu cadastro. O código vai para o e-mail cadastrado.',
    2: destino
      ? `Enviamos um código de 6 dígitos para ${destino}.`
      : 'Digite o código de 6 dígitos que chegou no seu e-mail.',
    3: 'Escolha a senha que você vai usar daqui para a frente.',
    4: 'Pronto. Já dá para entrar com a senha nova.',
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulos[passo]}
      subtitulo={subtitulos[passo]}
      largura={440}
    >
      <div className="recupera">
        {passo < 4 && (
          <ol className="recupera__trilha" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <li key={n} className={n <= passo ? 'is-feito' : ''}>
                {n}
              </li>
            ))}
          </ol>
        )}

        {passo === 1 && (
          <form className="recupera__form" onSubmit={enviarCodigo} noValidate>
            <CampoTexto
              rotulo="E-mail ou CPF"
              largo
              autoFocus
              autoComplete="username"
              placeholder="voce@lwnengenharia.com.br"
              value={identificador}
              onChange={(e) => {
                setIdentificador(e.target.value)
                setErro('')
              }}
            />
            {erro && (
              <p className="recupera__erro" role="alert">
                {erro}
              </p>
            )}
            <Button type="submit" loading={ocupado}>
              Enviar código
            </Button>
          </form>
        )}

        {passo === 2 && (
          <form className="recupera__form" onSubmit={conferir} noValidate>
            <input
              className="recupera__codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              aria-label="Código de 6 dígitos"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))
                setErro('')
              }}
              autoFocus
            />

            <p className="recupera__tempo">
              {sobra > 0 ? (
                <>
                  O código vale por <strong>{contador(sobra)}</strong>.
                </>
              ) : (
                'O código expirou. Peça um novo.'
              )}
            </p>

            {recado && !erro && <p className="recupera__recado">{recado}</p>}
            {erro && (
              <p className="recupera__erro" role="alert">
                {erro}
              </p>
            )}

            <Button type="submit" loading={ocupado} disabled={codigo.length !== 6}>
              Continuar
            </Button>

            {/* so libera depois que o codigo morre: evita a pessoa
                pedir tres seguidos e usar o do meio sem querer */}
            <button
              type="button"
              className="recupera__reenviar"
              onClick={enviarCodigo}
              disabled={ocupado || sobra > 0}
            >
              {sobra > 0 ? `Enviar outro código em ${contador(sobra)}` : 'Enviar outro código'}
            </button>

            <button type="button" className="recupera__voltar" onClick={() => setPasso(1)}>
              Usar outro e-mail ou CPF
            </button>
          </form>
        )}

        {passo === 3 && (
          <form className="recupera__form" onSubmit={gravar} noValidate>
            <CampoTexto
              rotulo="Nova senha"
              largo
              type="password"
              autoComplete="new-password"
              autoFocus
              dica="No mínimo 6 caracteres."
              value={nova}
              onChange={(e) => {
                setNova(e.target.value)
                setErro('')
              }}
            />
            <CampoTexto
              rotulo="Repita a nova senha"
              largo
              type="password"
              autoComplete="new-password"
              value={repetida}
              onChange={(e) => {
                setRepetida(e.target.value)
                setErro('')
              }}
            />
            {erro && (
              <p className="recupera__erro" role="alert">
                {erro}
              </p>
            )}
            <Button type="submit" loading={ocupado}>
              Trocar senha
            </Button>
          </form>
        )}

        {passo === 4 && (
          <div className="recupera__form">
            <p className="recupera__pronto" role="status">
              Senha trocada. Entre com o e-mail ou CPF e a senha nova.
            </p>
            <Button type="button" onClick={aoFechar}>
              Voltar para o login
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
