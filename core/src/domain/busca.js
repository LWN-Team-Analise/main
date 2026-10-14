import { tituloDaObra } from './obras'

/* ============================================================
   A BUSCA DA BARRA DE CIMA

   Um campo so para tres coisas que ate aqui viviam separadas: o
   cadastro (cliente, obra, pessoa), as telas e os ajustes. Quem
   digita nao sabe — nem tem por que saber — se "modo noturno" e
   uma tela, um botao ou uma preferencia; sabe o nome da coisa.

   Por isso os ajustes tem SINONIMOS escritos a mao. "Modo noturno"
   e o rotulo que aparece na tela, mas quem procura digita "escuro",
   "noite", "dark" ou "tema" — e um campo que so acha pelo rotulo
   exato e um campo que so serve para quem ja sabia onde estava.

   Tudo aqui e funcao pura: entra o termo e os dados, sai a lista.
   Quem navega, destaca e troca o tema e a tela.
   ============================================================ */

/** Tira acento e caixa: "Écio" acha por "ecio", "configuracoes" acha "Configurações". */
export const semAcento = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Telas e ajustes.
 *
 * `termos` e o que a pessoa pode digitar; `titulo` e o que ela le na
 * lista. `acao` existe para o que NAO e um lugar: trocar o tema
 * acontece ali mesmo, sem sair da tela em que se esta.
 */
