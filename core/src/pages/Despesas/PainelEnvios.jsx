import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Avatar from '@/components/Avatar/Avatar'
import Confirma from '@/components/Confirma/Confirma'
import Seletor from '@/components/Seletor/Seletor'
import { useDados } from '@/context/DadosContext'
import {
  CATEGORIAS,
  CHAVES_CATEGORIA,
  MESES,
  rotuloDaCategoria,
  rotuloDoTipo,
} from '@/domain/despesas'
import * as despesasApi from '@/services/despesasService'
import { dataBR, dataHora, hojeISO, reais } from '@/utils/formato'
import { exportarEnvios } from './planilhaDespesas'
import { IconeBaixar, IconeCategoria, IconeLixo, IconePlanilha, IconeSeta } from './icones'

/**
 * Os envios de alguem, por mes ou por ano — a mesma peca serve a
 * "Meus envios" e aos envios de uma pessoa em "Envios gerais".
 *
 *   Mensal  os envios do mes, agrupados por dia, com o total de cada
 *           dia e o total do mes no fim;
 *   Anual   os doze meses com o total de cada um, e o total do ano.
 *
 * E o TIPO por cima dos dois: Todos, Despesa, Refeicao ou Bonus. Os
 * filtros se somam ("Joao, so bonus, setembro de 2026"), e quem filtra
 * e a API — a tela pede exatamente o recorte e nao soma nada: todo
 * total vem pronto do banco.
 *
 * `usuarios` diz de quem: nada = os meus; ['7'] = a pessoa 7;
 * 'todos' = a equipe inteira. A API confere a permissao de cada pedido.
 *
 * A visao, o mes, o ano e o tipo ficam no endereco
 * (?visao=ano&ano=2026&tipo=bonus): o "voltar" do navegador desfaz o
 * clique num mes da visao anual, e o link copiado abre no mesmo lugar.
 *
 * "Exportar para o Excel" baixa EXATAMENTE o que esta na tela: o mesmo
 * periodo, o mesmo tipo e as mesmas pessoas. Com `usuarios='todos'` a
 * planilha sai com uma aba por pessoa. `quem` e o nome que vai no
 * titulo e no arquivo.
 *
 * A lixeira de cada envio so aparece para quem tem `excluir_despesas`.
 */

const DIAS_DA_SEMANA = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
]

function diaDaSemana(iso) {
  const [ano, mes, dia] = String(iso).split('-').map(Number)
  return DIAS_DA_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()] ?? ''
}

