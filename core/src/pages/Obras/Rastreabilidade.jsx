import { useEffect, useMemo, useState } from 'react'
import Avatar from '@/components/Avatar/Avatar'
import { useDados } from '@/context/DadosContext'
import { cargosDoCheck, chaveDoCargo } from '@/domain/obras'
import { useTheme } from '@/context/ThemeContext'
import { textoSobre } from '@/utils/cor'
import { dataHora } from '@/utils/formato'
import './Rastreabilidade.css'

/**
 * A ficha completa da obra: tudo o que aconteceu nela, em ordem.
 *
 * Quem marcou cada check e a que horas, o que foi conversado no chat, o que
 * foi observado, os avisos que sairam, os anexos e as notas.
 *
 * Tudo isso ja estava no banco, so que espalhado por quatro pop-ups
 * diferentes. Aqui vira uma linha do tempo unica, do mais antigo para o mais
 * novo — que e como se lembra de uma obra: pela ordem em que aconteceu.
 *
 * Vale para QUALQUER obra, aberta ou fechada. Na fechada ela e o registro do
 * que foi feito; na aberta, o acompanhamento de quem esta segurando o que —
 * e a pergunta ("quem marcou isso?") e a mesma nos dois casos.
 *
 * O chat vem por chamada propria (nao entra na carga do quadro, que ficaria
 * pesada) e so quando esta tela abre.
 */

const Icone = {
  check: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  ),
  chat: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
    </svg>
  ),
  nota: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 11h8M8 15h5" />
    </svg>
  ),
  aviso: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 15V10a6 6 0 1 0-12 0v5l-1.5 2.5h15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  ),
  anexo: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.8 1.8 0 0 1-2.5-2.5l7.4-7.4" />
    </svg>
  ),
  estrela: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.99 6.75 19.75l1-5.85L3.5 9.75l5.9-.85z" />
    </svg>
  ),
}

/* Os filtros que NAO dependem do roteiro. Os das etapas entram no meio
   deles, montados a partir da obra — ver `filtros`, mais abaixo. */
const FILTROS_FIXOS = [
  { id: 'chat', rotulo: 'Chat' },
  { id: 'nota', rotulo: 'Observações' },
  { id: 'aviso', rotulo: 'Avisos' },
  { id: 'avaliacao', rotulo: 'Avaliações' },
  { id: 'anexo', rotulo: 'Anexos' },
]

/** Ordena por data; sem data vai para o fim, nunca some da lista. */
function porData(a, b) {
  if (!a.quando) return 1
  if (!b.quando) return -1
  return String(a.quando).localeCompare(String(b.quando))
}

