/* ============================================================
   NOTIFICAÇÃO POR E-MAIL — MICROSOFT 365 / OUTLOOK
   ------------------------------------------------------------
   O envio é feito pelo Microsoft Graph, com o próprio aplicativo
   autenticando-se (fluxo "client credentials"): o servidor pede um token
   ao Azure AD com o CLIENT_ID/CLIENT_SECRET/TENANT e manda o e-mail pela
   caixa configurada em OUTLOOK_REMETENTE.

   Por que Graph e não SMTP: a conta Microsoft 365 da empresa já existe, o
   Graph não exige senha de aplicativo (que a Microsoft vem desativando), e o
   mesmo registro de aplicativo serve para a entrada com a conta Outlook.

   O QUE PRECISA ESTAR CONFIGURADO NO AZURE (uma vez):
     - Permissão de APLICATIVO  Mail.Send   (com consentimento do administrador)
     - Permissão DELEGADA       User.Read   (para a entrada com conta Outlook)
     - URI de redirecionamento  https://SEU-DOMINIO/api/outlook/retorno

   E no .env / nas variáveis de ambiente da Vercel:
     OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_TENANT, OUTLOOK_REMETENTE

   Sem essas variáveis o módulo fica INERTE: nada quebra, nada é enviado, e o
   diagnóstico em GET /api/email/estado diz exatamente o que está faltando.
   Isso é de propósito — uma notificação que falha nunca pode derrubar a ação
   que a originou (aprovar, separar, devolver).
   ============================================================ */

/* NO MAIN: o envio e o do sistema (server/graph.js), com as mesmas
   variaveis de sempre (GRAPH_TENANT_ID, GRAPH_CLIENT_ID,
   GRAPH_CLIENT_SECRET e MAIL_USUARIO, a caixa de onde sai). As
   OUTLOOK_REMETENTE etc. do lwncontrol nao sao mais usadas. */
import * as graph from '../graph.js'
import * as dest from './destinatarios.js'

/* o endereco do site (sem o /core do APP_URL): o botao do e-mail abre o
   Almoxarife, que mora em /almoxarife */
const ORIGEM = (() => {
    try { return new URL(process.env.APP_URL).origin; } catch { return 'https://www.lwnengenharia.com.br'; }
})();

function configurado() {
    return graph.configurado();
}

function faltando() {
    return configurado() ? [] : ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'];
}

/* ------------------------------------------------------------
   ENVIO
   Nunca lança: devolve { enviados, erro } para quem quiser registrar.
   ------------------------------------------------------------ */
async function enviarEmail({ para, assunto, html, texto }) {
    const destinos = Array.from(new Set(
        (Array.isArray(para) ? para : [para])
            .map(e => String(e || '').trim().toLowerCase())
            .filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    ));
    if (!destinos.length) return { enviados: 0, motivo: 'nenhum e-mail válido' };
    if (!configurado()) return { enviados: 0, motivo: 'e-mail não configurado' };

    try {
        // COM UM DESTINATÁRIO, ele vai no "Para" e mais ninguém recebe. COM
        // VÁRIOS, vão em cópia oculta: um aviso de OS não é uma conversa, e
        // ninguém precisa ver a lista dos outros.
        const r = destinos.length === 1
            ? await graph.enviar({ para: destinos[0], assunto, html, texto })
            : await graph.enviar({ para: graph.caixaDeSaida(), cco: destinos, assunto, html, texto });
        if (!r.ok) {
            console.warn('AVISO: e-mail não enviado:', r.motivo);
            return { enviados: 0, motivo: r.motivo, destinatarios: destinos };
        }
        return { enviados: destinos.length, destinatarios: destinos };
    } catch (err) {
        console.warn('AVISO: falha ao enviar e-mail:', err.message);
        return { enviados: 0, motivo: err.message, destinatarios: destinos };
    }
}

