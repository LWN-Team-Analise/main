/* Formatacoes curtas usadas nas telas de obras e clientes. */

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** '2026-09-01' -> '01/09/2026'. Sem Date, para nao escorregar de fuso. */
export function dataBR(iso) {
  if (!iso) return ''
  const [ano, mes, dia] = String(iso).split('-')
  return dia ? `${dia}/${mes}/${ano}` : String(iso)
}

/** '2026-08-31' -> '31 Ago, 2026' (formato do cabecalho). */
export function dataExtensa(iso) {
  if (!iso) return ''
  const [ano, mes, dia] = String(iso).split('-')
  if (!dia) return String(iso)
  return `${dia} ${MESES[Number(mes) - 1] ?? mes}, ${ano}`
}

/** Data de hoje em ISO (AAAA-MM-DD) no fuso local. */
export function hojeISO() {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}

/** Carimbo de envio das observacoes: '20/04/2026 às 14:32'. */
export function dataHora(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`
}

const REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 41.5 -> 'R$ 41,50'. Vazio ou invalido vira 'R$ 0,00'. */
export function reais(valor) {
  const numero = Number(valor)
  return REAIS.format(Number.isFinite(numero) ? numero : 0)
}

/** '01234-567' a partir de qualquer coisa com 8 digitos. */
export function formatarCEP(valor) {
  const d = String(valor ?? '').replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** Iniciais para o avatar quando nao ha foto. */
export function iniciaisDe(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/** Cor estavel a partir do nome — mesmo nome, mesma cor, sempre. */
export function corDoNome(nome) {
  const texto = String(nome ?? '')
  let soma = 0
  for (let i = 0; i < texto.length; i += 1) soma = (soma * 31 + texto.charCodeAt(i)) % 360
  return `hsl(${soma} 62% 46%)`
}

/** '30586894896' -> '305.868.948-96' (aceita texto pela metade). */
export function formatarCPF(valor) {
  const d = String(valor ?? '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** '11990001234' -> '(11) 99000-1234'. Aceita fixo (10 digitos) tambem. */
export function formatarTelefone(valor) {
  const d = String(valor ?? '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** So os digitos — e assim que CPF e telefone vao para o banco. */
export function soDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}
