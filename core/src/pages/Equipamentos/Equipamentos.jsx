import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoArea, CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import {
  SITUACOES_EQUIPAMENTO,
  TIPOS_EQUIPAMENTO,
  rotuloDaSituacao,
  rotuloDoTipo,
} from '@/domain/equipamentos'
import { apagarEquipamento, carregarEquipamentos, salvarEquipamento } from '@/services/equipamentosService'
import { dataBR, hojeISO } from '@/utils/formato'
import './Equipamentos.css'

const VAZIO = {
  tipo: 'notebook',
  situacao: 'em_uso',
  marca: '',
  modelo: '',
  patrimonio: '',
  numeroSerie: '',
  processador: '',
  memoria: '',
  armazenamento: '',
  sistema: '',
  responsavelId: '',
  local: '',
  aquisicao: '',
  garantiaAte: '',
  observacao: '',
}

const semAcento = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * NOTEBOOKS E PCS (atualizacao 59) — na Area da excelencia.
 *
 * O mapeamento dos equipamentos de informatica: o que a empresa tem (tipo,
 * marca, modelo, patrimonio, configuracao), com quem esta, onde e em que
 * situacao. Filtra por tipo e situacao e procura por patrimonio, modelo ou
 * pessoa. Cadastrar, editar e apagar e de quem tem `editar_equipamentos`.
 */
