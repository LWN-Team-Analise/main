import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import Avatar from '@/components/Avatar/Avatar'
import Seletor from '@/components/Seletor/Seletor'
import { useDados } from '@/context/DadosContext'
import { CATEGORIAS, CHAVES_CATEGORIA, MESES } from '@/domain/despesas'
import * as despesasApi from '@/services/despesasService'
import { dataBR, hojeISO, reais } from '@/utils/formato'
import ModalExportar from './ModalExportar'
import PainelEnvios from './PainelEnvios'
import { IconePlanilha, IconeVoltar } from './icones'
import './Despesas.css'

/**
 * ENVIOS GERAIS — os envios da equipe, para quem revisa (o botao do Reembolso).
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

const TIPOS = [
  { valor: 'todos', rotulo: 'Todos' },
  ...CHAVES_CATEGORIA.map((c) => ({ valor: c, rotulo: CATEGORIAS[c].rotulo })),
]

/**
 * O periodo do filtro, como fica no endereco: '' (desde sempre),
 * 'm:AAAA-MM' (um mes) ou 'a:AAAA' (um ano). O mes e o do periodo de cada
 * categoria, igual a Meus envios (src/domain/despesas.js).
 */
function lerPeriodo(bruto) {
  const texto = String(bruto ?? '')
  if (/^m:\d{4}-(0[1-9]|1[0-2])$/.test(texto)) return { valor: texto, mes: texto.slice(2) }
  if (/^a:\d{4}$/.test(texto)) return { valor: texto, ano: texto.slice(2) }
  return { valor: '' }
}

/** As opcoes do seletor de periodo: tudo, os ultimos 12 meses e os anos. */
function opcoesDePeriodo(hoje) {
  const [ano, mes] = hoje.split('-').map(Number)
  const meses = Array.from({ length: 12 }, (_, i) => {
    const data = new Date(Date.UTC(ano, mes - 1 - i, 1))
    const chave = `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`
    return { valor: `m:${chave}`, rotulo: `${MESES[data.getUTCMonth()]} de ${data.getUTCFullYear()}` }
  })
  const anos = Array.from({ length: 4 }, (_, i) => ({ valor: `a:${ano - i}`, rotulo: `Ano de ${ano - i}` }))
  return [{ valor: '', rotulo: 'Todo o período' }, ...meses, ...anos]
}

/** O que a tela da pessoa recebe no endereco para abrir no mesmo recorte. */
function buscaDaPessoa(tipo, periodo) {
  const busca = new URLSearchParams()
  if (periodo.mes) busca.set('mes', periodo.mes)
  if (periodo.ano) {
    busca.set('visao', 'ano')
    busca.set('ano', periodo.ano)
  }
  if (tipo !== 'todos') busca.set('tipo', tipo)
  const texto = busca.toString()
  return texto ? `?${texto}` : ''
}

function useQuemEnviou(periodo = {}) {
  const [pessoas, setPessoas] = useState(null)
  const [erro, setErro] = useState('')
  const { mes, ano } = periodo

  useEffect(() => {
    let vivo = true
    setErro('')
    despesasApi
      .carregarPessoas({ mes, ano })
      .then((lista) => vivo && setPessoas(lista))
      .catch((e) => {
        if (!vivo) return
        setErro(e.message)
        setPessoas([])
      })
    return () => {
      vivo = false
    }
  }, [mes, ano])

  return { pessoas, erro }
}

