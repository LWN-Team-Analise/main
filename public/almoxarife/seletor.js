// ============================================================
// O SELETOR DO MAIN NOS SELECTS DO LWN CONTROL
//
// A lista aberta do <select> do navegador nao aceita estilo: sai com a
// cara do sistema operacional. O Atmosfera LWN usa o componente Seletor
// (core/src/components/Seletor) — a pilula de vidro e uma lista propria,
// com o vidro, os cantos e a marca na opcao escolhida. Este arquivo faz o
// mesmo com TODOS os selects do Control, os do HTML e os que as telas
// montam depois:
//
//   - o <select> continua na pagina, escondido, e continua sendo quem
//     guarda o valor: o codigo das telas le e grava nele como sempre
//     (value, selectedOptions, onchange) e nada precisa mudar;
//   - ao lado dele entra o botao (.sel__botao) e, ao abrir, a lista
//     (.sel__lista) no <body>, com position: fixed — dentro de uma janela
//     ela nao e cortada. Sem espaco embaixo, abre para cima;
//   - escolher grava no select e dispara 'input' e 'change' (o onchange
//     de cada tela roda como antes);
//   - o que as telas trocam por conta propria — as opcoes (innerHTML), o
//     valor por atribuicao (select.value = ...), o disabled, o display —
//     aparece no botao na hora;
//   - teclado como no main: setas, Enter, Esc e letras que pulam para a
//     opcao. Lista com mais de 12 opcoes (clientes, responsaveis) ganha a
//     busca no alto.
//
// O CSS e o do proprio Seletor, copiado por scripts/estilo-almoxarife.mjs.
// ============================================================
(function () {
    'use strict';

    const BUSCA_A_PARTIR_DE = 12;
    const JANELA = '.modal-container, .modal-content, .am-modal__caixa';
    const ligados = new WeakMap(); // select -> { caixa, botao, valor }
    let aberto = null; // { select, lista, botoes, busca }

    const semAcento = (texto) => String(texto == null ? '' : texto)
        .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    const SETA = '<svg class="sel__seta" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    const CONFERE = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';

    // ---------------- o botao acompanha o select ----------------

    function atualizar(select) {
        const l = ligados.get(select);
        if (!l) return;
        const op = select.options[select.selectedIndex];
        l.valor.textContent = op ? op.textContent.trim() : '';
        l.botao.classList.toggle('is-vazio', !op || op.value === '');
        l.botao.disabled = select.disabled;
        l.caixa.style.display = getComputedStyle(select).display === 'none' ? 'none' : '';
    }

    // As telas trocam a escolha por atribuicao (select.value = x,
    // selectedIndex, option.selected), e isso nao dispara evento nenhum.
    // A gravacao continua a do navegador; depois dela o botao se atualiza.
    function remendar(prototipo, nome, select) {
        const desc = Object.getOwnPropertyDescriptor(prototipo, nome);
        if (!desc || !desc.set) return desc;
        Object.defineProperty(prototipo, nome, {
            configurable: true,
            enumerable: desc.enumerable,
            get() { return desc.get.call(this); },
            set(v) {
                desc.set.call(this, v);
                const alvo = select(this);
                if (alvo && ligados.has(alvo)) atualizar(alvo);
            }
        });
        return desc;
    }
    remendar(HTMLSelectElement.prototype, 'value', (el) => el);
    const indice = remendar(HTMLSelectElement.prototype, 'selectedIndex', (el) => el);
    remendar(HTMLOptionElement.prototype, 'selected', (el) => el.closest('select'));

    // ---------------- ligar ----------------

    function ligar(select) {
        if (ligados.has(select) || select.multiple || select.size > 1 || 'semSeletor' in select.dataset) return;
        const caixa = document.createElement('span');
        caixa.className = 'sel sel--largo sel--controle';
        // o lugar do select na linha (largura e flex escritos nele)
        ['width', 'flex', 'minWidth', 'maxWidth'].forEach((p) => {
            if (select.style[p]) caixa.style[p] = select.style[p];
        });

        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'sel__botao';
        botao.setAttribute('aria-haspopup', 'listbox');
        botao.setAttribute('aria-expanded', 'false');
        const rotulo = select.getAttribute('aria-label')
            || (select.id ? (document.querySelector(`label[for="${CSS.escape(select.id)}"]`) || {}).textContent : '');
        if (rotulo && rotulo.trim()) botao.setAttribute('aria-label', rotulo.trim());
        const valor = document.createElement('span');
        valor.className = 'sel__valor';
        botao.append(valor);
        botao.insertAdjacentHTML('beforeend', SETA);
        caixa.append(botao);

        select.insertAdjacentElement('afterend', caixa);
        select.classList.add('sel-nativo');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        ligados.set(select, { caixa, botao, valor });

        botao.addEventListener('click', () => {
            if (aberto && aberto.select === select) fechar();
            else abrir(select);
        });
        botao.addEventListener('keydown', (e) => teclar(e, select));
        select.addEventListener('change', () => atualizar(select));
        // quem da foco no select (validacao das telas) cai no botao
        select.addEventListener('focus', () => botao.focus());
        // as opcoes trocadas (innerHTML), o disabled, o display
        new MutationObserver(() => atualizar(select)).observe(select, {
            childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: ['disabled', 'style', 'class', 'hidden', 'selected', 'label']
        });
        if (select.form) select.form.addEventListener('reset', () => setTimeout(() => atualizar(select), 0));
        atualizar(select);
    }

    function ligarTodos(raiz) {
        if (!raiz || !raiz.querySelectorAll) return;
        if (raiz.tagName === 'SELECT') ligar(raiz);
        raiz.querySelectorAll('select').forEach(ligar);
    }

    // ---------------- a lista ----------------

    // o "Selecione..." (valor vazio) e o texto do botao vazio, e nao uma
    // opcao — como no main. O "Todos" de valor vazio dos filtros entra.
    function opcoesDe(select) {
        const itens = [];
        const opcao = (op) => {
            if (op.hidden) return;
            if (op.value === '' && /^\s*(selecione|escolha|—|--)/i.test(op.textContent)) return;
            itens.push({ op });
        };
        [...select.children].forEach((filho) => {
            if (filho.tagName === 'OPTGROUP') {
                itens.push({ grupo: filho.label });
                [...filho.children].forEach(opcao);
            } else if (filho.tagName === 'OPTION') opcao(filho);
        });
        return itens;
    }

    function rolarAte(lista, item) {
        const topo = item.getBoundingClientRect().top - lista.getBoundingClientRect().top + lista.scrollTop;
        const fim = topo + item.offsetHeight;
        if (topo < lista.scrollTop + 40) lista.scrollTop = Math.max(0, topo - 40);
        else if (fim > lista.scrollTop + lista.clientHeight) lista.scrollTop = fim - lista.clientHeight;
    }

    function posicionar() {
        if (!aberto) return;
        const l = ligados.get(aberto.select);
        if (!l || !document.contains(l.botao)) { fechar(); return; }
        const r = l.botao.getBoundingClientRect();
        const largura = Math.max(r.width, 220);
        const esquerda = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
        const folgaAbaixo = window.innerHeight - r.bottom;
        const paraCima = folgaAbaixo < 240 && r.top > folgaAbaixo;
        const s = aberto.lista.style;
        s.left = `${esquerda}px`;
        s.width = `${largura}px`;
        if (paraCima) {
            s.top = 'auto';
            s.bottom = `${window.innerHeight - r.top + 6}px`;
            s.maxHeight = `${Math.min(320, r.top - 16)}px`;
        } else {
            s.bottom = 'auto';
            s.top = `${r.bottom + 6}px`;
            s.maxHeight = `${Math.min(320, folgaAbaixo - 16)}px`;
        }
    }

    function filtrar(texto) {
        if (!aberto) return;
        const busca = semAcento(texto).trim();
        aberto.lista.querySelectorAll('.sel__grupo').forEach((g) => { g.style.display = busca ? 'none' : ''; });
        let algum = false;
        aberto.botoes.forEach((b) => {
            const mostra = !busca || semAcento(b.textContent).includes(busca);
            b.parentElement.style.display = mostra ? '' : 'none';
            b.classList.remove('is-foco');
            if (mostra) algum = true;
        });
        aberto.nada.style.display = algum ? 'none' : '';
    }

    function abrir(select) {
        fechar();
        const l = ligados.get(select);
        if (!l || select.disabled) return;

        const lista = document.createElement('ul');
        lista.className = 'sel__lista';
        lista.setAttribute('role', 'listbox');
        if (l.botao.closest(JANELA)) lista.classList.add('is-solida');

        const itens = opcoesDe(select);
        let busca = null;
        if (itens.filter((i) => i.op).length > BUSCA_A_PARTIR_DE) {
            const li = document.createElement('li');
            li.className = 'sel__busca';
            busca = document.createElement('input');
            busca.type = 'search';
            busca.placeholder = 'Buscar...';
            busca.autocomplete = 'off';
            busca.setAttribute('aria-label', 'Buscar na lista');
            li.append(busca);
            lista.append(li);
        }

        const botoes = [];
        itens.forEach((i) => {
            const li = document.createElement('li');
            if (i.grupo !== undefined) {
                li.className = 'sel__grupo';
                li.textContent = i.grupo;
                lista.append(li);
                return;
            }
            const atual = i.op.selected;
            const b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('role', 'option');
            b.setAttribute('aria-selected', atual ? 'true' : 'false');
            b.className = `sel__item${atual ? ' is-atual' : ''}`;
            b.disabled = i.op.disabled;
            const texto = document.createElement('span');
            texto.className = 'sel__rotulo';
            texto.textContent = i.op.textContent.trim();
            b.append(texto);
            if (atual) b.insertAdjacentHTML('beforeend', CONFERE);
            b.addEventListener('click', () => escolher(select, i.op));
            li.append(b);
            lista.append(li);
            botoes.push(b);
        });
        const nada = document.createElement('li');
        nada.className = 'sel__nada';
        nada.textContent = botoes.length ? 'Nada encontrado' : 'Nada para escolher';
        nada.style.display = botoes.length ? 'none' : '';
        lista.append(nada);

        document.body.append(lista);
        aberto = { select, lista, botoes, busca, nada };
        l.botao.classList.add('is-aberto');
        l.botao.setAttribute('aria-expanded', 'true');
        posicionar();
        const escolhida = lista.querySelector('.is-atual');
        if (escolhida) rolarAte(lista, escolhida);
        if (busca) {
            busca.addEventListener('input', () => filtrar(busca.value));
            busca.addEventListener('keydown', teclarNaLista);
            setTimeout(() => busca.focus(), 0);
        }
    }

    function fechar() {
        if (!aberto) return;
        const l = ligados.get(aberto.select);
        aberto.lista.remove();
        if (l) {
            l.botao.classList.remove('is-aberto');
            l.botao.setAttribute('aria-expanded', 'false');
        }
        aberto = null;
    }

    function escolher(select, op) {
        const l = ligados.get(select);
        fechar();
        if (op.disabled) return;
        const mudou = !op.selected;
        indice.set.call(select, [...select.options].indexOf(op));
        atualizar(select);
        if (l) l.botao.focus();
        if (mudou) {
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // ---------------- teclado ----------------

    const digitado = { texto: '', ate: 0 };
    function pularPara(select, e) {
        const agora = Date.now();
        const antes = agora < digitado.ate ? digitado.texto : '';
        if (!antes && e.key === ' ') return false;
        const texto = antes + semAcento(e.key);
        digitado.texto = texto;
        digitado.ate = agora + 800;
        e.preventDefault();
        const achada = opcoesDe(select).find((i) => i.op && !i.op.disabled && semAcento(i.op.textContent.trim()).startsWith(texto));
        if (achada && !achada.op.selected) escolher(select, achada.op);
        return true;
    }

    function teclar(e, select) {
        if (aberto && aberto.select === select) { teclarNaLista(e); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ' && Date.now() < digitado.ate) { pularPara(select, e); return; }
            e.preventDefault();
            abrir(select);
            return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) pularPara(select, e);
    }

    function teclarNaLista(e) {
        if (!aberto) return;
        const visiveis = aberto.botoes.filter((b) => b.parentElement.style.display !== 'none' && !b.disabled);
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            const select = aberto.select;
            fechar();
            const l = ligados.get(select);
            if (l) l.botao.focus();
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            let i = visiveis.findIndex((b) => b.classList.contains('is-foco'));
            if (i < 0) i = visiveis.findIndex((b) => b.classList.contains('is-atual'));
            i = e.key === 'ArrowDown' ? Math.min(visiveis.length - 1, i + 1) : Math.max(0, i - 1);
            aberto.botoes.forEach((b) => b.classList.remove('is-foco'));
            const alvo = visiveis[i];
            if (alvo) {
                alvo.classList.add('is-foco');
                rolarAte(aberto.lista, alvo);
            }
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const alvo = aberto.botoes.find((b) => b.classList.contains('is-foco')) || (aberto.busca ? visiveis[0] : null);
            if (alvo) alvo.click();
            else fechar();
            return;
        }
        if (e.key === 'Tab') fechar();
    }

    // ---------------- fora da lista ----------------

    document.addEventListener('mousedown', (e) => {
        if (!aberto) return;
        if (aberto.lista.contains(e.target)) return;
        const l = ligados.get(aberto.select);
        if (l && l.botao.contains(e.target)) return;
        fechar();
    }, true);
    // rolar a pagina (ou a janela) move o botao: a lista acompanha. A
    // rolagem da propria lista nao mexe em nada
    window.addEventListener('scroll', (e) => {
        if (aberto && !(e.target && e.target.closest && e.target.closest('.sel__lista'))) posicionar();
    }, true);
    window.addEventListener('resize', posicionar);

    document.addEventListener('DOMContentLoaded', () => {
        ligarTodos(document.body);
        // os selects que as telas montam depois
        new MutationObserver((mudancas) => {
            for (const m of mudancas) {
                m.addedNodes.forEach((no) => {
                    if (no.nodeType === 1 && !no.classList.contains('sel__lista')) ligarTodos(no);
                });
            }
        }).observe(document.body, { childList: true, subtree: true });
    });
})();
