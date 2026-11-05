/* ============================================================
   O ENDERECO DO LWN CONTROL

   A tela mora em /core/app/control, ao lado das paginas do main
   (/core/app/obras, /core/app/clientes...): o servidor entrega esta
   pagina ali (vercel.json e vite.config.js). Cada aba tem o seu:

     /core/app/control              o Painel Geral
     /core/app/control/inventario   o Inventario
     /core/app/control/retirada     a Retirada (a aba 'conferencia')
     ...

   Trocar de aba muda o endereco (o voltar do navegador volta de aba), e
   abrir um endereco abre a aba dele. Os links antigos — os avisos e os
   e-mails ja mandados, /almoxarife/almoxarife.html?aba=devolutiva —
   abrem a mesma tela e ganham o endereco novo.

   Carregado POR ULTIMO: embrulha o switchTab que os outros scripts ja
   deixaram pronto.
   ============================================================ */
(function () {
    'use strict';

    var BASE = '/core/app/control';
    /* no endereco, o nome que a pessoa ve na tela; aqui dentro, o id da aba */
    var DO_ENDERECO = { retirada: 'conferencia', painel: 'dashboard' };
    var PARA_O_ENDERECO = { conferencia: 'retirada', dashboard: '' };
    /* os paineis de dentro do Painel Geral, que o switchTab abre por la */
    var ATALHOS = ['solicitar', 'aprovar', 'minhas-obras'];

    var original = window.switchTab;
    if (typeof original !== 'function') return;

    function existe(aba) {
        return aba === 'dashboard' || ATALHOS.indexOf(aba) >= 0 || !!document.getElementById(aba + '-tab');
    }

    function abaDoEndereco() {
        var resto = location.pathname.indexOf(BASE) === 0 ? location.pathname.slice(BASE.length) : '';
        var aba = '';
        try { aba = decodeURIComponent(resto.replace(/^\/+|\/+$/g, '').split('/')[0] || ''); } catch (e) { aba = ''; }
        if (!aba) aba = new URLSearchParams(location.search).get('aba') || '';
        aba = DO_ENDERECO[aba] || aba || 'dashboard';
        return existe(aba) ? aba : 'dashboard';
    }

    function enderecoDa(aba) {
        var nome = Object.prototype.hasOwnProperty.call(PARA_O_ENDERECO, aba) ? PARA_O_ENDERECO[aba] : aba;
        return nome ? BASE + '/' + encodeURIComponent(nome) : BASE;
    }

    var pronto = false;
    var profundidade = 0;
    window.switchTab = function (aba) {
        profundidade++;
        try {
            return original.apply(this, arguments);
        } finally {
            profundidade--;
            /* so a chamada de fora muda o endereco: "aprovar" chama
               switchTab('dashboard') por dentro, e o endereco fica /aprovar */
            if (pronto && profundidade === 0 && existe(aba)) {
                var novo = enderecoDa(aba);
                if (novo !== location.pathname) history.pushState({ aba: aba }, '', novo);
            }
        }
    };

    /* o voltar e o avancar do navegador trocam a aba, sem empilhar outra */
    window.addEventListener('popstate', function () {
        pronto = false;
        try { window.switchTab(abaDoEndereco()); } catch (e) { /* segue onde esta */ }
        pronto = true;
    });

    window.addEventListener('load', function () {
        var aba = abaDoEndereco();
        history.replaceState({ aba: aba }, '', enderecoDa(aba));
        if (aba !== 'dashboard') {
            try { window.switchTab(aba); } catch (e) { /* segue no Painel Geral */ }
        }
        pronto = true;
    });
})();
