// ============================================================
// O MENU DO ATMOSFERA LWN NO ALMOXARIFE
//
// A barra lateral e a do AppShell do main (o CSS e estilo-main.css,
// gerado do proprio CSS de la). Este arquivo faz o que o AppShell.jsx
// faz com ela, na mesma conta:
//
//   - a MARCA: uma peca so (.rail__marca, com o anel girando) que muda
//     de lugar. Quem diz o item aceso continua sendo o lwncontrol (o
//     .menu-item.active do switchTab); aqui ele vira o .is-atual do
//     main, e a posicao e o tamanho do botao vao para as variaveis
//     --marca-* da barra — a transicao do CSS faz o caminho;
//   - as transicoes de lugar so ligam depois da primeira pintura
//     (.is-viaja): sem isso a marca entraria deslizando do canto 0,0;
//   - o AVATAR e o menu dele: quem esta logado, Configurações e Sair,
//     com a confirmacao "Sair do sistema?" — fecha no clique fora e
//     no Esc.
// ============================================================
(function () {
    'use strict';

    // a mesma de core/src/utils/formato.js (iniciaisDe e corDoNome)
    function iniciaisDe(nome) {
        const partes = String(nome == null ? '' : nome).trim().split(/\s+/).filter(Boolean);
        if (partes.length === 0) return '?';
        if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
        return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    }

    function corDoNome(nome) {
        const texto = String(nome == null ? '' : nome);
        let soma = 0;
        for (let i = 0; i < texto.length; i += 1) soma = (soma * 31 + texto.charCodeAt(i)) % 360;
        return `hsl(${soma} 62% 46%)`;
    }

    // ---------------- a marca que desliza ----------------

    function montarBarra() {
        const nav = document.getElementById('almox-rail');
        const lista = nav && nav.querySelector('.rail__lista');
        const marca = lista && lista.querySelector('.rail__marca');
        if (!nav || !lista || !marca) return;

        const medir = () => {
            const btn = lista.querySelector('.rail__btn.is-atual');
            // offsetParent nulo = o botao esta escondido (a permissao tirou o
            // item, ou a barra esta fora da tela): a marca apaga onde estava
            // (so mexe na classe quando ela muda: mexer sem mudar ainda conta
            // como mudanca para o MutationObserver, e ele chamaria de novo)
            if (!btn || btn.offsetParent === null) {
                if (marca.classList.contains('is-pronta')) marca.classList.remove('is-pronta');
                return;
            }
            // offset e medida de LAYOUT: ignora transform, entao nem uma
            // transicao pela metade entorta a conta
            nav.style.setProperty('--marca-x', `${btn.offsetLeft}px`);
            nav.style.setProperty('--marca-y', `${btn.offsetTop}px`);
            nav.style.setProperty('--marca-l', `${btn.offsetWidth}px`);
            nav.style.setProperty('--marca-a', `${btn.offsetHeight}px`);
            if (!marca.classList.contains('is-pronta')) marca.classList.add('is-pronta');
        };

        // o item aceso e o .active do lwncontrol; o do main e o .is-atual
        const acender = () => {
            const ativo = lista.querySelector('.rail__btn.active');
            lista.querySelectorAll('.rail__btn.is-atual').forEach((b) => {
                if (b !== ativo) b.classList.remove('is-atual');
            });
            if (ativo && !ativo.classList.contains('is-atual')) ativo.classList.add('is-atual');
            medir();
        };

        acender();
        // as transicoes de lugar so depois da primeira pintura
        requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.add('is-viaja')));

        // o switchTab troca o .active; as permissoes escondem e mostram os
        // li. Ouve so os botoes e os li: a marca (que esta na lista) muda de
        // classe aqui mesmo e nao pode chamar a conta de novo
        const observador = new MutationObserver((mudancas) => {
            if (mudancas.some((m) => m.target !== marca)) acender();
        });
        observador.observe(lista, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
        // a barra muda de tamanho com a janela: a marca reencontra o botao
        if (typeof ResizeObserver === 'function') {
            const tamanho = new ResizeObserver(medir);
            tamanho.observe(nav);
            tamanho.observe(lista);
        }
    }

    // ---------------- o avatar e o menu dele ----------------

    function montarAvatar() {
        const caixa = document.getElementById('almox-euzinho');
        if (!caixa) return;
        const menu = caixa.querySelector('.euzinho__menu');
        const botao = caixa.querySelector('.euzinho__botao');
        const confirma = document.getElementById('almox-confirma-sair');

        let eu = {};
        try { eu = JSON.parse(sessionStorage.getItem('lwn_user') || '{}') || {}; } catch (e) { eu = {}; }
        /* o usuario da sessao do main (o mesmo do avatar do AppShell): vale
           quando /api/almox/eu nao trouxe o nome ou a foto */
        let doMain = {};
        try { doMain = (JSON.parse(localStorage.getItem('customers.session') || 'null') || {}).user || {}; } catch (e) { doMain = {}; }
        const nome = String(eu.nome || doMain.name || '').trim() || 'Usuário';
        const foto = eu.foto || doMain.foto || null;

        caixa.querySelector('[data-eu="nome"]').textContent = nome;
        caixa.querySelector('[data-eu="setor"]').textContent = eu.setor || eu.email || '';
        botao.title = nome;

        // o Avatar do main: a foto, ou as iniciais sobre a cor do nome
        const avatar = caixa.querySelector('[data-eu="avatar"]');
        if (foto) {
            const img = document.createElement('img');
            img.src = foto;
            img.alt = nome;
            avatar.appendChild(img);
        } else {
            avatar.style.background = corDoNome(nome);
            avatar.textContent = iniciaisDe(nome);
        }

        const abrir = (sim) => {
            menu.hidden = !sim;
            botao.classList.toggle('is-aberto', sim);
            botao.setAttribute('aria-expanded', sim ? 'true' : 'false');
        };

        botao.addEventListener('click', () => abrir(menu.hidden));
        // fecha ao clicar fora ou no Esc
        document.addEventListener('mousedown', (evento) => {
            if (!menu.hidden && !caixa.contains(evento.target)) abrir(false);
        });
        document.addEventListener('keydown', (evento) => {
            if (evento.key !== 'Escape') return;
            if (!menu.hidden) abrir(false);
            if (confirma && !confirma.hidden) confirma.hidden = true;
        });

        menu.addEventListener('click', (evento) => {
            const item = evento.target.closest('[data-acao]');
            if (!item) return;
            abrir(false);
            if (item.dataset.acao === 'config') window.location.href = '/core/app/configuracoes';
            if (item.dataset.acao === 'sair' && confirma) confirma.hidden = false;
        });

        if (!confirma) return;
        // o clique no veu (fora da caixa) fecha, como no Modal do main
        confirma.addEventListener('mousedown', (evento) => {
            if (evento.target === confirma) confirma.hidden = true;
        });
        confirma.addEventListener('click', (evento) => {
            const item = evento.target.closest('[data-acao]');
            if (!item) return;
            if (item.dataset.acao === 'fechar') {
                confirma.hidden = true;
                return;
            }
            if (item.dataset.acao !== 'confirmar') return;
            // o mesmo registro do Sair do lwncontrol, antes de a sessao sair
            try {
                if (typeof registrarLog === 'function') {
                    registrarLog('logout', 'seguranca', 'Saiu do sistema', {
                        entidade: 'Acesso',
                        detalhes: { contexto: { 'Saída': 'Pelo menu do avatar' } }
                    });
                }
            } catch (e) { /* sair nunca falha por causa do log */ }
            // o token do main e sem estado no servidor: sair e apagar a sessao
            try {
                localStorage.removeItem('customers.session');
                sessionStorage.removeItem('lwn_user');
            } catch (e) { /* segue */ }
            window.location.href = '/core/login';
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        montarBarra();
        montarAvatar();
    });
})();
