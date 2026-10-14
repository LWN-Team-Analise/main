import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoArea, CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { CampoData, CampoHora } from '@/components/CampoData/CampoData'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import {
  CHECKLIST,
  OBSERVACAO_MAXIMA,
  PERGUNTA_POSTO,
  POSTO_MAXIMO,
  kmLegivel,
  lerHora,
} from '@/domain/frotas'
import * as frotasApi from '@/services/frotasService'
import { dataBR, hojeISO } from '@/utils/formato'
import { DIAS, diaDaSemana, finaisDoDia, finalDaPlaca, horariosLegiveis } from '@/domain/rodizio'
import CampoFotos, { fotosCompletas } from './CampoFotos'
/* aberto tambem de dentro da obra (Retirada do carro): os estilos vem junto */
import './Frotas.css'

/**
 * O formulario de SAIDA e o de DEVOLUCAO — um so, com os campos de
 * cada caso, na ordem da planilha que a equipe ja usava no Forms.
 *
 * Tudo e obrigatorio, inclusive as cinco fotos. A tela confere antes
 * de enviar (o recado aparece no campo na hora), mas quem manda e a
 * API: ela confere de novo, e quando recusa diz o campo, que acende
 * aqui do mesmo jeito.
 *
 * As duas regras que dependem do carro:
 *   - o KM nao pode ser menor que o ultimo registrado dele;
 *   - a data e a hora nao podem ser anteriores ao ultimo registro.
 *
 * Saida de um carro que ja esta em uso e uma TROCA de condutor: o
 * formulario avisa, e a API grava assim.
 *
 * `fixo` ({ veiculoId, obraId, obraNome }) e a RETIRADA do carro
 * reservado, aberta de dentro da obra (check "Retirada do carro"): o
 * carro e a obra ja vem escolhidos e nao mudam. A API liga a saida a
 * reserva e marca o check.
 *
 * `rodizio` (GET /frotas/rodizio) avisa quando o carro escolhido esta
 * no rodizio de Sao Paulo no dia da saida.
 */

const SIM_NAO = [
  { valor: 'sim', rotulo: 'Sim' },
  { valor: 'nao', rotulo: 'Não' },
]

const VAZIO = {
  condutorId: '',
  veiculoId: '',
  km: '',
  data: '',
  hora: '',
  obraId: '',
  observacao: '',
  checklist: {},
  posto: '',
}

function agoraHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* KM a mais que isto desde o ultimo registro pede uma conferida
   (nao trava: viagem longa existe) */
const SALTO_SUSPEITO = 3000

const TEXTO = {
  saida: {
    titulo: 'Saída de veículo',
    quem: 'Nome de quem está dando saída',
    carro: 'Qual o modelo do carro?',
    km: 'KM de saída ou troca (apenas números)',
    data: 'Data de saída ou troca',
    hora: 'Horário de saída ou troca',
    observacao: 'Observações saída ou troca',
    fotos: 'Fotos do carro na saída ou troca',
    enviar: 'Registrar saída',
  },
  devolucao: {
    titulo: 'Devolução de veículo',
    quem: 'Nome de quem está dando devolução',
    carro: 'Qual o modelo do carro?',
    km: 'KM de devolução (apenas números)',
    data: 'Data de devolução',
    hora: 'Horário de devolução',
    observacao: 'Observações devolução',
    fotos: 'Fotos do carro na devolução',
    enviar: 'Registrar devolução',
  },
}

/** 'Spin 01 · ABC1D23' */
const nomeDoVeiculo = (v) => [v.nome, v.placa].filter(Boolean).join(' · ')

/** 'Hospital ABC — 1042/2026' */
function rotuloDaObra(obra, cliente) {
  const qual = String(obra.proposta ?? '').trim() || String(obra.descricao ?? '').trim()
  const curto = qual.length > 60 ? `${qual.slice(0, 59)}…` : qual
  return [cliente?.nome, curto].filter(Boolean).join(' — ') || 'Obra sem nome'
}

