// ============================================================
// A OBRA DA O.S. (Atmosfera LWN)
//
// Os clientes do Almoxarife sao os do main, e cada um tem as obras dele
// no quadro de Obras. Na Solicitação de OS, depois do cliente, vem a obra:
//
//   - o cliente sem obra aberta: o campo nem aparece, e a OS sai so com o
//     cliente (como era no lwncontrol);
//   - com UMA obra: ela ja vem escolhida;
//   - com MAIS de uma: escolher é obrigatório.
//
// A OS fica ligada à obra, e é ela que marca o check "Solicitar OS" (2a
// etapa do roteiro) quando a OS for APROVADA. O servidor confere a mesma
// regra (lerClienteEObra, em core/server/almoxarife).
//
// Escolhida a obra, o "Responsável pela Obra" vem do Atmosfera LWN: o
// membro da obra que o setor deixa ser responsável, quando é um só.
//
// O check "Solicitar OS" da obra abre esta tela já preenchida, e TRAVADA:
// /core/app/control/solicitar?obra=ID. O cliente, a obra e as datas (o
// "Prazo da execução" da 1a etapa da obra) vêm do Atmosfera LWN e não se
// trocam — só o responsável. Enviada a OS, a tela destrava.
//
// Os checks "Retirada" e "Devolução das ferramentas" (3a etapa) abrem a
// aba deles com a OS da obra em destaque: /core/app/control/retirada?os=ID
// e /core/app/control/devolutiva?os=ID. O "Gestão dos instrumentos" (3a
// etapa, card do Almoxarife) abre a separação das TAGs da OS:
// /core/app/control/retirada?os=ID&acao=separar.
// ============================================================

// lidos AQUI, e nao no load: endereco.js limpa o ?obra= e o ?os= do endereco
const ALMOX_OBRA_PEDIDA = (() => {
    const id = new URLSearchParams(location.search).get('obra');
    return /^\d{1,18}$/.test(id || '') ? id : null;
})();
const ALMOX_OS_PEDIDA = (() => {
    const id = new URLSearchParams(location.search).get('os');
    return /^\d{1,18}$/.test(id || '') ? id : null;
})();
// ?acao=separar: o check "Gestão dos instrumentos" da obra (3a etapa, card
// do Almoxarife) abre a separação das TAGs da OS, e nao so o destaque
const ALMOX_OS_ACAO = new URLSearchParams(location.search).get('acao') === 'separar' ? 'separar' : null;

// a OS pedida pelo check da obra: { obra, comDatas } enquanto a tela esta travada
let almoxTravaDaObra = null;

let almoxObrasDoCliente = [];
let almoxObrasPedido = 0;

function almoxClienteIdEscolhido() {
    const select = document.getElementById('os-client');
    const opcao = select && select.selectedOptions ? select.selectedOptions[0] : null;
    const id = opcao && opcao.dataset ? opcao.dataset.clienteId : null;
    return id ? Number(id) : null;
}

function almoxLimparListaDeObras() {
    almoxObrasDoCliente = [];
    const grupo = document.getElementById('os-obra-grupo');
    const select = document.getElementById('os-obra-id');
    if (select) select.innerHTML = '';
    if (grupo) grupo.style.display = 'none';
}

// depois de enviar a OS: a tela volta a ser a de qualquer OS
function almoxLimparObra() {
    almoxLimparListaDeObras();
    almoxDestravarObra();
}
window.almoxLimparObra = almoxLimparObra;

// `escolher`: a obra que ja estava na OS (a edicao antes de aprovar)
async function almoxCarregarObrasDoCliente(escolher) {
    const grupo = document.getElementById('os-obra-grupo');
    const select = document.getElementById('os-obra-id');
    const ajuda = document.getElementById('os-obra-ajuda');
    if (!grupo || !select) return;

    const clienteId = almoxClienteIdEscolhido();
    const pedido = ++almoxObrasPedido;
    almoxLimparListaDeObras();
    if (!clienteId) return;

    let obras = [];
    try {
        const r = await fetch(`${API_URL}/clientes/${clienteId}/obras`, { cache: 'no-cache' });
        obras = r.ok ? await r.json() : [];
    } catch (e) {
        obras = [];
    }
    // trocou de cliente enquanto a lista vinha: vale a do cliente atual
    if (pedido !== almoxObrasPedido) return;

    almoxObrasDoCliente = Array.isArray(obras) ? obras : [];
    if (!almoxObrasDoCliente.length) return;

    const esc = (t) => String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const varias = almoxObrasDoCliente.length > 1;
    select.innerHTML = (varias ? '<option value="">Selecione a obra</option>' : '')
        + almoxObrasDoCliente.map(o => `<option value="${o.id}">${esc(o.rotulo)}</option>`).join('');
    if (escolher && almoxObrasDoCliente.some(o => String(o.id) === String(escolher))) select.value = String(escolher);
    if (ajuda) {
        ajuda.textContent = varias
            ? 'Este cliente tem mais de uma obra: escolha a obra desta OS.'
            : 'A OS fica ligada a esta obra. Aprovada, ela marca o check "Solicitar OS" da obra.';
    }
    grupo.style.display = '';
    almoxResponsavelDaObra();
}

