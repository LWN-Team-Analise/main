import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import { useDados } from '@/context/DadosContext'
import { carregarVeiculos } from '@/services/frotasService'
import { hojeISO } from '@/utils/formato'
import { resumoDaFrota } from './frota'
import './Administrativo.css'

const traco = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }

/* os icones dos cards, os mesmos do menu da area */
const ICONES = {
  reembolso: (
    <svg viewBox="0 0 24 24" width="26" height="26" {...traco}>
      <path d="M6 3.5h12v17l-2.4-1.5-2.4 1.5-2.4-1.5-2.4 1.5L6 20.5z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </svg>
  ),
  ponto: (
    <svg viewBox="0 0 24 24" width="26" height="26" {...traco}>
      <path d="M13 20.5H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5h9A1.5 1.5 0 0 1 16.5 5v4" />
      <path d="M8 8h5M8 11.5h3" />
      <circle cx="16.5" cy="16.5" r="4.5" />
      <path d="M16.5 14.2v2.3l1.6 1" />
    </svg>
  ),
  encontros: (
    <svg viewBox="0 0 24 24" width="26" height="26" {...traco}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  ),
  frotas: (
    <svg viewBox="0 0 24 24" width="26" height="26" {...traco}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  ),
  turnos: (
    <svg viewBox="0 0 24 24" width="26" height="26" {...traco}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M7 13.2h5M7 16.6h7.5M14.5 13.2h2.5" />
    </svg>
  ),
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

/**
 * ADMINISTRATIVO — o inicio da area administrativa (era a aba Ponto).
 *
 * Em vez de abrir uma tela direto, mostra os cards do que ha na area, e
 * cada um abre a sua tela (o menu da esquerda, trocado pelo da area, leva
 * aos mesmos lugares). Cada pessoa ve so os cards que a permissao dela
 * abre — o Ponto e de todo mundo (a propria folha). Alguns cards trazem o
 * numero do momento: os encontros de hoje e da semana, os carros em uso e
 * os que voltaram pedindo atencao.
 */
export default function Administrativo() {
  const { pode, obras } = useDados()
  const [frota, setFrota] = useState(null)
  const veFrotas = pode('ver_frotas')

  useEffect(() => {
    if (!veFrotas) return undefined
    let vivo = true
    carregarVeiculos()
      .then((lista) => vivo && setFrota(resumoDaFrota(lista)))
      .catch(() => vivo && setFrota(null))
    return () => {
      vivo = false
    }
  }, [veFrotas])

  /* os pontos de encontro de hoje e dos proximos 7 dias */
  const encontros = useMemo(() => {
    const hoje = hojeISO()
    const limite = new Date(`${hoje}T12:00:00`)
    limite.setDate(limite.getDate() + 7)
    const ate = limite.toISOString().slice(0, 10)
    let deHoje = 0
    let daSemana = 0
    for (const obra of obras ?? []) {
      for (const lista of Object.values(obra.horarios ?? {})) {
        for (const h of lista) {
          if (h.dia === hoje) deHoje += 1
          if (h.dia >= hoje && h.dia <= ate) daSemana += 1
        }
      }
    }
    return { deHoje, daSemana }
  }, [obras])

  const cards = [
    {
      id: 'reembolso',
      titulo: 'Reembolso',
      descricao: 'Os envios da equipe: despesas, refeições e bônus, por pessoa.',
      rota: '/app/administrativo/reembolso',
      mostra: pode('revisar_despesa_geral'),
    },
    {
      id: 'ponto',
      titulo: 'Ponto',
      descricao: pode('gerenciar_ponto')
        ? 'A folha de ponto de cada funcionário, as assinaturas e a importação.'
        : 'A sua folha de ponto: confira as marcações e assine.',
      rota: '/app/administrativo/ponto',
      mostra: true,
    },
    {
      id: 'encontros',
      titulo: 'Pontos de encontro',
      descricao: 'O horário e o local de encontro de cada obra, e quem vai.',
      rota: '/app/administrativo/encontros',
      mostra: pode('ver_obras'),
      numero:
        encontros.daSemana > 0
          ? `${plural(encontros.deHoje, 'hoje', 'hoje')} · ${plural(encontros.daSemana, 'nos próximos 7 dias', 'nos próximos 7 dias')}`
          : 'Nenhum nos próximos 7 dias',
    },
    {
      id: 'frotas',
      titulo: 'Frotas',
      descricao: 'Os carros em uso e os que voltaram pedindo atenção.',
      rota: '/app/administrativo/frotas',
      mostra: veFrotas,
      numero: frota ? `${plural(frota.emUso.length, 'em uso', 'em uso')} · ${plural(frota.comAtencao.length, 'pede atenção', 'pedem atenção')}` : null,
      alerta: Boolean(frota?.comAtencao.length),
    },
    {
      id: 'turnos',
      titulo: 'Turnos',
      descricao: pode('editar_turnos') ? 'A escala da equipe: veja e edite os turnos daqui.' : 'A escala da equipe.',
      rota: '/app/administrativo/turnos',
      mostra: pode('ver_turnos'),
    },
  ].filter((c) => c.mostra)

  return (
    <AppShell>
      <section className="adm">
        <header className="adm__topo">
          <h1 className="tela__titulo">Administrativo</h1>
        </header>

        <div className="adm__cards">
          {cards.map((c) => (
            <Link key={c.id} to={c.rota} className="adm__card" data-card={c.id}>
              <span className="adm__icone" aria-hidden="true">
                {ICONES[c.id]}
              </span>
              <strong>{c.titulo}</strong>
              <span className="adm__descricao">{c.descricao}</span>
              {c.numero && <span className={`adm__numero ${c.alerta ? 'is-alerta' : ''}`.trim()}>{c.numero}</span>}
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  )
}
