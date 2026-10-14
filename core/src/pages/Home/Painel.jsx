import { useMemo, useState } from 'react'
import { useDados } from '@/context/DadosContext'
import { chaveDoCargo, checksExigidos, diasAte, progressoDaObra, situacaoDaObra } from '@/domain/obras'
import { hojeISO } from '@/utils/formato'
import { Colunas, Linha, Rosca } from './graficos'
import PainelDespesas from './PainelDespesas'
import Tile from './Tile'
import {
  diasEntre,
  emTempo,
  etapaDeCampo,
  horasEntre,
  media,
  mesDoCarimbo,
  soDia,
  tempoEmCampo,
} from './tempo'

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/**
 * O Dashboard da pagina inicial.
 *
 * Ele responde as perguntas que a lista de tarefas nao responde, e
 * que so aparecem quando se olha o historico inteiro:
 *
 *   1. quanto tempo uma obra leva do inicio ate ser concluida — e
 *      quanto desse tempo ela passa EM CAMPO (a etapa de execucao);
 *   2. quanto tempo cada setor (ou cada pessoa) leva para dar a sua
 *      resposta dentro da obra;
 *   3. o quanto as obras chegam antes ou depois do prazo combinado;
 *   4. quanto a empresa gastou em despesas, refeicoes e bonus
 *      (PainelDespesas.jsx).
 *
 * O Dashboard e de quem tem `ver_dashboard`; a aba nem aparece para
 * os outros (Home.jsx).
 *
 * Tudo sai do que ja esta gravado — nao ha coluna nova, nem cronometro,
 * nem ninguem apontando hora. Os numeros vem de tres carimbos que o
 * sistema ja fazia: `obra.data_inicio`, `obra.concluida_em` e o
 * `feito_em` de cada check.
 *
 * O painel olha a EMPRESA INTEIRA, e nao so o setor de quem esta
 * vendo: uma media de uma pessoa so nao e media de nada.
 */
