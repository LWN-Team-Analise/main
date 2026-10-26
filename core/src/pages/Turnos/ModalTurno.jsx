import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { CampoData, CampoHora } from '@/components/CampoData/CampoData'
import { useDados } from '@/context/DadosContext'
import { CORES, SUBTITULO_MAXIMO, TITULO_MAXIMO, corPorId } from '@/domain/turnos'
import * as turnosApi from '@/services/turnosService'
import { dataBR } from '@/utils/formato'

const VAZIO = {
  cronogramaId: '',
  usuarioId: '',
  titulo: '',
  subtitulo: '',
  cor: CORES[0].id,
  dataInicio: '',
  dataFim: '',
  diaInteiro: false,
  horaInicio: '08:00',
  horaFim: '17:00',
  obraId: '',
  checkId: '',
}

/**
 * Criar, editar e excluir um turno.
 *
 *   Pessoa          quem trabalha — ou "Turno aberto", ainda sem ninguem;
 *   Obra / Tarefa   opcional: o turno vem de uma tarefa da obra. Escolher
 *                   a obra poe o cliente no titulo e a proposta embaixo;
 *                   a tarefa (um check da obra) entra junto;
 *   Titulo e a linha de baixo ("ADM" / "Alinhamento");
 *   Cor             so a borda do bloco leva a cor;
 *   Dias            um so, ou um trecho (a folga de 13/10 a 27/10);
 *   Horario         inicio e fim — ou o dia inteiro (sem horas).
 *
 * O turno que vem do check com horario das obras (o ponto de encontro)
 * so se ve aqui: ele muda pela obra, e o botao leva ate ela.
 */
