import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import {
  PROPORCAO_HEADER,
  RECORTE_PADRAO,
  ZOOM_MAXIMO,
  areaRecortada,
  carregar,
  recortarImagem,
} from '@/utils/imagem'
import './EditorImagem.css'

/* Tamanho da saida de cada recorte. O da logo e quadrado; o do header
   sai na proporcao da faixa da obra, que e a mesma da previa. */
const SAIDA_PERFIL = 512
const SAIDA_HEADER = 1248

/* O palco da previa: a faixa da obra desenhada no tamanho REAL de uma
   tela larga e depois reduzida para caber no pop-up. E o que faz a
   previa mostrar o mesmo enquadramento que a tela da obra vai mostrar,
   em vez de um recorte parecido. */
const PALCO_L = 1040
const PALCO_A = 150

const entre = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo)

/**
 * Editor de enquadramento.
 *
 * Toda imagem que entra no sistema passa por aqui: arrasta para
 * escolher o que aparece, roda o zoom para chegar perto, e a mascara
 * mostra o resultado final enquanto se mexe — nao depois de salvar.
 *
 * O CLIENTE tem dois enquadramentos da MESMA imagem, e eles sao
 * independentes:
 *
 *   logo   — o quadrado do card e dos avatares;
 *   header — a faixa larga que abre a tela da obra.
 *
 * Sao caixas de formato muito diferente, e um recorte so nao serve para
 * as duas: o que centraliza a marca no quadrado corta o nome dela na
 * faixa. Por isso o painel da direita nao e so previa — ele E o ajuste
 * do header. Arrastar ali mexe no header e em mais nada; arrastar no
 * quadro da esquerda mexe so na logo.
 *
 * O colaborador nao tem header: a foto dele nunca abre tela nenhuma.
 * Para ele o painel da direita nao existe (`comHeader` fica falso).
 *
 * O que sai daqui em `aoConfirmar`:
 *
 *   original     — a imagem inteira, para reenquadrar depois sem
 *                  recortar o recorte anterior;
 *   imagem       — a logo/foto ja recortada (o que as telas mostram);
 *   recorte      — { cx, cy, zoom } da logo/foto;
 *   capa         — o header ja recortado (so quando comHeader);
 *   recorteCapa  — { cx, cy, zoom } do header.
 */
