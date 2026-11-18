import { useMemo } from 'react'
import Avatar from '@/components/Avatar/Avatar'
import Estrelas from '@/components/Estrelas/Estrelas'
import { useDados } from '@/context/DadosContext'
import { obraCancelada, tituloDaObra } from '@/domain/obras'
import Tile from './Tile'
import './PainelExcelencia.css'

/* ============================================================
   EXCELENCIA no Dashboard (atualizacao 59)

   As avaliacoes das obras (aba Avaliacoes) no periodo das setas do
   topo, pelo dia em que a obra foi avaliada:
     os numeros       a media, quantas obras, a melhor e a pior nota;
     as listas        as piores e as melhores avaliacoes, com o motivo
                      (o que quem avaliou escreveu em cada etapa);
     as pessoas       os colaboradores mais elogiados (obras com nota 4
                      ou mais em que participaram) e os mais pontuados
                      negativamente (obras com nota abaixo de 3).
   Vem da carga de sempre (cada obra traz as notas): nao ha chamada nova.
   So aparece para quem ve Avaliacoes.
   ============================================================ */

const ELOGIO = 4
const NEGATIVA = 3
const NA_LISTA = 5

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
const nota1 = (n) => n.toFixed(1).replace('.', ',')

/** A data local ('AAAA-MM-DD') de um carimbo. */
function diaDe(carimbo) {
  const d = new Date(carimbo)
  if (Number.isNaN(d.getTime())) return null
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function PainelExcelencia(props) {
  const { pode } = useDados()
  return pode('ver_avaliacoes') ? <Avaliacoes {...props} /> : null
}

function Avaliacoes({ fatias, passo }) {
  const { obras, clientePorId, pessoaPorId } = useDados()

  const contas = useMemo(() => {
    const fatiaDe = (dia) => (passo === 'ano' ? dia.slice(0, 7) : dia)
    const noPeriodo = new Set(fatias)
    const avaliadas = obras
      .filter((o) => o.avaliacao && !obraCancelada(o))
      .filter((o) => {
        const dia = diaDe(o.avaliacao.avaliadaEm)
        return dia && noPeriodo.has(fatiaDe(dia))
      })
      .map((o) => ({
        obra: o,
        nota: o.avaliacao.nota,
        /* o motivo: o que foi escrito em cada etapa, com o nome dela */
        motivos: (o.notas ?? []).filter((n) => n.descricao).map((n) => `${n.rotulo}: ${n.descricao}`),
      }))

    const media = avaliadas.length ? avaliadas.reduce((s, a) => s + a.nota, 0) / avaliadas.length : null
    const ordenadas = [...avaliadas].sort((a, b) => a.nota - b.nota)

    /* as pessoas: em quantas obras boas e ruins do periodo cada uma estava */
    const porPessoa = new Map()
    avaliadas.forEach(({ obra, nota }) => {
      ;(obra.membros ?? []).forEach((id) => {
        const atual = porPessoa.get(String(id)) ?? { id: String(id), elogios: 0, negativas: 0, obras: 0 }
        atual.obras += 1
        if (nota >= ELOGIO) atual.elogios += 1
        if (nota < NEGATIVA) atual.negativas += 1
        porPessoa.set(String(id), atual)
      })
    })
    const pessoas = [...porPessoa.values()].filter((p) => pessoaPorId(p.id))

    return {
      avaliadas,
      media,
      piores: ordenadas.filter((a) => a.nota < ELOGIO).slice(0, NA_LISTA),
      melhores: [...ordenadas].reverse().filter((a) => a.nota >= ELOGIO).slice(0, NA_LISTA),
      elogiados: pessoas.filter((p) => p.elogios > 0).sort((a, b) => b.elogios - a.elogios || b.obras - a.obras).slice(0, NA_LISTA),
      negativos: pessoas.filter((p) => p.negativas > 0).sort((a, b) => b.negativas - a.negativas).slice(0, NA_LISTA),
    }
  }, [obras, fatias, passo, pessoaPorId])

  const quando = passo === 'ano' ? 'no ano' : 'no mês'

  const ListaDeObras = ({ itens, vazio }) =>
    itens.length === 0 ? (
      <p className="cartao__vazio">{vazio}</p>
    ) : (
      <ul className="excdash__obras">
        {itens.map(({ obra, nota, motivos }) => (
          <li key={obra.id}>
            <div className="excdash__linha">
              <strong>{tituloDaObra(obra, clientePorId(obra.clienteId))}</strong>
              <span className="excdash__nota">
                <Estrelas nota={nota} tamanho={12} />
                {nota1(nota)}
              </span>
            </div>
            <p className="excdash__motivo">{motivos.length ? motivos.join(' · ') : 'Sem motivo escrito.'}</p>
          </li>
        ))}
      </ul>
    )

  const ListaDePessoas = ({ itens, campo, rotulo, vazio }) =>
    itens.length === 0 ? (
      <p className="cartao__vazio">{vazio}</p>
    ) : (
      <ol className="excdash__pessoas">
        {itens.map((p) => {
          const pessoa = pessoaPorId(p.id)
          return (
            <li key={p.id}>
              <Avatar nome={pessoa?.nome} foto={pessoa?.foto} tamanho={26} />
              <span>
                <strong>{pessoa?.nome}</strong>
                <em>
                  {plural(p[campo], rotulo[0], rotulo[1])} · {plural(p.obras, 'obra avaliada', 'obras avaliadas')}
                </em>
              </span>
            </li>
          )
        })}
      </ol>
    )

  return (
    <section className="dash__secao" aria-label="Excelência">
      <h2 className="dash__titulo">Excelência</h2>

      {contas.avaliadas.length === 0 ? (
        <p className="cartao__vazio dash__aviso">Nenhuma obra avaliada {passo === 'ano' ? 'neste ano' : 'neste mês'}.</p>
      ) : (
        <>
          <div className="dash__tiles">
            <Tile
              rotulo="Média das avaliações"
              valor={nota1(contas.media)}
              nota={`${plural(contas.avaliadas.length, 'obra avaliada', 'obras avaliadas')} ${quando}`}
            />
            <Tile
              rotulo="Melhor avaliação"
              valor={nota1(contas.melhores[0]?.nota ?? Math.max(...contas.avaliadas.map((a) => a.nota)))}
              cor="var(--gr-bom)"
              nota={`${plural(contas.avaliadas.filter((a) => a.nota >= ELOGIO).length, 'obra com 4 ou mais', 'obras com 4 ou mais')}`}
            />
            <Tile
              rotulo="Pior avaliação"
              valor={nota1(Math.min(...contas.avaliadas.map((a) => a.nota)))}
              cor="var(--gr-ruim)"
              nota={`${plural(contas.avaliadas.filter((a) => a.nota < NEGATIVA).length, 'obra abaixo de 3', 'obras abaixo de 3')}`}
            />
          </div>

          <div className="dash__grade">
            <section className="cartao cartao--metade vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Piores avaliações e o motivo</h2>
                  <p className="cartao__sub">As notas abaixo de 4 {quando}</p>
                </div>
              </header>
              <div className="cartao__corpo">
                <ListaDeObras itens={contas.piores} vazio={`Nenhuma obra abaixo de 4 ${quando}.`} />
              </div>
            </section>

            <section className="cartao cartao--metade vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Melhores avaliações e o motivo</h2>
                  <p className="cartao__sub">As notas 4 ou mais {quando}</p>
                </div>
              </header>
              <div className="cartao__corpo">
                <ListaDeObras itens={contas.melhores} vazio={`Nenhuma obra com 4 ou mais ${quando}.`} />
              </div>
            </section>

            <section className="cartao cartao--metade vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Colaboradores mais elogiados</h2>
                  <p className="cartao__sub">Em mais obras com nota 4 ou mais</p>
                </div>
              </header>
              <div className="cartao__corpo">
                <ListaDePessoas
                  itens={contas.elogiados}
                  campo="elogios"
                  rotulo={['obra elogiada', 'obras elogiadas']}
                  vazio="Ninguém em obra com nota 4 ou mais."
                />
              </div>
            </section>

            <section className="cartao cartao--metade vidro">
              <header className="cartao__topo">
                <div>
                  <h2 className="cartao__titulo">Colaboradores mais pontuados negativamente</h2>
                  <p className="cartao__sub">Em mais obras com nota abaixo de 3</p>
                </div>
              </header>
              <div className="cartao__corpo">
                <ListaDePessoas
                  itens={contas.negativos}
                  campo="negativas"
                  rotulo={['obra com nota baixa', 'obras com nota baixa']}
                  vazio="Ninguém em obra com nota abaixo de 3."
                />
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  )
}
