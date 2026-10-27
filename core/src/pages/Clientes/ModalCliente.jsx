import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Avatar from '@/components/Avatar/Avatar'
import EditorImagem, { PreviaHeader } from '@/components/EditorImagem/EditorImagem'
import { CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { CampoData } from '@/components/CampoData/CampoData'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import { UNIDADE_MAXIMA, nomeCurtoDaUnidade, nomeDaUnidade } from '@/domain/clientes'
import { valorCurto } from '@/domain/comercial'
import { carregarImagemDoCliente } from '@/services/dadosService'
import { buscarCEP, listarCidades, listarEstados } from '@/services/enderecoService'
import { formatarCEP } from '@/utils/formato'
import { prepararImagem } from '@/utils/imagem'
import './ModalCliente.css'

/* a imagem inteira e guardada maior que a logo recortada: e dela que o
   editor parte para reenquadrar, e o header precisa de largura */
const LADO_ORIGINAL = 1280

const VAZIO = {
  nome: '',
  logo: null,
  /* a MESMA imagem em dois enquadramentos independentes: o quadrado da
     logo e a faixa do header da obra */
  logoOriginal: null,
  recorteLogo: null,
  capa: null,
  recorteCapa: null,
  setorId: '',
  cep: '',
  endereco: '',
  bairro: '',
  estado: '',
  cidade: '',
  /* quem cadastrou (ou responde pela) empresa, o proximo contato e as
     pessoas de contato (atualizacao 27) */
  proprietarioId: '',
  proximoContato: '',
  pessoas: [],
  /* as unidades (atualizacao 33): Einstein Anapolis, Einstein Alphaville... */
  unidades: [],
}

const PESSOA_VAZIA = { id: null, nome: '', cargo: '', email: '', telefone: '' }
const UNIDADE_VAZIA = { id: null, unidade: '', cep: '', endereco: '', bairro: '', estado: '', cidade: '' }
/* a chave da unidade na tela: a nova ainda nao tem id */
let proximaChave = 0
const novaChave = () => `u${(proximaChave += 1)}`
const emailCerto = (email) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)

/**
 * Cadastro de cliente. O CEP puxa o resto do endereco no ViaCEP; a lista de
 * estados e de cidades vem do IBGE. Se alguma API falhar, os campos seguem
 * editaveis na mao — o cadastro nunca fica preso.
 */
