import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoArea, CampoDinheiro, CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { CampoData } from '@/components/CampoData/CampoData'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import { ETIQUETAS, FUNIS, ROTULO_STATUS, emailValido, funilPorId } from '@/domain/comercial'
import { dataHora } from '@/utils/formato'
import * as comercial from '@/services/comercialService'
import { IconeEmail, IconeLixo, IconeTrofeu } from './icones'

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

const VAZIO = {
  funil: 'novos',
  etapa: '',
  titulo: '',
  clienteId: '',
  organizacao: '',
  pessoaId: '',
  contatoNome: '',
  contatoEmail: '',
  contatoTelefone: '',
  centavos: null,
  responsavelId: '',
  etiqueta: '',
  proximaAtividade: '',
  atividadeDescricao: '',
  previsaoFechamento: '',
  observacao: '',
}

/**
 * Criar e editar negocio — o "Adicionar negócio" do Pipedrive.
 *
 * A empresa sai da lista de clientes; a que ainda nao e cliente (a
 * prospeccao inteira) entra como "Empresa não cadastrada", com o nome
 * escrito na mao. A pessoa de contato sai das pessoas daquele cliente
 * (Clientes > editar), ou e escrita aqui.
 *
 * A etapa e a barra de setas do topo, como no Pipedrive: clicar numa
 * seta poe o negocio naquela etapa.
 *
 * Editando, o rodape ganha Ganho, Perdido (ou Reabrir) e Excluir.
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
}) {
  const { clientes, equipe } = useDados()
  const { user } = useAuth()
  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setErros({})
    setErro('')
    if (negocio) {
      setForm({
        ...VAZIO,
        funil: negocio.funil,
        etapa: negocio.etapa,
        titulo: negocio.titulo,
        clienteId: negocio.clienteId ?? (negocio.organizacao ? OUTRA : ''),
        organizacao: negocio.clienteId ? '' : negocio.organizacao,
        pessoaId: negocio.pessoaId ?? (negocio.contatoNome || negocio.contatoEmail ? OUTRA : ''),
        contatoNome: negocio.pessoaId ? '' : negocio.contatoNome,
        contatoEmail: negocio.pessoaId ? '' : negocio.contatoEmail,
        contatoTelefone: negocio.pessoaId ? '' : negocio.contatoTelefone,
        centavos: Math.round(Number(negocio.valor || 0) * 100) || null,
        responsavelId: negocio.responsavelId ?? '',
        etiqueta: negocio.etiqueta ?? '',
        proximaAtividade: negocio.proximaAtividade ?? '',
        atividadeDescricao: negocio.atividadeDescricao ?? '',
        previsaoFechamento: negocio.previsaoFechamento ?? '',
        observacao: negocio.observacao ?? '',
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
  }, [aberto, negocio, inicial, user?.id])

  const funil = funilPorId(form.funil) ?? FUNIS[0]
  const cliente = clientes.find((c) => String(c.id) === String(form.clienteId)) ?? null
  const pessoas = cliente?.pessoas ?? []
  const somenteLeitura = !podeEditar

  const pessoasDaEquipe = useMemo(
    () =>
      equipe
        .filter((p) => p.ativo !== false || String(p.id) === String(form.responsavelId))
        .map((p) => ({ valor: String(p.id), rotulo: p.nome }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    [equipe, form.responsavelId],
  )

  const mudar = (campo) => (evento) => {
    const valor = evento?.target ? evento.target.value : evento
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
    setErro('')
  }

  const mudarFunil = (evento) => {
    const novo = funilPorId(evento.target.value)
    if (!novo) return
    setForm((atual) => ({
      ...atual,
      funil: novo.id,
      /* a etapa so continua se ela existe no funil novo */
      etapa: novo.etapas.some((e) => e.id === atual.etapa) ? atual.etapa : novo.etapas[0].id,
    }))
  }

  /* trocar a empresa desfaz a pessoa escolhida (ela era da outra) */
  const mudarCliente = (evento) => {
    const valor = evento.target.value
    setForm((atual) => ({ ...atual, clienteId: valor, pessoaId: '' }))
    setErros((atual) => ({ ...atual, clienteId: undefined, organizacao: undefined }))
  }

  const conferir = () => {
    const novos = {}
    if (!form.titulo.trim()) novos.titulo = 'Dê um título ao negócio.'
    if (!form.clienteId) novos.clienteId = 'Escolha o cliente (ou "Empresa não cadastrada").'
    if (form.clienteId === OUTRA && !form.organizacao.trim()) novos.organizacao = 'Escreva o nome da empresa.'
    const email = form.pessoaId === OUTRA || !cliente ? form.contatoEmail.trim() : ''
    if (email && !emailValido(email)) novos.contatoEmail = 'O e-mail não parece certo.'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const enviar = async (evento) => {
    evento.preventDefault()
    if (somenteLeitura || !conferir()) return
    const comCliente = form.clienteId && form.clienteId !== OUTRA
    const pessoaEscolhida = comCliente && form.pessoaId && form.pessoaId !== OUTRA
    const campos = {
      funil: form.funil,
      etapa: form.etapa,
      titulo: form.titulo.trim(),
      clienteId: comCliente ? form.clienteId : null,
      organizacao: comCliente ? '' : form.organizacao.trim(),
      pessoaId: pessoaEscolhida ? form.pessoaId : null,
      contatoNome: pessoaEscolhida ? '' : form.contatoNome.trim(),
      contatoEmail: pessoaEscolhida ? '' : form.contatoEmail.trim(),
      contatoTelefone: pessoaEscolhida ? '' : form.contatoTelefone.trim(),
      valor: (form.centavos ?? 0) / 100,
      responsavelId: form.responsavelId || null,
      etiqueta: form.etiqueta || null,
      proximaAtividade: form.proximaAtividade || null,
      atividadeDescricao: form.atividadeDescricao.trim(),
      previsaoFechamento: form.previsaoFechamento || null,
      observacao: form.observacao.trim(),
    }
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

  const indiceEtapa = funil.etapas.findIndex((e) => e.id === form.etapa)
  /* nome, e-mail e telefone escritos a mao: empresa nao cadastrada, ou
     cliente sem pessoas (ou "Outra pessoa") */
  const mostraCamposDoContato =
    form.clienteId === OUTRA || (Boolean(cliente) && (form.pessoaId === OUTRA || pessoas.length === 0))

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
      largura={760}
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
          Etapa: <strong>{funil.etapas[indiceEtapa]?.rotulo ?? '—'}</strong>
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
            value={form.clienteId}
            onChange={mudarCliente}
            erro={erros.clienteId}
            vazio="Escolha o cliente..."
            opcoes={[
              { valor: OUTRA, rotulo: 'Empresa não cadastrada…' },
              ...clientes.map((c) => ({ valor: String(c.id), rotulo: c.nome })),
            ]}
          />

          {form.clienteId === OUTRA ? (
            <CampoTexto
              rotulo="Nome da empresa"
              placeholder="Ex.: Laboratório Exemplo"
              value={form.organizacao}
              onChange={mudar('organizacao')}
              erro={erros.organizacao}
              maxLength={200}
            />
          ) : (
            <CampoSelecao
              rotulo="Pessoa de contato"
              value={form.pessoaId}
              onChange={mudar('pessoaId')}
              vazio={cliente ? (pessoas.length ? 'Escolha a pessoa...' : 'Nenhuma pessoa cadastrada') : 'Escolha o cliente antes'}
              disabled={!cliente}
              opcoes={[
                ...pessoas.map((p) => ({ valor: p.id, rotulo: p.email ? `${p.nome} — ${p.email}` : p.nome })),
                { valor: OUTRA, rotulo: 'Outra pessoa…' },
              ]}
            />
          )}

          {mostraCamposDoContato && (
            <>
              <CampoTexto
                rotulo="Nome do contato"
                placeholder="Nome e sobrenome"
                value={form.contatoNome}
                onChange={mudar('contatoNome')}
                maxLength={200}
              />
              <CampoTexto
                rotulo="E-mail do contato"
                type="email"
                placeholder="nome@empresa.com.br"
                value={form.contatoEmail}
                onChange={mudar('contatoEmail')}
                erro={erros.contatoEmail}
                dica="É para ele que vai o “Responder?” do cartão."
              />
              <CampoTexto
                rotulo="Telefone do contato"
                inputMode="tel"
                placeholder="(11) 90000-0000"
                value={form.contatoTelefone}
                onChange={mudar('contatoTelefone')}
                maxLength={40}
              />
            </>
          )}

          <CampoDinheiro
            rotulo="Valor"
            centavos={form.centavos}
            aoMudar={(c) => setForm((atual) => ({ ...atual, centavos: c }))}
            erro={erros.valor}
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

          <div className="negform__atividade campo--largo">
            <DataOpcional
              rotulo="Próxima atividade"
              valor={form.proximaAtividade}
              aoMudar={(v) => setForm((atual) => ({ ...atual, proximaAtividade: v ?? '' }))}
              vazio="Nenhuma agendada"
            />
            <CampoTexto
              rotulo="O que fazer"
              placeholder="Ex.: Ligar para confirmar o pedido de compra"
              value={form.atividadeDescricao}
              onChange={mudar('atividadeDescricao')}
              maxLength={200}
            />
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
    </Modal>
  )
}
