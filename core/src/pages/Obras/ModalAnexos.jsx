import { useMemo, useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import { useDados } from '@/context/DadosContext'
import { useAuth } from '@/context/AuthContext'
import { chaveDoCargo } from '@/domain/obras'
import { dataHora } from '@/utils/formato'
import './ModalAnexos.css'

/**
 * Documentos da obra.
 *
 * O arquivo e guardado no banco como data URL, igual a foto de perfil.
 * Por isso o teto de 4 MB por arquivo: acima disso o JSON nao passa no
 * limite da API.
 *
 * A lista que chega com o quadro traz so nome, tipo e tamanho — o
 * arquivo em si so e buscado no clique de abrir. Sem isso, cada
 * carregamento do sistema arrastaria todos os documentos de todas as
 * obras junto.
 *
 * `somenteLeitura` e a obra CONCLUIDA. Os documentos continuam ali e
 * continuam BAIXAVEIS — e para isso que se guarda documento de obra —,
 * so somem o "Anexar" e o excluir. Baixar nao muda nada; os outros dois
 * mudariam o registro de uma obra ja fechada.
 */

const BYTES_MAXIMOS = 4 * 1024 * 1024

const Icone = {
  mais: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  papel: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V8z" />
      <path d="M13.5 3v5h5" />
    </svg>
  ),
  baixar: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
    </svg>
  ),
  lixo: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 7h15M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </svg>
  ),
}

const tamanhoLegivel = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function lerArquivo(arquivo) {
  return new Promise((resolver, recusar) => {
    const leitor = new FileReader()
    leitor.onload = () => resolver(leitor.result)
    leitor.onerror = () => recusar(new Error('Não foi possível ler este arquivo.'))
    leitor.readAsDataURL(arquivo)
  })
}

