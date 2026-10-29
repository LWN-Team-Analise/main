import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoArea, CampoDinheiro, CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { CampoData } from '@/components/CampoData/CampoData'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import {
  ETIQUETAS,
  FUNIS,
  MOEDAS,
  ROTULO_STATUS,
  TIPOS_CONTATO,
  emailValido,
  funilPorId,
} from '@/domain/comercial'
import { clientesParaEscolher } from '@/domain/clientes'
import { dataHora } from '@/utils/formato'
import * as comercial from '@/services/comercialService'
import { IconeEmail, IconeImportar, IconeLixo, IconeMais, IconeObra, IconeTrofeu } from './icones'

/** A data que pode ficar em branco: o calendario e, embaixo, o "Tirar data". */
function DataOpcional({ rotulo, valor, aoMudar, vazio }) {
  return (
    <div className="negform__data">
      <CampoData rotulo={rotulo} valor={valor} aoMudar={aoMudar} vazio={vazio} />
      {valor && (
        <button type="button" className="negform__limpar" onClick={() => aoMudar('')}>
          Tirar data
        </button>
      )}
    </div>
  )
}

/* a empresa que ainda nao e cliente cadastrado (a prospeccao) */
const OUTRA = '__outra'
/* o funil cujo negocio NOVO ja cria a obra em Obras (atualizacao 30) */
const FUNIL_DA_OBRA = 'novos'
/* o contato escrito so neste negocio (os negocios antigos, de antes do
   "Adicionar contato"): nome e telefone guardados no proprio negocio */
const DO_NEGOCIO = '__negocio'

const VAZIO = {
  funil: 'novos',
  etapa: '',
  titulo: '',
  clienteId: '',
  organizacao: '',
  pessoaId: '',
  contatoTipo: 'comercial',
  contatoNome: '',
  contatoEmail: '',
  contatoTelefone: '',
  centavos: null,
  moeda: 'BRL',
  responsavelId: '',
  etiqueta: '',
  probabilidade: '',
  /* sem campo na tela; seguem como estavam ao salvar */
  proximaAtividade: '',
  atividadeDescricao: '',
  previsaoFechamento: '',
  observacao: '',
  /* o n° da proposta da obra que nasce junto (so Novos negocios) */
  proposta: '',
}

const NOVO_CONTATO = { nome: '', email: '', telefone: '' }

/**
 * Criar e editar negocio — o "Adicionar negócio" do Pipedrive.
 *
 * A empresa sai da lista de clientes; a que ainda nao e cliente (a
 * prospeccao inteira) entra como "Empresa não cadastrada", com o nome
 * escrito na mao.
 *
 * O CONTATO nao depende da empresa: a lista traz todas as pessoas
 * cadastradas (as da empresa escolhida primeiro), e o "Adicionar
 * contato" cria uma ali mesmo — na empresa escolhida, ou sem empresa.
 * Ao lado, se o contato e comercial ou pessoal; embaixo, o e-mail do
 * negocio, que vem do contato e pode ser trocado (e para ele que vai o
 * "Responder?").
 *
 * O valor tem moeda (Real, Dolar ou Euro) e o negocio tem a
 * probabilidade de fechar, em %.
 *
 * A etapa e a barra de setas do topo, como no Pipedrive: clicar numa
 * seta poe o negocio naquela etapa.
 *
 * Novo, o rodape tem o Importar no canto esquerdo; editando, ganha
 * Ganho, Perdido (ou Reabrir) e Excluir.
 *
 * NOVOS NEGOCIOS VIRAM OBRA — quando forem COMPARTILHADOS com a equipe
 * (atualizacao 37). Adicionado, o negocio fica pendente, so no Comercial;
 * o "Compartilhar com a equipe" do rodape e que faz a obra nascer em Obras,
 * para todo mundo. Por isso, ali, a empresa tem de ser um cliente
 * cadastrado (a obra precisa dele) e aparece o "N° da proposta" da obra,
 * que vem sugerido como no "Nova obra" (o da ultima, mais um). O titulo
 * do negocio vira a descricao da obra. Depois, o negocio mostra o atalho
 * para a obra dele.
 */
