import { get, post } from './api'

/* Os arquivos do sistema no SharePoint (server/routes/sharepoint.js). */

/** { configurado, anexosNoBanco, pastas } */
export const estadoSharepoint = () => get('/sharepoint')

/** Leva para o SharePoint os anexos de obra que ainda estao no banco: { movidos, falhas, restam }. */
export const moverAnexos = () => post('/sharepoint/anexos', {})

/** Grava agora a planilha do reembolso: { url }. */
export const atualizarPlanilha = () => post('/sharepoint/reembolso', {})
