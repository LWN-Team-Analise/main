/* ============================================================
   NOTIFICACOES DO ALMOXARIFE NO CELULAR

   No lwncontrol este arquivo tinha o proprio Web Push: as chaves VAPID
   na tabela push_config, as inscricoes em push_inscricoes e as rotas
   de inscrever/cancelar. No main as notificacoes ja existem — cada um
   liga as dele em Configuracoes, e server/push.js manda para os
   aparelhos de cada pessoa (push_inscricao). Entao aqui ficou so o que
   era do Almoxarife:

     - os MODELOS (titulo e corpo de cada aviso);
     - as REGRAS de quem recebe (o vocabulario de destinatarios.js);

   e o envio vai pelo notificar() do main. O clique na notificacao abre
   a aba certa do Almoxarife (?aba=, lido em public/almoxarife).
   ============================================================ */
import { notificar as notificarNoCelular } from '../push.js'
import * as dest from './destinatarios.js'

/* ------------------------------------------------------------
   MODELOS DE NOTIFICAÇÃO
   Título, corpo e a linha de identificação da OS saem daqui —
   um lugar só, para todas as telas falarem a mesma língua.

   Formato entregue ao usuário (mesma coisa no celular e no PC):
       Aprovar Lista
       Nova OS aguardando sua aprovação. OS #1258 — Enviado por: João Silva
   ------------------------------------------------------------ */
const MODELOS = {
    aprovar:      { titulo: 'Aprovar Lista',      corpo: 'Nova OS aguardando sua aprovação.',             aba: 'aprovar' },
    separar:      { titulo: 'Separar OS',         corpo: 'Nova OS aguardando sua separação.',             aba: 'conferencia' },
    bipar:        { titulo: 'Bipar OS',           corpo: 'Nova OS aguardando bipagem para envio.',        aba: 'conferencia' },
    devolver:     { titulo: 'Devolver OS',        corpo: 'Nova OS aguardando devolutiva de ferramentas.', aba: 'devolutiva' },
    concluida:    { titulo: 'OS Concluída',       corpo: 'Devolutiva finalizada — OS concluída.',         aba: 'concluidos' },
    reprovada:    { titulo: 'OS Reprovada',       corpo: 'Sua solicitação foi reprovada.',                aba: 'minhas-obras' },
    prorrogada:   { titulo: 'OS Prorrogada',      corpo: 'O prazo desta OS foi esticado.',                aba: 'devolutiva' },
    // Prorrogar virou pedido: quem tem "Aceitar prorrogação" decide na aba
    // "Aprovar", e quem pediu recebe a resposta.
    prorrogacao_solicitada: { titulo: 'Aprovar Prorrogação',    corpo: 'Uma OS aguarda a sua aprovação de prorrogação.', aba: 'aprovar' },
    prorrogacao_rejeitada:  { titulo: 'Prorrogação Rejeitada',  corpo: 'Seu pedido de prorrogação foi rejeitado.',       aba: 'devolutiva' },
    remanejamento:{ titulo: 'Receber Ferramenta', corpo: 'Nova ferramenta aguardando o seu recebimento.', aba: 'remanejamento' }
};

function numeroOS(os) {
    const n = (os && (os.numero_os || os.id)) || 0;
    return '#' + String(n).padStart(4, '0');
}

/* Linha 3 da notificação: "OS #1258 — Enviado por: João Silva" */
function linhaOS(os, remetente) {
    const quem = String(remetente || (os && os.solicitado_por) || '').trim();
    return `OS ${numeroOS(os)}${quem ? ` — Enviado por: ${quem}` : ''}`;
}

/* ------------------------------------------------------------
   DESTINATÁRIOS
   ------------------------------------------------------------
   A regra de quem recebe o quê mora em destinatarios.js, compartilhada
   com o e-mail. Aqui fica só o mapa: para cada tipo de aviso, QUEM precisa
   agir.

     aviso                    quem age                          tem dono?
     ----------------------   -------------------------------   ---------
     aprovar                  o responsável indicado na OS      sim
     separar                  a fila de quem separa TAGs        não
     bipar                    o técnico daquela obra            sim
     devolver                 o responsável daquela obra        sim
     concluida                quem pediu e o responsável        sim
     reprovada                quem pediu                        sim
     prorrogada               quem pediu a prorrogação          sim
     prorrogacao_solicitada   quem decide prorrogação           não
     prorrogacao_rejeitada    quem pediu a prorrogação          sim
     remanejamento            quem vai receber a ferramenta     sim
   ------------------------------------------------------------ */
const REGRAS = {
    aprovar:                { cargo: dest.ehAprovador, permissao: 'aprovar_todas_os' },
    separar:                { permissao: 'separar_tags' },
    bipar:                  { permissao: 'conferencia' },
    devolver:               { permissao: 'devolutiva' },
    concluida:              {},
    reprovada:              {},
    prorrogada:             {},
    prorrogacao_solicitada: { permissao: 'aceitar_prorrogacao' },
    prorrogacao_rejeitada:  {},
    remanejamento:          {}
};

async function destinatariosDoAviso(pool, tipo, opcoes) {
    const o = opcoes || {};
    let usuarios = [];
    try {
        const r = await pool.query(
            "SELECT id, nome, email, cargo, permissoes FROM almox.usuarios WHERE ativo = TRUE"
        );
        usuarios = r.rows;
    } catch (e) {
        console.warn("AVISO: Falha ao listar destinatários de push:", e.message);
        return [];
    }

    // `usuarioIds` é a lista de DONOS do aviso: com dono, a regra de
    // cargo/permissão vira filtro — nunca acréscimo.
    const donos = Array.isArray(o.usuarioIds) ? o.usuarioIds.filter(v => v != null) : [];

    return dest.escolher(usuarios, {
        regra: REGRAS[tipo] || (o.permissao ? { permissao: o.permissao } : {}),
        donos,
        excluirId: o.excluir
    }).map(u => u.id);
}

/* ------------------------------------------------------------
   API DO MÓDULO
   notificar(pool, tipo, { os, remetente, usuarioIds, permissao, excluir })

   Quem chama precisa dar `await`: na Vercel a função é congelada assim
   que a resposta sai, e o que ficou pendente não roda. Nunca lança.
   ------------------------------------------------------------ */
export async function notificar(pool, tipo, opcoes) {
    try {
        const modelo = MODELOS[tipo];
        if (!modelo) return { enviadas: 0, motivo: 'tipo desconhecido' };

        const o = opcoes || {};
        const ids = await destinatariosDoAviso(pool, tipo, o);
        if (!ids.length) return { enviadas: 0, motivo: 'sem destinatários' };

        const r = await notificarNoCelular(ids, {
            titulo: modelo.titulo,
            corpo: `${o.corpo || modelo.corpo} ${o.detalhe || linhaOS(o.os, o.remetente)}`,
            tag: `lwn-${tipo}-${(o.os && o.os.id) || Date.now()}`,
            url: `/core/app/control/${modelo.aba}`
        });
        return { enviadas: r.enviados, destinatarios: ids };
    } catch (e) {
        console.warn("AVISO: Falha ao notificar (" + tipo + "):", e.message);
        return { enviadas: 0, motivo: e.message };
    }
}
