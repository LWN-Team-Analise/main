import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoArea, CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import './ModalRoteiro.css'

/**
 * Etapa do roteiro: cria, edita e apaga.
 *
 * A posicao vem sozinha: etapa nova entra no fim da fila.
 *
 * So as etapas criadas A MAO passam por aqui para editar ou excluir. As
 * de fabrica (etapa.fixa — planejamento, intermediaria, execucao...) sao
 * o esqueleto do fluxo: nao se renomeiam, nao se reordenam e nao se
 * excluem. A tela nem mostra o lapis nelas; se uma chegar aqui mesmo
 * assim, o pop-up so explica por que, e a API recusa do mesmo jeito.
 *
 * Duas coisas diferentes se chamam "nome" por aqui, e vale separar:
 *
 *   o NOME DESTA etapa ("Integração", "Pós-obra") — e o campo deste
 *     formulario, e muda so ela;
 *   a PALAVRA "etapa" — como a empresa chama cada bloco do roteiro.
 *     Essa vem da configuracao (`termoEtapa`) e troca no sistema
 *     inteiro; quem mexe nela e o pop-up de termos, na ficha de
 *     rastreabilidade.
 *
 * O que muda aqui vale DESTA obra em diante — nunca para tras. Criar
 * uma etapa aqui a coloca nesta obra e nas proximas; excluir a tira
 * desta e das proximas, e as obras anteriores continuam com ela e com
 * tudo o que ja tinham marcado nela.
 */
export default function ModalEtapa({ aberto, etapa = null, obraId = null, aoFechar }) {
  const { adicionarEtapa, editarEtapa, removerEtapa, termoEtapa, rotuloEtapa } = useDados()
  /* "etapa" é a palavra que a empresa escolheu; em texto corrido ela
     entra em minúscula */
  const termo = termoEtapa.toLowerCase()

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const editando = Boolean(etapa)
  const fixa = Boolean(etapa?.fixa)

  useEffect(() => {
    if (!aberto) return
    setNome(etapa?.nome ?? '')
    setDescricao(etapa?.descricao ?? '')
    setErro('')
    setConfirmando(false)
  }, [aberto, etapa])

  const salvar = async (evento) => {
    evento.preventDefault()
    if (fixa) return
    if (!nome.trim()) {
      setErro(`Informe o nome da ${termo}.`)
      return
    }

    setSalvando(true)
    try {
      const campos = { nome: nome.trim(), descricao: descricao.trim() }
      if (editando) await editarEtapa(etapa.id, campos)
      else await adicionarEtapa(campos, obraId)
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const apagar = async () => {
    setSalvando(true)
    try {
      await removerEtapa(etapa.id, obraId)
      aoFechar()
    } catch (e) {
      setErro(e.message)
      setConfirmando(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? `Editar ${rotuloEtapa(etapa.numero)}` : `Nova ${termo}`}
      subtitulo={
        fixa
          ? `${termoEtapa} fixa do fluxo da obra.`
          : 'Vale desta obra em diante. As obras anteriores não mudam.'
      }
      largura={470}
    >
      {fixa ? (
        <div className="formrot">
          <p className="formrot__sistema" role="note">
            Esta {termo} é fixa do fluxo da obra: não pode ser renomeada, reordenada nem
            excluída. Só as {termo}s criadas manualmente podem ser editadas. Os cards e os checks
            dentro dela continuam editáveis.
          </p>
          <footer className="formobra__acoes">
            <Button type="button" onClick={aoFechar}>
              Entendi
            </Button>
          </footer>
        </div>
      ) : (
        <form className="formrot" onSubmit={salvar} noValidate>
          <CampoTexto
            rotulo={`Nome da ${termo}`}
            largo
            autoFocus
            placeholder="Ex.: Pós-obra"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            erro={erro}
            dica={editando ? undefined : `Entra no fim da fila, depois da última ${termo}.`}
          />

          <CampoArea
            rotulo="Descrição (opcional)"
            largo
            linhas={2}
            placeholder="Ex.: aguardando aprovação do cliente"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />

          <footer className="formobra__acoes">
            {editando &&
              (confirmando ? (
                <button
                  type="button"
                  className="formrot__apagar is-confirmando"
                  onClick={apagar}
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
            <button type="button" className="formobra__cancelar" onClick={aoFechar}>
              Cancelar
            </button>
            <Button type="submit" loading={salvando}>
              {editando ? 'Salvar' : `Adicionar ${termo}`}
            </Button>
          </footer>

          {confirmando && (
            <p className="formrot__aviso" role="alert">
              A {termo} sai desta obra e das próximas, com os cards e os checks dela. As obras
              anteriores continuam com ela e com o que já foi marcado.
            </p>
          )}
        </form>
      )}
    </Modal>
  )
}
