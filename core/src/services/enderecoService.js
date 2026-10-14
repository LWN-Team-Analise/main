/**
 * Endereco: estados e cidades vem do IBGE, e o CEP do ViaCEP.
 * As duas APIs sao publicas e nao pedem chave.
 */

const cacheCidades = new Map()
let cacheEstados = null

/** Lista os 27 estados (sigla + nome), em ordem alfabetica. */
export async function listarEstados() {
  if (cacheEstados) return cacheEstados
  const resposta = await fetch(
    'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome',
  )
  if (!resposta.ok) throw new Error('Não foi possível carregar os estados.')
  const bruto = await resposta.json()
  cacheEstados = bruto.map((e) => ({ sigla: e.sigla, nome: e.nome }))
  return cacheEstados
}

/** Cidades de um estado, pela sigla ('SP'). */
export async function listarCidades(sigla) {
  if (!sigla) return []
  if (cacheCidades.has(sigla)) return cacheCidades.get(sigla)
  const resposta = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sigla}/municipios`,
  )
  if (!resposta.ok) throw new Error('Não foi possível carregar as cidades.')
  const bruto = await resposta.json()
  const cidades = bruto.map((c) => c.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  cacheCidades.set(sigla, cidades)
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
