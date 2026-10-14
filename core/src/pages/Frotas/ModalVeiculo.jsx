import { useEffect, useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoArea, CampoTexto } from '@/components/Campo/Campo'
import { NOME_VEICULO_MAXIMO, OBSERVACAO_MAXIMA, kmLegivel } from '@/domain/frotas'
import * as frotasApi from '@/services/frotasService'
import { Falta } from './icones'

/**
 * Cadastro e edicao de um veiculo. `veiculo` null = cadastro novo.
 *
 * O KM ATUAL e o piso da proxima saida. No cadastro e o que o painel
 * mostra hoje; na edicao ele ja vem do ultimo registro, e mexer nele
 * e CORRIGIR — quando alguem digitou um KM errado e travou as saidas
 * seguintes. A correcao fica no Historico, com o de antes e o de agora.
 *
 * Todos os campos sao obrigatorios, menos a observacao. Os carros que
 * vieram da planilha antiga nao tem placa, ano nem cor: na edicao, o
 * que falta aparece com o "!" piscando, e so salva com tudo preenchido.
 */

const VAZIO = { nome: '', marca: '', modelo: '', placa: '', ano: '', cor: '', kmAtual: '', observacao: '' }

const doVeiculo = (v) => ({
  nome: v.nome ?? '',
  marca: v.marca ?? '',
  modelo: v.modelo ?? '',
  placa: v.placa ?? '',
  ano: v.ano ? String(v.ano) : '',
  cor: v.cor ?? '',
  kmAtual: v.kmAtual === null || v.kmAtual === undefined ? '' : String(v.kmAtual),
  observacao: v.observacao ?? '',
})