// O responsável da obra escolhida: o membro dela que pode ser responsável
// (vem pronto de GET /clientes/:id/obras). Só preenche quando é UM, e só
// se ninguém foi escolhido ainda — a escolha da pessoa não é trocada.
function almoxResponsavelDaObra() {
    const select = document.getElementById('os-obra-id');
    const responsavel = document.getElementById('os-supervisor');
    if (!select || !responsavel || responsavel.value) return;
    const obra = almoxObrasDoCliente.find(o => String(o.id) === String(select.value));
    const ids = obra && Array.isArray(obra.responsaveis) ? obra.responsaveis : [];
    if (ids.length !== 1) return;
    const opcao = [...responsavel.options].find(o => String(o.dataset.userId) === String(ids[0]));
    if (opcao) responsavel.value = opcao.value;
}
window.almoxResponsavelDaObra = almoxResponsavelDaObra;
window.almoxCarregarObrasDoCliente = almoxCarregarObrasDoCliente;

// { cliente_id, obra_id } para o corpo da OS — ou { erro } quando falta a obra
function almoxObraDaOS() {
    const clienteId = almoxClienteIdEscolhido();
    const select = document.getElementById('os-obra-id');
    const obraId = select && select.value ? Number(select.value) : null;
    if (almoxObrasDoCliente.length > 1 && !obraId) {
        return { erro: 'Este cliente tem mais de uma obra. Escolha a obra da OS.' };
    }
    const obra = almoxObrasDoCliente.find(o => Number(o.id) === obraId) || null;
    return { cliente_id: clienteId, obra_id: obraId, obra_rotulo: obra ? obra.rotulo : null };
}
window.almoxObraDaOS = almoxObraDaOS;

document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('os-client');
    if (select) select.addEventListener('change', () => almoxCarregarObrasDoCliente());
    const obra = document.getElementById('os-obra-id');
    if (obra) obra.addEventListener('change', almoxResponsavelDaObra);
});

// ---------------- a tela travada pela obra ----------------

const ALMOX_CAMPOS_TRAVADOS = ['os-client', 'os-obra-id', 'os-start-date', 'os-end-date'];
const ALMOX_CADEADO = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.4 10.5V7.8a3.6 3.6 0 0 1 7.2 0v2.7"/></svg>';

