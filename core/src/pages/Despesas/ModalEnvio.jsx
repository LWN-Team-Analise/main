import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Seletor from '@/components/Seletor/Seletor'
import {
  CampoArea,
  CampoArquivo,
  CampoDinheiro,
  CampoSelecao,
  CampoTexto,
} from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import {
  ANEXO_ACEITA,
  ANEXO_BYTES_MAXIMOS,
  CATEGORIAS,
  JUSTIFICATIVA_MAXIMA,
  OBSERVACAO_MAXIMA,
  VALOR_MAXIMO,
  anexoAceito,
  rotuloDoValor,
  tiposDa,
  valorFixo,
} from '@/domain/despesas'
import * as despesasApi from '@/services/despesasService'
import { hojeISO, reais } from '@/utils/formato'
import { prepararImagem } from '@/utils/imagem'

/**
 * O formulario de envio — um so para as tres categorias.
 *
 * Os campos mudam com a categoria, e a ORDEM tambem, porque e a ordem
 * em que a pessoa pensa em cada caso:
 *
 *   despesa   data · cliente/obra · tipo · (justificativa) · valor · comprovante · observacao
 *   refeicao  data · cliente/obra · tipo · valor (fixo) · observacao
 *   bonus     data · tipo · cliente/obra · valor · observacao
 *
 * Nas tres, o cliente e obrigatorio e a obra e opcional.
 *
 * A tela confere tudo antes de enviar, para o recado aparecer no campo
 * na hora. Mas quem MANDA e a API: ela confere de novo, e quando recusa
 * diz o campo (`erro.campo`), que acende aqui do mesmo jeito.
 */

const VAZIO = {
  data: '',
  clienteId: '',
  obraId: '',
  tipo: '',
  centavos: null,
  justificativa: '',
  observacao: '',
}

/* Foto acima disto e reduzida antes de sair: comprovante de celular
   tem 3-6 MB e o teto e 3. Com 2000px de lado o recibo continua
   legivel, e o arquivo cai para algumas centenas de KB. */
const REDUZIR_ACIMA_DE = 1.5 * 1024 * 1024
const LADO_DO_COMPROVANTE = 2000

const tamanhoLegivel = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Bytes de verdade de um data URL (o base64 pesa um terco a mais). */
function bytesDoDataUrl(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] ?? ''
  const sobra = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - sobra
}

function lerArquivo(arquivo) {
  return new Promise((resolver, recusar) => {
    const leitor = new FileReader()
    leitor.onload = () => resolver(leitor.result)
    leitor.onerror = () => recusar(new Error('Não foi possível ler este arquivo. Tente de novo.'))
    leitor.readAsDataURL(arquivo)
  })
}

/**
 * O arquivo pronto para o envio: { nome, tipo, tamanho, conteudo }.
 * Lanca Error com o recado quando o arquivo nao serve.
 */
async function prepararComprovante(arquivo) {
  if (!anexoAceito(arquivo.name)) {
    throw new Error('Tipo de arquivo não aceito. Envie imagem, PDF, ZIP, RAR, 7Z ou documento (Word, Excel, TXT, CSV, XML).')
  }

  const reduzivel = /^image\/(jpeg|png|webp)$/.test(arquivo.type)
  if (reduzivel && arquivo.size > REDUZIR_ACIMA_DE) {
    try {
      const conteudo = await prepararImagem(arquivo, { lado: LADO_DO_COMPROVANTE })
      const tamanho = bytesDoDataUrl(conteudo)
      if (tamanho <= ANEXO_BYTES_MAXIMOS) {
        const virouJpeg = conteudo.startsWith('data:image/jpeg')
        return {
          nome: virouJpeg ? arquivo.name.replace(/\.[^.]+$/, '.jpg') : arquivo.name,
          tipo: virouJpeg ? 'image/jpeg' : arquivo.type,
          tamanho,
          conteudo,
        }
      }
    } catch {
      /* nao deu para reduzir: segue com o original, se ele couber */
    }
  }

  if (arquivo.size > ANEXO_BYTES_MAXIMOS) {
    throw new Error(`"${arquivo.name}" tem ${tamanhoLegivel(arquivo.size)}. O limite é 3 MB por comprovante.`)
  }
  if (arquivo.size === 0) throw new Error('O arquivo está vazio.')

  return {
    nome: arquivo.name,
    tipo: arquivo.type || 'application/octet-stream',
    tamanho: arquivo.size,
    conteudo: await lerArquivo(arquivo),
  }
}

