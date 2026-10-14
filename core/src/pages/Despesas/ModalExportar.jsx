import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import Seletor from '@/components/Seletor/Seletor'
import { CampoPastilhas, CampoSelecao } from '@/components/Campo/Campo'
import { CATEGORIAS, CHAVES_CATEGORIA, MESES } from '@/domain/despesas'
import { hojeISO, reais } from '@/utils/formato'
import { exportarEnvios, rotuloDoPeriodo } from './planilhaDespesas'

/**
 * "Exportar para o Excel" da lista de Envios gerais.
 *
 * Ali ainda nao ha recorte nenhum na tela — e a lista de pessoas —,
 * entao o recorte e escolhido aqui:
 *
 *   De quem   todos os usuarios (uma aba por pessoa, mais o resumo da
 *             equipe) ou um usuario so;
 *   Periodo   um mes, um ano ou tudo o que ja foi enviado;
 *   Tipo      todos, ou so despesa, refeicao ou bonus.
 *
 * Abre no mes corrente, com todos e todos os tipos: o pedido mais comum
 * e "a planilha do mes da equipe".
 */

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

const QUEM = [
  { valor: 'todos', rotulo: 'Todos os usuários', tom: 'neutro' },
  { valor: 'um', rotulo: 'Um usuário', tom: 'neutro' },
]

const PERIODOS = [
  { valor: 'mes', rotulo: 'Mês', tom: 'neutro' },
  { valor: 'ano', rotulo: 'Ano', tom: 'neutro' },
  { valor: 'tudo', rotulo: 'Todo o período', tom: 'neutro' },
]

const TIPOS = [
  { valor: 'todos', rotulo: 'Todos', tom: 'neutro' },
  ...CHAVES_CATEGORIA.map((c) => ({ valor: c, rotulo: CATEGORIAS[c].rotulo, tom: 'neutro' })),
]

function inicial(pessoaInicial) {
  const hoje = hojeISO()
  return {
    quem: pessoaInicial ? 'um' : 'todos',
    pessoa: pessoaInicial ?? '',
    periodo: 'mes',
    mes: Number(hoje.slice(5, 7)),
    ano: Number(hoje.slice(0, 4)),
    tipo: 'todos',
  }
}

export default function ModalExportar({ aberto, aoFechar, pessoas = [], aoExportado }) {
  const [form, setForm] = useState(() => inicial())
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState(false)

  /* toda vez que abre, volta ao pedido mais comum */
  useEffect(() => {
    if (aberto) {
      setForm(inicial())
      setErro('')
    }
  }, [aberto])

  const mudar = (campo) => (valor) => {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErro('')
  }

  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 7 }, (_, i) => anoAtual - 6 + i).map((a) => ({
    valor: String(a),
    rotulo: String(a),
  }))

  const periodo =
    form.periodo === 'mes'
      ? { mes: `${form.ano}-${String(form.mes).padStart(2, '0')}` }
      : form.periodo === 'ano'
        ? { ano: form.ano }
        : {}

  const pessoa = pessoas.find((p) => p.usuarioId === String(form.pessoa))

  const exportar = async (evento) => {
    evento.preventDefault()
    if (form.quem === 'um' && !pessoa) {
      setErro('Escolha o usuário.')
      return
    }
    setGerando(true)
    setErro('')
    try {
      const { envios, total } = await exportarEnvios({
        usuarios: form.quem === 'todos' ? 'todos' : [pessoa.usuarioId],
        categoria: form.tipo === 'todos' ? undefined : form.tipo,
        periodo,
        quem: pessoa?.nome,
      })
      aoExportado?.(
        `Planilha gerada — ${form.quem === 'todos' ? 'todos os usuários' : pessoa.nome}, ${rotuloDoPeriodo(
          periodo,
        ).toLowerCase()}: ${plural(envios, 'envio', 'envios')}, ${reais(total)}.`,
      )
      aoFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Exportar para o Excel" largura={500}>
      <form className="formdesp" onSubmit={exportar} noValidate>
        <CampoPastilhas
          rotulo="De quem"
          valor={form.quem}
          aoMudar={mudar('quem')}
          opcoes={QUEM}
          dica={
            form.quem === 'todos'
              ? 'Uma aba de resumo com o total de cada pessoa, e uma aba com os envios de cada uma.'
              : undefined
          }
        />

        {form.quem === 'um' && (
          <CampoSelecao
            rotulo="Usuário"
            value={form.pessoa}
            onChange={(e) => mudar('pessoa')(e.target.value)}
            opcoes={pessoas.map((p) => ({ valor: p.usuarioId, rotulo: p.nome }))}
            vazio="Escolha quem..."
          />
        )}

        <CampoPastilhas rotulo="Período" valor={form.periodo} aoMudar={mudar('periodo')} opcoes={PERIODOS} />

        {form.periodo !== 'tudo' && (
          <div className="formdesp__par">
            {form.periodo === 'mes' && (
              <Seletor
                largo
                valor={String(form.mes)}
                aoMudar={(m) => mudar('mes')(Number(m))}
                opcoes={MESES.map((nome, i) => ({ valor: String(i + 1), rotulo: nome }))}
                aria-label="Mês"
              />
            )}
            <Seletor
              largo
              valor={String(form.ano)}
              aoMudar={(a) => mudar('ano')(Number(a))}
              opcoes={anos}
              aria-label="Ano"
            />
          </div>
        )}

        <CampoPastilhas rotulo="Tipo" valor={form.tipo} aoMudar={mudar('tipo')} opcoes={TIPOS} />

        {erro && (
          <p className="formdesp__erro" role="alert">
            {erro}
          </p>
        )}

        <footer className="formobra__acoes">
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={gerando}>
            Exportar
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
