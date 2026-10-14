import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { useDados } from '@/context/DadosContext'
import { useAuth } from '@/context/AuthContext'
import EscolhaCor from '@/components/EscolhaCor/EscolhaCor'
import Seletor from '@/components/Seletor/Seletor'
import { ALTERACAO, CHAVES, GRUPOS, VISUALIZACAO, dependentes, normalizar, travada } from '@/domain/permissoes'
import './ModalCargos.css'

const CORES_SUGERIDAS = [
  '#13b7c7', '#35b566', '#f2802a', '#3a63e8', '#9a5ce0',
  '#c2a23a', '#e0457b', '#0f9aa8', '#7a5c3e', '#5b6470',
]

/* cargo novo nasce SEM nenhuma permissao — quem administra marca uma a uma */
const VAZIO = {
  nome: '',
  cor: CORES_SUGERIDAS[0],
  curto: '',
  acessoTotal: false,
  permissoes: [],
}

/**
 * Um SETOR: cria ou edita, com Excluir ao lado de Salvar.
 *
 * Setor e o grupo da equipe (Comercial, Excelência, GQ) — e nao o cargo
 * de cada pessoa, que e texto livre no cadastro dela e nao decide
 * permissao nenhuma. No banco o setor continua sendo a tabela `cargo`,
 * e por isso o codigo daqui ainda diz "cargo": renomear a tabela
 * derrubaria as chaves estrangeiras de meia duzia de outras sem mudar
 * nada do que o sistema faz.
 *
 * O que o setor PODE fazer mora aqui embaixo, em duas listas:
 *
 *   Visualizacao — que abas ele enxerga no menu;
 *   Alteracao    — o que ele mexe dentro delas.
 *
 * As duas sao amarradas: alteracao depende da visualizacao
 * correspondente. Desmarcar "Obras" apaga junto tudo o que so faz
 * sentido dentro de Obras — e essas linhas ficam travadas ate a
 * visualizacao voltar. Sem isso daria para ter um setor que edita obra
 * e nao consegue abrir a aba de obras.
 *
 * "Acesso total" (diretoria) passa por cima de tudo: com ele marcado,
 * as listas viram informacao, nao trava.
 */
