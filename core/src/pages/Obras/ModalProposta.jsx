import { useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoTexto } from '@/components/Campo/Campo'
import { LINK_MAXIMO, ehLink, linkValido, servicoDoLink } from '@/domain/anexos'
import { nomeDaProposta } from '@/domain/obras'
import { dataHora } from '@/utils/formato'
import { BYTES_MAXIMOS, tamanhoLegivel } from './arquivos'
import './ModalAnexos.css'
import './ModalProposta.css'

const IconePapel = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.5 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V8z" />
    <path d="M13.5 3v5h5" />
  </svg>
)

const IconeLink = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
  </svg>
)

const IconeAbrir = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </svg>
)

const IconeBaixar = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
  </svg>
)

/**
 * A "Proposta tecnica" da 1a etapa: o check que pede o documento.
 *
 * Anexar e o que marca o check — e o mesmo arquivo entra nos Anexos da
 * obra (quem grava e o ObraDetalhe, em `aoAnexar`). Check ja marcado
 * abre aqui de novo para baixar o documento, trocar por outro ou
 * desmarcar; desmarcar nao apaga o documento, que continua nos Anexos —
 * e a obra que ja tem a proposta anexada marca de novo com ela mesma
 * (`aoMarcar`), sem precisar enviar o arquivo outra vez.
 *
 * Quem nao e do setor do check (`podeMarcar` false) so ve e baixa.
 *
 * No lugar do arquivo vale um LINK (Google Drive, OneDrive): no banco
 * fica so o endereco, e o documento continua na nuvem de onde veio
 * (ver @/domain/anexos). `aoAnexar` recebe { arquivo } ou { link }.
 */