export default function ModalCliente({ aberto, cliente = null, resumo = null, nota = null, aoFechar, aoSalvar }) {
  const { setores, equipe, clientes, obras } = useDados()
  const { user } = useAuth()
  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [estados, setEstados] = useState([])
  const [cidades, setCidades] = useState([])
  const [buscandoCEP, setBuscandoCEP] = useState(false)
  const [avisoCEP, setAvisoCEP] = useState('')
  /* a imagem que o editor de enquadramento esta ajustando; null = fechado */
  const [ajustando, setAjustando] = useState(null)
  const [erroImagem, setErroImagem] = useState('')
  /* a imagem so vai junto na gravacao quando alguem mexeu nela: mandar
     o que a tela tem em maos sempre apagaria a logo de quem so veio
     corrigir o endereco (o original nao vem na carga) */
  const [imagemMexida, setImagemMexida] = useState(false)
  const entradaLogo = useRef(null)

  /* abre limpo (ou com o cliente que veio para edicao) */
  useEffect(() => {
    if (aberto) {
      setForm(
        cliente
          ? {
              ...VAZIO,
              ...cliente,
              setorId: cliente.setorId ?? '',
              proprietarioId: cliente.proprietarioId ?? '',
              proximoContato: cliente.proximoContato ?? '',
              pessoas: (cliente.pessoas ?? []).map((p) => ({ ...PESSOA_VAZIA, ...p })),
              unidades: clientes
                .filter((c) => String(c.matrizId) === String(cliente.id))
                .map((c) => ({
                  ...UNIDADE_VAZIA,
                  chave: `id${c.id}`,
                  id: c.id,
                  unidade: c.unidade ?? nomeCurtoDaUnidade(cliente.nome, c.nome),
                  cep: c.cep ? formatarCEP(c.cep) : '',
                  endereco: c.endereco ?? '',
                  bairro: c.bairro ?? '',
                  estado: c.estado ?? '',
                  cidade: c.cidade ?? '',
                })),
            }
          : /* cliente novo e de quem esta cadastrando, ate alguem trocar */
            { ...VAZIO, proprietarioId: user?.id ? String(user.id) : '' },
      )
      setErros({})
      setAvisoCEP('')
      setErroImagem('')
      setImagemMexida(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, cliente, user?.id])

  /* estados: uma vez so, na primeira abertura */
  useEffect(() => {
    if (!aberto || estados.length > 0) return
    listarEstados()
      .then(setEstados)
      .catch(() => setEstados([]))
  }, [aberto, estados.length])

  /* cidades acompanham o estado escolhido */
  useEffect(() => {
    if (!form.estado) {
      setCidades([])
      return
    }
    let valido = true
    listarCidades(form.estado)
      .then((lista) => valido && setCidades(lista))
      .catch(() => valido && setCidades([]))
    return () => {
      valido = false
    }
  }, [form.estado])

  const mudar = (campo) => (evento) => {
    const valor = evento?.target ? evento.target.value : evento
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }

  /* ---------------- Logo, com enquadramento ----------------

     Escolher o arquivo NAO grava nada: ele abre o editor. Sair de la
     e que grava os dois recortes de uma vez.

     "Ajustar" reabre o editor a partir da imagem INTEIRA — e nao da
     logo ja recortada —, senao cada ajuste iria recortando o recorte
     anterior e a imagem encolhia a cada visita. Cliente cadastrado
     antes disto nao tem original guardado; ai o ajuste parte da logo
     mesmo, que e o melhor que existe. */

  const escolherLogo = async (evento) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivo) return
    try {
      setErroImagem('')
      setAjustando({ imagem: await prepararImagem(arquivo, { lado: LADO_ORIGINAL }), nova: true })
    } catch (e) {
      setErroImagem(e.message)
    }
  }

  /* a imagem inteira nao vem na carga do quadro (pesada demais para
     viajar por cliente em toda leitura): ela e buscada aqui, no clique */
  const reenquadrar = async () => {
    setErroImagem('')
    try {
      const origem = form.logoOriginal ?? (cliente ? await carregarImagemDoCliente(cliente.id) : form.logo)
      if (origem) setAjustando({ imagem: origem, nova: false })
    } catch (e) {
      setErroImagem(e.message)
    }
  }

  const aplicarRecorte = ({ original, imagem, recorte, capa, recorteCapa }) => {
    setForm((atual) => ({
      ...atual,
      logo: imagem,
      logoOriginal: original,
      recorteLogo: recorte,
      capa,
      recorteCapa,
    }))
    setImagemMexida(true)
  }

  const tirarLogo = () => {
    setForm((atual) => ({
      ...atual,
      logo: null,
      logoOriginal: null,
      recorteLogo: null,
      capa: null,
      recorteCapa: null,
    }))
    setImagemMexida(true)
  }

  /* ---------------- Pessoas de contato ---------------- */

  const mudarPessoa = (i, campo) => (evento) => {
    const valor = evento.target.value
    setForm((atual) => ({
      ...atual,
      pessoas: atual.pessoas.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)),
    }))
    setErros((atual) => ({ ...atual, [`pessoa${i}`]: undefined }))
  }

  const tirarPessoa = (i) =>
    setForm((atual) => ({ ...atual, pessoas: atual.pessoas.filter((_, j) => j !== i) }))

  const novaPessoa = () => setForm((atual) => ({ ...atual, pessoas: [...atual.pessoas, { ...PESSOA_VAZIA }] }))

  const pessoasDaEquipe = equipe
    .filter((p) => p.ativo !== false || String(p.id) === String(form.proprietarioId))
    .map((p) => ({ valor: String(p.id), rotulo: p.nome }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

  /* ---------------- Unidades ---------------- */

  const mudarUnidade = (chave, mudanca) => {
    setForm((atual) => ({
      ...atual,
      unidades: atual.unidades.map((u) => (u.chave === chave ? { ...u, ...mudanca } : u)),
    }))
    setErros((atual) => ({ ...atual, [`unidade-${chave}`]: undefined }))
  }

  const novaUnidade = () =>
    setForm((atual) => ({ ...atual, unidades: [...atual.unidades, { ...UNIDADE_VAZIA, chave: novaChave() }] }))

  const tirarUnidade = (chave) =>
    setForm((atual) => ({ ...atual, unidades: atual.unidades.filter((u) => u.chave !== chave) }))

  /* quantas obras cada unidade ja tem: a que tem obra nao sai daqui */
  const obrasDaUnidade = (id) => (id ? obras.filter((o) => String(o.clienteId) === String(id)).length : 0)

  /* trocar o estado na mao invalida a cidade que estava escolhida */
  const mudarEstado = (evento) => {
    const sigla = evento.target.value
    setForm((atual) => ({ ...atual, estado: sigla, cidade: '' }))
    setErros((atual) => ({ ...atual, estado: undefined }))
  }

  const mudarCEP = async (evento) => {
    const formatado = formatarCEP(evento.target.value)
    setForm((atual) => ({ ...atual, cep: formatado }))
    setErros((atual) => ({ ...atual, cep: undefined }))
    setAvisoCEP('')

    const digitos = formatado.replace(/\D/g, '')
    if (digitos.length !== 8) return

    setBuscandoCEP(true)
    try {
      const achado = await buscarCEP(digitos)
      if (!achado) {
        setAvisoCEP('CEP não encontrado — preencha o endereço manualmente.')
        return
      }
      /* o CEP manda no endereco inteiro: assim cidade e estado nunca
         ficam contradizendo o CEP digitado */
      setForm((atual) => ({ ...atual, ...achado }))
      setAvisoCEP('Endereço preenchido pelo CEP.')
    } catch {
      setAvisoCEP('Não foi possível consultar o CEP agora.')
    } finally {
      setBuscandoCEP(false)
    }
  }

  const enviar = (evento) => {
    evento.preventDefault()

    const novosErros = {}
    if (!form.nome.trim()) novosErros.nome = 'Informe o nome da empresa.'
    if (!form.cidade.trim()) novosErros.cidade = 'Informe a cidade.'
    if (!form.estado) novosErros.estado = 'Escolha o estado.'
    form.pessoas.forEach((p, i) => {
      const algum = p.nome.trim() || p.email.trim() || p.telefone.trim() || p.cargo.trim()
      if (!algum) return
      if (!p.nome.trim()) novosErros[`pessoa${i}`] = 'Escreva o nome da pessoa.'
      else if (p.email.trim() && !emailCerto(p.email.trim())) novosErros[`pessoa${i}`] = 'O e-mail não parece certo.'
    })
    const nomesDasUnidades = new Set()
    form.unidades.forEach((u) => {
      const curto = nomeCurtoDaUnidade(form.nome, u.unidade).toLowerCase()
      const chave = `unidade-${u.chave}`
      if (!curto) novosErros[chave] = 'Dê um nome à unidade (ex.: Anápolis).'
      else if (nomesDasUnidades.has(curto)) novosErros[chave] = 'Já há uma unidade com esse nome.'
      else if (!u.estado) novosErros[chave] = 'Escolha o estado da unidade.'
      else if (!u.cidade.trim()) novosErros[chave] = 'Informe a cidade da unidade.'
      nomesDasUnidades.add(curto)
    })

    if (Object.keys(novosErros).length > 0) {
      setErros(novosErros)
      return
    }

    const { logo, logoOriginal, recorteLogo, capa, recorteCapa, ...campos } = form
    /* linha de pessoa toda em branco nao vai */
    campos.pessoas = form.pessoas
      .map((p) => ({
        id: p.id,
        nome: p.nome.trim(),
        cargo: p.cargo.trim(),
        email: p.email.trim(),
        telefone: p.telefone.trim(),
      }))
      .filter((p) => p.nome || p.email || p.telefone || p.cargo)
    campos.unidades = form.unidades.map((u) => ({
      id: u.id,
      unidade: u.unidade.trim(),
      cep: u.cep,
      endereco: u.endereco.trim(),
      bairro: u.bairro.trim(),
      estado: u.estado,
      cidade: u.cidade.trim(),
    }))
    campos.proprietarioId = form.proprietarioId || null
    campos.proximoContato = form.proximoContato || null
    /* a imagem viaja em bloco, e SO quando alguem mexeu nela: os dois
       recortes e as duas imagens saem do mesmo gesto no editor, e
       gravar um sem os outros deixaria o cliente com um recorte que
       nao corresponde a imagem */
    if (imagemMexida) campos.imagem = { logo, logoOriginal, recorteLogo, capa, recorteCapa }

    aoSalvar(campos)
    aoFechar()
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={cliente ? 'Editar cliente' : 'Novo cliente'}
      largura={720}
    >
      <form className="formcli" onSubmit={enviar} noValidate>
        {/* ---------------- Logo + prévia do header ----------------

            A mesma imagem aparece em DOIS lugares com recortes
            independentes: o quadrado do card (o avatar) e a faixa larga
            que abre a tela da obra. Os dois ficam LADO A LADO — o
            quadrado à esquerda, a faixa à direita —, porque são duas
            leituras da mesma decisão e compará-las é o ponto.

            A faixa só existia dentro do editor, e para vê-la era preciso
            clicar em "Ajustar enquadramento" — justamente a decisão que
            a prévia deveria ajudar a tomar. Aqui ela é só leitura;
            mexer nos recortes continua sendo no editor. */}
        <div className="cliimg">
          <div className={`campo ${erroImagem ? 'has-erro' : ''}`.trim()}>
            <span className="campo__rotulo">Logo da empresa</span>
            <div className="foto">
              <Avatar
                nome={form.nome || '?'}
                foto={form.logo}
                tamanho={62}
                quadrado
                titulo={form.nome}
              />
              <div className="foto__acoes">
                <button
                  type="button"
                  className="foto__btn"
                  onClick={() => entradaLogo.current?.click()}
                >
                  {form.logo ? 'Trocar imagem' : 'Enviar imagem'}
                </button>
                {form.logo && (
                  <button type="button" className="foto__btn" onClick={reenquadrar}>
                    Ajustar enquadramento
                  </button>
                )}
                {form.logo && (
                  <button
                    type="button"
                    className="foto__btn foto__btn--fraco"
                    onClick={tirarLogo}
                  >
                    Remover
                  </button>
                )}
              </div>
              <input
                ref={entradaLogo}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={escolherLogo}
                tabIndex={-1}
              />
            </div>
            {erroImagem && (
              <span className="campo__nota campo__nota--erro" role="alert">
                {erroImagem}
              </span>
            )}
          </div>

          {form.logo && (
            <div className="campo cliimg__header">
              <span className="campo__rotulo">Header da obra</span>
              <PreviaHeader capa={form.capa || form.logo} nome={form.nome} />
              {!form.capa && (
                <span className="campo__nota">
                  Sem recorte próprio: a faixa da obra mostra a logo inteira na largura, com o
                  zoom no centro. Para escolher outro ponto ou outro zoom, abra
                  &quot;Ajustar enquadramento&quot;.
                </span>
              )}
            </div>
          )}
        </div>

        <CampoTexto
          rotulo="Nome da empresa"
          largo
          placeholder="Razão social ou nome fantasia"
          value={form.nome}
          onChange={mudar('nome')}
          erro={erros.nome}
        />

        {/* O ramo da empresa. A lista sai do botao "Setores" na tela de
            Clientes — aqui so se escolhe entre o que ja existe, para nao
            nascer "Farmaceutico" e "farmaceutica" como dois setores. */}
        <CampoSelecao
          rotulo="Setor"
          value={form.setorId ?? ''}
          onChange={mudar('setorId')}
          vazio={
            setores.length === 0
              ? 'Nenhum setor cadastrado ainda'
              : 'Sem setor'
          }
          opcoes={setores.map((s) => ({ valor: String(s.id), rotulo: s.nome, cor: s.cor }))}
        />

        <CampoTexto
          rotulo="CEP"
          inputMode="numeric"
          placeholder="00000-000"
          value={form.cep}
          onChange={mudarCEP}
          dica={buscandoCEP ? 'Consultando...' : avisoCEP || undefined}
        />

        <CampoTexto
          rotulo="Endereço"
          placeholder="Rua e número"
          value={form.endereco}
          onChange={mudar('endereco')}
        />

        <CampoTexto
          rotulo="Bairro"
          placeholder="Bairro"
          value={form.bairro}
          onChange={mudar('bairro')}
        />

        <CampoSelecao
          rotulo="Estado"
          value={form.estado}
          onChange={mudarEstado}
          erro={erros.estado}
          vazio={estados.length === 0 ? 'Carregando...' : 'Escolha o estado...'}
          opcoes={estados.map((e) => ({ valor: e.sigla, rotulo: `${e.sigla} — ${e.nome}` }))}
        />

        {/* sem lista do IBGE (offline ou API fora), vira campo livre */}
        {cidades.length > 0 ? (
          <CampoSelecao
            rotulo="Cidade"
            value={form.cidade}
            onChange={mudar('cidade')}
            erro={erros.cidade}
            vazio="Escolha a cidade..."
            opcoes={cidades.map((c) => ({ valor: c, rotulo: c }))}
          />
        ) : (
          <CampoTexto
            rotulo="Cidade"
            placeholder={form.estado ? 'Carregando cidades...' : 'Escolha o estado antes'}
            value={form.cidade}
            onChange={mudar('cidade')}
            erro={erros.cidade}
          />
        )}

        {/* ---------------- Unidades ----------------
            O mesmo cliente em outros enderecos: na aba Clientes ele
            continua UM so; nas listas de escolher cliente (obra,
            comercial, reembolso) cada unidade aparece com o nome
            inteiro — "Einstein Anápolis". */}
        <fieldset className="formcli__pessoas formcli__unidades">
          <legend>Unidades</legend>
          {form.unidades.length === 0 && (
            <p className="formcli__nada">
              O mesmo cliente em outro endereço? Adicione uma unidade em vez de cadastrar outro cliente: ela aparece
              nas listas de clientes como “{nomeDaUnidade(form.nome || 'Cliente', 'Anápolis')}”.
            </p>
          )}
          {form.unidades.map((u, i) => (
            <CampoUnidade
              key={u.chave}
              ordem={i + 1}
              unidade={u}
              nomeDoCliente={form.nome}
              estados={estados}
              erro={erros[`unidade-${u.chave}`]}
              obras={obrasDaUnidade(u.id)}
              aoMudar={(mudanca) => mudarUnidade(u.chave, mudanca)}
              aoTirar={() => tirarUnidade(u.chave)}
            />
          ))}
          <button type="button" className="formcli__mais" onClick={novaUnidade}>
            + Adicionar unidade
          </button>
        </fieldset>

        {/* quem responde pela empresa — vem com quem esta cadastrando */}
        <CampoSelecao
          rotulo="Proprietário"
          value={form.proprietarioId}
          onChange={mudar('proprietarioId')}
          vazio="Sem proprietário"
          opcoes={pessoasDaEquipe}
          dica="Quem cadastrou a empresa no sistema."
        />

        <div className="formcli__data">
          <CampoData
            rotulo="Próximo contato"
            valor={form.proximoContato}
            aoMudar={(v) => setForm((atual) => ({ ...atual, proximoContato: v ?? '' }))}
            vazio="Sem data"
          />
          {form.proximoContato && (
            <button
              type="button"
              className="formcli__limpar"
              onClick={() => setForm((atual) => ({ ...atual, proximoContato: '' }))}
            >
              Tirar data
            </button>
          )}
        </div>

        {/* ---------------- Pessoas de contato ---------------- */}
        <fieldset className="formcli__pessoas">
          <legend>Pessoas de contato</legend>
          {form.pessoas.length === 0 && (
            <p className="formcli__nada">
              Nenhuma pessoa ainda. O e-mail delas é para onde vai o “Responder?” dos negócios no Comercial.
            </p>
          )}
          {form.pessoas.map((p, i) => (
            <div key={p.id ?? `nova-${i}`} className="formcli__pessoa">
              <input
                aria-label={`Nome da pessoa ${i + 1}`}
                placeholder="Nome"
                value={p.nome}
                onChange={mudarPessoa(i, 'nome')}
                maxLength={200}
              />
              <input
                aria-label={`Cargo da pessoa ${i + 1}`}
                placeholder="Cargo"
                value={p.cargo}
                onChange={mudarPessoa(i, 'cargo')}
                maxLength={120}
              />
              <input
                aria-label={`E-mail da pessoa ${i + 1}`}
                type="email"
                placeholder="E-mail"
                value={p.email}
                onChange={mudarPessoa(i, 'email')}
              />
              <input
                aria-label={`Telefone da pessoa ${i + 1}`}
                inputMode="tel"
                placeholder="Telefone"
                value={p.telefone}
                onChange={mudarPessoa(i, 'telefone')}
                maxLength={40}
              />
              <button
                type="button"
                className="formcli__tirar"
                onClick={() => tirarPessoa(i)}
                aria-label={`Tirar ${p.nome || 'esta pessoa'}`}
                title="Tirar"
              >
                ×
              </button>
              {erros[`pessoa${i}`] && (
                <span className="campo__nota campo__nota--erro formcli__pessoa-erro" role="alert">
                  {erros[`pessoa${i}`]}
                </span>
              )}
            </div>
          ))}
          <button type="button" className="formcli__mais" onClick={novaPessoa}>
            + Adicionar pessoa
          </button>
        </fieldset>

        {/* Os numeros que saem sozinhos: os negocios do Comercial e as notas
            das obras avaliadas. Nao se digita — mudam quando um negocio e
            ganho ou uma obra e avaliada. */}
        <div className="formcli__resumo">
          <p className="formcli__resumo-titulo">Calculado pelo sistema</p>
          <dl>
            <div>
              <dt>Negócios fechados</dt>
              <dd>{resumo?.ganhos ?? 0}</dd>
            </div>
            <div>
              <dt>Negócios em aberto</dt>
              <dd>{resumo?.abertos ?? 0}</dd>
            </div>
            <div>
              <dt>Ticket médio</dt>
              <dd>{resumo?.ticketMedio ? valorCurto(resumo.ticketMedio) : '—'}</dd>
            </div>
            <div>
              <dt>Nota de satisfação média</dt>
              <dd>{nota?.media !== undefined && nota?.media !== null ? String(nota.media).replace('.', ',') : '—'}</dd>
            </div>
          </dl>
        </div>

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit">{cliente ? 'Salvar alterações' : 'Cadastrar cliente'}</Button>
        </footer>
      </form>

      {/* O header so existe para CLIENTE: e a faixa que abre a tela da
          obra. Colaborador nao tem — a foto dele nunca abre tela
          nenhuma —, e por isso o editor dele vem sem este painel. */}
      <EditorImagem
        aberto={Boolean(ajustando)}
        imagem={ajustando?.imagem}
        nome={form.nome}
        comHeader
        /* imagem nova comeca centralizada; reenquadrar volta de onde parou */
        recorteInicial={ajustando?.nova ? null : form.recorteLogo}
        recorteCapaInicial={ajustando?.nova ? null : form.recorteCapa}
        aoConfirmar={aplicarRecorte}
        aoFechar={() => setAjustando(null)}
      />
    </Modal>
  )
}

/**
 * Uma unidade no cadastro: o nome (o curto, "Anápolis") e o endereço
 * dela. O CEP preenche o resto, como no cliente; as cidades vêm do
 * estado escolhido NESTA unidade.
 */
function CampoUnidade({ ordem, unidade, nomeDoCliente, estados, erro, obras, aoMudar, aoTirar }) {
  const [cidades, setCidades] = useState([])
  const [buscandoCEP, setBuscandoCEP] = useState(false)
  const [avisoCEP, setAvisoCEP] = useState('')

  useEffect(() => {
    if (!unidade.estado) {
      setCidades([])
      return undefined
    }
    let valido = true
    listarCidades(unidade.estado)
      .then((lista) => valido && setCidades(lista))
      .catch(() => valido && setCidades([]))
    return () => {
      valido = false
    }
  }, [unidade.estado])

  const mudar = (campo) => (evento) => aoMudar({ [campo]: evento?.target ? evento.target.value : evento })

  const mudarCEP = async (evento) => {
    const formatado = formatarCEP(evento.target.value)
    aoMudar({ cep: formatado })
    setAvisoCEP('')
    const digitos = formatado.replace(/\D/g, '')
    if (digitos.length !== 8) return
    setBuscandoCEP(true)
    try {
      const achado = await buscarCEP(digitos)
      if (!achado) {
        setAvisoCEP('CEP não encontrado — preencha à mão.')
        return
      }
      aoMudar(achado)
      setAvisoCEP('Endereço preenchido pelo CEP.')
    } catch {
      setAvisoCEP('Não foi possível consultar o CEP agora.')
    } finally {
      setBuscandoCEP(false)
    }
  }

  const curto = unidade.unidade.trim()
  return (
    <div className={`formcli__unidade ${erro ? 'has-erro' : ''}`.trim()}>
      <div className="formcli__unidtopo">
        <strong>Unidade {ordem}</strong>
        <span className="formcli__unidnome">
          {curto ? (
            <>
              Nas listas: <b>{nomeDaUnidade(nomeDoCliente || 'Cliente', curto)}</b>
            </>
          ) : (
            'Dê um nome à unidade'
          )}
        </span>
        <button
          type="button"
          className="formcli__tirar"
          onClick={aoTirar}
          disabled={obras > 0}
          aria-label={`Tirar a unidade ${curto || ordem}`}
          title={
            obras > 0
              ? `Tem ${obras} obra${obras === 1 ? '' : 's'}: troque o cliente delas antes de tirar a unidade`
              : 'Tirar a unidade'
          }
        >
          ×
        </button>
      </div>
      <div className="formcli__unidcampos">
        <CampoTexto
          rotulo="Nome da unidade"
          placeholder="Ex.: Anápolis"
          value={unidade.unidade}
          onChange={mudar('unidade')}
          maxLength={UNIDADE_MAXIMA}
        />
        <CampoTexto
          rotulo="CEP"
          inputMode="numeric"
          placeholder="00000-000"
          value={unidade.cep}
          onChange={mudarCEP}
          dica={buscandoCEP ? 'Consultando...' : avisoCEP || undefined}
        />
        <CampoTexto rotulo="Endereço" placeholder="Rua e número" value={unidade.endereco} onChange={mudar('endereco')} />
        <CampoTexto rotulo="Bairro" placeholder="Bairro" value={unidade.bairro} onChange={mudar('bairro')} />
        <CampoSelecao
          rotulo="Estado"
          value={unidade.estado}
          onChange={(evento) => aoMudar({ estado: evento.target.value, cidade: '' })}
          vazio={estados.length === 0 ? 'Carregando...' : 'Escolha o estado...'}
          opcoes={estados.map((e) => ({ valor: e.sigla, rotulo: `${e.sigla} — ${e.nome}` }))}
        />
        {cidades.length > 0 ? (
          <CampoSelecao
            rotulo="Cidade"
            value={unidade.cidade}
            onChange={mudar('cidade')}
            vazio="Escolha a cidade..."
            opcoes={cidades.map((c) => ({ valor: c, rotulo: c }))}
          />
        ) : (
          <CampoTexto
            rotulo="Cidade"
            placeholder={unidade.estado ? 'Carregando cidades...' : 'Escolha o estado antes'}
            value={unidade.cidade}
            onChange={mudar('cidade')}
          />
        )}
      </div>
      {erro && (
        <span className="campo__nota campo__nota--erro" role="alert">
          {erro}
        </span>
      )}
    </div>
  )
}
