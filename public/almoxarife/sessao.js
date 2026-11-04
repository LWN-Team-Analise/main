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
    } else {
        /* Sem o colaborador a tela abria vazia, sem a foto e dizendo "Você
           não tem permissão para acessar nenhum módulo" — que não era o
           caso: quem falhou foi o servidor (o banco sem as atualizações do
           Almoxarife, a rede, a API fora do ar). O que ficou de uma visita
           anterior sai, para não valer permissão velha, e um aviso por
           cima da tela diz o que houve. */
        var motivo = '';
        try { motivo = (JSON.parse(pedido.responseText || '{}') || {}).erro || ''; } catch (e) { motivo = ''; }
        if (!motivo) {
            motivo = pedido.status
                ? 'O servidor respondeu com erro (' + pedido.status + ').'
                : 'O servidor não respondeu. Confira a conexão.';
        }
        try { sessionStorage.removeItem('lwn_user'); } catch (e) { /* segue */ }
        document.addEventListener('DOMContentLoaded', function () { mostrarFalha(motivo); });
    }

    function mostrarFalha(motivo) {
        var caixa = document.createElement('div');
        caixa.className = 'am-modal';
        caixa.id = 'almox-falha';
        caixa.style.zIndex = '2147483000';
        caixa.innerHTML =
            '<div class="am-modal__caixa" role="alertdialog" aria-modal="true" aria-labelledby="almox-falha-titulo" style="max-width: 460px;">' +
                '<div class="am-modal__topo"><h2 class="am-modal__titulo" id="almox-falha-titulo">Não foi possível abrir o Almoxarife</h2></div>' +
                '<div class="am-modal__corpo"><div class="confirma">' +
                    '<p class="confirma__texto" data-falha="motivo"></p>' +
                    '<footer class="confirma__acoes">' +
                        '<a class="formobra__cancelar" href="' + INICIO + '">Voltar ao Atmosfera</a>' +
                        '<button type="button" class="confirma__ok confirma__ok--acao" data-falha="de-novo">Tentar de novo</button>' +
                    '</footer>' +
                '</div></div>' +
            '</div>';
        caixa.querySelector('[data-falha="motivo"]').textContent = motivo;
        caixa.querySelector('[data-falha="de-novo"]').addEventListener('click', function () { location.reload(); });
        document.body.appendChild(caixa);
    }

    /* O TEMA e o do main: o botao do modo noturno do lwncontrol saiu, e a
       escolha mora em Configurações > Aparência (localStorage
       'customers.theme', o de core/src/context/ThemeContext.jsx). Trocado
       em outra aba, vale aqui tambem. */
    var TEMA_DO_MAIN = 'customers.theme';
    function aplicarTema() {
        var escuro = false;
        try { escuro = localStorage.getItem(TEMA_DO_MAIN) === 'dark'; } catch (e) { escuro = false; }
        document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light');
        if (document.body) document.body.classList.toggle('dark-mode', escuro);
    }
    aplicarTema();
    document.addEventListener('DOMContentLoaded', aplicarTema);
    window.addEventListener('storage', function (evento) {
        if (evento.key === TEMA_DO_MAIN) aplicarTema();
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
