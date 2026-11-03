/* ============================================================
   QUEM RECEBE AVISO — O VOCABULÁRIO, NUM LUGAR SÓ
   ------------------------------------------------------------
   Os dois canais de aviso do sistema — e-mail (api/email.js) e notificação de
   celular (api/push.js) — precisavam responder a mesma pergunta: *quem
   precisa saber disto?* Cada um respondia do seu jeito, e por isso davam
   respostas diferentes para o mesmo fato:

     - o e-mail da aprovação ia só para o responsável indicado na OS;
     - a notificação da mesma aprovação ia para as 13 pessoas que têm a
       permissão "Aprovar / Editar qualquer OS".

   A regra agora mora aqui, e os dois canais a usam.

   ------------------------------------------------------------
   OS DOIS PRINCÍPIOS
   ------------------------------------------------------------

   1. AVISO TEM DONO.
      Quase todo aviso deste sistema é uma TAREFA dirigida a alguém: o
      responsável indicado na OS aprova, o técnico daquela obra retira, quem
      pediu prorrogação recebe a resposta. Tendo dono, o aviso vai só para o
      dono.

   2. O CARGO (ou a permissão) É FILTRO, NUNCA ACRÉSCIMO.
      Com dono definido, o cargo só confirma que aquela pessoa é mesmo quem
      deveria agir — ele não traz mais ninguém junto. Era exatamente o
      contrário disso que fazia 30 das 38 pessoas receberem "Separar OS":
      somava-se a lista de donos COM todo mundo que enxerga a aba.

      O cargo volta a escolher sozinho quando o aviso não tem dono — "alguém
      precisa separar esta OS" é da fila de quem separa, não de uma pessoa.

   Por que isso importa: todo aviso a mais é um aviso que alguém aprende a
   ignorar. Quando a notificação vira ruído, a que importava passa batido
   junto.
   ============================================================ */

/* Sem acento, minúsculo, sem espaço nas pontas. */
function textoSimples(v) {
    return String(v || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().trim();
}

// Cargos comparados por PEDAÇO do nome: o banco tem "Gerente de Operações" e
// "Supervisor", e amanhã pode ter "Supervisor de Obra". Para efeito de
// aprovação, todos são a mesma função.
const CARGOS_APROVADORES = ['supervisor', 'gerente'];
const CARGOS_RECEBEM_FERRAMENTA = ['auxiliar tecnico'];

// Recebe TODOS os avisos. Identificado por e-mail, não por cargo: o cargo do
// Marcelo (Gestor de Ativos) é dividido com outra pessoa, que não deve
// receber nada.
const RECEBE_TUDO = ['marcelo@lwnengenharia.com.br'];

function ehAprovador(cargo) {
    const c = textoSimples(cargo);
    return CARGOS_APROVADORES.some(x => c.includes(x));
}

function recebeFerramenta(cargo) {
    const c = textoSimples(cargo);
    return CARGOS_RECEBEM_FERRAMENTA.some(x => c.includes(x));
}

function recebeTudo(email) {
    return RECEBE_TUDO.includes(textoSimples(email));
}

/* ------------------------------------------------------------
   PERMISSÕES
   `usuarios.permissoes` foi gravada ao longo do tempo de três formas
   (objeto, array e string JSON). Ler as três evita perder destinatário por
   causa do formato.
   ------------------------------------------------------------ */
function listaPermissoes(bruto) {
    let v = bruto;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
    if (Array.isArray(v)) return v.map(String);
    if (v && typeof v === 'object') return Object.keys(v).filter(k => v[k]);
    return [];
}

function temPermissao(usuario, modulo) {
    if (!modulo) return false;
    const p = listaPermissoes(usuario && usuario.permissoes);
    return p.includes('*') || p.includes(modulo);
}

/* ------------------------------------------------------------
   A ESCOLHA
   ------------------------------------------------------------
   `usuarios`   a lista completa de ativos, já lida do banco.
   `regra`      { cargo, permissao } — quem PODE receber este tipo de aviso.
                `cargo` é uma função (usuario -> bool); `permissao` é a chave
                do módulo. Qualquer um dos dois já qualifica.
   `donos`      ids de quem o aviso é (opcional). Havendo donos, a regra vira
                filtro: é preciso ser dono E passar na regra.
   `excluirId`  quem fez a ação. Só vale para aviso SEM dono: com dono
                escolhido, ele recebe mesmo tendo sido quem agiu — solicitar
                uma OS e indicar a si mesmo como responsável é comum, e aí o
                aviso é a tarefa "aprove isto", não um "você fez isto".
   ------------------------------------------------------------ */
function escolher(usuarios, { regra, donos, excluirId } = {}) {
    const todos = Array.isArray(usuarios) ? usuarios : [];
    const r = regra || {};

    const passaNaRegra = (u) => {
        if (!r.cargo && !r.permissao) return true;   // sem regra, todos passam
        if (r.cargo && r.cargo(u)) return true;
        if (r.permissao && temPermissao(u, r.permissao)) return true;
        return false;
    };

    // Quem recebe tudo entra por fora dos filtros: eles estreitam o aviso
    // para uma pessoa específica, e por eles ele cairia fora de todo aviso
    // dirigido a terceiros — "recebe tudo" deixaria de ser verdade.
    const recebemTudo = todos.filter(u => recebeTudo(u.email));
    let lista = todos.filter(u => !recebeTudo(u.email) && passaNaRegra(u));

    const ids = Array.isArray(donos)
        ? new Set(donos.filter(v => v != null).map(String))
        : null;
    const temDono = !!(ids && ids.size);

    if (temDono) {
        lista = lista.filter(u => ids.has(String(u.id)));

        // O dono que não passa na regra ainda assim recebe: foi ele que a OS
        // escolheu. A regra existe para não ESPALHAR o aviso, não para negá-lo
        // a quem tem a tarefa na mão.
        ids.forEach(id => {
            if (lista.some(u => String(u.id) === id)) return;
            const u = todos.find(x => String(x.id) === id && !recebeTudo(x.email));
            if (u) lista.push(u);
        });
    }

    recebemTudo.forEach(u => {
        if (!lista.some(x => String(x.id) === String(u.id))) lista.push(u);
    });

    if (excluirId != null && !temDono) {
        lista = lista.filter(u => String(u.id) !== String(excluirId));
    }

    return lista;
}

export {
    textoSimples,
    listaPermissoes,
    temPermissao,
    ehAprovador,
    recebeFerramenta,
    recebeTudo,
    escolher,
    CARGOS_APROVADORES,
    CARGOS_RECEBEM_FERRAMENTA,
    RECEBE_TUDO
};
