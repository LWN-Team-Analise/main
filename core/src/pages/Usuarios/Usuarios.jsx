import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import { useTheme } from '@/context/ThemeContext'
import { corAdaptada, textoSobre } from '@/utils/cor'
import Avatar from '@/components/Avatar/Avatar'
import Confirma from '@/components/Confirma/Confirma'
import { useDados } from '@/context/DadosContext'
import { useAuth } from '@/context/AuthContext'
import Estrelas from '@/components/Estrelas/Estrelas'

import { formatarTelefone } from '@/utils/formato'
import ModalCargos from './ModalCargos'
import ModalTitulos from './ModalTitulos'
import ModalColaborador from './ModalColaborador'
import './Usuarios.css'

const Icone = {
  /* Setor: o organograma — um bloco em cima e os grupos pendurados
     nele. Diz "grupo da equipe", que e o que o setor e; a etiqueta que
     ficava aqui dizia "marcador", e marcador virou o cargo. */
  setor: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="5" rx="1.2" />
      <rect x="3" y="16" width="6" height="5" rx="1.2" />
      <rect x="15" y="16" width="6" height="5" rx="1.2" />
      <path d="M12 8v4M6 16v-2.5a1.5 1.5 0 0 1 1.5-1.5h9a1.5 1.5 0 0 1 1.5 1.5V16" />
    </svg>
  ),
  /* Cargo: o cracha — o titulo que a pessoa usa dentro do setor */
  cargo: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6.5" width="18" height="13" rx="2" />
      <path d="M9 3.5h6v3H9z" />
      <circle cx="9.5" cy="12" r="1.9" />
      <path d="M6.4 16.6a3.4 3.4 0 0 1 6.2 0M15 11h3.5M15 14.5h2.5" />
    </svg>
  ),
  mais: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  lapis: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
    </svg>
  ),
  lixo: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 7h15M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </svg>
  ),
  /* a setinha do card: gira quando ele abre */
  seta: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  lupa: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  ),
}

/** Tira acento e caixa: "Écio" acha por "ecio". */
const semAcento = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * A equipe por SETOR, com a nota de cada um — que e a media das obras
 * avaliadas em que a pessoa participou (tela de Avaliacoes).
 *
 * Cada card mostra os dois: o SETOR (a etiqueta colorida, de onde saem
 * as permissoes) e, abaixo dele, o CARGO da pessoa dentro do setor
 * ("Analista de Qualidade") quando ela tem um cadastrado.
 *
 * FECHADO o card e so isso: foto, nome, setor e cargo — a equipe inteira
 * cabe numa olhada. O clique ABRE o proprio card, ali mesmo, com o
 * e-mail, o telefone, a avaliacao e as obras em andamento. Cada card abre
 * e fecha sozinho: abrir um nao fecha o outro, e a fila nao pula.
 */
