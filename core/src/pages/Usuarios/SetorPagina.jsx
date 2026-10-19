import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import EscolhaCor from '@/components/EscolhaCor/EscolhaCor'
import Seletor from '@/components/Seletor/Seletor'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import { ALTERACAO, CHAVES, GRUPOS, VISUALIZACAO, dependentes, normalizar, travada } from '@/domain/permissoes'
import { CORES_SETOR } from './ModalCargos'
import './ModalCargos.css'
import './SetorPagina.css'

/**
 * Um SETOR, numa tela propria (/app/usuarios/setores/:id): nome, sigla,
 * cor e, principalmente, as PERMISSOES.
 *
 * Antes era um pop-up por cima da lista de setores, e a arvore de
 * permissoes (visualizacao x alteracao) nao cabia: rolava dentro do
 * pop-up, que rolava dentro da tela. Aqui ela tem a largura toda. Criar,
 * renomear e excluir continuam rapidos na lista (botao Setor, em
 * Usuarios); o clique num setor da lista abre esta tela.
 *
 * Setor e o grupo da equipe (Comercial, Excelencia, GQ) — e nao o cargo
 * de cada pessoa, que e texto livre no cadastro dela. No banco ele
 * continua sendo a tabela `cargo`.
 *
 * O que o setor PODE fazer mora em duas listas amarradas:
 *
 *   Visualizacao — que abas ele enxerga no menu;
 *   Alteracao    — o que ele mexe dentro delas.
 *
 * Desmarcar "Obras" apaga junto tudo o que so faz sentido dentro de
 * Obras, e essas linhas ficam travadas ate a visualizacao voltar.
 * "Acesso total" (diretoria) passa por cima de tudo.
 */
