// ============================================================
// SEM O "CANCELAR" ONDE JA HA O X
//
// Como no Atmosfera LWN: janela com o X no alto nao tem tambem um botao
// "Cancelar" — os dois faziam a mesma coisa. As janelas do LWN Control sao
// montadas por muitas telas diferentes (a maioria pelo proprio JavaScript),
// entao a regra vale para todas aqui, inclusive as que abrem depois:
//
//   - o botao que diz exatamente "Cancelar" ("Cancelar edição" e outros
//     ficam), dentro de uma caixa de janela (.modal-container) que tem o X
//     (.modal-close), some;
//   - o X passa a fazer o que o "Cancelar" fazia — tem janela em que ele
//     tambem desfaz alguma coisa, e nao so fecha —, e ainda o que o X fazia,
//     se a janela continuar aberta depois.
//
// Janela sem o X (a pergunta "Separar sem baia?", por exemplo) continua
// com o "Cancelar": e o unico jeito de sair dela.
// ============================================================
(function () {
    'use strict';

    const CAIXA = '.modal-container, .modal-content';
    const X = '.modal-close';

    const aberta = (el) => Boolean(el) && document.contains(el) && el.offsetParent !== null;

    function arrumar(raiz) {
        if (!raiz || !raiz.querySelectorAll) return;
        raiz.querySelectorAll('button').forEach((botao) => {
            if (botao.dataset.semCancelar || botao.textContent.trim() !== 'Cancelar') return;
            const caixa = botao.closest(CAIXA);
            const x = caixa ? caixa.querySelector(X) : null;
            if (!x || x.contains(botao)) return;
            botao.dataset.semCancelar = '1';
            botao.style.display = 'none';
            const doX = x.onclick;
            x.onclick = function (evento) {
                botao.click();
                if (typeof doX === 'function' && aberta(caixa)) doX.call(this, evento);
            };
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        arrumar(document.body);
        // as janelas que abrem depois (quase todas): cada uma e conferida
        // quando entra na pagina
        new MutationObserver((mudancas) => {
            for (const m of mudancas) {
                m.addedNodes.forEach((no) => {
                    if (no.nodeType === 1) arrumar(no.parentNode || no);
                });
            }
        }).observe(document.body, { childList: true, subtree: true });
    });
})();