const ATALHOS = [
  /* ---------------- telas ---------------- */
  {
    id: 'tela-inicio',
    grupo: 'Telas',
    titulo: 'Página inicial',
    detalhe: 'Tarefas do dia, quadro e dashboard',
    rota: '/app',
    permissao: 'ver_inicio',
    termos: 'inicio home principal tarefas do dia quadro dashboard painel grade agenda',
  },
  {
    id: 'tela-obras',
    grupo: 'Telas',
    titulo: 'Obras',
    detalhe: 'As obras em andamento',
    rota: '/app/obras',
    permissao: 'ver_obras',
    termos: 'obras em andamento abertas roteiro etapas checks servico',
  },
  {
    id: 'tela-clientes',
    grupo: 'Telas',
    titulo: 'Clientes',
    detalhe: 'Cadastro de clientes e setores',
    rota: '/app/clientes',
    permissao: 'ver_clientes',
    termos: 'clientes empresas cadastro contratante setor endereco',
  },
  {
    id: 'tela-concluidas',
    grupo: 'Telas',
    titulo: 'Concluídas',
    detalhe: 'As obras já encerradas',
    rota: '/app/concluidas',
    permissao: 'ver_concluidas',
    termos: 'concluidas finalizadas encerradas entregues arquivo historico',
  },
  {
    id: 'tela-avaliacoes',
    grupo: 'Telas',
    titulo: 'Avaliações',
    detalhe: 'As notas das obras e dos clientes',
    rota: '/app/avaliacoes',
    permissao: 'ver_avaliacoes',
    termos: 'avaliacoes notas nota estrelas satisfacao pesquisa desempenho',
  },
  {
    id: 'tela-despesas',
    grupo: 'Telas',
    titulo: 'Despesas',
    detalhe: 'Enviar despesa, refeição ou bônus',
    rota: '/app/despesas',
    permissao: 'ver_despesas',
    termos: 'despesas despesa reembolso gasto recibo comprovante nota fiscal vale transporte combustivel refeicao almoco janta bonus viagem apartamento',
  },
  {
    id: 'tela-meus-envios',
    grupo: 'Telas',
    titulo: 'Meus envios',
    detalhe: 'O que você já enviou em Despesas, por mês e por ano',
    rota: '/app/despesas/envios',
    permissao: 'ver_despesas',
    termos: 'meus envios despesas enviadas historico reembolso total do mes total anual',
  },
  {
    id: 'tela-envios-gerais',
    grupo: 'Telas',
    titulo: 'Envios gerais',
    detalhe: 'As despesas, refeições e bônus de cada pessoa da equipe',
    rota: '/app/despesas/gerais',
    permissao: 'revisar_despesa_geral',
    termos: 'envios gerais despesas da equipe revisar despesa geral reembolsos de todos',
  },
  {
    id: 'tela-usuarios',
    grupo: 'Telas',
    titulo: 'Usuários',
    detalhe: 'A equipe, os setores e os cargos',
    rota: '/app/usuarios',
    permissoes: ['editar_usuario', 'editar_cargo', 'editar_cargo_titulo'],
    termos: 'usuarios equipe pessoas colaboradores funcionarios cargos setores permissoes',
  },
  {
    id: 'tela-config',
    grupo: 'Telas',
    titulo: 'Configurações',
    detalhe: 'Sua conta e as preferências do sistema',
    rota: '/app/configuracoes',
    termos: 'configuracoes ajustes preferencias opcoes conta perfil minha conta',
  },

  /* ---------------- o tema: acontece na hora ---------------- */
  {
    id: 'tema-claro',
    grupo: 'Aparência',
    titulo: 'Modo claro',
    detalhe: 'Troca o tema agora',
    acao: 'tema:light',
    termos: 'modo claro tema claro dia luz branco light aparencia',
  },
  {
    id: 'tema-escuro',
    grupo: 'Aparência',
    titulo: 'Modo noturno',
    detalhe: 'Troca o tema agora',
    acao: 'tema:dark',
    termos: 'modo escuro noturno modo noturno noite tema escuro preto dark aparencia',
  },

  /* ---------------- ajustes, todos em Configuracoes ---------------- */
  {
    id: 'cfg-foto',
    grupo: 'Ajustes',
    titulo: 'Foto de perfil',
    detalhe: 'Em Configurações › Sua conta',
    rota: '/app/configuracoes',
    termos: 'foto imagem avatar retrato perfil enquadramento trocar foto',
  },
  {
    id: 'cfg-nome',
    grupo: 'Ajustes',
    titulo: 'Nome completo',
    detalhe: 'Em Configurações › Sua conta',
    rota: '/app/configuracoes',
    termos: 'nome completo meu nome',
  },
  {
    id: 'cfg-email',
    grupo: 'Ajustes',
    titulo: 'E-mail',
    detalhe: 'Em Configurações › Sua conta',
    rota: '/app/configuracoes',
    termos: 'email e-mail correio endereco eletronico',
  },
  {
    id: 'cfg-telefone',
    grupo: 'Ajustes',
    titulo: 'Telefone',
    detalhe: 'Em Configurações › Sua conta',
    rota: '/app/configuracoes',
    termos: 'telefone celular numero contato whatsapp ddd',
  },
  {
    id: 'cfg-nascimento',
    grupo: 'Ajustes',
    titulo: 'Data de nascimento',
    detalhe: 'Em Configurações › Sua conta',
    rota: '/app/configuracoes',
    termos: 'nascimento aniversario data de nascimento idade',
  },
  {
    id: 'cfg-cpf',
    grupo: 'Ajustes',
    titulo: 'CPF',
    detalhe: 'Em Configurações › Sua conta',
    rota: '/app/configuracoes',
    termos: 'cpf documento numero do documento',
  },
  {
    id: 'cfg-setor',
    grupo: 'Ajustes',
    titulo: 'Setor e cargo',
    detalhe: 'Em Configurações › Sua conta',
    rota: '/app/configuracoes',
    termos: 'setor cargo funcao area departamento titulo',
  },
  {
    id: 'cfg-senha',
    grupo: 'Ajustes',
    titulo: 'Trocar a senha',
    detalhe: 'Em Configurações › Senha',
    rota: '/app/configuracoes',
    termos: 'senha trocar senha alterar senha nova senha password seguranca',
  },
  {
    id: 'cfg-outlook',
    grupo: 'Ajustes',
    titulo: 'Conta Microsoft (Outlook)',
    detalhe: 'Em Configurações',
    rota: '/app/configuracoes',
    termos: 'outlook microsoft conta microsoft vincular entrar com office 365',
  },
]

/**
 * Quanto um texto responde ao que foi digitado.
 *
 * Tres degraus, e nao um "achou/nao achou": digitar "sao" tem de
 * trazer "São Paulo Engenharia" ANTES de "Construtora Vista de São
 * Sebastiao", senao a lista fica na ordem do banco e quem procura
 * continua procurando.
 *
 *   3  comeca com o termo
 *   2  alguma palavra comeca com o termo
 *   1  aparece em algum lugar
 *   0  nao aparece
 */
function nota(texto, alvo) {
  const t = semAcento(texto)
  if (!t) return 0
  if (t.startsWith(alvo)) return 3
  if (t.includes(` ${alvo}`)) return 2
  return t.includes(alvo) ? 1 : 0
}

/** A melhor nota entre varios campos. */
const melhor = (campos, alvo) => Math.max(0, ...campos.map((c) => nota(c, alvo)))