/** '2026-09' + 1 -> '2026-10' */
function somarMes(mes, passo) {
  const [ano, m] = mes.split('-').map(Number)
  const total = ano * 12 + (m - 1) + passo
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

const TIPOS = [
  { valor: 'todos', rotulo: 'Todos' },
  ...CHAVES_CATEGORIA.map((c) => ({ valor: c, rotulo: CATEGORIAS[c].rotulo })),
]

export default function PainelEnvios({ usuarios, mostraPessoa = false, quem }) {
  const { pessoaPorId, pode } = useDados()
  const podeExcluir = pode('excluir_despesas')

  const hoje = hojeISO()
  const mesAtual = hoje.slice(0, 7)
  const anoAtual = Number(hoje.slice(0, 4))

  const [busca, setBusca] = useSearchParams()
  const visao = busca.get('visao') === 'ano' ? 'ano' : 'mes'
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(busca.get('mes') ?? '') ? busca.get('mes') : mesAtual
  const ano = /^\d{4}$/.test(busca.get('ano') ?? '') ? Number(busca.get('ano')) : Number(mes.slice(0, 4))
  const tipo = CHAVES_CATEGORIA.includes(busca.get('tipo')) ? busca.get('tipo') : 'todos'
  const categoria = tipo === 'todos' ? undefined : tipo

  const ir = (mudancas) => {
    const proxima = new URLSearchParams(busca)
    Object.entries(mudancas).forEach(([chave, valor]) => proxima.set(chave, String(valor)))
    setBusca(proxima)
  }

  /* `usuarios` entra pela chave (texto): a lista em si e recriada a
     cada render, e como dependencia recarregaria sem parar */
  const chaveUsuarios = Array.isArray(usuarios) ? usuarios.join(',') : usuarios ?? ''

  /* ---- a carga ---- */
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const carga = useRef(0)
  /* sobe a cada exclusao: e o que faz a lista e os totais recarregarem */
  const [versao, setVersao] = useState(0)
  const [recado, setRecado] = useState('')
  const [excluindo, setExcluindo] = useState(null)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    const minha = (carga.current += 1)
    setCarregando(true)
    setErro('')
    const filtros = { usuarios, categoria }
    const pedido =
      visao === 'ano' ? despesasApi.carregarAno(ano, filtros) : despesasApi.carregarMes(mes, filtros)
    pedido
      .then((resposta) => {
        if (minha === carga.current) setDados({ ...resposta, visao, tipo })
      })
      .catch((e) => {
        if (minha === carga.current) {
          setDados(null)
          setErro(e.message)
        }
      })
      .finally(() => {
        if (minha === carga.current) setCarregando(false)
      })
  }, [visao, mes, ano, categoria, chaveUsuarios, versao])

  const [anos] = useState(() => Array.from({ length: 7 }, (_, i) => anoAtual - 6 + i))
  const opcoesAno = (anos.includes(ano) ? anos : [...anos, ano].sort()).map((a) => ({
    valor: String(a),
    rotulo: String(a),
  }))

  const baixar = async (anexo) => {
    try {
      const { conteudo, nome } = await despesasApi.baixarAnexo(anexo.id)
      const link = document.createElement('a')
      link.href = conteudo
      link.download = nome
      link.click()
    } catch (e) {
      setErro(e.message)
    }
  }

  const excluir = async (envio) => {
    try {
      await despesasApi.excluir(envio.id)
      setRecado(
        `Lançamento excluído: ${rotuloDoTipo(envio.tipo)} de ${dataBR(envio.data)}, ${reais(envio.valor)}${
          mostraPessoa && envio.usuarioNome ? ` — de ${envio.usuarioNome}` : ''
        }.`,
      )
      setVersao((v) => v + 1)
    } catch (e) {
      setErro(e.message)
    }
  }

  const exportar = async () => {
    setExportando(true)
    setErro('')
    setRecado('')
    try {
      const { envios, total } = await exportarEnvios({
        usuarios,
        categoria,
        periodo: visao === 'ano' ? { ano } : { mes },
        quem,
      })
      setRecado(`Planilha gerada: ${plural(envios, 'envio', 'envios')}, ${reais(total)}.`)
    } catch (e) {
      setErro(e.message)
    } finally {
      setExportando(false)
    }
  }

  const [anoDoMes, numeroDoMes] = mes.split('-').map(Number)
  const periodo = visao === 'ano' ? String(ano) : `${MESES[numeroDoMes - 1]} de ${anoDoMes}`
  const noFim = visao === 'ano' ? ano >= anoAtual : mes >= mesAtual
  const valido = dados && dados.visao === visao

  return (
    <>
      {/* ---------------- filtros ---------------- */}
      <div className="envios__filtros">
        <div className="envios__visao" role="group" aria-label="Período">
          <button
            type="button"
            className={`chip ${visao === 'mes' ? 'is-atual' : ''}`.trim()}
            onClick={() => ir({ visao: 'mes', mes: visao === 'ano' && ano !== anoDoMes ? `${ano}-01` : mes })}
          >
            Mensal
          </button>
          <button
            type="button"
            className={`chip ${visao === 'ano' ? 'is-atual' : ''}`.trim()}
            onClick={() => ir({ visao: 'ano', ano: visao === 'mes' ? anoDoMes : ano })}
          >
            Anual
          </button>
        </div>

        <div className="envios__periodo">
          <button
            type="button"
            className="envios__passo"
            onClick={() => (visao === 'ano' ? ir({ ano: ano - 1 }) : ir({ mes: somarMes(mes, -1) }))}
            aria-label={visao === 'ano' ? 'Ano anterior' : 'Mês anterior'}
          >
            <IconeSeta lado="esquerda" />
          </button>

          {visao === 'mes' && (
            <Seletor
              valor={String(numeroDoMes)}
              aoMudar={(m) => ir({ mes: `${anoDoMes}-${String(m).padStart(2, '0')}` })}
              opcoes={MESES.map((nome, i) => ({ valor: String(i + 1), rotulo: nome }))}
              aria-label="Mês"
            />
          )}
          <Seletor
            valor={String(visao === 'ano' ? ano : anoDoMes)}
            aoMudar={(a) =>
              visao === 'ano' ? ir({ ano: a }) : ir({ mes: `${a}-${String(numeroDoMes).padStart(2, '0')}` })
            }
            opcoes={opcoesAno}
            aria-label="Ano"
          />

          <button
            type="button"
            className="envios__passo"
            onClick={() => (visao === 'ano' ? ir({ ano: ano + 1 }) : ir({ mes: somarMes(mes, 1) }))}
            disabled={noFim}
            aria-label={visao === 'ano' ? 'Próximo ano' : 'Próximo mês'}
          >
            <IconeSeta lado="direita" />
          </button>
        </div>

        <div className="envios__tipos" role="group" aria-label="Tipo de envio">
          {TIPOS.map((t) => (
            <button
              key={t.valor}
              type="button"
              className={`chip ${tipo === t.valor ? 'is-atual' : ''}`.trim()}
              data-categoria={t.valor === 'todos' ? undefined : t.valor}
              onClick={() => ir({ tipo: t.valor })}
            >
              {t.rotulo}
            </button>
          ))}
        </div>

        {/* baixa o que esta na tela — periodo, tipo e pessoas */}
        <button
          type="button"
          className="acao acao--fraca envios__exportar"
          onClick={exportar}
          disabled={exportando}
          title="Baixar os envios deste período numa planilha do Excel"
        >
          <IconePlanilha />
          {exportando ? 'Gerando planilha...' : 'Exportar para o Excel'}
        </button>
      </div>

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

      {!valido ? (
        !erro && <p className="envios__vazio">Carregando...</p>
      ) : (
        <div className={`envios__conteudo ${carregando ? 'is-carregando' : ''}`.trim()} aria-busy={carregando}>
          <Resumo dados={dados} periodo={periodo} visao={visao} tipo={dados.tipo} />

          {mostraPessoa && dados.pessoas.length > 1 && (
            <PorPessoa pessoas={dados.pessoas} pessoaPorId={pessoaPorId} visao={visao} />
          )}

          {visao === 'mes' ? (
            <Mes
              dados={dados}
              periodo={periodo}
              tipo={dados.tipo}
              mostraPessoa={mostraPessoa}
              pessoaPorId={pessoaPorId}
              aoBaixar={baixar}
              aoExcluir={podeExcluir ? setExcluindo : undefined}
            />
          ) : (
            <Ano dados={dados} aoAbrirMes={(m) => ir({ visao: 'mes', mes: `${ano}-${String(m).padStart(2, '0')}` })} />
          )}

          <footer className="envios__rodape">
            <span>
              {visao === 'ano' ? 'Total anual' : 'Total do mês'}
              {dados.tipo !== 'todos' && ` — ${CATEGORIAS[dados.tipo].plural}`}
            </span>
            <strong>{reais(dados.total)}</strong>
          </footer>
        </div>
      )}

      <Confirma
        aberto={Boolean(excluindo)}
        titulo="Excluir lançamento"
        mensagem={
          excluindo
            ? `${rotuloDaCategoria(excluindo.categoria)} — ${rotuloDoTipo(excluindo.tipo)}, de ${dataBR(
                excluindo.data,
              )}, no valor de ${reais(excluindo.valor)}${
                mostraPessoa && excluindo.usuarioNome ? `, enviado por ${excluindo.usuarioNome}` : ''
              }.`
            : ''
        }
        aviso={
          excluindo?.anexos?.length
            ? 'O comprovante anexado é excluído junto. Não há como desfazer.'
            : 'Não há como desfazer.'
        }
        rotuloConfirmar="Excluir"
        aoConfirmar={() => excluir(excluindo)}
        aoFechar={() => setExcluindo(null)}
      />
    </>
  )
}

