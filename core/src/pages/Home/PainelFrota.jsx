import { useEffect, useMemo, useState } from 'react'
import { useDados } from '@/context/DadosContext'
import * as frotasApi from '@/services/frotasService'
import { Colunas } from './graficos'
import Tile from './Tile'
import './PainelFrota.css'

/* ============================================================
   USO DA FROTA no Painel

   Os km rodados pelos carros da empresa, mes a mes, e quem mais
   dirigiu. Os numeros vem de /frotas/uso: cada viagem e uma saida (ou
   troca de condutor) ate o registro seguinte do mesmo carro, e conta no
   mes em que terminou.

   O periodo sao MESES, sempre: no passo anual, os doze meses do ano das
   setas; no passo mensal, os doze meses que terminam no mes das setas
   (km de um dia so nao diz nada sobre a frota).

     os quatro numeros   km rodados, o carro que mais rodou, quem mais
                         dirigiu e a media por viagem;
     colunas             km por mes (a frota inteira);
     colunas             quem mais usa (os seis que mais dirigiram);
     tabela              km por carro e por mes — onze carros num
                         grafico de onze cores ninguem distingue; na
                         tabela, o tom mais forte e o mes que mais rodou.
   ============================================================ */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloDoMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`

const COR_MES = 'var(--gr-c2)'
const COR_PESSOA = 'var(--gr-c3)'

/* quantas pessoas aparecem em "Quem mais usa" */
const PESSOAS = 6

const km = (n) => `${Math.round(n).toLocaleString('pt-BR')} km`
const kmCurto = (n) => (n >= 1000 ? `${String(Math.round(n / 100) / 10).replace('.', ',')} mil` : String(Math.round(n)))
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`
const primeiroNome = (nome) => String(nome ?? '').trim().split(/\s+/).slice(0, 2).join(' ')

/** Os doze meses ('AAAA-MM') do periodo das setas. */
function janela(fatias, passo) {
  if (fatias.length === 0) return null
  if (passo === 'ano') return { de: fatias[0].slice(0, 7), ate: fatias.at(-1).slice(0, 7) }
  const ate = fatias[0].slice(0, 7)
  let [a, m] = ate.split('-').map(Number)
  m -= 11
  while (m < 1) {
    m += 12
    a -= 1
  }
  return { de: `${a}-${String(m).padStart(2, '0')}`, ate }
}

/* a frota e de quem tem a aba Frotas: sem ela, a secao nem aparece */
export default function PainelFrota(props) {
  const { pode } = useDados()
  return pode('ver_frotas') ? <UsoDaFrota {...props} /> : null
}

