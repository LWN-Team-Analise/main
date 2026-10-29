import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Avatar from '@/components/Avatar/Avatar'
import Button from '@/components/Button/Button'
import Confirma from '@/components/Confirma/Confirma'
import { CampoSelecao } from '@/components/Campo/Campo'
import PedidoInclusao from '@/components/PedidoInclusao/PedidoInclusao'
import { useAuth } from '@/context/AuthContext'
import { useDados } from '@/context/DadosContext'
import { dataHora } from '@/utils/formato'
import './ModalMembrosObra.css'

const SITUACAO = {
  pendente: 'aguardando resposta',
  aceito: 'aceitou',
  recusado: 'recusou',
}

/**
 * Os membros de UMA obra — abre ao clicar em "Membros" na tela dela.
 *
 * So a lista dos INCLUIDOS (os membros parciais, atualizacao 30): quem
 * foi incluido a mao, cada um com a situacao — aguardando a resposta,
 * aceitou, ou recusou (com o motivo que a pessoa deu). Desde a
 * atualizacao 37 e a inclusao que libera os checks do setor da pessoa
 * na obra. A lista "Pelo check" (quem entrou marcando check) saiu da
 * tela: essas pessoas continuam nos rostos do botao Membros.
 *
 * Embaixo, o "Incluir membro": escolhe a pessoa e ela recebe a
 * solicitacao (sino e celular) para aceitar ou recusar. Quem inclui a
 * si mesmo entra ja aceito.
 *
 * Tirar um incluido e de quem tem `excluir_membro_parcial`. Sem ela, so
 * quem incluiu pode desfazer — e so enquanto a pessoa nao respondeu.
 *
 * Se quem esta olhando e a pessoa incluida, a solicitacao dela aparece
 * no alto, com Aceitar e Recusar.
 */
