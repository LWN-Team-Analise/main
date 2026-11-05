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
 * Por O.S.: o status em cor, a linha do tempo (solicitada, aprovada,
 * separada, retirada, devolvida — com data e hora), o que foi pedido e
 * quem pediu. Por ferramenta (nome e TAG): a retirada e a devolucao — data
 * e hora, a baia, quem fez —, a avaria na saida ou na volta, e se a
 * devolucao veio antes, no ou depois do prazo. Le na hora (GET
 * /api/dados/obras/:id/ferramentas): o que muda no Control aparece na
 * proxima abertura.
 */

/* o status da O.S. em palavra e em cor (data-tom, ver o CSS) */
const STATUS = {
  aguardando_aprovacao: { texto: 'Aguardando aprovação', tom: 'ambar' },
  aguardando_conferencia: { texto: 'Aguardando separação', tom: 'ambar' },
  separada: { texto: 'Separada', tom: 'violeta' },
  conferido: { texto: 'Retirada', tom: 'azul' },
  em_campo: { texto: 'Em campo', tom: 'azul' },
  prorrogada: { texto: 'Prorrogada', tom: 'laranja' },
  concluida: { texto: 'Concluída', tom: 'verde' },
  cancelada: { texto: 'Cancelada', tom: 'cinza' },
  reprovada: { texto: 'Reprovada', tom: 'vermelho' },
}

const PRAZO = {
  antecipada: { texto: 'Antes do prazo', tom: 'azul' },
  no_prazo: { texto: 'No prazo', tom: 'verde' },
  atrasada: { texto: 'Depois do prazo', tom: 'vermelho' },
}

const AVARIA = {
  avariado: 'Voltou avariada',
  avariado_utilizavel: 'Voltou avariada, porém disponível para uso',
}

const numeroDaOS = (os) => `#${String(os.numero ?? os.id).padStart(4, '0')}`

/* "05/11 às 10:02" — a data curta da linha do tempo */
function curta(iso) {
  const texto = dataHora(iso)
  return texto ? texto.replace(/\/\d{4} às/, ' às') : ''
}

const Ico = {
  os: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3" />
    </svg>
  ),
  chave: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  sai: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  ),
  volta: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 7 7 17M15 17H7V9" />
    </svg>
  ),
  pessoa: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  ),
  calendario: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  ),
  baia: () => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5 12 4l8 5.5V20H4z" />
      <path d="M9 20v-6h6v6" />
    </svg>
  ),
  alerta: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4 2.8 19.5h18.4z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </svg>
  ),
  vazio: () => (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8 12 4l8.5 4v8L12 20l-8.5-4z" />
      <path d="M3.5 8 12 12l8.5-4M12 12v8" />
    </svg>
  ),
}

/* a linha do tempo da O.S.: os passos feitos acendem, o atual pulsa */
function LinhaDoTempo({ os }) {
  const passos = [
    { nome: 'Solicitada', evento: { em: os.solicitadaEm, por: os.solicitadaPor } },
    { nome: 'Aprovada', evento: os.aprovadaEm ? { em: os.aprovadaEm, por: os.aprovadaPor } : null },
    { nome: 'Separada', evento: os.passos?.separada ?? null },
    { nome: 'Retirada', evento: os.passos?.retirada ?? null },
    { nome: 'Devolvida', evento: os.passos?.devolvida ?? null },
  ]
  const feitos = passos.filter((p) => p.evento?.em).length
  return (
    <ol className="ferr__tempo" style={{ '--feito': `${Math.max(0, feitos - 1) / (passos.length - 1)}` }}>
      {passos.map((p, i) => {
        const feito = Boolean(p.evento?.em)
        const atual = !feito && i === feitos
        return (
          <li key={p.nome} className={`ferr__passo ${feito ? 'is-feito' : ''} ${atual ? 'is-atual' : ''}`.trim()}>
            <span className="ferr__ponto" aria-hidden="true" />
            <strong>{p.nome}</strong>
            <small>{feito ? curta(p.evento.em) : atual ? 'agora' : '—'}</small>
            {feito && p.evento.por && <small className="ferr__quem">{p.evento.por}</small>}
          </li>
        )
      })}
    </ol>
  )
}