function almoxEscapar(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function almoxDataBR(iso) {
    const [a, m, d] = String(iso || '').slice(0, 10).split('-');
    return a && m && d ? `${d}/${m}/${a}` : '—';
}

// o cliente, a obra e (com o prazo definido) as datas: preenchidos e sem troca
function almoxTravarDaObra(obra) {
    const comDatas = Boolean(obra.execucao_inicio && obra.execucao_prazo);
    almoxTravaDaObra = { obra, comDatas };

    if (comDatas) {
        const inicio = document.getElementById('os-start-date');
        const fim = document.getElementById('os-end-date');
        if (inicio) inicio.value = obra.execucao_inicio;
        if (fim) fim.value = obra.execucao_prazo;
        // a disponibilidade do periodo roda como se a pessoa tivesse escolhido
        if (fim) fim.dispatchEvent(new Event('change', { bubbles: true }));
    }

    ALMOX_CAMPOS_TRAVADOS.forEach((id) => {
        if (!comDatas && (id === 'os-start-date' || id === 'os-end-date')) return;
        const campo = document.getElementById(id);
        if (!campo) return;
        campo.disabled = true;
        campo.dataset.travadoPelaObra = '1';
        const grupo = campo.closest('.form-group');
        if (grupo) grupo.classList.add('almox-travado');
        const rotulo = grupo ? grupo.querySelector('.form-label') : null;
        if (rotulo && !rotulo.querySelector('.almox-cadeado')) {
            rotulo.insertAdjacentHTML('beforeend', `<span class="almox-cadeado" title="Vem da obra no Atmosfera LWN">${ALMOX_CADEADO}</span>`);
        }
    });
    // a obra ja esta escolhida: o "escolha a obra" de quando o cliente tem varias nao vale
    const ajuda = document.getElementById('os-obra-ajuda');
    if (ajuda) ajuda.textContent = 'A OS fica ligada a esta obra. Aprovada, ela marca o check "Solicitar OS" da obra.';

    // a faixa no alto da Solicitacao diz de onde veio tudo isso
    let faixa = document.getElementById('solicitacao-da-obra');
    if (!faixa) {
        const antes = document.getElementById('solicitacao-modo-edicao');
        if (!antes) return;
        faixa = document.createElement('div');
        faixa.id = 'solicitacao-da-obra';
        faixa.className = 'almox-da-obra';
        antes.insertAdjacentElement('afterend', faixa);
    }
    faixa.innerHTML = `
        <span class="almox-da-obra__icone" aria-hidden="true">${ALMOX_CADEADO}</span>
        <div class="almox-da-obra__texto">
            <strong>OS da obra ${almoxEscapar(obra.rotulo)}</strong>
            <span>${comDatas
                ? `Cliente, obra e datas vêm do Atmosfera LWN — período do prazo da execução: <b>${almoxDataBR(obra.execucao_inicio)}</b> a <b>${almoxDataBR(obra.execucao_prazo)}</b>.`
                : 'Cliente e obra vêm do Atmosfera LWN. A obra ainda não tem o prazo da execução (1ª etapa): escolha as datas.'}
                Só o responsável pode ser trocado.</span>
        </div>`;
    faixa.style.display = '';
}

function almoxDestravarObra() {
    almoxTravaDaObra = null;
    document.querySelectorAll('[data-travado-pela-obra]').forEach((campo) => {
        campo.disabled = false;
        delete campo.dataset.travadoPelaObra;
    });
    document.querySelectorAll('.almox-travado').forEach((g) => g.classList.remove('almox-travado'));
    document.querySelectorAll('.almox-cadeado').forEach((c) => c.remove());
    const faixa = document.getElementById('solicitacao-da-obra');
    if (faixa) faixa.remove();
}
window.almoxDestravarObra = almoxDestravarObra;

// Vindo do check "Solicitar OS" da obra: escolhe o cliente e a obra, poe as
// datas do prazo da execucao e trava tudo menos o responsavel. A lista de
// clientes chega depois da tela (initApp), entao espera por ela — no
// maximo 15 segundos.
async function almoxAbrirComObraPedida() {
    if (!ALMOX_OBRA_PEDIDA) return;
    let obra = null;
    try {
        const r = await fetch(`${API_URL}/obras/${ALMOX_OBRA_PEDIDA}`, { cache: 'no-cache' });
        obra = r.ok ? await r.json() : null;
    } catch (e) {
        obra = null;
    }
    if (!obra || !obra.cliente_id) return;
    if (obra.concluida && typeof showToast === 'function') {
        showToast('Esta obra já foi concluída no Atmosfera LWN.', 'warning');
        return;
    }
    const limite = Date.now() + 15000;
    const tentar = async () => {
        const select = document.getElementById('os-client');
        if (!select) return;
        if (select.options.length <= 1 && typeof clients !== 'undefined' && Array.isArray(clients) && clients.length
            && typeof initSolicitarForm === 'function') {
            initSolicitarForm();
        }
        const opcao = [...select.options].find(o => String(o.dataset.clienteId) === String(obra.cliente_id));
        if (!opcao) {
            if (Date.now() < limite) setTimeout(tentar, 250);
            return;
        }
        select.value = opcao.value;
        await almoxCarregarObrasDoCliente(obra.id);
        almoxTravarDaObra(obra);
    };
    tentar();
}

// Vindo dos checks "Retirada" e "Devolução das ferramentas" da obra: a OS
// dela em destaque na lista da aba (a lista chega depois da tela).
function almoxDestacarOSPedida() {
    if (!ALMOX_OS_PEDIDA) return;
    const limite = Date.now() + 15000;
    const tentar = () => {
        const card = [...document.querySelectorAll(`[data-os-id="${ALMOX_OS_PEDIDA}"]`)]
            .find((el) => el.offsetParent !== null);
        if (!card) {
            if (Date.now() < limite) setTimeout(tentar, 300);
            else if (typeof showToast === 'function') showToast('A OS desta obra não está nesta lista agora.', 'warning');
            return;
        }
        card.classList.add('is-pedida');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => card.classList.remove('is-pedida'), 7000);
        if (ALMOX_OS_ACAO === 'separar') almoxAbrirSeparacaoPedida();
    };
    tentar();
}

// O "Separar TAGS" da OS, como o botao do cartao — para quem separa, e so
// enquanto ela espera a separacao. Concluir marca o check da obra
// (PUT /solicitacoes/:id/separar).
function almoxAbrirSeparacaoPedida() {
    const os = (typeof workOrders !== 'undefined' ? workOrders : []).find(o => String(o.id) === String(ALMOX_OS_PEDIDA));
    const status = String(os && os.status || '').toLowerCase().trim();
    const pode = typeof usuarioTemPermissao === 'function' ? usuarioTemPermissao('separar_tags') : false;
    if (!os || typeof abrirModalConferenciaOS !== 'function') return;
    if (status !== 'aguardando_conferencia') {
        if (typeof showToast === 'function') showToast('As TAGs desta OS já foram separadas.', 'info');
        return;
    }
    if (!pode) {
        if (typeof showToast === 'function') showToast('Seu setor não separa TAGs: a OS está em destaque para quem separa.', 'warning');
        return;
    }
    abrirModalConferenciaOS(os.id);
}

window.addEventListener('load', () => {
    almoxAbrirComObraPedida();
    almoxDestacarOSPedida();
});