export default function ModalMembrosObra({ aberto, aoFechar, obra, titulo }) {
  const { user } = useAuth()
  const { equipe, pessoaPorId, cargoPorChave, pode, incluirMembroParcial, tirarMembroParcial } = useDados()
  const [escolhido, setEscolhido] = useState('')
  const [erro, setErro] = useState('')
  const [incluindo, setIncluindo] = useState(false)
  const [tirando, setTirando] = useState(null)
  const [recado, setRecado] = useState('')

  useEffect(() => {
    if (!aberto) return
    setEscolhido('')
    setErro('')
    setRecado('')
  }, [aberto])

  const eu = String(user?.id ?? '')
  const parciais = obra?.parciais ?? []
  const podeTirar = pode('excluir_membro_parcial')

  /* quem ainda pode ser incluido: ativo, fora da obra, e nao a conta da
     TV. Quem recusou volta a aparecer — incluir de novo pergunta de novo */
  const opcoes = useMemo(() => {
    const ocupados = new Set([
      ...(obra?.membros ?? []).map(String),
      ...parciais.filter((p) => p.status !== 'recusado').map((p) => p.usuarioId),
    ])
    return equipe
      .filter((p) => p.ativo !== false && !ocupados.has(String(p.id)) && !cargoPorChave(p.cargo)?.painelTv)
      .map((p) => ({ valor: String(p.id), rotulo: p.souEu ? `${p.nome} (você)` : p.nome }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
  }, [equipe, obra?.membros, parciais, cargoPorChave])

  const meuPedido = parciais.find((p) => p.usuarioId === eu && p.status === 'pendente')

  if (!obra) return null

  const incluir = async () => {
    if (!escolhido) {
      setErro('Escolha a pessoa.')
      return
    }
    setIncluindo(true)
    setErro('')
    try {
      const pessoa = pessoaPorId(escolhido)
      await incluirMembroParcial(obra.id, escolhido)
      setRecado(
        escolhido === eu
          ? 'Você entrou como membro da obra.'
          : `${pessoa?.nome ?? 'A pessoa'} recebeu a solicitação e vai aceitar ou recusar.`,
      )
      setEscolhido('')
    } catch (e) {
      setErro(e.message)
    } finally {
      setIncluindo(false)
    }
  }

  const tirar = async () => {
    const alvo = tirando
    setTirando(null)
    try {
      await tirarMembroParcial(obra.id, alvo.usuarioId)
      setRecado('')
    } catch (e) {
      setErro(e.message)
    }
  }

  const linhaDaPessoa = (pessoa) => {
    const cargo = cargoPorChave(pessoa?.cargo)
    return (
      <>
        <Avatar nome={pessoa?.nome} foto={pessoa?.foto} tamanho={34} titulo={pessoa?.nome} />
        <span className="mobra__quem">
          <strong>
            {pessoa?.nome ?? 'Pessoa removida'}
            {String(pessoa?.id) === eu && <em className="mobra__eu">você</em>}
          </strong>
          <span className="mobra__cargo" style={{ '--cargo-cor': cargo?.cor ?? '#6b7280' }}>
            {cargo?.nome ?? pessoa?.cargoNome ?? 'Sem setor'}
          </span>
        </span>
      </>
    )
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Membros da obra" subtitulo={titulo} largura={560}>
      <div className="mobra">
        {meuPedido && (
          <section className="mobra__pedido" aria-label="Sua solicitação">
            <PedidoInclusao pedido={{ ...meuPedido, obraId: obra.id }} />
          </section>
        )}

        <section className="mobra__bloco" aria-labelledby="mobra-parciais">
          <h3 className="mobra__titulo" id="mobra-parciais">
            Incluídos <span>{parciais.length}</span>
          </h3>
          {parciais.length === 0 ? (
            <p className="mobra__vazio">Ninguém foi incluído nesta obra.</p>
          ) : (
            <ul className="mobra__lista">
              {parciais.map((p) => {
                const pessoa = pessoaPorId(p.usuarioId)
                /* quem incluiu desfaz enquanto a pessoa nao respondeu */
                const desfaz = !podeTirar && p.status === 'pendente' && p.incluidoPor === eu
                return (
                  <li key={p.usuarioId} className="mobra__pessoa mobra__pessoa--parcial">
                    {linhaDaPessoa(pessoa ?? { id: p.usuarioId })}
                    <span className="mobra__situacao" data-status={p.status}>
                      {SITUACAO[p.status] ?? p.status}
                    </span>
                    {(podeTirar || desfaz) && (
                      <button
                        type="button"
                        className="mobra__tirar"
                        onClick={() => setTirando({ ...p, nome: pessoa?.nome ?? 'esta pessoa', desfaz })}
                        aria-label={`${desfaz ? 'Cancelar a inclusão de' : 'Tirar da obra'} ${pessoa?.nome ?? ''}`.trim()}
                        title={desfaz ? 'Cancelar a inclusão' : 'Tirar da obra'}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4.5 7h15M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
                        </svg>
                      </button>
                    )}
                    <p className="mobra__meta">
                      Incluído por {p.incluidoPorNome ?? '—'} em {dataHora(p.incluidoEm)}
                      {p.respondidoEm && p.status !== 'pendente' && ` · respondeu em ${dataHora(p.respondidoEm)}`}
                    </p>
                    {p.status === 'recusado' && p.motivo && (
                      <p className="mobra__motivo">
                        <strong>Motivo:</strong> {p.motivo}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="mobra__incluir" aria-labelledby="mobra-incluir">
          <h3 className="mobra__titulo" id="mobra-incluir">
            Incluir membro
          </h3>
          <div className="mobra__form">
            <CampoSelecao
              aria-label="Pessoa a incluir"
              value={escolhido}
              onChange={(e) => {
                setEscolhido(e.target.value)
                setErro('')
                setRecado('')
              }}
              vazio={opcoes.length ? 'Escolha a pessoa...' : 'Todos já estão na obra'}
              opcoes={opcoes}
              disabled={opcoes.length === 0}
            />
            <Button type="button" onClick={incluir} loading={incluindo} disabled={opcoes.length === 0}>
              Incluir
            </Button>
          </div>
          {erro && (
            <p className="mobra__erro" role="alert">
              {erro}
            </p>
          )}
          {recado && (
            <p className="mobra__ok" role="status">
              {recado}
            </p>
          )}
        </section>
      </div>

      <Confirma
        aberto={Boolean(tirando)}
        titulo={tirando?.desfaz ? 'Cancelar a inclusão?' : 'Tirar da obra?'}
        mensagem={
          tirando?.desfaz
            ? `${tirando?.nome} ainda não respondeu. A solicitação é cancelada.`
            : `${tirando?.nome} deixa de ser membro desta obra.`
        }
        rotuloConfirmar={tirando?.desfaz ? 'Cancelar inclusão' : 'Tirar'}
        aoConfirmar={tirar}
        aoFechar={() => setTirando(null)}
      />
    </Modal>
  )
}
