/* ============================================================
   PONTO — a folha de ponto (espelho) de cada funcionario.

   Um arquivo so, usado pelos dois lados: a tela le o .csv antes de
   mandar (e mostra o erro na hora) e o servidor le de novo, sem
   confiar no que a tela disse. As contas da folha (horas positivas,
   atrasos, debito, credito, totais) tambem moram aqui: a tela, o PDF
   e o Excel saem da mesma conta.

   O ARQUIVO que entra e o "Calculo Diario" do sistema de ponto: .csv
   separado por ";", em UTF-8 (com ou sem BOM), uma linha por
   funcionario por dia, com estas 22 colunas, nesta ordem. Outro
   arquivo e recusado inteiro — nada entra pela metade.

   O que o arquivo NAO traz, e a folha mostra como da:
     - as marcacoes ORIGINAIS (as batidas cruas do relogio): o arquivo
       so tem as marcacoes validas. A coluna "Marcacoes Originais"
       repete as validas, como o espelho faz no dia sem ajuste;
     - o nome do feriado: sai do calendario (FERIADOS, mais abaixo).

   As regras de Debito e Credito foram tiradas do espelho de exemplo do
   sistema de ponto (ver `calcularDia`). Se o RH usar outra, e aqui que
   se troca.
   ============================================================ */

/** As colunas do Calculo Diario, na ordem do arquivo. */
export const CABECALHO = [
  'CNPJ',
  'Nome',
  'Matrícula',
  'PIS',
  'CPF',
  'Admissão',
  'Demissão',
  'Filial',
  'Departamento',
  'Cargo',
  'Data',
  'Dia',
  'Jornada Esperada',
  'Horas Esperadas',
  'Nome Escala',
  'Natureza Dia',
  'Marcações Válidas',
  'Jornada Considerada',
  'Horas Trabalhadas',
  'Eventos',
  'Centro Custo',
  'Grupos',
]

/* a coluna do arquivo -> o campo do registro (e da tabela ponto_dia) */
const CAMPOS = [
  'cnpj',
  'nome',
  'matricula',
  'pis',
  'cpf',
  'admissao',
  'demissao',
  'filial',
  'departamento',
  'cargo',
  'data',
  'diaSemana',
  'jornadaEsperada',
  'horasEsperadas',
  'escala',
  'natureza',
  'marcacoes',
  'jornadaConsiderada',
  'horasTrabalhadas',
  'eventos',
  'centroCusto',
  'grupos',
]

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIAS_CURTOS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.']

/* o tamanho de um arquivo que ainda faz sentido mandar de uma vez: um
   ano de uma empresa de 60 pessoas. Mais que isso, um mes por vez */
export const LINHAS_MAXIMAS = 25000
/* o periodo mais longo que a folha abre de uma vez */
export const DIAS_MAXIMOS = 370

/* ------------------------------------------------------------
   Leitura do arquivo
   ------------------------------------------------------------ */

const limpo = (v) => String(v ?? '').normalize('NFC').trim()
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '')

/** Uma linha do .csv em campos. Aceita campo entre aspas ("a;b"), por garantia. */
function campos(linha) {
  const saida = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i]
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"'
        i += 1
      } else if (c === '"') aspas = false
      else atual += c
    } else if (c === '"' && atual === '') aspas = true
    else if (c === ';') {
      saida.push(atual)
      atual = ''
    } else atual += c
  }
  saida.push(atual)
  return saida
}

/** 'DD/MM/AAAA' que existe no calendario -> 'AAAA-MM-DD'; senao null. */
export function dataDoArquivo(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(limpo(texto))
  if (!m) return null
  const [, d, mes, a] = m.map(Number)
  const data = new Date(Date.UTC(a, mes - 1, d))
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== d) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** 'AAAA-MM-DD' que existe no calendario. */
export function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? ''))) return false
  const [a, m, d] = valor.split('-').map(Number)
  const data = new Date(Date.UTC(a, m - 1, d))
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d
}

const HORAS = /^\d{1,3}:[0-5]\d$/
const vazioOuTraco = (v) => v === '' || v === '-'

/**
 * Le o Calculo Diario. Devolve { registros, erros, semCpf }: com qualquer
 * erro a importacao e recusada inteira (a tela mostra os primeiros). A
 * linha sem CPF nao e erro: fica de fora, e o nome vai em `semCpf`.
 *
 * Cada registro tem os campos de CAMPOS, com o CPF so nos 11 digitos e
 * as datas em 'AAAA-MM-DD'. Os outros textos vem como estavam (sem os
 * espacos das pontas), e e assim que o Excel exportado os devolve.
 */
