// ============================================================
// O SORTEIO DOS EXEMPLOS DOS CAMPOS DO LWN CONTROL
//
// A mesma ideia de core/src/utils/exemplos.js: o HTML e as telas
// continuam com o placeholder fixo de sempre, e aquele texto e a chave
// da lista abaixo. Mudou o placeholder la, mude a chave aqui (sem a
// chave o campo so continua com o texto fixo).
//
// EXEMPLOS sao os campos soltos. GRUPOS sao os campos que aparecem
// juntos e precisam combinar (a TAG, a sigla e o ativo dela): o sorteio
// escolhe uma LINHA e cada campo mostra a coluna dele.
//
// A diferenca para o Atmosfera: as janelas do Control que moram no HTML
// nao sao criadas de novo a cada abertura, so ganham a classe .active.
// Por isso, alem dos campos novos, o observador sorteia de novo quando
// uma janela abre.
//
// Minimo de 15 por lista, sempre coerentes com o que o campo pede. CPF
// e telefone nunca sao de verdade: o repositorio e publico.
// ============================================================
(function () {
    'use strict';

    const ex = (...itens) => itens.map((item) => `Ex: ${item}`);

    const CARGOS = ['Coordenador', 'Supervisor', 'Analista', 'Técnico de Campo', 'Almoxarife', 'Auxiliar de Almoxarifado', 'Gerente', 'Engenheiro', 'Comprador', 'Assistente', 'Diretor', 'Estagiário', 'Consultor', 'Motorista', 'Especialista'];

    const TELEFONES = ['(11) 90000-0000', '(21) 90000-0000', '(31) 90000-0000', '(41) 90000-0000', '(51) 90000-0000', '(61) 90000-0000', '(62) 90000-0000', '(71) 90000-0000', '(81) 90000-0000', '(85) 90000-0000', '(19) 90000-0000', '(12) 90000-0000', '(13) 90000-0000', '(16) 90000-0000', '(27) 90000-0000'];

    /* sequencias de mentira: nenhuma fecha os digitos verificadores de um CPF */
    const CPFS = ['123.456.789-00', '111.222.333-00', '222.333.444-00', '333.444.555-00', '444.555.666-00', '555.666.777-00', '666.777.888-00', '777.888.999-00', '100.200.300-00', '200.300.400-00', '300.400.500-00', '400.500.600-00', '500.600.700-00', '600.700.800-00', '700.800.900-00'];

    const EXEMPLOS = {
        /* ---------------- calibracao e manutencao ---------------- */
        'Ex: Escala, Grupo PWM...': ex('Escala, Grupo PWM...', 'Visomes', 'Elus Instrumentação', 'Instrutemp', 'Metroquality', 'Calibrar Metrologia', 'Lab Padrão', 'Certimetro', 'Aferitec', 'Metrocal', 'Precisão Laboratório', 'Termocal', 'Nova Metrologia', 'Labcal', 'Calibre Certo'),
        'Ex: 15': ex('5', '7', '10', '12', '15', '18', '20', '22', '25', '30', '35', '40', '45', '60', '90'),
        'Ex: Calibração realizada por... (opcional)': ex('Calibração realizada por... (opcional)', 'Certificado emitido pelo laboratório... (opcional)', 'Ajuste feito antes da calibração... (opcional)', 'Sensor de umidade substituído... (opcional)', 'Instrumento aprovado sem ressalvas... (opcional)', 'Desvio dentro da tolerância... (opcional)', 'Calibrado em três pontos... (opcional)', 'Bateria trocada no laboratório... (opcional)', 'Próxima calibração antecipada... (opcional)', 'Calibração acreditada RBC... (opcional)', 'Enviado junto com o estojo... (opcional)', 'Retornou com lacre novo... (opcional)', 'Sonda calibrada em separado... (opcional)', 'Firmware atualizado na calibração... (opcional)', 'Prazo estendido pelo laboratório... (opcional)'),
        'Ex: Fluke Calibração': ex('Fluke Calibração', 'Testo Assistência', 'TSI Serviços', 'Visomes Manutenção', 'Elus Instrumentação', 'Instrutemp Assistência', 'Vaisala Service', 'Metroquality', 'Eletrônica Precisão', 'Assistência Técnica Central', 'Aferitec Reparos', 'Lab Padrão', 'Certimetro Serviços', 'Termocal Manutenção', 'Nova Metrologia'),

        /* ---------------- usuarios e cargos ---------------- */
        'Ex: 123.456.789-00': ex(...CPFS),
        'Ex: (11) 98765-4321': ex(...TELEFONES),
        'Ex: Coordenador': ex(...CARGOS),

        /* ---------------- baias ---------------- */
        'Código de bipagem (ex.: BAIA01)': ['BAIA01', 'BAIA03', 'BAIA04', 'BAIA06', 'BAIA08', 'BAIA10', 'BAIA12', 'BAIA15', 'BAIA16', 'BAIA19', 'BAIA22', 'BAIA25', 'BAIA28', 'BAIAA1', 'BAIAB4'].map((c) => `Código de bipagem (ex.: ${c})`),

        /* ---------------- ocorrencias ---------------- */
        'Ex.: AIF-02 chegou com a tampa da bateria quebrada e sem o cabo USB.': ['AIF-02 chegou com a tampa da bateria quebrada e sem o cabo USB.', 'TMP-12 está com o visor riscado, mas funcionando.', 'ANE-03 veio sem o estojo de transporte.', 'POR-07 com a mangueira ressecada em uma das pontas.', 'HUM-09 chegou sem a sonda reserva.', 'LUX-04 com a tampa do sensor solta.', 'DEC-06 com o protetor de espuma rasgado.', 'CNT-15 chegou sem o filtro de purga.', 'PAR-01 com o cabo de força emendado.', 'BAL-13 com uma trinca na coifa.', 'MAN-02 com o botão liga e desliga falhando.', 'FOT-05 sem o manual e sem o certificado impresso.', 'LOG-10 com o conector da sonda amassado.', 'BAL-08 com uma alça do estojo arrebentada.', 'GAS-11 chegou com pilhas oxidadas.'].map((t) => `Ex.: ${t}`),
        'Ex: ferramenta com defeito, não será usada...': ex('ferramenta com defeito, não será usada...', 'o cliente mudou o escopo da obra...', 'ensaio cancelado nesta OS...', 'já existe outra igual em campo...', 'calibração vence antes do fim da obra...', 'substituída por um modelo mais novo...', 'pedida por engano na solicitação...', 'equipe menor do que o previsto...', 'sala não será ensaiada nesta etapa...', 'precisa ir para manutenção...', 'faltou o acessório para usar...', 'emprestada para outra OS urgente...', 'obra reduzida pelo cliente...', 'instrumento sem certificado válido...', 'não cabe no transporte desta viagem...'),
        'Ex.: não fui a esta obra': ['não fui a esta obra', 'estava de férias no período', 'fui escalado para outra obra', 'participei só do planejamento', 'não faço parte desta equipe', 'a obra é de outro setor', 'estava afastado por atestado', 'não trabalhei nesta etapa', 'já estou como membro desta obra', 'a data não confere com a minha escala', 'a inclusão foi feita por engano', 'fiquei só no escritório', 'não tive atividade nesta proposta', 'estava em treinamento nesses dias', 'quem foi no meu lugar foi outro colega'].map((t) => `Ex.: ${t}`)
    };

    /* a mesma ferramenta em todos os campos: TAG, sigla, ativo, fabricante,
       modelo daquele fabricante, numeros de serie, codigo e valor */
    const instrumento = (sigla, ativo, fabricante, modelo, n1, n2, sn, serie, valor) =>
        [`${sigla}-${n1}`, `${sigla}-${n2}`, sigla, ativo, fabricante.toUpperCase(), fabricante, modelo, modelo, sn, serie, `${sigla}${n1}`, valor];

    const GRUPOS = [
        {
            campos: ['Ex: AIF-05', 'AIF-01', 'Ex: AIF', 'Ex: AirFlow Meter', 'Ex: FLUKE, TESTO', 'Ex: Fluke', 'Ex: 435-2, TSI 9565', 'Ex: 435-2', 'Ex: SN-92210', 'Ex: 123456', 'Código exclusivo desta unidade — ex: CODE01', 'Ex: 4500.00'],
            linhas: [
                instrumento('AIF', 'AirFlow Meter', 'TSI', 'TSI 9565', '05', '01', 'SN-92210', '123456', '4500.00'),
                instrumento('TMP', 'Termômetro Padrão', 'Fluke', 'Fluke 1524', '12', '04', 'SN-10457', '784512', '12500.00'),
                instrumento('HUM', 'Termo-higrômetro', 'Vaisala', 'HM70', '09', '03', 'SN-38216', '330981', '6400.00'),
                instrumento('ANE', 'Anemômetro', 'Testo', 'Testo 405i', '03', '02', 'SN-77340', '902114', '1200.00'),
                instrumento('MAN', 'Manômetro Digital', 'Dwyer', 'Dwyer 477', '02', '06', 'SN-50129', '556230', '980.00'),
                instrumento('LUX', 'Luxímetro', 'Instrutherm', 'LD-400', '04', '09', 'SN-61873', '417769', '560.00'),
                instrumento('DEC', 'Decibelímetro', 'Minipa', 'MSL-1352C', '06', '01', 'SN-24905', '268003', '850.50'),
                instrumento('CNT', 'Contador de Partículas', 'Lighthouse', 'Solair 3100', '15', '05', 'SN-83562', '691542', '15900.00'),
                instrumento('PAR', 'Contador Portátil', 'Particle Measuring', 'Lasair III', '01', '12', 'SN-16078', '845017', '9200.00'),
                instrumento('FOT', 'Fotômetro', 'ATI', 'TDA-2G', '05', '08', 'SN-49321', '139586', '7800.00'),
                instrumento('BAL', 'Balômetro', 'Alnor', 'EBT731', '08', '14', 'SN-95014', '720364', '3275.90'),
                instrumento('POR', 'Higrômetro de Ponto de Orvalho', 'Michell', 'Easidew', '07', '03', 'SN-32687', '482915', '3400.00'),
                instrumento('GAS', 'Analisador de Gases', 'Kimo', 'KIGAZ 300', '11', '02', 'SN-70453', '376208', '1890.00'),
                instrumento('MUL', 'Multímetro', 'Hioki', 'DT4256', '13', '07', 'SN-58196', '651479', '2150.75'),
                instrumento('LOG', 'Data Logger de Temperatura', 'Rotronic', 'HL-1D', '10', '02', 'SN-41720', '908123', '4120.30')
            ]
        },
        {
            /* cliente: o nome e o endereco */
            campos: ['Ex: Hospital Albert Einstein', 'Ex: Rua das Flores, 100 - Centro'],
            linhas: [
                ['Hospital Albert Einstein', 'Rua das Flores, 100 - Centro'],
                ['Hospital Santa Vitória', 'Av. Brasil, 2500 - Jardim América'],
                ['Farmacêutica Boa Saúde', 'Av. das Nações, 3050 - Distrito Industrial'],
                ['Laboratório Vida Plena', 'Rua das Palmeiras, 45 - Vila Nova'],
                ['Indústria Química Horizonte', 'Rua da Indústria, 15 - Polo Empresarial'],
                ['Biotec Nova Era', 'Rua dos Ipês, 78 - Alphaville'],
                ['Cosméticos Flor do Campo', 'Rua Sete de Setembro, 210 - Centro'],
                ['Alimentos Serra Verde', 'Rod. Castelo Branco, km 26 - Tamboré'],
                ['Instituto de Pesquisa Aurora', 'Av. Paulista, 900 - Bela Vista'],
                ['Farma Bem-Estar', 'Rua XV de Novembro, 320 - Centro'],
                ['Hospital Bela Vista', 'Av. Independência, 660 - Vila Rica'],
                ['Laboratório Santa Clara', 'Rua Tiradentes, 89 - São José'],
                ['Vet Farma Campo Aberto', 'Via Anhanguera, km 104 - Sumaré'],
                ['Medicamentos Monte Azul', 'Av. Goiás, 1400 - Setor Central'],
                ['Envase Rio Claro', 'Rua do Comércio, 501 - Santa Cruz']
            ]
        },
        {
            /* usuario: o e-mail e o da propria pessoa */
            campos: ['Ex: João Silva', 'Ex: joao@lwnengenharia.com.br'],
            linhas: [
                ['João Silva', 'joao@lwnengenharia.com.br'],
                ['Maria Oliveira', 'maria@lwnengenharia.com.br'],
                ['Ana Souza', 'ana@lwnengenharia.com.br'],
                ['Bruno Lima', 'bruno@lwnengenharia.com.br'],
                ['Carla Santos', 'carla@lwnengenharia.com.br'],
                ['Diego Pereira', 'diego@lwnengenharia.com.br'],
                ['Elisa Costa', 'elisa@lwnengenharia.com.br'],
                ['Fábio Rodrigues', 'fabio@lwnengenharia.com.br'],
                ['Gabriela Almeida', 'gabriela@lwnengenharia.com.br'],
                ['Henrique Martins', 'henrique@lwnengenharia.com.br'],
                ['Isabela Ferreira', 'isabela@lwnengenharia.com.br'],
                ['Júlio Ribeiro', 'julio@lwnengenharia.com.br'],
                ['Karina Gomes', 'karina@lwnengenharia.com.br'],
                ['Lucas Carvalho', 'lucas@lwnengenharia.com.br'],
                ['Marina Araújo', 'marina@lwnengenharia.com.br']
            ]
        },
        {
            /* baia nova: o numero e o codigo de bipagem daquele numero */
            campos: ['Número/identificador (ex.: 13)', 'Código de bipagem (ex.: BAIA13)'],
            linhas: ['13', '2', '5', '7', '9', '11', '14', '18', '21', '24', '27', '30', 'A3', 'B7', 'C2'].map((n) => [n, `BAIA${n.padStart(2, '0')}`])
        }
    ];

    const sortearDe = (lista, anterior) => {
        const candidatos = lista.filter((item) => item !== anterior);
        return candidatos[Math.floor(Math.random() * candidatos.length)];
    };

    /* chave -> em que grupo e em que coluna ela esta */
    const noGrupo = new Map();
    GRUPOS.forEach((grupo) => grupo.campos.forEach((chave, coluna) => noGrupo.set(chave, { grupo, coluna })));

    /* por grupo: a linha da vez e os campos que a estao mostrando */
    const emUso = new Map();

    /* A linha so muda quando nao sobrou nenhum campo dela na tela. Visivel,
       e nao so existente: as janelas do HTML ficam na pagina mesmo fechadas */
    const naTela = (campo) => campo.isConnected && campo.getClientRects().length > 0;

    function linhaDe(grupo, campo) {
        let atual = emUso.get(grupo);
        if (!atual || !atual.campos.some(naTela)) {
            atual = { linha: sortearDe(grupo.linhas, atual && atual.linha), campos: [] };
            emUso.set(grupo, atual);
        }
        atual.campos.push(campo);
        return atual.linha;
    }

    /* o ultimo de cada lista solta: reabrir nunca repete o que acabou de sair */
    const ultimo = new Map();

    function daListaSolta(chave) {
        const item = sortearDe(EXEMPLOS[chave], ultimo.get(chave));
        ultimo.set(chave, item);
        return item;
    }

    /* 'Ex: AIF' com 'TMP' -> 'Ex: TMP'; sem "ex" o valor e o texto todo */
    function naFrase(chave, valor) {
        const marca = /\bex[.:]+\s*/i.exec(chave);
        if (!marca) return valor;
        return chave.slice(0, marca.index + marca[0].length) + valor + (chave.endsWith(')') ? ')' : '');
    }

    const temExemplos = (chave) => noGrupo.has(chave) || Array.isArray(EXEMPLOS[chave]);

    function textoPara(chave, campo) {
        const lugar = noGrupo.get(chave);
        if (!lugar) return daListaSolta(chave);
        return naFrase(chave, linhaDe(lugar.grupo, campo)[lugar.coluna]);
    }

    /* de qual lista veio o campo e o que foi escrito nele. Sem o escrito o
       observador veria a propria troca como um placeholder novo */
    const origem = new WeakMap();
    const escrito = new WeakMap();

    function trocar(campo, deNovo) {
        const atual = campo.getAttribute('placeholder');
        const meu = escrito.get(campo) === atual;
        if (meu && !deNovo) return;
        const chave = meu ? origem.get(campo) : atual;
        if (!temExemplos(chave)) return;
        const novo = textoPara(chave, campo);
        origem.set(campo, chave);
        escrito.set(campo, novo);
        campo.setAttribute('placeholder', novo);
    }

    function varrer(no, deNovo) {
        if (no.nodeType !== Node.ELEMENT_NODE) return;
        if (no.hasAttribute('placeholder')) trocar(no, deNovo);
        no.querySelectorAll('[placeholder]').forEach((campo) => trocar(campo, deNovo));
    }

    function janelaAbriu(mudanca) {
        const janela = mudanca.target;
        return janela.classList.contains('modal-overlay')
            && janela.classList.contains('active')
            && !/(^|\s)active(\s|$)/.test(mudanca.oldValue || '');
    }

    /* A janela abriu e os campos dela voltaram a aparecer: sem isto eles
       contariam como "ainda na tela" e a linha anterior se repetiria. */
    function soltarGrupos(janela) {
        janela.querySelectorAll('[placeholder]').forEach((campo) => {
            const lugar = noGrupo.get(origem.get(campo));
            if (lugar && emUso.has(lugar.grupo)) emUso.get(lugar.grupo).campos = [];
        });
    }

    new MutationObserver((mudancas) => {
        for (const mudanca of mudancas) {
            if (mudanca.type === 'childList') {
                mudanca.addedNodes.forEach((no) => varrer(no, false));
            } else if (mudanca.attributeName === 'placeholder') {
                trocar(mudanca.target, false);
            } else if (janelaAbriu(mudanca)) {
                soltarGrupos(mudanca.target);
                varrer(mudanca.target, true);
            }
        }
    }).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['placeholder', 'class'],
        attributeOldValue: true
    });

    /* os campos que ja estao no HTML quando este arquivo carrega */
    varrer(document.body, false);
})();
