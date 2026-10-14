/* ============================================================
   FROTAS — as regras da aba, num arquivo so.

   Sem React dentro: a tela (src/pages/Frotas) e a API
   (server/routes/frotas.js) importam ESTE arquivo, do mesmo jeito
   que fazem com src/domain/despesas.js. As perguntas da devolucao,
   as posicoes das fotos e os limites sao os mesmos dos dois lados —
   nao existe a chance de a tela pedir uma coisa e o servidor
   conferir outra.

   Os tres tipos de registro:

     saida      o veiculo sai da garagem;
     troca      o veiculo ja estava fora e passa para outro condutor
                (na planilha antiga era "Troca de motorista"). A tela
                nao tem botao proprio para ela: e a SAIDA de um
                veiculo que ja estava em uso;
     devolucao  o veiculo volta para a garagem.

   O KM nunca anda para tras: todo registro novo tem de ter KM igual
   ou maior que o ultimo do veiculo (`veiculo.km_atual`).
   ============================================================ */

export const TIPOS = {
  saida: { rotulo: 'Saída', plural: 'Saídas' },
  troca: { rotulo: 'Troca de condutor', plural: 'Trocas de condutor' },
  devolucao: { rotulo: 'Devolução', plural: 'Devoluções' },
}

/** As cinco fotos de toda saida e de toda devolucao, na ordem da tela. */
export const POSICOES = [
  { chave: 'frente', rotulo: 'Frente' },
  { chave: 'traseira', rotulo: 'Traseira' },
  { chave: 'esquerda', rotulo: 'Lado esquerdo' },
  { chave: 'direita', rotulo: 'Lado direito' },
  { chave: 'painel', rotulo: 'Painel (KM)' },
]

export const CHAVES_POSICAO = POSICOES.map((p) => p.chave)

/**
 * As perguntas de sim/nao da devolucao, na ordem do formulario.
 *
 * `importante`: o NAO dela e um problema e fica em vermelho na lista
 * de registros. O "Sem Parar" e a excecao — nao usar o Sem Parar nao
 * e defeito nenhum, e o SIM dele so abre a pergunta do posto.
 */
export const CHECKLIST = [
  { chave: 'pneus', pergunta: 'Houve calibração dos pneus?', curto: 'Pneus calibrados', importante: true },
  { chave: 'oleo', pergunta: 'Foi verificado o nível do óleo?', curto: 'Óleo verificado', importante: true },
  {
    chave: 'agua',
    pergunta: 'Foi verificado o nível de água do reservatório do para-brisa?',
    curto: 'Água do para-brisa verificada',
    importante: true,
  },
  { chave: 'abastecido', pergunta: 'O carro está abastecido?', curto: 'Abastecido', importante: true },
  {
    chave: 'semParar',
    pergunta: 'Foi utilizado o "Sem Parar" para abastecer o carro?',
    curto: 'Sem Parar usado',
    importante: false,
  },
  { chave: 'limpoInterno', pergunta: 'O carro encontra-se limpo internamente?', curto: 'Limpo por dentro', importante: true },
  { chave: 'limpoExterno', pergunta: 'O carro encontra-se limpo externamente?', curto: 'Limpo por fora', importante: true },
  { chave: 'farois', pergunta: 'Foi verificado se os faróis estão funcionando?', curto: 'Faróis verificados', importante: true },
]

export const CHAVES_CHECKLIST = CHECKLIST.map((c) => c.chave)

export const PERGUNTA_POSTO =
  'Em qual posto e qual o valor aproximado do abastecimento? (Exemplo: Posto Ipiranga Barueri, R$ 20,50)'

/* ---------------- Limites ---------------- */

export const OBSERVACAO_MAXIMA = 1000
export const POSTO_MAXIMO = 200
export const NOME_VEICULO_MAXIMO = 60
export const KM_MAXIMO = 9_999_999

/**
 * Teto de cada foto, ja reduzida. As cinco viajam num pedido so, e a
 * Vercel recusa pedido acima de 4,5 MB: 5 x 600 KB em base64 da uns
 * 4 MB, com folga. A tela reduz a foto antes (ver
 * src/pages/Frotas/fotos.js) e quase sempre fica bem abaixo disso.
 */
export const FOTO_BYTES_MAXIMOS = 600 * 1024

/* ---------------- Conferencias ---------------- */

/** '7:05' e '07:05' passam; '24:00' e '7h' nao. Devolve 'HH:MM' ou null. */
export function lerHora(valor) {
  const m = String(valor ?? '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

/** So numero inteiro, de 0 ao teto. Devolve o numero ou null. */
export function lerKm(valor) {
  const texto = String(valor ?? '').trim()
  if (!/^\d{1,7}$/.test(texto)) return null
  const km = Number(texto)
  return km <= KM_MAXIMO ? km : null
}

/** 'sim' / 'nao' / true / false -> boolean; o resto -> null. */
export function lerSimNao(valor) {
  if (valor === true || valor === 'sim') return true
  if (valor === false || valor === 'nao') return false
  return null
}

/** Bytes de verdade de um data URL (o base64 pesa um terco a mais). */
export function bytesDoDataUrl(dataUrl) {
  const base64 = String(dataUrl ?? '').split(',')[1] ?? ''
  const sobra = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - sobra)
}

/**
 * As respostas NAO que importam, na ordem do formulario — e o que
 * pinta o registro de vermelho na lista. Pergunta sem resposta (os
 * registros antigos tinham algumas) nao entra.
 */
export function alertasDe(registro) {
  if (registro?.tipo !== 'devolucao') return []
  return CHECKLIST.filter((c) => c.importante && registro.checklist?.[c.chave] === false).map((c) => c.chave)
}

/** '1.234.567 km' */
export function kmLegivel(km) {
  if (km === null || km === undefined || km === '') return '—'
  return `${Number(km).toLocaleString('pt-BR')} km`
}
