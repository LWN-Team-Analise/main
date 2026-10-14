import { etapaConcluida } from '@/domain/obras'

/* ============================================================
   Contas de tempo do Dashboard (e da exportacao para o Power BI)

   Tudo aqui e feito em DIAS INTEIROS de calendario quando a pergunta
   e "quantos dias", e o calculo passa por Date.UTC nas duas pontas de
   proposito: `new Date(a) - new Date(b)` erra por uma hora em toda
   virada de horario de verao, e um relatorio que muda de resultado em
   outubro nao serve para nada.

   As datas chegam em dois formatos, porque as colunas sao de dois
   tipos: `data_inicio` e `data_conclusao` sao DATE e chegam como
   'AAAA-MM-DD'; `criado_em`, `concluida_em` e `feito_em` sao timestamp
   e chegam como ISO. `soDia` e `instante` nivelam os dois.

   Mora fora do Painel.jsx porque a exportacao para o Power BI faz as
   MESMAS contas — e um numero que sai de um jeito no grafico e de
   outro na planilha e o comeco de uma discussao que ninguem ganha.
   ============================================================ */

/** 'AAAA-MM-DD' de um timestamp ou de uma data, no calendario local. */
export function soDia(valor) {
  if (!valor) return null
  const texto = String(valor)
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** 'AAAA-MM' de um carimbo — e por ele que o filtro de mes casa. */
export function mesDoCarimbo(valor) {
  const dia = soDia(valor)
  return dia ? dia.slice(0, 7) : null
}

/**
 * O instante de um carimbo, em milissegundos.
 *
 * 'AAAA-MM-DD' vira a MEIA-NOITE LOCAL daquele dia. `new Date()` leria
 * a meia-noite de Londres — 21h da vespera em Sao Paulo —, e a obra
 * que comecou hoje pareceria ter comecado ontem a noite.
 */
export function instante(valor) {
  if (!valor) return null
  const texto = String(valor)
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (soData) return new Date(Number(soData[1]), Number(soData[2]) - 1, Number(soData[3])).getTime()
  const t = new Date(valor).getTime()
  return Number.isNaN(t) ? null : t
}

/** Dias inteiros de `de` ate `ate`. Negativo = `ate` veio antes. */
export function diasEntre(de, ate) {
  const a = soDia(de)
  const b = soDia(ate)
  if (!a || !b) return null
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** Diferenca em HORAS entre dois carimbos — para as marcacoes do mesmo dia. */
export function horasEntre(de, ate) {
  const a = instante(de)
  const b = instante(ate)
  if (a === null || b === null) return null
  return (b - a) / 3_600_000
}

export const media = (lista) =>
  lista.length === 0 ? null : lista.reduce((s, n) => s + n, 0) / lista.length

/** 18 -> "18 dias" | 0.4 -> "10 h" | 1 -> "1 dia" */
export function emTempo(dias) {
  if (dias === null || dias === undefined) return '—'
  if (Math.abs(dias) < 1) {
    const h = Math.round(Math.abs(dias) * 24)
    return h < 1 ? '<1 h' : `${h} h`
  }
  const n = Math.round(dias * 10) / 10
  const texto = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
  return `${texto} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`
}

/** O primeiro instante da obra: o inicio combinado, ou o cadastro. */
export const inicioDaObra = (obra) => obra?.dataInicio ?? obra?.criadoEm ?? null

/* ------------------------------------------------------------
   A linha do tempo das etapas

   Nenhuma etapa tem "aberta em" ou "fechada em" gravado — o que o
   banco tem e o instante de cada CHECK. Dele sai o resto:

     fechou    quando o ULTIMO check da etapa foi marcado (e so se
               todos foram — etapa pela metade nao fechou);
     abriu     quando a anterior fechou. A primeira abre no inicio
               da obra. Na obra de EMERGENCIA todas abrem no inicio,
               porque ali nenhuma espera a outra (ver estadoDaEtapa).

   Etapa sem nenhum check nao segura a fila: ela "abre e fecha" no
   mesmo instante, e a seguinte herda a abertura dela.
   ------------------------------------------------------------ */

const maisRecente = (carimbos) =>
  carimbos.reduce((maior, c) => {
    if (!c) return maior
    if (!maior) return c
    return instante(c) > instante(maior) ? c : maior
  }, null)

/**
 * Uma linha por etapa: { etapa, numero, abriu, fechou, dias }.
 * `dias` e fracionado (12 h = 0,5) e null quando a etapa nao fechou,
 * nao abriu, ou fechou "antes" de abrir (check marcado fora de ordem).
 */
export function linhaDoTempo(obra, roteiro) {
  const inicio = inicioDaObra(obra)
  const marcados = obra?.checks ?? {}
  const emergencia = obra?.tipo === 'emergencia'
  let anterior = inicio

  return (roteiro ?? []).map((etapa) => {
    const checks = (etapa.cards ?? []).flatMap((c) => c.checks ?? [])
    const abriu = emergencia ? inicio : anterior

    if (checks.length === 0) {
      return { etapa, numero: etapa.numero, abriu, fechou: abriu, dias: null }
    }

    const fechou = etapaConcluida(etapa, marcados)
      ? maisRecente(checks.map((c) => marcados[c.id]?.feitoEm))
      : null
    anterior = fechou

    const horas = abriu && fechou ? horasEntre(abriu, fechou) : null
    return {
      etapa,
      numero: etapa.numero,
      abriu,
      fechou,
      dias: horas === null || horas < 0 ? null : horas / 24,
    }
  })
}

/* ------------------------------------------------------------
   A obra EM CAMPO

   E o tempo da etapa de execucao: de quando ela abre (o planejamento
   fechou, a equipe pode ir a campo) ate quando fecha (o ultimo check
   da execucao foi marcado). E a etapa do roteiro cujo nome ou
   descricao fala em "execucao" ou "campo" — no roteiro de fabrica, a
   3ª, "Execução".

   O roteiro e editavel, e por isso a etapa e achada pelo NOME, e nao
   pela posicao: inserir uma etapa antes dela nao muda o que se mede.
   Roteiro sem nenhuma etapa assim nao tem tempo em campo — e o grafico
   diz isso, em vez de medir a etapa errada.
   ------------------------------------------------------------ */

const achatar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function etapaDeCampo(roteiro) {
  /* a etapa fixa de execucao (etapa.papel, atualizacao 14) e a certa;
     sem ela, vale o nome */
  return (
    (roteiro ?? []).find((e) => e.papel === 'execucao') ??
    (roteiro ?? []).find((e) => /execu|\bcampo\b/.test(achatar(`${e.nome} ${e.descricao ?? ''}`))) ??
    null
  )
}

/** { dias, fechou } da etapa de campo desta obra, ou null se nao ha o que medir. */
export function tempoEmCampo(obra, roteiro) {
  const campo = etapaDeCampo(roteiro)
  if (!campo) return null
  const linha = linhaDoTempo(obra, roteiro).find((l) => l.numero === campo.numero)
  return linha && linha.dias !== null ? { dias: linha.dias, fechou: linha.fechou } : null
}
