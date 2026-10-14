import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { useDados } from '@/context/DadosContext'
import ModalEnsaios from './ModalEnsaios'
import './ModalEnsaios.css'

/**
 * PLANEJAMENTO DE ENSAIOS — o check do Time Tecnico na 1a etapa.
 *
 * A pessoa ARRASTA os ensaios do catalogo (a esquerda) para a caixa
 * "Ensaios desta obra" (a direita). Sao esses, e so esses, que aparecem
 * depois na Execucao dos ensaios, na 3a etapa. Dentro da caixa da para
 * arrastar de novo para mudar a ordem, e arrastar de volta para fora
 * tira o ensaio da obra.
 *
 * Arrastar e o caminho principal. O botao pequeno de cada linha faz o
 * mesmo para quem esta no teclado ou num celular, onde arrastar com o
 * dedo nao funciona em todo navegador.
 *
 * Salvar grava a lista. "Salvar e concluir" grava e ja marca o check —
 * e so passa com ao menos um ensaio, que e a mesma regra do servidor.
 *
 * Tirar um ensaio da obra NAO apaga a execucao registrada dele: os dias
 * ficam guardados e voltam se ele for posto de novo.
 */
/** O selo HVAC / GASES do ensaio (nada no ensaio ainda sem classificacao). */
function ClasseDoEnsaio({ valor }) {
  if (!valor) return null
  return (
    <span className="ensaio__classe" data-classe={valor}>
      {valor === 'gases' ? 'GASES' : 'HVAC'}
    </span>
  )
}

