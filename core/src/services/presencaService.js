import { get, tokenAtual } from './api'

/**
 * Quem esta no site agora (server/routes/presenca.js).
 *
 * Os avisos saem num fetch proprio, e nao pelo `chamar`, de proposito:
 * dentro de uma gravacao (`comCarga`) todo POST sai pedindo a carga
 * junto, e o aviso de presenca — que sai sozinho, a cada minuto — podia
 * voltar com uma carga lida ANTES de a gravacao chegar ao banco e a
 * tela mostrar o dado velho. Erro aqui tambem nao derruba a sessao: o
 * aviso e invisivel, e quem cuida da sessao sao as chamadas de verdade.
 */

/* o ultimo token que funcionou: o "sair" do logout sai depois que a
   sessao ja foi apagada da memoria */
let ultimoToken = null

function avisar(caminho, corpo, { saindo = false } = {}) {
  const token = tokenAtual() ?? ultimoToken
  if (!token) return Promise.resolve()
  ultimoToken = token
  return fetch(`/api/presenca${caminho}`, {
    method: 'POST',
    /* keepalive: o pedido sai mesmo com a aba fechando */
    keepalive: saindo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  }).catch(() => {})
}

/** Esta aba esta aberta — visivel ou em segundo plano. */
export const marcarPresenca = (aba, visivel) => avisar('', { aba, visivel })

/** Esta aba fechou (ou a pessoa saiu da conta). */
export function sairDaPresenca(aba) {
  const pedido = avisar('/sair', { aba }, { saindo: true })
  ultimoToken = null
  return pedido
}

/** { [usuarioId]: 'ativo' | 'segundo_plano' } — quem nao aparece esta offline. */
export async function carregarPresenca() {
  const { presenca } = await get('/presenca')
  return presenca ?? {}
}