/* ============================================================
   QUEM RECEBE E-MAIL — REGRA FIXA, NÃO CONFIGURÁVEL
   ------------------------------------------------------------
   Isto era uma permissão marcável na tela de Cargos. Deixou de ser: a lista
   de quem recebe e-mail agora mora aqui, no código, e é curta de propósito.

   Por que saiu da tela: a caixa marcável convidava a ligar avisos "por
   garantia", e todo aviso a mais é um aviso que alguém aprende a ignorar.
   Quando o e-mail vira ruído, o que importava passa batido junto.

   A REGRA:

     Supervisor / Gerente   -> aprovação de OS (só quando a OS é dirigida a
                               ele) e aprovação de remanejamento.
     Auxiliar Técnico       -> só remanejamento APROVADO, e só quando a
                               ferramenta vem para ele.
     marcelo@lwnengenharia  -> tudo.

   Todo o resto — os cargos de hoje e os que forem criados amanhã — não
   recebe e-mail nenhum deste site.

   O REMANEJAMENTO SÃO DOIS AVISOS, não um:

     1. pedido feito     -> "remanejamento"           -> supervisor/gerente
     2. pedido aprovado  -> "remanejamento_aprovado"  -> quem vai receber

   Um só não daria conta: quem aprova e quem recebe a ferramenta são pessoas
   diferentes, e o segundo aviso só existe depois de o primeiro ser
   respondido.
   ============================================================ */

// O vocabulário (quem é aprovador, quem recebe ferramenta, quem recebe tudo)
// mora em api/destinatarios.js, compartilhado com a notificação de celular.
// Era copiado aqui, e manter duas cópias da mesma regra é o caminho curto
// para elas discordarem — foi o que aconteceu com o push.
const { textoSimples, ehAprovador, recebeFerramenta, recebeTudo } = dest;

// `quemRecebe` responde uma coisa só: este usuário recebe ESTE tipo de aviso?
const NOTIFICACOES = {
    os_solicitada: {
        assunto: 'Nova OS aguardando sua aprovação',
        quemRecebe: u => ehAprovador(u.cargo)
    },
    remanejamento: {
        assunto: 'Remanejamento aguardando aprovação',
        quemRecebe: u => ehAprovador(u.cargo)
    },
    remanejamento_aprovado: {
        assunto: 'Ferramenta a caminho — confirme o recebimento',
        quemRecebe: u => recebeFerramenta(u.cargo)
    },
    retirada: {
        assunto: 'Ferramentas liberadas para retirada',
        quemRecebe: () => false
    },
    devolutiva: {
        assunto: 'Último dia da obra — devolutiva ou prorrogação',
        quemRecebe: () => false
    },
    avaria: {
        assunto: 'Ferramenta devolvida com avaria',
        quemRecebe: () => false
    },
    status_obra: {
        assunto: 'Mudança de status da obra',
        quemRecebe: () => false
    },
    certificado: {
        assunto: 'Mudança de status de certificado',
        quemRecebe: () => false
    }
};

