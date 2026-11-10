/* ============================================================
   OS BOTOES DO LWN CONTROL, SEM SCRIPT EMBUTIDO

   A tela monta quase tudo com innerHTML, e o que vem do banco (nome de
   ferramenta, de cliente, observacao...) entra no meio do HTML sem
   escape. Um nome como <img src=x onerror=...> virava script rodando na
   sessao de quem abrisse a aba, com acesso ao token do main.

   A defesa e a Content-Security-Policy (no <head> do almoxarife.html e no
   vercel.json): script so de arquivo, nunca embutido. Isso corta a
   injecao, mas corta tambem os ~470 onclick="..." da propria tela. Este
   arquivo devolve esses botoes sem abrir a porta de novo:

     - cada atributo on* e LIDO como texto e interpretado aqui, com uma
       gramatica pequena (chamar funcao da tela, ler this.value, mexer em
       classList e style). Nao ha eval;
     - so se chama funcao declarada pela tela. fetch, eval, setTimeout e o
       que for nativo do navegador nao existem aqui dentro, e propriedade
       fora da lista (innerHTML, cookie, location...) tambem nao.

   Entao um onclick injetado no meio do dado, no pior caso, chama uma
   funcao que ja existia na tela, e so se a pessoa clicar nele. Nao le o
   token e nao fala com outro site. O onerror/onload nem e atendido.

   Mesmo clique, mesma ordem: o tratador entra como ouvinte no proprio
   elemento, entao stopPropagation e preventDefault valem como sempre
   valeram.

   Handler novo que nao couber na gramatica nao roda e avisa no console:
   ou se simplifica para uma chamada de funcao, ou se acrescenta aqui.
   ============================================================ */
