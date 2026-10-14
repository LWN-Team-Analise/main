import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoArea, CampoPastilhas, CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import {
  PRIORIDADES,
  prioridadeDaObra,
  prioridadeTravada,
  rotuloDaPrioridade,
} from '@/domain/obras'
import { dataBR, hojeISO } from '@/utils/formato'
import './ModalObra.css'

const VAZIO = {
  clienteId: '',
  proposta: '',
  descricao: '',
  prioridade: 'media',
  dataInicio: '',
  dataConclusao: '',
}

/**
 * Cadastro e edicao de obra. O mesmo formulario serve para padrao e
 * emergencia — o que muda e o tipo (e, por tabela, a cor do card no
 * quadro).
 *
 * O que identifica a obra sao DOIS campos, e nessa ordem:
 *
 *   N° da proposta — obrigatorio. E por ele que a obra e procurada no
 *                    resto da empresa, e por isso ele vem na frente do
 *                    nome do cliente no card e no titulo da obra;
 *   Descricao      — OPCIONAL. Era obrigatoria, e o resultado eram
 *                    dezenas de obras descritas como "obra" ou "-":
 *                    campo obrigatorio sem o que dizer vira ruido.
 *
 * As datas:
 *   Data de inicio      — ja vem preenchida com hoje;
 *   Prazo final         — a obra INTEIRA, ate a entrega da
 *                         documentacao. Na obra PADRAO pode ficar em
 *                         branco enquanto ninguem souber; na EMERGENCIA e
 *                         obrigatorio. E dele que sai a cor do card.
 *
 * O periodo de execucao (3a etapa) NAO entra aqui: ele e definido dentro
 * da obra, na etapa de execucao. E o TIPO e o do botao que abriu o
 * cadastro — data nenhuma transforma obra padrao em emergencia.
 *
 * Emergencia sem prazo e uma contradicao: se nao ha data ate a qual
 * aquilo precisa estar resolvido, o que existe e uma obra urgente — e
 * urgente ja e a prioridade alta da obra padrao. Fora isso, e o prazo
 * que faz a obra aparecer como atrasada na pagina inicial e entrar na
 * conta de atraso do painel: sem ele a emergencia seria a unica que
 * nunca cobra ninguem.
 *
 * Emergencia nao escolhe prioridade: e sempre alta. A tela mostra a
 * pastilha travada, e o banco garante o mesmo por gatilho.
 *
 * Com `obra`, o pop-up entra em modo edicao: os campos vem preenchidos
 * e o Salvar manda so o que mudou.
 */