export default function ModalNegocio({
  aberto,
  negocio = null,
  inicial = null,
  podeEditar,
  podeExcluir,
  podeEmail,
  aoFechar,
  aoSalvo,
  aoGanhar,
  aoPerder,
  aoReabrir,
  aoExcluir,
  aoEmail,
  aoImportar,
}) {
  const { clientes, equipe, pode, recarregar } = useDados()
  const { user } = useAuth()
  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [contatos, setContatos] = useState([])
  /* o "Adicionar contato" aberto: os campos da pessoa nova */
  const [novo, setNovo] = useState(null)
  const [errosNovo, setErrosNovo] = useState({})
  const [criandoContato, setCriandoContato] = useState(false)
  /* o "Compartilhar com a equipe": a confirmacao aberta e o envio */
  const [compartilhando, setCompartilhando] = useState(false)
  const [conferindoPartilha, setConferindoPartilha] = useState(false)

  useEffect(() => {
    if (!aberto) return undefined
    setErros({})
    setErro('')
    setNovo(null)
    setErrosNovo({})
    if (negocio) {
      setForm({
        ...VAZIO,
        funil: negocio.funil,
        etapa: negocio.etapa,
        titulo: negocio.titulo,
        clienteId: negocio.clienteId ?? (negocio.organizacao ? OUTRA : ''),
        organizacao: negocio.clienteId ? '' : negocio.organizacao,
        pessoaId: negocio.pessoaId ?? (negocio.contatoNome ? DO_NEGOCIO : ''),
        contatoTipo: negocio.contatoTipo ?? 'comercial',
        contatoNome: negocio.pessoaId ? '' : negocio.contatoNome,
        contatoEmail: negocio.contatoEmail ?? '',
        contatoTelefone: negocio.pessoaId ? '' : negocio.contatoTelefone,
        centavos: Math.round(Number(negocio.valor || 0) * 100) || null,
        moeda: negocio.moeda ?? 'BRL',
        responsavelId: negocio.responsavelId ?? '',
        etiqueta: negocio.etiqueta ?? '',
        probabilidade: negocio.probabilidade ?? '',
        proximaAtividade: negocio.proximaAtividade ?? '',
        atividadeDescricao: negocio.atividadeDescricao ?? '',
        previsaoFechamento: negocio.previsaoFechamento ?? '',
        observacao: negocio.observacao ?? '',
        proposta: negocio.proposta ?? '',
      })
    } else {
      const funil = funilPorId(inicial?.funil) ?? FUNIS[0]
      setForm({
        ...VAZIO,
        funil: funil.id,
        etapa: inicial?.etapa ?? funil.etapas[0].id,
        responsavelId: user?.id ? String(user.id) : '',
      })
    }

    /* a lista de contatos e lida a cada abertura: alguem pode ter
       cadastrado uma pessoa em Clientes nesse meio tempo */
    let vivo = true
    comercial
      .carregarContatos()
      .then((lista) => vivo && setContatos(lista))
      .catch(() => vivo && setContatos([]))
    /* negocio novo (ou pendente sem numero): o n° da proposta da obra ja
       vem sugerido. Se a pessoa ja comecou a digitar, o que ela digitou fica */
    if (!negocio || (negocio.funil === FUNIL_DA_OBRA && !negocio.obraId && !negocio.proposta)) {
      comercial
        .proximaProposta()
        .then((numero) => {
          if (vivo && numero) setForm((atual) => (atual.proposta ? atual : { ...atual, proposta: numero }))
        })
        .catch(() => {})
    }
    return () => {
      vivo = false
    }
  }, [aberto, negocio, inicial, user?.id])

  const funil = funilPorId(form.funil) ?? FUNIS[0]
  const comCliente = Boolean(form.clienteId) && form.clienteId !== OUTRA
  const somenteLeitura = !podeEditar
  /* o negocio de Novos negocios que ainda nao virou obra: PENDENTE ate
     ser compartilhado com a equipe. O novo ja pede o cliente cadastrado e o
     n° da proposta; o que ja existe so pede os dois na hora de compartilhar */
  const pendente = form.funil === FUNIL_DA_OBRA && !negocio?.obraId
  const criaObra = !negocio && pendente
  const podeCompartilhar =
    Boolean(negocio) && podeEditar && negocio.funil === FUNIL_DA_OBRA && !negocio.obraId && negocio.status === 'aberto'

  const pessoasDaEquipe = useMemo(
    () =>
      equipe
        .filter((p) => p.ativo !== false || String(p.id) === String(form.responsavelId))
        .map((p) => ({ valor: String(p.id), rotulo: p.nome }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    [equipe, form.responsavelId],
  )

  /* as pessoas da empresa escolhida primeiro; depois todo o resto */
  const opcoesContato = useMemo(() => {
    const daEmpresa = (c) => comCliente && String(c.clienteId) === String(form.clienteId)
    const rotulo = (c) => [c.nome, c.clienteNome].filter(Boolean).join(' — ')
    const ordenados = [...contatos].sort(
      (a, b) => Number(daEmpresa(b)) - Number(daEmpresa(a)) || a.nome.localeCompare(b.nome, 'pt-BR'),
    )
    return [
      ...(form.pessoaId === DO_NEGOCIO && form.contatoNome
        ? [{ valor: DO_NEGOCIO, rotulo: `${form.contatoNome} (só neste negócio)` }]
        : []),
      ...ordenados.map((c) => ({ valor: c.id, rotulo: rotulo(c) })),
    ]
  }, [contatos, comCliente, form.clienteId, form.pessoaId, form.contatoNome])

  const mudar = (campo) => (evento) => {
    const valor = evento?.target ? evento.target.value : evento
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
    setErro('')
  }

  const mudarFunil = (evento) => {
    const novoFunil = funilPorId(evento.target.value)
    if (!novoFunil) return
    setForm((atual) => ({
      ...atual,
      funil: novoFunil.id,
      /* a etapa so continua se ela existe no funil novo */
      etapa: novoFunil.etapas.some((e) => e.id === atual.etapa) ? atual.etapa : novoFunil.etapas[0].id,
      /* o negocio novo de Novos negocios vira obra: so cliente cadastrado */
      clienteId: !negocio && novoFunil.id === FUNIL_DA_OBRA && atual.clienteId === OUTRA ? '' : atual.clienteId,
    }))
  }

  const mudarCliente = (evento) => {
    const valor = evento.target.value
    setForm((atual) => ({ ...atual, clienteId: valor }))
    setErros((atual) => ({ ...atual, clienteId: undefined, organizacao: undefined }))
  }

  /* escolher o contato traz o e-mail dele — a nao ser que alguem ja
     tenha escrito outro no campo */
  const mudarContato = (evento) => {
    const id = evento.target.value
    const antes = contatos.find((c) => c.id === form.pessoaId)
    const escolhido = contatos.find((c) => c.id === id)
    setForm((atual) => {
      const emailSeguiaOContato = !atual.contatoEmail || atual.contatoEmail === (antes?.email ?? '')
      return {
        ...atual,
        pessoaId: id,
        contatoEmail: emailSeguiaOContato ? escolhido?.email ?? '' : atual.contatoEmail,
      }
    })
    setErros((atual) => ({ ...atual, contatoEmail: undefined }))
  }

  const salvarContato = async () => {
    const nome = novo.nome.trim()
    const email = novo.email.trim()
    const faltas = {}
    if (!nome) faltas.nome = 'Escreva o nome.'
    if (email && !emailValido(email)) faltas.email = 'O e-mail não parece certo.'
    setErrosNovo(faltas)
    if (Object.keys(faltas).length) return
    setCriandoContato(true)
    try {
      const contato = await comercial.criarContato({
        nome,
        email,
        telefone: novo.telefone.trim(),
        clienteId: comCliente ? form.clienteId : null,
      })
      setContatos((lista) => [...lista, contato])
      setForm((atual) => ({ ...atual, pessoaId: contato.id, contatoEmail: contato.email || atual.contatoEmail }))
      setNovo(null)
    } catch (e) {
      setErrosNovo({ [e.campo ?? 'nome']: e.message })
    } finally {
      setCriandoContato(false)
    }
  }

  const conferir = () => {
    const novos = {}
    if (!form.titulo.trim()) novos.titulo = 'Dê um título ao negócio.'
    if (!form.clienteId) {
      novos.clienteId = criaObra
        ? 'Escolha o cliente: a obra nasce com ele.'
        : 'Escolha o cliente (ou "Empresa não cadastrada").'
    }
    if (form.clienteId === OUTRA && !form.organizacao.trim()) novos.organizacao = 'Escreva o nome da empresa.'
    if (criaObra && !form.proposta.trim()) novos.proposta = 'Informe o n° da proposta da obra.'
    const email = form.contatoEmail.trim()
    if (email && !emailValido(email)) novos.contatoEmail = 'O e-mail não parece certo.'
    const prob = String(form.probabilidade).trim()
    if (prob && !(/^\d{1,3}$/.test(prob) && Number(prob) <= 100)) novos.probabilidade = 'De 0 a 100.'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const montarCampos = () => {
    const pessoaEscolhida = form.pessoaId && form.pessoaId !== DO_NEGOCIO
    const doNegocio = form.pessoaId === DO_NEGOCIO
    const prob = String(form.probabilidade).trim()
    return {
      funil: form.funil,
      etapa: form.etapa,
      titulo: form.titulo.trim(),
      clienteId: comCliente ? form.clienteId : null,
      organizacao: comCliente ? '' : form.organizacao.trim(),
      pessoaId: pessoaEscolhida ? form.pessoaId : null,
      contatoTipo: form.contatoTipo || null,
      contatoNome: doNegocio ? form.contatoNome.trim() : '',
      contatoEmail: form.contatoEmail.trim(),
      contatoTelefone: doNegocio ? form.contatoTelefone.trim() : '',
      valor: (form.centavos ?? 0) / 100,
      moeda: form.moeda,
      responsavelId: form.responsavelId || null,
      etiqueta: form.etiqueta || null,
      probabilidade: prob ? Number(prob) : null,
      proximaAtividade: form.proximaAtividade || null,
      atividadeDescricao: form.atividadeDescricao.trim(),
      previsaoFechamento: form.previsaoFechamento || null,
      observacao: form.observacao.trim(),
      ...(pendente ? { proposta: form.proposta.trim() } : {}),
    }
  }

  const enviar = async (evento) => {
    evento.preventDefault()
    if (somenteLeitura || !conferir()) return
    const campos = montarCampos()
    setSalvando(true)
    try {
      const { negocio: salvo } = negocio
        ? await comercial.editarNegocio(negocio.id, campos)
        : await comercial.criarNegocio(campos)
      aoSalvo(salvo, !negocio)
      aoFechar()
    } catch (e) {
      if (e.campo) setErros((atual) => ({ ...atual, [e.campo]: e.message }))
      else setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  /* antes de abrir a confirmacao, o que a obra precisa: cliente e n° */
  const pedirPartilha = () => {
    if (!conferir()) return
    const faltam = {}
    if (!comCliente) faltam.clienteId = 'Escolha o cliente cadastrado: a obra nasce com ele.'
    if (!form.proposta.trim()) faltam.proposta = 'Informe o n° da proposta da obra.'
    if (Object.keys(faltam).length > 0) {
      setErros((atual) => ({ ...atual, ...faltam }))
      return
    }
    setConferindoPartilha(true)
  }

  const compartilhar = async () => {
    setCompartilhando(true)
    setErro('')
    try {
      /* o que mudou na tela vai junto: o n° e o cliente que a obra usa */
      await comercial.editarNegocio(negocio.id, montarCampos())
      const { negocio: salvo } = await comercial.compartilharNegocio(negocio.id)
      /* a obra nova entra em Obras (e na pagina inicial) sem recarregar */
      recarregar()
      setConferindoPartilha(false)
      aoSalvo(salvo, false, true)
      aoFechar()
    } catch (e) {
      setConferindoPartilha(false)
      if (e.campo) setErros((atual) => ({ ...atual, [e.campo]: e.message }))
      else setErro(e.message)
    } finally {
      setCompartilhando(false)
    }
  }

  const indiceEtapa = funil.etapas.findIndex((e) => e.id === form.etapa)

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={negocio ? negocio.titulo : 'Novo negócio'}
      subtitulo={
        negocio
          ? `${funil.rotulo} · ${ROTULO_STATUS[negocio.status]}${
              negocio.criadoEm ? ` · criado em ${dataHora(negocio.criadoEm)}` : ''
            }`
          : funil.rotulo
      }
      largura={880}
    >
      <form className="negform" onSubmit={enviar} noValidate>
        {/* a etapa: as setas do Pipedrive */}
        <div className="negform__etapas" role="radiogroup" aria-label="Etapa">
          {funil.etapas.map((e, i) => (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={e.id === form.etapa}
              className="negform__etapa"
              data-feita={i <= indiceEtapa ? 'sim' : undefined}
              title={e.rotulo}
              disabled={somenteLeitura}
              onClick={() => setForm((atual) => ({ ...atual, etapa: e.id }))}
            >
              <span>{e.rotulo}</span>
            </button>
          ))}
        </div>
        <p className="negform__etapa-nome">
          <span>
            Etapa: <strong>{funil.etapas[indiceEtapa]?.rotulo ?? '—'}</strong>
          </span>
          {/* ainda nao foi para Obras: falta compartilhar com a equipe */}
          {negocio && pendente && negocio.status === 'aberto' && (
            <span className="negform__pendente">Pendente: compartilhar com a equipe</span>
          )}
          {/* o negocio que virou obra leva a ela */}
          {negocio?.obraId &&
            (pode('ver_obras') ? (
              <Link className="negform__obralink" to={`/app/obras/${negocio.obraId}`} onClick={aoFechar}>
                <IconeObra tamanho={14} />
                Obra {negocio.obraProposta || ''}
              </Link>
            ) : (
              <span className="negform__obralink">
                <IconeObra tamanho={14} />
                Obra {negocio.obraProposta || ''}
              </span>
            ))}
        </p>

        <fieldset className="negform__grade" disabled={somenteLeitura}>
          <CampoTexto
            rotulo="Título"
            largo
            placeholder="Ex.: LWN-888-26-259 - Smoke Study"
            value={form.titulo}
            onChange={mudar('titulo')}
            erro={erros.titulo}
            maxLength={200}
          />

          <CampoSelecao
            rotulo="Organização (cliente)"
            largo={form.clienteId !== OUTRA}
            value={form.clienteId}
            onChange={mudarCliente}
            erro={erros.clienteId}
            vazio="Escolha o cliente..."
            opcoes={[
              /* a obra precisa de cliente cadastrado: em Novos negocios
                 a empresa so escrita nao existe */
              ...(criaObra ? [] : [{ valor: OUTRA, rotulo: 'Empresa não cadastrada…' }]),
              /* o cliente com unidades e so a vitrine: escolhe-se a unidade */
              ...clientesParaEscolher(clientes, form.clienteId).map((c) => ({ valor: String(c.id), rotulo: c.nome })),
            ]}
          />

          {form.clienteId === OUTRA && (
            <CampoTexto
              rotulo="Nome da empresa"
              placeholder="Ex.: Laboratório Exemplo"
              value={form.organizacao}
              onChange={mudar('organizacao')}
              erro={erros.organizacao}
              maxLength={200}
            />
          )}

          {/* Novos negocios: a obra que nasce quando o negocio for compartilhado */}
          {pendente && (
            <div className="negform__obra campo--largo">
              <p className="negform__obra-nota">
                <IconeObra />
                <span>
                  A obra vai para Obras quando este negócio for compartilhado com a equipe. O título dele servirá como
                  descrição da obra.
                </span>
              </p>
              <CampoTexto
                rotulo="N° da proposta (obra)"
                placeholder="Ex.: 8235"
                value={form.proposta}
                onChange={mudar('proposta')}
                erro={erros.proposta}
                maxLength={80}
              />
            </div>
          )}

          {/* o contato e, ao lado, se ele e comercial ou pessoal */}
          <div className="negform__contato campo--largo">
            <div className="negform__contato-linha">
              <CampoSelecao
                rotulo="Contato"
                value={form.pessoaId}
                onChange={mudarContato}
                erro={erros.pessoaId}
                vazio={contatos.length ? 'Escolha o contato...' : 'Nenhum contato cadastrado'}
                opcoes={opcoesContato}
              />
              <CampoSelecao
                rotulo="Tipo"
                value={form.contatoTipo}
                onChange={mudar('contatoTipo')}
                erro={erros.contatoTipo}
                opcoes={TIPOS_CONTATO.map((t) => ({ valor: t.id, rotulo: t.rotulo }))}
              />
            </div>

            {!somenteLeitura && !novo && (
              <button
                type="button"
                className="negform__addcontato"
                onClick={() => {
                  setNovo(NOVO_CONTATO)
                  setErrosNovo({})
                }}
              >
                <IconeMais tamanho={14} />
                Adicionar contato
              </button>
            )}

            {novo && (
              <div className="negform__novocontato" role="group" aria-label="Novo contato">
                <CampoTexto
                  rotulo="Nome"
                  placeholder="Nome e sobrenome"
                  value={novo.nome}
                  onChange={(e) => setNovo((a) => ({ ...a, nome: e.target.value }))}
                  erro={errosNovo.nome}
                  maxLength={200}
                  autoFocus
                />
                <CampoTexto
                  rotulo="E-mail"
                  type="email"
                  placeholder="nome@empresa.com.br"
                  value={novo.email}
                  onChange={(e) => setNovo((a) => ({ ...a, email: e.target.value }))}
                  erro={errosNovo.email}
                />
                <CampoTexto
                  rotulo="Telefone"
                  inputMode="tel"
                  placeholder="(11) 90000-0000"
                  value={novo.telefone}
                  onChange={(e) => setNovo((a) => ({ ...a, telefone: e.target.value }))}
                  maxLength={40}
                />
                <div className="negform__novocontato-acoes">
                  <p>
                    {comCliente
                      ? `Entra nos contatos de ${clientes.find((c) => String(c.id) === String(form.clienteId))?.nome ?? 'do cliente'}.`
                      : 'Entra como contato sem empresa.'}
                  </p>
                  <button type="button" className="formobra__cancelar" onClick={() => setNovo(null)}>
                    Cancelar
                  </button>
                  <Button type="button" onClick={salvarContato} loading={criandoContato}>
                    Salvar contato
                  </Button>
                </div>
              </div>
            )}
          </div>

          <CampoTexto
            rotulo="E-mail"
            largo
            type="email"
            placeholder="nome@empresa.com.br"
            value={form.contatoEmail}
            onChange={mudar('contatoEmail')}
            erro={erros.contatoEmail}
          />

          <CampoDinheiro
            rotulo="Valor"
            centavos={form.centavos}
            moeda={form.moeda}
            aoMudar={(c) => setForm((atual) => ({ ...atual, centavos: c }))}
            erro={erros.valor}
          />

          <CampoSelecao
            rotulo="Moeda"
            value={form.moeda}
            onChange={mudar('moeda')}
            erro={erros.moeda}
            opcoes={MOEDAS.map((m) => ({ valor: m.id, rotulo: `${m.rotulo} (${m.simbolo})` }))}
          />

          <CampoSelecao
            rotulo="Funil"
            value={form.funil}
            onChange={mudarFunil}
            opcoes={FUNIS.map((f) => ({ valor: f.id, rotulo: f.rotulo }))}
          />

          <CampoSelecao
            rotulo="Responsável"
            value={form.responsavelId}
            onChange={mudar('responsavelId')}
            vazio="Sem responsável"
            opcoes={pessoasDaEquipe}
          />

          <DataOpcional
            rotulo="Data de fechamento esperada"
            valor={form.previsaoFechamento}
            aoMudar={(v) => setForm((atual) => ({ ...atual, previsaoFechamento: v ?? '' }))}
            vazio="Sem data"
          />

          {/* a probabilidade ao lado da data de fechamento */}
          <div className="negform__prob">
            <CampoTexto
              rotulo="Probabilidade"
              inputMode="numeric"
              placeholder="0"
              value={form.probabilidade}
              onChange={(e) => mudar('probabilidade')(e.target.value.replace(/\D/g, '').slice(0, 3))}
              erro={erros.probabilidade}
              aria-describedby="negform-prob-sufixo"
            />
            <span className="negform__prob-sufixo" id="negform-prob-sufixo" aria-label="por cento">
              %
            </span>
          </div>

          <div className="campo campo--largo">
            <span className="campo__rotulo">Etiqueta</span>
            <div className="negform__etiquetas" role="radiogroup" aria-label="Etiqueta">
              <button
                type="button"
                role="radio"
                aria-checked={!form.etiqueta}
                className="negform__etiqueta negform__etiqueta--nenhuma"
                onClick={() => setForm((atual) => ({ ...atual, etiqueta: '' }))}
              >
                Sem
              </button>
              {ETIQUETAS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={form.etiqueta === e.id}
                  aria-label={e.rotulo}
                  title={e.rotulo}
                  className="negform__etiqueta"
                  style={{ '--etiqueta': e.cor }}
                  onClick={() => setForm((atual) => ({ ...atual, etiqueta: e.id }))}
                />
              ))}
            </div>
          </div>

          <CampoArea
            rotulo="Observação"
            largo
            linhas={2}
            placeholder="Anotações do negócio"
            value={form.observacao}
            onChange={mudar('observacao')}
          />
        </fieldset>

        {erro && (
          <p className="negform__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="negform__rodape">
          {/* negocio novo: o Importar no canto esquerdo */}
          {!negocio && podeEditar && aoImportar && (
            <div className="negform__fecho">
              <button type="button" className="negform__importar" onClick={aoImportar}>
                <IconeImportar />
                Importar
              </button>
            </div>
          )}
          {negocio && (
            <div className="negform__fecho">
              {podeEditar && negocio.status === 'aberto' && (
                <>
                  <button type="button" className="negform__ganho" onClick={() => aoGanhar(negocio)}>
                    <IconeTrofeu />
                    Ganho
                  </button>
                  <button type="button" className="negform__perdido" onClick={() => aoPerder(negocio)}>
                    Perdido
                  </button>
                </>
              )}
              {podeCompartilhar && (
                <button
                  type="button"
                  className="negform__compartilhar"
                  onClick={pedirPartilha}
                  disabled={salvando || compartilhando}
                >
                  <IconeObra />
                  Compartilhar com a equipe
                </button>
              )}
              {podeEditar && negocio.status !== 'aberto' && (
                <button type="button" className="negform__reabrir" onClick={() => aoReabrir(negocio)}>
                  Reabrir negócio
                </button>
              )}
              {podeEmail && (
                <button type="button" className="negform__email" onClick={() => aoEmail(negocio)}>
                  <IconeEmail />
                  E-mail
                </button>
              )}
              {podeExcluir && (
                <button
                  type="button"
                  className="negform__excluir"
                  onClick={() => aoExcluir(negocio)}
                  aria-label="Excluir negócio"
                  title="Excluir negócio"
                >
                  <IconeLixo />
                </button>
              )}
            </div>
          )}
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            {somenteLeitura ? 'Fechar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <Button type="submit" loading={salvando}>
              {negocio ? 'Salvar' : 'Adicionar negócio'}
            </Button>
          )}
        </footer>
      </form>

      <Confirma
        aberto={conferindoPartilha}
        tom="acao"
        nivel={1}
        titulo="Compartilhar com a equipe?"
        mensagem="A obra deste negócio passa a aparecer em Obras, para todo mundo."
        detalhes={
          <dl>
            <dt>Obra</dt>
            <dd>
              {[clientes.find((c) => String(c.id) === String(form.clienteId))?.nome, form.proposta.trim()]
                .filter(Boolean)
                .join(' - ')}
            </dd>
            <dt>Descrição</dt>
            <dd>{form.titulo.trim() || '—'}</dd>
          </dl>
        }
        rotuloConfirmar="Compartilhar"
        aoConfirmar={compartilhar}
        aoFechar={() => setConferindoPartilha(false)}
      />
    </Modal>
  )
}
