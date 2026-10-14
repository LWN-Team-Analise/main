import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Estrelas from '@/components/Estrelas/Estrelas'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoArea } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import { tituloDaObra } from '@/domain/obras'
import useCorDaLogo from '@/hooks/useCorDaLogo'
import { dataBR, dataHora } from '@/utils/formato'

/** 'AAAA-MM-DD' de um carimbo ISO — o que `dataBR` sabe ler. */
const soDia = (valor) => (valor ? String(valor).slice(0, 10) : null)
import './Avaliacoes.css'

const FILTROS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'sem', rotulo: 'Sem avaliação' },
  { valor: 'com', rotulo: 'Avaliadas' },
]

/* A escala. Cinco degraus, um por estrela — antes ia ate 10 e a
   estrela valia dois pontos, o que obrigava a traduzir "8" para "quatro
   estrelas" de cabeca a cada leitura. O banco aceita ate 10, entao a
   faixa nova cabe na antiga sem migracao; as notas velhas continuam
   gravadas como estao e aparecem no teto das cinco estrelas. */
const NOTA_MAXIMA = 5

const Mais = ({ tamanho = 15 }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const Lixo = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 7h15M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </svg>
)

/**
 * Avaliacao por OBRA.
 *
 * A obra pode ter mais de uma nota — a do diretor e a do cliente sao as
 * de sempre, e o + acrescenta outras. A MEDIA delas e a nota da obra, e
 * e ela que entra na media de cada pessoa que participou.
 *
 * O card e enxuto de proposito: empresa, tipo de obra, a nota e os
 * rostos de quem participou. O resto (descricao, datas, cada nota
 * separada) abre no clique.
 */
