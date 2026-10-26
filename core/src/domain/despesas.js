/* ============================================================
   REEMBOLSO (a aba que se chamava Despesas) — o que cada envio pode ser

   Tres categorias, cada uma com os seus tipos:

     despesa   — gasto que a pessoa pagou e pede de volta. O valor e
                 o do recibo; combustivel e outros exigem o
                 comprovante (anexo), os transportes o aceitam.
     refeicao  — almoco ou janta em obra. O valor e PRE-DEFINIDO: a
                 pessoa ve, mas nao digita.
     bonus     — bonus de viagem ou de apartamento (este, pre-definido).

   Este arquivo nao tem React dentro, de proposito: a API importa
   o MESMO arquivo (server/routes/despesas.js), igual faz com as
   permissoes. Assim a tela nunca oferece um tipo que o servidor
   recusa, nem o servidor aceita um que a tela nao conhece.

   As chaves (vale_transporte, almoco...) sao o que vai para o
   banco; o rotulo e so o que a tela escreve. Trocar um rotulo
   aqui nao mexe em registro nenhum.
   ============================================================ */

export const CATEGORIAS = {
  despesa: {
    rotulo: 'Despesa',
    plural: 'Despesas',
    enviar: 'Enviar despesa',
    tipos: [
      { chave: 'vale_transporte', rotulo: 'Vale Transporte' },
      { chave: 'transporte_intermunicipal', rotulo: 'Transporte Intermunicipal' },
      { chave: 'combustivel', rotulo: 'Combustível' },
      { chave: 'outros', rotulo: 'Outros' },
    ],
  },
  refeicao: {
    rotulo: 'Refeição',
    plural: 'Refeições',
    enviar: 'Enviar refeição',
    tipos: [
      { chave: 'almoco', rotulo: 'Almoço' },
      { chave: 'janta', rotulo: 'Janta' },
    ],
  },
  bonus: {
    rotulo: 'Bônus',
    plural: 'Bônus',
    enviar: 'Enviar bônus',
    tipos: [
      { chave: 'bonus_viagem', rotulo: 'Bônus viagem' },
      { chave: 'bonus_apartamento', rotulo: 'Bônus apartamento' },
    ],
  },
}

export const CHAVES_CATEGORIA = Object.keys(CATEGORIAS)

/** Teto por envio. Serve para pegar o zero a mais digitado sem querer. */
export const VALOR_MAXIMO = 100000

/* ------------------------------------------------------------
   Valores PRE-DEFINIDOS

   Tipo pre-definido tem o valor da casa: a tela mostra o numero num
   campo travado e o servidor grava ESTE numero — o que vier no pedido
   e ignorado. Tipo que nao esta na tabela tem o valor digitado pela
   pessoa.

   A tabela de verdade mora no banco (configuracao
   'valores_reembolso'): quem tem `definir_valores_reembolso` muda os
   valores pelo botao "Valores pré-definidos" da aba Reembolso, e
   escolhe quais tipos sao pre-definidos. Os de baixo sao o PADRAO,
   valendo enquanto ninguem salvou a tabela.

   Cada envio guarda o valor do dia em que foi feito: mudar a tabela
   nao reescreve o que ja foi enviado.
   ------------------------------------------------------------ */
export const VALORES_FIXOS = {
  almoco: 41.5,
  janta: 41.5,
  /* o mesmo para todo cliente */
  bonus_apartamento: 35,
}

/** O valor pre-definido do tipo na tabela, ou null quando e a pessoa quem digita. */
export function valorFixo(tipo, tabela = VALORES_FIXOS) {
  const valor = tabela?.[tipo]
  return typeof valor === 'number' ? valor : null
}

/**
 * Le a tabela de valores (a que veio do banco ou da tela) e devolve
 * so os tipos que existem, com valor valido — ou { erro, tipo }.
 * `null` ou vazio num tipo = ele nao e pre-definido.
 */
export function lerTabelaDeValores(bruto) {
  const tabela = {}
  const todos = Object.values(CATEGORIAS).flatMap((c) => c.tipos)
  for (const { chave, rotulo } of todos) {
    const valor = bruto?.[chave]
    if (valor === undefined || valor === null || valor === '') continue
    const lido = lerValor(valor)
    if (lido === null || lido <= 0 || lido > VALOR_MAXIMO) {
      return { erro: `Confira o valor de "${rotulo}".`, tipo: chave }
    }
    tabela[chave] = lido
  }
  return { tabela }
}