function UsoDaFrota({ fatias, passo }) {
  const [uso, setUso] = useState(null)
  const [erro, setErro] = useState('')
  const periodo = janela(fatias, passo)
  const de = periodo?.de
  const ate = periodo?.ate

  useEffect(() => {
    if (!de) return undefined
    let vivo = true
    setErro('')
    frotasApi
      .carregarUso(de, ate)
      .then((resposta) => vivo && setUso(resposta))
      .catch((e) => {
        if (!vivo) return
        setErro(e.message)
        setUso(null)
      })
    return () => {
      vivo = false
    }
  }, [de, ate])

  const contas = useMemo(() => {
    if (!uso) return null
    const porMes = uso.meses.map((m) => uso.carros.reduce((s, c) => s + (c.km[m] ?? 0), 0))
    const maiorCelula = Math.max(1, ...uso.carros.flatMap((c) => uso.meses.map((m) => c.km[m] ?? 0)))
    return {
      porMes,
      maiorCelula,
      meses: uso.meses.map((m, i) => ({
        chave: m,
        rotulo: rotuloDoMes(m),
        valor: porMes[i],
        texto: km(porMes[i]),
        textoCurto: kmCurto(porMes[i]),
        cor: COR_MES,
      })),
      pessoas: uso.pessoas.slice(0, PESSOAS).map((p, i) => ({
        chave: p.id ?? `p${i}`,
        rotulo: primeiroNome(p.nome),
        titulo: p.nome,
        valor: Math.round(p.km),
        texto: `${km(p.km)} · ${plural(p.viagens, 'viagem', 'viagens')}`,
        textoCurto: kmCurto(p.km),
        cor: COR_PESSOA,
      })),
    }
  }, [uso])

  const quando = `de ${rotuloDoMes(de ?? '2000-01')} a ${rotuloDoMes(ate ?? '2000-01')}`

  return (
    <section className="dash__secao" aria-label="Uso da frota">
      <h2 className="dash__titulo">Uso da frota</h2>

      {erro ? (
        <p className="cartao__vazio dash__aviso" role="alert">
          {erro}
        </p>
      ) : !contas ? (
        <p className="cartao__vazio dash__aviso">Carregando o uso da frota...</p>
      ) : uso.viagens === 0 ? (
        <p className="cartao__vazio dash__aviso">Nenhuma viagem com os carros da frota {quando}.</p>
      ) : (
        <>
          <div className="dash__tiles">
            <Tile rotulo="Km rodados" valor={km(uso.total)} nota={`${plural(uso.viagens, 'viagem', 'viagens')} · ${quando}`} />
            <Tile
              rotulo="Carro que mais rodou"
              valor={uso.carros[0].nome}
              nota={`${km(uso.carros[0].total)} · ${plural(uso.carros[0].viagens, 'viagem', 'viagens')}`}
              cor={COR_MES}
            />
            <Tile
              rotulo="Quem mais dirigiu"
              valor={primeiroNome(uso.pessoas[0].nome)}
              nota={`${km(uso.pessoas[0].km)} · ${plural(uso.pessoas[0].viagens, 'viagem', 'viagens')}`}
              cor={COR_PESSOA}
            />
            <Tile rotulo="Média por viagem" valor={km(uso.total / uso.viagens)} nota="da saída até a devolução" />
          </div>

          <div className="dash__grade">
            <section className="cartao cartao--largo vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Km rodados por mês</h2>
                  <p className="cartao__sub">A frota inteira, {quando}</p>
                </div>
              </header>
              <div className="cartao__corpo">
                <Colunas itens={contas.meses} eixo="km" alturaTotal={250} />
              </div>
            </section>

            <section className="cartao cartao--estreito vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Quem mais usa</h2>
                  <p className="cartao__sub">Km dirigidos no período</p>
                </div>
              </header>
              <div className="cartao__corpo">
                <Colunas itens={contas.pessoas} eixo="km" alturaTotal={250} />
              </div>
            </section>

            <section className="cartao cartao--inteiro vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Km por carro e por mês</h2>
                  <p className="cartao__sub">Quanto mais forte o tom, mais o carro rodou naquele mês</p>
                </div>
              </header>
              <div className="cartao__corpo frotadash">
                <table className="frotadash__tabela">
                  <thead>
                    <tr>
                      <th scope="col">Carro</th>
                      {uso.meses.map((m) => (
                        <th key={m} scope="col">
                          {rotuloDoMes(m)}
                        </th>
                      ))}
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uso.carros.map((c) => (
                      <tr key={c.id}>
                        <th scope="row">{c.nome}</th>
                        {uso.meses.map((m) => {
                          const v = c.km[m] ?? 0
                          /* 0 a 100: o mes mais rodado de qualquer carro e o 100 */
                          const forca = v > 0 ? Math.max(8, Math.round((v / contas.maiorCelula) * 100)) : 0
                          return (
                            <td
                              key={m}
                              style={forca ? { '--forca': `${Math.round(forca * 0.6)}%` } : undefined}
                              data-vazio={v === 0 ? 'sim' : undefined}
                              title={`${c.nome} · ${rotuloDoMes(m)}: ${km(v)}`}
                            >
                              {v > 0 ? Math.round(v).toLocaleString('pt-BR') : '—'}
                            </td>
                          )
                        })}
                        <td className="frotadash__total">{Math.round(c.total).toLocaleString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Frota</th>
                      {contas.porMes.map((v, i) => (
                        <td key={uso.meses[i]}>{v > 0 ? Math.round(v).toLocaleString('pt-BR') : '—'}</td>
                      ))}
                      <td className="frotadash__total">{Math.round(uso.total).toLocaleString('pt-BR')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </div>

          <p className="frotadash__nota">
            Cada viagem vai da saída (ou troca de condutor) até o registro seguinte do carro e conta no mês em que
            terminou. Carro ainda na rua entra quando voltar. Viagens com KM voltando ou acima de 3.000 km ficam de
            fora: são erro de digitação.
          </p>
        </>
      )}
    </section>
  )
}
