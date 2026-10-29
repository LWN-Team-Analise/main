import { codigoDoPais, ehBrasil } from '@/domain/paises'

/**
 * Endereco. No Brasil, estados e cidades vem do IBGE e o CEP do ViaCEP.
 * Fora dele, estados e cidades vem da CountriesNow (countriesnow.space):
 * uma lista so com todos os paises e os estados de cada um, e as cidades
 * pedidas por estado. As tres APIs sao publicas e nao pedem chave.
 *
 * Os estados voltam como opcoes de escolha, { valor, rotulo }: no Brasil
 * o valor e a UF ("SP"), fora dele o nome ("Florida").
 */

const MUNDO = 'https://countriesnow.space/api/v0.1/countries'

const cacheCidades = new Map()
const cacheEstados = new Map()
let mundo = null

/* o pais como a CountriesNow conhece: { nome: 'United States', estados: ['Alabama', ...] } */
function paisNoMundo(codigo) {
  mundo ??= fetch(`${MUNDO}/states`)
    .then((resposta) => {
      if (!resposta.ok) throw new Error('Não foi possível carregar os estados.')
      return resposta.json()
    })
    .then((bruto) => new Map((bruto.data ?? []).map((p) => [p.iso2, { nome: p.name, estados: p.states.map((e) => e.name) }])))
    /* falhou: a proxima escolha de pais tenta de novo */
    .catch((erro) => {
      mundo = null
      throw erro
    })
  return mundo.then((porCodigo) => porCodigo.get(codigo) ?? null)
}

/** Os estados do pais, ja como opcoes. Fora do Brasil a lista pode vir vazia (Monaco nao tem estado). */
export async function listarEstados(pais) {
  const codigo = codigoDoPais(pais)
  if (cacheEstados.has(codigo)) return cacheEstados.get(codigo)
  let opcoes
  if (ehBrasil(codigo)) {
    const resposta = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
    if (!resposta.ok) throw new Error('Não foi possível carregar os estados.')
    const bruto = await resposta.json()
    opcoes = bruto.map((e) => ({ valor: e.sigla, rotulo: `${e.sigla} — ${e.nome}` }))
  } else {
    const achado = await paisNoMundo(codigo)
    opcoes = (achado?.estados ?? [])
      .map((nome) => ({ valor: nome, rotulo: nome }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
  }
  cacheEstados.set(codigo, opcoes)
  return opcoes
}

/** Os estados que ja vieram para o pais (undefined = ainda nao vieram). */
export const estadosCarregados = (pais) => cacheEstados.get(codigoDoPais(pais))

/** Cidades de um estado: no Brasil pela UF ('SP'), fora dele pelo nome do estado. */
export async function listarCidades(pais, estado) {
  if (!estado) return []
  const codigo = codigoDoPais(pais)
  const chave = `${codigo}|${estado}`
  if (cacheCidades.has(chave)) return cacheCidades.get(chave)
  let cidades
  if (ehBrasil(codigo)) {
    const resposta = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estado}/municipios`)
    if (!resposta.ok) throw new Error('Não foi possível carregar as cidades.')
    cidades = (await resposta.json()).map((c) => c.nome)
  } else {
    const achado = await paisNoMundo(codigo)
    if (!achado) return []
    const busca = new URLSearchParams({ country: achado.nome, state: estado })
    const resposta = await fetch(`${MUNDO}/state/cities/q?${busca}`)
    if (!resposta.ok) throw new Error('Não foi possível carregar as cidades.')
    cidades = (await resposta.json()).data ?? []
  }
  cidades = [...new Set(cidades)].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  cacheCidades.set(chave, cidades)
  return cidades
}

/**
 * Busca o endereco pelo CEP. Devolve null quando o CEP nao existe —
 * quem chama decide se mostra erro ou deixa o usuario digitar na mao.
 */
export async function buscarCEP(cep) {
  const digitos = String(cep ?? '').replace(/\D/g, '')
  if (digitos.length !== 8) return null

  const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
  if (!resposta.ok) throw new Error('Não foi possível consultar o CEP.')
  const dados = await resposta.json()
  if (dados.erro) return null

  return {
    endereco: dados.logradouro ?? '',
    bairro: dados.bairro ?? '',
    cidade: dados.localidade ?? '',
    estado: dados.uf ?? '',
    cep: digitos.replace(/(\d{5})(\d{3})/, '$1-$2'),
  }
}