export default function ModalVeiculo({ aberto, veiculo, aoFechar, aoSalvo }) {
  const novo = !veiculo
  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [mudandoAtivo, setMudandoAtivo] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setForm(veiculo ? doVeiculo(veiculo) : VAZIO)
    setErros({})
  }, [aberto, veiculo])

  const mudar = (campo, limpar = (v) => v) => (evento) => {
    const valor = limpar(evento.target.value)
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined, geral: undefined }))
  }

  const conferir = () => {
    const novos = {}
    if (!form.nome.trim()) novos.nome = 'Dê um nome ao veículo (ex.: Spin 01).'
    if (!form.marca.trim()) novos.marca = 'Informe a marca.'
    if (!form.modelo.trim()) novos.modelo = 'Informe o modelo.'
    if (!/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/.test(form.placa.trim().toUpperCase())) {
      novos.placa = 'Placa no formato ABC1D23 ou ABC-1234.'
    }
    const ano = Number(form.ano)
    if (!Number.isInteger(ano) || ano < 1950 || ano > new Date().getFullYear() + 1) novos.ano = 'Informe o ano.'
    if (!form.cor.trim()) novos.cor = 'Informe a cor.'
    if (form.kmAtual === '') novos.kmAtual = 'Informe o KM atual.'
    return novos
  }

  const salvar = async (evento) => {
    evento.preventDefault()
    if (salvando) return
    const novos = conferir()
    if (Object.keys(novos).length > 0) {
      setErros(novos)
      return
    }
    setSalvando(true)
    try {
      const campos = { ...form, placa: form.placa.trim().toUpperCase() }
      const { veiculo: salvo } = novo
        ? await frotasApi.cadastrarVeiculo(campos)
        : await frotasApi.editarVeiculo(veiculo.id, campos)
      aoSalvo?.(salvo, novo ? 'cadastrado' : 'editado')
      aoFechar()
    } catch (e) {
      setErros(e.campo ? { [e.campo]: e.message } : { geral: e.message })
    } finally {
      setSalvando(false)
    }
  }

  const alternarAtivo = async () => {
    setMudandoAtivo(true)
    try {
      const { veiculo: salvo } = await frotasApi.ativarVeiculo(veiculo.id, !veiculo.ativo)
      aoSalvo?.(salvo, salvo.ativo ? 'reativado' : 'desativado')
      aoFechar()
    } catch (e) {
      setErros({ geral: e.message })
    } finally {
      setMudandoAtivo(false)
    }
  }

  /* na edicao de um carro incompleto, o rotulo do que falta ganha o "!" */
  const rotulo = (texto, campo, oque) =>
    !novo && !String(veiculo?.[campo] ?? '').trim() ? (
      <>
        {texto} <Falta oque={oque} />
      </>
    ) : (
      texto
    )

  const kmMudou = !novo && veiculo.kmAtual !== null && form.kmAtual !== '' && Number(form.kmAtual) !== veiculo.kmAtual

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={novo ? 'Cadastrar veículo' : `Editar ${veiculo.nome}`}
      subtitulo={novo ? undefined : veiculo.ativo ? undefined : 'Veículo desativado'}
      largura={560}
    >
      <form className="formdesp frota-form" onSubmit={salvar} noValidate>
        <CampoTexto
          rotulo="Nome do veículo na frota"
          maxLength={NOME_VEICULO_MAXIMO}
          placeholder="Ex.: Spin 01"
          value={form.nome}
          onChange={mudar('nome')}
          erro={erros.nome}
        />
        <div className="formdesp__par">
          <CampoTexto
            rotulo={rotulo('Marca', 'marca', 'a marca')}
            maxLength={60}
            placeholder="Ex.: Chevrolet"
            value={form.marca}
            onChange={mudar('marca')}
            erro={erros.marca}
          />
          <CampoTexto
            rotulo={rotulo('Modelo', 'modelo', 'o modelo')}
            maxLength={60}
            placeholder="Ex.: Spin"
            value={form.modelo}
            onChange={mudar('modelo')}
            erro={erros.modelo}
          />
        </div>
        <div className="formdesp__par frota-form__trio">
          <CampoTexto
            rotulo={rotulo('Placa', 'placa', 'a placa')}
            maxLength={8}
            placeholder="ABC1D23"
            autoCapitalize="characters"
            value={form.placa}
            onChange={mudar('placa', (v) => v.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
            erro={erros.placa}
          />
          <CampoTexto
            rotulo={rotulo('Ano', 'ano', 'o ano')}
            inputMode="numeric"
            maxLength={4}
            placeholder="2022"
            value={form.ano}
            onChange={mudar('ano', (v) => v.replace(/\D/g, '').slice(0, 4))}
            erro={erros.ano}
          />
          <CampoTexto
            rotulo={rotulo('Cor', 'cor', 'a cor')}
            maxLength={40}
            placeholder="Ex.: Branco"
            value={form.cor}
            onChange={mudar('cor')}
            erro={erros.cor}
          />
        </div>
        <CampoTexto
          rotulo="KM atual (apenas números)"
          inputMode="numeric"
          autoComplete="off"
          value={form.kmAtual}
          onChange={mudar('kmAtual', (v) => v.replace(/\D/g, '').slice(0, 7))}
          erro={erros.kmAtual}
          dica={
            novo
              ? undefined
              : kmMudou
                ? `Correção: de ${kmLegivel(veiculo.kmAtual)} para ${kmLegivel(form.kmAtual)}. A próxima saída não poderá ter KM menor que este, e a correção fica no Histórico.`
                : 'Vem do último registro. Corrija só se alguém digitou um KM errado.'
          }
        />
        <CampoArea
          rotulo="Observação (opcional)"
          linhas={2}
          maxLength={OBSERVACAO_MAXIMA}
          value={form.observacao}
          onChange={mudar('observacao')}
          erro={erros.observacao}
        />

        {erros.geral && (
          <p className="formdesp__erro" role="alert">
            {erros.geral}
          </p>
        )}

        <footer className="formobra__acoes frota-form__rodape">
          {!novo && (
            <button
              type="button"
              className="frota-form__ativo"
              onClick={alternarAtivo}
              disabled={mudandoAtivo || salvando}
            >
              {veiculo.ativo ? 'Desativar veículo' : 'Reativar veículo'}
            </button>
          )}
          <button type="button" className="formobra__cancelar" onClick={aoFechar}>
            Cancelar
          </button>
          <Button type="submit" loading={salvando}>
            {novo ? 'Cadastrar' : 'Salvar'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
