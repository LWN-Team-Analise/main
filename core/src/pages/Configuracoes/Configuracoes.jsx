import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Button from '@/components/Button/Button'
import EditorImagem from '@/components/EditorImagem/EditorImagem'
import { CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import { useTheme } from '@/context/ThemeContext'
import useOutlook from '@/hooks/useOutlook'
import { carregarFotoOriginal, editarUsuario, trocarSenha } from '@/services/equipeService'
import { validateCPF, vincularOutlook } from '@/services/authService'
import { tokenAtual } from '@/services/api'
import { formatarCPF, formatarTelefone, soDigitos } from '@/utils/formato'
import { prepararImagem } from '@/utils/imagem'
import outlookLogo from '@/assets/outlook.png'
import './Configuracoes.css'

/* a imagem inteira e guardada maior que o avatar recortado: e dela que
   o editor parte quando alguem reenquadra a foto depois */
const LADO_ORIGINAL = 1024

const Sol = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M6.4 6.4 5 5M19 19l-1.4-1.4M17.6 6.4 19 5M5 19l1.4-1.4" />
  </svg>
)

const Lua = () => (
  <svg viewBox="0 0 24 24" width="15" height="15">
    <path
      fill="currentColor"
      d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a.8.8 0 0 0-1.1-.9A9.9 9.9 0 1 0 21.3 15.7a.8.8 0 0 0-.9-1.1Z"
    />
  </svg>
)

/**
 * Conta do usuario logado: foto, nome, telefone, nascimento, CPF e cargo.
 * Tudo grava no banco na hora do Salvar.
 *
 * E aqui que quem foi cadastrado so pelo e-mail completa o cadastro:
 * troca o nome provisorio pelo completo e preenche nascimento e CPF.
 * Enquanto falta o CPF, o bloco abre com o aviso (user.cadastroPendente).
 *
 * O E-MAIL nao se altera por aqui: e a porta de entrada e o vinculo com
 * o Outlook. Trocar ele sozinho quebraria os dois; quem muda e a
 * diretoria, pela tela de Usuarios.
 *
 * O tema tambem mora aqui, e agora na propria linha do nome, sem card
 * separado.
 */
