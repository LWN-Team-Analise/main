import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Seletor from '@/components/Seletor/Seletor'
import { CampoTexto } from '@/components/Campo/Campo'
import '@/pages/Obras/ModalRoteiro.css'

/**
 * O prazo de um check, NESTA obra.
 *
 * So abre para quem tem `definir_prazos` ("Pode definir prazo para
 * checks") — a tela nem mostra o botao sem ela, e a API recusa do mesmo
 * jeito. Salvar vazio, ou "Tirar prazo", apaga.
 *
 * Dois jeitos de chegar aqui:
 *   - pelo calendario de UM check: `alvo` ja diz qual e
 *     — { tipo: 'check', id, nome, prazo };
 *   - pelo "Prazos dos checks" da etapa: `alvo.checks` traz a lista
 *     [{ id, rotulo, prazo }] e a pessoa ESCOLHE o check, depois a data.
 *     O prazo fica gravado naquele check especifico.
 *
 * `aoSalvar(prazo, id)` recebe a data ('' tira) e o id do alvo.
 */
export default function ModalPrazo({ aberto, alvo, aoSalvar, aoFechar }) {
  const escolhendo = Array.isArray(alvo?.checks)
  const [alvoId, setAlvoId] = useState('')
  const [data, setData] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const prazoDe = (id) =>
    escolhendo
      ? (alvo.checks.find((c) => String(c.id) === String(id))?.prazo ?? '')
      : (alvo?.prazo ?? '')

  useEffect(() => {
    if (!aberto) return
    const inicial = alvo?.id ?? (escolhendo ? (alvo.checks[0]?.id ?? '') : '')
    setAlvoId(inicial ? String(inicial) : '')
    setData(prazoDe(inicial))
    setErro('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, alvo])

  const prazoAtual = prazoDe(alvoId)

  const gravar = async (valor) => {
    if (escolhendo && !alvoId) {
      setErro('Escolha o check.')
      return
    }
    setSalvando(true)
    try {
      await aoSalvar(valor, alvoId || alvo?.id)
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={escolhendo ? 'Prazo de um check' : prazoAtual ? 'Alterar prazo' : 'Definir prazo'}
      subtitulo={
        escolhendo
          ? alvo?.nome
          : alvo
            ? `Check: ${alvo.nome}`
            : undefined
      }
      largura={440}
    >
      <form
        className="formrot"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          gravar(data)
        }}
      >
        {escolhendo && (
          <div>
            <label className="formrot__rotulo">Check</label>
            <Seletor
              largo
              valor={alvoId}
              aoMudar={(id) => {
                setAlvoId(String(id))
                setData(prazoDe(id))
              }}
              vazio="Escolha o check..."
              aria-label="Check que recebe o prazo"
              opcoes={alvo.checks.map((c) => ({ valor: String(c.id), rotulo: c.rotulo }))}
            />
          </div>
        )}

        <CampoTexto
          rotulo="Data limite"
          type="date"
          largo
          value={data}
          onChange={(e) => setData(e.target.value)}
          autoFocus={!escolhendo}
        />

        {erro && (
          <p className="formrot__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes">
          {prazoAtual && (
            <button
              type="button"
              className="formrot__apagar"
              onClick={() => gravar('')}
              disabled={salvando}
            >
              Tirar prazo
            </button>
          )}
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={salvando} disabled={!data && !prazoAtual}>
            Salvar prazo
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
