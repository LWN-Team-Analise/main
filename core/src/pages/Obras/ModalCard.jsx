import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import EtiquetasCard from './EtiquetasCard'
import Seletor from '@/components/Seletor/Seletor'
import { CampoArea, CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import { corDoSetorDoCard } from '@/domain/obras'
import './ModalRoteiro.css'

/**
 * Card de setor dentro de uma etapa: cria e edita.
 *
 * O card e de UM setor e fica com contorno e nome na cor (suave) dele,
 * sem fundo chapado. A previa embaixo mostra como vai ficar.
 *
 * O comportamento de cada check (pedir Sim ou Nao, quem marca, o prazo)
 * mora no CHECK, e nao aqui: no mesmo card um check pode pedir resposta
 * e o do lado nao. O card so guarda o setor, o titulo, as etiquetas e
 * as "Informacoes do card" — o texto que aparece ao passar o mouse.
 *
 * O card vale DESTA obra em diante. Criar aqui coloca o card nesta
 * obra e nas proximas; excluir tira desta e das proximas. As obras
 * que ja passaram nao mudam — nem o que elas ja tinham marcado.
 */
export default function ModalCard({ aberto, etapa, card = null, obraId = null, aoFechar }) {
  const { cargos, corSuaveDoCargo, adicionarCard, atualizarCard, removerCard, rotuloEtapa, pode } =
    useDados()

  const [setor, setSetor] = useState('')
  const [titulo, setTitulo] = useState('')
  const [informacoes, setInformacoes] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const editando = Boolean(card)
  /* trocar os setores de um card que ja existe e permissao propria
     ("alterar setores no card"). Sem ela o campo fica travado — e o
     card novo continua escolhendo os dele, porque card sem setor nao
     marca nada. */
  const setoresTravados = editando && !pode('editar_cargos_card')

  useEffect(() => {
    if (!aberto) return
    setSetor(card?.cargos?.[0] ?? '')
    setTitulo(card?.titulo ?? '')
    setInformacoes(card?.informacoes ?? '')
    setErro('')
    setConfirmando(false)
  }, [aberto, card])

  const salvar = async (evento) => {
    evento.preventDefault()
    if (!setor) {
      setErro('Escolha o setor do card.')
      return
    }

    setSalvando(true)
    try {
      /* na edicao, os setores so vao quando mudaram: a API trata o
         envio deles como troca, e troca pede a permissao propria */
      const mudouSetores = (card?.cargos ?? []).join('|') !== setor
      const campos = {
        titulo: titulo.trim(),
        informacoes: informacoes.trim(),
        obraId,
        ...(!editando || mudouSetores ? { cargos: [setor] } : {}),
      }
      if (editando) await atualizarCard(card.id, campos)
      else await adicionarCard(etapa.id, campos)
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
      await removerCard(card.id, obraId)
      aoFechar()
    } catch (e) {
      setErro(e.message)
      setConfirmando(false)
    } finally {
      setSalvando(false)
    }
  }

  const corPrevia = corDoSetorDoCard({ cargos: setor ? [setor] : [] }, corSuaveDoCargo)

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar card' : 'Novo card'}
      subtitulo={rotuloEtapa(etapa?.numero ?? 1)}
      largura={520}
    >
      <form className="formrot" onSubmit={salvar} noValidate>
        <label className="formrot__rotulo">Setor responsável</label>
        <Seletor
          largo
          valor={setor}
          aoMudar={setSetor}
          vazio="Escolha o setor..."
          aria-label="Setor responsável pelo card"
          desabilitado={setoresTravados}
          opcoes={cargos.map((c) => ({ valor: c.chave, rotulo: c.nome, cor: c.cor }))}
        />
        {setoresTravados && (
          <p className="formrot__dica">
            Seu setor não tem a permissão "Adicionar / alterar setores no card": o setor deste
            card fica como está.
          </p>
        )}

        <CampoTexto
          rotulo="Título (opcional)"
          largo
          placeholder="Em branco, usa o nome do setor"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />

        <CampoArea
          rotulo="Informações do card (opcional)"
          largo
          linhas={2}
          maxLength={600}
          placeholder="O que este card faz? Aparece ao passar o mouse sobre ele."
          value={informacoes}
          onChange={(e) => setInformacoes(e.target.value)}
        />

        {setor && (
          <div className="formrot__previa">
            <span className="formrot__previanome">Como vai ficar</span>
            {/* o mesmo desenho do card na obra: contorno e nome na cor
                suave do setor, sem fundo */}
            <span className="formrot__amostra" style={{ '--amostra-cor': corPrevia }}>
              {titulo.trim() || cargos.find((x) => x.chave === setor)?.nome || setor}
            </span>
          </div>
        )}

        {/* As etiquetas so no card que JA existe: sem id gravado nao ha
            onde pendurar a etiqueta. No card novo elas nao aparecem —
            a pessoa cria e reabre em Editar, que e uma ida a mais uma
            vez so, contra um formulario que guardaria etiqueta em
            memoria para gravar depois e perderia tudo num cancelar. */}
        {editando && <EtiquetasCard card={card} />}

        {erro && (
          <p className="formrot__erro" role="alert">
            {erro}
          </p>
        )}

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
            {editando ? 'Salvar' : 'Adicionar card'}
          </Button>
        </footer>

        {confirmando && (
          <p className="formrot__aviso" role="alert">
            O card sai desta obra e das próximas, com os checks dele. As obras anteriores
            continuam com ele e com o que já foi marcado.
          </p>
        )}
      </form>
    </Modal>
  )
}