export default function Painel({ mes, passo = 'mes' }) {
  const { obras, equipe, concluida, roteiro, roteiroDaObra, clientePorId, nomeDoCargo, corDoCargo } =
    useDados()

  /* o grafico de resposta troca de eixo: por setor ou por pessoa */
  const [eixo, setEixo] = useState('setor')


  /**
   * O mes escolhido nas setas do topo, como 'AAAA-MM'.
   *
   * Ele recorta o HISTORICO: as obras concluidas naquele mes e as
   * marcacoes feitas nele. O que ele NAO recorta e a foto do agora —
   * "obras em andamento" e quantas estao abertas neste instante, e
   * nao quantas estavam abertas em marco. Essa e a unica caixa do
   * painel que ignora as setas, e o rodape dela diz isso.
   */
  const noMes = (carimbo) => mesDoCarimbo(carimbo) === mes.chave

  /**
   * Os seis meses que os graficos de linha desenham, terminando no mes
   * escolhido nas setas.
   *
   * As setas deixam de recortar so um mes e passam a DESLIZAR a
   * janela: uma linha precisa de mais de um ponto para dizer se a
   * coisa esta melhorando, que e a unica pergunta que linha responde.
   * Os cartoes que nao sao linha (a rosca, os numeros de cima)
   * continuam olhando so o mes escolhido.
   */
  /**
   * As colunas do painel — e o que cada uma significa.
   *
   * No passo MENSAL são os dias do mês escolhido: o mês corrente vai
   * até hoje (dia que ainda não chegou não é dado, é espaço vazio) e
   * um mês passado vai até o último dia dele.
   *
   * No passo ANUAL são os meses de janeiro até o mês escolhido. Não
   * é o ano inteiro de propósito: dezembro em março seria uma fileira
   * de nada no fim do gráfico.
   */
  const fatias = useMemo(() => {
    const doisDigitos = (n) => String(n).padStart(2, '0')

    if (passo === 'ano') {
      return Array.from({ length: mes.mes + 1 }, (_, i) => `${mes.ano}-${doisDigitos(i + 1)}`)
    }

    const ultimo = mes.atual
      ? new Date().getDate()
      : new Date(mes.ano, mes.mes + 1, 0).getDate()
    return Array.from(
      { length: ultimo },
      (_, i) => `${mes.ano}-${doisDigitos(mes.mes + 1)}-${doisDigitos(i + 1)}`,
    )
  }, [passo, mes.ano, mes.mes, mes.atual])
  /** 'AAAA-MM' -> 'set/26', que e o que cabe embaixo de um ponto. */
  const rotuloMes = (chave) => {
    const [ano, m] = chave.split('-')
    return `${MESES_CURTOS[Number(m) - 1]}/${ano.slice(2)}`
  }

  /* 'AAAA-MM-DD' -> '11'. Só o número do dia: o mês já está na seta
     em cima, e repeti-lo trinta vezes embaixo do gráfico é ruído.
     Quem decide se algum rótulo precisa ser pulado é o gráfico, que
     sabe a largura que tem. */
  const rotuloDia = (chave) => chave.slice(8)

  /** o rótulo certo para o passo em vigor */
  const rotuloDaFatia = (chave, i) =>
    passo === 'ano' ? rotuloMes(chave) : rotuloDia(chave, i)

  /** a chave do carimbo no passo em vigor: o mês ou o dia.
      Os dois passam por `soDia`, que nivela timestamp e data no
      calendário LOCAL — sem ele, uma marcação da noite cairia no dia
      seguinte por causa do fuso. */
  const fatiaDoCarimbo = (carimbo) =>
    passo === 'ano' ? mesDoCarimbo(carimbo) : soDia(carimbo)

  const fechadas = useMemo(
    () => obras.filter((o) => concluida(o) && noMes(o.concluidaEm)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obras, concluida, mes.chave],
  )
  const abertas = useMemo(() => obras.filter((o) => !concluida(o)), [obras, concluida])

  /* ---------------------------------------------------------
     1. Quanto tempo uma obra leva

     Do INICIO ate a conclusao. O inicio e `dataInicio` quando ela
     tem; sem ela, a data em que a obra foi cadastrada — que e o
     primeiro instante em que ela existiu para a empresa.
     --------------------------------------------------------- */
  const duracoes = useMemo(
    () =>
      fechadas
        .map((o) => ({
          obra: o,
          nome: [o.proposta, clientePorId(o.clienteId)?.nome].filter(Boolean).join(' — ') || 'Obra',
          dias: diasEntre(o.dataInicio ?? o.criadoEm, o.concluidaEm),
          fim: o.concluidaEm,
        }))
        .filter((d) => d.dias !== null && d.dias >= 0)
        /* em ordem cronologica: o grafico de colunas e uma linha do
           tempo, e linha do tempo que anda para tras nao se le */
        .sort((a, b) => String(a.fim).localeCompare(String(b.fim))),
    [fechadas, clientePorId],
  )

  const duracaoMedia = media(duracoes.map((d) => d.dias))

  /* ---------------------------------------------------------
     1b. Tempo medio de obra EM CAMPO

     Quanto a obra fica na etapa de execucao: de quando ela abre (a
     anterior fechou) ate o ultimo check dela ser marcado. A conta e a
     linha do tempo de tempo.js — a mesma da planilha do Power BI.

     Cada obra cai na coluna do dia (ou mes) em que a execucao FECHOU,
     e a coluna e a media das que fecharam ali. Obra aberta tambem
     entra: o que se mede e a etapa, e uma obra que ja saiu de campo
     mas ainda nao foi entregue ja tem esse tempo.

     Coluna sem obra fica VAZIA, e nao zero: zero diria "a obra ficou
     zero dia em campo", quando o que houve foi nenhuma obra.
     --------------------------------------------------------- */
  const etapaCampo = useMemo(() => etapaDeCampo(roteiro), [roteiro])

  const emCampo = useMemo(
    () =>
      obras
        .map((o) => {
          const medida = tempoEmCampo(o, roteiroDaObra(o))
          if (!medida) return null
          return { obra: o, dias: medida.dias, fechou: medida.fechou }
        })
        .filter(Boolean),
    [obras, roteiroDaObra],
  )

  const campo = useMemo(() => {
    const naJanela = emCampo.filter((c) => fatias.includes(fatiaDoCarimbo(c.fechou)))
    const itens = fatias.map((chave, i) => {
      const daqui = naJanela.filter((c) => fatiaDoCarimbo(c.fechou) === chave)
      const valor = media(daqui.map((c) => c.dias))
      const nomes = daqui.map((c) => c.obra.proposta || clientePorId(c.obra.clienteId)?.nome || 'obra')
      /* dias com uma casa ("2,5"); a unidade o grafico poe junto */
      const redondo = valor === null ? null : Math.round(valor * 10) / 10
      return {
        chave,
        rotulo: rotuloDaFatia(chave, i),
        valor: redondo,
        texto: redondo === null ? 'nenhuma obra saiu de campo' : String(redondo).replace('.', ','),
        nota: daqui.length > 0 ? `${daqui.length} obra${daqui.length > 1 ? 's' : ''}: ${nomes.join(', ')}` : undefined,
      }
    })
    return {
      itens,
      media: media(naJanela.map((c) => c.dias)),
      total: naJanela.length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emCampo, fatias, passo, clientePorId])

  /* ---------------------------------------------------------
     2. Tempo de resposta por setor / por pessoa

     Nao ha "inicio da tarefa" gravado em lugar nenhum — so o
     instante em que ela foi MARCADA. Entao o que da para medir, e o
     que este grafico mede, e o intervalo entre uma marcacao e a
     seguinte DENTRO DA MESMA OBRA: quanto tempo a obra ficou parada
     esperando aquele check depois que o anterior saiu.

     A primeira marcacao de cada obra conta a partir do inicio dela.

     Quem leva o credito e QUEM MARCOU (`feitoPor`), e nao o setor
     dono do check no roteiro: numa emergencia qualquer um pode
     marcar, e atribuir o tempo a quem nao encostou na obra seria
     inventar numero.
     --------------------------------------------------------- */
  const resposta = useMemo(() => {
    const porPessoa = {}
    const porSetor = {}

    obras.forEach((obra) => {
      const roteiro = roteiroDaObra(obra)
      const todos = roteiro.flatMap((e) => e.cards.flatMap((c) => c.checks ?? []))

      const marcadas = todos
        .map((check) => obra.checks?.[check.id])
        .filter((m) => m?.feitoEm)
        .sort((a, b) => String(a.feitoEm).localeCompare(String(b.feitoEm)))

      let marco = obra.dataInicio ?? obra.criadoEm

      marcadas.forEach((m) => {
        const horas = horasEntre(marco, m.feitoEm)
        marco = m.feitoEm
        /* carimbo fora de ordem (importacao antiga) nao entra: um
           numero negativo aqui viraria uma media que mente */
        if (horas === null || horas < 0) return
        if (!m.feitoPor) return

        /* o intervalo e calculado sobre a obra INTEIRA — pular as
           marcacoes de fora da janela aqui daria distancias erradas.
           O que o mes decide e em qual COLUNA do grafico o intervalo
           cai, e nao se ele existe. */
        const quando = fatiaDoCarimbo(m.feitoEm)
        if (!fatias.includes(quando)) return

        const dias = horas / 24
        const pessoa = String(m.feitoPor)
        ;((porPessoa[pessoa] ??= {})[quando] ??= []).push(dias)

        const setor = chaveDoCargo(equipe.find((p) => String(p.id) === pessoa))
        if (setor) ((porSetor[setor] ??= {})[quando] ??= []).push(dias)
      })
    })

    /* uma SERIE por setor (ou por pessoa), com um ponto por mes da
       janela. Mes sem marcacao vira null, e nao zero: zero diria "o
       setor respondeu na hora", quando o que houve foi nada */
    const monta = (mapa, resolve) =>
      Object.entries(mapa)
        .map(([chave, porMes]) => ({
          chave,
          ...resolve(chave),
          pontos: fatias.map((f) => (porMes[f] ? media(porMes[f]) : null)),
          texto: (v) => emTempo(v),
          /* ordena pela media geral: a serie mais lenta vem primeiro na
             legenda, que e por onde se comeca a ler */
          peso: media(Object.values(porMes).flat()) ?? 0,
        }))
        .sort((a, b) => b.peso - a.peso)

    return {
      setor: monta(porSetor, (c) => ({ rotulo: nomeDoCargo(c), cor: corDoCargo(c) })),
      pessoa: monta(porPessoa, (id) => {
        const p = equipe.find((x) => String(x.id) === id)
        return {
          rotulo: p?.nome ?? 'Usuário removido',
          cor: corDoCargo(chaveDoCargo(p)),
        }
      }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obras, roteiroDaObra, equipe, nomeDoCargo, corDoCargo, mes.chave, passo, fatias])

  const lista = resposta[eixo] ?? []

  /* ---------------------------------------------------------
     3. Atraso e adiantamento

     A unica das tres que compara o combinado com o acontecido:
     `dataConclusao` e a data prometida, `concluidaEm` e a real.

     Positivo = entregou depois. Negativo = entregou antes.

     Obra sem data de conclusao combinada fica de fora — nao da para
     estar atrasado em relacao a um prazo que nunca existiu.
     --------------------------------------------------------- */
  const desvios = useMemo(
    () =>
      fechadas
        .filter((o) => o.dataConclusao)
        .map((o) => {
          const dias = diasEntre(o.dataConclusao, o.concluidaEm)
          return {
            chave: o.id,
            rotulo:
              [o.proposta, clientePorId(o.clienteId)?.nome].filter(Boolean).join(' — ') || 'Obra',
            /* o eixo da linha e curto por obrigacao — cabe a proposta e
               mais nada. O nome inteiro fica para a dica. */
            curto: o.proposta || 'obra',
            fim: o.concluidaEm,
            valor: dias,
            texto: dias === 0 ? 'no dia' : `${dias > 0 ? '+' : '−'}${emTempo(dias)}`,
          }
        })
        .filter((d) => d.valor !== null)
        .sort((a, b) => b.valor - a.valor),
    [fechadas, clientePorId],
  )

  /* As duas metades, cada uma ja pronta para um grafico de barras: o
     valor vai em MODULO, porque a barra so cresce para um lado e o
     titulo do cartao ja diz de que lado ela e.

     "No dia" (desvio zero) conta como no prazo na rosca, mas nao entra
     em Adiantamento: entregar no dia combinado nao e chegar antes. */
  const atrasadas = desvios
    .filter((d) => d.valor > 0)
    .map((d) => ({ ...d, texto: emTempo(d.valor) }))
    .sort((a, b) => b.valor - a.valor)

  const adiantadas = desvios
    .filter((d) => d.valor < 0)
    .map((d) => ({ ...d, valor: -d.valor, texto: emTempo(-d.valor) }))
    .sort((a, b) => b.valor - a.valor)

  /* as duas listas viram SERIE: um ponto por obra, na ordem em que
     elas foram concluidas. E a ordem que faz a linha dizer alguma
     coisa — ordenada por tamanho do atraso, a linha so desceria */
  const serieDeDesvio = (itens, cor, rotulo) => {
    const ordenadas = [...itens].sort((a, b) => String(a.fim).localeCompare(String(b.fim)))
    return {
      eixoX: ordenadas.map((d) => d.curto),
      series: [
        {
          chave: rotulo,
          rotulo,
          cor,
          pontos: ordenadas.map((d) => d.valor),
          texto: (v) => emTempo(v),
        },
      ],
    }
  }

  const noPrazo = desvios.filter((d) => d.valor <= 0)
  const noDia = desvios.filter((d) => d.valor === 0)
  const desvioMedio = media(desvios.map((d) => d.valor))

  /* ---------------------------------------------------------
     3b. As obras EM ANDAMENTO: adiantadas, no prazo ou atrasadas

     A foto de agora (como "Obras em andamento", ignora as setas):

       atrasada   algum prazo ja venceu — o prazo final, o de uma
                  etapa ou o de um check (os mesmos de situacaoDaObra,
                  que pinta o card do quadro);
       adiantada  o que ja foi feito (checks marcados) esta pelo menos
                  ADIANTE_PP pontos a frente do tempo que ja passou
                  entre o inicio e o prazo final;
       no prazo   o resto que tem prazo final;
       sem prazo  obra sem prazo final — nao da para dizer.
     --------------------------------------------------------- */
  const andamento = useMemo(() => {
    const ADIANTE_PP = 10
    const hoje = hojeISO()
    const grupos = { adiantadas: [], noPrazo: [], atrasadas: [], semPrazo: [] }
    abertas.forEach((obra) => {
      const roteiroObra = roteiroDaObra(obra)
      const situacao = situacaoDaObra(roteiroObra, obra, hoje)
      const item = {
        obra,
        nome: [obra.proposta, clientePorId(obra.clienteId)?.nome].filter(Boolean).join(' — ') || 'Obra',
      }
      const vencido = situacao.motivos.find((m) => m.venceu)
      if (vencido) {
        grupos.atrasadas.push({ ...item, dias: -vencido.dias })
        return
      }
      if (!obra.dataConclusao) {
        grupos.semPrazo.push(item)
        return
      }
      const inicio = obra.dataInicio ?? String(obra.criadoEm ?? '').slice(0, 10)
      const total = diasAte(obra.dataConclusao, inicio)
      const passou = diasAte(hoje, inicio)
      const tempo = total > 0 ? Math.min(100, Math.max(0, (passou / total) * 100)) : 100
      const feito = progressoDaObra(roteiroObra, obra.checks)
      if (feito >= tempo + ADIANTE_PP) grupos.adiantadas.push(item)
      else grupos.noPrazo.push(item)
    })
    grupos.atrasadas.sort((a, b) => b.dias - a.dias)
    return grupos
  }, [abertas, roteiroDaObra, clientePorId])

  /* quantos checks a empresa tem em aberto agora — o contexto dos
     numeros de cima, para uma media de 3 obras nao parecer um censo */
  const checksAbertos = useMemo(
    () =>
      abertas.reduce((total, obra) => {
        const todos = roteiroDaObra(obra).flatMap((e) => e.cards.flatMap(checksExigidos))
        return total + todos.filter((c) => !obra.checks?.[c.id]).length
      }, 0),
    [abertas, roteiroDaObra],
  )


  return (
    <PainelVista
      eixo={eixo}
      setEixo={setEixo}
      lista={lista}
      eixoMeses={fatias.map(rotuloDaFatia)}
      passo={passo}
      campo={campo}
      etapaCampo={etapaCampo}
      fatias={fatias}
      rotuloDaFatia={rotuloDaFatia}
      atrasoLinha={serieDeDesvio(atrasadas, 'var(--gr-ruim)', 'Atraso')}
      adiantoLinha={serieDeDesvio(adiantadas, 'var(--gr-bom)', 'Adiantamento')}
      desvios={desvios}
      noPrazo={noPrazo}
      noDia={noDia}
      andamento={andamento}
      atrasadas={atrasadas}
      adiantadas={adiantadas}
      duracaoMedia={duracaoMedia}
      desvioMedio={desvioMedio}
      abertas={abertas.length}
      checksAbertos={checksAbertos}
      totalConcluidas={duracoes.length}
    />
  )
}

/**
 * O desenho do painel, sem conta nenhuma.
 *
 * Separado do componente de cima de proposito: tudo o que esta acima
 * depende do banco, e tudo o que esta aqui depende so de numeros ja
 * prontos.
 */
export function PainelVista({
  eixo,
  setEixo,
  lista,
  eixoMeses,
  passo,
  campo,
  etapaCampo,
  fatias,
  rotuloDaFatia,
  atrasoLinha,
  adiantoLinha,
  desvios,
  noPrazo,
  noDia,
  andamento,
  atrasadas,
  adiantadas,
  duracaoMedia,
  desvioMedio,
  abertas,
  checksAbertos,
  totalConcluidas,
}) {
  return (
    <div className="dash">
      {/* ---------------- os numeros de cima ---------------- */}
      <div className="dash__tiles">
        <Tile
          rotulo="Duração média da obra"
          valor={emTempo(duracaoMedia)}
          nota={
            totalConcluidas === 0
              ? 'nenhuma obra concluída ainda'
              : `média de ${totalConcluidas} obra${totalConcluidas > 1 ? 's' : ''} concluída${
                  totalConcluidas > 1 ? 's' : ''
                }`
          }
        />
        <Tile
          /* A CAIXA TROCA DE ASSUNTO em vez de mostrar numero
             negativo. "Desvio médio: −3 dias" obriga a lembrar de que
             lado o sinal cai antes de saber se a noticia e boa; com o
             rotulo dizendo "Adiantamento médio" e o numero sempre
             positivo, a leitura acaba no titulo. */
          rotulo={
            desvioMedio === null || desvioMedio === 0
              ? 'Prazo das entregas'
              : desvioMedio > 0
                ? 'Atraso médio do prazo'
                : 'Adiantamento médio'
          }
          valor={
            desvioMedio === null
              ? '—'
              : desvioMedio === 0
                ? 'no prazo'
                : emTempo(Math.abs(desvioMedio))
          }
          tom={desvioMedio === null ? undefined : desvioMedio > 0 ? 'ruim' : 'bom'}
          nota={
            desvios.length === 0
              ? 'nenhuma obra com prazo combinado'
              : desvioMedio > 0
                ? 'em média, depois do combinado'
                : desvioMedio < 0
                  ? 'em média, antes do combinado'
                  : 'em média, no dia combinado'
          }
        />
        <Tile
          rotulo="Obras em andamento"
          valor={String(abertas)}
          /* a única caixa que ignora as setas: é a foto de AGORA */
          nota={`${checksAbertos} check${checksAbertos === 1 ? '' : 's'} em aberto · hoje`}
        />
        <Tile
          rotulo="Tempo de resposta médio"
          /* a media de TODOS os pontos de TODAS as series — a serie
             agora e um ponto por mes, e nao um numero so por setor.
             Mes sem marcacao e `null` e fica de fora: entrasse como
             zero, ele puxaria a media para baixo dizendo que o setor
             respondeu na hora num mes em que nao houve nada. */
          valor={emTempo(
            media(lista.flatMap((s) => s.pontos.filter((v) => v !== null && v !== undefined))),
          )}
          nota={
            lista.length === 0
              ? 'nenhum check marcado ainda'
              : `entre ${lista.length} ${eixo === 'setor' ? 'setores' : 'pessoas'} · ${
                  passo === 'ano' ? 'no ano' : 'no mês, dia a dia'
                }`
          }
        />
      </div>

      {/* ---------------- os graficos, no mosaico ----------------

          A ordem e a de leitura, e começa pelo que mais se pergunta:

            1. ATRASO E ADIANTAMENTO — as obras estao adiantadas, no
               prazo ou atrasadas? O resumo e os dois cartoes;
            2. TEMPO DE RESPOSTA — quanto cada setor demora;
            3. ENTREGAS NO PRAZO — a rosca;
            4. o tempo em campo, obra a obra.

          Quem iguala a altura dos vizinhos de linha e o CSS. */}
      <div className="dash__grade">
        <section className="cartao vidro">
          <header className="cartao__topo">
            <div>
              <h2 className="cartao__titulo">Atraso e adiantamento</h2>
              <p className="cartao__sub">
                As obras em andamento hoje e as concluídas no mês:
                adiantadas, no prazo ou atrasadas.
              </p>
            </div>
          </header>

          <div className="situacoes">
            <div className="situacoes__grupo">
              <span className="situacoes__nome">Em andamento · hoje</span>
              <div className="situacoes__linha">
                <Situacao tom="bom" rotulo="Adiantadas" valor={andamento.adiantadas.length} />
                <Situacao tom="ok" rotulo="No prazo" valor={andamento.noPrazo.length} />
                <Situacao tom="ruim" rotulo="Atrasadas" valor={andamento.atrasadas.length} />
                {andamento.semPrazo.length > 0 && (
                  <Situacao tom="nada" rotulo="Sem prazo final" valor={andamento.semPrazo.length} />
                )}
              </div>
              {andamento.atrasadas.length > 0 && (
                <ul className="situacoes__lista">
                  {andamento.atrasadas.slice(0, 5).map((a) => (
                    <li key={a.obra.id}>
                      <span>{a.nome}</span>
                      <em>
                        {a.dias <= 0 ? 'vence hoje' : `há ${emTempo(a.dias)}`}
                      </em>
                    </li>
                  ))}
                  {andamento.atrasadas.length > 5 && (
                    <li className="situacoes__mais">
                      e mais {andamento.atrasadas.length - 5}
                    </li>
                  )}
                </ul>
              )}
            </div>

            <div className="situacoes__grupo">
              <span className="situacoes__nome">
                Concluídas no mês · com prazo combinado
              </span>
              <div className="situacoes__linha">
                <Situacao tom="bom" rotulo="Adiantadas" valor={adiantadas.length} />
                <Situacao tom="ok" rotulo="No dia" valor={noDia.length} />
                <Situacao tom="ruim" rotulo="Atrasadas" valor={atrasadas.length} />
              </div>
            </div>
          </div>
        </section>

        {/* ---- Atraso e adiantamento, em DOIS cartoes ----

            Eram um so, com o zero no meio e as barras saindo para os
            dois lados. Um grafico divergente responde "de que lado a
            empresa esta" — mas nao responde "quais obras atrasaram",
            que e a pergunta que se faz olhando esta tela: as
            atrasadas ficavam misturadas com as adiantadas, separadas
            so pela cor e pelo lado.

            Separados, cada cartao e uma lista ordenada da pior para a
            melhor, e o titulo ja diz do que ela trata. */}
        <section className="cartao cartao--metade vidro">
          <header className="cartao__topo">
            <div>
              <h2 className="cartao__titulo">Atraso</h2>
            </div>
            <span className="cartao__selo" data-tom="ruim">
              {atrasadas.length}
            </span>
          </header>

          <div className="cartao__corpo">
            {atrasadas.length === 0 ? (
              <p className="cartao__vazio">Nenhuma obra passou do prazo combinado.</p>
            ) : (
              <Linha
                series={atrasoLinha.series}
                eixoX={atrasoLinha.eixoX}
                unidade="dias"
                alturaTotal={220}
              />
            )}
          </div>
        </section>

        <section className="cartao cartao--metade vidro">
          <header className="cartao__topo">
            <div>
              <h2 className="cartao__titulo">Adiantamento</h2>
            </div>
            <span className="cartao__selo" data-tom="bom">
              {adiantadas.length}
            </span>
          </header>

          <div className="cartao__corpo">
            {adiantadas.length === 0 ? (
              <p className="cartao__vazio">Nenhuma obra chegou antes do prazo combinado.</p>
            ) : (
              <Linha
                series={adiantoLinha.series}
                eixoX={adiantoLinha.eixoX}
                unidade="dias"
                alturaTotal={220}
              />
            )}
          </div>
        </section>

        <section className="cartao cartao--largo vidro">
          <header className="cartao__topo">
            <div>
              <h2 className="cartao__titulo">Tempo de resposta</h2>
            </div>

            <div className="cartao__escolhas">
              <div className="escopo escopo--peq" role="group" aria-label="Agrupar por">
                <button
                  type="button"
                  className={eixo === 'setor' ? 'is-atual' : ''}
                  onClick={() => setEixo('setor')}
                >
                  Setor
                </button>
                <button
                  type="button"
                  className={eixo === 'pessoa' ? 'is-atual' : ''}
                  onClick={() => setEixo('pessoa')}
                >
                  Pessoa
                </button>
              </div>
            </div>
          </header>

          <div className="cartao__corpo">
            {lista.length === 0 ? (
              <p className="cartao__vazio">
                Nenhum check marcado ainda — sem marcação não há tempo para medir.
              </p>
            ) : (
              <Linha
                series={lista}
                eixoX={eixoMeses}
                unidade="dias"
                alturaTotal={250}
                /* dia é um número de dois dígitos; mês é "set/26" */
                larguraRotulo={passo === 'ano' ? 38 : 16}
              />
            )}
          </div>
        </section>

        <section className="cartao cartao--estreito vidro">
          <header className="cartao__topo">
            <div>
              <h2 className="cartao__titulo">Entregas no prazo</h2>
            </div>
          </header>

          <div className="cartao__corpo">
            {desvios.length === 0 ? (
              <p className="cartao__vazio">Nenhuma obra concluída com data de conclusão combinada.</p>
            ) : (
              <Rosca
                tamanho={196}
                fatias={[
                  { rotulo: 'No prazo', valor: noPrazo.length, cor: 'var(--gr-bom)' },
                  { rotulo: 'Atrasadas', valor: atrasadas.length, cor: 'var(--gr-ruim)' },
                ]}
                centro={{
                  valor: `${Math.round((noPrazo.length / desvios.length) * 100)}%`,
                  rotulo: 'no prazo',
                }}
                rodape={`${desvios.length} obra${desvios.length > 1 ? 's' : ''} com prazo combinado`}
              />
            )}
          </div>
        </section>

        <section className="cartao vidro">
          <header className="cartao__topo">
            <div>
              <h2 className="cartao__titulo">Tempo médio de obra em campo</h2>
              <p className="cartao__sub">
                {etapaCampo
                  ? `Da abertura ao fechamento da etapa ${
                      etapaCampo.descricao || etapaCampo.nome
                    }, pelo ${passo === 'ano' ? 'mês' : 'dia'} em que a obra saiu de campo.`
                  : 'Quanto tempo a obra passa na etapa de execução.'}
              </p>
            </div>
            {campo.total > 0 && (
              <span className="cartao__selo" title="Obras que saíram de campo no período">
                {campo.total}
              </span>
            )}
          </header>

          <div className="cartao__corpo">
            {!etapaCampo ? (
              <p className="cartao__vazio">
                O roteiro não tem uma etapa de execução (campo) — não há o que medir.
              </p>
            ) : campo.total === 0 ? (
              <p className="cartao__vazio">
                Nenhuma obra saiu de campo {passo === 'ano' ? 'neste ano' : 'neste mês'}.
              </p>
            ) : (
              <Colunas itens={campo.itens} unidade="dias" referencia={campo.media} />
            )}
          </div>
        </section>

      </div>

      <PainelDespesas fatias={fatias} passo={passo} rotuloDaFatia={rotuloDaFatia} />
    </div>
  )
}

/** Um contador do resumo de atraso e adiantamento. */
function Situacao({ tom, rotulo, valor }) {
  return (
    <span className="situacao" data-tom={tom}>
      <strong>{valor}</strong>
      <span>{rotulo}</span>
    </span>
  )
}
