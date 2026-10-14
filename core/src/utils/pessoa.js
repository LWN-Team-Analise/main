/** Saudacao pelo horario: manha, tarde ou noite. */
export function saudacao(data = new Date()) {
  const hora = data.getHours()
  if (hora >= 5 && hora < 12) return 'Ótimo dia'
  if (hora >= 12 && hora < 18) return 'Ótima tarde'
  return 'Ótima noite'
}

/** "Willian Thomas Ito" -> "Willian" */
export function primeiroNome(nome) {
  return String(nome ?? '').trim().split(/\s+/)[0] ?? ''
}

/** "Willian Thomas Ito" -> "WI" (primeira e ultima inicial) */
export function iniciais(nome) {
  const partes = String(nome ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}
