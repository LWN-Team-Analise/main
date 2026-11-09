/*
 * Dados juridicos da empresa, num lugar so: o site (src/) e o sistema (core/)
 * leem daqui.
 *
 * PREENCHER ANTES DE PUBLICAR. Nada aqui foi inventado: o que esta vazio nao
 * existe em nenhum lugar do projeto. Campo vazio nao aparece na pagina
 * publicada; rodando local (npm run dev), aparece uma marca amarela com o que
 * falta.
 */
export const legal = {
  // PREENCHER: razao social completa, como no cartao do CNPJ.
  razaoSocial: '',
  // PREENCHER: CNPJ com mascara (00.000.000/0000-00).
  cnpj: '',
  // PREENCHER: encarregado pelo tratamento de dados pessoais (LGPD, art. 41).
  encarregado: { nome: '', email: '' },
};

/** "Razao Social, CNPJ 00.000.000/0000-00", so com o que estiver preenchido. */
export const identificacaoDaEmpresa = [legal.razaoSocial, legal.cnpj && `CNPJ ${legal.cnpj}`]
  .filter(Boolean)
  .join(', ');

/** A marca do que falta (HTML): so aparece rodando local, nunca publicada. */
export const faltaPreencher = (rotulo) => (import.meta.env.DEV ? ` <mark>[PREENCHER: ${rotulo}]</mark>` : '');
