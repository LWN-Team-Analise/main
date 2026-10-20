import { Router } from 'express'
import { query } from '../db.js'
import { exigeSessao, tratar } from '../sessao.js'

/* ============================================================
   /api/presenca — quem esta no site agora (db/atualizacao-28.sql.txt)

     POST /      { aba, visivel } — esta aba esta aberta (e visivel
                 ou em segundo plano). A tela manda a cada minuto e na
                 hora em que a aba muda de visibilidade
     POST /sair  { aba } — a aba fechou: some na hora, sem esperar o
                 prazo vencer
     GET  /      { presenca: { [usuarioId]: 'ativo' | 'segundo_plano' } }
                 — quem nao aparece esta offline

   O prazo e contado pelo relogio do BANCO (now()), nunca pelo do
   navegador: um computador com a hora errada nao deixa ninguem verde
   para sempre.
   ============================================================ */

const router = Router()

/* Sem aviso ha mais que isto, a aba conta como fechada. O aviso sai a
   cada minuto; com a aba em segundo plano o navegador atrasa os
   relogios (o Chrome junta tudo de minuto em minuto), entao a folga e
   de tres. */
const PRAZO = '3 minutes'

/* linhas mortas (aba que fechou sem conseguir avisar: queda de
   energia, notebook fechado) saem de vez em quando, junto de um aviso */
const LIMPAR_CHANCE = 0.05

const abaValida = (aba) => /^[a-z0-9-]{8,64}$/i.test(String(aba ?? ''))

router.post('/', exigeSessao, async (req, res) => {
  const aba = String(req.body?.aba ?? '')
  if (!abaValida(aba)) return res.status(400).json({ erro: 'Aba inválida.' })
  try {
    await query(
      `INSERT INTO presenca (usuario_id, aba, visivel, visto_em)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (usuario_id, aba) DO UPDATE
          SET visivel = EXCLUDED.visivel, visto_em = now()`,
      [req.dono.sub, aba, req.body?.visivel !== false],
    )
    if (Math.random() < LIMPAR_CHANCE) {
      await query(`DELETE FROM presenca WHERE visto_em < now() - interval '1 day'`)
    }
    return res.status(204).end()
  } catch (e) {
    /* sem a tabela (atualizacao 28 ainda nao rodou), a bolinha so nao
       aparece — o resto do sistema segue */
    if (e.code === '42P01') return res.status(204).end()
    return tratar(e, res, 'presenca/aviso')
  }
})

router.post('/sair', exigeSessao, async (req, res) => {
  const aba = String(req.body?.aba ?? '')
  if (!abaValida(aba)) return res.status(204).end()
  try {
    await query('DELETE FROM presenca WHERE usuario_id = $1 AND aba = $2', [req.dono.sub, aba])
    return res.status(204).end()
  } catch (e) {
    if (e.code === '42P01') return res.status(204).end()
    return tratar(e, res, 'presenca/sair')
  }
})

router.get('/', exigeSessao, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT usuario_id, bool_or(visivel) AS visivel
         FROM presenca
        WHERE visto_em > now() - interval '${PRAZO}'
        GROUP BY usuario_id`,
    )
    const presenca = {}
    rows.forEach((l) => {
      presenca[String(l.usuario_id)] = l.visivel ? 'ativo' : 'segundo_plano'
    })
    return res.json({ presenca })
  } catch (e) {
    if (e.code === '42P01') return res.json({ presenca: {} })
    return tratar(e, res, 'presenca/ler')
  }
})

export default router
