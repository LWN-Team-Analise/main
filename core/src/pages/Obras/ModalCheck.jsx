import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { SeletorMulti } from '@/components/Seletor/Seletor'
import { CampoArea, CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import { CHECK_GASES, checkDoSistema } from '@/domain/obras'
import './ModalRoteiro.css'

/**
 * Um check do card: cria, edita e apaga.
 *
 * TUDO o que diz como o check se comporta mora nele — e nao no card.
 * No mesmo card um check pode pedir Sim ou Nao e o do lado nao:
 *
 *   [ ] Obrigatorio responder Sim ou Nao?
 *       Marcada, marcar o check abre a pergunta: Sim fecha com ✓; Nao
 *       tambem fecha, mas com um X e "Nao" do lado (Hospedagem — Nao).
 *   Prazo
 *       A data limite deste check NESTA obra. So aparece para quem tem
 *       "Pode definir prazo para checks" (definir_prazos).
 *   Quem marca este check
 *       Vazio, segue o setor do card. Com setores, a lista e deste
 *       check so — e o caso de "Envio revisao externa": mora no card
 *       do GQ, mas quem marca sao GQ e Excelencia.
 *   Informacoes
 *       O que o check pede. Aparece ao passar o mouse sobre ele.
 *
 * Os dois checks do SISTEMA (Planejamento e Execucao dos ensaios) nao
 * mudam de nome, nao viram pergunta e nao se excluem: sao eles que
 * sustentam o fluxo dos ensaios.
 *
 * Com `obraId` (aberto de dentro de uma obra), criar, editar e excluir
 * o check vale SO para aquela obra — nem para as proximas, nem para as
 * que ja passaram. Sem `obraId` (o modelo da obra, botao "Editar" do
 * quadro), vale para as obras criadas daqui em diante.
 */
export default function ModalCheck({
  aberto,
  card,
  check = null,
  obraId = null,
  /* o prazo que este check ja tem nesta obra ('AAAA-MM-DD' ou null) */
  prazoAtual = null,
  aoFechar,
}) {
  const {
    cargos,
    adicionarCheck,
    atualizarCheck,
    removerCheck,
    definirPrazo,
    nomeDoCargo,
    pode,
  } = useDados()

  const [titulo, setTitulo] = useState('')
  const [donos, setDonos] = useState([])
  const [simNao, setSimNao] = useState(false)
  const [informacoes, setInformacoes] = useState('')
  const [prazo, setPrazo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const editando = Boolean(check)
  const doSistema = checkDoSistema(check)
  const doCard = (card?.cargos ?? []).map(nomeDoCargo).join(' e ')
  /* o prazo e por obra: fora de uma obra nao ha onde gravar */
  const podePrazo = Boolean(obraId) && pode('definir_prazos')

  useEffect(() => {
    if (!aberto) return
    setTitulo(check?.titulo ?? '')
    setDonos(check?.cargos ?? [])
    setSimNao(Boolean(check?.simNao))
    setInformacoes(check?.informacoes ?? '')
    setPrazo(prazoAtual ?? '')
    setErro('')
    setConfirmando(false)
  }, [aberto, check, prazoAtual])

  const salvar = async (evento) => {
    evento.preventDefault()
    if (!titulo.trim()) {
      setErro('Escreva o que precisa ser feito.')
      return
    }

    setSalvando(true)
    try {
      const campos = {
        titulo: titulo.trim(),
        cargos: donos,
        simNao: doSistema ? false : simNao,
        informacoes: informacoes.trim(),
        obraId,
      }
      const salvo = editando
        ? (await atualizarCheck(check.id, campos), check)
        : await adicionarCheck(card.id, campos)

      /* o prazo vai depois, numa chamada propria: ele e da obra, e o
         check (do roteiro) precisa existir antes para recebe-lo */
      if (podePrazo && salvo?.id && (prazo || '') !== (prazoAtual || '')) {
        await definirPrazo(obraId, { checkId: salvo.id, prazo })
      }
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
      await removerCheck(check.id, obraId)
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
      titulo={editando ? 'Editar check' : 'Novo check'}
      largura={500}
    >
      <form className="formrot" onSubmit={salvar} noValidate>
        {doSistema && (
          <p className="formrot__sistema" role="note">
            {check?.tipo === CHECK_GASES
              ? 'Check do sistema: obrigatório na obra que tiver ensaio de GASES. '
              : 'Check do sistema: ele abre o fluxo dos ensaios. '}
            O nome fica, e ele não pode ser excluído nem virar pergunta.
          </p>
        )}

        <CampoTexto
          rotulo="Nome do check"
          largo
          autoFocus={!doSistema}
          placeholder="Ex.: Hospedagem"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          disabled={doSistema}
        />

        {/* A caixa que decide o comportamento DESTE check. É caixa de
            marcar, e não escolha de duas opções: a pergunta é de sim ou
            não, e cada check responde a sua. */}
        {!doSistema && (
          <div className="formrot__escolha">
            <label className="formrot__marca">
              <input
                type="checkbox"
                checked={simNao}
                onChange={(e) => setSimNao(e.target.checked)}
              />
              <span>Obrigatório responder Sim ou Não?</span>
            </label>
          </div>
        )}

        {podePrazo && (
          <CampoTexto
            rotulo="Prazo nesta obra (opcional)"
            type="date"
            largo
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
          />
        )}

        <div>
          <label className="formrot__rotulo">Quem marca este check</label>
          <SeletorMulti
            largo
            valores={donos}
            aoMudar={setDonos}
            vazio={doCard ? `Segue o card (${doCard})` : 'Segue o card'}
            aria-label="Setores que podem marcar este check"
            opcoes={cargos.map((c) => ({ valor: c.chave, rotulo: c.nome, cor: c.cor }))}
          />
        </div>

        <CampoArea
          rotulo="Informações do check (opcional)"
          largo
          linhas={2}
          maxLength={600}
          placeholder="O que este check pede? Aparece ao passar o mouse sobre ele."
          value={informacoes}
          onChange={(e) => setInformacoes(e.target.value)}
        />

        {/* dentro de uma obra, mexer no check vale SO para ela; no modelo
            da obra o subtitulo do pop-up de fora ja diz que vale para as
            proximas */}
        {obraId && <p className="formrot__dica">Vale só para esta obra.</p>}

        {erro && (
          <p className="formrot__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes">
          {editando &&
            !doSistema &&
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
            {editando ? 'Salvar' : 'Adicionar check'}
          </Button>
        </footer>

        {confirmando && (
          <p className="formrot__aviso" role="alert">
            {obraId
              ? 'O check sai só desta obra.'
              : 'O check sai das próximas obras. As que já existem continuam com ele.'}
          </p>
        )}
      </form>
    </Modal>
  )
}
