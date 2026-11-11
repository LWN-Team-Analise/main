import { useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import { dataBR, rotuloDoPeriodo } from '@/domain/ponto'
import { lembrarAssinatura } from '@/services/pontoService'

/* a situacao de cada pessoa na folha do periodo */
function situacaoDe(p) {
  if (p.assinada) return 'assinou'
  if (!p.temCpf) return 'semCpf'
  if (!p.temFolha) return 'semFolha'
  return 'falta'
}

const FILTROS = [
  { id: 'falta', rotulo: 'Não assinaram' },
  { id: 'assinou', rotulo: 'Assinaram' },
  { id: 'todos', rotulo: 'Todos' },
]

const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * ASSINATURAS — quem assinou e quem nao assinou a folha do periodo
 * escolhido, para quem ve a folha de todos (`gerenciar_ponto`). Quem
 * falta tem o "Enviar aviso" ao lado do nome: a mensagem sai no Teams,
 * pela conta da empresa, pedindo para a pessoa assinar aquela folha (o
 * link abre a folha do mesmo periodo). O mesmo aviso nao sai de novo
 * antes de uma hora, e a lista mostra quando foi o ultimo e quem mandou.
 *
 * Quem nao tem folha no periodo (ou nao tem CPF no cadastro) aparece em
 * "Todos", sem botao: nao ha o que assinar.
 */
export default function ModalAssinaturas({ aberto, aoFechar, inicio, fim, pessoas, aoMudar, aoAbrirFolha }) {
  const [filtro, setFiltro] = useState('falta')
  const [enviando, setEnviando] = useState(null)
  const [recados, setRecados] = useState({})

  const lista = useMemo(() => {
    const ordem = { falta: 0, assinou: 1, semFolha: 2, semCpf: 3 }
    return (pessoas ?? [])
      .map((p) => ({ ...p, situacao: situacaoDe(p) }))
      .sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [pessoas])

  const contagem = useMemo(
    () => ({
      assinou: lista.filter((p) => p.situacao === 'assinou').length,
      falta: lista.filter((p) => p.situacao === 'falta').length,
      semFolha: lista.filter((p) => p.situacao === 'semFolha' || p.situacao === 'semCpf').length,
    }),
    [lista],
  )

  const visiveis = filtro === 'todos' ? lista : lista.filter((p) => p.situacao === filtro)

  const avisar = async (p) => {
    setEnviando(p.id)
    setRecados((r) => ({ ...r, [p.id]: null }))
    try {
      const r = await lembrarAssinatura({ usuarioId: p.id, inicio, fim })
      aoMudar?.(p.id, { avisadoEm: r.avisadoEm, avisadoPor: r.avisadoPor })
      setRecados((atual) => ({ ...atual, [p.id]: { tom: 'ok', texto: 'Aviso enviado no Teams.' } }))
    } catch (e) {
      setRecados((atual) => ({ ...atual, [p.id]: { tom: 'erro', texto: e.message } }))
    } finally {
      setEnviando(null)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Assinaturas"
      subtitulo={`Folha de ponto de ${dataBR(inicio)} a ${dataBR(fim)} · ${rotuloDoPeriodo(inicio, fim)}`}
      largura={640}
    >
      <div className="pontoassin">
        <div className="pontoassin__resumo" role="status">
          <span className="pontoassin__conta is-ok">
            <strong>{contagem.assinou}</strong> assinaram
          </span>
          <span className="pontoassin__conta is-falta">
            <strong>{contagem.falta}</strong> não assinaram
          </span>
          <span className="pontoassin__conta">
            <strong>{contagem.semFolha}</strong> sem folha no período
          </span>
        </div>

        <div className="pontoassin__filtros" role="group" aria-label="Mostrar">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`chip ${filtro === f.id ? 'is-atual' : ''}`.trim()}
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
            >
              {f.rotulo}
            </button>
          ))}
        </div>

        {visiveis.length === 0 ? (
          <p className="pontoassin__vazio">
            {filtro === 'falta'
              ? contagem.assinou > 0
                ? 'Todo mundo com folha neste período já assinou.'
                : 'Ninguém tem folha importada neste período.'
              : filtro === 'assinou'
                ? 'Ninguém assinou a folha deste período ainda.'
                : 'Ninguém na lista.'}
          </p>
        ) : (
          <ul className="pontoassin__lista">
            {visiveis.map((p) => {
              const recado = recados[p.id]
              return (
                <li key={p.id} className={`pontoassin__item is-${p.situacao}`}>
                  <button
                    type="button"
                    className="pontoassin__nome"
                    onClick={() => aoAbrirFolha?.(p.id)}
                    title="Abrir a folha de ponto desta pessoa"
                    disabled={!p.temFolha}
                  >
                    <strong>{p.nome}</strong>
                    <span>
                      {p.situacao === 'assinou' && (p.assinadaEm ? `Assinou em ${quando(p.assinadaEm)}` : 'Assinou')}
                      {p.situacao === 'falta' && (p.desatualizada ? 'Assinou, mas a folha mudou depois: falta assinar de novo' : 'Não assinou')}
                      {p.situacao === 'semFolha' && 'Sem folha importada no período'}
                      {p.situacao === 'semCpf' && 'Sem CPF no cadastro'}
                      {p.situacao === 'falta' && p.avisadoEm && ` · aviso enviado em ${quando(p.avisadoEm)}${p.avisadoPor ? ` por ${p.avisadoPor}` : ''}`}
                    </span>
                    {recado && (
                      <span className={`pontoassin__recado is-${recado.tom}`} role={recado.tom === 'erro' ? 'alert' : 'status'}>
                        {recado.texto}
                      </span>
                    )}
                  </button>

                  {p.situacao === 'assinou' && (
                    <span className="pontoassin__selo" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12.5 4.5 4.5L19 7" />
                      </svg>
                      Assinada
                    </span>
                  )}
                  {p.situacao === 'falta' && (
                    <button
                      type="button"
                      className="acao acao--fraca pontoassin__avisar"
                      onClick={() => avisar(p)}
                      disabled={enviando === p.id}
                      title={`Enviar aviso no Teams pedindo para ${p.nome} assinar esta folha de ponto`}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 10.2v3.6a1.2 1.2 0 0 0 1.2 1.2H7l5.6 3.6a.8.8 0 0 0 1.2-.7V6.1a.8.8 0 0 0-1.2-.7L7 9H5.2A1.2 1.2 0 0 0 4 10.2Z" />
                        <path d="M17.2 9.2a4 4 0 0 1 0 5.6" />
                      </svg>
                      {enviando === p.id ? 'Enviando...' : 'Enviar aviso'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
