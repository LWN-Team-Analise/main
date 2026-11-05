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
// O check "Solicitar OS" da obra abre esta tela já com o cliente e a
// obra escolhidos: /core/app/control/solicitar?obra=ID.
// ============================================================

// lido AQUI, e nao no load: endereco.js limpa o ?obra= do endereco
const ALMOX_OBRA_PEDIDA = (() => {
    const id = new URLSearchParams(location.search).get('obra');
    return /^\d{1,18}$/.test(id || '') ? id : null;
})();

let almoxObrasDoCliente = [];
let almoxObrasPedido = 0;

function almoxClienteIdEscolhido() {
    const select = document.getElementById('os-client');
    const opcao = select && select.selectedOptions ? select.selectedOptions[0] : null;
    const id = opcao && opcao.dataset ? opcao.dataset.clienteId : null;
    return id ? Number(id) : null;
}

function almoxLimparObra() {
    almoxObrasDoCliente = [];
    const grupo = document.getElementById('os-obra-grupo');
    const select = document.getElementById('os-obra-id');
    if (select) select.innerHTML = '';
    if (grupo) grupo.style.display = 'none';
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
    almoxLimparObra();
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

// Vindo do check "Solicitar OS" da obra: escolhe o cliente e a obra. A
// lista de clientes chega depois da tela (initApp), entao espera por ela
// — no maximo 15 segundos.
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
    const tentar = () => {
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
        almoxCarregarObrasDoCliente(obra.id);
    };
    tentar();
}

window.addEventListener('load', () => { almoxAbrirComObraPedida(); });