export default function EditorImagem({
  aberto,
  imagem,
  nome = '',
  comHeader = false,
  recorteInicial = null,
  recorteCapaInicial = null,
  nivel = 1,
  aoConfirmar,
  aoFechar,
}) {
  const [medidas, setMedidas] = useState(null)
  const [perfil, setPerfil] = useState(RECORTE_PADRAO)
  const [capa, setCapa] = useState(RECORTE_PADRAO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  /* le o tamanho da imagem uma vez: e dele que saem todas as contas */
  useEffect(() => {
    if (!aberto || !imagem) return undefined
    let vivo = true
    setErro('')
    setMedidas(null)
    carregar(imagem)
      .then((img) => vivo && setMedidas({ largura: img.width, altura: img.height }))
      .catch(() => vivo && setErro('Não foi possível ler esta imagem.'))
    return () => {
      vivo = false
    }
  }, [aberto, imagem])

  useEffect(() => {
    if (!aberto) return
    setPerfil({ ...RECORTE_PADRAO, ...(recorteInicial ?? {}) })
    setCapa({ ...RECORTE_PADRAO, ...(recorteCapaInicial ?? {}) })
    setSalvando(false)
  }, [aberto, recorteInicial, recorteCapaInicial])

  const confirmar = async () => {
    setSalvando(true)
    try {
      const [recortada, faixa] = await Promise.all([
        recortarImagem(imagem, { proporcao: 1, recorte: perfil, largura: SAIDA_PERFIL }),
        comHeader
          ? recortarImagem(imagem, {
              proporcao: PROPORCAO_HEADER,
              recorte: capa,
              largura: SAIDA_HEADER,
            })
          : Promise.resolve(null),
      ])

      await aoConfirmar?.({
        original: imagem,
        imagem: recortada,
        recorte: perfil,
        capa: faixa,
        recorteCapa: comHeader ? capa : null,
      })
      aoFechar?.()
    } catch (e) {
      setErro(e.message ?? 'Não foi possível recortar esta imagem.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      nivel={nivel}
      titulo="Ajustar imagem"
      subtitulo={comHeader ? undefined : 'Arraste para escolher o que aparece na foto.'}
      largura={comHeader ? 940 : 460}
    >
      <div className={`editimg ${comHeader ? 'editimg--duplo' : ''}`.trim()}>
        <section className="editimg__lado">
          <h3 className="editimg__rotulo">{comHeader ? 'Logo' : 'Foto de perfil'}</h3>

          <Quadro
            imagem={imagem}
            medidas={medidas}
            proporcao={1}
            recorte={perfil}
            aoMudar={setPerfil}
            redondo
            rotulo="Enquadramento da foto de perfil"
          />

          <Zoom
            valor={perfil.zoom}
            aoMudar={(zoom) => setPerfil((a) => ({ ...a, zoom }))}
            rotulo="Zoom da foto de perfil"
          />

          {/* o resultado no tamanho em que ele realmente aparece na
              lista: um recorte que parece bom em 260px pode virar um
              borrão de nada em 26 */}
          <div className="editimg__mini">
            <Miniatura imagem={imagem} medidas={medidas} recorte={perfil} tamanho={54} redondo />
            <Miniatura imagem={imagem} medidas={medidas} recorte={perfil} tamanho={34} redondo />
            <Miniatura imagem={imagem} medidas={medidas} recorte={perfil} tamanho={24} redondo />
            <span className="editimg__minitexto">como fica na lista</span>
          </div>
        </section>

        {comHeader && (
          <section className="editimg__lado editimg__lado--previa">
            <h3 className="editimg__rotulo">Header da obra</h3>

            <PreviaHeader
              imagem={imagem}
              medidas={medidas}
              nome={nome}
              recorte={capa}
              aoMudar={setCapa}
            />

            <Zoom
              valor={capa.zoom}
              aoMudar={(zoom) => setCapa((a) => ({ ...a, zoom }))}
              rotulo="Zoom do header"
            />
          </section>
        )}
      </div>

      {erro && (
        <p className="editimg__erro" role="alert">
          {erro}
        </p>
      )}

      <footer className="formobra__acoes">
        <button type="button" className="formobra__cancelar" onClick={aoFechar}>
          Cancelar
        </button>
        <Button type="button" onClick={confirmar} loading={salvando} disabled={!medidas}>
          Usar esta imagem
        </Button>
      </footer>
    </Modal>
  )
}

/* ============================================================
   O quadro que se arrasta

   A imagem e posicionada por PORCENTAGEM do proprio quadro, e nao
   por pixels: assim o mesmo recorte vale para o quadro de 260px do
   editor, para a previa reduzida e para a saida de 1248px, sem
   nenhuma conta a mais em cada lugar.
   ============================================================ */

function estiloDaImagem(medidas, proporcao, recorte) {
  if (!medidas) return { display: 'none' }
  const { largura, altura } = medidas
  const { sx, sy, sl, sa } = areaRecortada(largura, altura, proporcao, recorte)
  return {
    width: `${(largura / sl) * 100}%`,
    height: `${(altura / sa) * 100}%`,
    left: `${(-sx / sl) * 100}%`,
    top: `${(-sy / sa) * 100}%`,
  }
}

/**
 * Arrastar move o RECORTE, nao a imagem: puxar para a direita traz o
 * que estava a esquerda, que e o que a mao espera de uma foto.
 */
function useArrasto(medidas, proporcao, recorte, aoMudar) {
  const caixa = useRef(null)
  const origem = useRef(null)

  const comecar = (evento) => {
    if (!medidas) return
    const alvo = caixa.current
    if (!alvo) return
    evento.preventDefault()
    alvo.setPointerCapture?.(evento.pointerId)
    origem.current = {
      x: evento.clientX,
      y: evento.clientY,
      cx: recorte.cx ?? 0.5,
      cy: recorte.cy ?? 0.5,
      largura: alvo.clientWidth,
      altura: alvo.clientHeight,
    }
  }

  const mover = (evento) => {
    const inicio = origem.current
    if (!inicio || !medidas) return
    const { sl, sa } = areaRecortada(medidas.largura, medidas.altura, proporcao, recorte)

    /* do deslocamento na tela para o deslocamento na imagem: o quadro
       mostra `sl` pixels da imagem em `largura` pixels de tela */
    const dx = ((evento.clientX - inicio.x) * sl) / inicio.largura
    const dy = ((evento.clientY - inicio.y) * sa) / inicio.altura

    aoMudar({
      ...recorte,
      cx: entre(inicio.cx - dx / medidas.largura, 0, 1),
      cy: entre(inicio.cy - dy / medidas.altura, 0, 1),
    })
  }

  const parar = () => {
    origem.current = null
  }

  /* A roda do mouse da zoom, e para isso ela nao pode rolar a pagina
     atras. O React registra `onWheel` como passivo (preventDefault ali
     nao vale nada), entao o ouvinte e posto na mao, com passive:false.
     A ref guarda sempre a versao mais nova do que fazer — assim o
     ouvinte e registrado uma vez so e ainda enxerga o recorte atual. */
  const rolar = useRef(null)
  rolar.current = (evento) => {
    if (!medidas) return
    evento.preventDefault()
    const passo = evento.deltaY > 0 ? -0.15 : 0.15
    aoMudar({ ...recorte, zoom: entre((recorte.zoom ?? 1) + passo, 1, ZOOM_MAXIMO) })
  }

  useEffect(() => {
    const alvo = caixa.current
    if (!alvo) return undefined
    const aoRolar = (evento) => rolar.current?.(evento)
    alvo.addEventListener('wheel', aoRolar, { passive: false })
    return () => alvo.removeEventListener('wheel', aoRolar)
  }, [])

  return { caixa, comecar, mover, parar }
}

function Quadro({ imagem, medidas, proporcao, recorte, aoMudar, redondo = false, rotulo }) {
  const { caixa, comecar, mover, parar } = useArrasto(medidas, proporcao, recorte, aoMudar)

  return (
    <div
      ref={caixa}
      className={`recorte ${redondo ? 'recorte--redondo' : ''}`.trim()}
      style={{ aspectRatio: String(proporcao) }}
      onPointerDown={comecar}
      onPointerMove={mover}
      onPointerUp={parar}
      onPointerCancel={parar}
      role="application"
      aria-label={rotulo}
    >
      {imagem && <img className="recorte__img" src={imagem} alt="" style={estiloDaImagem(medidas, proporcao, recorte)} draggable={false} />}
      <span className="recorte__mascara" aria-hidden="true" />
    </div>
  )
}

/** O resultado do recorte, parado, no tamanho em que ele aparece. */
function Miniatura({ imagem, medidas, recorte, tamanho, redondo }) {
  return (
    <span
      className={`editimg__thumb ${redondo ? 'is-redondo' : ''}`.trim()}
      style={{ width: tamanho, height: tamanho }}
    >
      {imagem && (
        <img src={imagem} alt="" style={estiloDaImagem(medidas, 1, recorte)} draggable={false} />
      )}
    </span>
  )
}

function Zoom({ valor, aoMudar, rotulo }) {
  return (
    <label className="editimg__zoom">
      <span>Zoom</span>
      <input
        type="range"
        min="1"
        max={ZOOM_MAXIMO}
        step="0.01"
        value={valor ?? 1}
        onChange={(e) => aoMudar(Number(e.target.value))}
        aria-label={rotulo}
      />
    </label>
  )
}

/* ============================================================
   Previa do header

   Nao e uma ilustracao do header: e o header, desenhado na largura
   de uma tela larga (1040px) e reduzido por `scale` ate caber na
   coluna. Reduzir mantem a PROPORCAO, e proporcao e o que decide o
   que fica de fora do enquadramento — uma previa mais quadrada
   mostraria um pedaco que a tela da obra nao mostra.

   A mesma peca serve em DOIS lugares, e a diferenca esta em quem
   chama:

     no editor        — com `medidas`, `recorte` e `aoMudar`: a faixa
                        e arrastavel e E o ajuste do header;
     no cadastro      — so com `capa` (a faixa JA recortada): a faixa
                        e uma amostra parada, para a pessoa ver como
                        vai ficar ANTES de abrir o editor.

   Sem `aoMudar` nada e arrastavel: o `useArrasto` continua montado
   (hook nao pode ser condicional), mas com `aoMudar` nulo ele nao
   tem para onde mandar a mudanca.
   ============================================================ */

export function PreviaHeader({
  imagem,
  medidas = null,
  nome,
  recorte = null,
  aoMudar = null,
  /* a faixa ja recortada. Quando vem, ela e desenhada esticada na
     moldura inteira, sem conta de recorte nenhuma: o recorte ja foi
     aplicado quando a imagem foi gravada. */
  capa = null,
}) {
  const moldura = useRef(null)
  const [escala, setEscala] = useState(0.5)
  const ajustavel = typeof aoMudar === 'function'

  useLayoutEffect(() => {
    const alvo = moldura.current
    if (!alvo) return undefined
    const medir = () => setEscala(alvo.clientWidth / PALCO_L)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(alvo)
    return () => observador.disconnect()
  }, [])

  const { caixa, comecar, mover, parar } = useArrasto(
    medidas,
    PROPORCAO_HEADER,
    recorte,
    aoMudar,
  )

  const juntar = useCallback(
    (elemento) => {
      moldura.current = elemento
      caixa.current = elemento
    },
    [caixa],
  )

  const arte = capa ?? imagem

  return (
    <div
      ref={juntar}
      className={`previacapa ${ajustavel ? '' : 'previacapa--parada'}`.trim()}
      style={{ height: PALCO_A * escala }}
      onPointerDown={ajustavel ? comecar : undefined}
      onPointerMove={ajustavel ? mover : undefined}
      onPointerUp={ajustavel ? parar : undefined}
      onPointerCancel={ajustavel ? parar : undefined}
      role={ajustavel ? 'application' : 'img'}
      aria-label={
        ajustavel ? 'Enquadramento do header da obra' : 'Prévia do header da obra'
      }
    >
      <div
        className="previacapa__palco"
        style={{ width: PALCO_L, height: PALCO_A, transform: `scale(${escala})` }}
      >
        {arte && (
          <span className="previacapa__marca" aria-hidden="true">
            <img
              src={arte}
              alt=""
              /* faixa pronta: preenche a moldura. Imagem inteira: o
                 recorte decide o pedaco que aparece. */
              style={capa ? { inset: 0, width: '100%', height: '100%' } : estiloDaImagem(medidas, PROPORCAO_HEADER, recorte)}
              draggable={false}
            />
          </span>
        )}

        <div className="previacapa__texto">
          <p className="previacapa__trilha">Obras/{nome || 'Empresa'}</p>
          <h4 className="previacapa__titulo">1042/2026 - {nome || 'Empresa'}</h4>
        </div>

        <div className="previacapa__lado">
          <span className="previacapa__selo">Padrão</span>
          <p className="previacapa__desc">Descrição da obra aparece aqui.</p>
        </div>
      </div>
    </div>
  )
}
