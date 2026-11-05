import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import { ferramentasDaObra } from '@/services/dadosService'
import { dataBR, dataHora } from '@/utils/formato'
import './ModalFerramentas.css'

/**
 * As FERRAMENTAS da obra: o que as O.S. do LWN Control ligadas a ela
 * levaram (o botao ao lado do Editar, que aparece com a primeira O.S.
 * aprovada).
 *
 * Por O.S.: quem pediu e quando, quem aprovou, o periodo. Por
 * ferramenta (nome e TAG): a retirada e a devolucao — data e hora, a
 * baia, quem fez —, a avaria na saida ou na volta, e se a devolucao veio
 * antes, no ou depois do prazo. Le na hora (GET /api/dados/obras/:id/
 * ferramentas): o que muda no Control aparece na proxima abertura.
 */

const STATUS = {
  aguardando_conferencia: 'Aguardando separação',
  separada: 'Separada',
  conferido: 'Retirada',
  em_campo: 'Em campo',
  prorrogada: 'Prorrogada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

const PRAZO = {
  antecipada: { texto: 'antes do prazo', classe: 'is-antes' },
  no_prazo: { texto: 'no prazo', classe: 'is-noprazo' },
  atrasada: { texto: 'depois do prazo', classe: 'is-depois' },
}

const AVARIA = {
  avariado: 'Voltou avariada',
  avariado_utilizavel: 'Voltou avariada, porém disponível para uso',
}

const numeroDaOS = (os) => `OS #${String(os.numero ?? os.id).padStart(4, '0')}`

function Momento({ titulo, evento, vazio, children }) {
  return (
    <div className={`ferr__momento ${evento ? '' : 'is-vazio'}`.trim()}>
      <span className="ferr__rotulo">{titulo}</span>
      {evento ? (
        <>
          <strong className="ferr__quando">{dataHora(evento.em)}</strong>
          <span className="ferr__linha">
            {evento.baia ? `Baia ${evento.baia}` : 'Sem baia'}
            {evento.por ? ` · ${evento.por}` : ''}
          </span>
          {children}
        </>
      ) : (
        <span className="ferr__linha">{vazio}</span>
      )}
    </div>
  )
}

export default function ModalFerramentas({ aberto, obra, aoFechar }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!aberto || !obra?.id) return undefined
    let vivo = true
    setDados(null)
    setErro('')
    ferramentasDaObra(obra.id)
      .then((r) => vivo && setDados(r.ordens ?? []))
      .catch((e) => vivo && setErro(e.message || 'Não foi possível carregar as ferramentas.'))
    return () => {
      vivo = false
    }
  }, [aberto, obra?.id])

  const total = (dados ?? []).reduce((n, os) => n + os.ferramentas.length, 0)

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Ferramentas da obra"
      subtitulo={dados ? `${total} ${total === 1 ? 'ferramenta' : 'ferramentas'} em ${dados.length} ${dados.length === 1 ? 'OS' : 'OS'}` : undefined}
      largura={640}
    >
      <div className="ferr">
        {erro && (
          <p className="ferr__erro" role="alert">
            {erro}
          </p>
        )}
        {!erro && !dados && <p className="ferr__vazio">Carregando as ferramentas...</p>}
        {dados && dados.length === 0 && (
          <p className="ferr__vazio">Nenhuma OS aprovada para esta obra ainda.</p>
        )}

        {(dados ?? []).map((os) => (
          <section key={os.id} className="ferr__os">
            <header className="ferr__cabeca">
              <h3 className="ferr__titulo">
                {numeroDaOS(os)}
                <span className="ferr__status">{STATUS[os.status] ?? os.status}</span>
              </h3>
              <p className="ferr__sobre">
                Solicitada em {dataHora(os.solicitadaEm)}
                {os.solicitadaPor ? ` por ${os.solicitadaPor}` : ''}
                {os.aprovadaEm ? ` · aprovada em ${dataHora(os.aprovadaEm)}` : ''}
                {os.aprovadaPor ? ` por ${os.aprovadaPor}` : ''}
              </p>
              <p className="ferr__sobre">
                Período: {dataBR(os.dataInicio)} a {dataBR(os.dataFimOriginal && os.devolvidaAntecipada ? os.dataFimOriginal : os.dataFim)}
                {os.responsavel ? ` · responsável: ${os.responsavel}` : ''}
              </p>
              {os.devolvidaAntecipada && (
                <p className="ferr__aviso is-antes">
                  Devolvida antes do prazo
                  {os.motivoAntecipacao ? `: ${os.motivoAntecipacao}` : ''}
                </p>
              )}
            </header>

            {os.ferramentas.length === 0 ? (
              <p className="ferr__vazio">As ferramentas desta OS ainda não foram separadas.</p>
            ) : (
              <ul className="ferr__lista">
                {os.ferramentas.map((f) => {
                  const prazo = f.devolucao?.prazo ? PRAZO[f.devolucao.prazo] : null
                  return (
                    <li key={f.id ?? f.tag} className="ferr__item">
                      <div className="ferr__nome">
                        <strong>{f.nome ?? 'Ferramenta'}</strong>
                        {f.tag && <span className="ferr__tag">{f.tag}</span>}
                      </div>
                      <div className="ferr__momentos">
                        <Momento
                          titulo="Retirada"
                          evento={f.retirada}
                          vazio={f.saiuDaOS ? 'Saiu da OS antes da retirada' : 'Ainda não retirada'}
                        >
                          {f.retirada?.avaria && (
                            <span className="ferr__avaria">Saiu avariada: {f.retirada.avaria}</span>
                          )}
                        </Momento>
                        <Momento
                          titulo="Devolução"
                          evento={f.devolucao}
                          vazio={f.retirada ? 'Ainda não devolvida' : '—'}
                        >
                          {prazo && <span className={`ferr__prazo ${prazo.classe}`}>{prazo.texto}</span>}
                          {f.devolucao?.avaria && (
                            <span className="ferr__avaria">
                              {AVARIA[f.devolucao.avaria]}
                              {f.devolucao.observacao ? `: ${f.devolucao.observacao}` : ''}
                            </span>
                          )}
                        </Momento>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Modal>
  )
}