export default function ModalRegistro({ modo, veiculos, aoFechar, aoRegistrado, fixo = null, rodizio = null }) {
  const { user } = useAuth()
  const { equipe, obras, clientes, concluida } = useDados()
  const aberto = Boolean(modo)
  const textos = TEXTO[modo] ?? TEXTO.saida
  const devolucao = modo === 'devolucao'

  const [form, setForm] = useState(VAZIO)
  const [fotos, setFotos] = useState({})
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)

  /* abriu: comeca limpo, com a data e a hora de agora */
  useEffect(() => {
    if (!aberto) return
    setForm({ ...VAZIO, data: hojeISO(), hora: agoraHHMM(), veiculoId: fixo?.veiculoId ?? '', obraId: fixo?.obraId ?? '' })
    setFotos({})
    setErros({})
  }, [aberto, modo])

  /* ---- as listas ---- */

  const opcoesCondutor = useMemo(
    () =>
      [...equipe]
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
        .map((p) => ({ valor: String(p.id), rotulo: p.nome })),
    [equipe],
  )

  /* na saida, todos os veiculos ativos (o que esta em uso vira troca);
     na devolucao, so os que estao em uso */
  const veiculosDaLista = useMemo(
    () => veiculos.filter((v) => v.ativo && (!devolucao || v.emUso)),
    [veiculos, devolucao],
  )

  const opcoesVeiculo = useMemo(
    () =>
      veiculosDaLista.map((v) => ({
        valor: v.id,
        rotulo: v.emUso && !devolucao ? `${nomeDoVeiculo(v)} — em uso` : nomeDoVeiculo(v),
      })),
    [veiculosDaLista, devolucao],
  )

  /* so as obras que estao no quadro (as concluidas ja sairam de la),
     agrupadas pelo nome do cliente */
  const opcoesObra = useMemo(() => {
    const clientePorId = new Map(clientes.map((c) => [String(c.id), c]))
    return obras
      .filter((o) => !concluida(o))
      .map((o) => ({ valor: String(o.id), rotulo: rotuloDaObra(o, clientePorId.get(String(o.clienteId))) }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }))
  }, [obras, clientes, concluida])

  const veiculo = veiculos.find((v) => v.id === form.veiculoId) ?? null
  const ultimo = veiculo?.ultimo ?? null
  const kmMinimo = veiculo?.kmAtual ?? null

  /* ---- mudar ---- */

  const limparErro = (...campos) =>
    setErros((atual) => {
      const novo = { ...atual, geral: undefined }
      campos.forEach((c) => delete novo[c])
      return novo
    })

  const mudar = (campo) => (evento) => {
    const valor = evento?.target ? evento.target.value : evento
    setForm((atual) => ({ ...atual, [campo]: valor }))
    limparErro(campo)
  }

  const escolherVeiculo = (evento) => {
    const veiculoId = evento.target.value
    const escolhido = veiculos.find((v) => v.id === veiculoId)
    setForm((atual) => {
      /* na devolucao, o condutor ja vem preenchido com quem saiu com o
         carro (se ele for da equipe) — da para trocar */
      const condutor = escolhido?.ultimo?.condutorId
      const sugerido =
        devolucao && !atual.condutorId && condutor && opcoesCondutor.some((o) => o.valor === condutor)
          ? condutor
          : atual.condutorId
      return { ...atual, veiculoId, condutorId: sugerido }
    })
    limparErro('veiculoId', 'km', 'data', 'hora', 'condutorId')
  }

  const mudarKm = (evento) => {
    /* so numeros: letra, ponto e virgula nem entram */
    const km = evento.target.value.replace(/\D/g, '').slice(0, 7)
    setForm((atual) => ({ ...atual, km }))
    limparErro('km')
  }

  const responder = (chave) => (evento) => {
    const valor = evento.target.value
    setForm((atual) => ({
      ...atual,
      checklist: { ...atual.checklist, [chave]: valor },
      posto: chave === 'semParar' && valor !== 'sim' ? '' : atual.posto,
    }))
    limparErro(`checklist.${chave}`, chave === 'semParar' ? 'posto' : null)
  }

  const mudarFotos = (atualizar) => {
    setFotos(atualizar)
    limparErro('fotos')
  }

  /* ---- conferir e enviar ---- */

  const conferir = () => {
    const novos = {}
    if (!form.condutorId) novos.condutorId = 'Escolha o condutor do veículo.'
    if (!form.veiculoId) novos.veiculoId = 'Escolha o veículo.'

    if (!form.km) novos.km = 'Informe o KM.'
    else if (kmMinimo !== null && Number(form.km) < kmMinimo) {
      novos.km = `O KM não pode ser menor que o último registrado: ${kmLegivel(kmMinimo)}.`
    }

    if (!form.data) novos.data = 'Informe a data.'
    else if (form.data > hojeISO()) novos.data = 'A data não pode ser no futuro.'
    else if (ultimo?.data && form.data < ultimo.data) {
      novos.data = `Não pode ser antes do último registro deste veículo (${dataBR(ultimo.data)}).`
    }

    const hora = lerHora(form.hora)
    if (!hora) novos.hora = 'Informe o horário (HH:MM).'
    else if (!novos.data && ultimo?.hora && form.data === ultimo.data && hora < ultimo.hora) {
      novos.hora = `Não pode ser antes do último registro deste veículo (${ultimo.hora}).`
    }

    if (!devolucao && !form.obraId) novos.obraId = 'Escolha a obra de destino.'

    if (devolucao) {
      CHECKLIST.forEach((c) => {
        if (!form.checklist[c.chave]) novos[`checklist.${c.chave}`] = 'Responda sim ou não.'
      })
      if (form.checklist.semParar === 'sim' && !form.posto.trim()) {
        novos.posto = 'Informe o posto e o valor aproximado.'
      }
    }

    if (!form.observacao.trim()) novos.observacao = 'Escreva a observação (se não houver nada, escreva "Nenhuma").'
    if (!fotosCompletas(fotos)) novos.fotos = 'Tire as cinco fotos: os quatro lados e o painel.'
    return novos
  }

  const enviar = async (evento) => {
    evento.preventDefault()
    if (salvando) return

    const novos = conferir()
    if (Object.keys(novos).length > 0) {
      setErros(novos)
      /* o primeiro campo com problema vai para a vista — no celular o
         formulario e comprido e o recado ficava escondido la em cima */
      requestAnimationFrame(() => {
        document.querySelector('.frota-form .has-erro')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }

    setSalvando(true)
    setErros({})
    try {
      const comum = {
        veiculoId: form.veiculoId,
        condutorId: form.condutorId,
        km: form.km,
        data: form.data,
        hora: lerHora(form.hora),
        observacao: form.observacao.trim(),
        fotos,
      }
      const resposta = devolucao
        ? await frotasApi.registrarDevolucao({
            ...comum,
            checklist: form.checklist,
            posto: form.checklist.semParar === 'sim' ? form.posto.trim() : '',
          })
        : await frotasApi.registrarSaida({ ...comum, obraId: form.obraId })
      await aoRegistrado?.(resposta.registro, resposta)
      aoFechar()
    } catch (e) {
      setErros(e.campo ? { [e.campo]: e.message } : { geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) return null

  const salto = veiculo && kmMinimo !== null && form.km && Number(form.km) - kmMinimo > SALTO_SUSPEITO
  const dicaKm = veiculo
    ? kmMinimo !== null
      ? `Último KM registrado do ${veiculo.nome}: ${kmLegivel(kmMinimo)}.${
          salto ? ` Confira: são ${kmLegivel(Number(form.km) - kmMinimo)} a mais.` : ''
        }`
      : `O ${veiculo.nome} ainda não tem KM registrado.`
    : undefined

  /* o rodizio do dia da saida: o da API (que sabe os feriados) quando o
     dia esta na semana dela; senao, so a regra do dia da semana */
  const diaRodizio = !devolucao && veiculo && form.data
    ? (rodizio?.dias ?? []).find((d) => d.data === form.data) ?? {
        data: form.data,
        finais: finaisDoDia(diaDaSemana(form.data)),
        diaSemana: diaDaSemana(form.data),
      }
    : null
  const finalPlaca = veiculo ? finalDaPlaca(veiculo.placa) : null
  const noRodizio = diaRodizio && finalPlaca !== null && diaRodizio.finais.includes(finalPlaca)
  /* reservado para OUTRA obra: avisa (quem decide e quem esta saindo) */
  const reservadoParaOutra =
    !devolucao && veiculo?.reservadoPara && veiculo.reservadoPara.obraId !== form.obraId ? veiculo.reservadoPara : null

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={fixo ? 'Retirada do carro' : textos.titulo} largura={640}>
      <form className="formdesp frota-form" onSubmit={enviar} noValidate>
        <p className="frota-form__quem">
          {textos.quem}: <strong>{user?.name ?? '—'}</strong>
        </p>

        <CampoSelecao
          rotulo="Condutor do veículo"
          value={form.condutorId}
          onChange={mudar('condutorId')}
          opcoes={opcoesCondutor}
          vazio="Escolha o colaborador..."
          erro={erros.condutorId}
        />

        {fixo ? (
          <div className="campo">
            <span className="campo__rotulo">Carro reservado para a obra</span>
            <p className="frota-form__fixo">
              {veiculo ? [veiculo.nome, veiculo.placa, [veiculo.marca, veiculo.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : 'Carro reservado'}
            </p>
          </div>
        ) : devolucao && opcoesVeiculo.length === 0 ? (
          <div className="campo">
            <span className="campo__rotulo">{textos.carro}</span>
            <p className="formdesp__aviso">Nenhum veículo está em uso agora: não há o que devolver.</p>
          </div>
        ) : (
          <CampoSelecao
            rotulo={textos.carro}
            value={form.veiculoId}
            onChange={escolherVeiculo}
            opcoes={opcoesVeiculo}
            vazio={devolucao ? 'Escolha o carro em uso...' : 'Escolha o carro...'}
            erro={erros.veiculoId}
          />
        )}

        {veiculo?.emUso && ultimo && (
          <p className={`frota-form__aviso ${devolucao ? '' : 'is-troca'}`.trim()}>
            {devolucao ? 'Saiu com ' : `O ${veiculo.nome} está em uso com `}
            <strong>{ultimo.condutorNome}</strong> desde {dataBR(ultimo.data)}
            {ultimo.hora ? ` às ${ultimo.hora}` : ''}
            {ultimo.destino ? ` (${ultimo.destino})` : ''}.
            {!devolucao && ' Esta saída fica registrada como troca de condutor.'}
          </p>
        )}

        {noRodizio && (
          <p className="frota-form__aviso is-rodizio" role="note">
            <strong>Rodízio:</strong> placa final {finalPlaca} não circula no Centro Expandido de São Paulo{' '}
            {diaRodizio.data === hojeISO() ? 'hoje' : `nesta ${DIAS[diaRodizio.diaSemana]}`}, das {horariosLegiveis()}.
          </p>
        )}

        {reservadoParaOutra && (
          <p className="frota-form__aviso is-troca" role="note">
            O {veiculo.nome} está reservado para a obra <strong>{reservadoParaOutra.nome}</strong>.
          </p>
        )}

        <CampoTexto
          rotulo={textos.km}
          inputMode="numeric"
          autoComplete="off"
          placeholder={kmMinimo !== null ? String(kmMinimo) : 'Ex.: 123456'}
          value={form.km}
          onChange={mudarKm}
          erro={erros.km}
          dica={dicaKm}
        />

        <div className="formdesp__par">
          <CampoData
            rotulo={textos.data}
            min={ultimo?.data ?? undefined}
            max={hojeISO()}
            valor={form.data}
            aoMudar={mudar('data')}
            erro={erros.data}
          />
          <CampoHora rotulo={`${textos.hora} (HH:MM)`} valor={form.hora} aoMudar={mudar('hora')} erro={erros.hora} />
        </div>

        {!devolucao && fixo && (
          <div className="campo">
            <span className="campo__rotulo">Destino / Obra</span>
            <p className="frota-form__fixo">{fixo.obraNome}</p>
          </div>
        )}

        {!devolucao && !fixo && (
          <CampoSelecao
            rotulo="Destino / Obra"
            value={form.obraId}
            onChange={mudar('obraId')}
            opcoes={opcoesObra}
            vazio={opcoesObra.length ? 'Escolha a obra...' : 'Nenhuma obra ativa'}
            erro={erros.obraId}
          />
        )}

        {devolucao && (
          <div className="frota-form__perguntas">
            {CHECKLIST.map((c) => (
              <div key={c.chave} className="frota-form__pergunta">
                <CampoSelecao
                  rotulo={c.pergunta}
                  value={form.checklist[c.chave] ?? ''}
                  onChange={responder(c.chave)}
                  opcoes={SIM_NAO}
                  vazio="Sim/Não"
                  erro={erros[`checklist.${c.chave}`]}
                />
                {c.chave === 'semParar' && form.checklist.semParar === 'sim' && (
                  <CampoTexto
                    rotulo={PERGUNTA_POSTO}
                    maxLength={POSTO_MAXIMO}
                    placeholder="Posto Ipiranga Barueri, R$ 20,50"
                    value={form.posto}
                    onChange={mudar('posto')}
                    erro={erros.posto}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <CampoArea
          rotulo={textos.observacao}
          linhas={2}
          maxLength={OBSERVACAO_MAXIMA}
          placeholder="Se não houver nada, escreva: Nenhuma"
          value={form.observacao}
          onChange={mudar('observacao')}
          erro={erros.observacao}
        />

        <CampoFotos rotulo={textos.fotos} valor={fotos} aoMudar={mudarFotos} erro={erros.fotos} />

        {erros.geral && (
          <p className="formdesp__erro" role="alert">
            {erros.geral}
          </p>
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={salvando} disabled={devolucao && opcoesVeiculo.length === 0}>
            {textos.enviar}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
