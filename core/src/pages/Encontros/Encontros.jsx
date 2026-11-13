import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import { useDados } from '@/context/DadosContext'
import { tituloDaObra, LOCAL_DO_ENCONTRO } from '@/domain/obras'
import { enderecoCompleto } from '@/domain/clientes'
import { hojeISO } from '@/utils/formato'
import './Encontros.css'

const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/* ate quantos dias para tras os que ja aconteceram aparecem */
const DIAS_PASSADOS = 30

function somarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 'Hoje · quinta-feira, 12 nov' */
function rotuloDoDia(dia, hoje) {
  const d = new Date(`${dia}T12:00:00`)
  const nome = `${SEMANA[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`
  if (dia === hoje) return `Hoje · ${nome}`
  if (dia === somarDias(hoje, 1)) return `Amanhã · ${nome}`
  if (dia === somarDias(hoje, -1)) return `Ontem · ${nome}`
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/** As datas agrupadas por dia, na ordem da lista. */
function porDia(lista) {
  const mapa = new Map()
  for (const item of lista) {
    if (!mapa.has(item.dia)) mapa.set(item.dia, [])
    mapa.get(item.dia).push(item)
  }
  return [...mapa.entries()]
}

/**
 * O lugar do encontro de uma data: { texto, mapa } — o endereco do
 * cliente (na obra), a empresa (LWN) ou o endereco escrito (outro lugar).
 * `mapa` e o que vai no atalho do Google Maps (null: sem atalho).
 */
function lugarDoEncontro(h, cliente) {
  if (h.local === 'empresa') return { tipo: 'empresa', texto: '', mapa: null }
  if (h.local === 'outro') return { tipo: 'outro', texto: h.endereco || 'Outro lugar', mapa: h.endereco || null }
  const endereco = enderecoCompleto(cliente)
  return { tipo: 'obra', texto: endereco, mapa: endereco || null }
}

/**
 * PONTO DE ENCONTRO — os horarios dos checks com horario das obras
 * (atualizacao 31; o "Ponto de encontro" do roteiro): em cada data, a
 * hora, a obra, o LOCAL (atualizacao 56: no local da obra, com o endereco
 * do cliente; na empresa; ou o endereco escrito) e quem vai.
 *
 * Uma lista so: os proximos em cima, de hoje para frente, e uma linha
 * separa os que ja aconteceram (os ultimos 30 dias, do mais recente para
 * tras). O horario muda na propria obra, no pop-up do check: o nome da
 * obra abre a tela dela. Os dados ja vem com as obras (a carga do
 * sistema): nao ha chamada propria.
 */
export default function Encontros() {
  const { obras, clientePorId, pessoaPorId, roteiroDaObra, concluida } = useDados()
  const hoje = hojeISO()

  const { proximos, passados } = useMemo(() => {
    const desde = somarDias(hoje, -DIAS_PASSADOS)
    const lista = []
    for (const obra of obras ?? []) {
      const horarios = Object.entries(obra.horarios ?? {})
      if (horarios.length === 0) continue
      /* o titulo do check ("Ponto de encontro"), pelo roteiro da obra */
      const titulos = new Map()
      for (const etapa of roteiroDaObra(obra) ?? []) {
        for (const card of etapa.cards ?? []) {
          for (const check of card.checks ?? []) titulos.set(String(check.id), check.titulo)
        }
      }
      const cliente = clientePorId(obra.clienteId)
      for (const [checkId, datas] of horarios) {
        for (const h of datas) {
          if (h.dia < desde) continue
          lista.push({
            chave: `${obra.id}|${checkId}|${h.dia}`,
            dia: h.dia,
            hora: h.hora,
            obra,
            titulo: titulos.get(String(checkId)) || 'Ponto de encontro',
            nomeDaObra: tituloDaObra(obra, cliente),
            lugar: lugarDoEncontro(h, cliente),
            pessoas: (h.membros ?? []).map((id) => pessoaPorId(id) ?? { id, nome: 'Pessoa' }),
            fechada: concluida(obra),
          })
        }
      }
    }
    const pelaHora = (a, b) => String(a.hora).localeCompare(String(b.hora))
    return {
      proximos: porDia(lista.filter((i) => i.dia >= hoje).sort((a, b) => a.dia.localeCompare(b.dia) || pelaHora(a, b))),
      passados: porDia(lista.filter((i) => i.dia < hoje).sort((a, b) => b.dia.localeCompare(a.dia) || pelaHora(a, b))),
    }
  }, [obras, hoje, clientePorId, pessoaPorId, roteiroDaObra, concluida])

  const contar = (dias) => dias.reduce((n, [, itens]) => n + itens.length, 0)
  const totalProximos = contar(proximos)
  const totalPassados = contar(passados)

  return (
    <AppShell>
      <section className="adm adm--tela">
        <header className="adm__topo">
          <h1 className="tela__titulo">Ponto de encontro</h1>
        </header>

        <div className="adm__barra">
          <span className="adm__total">
            {totalProximos === 1 ? '1 encontro marcado' : `${totalProximos} encontros marcados`} daqui para frente
          </span>
        </div>

        {totalProximos === 0 && (
          <p className="adm__vazio vidro">
            Nenhum ponto de encontro marcado daqui para frente. O horário e o local são marcados na obra, no check
            com horário.
          </p>
        )}
        {totalProximos > 0 && <ListaDeDias dias={proximos} hoje={hoje} />}

        {/* a linha entre os que vem e os que ja foram */}
        <div className="encontros__corte" role="separator" aria-label="Já aconteceram">
          <span>
            Já aconteceram
            <em>{totalPassados === 0 ? 'nenhum' : totalPassados} nos últimos {DIAS_PASSADOS} dias</em>
          </span>
        </div>

        {totalPassados > 0 && <ListaDeDias dias={passados} hoje={hoje} passados />}
      </section>
    </AppShell>
  )
}

function ListaDeDias({ dias, hoje, passados = false }) {
  return (
    <div className={`encontros ${passados ? 'is-passados' : ''}`.trim()}>
      {dias.map(([dia, itens]) => (
        <section key={dia} className="encontros__dia">
          <h2 className={`encontros__data ${dia === hoje ? 'is-hoje' : ''}`.trim()}>{rotuloDoDia(dia, hoje)}</h2>
          <ul className="encontros__lista">
            {itens.map((e) => (
              <li key={e.chave} className="encontros__item">
                <span className="encontros__hora">{e.hora}</span>
                <div className="encontros__corpo">
                  <Link to={e.fechada ? `/app/concluidas/${e.obra.id}` : `/app/obras/${e.obra.id}`} className="encontros__obra">
                    {e.nomeDaObra}
                  </Link>
                  <span className="encontros__check">
                    {e.titulo} · <b data-local={e.lugar.tipo}>{LOCAL_DO_ENCONTRO[e.lugar.tipo]}</b>
                  </span>
                  <Lugar lugar={e.lugar} />
                </div>
                <div className="encontros__pessoas">
                  {e.pessoas.length === 0 ? (
                    <span className="encontros__ninguem">Ninguém escolhido</span>
                  ) : (
                    <>
                      <span className="encontros__avatares">
                        {e.pessoas.slice(0, 5).map((p) => (
                          <Avatar key={p.id} nome={p.nome} foto={p.foto} tamanho={28} titulo={p.nome} />
                        ))}
                        {e.pessoas.length > 5 && <span className="encontros__mais">+{e.pessoas.length - 5}</span>}
                      </span>
                      <span className="encontros__nomes">{e.pessoas.map((p) => p.nome).join(', ')}</span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

const Alfinete = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
)

function Lugar({ lugar }) {
  if (lugar.mapa) {
    return (
      <a
        className="encontros__local"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar.mapa)}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir o endereço no mapa"
      >
        <Alfinete />
        {lugar.texto}
      </a>
    )
  }
  if (lugar.tipo === 'obra') return <span className="encontros__local is-vazio">Sem endereço no cadastro do cliente</span>
  /* na empresa: o rotulo de cima ja diz tudo */
  if (lugar.tipo === 'empresa') return null
  return (
    <span className="encontros__local is-texto">
      <Alfinete />
      {lugar.texto}
    </span>
  )
}
