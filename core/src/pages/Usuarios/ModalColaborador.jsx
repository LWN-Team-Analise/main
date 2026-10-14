import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import Avatar from '@/components/Avatar/Avatar'
import EditorImagem from '@/components/EditorImagem/EditorImagem'
import { CampoSelecao, CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import { podeEditarCpf } from '@/domain/obras'
import { ALTERACAO, VISUALIZACAO } from '@/domain/permissoes'
import { carregarFotoOriginal } from '@/services/equipeService'
import { validateCPF, validateEmail } from '@/services/authService'
import { formatarCPF, formatarTelefone, soDigitos } from '@/utils/formato'
import { prepararImagem } from '@/utils/imagem'
import './ModalColaborador.css'

/* a imagem inteira e guardada maior que o avatar recortado: e dela que
   o editor parte quando alguem reenquadra a foto depois */
const LADO_ORIGINAL = 1024

const VAZIO = {
  nome: '',
  nascimento: '',
  cpf: '',
  email: '',
  cargo: '',
  cargoTituloId: '',
  telefone: '',
  foto: null,
  fotoOriginal: null,
  recorteFoto: null,
}

/**
 * Cadastro do colaborador.
 *
 * SETOR e CARGO sao coisas diferentes aqui, e a confusao entre os dois
 * custa caro:
 *
 *   SETOR — Comercial, Excelência, GQ. E o que decide TUDO o que a
 *           pessoa pode fazer no sistema, quais checks ela marca e que
 *           avisos chegam para ela. Obrigatorio, e escolhido de uma
 *           lista (`form.cargo`, que e a chave do setor no banco).
 *   CARGO — "Analista de Qualidade", "Coordenador de Obras". E o titulo
 *           dela dentro do setor. Sai do cadastro de Cargos, e opcional
 *           e nao muda nenhuma permissao — dois analistas e um
 *           coordenador do mesmo setor podem exatamente as mesmas
 *           coisas. ATRIBUIR um cargo, porem, pede permissao propria
 *           (`editar_cargo_titulo`): sem ela o campo fica travado.
 *
 * CADASTRO NOVO: basta o e-mail e o setor. O formulario abre curto, so
 * com esses dois (e o cargo); nome, nascimento e CPF a propria pessoa
 * completa em Configuracoes. Quem quiser preencher na hora abre o resto
 * em "Preencher os dados da pessoa agora".
 *
 * Quem nao tem e-mail corporativo entra pelo CPF: sem e-mail, nome e CPF
 * voltam a ser obrigatorios.
 *
 * Na EDICAO, o CPF dos outros e travado para todo mundo, com UMA
 * excecao: a diretoria. E trava de setor, nao permissao configuravel —
 * a API recusa do mesmo jeito, e por isso nao adianta so liberar o
 * campo aqui. (O proprio CPF cada um preenche em Configuracoes.)
 *
 * `usuarioLogado` e quem esta mexendo — e dele que sai a permissao.
 */
export default function ModalColaborador({
  aberto,
  colaborador = null,
  usuarioLogado = null,
  aoFechar,
  aoSalvar,
}) {
  const { cargos, titulos, pode } = useDados()
  const entradaFoto = useRef(null)
  /* a imagem que o editor de enquadramento esta ajustando; null = fechado */
  const [ajustando, setAjustando] = useState(null)
  /* a foto so vai junto na gravacao quando alguem mexeu nela: a imagem
     inteira nao vem na carga, e manda-la vazia apagaria o original de
     quem so veio corrigir o telefone */
  const [fotoMexida, setFotoMexida] = useState(false)

  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)

  const editando = Boolean(colaborador)
  const cpfLiberado = podeEditarCpf(usuarioLogado)
  const podeCargo = pode('editar_cargo_titulo')
  /* cadastro novo abre so com e-mail, setor e cargo; o resto e opcional */
  const [maisDados, setMaisDados] = useState(false)
  const curto = !editando && !maisDados

  useEffect(() => {
    if (!aberto) return
    setForm(
      colaborador
        ? {
            ...VAZIO,
            ...colaborador,
            cpf: formatarCPF(colaborador.cpf ?? ''),
            telefone: formatarTelefone(colaborador.telefone ?? ''),
            nascimento: colaborador.nascimento ?? '',
            cargoTituloId: colaborador.cargoTituloId ?? '',
          }
        : VAZIO,
    )
    setErros({})
    setAjustando(null)
    setFotoMexida(false)
    setMaisDados(false)
  }, [aberto, colaborador])

  const mudar = (campo) => (evento) => {
    const bruto = evento?.target ? evento.target.value : evento
    const valor =
      campo === 'cpf'
        ? formatarCPF(bruto)
        : campo === 'telefone'
          ? formatarTelefone(bruto)
          : bruto
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }

  /* escolher o arquivo NAO grava a foto: abre o editor de
     enquadramento. Sair de la e que grava o recorte. */
  const escolherFoto = async (evento) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivo) return
    try {
      setErros((atual) => ({ ...atual, geral: undefined }))
      setAjustando({ imagem: await prepararImagem(arquivo, { lado: LADO_ORIGINAL }), nova: true })
    } catch (e) {
      setErros((atual) => ({ ...atual, geral: e.message }))
    }
  }

  /* Reenquadrar parte da imagem INTEIRA, e nao do avatar ja recortado:
     senao cada ajuste recortaria o recorte anterior.

     Ela nao vem na carga da equipe (pesada demais para viajar por
     pessoa em toda leitura), entao e buscada aqui, no clique. Cadastro
     antigo nao tem original guardado — a API devolve a propria foto,
     que e o melhor que existe ali. */
  const reenquadrar = async () => {
    try {
      const origem = form.fotoOriginal ?? (colaborador ? await carregarFotoOriginal(colaborador.id) : form.foto)
      if (origem) setAjustando({ imagem: origem, nova: false })
    } catch (e) {
      setErros((atual) => ({ ...atual, geral: e.message }))
    }
  }

  /* o que se confirma aqui e o CARGO: e ele que decide o que a pessoa
     nova vai poder fazer no sistema desde o primeiro acesso */
  const [conferindo, setConferindo] = useState(null)

  const enviar = (evento) => {
    evento.preventDefault()

    const novos = {}
    const temEmail = Boolean(form.email.trim())
    const cpf = soDigitos(form.cpf)
    /* o CPF so conta aqui quando pode mudar: no cadastro, sempre; na
       edicao, so para a diretoria (o campo dos outros fica travado) */
    const mexeCpf = !editando || cpfLiberado

    if (!form.cargo) novos.cargo = 'Escolha o setor.'

    if (!editando) {
      /* cadastro novo: o e-mail basta. Sem ele a pessoa so entra pelo
         CPF — ai nome e CPF passam a ser obrigatorios. */
      if (!temEmail && curto) novos.email = 'Informe o e-mail.'
      if (!temEmail && !curto) {
        if (!form.nome.trim()) novos.nome = 'Sem e-mail, informe o nome completo.'
        if (!cpf) novos.cpf = 'Sem e-mail, informe o CPF — é por ele que a pessoa entra.'
      }
    } else {
      if (!form.nome.trim()) novos.nome = 'Informe o nome completo.'
      // quem ja tinha CPF nao fica sem: a API recusa CPF vazio
      if (mexeCpf && !cpf && colaborador?.cpf) novos.cpf = 'Informe o CPF.'
    }
    if (mexeCpf && cpf && !validateCPF(form.cpf)) novos.cpf = 'CPF inválido.'

    /* E-mail e telefone, quando preenchidos, precisam ser validos: o
       que a validacao deve pegar e o dedo trocado, nao a ausencia. */
    if (temEmail && !validateEmail(form.email)) novos.email = 'E-mail inválido.'
    if (form.telefone.trim() && soDigitos(form.telefone).length < 10) {
      novos.telefone = 'Informe o DDD e o número.'
    }

    if (Object.keys(novos).length > 0) {
      setErros(novos)
      return
    }

    const campos = {
      nome: form.nome.trim(),
      email: form.email.trim(),
      telefone: soDigitos(form.telefone),
      nascimento: form.nascimento || null,
      cargo: form.cargo,
    }
    /* a foto so viaja quando alguem mexeu nela: a imagem inteira nao
       vem na carga, e manda-la vazia apagaria o original guardado */
    if (!editando || fotoMexida) {
      campos.foto = form.foto
      campos.fotoOriginal = form.fotoOriginal
      campos.recorteFoto = form.recorteFoto
    }
    /* o cargo so viaja para quem pode defini-lo: mandar o campo sem a
       permissao faria a API recusar a gravacao inteira */
    if (podeCargo) campos.cargoTituloId = form.cargoTituloId || ''
    /* o CPF so viaja quando foi preenchido e pode mudar: na edicao por
       quem nao e da diretoria, mandar o campo faria a API recusar a
       gravacao inteira. Vazio no cadastro = a pessoa preenche depois. */
    if (cpf && mexeCpf && cpf !== soDigitos(colaborador?.cpf)) campos.cpf = cpf

    setConferindo(campos)
  }

  const gravar = async () => {
    if (!conferindo) return
    setSalvando(true)
    try {
      await aoSalvar(conferindo)
      setConferindo(null)
      aoFechar()
    } catch (e) {
      setErros({ geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar colaborador' : 'Adicionar colaborador'}
      largura={580}
    >
      <form className="formcolab" onSubmit={enviar} noValidate>
        {!editando && (
          <p className="formcolab__dica">
            {curto
              ? 'Basta o e-mail e o setor. Nome, data de nascimento e CPF a própria pessoa completa na conta dela, no primeiro acesso.'
              : 'Tudo aqui é opcional, menos o setor. Sem e-mail, nome e CPF passam a ser obrigatórios — é pelo CPF que a pessoa entra.'}
          </p>
        )}

        {/* foto a esquerda, nome a direita — no cadastro curto, nada disso */}
        {!curto && (
          <div className="formcolab__cabeca">
            <button
              type="button"
              className="formcolab__foto"
              onClick={() => entradaFoto.current?.click()}
              title="Escolher foto de perfil"
            >
              <Avatar nome={form.nome || '?'} foto={form.foto} tamanho={74} />
              <span className="formcolab__trocar">{form.foto ? 'Trocar' : 'Foto'}</span>
            </button>
            <input
              ref={entradaFoto}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={escolherFoto}
              tabIndex={-1}
            />

            <div className="formcolab__nome">
              <CampoTexto
                rotulo={editando ? 'Nome completo *' : 'Nome completo'}
                placeholder="Nome e sobrenome"
                value={form.nome}
                onChange={mudar('nome')}
                erro={erros.nome}
              />
              {form.foto && (
                <span className="formcolab__fotoacoes">
                  <button type="button" className="formcolab__semfoto" onClick={reenquadrar}>
                    Ajustar enquadramento
                  </button>
                  <button
                    type="button"
                    className="formcolab__semfoto"
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
        )}

        <div className="formcolab__grade">
          {!curto && (
            <CampoTexto
              rotulo="Data de nascimento"
              type="date"
              value={form.nascimento}
              onChange={mudar('nascimento')}
              erro={erros.nascimento}
            />
          )}

          {!curto && (
            <CampoTexto
              rotulo="CPF"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={form.cpf}
              onChange={mudar('cpf')}
              erro={erros.cpf}
              disabled={editando && !cpfLiberado}
            />
          )}

          {/* no cadastro curto o e-mail ocupa a linha toda: e o campo
              que importa ali */}
          <CampoTexto
            rotulo={curto ? 'E-mail *' : 'E-mail'}
            type="email"
            placeholder="pessoa@empresa.com.br"
            value={form.email}
            onChange={mudar('email')}
            erro={erros.email}
            largo={curto}
            autoFocus={curto}
          />

          {!curto && (
            <CampoTexto
              rotulo="Telefone"
              inputMode="numeric"
              placeholder="(11) 90000-0000"
              value={form.telefone}
              onChange={mudar('telefone')}
              erro={erros.telefone}
            />
          )}

          {/* Setor e Cargo lado a lado, nesta ordem: o setor diz de que
              grupo a pessoa é (e é o que decide o que ela pode fazer);
              o cargo, o que ela é dentro dele. Só o setor tem cor. */}
          <CampoSelecao
            rotulo="Setor *"
            value={form.cargo}
            onChange={mudar('cargo')}
            erro={erros.cargo}
            vazio="Escolha o setor..."
            /* setor com acesso total so aparece para quem tem acesso
               total (a API recusa do mesmo jeito) — ou quando ja e o da
               pessoa, para o cadastro dela abrir com o setor certo */
            opcoes={cargos
              .filter((c) => !c.acessoTotal || usuarioLogado?.acessoTotal || c.chave === colaborador?.cargo)
              .map((c) => ({ valor: c.chave, rotulo: c.nome, cor: c.cor }))}
          />

          {/* CARGO: sai do cadastro de Cargos e não muda permissão
              nenhuma — mas ATRIBUIR um pede permissão própria, senão
              qualquer um se daria o cargo que quisesse. */}
          <CampoSelecao
            rotulo="Cargo"
            value={form.cargoTituloId ?? ''}
            onChange={mudar('cargoTituloId')}
            erro={erros.cargoTituloId}
            disabled={!podeCargo}
            vazio={
              !podeCargo
                ? 'Somente quem define cargos'
                : titulos.length === 0
                  ? 'Nenhum cargo cadastrado ainda'
                  : 'Sem cargo'
            }
            opcoes={titulos.map((t) => ({ valor: String(t.id), rotulo: t.nome }))}
          />
        </div>

        {curto && (
          <button type="button" className="formcolab__mais" onClick={() => setMaisDados(true)}>
            Preencher os dados da pessoa agora
          </button>
        )}

        {erros.geral && (
          <p className="formcolab__erro" role="alert">
            {erros.geral}
          </p>
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={salvando}>
            {editando ? 'Salvar alterações' : 'Adicionar colaborador'}
          </Button>
        </footer>
      </form>

      {/* A conferência é sobre o SETOR.

          Cadastrar uma pessoa e escolher o setor dela sao a mesma acao aqui,
          e e o setor que decide o que ela pode fazer desde o primeiro acesso.
          Mostrar a lista antes de gravar e o que evita descobrir semana que
          vem que o novo tecnico tambem apagava obra. */}
      <Confirma
        aberto={Boolean(conferindo)}
        nivel={1}
        tom="acao"
        titulo={editando ? 'Salvar as alterações?' : 'Cadastrar este colaborador?'}
        mensagem={
          editando
            ? 'Os dados abaixo passam a valer para esta pessoa.'
            : 'A pessoa entra com uma senha temporária gerada automaticamente e troca no primeiro acesso. O que ficar em branco ela completa na conta dela.'
        }
        detalhes={<ResumoDoCargo campos={conferindo} cargos={cargos} titulos={titulos} />}
        rotuloConfirmar={editando ? 'Salvar' : 'Cadastrar'}
        aoConfirmar={gravar}
        aoFechar={() => setConferindo(null)}
      />

      {/* Colaborador NAO tem header: a foto dele nunca abre tela
          nenhuma. Por isso o editor vem sem o painel de header — esse
          é só do cliente. */}
      <EditorImagem
        aberto={Boolean(ajustando)}
        imagem={ajustando?.imagem}
        nome={form.nome}
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
    </Modal>
  )
}

/**
 * O resumo que aparece na confirmacao: quem e a pessoa e, principalmente, o
 * que o SETOR escolhido libera para ela.
 */
function ResumoDoCargo({ campos, cargos, titulos = [] }) {
  if (!campos) return null

  const cargo = cargos.find((c) => c.chave === campos.cargo)
  const titulo = titulos.find((t) => String(t.id) === String(campos.cargoTituloId))
  const chaves = cargo?.permissoes ?? []
  const rotulo = (chave) =>
    [...VISUALIZACAO, ...ALTERACAO].find((p) => p.chave === chave)?.rotulo ?? chave

  return (
    <dl>
      <dt>Nome</dt>
      <dd>{campos.nome || <em>a pessoa preenche no primeiro acesso</em>}</dd>

      <dt>E-mail</dt>
      <dd>{campos.email || <em>sem e-mail — entra pelo CPF</em>}</dd>

      <dt>Setor</dt>
      <dd>{cargo?.nome ?? campos.cargo}</dd>

      <dt>Cargo</dt>
      <dd>{titulo?.nome || <em>não informado</em>}</dd>

      <dt>Pode</dt>
      <dd>
        {cargo?.acessoTotal ? (
          <strong>Acesso total — passa por todas as travas do sistema.</strong>
        ) : chaves.length === 0 ? (
          <em>Nenhuma permissão. A pessoa só vê a própria conta.</em>
        ) : (
          <ul>
            {chaves.map((c) => (
              <li key={c}>{rotulo(c)}</li>
            ))}
          </ul>
        )}
      </dd>
    </dl>
  )
}
