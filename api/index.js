/**
 * A porta de entrada da API da Atmosfera LWN (lwnengenharia.com.br/core) na
 * Vercel.
 *
 * Tudo que chega em /api/... cai aqui (o desvio esta no vercel.json) e
 * segue para o mesmo `app` do Express que roda na maquina local. Este
 * arquivo nao tem logica propria de proposito: no dia em que ele tiver,
 * producao e desenvolvimento passam a se comportar diferente, e a
 * diferenca so aparece depois do deploy.
 */
export { default } from '../core/server/app.js'
