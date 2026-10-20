import Avatar from '@/components/Avatar/Avatar'
import { ROTULO_SITUACAO, corDaEtiqueta, situacaoDaAtividade, valorCurto } from '@/domain/comercial'
import { dataBR } from '@/utils/formato'
import { IconeAtividade, IconeEmail, IconePessoa, IconeSemAtividade } from './icones'

/**
 * Um negocio no quadro — o cartao do Pipedrive:
 *
 *   a faixa da etiqueta em cima, o titulo, a empresa, a pessoa de
 *   contato e o valor; embaixo, o responsavel (a foto, ou o bonequinho)
 *   e a situacao da proxima atividade; e, quando o contato espera
 *   resposta, o "Responder?".
 *
 * O cartao inteiro abre o negocio. Ele e um <div role="button">, e nao
 * um <button>, porque leva outro botao dentro (o "Responder?").
 */
export default function CartaoNegocio({
  negocio,
  hoje,
  dono,
  arrastavel = false,
  responder = false,
  aoAbrir,
  aoResponder,
  aoComecarArrasto,
  aoTerminarArrasto,
}) {
  const situacao = situacaoDaAtividade(negocio.proximaAtividade, hoje)
  const etiqueta = corDaEtiqueta(negocio.etiqueta)
  const dicaAtividade =
    situacao === 'sem'
      ? ROTULO_SITUACAO.sem
      : `${ROTULO_SITUACAO[situacao]}: ${dataBR(negocio.proximaAtividade)}${
          negocio.atividadeDescricao ? ` — ${negocio.atividadeDescricao}` : ''
        }`

  return (
    <article
      className="cartaoneg"
      data-status={negocio.status}
      role="button"
      tabIndex={0}
      draggable={arrastavel}
      aria-label={`${negocio.titulo}, ${negocio.organizacao}`}
      onClick={() => aoAbrir(negocio)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          aoAbrir(negocio)
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        /* o Firefox so comeca o arrasto com algum dado dentro */
        e.dataTransfer.setData('text/plain', negocio.id)
        aoComecarArrasto?.(negocio)
      }}
      onDragEnd={() => aoTerminarArrasto?.()}
    >
      {etiqueta && <span className="cartaoneg__etiqueta" style={{ '--etiqueta': etiqueta }} aria-hidden="true" />}

      <h4 className="cartaoneg__titulo">{negocio.titulo}</h4>
      {negocio.organizacao && <p className="cartaoneg__linha">{negocio.organizacao}</p>}
      {negocio.contatoNome && <p className="cartaoneg__linha">{negocio.contatoNome}</p>}
      <p className="cartaoneg__valor">{valorCurto(negocio.valor)}</p>

      <div className="cartaoneg__rodape">
        <span className="cartaoneg__dono" title={negocio.responsavelNome || 'Sem responsável'}>
          {dono?.foto ? (
            <Avatar nome={dono.nome} foto={dono.foto} tamanho={20} />
          ) : (
            <span className="cartaoneg__boneco">
              <IconePessoa tamanho={13} />
            </span>
          )}
        </span>

        {negocio.status !== 'aberto' && (
          <span className="cartaoneg__fechado" data-status={negocio.status}>
            {negocio.status === 'ganho' ? 'Ganho' : 'Perdido'}
          </span>
        )}

        {negocio.status === 'aberto' && (
          <span className="cartaoneg__atividade" title={dicaAtividade} role="img" aria-label={dicaAtividade}>
            {situacao === 'sem' ? <IconeSemAtividade /> : <IconeAtividade situacao={situacao} />}
          </span>
        )}
      </div>

      {responder && negocio.status === 'aberto' && (
        <button
          type="button"
          className="cartaoneg__responder"
          title={
            negocio.email.aguardando
              ? `${negocio.contatoNome || negocio.contatoEmail} espera resposta: ${negocio.email.assunto}`
              : `Mandar e-mail para ${negocio.contatoEmail}`
          }
          onClick={(e) => {
            e.stopPropagation()
            aoResponder(negocio)
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <IconeEmail />
          Responder?
        </button>
      )}
    </article>
  )
}