/* Quem recebe o e-mail deste tipo. Devolve [{id, nome, email, cargo}]. */
async function destinatarios(pool, tipo, opcoes) {
    const conf = NOTIFICACOES[tipo];
    if (!conf) return [];
    const o = opcoes || {};

    let usuarios = [];
    try {
        const r = await pool.query(
            "SELECT id, nome, email, cargo FROM almox.usuarios WHERE ativo = TRUE AND email IS NOT NULL AND email <> ''"
        );
        usuarios = r.rows;
    } catch (e) {
        console.warn('AVISO: falha ao listar destinatários de e-mail:', e.message);
        return [];
    }

    // O CARGO decide, não a permissão. A permissão marcável saiu da tela de
    // Cargos e a regra virou código (ver o cabeçalho deste arquivo).
    //
    // Quem recebe tudo é tratado à parte, e por um motivo: os filtros abaixo
    // estreitam o aviso para uma pessoa específica (o responsável indicado na
    // OS, o destinatário do remanejamento). Se ele passasse por esses filtros
    // junto com os outros, cairia fora em todo aviso dirigido a terceiros — e
    // "recebe tudo" deixaria de ser verdade.
    const recebemTudo = usuarios.filter(u => recebeTudo(u.email));
    let lista = usuarios.filter(u => !recebeTudo(u.email) && conf.quemRecebe(u));

    // Alguns avisos têm dono certo — a solicitação de OS vai só para o
    // responsável escolhido, não para todo supervisor da empresa. Quando
    // `somenteIds` vem preenchido, o cargo passa a ser um FILTRO, nunca um
    // acréscimo: é preciso ser a pessoa escolhida E ter o cargo que recebe.
    if (Array.isArray(o.somenteIds) && o.somenteIds.length) {
        const ids = new Set(o.somenteIds.map(String));
        lista = lista.filter(u => ids.has(String(u.id)));
    }
    if (Array.isArray(o.somenteNomes) && o.somenteNomes.length) {
        const nomes = new Set(o.somenteNomes.map(n => String(n || '').trim().toLowerCase()));
        lista = lista.filter(u => nomes.has(String(u.nome || '').trim().toLowerCase()));
    }

    // Só agora entram os que recebem tudo, livres dos filtros acima.
    recebemTudo.forEach(u => {
        if (!lista.some(x => String(x.id) === String(u.id))) lista.push(u);
    });

    // Quem fez a ação não precisa ser avisado dela — MAS só quando o aviso é
    // para um grupo.
    //
    // Tendo destinatário escolhido a dedo (o responsável indicado na OS, por
    // exemplo), ele recebe mesmo sendo quem agiu: solicitar uma OS e indicar
    // A SI MESMO como responsável é comum, e nesse caso o aviso é a tarefa
    // "aprove isto", não um "você fez isto". Antes o e-mail simplesmente não
    // saía para ninguém nesse caso.
    const temAlvoEscolhido = (Array.isArray(o.somenteIds) && o.somenteIds.length)
                          || (Array.isArray(o.somenteNomes) && o.somenteNomes.length);
    if (o.excluirId != null && !temAlvoEscolhido) {
        lista = lista.filter(u => String(u.id) !== String(o.excluirId));
    }

    return lista;
}

/* ============================================================
   O E-MAIL
   ------------------------------------------------------------
   Um layout só para todos os avisos: cabeçalho colorido pelo tipo, uma frase
   dizendo o que aconteceu, uma tabela com TODOS os detalhes da ação e, quando
   faz sentido, um botão que abre o sistema já na aba certa.

   HTML de e-mail é limitado de propósito: tabela, estilo em linha e nada de
   CSS externo — é o que o Outlook renderiza igual no aplicativo, no navegador
   e no celular.
   ============================================================ */
function esc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function linkDoApp(aba) {
    const base = ORIGEM + '/core/app/control';
    return aba ? `${base}/${encodeURIComponent(aba)}` : base;
}

const CORES = {
    os_solicitada: '#374995',
    remanejamento: '#7c3aed',
    remanejamento_aprovado: '#7c3aed',
    retirada:      '#0891b2',
    devolutiva:    '#f59e0b',
    avaria:        '#dc2626',
    status_obra:   '#374995',
    certificado:   '#16a34a'
};

