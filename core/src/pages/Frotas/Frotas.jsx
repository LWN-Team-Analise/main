import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell/AppShell'
import { useDados } from '@/context/DadosContext'
import { TIPOS, kmLegivel } from '@/domain/frotas'
import * as frotasApi from '@/services/frotasService'
import { dataBR } from '@/utils/formato'
import { finalDaPlaca, horaCurta, horarioDe } from '@/domain/rodizio'
import useHoraAgora from '@/hooks/useHoraAgora'
import ModalRegistro from './ModalRegistro'
import ModalVeiculo from './ModalVeiculo'
import PainelRodizio from './PainelRodizio'
import PainelCondicoes from './PainelCondicoes'
import PainelReservas from './PainelReservas'
import { Falta, IconeCarro, IconeDevolucao, IconeEditar, IconeLista, IconeMais, IconeSaida } from './icones'
import './Frotas.css'

const DESCRICAO = {
  saida: 'Sair com um veículo da empresa, ou assumir um que já está em uso',
  devolucao: 'Devolver o veículo na garagem, com o checklist e as fotos',
}

/** O cadastro esta completo? (os carros da planilha antiga nao tinham placa, ano nem cor) */
const incompleto = (v) => !v.marca || !v.modelo || !v.placa || !v.ano || !v.cor

/**
 * O horario do rodizio que esta valendo AGORA para o carro ({ de, ate }),
 * ou null. O final da placa tem de ser um dos finais do dia (fim de
 * semana e feriado nao tem rodizio) e a hora tem de estar num dos dois
 * horarios: das 10h as 17h e depois das 20h o carro circula, e o aviso
 * some ate o proximo horario.
 */
function rodizioAgora(veiculo, rodizio, agora) {
  const hoje = rodizio?.hoje
  if (!hoje || hoje.livre || !veiculo.ativo) return null
  const final = finalDaPlaca(veiculo.placa)
  if (final === null || !hoje.finais.includes(final)) return null
  return horarioDe(agora)
}

/** O cartao de um veiculo: nome, placa, se esta em uso e com quem. */
function CartaoVeiculo({ veiculo, editavel, aoEditar, rodizio, agora }) {
  const { ultimo } = veiculo
  /* no horario do rodizio: na garagem ele nao aparece como disponivel */
  const horario = rodizioAgora(veiculo, rodizio, agora)
  const estado = !veiculo.ativo ? 'Desativado' : veiculo.emUso ? 'Em uso' : horario ? 'Rodízio agora' : 'Disponível'
  /* cada informacao que falta vira o "!" piscando, no lugar dela, com o
     nome do que falta do lado — so o "!" solto nao diz o que e */
  const ou = (valor, nome, oque) =>
    valor || (
      <span className="veiculo__falta">
        {nome} <Falta oque={oque} />
      </span>
    )
  return (
    <li
      className={`veiculo ${veiculo.emUso ? 'is-uso' : ''} ${horario && !veiculo.emUso ? 'is-rodizio' : ''} ${
        veiculo.ativo ? '' : 'is-inativo'
      }`.trim()}
    >
      <div className="veiculo__topo">
        <span className="veiculo__icone" aria-hidden="true">
          <IconeCarro />
        </span>
        <strong className="veiculo__nome">{veiculo.nome}</strong>
        {editavel && (
          <button
            type="button"
            className="veiculo__editar"
            onClick={() => aoEditar(veiculo)}
            aria-label={`Editar ${veiculo.nome}`}
            title={incompleto(veiculo) ? 'Completar o cadastro' : 'Editar'}
          >
            <IconeEditar />
          </button>
        )}
      </div>

      <p className="veiculo__ficha">
        {ou(veiculo.marca, 'Marca', 'a marca')} {ou(veiculo.modelo, 'Modelo', 'o modelo')} ·{' '}
        {ou(veiculo.ano, 'Ano', 'o ano')} · {ou(veiculo.cor, 'Cor', 'a cor')}
      </p>

      <div className="veiculo__linha">
        <span className={`veiculo__estado ${veiculo.ativo ? '' : 'is-inativo'}`.trim()}>{estado}</span>
        <span className={`veiculo__placa ${veiculo.placa ? '' : 'is-vazia'}`.trim()}>
          {veiculo.placa || (
            <>
              Placa <Falta oque="a placa" />
            </>
          )}
        </span>
      </div>

      <p className="veiculo__onde">
        {veiculo.emUso && ultimo ? (
          <>
            Com <strong>{ultimo.condutorNome}</strong> desde {dataBR(ultimo.data)}
            {ultimo.hora ? ` às ${ultimo.hora}` : ''}
            {ultimo.destino ? <span className="veiculo__destino">{ultimo.destino}</span> : null}
          </>
        ) : ultimo ? (
          <>
            {TIPOS[ultimo.tipo]?.rotulo ?? 'Registro'} em {dataBR(ultimo.data)} por {ultimo.condutorNome}
          </>
        ) : (
          'Nenhum registro ainda.'
        )}
      </p>

      {/* o porque do "Rodizio agora" (e o aviso para quem esta com ele na rua) */}
      {horario && (
        <p className="veiculo__rodizio">
          Placa final {finalDaPlaca(veiculo.placa)}: não pode circular no centro expandido de São Paulo agora, até
          as {horaCurta(horario.ate)}.
        </p>
      )}

      {/* reservado para uma obra que ainda nao o retirou (atualizacao 23) */}
      {veiculo.reservadoPara && (
        <p className="veiculo__reserva">
          Reservado para <strong>{veiculo.reservadoPara.nome}</strong>
          {veiculo.reservadoPara.de
            ? ` de ${dataBR(veiculo.reservadoPara.de).slice(0, 5)} a ${dataBR(veiculo.reservadoPara.ate).slice(0, 5)}`
            : ''}
          {veiculo.reservas?.length > 1 ? ` (+${veiculo.reservas.length - 1})` : ''}
        </p>
      )}

      <footer className="veiculo__rodape">
        <span>
          KM atual <strong>{kmLegivel(veiculo.kmAtual)}</strong>
        </span>
        <Link to={`/app/frotas/registros?veiculo=${veiculo.id}`} className="veiculo__link">
          {veiculo.registros} {veiculo.registros === 1 ? 'registro' : 'registros'}
        </Link>
      </footer>
    </li>
  )
}

