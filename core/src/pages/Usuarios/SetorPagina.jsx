import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import EscolhaCor from '@/components/EscolhaCor/EscolhaCor'
import Seletor from '@/components/Seletor/Seletor'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import {
  ALTERACAO,
  CHAVES,
  GRUPOS,
  VISUALIZACAO,
  dependentes,
  limparGuardadas,
  normalizar,
  separar,
  travada,
} from '@/domain/permissoes'
import { lerRegrasCheck } from '@/domain/obras'
import RegrasCheck from './RegrasCheck'
import { CORES_SETOR } from './ModalCargos'
import './ModalCargos.css'
import './SetorPagina.css'

/**
 * Um SETOR, numa tela propria (/app/usuarios/setores/:id): nome, sigla,
 * cor e, principalmente, as PERMISSOES.
 *
 * Antes era um pop-up por cima da lista de setores, e a arvore de
 * permissoes (visualizacao x alteracao) nao cabia: rolava dentro do
 * pop-up, que rolava dentro da tela. Aqui ela tem a largura toda, com as
 * caixas lado a lado, quebrando a linha no fim. Criar,
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
 * Desmarcar "Obras" tira so a aba: o que estava marcado dentro dela
 * fica GUARDADO — travado, sem valer — e volta a valer do jeito que
 * estava quando "Obras" for marcada de novo (atualizacao 45). Antes
 * caia tudo junto, e reabrir a aba era marcar uma por uma outra vez.
 * "Acesso total" (diretoria) passa por cima de tudo.
 *
 * Por isso o formulario guarda as `marcadas` (as que valem MAIS as
 * guardadas) numa lista so; `separar` divide na hora de gravar.
 */

