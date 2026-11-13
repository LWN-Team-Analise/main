import { useState } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { PAINEIS, VISUALIZACAO, painelPorChave } from '@/domain/permissoes'

/**
 * "Meu painel", a primeira linha do quadro de permissoes do setor
 * (atualizacao 53).
 *
 * O painel e a area com menu proprio que e DO SETOR (o Administrativo,
 * o Almoxarife): quem esta nele ve "Meu painel" no menu da foto, logo
 * acima de Configuracoes, e ele abre o inicio do painel. E opcional.
 *
 * Marcar abre a escolha: qual painel e se ele pode ser incluido em outros
 * setores. Com "Não", ele e so deste setor e fica travado nos outros ate
 * este mudar (desmarcar, trocar de painel ou liberar). So quem tem acesso
 * total escolhe — a API recusa igual (server/routes/equipe.js).
 *
 * `valem` e a lista de permissoes que vale agora na tela: o Almoxarife so
 * e painel de quem ve a aba dele.
 */
export default function PainelDoSetor({ cargo, cargos, painel, exclusivo, acessoTotal, valem, souTotal, aoMudar }) {
  const [escolhendo, setEscolhendo] = useState(false)
  const [escolha, setEscolha] = useState('')
  const [soDeste, setSoDeste] = useState(false)

  const def = painelPorChave(painel)
  /* o painel que pede uma aba cai quando a aba e desmarcada */
  const semAbaDe = (p) => Boolean(p?.exige) && !acessoTotal && !valem.includes(p.exige)
  const rotuloDaAba = (chave) => VISUALIZACAO.find((v) => v.chave === chave)?.rotulo ?? chave
  const caiu = def && semAbaDe(def)

  const outros = cargos.filter((c) => String(c.id) !== String(cargo.id))
  const donoExclusivo = (chave) => outros.find((c) => c.painel === chave && c.painelExclusivo) ?? null
  const tambemTem = (chave) => outros.filter((c) => c.painel === chave)

  const abrir = () => {
    setEscolha(painel ?? '')
    setSoDeste(Boolean(painel) && exclusivo)
    setEscolhendo(true)
  }

  const escolhaTambem = escolha ? tambemTem(escolha) : []

  const confirmar = () => {
    if (!escolha) return
    aoMudar(escolha, soDeste && escolhaTambem.length === 0)
    setEscolhendo(false)
  }

  return (
    <div className="perm__grupo perm__grupo--painel">
      <div className="perm__aba">
        <label
          className={`perm__chip perm__chip--aba ${souTotal ? '' : 'is-travada'}`.trim()}
          title={souTotal ? undefined : 'Só quem tem acesso total escolhe o painel do setor.'}
        >
          <input
            type="checkbox"
            checked={Boolean(painel)}
            disabled={!souTotal}
            onChange={() => (painel ? aoMudar(null, false) : abrir())}
          />
          <span>Meu painel</span>
        </label>
      </div>

      <div className="perm__alts">
        {def ? (
          <p className="painelset__atual">
            <strong>{def.rotulo}</strong>
            <span>{exclusivo ? 'só deste setor' : 'pode ser de outros setores'}</span>
            {souTotal && (
              <button type="button" className="painelset__trocar" onClick={abrir}>
                Alterar
              </button>
            )}
          </p>
        ) : (
          <p className="painelset__dica">
            Opcional: o painel aparece como “Meu painel” no menu da foto de quem está neste setor.
          </p>
        )}
        {caiu && (
          <p className="perm__trava">
            O painel {def.rotulo} sai ao salvar: marque a aba “{rotuloDaAba(def.exige)}” para mantê-lo.
          </p>
        )}
      </div>

      <Modal aberto={escolhendo} aoFechar={() => setEscolhendo(false)} titulo="Meu painel do setor" largura={460}>
        <div className="painelset">
          <fieldset className="painelset__grupo">
            <legend>Qual é o painel deste setor?</legend>
            {PAINEIS.map((p) => {
              const dono = donoExclusivo(p.chave)
              const semAba = semAbaDe(p)
              const travado = Boolean(dono) || semAba
              return (
                <label key={p.chave} className={`painelset__opcao ${travado ? 'is-travada' : ''}`.trim()}>
                  <input
                    type="radio"
                    name="painel-do-setor"
                    checked={escolha === p.chave}
                    disabled={travado}
                    onChange={() => setEscolha(p.chave)}
                  />
                  <span>
                    <strong>{p.rotulo}</strong>
                    {dono && <em>Só do setor {dono.nome}. Para usar aqui, libere lá primeiro.</em>}
                    {!dono && semAba && <em>Marque a aba “{rotuloDaAba(p.exige)}” primeiro.</em>}
                  </span>
                </label>
              )
            })}
          </fieldset>

          <fieldset className="painelset__grupo" disabled={!escolha}>
            <legend>Este painel pode ser incluído em outros setores?</legend>
            <label className="painelset__opcao">
              <input type="radio" name="painel-outros" checked={!soDeste} onChange={() => setSoDeste(false)} />
              <span>
                <strong>Sim</strong>
              </span>
            </label>
            <label className={`painelset__opcao ${escolhaTambem.length > 0 ? 'is-travada' : ''}`.trim()}>
              <input
                type="radio"
                name="painel-outros"
                checked={soDeste && escolhaTambem.length === 0}
                disabled={escolhaTambem.length > 0}
                onChange={() => setSoDeste(true)}
              />
              <span>
                <strong>Não, só deste setor</strong>
                {escolhaTambem.length > 0 ? (
                  <em>
                    Também é de {escolhaTambem.map((c) => c.nome).join(', ')}. Tire de lá antes de deixá-lo só deste setor.
                  </em>
                ) : (
                  <em>Nos outros setores ele fica travado até este mudar.</em>
                )}
              </span>
            </label>
          </fieldset>

          <div className="painelset__acoes">
            <Button onClick={confirmar} disabled={!escolha}>
              Usar este painel
            </Button>
          </div>
          <p className="painelset__nota">Vale depois de salvar o setor.</p>
        </div>
      </Modal>
    </div>
  )
}
