/* ============================================================
   As abas da planilha do reembolso — o mesmo Excel nos dois lados:

     - o "Exportar para o Excel" de Reembolso (planilhaDespesas.js),
       com os filtros da tela;
     - a planilha que o servidor guarda no SharePoint a cada envio ou
       exclusao (server/routes/despesas.js), com todos os envios.

   Sem import nenhum: o servidor importa daqui.
   ============================================================ */

/* os nomes dos tipos como a planilha do SharePoint os escrevia */
const TIPO_NA_PLANILHA = {
  almoco: 'Almoço',
  janta: 'Janta',
  bonus_viagem: 'Bônus viagem',
  bonus_apartamento: 'Bônus apartamento',
  vale_transporte: 'Vale Transporte',
  transporte_intermunicipal: 'Transporte Intermunicipal',
  combustivel: 'Combustível',
  outros: 'Outros',
}

/**
 * O "Cliente/Obra" do jeito da planilha: 'Libbs - Embu das Artes/SP'.
 * O envio que veio da planilha antiga volta com o texto que tinha.
 */
function clienteDoEnvio(e) {
  if (e.clienteTexto) return e.clienteTexto
  if (!e.clienteNome) return ''
  const onde = e.clienteCidade ? ` - ${e.clienteCidade}${e.clienteEstado ? `/${e.clienteEstado}` : ''}` : ''
  return `${e.clienteNome}${onde}`
}

/* as colunas fixas do fim de toda aba */
const CRIADO = { titulo: 'Criado', tipo: 'dataHora', largura: 15.57 }
const TIPO_DE_ITEM = { titulo: 'Tipo de Item', tipo: 'texto', largura: 14.43 }
const CAMINHO = (largura) => ({ titulo: 'Caminho', tipo: 'texto', largura })

/**
 * As tres abas, na ordem e com os nomes (das abas e das Tabelas) da
 * planilha do SharePoint. `linha` monta a linha de um envio.
 */
const ABAS = {
  refeicao: {
    nome: 'Refeicoes',
    tabela: 'Tabela_query__8',
    caminho: 'sites/administracao/Lists/Refeies',
    colunas: [
      { titulo: 'Criado por', tipo: 'texto', largura: 38.57 },
      { titulo: 'Data da refeição', tipo: 'data', largura: 18 },
      { titulo: 'Cliente/Obra? (Refeição)', tipo: 'texto', largura: 60.71 },
      { titulo: 'Tipo de refeição', tipo: 'texto', largura: 17.86 },
      { titulo: 'Valor da refeição', tipo: 'reais', largura: 18.43 },
      CRIADO,
      TIPO_DE_ITEM,
      CAMINHO(31.29),
    ],
    linha: (e, caminho) => [
      e.usuarioNome,
      e.data,
      clienteDoEnvio(e),
      TIPO_NA_PLANILHA[e.tipo] ?? e.tipo,
      e.valor,
      e.criadoEm,
      'Item',
      caminho,
    ],
  },
  bonus: {
    nome: 'Bonus',
    tabela: 'Tabela_query__7',
    caminho: 'sites/administracao/Lists/Bonus',
    colunas: [
      { titulo: 'Criado por', tipo: 'texto', largura: 38.57 },
      { titulo: 'Data do bônus', tipo: 'data', largura: 16.29 },
      { titulo: 'Tipo de bônus', tipo: 'texto', largura: 18.71 },
      { titulo: 'Cliente Obra - Bônus Viagem?', tipo: 'texto', largura: 38.57 },
      { titulo: 'Cliente Obra - Bônus apartamento?', tipo: 'texto', largura: 41.71 },
      { titulo: 'Valor do Bônus Apartamento', tipo: 'reais', largura: 29.14 },
      { titulo: 'Valor do Bônus Viagem', tipo: 'reais', largura: 24 },
      CRIADO,
      TIPO_DE_ITEM,
      CAMINHO(30.57),
    ],
    /* o bonus de viagem preenche as colunas de viagem; o de apartamento, as dele */
    linha: (e, caminho) => {
      const viagem = e.tipo === 'bonus_viagem'
      return [
        e.usuarioNome,
        e.data,
        TIPO_NA_PLANILHA[e.tipo] ?? e.tipo,
        viagem ? clienteDoEnvio(e) : null,
        viagem ? null : clienteDoEnvio(e),
        viagem ? null : e.valor,
        viagem ? e.valor : null,
        e.criadoEm,
        'Item',
        caminho,
      ]
    },
  },
  despesa: {
    nome: 'Despesas',
    tabela: 'Tabela_query__6',
    caminho: 'sites/administracao/Lists/Despesas',
    colunas: [
      { titulo: 'Criado por', tipo: 'texto', largura: 38.57 },
      { titulo: 'Data da despesa', tipo: 'data', largura: 18.14 },
      { titulo: 'Cliente/Obra', tipo: 'texto', largura: 60.71 },
      { titulo: 'Tipo de despesa', tipo: 'texto', largura: 24.43 },
      { titulo: 'Valor da Despesa', tipo: 'reais', largura: 18.86 },
      { titulo: 'Tem alguma observação?', tipo: 'texto', largura: 81.14 },
      CRIADO,
      TIPO_DE_ITEM,
      CAMINHO(33.57),
    ],
    /* a justificativa (so do tipo Outros) entra na frente da observacao */
    linha: (e, caminho) => [
      e.usuarioNome,
      e.data,
      clienteDoEnvio(e),
      TIPO_NA_PLANILHA[e.tipo] ?? e.tipo,
      e.valor,
      [e.justificativa, e.observacao].filter(Boolean).join(' — '),
      e.criadoEm,
      'Item',
      caminho,
    ],
  },
}

/* a ordem das abas na planilha */
const ORDEM = ['refeicao', 'bonus', 'despesa']

/**
 * Os envios viram as abas da planilha: do mais novo para o mais antigo,
 * como a lista do SharePoint mostrava, so a aba da categoria pedida (ou
 * todas) e so as abas que tem envio. Os envios sao os de
 * GET /despesas/exportar.
 */
export function abasDaPlanilha(envios, categoria = null) {
  const ordenados = [...envios].sort(
    (a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criadoEm).localeCompare(String(a.criadoEm)),
  )
  return ORDEM.filter((c) => !categoria || c === categoria)
    .map((c) => {
      const aba = ABAS[c]
      return {
        nome: aba.nome,
        tabela: aba.tabela,
        colunas: aba.colunas,
        linhas: ordenados.filter((e) => e.categoria === c).map((e) => aba.linha(e, aba.caminho)),
      }
    })
    .filter((aba) => aba.linhas.length > 0)
}
