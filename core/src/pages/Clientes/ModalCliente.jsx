import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Avatar from '@/components/Avatar/Avatar'
import EditorImagem, { PreviaHeader } from '@/components/EditorImagem/EditorImagem'
import { CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
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
}

/**
 * Cadastro de cliente. O CEP puxa o resto do endereco no ViaCEP; a lista de
 * estados e de cidades vem do IBGE. Se alguma API falhar, os campos seguem
 * editaveis na mao — o cadastro nunca fica preso.
 */
export default function ModalCliente({ aberto, cliente = null, aoFechar, aoSalvar }) {
  const { setores } = useDados()
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
      setForm(cliente ? { ...VAZIO, ...cliente, setorId: cliente.setorId ?? '' } : VAZIO)
      setErros({})
      setAvisoCEP('')
      setErroImagem('')
      setImagemMexida(false)
    }
  }, [aberto, cliente])

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

    if (Object.keys(novosErros).length > 0) {
      setErros(novosErros)
      return
    }

    const { logo, logoOriginal, recorteLogo, capa, recorteCapa, ...campos } = form
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
      largura={600}
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
                  Logo cadastrada antes do recorte separado: a faixa está usando o mesmo
                  enquadramento do quadrado. Abra &quot;Ajustar enquadramento&quot; para dar
                  um recorte próprio a ela.
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