export default function ModalPlanejamento({
  aberto,
  obra,
  /* pode mexer: e quem marca o check (o setor dele), e a obra esta aberta */
  podeEditar,
  marcado,
  aoDesmarcar,
  aoFechar,
}) {
  const { ensaiosAtivos, ensaioPorId, planejarEnsaios, execucaoDaObra, pode } = useDados()

  const [escolhidos, setEscolhidos] = useState([])
  const [arrastando, setArrastando] = useState(null) // { id, de: 'catalogo' | 'obra' }
  const [sobre, setSobre] = useState(null) // 'obra' | 'catalogo' | id do item da obra
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [catalogo, setCatalogo] = useState(false)

  /* comeca com o que a obra tem so ao ABRIR. Mexer no catalogo
     (Gerenciar ensaios) recarrega a obra por baixo, e reler a lista ai
     desfaria o que a pessoa ja tinha arrastado e ainda nao salvou */
  useEffect(() => {
    if (!aberto) return
    setEscolhidos((obra?.ensaios ?? []).map(String))
    setErro('')
    setArrastando(null)
    setSobre(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, obra?.id])

  /* o catalogo menos o que ja esta na obra */
  const disponiveis = useMemo(
    () => ensaiosAtivos.filter((e) => !escolhidos.includes(String(e.id))),
    [ensaiosAtivos, escolhidos],
  )

  /* quem ja tem execucao registrada: tirar da obra nao apaga, mas avisa */
  const execucao = obra ? execucaoDaObra(obra) : null
  const comRegistro = new Set(
    (execucao?.itens ?? []).filter((i) => i.dias.length > 0).map((i) => String(i.id)),
  )

  const mudou = escolhidos.join('|') !== (obra?.ensaios ?? []).map(String).join('|')

  const colocar = (id, antesDe = null) =>
    setEscolhidos((atual) => {
      const sem = atual.filter((x) => x !== String(id))
      const posicao = antesDe ? sem.indexOf(String(antesDe)) : -1
      if (posicao < 0) return [...sem, String(id)]
      return [...sem.slice(0, posicao), String(id), ...sem.slice(posicao)]
    })

  const tirar = (id) => setEscolhidos((atual) => atual.filter((x) => x !== String(id)))

  /* ---- arrastar e soltar (HTML5) ---- */
  const comecar = (id, de) => (evento) => {
    evento.dataTransfer.effectAllowed = 'move'
    /* o Firefox so arrasta com algum dado no evento */
    evento.dataTransfer.setData('text/plain', String(id))
    setArrastando({ id: String(id), de })
  }
  const terminar = () => {
    setArrastando(null)
    setSobre(null)
  }
  const permitir = (alvo) => (evento) => {
    if (!arrastando) return
    evento.preventDefault()
    evento.dataTransfer.dropEffect = 'move'
    if (sobre !== alvo) setSobre(alvo)
  }
  const soltarNaObra = (antesDe = null) => (evento) => {
    evento.preventDefault()
    evento.stopPropagation()
    if (arrastando) colocar(arrastando.id, antesDe)
    terminar()
  }
  const soltarNoCatalogo = (evento) => {
    evento.preventDefault()
    if (arrastando?.de === 'obra') tirar(arrastando.id)
    terminar()
  }

  const salvar = async (concluir) => {
    if (concluir && escolhidos.length === 0) {
      setErro('Arraste ao menos um ensaio para a obra antes de concluir o planejamento.')
      return
    }
    setSalvando(true)
    try {
      await planejarEnsaios(obra.id, escolhidos, concluir)
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const nome = (id) => ensaioPorId(id)?.nome ?? 'Ensaio removido'

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Planejamento de ensaios"
      subtitulo={
        podeEditar
          ? 'Arraste os ensaios que esta obra vai executar.'
          : 'Os ensaios que esta obra vai executar.'
      }
      largura={720}
    >
      <div className="ensaios">
        <div className="ensaios__colunas">
          {/* ---- o catalogo ---- */}
          {podeEditar && (
            <section
              className={`ensaios__caixa ensaios__caixa--catalogo ${
                sobre === 'catalogo' && arrastando?.de === 'obra' ? 'is-alvo' : ''
              }`.trim()}
              onDragOver={permitir('catalogo')}
              onDragLeave={() => setSobre(null)}
              onDrop={soltarNoCatalogo}
              aria-label="Ensaios disponíveis"
            >
              <header className="ensaios__topo">
                <h3>Ensaios disponíveis</h3>
                <span className="ensaios__conta">{disponiveis.length}</span>
              </header>

              <ul className="ensaios__lista">
                {disponiveis.map((e) => (
                  <li
                    key={e.id}
                    className={`ensaio ${arrastando?.id === String(e.id) ? 'is-arrastando' : ''}`.trim()}
                    draggable
                    onDragStart={comecar(e.id, 'catalogo')}
                    onDragEnd={terminar}
                    title={e.descricao || 'Arraste para a obra'}
                  >
                    <Pegador />
                    <span className="ensaio__nome">{e.nome}</span>
                    <ClasseDoEnsaio valor={e.classificacao} />
                    <button
                      type="button"
                      className="ensaio__mover"
                      onClick={() => colocar(e.id)}
                      aria-label={`Pôr ${e.nome} na obra`}
                      title="Pôr na obra"
                    >
                      →
                    </button>
                  </li>
                ))}
                {disponiveis.length === 0 && (
                  <li className="ensaios__vazio">
                    {ensaiosAtivos.length === 0
                      ? 'Nenhum ensaio no catálogo.'
                      : 'Todos os ensaios já estão na obra.'}
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* ---- a caixa da obra: e aqui que se solta ---- */}
          <section
            className={`ensaios__caixa ensaios__caixa--obra ${
              sobre === 'obra' && arrastando?.de === 'catalogo' ? 'is-alvo' : ''
            } ${arrastando ? 'is-esperando' : ''}`.trim()}
            onDragOver={permitir('obra')}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setSobre(null)
            }}
            onDrop={soltarNaObra()}
            aria-label="Ensaios desta obra"
          >
            <header className="ensaios__topo">
              <h3>Ensaios desta obra</h3>
              <span className="ensaios__conta">{escolhidos.length}</span>
            </header>

            <ol className="ensaios__lista">
              {escolhidos.map((id) => (
                <li
                  key={id}
                  className={`ensaio ensaio--escolhido ${
                    arrastando?.id === id ? 'is-arrastando' : ''
                  } ${sobre === id ? 'is-antes' : ''}`.trim()}
                  draggable={podeEditar}
                  onDragStart={podeEditar ? comecar(id, 'obra') : undefined}
                  onDragEnd={terminar}
                  onDragOver={permitir(id)}
                  onDrop={soltarNaObra(id)}
                >
                  {podeEditar && <Pegador />}
                  <span className="ensaio__nome">{nome(id)}</span>
                  <ClasseDoEnsaio valor={ensaioPorId(id)?.classificacao} />
                  {comRegistro.has(id) && (
                    <span className="ensaio__selo" title="Já tem execução registrada">
                      em execução
                    </span>
                  )}
                  {podeEditar && (
                    <button
                      type="button"
                      className="ensaio__mover"
                      onClick={() => tirar(id)}
                      aria-label={`Tirar ${nome(id)} da obra`}
                      title="Tirar da obra"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
              {escolhidos.length === 0 && (
                <li className="ensaios__soltar">
                  {podeEditar ? 'Solte os ensaios aqui' : 'Nenhum ensaio planejado ainda.'}
                </li>
              )}
            </ol>
          </section>
        </div>

        {podeEditar && escolhidos.some((id) => !(obra?.ensaios ?? []).map(String).includes(id)) && marcado && (
          <p className="ensaios__aviso">
            Ensaio novo entra na execução com 0%: se a Execução dos ensaios já estava concluída,
            ela volta a ficar em aberto.
          </p>
        )}
        {podeEditar &&
          (obra?.ensaios ?? []).map(String).some((id) => !escolhidos.includes(id) && comRegistro.has(id)) && (
            <p className="ensaios__aviso">
              Um ensaio com execução registrada vai sair da obra. Os dias registrados ficam
              guardados e voltam se ele for posto de novo.
            </p>
          )}

        {erro && (
          <p className="formrot__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes ensaios__acoes">
          {pode('gerenciar_ensaios') && (
            <button
              type="button"
              className="ensaios__catalogo"
              onClick={() => setCatalogo(true)}
              title="Adicionar, renomear ou excluir ensaios do catálogo"
            >
              Gerenciar ensaios
            </button>
          )}
          {podeEditar && marcado && (
            <button
              type="button"
              className="formobra__cancelar"
              onClick={async () => {
                await aoDesmarcar()
                aoFechar()
              }}
            >
              Reabrir o check
            </button>
          )}
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            {podeEditar ? 'Cancelar' : 'Fechar'}
          </button>
          {podeEditar && (
            <>
              {(mudou || marcado) && (
                <Button
                  type="button"
                  variant="ghost"
                  loading={salvando}
                  disabled={!mudou}
                  onClick={() => salvar(false)}
                >
                  Salvar
                </Button>
              )}
              {!marcado && (
                <Button
                  type="button"
                  loading={salvando}
                  disabled={escolhidos.length === 0}
                  onClick={() => salvar(true)}
                >
                  Salvar e concluir planejamento
                </Button>
              )}
            </>
          )}
        </footer>
      </div>

      <ModalEnsaios aberto={catalogo} aoFechar={() => setCatalogo(false)} />
    </Modal>
  )
}

/** Os seis pontinhos de "isto se arrasta". */
const Pegador = () => (
  <svg className="ensaio__pegador" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    {[7, 12, 17].map((y) => (
      <g key={y}>
        <circle cx="9" cy={y} r="1.5" fill="currentColor" />
        <circle cx="15" cy={y} r="1.5" fill="currentColor" />
      </g>
    ))}
  </svg>
)
