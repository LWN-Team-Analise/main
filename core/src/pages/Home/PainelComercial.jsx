import { useEffect, useMemo, useState } from 'react'
import { FUNIS, somaPorMoeda, valorCurto } from '@/domain/comercial'
import * as comercial from '@/services/comercialService'
import { Colunas, Linha, Rosca } from './graficos'
import Tile from './Tile'
/* o ranking e os motivos usam as listas do painel da Excelencia */
import './PainelExcelencia.css'

/* ============================================================
   COMERCIAL no Painel

   Os negocios da aba Comercial, no periodo das setas do topo — o mes
   dia a dia, ou o ano mes a mes, igual aos outros graficos:

     os numeros          em negociacao (os em aberto agora); vendidos
                         (ganhos) e cancelados (perdidos) no periodo,
                         com a taxa de ganho; o ticket medio e o cliente
                         com o maior pagamento (atualizacao 59);
     a linha             ganhos e perdidos ao longo do periodo, pela
                         data em que foram fechados;
     a rosca             os em aberto, por funil;
     as colunas          o valor em aberto, por funil;
     o ranking           os 10 clientes mais recorrentes (mais negocios
                         vendidos no periodo) e os motivos de
                         desistencia dos cancelados (atualizacao 59).

   Valor so soma REAIS: negocio em dolar ou euro aparece a parte na
   nota ("+ US$ 5.000"), e fica fora das colunas — somar moedas
   diferentes daria um numero falso.

   So aparece para quem ve o Comercial (`ver_comercial`): a API dos
   negocios confere a mesma permissao.
   ============================================================ */

