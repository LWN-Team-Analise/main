import { useEffect, useMemo, useState } from 'react'
import { CATEGORIAS, CHAVES_CATEGORIA, rotuloDoTipo } from '@/domain/despesas'
import * as despesasApi from '@/services/despesasService'
import { reais } from '@/utils/formato'
import { Colunas, Linha, Rosca } from './graficos'
import Tile from './Tile'

/* ============================================================
   DESPESAS no Dashboard

   Quanto a empresa gastou no periodo das setas do topo — o mes dia
   a dia, ou o ano mes a mes, igual aos graficos de obra:

     os quatro numeros   o total e cada categoria (despesa, refeicao
                         e bonus), com quantos envios;
     a linha             as tres categorias ao longo do periodo;
     a rosca             como o total se divide entre elas;
     tres colunas        cada categoria aberta pelos tipos dela
                         (combustivel, almoco, bonus viagem...).

   Os numeros vem de /despesas/painel, que so devolve SOMAS por dia,
   categoria e tipo — nunca quem gastou. O Dashboard e de quem tem
   `ver_dashboard`, e ver o gasto da empresa nao e ver o gasto de cada
   pessoa (isso continua sendo de quem revisa, em Envios gerais).
   ============================================================ */

/* a cor de cada categoria — o mesmo tom da aba Despesas */
const COR = {
  despesa: 'var(--gr-despesa)',
  refeicao: 'var(--gr-refeicao)',
  bonus: 'var(--gr-bonus)',
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

/** R$ 1.234,56 -> "1,2 mil": o que cabe em cima de uma coluna estreita. */
function reaisCurto(valor) {
  if (valor >= 1000) {
    const mil = Math.round(valor / 100) / 10
    return `${String(mil).replace('.', ',')} mil`
  }
  return String(Math.round(valor))
}

/** O primeiro e o ultimo dia que as fatias cobrem ('AAAA-MM-DD', inclusive). */
function limites(fatias, passo) {
  if (fatias.length === 0) return null
  if (passo !== 'ano') return { de: fatias[0], ate: fatias[fatias.length - 1] }
  const ultimo = fatias[fatias.length - 1]
  const [ano, mes] = ultimo.split('-').map(Number)
  const dias = new Date(ano, mes, 0).getDate()
  return { de: `${fatias[0]}-01`, ate: `${ultimo}-${String(dias).padStart(2, '0')}` }
}

export default function PainelDespesas({ fatias, passo, rotuloDaFatia }) {
  const [linhas, setLinhas] = useState(null)
  const [erro, setErro] = useState('')

  const periodo = limites(fatias, passo)
  const de = periodo?.de
  const ate = periodo?.ate

  useEffect(() => {
    if (!de) return undefined
    let vivo = true
    setErro('')
    despesasApi
      .carregarPainel({ de, ate })
      .then((resposta) => vivo && setLinhas(resposta))
      .catch((e) => {
        if (!vivo) return
        setErro(e.message)
        setLinhas([])
      })
    return () => {
      vivo = false
    }
  }, [de, ate])

  const contas = useMemo(() => {
    if (!linhas) return null
    /* a linha da API e por DIA; no passo anual ela cai no mes dela */
    const fatiaDe = (data) => (passo === 'ano' ? data.slice(0, 7) : data)

    const porCategoria = Object.fromEntries(
      CHAVES_CATEGORIA.map((c) => [c, { total: 0, quantidade: 0 }]),
    )
    const porTipo = {}
    const porFatia = Object.fromEntries(
      CHAVES_CATEGORIA.map((c) => [c, Object.fromEntries(fatias.map((f) => [f, 0]))]),
    )

    linhas.forEach((l) => {
      if (!porCategoria[l.categoria]) return
      porCategoria[l.categoria].total += l.total
      porCategoria[l.categoria].quantidade += l.quantidade
      porTipo[l.tipo] = (porTipo[l.tipo] ?? 0) + l.total
      const f = fatiaDe(l.data)
      if (f in porFatia[l.categoria]) porFatia[l.categoria][f] += l.total
    })

    const total = CHAVES_CATEGORIA.reduce((s, c) => s + porCategoria[c].total, 0)
    const quantidade = CHAVES_CATEGORIA.reduce((s, c) => s + porCategoria[c].quantidade, 0)

    return {
      total,
      quantidade,
      porCategoria,
      series: CHAVES_CATEGORIA.map((c) => ({
        chave: c,
        rotulo: CATEGORIAS[c].plural,
        cor: COR[c],
        /* dia sem gasto e R$ 0,00 de verdade — aqui zero e um dado */
        pontos: fatias.map((f) => Math.round(porFatia[c][f] * 100) / 100),
        texto: (v) => reais(v),
      })),
      tipos: Object.fromEntries(
        CHAVES_CATEGORIA.map((c) => [
          c,
          CATEGORIAS[c].tipos.map((t) => {
            const valor = Math.round((porTipo[t.chave] ?? 0) * 100) / 100
            return {
              chave: t.chave,
              rotulo: rotuloDoTipo(t.chave),
              valor,
              texto: reais(valor),
              textoCurto: reaisCurto(valor),
              cor: COR[c],
            }
          }),
        ]),
      ),
    }
  }, [linhas, fatias, passo])

  const quando = passo === 'ano' ? 'no ano' : 'no mês'

  return (
    <section className="dash__secao" aria-label="Despesas, refeições e bônus">
      <h2 className="dash__titulo">Despesas, refeições e bônus</h2>

      {erro ? (
        <p className="cartao__vazio dash__aviso" role="alert">
          {erro}
        </p>
      ) : !contas ? (
        <p className="cartao__vazio dash__aviso">Carregando as despesas...</p>
      ) : (
        <>
          <div className="dash__tiles">
            <Tile
              rotulo={`Total ${quando}`}
              valor={reais(contas.total)}
              nota={plural(contas.quantidade, 'envio', 'envios')}
            />
            {CHAVES_CATEGORIA.map((c) => (
              <Tile
                key={c}
                rotulo={CATEGORIAS[c].plural}
                valor={reais(contas.porCategoria[c].total)}
                cor={COR[c]}
                nota={
                  contas.total > 0
                    ? `${plural(contas.porCategoria[c].quantidade, 'envio', 'envios')} · ${Math.round(
                        (contas.porCategoria[c].total / contas.total) * 100,
                      )}% do total`
                    : plural(contas.porCategoria[c].quantidade, 'envio', 'envios')
                }
              />
            ))}
          </div>

          {contas.quantidade === 0 ? (
            <p className="cartao__vazio dash__aviso">
              Nenhuma despesa, refeição ou bônus enviado {passo === 'ano' ? 'neste ano' : 'neste mês'}.
            </p>
          ) : (
            <div className="dash__grade">
              <section className="cartao cartao--largo vidro">
                <header className="cartao__topo">
                  <div>
                    <h2 className="cartao__titulo">Valor {passo === 'ano' ? 'por mês' : 'por dia'}</h2>
                  </div>
                </header>
                <div className="cartao__corpo">
                  <Linha
                    series={contas.series}
                    eixoX={fatias.map(rotuloDaFatia)}
                    unidade="R$"
                    alturaTotal={250}
                    larguraRotulo={passo === 'ano' ? 38 : 16}
                  />
                </div>
              </section>

              <section className="cartao cartao--estreito vidro">
                <header className="cartao__topo">
                  <div>
                    <h2 className="cartao__titulo">Divisão por categoria</h2>
                  </div>
                </header>
                <div className="cartao__corpo">
                  <Rosca
                    tamanho={196}
                    fatias={CHAVES_CATEGORIA.map((c) => ({
                      rotulo: CATEGORIAS[c].plural,
                      valor: contas.porCategoria[c].total,
                      texto: reais(contas.porCategoria[c].total),
                      cor: COR[c],
                    }))}
                    centro={{ valor: reaisCurto(contas.total), rotulo: `R$ ${quando}` }}
                    rodape={plural(contas.quantidade, 'envio', 'envios')}
                  />
                </div>
              </section>

              {CHAVES_CATEGORIA.map((c) => (
                <section key={c} className="cartao cartao--terco vidro">
                  <header className="cartao__topo">
                    <div>
                      <h2 className="cartao__titulo">{CATEGORIAS[c].plural} por tipo</h2>
                    </div>
                    <span className="cartao__selo" style={{ '--selo-cor': COR[c] }}>
                      {contas.porCategoria[c].quantidade}
                    </span>
                  </header>
                  <div className="cartao__corpo">
                    {contas.porCategoria[c].quantidade === 0 ? (
                      <p className="cartao__vazio">
                        Nenhum{c === 'bonus' ? '' : 'a'} {CATEGORIAS[c].rotulo.toLowerCase()} {quando}.
                      </p>
                    ) : (
                      <Colunas itens={contas.tipos[c]} eixo="R$" alturaTotal={230} />
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
