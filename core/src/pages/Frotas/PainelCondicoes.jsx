import {
  NIVEIS,
  PESO_DO_NIVEL,
  REGIOES,
  cidadesLegiveis,
  rotuloDoNivel,
} from '@/domain/transito'
import { dataBR } from '@/utils/formato'

/* as quatro zonas da CET que o quadro antigo destaca, na ordem da rosa
   dos ventos; o Centro entra so no total */
const ZONAS_CET = ['norte', 'sul', 'leste', 'oeste']

const SETA = { subindo: '▲', 'estável': '▬', caindo: '▼' }

/* quantos trechos entram em "Onde esta pior agora" */
const PIORES = 5

/* 'livre (75% ou mais), moderado (50 a 75%), intenso (30 a 50%), muito intenso (abaixo de 30%)' */
const FAIXAS = NIVEIS.map((n, i) => {
  const de = Math.round(n.minimo * 100)
  const ate = i > 0 ? Math.round(NIVEIS[i - 1].minimo * 100) : null
  const faixa = i === 0 ? `${de}% ou mais` : i === NIVEIS.length - 1 ? `abaixo de ${ate}%` : `${de} a ${ate}%`
  return `${n.rotulo.toLowerCase()} (${faixa})`
}).join(', ')

/** 'AAAA-MM-DD HH:MM' -> 'hoje 09:00', 'amanhã 00:00' ou '16/10 00:00' */
function quando(momento) {
  const [dia, hora = ''] = String(momento ?? '').split(' ')
  if (!dia) return ''
  const hoje = new Date()
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1)
  const nome = dia === iso(hoje) ? 'hoje' : dia === iso(amanha) ? 'amanhã' : dataBR(dia).slice(0, 5)
  return `${nome} ${hora.slice(0, 5)}`.trim()
}

const horaDe = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const km = (n) => n.toLocaleString('pt-BR')

/** O selo do nivel: Livre, Moderado, Intenso, Muito intenso, Interditado. */
const Nivel = ({ nivel }) => (
  <span className="cond__nivel" data-nivel={nivel ?? undefined}>
    {rotuloDoNivel(nivel)}
  </span>
)

/** Um sentido de um corredor: o nivel e as duas velocidades. */
function Sentido({ s }) {
  return (
    <li className="cond__sentido" data-nivel={s.nivel ?? undefined}>
      <span className="cond__sentidonome">{s.sentido}</span>
      <Nivel nivel={s.nivel} />
      <span className="cond__vel" title="Velocidade agora / sem trânsito">
        {s.interditado ? 'via fechada' : `${s.atual} de ${s.semTransito} km/h`}
      </span>
    </li>
  )
}

/** A linha da CET: o que os "km" querem dizer, so da capital. */
function LinhaDaCet({ cet }) {
  if (!cet || cet.erro) return null
  const pior = [...cet.regioes].filter((r) => r.chave !== 'centro').sort((a, b) => b.km - a.km)[0]
  return (
    <>
      Na capital, a CET mede <strong>{km(cet.total)} km de lentidão</strong> agora (soma das vias paradas ou lentas)
      {pior ? `; a zona ${pior.nome.toLowerCase()} tem a maior parte (${km(pior.km)} km)` : ''}.
    </>
  )
}

