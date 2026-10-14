/**
 * Um numero grande com o que ele quer dizer embaixo.
 *
 * `tom` ('bom' | 'ruim') pinta o numero e o fio do topo — so onde a cor
 * quer dizer alguma coisa (prazo). `cor` pinta SO o fio: e a identidade
 * de uma categoria (despesa, refeicao, bonus), nao um julgamento.
 */
export default function Tile({ rotulo, valor, nota, tom, cor }) {
  return (
    <article className="tile vidro" data-tom={tom} style={cor ? { '--tile-cor': cor } : undefined}>
      <p className="tile__rotulo">{rotulo}</p>
      <strong className="tile__valor">{valor}</strong>
      <p className="tile__nota">{nota}</p>
    </article>
  )
}