export default function ModalObra({
  aberto,
  tipo = 'padrao',
  obra = null,
  clientes = [],
  aoFechar,
  aoSalvar,
}) {
  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)

  const editando = Boolean(obra)
  const tipoAtual = editando ? obra.tipo : tipo
  const emergencia = tipoAtual === 'emergencia'
  const travada = prioridadeTravada(tipoAtual)
  const prioridade = prioridadeDaObra({ tipo: tipoAtual, prioridade: form.prioridade })

  /* abrindo para criar, comeca limpa e com a data de hoje;
     abrindo para editar, comeca com o que a obra tem hoje */
  useEffect(() => {
    if (!aberto) return
    setForm(
      obra
        ? {
            clienteId: obra.clienteId ?? '',
            proposta: obra.proposta ?? '',
            descricao: obra.descricao ?? '',
            prioridade: obra.prioridade ?? 'media',
            dataInicio: obra.dataInicio ?? '',
            dataConclusao: obra.dataConclusao ?? '',
          }
        : { ...VAZIO, dataInicio: hojeISO() },
    )
    setErros({})
  }, [aberto, obra])

  const mudar = (campo) => (evento) => {
    const valor = evento?.target ? evento.target.value : evento
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }

  /* obra criada entra no quadro de todo mundo e comeca a cobrar setor:
     vale conferir a empresa e o tipo antes de soltar */
  const [conferindo, setConferindo] = useState(false)

  const enviar = (evento) => {
    evento.preventDefault()

    const novosErros = {}
    if (!form.clienteId) novosErros.clienteId = 'Escolha a empresa.'
    if (!form.proposta.trim()) novosErros.proposta = 'Informe o n° da proposta.'
    /* a descricao NAO entra aqui: e opcional de propósito */
    if (!form.dataInicio) novosErros.dataInicio = 'Informe a data de início.'

    /* Na EMERGENCIA a data de conclusao e obrigatoria.
       Emergencia sem prazo e uma contradicao: se nao ha uma data ate a
       qual aquilo precisa estar resolvido, o que existe e uma obra
       urgente, e urgente ja e a prioridade alta da obra padrao. E e o
       prazo que faz a obra aparecer como atrasada na pagina inicial e
       entrar na conta de atraso do painel — sem ele a emergencia e a
       unica que nunca cobra ninguem. Na obra padrao ele continua
       opcional: ali a data as vezes so se sabe depois. */
    if (emergencia && !form.dataConclusao) {
      novosErros.dataConclusao = 'Obra de emergência precisa de um prazo final.'
    }

    /* prazo antes do inicio quase sempre e dedo trocado no teclado */
    if (form.dataConclusao && form.dataConclusao < form.dataInicio) {
      novosErros.dataConclusao = 'O prazo final não pode ser antes do início.'
    }
    /* a execucao cabe dentro da obra: o prazo final nao pode ficar antes
       do periodo de execucao ja definido la dentro */
    const fimDaExecucao = obra?.execucaoPrazo || obra?.execucaoInicio
    if (form.dataConclusao && fimDaExecucao && form.dataConclusao < fimDaExecucao) {
      novosErros.dataConclusao = `O prazo final não pode ser antes da execução (${dataBR(fimDaExecucao)}).`
    }

    if (Object.keys(novosErros).length > 0) {
      setErros(novosErros)
      return
    }

    /* editar nao precisa de conferencia: a obra ja existe e o que muda
       aparece na hora. A pergunta e so para a que esta NASCENDO. */
    if (editando) {
      gravar()
      return
    }
    setConferindo(true)
  }

  const gravar = async () => {
    setSalvando(true)
    try {
      await aoSalvar({ ...form, prioridade, tipo: tipoAtual })
      setConferindo(false)
      aoFechar()
    } catch (e) {
      setErros({ geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  const titulo = editando
    ? 'Editar obra'
    : emergencia
      ? 'Nova obra emergência'
      : 'Nova obra padrão'

  const subtitulo = editando
    ? 'O que mudar aqui fica registrado com o seu nome e a hora.'
    : undefined

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo} subtitulo={subtitulo} largura={560}>
      <form className="formobra" onSubmit={enviar} noValidate>
        <span className={`formobra__selo ${emergencia ? 'is-emergencia' : ''}`.trim()}>
          {emergencia ? 'Emergência' : 'Padrão'}
        </span>

        {clientes.length === 0 ? (
          <p className="formobra__semcliente">
            Nenhum cliente cadastrado —{' '}
            <Link to="/app/clientes" onClick={aoFechar}>
              cadastre o primeiro
            </Link>{' '}
            para continuar.
          </p>
        ) : (
          <CampoSelecao
            rotulo="Empresa"
            largo
            value={form.clienteId}
            onChange={mudar('clienteId')}
            erro={erros.clienteId}
            vazio="Escolha o cliente..."
            opcoes={clientes.map((c) => ({ valor: c.id, rotulo: c.nome }))}
          />
        )}

        {/* o n° da proposta vem logo depois da empresa: os dois juntos
            sao o nome da obra em todo o resto do sistema */}
        <CampoTexto
          rotulo="N° da proposta"
          largo
          placeholder="Ex.: 1042/2026"
          value={form.proposta}
          onChange={mudar('proposta')}
          erro={erros.proposta}
        />

        <CampoArea
          rotulo="Descrição"
          largo
          linhas={3}
          placeholder="O que precisa ser feito nesta obra?"
          value={form.descricao}
          onChange={mudar('descricao')}
          erro={erros.descricao}
        />

        {/* emergencia nao escolhe: a prioridade e alta e nao muda */}
        {travada ? (
          <div className="campo">
            <span className="campo__rotulo">Prioridade</span>
            <div className="pastilhas">
              {/* "Urgente", e não "Alta": no banco a emergência continua
                  sendo alta (é o gatilho que garante), mas "Alta" não
                  distinguia nada — a obra padrão também pode ser alta.
                  Urgente é a palavra que só a emergência usa. */}
              <span className="pastilha is-atual is-travada" data-tom="urgente">
                Urgente
              </span>
            </div>
          </div>
        ) : (
          <CampoPastilhas
            rotulo="Prioridade"
            valor={form.prioridade}
            aoMudar={mudar('prioridade')}
            opcoes={PRIORIDADES.map((p) => ({ valor: p.id, rotulo: p.rotulo }))}
          />
        )}

        <div className="formobra__datas">
          <CampoTexto
            rotulo="Data de início"
            type="date"
            value={form.dataInicio}
            onChange={mudar('dataInicio')}
            erro={erros.dataInicio}
          />
          {/* O mesmo (!) da tela da obra, aqui dentro do formulário:
              obra padrão que já existe e continua sem data de
              conclusão. É o campo ao lado que resolve, então aqui ele
              é só o sinal — não leva a lugar nenhum.

              Só na EDIÇÃO. Numa obra nascendo o campo está vazio por
              definição, e piscar em todo cadastro novo ensinaria a
              ignorar o sinal justamente onde ele importa. */}
          <div className="pendencia__caixa">
            <CampoTexto
              rotulo={emergencia ? 'Prazo final *' : 'Prazo final'}
              type="date"
              required={emergencia}
              min={form.dataInicio || undefined}
              value={form.dataConclusao}
              onChange={mudar('dataConclusao')}
              erro={erros.dataConclusao}
            />

            {editando && !emergencia && !form.dataConclusao && (
              <span
                className="pendencia pendencia--parada"
                title="Esta obra está sem prazo final. Sem ele o card fica verde e ela nunca aparece como atrasada."
                role="img"
                aria-label="Pendente: esta obra está sem prazo final"
              >
                !
              </span>
            )}
          </div>
        </div>

        {erros.geral && (
          <p className="formobra__erro" role="alert">
            {erros.geral}
          </p>
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" disabled={clientes.length === 0} loading={salvando}>
            {editando ? 'Salvar alterações' : emergencia ? 'Abrir emergência' : 'Adicionar obra'}
          </Button>
        </footer>
      </form>

      {/* Conferência antes de soltar a obra no quadro: ela passa a aparecer
          para a equipe inteira e a cobrar setor da primeira etapa. */}
      <Confirma
        aberto={conferindo}
        nivel={1}
        tom="acao"
        titulo={emergencia ? 'Abrir esta emergência?' : 'Criar esta obra?'}
        mensagem="Ela entra no quadro e passa a cobrar os setores da primeira etapa."
        detalhes={
          <dl>
            <dt>N° da proposta</dt>
            <dd>{form.proposta.trim() || '—'}</dd>

            <dt>Empresa</dt>
            <dd>{clientes.find((c) => String(c.id) === String(form.clienteId))?.nome ?? '—'}</dd>

            <dt>Tipo</dt>
            <dd>{emergencia ? 'Emergência' : 'Padrão'}</dd>

            <dt>Prioridade</dt>
            <dd>{emergencia ? 'Urgente' : rotuloDaPrioridade(prioridade)}</dd>

            <dt>Descrição</dt>
            <dd>{form.descricao.trim() || <em>sem descrição</em>}</dd>
          </dl>
        }
        aviso={
          emergencia
            ? 'Emergência nasce com prioridade alta e vai para o topo do quadro de todo mundo.'
            : undefined
        }
        rotuloConfirmar={emergencia ? 'Abrir emergência' : 'Criar obra'}
        aoConfirmar={gravar}
        aoFechar={() => setConferindo(false)}
      />
    </Modal>
  )
}