/** '1042/2026 — Troca do quadro geral (concluída)' */
function rotuloDaObra(obra) {
  const proposta = String(obra.proposta ?? '').trim() || 'Sem nº de proposta'
  const descricao = String(obra.descricao ?? '').trim()
  const curta = descricao.length > 48 ? `${descricao.slice(0, 47)}…` : descricao
  return `${proposta}${curta ? ` — ${curta}` : ''}${obra.concluidaEm ? ' (concluída)' : ''}`
}

export default function ModalEnvio({ categoria, aoFechar, aoEnviado }) {
  const { clientes, obras, recarregar } = useDados()
  const aberto = Boolean(categoria)
  const config = CATEGORIAS[categoria] ?? null

  const [form, setForm] = useState(VAZIO)
  const [anexo, setAnexo] = useState(null)
  const [preparando, setPreparando] = useState(false)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)

  /* abriu: comeca limpo, com a data de hoje */
  useEffect(() => {
    if (!aberto) return
    setForm({ ...VAZIO, data: hojeISO() })
    setAnexo(null)
    setErros({})
    setPreparando(false)
  }, [aberto, categoria])

  /* ---- cliente e obra ----

     O CLIENTE e obrigatorio; a OBRA e opcional ("Nenhuma" e uma
     resposta valida). A escolha e em dois passos porque uma lista
     unica com todas as obras de todos os clientes seria longa demais
     para achar alguma coisa: primeiro o cliente, depois, se for o
     caso, uma das obras dele.

     As obras em andamento vem primeiro; as concluidas continuam na
     lista (a despesa da semana passada pode ser de uma obra que
     fechou ontem), marcadas. */
  const obrasPorCliente = useMemo(() => {
    const mapa = new Map()
    obras.forEach((o) => {
      const lista = mapa.get(String(o.clienteId)) ?? []
      lista.push(o)
      mapa.set(String(o.clienteId), lista)
    })
    mapa.forEach((lista) =>
      lista.sort((a, b) => {
        if (Boolean(a.concluidaEm) !== Boolean(b.concluidaEm)) return a.concluidaEm ? 1 : -1
        return String(b.criadoEm ?? '').localeCompare(String(a.criadoEm ?? ''))
      }),
    )
    return mapa
  }, [obras])

  const opcoesCliente = useMemo(
    () => clientes.map((c) => ({ valor: String(c.id), rotulo: c.nome })),
    [clientes],
  )

  const obrasDoCliente = obrasPorCliente.get(String(form.clienteId)) ?? []
  /* "Nenhuma" e a primeira opcao — e a que vem escolhida ao trocar de
     cliente: obra so entra no envio quando a pessoa escolhe uma */
  const opcoesObra = form.clienteId
    ? [
        { valor: '', rotulo: 'Nenhuma' },
        ...obrasDoCliente.map((o) => ({ valor: String(o.id), rotulo: rotuloDaObra(o) })),
      ]
    : []

  const mudar = (campo) => (evento) => {
    const valor = evento?.target ? evento.target.value : evento
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined, geral: undefined }))
  }

  const escolherCliente = (clienteId) => {
    setForm((atual) => ({ ...atual, clienteId, obraId: '' }))
    setErros((atual) => ({ ...atual, clienteId: undefined, obraId: undefined, geral: undefined }))
  }

  /* ---- valor ---- */
  const fixo = categoria === 'refeicao' ? (valorFixo(form.tipo) ?? valorFixo('almoco')) : valorFixo(form.tipo)
  const travado = fixo !== null
  const centavos = travado ? Math.round(fixo * 100) : form.centavos

  /* ---- comprovante ---- */
  const escolherArquivo = async (arquivo) => {
    setErros((atual) => ({ ...atual, anexo: undefined, geral: undefined }))
    setPreparando(true)
    setAnexo({ nome: arquivo.name, tamanho: arquivo.size })
    try {
      setAnexo(await prepararComprovante(arquivo))
    } catch (e) {
      setAnexo(null)
      setErros((atual) => ({ ...atual, anexo: e.message }))
    } finally {
      setPreparando(false)
    }
  }

  /* ---- enviar ---- */
  const conferir = () => {
    const novos = {}
    if (!form.data) novos.data = 'Informe a data.'
    else if (form.data > hojeISO()) novos.data = 'A data não pode ser no futuro.'

    if (!form.clienteId) novos.clienteId = 'Escolha o cliente.'

    if (!form.tipo) {
      novos.tipo = {
        despesa: 'Escolha o tipo de despesa.',
        refeicao: 'Escolha o tipo de refeição.',
        bonus: 'Escolha o tipo de bônus.',
      }[categoria]
    }

    if (!travado) {
      if (!centavos) novos.valor = 'Informe o valor.'
      else if (centavos / 100 > VALOR_MAXIMO) novos.valor = `O limite é ${reais(VALOR_MAXIMO)} por envio.`
    }

    if (categoria === 'despesa' && !anexo?.conteudo) novos.anexo = 'Anexe o comprovante da despesa.'
    return novos
  }

  const enviar = async (evento) => {
    evento.preventDefault()
    if (preparando || salvando) return

    const novos = conferir()
    if (Object.keys(novos).length > 0) {
      setErros(novos)
      return
    }

    setSalvando(true)
    setErros({})
    try {
      const resposta = await despesasApi.enviar({
        categoria,
        tipo: form.tipo,
        data: form.data,
        clienteId: form.clienteId,
        obraId: form.obraId || undefined,
        /* valor fixo nao vai: quem grava o fixo e o servidor */
        valor: travado ? undefined : (centavos / 100).toFixed(2),
        justificativa: form.tipo === 'outros' ? form.justificativa.trim() : undefined,
        observacao: form.observacao.trim(),
        anexo: categoria === 'despesa' ? anexo : undefined,
      })
      aoEnviado?.({ categoria, tipo: form.tipo, data: form.data, valor: resposta.valor })
      aoFechar()
    } catch (e) {
      /* o servidor diz o campo quando sabe; sem campo, o recado vai
         para o rodape do formulario */
      setErros(e.campo && e.campo !== 'categoria' ? { [e.campo]: e.message } : { geral: e.message })
      /* o cliente ou a obra sumiu enquanto o formulario estava aberto:
         as listas sao relidas, para ele sair das opcoes */
      if (e.campo === 'obraId' || e.campo === 'clienteId') recarregar()
    } finally {
      setSalvando(false)
    }
  }

  if (!config) return null

  const campoData = (
    <CampoTexto
      key="data"
      rotulo={categoria === 'refeicao' ? 'Data da refeição' : categoria === 'bonus' ? 'Data do bônus' : 'Data da despesa'}
      type="date"
      max={hojeISO()}
      value={form.data}
      onChange={mudar('data')}
      erro={erros.data}
      required
    />
  )

  const notaDeErro = (recado) =>
    recado && (
      <span className="campo__nota campo__nota--erro" role="alert">
        {recado}
      </span>
    )

  /* cliente e obra dividem a linha; no celular, um embaixo do outro */
  const campoObra =
    opcoesCliente.length === 0 ? (
      <div key="obra" className="campo">
        <span className="campo__rotulo">Cliente</span>
        <p className="formdesp__aviso">Nenhum cliente cadastrado ainda. Os envios são lançados para um cliente.</p>
      </div>
    ) : (
      <div key="obra" className="formdesp__par">
        <div className={`campo ${erros.clienteId ? 'has-erro' : ''}`.trim()}>
          <span className="campo__rotulo">Cliente</span>
          <Seletor
            largo
            valor={form.clienteId}
            aoMudar={escolherCliente}
            opcoes={opcoesCliente}
            vazio="Escolha o cliente..."
            aria-label="Cliente"
          />
          {notaDeErro(erros.clienteId)}
        </div>
        <div className={`campo ${erros.obraId ? 'has-erro' : ''}`.trim()}>
          <span className="campo__rotulo">Obra (opcional)</span>
          <Seletor
            largo
            valor={form.obraId}
            aoMudar={(v) => mudar('obraId')(v)}
            opcoes={opcoesObra}
            vazio="Primeiro o cliente"
            desabilitado={!form.clienteId}
            aria-label="Obra (opcional)"
          />
          {notaDeErro(erros.obraId)}
        </div>
      </div>
    )

  const campoTipo = (
    <CampoSelecao
      key="tipo"
      rotulo={
        categoria === 'refeicao' ? 'Tipo de refeição' : categoria === 'bonus' ? 'Tipo de bônus' : 'Tipo de despesa'
      }
      value={form.tipo}
      onChange={mudar('tipo')}
      erro={erros.tipo}
      vazio="Escolha o tipo..."
      opcoes={tiposDa(categoria).map((t) => ({ valor: t.chave, rotulo: t.rotulo }))}
    />
  )

  const campoJustificativa =
    categoria === 'despesa' && form.tipo === 'outros' ? (
      <CampoArea
        key="justificativa"
        rotulo="Justificativa (opcional)"
        linhas={2}
        maxLength={JUSTIFICATIVA_MAXIMA}
        placeholder="Que gasto foi esse?"
        value={form.justificativa}
        onChange={mudar('justificativa')}
        erro={erros.justificativa}
      />
    ) : null

  const campoValor = (
    <CampoDinheiro
      key="valor"
      rotulo={rotuloDoValor(categoria, form.tipo)}
      centavos={centavos}
      aoMudar={(novo) => {
        setForm((atual) => ({ ...atual, centavos: novo }))
        setErros((atual) => ({ ...atual, valor: undefined, geral: undefined }))
      }}
      travado={travado}
      erro={erros.valor}
    />
  )

  const campoAnexo =
    categoria === 'despesa' ? (
      <CampoArquivo
        key="anexo"
        rotulo="Anexo (comprovante)"
        arquivo={anexo}
        aceita={ANEXO_ACEITA}
        ocupado={preparando}
        aoEscolher={escolherArquivo}
        aoRemover={() => setAnexo(null)}
        erro={erros.anexo}
        dica="Imagem, PDF, ZIP ou documento, até 3 MB. Foto grande é reduzida automaticamente."
      />
    ) : null

  const campoObservacao = (
    <CampoArea
      key="observacao"
      rotulo="Observação (opcional)"
      linhas={2}
      maxLength={OBSERVACAO_MAXIMA}
      value={form.observacao}
      onChange={mudar('observacao')}
      erro={erros.observacao}
    />
  )

  const campos = {
    despesa: [campoData, campoObra, campoTipo, campoJustificativa, campoValor, campoAnexo, campoObservacao],
    refeicao: [campoData, campoObra, campoTipo, campoValor, campoObservacao],
    bonus: [campoData, campoTipo, campoObra, campoValor, campoObservacao],
  }[categoria]

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={config.enviar} largura={520}>
      <form className="formdesp" onSubmit={enviar} noValidate>
        {campos}

        {erros.geral && (
          <p className="formdesp__erro" role="alert">
            {erros.geral}
          </p>
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={salvando} disabled={preparando || opcoesCliente.length === 0}>
            Enviar
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