export default function Usuarios() {
  const { isDark } = useTheme()
  const {
    equipe,
    cargos,
    cargoPorChave,
    mediaDoUsuario,
    obrasDaPessoa,
    adicionarPessoa,
    atualizarPessoa,
    removerPessoa,
    pode,
  } = useDados()
  const { user } = useAuth()

  /* quem nao pode mexer em usuario ainda entra aqui pela permissao de
     cargo — so nao ve os botoes de cadastrar e editar os outros */
  const podeUsuarios = pode('editar_usuario')
  const podeCargos = pode('editar_cargo')
  /* atribuir cargo tem permissao propria: sem ela ninguem escolhe o
     cargo de ninguem — nem o proprio, em Configuracoes */
  const podeTitulos = pode('editar_cargo_titulo')

  const [modalCargos, setModalCargos] = useState(false)
  const [modalTitulos, setModalTitulos] = useState(false)
  const [modalColab, setModalColab] = useState(false)
  const [editando, setEditando] = useState(null)
  const [apagando, setApagando] = useState(null)
  const [recado, setRecado] = useState('')
  /* os cards abertos (ids) */
  const [abertos, setAbertos] = useState(() => new Set())
  const alternarAberto = (id) =>
    setAbertos((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  /* dois filtros que se somam: o nome digitado e os setores marcados.
     O nome pode chegar pronto da busca do topo — ver Clientes.jsx. */
  const { state } = useLocation()
  const [busca, setBusca] = useState(state?.busca ?? '')

  useEffect(() => {
    if (state?.busca) setBusca(state.busca)
  }, [state])
  const [filtros, setFiltros] = useState([])

  const alternarCargo = (chave) =>
    setFiltros((atual) =>
      atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave],
    )

  const lista = useMemo(() => {
    const alvo = semAcento(busca.trim())
    const filtrada = equipe.filter((p) => {
      // sem setor marcado, passam todos; com varios, basta bater um
      if (filtros.length > 0 && !filtros.includes(p.cargo)) return false
      if (!alvo) return true
      // procura tambem no e-mail: e por ele que se acha quem tem nome repetido
      return semAcento(`${p.nome} ${p.email ?? ''}`).includes(alvo)
    })
    return [...filtrada].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [equipe, filtros, busca])

  const abrirNovo = () => {
    setEditando(null)
    setModalColab(true)
  }

  const abrirEdicao = (pessoa) => {
    setEditando(pessoa)
    setModalColab(true)
  }

  const salvar = async (campos) => {
    if (editando) {
      await atualizarPessoa(editando.id, campos)
      setRecado(`Cadastro de ${campos.nome} atualizado.`)
      return
    }
    const resultado = await adicionarPessoa(campos)
    /* cadastro so pelo e-mail: o nome ainda e o provisorio, entao o
       recado fala do e-mail, que e por onde a pessoa vai entrar */
    const quem = campos.nome || campos.email
    const entra = campos.email ? `Ela entra com o e-mail ${campos.email}` : 'Ela entra com o CPF'
    setRecado(
      `${quem} foi cadastrado. ${entra} e a senha ${resultado.senhaPadrao} — o sistema pede a troca ao entrar${
        campos.nome && campos.cpf ? '' : ', e ela completa nome, nascimento e CPF na conta dela'
      }.`,
    )
  }

  return (
    <AppShell>
      <section className="usuarios">
        <header className="usuarios__topo">
          <h1 className="tela__titulo">Usuários</h1>

          {/* quantos estao cadastrados — so os ativos: remover alguem
              desliga o cadastro, e quem foi desligado sai da equipe.
              Com filtro ligado, diz tambem quantos sobraram. */}
          <p className="usuarios__total" aria-live="polite">
            {lista.length !== equipe.length && (
              <>
                <strong>{lista.length}</strong> de{' '}
              </>
            )}
            <strong>{equipe.length}</strong>{' '}
            {equipe.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'}
          </p>

          <div className="usuarios__acoes">
            {podeCargos && (
              <button
                type="button"
                className="acao acao--fraca"
                onClick={() => setModalCargos(true)}
              >
                <Icone.setor />
                Setor
              </button>
            )}
            {/* Cargos anda ao lado de Setor porque as duas listas se
                leem juntas: o setor diz de que grupo a pessoa e, o
                cargo diz o que ela e dentro dele. Quem nao pode
                atribuir cargo tambem nao vê este botão. */}
            {podeTitulos && (
              <button
                type="button"
                className="acao acao--fraca"
                onClick={() => setModalTitulos(true)}
              >
                <Icone.cargo />
                Cargos
              </button>
            )}
            {podeUsuarios && (
              <button type="button" className="acao acao--padrao" onClick={abrirNovo}>
                <Icone.mais />
                Adicionar colaborador
              </button>
            )}
          </div>
        </header>

        {recado && (
          <p className="recado" role="status">
            {recado}
            <button type="button" onClick={() => setRecado('')} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}

        {/* ---- filtros: nome a esquerda, cargos a direita ---- */}
        <div className="usuarios__filtro">
          <label className="procura">
            <Icone.lupa />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome..."
              aria-label="Buscar colaborador pelo nome"
            />
          </label>

          <div className="usuarios__cargos">
            <button
              type="button"
              className={`chip ${filtros.length === 0 ? 'is-atual' : ''}`.trim()}
              onClick={() => setFiltros([])}
            >
              Todos
            </button>
            {/* da para marcar mais de um setor: os filtros se somam */}
            {cargos.map((c) => {
              const ativo = filtros.includes(c.chave)
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chip ${ativo ? 'is-atual' : ''}`.trim()}
                  /* mesmo ajuste da tela de Clientes: cor adaptada ao
                     tema e texto escolhido por contraste */
                  style={
                    ativo
                      ? { '--tom': corAdaptada(c.cor, isDark), '--tom-fg': textoSobre(c.cor, isDark) }
                      : undefined
                  }
                  aria-pressed={ativo}
                  onClick={() => alternarCargo(c.chave)}
                >
                  {c.nome}
                </button>
              )
            })}
          </div>

          {(filtros.length > 0 || busca.trim()) && (
            <button
              type="button"
              className="ferramenta ferramenta--fraca"
              onClick={() => {
                setFiltros([])
                setBusca('')
              }}
            >
              Limpar
            </button>
          )}
        </div>

        {lista.length === 0 ? (
          <p className="usuarios__vazio">
            {busca.trim()
              ? 'Ninguém encontrado com esse nome.'
              : 'Nenhum usuário nesse setor.'}
          </p>
        ) : (
          <ul className="usuarios__grade">
            {lista.map((pessoa) => {
              const cargo = cargoPorChave(pessoa.cargo)
              const { media, obrasAvaliadas } = mediaDoUsuario(pessoa.id)
              const emAndamento = obrasDaPessoa(pessoa.id).length
              const aberto = abertos.has(pessoa.id)
              const detalhe = `pessoa-${pessoa.id}-detalhe`

              return (
                <li
                  key={pessoa.id}
                  className={`pessoa ${pessoa.souEu ? 'is-eu' : ''} ${aberto ? 'is-aberto' : ''}`.trim()}
                  style={{ '--cargo-cor': cargo?.cor ?? '#6b7280' }}
                >
                  <header className="pessoa__topo">
                    {/* o card inteiro (menos editar/excluir) e o botao que abre */}
                    <button
                      type="button"
                      className="pessoa__abrir"
                      aria-expanded={aberto}
                      aria-controls={detalhe}
                      onClick={() => alternarAberto(pessoa.id)}
                    >
                      <Avatar nome={pessoa.nome} foto={pessoa.foto} tamanho={46} titulo={pessoa.nome} />
                      <span className="pessoa__quem">
                        <span className="pessoa__nome">
                          {pessoa.nome}
                          {pessoa.souEu && <span className="pessoa__eu">você</span>}
                        </span>
                      {/* O SETOR na etiqueta colorida — o acesso total dele
                          não aparece em lugar nenhum da tela, de propósito —
                          e, abaixo, o CARGO da pessoa dentro do setor. Sem
                          cargo cadastrado, a linha simplesmente não existe:
                          é campo opcional. */}
                        <span className="pessoa__cargo">
                          {cargo?.nome ?? pessoa.cargoNome ?? 'Sem setor'}
                        </span>
                        {pessoa.cargoTitulo && (
                          <span className="pessoa__titulo">{pessoa.cargoTitulo}</span>
                        )}
                      {/* cadastrado so pelo e-mail: o nome ainda e o
                          provisorio e faltam nascimento e CPF. Some
                          sozinho quando a pessoa completa em Configuracoes. */}
                        {podeUsuarios && pessoa.cadastroPendente && (
                          <span className="pessoa__pendente" title="A pessoa ainda não preencheu nome, nascimento e CPF">
                            Cadastro incompleto
                          </span>
                        )}
                      </span>
                      <span className="pessoa__seta" aria-hidden="true">
                        <Icone.seta />
                      </span>
                    </button>

                    {/* aparecem ao passar o mouse pelo card.
                        Sem a permissao, cada um so mexe no proprio
                        cadastro — e isso e em Configuracoes. */}
                    {podeUsuarios && (
                      <div className="pessoa__botoes">
                        <button
                          type="button"
                          onClick={() => abrirEdicao(pessoa)}
                          aria-label={`Editar ${pessoa.nome}`}
                          title="Editar"
                        >
                          <Icone.lapis />
                        </button>
                        <button
                          type="button"
                          onClick={() => setApagando(pessoa)}
                          aria-label={`Excluir ${pessoa.nome}`}
                          title="Excluir"
                        >
                          <Icone.lixo />
                        </button>
                      </div>
                    )}
                  </header>

                  {/* o que o card guarda: abre e fecha deslizando */}
                  <div className="pessoa__detalhe" id={detalhe} aria-hidden={!aberto}>
                    <div className="pessoa__dentro">
                      {pessoa.email || pessoa.telefone ? (
                        <dl className="pessoa__contato">
                          {pessoa.email && (
                            <div>
                              <dt>E-mail</dt>
                              <dd>{pessoa.email}</dd>
                            </div>
                          )}
                          {pessoa.telefone && (
                            <div>
                              <dt>Telefone</dt>
                              <dd>{formatarTelefone(pessoa.telefone)}</dd>
                            </div>
                          )}
                        </dl>
                      ) : (
                        <p className="pessoa__semcontato">Sem e-mail ou telefone cadastrado.</p>
                      )}

                      <footer className="pessoa__base">
                        <span className="pessoa__nota">
                          {media === null ? (
                            <span className="pessoa__semnota">Sem avaliação</span>
                          ) : (
                            <>
                              <Estrelas nota={media} tamanho={13} />
                              <strong>{media.toFixed(1)}</strong>
                              <em>
                                {obrasAvaliadas} obra{obrasAvaliadas === 1 ? '' : 's'}
                              </em>
                            </>
                          )}
                        </span>
                        <span className="pessoa__andamento">{emAndamento} em andamento</span>
                      </footer>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ModalCargos aberto={modalCargos} aoFechar={() => setModalCargos(false)} />

      <ModalTitulos aberto={modalTitulos} aoFechar={() => setModalTitulos(false)} />

      <ModalColaborador
        aberto={modalColab}
        colaborador={editando}
        usuarioLogado={user}
        aoFechar={() => setModalColab(false)}
        aoSalvar={salvar}
      />

      <Confirma
        aberto={Boolean(apagando)}
        titulo={`Excluir ${apagando?.nome ?? 'colaborador'}?`}
        mensagem="O acesso é desativado e a pessoa sai da lista. As obras em que ela participou continuam como estão."
        aviso={
          apagando?.souEu
            ? 'Este é o seu próprio usuário — você perde o acesso ao sistema.'
            : undefined
        }
        rotuloConfirmar="Excluir colaborador"
        aoConfirmar={() => removerPessoa(apagando.id)}
        aoFechar={() => setApagando(null)}
      />
    </AppShell>
  )
}
