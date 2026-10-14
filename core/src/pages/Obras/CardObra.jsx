import Avatar, { PilhaAvatares } from '@/components/Avatar/Avatar'
import { useDados } from '@/context/DadosContext'
import {
  etapaDeExecucao,
  nomeProprioDaEtapa,
  obraConcluida,
  rotuloPrioridadeObra,
  tituloDaObra,
  tomPrioridadeObra,
} from '@/domain/obras'
import { useTheme } from '@/context/ThemeContext'
import { textoSobre } from '@/utils/cor'
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
 *   verde     obra padrao em dia, ou ainda sem prazo final;
 *   azul      obra de emergencia em dia;
 *   amarelo   o prazo final passou da metade, ou um check passou do
 *             prazo dele (ou vence em ate 3 dias);
 *   laranja   prazo final muito perto;
 *   vermelho  prazo final amanha ou hoje — ou ja vencido, com o selo
 *             "Atrasada".
 *
 * O prazo da EXECUCAO nao entra na cor: so o prazo final da obra.
 *
 * O FIO DA ESQUERDA e outra coisa: a cor da PRIORIDADE (data-pri), a
 * mesma da palavra em "Prioridade: Alta".
 *
 * Quando a cor nao e a de sempre, uma linha diz o PORQUE (o motivo mais
 * urgente; os outros ficam na dica dele).
 *
 *   foto da empresa · proposta - nome · etapa atual   fotos de quem mexeu
 *   [téc] [gq]
 *   motivo da cor
 *   descricao · execucao dos ensaios
 *   prioridade + datas                    "Concluído em"
 *
 * O titulo e "1042/2026 - Acme": o n. da proposta na frente, porque e
 * por ele que a obra e procurada. Obra antiga, sem proposta cadastrada,
 * mostra so o nome do cliente.
 */