/** O total do periodo e, sem filtro de tipo, a divisao por categoria. */
function Resumo({ dados, periodo, visao, tipo }) {
  const filtrado = tipo !== 'todos'
  return (
    <div className={`envios__resumo ${filtrado ? 'envios__resumo--so-total' : ''}`.trim()}>
      <div className="envios__total" data-categoria={filtrado ? tipo : undefined}>
        <span>
          {visao === 'ano' ? `Total de ${periodo}` : periodo}
          {filtrado && ` · ${CATEGORIAS[tipo].plural}`}
        </span>
        <strong>{reais(dados.total)}</strong>
        <em>{plural(dados.quantidade, 'envio', 'envios')}</em>
      </div>
      {!filtrado &&
        CHAVES_CATEGORIA.map((categoria) => {
          const parte = dados.categorias?.[categoria]
          return (
            <div key={categoria} className="envios__cat" data-categoria={categoria}>
              <span className="envios__caticone" aria-hidden="true">
                <IconeCategoria categoria={categoria} tamanho={18} />
              </span>
              <span className="envios__catnome">{CATEGORIAS[categoria].plural}</span>
              <strong>{reais(parte?.total ?? 0)}</strong>
              <em>{plural(parte?.quantidade ?? 0, 'envio', 'envios')}</em>
            </div>
          )
        })}
    </div>
  )
}

