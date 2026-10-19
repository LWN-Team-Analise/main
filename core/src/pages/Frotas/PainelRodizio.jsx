import { AREA, DIAS, finaisLegiveis, finalDaPlaca, horariosLegiveis, noHorario } from '@/domain/rodizio'
import useHoraAgora from '@/hooks/useHoraAgora'
import { dataBR } from '@/utils/formato'

/* 'seg', 'ter'... para a faixa da semana */
const CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/**
 * O rodizio de Sao Paulo hoje e nos proximos dias (GET /frotas/rodizio),
 * e quais carros da frota ele pega hoje.
 *
 * O "em vigor agora" e recalculado a cada minuto com o relogio de quem
 * esta olhando — a equipe esta no Brasil, e o painel pode ficar aberto
 * a manha inteira.
 */
export default function PainelRodizio({ rodizio, veiculos }) {
  const agora = useHoraAgora()

  if (!rodizio?.hoje) return null

  const { hoje, dias } = rodizio
  const livreHoje = Boolean(hoje.livre)
  const valendoAgora = !livreHoje && noHorario(agora)

  const ativos = veiculos.filter((v) => v.ativo)
  const pegos = livreHoje ? [] : ativos.filter((v) => hoje.finais.includes(finalDaPlaca(v.placa)))
  const semPlaca = ativos.filter((v) => finalDaPlaca(v.placa) === null).length

  return (
    <section className="rodizio" aria-labelledby="rodizio-titulo" data-estado={livreHoje ? 'livre' : valendoAgora ? 'agora' : 'hoje'}>
      <header className="rodizio__topo">
        <div>
          <h2 id="rodizio-titulo" className="rodizio__titulo">
            Rodízio em São Paulo
          </h2>
          <p className="rodizio__onde">
            {AREA} · {horariosLegiveis()}
          </p>
        </div>
        <span className="rodizio__selo">
          {livreHoje ? 'Sem rodízio hoje' : valendoAgora ? 'Em vigor agora' : 'Fora do horário agora'}
        </span>
      </header>

      <p className="rodizio__hoje">
        {livreHoje ? (
          <>
            Hoje ({DIAS[hoje.diaSemana]}, {dataBR(hoje.data)}) está livre: {hoje.livre.toLowerCase()}.
          </>
        ) : (
          <>
            Hoje ({DIAS[hoje.diaSemana]}, {dataBR(hoje.data)}) não circulam placas com final{' '}
            <strong>{finaisLegiveis(hoje.finais)}</strong>.
          </>
        )}
      </p>

      <ol className="rodizio__semana" aria-label="Próximos dias">
        {dias.map((d, i) => (
          <li key={d.data} className={`${i === 0 ? 'is-hoje' : ''} ${d.livre ? 'is-livre' : ''}`.trim()} title={d.livre ?? undefined}>
            <span className="rodizio__dia">{i === 0 ? 'hoje' : CURTO[d.diaSemana]}</span>
            <strong>{d.livre ? 'livre' : finaisLegiveis(d.finais)}</strong>
            <span className="rodizio__data">{dataBR(d.data).slice(0, 5)}</span>
          </li>
        ))}
      </ol>

      {!livreHoje && (
        <p className="rodizio__frota">
          {pegos.length > 0 ? (
            <>
              Da frota, hoje não circulam no centro expandido:{' '}
              {pegos.map((v, i) => (
                <span key={v.id}>
                  {i > 0 && ', '}
                  <strong>{v.nome}</strong> ({v.placa})
                </span>
              ))}
              .
            </>
          ) : (
            'Nenhum carro da frota com placa cadastrada está no rodízio hoje.'
          )}
          {semPlaca > 0 && ` ${semPlaca} ${semPlaca === 1 ? 'carro está' : 'carros estão'} sem placa cadastrada.`}
        </p>
      )}

      <p className="rodizio__fonte">
        Regra da Prefeitura (CET). Feriados: {rodizio.fonte}. Suspensões avulsas da CET (fim de ano, por exemplo)
        não entram aqui.
      </p>
    </section>
  )
}
