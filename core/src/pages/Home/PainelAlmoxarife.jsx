import { useEffect, useMemo, useState } from 'react'
import { useDados } from '@/context/DadosContext'
import * as almoxarifeApi from '@/services/almoxarifeService'
import { reais } from '@/utils/formato'
import { Colunas, Linha, Rosca } from './graficos'
import Tile from './Tile'

/* ============================================================
   ALMOXARIFE no Dashboard

   Era o "Dashboard PowerBI" do lwncontrol (powerbi.js). Saiu da tela do
   Almoxarife e veio para ca, com as mesmas contas, no periodo das setas
   do topo — o mes dia a dia, ou o ano mes a mes:

     os numeros    as O.S. do periodo, as baias em campo agora, a
                   despesa com ferramentas novas, com calibracao e com
                   manutencao, e as obras fora de Sao Paulo;
     as linhas     O.S. no periodo e as tres despesas;
     as colunas    os responsaveis que mais foram a campo e os ativos
                   mais pedidos;
     as roscas     O.S. concluidas x canceladas e a situacao da
                   calibracao do inventario (hoje, nao do periodo).

   A data da O.S. e a do fim (ou do inicio, ou da criacao), como no
   lwncontrol. Os numeros vem de GET /api/almox/painel, sem arquivo
   nenhum de certificado ou comprovante.
   ============================================================ */

const COR = {
  os: 'var(--gr-c1)',
  ferramentas: 'var(--gr-c2)',
  calibracao: 'var(--gr-c3)',
  manutencao: 'var(--gr-c4)',
  pessoa: 'var(--gr-c5)',
  ativo: 'var(--gr-c6)',
  concluida: 'var(--gr-bom)',
  cancelada: 'var(--gr-ruim)',
}

const DESPESAS = [
  { chave: 'ferramentas', rotulo: 'Ferramentas novas' },
  { chave: 'calibracao', rotulo: 'Calibração' },
  { chave: 'manutencao', rotulo: 'Manutenção' },
]

/* as faixas da tela de Calibracao do lwncontrol */
const FAIXAS = [
  { chave: 'ok', rotulo: 'OK (30 dias ou mais)', cor: 'var(--gr-bom)' },
  { chave: 'alerta', rotulo: 'Alerta (15 a 29 dias)', cor: 'var(--gr-c3)' },
  { chave: 'vencido', rotulo: 'Vencido (menos de 15 dias)', cor: 'var(--gr-ruim)' },
  { chave: 'em_calibracao', rotulo: 'Em calibração', cor: 'var(--gr-c2)' },
]

/* quantos aparecem nas colunas */
const TOPO = 8

