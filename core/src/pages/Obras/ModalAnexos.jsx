import { useMemo, useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoTexto } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import { useAuth } from '@/context/AuthContext'
import { LINK_MAXIMO, NOME_MAXIMO, ehLink, linkValido, nomeDoLink, servicoDoLink } from '@/domain/anexos'
import { chaveDoCargo } from '@/domain/obras'
import { dataHora } from '@/utils/formato'
import { BYTES_MAXIMOS, lerArquivo, salvarArquivo, tamanhoLegivel } from './arquivos'
import './ModalAnexos.css'

/**
 * Documentos da obra.
 *
 * O arquivo e guardado no banco como data URL, com teto de 4 MB por
 * arquivo (ver ./arquivos.js). Ou o anexo e um LINK para o documento
 * que mora em outra nuvem — Google Drive, OneDrive —, e no banco fica
 * so o endereco (ver @/domain/anexos). O "Anexar" pergunta qual dos dois.
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
  link: () => (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
    </svg>
  ),
  abrir: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
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
  /* o "Anexar": null (fechado), 'escolha' (arquivo ou link?) ou 'link' */
  const [anexando, setAnexando] = useState(null)
  const [link, setLink] = useState('')
  const [nomeLink, setNomeLink] = useState('')

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

  const fecharAnexar = () => {
    setAnexando(null)
    setLink('')
    setNomeLink('')
  }

  const fechar = () => {
    fecharAnexar()
    setErro('')
    aoFechar()
  }

  /* o link no lugar do arquivo: so o endereco vai para o banco */
  const anexarLink = async (evento) => {
    evento.preventDefault()
    const endereco = linkValido(link)
    if (!endereco) {
      setErro('Esse link não parece certo. Copie o endereço inteiro, começando por https://.')
      return
    }
    setEnviando(true)
    setErro('')
    try {
      await adicionarAnexo(obra.id, { link: endereco, nome: nomeLink.trim() })
      fecharAnexar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

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
      salvarArquivo(conteudo, nome)
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
      aoFechar={fechar}
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
                  onClick={() => (anexando ? fecharAnexar() : setAnexando('escolha'))}
                  disabled={enviando}
                  aria-expanded={Boolean(anexando)}
                >
                  <Icone.mais />
                  {enviando ? 'Enviando...' : 'Anexar'}
                </button>
              ) : (
                <span className="anexos__conta">{secao.itens.length}</span>
              )}
            </header>

            {/* o que anexar: o arquivo do computador ou o link de onde
                ele ja esta guardado (Drive, OneDrive) */}
            {secao.meu && podeMexer && anexando === 'escolha' && (
              <div className="anexos__escolha">
                <button
                  type="button"
                  className="anexos__tipo"
                  onClick={() => {
                    fecharAnexar()
                    entrada.current?.click()
                  }}
                >
                  <span className="anexos__icone" aria-hidden="true">
                    <Icone.papel />
                  </span>
                  <span>
                    <strong>Arquivo</strong>
                    <small>Do computador, até 4 MB</small>
                  </span>
                </button>
                <button type="button" className="anexos__tipo" onClick={() => setAnexando('link')}>
                  <span className="anexos__icone" aria-hidden="true">
                    <Icone.link />
                  </span>
                  <span>
                    <strong>Link</strong>
                    <small>Google Drive, OneDrive...</small>
                  </span>
                </button>
              </div>
            )}

            {secao.meu && podeMexer && anexando === 'link' && (
              <form className="anexos__linkform" onSubmit={anexarLink} noValidate>
                <CampoTexto
                  rotulo="Link"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://drive.google.com/..."
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  maxLength={LINK_MAXIMO}
                  autoFocus
                />
                <CampoTexto
                  rotulo="Nome (opcional)"
                  placeholder={linkValido(link) ? nomeDoLink(linkValido(link)) : 'Ex.: Projeto executivo'}
                  value={nomeLink}
                  onChange={(e) => setNomeLink(e.target.value)}
                  maxLength={NOME_MAXIMO}
                />
                <div className="anexos__linkbotoes">
                  <Button variant="ghost" onClick={fecharAnexar} disabled={enviando}>
                    Cancelar
                  </Button>
                  <Button type="submit" loading={enviando} disabled={!link.trim()}>
                    Anexar link
                  </Button>
                </div>
              </form>
            )}

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
                      {ehLink(a) ? <Icone.link /> : <Icone.papel />}
                    </span>

                    <span className="anexos__quem">
                      <strong>{a.nome}</strong>
                      <span>
                        {[ehLink(a) ? servicoDoLink(a.link) : tamanhoLegivel(a.tamanho), a.autorNome, dataHora(a.enviadoEm)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>

                    {/* baixar vale em QUALQUER setor: e para isso que o
                        documento esta guardado na obra e nao na pasta de
                        alguem. O link abre numa aba nova, na nuvem dele. */}
                    {ehLink(a) ? (
                      linkValido(a.link) && (
                        <a
                          className="anexos__acao"
                          href={linkValido(a.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir"
                          aria-label={`Abrir ${a.nome}`}
                        >
                          <Icone.abrir />
                        </a>
                      )
                    ) : (
                      <button
                        type="button"
                        className="anexos__acao"
                        onClick={() => abrir(a)}
                        title="Baixar"
                        aria-label={`Baixar ${a.nome}`}
                      >
                        <Icone.baixar />
                      </button>
                    )}

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
