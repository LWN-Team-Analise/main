import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import { useDados } from '@/context/DadosContext'
import * as despesasApi from '@/services/despesasService'
import { dataBR, reais } from '@/utils/formato'
import ModalExportar from './ModalExportar'
import PainelEnvios from './PainelEnvios'
import { IconePlanilha, IconeVoltar } from './icones'
import './Despesas.css'

/**
 * ENVIOS GERAIS — os envios da equipe, para quem revisa.
 *
 * Duas telas:
 *
 *   /app/despesas/gerais            quem ja enviou alguma coisa;
 *   /app/despesas/gerais/:pessoa    os envios dessa pessoa, com os
 *                                   mesmos filtros de Meus envios
 *                                   (mensal/anual e tipo).
 *
 * `todos` no lugar da pessoa abre a equipe inteira junta.
 *
 * "Exportar para o Excel" mora nas duas: na lista, ele abre a escolha de
 * quem, periodo e tipo (ModalExportar); dentro de uma pessoa (ou de
 * todos), ele baixa o que esta na tela (PainelEnvios).
 *
 * A rota exige `revisar_despesa_geral` na tela (ProtectedRoute) e a
 * API exige de novo em cada chamada — a lista de pessoas volta 403 e
 * os envios de outra pessoa tambem, para quem nao tem a permissao.
 */

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

function useQuemEnviou() {
  const [pessoas, setPessoas] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    despesasApi
      .carregarPessoas()
      .then((lista) => vivo && setPessoas(lista))
      .catch((e) => {
        if (!vivo) return
        setErro(e.message)
        setPessoas([])
      })
    return () => {
      vivo = false
    }
  }, [])

  return { pessoas, erro }
}

export default function EnviosGerais() {
  const { pessoaPorId } = useDados()
  const { pessoas, erro } = useQuemEnviou()
  const [procura, setProcura] = useState('')
  const [exportando, setExportando] = useState(false)
  const [recado, setRecado] = useState('')

  const lista = useMemo(() => {
    const termo = procura.trim().toLowerCase()
    if (!termo || !pessoas) return pessoas ?? []
    return pessoas.filter((p) =>
      [p.nome, p.email, p.setor, p.cargo].some((v) => String(v ?? '').toLowerCase().includes(termo)),
    )
  }, [pessoas, procura])

  return (
    <AppShell>
      <section className="envios">
        <header className="envios__topo">
          <Link to="/app/despesas" className="envios__voltar">
            <IconeVoltar />
            Despesas
          </Link>
          <div className="envios__titulo">
            <div>
              <h1 className="tela__titulo">Envios gerais</h1>
              <p className="tela__lead">
                Quem já enviou despesa, refeição ou bônus. Clique numa pessoa para ver os envios dela.
              </p>
            </div>
            {pessoas?.length > 0 && (
              <button type="button" className="acao acao--fraca" onClick={() => setExportando(true)}>
                <IconePlanilha />
                Exportar para o Excel
              </button>
            )}
          </div>
        </header>

        {erro && (
          <p className="envios__erro" role="alert">
            {erro}
          </p>
        )}

        {recado && (
          <p className="recado" role="status">
            {recado}
            <button type="button" onClick={() => setRecado('')} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}

        {pessoas === null ? (
          <p className="envios__vazio">Carregando...</p>
        ) : pessoas.length === 0 ? (
          !erro && <p className="envios__vazio">Ninguém enviou despesa, refeição ou bônus ainda.</p>
        ) : (
          <>
            <div className="envios__filtros">
              <label className="procura">
                <input
                  type="search"
                  placeholder="Procurar pessoa..."
                  value={procura}
                  onChange={(e) => setProcura(e.target.value)}
                  aria-label="Procurar pessoa"
                />
              </label>
              <span className="envios__contagem">{plural(pessoas.length, 'pessoa', 'pessoas')}</span>
            </div>

            <ul className="gerais">
              <li>
                <Link to="/app/despesas/gerais/todos" className="gerais__pessoa gerais__pessoa--todos">
                  <span className="gerais__todosicone" aria-hidden="true">
                    {pessoas.length}
                  </span>
                  <span className="gerais__quem">
                    <strong>Todos os usuários</strong>
                    <span>Os envios da equipe inteira, juntos</span>
                  </span>
                </Link>
              </li>
              {lista.map((p) => (
                <li key={p.usuarioId}>
                  <Link to={`/app/despesas/gerais/${p.usuarioId}`} className="gerais__pessoa">
                    <Avatar nome={p.nome} foto={pessoaPorId(p.usuarioId)?.foto} tamanho={44} />
                    <span className="gerais__quem">
                      <strong>
                        {p.nome}
                        {!p.ativo && <em className="gerais__inativo">desligado</em>}
                      </strong>
                      <span className="gerais__setor">
                        {p.setor && (
                          <i style={{ '--setor-cor': p.setorCor ?? 'var(--text-faint)' }} aria-hidden="true" />
                        )}
                        {[p.setor, p.cargo].filter(Boolean).join(' · ') || 'Sem setor'}
                      </span>
                      {p.email && <span className="gerais__email">{p.email}</span>}
                    </span>
                    <span className="gerais__numeros">
                      <strong>{reais(p.total)}</strong>
                      <span>{plural(p.quantidade, 'envio', 'envios')}</span>
                      {p.ultimoEnvio && <span>último em {dataBR(p.ultimoEnvio)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
              {lista.length === 0 && (
                <li className="envios__vazio">Ninguém com “{procura.trim()}” entre quem já enviou.</li>
              )}
            </ul>
          </>
        )}
      </section>

      <ModalExportar
        aberto={exportando}
        aoFechar={() => setExportando(false)}
        pessoas={pessoas ?? []}
        aoExportado={setRecado}
      />
    </AppShell>
  )
}

/** Os envios de UMA pessoa (ou de todos), com os filtros de sempre. */
export function EnviosDaPessoa() {
  const { usuarioId } = useParams()
  const { pessoaPorId } = useDados()
  const { pessoas } = useQuemEnviou()
  const todos = usuarioId === 'todos'

  /* nome e setor saem da lista de quem enviou (que inclui quem ja foi
     desligado); a foto, do cadastro da equipe */
  const pessoa = todos ? null : pessoas?.find((p) => p.usuarioId === String(usuarioId))
  const nome = pessoa?.nome ?? pessoaPorId(usuarioId)?.nome ?? (pessoas ? 'Pessoa sem envios' : '...')

  return (
    <AppShell>
      <section className="envios">
        <header className="envios__topo">
          <Link to="/app/despesas/gerais" className="envios__voltar">
            <IconeVoltar />
            Envios gerais
          </Link>

          {todos ? (
            <>
              <h1 className="tela__titulo">Todos os usuários</h1>
              <p className="tela__lead">Os envios da equipe inteira. Cada um mostra quem enviou.</p>
            </>
          ) : (
            <div className="gerais__cabeca">
              <Avatar nome={nome} foto={pessoaPorId(usuarioId)?.foto} tamanho={52} />
              <div>
                <h1 className="tela__titulo">{nome}</h1>
                <p className="tela__lead">
                  {[pessoa?.setor, pessoa?.cargo, pessoa?.email].filter(Boolean).join(' · ') ||
                    'Envios desta pessoa'}
                </p>
              </div>
            </div>
          )}
        </header>

        <PainelEnvios
          usuarios={todos ? 'todos' : [String(usuarioId)]}
          mostraPessoa={todos}
          quem={todos ? 'Todos os usuários' : pessoa?.nome}
        />
      </section>
    </AppShell>
  )
}