export default function SetorPagina() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { cargos, equipe, carregando, atualizarCargo, removerCargo } = useDados()
  const { user } = useAuth()

  const cargo = cargos.find((c) => String(c.id) === String(id)) ?? null

  const [form, setForm] = useState(null)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  /* setor define o que um grupo inteiro pode fazer: confere antes de gravar */
  const [conferindo, setConferindo] = useState(false)
  /* de qual setor a lista foi copiada — so para o seletor mostrar */
  const [copiado, setCopiado] = useState('')

  /* comeca com o que o setor tem; so na primeira vez, para a recarga
     depois de salvar nao desfazer nada */
  useEffect(() => {
    if (!cargo || form) return
    setForm({
      nome: cargo.nome,
      cor: cargo.cor,
      curto: cargo.curto,
      acessoTotal: Boolean(cargo.acessoTotal),
      permissoes: normalizar(cargo.permissoes ?? []),
    })
  }, [cargo, form])

  const voltar = () => navegar('/app/usuarios', { state: { abrir: 'setores' } })

  if (!cargo || !form) {
    return (
      <AppShell>
        <section className="setorpag">
          <header className="setorpag__topo">
            <BotaoVoltar aoClicar={voltar} />
            <h1 className="setorpag__titulo">Setor</h1>
          </header>
          <p className="setorpag__vazio">
            {carregando || cargos.length === 0 ? 'Carregando o setor...' : 'Este setor não existe mais.'}
          </p>
        </section>
      </AppShell>
    )
  }

  const emUso = equipe.filter((p) => p.cargo === cargo.chave).length

  /* As duas travas que a API aplica, espelhadas aqui para a tela nao
     oferecer o que vai ser recusado:
       - acesso total so e dado (ou tirado) por quem tem acesso total;
       - as permissoes do PROPRIO setor so mudam por quem tem acesso
         total — senao "editar setor" viraria "me dar qualquer permissao". */
  const souTotal = Boolean(user?.acessoTotal)
  const ehOMeu = user?.cargoId && String(user.cargoId) === String(cargo.id)
  const listaTravada = ehOMeu && !souTotal

  const mudar = (campo) => (valor) => {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErro('')
    setRecado('')
  }

  /* desmarcar uma de visualizacao derruba as alteracoes que dependiam dela */
  const alternar = (chave) => {
    setForm((atual) => {
      const tem = atual.permissoes.includes(chave)
      let lista = tem ? atual.permissoes.filter((c) => c !== chave) : [...atual.permissoes, chave]
      if (tem) {
        const caem = dependentes(chave)
        lista = lista.filter((c) => !caem.includes(c))
      }
      return { ...atual, permissoes: normalizar(lista) }
    })
    setErro('')
    setRecado('')
  }

  const marcarTodas = () => mudar('permissoes')([...CHAVES])
  const desmarcarTodas = () => mudar('permissoes')([])

  /* copiar SUBSTITUI a lista (e o acesso total, para quem pode dar) */
  const copiarDe = (idFonte) => {
    setCopiado(idFonte)
    const fonte = cargos.find((c) => String(c.id) === String(idFonte))
    if (!fonte) return
    setForm((atual) => ({
      ...atual,
      acessoTotal: souTotal ? Boolean(fonte.acessoTotal) : atual.acessoTotal,
      permissoes: normalizar(fonte.permissoes ?? []),
    }))
    setErro('')
    setRecado('')
  }

  const fontes = cargos.filter((c) => c.id !== cargo.id)

  /* o "Salvar" so confere e abre a confirmacao */
  const enviar = (evento) => {
    evento.preventDefault()
    const nome = form.nome.trim()
    if (!nome) {
      setErro('Informe o nome do setor.')
      return
    }
    if (cargos.some((c) => c.id !== cargo.id && c.nome.toLowerCase() === nome.toLowerCase())) {
      setErro('Já existe um setor com esse nome.')
      return
    }
    setConferindo(true)
  }

  const gravar = async () => {
    setSalvando(true)
    try {
      await atualizarCargo(cargo.id, { ...form, nome: form.nome.trim(), permissoes: normalizar(form.permissoes) })
      setConferindo(false)
      setRecado('Setor salvo. As permissões já valem para quem está nele.')
    } catch (e) {
      setErro(e.message)
      setConferindo(false)
    } finally {
      setSalvando(false)
    }
  }

  const apagar = async () => {
    setSalvando(true)
    try {
      await removerCargo(cargo.id)
      voltar()
    } catch (e) {
      setErro(e.message)
      setConfirmando(false)
    } finally {
      setSalvando(false)
    }
  }

  const marcadas = form.permissoes.length

  return (
    <AppShell semChat>
      <form className="setorpag" onSubmit={enviar}>
        <header className="setorpag__topo">
          <BotaoVoltar aoClicar={voltar} />
          <div className="setorpag__titulos">
            <h1 className="setorpag__titulo">
              <span className="cargos__etiqueta is-previa" style={{ '--cargo-cor': form.cor }}>
                {form.nome.trim() || 'Nome do setor'}
              </span>
            </h1>
            <p className="setorpag__sub">
              {emUso} pessoa{emUso === 1 ? '' : 's'} neste setor · {marcadas} de {CHAVES.length} permissões
            </p>
          </div>
        </header>

        <div className="setorpag__grade">
          {/* ---------------- quem e o setor ---------------- */}
          <section className="setorpag__bloco vidro" aria-labelledby="setor-dados">
            <h2 id="setor-dados" className="setorpag__subtitulo">
              Identificação
            </h2>
            <div className="cargos__linhacampos">
              <label className="cargos__campo cargos__campo--nome">
                <span>Nome</span>
                <input value={form.nome} onChange={(e) => mudar('nome')(e.target.value)} placeholder="Ex.: Jurídico" />
              </label>
              <label className="cargos__campo cargos__campo--sigla">
                <span>Sigla</span>
                <input value={form.curto} onChange={(e) => mudar('curto')(e.target.value)} placeholder="jur" maxLength={6} />
              </label>
            </div>

            <EscolhaCor valor={form.cor} aoMudar={mudar('cor')} rotulo="Cor e opacidade" />
            <div className="cargos__paleta">
              {CORES_SETOR.map((c) => (
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
          </section>

          {/* ---------------- o que o setor pode ---------------- */}
          <section className="setorpag__bloco setorpag__bloco--perm vidro" aria-labelledby="setor-perm">
            <div className={`perm perm--solta ${listaTravada ? 'is-travada' : ''}`.trim()}>
            <header className="perm__topo">
              <h3 id="setor-perm">Permissões</h3>
              <span className="perm__contagem">
                {marcadas} de {CHAVES.length}
              </span>
              {!listaTravada && (
                <span className="perm__atalhos">
                  <button type="button" onClick={marcarTodas}>
                    Marcar todas
                  </button>
                  <button type="button" onClick={desmarcarTodas}>
                    Desmarcar todas
                  </button>
                </span>
              )}
            </header>

            {listaTravada && (
              <p className="perm__nota">
                Este é o seu setor: as permissões dele só podem ser mudadas por quem tem acesso total.
              </p>
            )}

            <div inert={listaTravada ? '' : undefined}>
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
                  Este setor tem <strong>acesso total</strong>: ele passa por qualquer permissão, marcada ou não. A
                  lista abaixo continua valendo se o acesso total for desligado.
                </p>
              )}

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
                                title={bloqueada ? `Marque "${exigida?.rotulo}" em Visualização primeiro.` : undefined}
                              >
                                <input
                                  type="checkbox"
                                  checked={form.permissoes.includes(p.chave)}
                                  onChange={() => alternar(p.chave)}
                                  disabled={bloqueada}
                                />
                                <span>
                                  {p.rotulo}
                                  {bloqueada && <em className="perm__trava">precisa de “{exigida?.rotulo}”</em>}
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
            </div>
            </div>
          </section>
        </div>

        {/* ---------------- a barra de baixo, sempre a vista ---------------- */}
        <footer className="setorpag__rodape vidro">
          <div className="setorpag__recados">
            {erro && (
              <p className="cargos__erro" role="alert">
                {erro}
              </p>
            )}
            {recado && (
              <p className="setorpag__recado" role="status">
                {recado}
              </p>
            )}
            {confirmando && (
              <p className="formrot__aviso" role="alert">
                O setor sai da lista. Não dá para desfazer.
              </p>
            )}
          </div>
          {confirmando ? (
            <button type="button" className="formrot__apagar is-confirmando" onClick={apagar} disabled={salvando}>
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
              Excluir setor
            </button>
          )}
          <button type="button" className="formobra__cancelar" onClick={voltar}>
            Voltar
          </button>
          <Button type="submit" loading={salvando}>
            Salvar
          </Button>
        </footer>
      </form>

      <Confirma
        aberto={conferindo}
        tom="acao"
        titulo={`Salvar ${cargo.nome}?`}
        mensagem={`As permissões abaixo passam a valer para as ${emUso} pessoa(s) neste setor.`}
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
        rotuloConfirmar="Salvar setor"
        aoConfirmar={gravar}
        aoFechar={() => setConferindo(false)}
      />
    </AppShell>
  )
}

function BotaoVoltar({ aoClicar }) {
  return (
    <button type="button" className="setorpag__voltar" onClick={aoClicar}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M11 18l-6-6 6-6" />
      </svg>
      Voltar
    </button>
  )
}

/** O nome que a permissao tem na tela — a chave crua nao diz nada. */
function rotuloDaPermissao(chave) {
  const achada = [...VISUALIZACAO, ...ALTERACAO].find((p) => p.chave === chave)
  return achada?.rotulo ?? chave
}
