/* ============================================================
   O ALMOXARIFE DENTRO DO ATMOSFERA LWN — A SESSAO

   No lwncontrol a tela abria depois do login DELE, que deixava o
   colaborador em sessionStorage('lwn_user') e mandava o resto do app
   ler de la. Agora quem entra e o login do main (/core/login), e este
   arquivo — o PRIMEIRO script da pagina, antes de qualquer outro — faz
   a ponte:

     1. pega o token do main (localStorage 'customers.session', o mesmo
        que core/src/services/api.js usa); sem token, vai para o login;
     2. le o colaborador em GET /api/almox/eu — ja no formato do
        lwncontrol: nome, cpf, email, cargo e as permissoes do SETOR
        (as chaves almox_* de Usuarios > Setores) — e grava em
        'lwn_user', onde o resto do app sempre leu;
     3. faz toda chamada a /api/almox levar o token (Authorization), e
        manda para o login quando a sessao do main cair.

   O passo 2 e SINCRONO de proposito: o app inteiro le 'lwn_user' no
   instante em que carrega, e ele precisa estar la antes.
   ============================================================ */
(function () {
    var SESSAO_DO_MAIN = 'customers.session';
    var LOGIN = '/core/login';
    var INICIO = '/core/app';

    var token = null;
    try { token = (JSON.parse(localStorage.getItem(SESSAO_DO_MAIN) || 'null') || {}).token || null; } catch (e) { token = null; }
    if (!token) { location.replace(LOGIN); return; }

    function irParaOLogin() {
        try { localStorage.removeItem(SESSAO_DO_MAIN); sessionStorage.removeItem('lwn_user'); } catch (e) { /* segue */ }
        location.replace(LOGIN);
    }

    var buscar = window.fetch.bind(window);
    window.fetch = function (entrada, opcoes) {
        var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
        if (url.indexOf('/api/almox') === -1) return buscar(entrada, opcoes);
        var o = Object.assign({}, opcoes || {});
        var cabecalhos = new Headers(o.headers || (typeof entrada !== 'string' && entrada.headers) || {});
        if (!cabecalhos.has('Authorization')) cabecalhos.set('Authorization', 'Bearer ' + token);
        o.headers = cabecalhos;
        return buscar(entrada, o).then(function (resposta) {
            /* a sessao do main morreu (8 horas, troca de senha, conta desativada) */
            if (resposta.status === 401) {
                resposta.clone().json().then(function (corpo) {
                    if (corpo && corpo.sessao === false) irParaOLogin();
                }).catch(function () {});
            }
            return resposta;
        });
    };

    var pedido = new XMLHttpRequest();
    pedido.open('GET', '/api/almox/eu', false);
    pedido.setRequestHeader('Authorization', 'Bearer ' + token);
    try { pedido.send(null); } catch (e) { /* a rede caiu: segue com o que ja estava */ }
    if (pedido.status === 401) { irParaOLogin(); return; }
    /* o setor nao tem a aba Almoxarife */
    if (pedido.status === 403) { location.replace(INICIO); return; }
    if (pedido.status === 200) {
        try { sessionStorage.setItem('lwn_user', pedido.responseText); } catch (e) { /* segue */ }
    }

    /* a foto (ou as iniciais) de quem esta logado no pe da barra lateral,
       como no resto do sistema */
    document.addEventListener('DOMContentLoaded', function () {
        var lugar = document.getElementById('almox-avatar');
        if (!lugar) return;
        var eu = {};
        try { eu = JSON.parse(sessionStorage.getItem('lwn_user') || '{}') || {}; } catch (e) { eu = {}; }
        var nome = String(eu.nome || '').trim();
        lugar.title = nome ? nome + ' · Configurações' : 'Configurações';
        if (eu.foto) {
            var img = document.createElement('img');
            img.src = eu.foto;
            img.alt = nome;
            lugar.appendChild(img);
            return;
        }
        var iniciais = document.createElement('span');
        iniciais.textContent = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase() || '?';
        lugar.appendChild(iniciais);
    });

    /* a notificacao (celular ou e-mail) abre a aba do aviso: ?aba=devolutiva.
       "aprovar" e "minhas-obras" sao abas de dentro do Painel Geral */
    window.addEventListener('load', function () {
        var aba = new URLSearchParams(location.search).get('aba');
        if (!aba || typeof window.switchTab !== 'function') return;
        var dentroDoPainel = { aprovar: 'dashboard', 'minhas-obras': 'dashboard' };
        try { window.switchTab(dentroDoPainel[aba] || aba); } catch (e) { /* aba que nao existe mais */ }
    });
})();
