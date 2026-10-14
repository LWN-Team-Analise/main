import { useMemo } from 'react'
import { useDados } from '@/context/DadosContext'
import { useAuth } from '@/context/AuthContext'
import { cargosDoCheck, chaveDoCargo, checksExigidos, estadoDaEtapa, podeEditarCheck } from '@/domain/obras'

/**
 * O que ainda falta em cada etapa e a proxima etapa de cada setor.
 *
 *   faltaNa    numero da etapa -> setores com check por marcar nela
 *   proximaDo  setor -> a primeira etapa (da atual em diante) em que ele
 *              ainda tem check por marcar
 */
function filaDaObra(roteiro, obra) {
  const marcados = obra.checks ?? {}
  const faltaNa = new Map()
  const proximaDo = {}
  const ordem = [...roteiro].sort((a, b) => a.numero - b.numero)

  ordem.forEach((etapa) => {
    const setores = new Set()
    etapa.cards.forEach((card) => {
      checksExigidos(card).forEach((check) => {
        if (!marcados[check.id]) cargosDoCheck(check, card).forEach((s) => setores.add(s))
      })
    })
    faltaNa.set(etapa.numero, setores)
    setores.forEach((s) => {
      if (!(s in proximaDo)) proximaDo[s] = etapa.numero
    })
  })

  return { faltaNa, proximaDo, ordem }
}

/**
 * As TAREFAS da pagina inicial.
 *
 * Nao existe cadastro de tarefa neste sistema, e nao e para existir: a
 * tarefa e o CHECK de uma obra. Quem cria tarefa e quem monta o roteiro;
 * a pagina inicial so junta os checks de todas as obras abertas numa
 * lista so e responde "o que precisa ser feito".
 *
 * E por isso que nao ha botao de "adicionar tarefa" em lugar nenhum
 * dela: uma tarefa solta, sem obra, nao teria onde ser marcada nem quem
 * a cobrasse — o sininho, os avisos e a rastreabilidade so sabem falar
 * de check de obra.
 *
 * Cada tarefa vira:
 *
 *   { id, titulo, obra, cliente, etapaNumero, etapaNome, cardTitulo,
 *     cargos, status, aguardando, feitoPor, feitoEm, minha }
 *
 * O STATUS sai destas perguntas, nesta ordem:
 *
 *   marcado?                         -> 'concluida'
 *   a etapa dele e a ATUAL da obra?  -> 'andamento'  (da para fazer agora)
 *   e a PROXIMA etapa do setor dele? -> 'espera'     (Não iniciado)
 *   etapa mais adiante que essa      -> fica de fora, por enquanto
 *
 * A "proxima etapa do setor" e a primeira, da atual em diante, em que o
 * setor ainda tem check por marcar. E ela que diz em que pe a obra esta
 * PARA AQUELE SETOR. A Excelencia que esta na 2ª e na 5ª:
 *
 *   1ª aberta            a 2ª dela em "Não iniciado" (a 5ª ainda nao)
 *   2ª aberta            a 2ª em "Em andamento"
 *   fez a parte da 2ª    a 5ª volta para "Não iniciado", esperando os
 *                        outros setores fecharem a 2ª, a 3ª e a 4ª
 *   5ª aberta            a 5ª em "Em andamento"
 *
 * Antes TODO check de etapa futura ia para "Não iniciado" de uma vez: a
 * mesma obra aparecia ali e em "Em andamento" ao mesmo tempo.
 *
 * `aguardando` diz quem segura a fila de um 'espera': as etapas antes
 * dele que ainda nao fecharam, cada uma com os setores que ainda devem
 * check nela.
 *
 * Obra de EMERGENCIA (Urgente) nao tem 'espera': ali todas as etapas
 * abrem de uma vez, e tudo o que falta fica em "Em andamento".
 *
 * Obra ENCERRADA fica de fora inteira. Ela e registro, e um quadro que
 * mistura o que ja acabou com o que falta fazer para de responder a
 * pergunta que ele existe para responder.
 */