function montarHtml({ tipo, titulo, chamada, campos, aba, rotuloBotao, aviso }) {
    const cor = CORES[tipo] || '#374995';
    const url = linkDoApp(aba);

    const linhas = (campos || [])
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
        .map(([rotulo, valor]) => `
            <tr>
                <td style="padding:9px 14px;border-bottom:1px solid #e6e9f0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${esc(rotulo)}</td>
                <td style="padding:9px 14px;border-bottom:1px solid #e6e9f0;font-size:13px;color:#111827;font-weight:600;">${valor}</td>
            </tr>`).join('');

    return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07);">

        <tr><td style="background:${cor};padding:20px 24px;">
          <div style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">LWN Control</div>
          <div style="color:#ffffff;font-size:20px;font-weight:800;margin-top:4px;">${esc(titulo)}</div>
        </td></tr>

        <tr><td style="padding:22px 24px 6px;">
          <p style="margin:0 0 16px;font-size:14.5px;line-height:1.55;color:#374151;">${chamada}</p>
        </td></tr>

        ${linhas ? `<tr><td style="padding:0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e9f0;border-radius:8px;border-collapse:separate;overflow:hidden;">
            ${linhas}
          </table>
        </td></tr>` : ''}

        ${aviso ? `<tr><td style="padding:16px 24px 0;">
          <div style="border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.5;color:#92400e;">${aviso}</div>
        </td></tr>` : ''}

        ${url ? `<tr><td style="padding:22px 24px;" align="center">
          <a href="${esc(url)}" style="display:inline-block;background:${cor};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;">
            ${esc(rotuloBotao || 'Abrir no LWN Control')}
          </a>
        </td></tr>` : `<tr><td style="height:22px;"></td></tr>`}

        <tr><td style="padding:14px 24px 22px;border-top:1px solid #eef0f4;">
          <p style="margin:0;font-size:11.5px;line-height:1.5;color:#9ca3af;">
            Aviso automático do LWN Control — não responda a este e-mail.<br>
            Para deixar de receber, peça ao administrador para ajustar as permissões de notificação do seu cargo.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* Blocos reutilizados nos corpos dos e-mails. */
function tags(lista) {
    const arr = (lista || []).map(i => (typeof i === 'string' ? i : (i?.tag || ''))).filter(Boolean);
    if (!arr.length) return '';
    return arr.map(t =>
        `<span style="display:inline-block;background:#f3f4f6;border:1px solid #e6e9f0;border-radius:4px;padding:2px 7px;margin:2px 3px 2px 0;font-family:Consolas,monospace;font-size:12px;">${esc(t)}</span>`
    ).join('');
}

function numeroOS(os) {
    if (!os) return '—';
    return '#OS-' + String(os.numero_os || os.id || 0).padStart(4, '0');
}

function data(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v).slice(0, 10);
    return d.toLocaleDateString('pt-BR');
}

function dataHora(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleString('pt-BR');
}

/* ============================================================
   A PORTA DE ENTRADA
   notificar(pool, tipo, dados) — resolve destinatários, monta o e-mail e
   envia. Nunca lança.
   ============================================================ */
async function notificar(pool, tipo, dados) {
    try {
        if (!configurado()) return { enviados: 0, motivo: 'Outlook não configurado' };

        const conf = NOTIFICACOES[tipo];
        if (!conf) return { enviados: 0, motivo: 'tipo de notificação desconhecido: ' + tipo };

        const alvos = await destinatarios(pool, tipo, dados || {});
        if (!alvos.length) return { enviados: 0, motivo: 'sem destinatários' };

        const conteudo = MONTADORES[tipo](dados || {});
        const r = await enviarEmail({
            para: alvos.map(u => u.email),
            assunto: conteudo.assunto || conf.assunto,
            html: montarHtml(Object.assign({ tipo }, conteudo))
        });
        console.log(`email[${tipo}]`, JSON.stringify(r));
        return r;
    } catch (err) {
        console.warn(`AVISO: falha na notificação por e-mail (${tipo}):`, err.message);
        return { enviados: 0, motivo: err.message };
    }
}

/* ------------------------------------------------------------
   OS CORPOS
   Cada um recebe o que aconteceu e devolve o que o e-mail mostra. A regra é
   a mesma em todos: TUDO que dá para dizer sobre a ação vai na tabela — quem
   fez, quando, sobre o quê, com quais ferramentas e por quê.
   ------------------------------------------------------------ */
