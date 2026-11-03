// ============================================================
// A BARRA DE CIMA DO ATMOSFERA LWN NO ALMOXARIFE
//
// O desenho e o do AppShell do main (estilo-main.css, gerado do CSS de
// la). Este arquivo faz o que os componentes dele fazem:
//
//   - a SAUDACAO: "Ótima tarde, Luis!" (src/utils/pessoa.js);
//   - o ORBE do campo de busca: as duas cascas de pontos que respiram
//     (components/ParticleInterlock), na mesma conta;
//   - a BUSCA: a mesma caixa de resultados (components/Busca), com as
//     setas, o Enter e o Esc. Aqui ela procura no Almoxarife: as abas
//     (com sinonimos, como no main), as O.S. (numero, cliente, obra,
//     responsavel) e as ferramentas (TAG, tipo, numero de serie, modelo).
//     A aba abre; a O.S. abre o historico dela; a ferramenta abre o
//     Inventario ja filtrado pela TAG;
//   - o SINO: os avisos das obras para o setor de quem esta logado e os
//     pedidos de inclusao em obra (GET /api/almox/sininho), com o selo, o
//     "marcar como lido" ao abrir e o Aceitar / Recusar do pedido — as
//     mesmas rotas do main.
// ============================================================
(function () {
    'use strict';

    const eu = (() => { try { return JSON.parse(sessionStorage.getItem('lwn_user') || '{}') || {}; } catch (e) { return {}; } })();
    const token = (() => { try { return (JSON.parse(localStorage.getItem('customers.session') || 'null') || {}).token || null; } catch (e) { return null; } })();

    /* as rotas do main (fora de /api/almox) tambem levam o token */
    function chamarMain(caminho, corpo) {
        return fetch(caminho, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(corpo || {})
        }).then(async (r) => {
            const dados = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(dados.erro || 'Não foi possível completar a operação.');
            return dados;
        });
    }

    const esc = (t) => String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const semAcento = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    /* '2026-11-03T17:31:13.560Z' -> '03/11/2026 14:31' (src/utils/formato.js, dataHora) */
    function dataHora(valor) {
        if (!valor) return '';
        const d = new Date(valor);
        if (isNaN(d)) return '';
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
    }

    // ---------------- a saudacao ----------------

    function saudacao(data = new Date()) {
        const hora = data.getHours();
        if (hora >= 5 && hora < 12) return 'Ótimo dia';
        if (hora >= 12 && hora < 18) return 'Ótima tarde';
        return 'Ótima noite';
    }

    function montarSaudacao() {
        const s = document.querySelector('[data-topo="saudacao"]');
        const n = document.querySelector('[data-topo="nome"]');
        if (s) s.textContent = saudacao();
        if (n) n.textContent = String(eu.nome || '').trim().split(/\s+/)[0] || 'Usuário';
    }

    // ---------------- o orbe (ParticleInterlock) ----------------

    const AUREO = Math.PI * (3 - Math.sqrt(5));

    function casca(quantos) {
        const pontos = [];
        for (let i = 0; i < quantos; i += 1) {
            const y = quantos === 1 ? 0 : 1 - (i / (quantos - 1)) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            const t = AUREO * i;
            pontos.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r });
        }
        return pontos;
    }

    function montarOrbe() {
        const canvas = document.querySelector('#almox-busca .omni__orb');
        if (!canvas) return;
        /* os mesmos parametros do <ParticleInterlock> da Busca do main */
        const tamanho = 26, densidade = 96, pontoTamanho = 112, voltas = 1, velocidade = 50, inclinacao = -0.22;
        const ctx = canvas.getContext('2d');
        const suave = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(tamanho * dpr);
        canvas.height = Math.round(tamanho * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const fora = casca(densidade);
        const dentro = casca(Math.max(8, Math.round(densidade * 0.55)));
        const centro = tamanho / 2;
        const base = centro * 0.86;
        const foco = base * 3;

        const pintar = () => {
            const escuro = document.body.classList.contains('dark-mode');
            const cor = escuro ? '#e8f0ff' : '#1b4386';
            const destaque = escuro ? '#7db4ff' : '#4d8ff0';
            const t = suave ? 0 : (performance.now() / 1000) * (velocidade / 100);
            const sopro = Math.sin(t * 1.7);
            const giro = t * 0.9 + t * voltas * 0.35;
            const todos = [];

            const juntar = (pontos, sentido, escalaRaio, pinta) => {
                const cg = Math.cos(giro * sentido);
                const sg = Math.sin(giro * sentido);
                const ci = Math.cos(inclinacao);
                const si = Math.sin(inclinacao);
                pontos.forEach((p) => {
                    const x = p.x * cg + p.z * sg;
                    const z1 = p.z * cg - p.x * sg;
                    const y = p.y * ci - z1 * si;
                    const z = p.y * si + z1 * ci;
                    todos.push({ x: x * escalaRaio, y: y * escalaRaio, z: z * escalaRaio, pinta });
                });
            };

            juntar(fora, 1, base * (1 - 0.22 * sopro), cor);
            juntar(dentro, -1, base * (0.52 + 0.3 * (1 + sopro) * 0.5), destaque);

            ctx.clearRect(0, 0, tamanho, tamanho);
            todos.sort((a, b) => a.z - b.z);
            todos.forEach((p) => {
                const k = foco / (foco + base - p.z);
                const sx = centro + p.x * k;
                const sy = centro - p.y * k;
                const alfa = 0.3 + 0.7 * ((p.z / base + 1) / 2);
                let r = (tamanho / 100) * (pontoTamanho / 100) * 1.15 * k;
                let a = alfa;
                if (r < 0.3) {
                    a *= (r / 0.3) ** 2;
                    r = 0.3;
                }
                ctx.globalAlpha = Math.max(0, Math.min(1, a));
                ctx.fillStyle = p.pinta;
                ctx.beginPath();
                ctx.arc(sx, sy, r, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            requestAnimationFrame(pintar);
        };
        requestAnimationFrame(pintar);
    }

    // ---------------- a busca ----------------

    /* o que a pessoa pode digitar para achar cada aba — como os ATALHOS
       de src/domain/busca.js */
    const SINONIMOS = {
        dashboard: 'painel geral inicio resumo solicitar solicitacao aprovar aprovacao minhas obras baias quadro',
        conferencia: 'retirada separar separacao conferencia bipar bipagem saida',
        devolutiva: 'devolutiva devolucao devolver retorno prorrogar prorrogacao',
        concluidos: 'os concluidas historico pdf encerradas finalizadas',
        certificados: 'certificados certificado calibracao laudo vencimento',
        localizacao: 'localizacao onde esta baia baias em campo',
        inventario: 'inventario ferramentas ferramenta instrumentos ativos tags cadastro codigo de barras',
        manutencao: 'manutencao conserto avaria avariada reparo',
        remanejamento: 'remanejamento remanejar passar transferir receber enviar',
        calibracao: 'calibracao calibrar vencimento prazo',
        logs: 'logs historico atividade auditoria registros'
    };

    /* o status da O.S. como a tela o le */
    const STATUS_OS = {
        aguardando_aprovacao: 'aguardando aprovação',
        aguardando_conferencia: 'aguardando separação',
        separada: 'separada',
        conferido: 'conferida',
        em_campo: 'em campo',
        prorrogada: 'prorrogada',
        concluida: 'concluída',
        cancelada: 'cancelada',
        reprovada: 'reprovada'
    };

    /* o status da ferramenta como a tela o le */
    const STATUS_FERRAMENTA = {
        disponivel: 'disponível',
        em_campo: 'em campo',
        reservado: 'reservada',
        separado: 'separada',
        avariado: 'avariada',
        em_manutencao: 'em manutenção',
        em_calibracao: 'em calibração',
        inativo: 'inativa'
    };

    const POR_GRUPO = 6;

    function abasVisiveis() {
        return [...document.querySelectorAll('#almox-rail .rail__lista > li')]
            .filter((li) => li.style.display !== 'none' && li.offsetParent !== null)
            .map((li) => li.querySelector('.rail__btn'))
            .filter(Boolean);
    }

    function procurar(termoBruto) {
        const termo = semAcento(termoBruto).trim();
        if (termo.length < 2) return [];
        const palavras = termo.split(/\s+/).filter(Boolean);
        const acha = (texto) => {
            const t = semAcento(texto);
            return palavras.every((p) => t.includes(p));
        };
        const resultados = [];

        // ---- as abas (e a volta ao sistema) ----
        const telas = [];
        abasVisiveis().forEach((btn) => {
            const titulo = (btn.querySelector('.rail__rotulo')?.textContent || btn.title || '').trim();
            const m = (btn.getAttribute('onclick') || '').match(/switchTab\('([^']+)'\)/);
            const aba = m ? m[1] : null;
            if (btn.tagName === 'A') {
                if (acha(`${titulo} sistema principal inicio voltar`)) {
                    telas.push({ id: 'tela-atmosfera', grupo: 'Telas', titulo, detalhe: 'A página inicial do sistema', ir: btn.getAttribute('href') });
                }
                return;
            }
            if (aba && acha(`${titulo} ${SINONIMOS[aba] || ''}`)) {
                telas.push({ id: `tela-${aba}`, grupo: 'Telas', titulo, detalhe: 'Aba do Almoxarife', aba });
            }
        });
        if (acha('configuracoes conta perfil senha foto tema modo noturno escuro claro notificacoes ajustes')) {
            telas.push({ id: 'tela-config', grupo: 'Telas', titulo: 'Configurações', detalhe: 'Conta, senha, tema e notificações', ir: '/core/app/configuracoes' });
        }
        resultados.push(...telas.slice(0, POR_GRUPO));

        const pode = (chave) => typeof usuarioTemPermissao === 'function' && usuarioTemPermissao(chave);

        // ---- as O.S. ----
        const listaOS = (typeof workOrders !== 'undefined' && Array.isArray(workOrders)) ? workOrders : [];
        if (pode('dashboard') || pode('concluidos') || pode('devolutiva') || pode('conferencia')) {
            const achadas = listaOS
                .filter((os) => {
                    const numero = String(os.numero_os || os.id);
                    return acha([`os-${numero.padStart(4, '0')}`, `os ${numero}`, numero, os.cliente, os.obra, os.responsavel].join(' '));
                })
                .sort((a, b) => Number(b.numero_os || b.id) - Number(a.numero_os || a.id))
                .slice(0, POR_GRUPO);
            achadas.forEach((os) => {
                const numero = String(os.numero_os || os.id).padStart(4, '0');
                const status = String(os.status || '').toLowerCase();
                resultados.push({
                    id: `os-${os.id}`,
                    grupo: 'Ordens de serviço',
                    titulo: `OS #${numero} · ${os.cliente || 'sem cliente'}`,
                    detalhe: [os.obra && os.obra !== os.cliente ? os.obra : null, os.responsavel].filter(Boolean).join(' · '),
                    etiqueta: STATUS_OS[status] || status || null,
                    fechada: ['concluida', 'cancelada', 'reprovada'].includes(status),
                    os: os.id
                });
            });
        }

        // ---- as ferramentas ----
        const listaFerr = (typeof instruments !== 'undefined' && Array.isArray(instruments)) ? instruments : [];
        if (pode('instrumentos')) {
            listaFerr
                .filter((f) => acha([f.tag, f.tipo, f.numero_serie, f.modelo, f.fabricante].join(' ')))
                .sort((a, b) => String(a.tag).localeCompare(String(b.tag), 'pt-BR', { numeric: true }))
                .slice(0, POR_GRUPO)
                .forEach((f) => {
                    resultados.push({
                        id: `ferr-${f.id}`,
                        grupo: 'Ferramentas',
                        titulo: f.tag || 'Sem TAG',
                        detalhe: [f.tipo, f.numero_serie ? `nº ${f.numero_serie}` : null].filter(Boolean).join(' · '),
                        etiqueta: f.status ? (STATUS_FERRAMENTA[f.status] || String(f.status).replace(/_/g, ' ')) : null,
                        /* a marca verde (a da obra fechada no main) e a da
                           ferramenta livre; o resto fica na cor de "em uso" */
                        fechada: String(f.status || '') === 'disponivel',
                        tag: f.tag
                    });
                });
        }
        return resultados;
    }

    function montarBusca() {
        const caixa = document.getElementById('almox-busca');
        if (!caixa) return;
        const campo = caixa.querySelector('.omni__campo');
        const lista = caixa.querySelector('.busca__caixa');
        let resultados = [];
        let ativo = -1;
        let aberta = false;

        const desenhar = () => {
            const termo = campo.value.trim();
            const mostrar = aberta && termo.length >= 2;
            lista.hidden = !mostrar;
            campo.setAttribute('aria-expanded', mostrar ? 'true' : 'false');
            if (!mostrar) return;
            if (!resultados.length) {
                lista.innerHTML = `<p class="busca__nada">Nada encontrado para <strong>${esc(termo)}</strong>.</p>`;
                return;
            }
            const grupos = [];
            resultados.forEach((r, i) => {
                const ultimo = grupos[grupos.length - 1];
                if (ultimo && ultimo.nome === r.grupo) ultimo.itens.push([r, i]);
                else grupos.push({ nome: r.grupo, itens: [[r, i]] });
            });
            lista.innerHTML = grupos.map((g) => `
                <section class="busca__grupo">
                    <h3 class="busca__rotulo">${esc(g.nome)}</h3>
                    ${g.itens.map(([r, i]) => `
                        <button type="button" role="option" data-i="${i}" aria-selected="${ativo === i}" class="busca__item${ativo === i ? ' is-ativo' : ''}">
                            <span class="busca__texto"><strong>${esc(r.titulo)}</strong>${r.detalhe ? `<small>${esc(r.detalhe)}</small>` : ''}</span>
                            ${r.etiqueta ? `<span class="busca__marca" data-fechada="${r.fechada ? 'sim' : 'nao'}">${esc(r.etiqueta)}</span>` : ''}
                        </button>`).join('')}
                </section>`).join('');
        };

        const fechar = () => { aberta = false; ativo = -1; desenhar(); };

        const escolher = (item) => {
            fechar();
            campo.value = '';
            campo.blur();
            if (item.ir) { window.location.href = item.ir; return; }
            if (item.aba && typeof switchTab === 'function') { switchTab(item.aba); return; }
            if (item.os && typeof abrirHistoricoOS === 'function') { abrirHistoricoOS(item.os); return; }
            if (item.tag) {
                if (typeof switchTab === 'function') switchTab('inventario');
                const filtro = document.getElementById('inv-search');
                if (filtro) {
                    filtro.value = item.tag;
                    filtro.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        };

        campo.addEventListener('input', () => {
            resultados = procurar(campo.value);
            ativo = -1;
            aberta = true;
            desenhar();
        });
        campo.addEventListener('focus', () => {
            resultados = procurar(campo.value);
            aberta = true;
            desenhar();
        });
        campo.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape') { fechar(); return; }
            if (!aberta || !resultados.length) return;
            if (evento.key === 'ArrowDown') {
                evento.preventDefault();
                ativo = (ativo + 1) % resultados.length;
                desenhar();
            } else if (evento.key === 'ArrowUp') {
                evento.preventDefault();
                ativo = ativo <= 0 ? resultados.length - 1 : ativo - 1;
                desenhar();
            } else if (evento.key === 'Enter') {
                evento.preventDefault();
                escolher(resultados[ativo >= 0 ? ativo : 0]);
            }
        });
        lista.addEventListener('mouseover', (evento) => {
            const b = evento.target.closest('.busca__item');
            if (!b) return;
            const i = Number(b.dataset.i);
            if (i !== ativo) {
                ativo = i;
                lista.querySelectorAll('.busca__item').forEach((x) => {
                    const sim = Number(x.dataset.i) === i;
                    x.classList.toggle('is-ativo', sim);
                    x.setAttribute('aria-selected', sim ? 'true' : 'false');
                });
            }
        });
        lista.addEventListener('click', (evento) => {
            const b = evento.target.closest('.busca__item');
            if (b) escolher(resultados[Number(b.dataset.i)]);
        });
        document.addEventListener('pointerdown', (evento) => {
            if (aberta && !caixa.contains(evento.target)) fechar();
        });
    }

    // ---------------- o sino ----------------

    function montarSininho() {
        const caixa = document.getElementById('almox-sininho');
        if (!caixa) return;
        const botao = caixa.querySelector('.topbar__sino');
        const selo = caixa.querySelector('.sininho__selo');
        const painel = caixa.querySelector('.sininho__painel');
        let dados = { avisos: [], pedidos: [], termoEtapa: 'Etapa' };
        let aberto = false;
        /* o pedido que esta no "Recusar" (motivo aberto) */
        const recusando = new Set();

        const naoLidas = () => dados.avisos.filter((a) => !a.lido).length;

        const atualizarSelo = () => {
            const total = naoLidas() + dados.pedidos.length;
            selo.hidden = total === 0;
            selo.textContent = total > 99 ? '99+' : String(total);
            const partes = [];
            if (naoLidas() > 0) partes.push(`${naoLidas()} não lidas`);
            if (dados.pedidos.length > 0) partes.push(`${dados.pedidos.length} ${dados.pedidos.length === 1 ? 'solicitação' : 'solicitações'}`);
            botao.setAttribute('aria-label', partes.length ? `Notificações — ${partes.join(', ')}` : 'Notificações');
        };

        const pedidoHtml = (p) => {
            const recusa = recusando.has(p.obraId);
            return `
                <li class="sininho__pedido" data-obra="${esc(p.obraId)}">
                    <span class="sininho__marca" data-tipo="${esc(p.obraTipo || '')}" aria-hidden="true"></span>
                    <div class="sininho__corpo">
                        <button type="button" class="sininho__obra" data-ir="${esc(p.obraId)}">Solicitação · ${esc(p.obra)}</button>
                        <div class="pedido" role="group" aria-label="Solicitação de inclusão na obra">
                            <p class="pedido__texto"><strong>${esc(p.incluidoPorNome || 'Alguém')}</strong> incluiu você como membro da obra <strong>${esc(p.obra)}</strong>.</p>
                            ${p.incluidoEm ? `<p class="pedido__quando">${esc(dataHora(p.incluidoEm))}</p>` : ''}
                            ${recusa ? `<label class="pedido__motivo"><span>Motivo da recusa</span><textarea rows="2" maxlength="500" placeholder="Ex.: não fui a esta obra"></textarea></label>` : ''}
                            <p class="pedido__erro" role="alert" hidden></p>
                            <div class="pedido__acoes">
                                ${recusa
                                    ? `<button type="button" class="pedido__botao" data-pedido="voltar">Voltar</button>
                                       <button type="button" class="pedido__botao pedido__botao--recusar" data-pedido="recusar">Recusar inclusão</button>`
                                    : `<button type="button" class="pedido__botao" data-pedido="abrir-recusa">Recusar</button>
                                       <button type="button" class="pedido__botao pedido__botao--aceitar" data-pedido="aceitar">Aceitar</button>`}
                            </div>
                        </div>
                    </div>
                </li>`;
        };

        const avisoHtml = (a) => {
            const setores = (a.setores || []).join(', ');
            const texto = a.mensagem || `Pendência na ${a.etapa}ª ${dados.termoEtapa}.`;
            return `
                <li>
                    <button type="button" class="sininho__item${a.lido ? '' : ' is-nova'}" data-ir="${esc(a.obraId)}">
                        <span class="sininho__marca" data-tipo="${esc(a.obraTipo || '')}" aria-hidden="true"></span>
                        <span class="sininho__corpo">
                            <strong>${esc(a.cliente || 'Obra')}</strong>
                            <span class="sininho__texto">${esc(texto)}</span>
                            <span class="sininho__meta">
                                ${setores ? `<em>para ${esc(setores)}</em>` : ''}
                                ${a.enviadoPorNome ? `<em>por ${esc(a.enviadoPorNome)}</em>` : ''}
                                <em>${esc(dataHora(a.enviadoEm))}</em>
                            </span>
                        </span>
                    </button>
                </li>`;
        };

        const desenhar = () => {
            const lista = dados.avisos.slice(0, 20);
            const pedidos = dados.pedidos;
            painel.innerHTML = `
                <header class="sininho__topo">
                    <h2>Notificações</h2>
                    <span>${dados.avisos.length + pedidos.length}</span>
                </header>
                ${pedidos.length ? `<ul class="sininho__lista sininho__pedidos" aria-label="Solicitações">${pedidos.map(pedidoHtml).join('')}</ul>` : ''}
                ${lista.length
                    ? `<ul class="sininho__lista">${lista.map(avisoHtml).join('')}</ul>`
                    : (pedidos.length ? '' : '<p class="sininho__vazio">Nenhuma notificação pendente.</p>')}`;
        };

        const carregar = () => fetch('/api/almox/sininho', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((resposta) => {
                if (!resposta) return;
                dados = resposta;
                atualizarSelo();
                if (aberto) desenhar();
            })
            .catch(() => { /* o selo volta na proxima leitura */ });

        const abrir = (sim) => {
            aberto = sim;
            painel.hidden = !sim;
            botao.classList.toggle('is-aberto', sim);
            botao.setAttribute('aria-expanded', sim ? 'true' : 'false');
            if (!sim) return;
            desenhar();
            /* abrir o sino e o que zera o selo: os avisos viram lidos */
            const alvos = dados.avisos.filter((a) => !a.lido).map((a) => a.id);
            if (alvos.length) {
                dados.avisos.forEach((a) => { a.lido = true; });
                atualizarSelo();
                chamarMain('/api/dados/avisos/lidos', { ids: alvos }).catch(() => {});
            }
        };

        botao.addEventListener('click', () => abrir(!aberto));
        document.addEventListener('mousedown', (evento) => {
            if (aberto && !caixa.contains(evento.target)) abrir(false);
        });
        document.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape' && aberto) abrir(false);
        });

        painel.addEventListener('click', async (evento) => {
            const ir = evento.target.closest('[data-ir]');
            if (ir) {
                window.location.href = `/core/app/obras/${encodeURIComponent(ir.dataset.ir)}`;
                return;
            }
            const acao = evento.target.closest('[data-pedido]');
            if (!acao) return;
            const li = acao.closest('.sininho__pedido');
            const obraId = li.dataset.obra;
            const erro = li.querySelector('.pedido__erro');
            const tipo = acao.dataset.pedido;
            if (tipo === 'abrir-recusa') {
                recusando.add(obraId);
                desenhar();
                painel.querySelector(`.sininho__pedido[data-obra="${CSS.escape(obraId)}"] textarea`)?.focus();
                return;
            }
            if (tipo === 'voltar') {
                recusando.delete(obraId);
                desenhar();
                return;
            }
            const aceitar = tipo === 'aceitar';
            const motivo = (li.querySelector('textarea')?.value || '').trim();
            if (!aceitar && !motivo) {
                erro.textContent = 'Escreva o motivo da recusa.';
                erro.hidden = false;
                return;
            }
            li.querySelectorAll('.pedido__botao').forEach((b) => { b.disabled = true; });
            acao.textContent = aceitar ? 'Aceitando...' : 'Recusando...';
            try {
                await chamarMain(`/api/dados/obras/${encodeURIComponent(obraId)}/parciais/${encodeURIComponent(eu.id)}/resposta`,
                    aceitar ? { aceitar: true } : { aceitar: false, motivo });
                recusando.delete(obraId);
                dados.pedidos = dados.pedidos.filter((p) => p.obraId !== obraId);
                atualizarSelo();
                desenhar();
            } catch (e) {
                erro.textContent = e.message;
                erro.hidden = false;
                li.querySelectorAll('.pedido__botao').forEach((b) => { b.disabled = false; });
                acao.textContent = aceitar ? 'Aceitar' : 'Recusar inclusão';
            }
        });

        carregar();
        /* como o main, que relê a carga de tempos em tempos */
        setInterval(() => { if (!document.hidden && !aberto) carregar(); }, 60000);
    }

    document.addEventListener('DOMContentLoaded', () => {
        montarSaudacao();
        montarOrbe();
        montarBusca();
        montarSininho();
    });
})();
