import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import './graficos.css'

/* ============================================================
   Graficos

   SVG de verdade, com eixo, grade e escala — nao barras de CSS.

   Tres decisoes sustentam o resto do arquivo:

   1. O SVG e desenhado no TAMANHO REAL em pixels, medido por
      ResizeObserver, e nao num viewBox que estica. Num viewBox, a
      letra do eixo estica junto com o desenho: o mesmo grafico fica
      com fonte de 9px numa coluna estreita e de 18px numa larga.
      Medindo, o texto tem 11px em qualquer largura.

   2. A escala do eixo cai em numeros REDONDOS (0, 5, 10, 15), e nao
      no maximo dos dados dividido em quatro. Eixo com marca em 8,7
      obriga a fazer conta para ler o grafico.

   3. As margens saem da largura MEDIDA, e nao de numeros fixos. Uma
      coluna de nomes de 128px que serve num cartao de 1300px corta
      "Garantia da Qual…" num de 600px — e um grafico cujo eixo nao
      se le nao compara nada.
   ============================================================ */

/** Mede o container em pixels — e o que permite desenhar no tamanho certo. */
function useLargura() {
  const caixa = useRef(null)
  const [largura, setLargura] = useState(0)

  useLayoutEffect(() => {
    const alvo = caixa.current
    if (!alvo) return undefined
    const medir = () => setLargura(alvo.clientWidth)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(alvo)
    return () => observador.disconnect()
  }, [])

  return [caixa, largura]
}

/**
 * A caixinha que segue o cursor.
 *
 * Existe porque o eixo CORTA o nome — "PR-1042 — Eurofar…" — e a dica
 * e o unico lugar onde ele aparece inteiro. O `<title>` do SVG faria o
 * mesmo, mas so depois de um segundo parado e com a tooltip do sistema
 * operacional, que ignora o tema da tela.
 */
function useDica(caixa) {
  const [dica, setDica] = useState(null)

  const seguir = useCallback(
    (evento, conteudo) => {
      const area = caixa.current?.getBoundingClientRect()
      if (!area) return
      setDica({ ...conteudo, x: evento.clientX - area.left, y: evento.clientY - area.top })
    },
    [caixa],
  )

  const sumir = useCallback(() => setDica(null), [])

  return [dica, seguir, sumir]
}

/** O balao. Fica preso dentro do grafico, mas o bico continua apontando. */
function Dica({ dados, largura }) {
  if (!dados) return null

  /* colado na borda o balao vazaria o cartao; o bico e que anda para
     continuar apontando o item */
  const x = Math.min(Math.max(dados.x, 92), Math.max(largura - 92, 92))

  return (
    <div
      className="gr__dica"
      style={{ left: x, top: dados.y, '--dica-cor': dados.cor, '--bico': `${dados.x - x}px` }}
    >
      <strong>{dados.rotulo}</strong>
      <b>
        <i />
        {dados.valor}
      </b>
      {dados.nota && <em>{dados.nota}</em>}
    </div>
  )
}

/**
 * Uma escala com marcas redondas.
 *
 * Devolve o topo do eixo e as marcas. O passo sai da familia
 * 1 / 2 / 2,5 / 5 / 10 vezes uma potencia de dez — a mesma que todo
 * eixo de grafico usa, porque sao os numeros que a cabeca divide sem
 * esforco.
 */
function escala(maximo, alvo = 4) {
  if (!(maximo > 0)) return { topo: 1, marcas: [0, 1] }
  const bruto = maximo / alvo
  const ordem = 10 ** Math.floor(Math.log10(bruto))
  const passo = ([1, 2, 2.5, 5, 10].find((m) => m * ordem >= bruto) ?? 10) * ordem
  const topo = Math.ceil(maximo / passo) * passo

  const marcas = []
  for (let v = 0; v <= topo + passo / 1000; v += passo) marcas.push(Number(v.toFixed(6)))
  return { topo, marcas }
}

/** Numero curto para o eixo: 0,5 · 3 · 12 */
const curto = (n) => {
  const v = Math.round(n * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',')
}

/** Coluna com o topo arredondado. */
function caminhoColuna({ x, y, largura, altura, raio }) {
  const r = Math.max(0, Math.min(raio, largura / 2, altura))
  if (r === 0) return `M${x} ${y}h${largura}v${altura}h${-largura}z`
  return `M${x} ${y + altura}v${-(altura - r)}a${r} ${r} 0 0 1 ${r} ${-r}h${largura - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${altura - r}z`
}