function Momento({ tipo, titulo, evento, vazio, children }) {
  return (
    <div className={`ferr__momento ferr__momento--${tipo} ${evento ? '' : 'is-vazio'}`.trim()}>
      <span className="ferr__rotulo">
        <span className="ferr__seta">{tipo === 'retirada' ? <Ico.sai /> : <Ico.volta />}</span>
        {titulo}
      </span>
      {evento ? (
        <>
          <strong className="ferr__quando">{dataHora(evento.em)}</strong>
          <span className="ferr__linha">
            <span className="ferr__baia">
              <Ico.baia />
              {evento.baia ? `Baia ${evento.baia}` : 'Sem baia'}
            </span>
            {evento.por && (
              <span className="ferr__por">
                <Ico.pessoa />
                {evento.por}
              </span>
            )}
          </span>
          {children}
        </>
      ) : (
        <span className="ferr__linha ferr__linha--vazia">{vazio}</span>
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
      subtitulo={
        dados
          ? `${total} ${total === 1 ? 'ferramenta' : 'ferramentas'} · ${dados.length} ${dados.length === 1 ? 'OS' : 'OS'} do LWN Control`
          : undefined
      }
      largura={680}
    >
      <div className="ferr">
        {erro && (
          <p className="ferr__erro" role="alert">
            {erro}
          </p>
        )}
        {!erro && !dados && (
          <div className="ferr__vazio">
            <span className="ferr__vazioicone is-carregando">
              <Ico.vazio />
            </span>
            Carregando as ferramentas...
          </div>
        )}
        {dados && dados.length === 0 && (
          <div className="ferr__vazio">
            <span className="ferr__vazioicone">
              <Ico.vazio />
            </span>
            Nenhuma OS aprovada para esta obra ainda.
          </div>
        )}

        {(dados ?? []).map((os) => {
          const status = STATUS[os.status] ?? { texto: os.status, tom: 'cinza' }
          return (
            <section key={os.id} className="ferr__os" data-tom={status.tom}>
              <header className="ferr__cabeca">
                <span className="ferr__osicone">
                  <Ico.os />
                </span>
                <div className="ferr__cabecatexto">
                  <h3 className="ferr__titulo">
                    OS {numeroDaOS(os)}
                    <span className="ferr__status" data-tom={status.tom}>
                      {status.texto}
                    </span>
                  </h3>
                  <p className="ferr__sobre">
                    <span>
                      <Ico.calendario />
                      {dataBR(os.dataInicio)} a{' '}
                      {dataBR(os.devolvidaAntecipada && os.dataFimOriginal ? os.dataFimOriginal : os.dataFim)}
                    </span>
                    {os.responsavel && (
                      <span>
                        <Ico.pessoa />
                        Responsável: {os.responsavel}
                      </span>
                    )}
                  </p>
                </div>
              </header>

              <LinhaDoTempo os={os} />

              {os.devolvidaAntecipada && (
                <p className="ferr__aviso" data-tom="azul">
                  Devolvida antes do prazo{os.motivoAntecipacao ? `: ${os.motivoAntecipacao}` : ''}
                </p>
              )}

              {(os.pedido ?? []).length > 0 && (
                <div className="ferr__pedido">
                  <span className="ferr__pedidotitulo">Pedido</span>
                  {os.pedido.map((p) => (
                    <span key={p.tipo} className="ferr__pedidoitem">
                      {p.tipo}
                      <b>×{p.quantidade}</b>
                    </span>
                  ))}
                </div>
              )}

              {os.ferramentas.length === 0 ? (
                <p className="ferr__aguarda">
                  As ferramentas ainda não foram separadas: assim que o almoxarifado separar, elas aparecem aqui com a
                  TAG de cada uma.
                </p>
              ) : (
                <ul className="ferr__lista">
                  {os.ferramentas.map((f) => {
                    const prazo = f.devolucao?.prazo ? PRAZO[f.devolucao.prazo] : null
                    const avariada = Boolean(f.retirada?.avaria || f.devolucao?.avaria)
                    const estado = avariada ? 'vermelho' : f.devolucao ? 'verde' : f.retirada ? 'azul' : 'cinza'
                    return (
                      <li key={f.id ?? f.tag} className="ferr__item" data-tom={estado}>
                        <div className="ferr__nome">
                          <span className="ferr__chave">
                            <Ico.chave />
                          </span>
                          <strong>{f.nome ?? 'Ferramenta'}</strong>
                          {f.tag && <span className="ferr__tag">{f.tag}</span>}
                          <span className="ferr__estado">
                            {avariada ? 'Com avaria' : f.devolucao ? 'Devolvida' : f.retirada ? 'Em campo' : 'Separada'}
                          </span>
                        </div>
                        <div className="ferr__momentos">
                          <Momento
                            tipo="retirada"
                            titulo="Retirada"
                            evento={f.retirada}
                            vazio={f.saiuDaOS ? 'Saiu da OS antes da retirada' : 'Ainda não retirada'}
                          >
                            {f.retirada?.avaria && (
                              <span className="ferr__avaria">
                                <Ico.alerta />
                                Saiu avariada: {f.retirada.avaria}
                              </span>
                            )}
                          </Momento>
                          <Momento
                            tipo="devolucao"
                            titulo="Devolução"
                            evento={f.devolucao}
                            vazio={f.retirada ? 'Ainda não devolvida' : '—'}
                          >
                            {prazo && (
                              <span className="ferr__prazo" data-tom={prazo.tom}>
                                {prazo.texto}
                              </span>
                            )}
                            {f.devolucao?.avaria && (
                              <span className="ferr__avaria">
                                <Ico.alerta />
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
          )
        })}
      </div>
    </Modal>
  )
}
