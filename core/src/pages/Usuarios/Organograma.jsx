import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell/AppShell'
import Avatar, { PilhaAvatares } from '@/components/Avatar/Avatar'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'
import { CampoSelecao } from '@/components/Campo/Campo'
import { useDados } from '@/context/DadosContext'
import { useTheme } from '@/context/ThemeContext'
import { corAdaptada } from '@/utils/cor'
import './Organograma.css'

/**
 * ORGANOGRAMA (atualizacao 59) — na Area admin.
 *
 * Montado do que ja existe: os SETORES (cada um um bloco, com a cor dele),
 * as PESSOAS de cada setor e o CARGO de cada pessoa. O que e so do
 * organograma e o lugar de cada setor — a que setor ele responde e quem o
 * lidera —, que quem tem `editar_organograma` (o Administrativo) atualiza
 * pelo "Editar" de cada bloco. Quem entra, sai ou muda de setor muda em
 * Usuarios, e o organograma acompanha sozinho.
 *
 * A arvore e vertical (cada nivel um passo para a direita, com os fios),
 * para caber igual no computador e no celular.
 */
export default function Organograma() {
  const { cargos, equipe, pode } = useDados()
  const { isDark } = useTheme()
  const edita = pode('editar_organograma')
  const [editando, setEditando] = useState(null)

  const setores = useMemo(
    () =>
      cargos
        .filter((c) => !c.painelTv)
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR')),
    [cargos],
  )
  const ids = useMemo(() => new Set(setores.map((s) => s.id)), [setores])
  const filhosDe = (id) => setores.filter((s) => s.superiorId === id)
  /* o topo: quem nao responde a ninguem (ou a um setor que nao existe mais) */
  const raizes = setores.filter((s) => !s.superiorId || !ids.has(s.superiorId))
  const membrosDe = (setor) =>
    equipe.filter((p) => p.cargo === setor.chave).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const pessoaPorId = (id) => equipe.find((p) => String(p.id) === String(id)) ?? null

  const No = ({ setor, nivel }) => {
    const membros = membrosDe(setor)
    const lider = setor.liderId ? pessoaPorId(setor.liderId) : null
    const filhos = filhosDe(setor.id)
    return (
      <li className="orgno">
        <div className="orgno__cartao" style={{ '--cor': corAdaptada(setor.cor ?? '#6b7280', isDark) }}>
          <div className="orgno__topo">
            <strong className="orgno__nome">{setor.nome}</strong>
            {edita && (
              <button type="button" className="orgno__editar" onClick={() => setEditando(setor)}>
                Editar
              </button>
            )}
          </div>
          <p className="orgno__lider">
            {lider ? (
              <>
                <Avatar nome={lider.nome} foto={lider.foto} tamanho={26} />
                <span>
                  <strong>{lider.nome}</strong>
                  <em>Líder{lider.cargoTitulo ? ` · ${lider.cargoTitulo}` : ''}</em>
                </span>
              </>
            ) : (
              <em className="orgno__semlider">Sem líder definido</em>
            )}
          </p>
          {membros.length > 0 ? (
            <details className="orgno__membros">
              <summary>
                <PilhaAvatares pessoas={membros} tamanho={22} limite={5} />
                <span>
                  {membros.length} {membros.length === 1 ? 'pessoa' : 'pessoas'}
                </span>
              </summary>
              <ul>
                {membros.map((p) => (
                  <li key={p.id}>
                    <Avatar nome={p.nome} foto={p.foto} tamanho={22} />
                    <span>{p.nome}</span>
                    {p.cargoTitulo && <em>{p.cargoTitulo}</em>}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="orgno__vazio">Ninguém neste setor</p>
          )}
        </div>
        {filhos.length > 0 && nivel < 20 && (
          <ul className="orgarvore__filhos">
            {filhos.map((f) => (
              <No key={f.id} setor={f} nivel={nivel + 1} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <AppShell>
      <section className="organograma">
        <header>
          <h1 className="tela__titulo">Organograma</h1>
          <p className="tela__lead">
            Os setores, quem lidera cada um e quem está neles.
            {edita ? ' Use "Editar" em cada setor para dizer a quem ele responde e quem o lidera.' : ''}
          </p>
        </header>

        {setores.length === 0 ? (
          <p className="organograma__vazio">Nenhum setor cadastrado.</p>
        ) : (
          <ul className="orgarvore">
            {raizes.map((s) => (
              <No key={s.id} setor={s} nivel={0} />
            ))}
          </ul>
        )}
      </section>

      <ModalLugar setor={editando} setores={setores} aoFechar={() => setEditando(null)} />
    </AppShell>
  )
}

/** O lugar do setor: a que setor responde e quem lidera. */
function ModalLugar({ setor, setores, aoFechar }) {
  const { equipe, atualizarOrganograma } = useDados()
  const [superiorId, setSuperiorId] = useState('')
  const [liderId, setLiderId] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!setor) return
    setSuperiorId(setor.superiorId ?? '')
    setLiderId(setor.liderId ?? '')
    setErro('')
  }, [setor])

  /* nao responde a ele mesmo nem a quem esta abaixo dele */
  const abaixo = useMemo(() => {
    if (!setor) return new Set()
    const fora = new Set([setor.id])
    let cresceu = true
    while (cresceu) {
      cresceu = false
      for (const s of setores) {
        if (s.superiorId && fora.has(s.superiorId) && !fora.has(s.id)) {
          fora.add(s.id)
          cresceu = true
        }
      }
    }
    return fora
  }, [setor, setores])

  /* as pessoas do proprio setor primeiro: e de la que o lider costuma sair */
  const pessoas = useMemo(() => {
    if (!setor) return []
    const ativos = equipe.filter((p) => p.ativo !== false)
    const doSetor = ativos.filter((p) => p.cargo === setor.chave).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const outros = ativos.filter((p) => p.cargo !== setor.chave).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return [...doSetor, ...outros].map((p) => ({
      valor: String(p.id),
      rotulo: p.cargo === setor.chave ? p.nome : `${p.nome} (${p.cargoNome ?? 'outro setor'})`,
    }))
  }, [equipe, setor])

  const salvar = async (e) => {
    e.preventDefault()
    setSalvando(true)
    try {
      await atualizarOrganograma(setor.id, { superiorId: superiorId || null, liderId: liderId || null })
      aoFechar()
    } catch (falha) {
      setErro(falha.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal aberto={Boolean(setor)} aoFechar={aoFechar} titulo="Lugar no organograma" subtitulo={setor?.nome} largura={460}>
      <form className="orgform" onSubmit={salvar} noValidate>
        <CampoSelecao
          rotulo="Responde a"
          vazio="Ninguém (topo do organograma)"
          opcoes={[
            { valor: '', rotulo: 'Ninguém (topo do organograma)' },
            ...setores.filter((s) => !abaixo.has(s.id)).map((s) => ({ valor: s.id, rotulo: s.nome })),
          ]}
          value={superiorId}
          onChange={(ev) => {
            setSuperiorId(ev.target.value)
            setErro('')
          }}
        />
        <CampoSelecao
          rotulo="Líder do setor"
          vazio="Sem líder definido"
          opcoes={[{ valor: '', rotulo: 'Sem líder definido' }, ...pessoas]}
          value={liderId}
          onChange={(ev) => {
            setLiderId(ev.target.value)
            setErro('')
          }}
        />
        {erro && (
          <p className="orgform__erro" role="alert">
            {erro}
          </p>
        )}
        <footer className="orgform__rodape">
          <Button type="submit" loading={salvando}>
            Salvar
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