export default function Rastreabilidade({ obra, roteiro }) {
  const { cargos, pessoaPorId, cargoPorChave, corDoCargo, nomeDoCargo, carregarChat, rotuloEtapa } =
    useDados()
  const { isDark } = useTheme()

  const [mensagens, setMensagens] = useState([])
  const [carregandoChat, setCarregandoChat] = useState(true)
  const [filtro, setFiltro] = useState('tudo')
  /* o setor e um filtro SEPARADO, e nao mais um chip na mesma linha:
     os dois se cruzam ("o que o Comercial fez na 2ª Etapa"), e chip
     que se cruza com chip vizinho na mesma fila nao se le */
  const [setor, setSetor] = useState('todos')

  useEffect(() => {
    let vivo = true
    setCarregandoChat(true)
    carregarChat(obra.id)
      /* `carregarChat` ja devolve a LISTA — o `{ mensagens }` do
         servidor e desembrulhado no serviço. Aqui se lia
         `resposta.mensagens` de um array, que e sempre undefined: o
         chat nunca aparecia na ficha, e o filtro "Chat" ficava zerado
         em toda obra (chip zerado nao e desenhado, entao nem dava para
         desconfiar). */
      .then((lista) => {
        if (vivo) setMensagens(Array.isArray(lista) ? lista : (lista?.mensagens ?? []))
      })
      .catch(() => {
        /* sem chat a linha do tempo continua valendo: o resto ja veio na
           carga do quadro */
      })
      .finally(() => {
        if (vivo) setCarregandoChat(false)
      })
    return () => {
      vivo = false
    }
  }, [obra.id, carregarChat])

  /**
   * Todos os acontecimentos, de qualquer origem, numa lista so.
   *
   * Cada um vira { tipo, quando, quem, titulo, corpo, extra, setores } —
   * dai a pintura e uma so, em vez de seis listas parecidas lado a lado.
   *
   * ---- `setores`: de quem e cada acontecimento ----
   *
   * E por ele que o filtro de setor corta a lista, e ele guarda TODOS
   * os setores a que o acontecimento pertence, nao um so:
   *
   *   check       — o setor dono do check no roteiro E o setor de quem
   *                 marcou. Numa emergencia qualquer um pode marcar, e
   *                 ficar so com o dono esconderia o que o Tecnico
   *                 fez; ficar so com quem marcou esconderia o check
   *                 do Comercial que o Tecnico resolveu por ele. Com
   *                 os dois, nenhuma das duas perguntas perde resposta.
   *   chat / nota / anexo — o setor de quem escreveu ou enviou;
   *   aviso       — os setores COBRADOS, que e do que o aviso trata;
   *   avaliacao   — nenhum: nota de obra nao e de setor nenhum, e ela
   *                 sai da lista quando um setor esta escolhido.
   */
  const linha = useMemo(() => {
    const itens = []

    /** O setor de uma pessoa, pelo id. */
    const setorDe = (id) => {
      const chave = chaveDoCargo(pessoaPorId(id))
      return chave ? [chave] : []
    }

    /* ---- checks: quem marcou o que, e a que horas ---- */
    roteiro.forEach((etapa) => {
      etapa.cards?.forEach((card) => {
        card.checks?.forEach((check) => {
          const marca = obra.checks?.[check.id]
          if (!marca) return
          const pessoa = pessoaPorId(marca.feitoPor)
          itens.push({
            chave: `check-${check.id}`,
            tipo: 'check',
            /* de qual etapa este check veio. É o que o filtro por etapa
               usa para separar "[1ª Etapa]" de "[2ª Etapa]" — antes
               havia um filtro só, "Checks", que jogava as cinco etapas
               na mesma pilha e não respondia à pergunta que se faz
               olhando a ficha: "o que aconteceu na 3ª?". */
            etapa: etapa.numero,
            setores: [...new Set([...cargosDoCheck(check, card), ...setorDe(marca.feitoPor)])],
            quando: marca.feitoEm,
            quem: pessoa?.nome ?? 'Usuário removido',
            foto: pessoa?.foto,
            /* check de pergunta: a resposta vai junto ("Hospedagem — Não") */
            titulo:
              check.simNao && typeof marca.resposta === 'boolean'
                ? `${check.titulo} — ${marca.resposta ? 'Sim' : 'Não'}`
                : check.titulo,
            corpo: `${rotuloEtapa(etapa.numero)} · ${
              card.titulo || card.cargos?.map((c) => nomeDoCargo(c)).join(', ') || 'card'
            }`,
          })
        })
      })
    })

    /* ---- observacoes ---- */
    obra.observacoes?.forEach((o) => {
      const autor = pessoaPorId(o.autorId)
      itens.push({
        chave: `obs-${o.id}`,
        tipo: 'nota',
        setores: setorDe(o.autorId),
        quando: o.enviadaEm,
        quem: o.autorNome,
        foto: autor?.foto,
        titulo: 'Observação',
        corpo: o.texto,
        extra: o.editadaEm ? `editada em ${dataHora(o.editadaEm)}` : null,
      })
    })

    /* ---- chat ---- */
    mensagens.forEach((m) => {
      const autor = pessoaPorId(m.autorId)
      itens.push({
        chave: `msg-${m.id}`,
        tipo: 'chat',
        setores: setorDe(m.autorId),
        quando: m.enviadaEm,
        quem: m.autorNome,
        foto: autor?.foto,
        titulo: 'Mensagem no chat',
        corpo: m.texto,
        extra: m.arquivo ? `arquivo: ${m.arquivo.nome}` : null,
      })
    })

    /* ---- avisos aos setores ---- */
    obra.avisos?.forEach((a) => {
      itens.push({
        chave: `aviso-${a.id}`,
        tipo: 'aviso',
        setores: a.setores ?? [],
        quando: a.enviadoEm,
        quem: a.enviadoPorNome ?? 'Sistema',
        titulo: `Aviso para ${a.setores.map((s) => cargoPorChave(s)?.nome ?? s).join(', ')}`,
        corpo: a.mensagem || `Pendência na ${rotuloEtapa(a.etapa)}.`,
      })
    })

    /* ---- avaliacoes ---- */
    obra.notas?.forEach((n) => {
      itens.push({
        chave: `nota-${n.id}`,
        tipo: 'avaliacao',
        setores: [],
        quando: n.avaliadaEm,
        quem: n.rotulo,
        titulo: `Nota ${Number(n.nota).toFixed(1)} — ${n.rotulo}`,
        corpo: n.descricao || null,
      })
    })

    /* ---- anexos ---- */
    obra.anexos?.forEach((a) => {
      itens.push({
        chave: `anexo-${a.id}`,
        tipo: 'anexo',
        setores: setorDe(a.enviadoPor),
        quando: a.enviadoEm ?? a.criadoEm,
        quem: a.autorNome ?? '—',
        titulo: a.nome,
        corpo: 'Documento anexado à obra',
      })
    })

    return itens.sort(porData)
  }, [obra, roteiro, mensagens, pessoaPorId, cargoPorChave, nomeDoCargo, rotuloEtapa])

  /**
   * Os filtros do topo, na ordem em que se leem:
   *
   *   [Tudo] [1ª Etapa] [2ª Etapa] ... [Chat] [Observações] [Avisos] ...
   *
   * As etapas vêm do roteiro DESTA obra, e por isso são quantas ela
   * tiver — uma obra de cinco etapas mostra cinco chips, e uma que
   * ganhou a sexta em maio mostra seis. Elas ocupam o lugar do antigo
   * filtro "Checks", que existia sozinho e não separava nada.
   */
  const filtros = useMemo(
    () => [
      { id: 'tudo', rotulo: 'Tudo' },
      ...roteiro.map((e) => ({
        id: `etapa-${e.numero}`,
        /* o chip leva o NOME da etapa ("Comercial"), o mesmo que o card
           dela mostra no quadro; sem nome, cai no rótulo por posição */
        rotulo: e.nome || rotuloEtapa(e.numero),
        etapa: e.numero,
        /* a descrição ("aguardando aprovação") não cabe no chip, mas
           cabe na dica */
        dica: e.descricao || rotuloEtapa(e.numero),
      })),
      ...FILTROS_FIXOS,
    ],
    [roteiro, rotuloEtapa],
  )

  /**
   * Os dois cortes, cada um numa funcao — e e isso que permite
   * CRUZAR os filtros: "o que o Comercial fez na 2ª Etapa" e o
   * resultado de aplicar os dois na mesma lista.
   */
  const casaFiltro = (item) => {
    if (filtro === 'tudo') return true
    if (filtro.startsWith('etapa-')) {
      return item.tipo === 'check' && item.etapa === Number(filtro.slice(6))
    }
    return item.tipo === filtro
  }

  const casaSetor = (item) => setor === 'todos' || item.setores?.includes(setor)

  const visiveis = useMemo(
    () => linha.filter((i) => casaFiltro(i) && casaSetor(i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linha, filtro, setor],
  )

  /**
   * Quantos de cada chip — e o numero que ele mostra.
   *
   * Cada linha conta o que sobraria depois de aplicar a OUTRA: os
   * chips de tipo/etapa contam sobre o setor ja escolhido, e os de
   * setor contam sobre o tipo ja escolhido. Assim o numero do chip e
   * sempre o tamanho da lista que ele vai abrir — contar sobre a
   * lista inteira faria um chip prometer 12 e entregar 3.
   */
  const contagem = useMemo(() => {
    const base = linha.filter(casaSetor)
    const mapa = { tudo: base.length }
    base.forEach((i) => {
      mapa[i.tipo] = (mapa[i.tipo] ?? 0) + 1
      if (i.tipo === 'check' && i.etapa) {
        const chave = `etapa-${i.etapa}`
        mapa[chave] = (mapa[chave] ?? 0) + 1
      }
    })
    return mapa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linha, setor])

  /**
   * A linha de setores: so os que REALMENTE aparecem nesta obra.
   *
   * Uma obra do Comercial nao precisa oferecer um chip de Excelencia
   * que abriria uma lista vazia. A ordem e a da configuracao da
   * empresa, a mesma dos filtros do quadro.
   */
  const setoresDaObra = useMemo(() => {
    const base = linha.filter(casaFiltro)
    const conta = {}
    base.forEach((i) => i.setores?.forEach((s) => (conta[s] = (conta[s] ?? 0) + 1)))

    const presentes = new Set(linha.flatMap((i) => i.setores ?? []))
    const ordenados = [
      ...cargos.filter((c) => presentes.has(c.chave)).map((c) => c.chave),
      /* setor que saiu da configuracao, mas continua carimbado na
         obra: entra no fim, para o historico nao perder linha */
      ...[...presentes].filter((s) => !cargos.some((c) => c.chave === s)),
    ]

    return ordenados.map((chave) => ({
      chave,
      rotulo: cargoPorChave(chave)?.nome ?? chave,
      /* a cor ja ajustada ao tema, a mesma que o resto da tela usa
         para este setor */
      cor: corDoCargo(chave),
      quantos: conta[chave] ?? 0,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linha, filtro, cargos, cargoPorChave, corDoCargo])

  return (
    <section className="rastro vidro">
      <header className="rastro__topo">
        <div className="rastro__cabeca">
          <h2 className="rastro__titulo">Rastreabilidade</h2>
          {(filtro !== 'tudo' || setor !== 'todos') && (
            <button
              type="button"
              className="rastro__limpar"
              onClick={() => {
                setFiltro('tudo')
                setSetor('todos')
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Duas linhas, uma por pergunta: em cima "o que aconteceu",
            embaixo "de quem foi". Elas se cruzam — escolher a 2ª
            Etapa e o Comercial mostra o que o Comercial fez na 2ª. */}
        <div className="rastro__grupo">
          <span className="rastro__legenda">Etapa</span>
          <div className="rastro__filtros">
            {filtros.map((f) => {
              const quantos = contagem[f.id] ?? 0
              /* o chip escolhido nunca some, mesmo zerado pelo setor:
                 sumindo, nao sobraria como desfazer a escolha */
              if (f.id !== 'tudo' && quantos === 0 && filtro !== f.id) return null
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`chip ${filtro === f.id ? 'is-atual' : ''}`.trim()}
                  onClick={() => setFiltro(f.id)}
                  aria-pressed={filtro === f.id}
                  title={f.dica}
                >
                  {f.rotulo}
                  <em className="rastro__quantos">{quantos}</em>
                </button>
              )
            })}
          </div>
        </div>

        {setoresDaObra.length > 0 && (
          <div className="rastro__grupo">
            <span className="rastro__legenda">Setor</span>
            <div className="rastro__filtros">
              <button
                type="button"
                className={`chip ${setor === 'todos' ? 'is-atual' : ''}`.trim()}
                onClick={() => setSetor('todos')}
                aria-pressed={setor === 'todos'}
              >
                Todos
                <em className="rastro__quantos">{visiveis.length}</em>
              </button>

              {setoresDaObra.map((s) => {
                if (s.quantos === 0 && setor !== s.chave) return null
                return (
                  <button
                    key={s.chave}
                    type="button"
                    className={`chip rastro__setor ${setor === s.chave ? 'is-atual' : ''}`.trim()}
                    /* --tom/--tom-fg sao o que a pastilha ligada usa
                       de fundo em toda a tela; --setor-cor pinta o
                       ponto enquanto ela esta desligada */
                    style={{
                      '--setor-cor': s.cor,
                      '--tom': s.cor,
                      '--tom-fg': textoSobre(s.cor, isDark),
                    }}
                    onClick={() => setSetor((atual) => (atual === s.chave ? 'todos' : s.chave))}
                    aria-pressed={setor === s.chave}
                    title={`Só o que é do setor ${s.rotulo}`}
                  >
                    {s.rotulo}
                    <em className="rastro__quantos">{s.quantos}</em>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </header>

      {carregandoChat && <p className="rastro__vazio">Carregando o histórico...</p>}

      {!carregandoChat && visiveis.length === 0 && (
        <p className="rastro__vazio">Nada registrado nesta seleção.</p>
      )}

      <ol className="rastro__linha">
        {visiveis.map((item) => {
          const Glifo = Icone[item.tipo === 'avaliacao' ? 'estrela' : item.tipo] ?? Icone.nota
          return (
            <li key={item.chave} className="rastro__item" data-tipo={item.tipo}>
              <span className="rastro__marca" aria-hidden="true">
                <Glifo />
              </span>

              <div className="rastro__corpo">
                <p className="rastro__cabeca">
                  <strong className="rastro__nome">{item.titulo}</strong>
                  <time className="rastro__quando">
                    {item.quando ? dataHora(item.quando) : 'sem data'}
                  </time>
                </p>

                {item.corpo && <p className="rastro__texto">{item.corpo}</p>}

                <p className="rastro__rodape">
                  {item.foto !== undefined || item.quem ? (
                    <span className="rastro__quem">
                      {item.foto !== undefined && (
                        <Avatar nome={item.quem} foto={item.foto} tamanho={18} />
                      )}
                      {item.quem}
                    </span>
                  ) : null}
                  {item.extra && <em className="rastro__extra">{item.extra}</em>}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
