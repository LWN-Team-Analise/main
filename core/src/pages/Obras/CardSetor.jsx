import { useMemo } from 'react'
import { PilhaAvatares } from '@/components/Avatar/Avatar'
import Dica from '@/components/Dica/Dica'
import {
  CHECK_EXECUCAO,
  CHECK_GASES,
  CHECK_PLANEJAMENTO,
  CHECK_PRAZO_EXECUCAO,
  CHECK_RESERVA,
  CHECK_RETIRADA,
  checksExigidos,
  checkTemDonoProprio,
  anexoDaProposta,
  corDoSetorDoCard,
  ehPropostaTecnica,
  estadoDoPrazo,
  nomeDaProposta,
  nomeDoCard,
  podeEditarCheck,
} from '@/domain/obras'
import { dataBR } from '@/utils/formato'
import { Icone } from './IconesObra'

/**
 * Card de um setor dentro da etapa: contorno e nome na cor SUAVE do
 * setor, fundo transparente, e a lista de checks. O card e de um setor
 * so — o gradiente de varios setores saiu.
 *
 * Duas travas diferentes, e o cadeado diz qual e:
 *  - `travado`: a etapa ainda nao abriu (so em obra padrao);
 *  - `semPermissao`: a etapa abriu, mas o card e de outro setor.
 *
 * Tudo o que diz como cada check se comporta e DO CHECK:
 *  - check de pergunta (check.simNao): o respondido "nao" aparece com um
 *    X e a palavra "Nao"; o "sim", com o tique e "Sim";
 *  - os dois do sistema (Planejamento e Execucao dos ensaios) abrem o
 *    proprio pop-up e mostram quantos ensaios / quanto ja foi executado;
 *  - a "Proposta tecnica" da 1a etapa abre o pop-up do documento e
 *    mostra o arquivo anexado;
 *  - as informacoes do check aparecem ao passar o mouse nele.
 *
 * As informacoes do card (card.informacoes) aparecem ao passar o mouse
 * no card.
 *
 * Com `arraste` (useArrasteDeChecks), o proprio check se arrasta para
 * mudar de ordem ou de card — sem pegador. Com `modelo`, o card e o do MODELO da obra
 * (ModalModeloObra): sem obra, sem placar e sem marcar — so editar.
 */