/** Corta o texto que nao cabe, com reticencias. */
function apara(texto, limite) {
  const t = String(texto ?? '')
  const n = Math.max(Math.floor(limite), 3)
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}

/** Quantos caracteres cabem em `px`, na fonte de 11,5px dos nomes. */
const cabem = (px) => px / 6.35

/**
 * A largura da coluna de nomes, a partir da largura do cartao.
 *
 * Entre 92px e 200px, e nunca mais de 26% do grafico: uma coluna de
 * nomes que come um terco da largura deixa as barras curtas demais
 * para serem comparadas, que e a unica coisa que elas fazem.
 */
const colunaDeNomes = (largura) => Math.round(Math.min(Math.max(largura * 0.26, 92), 200))

/* ============================================================
   Rosca — a fatia de um total

   Feita com stroke-dasharray num circulo, e nao com um path de arco:
   arco de 0% e arco de 100% sao os dois casos que quebram o desenho
   por caminho (um vira um ponto, o outro nao fecha), e os dois sao
   justamente os que este grafico mais mostra — "nenhuma atrasada" e
   "todas atrasadas".
   ============================================================ */

export function Rosca({ fatias, centro, rodape, tamanho = 190 }) {
  const [caixa, largura] = useLargura()
  const [dica, seguir, sumir] = useDica(caixa)

  const total = fatias.reduce((s, f) => s + f.valor, 0)
  const lado = Math.min(tamanho, Math.max(largura, 140))
  const grossura = Math.round(lado * 0.135)
  const r = lado / 2 - grossura / 2 - 2
  const volta = 2 * Math.PI * r

  let acumulado = 0

  return (
    <div className="gr gr--rosca" ref={caixa}>
      <svg width={lado} height={lado} role="img" aria-label={centro?.rotulo ?? 'Proporção'}>
        {/* o trilho: da a forma do anel mesmo quando tudo e uma fatia so */}
        <circle
          cx={lado / 2}
          cy={lado / 2}
          r={r}
          fill="none"
          stroke="var(--gr-trilho)"
          strokeWidth={grossura}
        />

        {total > 0 &&
          fatias.map((f) => {
            const fracao = f.valor / total
            /* a folga de 4px separa as fatias sem precisar de borda */
            const traco = Math.max(volta * fracao - (fatias.length > 1 ? 4 : 0), 0)
            const deslocamento = -volta * acumulado
            acumulado += fracao

            return (
              <circle
                key={f.rotulo}
                className="gr__fatia"
                cx={lado / 2}
                cy={lado / 2}
                r={r}
                fill="none"
                stroke={f.cor}
                strokeWidth={grossura}
                strokeLinecap="butt"
                strokeDasharray={`${traco} ${volta}`}
                strokeDashoffset={deslocamento}
                transform={`rotate(-90 ${lado / 2} ${lado / 2})`}
                onMouseMove={(e) =>
                  seguir(e, {
                    rotulo: f.rotulo,
                    valor: `${f.texto ?? f.valor} · ${Math.round(fracao * 100)}%`,
                    cor: f.cor,
                  })
                }
                onMouseLeave={sumir}
              />
            )
          })}

        {centro && (
          <>
            <text x={lado / 2} y={lado / 2 - 1} textAnchor="middle" className="gr__centro">
              {centro.valor}
            </text>
            <text x={lado / 2} y={lado / 2 + 19} textAnchor="middle" className="gr__centrorot">
              {centro.rotulo}
            </text>
          </>
        )}
      </svg>

      {/* legenda e rodape andam juntos: quando o cartao e largo, e
          este bloco inteiro que vai para o lado do anel */}
      <div className="gr__aparte">
        <ul className="gr__legenda">
          {fatias.map((f) => (
            <li key={f.rotulo}>
              <span className="gr__ponto" style={{ background: f.cor }} />
              {f.rotulo}
              <strong>{f.texto ?? f.valor}</strong>
              <span>{total > 0 ? `${Math.round((f.valor / total) * 100)}%` : '—'}</span>
            </li>
          ))}
        </ul>

        {rodape && <p className="gr__rodape">{rodape}</p>}
      </div>

      <Dica dados={dica} largura={largura} />
    </div>
  )
}