export default function ModalProposta({
  aberto,
  check,
  nomeCard,
  anexo = null,
  marcado = false,
  podeMarcar = false,
  podeAnexar = false,
  aoAnexar,
  aoMarcar,
  aoBaixar,
  aoDesmarcar,
  aoFechar,
}) {
  const entrada = useRef(null)
  const [escolhido, setEscolhido] = useState(null)
  /* o link no lugar do arquivo: null = escolhendo arquivo */
  const [link, setLink] = useState(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (!check) return null

  const fechar = () => {
    setEscolhido(null)
    setLink(null)
    setErro('')
    aoFechar()
  }

  const escolher = (evento) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivo) return
    if (arquivo.size > BYTES_MAXIMOS) {
      setErro(`"${arquivo.name}" tem ${tamanhoLegivel(arquivo.size)}. O limite é 4 MB por arquivo.`)
      return
    }
    setErro('')
    setLink(null)
    setEscolhido(arquivo)
  }

  const enviar = async () => {
    const endereco = link === null ? null : linkValido(link)
    if (link !== null && !endereco) {
      setErro('Esse link não parece certo. Copie o endereço inteiro, começando por https://.')
      return
    }
    if (!escolhido && !endereco) return
    setEnviando(true)
    setErro('')
    try {
      await aoAnexar(endereco ? { link: endereco } : { arquivo: escolhido })
      fechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const baixar = async () => {
    setErro('')
    try {
      await aoBaixar(anexo)
    } catch (e) {
      setErro(e.message)
    }
  }

  const anexa = podeMarcar && podeAnexar
  /* desmarcado, mas com a proposta ja nos Anexos: marca com ela */
  const marcaComAtual = podeMarcar && !marcado && Boolean(anexo) && !escolhido && link === null

  return (
    <Modal aberto={aberto} aoFechar={fechar} titulo={check.titulo} subtitulo={nomeCard} largura={460}>
      <div className="proposta">
        <p className="proposta__texto">
          {marcado
            ? 'Proposta técnica anexada.'
            : anexo && podeMarcar
              ? 'A proposta técnica já está nos Anexos da obra. Marque o check com ela ou envie outra versão.'
              : anexa
              ? 'Anexe o documento da proposta técnica (ou o link dele) para marcar este check.'
              : 'Este check é marcado anexando o documento da proposta técnica.'}
        </p>

        {anexo && (
          <div className="proposta__atual">
            <span className="anexos__icone" aria-hidden="true">
              {ehLink(anexo) ? <IconeLink /> : <IconePapel />}
            </span>
            <span className="anexos__quem">
              <strong>{nomeDaProposta(anexo)}</strong>
              <span>
                {[ehLink(anexo) ? servicoDoLink(anexo.link) : tamanhoLegivel(anexo.tamanho), anexo.autorNome, dataHora(anexo.enviadoEm)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            {ehLink(anexo) ? (
              linkValido(anexo.link) && (
                <a
                  className="anexos__acao"
                  href={linkValido(anexo.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir"
                  aria-label={`Abrir ${nomeDaProposta(anexo)}`}
                >
                  <IconeAbrir />
                </a>
              )
            ) : (
              <button
                type="button"
                className="anexos__acao"
                onClick={baixar}
                title="Baixar"
                aria-label={`Baixar ${nomeDaProposta(anexo)}`}
              >
                <IconeBaixar />
              </button>
            )}
          </div>
        )}

        {anexa && (
          <>
            <input ref={entrada} type="file" className="sr-only" onChange={escolher} tabIndex={-1} />
            {escolhido ? (
              <div className="proposta__escolhido">
                <span className="anexos__icone" aria-hidden="true">
                  <IconePapel />
                </span>
                <span className="anexos__quem">
                  <strong>{escolhido.name}</strong>
                  <span>{tamanhoLegivel(escolhido.size)} · pronto para anexar</span>
                </span>
                <button
                  type="button"
                  className="proposta__trocar"
                  onClick={() => entrada.current?.click()}
                  disabled={enviando}
                >
                  Trocar
                </button>
              </div>
            ) : link !== null ? (
              <div className="proposta__link">
                <CampoTexto
                  rotulo="Link da proposta"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://drive.google.com/..."
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  maxLength={LINK_MAXIMO}
                  autoFocus
                />
                <button
                  type="button"
                  className="proposta__trocar"
                  onClick={() => {
                    setLink(null)
                    setErro('')
                  }}
                  disabled={enviando}
                >
                  Usar um arquivo
                </button>
              </div>
            ) : (
              /* o arquivo do computador, ou o link de onde ele ja esta */
              <div className="proposta__escolha">
                <button type="button" className="anexos__novo" onClick={() => entrada.current?.click()}>
                  <IconePapel />
                  {anexo ? 'Enviar outra versão' : 'Escolher arquivo'}
                </button>
                <button type="button" className="anexos__novo" onClick={() => setLink('')}>
                  <IconeLink />
                  Colar um link
                </button>
              </div>
            )}
          </>
        )}

        {erro && (
          <p className="anexos__erro" role="alert">
            {erro}
          </p>
        )}

        {podeMarcar && !podeAnexar && (
          <p className="proposta__aviso">
            Anexar documentos na obra pede a permissão de editar obras. Fale com quem administra os
            acessos do sistema.
          </p>
        )}
        {!podeMarcar && <p className="proposta__aviso">Só o setor deste check anexa a proposta técnica.</p>}

        <p className="proposta__nota">O documento também fica salvo nos Anexos da obra.</p>

        {(anexa || marcaComAtual || (marcado && podeMarcar)) && (
          <footer className="proposta__rodape">
            {marcado && podeMarcar ? (
              <button
                type="button"
                className="proposta__desmarcar"
                onClick={() => {
                  aoDesmarcar()
                  fechar()
                }}
              >
                Desmarcar o check
              </button>
            ) : (
              <span />
            )}
            {marcaComAtual ? (
              <Button
                onClick={() => {
                  aoMarcar()
                  fechar()
                }}
              >
                Marcar com este documento
              </Button>
            ) : (
              anexa && (
                <Button onClick={enviar} loading={enviando} disabled={!escolhido && !link?.trim()}>
                  {marcado ? 'Anexar nova versão' : 'Anexar e marcar'}
                </Button>
              )
            )}
          </footer>
        )}
      </div>
    </Modal>
  )
}
