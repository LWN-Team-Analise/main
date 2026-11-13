/* O que pede atencao num carro: a ultima devolucao com o tanque abaixo da
   metade ou com um "Nao" que importa no checklist (os mesmos de
   alertasDe, em src/domain/frotas.js). Usado na tela Ultimas atualizacoes
   da aba Frotas. */
import { COMBUSTIVEL_MINIMO, alertasDe, rotuloDoCombustivel } from '@/domain/frotas'

/* o "Nao" de cada pergunta, dito como problema */
const PROBLEMA = {
  pneus: 'Pneus não calibrados',
  oleo: 'Óleo não verificado',
  agua: 'Água do para-brisa não verificada',
  abastecido: 'Não abastecido',
  limpoInterno: 'Sujo por dentro',
  limpoExterno: 'Sujo por fora',
  farois: 'Faróis não verificados',
}

/** [{ chave, texto }] do que a ultima devolucao deixou pendente; [] quando nada. */
export function atencaoDoVeiculo(veiculo) {
  const d = veiculo?.ultimaDevolucao
  if (!d) return []
  const lista = []
  if (d.combustivel !== null && d.combustivel !== undefined && Number(d.combustivel) < COMBUSTIVEL_MINIMO) {
    lista.push({ chave: 'combustivel', texto: `Tanque em ${rotuloDoCombustivel(d.combustivel) || `${d.combustivel}%`}` })
  }
  for (const chave of alertasDe(d)) lista.push({ chave, texto: PROBLEMA[chave] ?? chave })
  return lista
}

/** Os carros ativos: em uso, com atencao e na garagem. */
export function resumoDaFrota(veiculos) {
  const ativos = (veiculos ?? []).filter((v) => v.ativo !== false)
  return {
    ativos,
    emUso: ativos.filter((v) => v.emUso),
    comAtencao: ativos.filter((v) => atencaoDoVeiculo(v).length > 0),
    naGaragem: ativos.filter((v) => !v.emUso),
  }
}