/**
 * A porta de entrada de Frotas: Saida e Devolucao lado a lado, o
 * caminho para todos os registros e, embaixo, os veiculos — cada um
 * dizendo se esta na garagem ou em uso, com quem e para onde.
 *
 * Os formularios abrem em pop-up, como em Despesas: registrar e um
 * gesto rapido, e depois dele a pessoa volta para os dois botoes.
 */
export default function Frotas() {
  const { pode } = useDados()
  const registra = pode('registrar_frota')
  const edita = pode('editar_veiculos')

  const [veiculos, setVeiculos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [registrando, setRegistrando] = useState(null)
  /* a saida de um carro reservado: { veiculoId, obraId } fixos no formulario */
  const [retirando, setRetirando] = useState(null)
  const [reservas, setReservas] = useState(null)
  const [editando, setEditando] = useState(null)
  const [recado, setRecado] = useState(null)
  const [rodizio, setRodizio] = useState(null)
  const [condicoes, setCondicoes] = useState(null)
  const agora = useHoraAgora()

  const carregar = useCallback(async () => {
    /* o rodizio vem a parte: se ele falhar, a frota continua de pe */
    frotasApi
      .carregarRodizio()
      .then(setRodizio)
      .catch(() => setRodizio(null))
    /* o transito e os alertas tambem: fontes de fora, que podem demorar */
    frotasApi
      .carregarCondicoes()
      .then(setCondicoes)
      .catch(() => setCondicoes(null))
    /* as reservas das obras que ainda nao deram a saida do carro */
    frotasApi
      .carregarReservas()
      .then(setReservas)
      .catch(() => setReservas(null))
    try {
      setVeiculos(await frotasApi.carregarVeiculos())
      setErro('')
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const registrado = (registro) => {
    setRetirando(null)
    const qual = TIPOS[registro.tipo]?.rotulo ?? 'Registro'
    setRecado(
      `${qual} do ${registro.veiculoNome} registrada: ${registro.condutorNome}, ${kmLegivel(registro.km)}.` +
        (registro.alertas?.length ? ` Atenção: ${registro.alertas.length} item(ns) do checklist com "não".` : ''),
    )
    carregar()
  }

  const salvo = (veiculo, como) => {
    setRecado(`${veiculo.nome} ${como}.`)
    carregar()
  }

  const ativos = veiculos.filter((v) => v.ativo)
  const inativos = veiculos.filter((v) => !v.ativo)
  const emUso = ativos.filter((v) => v.emUso).length
  /* na garagem, mas no horario do rodizio: nao conta como disponivel */
  const noRodizio = ativos.filter((v) => !v.emUso && rodizioAgora(v, rodizio, agora)).length
  const disponiveis = ativos.length - emUso - noRodizio

  return (
    <AppShell>
      <section className="frotas">
        <header className="frotas__topo">
          <h1 className="tela__titulo">Frotas</h1>
          <p className="tela__lead">
            {registra
              ? 'Registre a saída e a devolução dos veículos da empresa. Cada registro fica guardado com o condutor, o KM e as fotos.'
              : 'Os veículos da empresa e cada saída e devolução, com o condutor, o KM e as fotos.'}
          </p>
        </header>

        {recado && (
          <p className="recado frotas__recado" role="status">
            <span>{recado}</span>
            <button type="button" onClick={() => setRecado(null)} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}

        {registra && (
          <div className="frotas__acoes">
            {['saida', 'devolucao'].map((modo) => (
              <button
                key={modo}
                type="button"
                className="frotas__botao"
                data-modo={modo}
                onClick={() => setRegistrando(modo)}
              >
                <span className="frotas__icone" aria-hidden="true">
                  {modo === 'saida' ? <IconeSaida /> : <IconeDevolucao />}
                </span>
                <strong>{modo === 'saida' ? 'Saída' : 'Devolução'}</strong>
                <span className="frotas__descricao">{DESCRICAO[modo]}</span>
              </button>
            ))}
          </div>
        )}

        <div className="frotas__links">
          <Link to="/app/frotas/registros" className="acao acao--fraca frotas__registros">
            <IconeLista />
            Saídas e devoluções
          </Link>
        </div>

        <PainelRodizio rodizio={rodizio} veiculos={veiculos} />

        <PainelReservas
          reservas={reservas?.reservas}
          hoje={reservas?.hoje}
          podeRegistrar={registra}
          aoDarSaida={(r) => setRetirando({ veiculoId: r.veiculoId, obraId: r.obraId, obraNome: r.obra })}
        />

        <section className="frotas__veiculos" aria-labelledby="frotas-veiculos">
          <header className="frotas__cabeca">
            <div>
              <h2 id="frotas-veiculos" className="frotas__subtitulo">
                Veículos
              </h2>
              {!carregando && !erro && (
                <p className="frotas__resumo">
                  {ativos.length} {ativos.length === 1 ? 'veículo' : 'veículos'} · {emUso} em uso ·{' '}
                  {noRodizio > 0 && `${noRodizio} no rodízio agora · `}
                  {disponiveis} {disponiveis === 1 ? 'disponível' : 'disponíveis'}
                </p>
              )}
            </div>
            {edita && (
              <button type="button" className="acao acao--padrao" onClick={() => setEditando({ novo: true })}>
                <IconeMais />
                Cadastrar veículo
              </button>
            )}
          </header>

          {erro && (
            <p className="formdesp__erro" role="alert">
              {erro}
            </p>
          )}
          {carregando && <p className="frotas__vazio">Carregando os veículos...</p>}
          {!carregando && !erro && veiculos.length === 0 && (
            <p className="frotas__vazio">Nenhum veículo cadastrado ainda.</p>
          )}

          <ul className="frotas__grade">
            {ativos.map((v) => (
              <CartaoVeiculo key={v.id} veiculo={v} editavel={edita} aoEditar={setEditando} rodizio={rodizio} agora={agora} />
            ))}
          </ul>

          {inativos.length > 0 && (
            <details className="frotas__inativos">
              <summary>
                {inativos.length} {inativos.length === 1 ? 'veículo desativado' : 'veículos desativados'}
              </summary>
              <ul className="frotas__grade">
                {inativos.map((v) => (
                  <CartaoVeiculo key={v.id} veiculo={v} editavel={edita} aoEditar={setEditando} rodizio={rodizio} agora={agora} />
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* o transito e os alertas vem depois dos veiculos */}
        <PainelCondicoes condicoes={condicoes} />
      </section>

      <ModalRegistro
        modo={registra ? (retirando ? 'saida' : registrando) : null}
        fixo={retirando}
        veiculos={veiculos}
        rodizio={rodizio}
        aoFechar={() => {
          setRegistrando(null)
          setRetirando(null)
        }}
        aoRegistrado={registrado}
      />
      <ModalVeiculo
        aberto={edita && Boolean(editando)}
        veiculo={editando?.novo ? null : editando}
        aoFechar={() => setEditando(null)}
        aoSalvo={salvo}
      />
    </AppShell>
  )
}