const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`
const primeiroNome = (nome) => String(nome ?? '').trim().split(/\s+/).slice(0, 2).join(' ')

/** R$ 1.234,56 -> "1,2 mil": o que cabe em cima de uma coluna estreita. */
function reaisCurto(valor) {
  if (valor >= 1000) return `${String(Math.round(valor / 100) / 10).replace('.', ',')} mil`
  return String(Math.round(valor))
}

/* as ferramentas "sem calibração" ficam no navegador de quem marcou, na
   tela do Almoxarife (localStorage 'lwn_sem_calibracao', como no
   lwncontrol): saem da conta da calibracao aqui tambem */
function isentas() {
  try {
    const lista = JSON.parse(localStorage.getItem('lwn_sem_calibracao') || '[]')
    return new Set((Array.isArray(lista) ? lista : []).map(String))
  } catch {
    return new Set()
  }
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

/* o painel e de quem tem o Almoxarife e o Dashboard dele marcados no setor */
export default function PainelAlmoxarife(props) {
  const { pode } = useDados()
  return pode('ver_almoxarife') && pode('almox_relatorios') ? <Almoxarife {...props} /> : null
}

function Almoxarife({ fatias, passo, rotuloDaFatia }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    almoxarifeApi
      .carregarPainel()
      .then((resposta) => vivo && setDados(resposta))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [])

  const contas = useMemo(() => {
    const periodo = limites(fatias, passo)
    if (!dados || !periodo) return null
    const noPeriodo = (data) => data >= periodo.de && data <= periodo.ate
    const fatiaDe = (data) => (passo === 'ano' ? data.slice(0, 7) : data)
    const zerado = () => Object.fromEntries(fatias.map((f) => [f, 0]))

    const os = dados.os.filter((o) => noPeriodo(o.data))
    const osPorFatia = zerado()
    os.forEach((o) => {
      const f = fatiaDe(o.data)
      if (f in osPorFatia) osPorFatia[f] += 1
    })

    const despesas = Object.fromEntries(
      DESPESAS.map(({ chave }) => {
        const eventos = (dados.despesas[chave] ?? []).filter((e) => noPeriodo(e.data))
        const porFatia = zerado()
        eventos.forEach((e) => {
          const f = fatiaDe(e.data)
          if (f in porFatia) porFatia[f] += e.valor
        })
        return [chave, { total: eventos.reduce((s, e) => s + e.valor, 0), quantidade: eventos.length, porFatia }]
      }),
    )

    const contar = (lista, chaveDe) => {
      const mapa = new Map()
      lista.forEach((item) => [chaveDe(item)].flat().forEach((k) => k && mapa.set(k, (mapa.get(k) ?? 0) + 1)))
      return [...mapa.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'pt-BR'))
    }

    const fora = os.filter((o) => o.uf && o.uf !== 'SP')
    const semIsentas = isentas()
    const faixas = Object.fromEntries(FAIXAS.map((f) => [f.chave, 0]))
    dados.calibracao.forEach((c) => {
      if (!semIsentas.has(String(c.id)) && c.faixa in faixas) faixas[c.faixa] += 1
    })

    return {
      os,
      osSerie: [
        {
          chave: 'os',
          rotulo: 'Ordens de serviço',
          cor: COR.os,
          pontos: fatias.map((f) => osPorFatia[f]),
          texto: (v) => plural(v, 'OS', 'OS'),
        },
      ],
      despesas,
      despesasSerie: DESPESAS.map(({ chave, rotulo }) => ({
        chave,
        rotulo,
        cor: COR[chave],
        pontos: fatias.map((f) => Math.round(despesas[chave].porFatia[f] * 100) / 100),
        texto: (v) => reais(v),
      })),
      responsaveis: contar(os, (o) => o.responsavel)
        .slice(0, TOPO)
        .map(([nome, n]) => ({
          chave: nome,
          rotulo: primeiroNome(nome),
          titulo: nome,
          valor: n,
          texto: plural(n, 'OS', 'OS'),
          textoCurto: String(n),
          cor: COR.pessoa,
        })),
      ativos: contar(os, (o) => o.tipos)
        .slice(0, TOPO)
        .map(([tipo, n]) => ({
          chave: tipo,
          rotulo: tipo,
          valor: n,
          texto: plural(n, 'OS', 'OS'),
          textoCurto: String(n),
          cor: COR.ativo,
        })),
      concluidas: os.filter((o) => o.status === 'concluida').length,
      canceladas: os.filter((o) => o.status === 'cancelada').length,
      fora: fora.length,
      ufs: contar(fora, (o) => o.uf),
      faixas,
      totalFaixas: Object.values(faixas).reduce((s, n) => s + n, 0),
    }
  }, [dados, fatias, passo])

  const quando = passo === 'ano' ? 'no ano' : 'no mês'

  return (
    <section className="dash__secao" aria-label="Almoxarife">
      <h2 className="dash__titulo">Almoxarife</h2>
      {erro ? (
        <p className="cartao__vazio dash__aviso" role="alert">
          {erro}
        </p>
      ) : !contas ? (
        <p className="cartao__vazio dash__aviso">Carregando o Almoxarife...</p>
      ) : (
        <>
          <div className="dash__tiles">
            <Tile
              rotulo={`Ordens de serviço ${quando}`}
              valor={contas.os.length.toLocaleString('pt-BR')}
              nota={`${plural(contas.concluidas, 'concluída', 'concluídas')} · ${plural(contas.canceladas, 'cancelada', 'canceladas')}`}
              cor={COR.os}
            />
            <Tile rotulo="Baias em campo" valor={String(dados.baiasEmCampo)} nota="agora" />
            {DESPESAS.map(({ chave, rotulo }) => (
              <Tile
                key={chave}
                rotulo={`Despesa: ${rotulo.toLowerCase()}`}
                valor={reais(contas.despesas[chave].total)}
                nota={plural(contas.despesas[chave].quantidade, 'lançamento', 'lançamentos')}
                cor={COR[chave]}
              />
            ))}
            <Tile
              rotulo="Obras fora de SP"
              valor={contas.os.length ? `${Math.round((contas.fora / contas.os.length) * 100)}%` : '—'}
              nota={
                contas.ufs.length
                  ? contas.ufs.map(([uf, n]) => `${uf} ${n}`).join(' · ')
                  : `${plural(contas.fora, 'OS', 'OS')} em outros estados`
              }
            />
          </div>

          <div className="dash__grade">
            <section className="cartao cartao--largo vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Ordens de serviço {passo === 'ano' ? 'por mês' : 'por dia'}</h2>
                  <p className="cartao__sub">Pela data do fim da OS (ou do início, ou da criação)</p>
                </div>
              </header>
              <div className="cartao__corpo">
                {contas.os.length === 0 ? (
                  <p className="cartao__vazio">Nenhuma OS {passo === 'ano' ? 'neste ano' : 'neste mês'}.</p>
                ) : (
                  <Linha
                    series={contas.osSerie}
                    eixoX={fatias.map(rotuloDaFatia)}
                    alturaTotal={240}
                    larguraRotulo={passo === 'ano' ? 38 : 16}
                  />
                )}
              </div>
            </section>
            <section className="cartao cartao--estreito vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Concluídas x canceladas</h2>
                </div>
              </header>
              <div className="cartao__corpo">
                {contas.concluidas + contas.canceladas === 0 ? (
                  <p className="cartao__vazio">Nenhuma OS concluída ou cancelada {quando}.</p>
                ) : (
                  <Rosca
                    tamanho={190}
                    fatias={[
                      { rotulo: 'Concluídas', valor: contas.concluidas, texto: plural(contas.concluidas, 'OS', 'OS'), cor: COR.concluida },
                      { rotulo: 'Canceladas', valor: contas.canceladas, texto: plural(contas.canceladas, 'OS', 'OS'), cor: COR.cancelada },
                    ]}
                    centro={{ valor: String(contas.concluidas + contas.canceladas), rotulo: 'OS' }}
                  />
                )}
              </div>
            </section>

            <section className="cartao cartao--metade vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Responsáveis que mais foram a campo</h2>
                  <p className="cartao__sub">OS no período, por responsável</p>
                </div>
              </header>
              <div className="cartao__corpo">
                {contas.responsaveis.length === 0 ? (
                  <p className="cartao__vazio">Nenhuma OS {quando}.</p>
                ) : (
                  <Colunas itens={contas.responsaveis} eixo="OS" alturaTotal={240} />
                )}
              </div>
            </section>
            <section className="cartao cartao--metade vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Ativos mais pedidos</h2>
                  <p className="cartao__sub">Em quantas OS do período cada ativo foi</p>
                </div>
              </header>
              <div className="cartao__corpo">
                {contas.ativos.length === 0 ? (
                  <p className="cartao__vazio">Nenhum ativo pedido {quando}.</p>
                ) : (
                  <Colunas itens={contas.ativos} eixo="OS" alturaTotal={240} />
                )}
              </div>
            </section>

            <section className="cartao cartao--largo vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Despesas {passo === 'ano' ? 'por mês' : 'por dia'}</h2>
                  <p className="cartao__sub">Ferramentas novas (aquisição), calibração (certificados) e manutenção</p>
                </div>
              </header>
              <div className="cartao__corpo">
                <Linha
                  series={contas.despesasSerie}
                  eixoX={fatias.map(rotuloDaFatia)}
                  unidade="R$"
                  alturaTotal={240}
                  larguraRotulo={passo === 'ano' ? 38 : 16}
                />
              </div>
            </section>
            <section className="cartao cartao--estreito vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Situação da calibração</h2>
                  <p className="cartao__sub">O inventário hoje, nas faixas da tela de Calibração</p>
                </div>
              </header>
              <div className="cartao__corpo">
                {contas.totalFaixas === 0 ? (
                  <p className="cartao__vazio">Nenhuma ferramenta com vencimento de calibração.</p>
                ) : (
                  <Rosca
                    tamanho={190}
                    fatias={FAIXAS.map((f) => ({
                      rotulo: f.rotulo,
                      valor: contas.faixas[f.chave],
                      texto: plural(contas.faixas[f.chave], 'TAG', 'TAGs'),
                      cor: f.cor,
                    }))}
                    centro={{ valor: String(contas.totalFaixas), rotulo: 'TAGs' }}
                  />
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  )
}
