import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Avatar from '@/components/Avatar/Avatar'
import EditorImagem, { PreviaHeader } from '@/components/EditorImagem/EditorImagem'
import { CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { CampoData } from '@/components/CampoData/CampoData'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import {
  SERVICO_MAXIMO,
  UNIDADE_MAXIMA,
  chaveDaUnidade,
  codigoPostal,
  enderecoNasUnidades,
  localDoEndereco,
  nomeDaUnidade,
  ordemDasUnidades,
  primeiraUnidade,
} from '@/domain/clientes'
import { valorCurto } from '@/domain/comercial'
import { PAIS_PADRAO, ehBrasil, opcoesDePaises } from '@/domain/paises'
import { carregarImagemDoCliente } from '@/services/dadosService'
import { buscarCEP, estadosCarregados, listarCidades, listarEstados } from '@/services/enderecoService'
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
  pais: PAIS_PADRAO,
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
  /* a UNIDADE cadastrada ou editada sozinha: o cliente dela (o "Unidade
     de"), o lugar ("Anapolis") e o servico ("Faturamento", atualizacao 34) */
  matrizId: '',
  unidade: '',
  servico: '',
}

const PESSOA_VAZIA = { id: null, nome: '', cargo: '', email: '', telefone: '' }
const UNIDADE_VAZIA = { id: null, unidade: '', servico: '', pais: PAIS_PADRAO, cep: '', endereco: '', bairro: '', estado: '', cidade: '' }
/* a chave da unidade na tela: a nova ainda nao tem id */
let proximaChave = 0
const novaChave = () => `u${(proximaChave += 1)}`
const emailCerto = (email) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)

/* o endereco de um cadastro (do cliente ou de uma unidade), sem o resto */
const enderecoDe = (origem) => ({
  pais: origem.pais || PAIS_PADRAO,
  cep: origem.cep ?? '',
  endereco: origem.endereco ?? '',
  bairro: origem.bairro ?? '',
  estado: origem.estado ?? '',
  cidade: origem.cidade ?? '',
})

/* o endereco que veio do banco, com o CEP ja na mascara */
const enderecoDoBanco = (c) => ({ ...enderecoDe(c), cep: c.cep ? codigoPostal(c.cep, c.pais) : '' })

/* o estado so e obrigatorio onde ha estados para escolher: no Brasil
   sempre, fora dele quando a lista trouxe algum (Monaco nao tem) */
const pedeEstado = (pais) => ehBrasil(pais) || (estadosCarregados(pais)?.length ?? 0) > 0

/**
 * O nome da unidade (o lugar) se completa com a cidade do endereco:
 * enquanto ele estiver vazio, ou igual a cidade de antes, acompanha a
 * cidade nova. Quem escreveu outro nome a mao continua com o dele.
 */
function lugarSegueCidade(atual, mudanca) {
  if (!('cidade' in mudanca)) return mudanca
  const lugar = String(atual.unidade ?? '').trim()
  const automatico = !lugar || lugar === String(atual.cidade ?? '').trim()
  return automatico ? { ...mudanca, unidade: mudanca.cidade ?? '' } : mudanca
}

/**
 * Cadastro de cliente. O endereco comeca pelo pais (o Brasil, de padrao):
 * no Brasil o CEP puxa o resto no ViaCEP e as listas de estados e cidades
 * vem do IBGE; fora dele, da CountriesNow. Se alguma API falhar, os
 * campos seguem editaveis na mao — o cadastro nunca fica preso
 * (CamposEndereco).
 *
 * No Novo cliente, o "Unidade de" troca o cadastro por uma UNIDADE de um
 * cliente que ja existe: o formulario vem com os dados dele (endereco,
 * pessoas, proprietario) e so se mexe no que e da unidade — o servico
 * ("Faturamento"), o lugar ("Anapolis", que segue a cidade) e o endereco.
 * A logo, a capa e o setor sao os do cliente. A unidade aberta pelo card
 * do cliente cai no mesmo formulario, para editar.
 *
 * Com UNIDADE, o cliente vira a vitrine delas: o endereco dele some do
 * formulario (e do banco) e passa a ser o de cada unidade. A primeira
 * unidade adicionada leva junto o endereco que ele tinha — ele vira a
 * Unidade 1, e a nova e a Unidade 2. Tirando a nova antes de salvar, a
 * Unidade 1 volta a ser o endereco do cliente.
 *
 * As unidades vem fechadas, so com o nome, como no card do cliente: o
 * clique abre os campos de uma (uma por vez). A nova ja abre, e quem
 * tem erro abre no "Salvar".
 */
