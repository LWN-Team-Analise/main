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
//     no Esc;
//   - no CELULAR (ate 860px, como no main) a bolha deita no rodape com
//     Painel, Solicitar, Certificados e o Mais: o INDICADOR desliza ate o
//     item aceso e o icone sobe para dentro dele (--ind-x e --ergue, a
//     conta do AppShell.jsx), e o Mais abre o MENU LATERAL do main com
//     o resto das abas.
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

    // o celular do AppShell.css: a bolha deita no rodape
    const celular = window.matchMedia('(max-width: 860px)');

    // posicaoDentro do AppShell.jsx: a soma dos offsets ate a barra
    function posicaoDentro(el, ate) {
        let x = 0;
        let y = 0;
        let no = el;
        while (no && no !== ate) {
            x += no.offsetLeft;
            y += no.offsetTop;
            no = no.offsetParent;
        }
        return no === ate ? { x, y } : null;
    }

    // so mexe na classe quando ela muda: mexer sem mudar ainda conta como
    // mudanca para o MutationObserver, e ele chamaria a conta de novo
    function pronta(peca, sim) {
        if (peca && peca.classList.contains('is-pronta') !== sim) peca.classList.toggle('is-pronta', sim);
    }

    function montarBarra() {
        const nav = document.getElementById('almox-rail');
        const lista = nav && nav.querySelector('.rail__lista');
        const marca = lista && lista.querySelector('.rail__marca');
        const indicador = nav && nav.querySelector('.rail__indicador');
        if (!nav || !lista || !marca) return;

        const medir = () => {
            const btn = lista.querySelector('.rail__btn.is-atual');
            // offsetParent nulo = o botao esta escondido (a permissao tirou o
            // item; no celular, a aba e uma das que foram para o Mais): a
            // marca e o indicador apagam onde estavam
            if (!btn || btn.offsetParent === null) {
                pronta(marca, false);
                pronta(indicador, false);
                return;
            }
            // offset e medida de LAYOUT: ignora transform, entao nem uma
            // transicao pela metade entorta a conta
            nav.style.setProperty('--marca-x', `${btn.offsetLeft}px`);
            nav.style.setProperty('--marca-y', `${btn.offsetTop}px`);
            nav.style.setProperty('--marca-l', `${btn.offsetWidth}px`);
            nav.style.setProperty('--marca-a', `${btn.offsetHeight}px`);
            pronta(marca, true);

            // o indicador do celular, na conta do AppShell.jsx: tudo sai do
            // CENTRO do icone, medido na caixa da barra
            const glifo = btn.querySelector('.rail__glifo');
            const noGlifo = glifo ? posicaoDentro(glifo, nav) : null;
            if (!indicador || !noGlifo) {
                pronta(indicador, false);
                return;
            }
            // o quanto o centro do circulo fica abaixo da borda de cima da
            // barra: mora no CSS (--afunda)
            const afunda = parseFloat(getComputedStyle(nav).getPropertyValue('--afunda')) || 0;
            const cx = noGlifo.x + glifo.offsetWidth / 2;
            const cy = noGlifo.y + glifo.offsetHeight / 2;
            // o batente: perto das pontas a curva do indicador sairia pela
            // quina arredondada da barra
            const meia = 28;
            const folga = 14;
            const ix = Math.min(Math.max(cx, folga + meia), nav.clientWidth - folga - meia);
            nav.style.setProperty('--ind-x', `${ix}px`);
            // quanto o icone sobe para o centro dele cair no do indicador
            nav.style.setProperty('--ergue', `${cy - afunda}px`);
            pronta(indicador, true);
        };

        // O item aceso: o .active do lwncontrol vira o .is-atual do main. No
        // celular o Solicitar tem lugar na barra: com o painel de solicitacao
        // aberto dentro do Painel Geral, e ele que acende
        const itemAtual = () => {
            const ativo = lista.querySelector('.rail__btn.active');
            const painel = typeof painelOSAtual !== 'undefined' ? painelOSAtual : null;
            if (celular.matches && painel === 'solicitacao' && ativo && ativo.closest('li[data-id="dashboard"]')) {
                const solicitar = lista.querySelector('li[data-id="solicitar"] > .rail__btn');
                if (solicitar && solicitar.offsetParent !== null) return solicitar;
            }
            return ativo;
        };

        const acender = () => {
            const ativo = itemAtual();
            lista.querySelectorAll('.rail__btn.is-atual').forEach((b) => {
                if (b !== ativo) b.classList.remove('is-atual');
            });
            if (ativo && !ativo.classList.contains('is-atual')) ativo.classList.add('is-atual');
            medir();
        };

        // abrir e fechar os paineis do Painel Geral (Solicitar, Aprovar,
        // Minhas Obras) nao mexe na barra, mas muda quem acende no celular
        ['abrirPainelOS', 'fecharPainelOS'].forEach((nome) => {
            const original = window[nome];
            if (typeof original !== 'function') return;
            window[nome] = function () {
                const resposta = original.apply(this, arguments);
                acender();
                return resposta;
            };
        });
        // a virada computador <-> celular troca a barra de forma
        celular.addEventListener('change', acender);

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

    // ---------------- quem esta logado ----------------

    function quemEsta() {
        let eu = {};
        try { eu = JSON.parse(sessionStorage.getItem('lwn_user') || '{}') || {}; } catch (e) { eu = {}; }
        /* o usuario da sessao do main (o mesmo do avatar do AppShell): vale
           quando /api/almox/eu nao trouxe o nome ou a foto */
        let doMain = {};
        try { doMain = (JSON.parse(localStorage.getItem('customers.session') || 'null') || {}).user || {}; } catch (e) { doMain = {}; }
        return {
            eu,
            nome: String(eu.nome || doMain.name || '').trim() || 'Usuário',
            foto: eu.foto || doMain.foto || null,
        };
    }

    // o Avatar do main: a foto, ou as iniciais sobre a cor do nome
    function pintarAvatar(avatar, nome, foto) {
        if (!avatar) return;
        avatar.textContent = '';
        if (foto) {
            const img = document.createElement('img');
            img.src = foto;
            img.alt = nome;
            avatar.appendChild(img);
        } else {
            avatar.style.background = corDoNome(nome);
            avatar.textContent = iniciaisDe(nome);
        }
    }

    // as estrelas de components/Estrelas do main: a parcial e um gradiente
    // com os dois pontos na mesma posicao (um corte reto)
    function estrelas(nota, tamanho) {
        const valor = Number(nota) || 0;
        const caixa = document.createElement('span');
        caixa.className = 'estrelas';
        caixa.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 5; i += 1) {
            const parte = Math.round(Math.max(0, Math.min(1, valor - i)) * 100);
            const id = `almox-est${i}-${parte}`;
            caixa.insertAdjacentHTML('beforeend',
                `<span><svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}"><defs><linearGradient id="${id}">` +
                `<stop offset="${parte}%" style="stop-color: var(--am-pri-media)"/><stop offset="${parte}%" style="stop-color: transparent"/>` +
                `</linearGradient></defs><path d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.99 6.75 19.75l1-5.85L3.5 9.75l5.9-.85z" ` +
                `fill="url(#${id})" style="stroke: var(--am-pri-media)" stroke-width="1.3" stroke-linejoin="round"/></svg></span>`);
        }
        return caixa;
    }

    // ---------------- o Mais e o menu lateral (celular) ----------------
    //
    // O MenuLateral do AppShell.jsx: abre pela direita a partir do Mais da
    // barra de baixo, com quem esta logado, as abas que nao cabem na barra e
    // Configurações. Fecha no X, no veu, no Esc, ao escolher uma aba e na
    // virada para o computador. Fica no HTML mesmo fechado (o CSS esconde
    // por visibility), para o fechar tambem deslizar.

    function montarMenuLado() {
        const mais = document.getElementById('almox-mais');
        const lado = document.getElementById('almox-menulado');
        if (!mais || !lado) return;
        const painel = lado.querySelector('.menulado__painel');

        const { eu, nome, foto } = quemEsta();
        pintarAvatar(lado.querySelector('[data-eu="avatar"]'), nome, foto);
        lado.querySelector('[data-eu="nome"]').textContent = nome;
        const nota = lado.querySelector('[data-eu="nota"]');
        if (eu.media !== null && eu.media !== undefined && eu.media !== '') {
            const media = Number(eu.media);
            const obras = Number(eu.obras_avaliadas) || 0;
            nota.textContent = '';
            nota.appendChild(estrelas(media, 13));
            const b = document.createElement('b');
            b.textContent = media.toFixed(1);
            const em = document.createElement('em');
            em.textContent = `${obras} obra${obras === 1 ? '' : 's'}`;
            nota.append(b, em);
        }

        // a aba aberta, para acender a linha dela: os paineis do Painel
        // Geral (Aprovar, Minhas Obras) contam como aba
        const abaAtual = () => {
            const painelAberto = typeof painelOSAtual !== 'undefined' ? painelOSAtual : null;
            const doPainel = { aprovacao: 'aprovar', gerenciamento: 'minhas-obras', solicitacao: 'solicitar' }[painelAberto];
            const ativo = document.querySelector('#almox-rail .rail__btn.active');
            const m = ativo && (ativo.getAttribute('onclick') || '').match(/switchTab\('([^']+)'\)/);
            const aba = m ? m[1] : null;
            return aba === 'dashboard' && doPainel ? doPainel : aba;
        };

        const focaveis = () => lado.querySelectorAll('.menulado__fechar, .menulado__item');
        const abrir = (sim) => {
            if (lado.classList.contains('is-aberto') === sim) return;
            lado.classList.toggle('is-aberto', sim);
            lado.setAttribute('aria-hidden', sim ? 'false' : 'true');
            mais.setAttribute('aria-expanded', sim ? 'true' : 'false');
            focaveis().forEach((el) => {
                if (sim) el.removeAttribute('tabindex');
                else el.setAttribute('tabindex', '-1');
            });
            if (!sim) return;
            const aba = abaAtual();
            lado.querySelectorAll('.menulado__item[data-aba]').forEach((item) => {
                item.classList.toggle('is-atual', item.dataset.aba === aba);
            });
            painel.focus();
        };

        focaveis().forEach((el) => el.setAttribute('tabindex', '-1'));
        mais.addEventListener('click', () => abrir(!lado.classList.contains('is-aberto')));
        lado.querySelector('.menulado__veu').addEventListener('click', () => abrir(false));
        lado.querySelector('.menulado__fechar').addEventListener('click', () => abrir(false));
        document.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape') abrir(false);
        });
        celular.addEventListener('change', () => {
            if (!celular.matches) abrir(false);
        });
        lado.querySelector('.menulado__lista').addEventListener('click', (evento) => {
            const item = evento.target.closest('.menulado__item');
            if (!item) return;
            abrir(false);
            // as abas do Almoxarife (os links, Atmosfera e Configurações,
            // seguem sozinhos)
            if (item.dataset.aba && typeof window.switchTab === 'function') window.switchTab(item.dataset.aba);
        });
    }

    // ---------------- o avatar e o menu dele ----------------
    //
    // Dois: o do canto, junto da bolha (computador), e o da barra de cima
    // (celular, o .euzinho--barra do main). O CSS mostra um de cada vez.

    function montarAvatar() {
        const confirma = document.getElementById('almox-confirma-sair');
        const { eu, nome, foto } = quemEsta();

        document.querySelectorAll('.euzinho').forEach((caixa) => {
            const menu = caixa.querySelector('.euzinho__menu');
            const botao = caixa.querySelector('.euzinho__botao');
            if (!menu || !botao) return;

            caixa.querySelector('[data-eu="nome"]').textContent = nome;
            caixa.querySelector('[data-eu="setor"]').textContent = eu.setor || eu.email || '';
            botao.title = nome;
            pintarAvatar(caixa.querySelector('[data-eu="avatar"]'), nome, foto);

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
            });

            menu.addEventListener('click', (evento) => {
                const item = evento.target.closest('[data-acao]');
                if (!item) return;
                abrir(false);
                if (item.dataset.acao === 'config') window.location.href = '/core/app/configuracoes';
                if (item.dataset.acao === 'sair' && confirma) confirma.hidden = false;
            });
        });

        if (!confirma) return;
        document.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape' && !confirma.hidden) confirma.hidden = true;
        });
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
        montarMenuLado();
    });
})();