export function lerCalculoDiario(texto) {
  const erros = []
  const linhas = String(texto ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
  while (linhas.length && linhas[linhas.length - 1].trim() === '') linhas.pop()

  if (linhas.length === 0) return { registros: [], erros: ['O arquivo está vazio.'] }

  const topo = campos(linhas[0]).map(limpo)
  const diferente = CABECALHO.findIndex((nome, i) => topo[i] !== nome)
  if (topo.length !== CABECALHO.length || diferente >= 0) {
    const onde =
      diferente >= 0
        ? `a coluna ${diferente + 1} deveria ser "${CABECALHO[diferente]}" e veio "${topo[diferente] ?? 'nada'}"`
        : `ele tem ${topo.length} colunas, e o modelo tem ${CABECALHO.length}`
    return {
      registros: [],
      erros: [
        `Este arquivo não é o Cálculo Diário do ponto (.csv separado por ";"): ${onde}. ` +
          'Exporte o Cálculo Diário do sistema de ponto e importe o arquivo sem mexer nele.',
      ],
    }
  }

  if (linhas.length - 1 > LINHAS_MAXIMAS) {
    return {
      registros: [],
      erros: [`O arquivo tem ${linhas.length - 1} linhas; o limite é ${LINHAS_MAXIMAS}. Importe um mês por vez.`],
    }
  }

  const registros = []
  const vistos = new Map()
  const semCpf = new Set()
  const errar = (n, msg) => {
    if (erros.length < 50) erros.push(`Linha ${n}: ${msg}`)
  }

  for (let i = 1; i < linhas.length; i += 1) {
    const n = i + 1
    if (linhas[i].trim() === '') continue
    const valores = campos(linhas[i]).map(limpo)
    if (valores.length !== CABECALHO.length) {
      errar(n, `tem ${valores.length} colunas, e o modelo tem ${CABECALHO.length}.`)
      continue
    }
    const r = Object.fromEntries(CAMPOS.map((c, j) => [c, valores[j]]))

    const cpf = soDigitos(r.cpf)
    if (!cpf) {
      /* sem CPF nao ha com quem ligar a folha (o sistema de ponto manda
         assim quem ainda nao tem cadastro completo): fica de fora, com
         aviso, e o resto do arquivo entra */
      semCpf.add(r.nome || `linha ${n}`)
      continue
    }
    if (cpf.length > 11) {
      errar(n, 'CPF com mais de 11 dígitos.')
      continue
    }
    /* o Excel come o zero da frente quando alguem abre e salva o .csv */
    r.cpf = cpf.padStart(11, '0')

    if (!r.nome) errar(n, 'sem o nome do funcionário.')
    const data = dataDoArquivo(r.data)
    if (!data) errar(n, `a data "${r.data}" não é válida (DD/MM/AAAA).`)
    r.data = data

    for (const campo of ['admissao', 'demissao']) {
      if (vazioOuTraco(r[campo])) r[campo] = null
      else {
        const d = dataDoArquivo(r[campo])
        if (!d) errar(n, `a ${campo === 'admissao' ? 'admissão' : 'demissão'} "${r[campo]}" não é uma data válida.`)
        r[campo] = d
      }
    }
    if (!HORAS.test(r.horasEsperadas)) errar(n, `Horas Esperadas "${r.horasEsperadas}" não está em HH:MM.`)
    if (!HORAS.test(r.horasTrabalhadas)) errar(n, `Horas Trabalhadas "${r.horasTrabalhadas}" não está em HH:MM.`)
    if (!r.natureza) errar(n, 'sem a Natureza do Dia.')

    if (data) {
      const chave = `${r.cpf}|${data}`
      if (vistos.has(chave)) errar(n, `repete o dia ${dataBR(data)} de ${r.nome} (já veio na linha ${vistos.get(chave)}).`)
      vistos.set(chave, n)
    }
    registros.push(r)
  }

  if (registros.length === 0 && erros.length === 0) {
    erros.push(
      semCpf.size
        ? 'Nenhuma linha do arquivo tem CPF: sem ele não há com quem ligar a folha.'
        : 'O arquivo não tem nenhuma linha de marcação.',
    )
  }
  return { registros, erros, semCpf: [...semCpf] }
}

/** O resumo do que vai entrar: pessoas, dias e o periodo coberto. */
export function resumoDoArquivo(registros) {
  const pessoas = new Map()
  let inicio = null
  let fim = null
  for (const r of registros) {
    if (!pessoas.has(r.cpf)) pessoas.set(r.cpf, r.nome)
    if (!inicio || r.data < inicio) inicio = r.data
    if (!fim || r.data > fim) fim = r.data
  }
  return { funcionarios: pessoas.size, dias: registros.length, inicio, fim }
}

/* ------------------------------------------------------------
   Horas
   ------------------------------------------------------------ */

/** 'HH:MM' (ou 'HH:MM:SS') em minutos; o que nao for hora vira 0. */
export function minutos(texto) {
  const m = /^(\d{1,3}):(\d{2})(?::\d{2})?$/.exec(limpo(texto))
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

/** Minutos em 'HH:MM' (negativo com '-'). */
export function hhmm(total) {
  const sinal = total < 0 ? '-' : ''
  const abs = Math.abs(Math.round(total))
  return `${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

const horaCurta = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(limpo(t))
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

/** "08:08 - 12:10 | 13:12 - 19:16" -> [['08:08','12:10'], ['13:12','19:16']]. */
export function paresDeMarcacoes(texto) {
  const t = limpo(texto)
  if (vazioOuTraco(t)) return []
  const batidas = t
    .split('|')
    .flatMap((trecho) => trecho.split('-'))
    .map(horaCurta)
    .filter(Boolean)
  const pares = []
  for (let i = 0; i < batidas.length; i += 2) pares.push([batidas[i], batidas[i + 1] ?? null])
  return pares
}

/** Os pares como o espelho escreve: "08:08-12:10 13:12-19:16" (a batida sozinha fica "08:58-"). */
export function textoDosPares(pares) {
  return pares.map(([e, s]) => `${e}-${s ?? ''}`).join(' ')
}

/** " 08:00:00 | 12:00:00 | 13:00:00 | 17:00:00 " -> "08:00-12:00 13:00-17:00". */
export function jornadaEsperadaTexto(texto) {
  const t = limpo(texto)
  if (vazioOuTraco(t)) return ''
  const horas = t.split('|').map(horaCurta).filter(Boolean)
  const pares = []
  for (let i = 0; i < horas.length; i += 2) pares.push([horas[i], horas[i + 1] ?? null])
  return textoDosPares(pares)
}

/* a hora noturna da CLT: das 22h as 5h */
const NOITE = [
  [0, 5 * 60],
  [22 * 60, 29 * 60],
  [46 * 60, 53 * 60],
]

/** Os minutos de trabalho entre 22h e 5h nos pares do dia. */
export function minutosNoturnos(pares) {
  let total = 0
  for (const [e, s] of pares) {
    if (!e || !s) continue
    const ini = minutos(e)
    let fim = minutos(s)
    if (fim < ini) fim += 24 * 60
    for (const [a, b] of NOITE) total += Math.max(0, Math.min(fim, b) - Math.max(ini, a))
  }
  return total
}

/* ------------------------------------------------------------
   O dia na folha
   ------------------------------------------------------------ */

const sem = (t) =>
  limpo(t)
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()

/** A Natureza do Dia no codigo do espelho (TRAB, DUNT, FOLG, FERIADO). */
export function tipoDoDia(natureza) {
  const n = sem(natureza)
  if (!n) return ''
  if (n === 'trabalho') return 'TRAB'
  if (n.startsWith('dia util nao trabalhado')) return 'DUNT'
  if (n.startsWith('folga')) return 'FOLG'
  if (n.startsWith('feriado')) return 'FERIADO'
  if (n.startsWith('ferias')) return 'FÉRIAS'
  return limpo(natureza).toUpperCase().slice(0, 8)
}

/* o evento que justifica a ausencia: com ele, a falta nao vira debito */
const ABONA = /atestado|declara|ferias|licenc|abono|abonad/

/** "Hora Extra autorizada, Hora Extra autorizada" -> ['Hora Extra autorizada']. */
export function listaDeEventos(texto) {
  const t = limpo(texto)
  if (vazioOuTraco(t)) return []
  return [...new Set(t.split(',').map(limpo).filter((e) => e && e !== '-'))]
}

/* ---- os feriados, so para dar o nome no espelho ---- */

function pascoa(ano) {
  /* o algoritmo de Meeus/Jones/Butcher */
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(ano, mes - 1, dia)
}

const FERIADOS_FIXOS = {
  '01-01': 'Confraternização Universal',
  '01-25': 'Aniversário de São Paulo',
  '04-21': 'Tiradentes',
  '05-01': 'Dia do Trabalho',
  '07-09': 'Revolução Constitucionalista',
  '09-07': 'Independência',
  '10-12': 'Nossa Senhora Aparecida',
  '11-02': 'Finados',
  '11-15': 'Proclamação da República',
  '11-20': 'Consciência Negra',
  '12-25': 'Natal',
}

/** O nome do feriado de 'AAAA-MM-DD' (nacionais e os de Sao Paulo), ou null. */
export function nomeDoFeriado(data) {
  if (!dataValida(data)) return null
  const fixo = FERIADOS_FIXOS[data.slice(5)]
  if (fixo) return fixo
  const [a, m, d] = data.split('-').map(Number)
  const dias = Math.round((Date.UTC(a, m - 1, d) - pascoa(a)) / 86400000)
  if (dias === -48 || dias === -47) return 'Carnaval'
  if (dias === -2) return 'Sexta-feira Santa'
  if (dias === 60) return 'Corpus Christi'
  return null
}

/* ---- datas ---- */

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA'. */
export function dataBR(data) {
  if (!data) return ''
  const [a, m, d] = String(data).slice(0, 10).split('-')
  return d ? `${d}/${m}/${a}` : String(data)
}

const diaDaSemana = (data) => {
  const [a, m, d] = data.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

/** '2026-09-01' -> '01 set., ter.' (o "Data" do espelho). */
export function dataDoEspelho(data, diaDoArquivo) {
  const [, m, d] = data.split('-')
  const dia = limpo(diaDoArquivo).toLowerCase() || DIAS_CURTOS[diaDaSemana(data)]
  return `${d} ${MESES_CURTOS[Number(m) - 1]}., ${dia.endsWith('.') ? dia : `${dia}.`}`
}

/** Os dias de inicio a fim, inclusive. */
export function diasDoPeriodo(inicio, fim) {
  const lista = []
  if (!dataValida(inicio) || !dataValida(fim) || fim < inicio) return lista
  const [a, m, d] = inicio.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d))
  while (lista.length <= DIAS_MAXIMOS) {
    const iso = t.toISOString().slice(0, 10)
    if (iso > fim) break
    lista.push(iso)
    t.setUTCDate(t.getUTCDate() + 1)
  }
  return lista
}

/** O mes 'AAAA-MM' como periodo: { inicio, fim }. */
export function periodoDoMes(mes) {
  const [a, m] = String(mes).split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { inicio: `${a}-${mm}-01`, fim: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

/** "Setembro - 2026" quando o periodo cabe num mes; senao "Setembro - Outubro 2026". */
export function rotuloDoPeriodo(inicio, fim) {
  if (!inicio || !fim) return ''
  const [ai, mi] = inicio.split('-').map(Number)
  const [af, mf] = fim.split('-').map(Number)
  if (ai === af && mi === mf) return `${MESES[mi - 1]} - ${ai}`
  if (ai === af) return `${MESES[mi - 1]} - ${MESES[mf - 1]} ${ai}`
  return `${MESES[mi - 1]} ${ai} - ${MESES[mf - 1]} ${af}`
}

/* ------------------------------------------------------------
   As contas
   ------------------------------------------------------------ */

/**
 * As colunas calculadas de um dia, em minutos:
 *
 *   realizadas  as Horas Trabalhadas do arquivo;
 *   positivas   o que passou das esperadas;
 *   atrasos     o que faltou para as esperadas — menos no dia com
 *               atestado, declaracao, ferias ou licenca (abonado);
 *   noturna     o trabalho entre 22h e 5h, pelos pares de marcacao;
 *   credito     as positivas, quando o dia tem "Hora Extra autorizada";
 *   debito      os atrasos (o que nao foi abonado).
 *
 * Conferido com o espelho de exemplo: Total Trabalhado, Total H.
 * Normais Esperadas e o "Horas a Pagar" (a soma dos creditos) batem.
 */
export function calcularDia(dia) {
  const esperadas = minutos(dia.horasEsperadas)
  const realizadas = minutos(dia.horasTrabalhadas)
  const eventos = listaDeEventos(dia.eventos)
  const abonado = eventos.some((e) => ABONA.test(sem(e))) || tipoDoDia(dia.natureza) === 'FÉRIAS'
  const pares = paresDeMarcacoes(dia.marcacoes)
  const positivas = Math.max(0, realizadas - esperadas)
  const atrasos = abonado ? 0 : Math.max(0, esperadas - realizadas)
  const extraAutorizada = eventos.some((e) => /hora extra autorizada/.test(sem(e)))
  return {
    esperadas,
    realizadas,
    positivas,
    atrasos,
    noturna: minutosNoturnos(pares),
    credito: extraAutorizada ? positivas : 0,
    debito: atrasos,
    pares,
    eventos,
  }
}

const seTiver = (min) => (min > 0 ? hhmm(min) : '')

/**
 * A folha do periodo: uma linha por dia (o dia sem importacao aparece
 * so com a data) e os totais do rodape. `dias` sao os registros do
 * banco no formato de CAMPOS.
 */
export function montarFolha(dias, inicio, fim) {
  const porData = new Map((dias ?? []).map((d) => [String(d.data).slice(0, 10), d]))
  const totais = { trabalhado: 0, esperado: 0, credito: 0, debito: 0, noturna: 0, positivas: 0, atrasos: 0 }

  const linhas = diasDoPeriodo(inicio, fim).map((data) => {
    const dia = porData.get(data)
    if (!dia) {
      return { data, rotulo: dataDoEspelho(data), vazio: true, celulas: Array(12).fill('') }
    }
    const c = calcularDia(dia)
    totais.trabalhado += c.realizadas
    totais.esperado += c.esperadas
    totais.credito += c.credito
    totais.debito += c.debito
    totais.noturna += c.noturna
    totais.positivas += c.positivas
    totais.atrasos += c.atrasos

    const tipo = tipoDoDia(dia.natureza)
    let eventos = c.eventos.join(', ')
    if (!eventos && tipo === 'FERIADO') {
      const nome = nomeDoFeriado(data)
      eventos = nome ? `Feriado (${nome})` : 'Feriado'
    }
    const marcas = textoDosPares(c.pares)
    return {
      data,
      rotulo: dataDoEspelho(data, dia.diaSemana),
      vazio: false,
      tipo,
      /* as colunas do espelho, da "Tipo Dia" aos "Eventos" */
      celulas: [
        tipo,
        jornadaEsperadaTexto(dia.jornadaEsperada),
        marcas,
        marcas,
        seTiver(c.realizadas),
        seTiver(c.positivas),
        seTiver(c.atrasos),
        seTiver(c.noturna),
        seTiver(c.debito),
        seTiver(c.credito),
        eventos,
      ],
    }
  })

  const saldo = totais.credito - totais.debito
  return {
    linhas,
    totais: {
      ...totais,
      saldo,
      trabalhadoTexto: hhmm(totais.trabalhado),
      esperadoTexto: hhmm(totais.esperado),
      /* o quadro "Horas a Pagar ou Descontar" */
      aPagar: `Dia de trabalho | Diurno: ${hhmm(saldo)}`,
      noturnaTexto: totais.noturna > 0 ? `Noturno: ${hhmm(totais.noturna)}` : '',
    },
  }
}

/** As colunas da tabela do espelho, na ordem (as de "Horas Compensadas" sao Debito e Credito). */
export const COLUNAS_DO_ESPELHO = [
  'Data',
  'Tipo Dia',
  'Jornada Esperada',
  'Marcações Originais',
  'Jornada Realizada',
  'Horas Realizadas',
  'Horas Positivas',
  'Atrasos e Faltas',
  'Hora Noturna',
  'Débito',
  'Crédito',
  'Eventos',
]

/** CPF '12345678901' -> '123.456.789-01'. */
export function cpfComMascara(cpf) {
  const d = soDigitos(cpf)
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d
}

/** A linha do Excel no formato do Calculo Diario (as 22 colunas). */
export function linhaDoArquivo(dia) {
  return [
    dia.cnpj ?? '',
    dia.nome ?? '',
    dia.matricula ?? '',
    dia.pis ?? '',
    dia.cpf ?? '',
    dia.admissao ? dataBR(dia.admissao) : '',
    dia.demissao ? dataBR(dia.demissao) : '',
    dia.filial ?? '',
    dia.departamento ?? '',
    dia.cargo ?? '',
    dataBR(dia.data),
    dia.diaSemana ?? '',
    dia.jornadaEsperada ?? '',
    dia.horasEsperadas ?? '',
    dia.escala ?? '',
    dia.natureza ?? '',
    dia.marcacoes ?? '',
    dia.jornadaConsiderada ?? '',
    dia.horasTrabalhadas ?? '',
    dia.eventos ?? '',
    dia.centroCusto ?? '',
    dia.grupos ?? '',
  ]
}
