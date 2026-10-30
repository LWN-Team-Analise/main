import { Router } from 'express'
import { query } from '../db.js'
import { exigeSessao, meuCargo, tratar } from '../sessao.js'
import { logger } from '../logger.js'
import { registrarAtividade } from '../atividade.js'
import { TIPO_LINK } from '../../src/domain/anexos.js'
import {
  PASTA_ANEXOS,
  PASTA_REEMBOLSO,
  PLANILHA_REEMBOLSO,
  bytesDoDataUrl,
  guardarAnexoDaObra,
  sharepointConfigurado,
} from '../sharepoint.js'
import { atualizarPlanilhaNoSharePoint } from './despesas.js'

/* ============================================================
   /api/sharepoint — os arquivos do sistema no SharePoint
   (server/sharepoint.js)

     GET    /           { configurado, anexosNoBanco, pastas }
     POST   /anexos     leva para o SharePoint os anexos de obra que
                        ainda estao no banco (os de antes), e cada um
                        vira o link do arquivo (so acesso total)
     POST   /reembolso  grava agora a planilha do reembolso (so acesso
                        total) — ela ja se atualiza sozinha a cada envio
   ============================================================ */

const router = Router()

/* mover arquivos e regravar a planilha e decisao da diretoria */
async function soAcessoTotal(req, res, next) {
  const meu = await meuCargo(req.dono.sub).catch(() => null)
  if (!meu?.acessoTotal) return res.status(403).json({ erro: 'Só quem tem acesso total mexe nos arquivos do SharePoint.' })
  return next()
}

/* os anexos de obra que ainda sao arquivo no banco (o link nao conta) */
const noBanco = (t = '') => `${t}tipo IS DISTINCT FROM $1 AND ${t}conteudo LIKE 'data:%'`

router.get('/', exigeSessao, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT count(*)::int AS n FROM obra_anexo WHERE ${noBanco()}`, [TIPO_LINK])
    return res.json({
      configurado: sharepointConfigurado(),
      anexosNoBanco: rows[0].n,
      pastas: { anexos: PASTA_ANEXOS, reembolso: `${PASTA_REEMBOLSO} / ${PLANILHA_REEMBOLSO}` },
    })
  } catch (e) {
    return tratar(e, res, 'sharepoint/estado')
  }
})

/* poucos por vez: cada um sobe inteiro, e a Vercel corta a chamada em 60s */
const POR_VEZ = 15

router.post('/anexos', exigeSessao, soAcessoTotal, async (req, res) => {
  if (!sharepointConfigurado()) return res.status(503).json({ erro: 'O SharePoint ainda não foi configurado no servidor.' })
  try {
    const { rows } = await query(
      `SELECT a.id, a.obra_id, a.nome, a.tipo, a.conteudo, o.criado_em, o.proposta, c.nome AS cliente
         FROM obra_anexo a
         JOIN obra o      ON o.id = a.obra_id
         LEFT JOIN cliente c ON c.id = o.cliente_id
        WHERE ${noBanco('a.')}
        ORDER BY a.id
        LIMIT ${POR_VEZ}`,
      [TIPO_LINK],
    )
    let movidos = 0
    const falhas = []
    for (const a of rows) {
      const arquivo = bytesDoDataUrl(a.conteudo)
      if (!arquivo) continue
      try {
        const salvo = await guardarAnexoDaObra({
          obraNome: [a.cliente, a.proposta].filter(Boolean).join(' - ') || `Obra ${a.obra_id}`,
          obraCriadaEm: a.criado_em,
          nome: a.nome,
          tipo: a.tipo || arquivo.tipo,
          bytes: arquivo.bytes,
        })
        await query('UPDATE obra_anexo SET tipo = $2, conteudo = $3, tamanho = $4 WHERE id = $1', [
          a.id,
          TIPO_LINK,
          salvo.webUrl,
          salvo.tamanho,
        ])
        movidos += 1
      } catch (erro) {
        logger.error('sharepoint/mover', `anexo ${a.id}: ${erro.message}`)
        falhas.push(`${a.nome}: ${erro.message}`)
      }
    }
    if (movidos > 0) {
      await registrarAtividade(req, {
        acao: 'anexo.sharepoint',
        categoria: 'documento',
        entidade: ['sharepoint', 'anexos'],
        descricao: 'Anexos de obra levados para o SharePoint',
        detalhes: { arquivo: `${movidos} arquivo(s)` },
      })
    }
    const { rows: resto } = await query(`SELECT count(*)::int AS n FROM obra_anexo WHERE ${noBanco()}`, [TIPO_LINK])
    return res.json({ movidos, falhas, restam: resto[0].n })
  } catch (e) {
    return tratar(e, res, 'sharepoint/anexos')
  }
})

router.post('/reembolso', exigeSessao, soAcessoTotal, async (_req, res) => {
  if (!sharepointConfigurado()) return res.status(503).json({ erro: 'O SharePoint ainda não foi configurado no servidor.' })
  const url = await atualizarPlanilhaNoSharePoint()
  if (!url) return res.status(502).json({ erro: 'Não foi possível gravar a planilha no SharePoint. Tente de novo em instantes.' })
  return res.json({ url })
})

export default router