(function () {
    'use strict';

    // <parser>
    var PONTUACAO = ['===', '!==', '?.', '==', '!=', '<=', '>=', '&&', '||', '(', ')', '[', ']', '{', '}', ',', ';', '.', '=', '<', '>', '+', '-', '*', '/', '!', '?', ':'];

    function separar(fonte) {
        var i = 0, saida = [], n = fonte.length;
        while (i < n) {
            var ch = fonte[i];
            if (/\s/.test(ch)) { i++; continue; }
            if (ch === "'" || ch === '"' || ch === '`') {
                var fim = ch, texto = '';
                i++;
                while (i < n && fonte[i] !== fim) {
                    if (fonte[i] === '\\') {
                        i++;
                        var e = fonte[i];
                        texto += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e;
                        i++;
                    } else {
                        texto += fonte[i++];
                    }
                }
                if (i >= n) throw new Error('texto sem fim');
                i++;
                saida.push({ t: 'texto', v: texto });
                continue;
            }
            var num = /^\d+(\.\d+)?/.exec(fonte.slice(i));
            if (num) { saida.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
            var pal = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(fonte.slice(i));
            if (pal) { saida.push({ t: 'nome', v: pal[0] }); i += pal[0].length; continue; }
            var achou = null;
            for (var p = 0; p < PONTUACAO.length; p++) {
                if (fonte.substr(i, PONTUACAO[p].length) === PONTUACAO[p]) { achou = PONTUACAO[p]; break; }
            }
            if (!achou) throw new Error('caractere inesperado: ' + ch);
            saida.push({ t: 'p', v: achou });
            i += achou.length;
        }
        return saida;
    }

    function analisar(fonte) {
        var ts = separar(fonte), pos = 0;
        var ve = function (v) { return pos < ts.length && ts[pos].t === 'p' && ts[pos].v === v; };
        var pega = function (v) { if (ve(v)) { pos++; return true; } return false; };
        var exige = function (v) { if (!pega(v)) throw new Error('esperava ' + v); };
        var nomeAgora = function (v) { return pos < ts.length && ts[pos].t === 'nome' && ts[pos].v === v; };

        function instrucao() {
            if (nomeAgora('return')) {
                pos++;
                if (pos >= ts.length || ve(';')) return { t: 'volta', a: null };
                return { t: 'volta', a: expressao() };
            }
            if (nomeAgora('if')) {
                pos++;
                exige('(');
                var c = expressao();
                exige(')');
                var entao = instrucao();
                pega(';');
                var senao = null;
                if (nomeAgora('else')) { pos++; senao = instrucao(); }
                return { t: 'se', c: c, entao: entao, senao: senao };
            }
            return expressao();
        }
        function expressao() {
            var alvo = ternario();
            if (pega('=')) {
                if (alvo.t !== 'membro') throw new Error('atribuicao invalida');
                return { t: 'atrib', o: alvo, v: expressao() };
            }
            return alvo;
        }
        function ternario() {
            var c = binario(0);
            if (pega('?')) {
                var a = expressao();
                exige(':');
                return { t: 'cond', c: c, a: a, b: expressao() };
            }
            return c;
        }
        var NIVEIS = [['||'], ['&&'], ['===', '!==', '==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/']];
        function binario(nivel) {
            if (nivel >= NIVEIS.length) return unario();
            var a = binario(nivel + 1);
            for (;;) {
                var op = null;
                for (var i = 0; i < NIVEIS[nivel].length; i++) if (ve(NIVEIS[nivel][i])) op = NIVEIS[nivel][i];
                if (!op) return a;
                pos++;
                a = { t: 'bin', op: op, a: a, b: binario(nivel + 1) };
            }
        }
        function unario() {
            if (pega('!')) return { t: 'nao', a: unario() };
            if (pega('-')) return { t: 'neg', a: unario() };
            if (nomeAgora('typeof')) { pos++; return { t: 'tipo', a: unario() }; }
            return membro();
        }
        function membro() {
            var o = primario();
            for (;;) {
                if (pega('.')) { o = { t: 'membro', o: o, p: nome() }; continue; }
                if (pega('?.')) { o = { t: 'membro', o: o, p: nome(), opc: true }; continue; }
                if (pega('[')) { var i = expressao(); exige(']'); o = { t: 'indice', o: o, i: i }; continue; }
                if (pega('(')) { o = { t: 'chamada', f: o, args: lista(')') }; continue; }
                return o;
            }
        }
        function nome() {
            if (pos >= ts.length || ts[pos].t !== 'nome') throw new Error('esperava nome');
            return ts[pos++].v;
        }
        function lista(fim) {
            var itens = [];
            if (pega(fim)) return itens;
            do { itens.push(expressao()); } while (pega(','));
            exige(fim);
            return itens;
        }
        function primario() {
            if (pos >= ts.length) throw new Error('fim inesperado');
            var a = ts[pos];
            if (a.t === 'texto' || a.t === 'num') { pos++; return { t: 'lit', v: a.v }; }
            if (a.t === 'nome') {
                pos++;
                if (a.v === 'true') return { t: 'lit', v: true };
                if (a.v === 'false') return { t: 'lit', v: false };
                if (a.v === 'null') return { t: 'lit', v: null };
                if (a.v === 'undefined') return { t: 'lit', v: undefined };
                return { t: 'id', n: a.v };
            }
            if (pega('(')) { var e = expressao(); exige(')'); return e; }
            if (pega('[')) return { t: 'arr', itens: lista(']') };
            if (pega('{')) {
                var pares = [];
                if (!pega('}')) {
                    do {
                        var k = ts[pos++];
                        if (!k || (k.t !== 'nome' && k.t !== 'texto' && k.t !== 'num')) throw new Error('chave invalida');
                        exige(':');
                        pares.push([String(k.v), expressao()]);
                    } while (pega(','));
                    exige('}');
                }
                return { t: 'obj', pares: pares };
            }
            throw new Error('inesperado: ' + a.v);
        }

        var prog = [];
        while (pos < ts.length) {
            if (pega(';')) continue;
            prog.push(instrucao());
        }
        return prog;
    }
    // </parser>

    /* ---- a CSP esta valendo? ----
       Sem ela o navegador ja roda os on* sozinho, e este arquivo faria cada
       clique acontecer duas vezes. */
    var sonda = document.createElement('div');
    sonda.setAttribute('onclick', 'this.dataset.nativo="1"');
    sonda.click();
    if (sonda.dataset.nativo) return;

    var NATIVA = /\{\s*\[native code\]\s*\}\s*$/;
    var NEGADAS = {};
    ('fetch eval Function setTimeout setInterval clearTimeout clearInterval XMLHttpRequest WebSocket open close print alert ' +
     'confirm prompt importScripts requestAnimationFrame queueMicrotask atob btoa postMessage Worker Blob URL Object Array ' +
     'String Number Boolean Date RegExp JSON Math Promise Proxy Reflect Symbol').split(' ').forEach(function (n) { NEGADAS[n] = true; });

    /* o que da para ler e o que da para chamar a partir de um objeto */
    var LEITURA = {};
    ('value checked files length classList style dataset parentElement parentNode nextElementSibling previousElementSibling ' +
     'target currentTarget key keyCode ctrlKey shiftKey metaKey altKey id disabled name selectedIndex options dataTransfer ' +
     'tagName type').split(' ').forEach(function (n) { LEITURA[n] = true; });
    var METODOS = {};
    ('remove click focus blur select add toggle contains closest querySelector trim stopPropagation preventDefault ' +
     'toLowerCase toUpperCase reset').split(' ').forEach(function (n) { METODOS[n] = true; });
    var GRAVACAO = { value: true, checked: true, disabled: true };

    function funcaoDaTela(nome) {
        if (NEGADAS[nome] || !Object.prototype.hasOwnProperty.call(window, nome)) return undefined;
        var f = window[nome];
        if (typeof f !== 'function' || NATIVA.test(Function.prototype.toString.call(f))) return undefined;
        return f;
    }

    var DOC = { documento: true };
    var JANELA = { janela: true };

    function identificador(n, c) {
        if (n === 'this') return c.el;
        if (n === 'event') return c.ev;
        if (n === 'document') return DOC;
        if (n === 'window') return JANELA;
        return funcaoDaTela(n);
    }

    function ler(o, p) {
        if (o === JANELA) return funcaoDaTela(p);
        if (o === DOC) throw new Error('document.' + p + ' nao permitido');
        if (o instanceof DOMStringMap || o instanceof CSSStyleDeclaration) {
            if (p === 'cssText') throw new Error('cssText nao permitido');
            return o[p];
        }
        if (!LEITURA[p]) throw new Error('propriedade nao permitida: ' + p);
        return o[p];
    }

    function chamar(no, c) {
        var args = no.args.map(function (a) { return valor(a, c); });
        var f = no.f;
        if (f.t === 'id') {
            var fn = identificador(f.n, c);
            if (typeof fn !== 'function' || f.n === 'this' || f.n === 'event') throw new Error('funcao nao permitida: ' + f.n);
            return fn.apply(undefined, args);
        }
        if (f.t === 'membro') {
            var o = valor(f.o, c);
            if (o === null || o === undefined) {
                if (f.opc) return undefined;
                throw new TypeError(f.p + ' de vazio');
            }
            if (o === DOC) {
                if (f.p !== 'getElementById' && f.p !== 'querySelector') throw new Error('document.' + f.p + ' nao permitido');
                return document[f.p].apply(document, args);
            }
            if (o === JANELA) {
                var g = funcaoDaTela(f.p);
                if (!g) throw new Error('funcao nao permitida: ' + f.p);
                return g.apply(undefined, args);
            }
            if (!METODOS[f.p] || typeof o[f.p] !== 'function') throw new Error('metodo nao permitido: ' + f.p);
            return o[f.p].apply(o, args);
        }
        throw new Error('chamada nao permitida');
    }

    function valor(no, c) {
        switch (no.t) {
            case 'lit': return no.v;
            case 'arr': return no.itens.map(function (i) { return valor(i, c); });
            case 'obj': {
                var o = Object.create(null);
                no.pares.forEach(function (par) {
                    if (par[0] !== '__proto__') o[par[0]] = valor(par[1], c);
                });
                return Object.assign({}, o);
            }
            case 'id': return identificador(no.n, c);
            case 'tipo': return typeof valor(no.a, c);
            case 'nao': return !valor(no.a, c);
            case 'neg': return -valor(no.a, c);
            case 'cond': return valor(no.c, c) ? valor(no.a, c) : valor(no.b, c);
            case 'bin': {
                if (no.op === '&&') return valor(no.a, c) && valor(no.b, c);
                if (no.op === '||') return valor(no.a, c) || valor(no.b, c);
                var a = valor(no.a, c), b = valor(no.b, c);
                switch (no.op) {
                    case '===': return a === b;
                    case '!==': return a !== b;
                    case '==': return a == b;   // eslint-disable-line eqeqeq
                    case '!=': return a != b;   // eslint-disable-line eqeqeq
                    case '<': return a < b;
                    case '>': return a > b;
                    case '<=': return a <= b;
                    case '>=': return a >= b;
                    case '+': return a + b;
                    case '-': return a - b;
                    case '*': return a * b;
                    case '/': return a / b;
                }
                throw new Error('operador');
            }
            case 'membro': {
                var alvo = valor(no.o, c);
                if (alvo === null || alvo === undefined) {
                    if (no.opc) return undefined;
                    throw new TypeError(no.p + ' de vazio');
                }
                return ler(alvo, no.p);
            }
            case 'indice': {
                var lista = valor(no.o, c);
                var i = valor(no.i, c);
                if (typeof i !== 'number') throw new Error('indice nao permitido');
                return lista[i];
            }
            case 'chamada': return chamar(no, c);
            case 'atrib': {
                var dono = valor(no.o.o, c);
                var p = no.o.p;
                var livre = dono instanceof CSSStyleDeclaration && p !== 'cssText';
                if (!dono || dono === DOC || dono === JANELA || !(GRAVACAO[p] || livre)) throw new Error('gravacao nao permitida: ' + p);
                dono[p] = valor(no.v, c);
                return dono[p];
            }
        }
        throw new Error('no desconhecido');
    }

    var VOLTOU = {};
    function rodarInstrucao(no, c) {
        if (no.t === 'volta') {
            c.retorno = no.a ? valor(no.a, c) : undefined;
            throw VOLTOU;
        }
        if (no.t === 'se') {
            if (valor(no.c, c)) rodarInstrucao(no.entao, c);
            else if (no.senao) rodarInstrucao(no.senao, c);
            return;
        }
        valor(no, c);
    }

    var cache = new Map();
    function programa(fonte) {
        var p = cache.get(fonte);
        if (p === undefined) {
            try { p = analisar(fonte); } catch (e) { p = null; }
            if (cache.size > 5000) cache.clear();
            cache.set(fonte, p);
        }
        return p;
    }

    /* um ouvinte so para todos: o texto e lido na hora do evento */
    function tratar(ev) {
        var el = ev.currentTarget;
        var atributo = 'on' + ev.type;
        /* el.onclick = ... no JavaScript substitui o atributo, como sempre */
        if (typeof el[atributo] === 'function') return;
        var fonte = el.getAttribute(atributo);
        if (!fonte) return;
        var prog = programa(fonte);
        if (!prog) { console.warn('Tratador fora do formato aceito:', atributo, fonte.slice(0, 120)); return; }
        var c = { el: el, ev: ev, retorno: undefined };
        try {
            prog.forEach(function (i) { rodarInstrucao(i, c); });
        } catch (e) {
            if (e !== VOLTOU) { console.warn('Tratador recusado:', e.message, '|', fonte.slice(0, 120)); return; }
        }
        if (c.retorno === false) ev.preventDefault();
    }

    /* onerror e onload ficam de fora de proposito: a tela nao usa, e sao o
       caminho classico de quem injeta imagem */
    var EVENTOS = ['click', 'dblclick', 'contextmenu', 'change', 'input', 'submit', 'reset', 'focus', 'blur', 'keydown', 'keyup',
                   'keypress', 'mouseover', 'mouseout', 'mousedown', 'mouseup', 'dragstart', 'dragend', 'dragover', 'dragenter',
                   'dragleave', 'drop', 'paste', 'touchstart', 'touchend', 'scroll'];
    var ATRIBUTOS = EVENTOS.map(function (e) { return 'on' + e; });
    var SELETOR = ATRIBUTOS.map(function (a) { return '[' + a + ']'; }).join(',');
    var ligados = new WeakMap();

    function ligar(el) {
        var feitos = ligados.get(el);
        for (var i = 0; i < EVENTOS.length; i++) {
            if (!el.hasAttribute(ATRIBUTOS[i])) continue;
            if (!feitos) { feitos = {}; ligados.set(el, feitos); }
            if (feitos[EVENTOS[i]]) continue;
            feitos[EVENTOS[i]] = true;
            el.addEventListener(EVENTOS[i], tratar);
        }
    }
    function ligarTudo(raiz) {
        if (raiz.nodeType !== 1 && raiz.nodeType !== 9 && raiz.nodeType !== 11) return;
        if (raiz.nodeType === 1) ligar(raiz);
        if (raiz.querySelectorAll) {
            var lista = raiz.querySelectorAll(SELETOR);
            for (var i = 0; i < lista.length; i++) ligar(lista[i]);
        }
    }
    function processar(registros) {
        for (var i = 0; i < registros.length; i++) {
            var r = registros[i];
            if (r.type === 'attributes') ligar(r.target);
            else for (var j = 0; j < r.addedNodes.length; j++) ligarTudo(r.addedNodes[j]);
        }
    }
    var observador = new MutationObserver(processar);
    observador.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ATRIBUTOS });
    ligarTudo(document);
    document.addEventListener('DOMContentLoaded', function () { ligarTudo(document); });

    /* el.click() logo depois do innerHTML acontece antes do observador
       rodar: liga o que estiver pendente antes de disparar */
    var acertar = function () { processar(observador.takeRecords()); };
    var clicar = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function () { acertar(); return clicar.apply(this, arguments); };
    var disparar = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function () { acertar(); return disparar.apply(this, arguments); };

    /* o que a CSP nao cobre: <meta http-equiv=refresh> leva a pessoa para
       outro site, <base> muda para onde os links apontam e <style> redesenha
       a tela. A tela nao usa nenhum deles em HTML montado, entao se aparecer
       e dado que escapou: e so a ultima trava, o escape e o de escapes.js */
    var PERIGO = /<\/?(meta|base|link|style|object|embed|applet)\b[^>]*>?/gi;
    var limpar = function (html) {
        return typeof html === 'string' && /<(meta|base|link|style|object|embed|applet)\b/i.test(html) ? html.replace(PERIGO, '') : html;
    };
    ['innerHTML', 'outerHTML'].forEach(function (nome) {
        var d = Object.getOwnPropertyDescriptor(Element.prototype, nome);
        Object.defineProperty(Element.prototype, nome, {
            configurable: true,
            enumerable: d.enumerable,
            get: d.get,
            set: function (v) { d.set.call(this, limpar(v)); },
        });
    });
    var inserir = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function (posicao, html) { return inserir.call(this, posicao, limpar(html)); };
})();
