import { Router } from 'express'
import { query } from './db.js'
import { exigeSessao, tratar } from './sessao.js'
import { logger } from './logger.js'
import { lerTudo } from './routes/dados.js'
import { lerEquipe } from './routes/equipe.js'
import { lerRoteiro } from './routes/roteiro.js'

/* ============================================================
   A CARGA — tudo o que a tela guarda, numa ida so

   Antes, cada gravacao (criar, editar, excluir, marcar) era seguida de
   CINCO leituras separadas — quadro, cargos, titulos, usuarios e
   roteiro —, e a tela so fechava o pop-up depois da ultima. Cada uma
   era uma chamada propria a funcao da Vercel, com a propria conexao ao
   banco, e o quadro trazia junto a logo e a capa de todos os clientes
   (~1 MB) mesmo quando ninguem tinha mexido nelas.

   Agora sao dois caminhos, e nenhum deles repete imagem:

     GET /api/carga            a carga inteira numa chamada. ?imagens=0
                               e a LEVE: sem as logos, as capas e as
                               fotos — so a versao (md5) de cada uma.
     carga junto da resposta   a gravacao que chega com o cabecalho
                               `X-Carga: leve` volta com a carga leve
                               em `__carga`, lida DEPOIS de gravar.
                               Gravar e reler viram uma ida so.

   A tela reaproveita as imagens que ja tem quando a versao bate; as
   que mudaram (ou de cliente novo) ela busca em /api/carga/imagens.
   ============================================================ */

export async function lerCarga(usuarioId, { imagens = true } = {}) {
  const [quadro, equipe, roteiro] = await Promise.all([
    lerTudo(usuarioId, { imagens }),
    lerEquipe(usuarioId, { imagens }),
    lerRoteiro(),
  ])
  return { quadro, equipe, roteiro }
}

/**
 * A carga leve junto da resposta de uma gravacao.
 *
 * So entra quando a tela pede (`X-Carga: leve`), so em gravacao (nao
 * GET), so com sessao e so em resposta de sucesso que ja e um objeto
 * JSON. Se a leitura falhar, a resposta sai sem a carga — e a tela relê
 * pelo caminho de sempre. A gravacao nunca e desfeita por causa dela.
 */
export function cargaJunto(req, res, next) {
  if (req.method === 'GET' || req.get('x-carga') !== 'leve') return next()

  const enviar = res.json.bind(res)
  const terminar = res.end.bind(res)

  res.json = (corpo) => {
    const usuarioId = req.dono?.sub
    const serve =
      usuarioId && res.statusCode < 400 && corpo && typeof corpo === 'object' && !Array.isArray(corpo)
    if (!serve) return enviar(corpo)

    lerCarga(usuarioId, { imagens: false })
      .then((carga) => enviar({ ...corpo, __carga: carga }))
      .catch((erro) => {
        logger.error('carga/junto', erro.message, { code: erro.code })
        enviar(corpo)
      })
    return res
  }

  /* A exclusao responde 204, sem corpo. Ela vira 200 com so a carga — e
     a tela recebe o mesmo {} de antes (src/services/api.js tira a carga
     do corpo). O res.json acima termina chamando res.end COM o corpo:
     esse passa direto. */
  res.end = (...args) => {
    const usuarioId = req.dono?.sub
    if (res.statusCode !== 204 || args.length || !usuarioId) return terminar(...args)

    res.status(200)
    lerCarga(usuarioId, { imagens: false })
      .then((carga) => enviar({ __carga: carga }))
      .catch((erro) => {
        logger.error('carga/junto', erro.message, { code: erro.code })
        res.status(204)
        terminar()
      })
    return res
  }
  return next()
}

const router = Router()

router.get('/', exigeSessao, async (req, res) => {
  try {
    const imagens = req.query.imagens !== '0'
    return res.json(await lerCarga(req.dono.sub, { imagens }))
  } catch (erro) {
    return tratar(erro, res, 'carga/ler')
  }
})

/** "1,2,3" -> ['1', '2', '3'], so numeros, no maximo 500. */
function listaDeIds(texto) {
  return String(texto ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, 500)
}

/**
 * As imagens que a tela ainda nao tem: as logos e capas de
 * ?clientes=1,2 e as fotos de ?usuarios=3,4.
 */
router.get('/imagens', exigeSessao, async (req, res) => {
  try {
    const clientes = listaDeIds(req.query.clientes)
    const usuarios = listaDeIds(req.query.usuarios)
    const [c, u] = await Promise.all([
      clientes.length
        ? query(
            `SELECT id, logo, capa,
                    md5(coalesce(logo, '') || '|' || coalesce(capa, '')) AS imagem_versao
               FROM cliente WHERE id = ANY($1::bigint[])`,
            [clientes],
          )
        : { rows: [] },
      usuarios.length
        ? query(
            `SELECT id, foto, md5(coalesce(foto, '')) AS foto_versao
               FROM usuario WHERE id = ANY($1::bigint[])`,
            [usuarios],
          )
        : { rows: [] },
    ])
    return res.json({
      clientes: c.rows.map((l) => ({
        id: String(l.id),
        logo: l.logo,
        capa: l.capa ?? null,
        imagemVersao: l.imagem_versao,
      })),
      usuarios: u.rows.map((l) => ({ id: String(l.id), foto: l.foto, fotoVersao: l.foto_versao })),
    })
  } catch (erro) {
    return tratar(erro, res, 'carga/imagens')
  }
})

export default router
