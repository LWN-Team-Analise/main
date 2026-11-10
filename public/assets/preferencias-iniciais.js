/* O tema e o idioma escolhidos antes de a pagina desenhar, para nao piscar.
   Em arquivo proprio porque a CSP do site (vercel.json) nao aceita script
   embutido no HTML. */
try {
  if (localStorage.getItem('lwn-color-scheme') === 'dark') document.documentElement.dataset.scheme = 'dark'
  if (localStorage.getItem('lwn-language') === 'en') {
    document.documentElement.dataset.lang = 'en'
    document.documentElement.lang = 'en'
  }
} catch (e) {
  /* sem acesso ao armazenamento: fica o padrao */
}