export default function CardObra({ obra, cliente, pessoas = [], situacao, aoAbrir }) {
  const {
    corSuaveDoCargo,
    cargoPorChave,
    roteiroDaObra,
    etapaDaObra,
    pendentesDaObra,
    concluida,
    etiquetasDaObra,
    termoEtapa,
    nomeDoCargo,
    execucaoDaObra,
  } = useDados()
  const { isDark } = useTheme()

  const numeroEtapa = etapaDaObra(obra)
  /* o roteiro desta obra, nao o de agora: obra antiga desenha a etapa
     que ela realmente tem */
  const roteiro = roteiroDaObra(obra)
  const etapa = roteiro.find((e) => e.numero === numeroEtapa)
  /* "3ª Etapa" — o rotulo automatico, com a palavra que a empresa
     escolheu. E com ele que o nome da etapa e comparado. */
  const rotuloDaEtapa = `${numeroEtapa}ª ${termoEtapa}`

  /* ---- "Concluído em" ----

     Quando o ULTIMO check da obra e marcado, o trabalho acabou — mesmo
     que ninguem tenha clicado em "Concluir obra" ainda. O card diz
     quando isso aconteceu: e o que faz alguem lembrar de fechar. */
  const tudoMarcado = obraConcluida(roteiro, obra.checks)
  const prontaEm = tudoMarcado
    ? Object.values(obra.checks ?? {})
        .map((m) => m?.feitoEm)
        .filter(Boolean)
        .sort()
        .at(-1)
    : null
  const marcas = etiquetasDaObra(obra)
  const pendentes = pendentesDaObra(obra, numeroEtapa)
  const fechada = concluida(obra)
  const tom = situacao?.tom ?? (obra.tipo === 'emergencia' ? 'emergencia' : 'ok')
  const motivos = situacao?.motivos ?? []

  /* ---- O (!) de "falta o prazo final" ----

     Na EMERGENCIA o prazo e obrigatorio no cadastro, entao ali ele nao
     pode faltar; na obra ja CONCLUIDA o prazo daquela ja passou, e
     piscar sobre registro fechado e ruido. */
  const faltaPrazo = !obra.dataConclusao && !fechada && obra.tipo !== 'emergencia'

  /* a barra de execucao aparece da etapa de execucao em diante — antes
     disso ela seria sempre 0% e so ocuparia lugar */
  const execucao = execucaoDaObra(obra)
  const etapaExec = etapaDeExecucao(roteiro)
  const mostraExecucao =
    execucao !== null &&
    (obra.tipo === 'emergencia' || !etapaExec || numeroEtapa >= etapaExec.numero || execucao.geral > 0)

  const nomeDaEtapa = etapa ? nomeProprioDaEtapa(etapa.nome, rotuloDaEtapa) : ''

  return (
    <button
      type="button"
      className="obracard"
      data-tom={tom}
      data-pri={tomPrioridadeObra(obra)}
      onClick={aoAbrir}
      title={motivos.length > 1 ? motivos.map((m) => textoDoMotivo(m, nomeDoCargo)).join('\n') : undefined}
    >
      <header className="obracard__topo">
        <Avatar nome={cliente?.nome} foto={cliente?.logo} tamanho={26} quadrado className="obracard__logo" />
        <span className="obracard__quem">
          <strong className="obracard__empresa">{tituloDaObra(obra, cliente)}</strong>
          {/* "3ª — execução". O nome so entra quando acrescenta: uma
              etapa chamada "3° Etapa" no roteiro daria "3ª — 3° etapa" */}
          <span className="obracard__etapa">
            {termoEtapa} atual:{' '}
            {fechada || !etapa
              ? 'concluída'
              : [`${etapa.numero}ª`, nomeDaEtapa.toLowerCase()].filter(Boolean).join(' — ')}
          </span>
        </span>

        {/* quem mexeu na obra: no canto de CIMA, a direita */}
        {pessoas.length > 0 && (
          <span className="obracard__rostos">
            <PilhaAvatares pessoas={pessoas} tamanho={24} limite={3} />
          </span>
        )}

        {pendentes.length > 0 && (
          <span className="obracard__setores" title="Setores que ainda devem informação">
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

      {/* o porque da cor, quando ela nao e a de sempre */}
      {motivos.length > 0 && (
        <p className="obracard__motivo">
          {tom === 'vencido' && <span className="obracard__atrasada">Atrasada</span>}
          <span>{textoDoMotivo(motivos[0], nomeDoCargo, tom === 'vencido')}</span>
          {motivos.length > 1 && <em>+{motivos.length - 1}</em>}
        </p>
      )}

      {/* a descricao e opcional: sem ela o card nao abre um vazio no meio */}
      {obra.descricao && <p className="obracard__desc">{obra.descricao}</p>}

      {mostraExecucao && (
        <span className="obracard__exec" title="Execução dos ensaios (média dos ensaios planejados)">
          <span>Execução</span>
          <span className="obracard__barra" role="img" aria-label={`${execucao.geral}% executado`}>
            <span style={{ width: `${execucao.geral}%` }} />
          </span>
          <strong>{execucao.geral}%</strong>
        </span>
      )}

      {marcas.length > 0 && (
        <span className="obracard__etiquetas">
          {marcas.map((e) => (
            <span
              key={e.id}
              className="obracard__etiqueta"
              style={{ background: e.cor, color: textoSobre(e.cor, isDark) }}
            >
              {e.nome}
            </span>
          ))}
        </span>
      )}

      <footer className="obracard__base">
        <span className="obracard__meta">
          {/* a cor vem do data-pri do card, e e a mesma do fio da
              esquerda: vermelho alta, amarelo media, verde baixa, azul
              no "Urgente" da emergencia */}
          <span className="obracard__pri">
            Prioridade: <strong>{rotuloPrioridadeObra(obra)}</strong>
          </span>

          {/* as duas pontas do prazo: o inicio e o prazo final. O prazo
              aparece SEMPRE, mesmo em branco — a falta tem de se ver */}
          <span className="obracard__datas">
            {obra.dataInicio && (
              <span className="obracard__data">
                início: <strong>{dataBR(obra.dataInicio)}</strong>
              </span>
            )}

            {obra.dataConclusao ? (
              <span className="obracard__data">
                prazo final: <strong>{dataBR(obra.dataConclusao)}</strong>
              </span>
            ) : (
              <span className="obracard__data obracard__semprazo">
                prazo final: <strong>sem data</strong>
                {faltaPrazo && (
                  <span
                    className="pendencia pendencia--parada"
                    title="Esta obra está sem prazo final. Abra a obra para preencher."
                    aria-label="Pendente: obra sem prazo final"
                  >
                    !
                  </span>
                )}
              </span>
            )}
          </span>
        </span>

        {prontaEm && (
          <span className="obracard__pronta">
            Concluído em: <strong>{dataHora(prontaEm)}</strong>
          </span>
        )}
      </footer>
    </button>
  )
}