/** O quadro antigo da CET, quando o TomTom nao responde: km de lentidao por zona. */
function TransitoDaCet({ cet, motivo }) {
  if (!cet) return null
  if (cet.erro) return <p className="cond__erro">Trânsito (CET): {cet.erro}</p>
  const porChave = Object.fromEntries(cet.regioes.map((r) => [r.chave, r]))
  return (
    <div className="cond__bloco">
      <h3 className="cond__sub">Trânsito agora na capital · km de lentidão</h3>
      <ul className="cond__regioes">
        {ZONAS_CET.map((chave) => {
          const r = porChave[chave]
          if (!r) return null
          return (
            <li key={chave} data-tendencia={r.tendencia ?? undefined}>
              <span className="cond__regiao">Zona {r.nome}</span>
              <strong>{km(r.km)} km</strong>
              <span className="cond__detalhe">
                lentos ou parados
                {r.tendencia && (
                  <em title={`Lentidão ${r.tendencia}`}>
                    {SETA[r.tendencia]} {r.tendencia}
                  </em>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="cond__rodape">
        <LinhaDaCet cet={cet} /> CET, consultado às {horaDe(cet.consultadoEm)}
        {cet.antigo ? ' (a CET não respondeu agora; este é o último dado)' : ''}.
        {motivo ? ` Região metropolitana: ${motivo}` : ''}
      </p>
    </div>
  )
}

function Transito({ transito, cet }) {
  if (!transito || transito.erro) return <TransitoDaCet cet={cet} motivo={transito?.erro} />

  const porRegiao = Object.fromEntries(transito.regioes.map((r) => [r.id, r]))
  const trechos = transito.corredores.flatMap((c) => c.sentidos.map((s) => ({ corredor: c, s })))
  const piores = trechos
    .filter(({ s }) => PESO_DO_NIVEL[s.nivel] >= PESO_DO_NIVEL.moderado)
    .sort(
      (a, b) =>
        PESO_DO_NIVEL[b.s.nivel] - PESO_DO_NIVEL[a.s.nivel] ||
        a.s.atual / a.s.semTransito - b.s.atual / b.s.semTransito,
    )
    .slice(0, PIORES)

  return (
    <div className="cond__bloco">
      <h3 className="cond__sub">Trânsito agora na Grande São Paulo</h3>

      <ul className="cond__regioes cond__regioes--niveis">
        {REGIOES.map((r) => {
          const lido = porRegiao[r.id]
          return (
            <li key={r.id} data-nivel={lido?.nivel ?? undefined} title={r.cidades}>
              <span className="cond__regiao">{r.nome}</span>
              <strong>{lido?.nivel ? rotuloDoNivel(lido.nivel) : 'sem dado'}</strong>
              <span className="cond__detalhe">{r.cidades}</span>
            </li>
          )
        })}
      </ul>

      <div className="cond__piores">
        <span className="cond__sub">Onde está pior agora</span>
        {piores.length === 0 ? (
          <p className="cond__calmo">Todos os corredores monitorados estão livres agora.</p>
        ) : (
          <ul className="cond__sentidos">
            {piores.map(({ corredor, s }) => (
              <Sentido key={`${corredor.id}-${s.sentido}`} s={{ ...s, sentido: `${corredor.nome} · ${s.sentido}` }} />
            ))}
          </ul>
        )}
      </div>

      <details className="cond__todos">
        <summary>Ver os {transito.corredores.length} corredores, por sentido</summary>
        {REGIOES.map((r) => {
          const daRegiao = transito.corredores.filter((c) => c.regiao === r.id)
          if (daRegiao.length === 0) return null
          return (
            <section key={r.id} className="cond__grupo" aria-label={r.nome}>
              <h4>{r.nome}</h4>
              {daRegiao.map((c) => (
                <div key={c.id} className="cond__corredor">
                  <strong>{c.nome}</strong>
                  <ul className="cond__sentidos">
                    {c.sentidos.map((s) => (
                      <Sentido key={s.sentido} s={s} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )
        })}
      </details>

      <p className="cond__rodape">
        O nível compara a velocidade de agora com a da via livre: {FAIXAS}. TomTom, consultado às{' '}
        {horaDe(transito.consultadoEm)}
        {transito.antigo ? ' (o TomTom não respondeu agora; este é o último dado)' : ''}.{' '}
        <LinhaDaCet cet={cet} />
      </p>
    </div>
  )
}

function Alertas({ alertas, cge }) {
  const avisos = alertas?.avisos ?? []
  return (
    <div className="cond__bloco">
      <h3 className="cond__sub">Alertas de tempo</h3>
      {alertas?.erro ? (
        <p className="cond__erro">Avisos do INMET: {alertas.erro}</p>
      ) : avisos.length === 0 ? (
        <p className="cond__calmo">Nenhum aviso meteorológico para a região metropolitana agora.</p>
      ) : (
        <ul className="cond__avisos">
          {avisos.map((a) => (
            <li key={`${a.descricao}-${a.inicio}`} style={a.cor ? { '--aviso': a.cor } : undefined}>
              <span className="cond__grau">{a.severidade}</span>
              <strong>{a.descricao}</strong>
              <span className="cond__periodo">
                {quando(a.inicio)} até {quando(a.fim)}
              </span>
              {(a.cidades ?? []).length > 0 && (
                <p className="cond__cidades" title={a.cidades.join(', ')}>
                  Vale para {cidadesLegiveis(a.cidades)}.
                </p>
              )}
              {a.riscos[0] && <p>{a.riscos[0]}</p>}
            </li>
          ))}
        </ul>
      )}

      {cge && !cge.erro && (
        <p className="cond__cge">
          {cge.estado && <strong className="cond__estado">{cge.estado} na capital (CGE)</strong>}
          Alagamentos ativos na capital: <strong>{cge.alagamentos}</strong>
          {cge.potencial.length > 0 && (
            <>
              {' · '}Potencial de tempestade:{' '}
              {cge.potencial.map((p) => `${p.periodo.toLowerCase()} ${p.nivel.toLowerCase()}`).join(', ')}
            </>
          )}
        </p>
      )}
      {cge?.erro && <p className="cond__erro">CGE: {cge.erro}</p>}

      <p className="cond__rodape">
        Avisos oficiais do INMET para os 39 municípios da região metropolitana, os mesmos que a Defesa Civil
        divulga; alagamentos do CGE da Prefeitura (só a capital publica). Em emergência: Defesa Civil 199.
      </p>
    </div>
  )
}

/**
 * O transito e os alertas de tempo da Grande Sao Paulo
 * (GET /frotas/condicoes) — para quem vai sair com o carro.
 */
export default function PainelCondicoes({ condicoes }) {
  if (!condicoes) return null
  const temAviso = (condicoes.alertas?.avisos ?? []).length > 0 || Boolean(condicoes.cge?.estado)
  return (
    <section className="cond" aria-labelledby="cond-titulo" data-alerta={temAviso ? 'sim' : undefined}>
      <h2 id="cond-titulo" className="cond__titulo">
        Trânsito e alertas na Grande São Paulo
      </h2>
      <Transito transito={condicoes.transito} cet={condicoes.cet} />
      <Alertas alertas={condicoes.alertas} cge={condicoes.cge} />
    </section>
  )
}
