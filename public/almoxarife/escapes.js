/* ============================================================
   COMO UM DADO ENTRA NO HTML DO LWN CONTROL

   A tela monta quase tudo com innerHTML, e o que vem do banco (nome de
   ferramenta, de cliente, observacao...) entra no meio do texto. Sem
   escape, um nome como <a href="https://golpe">Clique aqui</a> virava um
   link de verdade na tela de todo mundo. Todo dado passa por um destes
   quatro, conforme o lugar onde ele cai:

     escH(x)  texto ou atributo comum: class="${escH(x)}", <td>${escH(x)}</td>
     escJ(x)  texto entre aspas dentro de um on*: onclick="f('${escJ(x)}')"
     escL(x)  argumento sem aspas dentro de um on*: onclick="f(${escL(x)})"
     escU(x)  endereco de link: href="${escU(x)}"

   Este arquivo e o primeiro da pagina: todos os outros usam estas funcoes.
   ============================================================ */
(function () {
    'use strict';

    var ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

    function escH(valor) {
        return String(valor).replace(/[&<>"'`]/g, function (c) { return ENTIDADES[c]; });
    }

    /* o que precisa de barra para continuar sendo texto dentro das aspas do on* */
    function textoDeScript(valor) {
        return String(valor)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/`/g, '\\`')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n');
    }

    function escJ(valor) {
        return escH(textoDeScript(valor));
    }

    /* numero continua numero, como sempre foi; qualquer outra coisa vira
       texto entre aspas e nao consegue virar codigo */
    function escL(valor) {
        if (typeof valor !== 'string') return escH(valor);
        if (/^-?\d+(\.\d+)?$/.test(valor)) return valor;
        return escH("'" + textoDeScript(valor) + "'");
    }

    /* so endereco do proprio site e arquivo embutido: um link gravado no
       banco nao leva ninguem para outro site */
    function escU(valor) {
        var texto = String(valor).trim();
        var doSite = /^[/#?]/.test(texto) && !/^\/[/\\]/.test(texto);
        var embutido = /^(blob:|data:(image\/(png|jpe?g|gif|webp)|application\/pdf)[;,])/i.test(texto);
        return doSite || embutido ? escH(texto) : '#';
    }

    window.escH = escH;
    window.escJ = escJ;
    window.escL = escL;
    window.escU = escU;
})();
