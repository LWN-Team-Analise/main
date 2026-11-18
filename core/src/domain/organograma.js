/* ============================================================
   ORGANOGRAMA (atualizacao 59) — a montagem do desenho, sem React

   O desenho e o da diretoria: a logo em cima, os DIRETORES ligados por
   uma linha e, abaixo de cada um, os TIMES dele (cada setor uma coluna
   com a cor dele). Dentro do time, as pessoas descem por NIVEL, uma
   linha por nivel:

     diretor  >  gestor / gerente / coordenador  >  supervisor / lider
       >  tecnico, analista, assistente... (o 4 acima do 3, do 2, do 1)
       >  trainee  >  auxiliar (o 2 acima do 1)  >  estagiario

   O nivel sai do CARGO de cada pessoa (Usuarios), entao quem entra, sai
   ou e promovido muda o desenho sozinho. O que e so do organograma fica
   no setor: o diretor a quem o time responde (`diretorId`) e quem fica
   no topo do time (`liderId`), pelo "Editar" de cada time.
   ============================================================ */

/** Quantas pessoas cabem numa linha antes de quebrar em outra. */
export const POR_LINHA = 5

const semAcento = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/**
 * O nivel do cargo: menor e mais alto. O numero no fim do cargo
 * ("Tecnico de Qualificacao 4") sobe a pessoa dentro do nivel. Sem cargo,
 * a pessoa fica no meio (o nivel de quem executa).
 */
export function nivelDoCargo(titulo) {
  const t = semAcento(titulo)
  const grau = Math.min(Number(t.match(/(\d+)\s*$/)?.[1] ?? 0), 9)
  if (/\bdiretor/.test(t)) return 0
  if (/\b(gestor|gerente|coordenador|head)/.test(t)) return 10
  if (/\b(supervisor|lider|encarregado)/.test(t)) return 20
  if (/\b(estagiari|aprendiz)/.test(t)) return 60
  if (/\b(auxiliar|ajudante)/.test(t)) return 50 - grau
  if (/\btrainee/.test(t)) return 45
  return 40 - grau
}

/** A faixa do nivel, que pinta o anel da foto. */
export function faixaDoNivel(nivel) {
  if (nivel < 10) return 'diretoria'
  if (nivel < 20) return 'gestao'
  if (nivel < 30) return 'supervisao'
  if (nivel < 45) return 'execucao'
  return 'apoio'
}

/** O setor dos diretores: nao vira time, as pessoas dele vao para cima. */
export const ehDiretoria = (setor) => setor.chave === 'diretor' || semAcento(setor.nome).startsWith('diretor')

/**
 * "Tecnico" -> "Time Tecnico": o setor de uma palavra so ganha o "Time" na
 * frente; o de nome composto ("Parque Global Albert Einstein") fica como e.
 */
export const nomeDoTime = (setor) => (/\s/.test(setor.nome.trim()) ? setor.nome : `Time ${setor.nome}`)

/** "Rinaldo de Almeida Souza" -> "Rinaldo Souza": o primeiro e o ultimo nome. */
export function nomeCurto(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean)
  return partes.length <= 2 ? partes.join(' ') : `${partes[0]} ${partes[partes.length - 1]}`
}

const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR')

/**
 * As linhas de um time: [[{ pessoa, nivel }]], de cima para baixo. O
 * lider (quando marcado) vai sozinho para a primeira, com o anel do cargo
 * dele; cada nivel e uma linha, quebrada a cada POR_LINHA pessoas.
 */
export function linhasDoTime(pessoas, liderId) {
  const porLugar = new Map()
  pessoas.forEach((pessoa) => {
    const nivel = nivelDoCargo(pessoa.cargoTitulo)
    const lugar = String(pessoa.id) === String(liderId) ? -1 : nivel
    porLugar.set(lugar, [...(porLugar.get(lugar) ?? []), { pessoa, nivel }])
  })
  const linhas = []
  ;[...porLugar.keys()]
    .sort((a, b) => a - b)
    .forEach((lugar) => {
      const doLugar = porLugar.get(lugar).sort((a, b) => porNome(a.pessoa, b.pessoa))
      for (let i = 0; i < doLugar.length; i += POR_LINHA) linhas.push(doLugar.slice(i, i + POR_LINHA))
    })
  return linhas
}

/**
 * O desenho inteiro: [{ diretor, times: [{ setor, linhas }] }].
 *
 * `diretor` null e o grupo dos times ainda sem diretor (vai por ultimo).
 * Diretor e quem esta no setor da diretoria ou foi marcado como diretor
 * de algum time; ele aparece so em cima, nunca repetido dentro de um time.
 * Os diretores seguem a ordem dos setores (o do primeiro time primeiro).
 */
export function montarOrganograma(setores, equipe) {
  const ativos = equipe.filter((p) => p.ativo !== false)
  const pessoaPorId = new Map(ativos.map((p) => [String(p.id), p]))
  const visiveis = setores
    .filter((s) => !s.painelTv)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
  const diretoria = new Set(visiveis.filter(ehDiretoria).map((s) => s.chave))
  const times = visiveis.filter((s) => !diretoria.has(s.chave))

  const diretores = new Map()
  ativos.filter((p) => diretoria.has(p.cargo)).forEach((p) => diretores.set(String(p.id), p))
  times.forEach((s) => {
    const marcado = s.diretorId ? pessoaPorId.get(String(s.diretorId)) : null
    if (marcado) diretores.set(String(marcado.id), marcado)
  })

  const montarTime = (setor) => {
    const lider = setor.liderId ? pessoaPorId.get(String(setor.liderId)) : null
    const pessoas = ativos.filter((p) => p.cargo === setor.chave && !diretores.has(String(p.id)))
    if (lider && !diretores.has(String(lider.id)) && !pessoas.includes(lider)) pessoas.push(lider)
    return { setor, linhas: linhasDoTime(pessoas, lider?.id) }
  }

  const grupos = new Map([...diretores.keys()].map((id) => [id, []]))
  const semDiretor = []
  times.forEach((setor) => {
    const id = setor.diretorId ? String(setor.diretorId) : null
    if (id && grupos.has(id)) grupos.get(id).push(montarTime(setor))
    else semDiretor.push(montarTime(setor))
  })

  /* o diretor com time vem na ordem do primeiro time dele; sem time, depois, por nome */
  const ordemDoTime = new Map(times.map((s, i) => [s.id, i]))
  const primeiro = (lista) => (lista.length ? Math.min(...lista.map((t) => ordemDoTime.get(t.setor.id))) : Infinity)
  const resultado = [...grupos.entries()]
    .map(([id, lista]) => ({ diretor: diretores.get(id), times: lista }))
    .sort((a, b) => primeiro(a.times) - primeiro(b.times) || porNome(a.diretor, b.diretor))
  if (semDiretor.length > 0) resultado.push({ diretor: null, times: semDiretor })
  return resultado
}

/** Para o "Responde a": os diretores primeiro, depois o resto da equipe. */
export function candidatosADiretor(setores, equipe) {
  const diretoria = new Set(setores.filter(ehDiretoria).map((s) => s.chave))
  const ehDiretor = (p) => diretoria.has(p.cargo) || nivelDoCargo(p.cargoTitulo) === 0
  const ativos = equipe.filter((p) => p.ativo !== false).sort(porNome)
  return [...ativos.filter(ehDiretor), ...ativos.filter((p) => !ehDiretor(p))]
}
