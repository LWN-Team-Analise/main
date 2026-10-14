import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import { useDados } from '@/context/DadosContext'
import { CATEGORIAS, CHAVES_CATEGORIA, VALORES_FIXOS, rotuloDoTipo } from '@/domain/despesas'
import { dataBR, reais } from '@/utils/formato'
import ModalEnvio from './ModalEnvio'
import { IconeCategoria, IconeEquipe, IconeLista } from './icones'
import './Despesas.css'

/* A linha de baixo de cada botao: o que entra ali, em poucas palavras. */
const DESCRICAO = {
  despesa: 'Transporte, combustível e outros gastos, com comprovante',
  refeicao: `Almoço ou janta — ${reais(VALORES_FIXOS.almoco)}`,
  bonus: 'Bônus viagem ou bônus apartamento',
}

const ENVIADO = {
  despesa: 'Despesa enviada',
  refeicao: 'Refeição enviada',
  bonus: 'Bônus enviado',
}

/**
 * A porta de entrada de Despesas: tres botoes lado a lado, um por
 * categoria, e "Meus envios" centralizado embaixo deles.
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

  return (
    <AppShell>
      <section className="despesas">
        <header className="despesas__topo">
          <h1 className="tela__titulo">Despesas</h1>
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
              <Link to="/app/despesas/envios">Ver em Meus envios</Link>
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
                <span className="despesas__descricao">{DESCRICAO[categoria]}</span>
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

      <ModalEnvio
        categoria={envia ? abrindo : null}
        aoFechar={() => setAbrindo(null)}
        aoEnviado={(resumo) => setEnviado(resumo)}
      />
    </AppShell>
  )
}