export default function CardSetor({
  card,
  etapa,
  obra,
  modelo = false,
  arraste = null,
  travado,
  usuario,
  podeCards,
  podeChecks,
  podePrazos,
  hoje,
  execucao,
  corSuaveDoCargo,
  nomeDoCargo,
  cargoPorChave,
  pessoaPorId,
  aoMarcar,
  aoEditarCard,
  aoNovoCheck,
  aoEditarCheck,
  aoPrazoCheck,
}) {
  /* o placar conta so o que a obra cobra: o check opcional (Material de
     gases sem ensaio de gases) aparece, mas fica fora do "2/3" */
  const exigidos = checksExigidos(card)
  const feitas = exigidos.filter((c) => obra.checks[c.id]).length
  const pronto = exigidos.length > 0 && feitas === exigidos.length
  /* "de outro" e quando NENHUM check do card e do seu setor */
  const semPermissao = !card.checks.some((c) => podeEditarCheck(usuario, c, card, obra))
  const cor = corDoSetorDoCard(card, corSuaveDoCargo)
  const titulo = nomeDoCard(card, nomeDoCargo)

  /**
   * Os rostos de quem marcou algum check DESTE card.
   *
   * Antes aparecia so o ultimo. Mas um card costuma ser trabalho de mais
   * de uma pessoa — o tecnico marca um check, o GQ marca outro — e mostrar
   * so quem chegou por ultimo apagava o outro da tela. Agora aparecem os
   * dois, do mais recente para o mais antigo.
   *
   * Sem repetir: quem marcou tres checks aparece uma vez so.
   */
  const responsaveis = useMemo(() => {
    const marcas = card.checks
      .map((c) => obra.checks[c.id])
      .filter(Boolean)
      .sort((a, b) => String(b.feitoEm).localeCompare(String(a.feitoEm)))

    const vistos = new Set()
    const gente = []
    marcas.forEach((marca) => {
      const id = String(marca.feitoPor ?? "")
      if (!id || vistos.has(id)) return
      vistos.add(id)
      const pessoa = pessoaPorId(id)
      if (pessoa) gente.push(pessoa)
    })
    return gente
  }, [card.checks, obra.checks, pessoaPorId])

  const donos = card.cargos.map((c) => cargoPorChave(c)?.nome ?? c).join(', ')

  return (
    /* a dica (card.informacoes) abre ao passar o mouse no card; num check
       que tem as proprias informacoes, a do check toma o lugar enquanto o
       mouse esta nele (ver Dica) */
    <Dica
      as="article"
      texto={card.informacoes}
      titulo={titulo}
      className={`setorcard ${pronto ? 'is-pronto' : ''} ${
        semPermissao && !travado ? 'is-deoutro' : ''
      }`.trim()}
      style={{ '--setor-cor': cor }}
    >
      <header className="setorcard__topo">
        {/* o nome inteiro na dica: o titulo corta com reticencias para
            a fila do cabecalho caber sempre */}
        <h3 className="setorcard__titulo" title={card.informacoes ? undefined : titulo}>
          {titulo}
        </h3>
        {card.informacoes && (
          <span className="setorcard__info" aria-label={`Informações: ${card.informacoes}`}>
            <Icone.info />
          </span>
        )}
        {semPermissao && !travado && !modelo && (
          <span className="setorcard__cadeado" title={`Só ${donos} marca estes checks`}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
              <path d="M8.4 10.5V7.8a3.6 3.6 0 0 1 7.2 0v2.7" />
            </svg>
          </span>
        )}
        {!modelo && (
          <span className="setorcard__placar">
            {feitas}/{exigidos.length}
          </span>
        )}
        {responsaveis.length > 0 && (
          <PilhaAvatares pessoas={responsaveis} tamanho={20} limite={4} />
        )}

        {(podeChecks || podeCards) && (
          <span className="setorcard__ferramentas">
            {podeChecks && (
              <button
                type="button"
                onClick={aoNovoCheck}
                title="Novo check neste card"
                aria-label={`Novo check em ${titulo}`}
              >
                <Icone.mais tamanho={14} />
              </button>
            )}
            {podeCards && (
              <button
                type="button"
                onClick={aoEditarCard}
                title="Editar ou excluir o card"
                aria-label={`Editar o card ${titulo}`}
              >
                <Icone.lapis />
              </button>
            )}
          </span>
        )}
      </header>

      {/* as etiquetas DESTE card. Nada a ver com as da obra: outro
          catalogo, outra caixa, e nenhuma das duas puxa a outra. */}
      {(card.etiquetas ?? []).length > 0 && (
        <ul className="setorcard__etiquetas">
          {card.etiquetas.map((e) => (
            <li key={e.id} style={{ background: e.cor }}>
              {e.nome}
            </li>
          ))}
        </ul>
      )}

      <ul
        className={`setorcard__tarefas ${
          arraste?.alvo?.cardId === card.id && arraste.alvo.antesDe === null ? 'is-alvo-fim' : ''
        }`.trim()}
        /* onde o arraste solta (ver arrasteChecks.js) */
        data-card={card.id}
        data-etapa={etapa?.id}
      >
        {card.checks.map((check) => {
          const marca = obra.checks[check.id]
          const feito = Boolean(marca)
          /* so em check de pergunta: true = sim, false = nao. Check
             marcado antes de virar pergunta fica sem resposta, e
             aparece como um check comum feito. */
          const resposta = check.simNao && feito ? (marca.resposta ?? null) : null
          const meu = podeEditarCheck(usuario, check, card, obra)
          const proprio = checkTemDonoProprio(check)
          const donosDoCheck = proprio
            ? check.cargos.map((c) => cargoPorChave(c)?.nome ?? c).join(', ')
            : donos
          const prazo = obra.prazos?.checks?.[check.id] ?? null
          const situacaoPrazo = estadoDoPrazo(prazo, hoje, { feito })
          const planejamento = check.tipo === CHECK_PLANEJAMENTO
          const execucaoDosEnsaios = check.tipo === CHECK_EXECUCAO
          const doSistema = planejamento || execucaoDosEnsaios
          /* a proposta tecnica (1a etapa) abre o pop-up do documento */
          const proposta = !modelo && ehPropostaTecnica(etapa, check)
          const documento = proposta ? anexoDaProposta(obra) : null
          /* os dois do sistema e a proposta abrem o pop-up mesmo para quem
             nao marca: la a pessoa VE os ensaios ou o documento, so nao mexe */
          /* o carro da obra (atualizacao 23): quem nao reserva ve a reserva,
             e a retirada pede so a permissao de registrar saida na Frotas */
          const reservaCarro = !modelo && check.tipo === CHECK_RESERVA
          const retiradaCarro = !modelo && check.tipo === CHECK_RETIRADA
          const doCarro = reservaCarro || retiradaCarro
          /* o check com horario (atualizacao 31) abre as datas mesmo para
             quem nao marca: la ele ve os horarios e quem vai */
          const comHorario = Boolean(check.horario)
          const horarios = comHorario && !modelo ? (obra.horarios?.[check.id] ?? []) : []
          const abreSemPermissao = (doSistema || proposta || doCarro || (comHorario && !modelo)) && !travado
          /* "Material de gases": obrigatorio so com ensaio de GASES na obra.
             O porque vai na dica, antes das informacoes do check. */
          const gases = check.tipo === CHECK_GASES
          const prazoDaExecucao = check.tipo === CHECK_PRAZO_EXECUCAO
          const porqueGases = !gases
            ? ''
            : modelo
              ? 'Obrigatório na obra que tiver ensaio de GASES planejado; nas outras, opcional.'
              : check.opcional
                ? 'Opcional: esta obra não tem ensaio de GASES.'
                : `Obrigatório: esta obra tem ensaio de GASES atribuído (${check.exigidoPor.join(', ')}).`
          const dicaDoCheck = [porqueGases, check.informacoes].filter(Boolean).join('\n\n')
          /* so o check que ainda vale tem ordem: o que ja saiu do roteiro
             (e uma obra antiga ainda mostra) nao se arrasta */
          const arrastavel = Boolean(arraste) && podeChecks && !check.vigenteAte
          const travadoAqui = modelo || travado || (!meu && !abreSemPermissao)
          return (
            <Dica
              as="li"
              key={check.id}
              texto={dicaDoCheck}
              titulo={check.titulo}
              data-check={check.id}
              data-vivo={check.vigenteAte ? undefined : ''}
              className={[
                arrastavel ? 'is-arrastavel' : '',
                arraste?.arrastando?.checkId === check.id ? 'is-arrastando' : '',
                arraste?.alvo?.cardId === card.id && arraste.alvo.antesDe === check.id ? 'is-alvo' : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined}
              onPointerDown={arrastavel ? arraste.pegar(check, card, etapa) : undefined}
            >
              {/* `aria-disabled`, e nao `disabled`: botao desabilitado engole o
                  ponteiro, e o check travado (de outro setor, etapa fechada)
                  tambem precisa ser arrastado por quem edita o roteiro */}
              <button
                type="button"
                className={`tarefa ${feito ? 'is-feita' : ''} ${resposta === false ? 'is-nao' : ''} ${
                  !modelo && !meu && !abreSemPermissao ? 'is-deoutro' : ''
                } ${doSistema || proposta || doCarro ? 'is-sistema' : ''} ${modelo ? 'is-modelo' : ''}`.trim()}
                onClick={() => !travadoAqui && aoMarcar(check)}
                aria-disabled={travadoAqui || undefined}
                title={
                  modelo || travado || dicaDoCheck
                    ? undefined
                    : proposta
                      ? documento
                        ? `Proposta técnica: ${nomeDaProposta(documento)}`
                        : 'Anexar a proposta técnica'
                      : reservaCarro
                      ? 'Reservar o carro da obra'
                      : retiradaCarro
                      ? 'Registrar a retirada do carro reservado'
                      : planejamento
                      ? 'Escolher os ensaios desta obra'
                      : execucaoDosEnsaios
                        ? 'Registrar a execução dos ensaios'
                        : meu
                          ? check.simNao
                            ? 'Responder Sim ou Não'
                            : undefined
                          : `Somente ${donosDoCheck} marca este check`
                }
                aria-pressed={feito}
              >
                <span className="tarefa__marca" aria-hidden="true">
                  {feito &&
                    (resposta === false ? (
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
                        <path d="M7 7l10 10M17 7 7 17" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12.5 4.5 4.5L19 7" />
                      </svg>
                    ))}
                </span>
                <span className="tarefa__texto">{check.titulo}</span>
                {/* a resposta escrita do lado: "Hospedagem  Não" */}
                {resposta !== null && (
                  <span className="tarefa__resposta" data-resposta={resposta ? 'sim' : 'nao'}>
                    {resposta ? 'Sim' : 'Não'}
                  </span>
                )}
                {/* o check que ainda pede resposta: o selo avisa antes do clique */}
                {check.simNao && !feito && <span className="tarefa__pergunta">Sim/Não</span>}
                {/* o check com horario: o horario (um so), quantas datas, ou o convite */}
                {comHorario && (
                  <span className="tarefa__ensaios">
                    {modelo
                      ? 'horário'
                      : horarios.length === 0
                        ? 'definir horário'
                        : horarios.length === 1
                          ? horarios[0].hora
                          : `${horarios.length} datas`}
                  </span>
                )}
                {/* os do sistema dizem em que pe estao */}
                {planejamento && !modelo && (
                  <span className="tarefa__ensaios">
                    {(obra.itens ?? []).length > 0
                      ? `${obra.itens.length} ${obra.itens.length > 1 ? 'itens' : 'item'}`
                      : (obra.ensaios ?? []).length === 0
                        ? 'escolher'
                        : `${obra.ensaios.length} ensaio${obra.ensaios.length > 1 ? 's' : ''}`}
                  </span>
                )}
                {execucaoDosEnsaios && !modelo && (
                  <span className="tarefa__ensaios">{execucao ? `${execucao.geral}%` : 'sem ensaios'}</span>
                )}
                {/* a proposta tecnica: o documento anexado, ou o convite a anexar */}
                {proposta && (
                  <span className="tarefa__ensaios tarefa__anexo">
                    {documento ? (
                      <>
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m20.5 11.5-8.6 8.6a5.3 5.3 0 0 1-7.5-7.5l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a1.8 1.8 0 0 1-2.5-2.5l7.9-7.9" />
                        </svg>
                        <span>{nomeDaProposta(documento)}</span>
                      </>
                    ) : (
                      'anexar'
                    )}
                  </span>
                )}
                {/* o carro da obra: o reservado, ou o convite a reservar / retirar */}
                {reservaCarro && (
                  <span className="tarefa__ensaios tarefa__anexo">
                    <span>
                      {obra.reserva?.veiculoId
                        ? obra.reserva.veiculoNome
                        : obra.reserva
                          ? 'sem carro'
                          : obra.execucaoPrazo
                            ? 'reservar'
                            : 'defina o prazo'}
                    </span>
                  </span>
                )}
                {retiradaCarro && (
                  <span className="tarefa__ensaios tarefa__anexo">
                    <span>{obra.reserva?.retirada ? 'retirado' : `retirar ${obra.reserva?.veiculoNome ?? ''}`.trim()}</span>
                  </span>
                )}
                {/* o prazo da execucao, que vale para a etapa de execucao */}
                {prazoDaExecucao && !modelo && (
                  <span className="tarefa__ensaios">
                    {obra.execucaoPrazo ? `até ${dataBR(obra.execucaoPrazo)}` : 'definir'}
                  </span>
                )}
                {gases && (
                  <span className="tarefa__gases" data-exigido={!modelo && !check.opcional ? 'sim' : undefined}>
                    {modelo ? 'gases' : check.opcional ? 'opcional' : 'obrigatório'}
                  </span>
                )}
                {/* dono diferente do card: a etiqueta diz de quem e */}
                {proprio && (
                  <span className="tarefa__dono" title={`Check de ${donosDoCheck}`}>
                    {check.cargos
                      .map((c) => cargoPorChave(c)?.curto ?? c.slice(0, 3))
                      .join('·')}
                  </span>
                )}
                {/* o prazo DESTE check nesta obra; some depois de feito */}
                {prazo && !feito && (
                  <span
                    className="tarefa__prazo"
                    data-estado={situacaoPrazo}
                    title={situacaoPrazo === 'vencido' ? 'Prazo vencido' : 'Prazo'}
                  >
                    até {dataBR(prazo).slice(0, 5)}
                  </span>
                )}
              </button>

              {((podePrazos && !feito) || podeChecks) && (
                <span className="tarefa__acoes">
                  {podePrazos && !feito && (
                    <button
                      type="button"
                      className="tarefa__editar"
                      onClick={() => aoPrazoCheck(check)}
                      title={prazo ? 'Alterar ou tirar o prazo deste check' : 'Definir um prazo para este check'}
                      aria-label={`Prazo do check ${check.titulo}`}
                    >
                      <Icone.prazo />
                    </button>
                  )}

                  {podeChecks && (
                    <button
                      type="button"
                      className="tarefa__editar"
                      onClick={() => aoEditarCheck(check)}
                      title="Editar ou excluir o check"
                      aria-label={`Editar o check ${check.titulo}`}
                    >
                      <Icone.lapis />
                    </button>
                  )}
                </span>
              )}
            </Dica>
          )
        })}

        {card.checks.length === 0 && (
          <li className="setorcard__semcheck">Sem check ainda.</li>
        )}
      </ul>
    </Dica>
  )
}