const MONTADORES = {

    os_solicitada: (d) => {
        const os = d.os || {};
        const itens = (d.itens || []).map(i => `${i.quantidade}× ${i.ativo}`).join(', ');
        return {
            assunto: `Aprovação pendente — OS ${numeroOS(os)} · ${os.cliente || ''}`.trim(),
            titulo: 'Nova OS aguardando sua aprovação',
            chamada: `<strong>${esc(d.solicitante || 'Um colaborador')}</strong> enviou uma solicitação de OS e indicou <strong>você</strong> como responsável pela obra. Ela só entra na fila de separação depois da sua aprovação.`,
            campos: [
                ['Número da OS', esc(numeroOS(os))],
                ['Cliente', esc(os.cliente || '—')],
                ['Responsável pela obra', esc(os.responsavel || '—')],
                ['Solicitado por', esc(d.solicitante || '—')],
                ['Início da obra', esc(data(os.data_inicio))],
                ['Término previsto', esc(data(os.data_fim))],
                ['Ferramentas solicitadas', esc(itens || '—')],
                ['Total de itens', esc(String(d.totalItens ?? '—'))],
                ['Observações', esc(os.observacoes || '—')],
                ['Enviada em', esc(dataHora(os.created_at || new Date()))]
            ],
            aba: 'aprovar',
            rotuloBotao: 'Ver e aprovar a OS'
        };
    },

    remanejamento: (d) => ({
        assunto: `Remanejamento aguardando aprovação — ${d.origem || ''} → ${d.destino || ''}`.trim(),
        titulo: 'Remanejamento aguardando aprovação',
        chamada: `<strong>${esc(d.solicitante || 'Um colaborador')}</strong> quer passar ${(d.instrumentos || []).length} ferramenta(s) de uma obra para outra. <strong>Enquanto você não decidir, nada sai do lugar</strong> — as ferramentas continuam na obra de origem e a OS de lá continua cobrando a devolução delas.`,
        campos: [
            ['Obra de origem', esc(d.origem || '—')],
            ['Obra de destino', esc(d.destino || '—')],
            ['Quem está passando', esc(d.solicitante || '—')],
            ['Quem vai receber', esc(d.destinatario || '—')],
            ['Ferramentas', tags(d.instrumentos)],
            ['Quantidade', esc(String((d.instrumentos || []).length))],
            ['Observação de quem está passando', esc(d.observacao || '—')],
            ['Pedido em', esc(dataHora(d.criado_em || new Date()))]
        ],
        aba: 'aprovar',
        rotuloBotao: 'Aprovar ou rejeitar',
        aviso: 'Ao aprovar, as ferramentas saem da obra de origem <strong>imediatamente</strong> e passam a esperar a confirmação de quem vai receber.'
    }),

    // O segundo tempo do remanejamento: o pedido foi aprovado e a ferramenta
    // agora espera quem vai recebê-la. Este aviso vai só para essa pessoa.
    //
    // O texto insiste na responsabilidade porque é isso que muda de mãos
    // aqui: a partir da confirmação, a ferramenta responde por quem recebeu,
    // e ninguém conferiu o estado dela no caminho.
    remanejamento_aprovado: (d) => ({
        assunto: `Ferramenta a caminho — ${d.origem || ''} → ${d.destino || ''}`.trim(),
        titulo: 'Ferramenta liberada para você receber',
        chamada: `O remanejamento foi <strong>aprovado por ${esc(d.aprovador || 'um responsável')}</strong> e as ferramentas `
            + `já saíram da obra de origem. Elas passam a responder por <strong>você</strong> assim que o recebimento for confirmado.`,
        campos: [
            ['Obra de origem', esc(d.origem || '—')],
            ['Obra de destino', esc(d.destino || '—')],
            ['Quem passou', esc(d.solicitante || '—')],
            ['Quem aprovou', esc(d.aprovador || '—')],
            ['Ferramentas', tags(d.instrumentos)],
            ['Quantidade', esc(String((d.instrumentos || []).length))],
            ['Observação de quem passou', esc(d.observacao || '—')],
            ['Aprovado em', esc(dataHora(d.aprovado_em || new Date()))]
        ],
        aba: 'remanejamento',
        rotuloBotao: 'Confirmar recebimento',
        aviso: 'Confira o estado de cada ferramenta ANTES de confirmar. O almoxarife não conferiu os instrumentos neste trajeto — o que estiver avariado precisa ser registrado na hora do recebimento.'
    }),

    retirada: (d) => {
        const os = d.os || {};
        return {
            assunto: `Liberada para retirada — OS ${numeroOS(os)} · ${os.cliente || ''}`.trim(),
            titulo: 'Ferramentas liberadas para retirada',
            chamada: `As TAGs da OS ${esc(numeroOS(os))} foram separadas e já podem ser retiradas. A bipagem de saída é feita na aba <strong>Retirada</strong>.`,
            campos: [
                ['Número da OS', esc(numeroOS(os))],
                ['Cliente', esc(os.cliente || '—')],
                ['Obra', esc(os.obra || os.cliente || '—')],
                ['Responsável pela obra', esc(os.responsavel || '—')],
                ['Separado por', esc(d.separadoPor || '—')],
                ['Ferramentas separadas', tags(d.instrumentos)],
                ['Quantidade', esc(String((d.instrumentos || []).length))],
                ['Baia', esc(d.baia || '—')],
                ['Início da obra', esc(data(os.data_inicio))],
                ['Término previsto', esc(data(os.data_fim))],
                ['Separado em', esc(dataHora(d.separadoEm || new Date()))]
            ],
            aba: 'conferencia',
            rotuloBotao: 'Ir para a Retirada',
            aviso: 'Lembre-se: a <strong>baia é bipada primeiro</strong> — só depois dela as ferramentas são aceitas.'
        };
    },

    devolutiva: (d) => {
        const os = d.os || {};
        const atraso = Number(d.diasAtraso || 0);
        return {
            assunto: atraso > 0
                ? `Obra vencida há ${atraso} dia(s) — OS ${numeroOS(os)}`
                : `Último dia da obra — OS ${numeroOS(os)} · ${os.cliente || ''}`.trim(),
            titulo: atraso > 0 ? 'Obra vencida — devolutiva pendente' : 'Último dia da obra',
            chamada: atraso > 0
                ? `A OS ${esc(numeroOS(os))} venceu há <strong>${atraso} dia(s)</strong> e as ferramentas continuam em campo. Faça a <strong>devolutiva</strong> ou solicite uma <strong>prorrogação de prazo</strong>.`
                : `Hoje é o <strong>último dia</strong> da OS ${esc(numeroOS(os))}. Faça a <strong>devolutiva</strong> das ferramentas ou solicite uma <strong>prorrogação de prazo</strong>.`,
            campos: [
                ['Número da OS', esc(numeroOS(os))],
                ['Cliente', esc(os.cliente || '—')],
                ['Obra', esc(os.obra || os.cliente || '—')],
                ['Responsável pela obra', esc(os.responsavel || '—')],
                ['Término previsto', esc(data(os.data_fim))],
                [atraso > 0 ? 'Dias em atraso' : 'Situação', atraso > 0 ? esc(String(atraso)) : 'Vence hoje'],
                ['Ferramentas em campo', tags(d.instrumentos)],
                ['Quantidade em campo', esc(String((d.instrumentos || []).length))]
            ],
            aba: 'devolutiva',
            rotuloBotao: 'Fazer a devolutiva'
        };
    },

    avaria: (d) => {
        const os = d.os || {};
        return {
            assunto: `Ferramenta com avaria — ${d.tag || ''} · OS ${numeroOS(os)}`.trim(),
            titulo: 'Ferramenta devolvida com avaria',
            chamada: `A ferramenta <strong>${esc(d.tag || '—')}</strong> voltou da obra com avaria registrada na devolutiva.`,
            campos: [
                ['TAG', esc(d.tag || '—')],
                ['Ativo', esc(d.tipo || '—')],
                ['Estado', esc(d.estado === 'avariado_utilizavel'
                    ? 'Avariada, mas ainda utilizável'
                    : 'Avariada — vai para a Manutenção')],
                ['Descrição da avaria', esc(d.observacao || '—')],
                ['Número da OS', esc(numeroOS(os))],
                ['Cliente', esc(os.cliente || '—')],
                ['Obra', esc(os.obra || os.cliente || '—')],
                ['Responsável pela obra', esc(os.responsavel || '—')],
                ['Devolvida por', esc(d.devolvidoPor || '—')],
                ['Registrada em', esc(dataHora(d.data || new Date()))]
            ],
            aba: 'manutencao',
            rotuloBotao: 'Abrir a Manutenção',
            aviso: d.estado === 'avariado_utilizavel'
                ? 'A ferramenta continua disponível, com a avaria anotada no histórico dela.'
                : 'A ferramenta foi retirada de circulação e entrou na fila de manutenção.'
        };
    },

    status_obra: (d) => {
        const os = d.os || {};
        return {
            assunto: `OS ${numeroOS(os)} — ${d.statusNovoRotulo || d.statusNovo || 'status alterado'}`,
            titulo: 'Mudança de status da obra',
            chamada: `A OS ${esc(numeroOS(os))} de <strong>${esc(os.cliente || '—')}</strong> passou de <strong>${esc(d.statusAnteriorRotulo || d.statusAnterior || '—')}</strong> para <strong>${esc(d.statusNovoRotulo || d.statusNovo || '—')}</strong>.`,
            campos: [
                ['Número da OS', esc(numeroOS(os))],
                ['Cliente', esc(os.cliente || '—')],
                ['Obra', esc(os.obra || os.cliente || '—')],
                ['Responsável pela obra', esc(os.responsavel || '—')],
                ['Status anterior', esc(d.statusAnteriorRotulo || d.statusAnterior || '—')],
                ['Status atual', esc(d.statusNovoRotulo || d.statusNovo || '—')],
                ['Alterado por', esc(d.usuario || '—')],
                ['Motivo', esc(d.motivo || '—')],
                ['Início da obra', esc(data(os.data_inicio))],
                ['Término previsto', esc(data(os.data_fim))],
                ['Alterado em', esc(dataHora(d.data || new Date()))]
            ],
            aba: 'minhas-obras',
            rotuloBotao: 'Ver a OS'
        };
    },

    certificado: (d) => ({
        assunto: `Certificado ${d.tag || ''} — ${d.statusNovo || 'status alterado'}`.trim(),
        titulo: 'Mudança de status de certificado',
        chamada: `O certificado da ferramenta <strong>${esc(d.tag || '—')}</strong> mudou de status.`,
        campos: [
            ['TAG', esc(d.tag || '—')],
            ['Ativo', esc(d.tipo || '—')],
            ['Número do certificado', esc(d.numero || '—')],
            ['Status anterior', esc(d.statusAnterior || '—')],
            ['Status atual', esc(d.statusNovo || '—')],
            ['Laboratório', esc(d.laboratorio || '—')],
            ['Data de calibração', esc(data(d.dataCalibracao))],
            ['Vencimento', esc(data(d.dataVencimento))],
            ['Alterado por', esc(d.usuario || '—')],
            ['Alterado em', esc(dataHora(d.data || new Date()))]
        ],
        aba: 'certificados',
        rotuloBotao: 'Abrir os Certificados'
    })
};

export { configurado, faltando, enviarEmail, notificar, destinatarios, NOTIFICACOES };
