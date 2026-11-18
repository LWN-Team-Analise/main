/* ============================================================
   OBRA CANCELADA (atualizacao 59) — num arquivo so, sem importar nada.

   A tela le daqui (por src/domain/obras.js) e a API tambem
   (routes/dados.js). Fica fora de obras.js porque o Node nao resolve os
   imports sem extensao de la: importar obras.js no servidor derruba a API.
   ============================================================ */

/**
 * Por que a obra foi CANCELADA. A chave vai para o banco
 * (obra.cancelamento_motivo); o rotulo e o que a tela mostra. "Outro"
 * pede a observacao. A obra cancelada fecha como a concluida (o mesmo
 * carimbo, concluida_em) — o motivo e o que a separa das outras.
 */
export const MOTIVOS_CANCELAMENTO = [
  { id: 'cliente_desistiu', rotulo: 'O cliente desistiu do serviço' },
  { id: 'proposta_recusada', rotulo: 'Proposta não aprovada (preço ou escopo)' },
  { id: 'concorrencia', rotulo: 'O cliente fechou com a concorrência' },
  { id: 'adiada', rotulo: 'O cliente adiou sem nova data' },
  { id: 'documentacao', rotulo: 'Falta de documentação ou de acesso ao local' },
  { id: 'duplicada', rotulo: 'Obra cadastrada em duplicidade ou por engano' },
  { id: 'outro', rotulo: 'Outro motivo' },
]

export const motivoDoCancelamento = (id) => MOTIVOS_CANCELAMENTO.find((m) => m.id === id)?.rotulo ?? id

/** A obra foi cancelada (e nao concluida)? */
export const obraCancelada = (obra) => Boolean(obra?.cancelamentoMotivo)
