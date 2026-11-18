/* ============================================================
   NOTEBOOKS E PCS (atualizacao 59) — o mapeamento dos equipamentos de
   informatica: o que a empresa tem, com quem esta e em que estado.
   Sem React e sem imports: a tela e a API (server/routes/equipamentos.js)
   conferem as mesmas listas e os mesmos limites.
   ============================================================ */

export const TIPOS_EQUIPAMENTO = [
  { id: 'notebook', rotulo: 'Notebook' },
  { id: 'desktop', rotulo: 'PC (desktop)' },
  { id: 'monitor', rotulo: 'Monitor' },
  { id: 'outro', rotulo: 'Outro' },
]

export const SITUACOES_EQUIPAMENTO = [
  { id: 'em_uso', rotulo: 'Em uso' },
  { id: 'disponivel', rotulo: 'Disponível' },
  { id: 'manutencao', rotulo: 'Em manutenção' },
  { id: 'baixado', rotulo: 'Baixado' },
]

/* os campos de texto e o tamanho de cada um (o banco confere igual) */
export const CAMPOS_EQUIPAMENTO = {
  marca: 60,
  modelo: 80,
  patrimonio: 40,
  numeroSerie: 80,
  processador: 80,
  memoria: 40,
  armazenamento: 60,
  sistema: 60,
  local: 80,
  observacao: 500,
}

export const rotuloDoTipo = (id) => TIPOS_EQUIPAMENTO.find((t) => t.id === id)?.rotulo ?? id
export const rotuloDaSituacao = (id) => SITUACOES_EQUIPAMENTO.find((s) => s.id === id)?.rotulo ?? id
