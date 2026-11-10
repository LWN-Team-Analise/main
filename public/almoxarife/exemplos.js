// ============================================================
// O SORTEIO DOS EXEMPLOS DOS CAMPOS DO LWN CONTROL
//
// A mesma ideia de core/src/utils/exemplos.js: o HTML e as telas
// continuam com o placeholder fixo de sempre, e aquele texto e a chave
// da lista abaixo. Mudou o placeholder la, mude a chave aqui (sem a
// chave o campo so continua com o texto fixo).
//
// A diferenca: as janelas do Control que moram no HTML nao sao criadas
// de novo a cada abertura, so ganham a classe .active. Por isso, alem
// dos campos novos, o observador sorteia de novo quando uma janela abre.
//
// Minimo de 15 por lista, sempre coerentes com o que o campo pede. CPF
// e telefone nunca sao de verdade: o repositorio e publico.
// ============================================================
(function () {
    'use strict';

    const ex = (...itens) => itens.map((item) => `Ex: ${item}`);

    const FABRICANTES = ['Fluke', 'Testo', 'TSI', 'Vaisala', 'Rotronic', 'Alnor', 'Kimo', 'Dwyer', 'Lighthouse', 'Particle Measuring', 'Instrutherm', 'Minipa', 'Hioki', 'Extech', 'Omega'];

    const MODELOS = ['435-2', 'TSI 9565', 'Testo 405i', 'Testo 625', 'HM70', 'HygroPalm', 'EBT731', 'AccuBalance 8380', 'Solair 3100', 'Lasair III', 'THDL-400', 'ET-4200', 'LX-1108', 'DPM-8', 'Fluke 922'];

    const CARGOS = ['Coordenador', 'Supervisor', 'Analista', 'Técnico de Campo', 'Almoxarife', 'Auxiliar de Almoxarifado', 'Gerente', 'Engenheiro', 'Comprador', 'Assistente', 'Diretor', 'Estagiário', 'Consultor', 'Motorista', 'Especialista'];

    const SIGLAS = ['AIF', 'TMP', 'ANE', 'PRT', 'MAN', 'HUM', 'LUX', 'DEC', 'CAL', 'CNT', 'PAR', 'VAZ', 'FOT', 'TER', 'BAL'];

    const NOMES = ['joao', 'maria', 'ana', 'bruno', 'carla', 'diego', 'elisa', 'fabio', 'gabriela', 'henrique', 'isabela', 'julio', 'karina', 'lucas', 'marina'];

    const TELEFONES = ['(11) 90000-0000', '(21) 90000-0000', '(31) 90000-0000', '(41) 90000-0000', '(51) 90000-0000', '(61) 90000-0000', '(62) 90000-0000', '(71) 90000-0000', '(81) 90000-0000', '(85) 90000-0000', '(19) 90000-0000', '(12) 90000-0000', '(13) 90000-0000', '(16) 90000-0000', '(27) 90000-0000'];

    /* sequencias de mentira: nenhuma fecha os digitos verificadores de um CPF */
    const CPFS = ['123.456.789-00', '111.222.333-00', '222.333.444-00', '333.444.555-00', '444.555.666-00', '555.666.777-00', '666.777.888-00', '777.888.999-00', '100.200.300-00', '200.300.400-00', '300.400.500-00', '400.500.600-00', '500.600.700-00', '600.700.800-00', '700.800.900-00'];

    const SERIES = ['123456', '784512', '330981', '902114', '556230', '417769', '268003', '691542', '845017', '139586', '720364', '482915', '376208', '651479', '908123'];

    const EXEMPLOS = {
        /* ---------------- inventario e ativos ---------------- */
        'Ex: AIF-05': ex('AIF-05', 'TMP-12', 'ANE-03', 'PRT-07', 'MAN-02', 'HUM-09', 'LUX-04', 'DEC-06', 'CAL-11', 'CNT-15', 'PAR-01', 'VAZ-13', 'FOT-05', 'TER-10', 'BAL-08'),
        'AIF-01': ['AIF-01', 'TMP-04', 'ANE-02', 'PRT-11', 'MAN-06', 'HUM-03', 'LUX-09', 'DEC-01', 'CAL-07', 'CNT-05', 'PAR-12', 'VAZ-02', 'FOT-08', 'TER-03', 'BAL-14'],
        'Ex: FLUKE, TESTO': ex('FLUKE, TESTO', 'TSI, Alnor', 'Vaisala, Rotronic', 'Kimo, Dwyer', 'Lighthouse', 'Particle Measuring', 'Instrutherm', 'Minipa', 'Hioki', 'Extech', 'Omega', 'FLUKE', 'TESTO', 'TSI', 'Vaisala'),
        'Ex: Fluke': ex(...FABRICANTES),
        'Ex: 435-2, TSI 9565': ex('435-2, TSI 9565', 'Testo 405i, Testo 625', 'HM70, HygroPalm', 'AccuBalance 8380', 'Solair 3100', 'Lasair III', 'THDL-400', 'ET-4200', 'LX-1108', 'DPM-8', 'Fluke 922', 'EBT731', 'TSI 8380', 'Testo 480', 'Kimo LV 117'),
        'Ex: 435-2': ex(...MODELOS),
        'Ex: SN-92210': ex('SN-92210', 'SN-10457', 'SN-38216', 'SN-77340', 'SN-50129', 'SN-61873', 'SN-24905', 'SN-83562', 'SN-16078', 'SN-49321', 'SN-95014', 'SN-32687', 'SN-70453', 'SN-58196', 'SN-41720'),
        'Ex: 123456': ex(...SERIES),
        'Ex: 4500.00': ex('4500.00', '1200.00', '850.50', '3275.90', '6400.00', '980.00', '12500.00', '2150.75', '7800.00', '560.00', '15900.00', '3400.00', '1890.00', '9200.00', '4120.30'),
        'Código exclusivo desta unidade — ex: CODE01': ['CODE01', 'CODE02', 'CODE07', 'CODE12', 'CODE25', 'TAG1042', 'TAG2087', 'LWN0034', 'LWN0158', 'ALM0091', 'ALM0206', 'INV1500', 'INV1733', 'FER0420', 'FER0912'].map((c) => `Código exclusivo desta unidade — ex: ${c}`),
        'Ex: AIF': ex(...SIGLAS),
        'Ex: AirFlow Meter': ex('AirFlow Meter', 'Termo-higrômetro', 'Contador de Partículas', 'Anemômetro', 'Manômetro Digital', 'Luxímetro', 'Decibelímetro', 'Fotômetro', 'Gerador de Aerossol', 'Data Logger de Temperatura', 'Balômetro', 'Higrômetro de Ponto de Orvalho', 'Analisador de Gases', 'Multímetro', 'Termômetro Padrão'),

        /* ---------------- calibracao e manutencao ---------------- */
        'Ex: Escala, Grupo PWM...': ex('Escala, Grupo PWM...', 'Visomes', 'Elus Instrumentação', 'Instrutemp', 'Metroquality', 'Calibrar Metrologia', 'Lab Padrão', 'Certimetro', 'Aferitec', 'Metrocal', 'Precisão Laboratório', 'Termocal', 'Nova Metrologia', 'Labcal', 'Calibre Certo'),
        'Ex: 15': ex('5', '7', '10', '12', '15', '18', '20', '22', '25', '30', '35', '40', '45', '60', '90'),
        'Ex: Calibração realizada por... (opcional)': ex('Calibração realizada por... (opcional)', 'Certificado emitido pelo laboratório... (opcional)', 'Ajuste feito antes da calibração... (opcional)', 'Sensor de umidade substituído... (opcional)', 'Instrumento aprovado sem ressalvas... (opcional)', 'Desvio dentro da tolerância... (opcional)', 'Calibrado em três pontos... (opcional)', 'Bateria trocada no laboratório... (opcional)', 'Próxima calibração antecipada... (opcional)', 'Calibração acreditada RBC... (opcional)', 'Enviado junto com o estojo... (opcional)', 'Retornou com lacre novo... (opcional)', 'Sonda calibrada em separado... (opcional)', 'Firmware atualizado na calibração... (opcional)', 'Prazo estendido pelo laboratório... (opcional)'),
        'Ex: Fluke Calibração': ex('Fluke Calibração', 'Testo Assistência', 'TSI Serviços', 'Visomes Manutenção', 'Elus Instrumentação', 'Instrutemp Assistência', 'Vaisala Service', 'Metroquality', 'Eletrônica Precisão', 'Assistência Técnica Central', 'Aferitec Reparos', 'Lab Padrão', 'Certimetro Serviços', 'Termocal Manutenção', 'Nova Metrologia'),

        /* ---------------- clientes ---------------- */
        'Ex: Hospital Albert Einstein': ex('Hospital Albert Einstein', 'Hospital Santa Vitória', 'Farmacêutica Boa Saúde', 'Laboratório Vida Plena', 'Indústria Química Horizonte', 'Biotec Nova Era', 'Cosméticos Flor do Campo', 'Alimentos Serra Verde', 'Instituto de Pesquisa Aurora', 'Farma Bem-Estar', 'Hospital Bela Vista', 'Laboratório Santa Clara', 'Vet Farma Campo Aberto', 'Medicamentos Monte Azul', 'Envase Rio Claro'),
        'Ex: Rua das Flores, 100 - Centro': ex('Rua das Flores, 100 - Centro', 'Av. Brasil, 2500 - Jardim América', 'Rua das Palmeiras, 45 - Vila Nova', 'Av. Paulista, 900 - Bela Vista', 'Rua XV de Novembro, 320 - Centro', 'Rod. Castelo Branco, km 26 - Tamboré', 'Rua dos Ipês, 78 - Alphaville', 'Av. Goiás, 1400 - Setor Central', 'Rua Sete de Setembro, 210 - Centro', 'Av. das Nações, 3050 - Distrito Industrial', 'Rua da Indústria, 15 - Polo Empresarial', 'Av. Independência, 660 - Vila Rica', 'Rua Tiradentes, 89 - São José', 'Via Anhanguera, km 104 - Sumaré', 'Rua do Comércio, 501 - Santa Cruz'),

        /* ---------------- usuarios e cargos ---------------- */
        'Ex: João Silva': ex('João Silva', 'Maria Oliveira', 'Ana Souza', 'Bruno Lima', 'Carla Santos', 'Diego Pereira', 'Elisa Costa', 'Fábio Rodrigues', 'Gabriela Almeida', 'Henrique Martins', 'Isabela Ferreira', 'Júlio Ribeiro', 'Karina Gomes', 'Lucas Carvalho', 'Marina Araújo'),
        'Ex: 123.456.789-00': ex(...CPFS),
        'Ex: joao@lwnengenharia.com.br': ex(...NOMES.map((n) => `${n}@lwnengenharia.com.br`)),
        'Ex: (11) 98765-4321': ex(...TELEFONES),
        'Ex: Coordenador': ex(...CARGOS),

        /* ---------------- baias ---------------- */
        'Número/identificador (ex.: 13)': ['13', '1', '2', '5', '7', '9', '11', '14', '18', '21', '24', '27', '30', 'A3', 'B7'].map((n) => `Número/identificador (ex.: ${n})`),
        'Código de bipagem (ex.: BAIA13)': ['BAIA13', 'BAIA02', 'BAIA05', 'BAIA07', 'BAIA09', 'BAIA11', 'BAIA14', 'BAIA18', 'BAIA21', 'BAIA24', 'BAIA27', 'BAIA30', 'BAIAA3', 'BAIAB7', 'BAIAC2'].map((c) => `Código de bipagem (ex.: ${c})`),
        'Código de bipagem (ex.: BAIA01)': ['BAIA01', 'BAIA03', 'BAIA04', 'BAIA06', 'BAIA08', 'BAIA10', 'BAIA12', 'BAIA15', 'BAIA16', 'BAIA19', 'BAIA22', 'BAIA25', 'BAIA28', 'BAIAA1', 'BAIAB4'].map((c) => `Código de bipagem (ex.: ${c})`),

        /* ---------------- ocorrencias ---------------- */
        'Ex.: AIF-02 chegou com a tampa da bateria quebrada e sem o cabo USB.': ['AIF-02 chegou com a tampa da bateria quebrada e sem o cabo USB.', 'TMP-12 está com o visor riscado, mas funcionando.', 'ANE-03 veio sem o estojo de transporte.', 'PRT-07 com a mangueira ressecada em uma das pontas.', 'HUM-09 chegou sem a sonda reserva.', 'LUX-04 com a tampa do sensor solta.', 'DEC-06 com o protetor de espuma rasgado.', 'CNT-15 chegou sem o filtro de purga.', 'PAR-01 com o cabo de força emendado.', 'VAZ-13 com uma trinca na coifa.', 'MAN-02 com o botão liga e desliga falhando.', 'FOT-05 sem o manual e sem o certificado impresso.', 'TER-10 com a ponta da sonda amassada.', 'BAL-08 com uma alça do estojo arrebentada.', 'CAL-11 chegou com pilhas oxidadas.'].map((t) => `Ex.: ${t}`),
        'Ex: ferramenta com defeito, não será usada...': ex('ferramenta com defeito, não será usada...', 'o cliente mudou o escopo da obra...', 'ensaio cancelado nesta OS...', 'já existe outra igual em campo...', 'calibração vence antes do fim da obra...', 'substituída por um modelo mais novo...', 'pedida por engano na solicitação...', 'equipe menor do que o previsto...', 'sala não será ensaiada nesta etapa...', 'precisa ir para manutenção...', 'faltou o acessório para usar...', 'emprestada para outra OS urgente...', 'obra reduzida pelo cliente...', 'instrumento sem certificado válido...', 'não cabe no transporte desta viagem...'),
        'Ex.: não fui a esta obra': ['não fui a esta obra', 'estava de férias no período', 'fui escalado para outra obra', 'participei só do planejamento', 'não faço parte desta equipe', 'a obra é de outro setor', 'estava afastado por atestado', 'não trabalhei nesta etapa', 'já estou como membro desta obra', 'a data não confere com a minha escala', 'a inclusão foi feita por engano', 'fiquei só no escritório', 'não tive atividade nesta proposta', 'estava em treinamento nesses dias', 'quem foi no meu lugar foi outro colega'].map((t) => `Ex.: ${t}`)
    };

    /* o ultimo de cada lista: reabrir nunca repete o que acabou de aparecer */
    const ultimo = new Map();

    function sortear(chave) {
        const candidatos = EXEMPLOS[chave].filter((item) => item !== ultimo.get(chave));
        const item = candidatos[Math.floor(Math.random() * candidatos.length)];
        ultimo.set(chave, item);
        return item;
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
        if (!Array.isArray(EXEMPLOS[chave])) return;
        const novo = sortear(chave);
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

    new MutationObserver((mudancas) => {
        for (const mudanca of mudancas) {
            if (mudanca.type === 'childList') mudanca.addedNodes.forEach((no) => varrer(no, false));
            else if (mudanca.attributeName === 'placeholder') trocar(mudanca.target, false);
            else if (janelaAbriu(mudanca)) varrer(mudanca.target, true);
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
