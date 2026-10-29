import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import { useDados } from '@/context/DadosContext'
import {
  CATEGORIAS,
  CHAVES_CATEGORIA,
  PERIODOS_PADRAO,
  VALORES_FIXOS,
  inicioDoPeriodo,
  mesDoPeriodo,
  rotuloDoTipo,
  valorFixo,
} from '@/domain/despesas'
import * as despesasApi from '@/services/despesasService'
import { dataBR, reais } from '@/utils/formato'
import ModalEnvio from './ModalEnvio'
import ModalValores from './ModalValores'
import { IconeCategoria, IconeEquipe, IconeLista, IconeValores } from './icones'
import './Despesas.css'

/* A linha de baixo de cada botao: o que entra ali, em poucas palavras.
   A da refeicao diz o valor quando almoco e janta tem o mesmo, pre-definido. */
function descricao(categoria, valores) {
  if (categoria === 'despesa') return 'Transporte, combustível e outros gastos'
  if (categoria === 'bonus') return 'Bônus viagem ou bônus apartamento'
  const almoco = valorFixo('almoco', valores)
  return almoco !== null && almoco === valorFixo('janta', valores)
    ? `Almoço ou janta — ${reais(almoco)}`
    : 'Almoço ou janta'
}

const ENVIADO = {
  despesa: 'Despesa enviada',
  refeicao: 'Refeição enviada',
  bonus: 'Bônus enviado',
}

/**
 * A porta de entrada do Reembolso (a aba se chamava Despesas): tres
 * botoes lado a lado, um por categoria, e "Meus envios" centralizado
 * embaixo deles. Para quem tem `definir_valores_reembolso`, o
 * "Valores pré-definidos" no canto de cima, a direita: almoco, janta,
 * bonus apartamento e qualquer outro tipo que passe a ter valor fixo,
 * e o periodo de cada categoria (a refeicao do dia 26 ao dia 25).
 *
 * Os formularios abrem em pop-up, por cima desta tela — enviar e um
 * gesto rapido, e voltar para ca depois dele e voltar para os tres
 * botoes, pronto para o proximo envio.
 */
export default function Despesas() {
  const { pode } = useDados()
  const [abrindo, setAbrindo] = useState(null)
  /* o recado do ultimo envio, que fica ate a pessoa fechar ou enviar outro */
  const [enviado, setEnviado] = useState(null)
  /* ver a aba e uma permissao; ENVIAR e outra (alterar_despesas). Sem
     ela os tres botoes nao aparecem — e a API recusa o envio igual */
  const envia = pode('alterar_despesas')
  /* as tabelas dos valores pre-definidos e dos periodos (o banco manda;
     o padrao vale ate elas chegarem) */
  const [valores, setValores] = useState(VALORES_FIXOS)
  const [periodos, setPeriodos] = useState(PERIODOS_PADRAO)
  const [editandoValores, setEditandoValores] = useState(false)

  const guardarTabelas = (tabelas) => {
    setValores(tabelas.valores)
    setPeriodos(tabelas.periodos)
  }

  useEffect(() => {
    let vivo = true
    despesasApi
      .carregarValores()
      .then((tabelas) => vivo && guardarTabelas(tabelas))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  return (
    <AppShell>
      {/* o "Valores pré-definidos" fica no canto de cima, à direita da tela */}
      <div className="despesas__pagina">
        {pode('definir_valores_reembolso') && (
          <button
            type="button"
            className="acao acao--fraca despesas__valores"
            onClick={() => setEditandoValores(true)}
          >
            <IconeValores />
            Valores pré-definidos
          </button>
        )}
        <section className="despesas">
          <header className="despesas__topo">
            <h1 className="tela__titulo">Reembolso</h1>
            <p className="tela__lead">
              {envia
                ? 'Envie suas despesas, refeições e bônus. Tudo o que você envia fica em Meus envios.'
                : 'Acompanhe em Meus envios o que você já enviou.'}
            </p>
          </header>

          {enviado && (
            <p className="recado despesas__recado" role="status">
              <span>
                <strong>{ENVIADO[enviado.categoria]}</strong>: {rotuloDoTipo(enviado.tipo)} de{' '}
                {dataBR(enviado.data)}, {reais(enviado.valor)}.{' '}
                {/* abre no mes do periodo do envio: a refeicao de 28/10, com
                    o periodo comecando no dia 26, esta em novembro */}
                <Link
                  to={`/app/despesas/envios?mes=${mesDoPeriodo(
                    enviado.data,
                    inicioDoPeriodo(enviado.categoria, periodos),
                  )}`}
                >
                  Ver em Meus envios
                </Link>
              </span>
              <button type="button" onClick={() => setEnviado(null)} aria-label="Fechar aviso">
                ×
              </button>
            </p>
          )}

          {envia && (
            <div className="despesas__acoes">
              {CHAVES_CATEGORIA.map((categoria) => (
                <button
                  key={categoria}
                  type="button"
                  className="despesas__botao"
                  data-categoria={categoria}
                  onClick={() => setAbrindo(categoria)}
                >
                  <span className="despesas__icone" aria-hidden="true">
                    <IconeCategoria categoria={categoria} />
                  </span>
                  <strong>{CATEGORIAS[categoria].enviar}</strong>
                  <span className="despesas__descricao">{descricao(categoria, valores)}</span>
                </button>
              ))}
            </div>
          )}

          {/* "Envios gerais" so para quem revisa — e a API recusa quem nao
              revisa do mesmo jeito, com ou sem o botao na tela */}
          <div className="despesas__links">
            <Link to="/app/despesas/envios" className="acao acao--fraca despesas__envios">
              <IconeLista />
              Meus envios
            </Link>
            {pode('revisar_despesa_geral') && (
              <Link to="/app/despesas/gerais" className="acao acao--fraca despesas__envios">
                <IconeEquipe />
                Envios gerais
              </Link>
            )}
          </div>
        </section>
      </div>

      <ModalEnvio
        categoria={envia ? abrindo : null}
        valores={valores}
        aoFechar={() => setAbrindo(null)}
        aoEnviado={(resumo) => setEnviado(resumo)}
      />

      <ModalValores
        aberto={editandoValores}
        valores={valores}
        periodos={periodos}
        aoFechar={() => setEditandoValores(false)}
        aoSalvo={guardarTabelas}
      />
    </AppShell>
  )
}