export default function Equipamentos() {
  const { pode, equipe } = useDados()
  const edita = pode('editar_equipamentos')
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [situacao, setSituacao] = useState('ativos')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState(null) // {} = novo; o equipamento = editar
  const [apagando, setApagando] = useState(null)
  const [recado, setRecado] = useState('')

  const ler = useCallback(async () => {
    try {
      setLista(await carregarEquipamentos())
      setErro('')
    } catch (falha) {
      setErro(falha.message)
      setLista([])
    }
  }, [])

  useEffect(() => {
    ler()
  }, [ler])

  const contagem = useMemo(() => {
    const c = { todos: 0 }
    for (const e of lista ?? []) {
      if (e.situacao === 'baixado') continue
      c.todos += 1
      c[e.tipo] = (c[e.tipo] ?? 0) + 1
    }
    return c
  }, [lista])

  const visiveis = useMemo(() => {
    const alvo = semAcento(busca.trim())
    return (lista ?? []).filter((e) => {
      if (tipo !== 'todos' && e.tipo !== tipo) return false
      if (situacao === 'ativos' ? e.situacao === 'baixado' : situacao !== 'todas' && e.situacao !== situacao) return false
      if (!alvo) return true
      return semAcento(
        [e.patrimonio, e.numeroSerie, e.marca, e.modelo, e.responsavelNome, e.local].filter(Boolean).join(' '),
      ).includes(alvo)
    })
  }, [lista, tipo, situacao, busca])

  const apagar = async () => {
    const alvo = apagando
    setApagando(null)
    try {
      await apagarEquipamento(alvo.id)
      setLista((atual) => (atual ?? []).filter((e) => e.id !== alvo.id))
      setRecado('Equipamento apagado.')
    } catch (falha) {
      setRecado(falha.message)
    }
  }

  const pessoa = (id) => equipe.find((p) => String(p.id) === String(id)) ?? null
  const hoje = hojeISO()

  return (
    <AppShell>
      <section className="equip">
        <header className="equip__topo">
          <div>
            <h1 className="tela__titulo">Notebooks e PCs</h1>
            <p className="tela__lead">Os equipamentos de informática da empresa: com quem está cada um, onde e em que situação.</p>
          </div>
          {edita && (
            <Button type="button" onClick={() => setEditando({})}>
              Novo equipamento
            </Button>
          )}
        </header>

        {recado && (
          <p className="recado" role="status">
            {recado}
            <button type="button" onClick={() => setRecado('')} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}

        <div className="equip__filtros">
          <label className="procura">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por patrimônio, modelo ou pessoa..."
              aria-label="Buscar equipamento"
            />
          </label>
          <div className="equip__chips" role="group" aria-label="Tipo">
            {[{ id: 'todos', rotulo: 'Todos' }, ...TIPOS_EQUIPAMENTO].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chip ${tipo === t.id ? 'is-atual' : ''}`.trim()}
                aria-pressed={tipo === t.id}
                onClick={() => setTipo(t.id)}
              >
                {t.rotulo}
                <span className="equip__conta">{contagem[t.id] ?? 0}</span>
              </button>
            ))}
          </div>
          <CampoSelecao
            aria-label="Situação"
            opcoes={[
              { valor: 'ativos', rotulo: 'Sem os baixados' },
              ...SITUACOES_EQUIPAMENTO.map((s) => ({ valor: s.id, rotulo: s.rotulo })),
              { valor: 'todas', rotulo: 'Todas as situações' },
            ]}
            value={situacao}
            onChange={(e) => setSituacao(e.target.value)}
          />
        </div>

        {erro && (
          <p className="equip__erro" role="alert">
            {erro}
          </p>
        )}

        {lista === null ? (
          <p className="equip__vazio">Carregando os equipamentos...</p>
        ) : visiveis.length === 0 ? (
          <div className="equip__vazio">
            <strong>{lista.length === 0 ? 'Nenhum equipamento cadastrado' : 'Nada com esse filtro'}</strong>
            <span>
              {lista.length === 0
                ? edita
                  ? 'Use "Novo equipamento" para mapear os notebooks e PCs da empresa.'
                  : 'Quando alguém cadastrar os equipamentos, eles aparecem aqui.'
                : 'Mude o tipo, a situação ou a busca.'}
            </span>
          </div>
        ) : (
          <ul className="equip__grade">
            {visiveis.map((e) => {
              const dono = e.responsavelId ? pessoa(e.responsavelId) : null
              const config = [e.processador, e.memoria, e.armazenamento, e.sistema].filter(Boolean).join(' · ')
              const garantiaVencida = e.garantiaAte && e.garantiaAte < hoje
              return (
                <li key={e.id} className="equipcard" data-situacao={e.situacao}>
                  <div className="equipcard__topo">
                    <span className="equipcard__tipo">{rotuloDoTipo(e.tipo)}</span>
                    <span className="equipcard__situacao" data-situacao={e.situacao}>
                      {rotuloDaSituacao(e.situacao)}
                    </span>
                  </div>
                  <strong className="equipcard__nome">{[e.marca, e.modelo].filter(Boolean).join(' ') || 'Sem modelo'}</strong>
                  <p className="equipcard__ids">
                    {e.patrimonio ? `Patrimônio ${e.patrimonio}` : 'Sem patrimônio'}
                    {e.numeroSerie ? ` · Série ${e.numeroSerie}` : ''}
                  </p>
                  {config && <p className="equipcard__config">{config}</p>}
                  <p className="equipcard__dono">
                    {e.responsavelId ? (
                      <>
                        <Avatar nome={e.responsavelNome} foto={dono?.foto} tamanho={22} />
                        <span>{e.responsavelNome}</span>
                      </>
                    ) : (
                      <span className="equipcard__sem">Sem responsável</span>
                    )}
                    {e.local && <em>{e.local}</em>}
                  </p>
                  {(e.aquisicao || e.garantiaAte) && (
                    <p className="equipcard__datas">
                      {e.aquisicao ? `Compra ${dataBR(e.aquisicao)}` : ''}
                      {e.aquisicao && e.garantiaAte ? ' · ' : ''}
                      {e.garantiaAte && (
                        <span className={garantiaVencida ? 'equipcard__vencida' : ''}>
                          {garantiaVencida ? 'Garantia vencida em' : 'Garantia até'} {dataBR(e.garantiaAte)}
                        </span>
                      )}
                    </p>
                  )}
                  {e.observacao && <p className="equipcard__obs">{e.observacao}</p>}
                  {edita && (
                    <div className="equipcard__acoes">
                      <button type="button" className="acao acao--fraca" onClick={() => setEditando(e)}>
                        Editar
                      </button>
                      <button type="button" className="acao acao--fraca equipcard__apagar" onClick={() => setApagando(e)}>
                        Apagar
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ModalEquipamento
        alvo={editando}
        aoFechar={() => setEditando(null)}
        aoSalvo={(salvo, novo) => {
          setLista((atual) => (novo ? [salvo, ...(atual ?? [])] : (atual ?? []).map((e) => (e.id === salvo.id ? salvo : e))))
          setRecado(novo ? 'Equipamento cadastrado.' : 'Equipamento salvo.')
        }}
      />

      <Confirma
        aberto={Boolean(apagando)}
        titulo="Apagar equipamento"
        mensagem={
          apagando
            ? `${[apagando.marca, apagando.modelo].filter(Boolean).join(' ') || 'O equipamento'}${apagando.patrimonio ? ` (patrimônio ${apagando.patrimonio})` : ''} sai do mapeamento. Para guardar o histórico, prefira a situação "Baixado".`
            : ''
        }
        rotuloConfirmar="Apagar"
        aoConfirmar={apagar}
        aoFechar={() => setApagando(null)}
      />
    </AppShell>
  )
}

/** O cadastro: tipo, identificacao, configuracao, com quem esta e as datas. */
function ModalEquipamento({ alvo, aoFechar, aoSalvo }) {
  const { equipe } = useDados()
  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)
  const novo = !alvo?.id

  useEffect(() => {
    if (!alvo) return
    setForm({ ...VAZIO, ...Object.fromEntries(Object.entries(alvo).map(([k, v]) => [k, v ?? ''])) })
    setErros({})
  }, [alvo])

  const pessoas = useMemo(
    () =>
      equipe
        .filter((p) => p.ativo !== false || String(p.id) === String(form.responsavelId))
        .map((p) => ({ valor: String(p.id), rotulo: p.nome }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    [equipe, form.responsavelId],
  )

  const mudar = (campo) => (e) => {
    setForm((atual) => ({ ...atual, [campo]: e.target.value }))
    setErros({})
  }

  const enviar = async (e) => {
    e.preventDefault()
    if (!form.marca.trim() && !form.modelo.trim()) return setErros({ marca: 'Informe ao menos a marca ou o modelo.' })
    setSalvando(true)
    try {
      const salvo = await salvarEquipamento(alvo.id ?? null, { ...form, responsavelId: form.responsavelId || null })
      aoSalvo(salvo, novo)
      aoFechar()
    } catch (falha) {
      setErros({ [falha.campo ?? 'geral']: falha.message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={Boolean(alvo)}
      aoFechar={aoFechar}
      titulo={novo ? 'Novo equipamento' : 'Editar equipamento'}
      subtitulo="Notebooks e PCs"
      largura={620}
    >
      <form className="equipform" onSubmit={enviar} noValidate>
        <CampoSelecao
          rotulo="Tipo"
          opcoes={TIPOS_EQUIPAMENTO.map((t) => ({ valor: t.id, rotulo: t.rotulo }))}
          value={form.tipo}
          onChange={mudar('tipo')}
          erro={erros.tipo}
        />
        <CampoSelecao
          rotulo="Situação"
          opcoes={SITUACOES_EQUIPAMENTO.map((s) => ({ valor: s.id, rotulo: s.rotulo }))}
          value={form.situacao}
          onChange={mudar('situacao')}
          erro={erros.situacao}
        />
        <CampoTexto rotulo="Marca" maxLength={60} placeholder="Ex.: Dell" value={form.marca} onChange={mudar('marca')} erro={erros.marca} />
        <CampoTexto rotulo="Modelo" maxLength={80} placeholder="Ex.: Latitude 5440" value={form.modelo} onChange={mudar('modelo')} erro={erros.modelo} />
        <CampoTexto rotulo="Patrimônio" maxLength={40} placeholder="Ex.: LWN-0142" value={form.patrimonio} onChange={mudar('patrimonio')} erro={erros.patrimonio} />
        <CampoTexto rotulo="Número de série" maxLength={80} placeholder="Ex.: 7HX2K93" value={form.numeroSerie} onChange={mudar('numeroSerie')} erro={erros.numeroSerie} />
        <CampoTexto rotulo="Processador" maxLength={80} placeholder="Ex.: Intel Core i5-1335U" value={form.processador} onChange={mudar('processador')} erro={erros.processador} />
        <CampoTexto rotulo="Memória" maxLength={40} placeholder="Ex.: 16 GB" value={form.memoria} onChange={mudar('memoria')} erro={erros.memoria} />
        <CampoTexto rotulo="Armazenamento" maxLength={60} placeholder="Ex.: 512 GB SSD" value={form.armazenamento} onChange={mudar('armazenamento')} erro={erros.armazenamento} />
        <CampoTexto rotulo="Sistema" maxLength={60} placeholder="Ex.: Windows 11 Pro" value={form.sistema} onChange={mudar('sistema')} erro={erros.sistema} />
        <CampoSelecao
          rotulo="Com quem está"
          vazio="Sem responsável"
          opcoes={[{ valor: '', rotulo: 'Sem responsável' }, ...pessoas]}
          value={form.responsavelId}
          onChange={mudar('responsavelId')}
          erro={erros.responsavelId}
        />
        <CampoTexto rotulo="Local" maxLength={80} placeholder="Ex.: Escritório SP, home office" value={form.local} onChange={mudar('local')} erro={erros.local} />
        <CampoTexto rotulo="Data da compra" type="date" value={form.aquisicao} onChange={mudar('aquisicao')} />
        <CampoTexto rotulo="Garantia até" type="date" value={form.garantiaAte} onChange={mudar('garantiaAte')} />
        <CampoArea
          rotulo="Observação"
          largo
          linhas={2}
          maxLength={500}
          placeholder="Ex.: tela com risco, carregador reserva com a TI"
          value={form.observacao}
          onChange={mudar('observacao')}
          erro={erros.observacao}
        />
        {erros.geral && (
          <p className="equip__erro" role="alert">
            {erros.geral}
          </p>
        )}
        <footer className="equipform__rodape">
          <Button type="submit" loading={salvando}>
            {novo ? 'Cadastrar' : 'Salvar'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
