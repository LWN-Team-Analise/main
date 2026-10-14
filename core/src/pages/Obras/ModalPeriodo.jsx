import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import CalendarioDias, { diaDaSemana } from '@/components/CalendarioDias/CalendarioDias'
import { useDados } from '@/context/DadosContext'
import { diasDaExecucao, resumoDosDias } from '@/domain/obras'
import { dataBR, hojeISO } from '@/utils/formato'
import './ModalRoteiro.css'

const fimDeSemana = (dia) => {
  const semana = diaDaSemana(dia)
  return semana === 0 || semana === 6
}

/**
 * O PERIODO DE EXECUCAO: so a 3a etapa, e dia a dia.
 *
 * Um calendario so, e cada dia se marca sozinho (clique, ou clique e
 * arraste para um trecho). Antes eram duas datas — inicio e prazo — e
 * o periodo era tudo o que ficava no meio. So que uma obra de 5 dias
 * nao e executada, necessariamente, em 5 dias seguidos: pode ser so
 * nos dias uteis, pular uma semana, cair num feriado. Agora o periodo
 * e a lista dos dias marcados.
 *
 * O primeiro dia marcado e a entrada em campo e o ultimo e o PRAZO DA
 * EXECUCAO — obrigatorio: a etapa nao anda sem ele. Os dias cabem
 * dentro da obra (do inicio dela ao prazo final); os de fora ficam
 * travados no calendario.
 *
 * Obra que definiu o periodo antes disso abre com todos os dias do
 * periodo antigo marcados — e so desmarcar os que nao vao ter execucao.
 *
 * O prazo final da OBRA e outro e nao muda aqui: a obra continua depois
 * da execucao (documentacao, entrega). E o periodo nao mexe na cor do
 * card nem no tipo da obra: execucao curta nao transforma obra padrao
 * em emergencia.
 *
 * Quem define e quem tem "Pode definir prazo para checks"
 * (definir_prazos), ou o dono do check "Prazo da execucao".
 */
export default function ModalPeriodo({ aberto, obra, aoFechar }) {
  const { definirExecucao } = useDados()
  const [dias, setDias] = useState([])
  /* o calendario nasce de novo a cada abertura, ja com os dias da obra
     — e assim que ele abre no mes certo */
  const [abertura, setAbertura] = useState(0)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const min = obra?.dataInicio || undefined
  const max = obra?.dataConclusao || undefined

  useEffect(() => {
    if (!aberto) return
    /* so os dias que cabem na obra de hoje: um dia travado no
       calendario nao daria para desmarcar */
    setDias(diasDaExecucao(obra).filter((d) => (!min || d >= min) && (!max || d <= max)))
    setErro('')
    setAbertura((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, obra?.id])

  const nosFins = dias.filter(fimDeSemana).length

  const salvar = async (evento) => {
    evento.preventDefault()
    if (dias.length === 0) {
      setErro('Marque ao menos um dia de execução.')
      return
    }
    setSalvando(true)
    try {
      await definirExecucao(obra.id, { dias })
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Período de execução"
      subtitulo={
        max ? `Só a etapa de execução. Prazo final da obra: ${dataBR(max)}.` : 'Só a etapa de execução.'
      }
      largura={440}
    >
      <form className="formrot" onSubmit={salvar} noValidate>
        <p className="formrot__dica formrot__dica--colada">
          Marque os dias em que a execução vai acontecer: clique em cada dia, ou clique e arraste
          para marcar um trecho. Clique de novo para tirar.
        </p>

        <CalendarioDias
          key={abertura}
          valor={dias}
          aoMudar={(novos) => {
            setDias(novos)
            setErro('')
          }}
          min={min}
          max={max}
          hoje={hojeISO()}
          rotulo="Dias da execução"
        />

        {/* altura fixa: se o resumo crescesse no meio do arraste, o
            pop-up se recentrava e o dia embaixo do ponteiro mudava */}
        <div className="formrot__diasresumo" aria-live="polite">
          <strong data-vazio={dias.length === 0 ? 'sim' : undefined}>
            {dias.length === 0
              ? 'Nenhum dia marcado'
              : `${dias.length} dia${dias.length > 1 ? 's' : ''} de execução`}
          </strong>
          <span className="formrot__diasatalhos">
            {nosFins > 0 && (
              <button
                type="button"
                className="formrot__diasatalho"
                onClick={() => setDias((atual) => atual.filter((d) => !fimDeSemana(d)))}
                title="Desmarca os sábados e domingos"
              >
                Tirar fins de semana
              </button>
            )}
            {dias.length > 0 && (
              <button type="button" className="formrot__diasatalho" onClick={() => setDias([])}>
                Limpar
              </button>
            )}
          </span>
          <span className="formrot__diastexto">
            {dias.length > 0 && resumoDosDias(dias)}
            {dias.length > 1 && ` · prazo da execução ${dataBR(dias.at(-1))}`}
          </span>
        </div>

        {erro && (
          <p className="formrot__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={salvando} disabled={dias.length === 0}>
            Salvar dias
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
