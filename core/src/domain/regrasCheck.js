/* ============================================================
   Quem do setor marca qual check (atualizacao 37)

   As regras por CARGO e por PESSOA que a tela de Setores grava em
   cargo.regras_check. Moram aqui, sem import nenhum, porque o
   servidor le pelas MESMAS funcoes (auth.js, equipe.js e o
   travaDoMarcar de routes/dados.js) — e o obras.js, que a tela usa,
   so as reexporta.
   ============================================================ */

/* uma regra: a partir de que etapa (a posicao dela, 1, 2, 3...) e os
   checks que ficam de fora. A regra que nao restringe nada some (null) —
   menos a da PESSOA, que pode existir justamente para liberar tudo a
   alguem de um cargo restrito */
function lerRegra(cru, manterVazia = false) {
  if (!cru || typeof cru !== 'object') return null
  const etapa = Number.parseInt(cru.etapa, 10)
  const exceto = Array.isArray(cru.exceto) ? [...new Set(cru.exceto.map(String).filter((id) => /^\d+$/.test(id)))] : []
  const regra = { etapa: etapa > 1 ? etapa : null, exceto }
  return manterVazia || regra.etapa || regra.exceto.length > 0 ? regra : null
}

/**
 * As regras de check de um setor (cargo.regras_check), limpas:
 * { cargos: { [cargoTituloId]: regra }, pessoas: { [usuarioId]: regra } }.
 * A tela de Setores grava e o servidor le pela mesma funcao.
 */
export function lerRegrasCheck(cru) {
  const limpo = { cargos: {}, pessoas: {} }
  if (!cru || typeof cru !== 'object') return limpo
  for (const grupo of ['cargos', 'pessoas']) {
    Object.entries(cru[grupo] ?? {}).forEach(([id, valor]) => {
      const regra = /^\d+$/.test(id) ? lerRegra(valor, grupo === 'pessoas') : null
      if (regra) limpo[grupo][id] = regra
    })
  }
  return limpo
}

/**
 * A regra que vale para UMA pessoa do setor: a dela (a excecao), ou a do
 * cargo dela. null = marca todos os checks do setor, como sempre.
 */
export function regraDoUsuario(regras, usuarioId, cargoTituloId) {
  const limpas = lerRegrasCheck(regras)
  return limpas.pessoas[String(usuarioId ?? '')] ?? (cargoTituloId ? limpas.cargos[String(cargoTituloId)] : null) ?? null
}

/**
 * A regra deixa marcar este check? `etapaOrdem` e a posicao da etapa do
 * check (1, 2, 3...). O check proprio de uma obra conta como o do
 * roteiro de onde ele saiu (origemId).
 */
export function regraLibera(regra, etapaOrdem, check) {
  if (!regra) return true
  if (regra.etapa && etapaOrdem !== null && etapaOrdem !== undefined && Number(etapaOrdem) < regra.etapa) {
    return false
  }
  const ids = [check?.id, check?.origemId].filter(Boolean).map(String)
  return !ids.some((id) => (regra.exceto ?? []).includes(id))
}

/** O que dizer quando o check nao abre — a chave vem de `travaDoCheck`. */
export const MOTIVO_DA_TRAVA = {
  membro: 'Você não participa desta obra. Para marcar os checks dela, é preciso ser incluído em Membros e aceitar.',
  cargo: 'O seu cargo não marca este check.',
  setor: 'Este check é de outro setor.',
}
