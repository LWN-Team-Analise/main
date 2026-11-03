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
// A OS fica ligada à obra, e é ela que marca o check "Enviar OS" (3a etapa
// do roteiro) quando a OS for APROVADA. O servidor confere a mesma regra
// (lerClienteEObra, em core/server/almoxarife).
// ============================================================

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
            : 'A OS fica ligada a esta obra. Aprovada, ela marca o check "Enviar OS" da obra.';
    }
    grupo.style.display = '';
}
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
});
