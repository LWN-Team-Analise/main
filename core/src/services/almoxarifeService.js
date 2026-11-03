/**
 * Almoxarife — o que o React do main le dele (server/almoxarife).
 *
 * A tela do Almoxarife em si e a do lwncontrol (public/almoxarife) e fala
 * com a API sozinha. Daqui sai so o painel do Dashboard da pagina inicial.
 */

import { get } from './api'

/** O painel do Dashboard: O.S., despesas, calibracao e baias, ja resumidos. */
export const carregarPainel = () => get('/almox/painel')
