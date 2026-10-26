import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoDinheiro } from '@/components/Campo/Campo'
import { CATEGORIAS, CHAVES_CATEGORIA } from '@/domain/despesas'
import * as despesasApi from '@/services/despesasService'

/**
 * Os VALORES PRE-DEFINIDOS do reembolso — o botao "Valores
 * pré-definidos" da aba, para quem tem `definir_valores_reembolso`.
 *
 * Uma linha por tipo, agrupada pela categoria:
 *
 *   pre-definido  a caixa marcada: o valor aqui e o de todo envio
 *                 daquele tipo (a pessoa ve o numero travado);
 *   digitado      a caixa desmarcada: quem envia digita o valor.
 *
 * Os que ja eram pre-definidos (almoco, janta, bonus apartamento)
 * mudam de valor; os outros podem passar a ser — ou nao. Salvar vale
 * para os envios daqui em diante: o que ja foi enviado guarda o valor
 * do dia.
 */
export default function ModalValores({ aberto, valores, aoFechar, aoSalvo }) {
  /* tipo -> centavos (pre-definido) ou null (digitado) */
  const [linhas, setLinhas] = useState({})
  const [erro, setErro] = useState('')
  const [errosTipo, setErrosTipo] = useState({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    const inicial = {}
    CHAVES_CATEGORIA.forEach((categoria) =>
      CATEGORIAS[categoria].tipos.forEach(({ chave }) => {
        inicial[chave] = typeof valores?.[chave] === 'number' ? Math.round(valores[chave] * 100) : null
      }),
    )
    setLinhas(inicial)
    setErro('')
    setErrosTipo({})
  }, [aberto, valores])

  const marcar = (chave, ligado) => {
    setLinhas((atual) => ({ ...atual, [chave]: ligado ? (atual[chave] ?? 0) : null }))
    setErrosTipo((atual) => ({ ...atual, [chave]: undefined }))
  }

  const salvar = async (evento) => {
    evento.preventDefault()
    const faltam = {}
    Object.entries(linhas).forEach(([chave, centavos]) => {
      if (centavos !== null && !(centavos > 0)) faltam[chave] = 'Informe o valor.'
    })
    setErrosTipo(faltam)
    if (Object.keys(faltam).length) return

    setSalvando(true)
    setErro('')
    try {
      const tabela = Object.fromEntries(
        Object.entries(linhas)
          .filter(([, centavos]) => centavos !== null)
          .map(([chave, centavos]) => [chave, (centavos / 100).toFixed(2)]),
      )
      const salvo = await despesasApi.salvarValores(tabela)
      aoSalvo(salvo)
      aoFechar()
    } catch (e) {
      if (e.campo) setErrosTipo({ [e.campo]: e.message })
      else setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Valores pré-definidos"
      largura={560}
    >
      <form className="valores" onSubmit={salvar} noValidate>
        {CHAVES_CATEGORIA.map((categoria) => (
          <fieldset key={categoria} className="valores__grupo">
            <legend>{CATEGORIAS[categoria].plural}</legend>
            {CATEGORIAS[categoria].tipos.map(({ chave, rotulo }) => {
              const ligado = linhas[chave] !== null && linhas[chave] !== undefined
              return (
                <div key={chave} className={`valores__linha ${ligado ? 'is-ligado' : ''}`.trim()}>
                  <label className="valores__marca">
                    <input type="checkbox" checked={ligado} onChange={(e) => marcar(chave, e.target.checked)} />
                    <strong>{rotulo}</strong>
                  </label>
                  {ligado && (
                    <CampoDinheiro
                      aria-label={`Valor de ${rotulo}`}
                      centavos={linhas[chave] || null}
                      aoMudar={(novo) => {
                        setLinhas((atual) => ({ ...atual, [chave]: novo ?? 0 }))
                        setErrosTipo((atual) => ({ ...atual, [chave]: undefined }))
                      }}
                      erro={errosTipo[chave]}
                    />
                  )}
                </div>
              )
            })}
          </fieldset>
        ))}

        <p className="valores__nota">Vale para os próximos envios. O que já foi enviado continua com o valor do dia.</p>

        {erro && (
          <p className="formdesp__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={salvando}>
            Salvar valores
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