export default function ModalCliente({ aberto, cliente = null, resumo = null, nota = null, aoFechar, aoSalvar }) {
  const { setores, equipe, clientes, obras } = useDados()
  const { user } = useAuth()
  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  /* a unidade aberta no formulario (a chave dela); as outras ficam so com o nome */
  const [unidadeAberta, setUnidadeAberta] = useState(null)
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
              ...enderecoDoBanco(cliente),
              setorId: cliente.setorId ?? '',
              proprietarioId: cliente.proprietarioId ?? '',
              proximoContato: cliente.proximoContato ?? '',
              pessoas: (cliente.pessoas ?? []).map((p) => ({ ...PESSOA_VAZIA, ...p })),
              matrizId: cliente.matrizId ?? '',
              unidade: cliente.unidade ?? '',
              servico: cliente.servico ?? '',
              unidades: clientes
                .filter((c) => String(c.matrizId) === String(cliente.id))
                .sort(ordemDasUnidades)
                .map((c) => ({
                  ...UNIDADE_VAZIA,
                  chave: `id${c.id}`,
                  id: c.id,
                  unidade: c.unidade ?? '',
                  servico: c.servico ?? '',
                  ...enderecoDoBanco(c),
                })),
            }
          : /* cliente novo e de quem esta cadastrando, ate alguem trocar */
            { ...VAZIO, proprietarioId: user?.id ? String(user.id) : '' },
      )
      setErros({})
      setUnidadeAberta(null)
      setErroImagem('')
      setImagemMexida(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, cliente, user?.id])

  const mudar = (campo) => (evento) => {
    const valor = evento?.target ? evento.target.value : evento
    setForm((atual) => ({ ...atual, ...daUnidade(atual, { [campo]: valor }) }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }

  /* ---------------- A unidade sozinha ---------------- */

  const modoUnidade = Boolean(form.matrizId)
  /* o cliente com unidade nao tem endereco proprio (enderecoNasUnidades) */
  const vitrine = !modoUnidade && enderecoNasUnidades(form.unidades.length)
  const matriz = modoUnidade ? clientes.find((c) => String(c.id) === String(form.matrizId)) ?? null : null
  /* so o cliente "de cima" pode ter unidade */
  const principais = clientes
    .filter((c) => !c.matrizId)
    .map((c) => ({ valor: String(c.id), rotulo: c.nome }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

  /* na unidade, o lugar acompanha a cidade (ver lugarSegueCidade) */
  const daUnidade = (atual, mudanca) => (atual.matrizId ? lugarSegueCidade(atual, mudanca) : mudanca)

  /* o "Unidade de": o formulario vem com os dados do cliente escolhido,
     e o que for da unidade se troca por cima. Voltar para "nenhum"
     limpa tudo — e um cliente novo de novo. */
  const escolherMatriz = (evento) => {
    const id = evento.target.value
    const escolhido = clientes.find((c) => String(c.id) === String(id))
    setErros({})
    if (!escolhido) {
      setForm({ ...VAZIO, proprietarioId: user?.id ? String(user.id) : '' })
      return
    }
    setForm({
      ...VAZIO,
      matrizId: String(escolhido.id),
      unidade: escolhido.cidade ?? '',
      ...enderecoDoBanco(escolhido),
      proprietarioId: escolhido.proprietarioId ?? (user?.id ? String(user.id) : ''),
      proximoContato: escolhido.proximoContato ?? '',
      /* copias: as pessoas da unidade sao dela, sem mexer nas do cliente */
      pessoas: (escolhido.pessoas ?? []).map((p) => ({ ...PESSOA_VAZIA, ...p, id: null })),
    })
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
      unidades: atual.unidades.map((u) => (u.chave === chave ? { ...u, ...lugarSegueCidade(u, mudanca) } : u)),
    }))
    setErros((atual) => ({ ...atual, [`unidade-${chave}`]: undefined }))
  }

  /* as chaves saem fora do setForm: a funcao dele pode rodar duas vezes */
  const novaUnidade = () => {
    const chaveNova = novaChave()
    const chavePrimeira = novaChave()
    setForm((atual) => {
      /* a unidade nova comeca no pais do cliente */
      const nova = { ...UNIDADE_VAZIA, chave: chaveNova, pais: atual.pais }
      if (atual.unidades.length > 0) return { ...atual, unidades: [...atual.unidades, nova] }
      /* a primeira: o endereco que o cliente tinha vira a Unidade 1, e a nova e a 2 */
      const primeira = primeiraUnidade({ nome: atual.nome, ...enderecoDe(atual) })
      if (!primeira) return { ...atual, unidades: [nova] }
      return {
        ...atual,
        unidades: [{ ...UNIDADE_VAZIA, ...primeira, cep: atual.cep, chave: chavePrimeira, doCliente: true }, nova],
      }
    })
    /* a nova ja abre, para preencher */
    setUnidadeAberta(chaveNova)
  }

  const tirarUnidade = (chave) =>
    setForm((atual) => {
      const saiu = atual.unidades.find((u) => u.chave === chave)
      const ficam = atual.unidades.filter((u) => u.chave !== chave)
      /* sobrou so a Unidade 1 que acabou de nascer do endereco do cliente:
         ela volta a ser o endereco dele */
      if (ficam.length === 1 && ficam[0].doCliente && !ficam[0].id) {
        return { ...atual, ...enderecoDe(ficam[0]), unidades: [] }
      }
      /* sem unidade nenhuma, o cliente volta a ter endereco — o da ultima
         que saiu, se ele estava sem */
      if (ficam.length === 0 && saiu && !atual.cidade.trim()) return { ...atual, ...enderecoDe(saiu), unidades: [] }
      return { ...atual, unidades: ficam }
    })

  /* quantas obras cada unidade ja tem: a que tem obra nao sai daqui */
  const obrasDaUnidade = (id) => (id ? obras.filter((o) => String(o.clienteId) === String(id)).length : 0)

  /* o endereco do cliente (ou da unidade sozinha), pelo CamposEndereco */
  const mudarEndereco = (mudanca) => {
    setForm((atual) => ({ ...atual, ...daUnidade(atual, mudanca) }))
    setErros((atual) => ({ ...atual, ...Object.fromEntries(Object.keys(mudanca).map((campo) => [campo, undefined])) }))
  }

  const enviar = (evento) => {
    evento.preventDefault()

    const novosErros = {}
    if (modoUnidade) {
      if (!form.unidade.trim() && !form.servico.trim()) {
        novosErros.unidade = 'Dê um nome ou um serviço à unidade (ex.: Anápolis, Faturamento).'
      } else {
        /* a irma com o mesmo lugar e o mesmo servico nao se distinguiria na lista */
        const chave = chaveDaUnidade(matriz?.nome, form.unidade, form.servico)
        const repetida = clientes.some(
          (c) =>
            String(c.matrizId) === String(form.matrizId) &&
            String(c.id) !== String(cliente?.id) &&
            chaveDaUnidade(matriz?.nome, c.unidade, c.servico) === chave,
        )
        if (repetida) novosErros.unidade = 'Este cliente já tem uma unidade com esse nome e esse serviço.'
      }
    } else if (!form.nome.trim()) novosErros.nome = 'Informe o nome da empresa.'
    if (!vitrine) {
      if (!form.cidade.trim()) novosErros.cidade = 'Informe a cidade.'
      if (!form.estado.trim() && pedeEstado(form.pais)) novosErros.estado = 'Escolha o estado.'
    }
    form.pessoas.forEach((p, i) => {
      const algum = p.nome.trim() || p.email.trim() || p.telefone.trim() || p.cargo.trim()
      if (!algum) return
      if (!p.nome.trim()) novosErros[`pessoa${i}`] = 'Escreva o nome da pessoa.'
      else if (p.email.trim() && !emailCerto(p.email.trim())) novosErros[`pessoa${i}`] = 'O e-mail não parece certo.'
    })
    const nomesDasUnidades = new Set()
    form.unidades.forEach((u) => {
      const qual = chaveDaUnidade(form.nome, u.unidade, u.servico)
      const chave = `unidade-${u.chave}`
      if (qual === '|') novosErros[chave] = 'Dê um nome ou um serviço à unidade (ex.: Anápolis, Faturamento).'
      else if (nomesDasUnidades.has(qual)) novosErros[chave] = 'Já há uma unidade com esse nome e esse serviço.'
      else if (!u.estado.trim() && pedeEstado(u.pais)) novosErros[chave] = 'Escolha o estado da unidade.'
      else if (!u.cidade.trim()) novosErros[chave] = 'Informe a cidade da unidade.'
      nomesDasUnidades.add(qual)
    })

    if (Object.keys(novosErros).length > 0) {
      setErros(novosErros)
      /* a unidade com erro abre, para o erro estar a vista */
      const comErro = form.unidades.find((u) => novosErros[`unidade-${u.chave}`])
      if (comErro) setUnidadeAberta(comErro.chave)
      return
    }

    /* linha de pessoa toda em branco nao vai */
    const pessoas = form.pessoas
      .map((p) => ({
        id: p.id,
        nome: p.nome.trim(),
        cargo: p.cargo.trim(),
        email: p.email.trim(),
        telefone: p.telefone.trim(),
      }))
      .filter((p) => p.nome || p.email || p.telefone || p.cargo)

    /* a unidade leva so o que e dela; a logo, o setor e o nome do
       cliente ficam com ele */
    if (modoUnidade) {
      aoSalvar({
        matrizId: form.matrizId,
        unidade: form.unidade.trim(),
        servico: form.servico.trim(),
        pais: form.pais,
        cep: form.cep,
        endereco: form.endereco.trim(),
        bairro: form.bairro.trim(),
        estado: form.estado,
        cidade: form.cidade.trim(),
        pessoas,
        proprietarioId: form.proprietarioId || null,
        proximoContato: form.proximoContato || null,
      })
      aoFechar()
      return
    }

    const { logo, logoOriginal, recorteLogo, capa, recorteCapa, matrizId, unidade, servico, ...campos } = form
    /* a vitrine vai sem endereco: o dele ja esta na Unidade 1, e sai do banco */
    if (vitrine) Object.assign(campos, { cep: '', endereco: '', bairro: '', estado: '', cidade: '' })
    campos.pessoas = pessoas
    campos.unidades = form.unidades.map((u) => ({
      id: u.id,
      unidade: u.unidade.trim(),
      servico: u.servico.trim(),
      /* a Unidade 1 nova leva a data de cadastro do cliente, para vir antes */
      doCliente: Boolean(u.doCliente && !u.id),
      pais: u.pais,
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
      titulo={
        modoUnidade ? (cliente ? 'Editar unidade' : 'Nova unidade') : cliente ? 'Editar cliente' : 'Novo cliente'
      }
      largura={720}
    >
      <form className="formcli" onSubmit={enviar} noValidate>
        {/* ---------------- Unidade de ----------------
            Só no cadastro novo: escolher um cliente que já existe faz
            deste cadastro uma unidade dele. */}
        {!cliente && (
          <CampoSelecao
            rotulo="Unidade de"
            largo
            value={form.matrizId}
            onChange={escolherMatriz}
            vazio="Nenhum — é um cliente novo"
            opcoes={principais}
          />
        )}

        {modoUnidade ? (
          <>
            {/* o cliente da unidade: a logo, o nome e o setor são dele */}
            <div className="formcli__matriz">
              <Avatar nome={matriz?.nome || '?'} foto={matriz?.logo} tamanho={44} quadrado titulo={matriz?.nome} />
              <span className="formcli__matriztexto">
                <small>{cliente ? 'Unidade de' : 'Os dados vieram de'}</small>
                <strong>{matriz?.nome ?? 'Cliente'}</strong>
              </span>
            </div>

            <CampoTexto
              rotulo="Serviço"
              placeholder="Ex.: Faturamento, Obra, Administração"
              value={form.servico}
              onChange={mudar('servico')}
              maxLength={SERVICO_MAXIMO}
            />
            <CampoTexto
              rotulo="Nome da unidade"
              placeholder="Ex.: Anápolis"
              value={form.unidade}
              onChange={mudar('unidade')}
              maxLength={UNIDADE_MAXIMA}
              erro={erros.unidade}
            />
            <p className="formcli__nalista">
              Nas listas:{' '}
              <b>
                {form.unidade.trim() || form.servico.trim()
                  ? nomeDaUnidade(matriz?.nome ?? 'Cliente', form.unidade, form.servico)
                  : '—'}
              </b>
            </p>
          </>
        ) : (
          <>
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
          </>
        )}

        {/* o endereco do cliente; com unidade ele some, e cada unidade
            tem o seu (la embaixo) */}
        {!vitrine && (
          <CamposEndereco valor={form} aoMudar={mudarEndereco} erros={{ estado: erros.estado, cidade: erros.cidade }} />
        )}

        {/* ---------------- Unidades ----------------
            O mesmo cliente em outros enderecos: na aba Clientes ele
            continua UM so; nas listas de escolher cliente (obra,
            comercial, reembolso) cada unidade aparece com o nome
            inteiro — "Einstein Anápolis". */}
        {!modoUnidade && (
          <fieldset className="formcli__pessoas formcli__unidades">
            <legend>Unidades</legend>
            {form.unidades.map((u, i) => (
              <CampoUnidade
                key={u.chave}
                ordem={i + 1}
                unidade={u}
                nomeDoCliente={form.nome}
                erro={erros[`unidade-${u.chave}`]}
                obras={obrasDaUnidade(u.id)}
                aberta={unidadeAberta === u.chave}
                aoAlternar={() => setUnidadeAberta((atual) => (atual === u.chave ? null : u.chave))}
                aoMudar={(mudanca) => mudarUnidade(u.chave, mudanca)}
                aoTirar={() => tirarUnidade(u.chave)}
              />
            ))}
            <button type="button" className="formcli__mais" onClick={novaUnidade}>
              + Adicionar unidade
            </button>
          </fieldset>
        )}

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
        {!modoUnidade && (
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
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit">
            {cliente ? 'Salvar alterações' : modoUnidade ? 'Cadastrar unidade' : 'Cadastrar cliente'}
          </Button>
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
 * O endereco — do cliente ou de uma unidade: o pais, o CEP, a rua, o
 * bairro, o estado e a cidade.
 *
 * No Brasil o CEP preenche o resto (ViaCEP) e as listas vem do IBGE;
 * fora dele o codigo postal e livre e as listas vem da CountriesNow. A
 * lista que nao vem (API fora, pais sem estados) vira campo livre — o
 * cadastro nunca fica preso. O que estava gravado e nao esta na lista
 * entra nela, para nao sumir da tela.
 *
 * `aoMudar` recebe so o que mudou: { cidade: 'Miami' }.
 */
function CamposEndereco({ valor, aoMudar, erros = {} }) {
  const brasil = ehBrasil(valor.pais)
  /* null = carregando; [] = sem lista */
  const [estados, setEstados] = useState(null)
  const [cidades, setCidades] = useState(null)
  const [buscandoCEP, setBuscandoCEP] = useState(false)
  const [avisoCEP, setAvisoCEP] = useState('')

  useEffect(() => {
    let valido = true
    setEstados(estadosCarregados(valor.pais) ?? null)
    listarEstados(valor.pais)
      .then((lista) => valido && setEstados(lista))
      .catch(() => valido && setEstados([]))
    return () => {
      valido = false
    }
  }, [valor.pais])

  /* as cidades acompanham o estado escolhido */
  useEffect(() => {
    if (!valor.estado) {
      setCidades([])
      return undefined
    }
    let valido = true
    setCidades(null)
    listarCidades(valor.pais, valor.estado)
      .then((lista) => valido && setCidades(lista))
      .catch(() => valido && setCidades([]))
    return () => {
      valido = false
    }
  }, [valor.pais, valor.estado])

  const mudar = (campo) => (evento) => aoMudar({ [campo]: evento?.target ? evento.target.value : evento })

  /* trocar o pais leva o estado, a cidade e o CEP: nenhum deles vale no outro */
  const mudarPais = (evento) => {
    if (evento.target.value === valor.pais) return
    setAvisoCEP('')
    aoMudar({ pais: evento.target.value, estado: '', cidade: '', cep: '' })
  }

  /* trocar o estado na mao invalida a cidade que estava escolhida */
  const mudarEstado = (evento) => aoMudar({ estado: evento.target.value, cidade: '' })

  const mudarCEP = async (evento) => {
    if (!brasil) {
      aoMudar({ cep: evento.target.value })
      return
    }
    const formatado = formatarCEP(evento.target.value)
    aoMudar({ cep: formatado })
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
      aoMudar(achado)
      setAvisoCEP('Endereço preenchido pelo CEP.')
    } catch {
      setAvisoCEP('Não foi possível consultar o CEP agora.')
    } finally {
      setBuscandoCEP(false)
    }
  }

  /* a lista com o que estava gravado, mesmo que ela nao o tenha */
  const comOAtual = (opcoes, atual) =>
    !atual || opcoes.some((o) => o.valor === atual) ? opcoes : [{ valor: atual, rotulo: atual }, ...opcoes]

  const temEstados = estados === null || estados.length > 0
  return (
    <>
      <CampoSelecao rotulo="País" value={valor.pais} onChange={mudarPais} opcoes={opcoesDePaises()} />

      <CampoTexto
        rotulo={brasil ? 'CEP' : 'Código postal'}
        inputMode={brasil ? 'numeric' : undefined}
        placeholder={brasil ? '00000-000' : 'Código postal'}
        maxLength={brasil ? undefined : 12}
        value={valor.cep}
        onChange={mudarCEP}
        dica={buscandoCEP ? 'Consultando...' : avisoCEP || undefined}
      />

      <CampoTexto rotulo="Endereço" placeholder="Rua e número" value={valor.endereco} onChange={mudar('endereco')} />

      <CampoTexto rotulo="Bairro" placeholder="Bairro" value={valor.bairro} onChange={mudar('bairro')} />

      {temEstados ? (
        <CampoSelecao
          rotulo="Estado"
          value={valor.estado}
          onChange={mudarEstado}
          erro={erros.estado}
          vazio={estados === null ? 'Carregando...' : 'Escolha o estado...'}
          opcoes={comOAtual(estados ?? [], valor.estado)}
        />
      ) : (
        <CampoTexto
          rotulo="Estado"
          placeholder={brasil ? 'UF (ex.: SP)' : 'Estado ou província'}
          maxLength={brasil ? 2 : 80}
          value={valor.estado}
          onChange={mudar('estado')}
          erro={erros.estado}
        />
      )}

      {/* sem lista (API fora, ou ela nao conhece o estado), vira campo livre */}
      {cidades?.length > 0 ? (
        <CampoSelecao
          rotulo="Cidade"
          value={valor.cidade}
          onChange={mudar('cidade')}
          erro={erros.cidade}
          vazio="Escolha a cidade..."
          opcoes={comOAtual(
            cidades.map((c) => ({ valor: c, rotulo: c })),
            valor.cidade,
          )}
        />
      ) : (
        <CampoTexto
          rotulo="Cidade"
          placeholder={cidades === null ? 'Carregando cidades...' : !valor.estado && temEstados ? 'Escolha o estado antes' : 'Cidade'}
          value={valor.cidade}
          onChange={mudar('cidade')}
          erro={erros.cidade}
        />
      )}
    </>
  )
}

/**
 * Uma unidade no cadastro. Fechada, so o nome dela ("Anápolis -
 * Faturamento") e onde fica; aberta, o serviço, o nome (o lugar, que
 * acompanha a cidade) e o endereço (CamposEndereco). O erro fica a vista
 * mesmo com ela fechada.
 */
function CampoUnidade({ ordem, unidade, nomeDoCliente, erro, obras, aberta, aoAlternar, aoMudar, aoTirar }) {
  const mudar = (campo) => (evento) => aoMudar({ [campo]: evento?.target ? evento.target.value : evento })

  const curto = unidade.unidade.trim()
  const servico = unidade.servico.trim()
  const onde = localDoEndereco(unidade)
  const id = `formcli-unidade-${unidade.chave}`
  return (
    <div className={`formcli__unidade ${erro ? 'has-erro' : ''}`.trim()} data-aberta={aberta}>
      <div className="formcli__unidtopo">
        <button type="button" className="formcli__unidabrir" onClick={aoAlternar} aria-expanded={aberta} aria-controls={id}>
          {/* o titulo e o servico que a unidade presta ("Faturamento");
              sem servico, o numero dela */}
          <strong>{servico || `Unidade ${ordem}`}</strong>
          <span className="formcli__unidnome">
            {curto ? <b>{curto}</b> : !servico && 'Dê um nome ou um serviço à unidade'}
            {onde && onde !== curto && <span className="formcli__unidonde">{onde}</span>}
          </span>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          className="formcli__tirar"
          onClick={aoTirar}
          disabled={obras > 0}
          aria-label={`Tirar a unidade ${[curto, servico].filter(Boolean).join(' - ') || ordem}`}
          title={
            obras > 0
              ? `Tem ${obras} obra${obras === 1 ? '' : 's'}: troque o cliente delas antes de tirar a unidade`
              : 'Tirar a unidade'
          }
        >
          ×
        </button>
      </div>
      <div className="formcli__unidcorpo" id={id}>
        <div className="formcli__unidcorpo-int">
          <p className="formcli__unidlista">
            Nas listas: <b>{curto || servico ? nomeDaUnidade(nomeDoCliente || 'Cliente', curto, servico) : '—'}</b>
          </p>
          <div className="formcli__unidcampos">
            <CampoTexto
              rotulo="Serviço"
              placeholder="Ex.: Faturamento, Obra"
              value={unidade.servico}
              onChange={mudar('servico')}
              maxLength={SERVICO_MAXIMO}
            />
            <CampoTexto
              rotulo="Nome da unidade"
              placeholder="Ex.: Anápolis"
              value={unidade.unidade}
              onChange={mudar('unidade')}
              maxLength={UNIDADE_MAXIMA}
            />
            <CamposEndereco valor={unidade} aoMudar={aoMudar} />
          </div>
        </div>
      </div>
      {erro && (
        <span className="campo__nota campo__nota--erro formcli__unidaerro" role="alert">
          {erro}
        </span>
      )}
    </div>
  )
}
