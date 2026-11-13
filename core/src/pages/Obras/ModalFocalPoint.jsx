import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Avatar from '@/components/Avatar/Avatar'
import { useDados } from '@/context/DadosContext'
import { checkTemDonoProprio } from '@/domain/obras'
import './ModalProposta.css'
import './ModalFocalPoint.css'

/* ------------------------------------------------------------
   "Determinar Focal Point" — 2a etapa (atualizacao 55).

   O check esta no card do Almoxarife e no do Time Tecnico. Quem marca
   escolhe uma pessoa DO PROPRIO SETOR do check como focal point da obra;
   escolher ja marca o check, e trocar e escolher de novo. A API confere que
   a pessoa e do setor (server/routes/dados.js).

   Quem nao marca o check so ve quem foi escolhido.
   ------------------------------------------------------------ */
export default function ModalFocalPoint({ aberto, obra, card, check, nomeCard, podeEditar, marcado, aoDesmarcar, aoFechar }) {
  const { equipe, definirFocalPoint, cargoPorChave } = useDados()
  const [escolhido, setEscolhido] = useState('')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const marca = check ? obra?.checks?.[check.id] : null
  const atual = marca?.escolhidoId ?? ''

  useEffect(() => {
    if (!aberto) return
    setEscolhido(atual)
    setBusca('')
    setErro('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, obra?.id, check?.id])

  /* o setor do check: o dono proprio dele, ou o do card */
  const setores = useMemo(() => {
    if (!check) return []
    return checkTemDonoProprio(check) ? check.cargos : (card?.cargos ?? [])
  }, [check, card])

  const pessoas = useMemo(
    () =>
      equipe
        .filter((p) => setores.includes(p.cargo))
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')),
    [equipe, setores],
  )

  if (!check || !obra) return null

  const termo = busca.trim().toLowerCase()
  const visiveis = termo ? pessoas.filter((p) => String(p.nome).toLowerCase().includes(termo)) : pessoas
  const nomeDosSetores = setores.map((s) => cargoPorChave(s)?.nome ?? s).join(', ')

  const salvar = async () => {
    if (!escolhido) {
      setErro('Escolha quem vai ser o focal point.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await definirFocalPoint(obra.id, check.id, escolhido)
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={check.titulo} subtitulo={nomeCard} largura={520}>
      <div className="proposta focal">
        <p className="proposta__texto">
          {podeEditar
            ? `Escolha uma pessoa do setor ${nomeDosSetores || 'deste check'} para ser o focal point desta obra.`
            : atual
              ? 'O focal point desta obra, escolhido pelo setor.'
              : 'O setor ainda não escolheu o focal point desta obra.'}
        </p>

        {!podeEditar && atual && (
          <div className="proposta__atual">
            <Avatar nome={marca.escolhidoNome} tamanho={34} />
            <span className="anexos__quem">
              <strong>{marca.escolhidoNome ?? 'Pessoa'}</strong>
            </span>
          </div>
        )}

        {podeEditar && (
          <>
            {pessoas.length > 8 && (
              <input
                type="search"
                className="campo__controle"
                placeholder="Procurar pessoa"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Procurar pessoa"
              />
            )}
            {pessoas.length === 0 ? (
              <p className="proposta__aviso">Ninguém da equipe está no setor deste check.</p>
            ) : (
              <ul className="focal__lista" role="radiogroup" aria-label="Focal point">
                {visiveis.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={escolhido === String(p.id)}
                      className="focal__pessoa"
                      onClick={() => {
                        setEscolhido(String(p.id))
                        setErro('')
                      }}
                    >
                      <Avatar nome={p.nome} foto={p.foto} tamanho={34} />
                      <span className="focal__quem">
                        <strong>{p.nome}</strong>
                        {p.cargoTitulo && <span>{p.cargoTitulo}</span>}
                      </span>
                      <span className="focal__marca" aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {visiveis.length === 0 && <li className="proposta__aviso">Ninguém com “{busca.trim()}”.</li>}
              </ul>
            )}
          </>
        )}

        {erro && (
          <p className="anexos__erro" role="alert">
            {erro}
          </p>
        )}

        {podeEditar && (
          <footer className="proposta__rodape">
            {marcado ? (
              <button
                type="button"
                className="proposta__desmarcar"
                onClick={async () => {
                  await aoDesmarcar()
                  aoFechar()
                }}
                disabled={salvando}
              >
                Desmarcar o check
              </button>
            ) : (
              <span />
            )}
            {(escolhido !== atual || !marcado) && (
              <Button onClick={salvar} loading={salvando} disabled={!escolhido}>
                {atual ? 'Trocar o focal point' : 'Definir focal point'}
              </Button>
            )}
          </footer>
        )}
      </div>
    </Modal>
  )
}