export default function Configuracoes() {
  const { user, atualizarPerfil } = useAuth()
  const local = useLocation()
  const { cargos, titulos, pessoaPorId, pode, recarregar } = useDados()
  const { theme, selectTheme } = useTheme()
  const entradaFoto = useRef(null)
  /* a imagem que o editor de enquadramento esta ajustando; null = fechado */
  const [ajustando, setAjustando] = useState(null)
  /* a foto so vai junto na gravacao quando alguem mexeu nela: a imagem
     inteira nao vem na carga, e manda-la vazia apagaria o original */
  const [fotoMexida, setFotoMexida] = useState(false)

  const [form, setForm] = useState(null)
  const [erros, setErros] = useState({})
  const [recado, setRecado] = useState('')
  const [salvando, setSalvando] = useState(false)

  /* atribuir cargo tem permissao propria — inclusive para o proprio
     cadastro. Sem ela ninguem se promove sozinho por esta tela. */
  const podeCargo = pode('editar_cargo_titulo')

  /* a sessao guarda so a foto recortada; a imagem inteira e o
     enquadramento vem da equipe carregada do banco */
  const eu = pessoaPorId(user?.id)

  /* carrega o formulario com o que a sessao tem hoje */
  useEffect(() => {
    if (!user) return
    setForm({
      nome: user.name ?? '',
      email: user.email ?? '',
      telefone: formatarTelefone(user.telefone ?? ''),
      nascimento: user.dataNascimento ?? '',
      /* `cargo` aqui é a chave do SETOR (travado); `cargoTituloId` é o
         cargo específico da pessoa, que só quem tem a permissão muda */
      cargo: user.cargoChave ?? '',
      cargoTituloId: '',
      cpf: formatarCPF(user.cpf ?? ''),
      foto: user.foto ?? null,
      fotoOriginal: null,
      recorteFoto: null,
    })
  }, [user])

  /* o cargo e o enquadramento chegam com a carga da equipe, que pode
     voltar depois do primeiro render desta tela */
  useEffect(() => {
    if (!eu) return
    setForm((atual) =>
      atual
        ? {
            ...atual,
            cargoTituloId: atual.cargoTituloId || (eu.cargoTituloId ?? ''),
            recorteFoto: atual.recorteFoto ?? eu.recorteFoto ?? null,
          }
        : atual,
    )
  }, [eu])

  if (!form) return null

  const mudar = (campo) => (evento) => {
    const bruto = evento?.target ? evento.target.value : evento
    const valor =
      campo === 'telefone'
        ? formatarTelefone(bruto)
        : campo === 'cpf'
          ? formatarCPF(bruto)
          : bruto
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
    setRecado('')
  }

  /* A imagem e reduzida aqui, no navegador: foto de celular crua nao
     cabe no limite do servidor nem no localStorage da sessao.

     Escolher o arquivo NAO grava a foto — abre o editor de
     enquadramento; sair de la e que define o recorte. */
  const escolherFoto = async (evento) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivo) return
    try {
      setRecado('')
      setAjustando({ imagem: await prepararImagem(arquivo, { lado: LADO_ORIGINAL }), nova: true })
    } catch (e) {
      setRecado(e.message)
    }
  }

  /* Reenquadrar parte da imagem INTEIRA: recortar o recorte anterior
     iria comendo a foto a cada ajuste.

     Ela nao vem na carga da equipe (pesada demais para viajar por
     pessoa em toda leitura), entao e buscada aqui, no clique. */
  const reenquadrar = async () => {
    try {
      const origem = form.fotoOriginal ?? (await carregarFotoOriginal(user.id))
      if (origem) setAjustando({ imagem: origem, nova: false })
    } catch (e) {
      setRecado(e.message)
    }
  }

  const salvar = async (evento) => {
    evento.preventDefault()

    const novos = {}
    if (!form.nome.trim()) novos.nome = 'Informe o nome.'
    if (form.telefone && soDigitos(form.telefone).length < 10) {
      novos.telefone = 'Informe o DDD e o número.'
    }
    const cpf = soDigitos(form.cpf)
    if (cpf && !validateCPF(form.cpf)) novos.cpf = 'CPF inválido.'
    // quem ja tem CPF nao fica sem: e por ele que tambem se entra
    if (!cpf && user.cpf) novos.cpf = 'Informe o CPF.'
    if (Object.keys(novos).length > 0) {
      setErros(novos)
      return
    }

    /* o e-mail NAO vai: quem edita o proprio cadastro nao troca o
       endereco de acesso, e a API recusaria a gravacao inteira */
    const campos = {
      nome: form.nome.trim(),
      telefone: soDigitos(form.telefone),
      nascimento: form.nascimento || null,
      /* o SETOR não vai: o campo é só informativo nesta tela, e mandá-lo
         daqui abriria caminho para a pessoa trocar o próprio setor — que
         é o mesmo que trocar as próprias permissões.
         O CARGO só vai para quem tem a permissão de defini-lo — ver
         abaixo: sem ela, ninguém se dá o cargo que quiser aqui. */
    }
    /* a foto só viaja quando alguém mexeu nela: a imagem inteira não
       vem na carga, e mandá-la vazia apagaria o original guardado */
    if (fotoMexida) {
      campos.foto = form.foto
      campos.fotoOriginal = form.fotoOriginal
      campos.recorteFoto = form.recorteFoto
    }
    /* o CARGO só viaja para quem pode defini-lo: mandá-lo sem a
       permissão faria a API recusar a gravação inteira */
    if (podeCargo) campos.cargoTituloId = form.cargoTituloId || ''
    /* o CPF so vai quando foi preenchido E mudou */
    if (cpf && cpf !== soDigitos(user.cpf)) campos.cpf = cpf

    setSalvando(true)
    try {
      const salvo = await editarUsuario(user.id, campos)

      /* a sessao guarda uma copia do usuario: atualiza para a foto e o
         nome novos aparecerem no menu sem precisar entrar de novo */
      atualizarPerfil({
        name: salvo?.nome ?? campos.nome,
        telefone: salvo?.telefone ?? campos.telefone,
        cpf: salvo?.cpf ?? user.cpf,
        /* com o CPF gravado, o aviso de cadastro incompleto some na hora */
        cadastroPendente: salvo ? salvo.cadastroPendente : user.cadastroPendente,
        dataNascimento: salvo?.nascimento ?? campos.nascimento,
        foto: salvo?.foto ?? user.foto,
        cargoChave: user.cargoChave,
        cargoNome: user.cargoNome,
        cargoTitulo: salvo?.cargoTitulo ?? user.cargoTitulo,
      })
      await recarregar()

      setRecado('Dados salvos no banco.')
    } catch (erro) {
      setRecado(erro.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <AppShell>
      <section className="config">
        <header>
          <h1 className="tela__titulo">Configurações</h1>
        </header>

        {/* o aviso do Outlook fica no topo: e a primeira coisa que
            quem ainda nao vinculou precisa ver ao entrar */}
        <BlocoOutlook />

        <form className="config__bloco config__bloco--conta vidro" onSubmit={salvar} noValidate>
          <h2 className="config__titulo">Sua conta</h2>

          {/* cadastrado so pelo e-mail: o nome ainda e o tirado do
              e-mail e faltam nascimento e CPF */}
          {user?.cadastroPendente && (
            <p className="config__alerta" role="alert">
              Seu acesso foi criado só com o e-mail. <strong>Complete o seu cadastro</strong>:
              confira o nome completo e preencha a data de nascimento e o CPF.
            </p>
          )}

          <div className="config__cabeca">
            <button
              type="button"
              className="config__foto"
              onClick={() => entradaFoto.current?.click()}
              title="Trocar foto de perfil"
            >
              <Avatar nome={form.nome} foto={form.foto} tamanho={86} />
              <span className="config__trocar">{form.foto ? 'Trocar' : 'Foto'}</span>
            </button>
            <input
              ref={entradaFoto}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={escolherFoto}
              tabIndex={-1}
            />

            <div className="config__nome">
              <CampoTexto
                rotulo="Nome completo"
                value={form.nome}
                onChange={mudar('nome')}
                erro={erros.nome}
              />

              {/* o tema mora aqui, na linha do nome: os dois botoes
                  dividem a largura inteira, sem card separado */}
              <div className="config__temas" role="radiogroup" aria-label="Tema do sistema">
                <button
                  type="button"
                  role="radio"
                  className={`config__tema ${theme === 'light' ? 'is-atual' : ''}`.trim()}
                  onClick={() => selectTheme('light')}
                  aria-checked={theme === 'light'}
                >
                  <Sol />
                  Modo claro
                </button>
                <button
                  type="button"
                  role="radio"
                  className={`config__tema ${theme === 'dark' ? 'is-atual' : ''}`.trim()}
                  onClick={() => selectTheme('dark')}
                  aria-checked={theme === 'dark'}
                >
                  <Lua />
                  Modo noturno
                </button>
              </div>

              {form.foto && (
                <span className="config__fotoacoes">
                  <button type="button" className="config__semfoto" onClick={reenquadrar}>
                    Ajustar enquadramento
                  </button>
                  <button
                    type="button"
                    className="config__semfoto"
                    onClick={() => {
                      setForm((a) => ({ ...a, foto: null, fotoOriginal: null, recorteFoto: null }))
                      setFotoMexida(true)
                    }}
                  >
                    Remover foto
                  </button>
                </span>
              )}
            </div>
          </div>

          <div className="config__grade">
            {/* travado para todos: o e-mail e o acesso e o vinculo do Outlook */}
            <CampoTexto
              rotulo="E-mail"
              type="email"
              value={form.email}
              readOnly
              disabled
            />

            <CampoTexto
              rotulo="Telefone"
              inputMode="numeric"
              placeholder="(11) 90000-0000"
              value={form.telefone}
              onChange={mudar('telefone')}
              erro={erros.telefone}
            />

            <CampoTexto
              rotulo="Data de nascimento"
              type="date"
              value={form.nascimento}
              onChange={mudar('nascimento')}
            />

            {/* o proprio CPF cada um preenche e corrige; o dos outros so a
                diretoria, pela tela de Usuarios */}
            <CampoTexto
              rotulo="CPF"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={form.cpf}
              onChange={mudar('cpf')}
              erro={erros.cpf}
            />

            {/* Travado aqui, e de propósito.

                O setor é o que decide o que a pessoa PODE fazer no sistema.
                Deixá-lo aberto na tela da própria conta dá a qualquer um a
                chance de se promover à diretoria — a API já recusava, mas o
                campo aberto na tela é um convite a tentar.

                Quem muda setor é quem tem permissão para isso, na aba
                Usuários. Aqui ele só informa em que setor a pessoa está.

                Setor e Cargo ficam lado a lado, nessa ordem: um diz de
                que grupo a pessoa é, o outro o que ela é dentro dele. */}
            <CampoSelecao
              rotulo="Setor"
              value={form.cargo}
              vazio="Sem setor"
              disabled
              opcoes={cargos.map((c) => ({ valor: c.chave, rotulo: c.nome, cor: c.cor }))}
            />

            {/* O cargo não decide permissão nenhuma, mas ATRIBUIR um é
                permissão própria: sem ela ninguém escolhe o próprio
                cargo aqui — o campo mostra o que está gravado e não
                aceita troca. */}
            <CampoSelecao
              rotulo="Cargo"
              value={form.cargoTituloId}
              onChange={mudar('cargoTituloId')}
              disabled={!podeCargo}
              vazio={
                !podeCargo
                  ? user?.cargoTitulo || 'Sem cargo'
                  : titulos.length === 0
                    ? 'Nenhum cargo cadastrado ainda'
                    : 'Sem cargo'
              }
              opcoes={titulos.map((t) => ({ valor: String(t.id), rotulo: t.nome }))}
            />
          </div>

          {recado && (
            <p className="config__recado" role="status">
              {recado}
            </p>
          )}

          <div className="config__salvar">
            <Button type="submit" loading={salvando}>
              Salvar alterações
            </Button>
          </div>
        </form>

        <TrocarSenha chamado={local.state?.focar === 'senha' ? local.key : null} />
      </section>

      {/* Sem painel de header: quem tem header é o cliente, e a foto de
          perfil nunca abre faixa nenhuma. */}
      <EditorImagem
        aberto={Boolean(ajustando)}
        imagem={ajustando?.imagem}
        nome={form.nome}
        nivel={0}
        recorteInicial={ajustando?.nova ? null : form.recorteFoto}
        aoConfirmar={({ original, imagem, recorte }) => {
          setForm((atual) => ({
            ...atual,
            foto: imagem,
            fotoOriginal: original,
            recorteFoto: recorte,
          }))
          setFotoMexida(true)
        }}
        aoFechar={() => setAjustando(null)}
      />
    </AppShell>
  )
}

/**
 * Conta Microsoft.
 *
 * Enquanto ela nao estiver vinculada, o aviso aparece TODA vez que a
 * pessoa entra em Configuracoes — foi o pedido, e e o que faz o
 * cadastro acontecer.
 *
 * Depois de vincular, o sistema puxa a foto do Outlook e passa a
 * cobrar que a senha do site vire a mesma do Outlook: duas senhas
 * diferentes para a mesma pessoa e receita de confusao.
 */
function BlocoOutlook() {
  const { user, atualizarPerfil } = useAuth()
  const { recarregar } = useDados()
  const outlook = useOutlook()

  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')

  const vinculado = Boolean(user?.outlook)

  const vincular = async () => {
    setErro('')
    setRecado('')
    setOcupado(true)
    try {
      const { codigo, redirecionar } = await outlook.abrir()
      const resposta = await vincularOutlook(codigo, redirecionar, tokenAtual())
      atualizarPerfil({
        outlook: true,
        outlookEmail: resposta.user?.outlookEmail ?? null,
        foto: resposta.user?.foto ?? user?.foto,
        senhaTemporaria: true,
      })
      await recarregar()
      setRecado(resposta.recado ?? 'Outlook vinculado.')
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <article
      className={`config__bloco config__bloco--outlook vidro ${
        vinculado ? '' : 'is-pendente'
      }`.trim()}
    >
      <h2 className="config__titulo">Conta Microsoft (Outlook)</h2>

      {/* O bloco ocupa a linha inteira, entao o texto fica de um lado e o
          botao do outro — em vez de o botao cair sozinho numa linha nova
          com meia tela vazia ao lado. */}
      <div className="config__outlookcorpo">
        <div className="config__outlooktexto">
      {vinculado ? (
        <p className="config__nota">
          Vinculada a <strong>{user.outlookEmail ?? user.email}</strong>. Você pode entrar no
          sistema pelo botão do Outlook, sem digitar a senha.
        </p>
      ) : (
        <p className="config__alerta" role="alert">
          Você ainda <strong>não cadastrou o Outlook</strong>. Vincule a sua conta da empresa
          para entrar pelo botão do Outlook — e para o sistema puxar a sua foto de perfil
          automaticamente.
        </p>
      )}

      {/* Duas causas, dois recados. Enquanto era um só, API fora do ar
          aparecia como "peça para a diretoria preencher OUTLOOK_CLIENT_ID" —
          e a configuração estava certa; o que faltava era a API no ar. */}
      {!outlook.disponivel && !outlook.conferindo && (
        <p className="config__nota">
          {outlook.motivo === 'sem-resposta' ? (
            <>
              Não consegui falar com a API para saber se o login com Outlook está ligado. O
              botão volta sozinho assim que ela responder.
            </>
          ) : (
            <>
              O login com Outlook ainda não foi ligado no servidor. Peça para a diretoria
              preencher
              <code> OUTLOOK_CLIENT_ID</code>, <code>OUTLOOK_CLIENT_SECRET</code> e
              <code> OUTLOOK_TENANT</code> no <code>.env</code> da API.
            </>
          )}
        </p>
      )}

      {erro && (
        <p className="config__recado config__recado--erro" role="alert">
          {erro}
        </p>
      )}
      {recado && (
        <p className="config__recado" role="status">
          {recado}
        </p>
      )}

        </div>

      <div className="config__outlookacao">
        <button
          type="button"
          className="botaooutlook"
          onClick={vincular}
          disabled={ocupado || outlook.conferindo || !outlook.disponivel}
        >
          {/* nas cores da Microsoft, como no botao da tela de login: e por
              elas que a pessoa reconhece o botao sem ler o rotulo */}
          <img className="botaooutlook__logo" src={outlookLogo} alt="" aria-hidden="true" />
          {ocupado
            ? 'Abrindo a Microsoft...'
            : vinculado
              ? 'Vincular outra conta'
              : 'Entrar com o Outlook'}
        </button>
      </div>
      </div>
    </article>
  )
}

/**
 * Troca da propria senha.
 *
 * E por aqui que o colaborador novo sai da senha temporária — e,
 * depois de vincular o Outlook, que ele iguala a senha do site a da
 * conta Microsoft.
 */
function TrocarSenha({ chamado = null }) {
  const { user, atualizarPerfil, renovarToken } = useAuth()

  const caixa = useRef(null)
  /* aceso = o bloco acabou de ser apontado pela ilha do topo. E so um
     piscar: quem chegou aqui por um botao que dizia "trocar a senha"
     precisa ver ONDE caiu, e a tela tem outros blocos iguais a este. */
  const [aceso, setAceso] = useState(false)

  useEffect(() => {
    if (!chamado) return undefined
    caixa.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setAceso(true)
    const relogio = setTimeout(() => setAceso(false), 2400)
    return () => clearTimeout(relogio)
  }, [chamado])

  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [salvando, setSalvando] = useState(false)

  const enviar = async (evento) => {
    evento.preventDefault()
    setErro('')
    setRecado('')

    if (!atual) {
      setErro('Informe a senha atual.')
      return
    }
    if (nova.length < 6) {
      setErro('A nova senha precisa de 6 caracteres ou mais.')
      return
    }
    if (nova === atual) {
      setErro('A nova senha precisa ser diferente da atual.')
      return
    }
    if (nova !== repetida) {
      setErro('A confirmação não bate com a nova senha.')
      return
    }

    setSalvando(true)
    try {
      const resposta = await trocarSenha(atual, nova)
      /* a senha nova derruba o token antigo no servidor: o novo vem junto */
      renovarToken(resposta?.token)
      atualizarPerfil({ senhaTemporaria: false })
      setAtual('')
      setNova('')
      setRepetida('')
      setRecado('Senha trocada.')
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form
      className={`config__bloco vidro ${aceso ? 'is-aceso' : ''}`.trim()}
      ref={caixa}
      onSubmit={enviar}
      noValidate
    >
      <h2 className="config__titulo">Senha</h2>
      {/* quem ainda esta na senha padrao chega aqui vindo da ilha do topo:
          a linha explica, no lugar, o que a ilha dizia la em cima */}
      {user?.senhaTemporaria && (
        <p className="config__alerta" role="alert">
          Você ainda está com a <strong>senha padrão</strong>, definida por outra pessoa. Crie a
          sua abaixo.
        </p>
      )}

      <div className="config__grade">
        <CampoTexto
          rotulo="Senha atual"
          type="password"
          autoComplete="current-password"
          value={atual}
          onChange={(e) => {
            setAtual(e.target.value)
            setErro('')
          }}
        />
        <CampoTexto
          rotulo="Nova senha"
          type="password"
          autoComplete="new-password"
          value={nova}
          onChange={(e) => {
            setNova(e.target.value)
            setErro('')
          }}
          dica="No mínimo 6 caracteres."
        />
        <CampoTexto
          rotulo="Repita a nova senha"
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => {
            setRepetida(e.target.value)
            setErro('')
          }}
        />
      </div>

      {erro && (
        <p className="config__recado config__recado--erro" role="alert">
          {erro}
        </p>
      )}
      {recado && (
        <p className="config__recado" role="status">
          {recado}
        </p>
      )}

      <div className="config__salvar">
        <Button type="submit" loading={salvando} disabled={!atual || !nova || !repetida}>
          Trocar senha
        </Button>
      </div>
    </form>
  )
}