/** As marcadas de um setor: as que valem e as guardadas, juntas. */
function marcadasDo(cargo) {
  const permissoes = normalizar(cargo?.permissoes ?? [])
  return [...permissoes, ...limparGuardadas(cargo?.permissoesGuardadas ?? [], permissoes)]
}
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
      painelTv: Boolean(cargo.painelTv),
      marcadas: marcadasDo(cargo),
      /* null = o banco ainda nao tem a atualizacao 37: a parte some */
      regrasCheck: cargo.regrasCheck ? lerRegrasCheck(cargo.regrasCheck) : null,
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

  /* o banco ja guarda as alteracoes da aba desmarcada (atualizacao 45)?
     Sem a coluna (null), desmarcar a aba volta a derrubar tudo junto —
     senao a tela mostraria guardadas que o banco jogaria fora */
  const guarda = cargo.permissoesGuardadas !== null && cargo.permissoesGuardadas !== undefined

  /* o que vale e o que fica guardado, como vai para o banco */
  const { permissoes: valem, guardadas: guardadasAgora } = separar(form.marcadas)

  /* desmarcar uma visualizacao tira SO ela: as alteracoes de dentro
     ficam marcadas (guardadas) e voltam a valer junto com a aba */
  const alternar = (chave) => {
    setForm((atual) => {
      const tem = atual.marcadas.includes(chave)
      let lista = tem ? atual.marcadas.filter((c) => c !== chave) : [...atual.marcadas, chave]
      if (tem && !guarda) {
        const caem = dependentes(chave)
        lista = lista.filter((c) => !caem.includes(c))
      }
      return { ...atual, marcadas: CHAVES.filter((c) => lista.includes(c)) }
    })
    setErro('')
    setRecado('')
  }

  const marcarTodas = () => mudar('marcadas')([...CHAVES])
  const desmarcarTodas = () => mudar('marcadas')([])

  /* copiar SUBSTITUI a lista (e o acesso total, para quem pode dar) */
  const copiarDe = (idFonte) => {
    setCopiado(idFonte)
    const fonte = cargos.find((c) => String(c.id) === String(idFonte))
    if (!fonte) return
    setForm((atual) => ({
      ...atual,
      acessoTotal: souTotal ? Boolean(fonte.acessoTotal) : atual.acessoTotal,
      /* as guardadas da fonte vem junto: a copia e o setor como ele esta */
      marcadas: guarda ? marcadasDo(fonte) : normalizar(fonte.permissoes ?? []),
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
      const { regrasCheck, marcadas: _marcadas, ...resto } = form
      await atualizarCargo(cargo.id, {
        ...resto,
        nome: form.nome.trim(),
        permissoes: valem,
        ...(guarda ? { permissoesGuardadas: guardadasAgora } : {}),
        ...(regrasCheck ? { regrasCheck: lerRegrasCheck(regrasCheck) } : {}),
      })
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

  const marcadas = valem.length

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
              {guardadasAgora.length > 0 && ` · ${guardadasAgora.length} guardada${guardadasAgora.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </header>

        {/* Um cartao so: a identificacao numa faixa em cima e as permissoes
            embaixo, na largura toda — sem coluna estreita sobrando vazia. */}
        <div className="setorpag__cartao vidro">
          {/* ---------------- quem e o setor ---------------- */}
          <section className="setorpag__ident" aria-labelledby="setor-dados">
            <h2 id="setor-dados" className="setorpag__subtitulo">
              Identificação
            </h2>
            <div className="setorpag__identlinha">
              <div className="cargos__linhacampos setorpag__nomes">
                <label className="cargos__campo cargos__campo--nome">
                  <span>Nome</span>
                  <input value={form.nome} onChange={(e) => mudar('nome')(e.target.value)} placeholder="Ex.: Jurídico" />
                </label>
                <label className="cargos__campo cargos__campo--sigla">
                  <span>Sigla</span>
                  <input value={form.curto} onChange={(e) => mudar('curto')(e.target.value)} placeholder="jur" maxLength={6} />
                </label>
              </div>

              <div className="setorpag__cor">
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
              </div>
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

            {/* a televisao da empresa: so a pagina inicial, trocando de Grade
                para Quadro sozinha, e sem o login do Outlook — por isso so
                quem tem acesso total liga ou desliga */}
            <label
              className={`cargos__total ${souTotal ? '' : 'is-travada'}`.trim()}
              title={souTotal ? undefined : 'Só quem tem acesso total pode mudar esta opção.'}
            >
              <input
                type="checkbox"
                checked={form.painelTv}
                onChange={(e) => mudar('painelTv')(e.target.checked)}
                disabled={!souTotal}
              />
              <span>
                <strong>Tela da TV</strong>: só a página inicial, trocando entre Grade e Quadro sozinha, e entra
                sem o Outlook
              </span>
            </label>
          </section>

          {/* ---------------- o que o setor pode ---------------- */}
          <section
            className={`perm perm--solta ${listaTravada ? 'is-travada' : ''}`.trim()}
            aria-labelledby="setor-perm"
          >
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

              {/* Uma linha por aba: a visualizacao a esquerda e, ao lado, as
                  alteracoes dela uma na frente da outra, quebrando a linha
                  quando chegam ao fim. */}
              <div className="perm__grupos">
                <div className="perm__cabeca" aria-hidden="true">
                  <h4>Visualização</h4>
                  <h4>Alteração</h4>
                </div>

                {GRUPOS.map((grupo) => {
                  const aba = grupo.visualizacao
                  const travadas = grupo.alteracoes.some((p) => travada(p.chave, form.marcadas))
                  /* as marcadas desta aba que estao guardadas (aba desmarcada) */
                  const guardadasAqui = grupo.alteracoes.filter((p) => guardadasAgora.includes(p.chave)).length
                  return (
                    <div key={aba?.chave ?? grupo.rotulo} className="perm__grupo">
                      <div className="perm__aba">
                        {aba ? (
                          <label className="perm__chip perm__chip--aba">
                            <input
                              type="checkbox"
                              checked={form.marcadas.includes(aba.chave)}
                              onChange={() => alternar(aba.chave)}
                            />
                            <span>{aba.rotulo}</span>
                          </label>
                        ) : (
                          <span className="perm__chip perm__chip--fixo">{grupo.rotulo}</span>
                        )}
                      </div>

                      {grupo.alteracoes.length > 0 && (
                        <div className="perm__alts">
                          <ul className="perm__chips">
                            {grupo.alteracoes.map((p) => {
                              const bloqueada = travada(p.chave, form.marcadas)
                              const marcada = form.marcadas.includes(p.chave)
                              /* guardada: marcada, mas a aba esta desmarcada — nao
                                 vale agora e volta a valer com a aba */
                              const guardada = bloqueada && marcada
                              return (
                                <li key={p.chave}>
                                  <label
                                    className={`perm__chip ${bloqueada ? 'is-travada' : ''} ${guardada ? 'is-guardada' : ''}`.trim()}
                                    title={
                                      guardada
                                        ? `Guardada: não vale enquanto "${aba?.rotulo}" estiver desmarcada, e volta a valer junto com ela.`
                                        : bloqueada
                                          ? `Marque "${aba?.rotulo}" em Visualização primeiro.`
                                          : undefined
                                    }
                                  >
                                    <input
                                      type="checkbox"
                                      checked={marcada}
                                      onChange={() => alternar(p.chave)}
                                      disabled={bloqueada}
                                    />
                                    <span>{p.rotulo}</span>
                                  </label>
                                </li>
                              )
                            })}
                          </ul>
                          {travadas && (
                            <p className="perm__trava">
                              {guardadasAqui > 0
                                ? `“${aba?.rotulo}” está desmarcada: as ${guardadasAqui === 1 ? 'marcada fica guardada' : `${guardadasAqui} marcadas ficam guardadas`} e ${guardadasAqui === 1 ? 'volta' : 'voltam'} a valer quando a aba for marcada de novo.`
                                : `Marque “${aba?.rotulo}” para liberar estas.`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* ---------------- quem do setor marca qual check ---------------- */}
          {form.regrasCheck && (
            <div inert={listaTravada ? '' : undefined} className={listaTravada ? 'is-travada' : undefined}>
              <RegrasCheck setor={cargo} regras={form.regrasCheck} aoMudar={mudar('regrasCheck')} />
            </div>
          )}
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

            {form.painelTv && (
              <>
                <dt>Tela da TV</dt>
                <dd>Sim — página inicial automática, sem Outlook</dd>
              </>
            )}

            {form.regrasCheck && (
              <>
                <dt>Checks por cargo</dt>
                <dd>{resumoDasRegras(form.regrasCheck)}</dd>
              </>
            )}

            <dt>Permissões</dt>
            <dd>
              {valem.length === 0 ? (
                <em>Nenhuma marcada</em>
              ) : (
                <ul>
                  {valem.map((chave) => (
                    <li key={chave}>{rotuloDaPermissao(chave)}</li>
                  ))}
                </ul>
              )}
            </dd>

            {/* o que fica guardado, sem valer, ate a aba voltar */}
            {guardadasAgora.length > 0 && (
              <>
                <dt>Guardadas</dt>
                <dd>
                  <ul>
                    {guardadasAgora.map((chave) => (
                      <li key={chave}>
                        {rotuloDaPermissao(chave)} <em>(volta com {rotuloDaAba(chave)})</em>
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
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

/** "2 cargos e 1 pessoa com regra" — o resumo da confirmacao. */
function resumoDasRegras(regras) {
  const limpas = lerRegrasCheck(regras)
  const cargos = Object.keys(limpas.cargos).length
  const pessoas = Object.keys(limpas.pessoas).length
  if (cargos + pessoas === 0) return 'Todos do setor marcam todos os checks dele'
  const partes = []
  if (cargos) partes.push(cargos === 1 ? '1 cargo' : `${cargos} cargos`)
  if (pessoas) partes.push(pessoas === 1 ? '1 pessoa' : `${pessoas} pessoas`)
  return `${partes.join(' e ')} com regra`
}

/** O nome que a permissao tem na tela — a chave crua nao diz nada. */
function rotuloDaPermissao(chave) {
  const achada = [...VISUALIZACAO, ...ALTERACAO].find((p) => p.chave === chave)
  return achada?.rotulo ?? chave
}

/** O nome da aba de que uma alteracao depende ("Obras"). */
function rotuloDaAba(chave) {
  const exigida = ALTERACAO.find((p) => p.chave === chave)?.dependeDe
  return exigida ? rotuloDaPermissao(exigida) : 'a aba'
}
