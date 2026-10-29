import { useMemo } from 'react'
import Seletor from '@/components/Seletor/Seletor'
import { useDados } from '@/context/DadosContext'

/**
 * QUEM DO SETOR MARCA QUAL CHECK (atualizacao 37), na tela do setor.
 *
 * O setor continua dono dos cards dele. Aqui se aperta isso por CARGO
 * (Tecnico de Qualificacao, Estagiaria...) e, se precisar, por PESSOA:
 *
 *   - a partir de que etapa ela marca ("da 3ª em diante");
 *   - os checks que ficam de fora ("menos Determinar Focal Point").
 *
 * Cargo sem regra marca todos os checks do setor, como sempre. A regra
 * da pessoa toma o lugar da do cargo dela — inclusive para liberar tudo
 * a alguem de um cargo restrito.
 *
 * `regras` e o formato de `lerRegrasCheck` (src/domain/obras.js); cada
 * mudanca sobe inteira por `aoMudar` e so vai para o banco no Salvar do
 * setor.
 */
export default function RegrasCheck({ setor, regras, aoMudar }) {
  const { equipe, titulos, roteiro } = useDados()

  const pessoas = useMemo(
    () =>
      equipe
        .filter((p) => p.cargo === setor.chave && p.ativo !== false)
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')),
    [equipe, setor.chave],
  )

  /* as etapas e os checks DESTE setor no roteiro de hoje */
  const etapas = useMemo(
    () => roteiro.filter((e) => !e.vigenteAte).sort((a, b) => a.ordem - b.ordem),
    [roteiro],
  )
  const checks = useMemo(
    () =>
      etapas.flatMap((e) =>
        e.cards
          .filter((card) => !card.vigenteAte)
          .flatMap((card) =>
            card.checks
              .filter((k) => !k.vigenteAte && !k.obraId)
              .filter((k) => ((k.cargos ?? []).length > 0 ? k.cargos : card.cargos).includes(setor.chave))
              .map((k) => ({ id: String(k.id), titulo: k.titulo, etapa: e.ordem, nomeEtapa: e.nome })),
          ),
      ),
    [etapas, setor.chave],
  )

  const nomeDoTitulo = (id) => titulos.find((t) => String(t.id) === String(id))?.nome ?? 'Cargo removido'

  /* os cargos de quem esta no setor, e os que ja tem regra */
  const cargos = useMemo(() => {
    const ids = new Set([...pessoas.map((p) => p.cargoTituloId).filter(Boolean).map(String), ...Object.keys(regras.cargos)])
    return [...ids]
      .map((id) => ({
        id,
        nome: nomeDoTitulo(id),
        qtd: pessoas.filter((p) => String(p.cargoTituloId) === id).length,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [pessoas, regras.cargos, titulos])

  const comExcecao = Object.keys(regras.pessoas)
  const semExcecao = pessoas.filter((p) => !comExcecao.includes(String(p.id)))
  const pessoa = (id) => equipe.find((p) => String(p.id) === String(id))

  const mudar = (grupo, id, regra) => {
    const proximas = { cargos: { ...regras.cargos }, pessoas: { ...regras.pessoas } }
    if (regra === undefined) delete proximas[grupo][id]
    else proximas[grupo][id] = regra
    aoMudar(proximas)
  }

  const semSetorNoRoteiro = checks.length === 0

  return (
    <section className="perm perm--solta regras" aria-labelledby="setor-regras">
      <header className="perm__topo">
        <h3 id="setor-regras">Checks por cargo</h3>
      </header>

      {semSetorNoRoteiro ? (
        <p className="perm__nota">Este setor não tem nenhum check nas etapas da obra.</p>
      ) : (
        <>
          {cargos.length === 0 ? (
            <p className="perm__nota">Ninguém deste setor tem cargo definido.</p>
          ) : (
            <ul className="regras__lista">
              {cargos.map((c) => (
                <LinhaRegra
                  key={c.id}
                  nome={c.nome}
                  detalhe={c.qtd === 1 ? '1 pessoa' : `${c.qtd} pessoas`}
                  regra={regras.cargos[c.id]}
                  etapas={etapas}
                  checks={checks}
                  aoMudar={(regra) => mudar('cargos', c.id, regra)}
                />
              ))}
            </ul>
          )}

          <h4 className="regras__subtitulo">Exceção por pessoa</h4>
          {comExcecao.length > 0 && (
            <ul className="regras__lista">
              {comExcecao.map((id) => {
                const p = pessoa(id)
                return (
                  <LinhaRegra
                    key={id}
                    nome={p?.nome ?? 'Pessoa removida'}
                    detalhe={p?.cargoTituloId ? nomeDoTitulo(p.cargoTituloId) : 'sem cargo'}
                    regra={regras.pessoas[id]}
                    etapas={etapas}
                    checks={checks}
                    aoMudar={(regra) => mudar('pessoas', id, regra ?? { etapa: null, exceto: [] })}
                    aoTirar={() => mudar('pessoas', id, undefined)}
                  />
                )
              })}
            </ul>
          )}
          {semExcecao.length > 0 && (
            <div className="regras__nova">
              <Seletor
                valor=""
                aoMudar={(id) => id && mudar('pessoas', id, { ...(regras.cargos[String(pessoa(id)?.cargoTituloId)] ?? { etapa: null, exceto: [] }) })}
                vazio="Adicionar pessoa..."
                largo
                opcoes={semExcecao.map((p) => ({
                  valor: String(p.id),
                  rotulo: p.cargoTituloId ? `${p.nome} · ${nomeDoTitulo(p.cargoTituloId)}` : p.nome,
                }))}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Um cargo (ou uma pessoa): a etapa de onde marca e os checks de fora. */
function LinhaRegra({ nome, detalhe, regra, etapas, checks, aoMudar, aoTirar }) {
  const etapa = regra?.etapa ?? null
  const exceto = regra?.exceto ?? []
  const aplicar = (campos) => {
    const nova = { etapa, exceto, ...campos }
    aoMudar(nova.etapa || nova.exceto.length > 0 ? nova : null)
  }

  /* o que da para tirar: os checks que a etapa escolhida ainda deixa */
  const disponiveis = checks.filter((k) => (!etapa || k.etapa >= etapa) && !exceto.includes(k.id))
  const fora = exceto.map((id) => checks.find((k) => k.id === id) ?? { id, titulo: 'Check removido', nomeEtapa: '' })

  return (
    <li className="regras__linha">
      <div className="regras__quem">
        <strong>{nome}</strong>
        <span>{detalhe}</span>
      </div>
      <div className="regras__campos">
        <Seletor
          valor={etapa ? String(etapa) : ''}
          aoMudar={(v) => aplicar({ etapa: v ? Number(v) : null, exceto: exceto.filter((id) => !v || (checks.find((k) => k.id === id)?.etapa ?? 99) >= Number(v)) })}
          opcoes={[
            { valor: '', rotulo: 'Todas as etapas' },
            ...etapas.filter((e) => e.ordem > 1).map((e) => ({ valor: String(e.ordem), rotulo: `A partir da ${e.nome}` })),
          ]}
        />
        {disponiveis.length > 0 && (
          <Seletor
            valor=""
            aoMudar={(id) => id && aplicar({ exceto: [...exceto, id] })}
            vazio="Tirar um check..."
            largo
            opcoes={disponiveis.map((k) => ({ valor: k.id, rotulo: `${k.nomeEtapa} · ${k.titulo}` }))}
          />
        )}
        {aoTirar && (
          <button type="button" className="regras__tirar" onClick={aoTirar}>
            Tirar exceção
          </button>
        )}
      </div>
      {fora.length > 0 && (
        <ul className="regras__fora" aria-label={`Checks que ${nome} não marca`}>
          {fora.map((k) => (
            <li key={k.id}>
              <span>
                Menos: {k.nomeEtapa ? `${k.nomeEtapa} · ` : ''}
                {k.titulo}
              </span>
              <button
                type="button"
                onClick={() => aplicar({ exceto: exceto.filter((id) => id !== k.id) })}
                aria-label={`Devolver ${k.titulo}`}
                title="Devolver este check"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