const TETO_POR_GRUPO = 5

/**
 * A busca.
 *
 * `pode` filtra por permissao: quem nao enxerga Concluidas nao acha
 * obra concluida aqui — a barra de busca nao e uma porta dos fundos
 * para o que a aba da frente esconde.
 */
export function procurar(termo, dados) {
  const alvo = semAcento(termo).trim()
  if (alvo.length < 2) return []

  const {
    clientes = [],
    obras = [],
    equipe = [],
    concluida = () => false,
    clientePorId = () => null,
    pode = () => true,
  } = dados ?? {}

  const achados = []

  /* ---------------- clientes ---------------- */
  if (pode('ver_clientes')) {
    for (const c of clientes) {
      const peso = melhor([c.nome, c.cidade, c.estado, c.cnpj], alvo)
      if (!peso) continue
      achados.push({
        grupo: 'Clientes',
        id: `cliente-${c.id}`,
        titulo: c.nome,
        detalhe: [c.cidade, c.estado].filter(Boolean).join(' — ') || 'Sem cidade cadastrada',
        rota: '/app/clientes',
        destacar: c.nome,
        peso,
      })
    }
  }

  /* ---------------- obras ----------------
     O nome do cliente entra na busca da obra de proposito: uma obra
     nao tem nome proprio — ela e "a proposta 214 da Eurofirma". Quem
     digita "eurofirma" quer o cliente E as obras dele, e nao ter de
     adivinhar o numero da proposta. */
  for (const o of obras) {
    const fechada = concluida(o)
    if (!pode(fechada ? 'ver_concluidas' : 'ver_obras')) continue

    const cliente = clientePorId(o.clienteId)
    const peso = melhor([o.proposta, o.descricao, cliente?.nome, tituloDaObra(o, cliente)], alvo)
    if (!peso) continue

    achados.push({
      grupo: 'Obras',
      id: `obra-${o.id}`,
      titulo: tituloDaObra(o, cliente),
      detalhe: o.descricao?.trim() || (fechada ? 'Obra concluída' : 'Obra em andamento'),
      etiqueta: fechada ? 'Concluída' : 'Em aberto',
      fechada,
      rota: fechada ? `/app/concluidas/${o.id}` : `/app/obras/${o.id}`,
      peso,
    })
  }

  /* ---------------- pessoas ---------------- */
  if (pode('editar_usuario') || pode('editar_cargo') || pode('editar_cargo_titulo')) {
    for (const p of equipe) {
      const peso = melhor([p.nome, p.email, p.cargoNome, p.cargoTitulo], alvo)
      if (!peso) continue
      achados.push({
        grupo: 'Pessoas',
        id: `pessoa-${p.id}`,
        titulo: p.nome,
        detalhe: p.cargoTitulo || p.cargoNome || p.email || 'Equipe',
        rota: '/app/usuarios',
        destacar: p.nome,
        peso,
      })
    }
  }

  /* ---------------- telas, aparencia e ajustes ---------------- */
  for (const a of ATALHOS) {
    const liberado = a.permissoes
      ? a.permissoes.some((p) => pode(p))
      : a.permissao
        ? pode(a.permissao)
        : true
    if (!liberado) continue

    const peso = Math.max(nota(a.titulo, alvo), nota(a.termos, alvo) ? 2 : 0)
    if (!peso) continue
    achados.push({ ...a, peso })
  }

  /* ---------------- a ordem e o teto ----------------
     Sem teto, digitar "a" traria o cadastro inteiro e a lista viraria
     uma segunda tela de clientes. Cinco por grupo e o que cabe na
     altura da caixa sem rolagem. */
  const ordem = ['Clientes', 'Obras', 'Pessoas', 'Aparência', 'Ajustes', 'Telas']
  const porGrupo = new Map(ordem.map((g) => [g, []]))

  for (const item of achados.sort((a, b) => b.peso - a.peso || a.titulo.localeCompare(b.titulo))) {
    const balde = porGrupo.get(item.grupo)
    if (balde && balde.length < TETO_POR_GRUPO) balde.push(item)
  }

  return ordem.flatMap((g) => porGrupo.get(g) ?? [])
}

/** Os grupos na ordem em que aparecem, para a tela desenhar os titulos. */
export function agrupar(resultados) {
  const grupos = []
  for (const r of resultados) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.nome === r.grupo) ultimo.itens.push(r)
    else grupos.push({ nome: r.grupo, itens: [r] })
  }
  return grupos
}