/* ============================================================
   Colunas com linha de media

   O tracejado da media e o que responde "essa obra demorou mais que
   o normal?" sem ninguem somar de cabeca. Sem ele, uma coluna alta e
   so uma coluna alta.

   Item com `valor: null` nao desenha coluna nenhuma — e o dia em que
   nao houve o que medir. Uma coluna de 2px ali leria como "quase
   zero", que e outra coisa. A dica continua dizendo o `texto` dele.

   `eixo` e o que vai escrito em cima da escala, quando ele nao e a
   `unidade` — o grafico em reais traz o "R$" no proprio `texto`, e
   repetir a unidade na dica sairia "R$ 41,50 R$".

   `textoCurto` e o numero escrito EM CIMA da coluna, quando o
   `texto` inteiro ("R$ 1.234,56") nao cabe na largura dela.
   ============================================================ */

export function Colunas({ itens, unidade = '', eixo = unidade, referencia = null, alturaTotal = 260 }) {
  const [caixa, largura] = useLargura()
  const [dica, seguir, sumir] = useDica(caixa)
  const gradiente = useId()

  /* A faixa da direita existe SO para o rotulo da media, e por isso
     ela so aparece quando ha media. Antes o rotulo era desenhado por
     cima do fim do grafico, e a ultima coluna ficava metade escondida
     atras dele — a coluna que a pessoa mais olha, porque e a obra
     concluida mais recente. */
  const temMedia = referencia !== null && referencia > 0
  const MARGEM = { topo: 22, direita: temMedia ? 104 : 6, baixo: 44, esquerda: 36 }
  const areaA = alturaTotal - MARGEM.topo - MARGEM.baixo
  const areaL = Math.max(largura - MARGEM.esquerda - MARGEM.direita, 10)
  const { topo, marcas } = escala(Math.max(...itens.map((i) => i.valor ?? 0), referencia ?? 0))

  const y = (v) => MARGEM.topo + areaA - (v / topo) * areaA
  const passo = areaL / Math.max(itens.length, 1)
  const grossura = Math.min(passo * 0.56, 44)
  /* o numero em cima da coluna so entra quando ha vao para ele; em
     quatorze obras estreitas os rotulos encavalam e viram sujeira */
  const mostraValor = passo >= 40

  /* De quantas em quantas colunas o eixo escreve o nome.
     Sem isso, quatorze obras num cartao de celular viravam
     "PR…PR…PR…" e as datas encostavam numa fita ilegivel. Escrevendo
     uma a cada duas (ou tres), cada nome fica com o dobro do espaco —
     e a dica continua dizendo o nome de TODAS. */
  const saltoRotulo = Math.max(1, Math.ceil(38 / passo))
  const vaoRotulo = passo * saltoRotulo
  const mostraSub = vaoRotulo >= 42

  /* um gradiente por COR, e nao por item: quatorze obras da mesma cor
     nao precisam de quatorze definicoes iguais dentro do <defs> */
  const cores = [...new Set(itens.map((i) => i.cor ?? 'var(--gr-um)'))]

  return (
    <div className="gr" ref={caixa}>
      {largura > 0 && (
        <svg width={largura} height={alturaTotal} role="img">
          <defs>
            {cores.map((cor, n) => (
              <linearGradient key={cor} id={`${gradiente}-${n}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cor} stopOpacity="1" />
                <stop offset="100%" stopColor={cor} stopOpacity="0.42" />
              </linearGradient>
            ))}
          </defs>

          {marcas.map((m) => (
            <g key={m}>
              <line
                x1={MARGEM.esquerda}
                y1={y(m)}
                x2={largura - MARGEM.direita}
                y2={y(m)}
                className={m === 0 ? 'gr__eixo' : 'gr__grade'}
              />
              <text
                x={MARGEM.esquerda - 8}
                y={y(m)}
                textAnchor="end"
                dominantBaseline="middle"
                className="gr__tick"
              >
                {curto(m)}
              </text>
            </g>
          ))}

          {eixo && (
            <text x={MARGEM.esquerda - 8} y={MARGEM.topo - 11} textAnchor="end" className="gr__sub">
              {eixo}
            </text>
          )}

          {itens.map((i, n) => {
            const cx = MARGEM.esquerda + passo * n + passo / 2
            const vazio = i.valor === null || i.valor === undefined
            const h = vazio ? 0 : Math.max((i.valor / topo) * areaA, 2)
            const cor = i.cor ?? 'var(--gr-um)'

            return (
              <g
                key={i.chave}
                className="gr__linha"
                onMouseMove={(e) =>
                  seguir(e, {
                    rotulo: i.titulo ?? i.rotulo,
                    valor: vazio ? i.texto : `${i.texto} ${unidade}`.trim(),
                    nota: i.nota,
                    cor,
                  })
                }
                onMouseLeave={sumir}
              >
                <rect
                  className="gr__realce"
                  x={cx - passo / 2 + 1}
                  y={MARGEM.topo - 14}
                  width={Math.max(passo - 2, 2)}
                  height={areaA + 14}
                  rx="8"
                />
                <rect
                  className="gr__alvo"
                  x={cx - passo / 2}
                  y={MARGEM.topo - 14}
                  width={passo}
                  height={areaA + 14 + MARGEM.baixo}
                />

                {!vazio && (
                  <path
                    className="gr__barra"
                    d={caminhoColuna({
                      x: cx - grossura / 2,
                      y: MARGEM.topo + areaA - h,
                      largura: grossura,
                      altura: h,
                      raio: 5,
                    })}
                    fill={`url(#${gradiente}-${cores.indexOf(cor)})`}
                  />
                )}

                {mostraValor && !vazio && (
                  <text
                    x={cx}
                    y={MARGEM.topo + areaA - h - 9}
                    textAnchor="middle"
                    className="gr__valor"
                  >
                    {i.textoCurto ?? i.texto}
                  </text>
                )}

                {n % saltoRotulo === 0 && (
                  <>
                    <text
                      x={cx}
                      y={alturaTotal - MARGEM.baixo + 17}
                      textAnchor="middle"
                      className="gr__nome"
                    >
                      {apara(i.rotulo, cabem(vaoRotulo - 6))}
                    </text>

                    {i.sub && mostraSub && (
                      <text
                        x={cx}
                        y={alturaTotal - MARGEM.baixo + 30}
                        textAnchor="middle"
                        className="gr__sub"
                      >
                        {i.sub}
                      </text>
                    )}
                  </>
                )}
              </g>
            )
          })}

          {/* a media: o risco atravessa a area das colunas e o rotulo
              fica DEPOIS dela, na faixa reservada — fora do caminho de
              qualquer coluna, seja qual for a altura dela */}
          {temMedia && (
            <g className="gr__referencia">
              <line
                x1={MARGEM.esquerda}
                y1={y(referencia)}
                x2={largura - MARGEM.direita + 4}
                y2={y(referencia)}
              />
              <text
                x={largura - MARGEM.direita + 10}
                y={y(referencia)}
                textAnchor="start"
                className="gr__medianum"
              >
                média
                <tspan dx="4" className="gr__medianum--forte">
                  {curto(referencia)} {curto(referencia) === '1' && unidade === 'dias' ? 'dia' : unidade}
                </tspan>
              </text>
            </g>
          )}
        </svg>
      )}

      <Dica dados={dica} largura={largura} />
    </div>
  )
}