/* uma cor por funil, na ordem fixa da paleta dos graficos */
const COR_FUNIL = {
  novos: 'var(--gr-c1)',
  renovacao: 'var(--gr-c2)',
  resgate: 'var(--gr-c4)',
  prospeccao: 'var(--gr-c3)',
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

/** R$ 1.234 -> "1,2 mil": o que cabe em cima de uma coluna estreita. */
function reaisCurto(valor) {
  if (valor >= 1000) {
    const mil = Math.round(valor / 100) / 10
    return `${String(mil).replace('.', ',')} mil`
  }
  return String(Math.round(valor))
}

/** A data local ('AAAA-MM-DD') de um carimbo. */
function diaDe(carimbo) {
  const d = new Date(carimbo)
  if (Number.isNaN(d.getTime())) return null
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function PainelComercial({ fatias, passo, rotuloDaFatia }) {
  const [negocios, setNegocios] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    comercial
      .carregarNegocios(null)
      .then((r) => vivo && setNegocios(r.negocios ?? []))
      .catch((e) => {
        if (!vivo) return
        setErro(e.message)
        setNegocios([])
      })
    return () => {
      vivo = false
    }
  }, [])

  const contas = useMemo(() => {
    if (!negocios) return null
    const fatiaDe = (dia) => (passo === 'ano' ? dia.slice(0, 7) : dia)
    const noPeriodo = new Set(fatias)

    const abertos = negocios.filter((n) => n.status === 'aberto')
    const fechados = negocios.filter((n) => {
      if (n.status === 'aberto' || !n.fechadoEm) return false
      const dia = diaDe(n.fechadoEm)
      return dia && noPeriodo.has(fatiaDe(dia))
    })
    const ganhos = fechados.filter((n) => n.status === 'ganho')
    const perdidos = fechados.filter((n) => n.status === 'perdido')

    const porFatia = (lista) => {
      const conta = Object.fromEntries(fatias.map((f) => [f, 0]))
      lista.forEach((n) => {
        const f = fatiaDe(diaDe(n.fechadoEm))
        if (f in conta) conta[f] += 1
      })
      return fatias.map((f) => conta[f])
    }

    const emReais = (lista) => lista.filter((n) => (n.moeda ?? 'BRL') === 'BRL')
    const abertosPorFunil = FUNIS.map((f) => {
      const doFunil = abertos.filter((n) => n.funil === f.id)
      const valor = emReais(doFunil).reduce((s, n) => s + Number(n.valor || 0), 0)
      return { funil: f, quantidade: doFunil.length, valor }
    })

    /* o ticket medio e os clientes: so o vendido em reais entra no valor */
    const vendidoEmReais = emReais(ganhos)
    const somaVendida = vendidoEmReais.reduce((s, n) => s + Number(n.valor || 0), 0)
    const porCliente = new Map()
    ganhos.forEach((n) => {
      const chave = n.clienteId ?? `nome:${(n.organizacao || '').trim().toLowerCase()}`
      const atual = porCliente.get(chave) ?? { chave, nome: n.organizacao || 'Sem cliente', vendas: 0, valor: 0 }
      atual.vendas += 1
      if ((n.moeda ?? 'BRL') === 'BRL') atual.valor += Number(n.valor || 0)
      porCliente.set(chave, atual)
    })
    const clientes = [...porCliente.values()]
    /* os motivos de desistencia: o mesmo texto, com outra caixa, e um so */
    const porMotivo = new Map()
    perdidos.forEach((n) => {
      const texto = (n.motivoPerda || '').trim()
      const chave = texto.toLowerCase() || '—'
      const atual = porMotivo.get(chave) ?? { chave, rotulo: texto || 'Sem motivo informado', quantidade: 0 }
      atual.quantidade += 1
      porMotivo.set(chave, atual)
    })

    return {
      abertos,
      ganhos,
      perdidos,
      ticket: vendidoEmReais.length ? somaVendida / vendidoEmReais.length : null,
      maiorPagamento: [...clientes].sort((a, b) => b.valor - a.valor)[0] ?? null,
      recorrentes: [...clientes].sort((a, b) => b.vendas - a.vendas || b.valor - a.valor).slice(0, 10),
      motivos: [...porMotivo.values()].sort((a, b) => b.quantidade - a.quantidade),
      taxa: ganhos.length + perdidos.length ? Math.round((ganhos.length / (ganhos.length + perdidos.length)) * 100) : null,
      series: [
        { chave: 'ganho', rotulo: 'Ganhos', cor: 'var(--gr-bom)', pontos: porFatia(ganhos), texto: (v) => plural(v, 'negócio', 'negócios') },
        { chave: 'perdido', rotulo: 'Perdidos', cor: 'var(--gr-ruim)', pontos: porFatia(perdidos), texto: (v) => plural(v, 'negócio', 'negócios') },
      ],
      abertosPorFunil,
    }
  }, [negocios, fatias, passo])

  const quando = passo === 'ano' ? 'no ano' : 'no mês'

  return (
    <section className="dash__secao" aria-label="Comercial">
      <h2 className="dash__titulo">Comercial</h2>

      {erro ? (
        <p className="cartao__vazio dash__aviso" role="alert">
          {erro}
        </p>
      ) : !contas ? (
        <p className="cartao__vazio dash__aviso">Carregando os negócios...</p>
      ) : (
        <>
          <div className="dash__tiles">
            <Tile
              rotulo="Em negociação"
              valor={String(contas.abertos.length)}
              nota={contas.abertos.length ? somaPorMoeda(contas.abertos) : 'nenhum negócio aberto'}
            />
            <Tile
              rotulo={`Vendidos ${quando}`}
              valor={String(contas.ganhos.length)}
              cor="var(--gr-bom)"
              nota={
                contas.ganhos.length
                  ? `${somaPorMoeda(contas.ganhos)}${contas.taxa === null ? '' : ` · ${contas.taxa}% de ganho`}`
                  : 'nenhum vendido ainda'
              }
            />
            <Tile
              rotulo={`Cancelados ${quando}`}
              valor={String(contas.perdidos.length)}
              cor="var(--gr-ruim)"
              nota={contas.perdidos.length ? somaPorMoeda(contas.perdidos) : 'nenhum cancelado'}
            />
            <Tile
              rotulo="Ticket médio"
              valor={contas.ticket === null ? '—' : valorCurto(contas.ticket)}
              nota={contas.ticket === null ? `nenhuma venda em reais ${quando}` : `dos vendidos em reais ${quando}`}
            />
            <Tile
              rotulo="Cliente com maior pagamento"
              valor={contas.maiorPagamento?.valor ? contas.maiorPagamento.nome : '—'}
              nota={contas.maiorPagamento?.valor ? `${valorCurto(contas.maiorPagamento.valor)} vendidos ${quando}` : `nenhuma venda ${quando}`}
            />
          </div>

          <div className="dash__grade">
            <section className="cartao cartao--largo vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Ganhos e perdidos {passo === 'ano' ? 'por mês' : 'por dia'}</h2>
                </div>
              </header>
              <div className="cartao__corpo">
                {contas.ganhos.length + contas.perdidos.length === 0 ? (
                  <p className="cartao__vazio">
                    Nenhum negócio ganho ou perdido {passo === 'ano' ? 'neste ano' : 'neste mês'}.
                  </p>
                ) : (
                  <Linha
                    series={contas.series}
                    eixoX={fatias.map(rotuloDaFatia)}
                    alturaTotal={250}
                    larguraRotulo={passo === 'ano' ? 38 : 16}
                  />
                )}
              </div>
            </section>

            <section className="cartao cartao--estreito vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Em aberto por funil</h2>
                </div>
              </header>
              <div className="cartao__corpo">
                {contas.abertos.length === 0 ? (
                  <p className="cartao__vazio">Nenhum negócio aberto.</p>
                ) : (
                  <Rosca
                    tamanho={196}
                    fatias={contas.abertosPorFunil.map(({ funil, quantidade }) => ({
                      rotulo: funil.rotulo,
                      valor: quantidade,
                      texto: plural(quantidade, 'negócio', 'negócios'),
                      cor: COR_FUNIL[funil.id],
                    }))}
                    centro={{ valor: String(contas.abertos.length), rotulo: 'em aberto' }}
                  />
                )}
              </div>
            </section>

            <section className="cartao vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Valor em aberto por funil</h2>
                  <p className="cartao__sub">Só os negócios em reais</p>
                </div>
              </header>
              <div className="cartao__corpo">
                {contas.abertosPorFunil.every((f) => f.valor === 0) ? (
                  <p className="cartao__vazio">Nenhum valor em reais nos negócios abertos.</p>
                ) : (
                  <Colunas
                    itens={contas.abertosPorFunil.map(({ funil, valor }) => ({
                      chave: funil.id,
                      rotulo: funil.rotulo,
                      valor,
                      texto: valorCurto(valor),
                      textoCurto: reaisCurto(valor),
                      cor: COR_FUNIL[funil.id],
                    }))}
                    eixo="R$"
                    alturaTotal={240}
                  />
                )}
              </div>
            </section>

            <section className="cartao cartao--metade vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Clientes mais recorrentes</h2>
                  <p className="cartao__sub">Os 10 com mais negócios vendidos {quando}</p>
                </div>
              </header>
              <div className="cartao__corpo">
                {contas.recorrentes.length === 0 ? (
                  <p className="cartao__vazio">Nenhum negócio vendido {quando}.</p>
                ) : (
                  <ol className="excdash__ranking">
                    {contas.recorrentes.map((c, i) => (
                      <li key={c.chave} style={{ '--barra': 'var(--gr-bom)' }}>
                        <span className="excdash__posicao">{i + 1}º</span>
                        <span className="excdash__nome" title={c.nome}>
                          {c.nome}
                        </span>
                        <span className="excdash__numeros">
                          {plural(c.vendas, 'venda', 'vendas')}
                          {c.valor ? ` · ${valorCurto(c.valor)}` : ''}
                        </span>
                        <span className="excdash__barra" aria-hidden="true">
                          <i style={{ width: `${Math.round((c.vendas / contas.recorrentes[0].vendas) * 100)}%` }} />
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            <section className="cartao cartao--metade vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Motivos de desistência</h2>
                  <p className="cartao__sub">Dos negócios cancelados {quando}</p>
                </div>
              </header>
              <div className="cartao__corpo">
                {contas.motivos.length === 0 ? (
                  <p className="cartao__vazio">Nenhum negócio cancelado {quando}.</p>
                ) : (
                  <ol className="excdash__ranking">
                    {contas.motivos.map((m, i) => (
                      <li key={m.chave} style={{ '--barra': 'var(--gr-ruim)' }}>
                        <span className="excdash__posicao">{i + 1}º</span>
                        <span className="excdash__nome" title={m.rotulo}>
                          {m.rotulo}
                        </span>
                        <span className="excdash__numeros">
                          {plural(m.quantidade, 'negócio', 'negócios')} ·{' '}
                          {Math.round((m.quantidade / contas.perdidos.length) * 100)}%
                        </span>
                        <span className="excdash__barra" aria-hidden="true">
                          <i style={{ width: `${Math.round((m.quantidade / contas.motivos[0].quantidade) * 100)}%` }} />
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  )
}
