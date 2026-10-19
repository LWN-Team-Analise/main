import { get, post } from './api'

/* As notificacoes no celular (server/routes/push.js). */

/** A chave publica do servidor, ou null se ele nao tiver as chaves. */
export const carregarChave = async () => (await get('/push/chave')).chave ?? null

export const inscrever = (inscricao, aparelho) => post('/push/inscricao', { inscricao, aparelho })

export const desligar = (endpoint) => post('/push/desligar', { endpoint })

export const testar = () => post('/push/teste', {})