/* ============================================================
   Linha — o valor ao longo do tempo

   A pergunta que uma linha responde e "esta melhorando?", e nenhuma
   barra responde isso: barra compara COISAS, linha compara MOMENTOS.

   Duas decisoes:

   1. O ponto e desenhado mesmo quando a serie tem um valor so. Uma
      linha entre dois pontos precisa de dois pontos, e mes sem obra
      concluida e o caso normal numa empresa pequena — sem o ponto, o
      grafico apareceria vazio dizendo que nao ha dado quando ha.

   2. Buraco na serie NAO vira linha reta por cima. Mes sem medicao e
      `null`, e a linha corta ali: emendar os dois lados inventaria um
      valor que ninguem mediu, bem no meio do desenho.
   ============================================================ */

export function Linha({ series, eixoX, unidade = '', alturaTotal = 260, larguraRotulo = 38 }) {
  const [caixa, largura] = useLargura()
  const [dica, seguir, sumir] = useDica(caixa)
  const gradiente = useId()

  const MARGEM = { topo: 20, direita: 14, baixo: 38, esquerda: 40 }
  const areaA = alturaTotal - MARGEM.topo - MARGEM.baixo
  const areaL = Math.max(largura - MARGEM.esquerda - MARGEM.direita, 10)

  const todos = series.flatMap((s) => s.pontos.filter((v) => v !== null && v !== undefined))
  const { topo, marcas } = escala(Math.max(...todos, 0))

  const y = (v) => MARGEM.topo + areaA - (v / topo) * areaA
  /* um ponto so fica no MEIO do grafico, e nao colado na esquerda */
  const x = (n) =>
    eixoX.length <= 1
      ? MARGEM.esquerda + areaL / 2
      : MARGEM.esquerda + (n / (eixoX.length - 1)) * areaL

  /* De quantos em quantos o eixo escreve o rotulo. "set/26" precisa de
     uns 38px; o numero do dia ("11") cabe em 16, e e por isso que quem
     chama diz de quanto precisa — senao um mes inteiro de dias sairia
     escrito de cinco em cinco, como se faltassem dados. */
  const passo = areaL / Math.max(eixoX.length - 1, 1)
  const salto = Math.max(1, Math.ceil(larguraRotulo / Math.max(passo, 1)))

  /** Os trechos continuos da serie — o buraco parte a linha em dois. */
  const trechos = (pontos) => {
    const saida = []
    let atual = []
    pontos.forEach((v, n) => {
      if (v === null || v === undefined) {
        if (atual.length > 0) saida.push(atual)
        atual = []
        return
      }
      atual.push({ n, v })
    })
    if (atual.length > 0) saida.push(atual)
    return saida
  }

  return (
    <div className="gr" ref={caixa}>
      {largura > 0 && (
        <svg width={largura} height={alturaTotal} role="img">
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.chave} id={`${gradiente}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.cor} stopOpacity="0.26" />
                <stop offset="100%" stopColor={s.cor} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {marcas.map((m) => (
            <g key={m}>
              <line
                x1={MARGEM.esquerda}
                y1={y(m)}
                x2={largura - MARGEM.direita}
                y2={y(m)}
                className={m === 0 ? 'gr__eixo' : 'gr__grade'}
              />
              <text
                x={MARGEM.esquerda - 8}
                y={y(m)}
                textAnchor="end"
                dominantBaseline="middle"
                className="gr__tick"
              >
                {curto(m)}
              </text>
            </g>
          ))}

          {unidade && (
            <text x={MARGEM.esquerda - 8} y={MARGEM.topo - 11} textAnchor="end" className="gr__sub">
              {unidade}
            </text>
          )}

          {eixoX.map((rotulo, n) =>
            n % salto === 0 ? (
              <text
                key={rotulo}
                x={x(n)}
                y={alturaTotal - MARGEM.baixo + 17}
                textAnchor="middle"
                className="gr__nome"
              >
                {rotulo}
              </text>
            ) : null,
          )}

          {series.map((s, i) => (
            <g key={s.chave}>
              {trechos(s.pontos).map((trecho) => {
                const d = trecho.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.n)} ${y(p.v)}`).join('')
                /* a area embaixo so entra quando ha UMA serie: com
                   quatro, os preenchimentos se cobrem e nenhuma linha
                   se le mais */
                const area =
                  series.length === 1 && trecho.length > 1
                    ? `${d}L${x(trecho[trecho.length - 1].n)} ${y(0)}L${x(trecho[0].n)} ${y(0)}Z`
                    : null
                return (
                  <g key={`${s.chave}-${trecho[0].n}`}>
                    {area && <path d={area} fill={`url(#${gradiente}-${i})`} />}
                    <path className="gr__traco" d={d} stroke={s.cor} />
                  </g>
                )
              })}

              {s.pontos.map((v, n) =>
                v === null || v === undefined ? null : (
                  <circle
                    key={n}
                    className="gr__ponto"
                    cx={x(n)}
                    cy={y(v)}
                    r="4"
                    fill={s.cor}
                    onMouseMove={(e) =>
                      seguir(e, {
                        rotulo: `${s.rotulo} · ${eixoX[n]}`,
                        valor: s.texto ? s.texto(v) : `${curto(v)} ${unidade}`.trim(),
                        cor: s.cor,
                      })
                    }
                    onMouseLeave={sumir}
                  />
                ),
              )}
            </g>
          ))}
        </svg>
      )}

      {/* a legenda so faz falta com mais de uma linha */}
      {series.length > 1 && (
        <ul className="gr__series">
          {series.map((s) => (
            <li key={s.chave}>
              <span className="gr__ponto2" style={{ background: s.cor }} />
              {s.rotulo}
            </li>
          ))}
        </ul>
      )}

      <Dica dados={dica} largura={largura} />
    </div>
  )
}
