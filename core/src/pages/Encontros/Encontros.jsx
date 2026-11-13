import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import { useDados } from '@/context/DadosContext'
import { tituloDaObra } from '@/domain/obras'
import { enderecoCompleto } from '@/domain/clientes'
import { hojeISO } from '@/utils/formato'
import './Encontros.css'

const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

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

const PERIODOS = [
  { id: 'proximos', rotulo: 'Próximos' },
  { id: 'anteriores', rotulo: 'Últimos 30 dias' },
]

/**
 * PONTOS DE ENCONTRO — os horarios dos checks com horario das obras
 * (atualizacao 31; o "Ponto de encontro" do roteiro): em cada data, a
 * hora, a obra, o local (o endereco do cliente, com o atalho do mapa) e
 * quem vai. Por dia, dos proximos para frente (ou os ultimos 30 dias).
 * O horario muda na propria obra, no pop-up do check: o nome da obra abre
 * a tela dela. Os dados ja vem com as obras (a carga do sistema): nao ha
 * chamada propria.
 */
export default function Encontros() {
  const { obras, clientePorId, pessoaPorId, roteiroDaObra, concluida } = useDados()
  const [periodo, setPeriodo] = useState('proximos')
  const hoje = hojeISO()

  const dias = useMemo(() => {
    const desde = somarDias(hoje, -30)
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
          const vale = periodo === 'proximos' ? h.dia >= hoje : h.dia < hoje && h.dia >= desde
          if (!vale) continue
          lista.push({
            chave: `${obra.id}|${checkId}|${h.dia}`,
            dia: h.dia,
            hora: h.hora,
            obra,
            titulo: titulos.get(String(checkId)) || 'Ponto de encontro',
            nomeDaObra: tituloDaObra(obra, cliente),
            endereco: enderecoCompleto(cliente),
            pessoas: (h.membros ?? []).map((id) => pessoaPorId(id) ?? { id, nome: 'Pessoa' }),
            fechada: concluida(obra),
          })
        }
      }
    }
    const proximos = periodo === 'proximos'
    lista.sort((a, b) =>
      proximos
        ? a.dia.localeCompare(b.dia) || String(a.hora).localeCompare(String(b.hora))
        : b.dia.localeCompare(a.dia) || String(a.hora).localeCompare(String(b.hora)),
    )
    const porDia = new Map()
    for (const item of lista) {
      if (!porDia.has(item.dia)) porDia.set(item.dia, [])
      porDia.get(item.dia).push(item)
    }
    return [...porDia.entries()]
  }, [obras, periodo, hoje, clientePorId, pessoaPorId, roteiroDaObra, concluida])

  const total = dias.reduce((n, [, itens]) => n + itens.length, 0)

  return (
    <AppShell>
      <section className="adm adm--tela">
        <header className="adm__topo">
          <h1 className="tela__titulo">Pontos de encontro</h1>
        </header>

        <div className="adm__barra">
          <div className="adm__filtros" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip ${periodo === p.id ? 'is-atual' : ''}`.trim()}
                aria-pressed={periodo === p.id}
                onClick={() => setPeriodo(p.id)}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
          <span className="adm__total">{total === 1 ? '1 encontro' : `${total} encontros`}</span>
        </div>

        {dias.length === 0 ? (
          <p className="adm__vazio vidro">
            {periodo === 'proximos'
              ? 'Nenhum ponto de encontro marcado daqui para frente. O horário é marcado na obra, no check com horário.'
              : 'Nenhum ponto de encontro nos últimos 30 dias.'}
          </p>
        ) : (
          <div className="encontros">
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
                        <span className="encontros__check">{e.titulo}</span>
                        {e.endereco ? (
                          <a
                            className="encontros__local"
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.endereco)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir o endereço no mapa"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
                              <circle cx="12" cy="10" r="2.4" />
                            </svg>
                            {e.endereco}
                          </a>
                        ) : (
                          <span className="encontros__local is-vazio">Sem endereço no cadastro do cliente</span>
                        )}
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
        )}
      </section>
    </AppShell>
  )
}
