import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { useDados } from '@/context/DadosContext'
import { textoSobre } from '@/utils/cor'
import { useTheme } from '@/context/ThemeContext'
import './ModalEtiquetas.css'

/**
 * Etiquetas da obra.
 *
 * A ordem da tela e a pedida: "Adicionar etiqueta" sempre em primeiro,
 * e as etiquetas ja postas logo abaixo dele. Cada uma tem o lapis a
 * direita; e dentro da edicao que mora o Excluir.
 *
 * A etiqueta e do sistema, nao desta obra: o mesmo "Urgente" pode
 * estar em varias. Excluir aqui tira a etiqueta DESTA obra — se ela
 * ficar sem nenhuma, o servidor a remove da lista.
 *
 * `somenteLeitura` e a obra CONCLUIDA. As etiquetas continuam a vista
 * (elas sao parte do que a obra foi, e e para consultar isso que
 * alguem abre uma obra fechada), so que sem o "Adicionar", sem o lapis
 * e sem a lista de reaproveitar — tudo aquilo grava.
 */

const CORES = [
  '#d93a34', '#e08a1e', '#2f8f5b', '#2a4fd6',
  '#8244c9', '#0f9aa8', '#c2a23a', '#5b6470',
]

const Icone = {
  mais: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  lapis: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
    </svg>
  ),
}

export default function ModalEtiquetas({ aberto, obra, somenteLeitura = false, aoFechar }) {
  const { etiquetas, etiquetasDaObra, marcarEtiqueta, atualizarEtiqueta, tirarEtiqueta } = useDados()
  const { isDark } = useTheme()

  /* null = so a lista | 'nova' = criando | { etiqueta } = editando */
  const [modo, setModo] = useState(null)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES[0])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const minhas = obra ? etiquetasDaObra(obra) : []
  /* etiquetas que ja existem em outras obras: da para reaproveitar em
     vez de digitar o mesmo nome de novo */
  const sugestoes = etiquetas.filter((e) => !minhas.some((m) => m.id === e.id))

  useEffect(() => {
    if (!aberto) return
    setModo(null)
    setErro('')
    setConfirmando(false)
  }, [aberto])

  const abrirNova = () => {
    setModo('nova')
    setNome('')
    setCor(CORES[Math.floor(Math.random() * CORES.length)])
    setErro('')
    setConfirmando(false)
  }

  const abrirEdicao = (etiqueta) => {
    setModo({ etiqueta })
    setNome(etiqueta.nome)
    setCor(etiqueta.cor)
    setErro('')
    setConfirmando(false)
  }

  const salvar = async (evento) => {
    evento.preventDefault()
    if (!nome.trim()) {
      setErro('Escreva o nome da etiqueta.')
      return
    }

    setSalvando(true)
    try {
      if (modo === 'nova') await marcarEtiqueta(obra.id, { nome: nome.trim(), cor })
      else await atualizarEtiqueta(modo.etiqueta.id, { nome: nome.trim(), cor })
      setModo(null)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    setSalvando(true)
    try {
      await tirarEtiqueta(obra.id, modo.etiqueta.id)
      setModo(null)
    } catch (e) {
      setErro(e.message)
      setConfirmando(false)
    } finally {
      setSalvando(false)
    }
  }

  const reaproveitar = async (etiqueta) => {
    try {
      await marcarEtiqueta(obra.id, {
        etiquetaId: etiqueta.id,
        nome: etiqueta.nome,
        cor: etiqueta.cor,
      })
    } catch (e) {
      setErro(e.message)
    }
  }

  if (!obra) return null

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Etiquetas"
      subtitulo={
        somenteLeitura ? undefined : 'Rótulos desta obra. A mesma etiqueta pode marcar várias obras.'
      }
      largura={470}
    >
      <div className="etiq">
        {/* o botao de adicionar vem SEMPRE primeiro, e a lista abaixo dele */}
        {!somenteLeitura && (
          <button type="button" className="etiq__novo" onClick={abrirNova}>
            <Icone.mais />
            Adicionar etiqueta
          </button>
        )}

        {minhas.length === 0 ? (
          <p className="etiq__vazio">
            {somenteLeitura
              ? 'Esta obra foi concluída sem nenhuma etiqueta.'
              : 'Esta obra ainda não tem etiqueta.'}
          </p>
        ) : (
          <ul className="etiq__lista">
            {minhas.map((e) => (
              <li key={e.id}>
                <span
                  className="etiq__selo"
                  style={{ background: e.cor, color: textoSobre(e.cor, isDark) }}
                >
                  {e.nome}
                </span>
                {!somenteLeitura && (
                  <button
                    type="button"
                    className="etiq__editar"
                    onClick={() => abrirEdicao(e)}
                    title={`Editar ${e.nome}`}
                    aria-label={`Editar a etiqueta ${e.nome}`}
                  >
                    <Icone.lapis />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* ---------------- formulario ---------------- */}
        {!somenteLeitura && modo && (
          <form className="etiq__form" onSubmit={salvar} noValidate>
            <label className="etiq__campo">
              <span>Nome</span>
              <input
                value={nome}
                onChange={(ev) => {
                  setNome(ev.target.value)
                  setErro('')
                }}
                placeholder="Ex.: Urgente"
                maxLength={40}
                autoFocus
              />
            </label>

            <div className="etiq__cores">
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`etiq__cor ${cor.toLowerCase() === c ? 'is-atual' : ''}`.trim()}
                  style={{ background: c }}
                  onClick={() => setCor(c)}
                  aria-label={`Usar a cor ${c}`}
                />
              ))}
            </div>

            <p className="etiq__previa">
              <span
                className="etiq__selo"
                style={{ background: cor, color: textoSobre(cor, isDark) }}
              >
                {nome.trim() || 'Nome da etiqueta'}
              </span>
            </p>

            {erro && (
              <p className="etiq__erro" role="alert">
                {erro}
              </p>
            )}

            <footer className="formobra__acoes">
              {/* o Excluir mora dentro da edicao, como pedido */}
              {modo !== 'nova' &&
                (confirmando ? (
                  <button
                    type="button"
                    className="formrot__apagar is-confirmando"
                    onClick={excluir}
                    disabled={salvando}
                  >
                    Confirmar exclusão
                  </button>
                ) : (
                  <button
                    type="button"
                    className="formrot__apagar"
                    onClick={() => setConfirmando(true)}
                    disabled={salvando}
                  >
                    Excluir
                  </button>
                ))}
              <button type="button" className="formobra__cancelar" onClick={() => setModo(null)}>
                Cancelar
              </button>
              <Button type="submit" loading={salvando}>
                {modo === 'nova' ? 'Adicionar' : 'Salvar'}
              </Button>
            </footer>

            {confirmando && (
              <p className="formrot__aviso" role="alert">
                A etiqueta sai desta obra. As outras obras que a usam continuam com ela.
              </p>
            )}
          </form>
        )}

        {/* ---------------- reaproveitar ---------------- */}
        {!somenteLeitura && !modo && sugestoes.length > 0 && (
          <div className="etiq__jaexistem">
            <span className="etiq__titulo">Já usadas em outras obras</span>
            <ul className="etiq__sugestoes">
              {sugestoes.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="etiq__selo etiq__selo--fraco"
                    style={{ '--cor': e.cor }}
                    onClick={() => reaproveitar(e)}
                    title={`Marcar esta obra com "${e.nome}"`}
                  >
                    <Icone.mais />
                    {e.nome}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
