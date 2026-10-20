import { useMemo } from 'react'
import { ROTULO_STATUS, rotuloDaEtapa, situacaoDaAtividade, valorCurto } from '@/domain/comercial'
import { dataBR } from '@/utils/formato'
import CartaoNegocio from './CartaoNegocio'

/* ============================================================
   As outras tres visoes da barra (a primeira e o Funil):

     Lista       a tabela, uma linha por negocio;
     Previsao    os negocios abertos pelo mes em que se espera
                 fechar (a "Data de fechamento esperada");
     Arquivados  os ganhos e os perdidos, para conferir e reabrir.
   ============================================================ */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** A tabela de negocios. `fechados` troca as ultimas colunas pelas do fechamento. */
export function ListaNegocios({ negocios, funilDe, hoje, aoAbrir, fechados = false, vazio = 'Nenhum negócio aqui.' }) {
  if (negocios.length === 0) return <p className="comercial__nada">{vazio}</p>

  return (
    <div className="comlista vidro">
      <table>
        <thead>
          <tr>
            <th scope="col">Título</th>
            <th scope="col" className="comlista__num">Valor</th>
            <th scope="col">Organização</th>
            <th scope="col">Pessoa de contato</th>
            <th scope="col">Etapa</th>
            <th scope="col">Responsável</th>
            {fechados ? (
              <>
                <th scope="col">Situação</th>
                <th scope="col">Fechado em</th>
              </>
            ) : (
              <>
                <th scope="col">Próxima atividade</th>
                <th scope="col">Fechamento esperado</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {negocios.map((n) => {
            const situacao = situacaoDaAtividade(n.proximaAtividade, hoje)
            return (
              <tr key={n.id} onClick={() => aoAbrir(n)} data-status={n.status}>
                <td>
                  <button type="button" className="comlista__titulo" onClick={() => aoAbrir(n)}>
                    {n.titulo}
                  </button>
                </td>
                <td className="comlista__num">{valorCurto(n.valor)}</td>
                <td>{n.organizacao || '—'}</td>
                <td>{n.contatoNome || n.contatoEmail || '—'}</td>
                <td>
                  <span className="comlista__etapa">
                    {funilDe ? `${funilDe(n.funil)} · ` : ''}
                    {rotuloDaEtapa(n.funil, n.etapa)}
                  </span>
                </td>
                <td>{n.responsavelNome || '—'}</td>
                {fechados ? (
                  <>
                    <td>
                      <span className="comlista__status" data-status={n.status}>
                        {ROTULO_STATUS[n.status]}
                      </span>
                      {n.motivoPerda && <em className="comlista__motivo">{n.motivoPerda}</em>}
                    </td>
                    <td>{n.fechadoEm ? dataBR(String(n.fechadoEm).slice(0, 10)) : '—'}</td>
                  </>
                ) : (
                  <>
                    <td>
                      <span className="comlista__atividade" data-situacao={situacao}>
                        {n.proximaAtividade ? dataBR(n.proximaAtividade) : 'Sem atividade'}
                      </span>
                    </td>
                    <td>{n.previsaoFechamento ? dataBR(n.previsaoFechamento) : '—'}</td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A previsao: uma coluna por mes, do atual aos tres seguintes, com o
 * que esta previsto para fechar em cada um. O que ja devia ter fechado
 * (previsao no passado) fica na primeira coluna, "Atrasados", e o que
 * nao tem data, na ultima.
 */
export function PrevisaoNegocios({ negocios, hoje, donoDe, responderEm, aoAbrir, aoResponder }) {
  const colunas = useMemo(() => {
    const [ano, mes] = hoje.split('-').map(Number)
    const meses = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(ano, mes - 1 + i, 1)
      return {
        id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        rotulo: `${MESES[d.getMonth()]} ${d.getFullYear()}`,
      }
    })
    const lista = [{ id: 'atrasados', rotulo: 'Atrasados' }, ...meses, { id: 'sem', rotulo: 'Sem data prevista' }]
    const primeiro = meses[0].id
    const ultimo = meses.at(-1).id
    const grupos = Object.fromEntries(lista.map((c) => [c.id, []]))
    negocios.forEach((n) => {
      const m = n.previsaoFechamento?.slice(0, 7)
      if (!m) grupos.sem.push(n)
      else if (m < primeiro) grupos.atrasados.push(n)
      else if (m <= ultimo) grupos[m].push(n)
    })
    return lista.map((c) => ({ ...c, negocios: grupos[c.id] }))
  }, [negocios, hoje])

  return (
    <div className="funil funil--previsao">
      <div className="funil__colunas" style={{ '--etapas': colunas.length }}>
        {colunas.map((c, i) => {
          const total = c.negocios.reduce((s, n) => s + Number(n.valor || 0), 0)
          return (
            <section key={c.id} className="funil__coluna" aria-label={c.rotulo}>
              <header className="funil__cabeca" data-primeira={i === 0 ? 'sim' : undefined}>
                <h3>{c.rotulo}</h3>
                <p>
                  {valorCurto(total)} · {c.negocios.length} {c.negocios.length === 1 ? 'negócio' : 'negócios'}
                </p>
              </header>
              <div className="funil__corpo">
                {c.negocios.map((n) => (
                  <CartaoNegocio
                    key={n.id}
                    negocio={n}
                    hoje={hoje}
                    dono={donoDe(n.responsavelId)}
                    responder={responderEm(n)}
                    aoAbrir={aoAbrir}
                    aoResponder={aoResponder}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
