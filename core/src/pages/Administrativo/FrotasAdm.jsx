import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import { carregarVeiculos } from '@/services/frotasService'
import { kmLegivel } from '@/domain/frotas'
import { dataBR } from '@/utils/formato'
import { atencaoDoVeiculo, resumoDaFrota } from './frota'
import './Administrativo.css'

const placaLegivel = (placa) => (placa && placa.length === 7 ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa || '')
const quando = (data, hora) => [data ? dataBR(String(data).slice(0, 10)) : '', hora ? `às ${String(hora).slice(0, 5)}` : ''].filter(Boolean).join(' ')

function NomeDoCarro({ v }) {
  return (
    <span className="frotadm__carro">
      <strong>{v.nome}</strong>
      <span>{[placaLegivel(v.placa), [v.marca, v.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</span>
    </span>
  )
}

/**
 * FROTAS da area administrativa — o que o administrativo precisa olhar:
 *
 *   em uso            quem esta com cada carro, desde quando, para onde
 *                     e com que KM saiu;
 *   pedem atencao     o carro cuja ULTIMA devolucao voltou com o tanque
 *                     abaixo da metade ou com um "Nao" que importa (oleo,
 *                     pneus, agua, faroes, limpeza, abastecido) — o mesmo
 *                     vermelho de Saidas e devolucoes.
 *
 * Os registros e o cadastro continuam na aba Frotas (os atalhos ficam no
 * topo). Le os mesmos veiculos de GET /api/frotas/veiculos.
 */
export default function FrotasAdm() {
  const [frota, setFrota] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    carregarVeiculos()
      .then((lista) => vivo && setFrota(resumoDaFrota(lista)))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [])

  return (
    <AppShell>
      <section className="adm adm--tela">
        <header className="adm__topo">
          <Link to="/app/administrativo" className="adm__voltar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 6-6 6 6 6" />
            </svg>
            Administrativo
          </Link>
          <div className="adm__titulo">
            <h1 className="tela__titulo">Frotas</h1>
            <div className="adm__atalhos">
              <Link to="/app/frotas/registros" className="acao acao--fraca">
                Saídas e devoluções
              </Link>
              <Link to="/app/frotas" className="acao acao--fraca">
                Abrir Frotas
              </Link>
            </div>
          </div>
        </header>

        {erro && (
          <p className="adm__erro" role="alert">
            {erro}
          </p>
        )}

        {!frota ? (
          !erro && <p className="adm__vazio">Carregando os carros...</p>
        ) : (
          <>
            <div className="adm__contas">
              <span className="adm__conta">
                <strong>{frota.emUso.length}</strong> em uso
              </span>
              <span className={`adm__conta ${frota.comAtencao.length ? 'is-alerta' : 'is-ok'}`}>
                <strong>{frota.comAtencao.length}</strong> {frota.comAtencao.length === 1 ? 'pede atenção' : 'pedem atenção'}
              </span>
              <span className="adm__conta">
                <strong>{frota.naGaragem.length}</strong> na garagem
              </span>
            </div>

            <section className="frotadm__secao">
              <h2>Pedem atenção</h2>
              {frota.comAtencao.length === 0 ? (
                <p className="adm__vazio vidro">Nenhum carro voltou com problema na última devolução.</p>
              ) : (
                <ul className="frotadm__lista">
                  {frota.comAtencao.map((v) => {
                    const d = v.ultimaDevolucao
                    return (
                      <li key={v.id} className="frotadm__item is-alerta">
                        <NomeDoCarro v={v} />
                        <div className="frotadm__detalhe">
                          <span className="frotadm__problemas">
                            {atencaoDoVeiculo(v).map((p) => (
                              <span key={p.chave} className="frotadm__problema">
                                {p.texto}
                              </span>
                            ))}
                          </span>
                          <span className="frotadm__quem">
                            Devolvido por {d.condutorNome || 'alguém'} {quando(d.data, d.hora)}
                            {d.km !== null && d.km !== undefined ? ` · ${kmLegivel(d.km)}` : ''}
                            {v.emUso ? ' · está em uso agora' : ''}
                          </span>
                          {d.observacao && <span className="frotadm__obs">“{d.observacao}”</span>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="frotadm__secao">
              <h2>Em uso</h2>
              {frota.emUso.length === 0 ? (
                <p className="adm__vazio vidro">Todos os carros estão na garagem.</p>
              ) : (
                <ul className="frotadm__lista">
                  {frota.emUso.map((v) => (
                    <li key={v.id} className="frotadm__item">
                      <NomeDoCarro v={v} />
                      <div className="frotadm__detalhe">
                        <span className="frotadm__condutor">{v.ultimo?.condutorNome || 'Condutor não informado'}</span>
                        <span className="frotadm__quem">
                          {v.ultimo?.tipo === 'troca' ? 'Trocou de condutor' : 'Saiu'} {quando(v.ultimo?.data, v.ultimo?.hora)}
                          {v.ultimo?.km !== null && v.ultimo?.km !== undefined ? ` · ${kmLegivel(v.ultimo.km)}` : ''}
                        </span>
                        {v.ultimo?.destino && <span className="frotadm__destino">Destino: {v.ultimo.destino}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </section>
    </AppShell>
  )
}
