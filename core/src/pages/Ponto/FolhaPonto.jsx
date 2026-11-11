import logo from '@/assets/LogoLWN.png'
import { COLUNAS_DO_ESPELHO, cpfComMascara, dataBR, rotuloDoPeriodo } from '@/domain/ponto'
import { empresaDaFolha } from './empresa'

/**
 * A FICHA — o "Demonstrativo de Espelho de Ponto" na tela, no mesmo
 * desenho do PDF do sistema de ponto (e do PDF que o Exportar gera):
 * o cabecalho com a logo e o periodo, os dados da empresa e do
 * funcionario, a tabela dos dias e o rodape com os totais e a
 * assinatura.
 *
 * A area acima de "Assinatura Funcionário" e o botao de assinar. Depois
 * da assinatura, o nome completo fica impresso ali. Quem decide o que o
 * clique faz (assinar, avisar que a folha e de outra pessoa) e a tela
 * de cima, por `aoClicarAssinatura`.
 */
export default function FolhaPonto({ folha, funcionario, usuario, inicio, fim, assinatura, geradoEm, aoClicarAssinatura, proprio }) {
  const empresa = empresaDaFolha(funcionario)
  const assinada = Boolean(assinatura?.valida)
  const desatualizada = Boolean(assinatura) && !assinatura.valida

  const dica = assinada
    ? `Assinada em ${new Date(assinatura.assinadoEm).toLocaleString('pt-BR')}`
    : proprio
      ? 'Clique para assinar a conferência da folha de ponto'
      : 'Só o próprio funcionário assina a folha de ponto'

  return (
    <article className="espelho" aria-label="Demonstrativo de Espelho de Ponto">
      <header className="espelho__topo">
        <img className="espelho__logo" src={logo} alt="LWN" />
        <h2 className="espelho__titulo">Demonstrativo de Espelho de Ponto</h2>
        <p className="espelho__gerado">
          Documento gerado em {geradoEm}
          <br />
          {dataBR(inicio)} - {dataBR(fim)}
          <br />
          {rotuloDoPeriodo(inicio, fim)}
        </p>
      </header>

      <div className="espelho__dados">
        <p>
          <b>Empresa:</b> {empresa.nome}
          <br />
          <b>CNPJ:</b> {empresa.cnpj} <b>CEP:</b> {empresa.cep}
          <br />
          <b>Endereço:</b> {empresa.endereco}
        </p>
        <p>
          <b>Nome:</b> {funcionario?.nome || usuario?.nome || ''}
          <br />
          <b>Matrícula:</b> {limpo(funcionario?.matricula)}
          <br />
          <b>PIS:</b> {limpo(funcionario?.pis)} <b>CPF:</b> {funcionario?.cpf ? cpfComMascara(funcionario.cpf) : ''}
        </p>
        <p>
          <b>Data de admissão:</b> {funcionario?.admissao ? dataBR(funcionario.admissao) : ''}
          <br />
          <b>Departamento:</b> {limpo(funcionario?.departamento)}
          <br />
          <b>Cargo:</b> {limpo(funcionario?.cargo)}
        </p>
      </div>

      <div className="espelho__rolagem">
        <table className="espelho__tabela">
          <thead>
            <tr>
              {COLUNAS_DO_ESPELHO.slice(0, 9).map((c) => (
                <th key={c} rowSpan={2}>
                  {c}
                </th>
              ))}
              <th colSpan={2}>Horas Compensadas</th>
              <th rowSpan={2}>Eventos</th>
            </tr>
            <tr>
              <th>Débito</th>
              <th>Crédito</th>
            </tr>
          </thead>
          <tbody>
            {folha.linhas.map((l) => (
              <tr key={l.data} className={l.vazio ? 'is-vazio' : undefined}>
                <td>{l.rotulo}</td>
                {l.celulas.map((c, i) => (
                  <td key={i} className={CLASSE_DA_COLUNA[i]}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="espelho__rodape">
        <div className="espelho__rolagem espelho__rolagem--totais">
          <table className="espelho__totais">
            <thead>
              <tr>
                <th>Totais Gerais</th>
                <th>Creditos e Débitos no Período</th>
                <th>Banco Horas</th>
                <th>Horas a Pagar ou Descontar</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Total Trabalhado: {folha.totais.trabalhadoTexto}
                  <br />
                  Total H. Normais Esperadas: {folha.totais.esperadoTexto}
                </td>
                <td />
                <td />
                <td className="is-meio">
                  {folha.totais.aPagar}
                  {folha.totais.noturnaTexto && (
                    <>
                      <br />
                      {folha.totais.noturnaTexto}
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="espelho__assinatura">
          <p>Concordo com as marcações acima registradas</p>
          <button
            type="button"
            className={`espelho__assinar ${assinada ? 'is-assinada' : ''} ${proprio ? '' : 'is-alheia'}`.trim()}
            onClick={aoClicarAssinatura}
            title={dica}
            aria-label={assinada ? `Folha assinada por ${assinatura.nome}. ${dica}` : dica}
          >
            {assinada ? (
              <span className="espelho__nome">{assinatura.nome}</span>
            ) : (
              <span className="espelho__convite">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
                  <path d="M14.5 7.5l3 3" />
                </svg>
                {desatualizada ? 'Assinar de novo' : 'Clique para assinar'}
              </span>
            )}
          </button>
          <span className="espelho__linha" aria-hidden="true" />
          <p>Assinatura Funcionário</p>
          {assinada && (
            <p className="espelho__quando">Assinado eletronicamente em {new Date(assinatura.assinadoEm).toLocaleString('pt-BR')}</p>
          )}
          {desatualizada && (
            <p className="espelho__quando is-alerta">
              A folha mudou depois da assinatura de {new Date(assinatura.assinadoEm).toLocaleDateString('pt-BR')} (nova importação)
            </p>
          )}
        </div>
      </footer>
    </article>
  )
}

/* o "-" do arquivo e campo vazio */
const limpo = (v) => (v && v !== '-' ? v : '')

/* as celulas de hora ficam no centro, como no espelho; a jornada e os
   eventos, encostados a esquerda */
const CLASSE_DA_COLUNA = [
  undefined,
  undefined,
  undefined,
  undefined,
  'is-meio',
  'is-meio',
  'is-meio',
  'is-meio',
  'is-meio',
  'is-meio',
  undefined,
]