export default function ModalAnexos({ aberto, obra, somenteLeitura = false, aoFechar }) {
  const { user } = useAuth()
  const {
    adicionarAnexo,
    baixarAnexo,
    removerAnexo,
    pode,
    cargos,
    pessoaPorId,
    corDoCargo,
    nomeDoCargo,
  } = useDados()

  const entrada = useRef(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [apagando, setApagando] = useState(null)

  const podeMexer = !somenteLeitura && pode('editar_obras')
  const anexos = obra?.anexos ?? []

  /* ---- Os documentos, por SETOR ----

     O setor de um anexo e o de QUEM O ENVIOU. Sai do carimbo de
     autoria que ja existia (`enviadoPor`), e nao de uma coluna nova:
     dois campos dizendo a mesma coisa acabam divergindo.

     Entram na lista os setores que tem documento, mais o SEU — mesmo
     vazio, porque e nele que fica o botao de anexar. Os cinco setores
     da empresa em toda obra dariam quatro secoes vazias so para
     mostrar que estao vazias. */
  const meuSetor = chaveDoCargo(user)

  const secoes = useMemo(() => {
    const porSetor = new Map()
    if (meuSetor) porSetor.set(meuSetor, [])

    anexos.forEach((a) => {
      const chave = chaveDoCargo(pessoaPorId(a.enviadoPor)) ?? 'sem-setor'
      if (!porSetor.has(chave)) porSetor.set(chave, [])
      porSetor.get(chave).push(a)
    })

    const ordem = cargos.map((c) => c.chave)
    return [...porSetor.entries()]
      .map(([chave, itens]) => ({
        chave,
        rotulo: chave === 'sem-setor' ? 'Sem setor' : nomeDoCargo(chave),
        cor: chave === 'sem-setor' ? 'var(--text-faint)' : corDoCargo(chave),
        meu: chave === meuSetor,
        itens: [...itens].sort((a, b) =>
          String(b.enviadoEm ?? '').localeCompare(String(a.enviadoEm ?? '')),
        ),
      }))
      /* o seu setor na frente — e o unico em que ha o que fazer —, e o
         resto na ordem da configuracao da empresa */
      .sort((a, b) => {
        if (a.meu !== b.meu) return Number(b.meu) - Number(a.meu)
        return ordem.indexOf(a.chave) - ordem.indexOf(b.chave)
      })
  }, [anexos, meuSetor, cargos, pessoaPorId, corDoCargo, nomeDoCargo])

  const escolher = async (evento) => {
    const arquivos = [...(evento.target.files ?? [])]
    evento.target.value = ''
    if (arquivos.length === 0) return

    const grande = arquivos.find((a) => a.size > BYTES_MAXIMOS)
    if (grande) {
      setErro(`"${grande.name}" tem ${tamanhoLegivel(grande.size)}. O limite é 4 MB por arquivo.`)
      return
    }

    setEnviando(true)
    setErro('')
    try {
      /* um de cada vez: mandar tudo junto estouraria o corpo da
         requisicao quando alguem escolhe cinco PDFs de uma vez */
      for (const arquivo of arquivos) {
        await adicionarAnexo(obra.id, {
          nome: arquivo.name,
          tipo: arquivo.type || 'application/octet-stream',
          tamanho: arquivo.size,
          conteudo: await lerArquivo(arquivo),
        })
      }
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const abrir = async (anexo) => {
    setErro('')
    try {
      const { conteudo, nome } = await baixarAnexo(anexo.id)
      const link = document.createElement('a')
      link.href = conteudo
      link.download = nome
      link.click()
    } catch (e) {
      setErro(e.message)
    }
  }

  const excluir = async (anexo) => {
    try {
      await removerAnexo(anexo.id)
      setApagando(null)
    } catch (e) {
      setErro(e.message)
    }
  }

  if (!obra) return null

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Anexos da obra"
      largura={520}
    >
      <div className="anexos">
        {/* a entrada de arquivo e uma so, escondida: quem a dispara e o
            botao da secao do seu setor */}
        <input
          ref={entrada}
          type="file"
          multiple
          className="sr-only"
          onChange={escolher}
          tabIndex={-1}
        />

        {erro && (
          <p className="anexos__erro" role="alert">
            {erro}
          </p>
        )}

        {secoes.map((secao) => (
          <section
            key={secao.chave}
            className="anexos__setor"
            data-meu={secao.meu ? 'sim' : undefined}
            style={{ '--setor-cor': secao.cor }}
          >
            <header className="anexos__setortopo">
              <span className="anexos__setornome">{secao.rotulo}</span>

              {/* Anexar so no SEU setor. Nos outros nao ha botao nenhum —
                  um botao desabilitado por setor encheria a caixa de
                  acoes que ninguem pode usar. */}
              {secao.meu && podeMexer ? (
                <button
                  type="button"
                  className="anexos__novo"
                  onClick={() => entrada.current?.click()}
                  disabled={enviando}
                >
                  <Icone.mais />
                  {enviando ? 'Enviando...' : 'Anexar'}
                </button>
              ) : (
                <span className="anexos__conta">{secao.itens.length}</span>
              )}
            </header>

            {secao.itens.length === 0 ? (
              <p className="anexos__vazio">
                {secao.meu
                  ? 'Nenhum documento do seu setor nesta obra ainda.'
                  : 'Nenhum documento deste setor.'}
              </p>
            ) : (
              <ul className="anexos__lista">
                {secao.itens.map((a) => (
                  <li key={a.id}>
                    <span className="anexos__icone" aria-hidden="true">
                      <Icone.papel />
                    </span>

                    <span className="anexos__quem">
                      <strong>{a.nome}</strong>
                      <span>
                        {tamanhoLegivel(a.tamanho)} · {a.autorNome} · {dataHora(a.enviadoEm)}
                      </span>
                    </span>

                    {/* baixar vale em QUALQUER setor: e para isso que o
                        documento esta guardado na obra e nao na pasta de
                        alguem */}
                    <button
                      type="button"
                      className="anexos__acao"
                      onClick={() => abrir(a)}
                      title="Baixar"
                      aria-label={`Baixar ${a.nome}`}
                    >
                      <Icone.baixar />
                    </button>

                    {/* apaga quem pode editar a obra, ou quem enviou o
                        arquivo — e ninguem, se a obra ja foi concluida */}
                    {!somenteLeitura &&
                      (podeMexer || String(a.enviadoPor) === String(user?.id)) &&
                      (apagando === a.id ? (
                        <button
                          type="button"
                          className="anexos__acao anexos__acao--confirma"
                          onClick={() => excluir(a)}
                        >
                          Confirmar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="anexos__acao anexos__acao--perigo"
                          onClick={() => setApagando(a.id)}
                          title="Excluir"
                          aria-label={`Excluir ${a.nome}`}
                        >
                          <Icone.lixo />
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {secoes.length === 0 && (
          <p className="anexos__vazio">
            {somenteLeitura
              ? 'Esta obra foi concluída sem nenhum documento anexado.'
              : 'Nenhum documento anexado ainda.'}
          </p>
        )}
      </div>
    </Modal>
  )
}