/** Total de cada pessoa no periodo — so quando ha mais de uma na tela. */
function PorPessoa({ pessoas, pessoaPorId, visao }) {
  return (
    <section className="envios__porpessoa" aria-label="Total por pessoa">
      <h2 className="envios__subtitulo">Por pessoa {visao === 'ano' ? 'no ano' : 'no mês'}</h2>
      <ul>
        {pessoas.map((p) => (
          <li key={p.usuarioId}>
            <Avatar nome={p.nome} foto={pessoaPorId(p.usuarioId)?.foto} tamanho={28} />
            <span className="envios__pnome">{p.nome}</span>
            <em>{plural(p.quantidade, 'envio', 'envios')}</em>
            <strong>{reais(p.total)}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Visao mensal: um bloco por dia, na ordem do calendario. */
function Mes({ dados, periodo, tipo, mostraPessoa, pessoaPorId, aoBaixar, aoExcluir }) {
  const porDia = useMemo(() => {
    const mapa = new Map()
    dados.envios.forEach((e) => {
      const lista = mapa.get(e.data) ?? []
      lista.push(e)
      mapa.set(e.data, lista)
    })
    return mapa
  }, [dados.envios])

  if (dados.dias.length === 0) {
    const nenhum = {
      todos: 'Nenhum envio',
      despesa: 'Nenhuma despesa',
      refeicao: 'Nenhuma refeição',
      bonus: 'Nenhum bônus',
    }[tipo]
    return <p className="envios__vazio">{nenhum} em {periodo.toLowerCase()}.</p>
  }

  return (
    <div className="envios__dias">
      {dados.dias.map((dia) => (
        <section key={dia.data} className="envios__dia">
          <header className="envios__diatopo">
            <h2>
              {dataBR(dia.data)} <span>{diaDaSemana(dia.data)}</span>
            </h2>
            <strong>{reais(dia.total)}</strong>
          </header>
          <ul className="envios__lista">
            {(porDia.get(dia.data) ?? []).map((envio) => (
              <ItemEnvio
                key={envio.id}
                envio={envio}
                mostraPessoa={mostraPessoa}
                foto={pessoaPorId(envio.usuarioId)?.foto}
                aoBaixar={aoBaixar}
                aoExcluir={aoExcluir}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ItemEnvio({ envio, mostraPessoa, foto, aoBaixar, aoExcluir }) {
  /* a obra e opcional: sem ela, fica so o cliente */
  const obra = [envio.clienteNome || 'Cliente removido', envio.obraProposta].filter(Boolean).join(' · ')
  const semNada = !envio.obraId && !envio.clienteNome

  return (
    <li className="envio" data-categoria={envio.categoria}>
      {mostraPessoa && (
        <Avatar nome={envio.usuarioNome} foto={foto} tamanho={34} titulo={envio.usuarioNome} className="envio__avatar" />
      )}

      <div className="envio__corpo">
        {mostraPessoa && <strong className="envio__pessoa">{envio.usuarioNome}</strong>}
        <span className="envio__titulo">
          <span className="envio__selo" data-categoria={envio.categoria}>
            {rotuloDaCategoria(envio.categoria)}
          </span>
          {rotuloDoTipo(envio.tipo)}
        </span>
        <span className={`envio__obra ${semNada ? 'is-removida' : ''}`.trim()}>
          {obra}
          {envio.obraConcluida && <em> (concluída)</em>}
          {!envio.obraId && !semNada && <em> · sem obra</em>}
        </span>
        {envio.justificativa && (
          <span className="envio__texto">
            <b>Justificativa:</b> {envio.justificativa}
          </span>
        )}
        {envio.observacao && (
          <span className="envio__texto">
            <b>Observação:</b> {envio.observacao}
          </span>
        )}
        <span className="envio__meta">Enviado em {dataHora(envio.criadoEm)}</span>
      </div>

      <div className="envio__lado">
        <strong className="envio__valor">{reais(envio.valor)}</strong>
        {envio.anexos.map((anexo) => (
          <button
            key={anexo.id}
            type="button"
            className="envio__anexo"
            onClick={() => aoBaixar(anexo)}
            title={`Baixar ${anexo.nome}`}
          >
            <IconeBaixar />
            <span>{anexo.nome}</span>
          </button>
        ))}
        {aoExcluir && (
          <button
            type="button"
            className="envio__excluir"
            onClick={() => aoExcluir(envio)}
            title="Excluir este lançamento"
            aria-label={`Excluir ${rotuloDoTipo(envio.tipo)} de ${dataBR(envio.data)}`}
          >
            <IconeLixo />
            <span>Excluir</span>
          </button>
        )}
      </div>
    </li>
  )
}

/** Visao anual: os doze meses, cada um com o seu total. */
function Ano({ dados, aoAbrirMes }) {
  return (
    <ul className="envios__meses">
      {dados.meses.map((m) => {
        const partes = CHAVES_CATEGORIA.filter((c) => m.categorias?.[c]?.quantidade > 0)
        return (
          <li key={m.mes}>
            <button
              type="button"
              className={`envios__mes ${m.quantidade === 0 ? 'is-vazio' : ''}`.trim()}
              onClick={() => aoAbrirMes(m.mes)}
            >
              <span className="envios__mesnome">{MESES[m.mes - 1]}</span>
              <span className="envios__mesdetalhe">
                {partes.length === 0
                  ? 'Nenhum envio'
                  : partes
                      .map((c) => `${CATEGORIAS[c].plural} ${reais(m.categorias[c].total)}`)
                      .join(' · ')}
              </span>
              <span className="envios__mestotal">
                Total: <strong>{reais(m.total)}</strong>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
