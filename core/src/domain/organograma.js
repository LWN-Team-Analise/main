/* ============================================================
   ORGANOGRAMA (atualizacao 59) — a montagem do desenho, sem React

   O desenho e o da folha da diretoria: o titulo e a logo em cima, os
   DIRETORES ligados por uma linha e, abaixo deles, todos os TIMES (cada
   setor uma coluna com a cor dele), na ordem da folha. Dentro do time, as pessoas descem por NIVEL, uma
   linha por nivel:

     diretor  >  gestor / gerente / coordenador  >  supervisor / lider
       >  tecnico, analista, assistente... (o 4 acima do 3, do 2, do 1)
       >  trainee  >  auxiliar (o 2 acima do 1)  >  estagiario

   O nivel sai do CARGO de cada pessoa (Usuarios), entao quem entra, sai
   ou e promovido muda o desenho sozinho. Todos os times respondem ao setor
   da diretoria, na ORDEM_DOS_TIMES. O que e so do organograma fica no
   setor: quem fica no topo do time (`liderId`), pelo "Editar" de cada um.
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

/*
 * A ordem dos times no desenho, da esquerda para a direita, como na folha
 * da diretoria. Cada setor cai no primeiro trecho que o nome dele tiver
 * (sem acento e sem caixa); o que nao casar com nenhum vem depois, na
 * ordem dos setores.
 */
export const ORDEM_DOS_TIMES = [
  ['einstein', 'parque'],
  ['tecnic'],
  ['anapolis'],
  ['qualidade'],
  ['comercial'],
  ['excelencia'],
  ['administrativ', 'adm'],
  ['almox'],
]

/** A posicao do setor na ORDEM_DOS_TIMES (os de fora vem depois). */
export function posicaoDoTime(setor) {
  const nome = semAcento(`${setor.nome} ${setor.chave ?? ''}`)
  const i = ORDEM_DOS_TIMES.findIndex((trechos) => trechos.some((t) => nome.includes(t)))
  return i < 0 ? ORDEM_DOS_TIMES.length : i
}

/**
 * O desenho inteiro: { diretores, times: [{ setor, linhas }] }.
 *
 * Todos os times respondem ao setor da DIRETORIA: as pessoas dele vao para
 * cima, ligadas por uma linha, e os times ficam todos embaixo, na
 * ORDEM_DOS_TIMES. Diretor aparece so em cima, nunca repetido num time.
 */
export function montarOrganograma(setores, equipe) {
  const ativos = equipe.filter((p) => p.ativo !== false)
  const pessoaPorId = new Map(ativos.map((p) => [String(p.id), p]))
  const visiveis = setores.filter((s) => !s.painelTv)
  const diretoria = new Set(visiveis.filter(ehDiretoria).map((s) => s.chave))
  const diretores = ativos.filter((p) => diretoria.has(p.cargo)).sort(porNome)
  const ehDiretor = new Set(diretores.map((p) => String(p.id)))

  const times = visiveis
    .filter((s) => !diretoria.has(s.chave))
    .sort(
      (a, b) =>
        posicaoDoTime(a) - posicaoDoTime(b) ||
        (a.ordem ?? 0) - (b.ordem ?? 0) ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    )
    .map((setor) => {
      const lider = setor.liderId ? pessoaPorId.get(String(setor.liderId)) : null
      const pessoas = ativos.filter((p) => p.cargo === setor.chave && !ehDiretor.has(String(p.id)))
      if (lider && !ehDiretor.has(String(lider.id)) && !pessoas.includes(lider)) pessoas.push(lider)
      return { setor, linhas: linhasDoTime(pessoas, lider?.id) }
    })

  return { diretores, times }
}