export default function ModalCargo({ aberto, cargo = null, aoFechar }) {
  const { cargos, equipe, adicionarCargo, atualizarCargo, removerCargo } = useDados()

  const [form, setForm] = useState(VAZIO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  /* cargo define o que um grupo inteiro pode fazer: confere antes de gravar */
  const [conferindo, setConferindo] = useState(false)
  /* de qual cargo a lista foi copiada — so para o seletor mostrar */
  const [copiado, setCopiado] = useState('')

  const editando = Boolean(cargo)
  const emUso = editando ? equipe.filter((p) => p.cargo === cargo.chave).length : 0

  /* As duas travas que a API aplica, espelhadas aqui para a tela nao
     oferecer o que vai ser recusado:
       - acesso total so e dado (ou tirado) por quem tem acesso total;
       - as permissoes do PROPRIO setor so mudam por quem tem acesso
         total — senao "editar setor" viraria "me dar qualquer permissao". */
  const { user } = useAuth()
  const souTotal = Boolean(user?.acessoTotal)
  const ehOMeu = editando && user?.cargoId && String(user.cargoId) === String(cargo.id)
  const listaTravada = ehOMeu && !souTotal

  useEffect(() => {
    if (!aberto) return
    setForm(
      cargo
        ? {
            nome: cargo.nome,
            cor: cargo.cor,
            curto: cargo.curto,
            acessoTotal: Boolean(cargo.acessoTotal),
            permissoes: normalizar(cargo.permissoes ?? []),
          }
        : VAZIO,
    )
    setErro('')
    setConfirmando(false)
    setCopiado('')
  }, [aberto, cargo])

  const mudar = (campo) => (valor) => {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErro('')
  }

  /**
   * Liga/desliga uma permissao.
   *
   * Ao DESMARCAR uma de visualizacao, as alteracoes que dependiam dela
   * caem junto — senao ficariam marcadas e sem efeito nenhum, o que e
   * pior que nao estar marcada.
   */
  const alternar = (chave) => {
    setForm((atual) => {
      const tem = atual.permissoes.includes(chave)
      let lista = tem
        ? atual.permissoes.filter((c) => c !== chave)
        : [...atual.permissoes, chave]

      if (tem) {
        const caem = dependentes(chave)
        lista = lista.filter((c) => !caem.includes(c))
      }

      return { ...atual, permissoes: normalizar(lista) }
    })
    setErro('')
  }

  const marcarTodas = () => setForm((atual) => ({ ...atual, permissoes: [...CHAVES] }))
  const desmarcarTodas = () => setForm((atual) => ({ ...atual, permissoes: [] }))

  /**
   * Copia as permissoes de outro cargo.
   *
   * Cargo novo costuma nascer "igual ao Tecnico, mais uma coisa" — e
   * marcar quinze caixas na mao para chegar nisso e onde se erra. Aqui a
   * pessoa escolhe de quem copiar, a lista inteira e substituida, e dai
   * ela ajusta o que difere.
   *
   * SUBSTITUI, nao soma: "copiar de" tem que deixar o cargo igual ao
   * outro. Se somasse, uma copia feita por engano nao teria desfazer.
   *
   * O acesso total vem junto porque ele TAMBEM e permissao — copiar do
   * Diretor e nao levar o acesso total daria um cargo que parece o
   * Diretor na tela e nao age como ele.
   */
  const copiarDe = (id) => {
    setCopiado(id)
    const fonte = cargos.find((c) => String(c.id) === String(id))
    if (!fonte) return
    setForm((atual) => ({
      ...atual,
      /* sem acesso total, a copia leva a lista mas nao a chave */
      acessoTotal: souTotal ? Boolean(fonte.acessoTotal) : atual.acessoTotal,
      permissoes: normalizar(fonte.permissoes ?? []),
    }))
    setErro('')
  }

  /* nao da para copiar de si mesmo: nao faria nada */
  const fontes = cargos.filter((c) => c.id !== cargo?.id)

  /**
   * O submit apenas CONFERE e abre a confirmacao.
   *
   * Cargo nao e cadastro de uma pessoa: e o que um grupo inteiro passa a
   * poder fazer. Marcar uma caixa a mais sem querer libera aquilo para
   * todo mundo que esta no cargo — e ninguem percebe na hora.
   */
  const enviar = (evento) => {
    evento.preventDefault()
    const nome = form.nome.trim()
    if (!nome) {
      setErro('Informe o nome do setor.')
      return
    }

    const repetido = cargos.some(
      (c) => c.id !== cargo?.id && c.nome.toLowerCase() === nome.toLowerCase(),
    )
    if (repetido) {
      setErro('Já existe um setor com esse nome.')
      return
    }

    setConferindo(true)
  }

  const gravar = async () => {
    const nome = form.nome.trim()
    setSalvando(true)
    try {
      const campos = { ...form, nome, permissoes: normalizar(form.permissoes) }
      if (editando) await atualizarCargo(cargo.id, campos)
      else await adicionarCargo(campos)
      setConferindo(false)
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const apagar = async () => {
    setSalvando(true)
    try {
      await removerCargo(cargo.id)
      aoFechar()
    } catch (e) {
      setErro(e.message)
      setConfirmando(false)
    } finally {
      setSalvando(false)
    }
  }

  const marcadas = form.permissoes.length

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      nivel={1}
      titulo={editando ? `Editar ${cargo.nome}` : 'Novo setor'}
      subtitulo={
        editando
          ? `${emUso} pessoa${emUso === 1 ? '' : 's'} neste setor.`
          : 'A cor escolhida pinta as etiquetas do card e os blocos das etapas.'
      }
      largura={620}
    >
      <form className="cargos__form" onSubmit={enviar}>
        <div className="cargos__linhacampos">
          <label className="cargos__campo cargos__campo--nome">
            <span>Nome</span>
            <input
              value={form.nome}
              onChange={(e) => mudar('nome')(e.target.value)}
              placeholder="Ex.: Jurídico"
              autoFocus
            />
          </label>

          <label className="cargos__campo cargos__campo--sigla">
            <span>Sigla</span>
            <input
              value={form.curto}
              onChange={(e) => mudar('curto')(e.target.value)}
              placeholder="jur"
              maxLength={6}
            />
          </label>
        </div>

        <EscolhaCor valor={form.cor} aoMudar={mudar('cor')} rotulo="Cor e opacidade" />

        <div className="cargos__paleta">
          {CORES_SUGERIDAS.map((c) => (
            <button
              key={c}
              type="button"
              className={`cargos__cor ${form.cor.toLowerCase() === c ? 'is-atual' : ''}`.trim()}
              style={{ background: c }}
              onClick={() => mudar('cor')(c)}
              aria-label={`Usar a cor ${c}`}
            />
          ))}
        </div>

        <label
          className={`cargos__total ${souTotal ? '' : 'is-travada'}`.trim()}
          title={souTotal ? undefined : 'Só quem tem acesso total pode mudar esta opção.'}
        >
          <input
            type="checkbox"
            checked={form.acessoTotal}
            onChange={(e) => mudar('acessoTotal')(e.target.checked)}
            disabled={!souTotal}
          />
          <span>
            Edita as tarefas de <strong>todos</strong> os setores
          </span>
        </label>

        {listaTravada && (
          <p className="perm__nota">
            Este é o seu setor: as permissões dele só podem ser mudadas por quem tem acesso total.
          </p>
        )}

        {/* ============================================================
            Permissoes
            ============================================================ */}
        <section className={`perm ${listaTravada ? 'is-travada' : ''}`.trim()} inert={listaTravada ? '' : undefined}>
          <header className="perm__topo">
            <h3>Permissões</h3>
            <span className="perm__contagem">
              {marcadas} de {CHAVES.length}
            </span>
            <span className="perm__atalhos">
              <button type="button" onClick={marcarTodas}>
                Marcar todas
              </button>
              <button type="button" onClick={desmarcarTodas}>
                Desmarcar todas
              </button>
            </span>
          </header>

          {/* Atalho para o caso mais comum: o cargo novo comeca igual a um
              que ja existe. Substitui a lista inteira — inclusive o acesso
              total, que tambem e permissao. */}
          {fontes.length > 0 && (
            <div className="perm__copiar">
              <span className="perm__copiar-rotulo">Copiar permissões de:</span>
              <Seletor
                valor={copiado}
                aoMudar={copiarDe}
                vazio="Escolha um setor"
                largo
                opcoes={fontes.map((c) => ({
                  valor: String(c.id),
                  rotulo: c.acessoTotal ? `${c.nome} (acesso total)` : c.nome,
                }))}
              />
            </div>
          )}

          {form.acessoTotal && (
            <p className="perm__nota perm__nota--total">
              Este setor tem <strong>acesso total</strong>: ele passa por qualquer permissão,
              marcada ou não. A lista abaixo continua valendo se o acesso total for desligado.
            </p>
          )}

          {/* Cada visualizacao e, embaixo dela, na coluna de Alteracao, o que
              depende dela. As de Usuarios nao dependem de nenhuma e fecham a
              lista, com o nome da aba no lugar da caixa. */}
          <div className="perm__arvore">
            <div className="perm__cabeca" aria-hidden="true">
              <h4>Visualização</h4>
              <h4>Alteração</h4>
            </div>

            {GRUPOS.map((grupo) => (
              <div key={grupo.visualizacao?.chave ?? grupo.rotulo} className="perm__ramo">
                <div className="perm__vis">
                  {grupo.visualizacao ? (
                    <label className="perm__item">
                      <input
                        type="checkbox"
                        checked={form.permissoes.includes(grupo.visualizacao.chave)}
                        onChange={() => alternar(grupo.visualizacao.chave)}
                      />
                      <span>{grupo.visualizacao.rotulo}</span>
                    </label>
                  ) : (
                    <span className="perm__item perm__item--fixo">
                      <i aria-hidden="true" />
                      <span>{grupo.rotulo}</span>
                    </span>
                  )}
                </div>

                {grupo.alteracoes.length > 0 && (
                  <ul className="perm__alts">
                    {grupo.alteracoes.map((p) => {
                      const bloqueada = travada(p.chave, form.permissoes)
                      const exigida = grupo.visualizacao
                      return (
                        <li key={p.chave}>
                          <label
                            className={`perm__item ${bloqueada ? 'is-travada' : ''}`.trim()}
                            title={
                              bloqueada ? `Marque "${exigida?.rotulo}" em Visualização primeiro.` : undefined
                            }
                          >
                            <input
                              type="checkbox"
                              checked={form.permissoes.includes(p.chave)}
                              onChange={() => alternar(p.chave)}
                              disabled={bloqueada}
                            />
                            <span>
                              {p.rotulo}
                              {bloqueada && (
                                <em className="perm__trava">precisa de “{exigida?.rotulo}”</em>
                              )}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* previa: a etiqueta como ela aparece no sistema. O fundo e
            translucido e a letra segue a cor do tema — assim ela se le
            no claro e no escuro sem duas amostras lado a lado. */}
        <div className="cargos__previa">
          <span className="cargos__previanome">Como a etiqueta fica</span>
          <span className="cargos__etiqueta is-previa" style={{ '--cargo-cor': form.cor }}>
            {form.nome.trim() || 'Nome do setor'}
          </span>
        </div>

        {erro && (
          <p className="cargos__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes">
          {editando &&
            (confirmando ? (
              <button
                type="button"
                className="formrot__apagar is-confirmando"
                onClick={apagar}
                disabled={salvando}
              >
                Confirmar exclusão
              </button>
            ) : (
              <button
                type="button"
                className="formrot__apagar"
                onClick={() => setConfirmando(true)}
                disabled={salvando || cargo.fixo}
                title={cargo.fixo ? 'Setor usado pelas etapas da obra' : undefined}
              >
                Excluir
              </button>
            ))}
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={salvando}>
            Salvar
          </Button>
        </footer>

        {confirmando && (
          <p className="formrot__aviso" role="alert">
            O cargo sai da lista. Não dá para desfazer.
          </p>
        )}
      </form>

      {/* nivel 2: este pop-up ja esta no nivel 1 (aberto por cima da lista
          de cargos), e a confirmacao precisa vir na frente dele */}
      <Confirma
        aberto={conferindo}
        nivel={2}
        tom="acao"
        titulo={editando ? `Salvar ${cargo.nome}?` : 'Criar este setor?'}
        mensagem={
          editando
            ? `As permissões abaixo passam a valer para as ${emUso} pessoa(s) neste cargo.`
            : 'Confira o que este setor vai poder fazer antes de criar.'
        }
        detalhes={
          <dl>
            <dt>Setor</dt>
            <dd>{form.nome.trim() || '—'}</dd>

            <dt>Acesso total</dt>
            <dd>{form.acessoTotal ? 'Sim — passa por qualquer permissão' : 'Não'}</dd>

            <dt>Permissões</dt>
            <dd>
              {form.permissoes.length === 0 ? (
                <em>Nenhuma marcada</em>
              ) : (
                <ul>
                  {form.permissoes.map((chave) => (
                    <li key={chave}>{rotuloDaPermissao(chave)}</li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
        }
        aviso={
          form.acessoTotal
            ? 'Acesso total é permissão de diretoria: quem estiver neste setor passa por todas as travas do sistema.'
            : undefined
        }
        rotuloConfirmar={editando ? 'Salvar setor' : 'Criar setor'}
        aoConfirmar={gravar}
        aoFechar={() => setConferindo(false)}
      />
    </Modal>
  )
}

/** O nome que a permissao tem na tela — a chave crua nao diz nada. */
function rotuloDaPermissao(chave) {
  const achada = [...VISUALIZACAO, ...ALTERACAO].find((p) => p.chave === chave)
  return achada?.rotulo ?? chave
}
