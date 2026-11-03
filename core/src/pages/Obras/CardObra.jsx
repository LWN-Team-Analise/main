import Avatar, { PilhaAvatares } from '@/components/Avatar/Avatar'
import { useDados } from '@/context/DadosContext'
import { prontaEm as momentoPronta, tituloDaObra, tomPrioridadeObra } from '@/domain/obras'
import { dataBR, dataHora } from '@/utils/formato'
import './CardObra.css'

/** "venceu em 03/10", "vence hoje", "vence em 2 dias". */
function quando(m) {
  if (m.dias < 0) return `venceu em ${dataBR(m.prazo).slice(0, 5)}`
  if (m.dias === 0) return 'vence hoje'
  if (m.dias === 1) return 'vence amanhã'
  return `vence em ${m.dias} dias`
}

/**
 * O motivo da cor, numa linha:
 *   "Atrasada há 2 dias — prazo final 04/10"
 *   "Prazo final vence amanhã"
 *   "Prazo de "Hospedagem" venceu em 03/10 — Administrativo"
 * Os setores no fim sao quem ainda deve naquele check.
 */
function textoDoMotivo(m, nomeDoCargo, comSelo = false) {
  if (m.alvo === 'obra') {
    if (m.dias < 0) {
      /* ao lado do selo "Atrasada" a palavra nao se repete */
      const ha = `há ${-m.dias} dia${m.dias < -1 ? 's' : ''} · prazo final ${dataBR(m.prazo).slice(0, 5)}`
      return comSelo ? ha : `Atrasada ${ha}`
    }
    return `Prazo final ${quando(m)}`
  }
  const quem = m.setores?.length ? ` — ${m.setores.map(nomeDoCargo).join(', ')}` : ''
  return `Prazo de "${m.titulo}" ${quando(m)}${quem}`
}

/**
 * Card da obra no quadro. So o card: os checks moram dentro da obra,
 * que abre no clique.
 *
 * A COR conta como a obra esta (situacaoDaObra, em src/domain/obras.js):
 *
 *   verde     obra padrao em dia;
 *   azul      obra de emergencia em dia;
 *   amarelo   um check passou do prazo dele (ou vence em ate 3 dias).
 *
 * O prazo final da obra nao entra na cor: ele so existe depois que o
 * ultimo check e marcado (e o dia desse check). O da EXECUCAO tambem
 * nao entra.
 *
 * O FIO DA ESQUERDA e outra coisa: a cor da PRIORIDADE (data-pri).
 *
 * O card e so o essencial — o resto mora dentro da obra:
 *
 *   foto da empresa · empresa - proposta        fotos de quem mexeu
 *   [téc] [gq]   os setores que faltam para a etapa avancar
 *
 * A etapa nao aparece: o card ja esta na coluna dela. A descricao, a
 * prioridade, as datas, a execucao e as etiquetas sairam do card. O
 * PORQUE da cor (quando ela nao e a de sempre) e o "Concluído em" (o
 * ultimo check marcado, que lembra de fechar a obra) ficam na dica, ao
 * passar o mouse.
 *
 * O titulo e "1042/2026 - Acme": o n. da proposta na frente, porque e
 * por ele que a obra e procurada. Obra antiga, sem proposta cadastrada,
 * mostra so o nome do cliente.
 */
export default function CardObra({ obra, cliente, pessoas = [], situacao, aoAbrir }) {
  const { corSuaveDoCargo, cargoPorChave, roteiroDaObra, etapaDaObra, pendentesDaObra, nomeDoCargo } = useDados()

  const numeroEtapa = etapaDaObra(obra)
  /* "Concluído em": quando o ULTIMO check da obra e marcado, o trabalho
     acabou — mesmo que ninguem tenha clicado em "Concluir obra" ainda.
     Fica na dica do card: e o que faz alguem lembrar de fechar */
  const prontaEm = momentoPronta(roteiroDaObra(obra), obra)
  const pendentes = pendentesDaObra(obra, numeroEtapa)
  const tom = situacao?.tom ?? (obra.tipo === 'emergencia' ? 'emergencia' : 'ok')
  const motivos = situacao?.motivos ?? []
  const dica = [
    ...motivos.map((m) => textoDoMotivo(m, nomeDoCargo)),
    prontaEm ? `Concluído em: ${dataHora(prontaEm)}` : null,
  ].filter(Boolean)

  return (
    <button
      type="button"
      className="obracard"
      data-tom={tom}
      data-pri={tomPrioridadeObra(obra)}
      onClick={aoAbrir}
      title={dica.length ? dica.join('\n') : undefined}
    >
      <header className="obracard__topo">
        <Avatar nome={cliente?.nome} foto={cliente?.logo} tamanho={26} quadrado className="obracard__logo" />
        <span className="obracard__quem">
          <strong className="obracard__empresa">{tituloDaObra(obra, cliente)}</strong>
        </span>

        {/* quem mexeu na obra: no canto de CIMA, a direita */}
        {pessoas.length > 0 && (
          <span className="obracard__rostos">
            <PilhaAvatares pessoas={pessoas} tamanho={24} limite={3} />
          </span>
        )}

        {pendentes.length > 0 && (
          <span className="obracard__setores" title="Setores que faltam para a etapa avançar">
            {pendentes.map((s) => (
              <span
                key={s}
                className="obracard__setor"
                style={{ '--setor-cor': corSuaveDoCargo(s) }}
              >
                {cargoPorChave(s)?.curto ?? s.slice(0, 3)}
              </span>
            ))}
          </span>
        )}
      </header>
    </button>
  )
}
