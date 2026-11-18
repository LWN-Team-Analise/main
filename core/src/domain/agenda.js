/* ============================================================
   OS TIPOS DO EVENTO DA AGENDA (atualizacao 59, parte 7)

   O select "Tipo" do "Marcar evento" da pagina inicial. A API confere a
   chave por esta mesma lista (server/routes/agenda.js), entao este
   arquivo nao importa nada: o Node le direto.

   `tom` pinta a etiqueta na agenda:
     feriado      vermelho — o dia em que a empresa para
     facultativo  ambar    — ponto facultativo
     comemorativa roxo     — a data comemorativa
     empresa      azul     — o que a empresa marca
   ============================================================ */

export const TIPO_PADRAO = 'evento'

export const TIPOS_EVENTO = [
  { valor: 'evento', rotulo: 'Evento da empresa', tom: 'empresa' },
  { valor: 'reuniao', rotulo: 'Reunião', tom: 'empresa' },
  { valor: 'treinamento', rotulo: 'Treinamento', tom: 'empresa' },
  { valor: 'confraternizacao', rotulo: 'Confraternização', tom: 'empresa' },
  { valor: 'comemorativa', rotulo: 'Data comemorativa', tom: 'comemorativa' },
  { valor: 'feriado_nacional', rotulo: 'Feriado nacional', tom: 'feriado' },
  { valor: 'feriado_estadual', rotulo: 'Feriado estadual', tom: 'feriado' },
  { valor: 'feriado_municipal', rotulo: 'Feriado municipal', tom: 'feriado' },
  { valor: 'ponto_facultativo', rotulo: 'Ponto facultativo', tom: 'facultativo' },
  { valor: 'aniversario', rotulo: 'Aniversário', tom: 'empresa' },
  { valor: 'outro', rotulo: 'Outro', tom: 'empresa' },
]

const POR_VALOR = new Map(TIPOS_EVENTO.map((t) => [t.valor, t]))

export const tipoValido = (valor) => POR_VALOR.has(valor)

/** O tipo do evento, com o padrao para o que veio vazio ou desconhecido. */
export const tipoDoEvento = (evento) => POR_VALOR.get(evento?.tipo) ?? POR_VALOR.get(TIPO_PADRAO)