/* ------------------------------------------------------------
   Comprovante obrigatorio

   So no combustivel e no "outros": o vale transporte e o transporte
   intermunicipal aceitam o anexo, mas nao exigem.
   ------------------------------------------------------------ */
export const TIPOS_COM_COMPROVANTE = ['combustivel', 'outros']

export function comprovanteObrigatorio(tipo) {
  return TIPOS_COM_COMPROVANTE.includes(tipo)
}

/** Tamanho dos textos livres. */
export const OBSERVACAO_MAXIMA = 1000
export const JUSTIFICATIVA_MAXIMA = 500

/* ------------------------------------------------------------
   Comprovante

   O arquivo vai para o banco como data URL, igual aos anexos da
   obra e ao chat. O teto aqui e MENOR que os 4 MB deles, e de
   proposito: em base64 o arquivo cresce um terco, e 3 MB viram
   ~4 MB de pedido — o que ainda cabe no limite de 4,5 MB por
   chamada que a Vercel impoe as funcoes. Com 4 MB o pedido
   passaria de 5 MB e seria barrado antes de chegar na API.

   Foto de celular costuma passar disso; a tela reduz a imagem
   antes de enviar (ver Despesas/ModalEnvio.jsx), entao na pratica
   o teto so pesa para PDF e ZIP.
   ------------------------------------------------------------ */
export const ANEXO_BYTES_MAXIMOS = 3 * 1024 * 1024

/** Extensoes aceitas no comprovante — imagem, PDF, compactado, documento. */
export const ANEXO_EXTENSOES = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff',
  'pdf',
  'zip', 'rar', '7z',
  'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'odt', 'ods', 'xml',
]

/** O `accept` do seletor de arquivo, montado da mesma lista. */
export const ANEXO_ACEITA = ['image/*', 'application/pdf', ...ANEXO_EXTENSOES.map((e) => `.${e}`)].join(',')

/** 'Recibo Posto.PDF' -> 'pdf' */
export function extensaoDe(nome) {
  const partes = String(nome ?? '').toLowerCase().split('.')
  return partes.length > 1 ? partes.pop().trim() : ''
}

export function anexoAceito(nome) {
  return ANEXO_EXTENSOES.includes(extensaoDe(nome))
}

/* ------------------------------------------------------------
   Leitura no resto do sistema
   ------------------------------------------------------------ */

export function tiposDa(categoria) {
  return CATEGORIAS[categoria]?.tipos ?? []
}

export function tipoValido(categoria, tipo) {
  return tiposDa(categoria).some((t) => t.chave === tipo)
}

/** 'bonus_viagem' -> 'Bônus viagem'. Chave desconhecida volta como esta. */
export function rotuloDoTipo(tipo) {
  for (const categoria of Object.values(CATEGORIAS)) {
    const achado = categoria.tipos.find((t) => t.chave === tipo)
    if (achado) return achado.rotulo
  }
  return tipo ?? ''
}

export function rotuloDaCategoria(categoria) {
  return CATEGORIAS[categoria]?.rotulo ?? categoria ?? ''
}

/**
 * O rotulo do campo de valor. No bonus ele acompanha o tipo escolhido:
 * "Valor do bônus viagem", "Valor do bônus apartamento".
 */
export function rotuloDoValor(categoria, tipo) {
  if (categoria === 'refeicao') return 'Valor da refeição'
  if (categoria === 'bonus') {
    const rotulo = tipo ? rotuloDoTipo(tipo).toLowerCase() : ''
    return rotulo ? `Valor do ${rotulo}` : 'Valor do bônus'
  }
  return 'Valor da despesa'
}

/**
 * Le um valor em reais e devolve o numero, ou null se nao for um valor.
 *
 * Aceita numero (41.5) e texto com ponto OU virgula decimal ("41,50",
 * "41.50"), com no maximo dois decimais. Separador de milhar nao entra:
 * "1.234" seria ambiguo (mil duzentos ou um real e vinte e tres?), e a
 * tela ja manda o valor limpo.
 */
export function lerValor(bruto) {
  if (typeof bruto === 'number') {
    if (!Number.isFinite(bruto)) return null
    return Math.round(bruto * 100) / 100
  }
  const texto = String(bruto ?? '').trim()
  if (!/^\d{1,9}([.,]\d{1,2})?$/.test(texto)) return null
  return Math.round(Number(texto.replace(',', '.')) * 100) / 100
}

/* Os nomes dos meses, para o filtro e para a visao anual. */
export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
