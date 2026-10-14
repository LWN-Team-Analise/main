/**
 * Foto de usuario, logo e capa de cliente chegam como data URL e voltam
 * para todas as telas dentro de <img src> e de background-image.
 *
 * Sem conferencia, o campo aceitava qualquer texto: um endereco de fora
 * (que vira um pixel espiao carregado por toda a equipe a cada tela) ou
 * um SVG com script. Aqui so passa imagem de verdade, em base64, nos
 * formatos que o editor de imagem e o Outlook produzem. SVG fica de fora
 * de proposito: ele e um documento, e pode carregar script.
 */
const IMAGEM = /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/

/** Vazio (tirar a imagem) ou uma imagem em base64. */
export const imagemValida = (valor) => valor == null || valor === '' || IMAGEM.test(String(valor))

export const IMAGEM_INVALIDA = 'Imagem inválida. Use PNG, JPEG, WEBP, GIF ou AVIF.'