export default function EnviosGerais() {
  const { pessoaPorId } = useDados()
  /* o filtro mora no endereco: o voltar da tela da pessoa volta nele */
  const [busca, setBusca] = useSearchParams()
  const tipo = CHAVES_CATEGORIA.includes(busca.get('tipo')) ? busca.get('tipo') : 'todos'
  const periodo = lerPeriodo(busca.get('periodo'))
  const { pessoas, erro } = useQuemEnviou(periodo)
  const [procura, setProcura] = useState('')
  const [exportando, setExportando] = useState(false)
  const [recado, setRecado] = useState('')
  const [opcoesPeriodo] = useState(() => opcoesDePeriodo(hojeISO()))

  const filtrar = (mudancas) => {
    const proxima = new URLSearchParams(busca)
    Object.entries(mudancas).forEach(([chave, valor]) => {
      if (!valor || valor === 'todos') proxima.delete(chave)
      else proxima.set(chave, valor)
    })
    setBusca(proxima, { replace: true })
  }

  /* o total e a quantidade de cada pessoa NO TIPO escolhido: trocar o tipo
     nao pergunta de novo, a API ja manda os tres (porCategoria) */
  const doTipo = (p) =>
    tipo === 'todos'
      ? { total: p.total, quantidade: p.quantidade, ultimoEnvio: p.ultimoEnvio }
      : p.porCategoria?.[tipo] ?? { total: 0, quantidade: 0, ultimoEnvio: null }

  const noTipo = useMemo(
    () => (pessoas ?? []).map((p) => ({ ...p, ...doTipo(p) })).filter((p) => p.quantidade > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pessoas, tipo],
  )

  const lista = useMemo(() => {
    const termo = procura.trim().toLowerCase()
    if (!termo) return noTipo
    return noTipo.filter((p) =>
      [p.nome, p.email, p.setor, p.cargo].some((v) => String(v ?? '').toLowerCase().includes(termo)),
    )
  }, [noTipo, procura])

  const somaDaLista = lista.reduce((conta, p) => ({ total: conta.total + p.total, quantidade: conta.quantidade + p.quantidade }), {
    total: 0,
    quantidade: 0,
  })
  const filtrado = tipo !== 'todos' || Boolean(periodo.valor)
  const sufixo = buscaDaPessoa(tipo, periodo)

  return (
    <AppShell>
      <section className="envios">
        <header className="envios__topo">
          <Link to="/app/despesas" className="envios__voltar">
            <IconeVoltar />
            Reembolso
          </Link>
          <div className="envios__titulo">
            <div>
              <h1 className="tela__titulo">Envios gerais</h1>
              <p className="tela__lead">
                O que cada pessoa enviou de despesa, refeição e bônus. Filtre pelo tipo e pelo período, ou clique numa
                pessoa para ver os envios dela.
              </p>
            </div>
            {(pessoas?.length > 0 || filtrado) && (
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

        {/* o recorte: o tipo troca na hora (a API ja mandou os tres); o
            periodo pergunta de novo */}
        {(pessoas?.length > 0 || filtrado) && (
          <div className="envios__filtros gerais__filtros">
            <Seletor
              valor={periodo.valor}
              aoMudar={(valor) => filtrar({ periodo: valor })}
              opcoes={opcoesPeriodo}
              aria-label="Período"
            />
            <div className="envios__tipos gerais__tipos" role="group" aria-label="Tipo de envio">
              {TIPOS.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  className={`chip ${tipo === t.valor ? 'is-atual' : ''}`.trim()}
                  data-categoria={t.valor === 'todos' ? undefined : t.valor}
                  aria-pressed={tipo === t.valor}
                  onClick={() => filtrar({ tipo: t.valor })}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>
          </div>
        )}

        {pessoas === null ? (
          <p className="envios__vazio">Carregando...</p>
        ) : noTipo.length === 0 ? (
          !erro && (
            <p className="envios__vazio">
              {filtrado
                ? `Ninguém enviou ${tipo === 'todos' ? 'nada' : CATEGORIAS[tipo].rotulo.toLowerCase()} ${
                    periodo.valor ? `em ${opcoesPeriodo.find((o) => o.valor === periodo.valor)?.rotulo.toLowerCase() ?? 'este período'}` : 'ainda'
                  }.`
                : 'Ninguém enviou despesa, refeição ou bônus ainda.'}
            </p>
          )
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
              <span className="envios__contagem">
                {plural(lista.length, 'pessoa', 'pessoas')} · {reais(somaDaLista.total)} em{' '}
                {plural(somaDaLista.quantidade, 'envio', 'envios')}
              </span>
            </div>

            <ul className="gerais">
              <li>
                <Link to={`/app/despesas/gerais/todos${sufixo}`} className="gerais__pessoa gerais__pessoa--todos">
                  <span className="gerais__todosicone" aria-hidden="true">
                    {noTipo.length}
                  </span>
                  <span className="gerais__quem">
                    <strong>Todos os usuários</strong>
                    <span>Os envios da equipe inteira, juntos</span>
                  </span>
                </Link>
              </li>
              {lista.map((p) => (
                <li key={p.usuarioId}>
                  <Link to={`/app/despesas/gerais/${p.usuarioId}${sufixo}`} className="gerais__pessoa">
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