export default function Avaliacoes() {
  const { obras, clientePorId, pessoaPorId } = useDados()
  const [filtro, setFiltro] = useState('todas')
  const [abrindo, setAbrindo] = useState(null)

  const lista = useMemo(() => {
    const filtradas = obras.filter((o) => {
      if (filtro === 'sem') return !o.avaliacao
      if (filtro === 'com') return Boolean(o.avaliacao)
      return true
    })
    // sem avaliacao primeiro: sao as que pedem acao
    return [...filtradas].sort((a, b) => {
      if (Boolean(a.avaliacao) !== Boolean(b.avaliacao)) return a.avaliacao ? 1 : -1
      return String(b.criadoEm).localeCompare(String(a.criadoEm))
    })
  }, [obras, filtro])

  const avaliadas = obras.filter((o) => o.avaliacao)
  const media =
    avaliadas.length > 0
      ? avaliadas.reduce((soma, o) => soma + Number(o.avaliacao.nota), 0) / avaliadas.length
      : null

  return (
    <AppShell>
      <section className="avaliacoes">
        <header className="avaliacoes__topo">
          <h1 className="tela__titulo">Avaliações</h1>

          {media !== null && (
            <div className="avaliacoes__media">
              <span className="avaliacoes__medianum">{media.toFixed(1)}</span>
              <span className="avaliacoes__medialeg">
                média de {avaliadas.length} obra{avaliadas.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </header>

        <div className="avaliacoes__filtro">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              className={`chip ${filtro === f.valor ? 'is-atual' : ''}`.trim()}
              onClick={() => setFiltro(f.valor)}
            >
              {f.rotulo}
            </button>
          ))}
        </div>

        {lista.length === 0 ? (
          <p className="avaliacoes__vazio">Nenhuma obra nesta seleção.</p>
        ) : (
          <ul className="avaliacoes__grade">
            {lista.map((obra) => (
              <CardAvaliacao
                key={obra.id}
                obra={obra}
                cliente={clientePorId(obra.clienteId)}
                participantes={obra.membros.map(pessoaPorId).filter(Boolean)}
                aoAbrir={() => setAbrindo(obra.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <ModalAvaliar obraId={abrindo} aoFechar={() => setAbrindo(null)} />
    </AppShell>
  )
}

/**
 * O card da lista.
 *
 * Ele mostra a OBRA, e nao a empresa: a tela avalia obra, e o card que
 * so trazia a logo do cliente obrigava a abrir para saber qual das
 * cinco obras daquele cliente era.
 *
 * Saiu o cabecalho de imagem — uma faixa de 150px com a logo em cima
 * de cada card — e com ele a maior parte da altura. A logo continua,
 * pequena, ao lado do nome: ela identifica a empresa de relance sem
 * gastar meia tela por card.
 */
function CardAvaliacao({ obra, cliente, participantes, aoAbrir }) {
  const cor = useCorDaLogo(cliente?.logo, cliente?.nome)
  const nome = cliente?.nome ?? 'Cliente removido'

  return (
    <li>
      <article
        className={`avaobra ${obra.avaliacao ? 'is-avaliada' : ''}`.trim()}
        style={{ '--cor-empresa': cor }}
        role="button"
        tabIndex={0}
        onClick={aoAbrir}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault()
            aoAbrir()
          }
        }}
        aria-label={`Avaliação de ${tituloDaObra(obra, cliente)}`}
      >
        <header className="avaobra__topo">
          <Avatar nome={nome} foto={cliente?.logo} tamanho={30} quadrado />
          <span className="avaobra__quem">
            <strong className="avaobra__titulo">{tituloDaObra(obra, cliente)}</strong>
            <span className="avaobra__empresa">{nome}</span>
          </span>
          <span className="avaobra__selo" data-tipo={obra.tipo}>
            {obra.tipo === 'emergencia' ? 'emergência' : 'padrão'}
          </span>
        </header>

        {obra.descricao && <p className="avaobra__desc">{obra.descricao}</p>}

        <p className="avaobra__datas">
          <span>
            início <strong>{dataBR(obra.dataInicio) || '—'}</strong>
          </span>
          <span>
            conclusão <strong>{dataBR(soDia(obra.concluidaEm) ?? obra.dataConclusao) || '—'}</strong>
          </span>
        </p>

        <footer className="avaobra__base">
          {obra.avaliacao ? (
            <span className="avaobra__nota">
              <Estrelas nota={obra.avaliacao.nota} tamanho={14} />
              <strong>{Number(obra.avaliacao.nota).toFixed(1)}</strong>
              {obra.notas?.length > 1 && <em>de {obra.notas.length} notas</em>}
            </span>
          ) : (
            <span className="avaobra__sem">Sem avaliação</span>
          )}

          {participantes.length > 0 && (
            <span className="avaobra__avatares">
              {participantes.slice(0, 4).map((p) => (
                <Avatar key={p.id} nome={p.nome} foto={p.foto} tamanho={20} titulo={p.nome} />
              ))}
              {participantes.length > 4 && (
                <span className="avaobra__resto">+{participantes.length - 4}</span>
              )}
            </span>
          )}
        </footer>
      </article>
    </li>
  )
}

/**
 * Pop-up da avaliacao.
 *
 * Aqui aparece o que o card esconde: a descricao da obra, a data da
 * avaliacao e cada nota separada. O + acrescenta uma nota, e a lixeira
 * tira — a ultima nao sai: obra avaliada tem que ficar com ao menos
 * uma, e para zerar tudo existe o "Remover avaliação".
 */
function ModalAvaliar({ obraId, aoFechar }) {
  const {
    obraPorId,
    clientePorId,
    pessoaPorId,
    cargoPorChave,
    adicionarAvaliacao,
    atualizarAvaliacao,
    removerAvaliacao,
    limparAvaliacao,
    mediaDoUsuario,
    roteiroDaObra,
    rotuloEtapa,
    pode,
  } = useDados()

  const obra = obraId ? obraPorId(obraId) : null

  /* rascunho: o que esta na tela antes de gravar. Cada linha e
     { id?, rotulo, nota, descricao } — sem id = nota nova. */
  const [linhas, setLinhas] = useState([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const podeAvaliar = pode('editar_avaliacoes')

  /**
   * Uma linha por ETAPA do roteiro da obra, e todas obrigatorias.
   *
   * Antes eram duas linhas livres ("Diretor" e "Cliente") e bastava
   * uma nota para a obra ficar avaliada. So que a obra passa por
   * cinco setores, e uma nota so nao diz em qual deles ela travou —
   * a media saia de uma impressao geral, nao do caminho que a obra
   * fez. Com uma nota por etapa, a media continua sendo a nota da
   * obra e passa a ter de onde sair.
   *
   * Obra ja avaliada mantem as linhas que ela tem, com os rotulos
   * que ela tem: reescrever historico para caber no formato novo
   * apagaria avaliacao que alguem deu.
   */
  useEffect(() => {
    if (!obra) return

    if (obra.notas?.length > 0) {
      setLinhas(
        obra.notas.map((n) => ({
          id: n.id,
          rotulo: n.rotulo,
          nota: Number(n.nota) || 0,
          descricao: n.descricao ?? '',
          avaliadaEm: n.avaliadaEm,
          verDescricao: Boolean(n.descricao),
        })),
      )
    } else {
      const etapas = roteiroDaObra(obra)
      setLinhas(
        (etapas.length > 0 ? etapas : []).map((e) => ({
          rotulo: e.nome || rotuloEtapa(e.numero),
          nota: 0,
          descricao: '',
          verDescricao: false,
        })),
      )
    }
    setErro('')
  }, [obraId, obra, roteiroDaObra, rotuloEtapa])

  if (!obra) return null

  const cliente = clientePorId(obra.clienteId)
  const participantes = obra.membros.map(pessoaPorId).filter(Boolean)

  const mudar = (indice, campo) => (valor) =>
    setLinhas((atual) =>
      atual.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)),
    )

  /* uma linha a mais, fora do roteiro — para a nota do cliente ou da
     diretoria, que nao sao etapa de obra nenhuma */
  const acrescentar = () =>
    setLinhas((atual) => [
      ...atual,
      { rotulo: `Avaliação ${atual.length + 1}`, nota: 0, descricao: '', verDescricao: false, avulsa: true },
    ])

  const tirar = async (indice) => {
    const linha = linhas[indice]

    /* linha que ainda nao existe no banco sai so da tela */
    if (!linha.id) {
      setLinhas((atual) => atual.filter((_, i) => i !== indice))
      return
    }
    if (linhas.filter((l) => l.id).length <= 1) {
      setErro('A obra precisa ficar com ao menos uma avaliação. Use "Remover avaliação" para tirar todas.')
      return
    }

    try {
      await removerAvaliacao(linha.id)
      setLinhas((atual) => atual.filter((_, i) => i !== indice))
      setErro('')
    } catch (e) {
      setErro(e.message)
    }
  }

  /* a media do que esta na tela, para a pessoa ver o resultado antes
     mesmo de salvar */
  const preenchidas = linhas
    .map((l) => Number(l.nota))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= NOTA_MAXIMA)
  const previa =
    preenchidas.length > 0
      ? Math.round((preenchidas.reduce((s, n) => s + n, 0) / preenchidas.length) * 10) / 10
      : null

  const salvar = async (evento) => {
    evento.preventDefault()

    if (linhas.length === 0) {
      setErro('Esta obra não tem etapas no roteiro para avaliar.')
      return
    }

    /* TODAS, e nao "ao menos uma": a media da obra sai das etapas, e
       uma media tirada de tres de cinco etapas nao e a nota da obra —
       e a nota das tres que alguem lembrou de avaliar */
    const semNome = linhas.filter((l) => !String(l.rotulo).trim())
    if (semNome.length > 0) {
      setErro('Toda avaliação precisa de um nome.')
      return
    }

    const faltando = linhas.filter((l) => !(Number(l.nota) > 0))
    if (faltando.length > 0) {
      setErro(
        faltando.length === linhas.length
          ? 'Dê uma nota para cada etapa antes de salvar.'
          : `Falta a nota de: ${faltando.map((l) => l.rotulo).join(', ')}.`,
      )
      return
    }
    const validas = linhas

    setSalvando(true)
    try {
      for (const linha of validas) {
        const campos = {
          rotulo: String(linha.rotulo).trim(),
          nota: Number(linha.nota),
          descricao: linha.descricao,
        }
        if (linha.id) await atualizarAvaliacao(linha.id, campos)
        else await adicionarAvaliacao(obra.id, campos)
      }
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const apagarTudo = async () => {
    try {
      await limparAvaliacao(obra.id)
      aoFechar()
    } catch (e) {
      setErro(e.message)
    }
  }

  return (
    <Modal
      aberto={Boolean(obraId)}
      aoFechar={aoFechar}
      titulo={`${tituloDaObra(obra, cliente)} — ${obra.tipo === 'emergencia' ? 'emergência' : 'padrão'}`}
      largura={580}
    >
      <form className="formava" onSubmit={salvar}>
        {/* o que o card nao mostra: descricao e datas */}
        <div className="formava__cabeca">
          <p className="formava__obra">
            {obra.descricao || <em>obra sem descrição</em>}
          </p>
          <p className="formava__datas">
            <span>
              Obra criada em <strong>{dataBR(String(obra.criadoEm).slice(0, 10))}</strong>
            </span>
            {obra.avaliacao?.avaliadaEm && (
              <span>
                Última avaliação em <strong>{dataHora(obra.avaliacao.avaliadaEm)}</strong>
              </span>
            )}
          </p>
        </div>

        <div className="formava__notas">
          <header className="formava__notastopo">
            <h3>Notas desta obra</h3>
            {previa !== null && (
              <span className="formava__previa">
                <Estrelas nota={previa} tamanho={16} />
                <strong>{previa.toFixed(1)}</strong>
                <em>média geral</em>
              </span>
            )}
            {podeAvaliar && (
              <button
                type="button"
                className="formava__mais"
                onClick={acrescentar}
                title="Acrescentar outra avaliação"
                aria-label="Acrescentar outra avaliação"
              >
                <Mais />
              </button>
            )}
          </header>

          {linhas.length === 0 && (
            <p className="formava__ninguem">
              Esta obra não tem etapas no roteiro — não há o que avaliar.
            </p>
          )}

          {linhas.map((linha, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <article key={linha.id ?? `nova-${i}`} className="notaitem">
              {/* O nome e EDITAVEL, inclusive nas linhas que nasceram das
                  etapas do roteiro. Elas entram preenchidas porque e o
                  esqueleto certo na maioria das obras, e nao porque sao
                  fixas: "Comercial" pode virar "Comercial — proposta
                  revisada" numa obra em que isso importa, e a nota
                  continua sendo daquela etapa. O que vai para o banco e
                  o texto que estiver aqui. */}
              <input
                className="notaitem__rotulo"
                value={linha.rotulo}
                onChange={(e) => mudar(i, 'rotulo')(e.target.value)}
                placeholder="De quem é a nota"
                aria-label="Nome da avaliação"
                maxLength={60}
                disabled={!podeAvaliar}
                title={linha.rotulo}
              />

              {/* a nota se da CLICANDO na estrela. A caixa de numero
                  saiu: numa escala de cinco degraus, apontar o degrau e
                  mais rapido que digitar — e nao deixa digitar 7. */}
              <Estrelas
                nota={linha.nota}
                tamanho={20}
                rotulo={`Nota de ${linha.rotulo}`}
                aoEscolher={
                  podeAvaliar
                    ? (n) => {
                        mudar(i, 'nota')(n)
                        setErro('')
                      }
                    : undefined
                }
              />

              <span className="notaitem__valor" data-vazio={linha.nota > 0 ? undefined : 'sim'}>
                {linha.nota > 0 ? `${linha.nota} de ${NOTA_MAXIMA}` : 'sem nota'}
              </span>

              {podeAvaliar && linha.id && linhas.length > 1 && (
                <button
                  type="button"
                  className="notaitem__tirar"
                  onClick={() => tirar(i)}
                  title="Excluir esta avaliação"
                  aria-label={`Excluir a avaliação de ${linha.rotulo}`}
                >
                  <Lixo />
                </button>
              )}

              {/* a descricao e OPCIONAL, e por isso ela comeca fechada:
                  um campo de texto aberto embaixo de cada etapa faz o
                  formulario parecer que pede cinco redacoes */}
              {linha.verDescricao ? (
                <CampoArea
                  largo
                  linhas={2}
                  autoFocus={!linha.descricao}
                  placeholder={`O que houve na ${linha.rotulo.toLowerCase()}?`}
                  value={linha.descricao}
                  onChange={(e) => mudar(i, 'descricao')(e.target.value)}
                  disabled={!podeAvaliar}
                />
              ) : (
                podeAvaliar && (
                  <button
                    type="button"
                    className="notaitem__descricao"
                    onClick={() => mudar(i, 'verDescricao')(true)}
                  >
                    <Mais tamanho={13} />
                    Adicionar descrição
                  </button>
                )
              )}

              {linha.avaliadaEm && (
                <span className="notaitem__data">registrada em {dataHora(linha.avaliadaEm)}</span>
              )}
            </article>
          ))}
        </div>

        {erro && (
          <p className="formava__erro" role="alert">
            {erro}
          </p>
        )}

        <div className="formava__quem">
          <h3>Quem recebe esta nota</h3>
          {participantes.length === 0 ? (
            <p className="formava__ninguem">
              Ninguém marcou tarefa nesta obra ainda — a nota fica registrada, mas não entra em
              nenhuma média.
            </p>
          ) : (
            <ul>
              {participantes.map((p) => {
                const cargo = cargoPorChave(p.cargo)
                const atual = mediaDoUsuario(p.id)
                return (
                  <li key={p.id}>
                    <Avatar nome={p.nome} foto={p.foto} tamanho={30} titulo={p.nome} />
                    <span className="formava__pessoa">
                      <strong>{p.nome}</strong>
                      <span
                        className="formava__cargo"
                        style={{ '--cargo-cor': cargo?.cor ?? '#6b7280' }}
                      >
                        {cargo?.nome ?? p.cargoNome ?? 'Sem setor'}
                      </span>
                    </span>
                    <span className="formava__media">
                      {atual.media === null ? (
                        <em>sem média</em>
                      ) : (
                        <>
                          <strong>{atual.media.toFixed(1)}</strong>
                          <em>
                            {atual.obrasAvaliadas} obra{atual.obrasAvaliadas === 1 ? '' : 's'}
                          </em>
                        </>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="formobra__acoes">
          {podeAvaliar && obra.avaliacao && (
            <button type="button" className="formava__apagar" onClick={apagarTudo}>
              Remover avaliação
            </button>
          )}
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            {podeAvaliar ? 'Cancelar' : 'Fechar'}
          </button>
          {podeAvaliar && (
            <Button type="submit" loading={salvando}>
              {obra.avaliacao ? 'Salvar notas' : 'Avaliar obra'}
            </Button>
          )}
        </footer>
      </form>
    </Modal>
  )
}
