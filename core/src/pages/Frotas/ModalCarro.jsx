import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoArea, CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import * as frotasApi from '@/services/frotasService'
import { dataBR, dataHora, hojeISO, reais } from '@/utils/formato'

const ABAS = [
  { id: 'problemas', rotulo: 'Problemas' },
  { id: 'manutencao', rotulo: 'Manutenção' },
]

const MANUTENCAO_VAZIA = { data: '', descricao: '', custo: '', oficina: '', km: '', ocorrenciaId: '' }

/**
 * PROBLEMAS E MANUTENCAO de um carro (atualizacao 59).
 *
 *   Problemas   quem ve a Frota relata (o que aconteceu e se o carro
 *               ainda pode ser usado); o aviso vai no Teams para o
 *               Administrativo e a lideranca tecnica. Quem tem
 *               `manutencao_frota` marca como resolvido.
 *   Manutencao  o que foi feito no carro e quanto custou — lancado por
 *               quem tem `manutencao_frota`. Pode resolver junto um
 *               problema aberto. O custo vai para o dashboard da
 *               diretoria (custo da frota e o carro com mais reparos).
 */
export default function ModalCarro({ veiculo, aoFechar, aoMudou }) {
  const { pode } = useDados()
  const mexe = pode('manutencao_frota')
  const [aba, setAba] = useState('problemas')
  const [ocorrencias, setOcorrencias] = useState(null)
  const [manutencoes, setManutencoes] = useState(null)
  const [erro, setErro] = useState('')

  const [problema, setProblema] = useState({ descricao: '', impedeUso: false })
  const [form, setForm] = useState(MANUTENCAO_VAZIA)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(null)

  const ler = useCallback(async () => {
    if (!veiculo) return
    setErro('')
    try {
      const [o, m] = await Promise.all([
        frotasApi.carregarOcorrencias({ veiculo: veiculo.id }),
        frotasApi.carregarManutencoes(veiculo.id),
      ])
      setOcorrencias(o)
      setManutencoes(m)
    } catch (falha) {
      setErro(falha.message)
      setOcorrencias([])
      setManutencoes([])
    }
  }, [veiculo])

  useEffect(() => {
    if (!veiculo) return
    setAba('problemas')
    setProblema({ descricao: '', impedeUso: false })
    setForm({ ...MANUTENCAO_VAZIA, data: hojeISO() })
    setErros({})
    setOcorrencias(null)
    setManutencoes(null)
    ler()
  }, [veiculo, ler])

  const abertas = useMemo(() => (ocorrencias ?? []).filter((o) => !o.resolvidoEm), [ocorrencias])
  const total = useMemo(() => (manutencoes ?? []).reduce((soma, m) => soma + m.custo, 0), [manutencoes])

  const relatar = async (e) => {
    e.preventDefault()
    if (!problema.descricao.trim()) return setErros({ descricao: 'Descreva o problema.' })
    setSalvando(true)
    try {
      await frotasApi.relatarProblema({ veiculoId: veiculo.id, ...problema, descricao: problema.descricao.trim() })
      setProblema({ descricao: '', impedeUso: false })
      setErros({})
      await ler()
      aoMudou?.()
    } catch (falha) {
      setErros({ [falha.campo ?? 'geral']: falha.message })
    } finally {
      setSalvando(false)
    }
  }

  const resolver = async (ocorrencia) => {
    try {
      await frotasApi.resolverProblema(ocorrencia.id)
      await ler()
      aoMudou?.()
    } catch (falha) {
      setErro(falha.message)
    }
  }

  const lancar = async (e) => {
    e.preventDefault()
    if (!form.data) return setErros({ data: 'Informe a data.' })
    if (!form.descricao.trim()) return setErros({ descricao: 'Diga o que foi feito.' })
    if (!/^\d{1,7}([.,]\d{1,2})?$/.test(form.custo.trim())) return setErros({ custo: 'Informe o custo em reais (ex.: 350,00).' })
    setSalvando(true)
    try {
      await frotasApi.lancarManutencao({
        veiculoId: veiculo.id,
        data: form.data,
        descricao: form.descricao.trim(),
        custo: form.custo.trim(),
        oficina: form.oficina.trim(),
        km: form.km.trim(),
        ocorrenciaId: form.ocorrenciaId || null,
      })
      setForm({ ...MANUTENCAO_VAZIA, data: hojeISO() })
      setErros({})
      await ler()
      aoMudou?.()
    } catch (falha) {
      setErros({ [falha.campo ?? 'geral']: falha.message })
    } finally {
      setSalvando(false)
    }
  }

  const apagar = async () => {
    const alvo = apagando
    setApagando(null)
    try {
      await frotasApi.apagarManutencao(alvo.id)
      await ler()
    } catch (falha) {
      setErro(falha.message)
    }
  }

  const mudar = (campo) => (e) => {
    setForm((atual) => ({ ...atual, [campo]: e.target.value }))
    setErros({})
  }

  return (
    <Modal
      aberto={Boolean(veiculo)}
      aoFechar={aoFechar}
      titulo="Problemas e manutenção"
      subtitulo={veiculo ? `${veiculo.nome}${veiculo.placa ? ` · ${veiculo.placa}` : ''}` : ''}
      largura={560}
    >
      <div className="carro">
        <div className="carro__abas" role="tablist">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              className={`chip ${aba === a.id ? 'is-atual' : ''}`.trim()}
              onClick={() => setAba(a.id)}
            >
              {a.rotulo}
              {a.id === 'problemas' && abertas.length > 0 && <span className="carro__conta">{abertas.length}</span>}
            </button>
          ))}
        </div>

        {erro && (
          <p className="carro__erro" role="alert">
            {erro}
          </p>
        )}

        {aba === 'problemas' && (
          <>
            <form className="carro__form" onSubmit={relatar} noValidate>
              <CampoArea
                rotulo="Relatar um problema"
                linhas={2}
                maxLength={1000}
                placeholder="Ex.: barulho na suspensão dianteira, luz do óleo acesa"
                value={problema.descricao}
                onChange={(e) => {
                  setProblema((atual) => ({ ...atual, descricao: e.target.value }))
                  setErros({})
                }}
                erro={erros.descricao}
              />
              <label className="carro__marca">
                <input
                  type="checkbox"
                  checked={problema.impedeUso}
                  onChange={(e) => setProblema((atual) => ({ ...atual, impedeUso: e.target.checked }))}
                />
                <span>O carro não pode ser usado até o conserto</span>
              </label>
              {erros.geral && aba === 'problemas' && <p className="carro__erro">{erros.geral}</p>}
              <footer className="carro__rodape">
                <span>Vai no Teams para o Administrativo e a liderança técnica.</span>
                <Button type="submit" loading={salvando}>
                  Relatar problema
                </Button>
              </footer>
            </form>

            {ocorrencias === null ? (
              <p className="carro__vazio">Carregando...</p>
            ) : ocorrencias.length === 0 ? (
              <p className="carro__vazio">Nenhum problema relatado neste carro.</p>
            ) : (
              <ul className="carro__lista">
                {ocorrencias.map((o) => (
                  <li key={o.id} className="carro__item" data-aberta={o.resolvidoEm ? undefined : 'sim'}>
                    <div className="carro__linha">
                      <strong>{o.descricao}</strong>
                      <span className="carro__selo" data-tom={o.resolvidoEm ? 'ok' : o.impedeUso ? 'grave' : 'aberto'}>
                        {o.resolvidoEm ? 'Resolvido' : o.impedeUso ? 'Não pode usar' : 'Aberto'}
                      </span>
                    </div>
                    <p className="carro__meta">
                      Relatado {o.relatadoPorNome ? `por ${o.relatadoPorNome} ` : ''}em {dataHora(o.relatadoEm)}
                      {o.resolvidoEm &&
                        ` · resolvido${o.resolvidoPorNome ? ` por ${o.resolvidoPorNome}` : ''} em ${dataHora(o.resolvidoEm)}`}
                      {o.resolucao ? ` — ${o.resolucao}` : ''}
                    </p>
                    {mexe && !o.resolvidoEm && (
                      <div className="carro__acoes">
                        <button type="button" className="acao acao--fraca" onClick={() => resolver(o)}>
                          Marcar como resolvido
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {aba === 'manutencao' && (
          <>
            {mexe && (
              <form className="carro__form carro__form--grade" onSubmit={lancar} noValidate>
                <CampoTexto rotulo="Data" type="date" max={hojeISO()} value={form.data} onChange={mudar('data')} erro={erros.data} />
                <CampoTexto
                  rotulo="Custo (R$)"
                  inputMode="decimal"
                  placeholder="Ex.: 350,00"
                  value={form.custo}
                  onChange={mudar('custo')}
                  erro={erros.custo}
                />
                <CampoTexto
                  rotulo="O que foi feito"
                  largo
                  maxLength={500}
                  placeholder="Ex.: troca de óleo e filtros"
                  value={form.descricao}
                  onChange={mudar('descricao')}
                  erro={erros.descricao}
                />
                <CampoTexto
                  rotulo="Oficina (opcional)"
                  maxLength={120}
                  placeholder="Ex.: Auto Center Paulista"
                  value={form.oficina}
                  onChange={mudar('oficina')}
                  erro={erros.oficina}
                />
                <CampoTexto
                  rotulo="KM (opcional)"
                  inputMode="numeric"
                  placeholder="Ex.: 48200"
                  value={form.km}
                  onChange={mudar('km')}
                  erro={erros.km}
                />
                {abertas.length > 0 && (
                  <CampoSelecao
                    rotulo="Resolve um problema relatado? (opcional)"
                    largo
                    vazio="Não"
                    opcoes={[{ valor: '', rotulo: 'Não' }, ...abertas.map((o) => ({ valor: o.id, rotulo: o.descricao }))]}
                    value={form.ocorrenciaId}
                    onChange={mudar('ocorrenciaId')}
                  />
                )}
                {erros.geral && <p className="carro__erro">{erros.geral}</p>}
                <footer className="carro__rodape">
                  <span />
                  <Button type="submit" loading={salvando}>
                    Lançar manutenção
                  </Button>
                </footer>
              </form>
            )}

            {manutencoes === null ? (
              <p className="carro__vazio">Carregando...</p>
            ) : manutencoes.length === 0 ? (
              <p className="carro__vazio">Nenhuma manutenção lançada neste carro.</p>
            ) : (
              <>
                <p className="carro__total">
                  {manutencoes.length} {manutencoes.length === 1 ? 'manutenção' : 'manutenções'} · total{' '}
                  <strong>{reais(total)}</strong>
                </p>
                <ul className="carro__lista">
                  {manutencoes.map((m) => (
                    <li key={m.id} className="carro__item">
                      <div className="carro__linha">
                        <strong>{m.descricao}</strong>
                        <span className="carro__custo">{reais(m.custo)}</span>
                      </div>
                      <p className="carro__meta">
                        {dataBR(m.data)}
                        {m.oficina ? ` · ${m.oficina}` : ''}
                        {m.km !== null ? ` · ${m.km.toLocaleString('pt-BR')} km` : ''}
                        {m.registradoPorNome ? ` · lançado por ${m.registradoPorNome}` : ''}
                      </p>
                      {mexe && (
                        <div className="carro__acoes">
                          <button type="button" className="acao acao--fraca carro__apagar" onClick={() => setApagando(m)}>
                            Apagar
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      <Confirma
        aberto={Boolean(apagando)}
        nivel={1}
        titulo="Apagar manutenção"
        mensagem={apagando ? `"${apagando.descricao}" (${reais(apagando.custo)}) sai do custo deste carro.` : ''}
        rotuloConfirmar="Apagar"
        aoConfirmar={apagar}
        aoFechar={() => setApagando(null)}
      />
    </Modal>
  )
}