export default function ModalTurno({ aberto, turno = null, base = null, cronogramas = [], edita, aoFechar, aoSalvo }) {
  const navigate = useNavigate()
  const { obras, clientePorId, roteiroDaObra, pessoaPorId, concluida } = useDados()
  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(false)

  /* ponto de encontro, execucao ou prazo: vem da obra e muda por la */
  const daObra = ['obra', 'execucao', 'prazo'].includes(turno?.origem)
  const somenteLeitura = !edita || daObra

  useEffect(() => {
    if (!aberto) return
    setErros({})
    setApagando(false)
    if (turno) {
      setForm({
        cronogramaId: turno.cronogramaId ?? '',
        usuarioId: turno.usuarioId ?? '',
        titulo: turno.titulo,
        subtitulo: turno.subtitulo ?? '',
        cor: turno.cor,
        dataInicio: turno.dataInicio,
        dataFim: turno.dataFim,
        diaInteiro: !turno.horaInicio,
        horaInicio: turno.horaInicio ?? VAZIO.horaInicio,
        horaFim: turno.horaFim ?? VAZIO.horaFim,
        obraId: turno.obraId ?? '',
        checkId: turno.checkId ?? '',
      })
    } else {
      setForm({
        ...VAZIO,
        cronogramaId: base?.cronogramaId ?? cronogramas[0]?.id ?? '',
        usuarioId: base?.usuarioId ?? '',
        dataInicio: base?.dia ?? '',
        dataFim: base?.dia ?? '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, turno, base])

  const cronograma = cronogramas.find((c) => c.id === form.cronogramaId)

  const opcoesPessoa = useMemo(
    () => [
      { valor: '', rotulo: 'Turno aberto (sem pessoa)' },
      ...(cronograma?.membros ?? [])
        .map((id) => ({ valor: id, rotulo: pessoaPorId(id)?.nome ?? 'Pessoa' }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    ],
    [cronograma, pessoaPorId],
  )

  const nomeDaObra = (o) => [o.proposta, clientePorId(o.clienteId)?.nome].filter(Boolean).join(' - ') || 'Obra'
  const opcoesObra = useMemo(
    () => [
      { valor: '', rotulo: 'Nenhuma' },
      ...obras
        .filter((o) => !concluida(o) || o.id === form.obraId)
        .map((o) => ({ valor: o.id, rotulo: nomeDaObra(o) }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obras, form.obraId],
  )

  const obra = obras.find((o) => o.id === form.obraId) ?? null
  /* as tarefas da obra: os checks do roteiro dela, por etapa */
  const opcoesTarefa = useMemo(() => {
    if (!obra) return []
    return [
      { valor: '', rotulo: 'Nenhuma' },
      ...roteiroDaObra(obra).flatMap((etapa) =>
        etapa.cards.flatMap((card) =>
          (card.checks ?? []).map((check) => ({
            valor: check.id,
            rotulo: `${etapa.numero}ª · ${check.titulo}${obra.checks?.[check.id] ? ' ✓' : ''}`,
            titulo: check.titulo,
          })),
        ),
      ),
    ]
  }, [obra, roteiroDaObra])

  const mudar = (campo) => (evento) => {
    const valor = evento?.target ? (evento.target.type === 'checkbox' ? evento.target.checked : evento.target.value) : evento
    setForm((atual) => {
      const novo = { ...atual, [campo]: valor }
      /* o fim acompanha o inicio quando ficaria antes dele */
      if (campo === 'dataInicio' && (!atual.dataFim || atual.dataFim < valor)) novo.dataFim = valor
      if (campo === 'cronogramaId') novo.usuarioId = ''
      return novo
    })
    setErros((atual) => ({ ...atual, [campo]: undefined, geral: undefined }))
  }

  /* escolher a obra preenche o titulo (o cliente) e a linha de baixo (a proposta) */
  const escolherObra = (evento) => {
    const id = evento.target.value
    const nova = obras.find((o) => o.id === id)
    setForm((atual) => ({
      ...atual,
      obraId: id,
      checkId: '',
      titulo: nova ? (clientePorId(nova.clienteId)?.nome ?? nova.proposta ?? atual.titulo).slice(0, TITULO_MAXIMO) : atual.titulo,
      subtitulo: nova ? (nova.proposta ?? '') : atual.subtitulo,
    }))
    setErros({})
  }

  const escolherTarefa = (evento) => {
    const id = evento.target.value
    const tarefa = opcoesTarefa.find((t) => t.valor === id)
    setForm((atual) => ({
      ...atual,
      checkId: id,
      subtitulo: tarefa?.titulo
        ? [obra?.proposta, tarefa.titulo].filter(Boolean).join(' · ').slice(0, SUBTITULO_MAXIMO)
        : (obra?.proposta ?? atual.subtitulo),
    }))
  }

  const salvar = async (evento) => {
    evento.preventDefault()
    const novos = {}
    if (!form.cronogramaId) novos.cronogramaId = 'Escolha o cronograma.'
    if (!form.titulo.trim()) novos.titulo = 'Dê um título ao turno.'
    if (!form.dataInicio) novos.dataInicio = 'Informe o dia.'
    if (form.dataFim && form.dataFim < form.dataInicio) novos.dataFim = 'O fim não pode ser antes do início.'
    if (!form.diaInteiro && (!form.horaInicio || !form.horaFim)) novos.horaFim = 'Informe o início e o fim.'
    setErros(novos)
    if (Object.keys(novos).length) return

    setSalvando(true)
    try {
      const campos = {
        cronogramaId: form.cronogramaId,
        usuarioId: form.usuarioId || null,
        titulo: form.titulo.trim(),
        subtitulo: form.subtitulo.trim(),
        cor: form.cor,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim || form.dataInicio,
        horaInicio: form.diaInteiro ? null : form.horaInicio,
        horaFim: form.diaInteiro ? null : form.horaFim,
        obraId: form.obraId || null,
        checkId: form.obraId ? form.checkId || null : null,
      }
      if (turno) await turnosApi.editarTurno(turno.id, campos)
      else await turnosApi.criarTurno(campos)
      await aoSalvo()
      aoFechar()
    } catch (e) {
      setErros(e.campo ? { [e.campo]: e.message } : { geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  const apagar = async () => {
    setApagando(false)
    setSalvando(true)
    try {
      await turnosApi.apagarTurno(turno.id)
      await aoSalvo()
      aoFechar()
    } catch (e) {
      setErros({ geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  /* o que vem das obras (o ponto de encontro, a execucao e os prazos):
     so a leitura e o caminho ate a obra, que e onde ele muda */
  if (daObra) {
    const pessoa = pessoaPorId(turno.usuarioId)
    const dias =
      turno.dataInicio === turno.dataFim
        ? dataBR(turno.dataInicio)
        : `${dataBR(turno.dataInicio)} a ${dataBR(turno.dataFim)}`
    const leitura = {
      obra: {
        subtitulo: 'Turno do ponto de encontro da obra',
        linhas: [
          ['Pessoa', pessoa?.nome ?? '—'],
          ['Dia', dias],
          ['Horário', turno.horaInicio],
          ['Obra', turno.subtitulo || turno.titulo],
        ],
        nota: 'Ele vem do check com horário da obra: o dia, o horário e quem vai mudam por lá.',
      },
      execucao: {
        subtitulo: 'Execução da obra',
        linhas: [
          ['Obra', turno.obraNome],
          ['Dias', dias],
          ['Carro', turno.veiculo ?? 'nenhum reservado'],
        ],
        nota: 'Os dias da execução mudam na própria obra, no período de execução.',
      },
      prazo: {
        subtitulo: 'Prazo de tarefa da obra',
        linhas: [
          ['Tarefa', turno.titulo],
          ['Obra', turno.obraNome],
          ['Prazo', dias],
        ],
        nota: 'A tarefa sai daqui quando o check for marcado na obra.',
      },
    }[turno.origem]
    return (
      <Modal aberto={aberto} aoFechar={aoFechar} titulo={turno.titulo} subtitulo={leitura.subtitulo} largura={440}>
        <div className="turnoform__obra">
          <dl>
            {leitura.linhas.map(([rotulo, valor]) => (
              <div key={rotulo} className="turnoform__dado">
                <dt>{rotulo}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>
          <p>{leitura.nota}</p>
          <footer className="formobra__acoes">
            <button type="button" className="formobra__cancelar" onClick={aoFechar}>
              Fechar
            </button>
            <Button type="button" onClick={() => navigate(`/app/obras/${turno.obraId}`)}>
              Abrir a obra
            </Button>
          </footer>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={turno ? (somenteLeitura ? turno.titulo : 'Editar turno') : 'Novo turno'}
      subtitulo={cronograma?.nome}
      largura={560}
    >
      <form className="turnoform" onSubmit={salvar} noValidate>
        <fieldset disabled={somenteLeitura}>
          {cronogramas.length > 1 && (
            <CampoSelecao
              rotulo="Cronograma"
              value={form.cronogramaId}
              onChange={mudar('cronogramaId')}
              erro={erros.cronogramaId}
              opcoes={cronogramas.map((c) => ({ valor: c.id, rotulo: c.nome }))}
              disabled={somenteLeitura}
            />
          )}

          <CampoSelecao
            rotulo="Pessoa"
            value={form.usuarioId}
            onChange={mudar('usuarioId')}
            erro={erros.usuarioId}
            opcoes={opcoesPessoa}
            vazio="Turno aberto (sem pessoa)"
            disabled={somenteLeitura}
          />

          <div className="turnoform__dupla">
            <CampoSelecao
              rotulo="Obra (opcional)"
              value={form.obraId}
              onChange={escolherObra}
              erro={erros.obraId}
              opcoes={opcoesObra}
              vazio="Nenhuma"
              disabled={somenteLeitura}
            />
            <CampoSelecao
              rotulo="Tarefa da obra (opcional)"
              value={form.checkId}
              onChange={escolherTarefa}
              erro={erros.checkId}
              opcoes={opcoesTarefa}
              vazio={obra ? 'Nenhuma' : 'Escolha a obra antes'}
              disabled={somenteLeitura || !obra}
            />
          </div>

          <div className="turnoform__dupla">
            <CampoTexto
              rotulo="Título"
              placeholder="Ex.: ADM"
              value={form.titulo}
              onChange={mudar('titulo')}
              erro={erros.titulo}
              maxLength={TITULO_MAXIMO}
            />
            <CampoTexto
              rotulo="Linha de baixo (opcional)"
              placeholder="Ex.: Alinhamento"
              value={form.subtitulo}
              onChange={mudar('subtitulo')}
              erro={erros.subtitulo}
              maxLength={SUBTITULO_MAXIMO}
            />
          </div>

          <div className="campo">
            <span className="campo__rotulo">Cor</span>
            <div className="turnoform__cores" role="radiogroup" aria-label="Cor">
              {CORES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={form.cor === c.id}
                  aria-label={c.rotulo}
                  title={c.rotulo}
                  className="turnoform__cor"
                  style={{ '--turno-cor': c.cor }}
                  onClick={() => mudar('cor')(c.id)}
                />
              ))}
            </div>
          </div>

          <div className="turnoform__dupla">
            <CampoData rotulo="Início" valor={form.dataInicio} aoMudar={mudar('dataInicio')} erro={erros.dataInicio} />
            <CampoData
              rotulo="Fim"
              valor={form.dataFim}
              min={form.dataInicio || undefined}
              aoMudar={mudar('dataFim')}
              erro={erros.dataFim}
            />
          </div>

          <label className="formrot__marca turnoform__inteiro">
            <input type="checkbox" checked={form.diaInteiro} onChange={mudar('diaInteiro')} />
            <span>Dia inteiro (sem horário — ex.: folga)</span>
          </label>

          {!form.diaInteiro && (
            <div className="turnoform__dupla">
              <CampoHora rotulo="Das" valor={form.horaInicio} aoMudar={mudar('horaInicio')} erro={erros.horaInicio} />
              <CampoHora rotulo="Às" valor={form.horaFim} aoMudar={mudar('horaFim')} erro={erros.horaFim} />
            </div>
          )}
        </fieldset>

        <p className="turnoform__previa" style={{ '--turno-cor': corPorId(form.cor).cor }}>
          <strong>{form.titulo || 'Título'}</strong>
          <span>{form.subtitulo || ' '}</span>
        </p>

        {erros.geral && (
          <p className="formdesp__erro" role="alert">
            {erros.geral}
          </p>
        )}

        <footer className="formobra__acoes">
          {turno && !somenteLeitura && (
            <button type="button" className="formrot__apagar" onClick={() => setApagando(true)} disabled={salvando}>
              Excluir
            </button>
          )}
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            {somenteLeitura ? 'Fechar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <Button type="submit" loading={salvando}>
              {turno ? 'Salvar' : 'Criar turno'}
            </Button>
          )}
        </footer>
      </form>

      <Confirma
        aberto={apagando}
        titulo="Excluir este turno?"
        mensagem={`${form.titulo} · ${dataBR(form.dataInicio)}${form.dataFim && form.dataFim !== form.dataInicio ? ` a ${dataBR(form.dataFim)}` : ''}`}
        rotuloConfirmar="Excluir"
        aoConfirmar={apagar}
        aoFechar={() => setApagando(false)}
      />
    </Modal>
  )
}