export default function useTarefas() {
  const { obras, roteiroDaObra, concluida, clientePorId } = useDados()
  const { user } = useAuth()

  /* o setor de quem esta logado: e ele que separa "minhas" de "todas" */
  const meuSetor = chaveDoCargo(user)

  return useMemo(() => {
    const lista = []

    obras
      .filter((obra) => !concluida(obra))
      .forEach((obra) => {
        const cliente = clientePorId(obra.clienteId)
        /* o roteiro sai UMA vez por obra. O `estadoEtapa` do contexto
           faria essa conta de novo a cada etapa — cinco vezes por obra,
           em toda renderizacao da tela. */
        const roteiro = roteiroDaObra(obra)
        const urgente = obra.tipo === 'emergencia'
        const { faltaNa, proximaDo, ordem } = filaDaObra(roteiro, obra)

        roteiro.forEach((etapa) => {
          const estado = estadoDaEtapa(roteiro, obra, etapa.numero)

          etapa.cards.forEach((card) => {
            ;(card.checks ?? []).forEach((check) => {
              const marca = obra.checks?.[check.id]
              /* o check opcional (Material de gases sem ensaio de gases)
                 nao vira tarefa de ninguem enquanto nao for marcado */
              if (check.opcional && !marca) return
              const cargos = cargosDoCheck(check, card)

              /* Check sem setor nenhum nao tem "proxima etapa": fica
                 esperando como sempre ficou. O de um setor que ainda tem
                 uma etapa ANTES desta fica de fora: aparece quando
                 chegar a vez dela. */
              const vezDoSetor =
                cargos.length === 0 || cargos.some((s) => proximaDo[s] === etapa.numero)

              let status
              if (marca) status = 'concluida'
              else if (urgente || estado !== 'bloqueada') status = 'andamento'
              else if (vezDoSetor) status = 'espera'
              else return

              /* quem segura a fila: as etapas antes desta que ainda nao
                 fecharam, com os setores que ainda devem check nelas */
              const aguardando =
                status === 'espera'
                  ? ordem
                      .filter((e) => e.numero < etapa.numero && (faltaNa.get(e.numero)?.size ?? 0) > 0)
                      .map((e) => ({ numero: e.numero, nome: e.nome, setores: [...faltaNa.get(e.numero)] }))
                  : []

              lista.push({
                id: `${obra.id}:${check.id}`,
                checkId: check.id,
                titulo: check.titulo,
                obra,
                cliente,
                etapaNumero: etapa.numero,
                etapaNome: etapa.nome,
                /* o CARD e o dono da tarefa no roteiro. O Quadro agrupa a
                   coluna de concluidas por ele: um card fechado conta uma
                   historia ("o Comercial terminou"), e vinte checks
                   soltos contam vinte vezes a mesma. */
                cardId: card.id,
                cardTitulo: card.titulo ?? '',
                cardCargos: card.cargos ?? [],
                /* quantos checks o card tem — e o denominador do "3 de 5" */
                cardTotal: checksExigidos(card).length,
                cargos,
                status,
                aguardando,
                feitoPor: marca?.feitoPor ?? null,
                feitoEm: marca?.feitoEm ?? null,
                /* sem setor no cadastro ninguem tem tarefa "sua" — e a
                   tela cai no modo "todas" para nao ficar vazia */
                minha: meuSetor ? cargos.includes(meuSetor) : false,
                /* DA para marcar? Nao e a mesma pergunta que "e minha":
                   a diretoria marca qualquer check, e em obra de
                   emergencia qualquer um marca. E esta resposta, e nao
                   o setor, que decide se a linha aparece travada — a
                   mesma que o servidor da antes de gravar. */
                posso: podeEditarCheck(user, check, card, obra),
              })
            })
          })
        })
      })

    return lista
  }, [obras, roteiroDaObra, concluida, clientePorId, meuSetor, user])
}
