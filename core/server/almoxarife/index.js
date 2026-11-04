/**
 * O ALMOXARIFE — o antigo LWN Control (lwncontrol), agora dentro do
 * Atmosfera LWN.
 *
 * E a API do lwncontrol como ela era (as rotas e as regras da O.S., da
 * bipagem, das baias, do remanejamento...), com estas diferencas:
 *
 *   - as tabelas moram no schema `almox` do banco do main
 *     (db/atualizacao-38.sql.txt). `almox.usuarios` e `almox.clientes`
 *     sao VIEWS sobre `usuario` e `cliente` do main: o Almoxarife usa os
 *     colaboradores e os clientes do sistema, e nao uma copia deles;
 *   - quem entra e o login do main: este router e montado em /api/almox
 *     atras de exigeSessao + ver_almoxarife (server/app.js). As
 *     permissoes de cada pessoa saem do SETOR dela (as chaves almox_* de
 *     src/domain/permissoes.js), lidas pela view almox.usuarios;
 *   - a aba Usuarios, o login, o rosto, o "mantenha-me conectado", a
 *     recuperacao de senha e a entrada com Outlook sairam: o main ja tem
 *     tudo isso;
 *   - o Dashboard PowerBI saiu da tela e virou o painel do Almoxarife no
 *     Dashboard da pagina inicial (GET /painel, no fim deste arquivo);
 *   - a O.S. aprovada que esta ligada a uma obra marca o check "Enviar
 *     OS" da obra (marcarEnviarOS, no fim deste arquivo).
 *
 * A tela continua sendo a do lwncontrol, em public/almoxarife.
 */
import express from 'express'
import crypto from 'node:crypto'
import { pool } from '../db.js'
import * as cache from './cache.js'
import * as push from './push.js'
import * as mail from './email.js'
import { depoisDeMarcar } from '../membrosObra.js'
import { informacaoChegou } from '../semInformacao.js'
import { logger } from '../logger.js'
import { descreverObra, registrarAtividade } from '../atividade.js'
import { cargoPode, meuCargo } from '../sessao.js'

// Lista de colunas de "certificados" SEM a coluna "arquivo" (base64).
// Descoberta uma única vez no catálogo do Postgres, então funciona
// mesmo que a tabela ganhe/perca colunas no futuro.
let _certColunasLeves = null;
async function certColunasLeves() {
    if (_certColunasLeves) return _certColunasLeves;
    const r = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'almox' AND table_name = 'certificados'
           AND column_name <> 'arquivo'
         ORDER BY ordinal_position`
    );
    const cols = r.rows.map((c) => '"' + c.column_name + '"');
    _certColunasLeves =
        (cols.length ? cols.join(", ") : "*") +
        ", (arquivo IS NOT NULL AND length(arquivo) > 0) AS tem_arquivo";
    return _certColunasLeves;
}

/* o nome continua `app` para o resto do arquivo ficar como era no
   lwncontrol: e um Router, montado em /api/almox */
const app = express.Router();

// ============================================================
// O BANCO JÁ TEM O ALMOXARIFE?
//
// O código pode chegar ao ar antes das atualizações 38 e 39 rodarem no
// banco (o schema almox, as views e as permissões). Sem elas toda rota
// daqui quebrava com um 500 sem explicação, e a tela abria vazia dizendo
// que o colaborador não tinha permissão. Agora a resposta diz o que falta.
// Conferido uma vez por instância: depois que o schema existe, não some.
// ============================================================
let bancoPronto = false;
app.use(async (req, res, next) => {
    if (bancoPronto) return next();
    try {
        const r = await pool.query("SELECT to_regclass('almox.usuarios') IS NOT NULL AS ok");
        if (!r.rows[0].ok) {
            logger.error('almox/banco', 'o schema almox nao existe: falta rodar as atualizacoes 38 e 39');
            return res.status(503).json({
                erro: "O banco de dados ainda não tem o Almoxarife: falta rodar as atualizações 38 e 39 (npm run db:atualizar).",
                banco: false,
            });
        }
        bancoPronto = true;
        return next();
    } catch (err) {
        return next(err);
    }
});

// ============================================================
// INVALIDAÇÃO AUTOMÁTICA DE CACHE
// Qualquer escrita (POST/PUT/DELETE) limpa o cache do recurso
// afetado, garantindo que ninguém veja dado velho.
// ============================================================
app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    res.on("finish", () => {
        if (res.statusCode < 200 || res.statusCode >= 400) return;
        // o router esta em /api/almox: aqui o caminho ja chega sem o prefixo
        const m = (req.path || "").match(/^\/([^/]+)/);
        if (!m) return;
        const recurso = m[1];
        cache.invalidar(recurso);
        if (recurso === "solicitacoes" || recurso === "baias") cache.invalidar("baias", "solicitacoes", "ferramentas");
        if (recurso === "certificados" || recurso === "manutencoes") cache.invalidar("ferramentas");
        if (recurso === "remanejamentos" || recurso === "conferencia") cache.invalidar("ferramentas", "solicitacoes");
    });
    next();
});

// ============================================================
// QUEM ESTÁ MEXENDO É QUEM ESTÁ LOGADO
//
// A tela do lwncontrol manda o próprio usuário no corpo das gravações
// ({ usuario: { id, nome, permissoes } }), e a API decidia por ele: sem
// sessão, qualquer um mandava as permissões que quisesse. O corpo continua
// igual, mas o id, o nome, o cargo e as permissões passam a ser os da
// sessão do main.
// ============================================================
app.use(async (req, res, next) => {
    const u = req.body && req.body.usuario;
    if (req.method === "GET" || !u || typeof u !== "object" || Array.isArray(u)) return next();
    try {
        const r = await pool.query("SELECT id, nome, cargo, permissoes FROM almox.usuarios WHERE id = $1", [req.dono.sub]);
        if (r.rows[0]) req.body.usuario = { ...u, ...r.rows[0] };
        return next();
    } catch (err) {
        return next(err);
    }
});

// ============================================================
// AS ROTINAS DE ARRUMAÇÃO
//
// No lwncontrol elas rodavam quando o servidor subia (e a da manutenção,
// de 15 em 15 minutos, num setInterval). Dentro do main não podem rodar ao
// carregar o arquivo: o mesmo processo atende o sistema inteiro, e na
// Vercel um setInterval não sobrevive à resposta. Então rodam na primeira
// chamada ao Almoxarife de cada instância e, depois, de 15 em 15 minutos —
// esperadas antes da resposta, como o resto daqui.
// ============================================================
let arrumadoEm = 0;
let arrumando = null;
app.use(async (req, res, next) => {
    if (Date.now() - arrumadoEm < 15 * 60 * 1000) return next();
    if (!arrumando) {
        const primeira = arrumadoEm === 0;
        arrumando = (async () => {
            if (primeira) {
                await migrarStatusAntigosDaOS();
                await vincularResponsaveisAntigos();
            }
            await sincronizarManutencoesDoDia();
            await limparHistoricoOrfao();
            arrumadoEm = Date.now();
        })().finally(() => { arrumando = null; });
    }
    try { await arrumando; } catch (e) { logger.error('almox/arrumacao', e.message); }
    return next();
});

// ============================================================
// ROTA GET - Listar ferramentas
// ============================================================
app.get("/ferramentas", async (req, res) => {
    return cache.responderComCache(req, res, "ferramentas", "ferramentas:lista", async () => {
        const result = await pool.query("SELECT * FROM almox.ferramentas ORDER BY tag");
        return result.rows;
    });
});

// ============================================================
// ROTA GET - Buscar tipos (para gerar sigla)
// ============================================================
app.get("/ferramentas/tipos", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT DISTINCT tipo, sigla FROM almox.ferramentas WHERE tipo IS NOT NULL ORDER BY tipo"
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTA GET - Buscar sigla por tipo
// ============================================================
app.get("/ferramentas/tipo/:tipo", async (req, res) => {
    console.log("GET /api/ferramentas/tipo/" + req.params.tipo);
    try {
        const { tipo } = req.params;
        // Buscar a sigla do tipo (pega a primeira ferramenta do tipo)
        const result = await pool.query(
            "SELECT tag, tipo FROM almox.ferramentas WHERE tipo = $1 LIMIT 1",
            [tipo]
        );
        
        if (result.rows.length === 0) {
            // Se não encontrou, gerar sigla a partir do nome
            const sigla = tipo.split(' ').map(p => p[0]).join('').toUpperCase().substring(0, 4);
            return res.json({ sigla: sigla });
        }
        
        const tag = result.rows[0].tag;
        const sigla = tag.split('-')[0] || tag;
        
        console.log("OK: Sigla encontrada:", sigla);
        res.json({ sigla: sigla });
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTA POST - Criar ferramenta
// ============================================================
app.post("/ferramentas", async (req, res) => {
    console.log("POST /api/ferramentas");
    console.log("Body:", req.body);
    
    try {
        const { 
            tag, 
            tipo, 
            fabricante, 
            modelo,
            numero_serie, 
            ultima_calibracao, 
            vencimento_calibracao, 
            observacoes,
            sigla,
            categoria_ensaio,
            status,
            valor,
            comprovante_valor,
            data_aquisicao,
            codigo_barras,
            classificacao_lista,
            localizacao_atual,
            baia_id,
            acessorio_ativo
        } = req.body;

        // "tipo" (ativo) NÃO é mais obrigatório: ele pertence à tela de Ativo.
        // Uma ferramenta pode ser cadastrada sem ativo e vinculada depois.
        if (!tag || !fabricante || !numero_serie) {
            return res.status(400).json({
                erro: "Campos obrigatórios: tag, fabricante, numero_serie"
            });
        }

        const existe = await pool.query("SELECT id FROM almox.ferramentas WHERE tag = $1", [tag]);
        if (existe.rows.length > 0) {
            return res.status(409).json({ erro: "TAG já cadastrada: " + tag });
        }

        const codigoBarras = codigo_barras ? String(codigo_barras).trim() : null;
        if (codigoBarras) {
            const codigoEmUso = await pool.query(
                "SELECT tag FROM almox.ferramentas WHERE codigo_barras = $1",
                [codigoBarras]
            );
            if (codigoEmUso.rows.length > 0) {
                return res.status(409).json({ erro: "Código de barras já usado pela TAG " + codigoEmUso.rows[0].tag });
            }
        }

        const result = await pool.query(`
            INSERT INTO almox.ferramentas
            (tag, tipo, fabricante, modelo, numero_serie, status, ultima_calibracao, vencimento_calibracao, observacoes, sigla, categoria_ensaio,
             valor, comprovante_valor, data_aquisicao, codigo_barras, classificacao_lista, localizacao_atual, baia_id, acessorio_ativo)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING *
        `, [
            tag,
            tipo || null,
            fabricante,
            modelo || null,
            numero_serie,
            status || 'disponivel',
            ultima_calibracao || null,
            vencimento_calibracao || null,
            observacoes || null,
            sigla || null,
            categoria_ensaio || null,
            Number(valor) || 0,
            comprovante_valor || null,
            data_aquisicao || null,
            codigoBarras,
            classificacao_lista || null,
            localizacao_atual || 'Almoxarifado',
            baia_id ? parseInt(baia_id) : null,
            acessorio_ativo ? String(acessorio_ativo).trim() : null
        ]);

        // Ativo do tipo "Baia" cadastrado no Inventário: passa a existir como baia
        // em todo o sistema imediatamente, sem nenhuma alteração de código.
        if (tipo && ehTipoBaia(tipo)) {
            await sincronizarBaiasDoInventario(true);
            cache.invalidar("baias");
        }

        console.log("OK: Ferramenta criada ID:", result.rows[0].id);
        res.status(201).json(result.rows[0]);
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ 
            erro: "Erro ao criar ferramenta",
            detalhe: err.message 
        });
    }
});

// ============================================================
// ROTA PUT - Atualizar ferramenta
// ============================================================
// PUT /api/ferramentas/tipo/:tipo/acessorio { acessorio_ativo }
// O "Acessório de ativo" pertence ao ATIVO, não à ferramenta: define com qual
// outro ativo este ativo é unificado (ex.: "Mochila de Campo" acompanha
// "Termoanemômetro"). Aplica a todas as TAGs do ativo, como a classificação.
app.put("/ferramentas/tipo/:tipo/acessorio", async (req, res) => {
    try {
        const tipo = decodeURIComponent(req.params.tipo || "");
        const { acessorio_ativo } = req.body || {};
        if (!tipo) return res.status(400).json({ erro: "Tipo (ativo) não informado" });

        const valor = acessorio_ativo ? String(acessorio_ativo).trim() : null;
        if (valor && valor.toLowerCase() === tipo.toLowerCase()) {
            return res.status(400).json({ erro: "Um ativo não pode ser acessório dele mesmo" });
        }
        if (valor) {
            const existe = await pool.query(
                "SELECT 1 FROM almox.ferramentas WHERE LOWER(tipo) = LOWER($1) LIMIT 1",
                [valor]
            );
            if (!existe.rows.length) {
                return res.status(404).json({ erro: `Ativo "${valor}" não existe no inventário` });
            }
        }

        const r = await pool.query(
            `UPDATE almox.ferramentas
                SET acessorio_ativo = $1, atualizado_em = CURRENT_TIMESTAMP
              WHERE LOWER(tipo) = LOWER($2)
          RETURNING id, tag, tipo, acessorio_ativo`,
            [valor, tipo]
        );

        cache.invalidar("ferramentas");
        res.json({ sucesso: true, tipo, acessorio_ativo: valor, atualizadas: r.rowCount, ferramentas: r.rows });
    } catch (err) {
        console.error("ERRO: PUT /api/ferramentas/tipo/:tipo/acessorio:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// PUT /api/ferramentas/tipo/:tipo/classificacao { classificacao_lista }
// A classificação de lista (HVAC/Gases) é uma propriedade do ATIVO: aplica a todas as TAGs
app.put("/ferramentas/tipo/:tipo/classificacao", async (req, res) => {
    try {
        const tipo = decodeURIComponent(req.params.tipo || "");
        const { classificacao_lista } = req.body || {};
        if (!tipo) return res.status(400).json({ erro: "Tipo (ativo) não informado" });

        const antes = await pool.query(
            `SELECT id, tag, classificacao_lista FROM almox.ferramentas WHERE tipo = $1`,
            [tipo]
        );
        const anteriorPorId = new Map(antes.rows.map(row => [row.id, row.classificacao_lista || null]));

        const nova = classificacao_lista || null;
        const r = await pool.query(
            `UPDATE almox.ferramentas
                SET classificacao_lista = $1, atualizado_em = CURRENT_TIMESTAMP
              WHERE tipo = $2
          RETURNING id, tag, tipo, classificacao_lista`,
            [nova, tipo]
        );

        // Rastreabilidade: um evento por TAG que realmente mudou (cascata do ativo)
        for (const f of r.rows) {
            const anterior = anteriorPorId.get(f.id) ?? null;
            if (anterior === nova) continue;
            try {
                await registrarMovimento({
                    ferramenta_id: f.id,
                    tag: f.tag,
                    tipo: f.tipo,
                    motivo: 'Classificação da lista alterada (por ativo)',
                    observacao: `"${anterior || '— Não classificado —'}" → "${nova || '— Não classificado —'}"`,
                    status: 'confirmado',
                    origem_evento: 'classificacao_lista'
                });
            } catch (e) {
                console.warn("AVISO: Falha ao registrar rastreabilidade de classificação por ativo:", e.message);
            }
        }

        res.json({ atualizadas: r.rowCount, ferramentas: r.rows });
    } catch (err) {
        console.error("ERRO: PUT /api/ferramentas/tipo/:tipo/classificacao:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.put("/ferramentas/:id", async (req, res) => {
    console.log("PUT /api/ferramentas/" + req.params.id);
    console.log("Body:", req.body);
    
    try {
        const { id } = req.params;
        const { 
            tag, 
            tipo, 
            fabricante, 
            modelo,
            numero_serie, 
            status,
            ultima_calibracao, 
            vencimento_calibracao, 
            observacoes,
            sigla,
            categoria_ensaio,
            data_calibracao_agendada,
            novo_vencimento_agendado,
            observacoes_calibracao,
            data_envio_calibracao,
            data_retorno_calibracao,
            valor_calibracao,
            valor,
            comprovante_valor,
            data_aquisicao,
            codigo_barras,
            classificacao_lista,
            localizacao_atual,
            baia_pai_id,
            baia_id,
            acessorio_ativo
        } = req.body;

        // Verificar se a ferramenta existe
        const existe = await pool.query("SELECT id, tag, tipo, classificacao_lista, baia_id, baia_pai_id, localizacao_atual FROM almox.ferramentas WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Ferramenta não encontrada" });
        }
        const ferramentaAntes = existe.rows[0];

        // Verificar se a tag já está em uso (se for diferente)
        if (tag) {
            const tagEmUso = await pool.query(
                "SELECT id FROM almox.ferramentas WHERE tag = $1 AND id != $2",
                [tag, id]
            );
            if (tagEmUso.rows.length > 0) {
                return res.status(409).json({ erro: "TAG já está em uso" });
            }
        }

        // Construir a query dinamicamente
        let updates = [];
        let params = [];
        let paramCount = 1;

        if (tag !== undefined) { updates.push(`tag = $${paramCount++}`); params.push(tag || null); }
        if (tipo !== undefined) { updates.push(`tipo = $${paramCount++}`); params.push(tipo || null); }
        if (fabricante !== undefined) { updates.push(`fabricante = $${paramCount++}`); params.push(fabricante || null); }
        if (modelo !== undefined) { updates.push(`modelo = $${paramCount++}`); params.push(modelo || null); }
        if (numero_serie !== undefined) { updates.push(`numero_serie = $${paramCount++}`); params.push(numero_serie || null); }
        if (status !== undefined) { updates.push(`status = $${paramCount++}`); params.push(status || 'disponivel'); }
        if (ultima_calibracao !== undefined) { updates.push(`ultima_calibracao = $${paramCount++}`); params.push(ultima_calibracao || null); }
        if (vencimento_calibracao !== undefined) { updates.push(`vencimento_calibracao = $${paramCount++}`); params.push(vencimento_calibracao || null); }
        if (observacoes !== undefined) { updates.push(`observacoes = $${paramCount++}`); params.push(observacoes || null); }
        if (sigla !== undefined) { updates.push(`sigla = $${paramCount++}`); params.push(sigla || null); }
        if (categoria_ensaio !== undefined) { updates.push(`categoria_ensaio = $${paramCount++}`); params.push(categoria_ensaio || null); }
        
        // Campos extras para calibração
        if (data_calibracao_agendada !== undefined) { updates.push(`data_calibracao_agendada = $${paramCount++}`); params.push(data_calibracao_agendada || null); }
        if (novo_vencimento_agendado !== undefined) { updates.push(`novo_vencimento_agendado = $${paramCount++}`); params.push(novo_vencimento_agendado || null); }
        if (observacoes_calibracao !== undefined) { updates.push(`observacoes_calibracao = $${paramCount++}`); params.push(observacoes_calibracao || null); }
        if (data_envio_calibracao !== undefined) { updates.push(`data_envio_calibracao = $${paramCount++}`); params.push(data_envio_calibracao || null); }
        if (data_retorno_calibracao !== undefined) { updates.push(`data_retorno_calibracao = $${paramCount++}`); params.push(data_retorno_calibracao || null); }
        if (valor_calibracao !== undefined) { updates.push(`valor_calibracao = $${paramCount++}`); params.push(Number(valor_calibracao) || 0); }

        // Novos campos de inventário
        if (valor !== undefined) { updates.push(`valor = $${paramCount++}`); params.push(Number(valor) || 0); }
        if (comprovante_valor !== undefined) { updates.push(`comprovante_valor = $${paramCount++}`); params.push(comprovante_valor || null); }
        if (data_aquisicao !== undefined) { updates.push(`data_aquisicao = $${paramCount++}`); params.push(data_aquisicao || null); }
        // O `$` destes dois faltava: a query saía com `classificacao_lista = 24`
        // em vez de `classificacao_lista = $24`, gravando o NÚMERO do parâmetro
        // dentro da coluna (e estourando quando o tipo não aceitava).
        if (classificacao_lista !== undefined) { updates.push(`classificacao_lista = $${paramCount++}`); params.push(classificacao_lista || null); }
        if (acessorio_ativo !== undefined) { updates.push(`acessorio_ativo = $${paramCount++}`); params.push(acessorio_ativo || null); }
        if (localizacao_atual !== undefined) { updates.push(`localizacao_atual = $${paramCount++}`); params.push(localizacao_atual || null); }
        if (baia_pai_id !== undefined) { updates.push(`baia_pai_id = $${paramCount++}`); params.push(baia_pai_id ? parseInt(baia_pai_id) : null); }
        if (baia_id !== undefined) { updates.push(`baia_id = $${paramCount++}`); params.push(baia_id ? parseInt(baia_id) : null); }
        if (codigo_barras !== undefined) {
            const cb = codigo_barras ? String(codigo_barras).trim() : null;
            if (cb) {
                const emUso = await pool.query(
                    "SELECT tag FROM almox.ferramentas WHERE codigo_barras = $1 AND id != $2",
                    [cb, id]
                );
                if (emUso.rows.length > 0) {
                    return res.status(409).json({ erro: "Código de barras já usado pela TAG " + emUso.rows[0].tag });
                }
            }
            updates.push(`codigo_barras = $${paramCount++}`);
            params.push(cb);
        }


        if (updates.length === 0) {
            return res.status(400).json({ erro: "Nenhum campo para atualizar" });
        }

        updates.push(`atualizado_em = CURRENT_TIMESTAMP`);
        params.push(id);

        const query = `
            UPDATE almox.ferramentas 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await pool.query(query, params);

        // Rastreabilidade: registra quando a classificação da lista de uma TAG muda
        // (seja por edição individual, seja por sobrescrever o padrão do ativo)
        if (classificacao_lista !== undefined) {
            const anterior = ferramentaAntes.classificacao_lista || null;
            const nova = classificacao_lista || null;
            if (anterior !== nova) {
                try {
                    await registrarMovimento({
                        ferramenta_id: id,
                        tag: ferramentaAntes.tag,
                        tipo: ferramentaAntes.tipo,
                        motivo: 'Classificação da lista alterada',
                        observacao: `"${anterior || '— Não classificado —'}" → "${nova || '— Não classificado —'}"`,
                        status: 'confirmado',
                        origem_evento: 'classificacao_lista'
                    });
                } catch (e) {
                    console.warn("AVISO: Falha ao registrar rastreabilidade de classificação:", e.message);
                }
            }
        }

        // Rastreabilidade da BAIA: guarda em qual baia a TAG estava, quando saiu,
        // para onde foi e quem alterou. O histórico nunca é apagado — cada troca
        // de baia gera um evento novo.
        const ferramentaDepois = result.rows[0] || {};
        const baiaAntesId = ferramentaAntes.baia_id || null;
        const baiaDepoisId = ferramentaDepois.baia_id || null;
        const paiAntesId = ferramentaAntes.baia_pai_id || null;
        const paiDepoisId = ferramentaDepois.baia_pai_id || null;

        if (String(baiaAntesId || '') !== String(baiaDepoisId || '') ||
            String(paiAntesId || '') !== String(paiDepoisId || '')) {
            try {
                const rotulo = await rotulosDeBaia([baiaAntesId, baiaDepoisId], [paiAntesId, paiDepoisId]);
                const origem = rotulo.get('b' + baiaAntesId) || rotulo.get('f' + paiAntesId) || 'Sem baia';
                const destino = rotulo.get('b' + baiaDepoisId) || rotulo.get('f' + paiDepoisId) || 'Sem baia';

                if (baiaAntesId || paiAntesId) {
                    await registrarHistoricoBaia({
                        baia_id: baiaAntesId,
                        baia_ferramenta_id: paiAntesId,
                        baia_rotulo: origem,
                        ferramenta_id: parseInt(id),
                        tag: ferramentaDepois.tag || ferramentaAntes.tag,
                        evento: 'saida_da_baia',
                        origem,
                        destino,
                        usuario: req.body?.responsavel || null
                    });
                }
                if (baiaDepoisId || paiDepoisId) {
                    await registrarHistoricoBaia({
                        baia_id: baiaDepoisId,
                        baia_ferramenta_id: paiDepoisId,
                        baia_rotulo: destino,
                        ferramenta_id: parseInt(id),
                        tag: ferramentaDepois.tag || ferramentaAntes.tag,
                        evento: 'entrada_na_baia',
                        origem,
                        destino,
                        usuario: req.body?.responsavel || null
                    });
                }

                await registrarMovimento({
                    ferramenta_id: parseInt(id),
                    tag: ferramentaDepois.tag || ferramentaAntes.tag,
                    tipo: ferramentaDepois.tipo || ferramentaAntes.tipo,
                    origem,
                    destino,
                    motivo: 'Alteração de baia',
                    responsavel: req.body?.responsavel || null,
                    status: 'confirmado',
                    origem_evento: 'baia'
                });
            } catch (e) {
                console.warn("AVISO: Falha ao registrar histórico de baia:", e.message);
            }
        }

        // Um ativo do tipo "Baia" mudou no Inventário: o estado das baias
        // (e portanto todo o resto do sistema) precisa refletir isso na hora.
        if (ehTipoBaia(ferramentaAntes.tipo) || ehTipoBaia(ferramentaDepois.tipo)) {
            await sincronizarBaiasDoInventario(true);
            cache.invalidar("baias");
        }

        console.log("OK: Ferramenta atualizada ID:", id);
        res.json(result.rows[0]);

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({
            erro: "Erro ao atualizar ferramenta",
            detalhe: err.message
        });
    }
});

// ============================================================
// ROTA DELETE - Excluir ferramenta
// ============================================================
app.delete("/ferramentas/:id", async (req, res) => {
    console.log("DELETE /api/ferramentas/" + req.params.id);
    
    try {
        const { id } = req.params;

        const existe = await pool.query("SELECT id, tag, tipo FROM almox.ferramentas WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Ferramenta não encontrada" });
        }
        const tag = existe.rows[0].tag || '';
        const tipoExcluido = existe.rows[0].tipo || '';

        // Avisa (sem bloquear de forma definitiva) se a ferramenta está referenciada
        // em uma OS ainda não concluída, para evitar registros órfãos por engano.
        if (req.query.forcar !== 'true') {
            const emUso = await pool.query(
                `SELECT numero_os FROM almox.solicitacoes
                  WHERE status <> 'concluida'
                    AND (instrumentos::text ILIKE '%"id":' || $1 || '%'
                         OR ($2 <> '' AND instrumentos::text ILIKE '%' || $2 || '%'))
                  LIMIT 1`,
                [id, tag]
            );
            if (emUso.rows.length) {
                return res.status(409).json({
                    erro: `Ferramenta "${tag}" está vinculada à OS #${emUso.rows[0].numero_os}, que ainda não foi concluída.`,
                    requerConfirmacao: true
                });
            }
        }

        await pool.query("DELETE FROM almox.ferramentas WHERE id = $1", [id]);

        // Excluir uma baia do Inventário faz ela desaparecer do restante do sistema.
        if (ehTipoBaia(tipoExcluido)) {
            await sincronizarBaiasDoInventario(true);
            cache.invalidar("baias");
        }

        console.log("OK: Ferramenta excluída ID:", id);
        res.json({ sucesso: true });

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTAS - CLIENTES
//
// Os clientes sao os do main (tabela `cliente`); a view almox.clientes
// entrega cada um no formato do lwncontrol — nome, abreviacao, cidade,
// uf e ativo. O cliente com unidades (Einstein, Einstein Anapolis...)
// aparece pelas unidades, como nos seletores do main.
//
// A aba Clientes saiu da tela do Almoxarife: quem cadastra e a aba
// Clientes do main. As rotas de gravar continuam (o mesmo contrato do
// lwncontrol), mas so para quem tem `editar_clientes`, a permissao de la.
// Excluir, so o cliente sem obra nem unidade: a exclusao do main apaga as
// obras junto, e isso nao e coisa para o Almoxarife fazer.
// ============================================================

/* " - Sumaré/SP" no fim do nome: o main guarda a cidade e o estado nos
   campos deles, e a tela junta tudo de novo (formatarNomeCliente) */
const semCidadeNoNome = (nome) =>
    String(nome || '').replace(/\s*[-–]\s*[^-–]+\/[A-Za-z]{2}\s*$/, '').trim() || String(nome || '').trim();

async function podeMexerEmCliente(req) {
    return cargoPode(await meuCargo(req.dono.sub), 'editar_clientes');
}

app.get("/clientes", async (req, res) => {
    return cache.responderComCache(req, res, "clientes", "clientes:lista", async () => {
        const result = await pool.query("SELECT * FROM almox.clientes WHERE NOT tem_unidades ORDER BY nome");
        return result.rows;
    });
});

// As obras do main de um cliente — o campo "Obra" da Solicitação de OS.
// A O.S. fica ligada a obra escolhida, e e ela que leva o check "Enviar
// OS" quando a O.S. for aprovada. So as obras abertas (as do quadro): a
// concluida ja saiu de campo e nao marca mais check nenhum.
app.get("/clientes/:id/obras", async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT o.id, o.proposta, o.descricao, o.execucao_inicio, o.execucao_prazo
               FROM obra o
              WHERE o.cliente_id = $1 AND o.concluida_em IS NULL
              ORDER BY o.criado_em DESC`,
            [req.params.id]
        );
        res.json(r.rows.map((o) => ({
            id: o.id,
            proposta: o.proposta || '',
            descricao: o.descricao || '',
            rotulo: [o.proposta, o.descricao].filter(Boolean).join(' — ') || `Obra ${o.id}`,
            execucao_inicio: o.execucao_inicio,
            execucao_prazo: o.execucao_prazo
        })));
    } catch (err) {
        logger.error('almox/clientes-obras', err.message);
        res.status(500).json({ erro: "Erro ao listar as obras do cliente" });
    }
});

app.post("/clientes", async (req, res) => {
    try {
        if (!(await podeMexerEmCliente(req))) {
            return res.status(403).json({ erro: "Seu setor não tem permissão para cadastrar clientes." });
        }
        const { nome, abreviacao, cidade, uf } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ erro: "Nome do cliente é obrigatório" });
        }
        if (!abreviacao || abreviacao.trim() === '') {
            return res.status(400).json({ erro: "Abreviação é obrigatória" });
        }

        const novo = await pool.query(`
            INSERT INTO public.cliente (nome, abreviacao, cidade, estado)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [
            semCidadeNoNome(nome),
            abreviacao.trim().toUpperCase(),
            cidade || null,
            /^[A-Za-z]{2}$/.test(String(uf || '').trim()) ? String(uf).trim().toUpperCase() : null
        ]);
        const result = await pool.query("SELECT * FROM almox.clientes WHERE id = $1", [novo.rows[0].id]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        logger.error('almox/clientes-criar', err.message);
        res.status(500).json({ erro: "Erro ao criar cliente" });
    }
});

app.put("/clientes/:id", async (req, res) => {
    try {
        if (!(await podeMexerEmCliente(req))) {
            return res.status(403).json({ erro: "Seu setor não tem permissão para editar clientes." });
        }
        const { id } = req.params;
        const { nome, abreviacao, cidade, uf } = req.body;

        const existe = await pool.query("SELECT id FROM public.cliente WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Cliente não encontrado" });
        }

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ erro: "Nome do cliente é obrigatório" });
        }
        if (!abreviacao || abreviacao.trim() === '') {
            return res.status(400).json({ erro: "Abreviação é obrigatória" });
        }

        await pool.query(`
            UPDATE public.cliente
               SET nome = $1, abreviacao = $2, cidade = $3, estado = $4
             WHERE id = $5
        `, [
            semCidadeNoNome(nome),
            abreviacao.trim().toUpperCase(),
            cidade || null,
            /^[A-Za-z]{2}$/.test(String(uf || '').trim()) ? String(uf).trim().toUpperCase() : null,
            id
        ]);
        const result = await pool.query("SELECT * FROM almox.clientes WHERE id = $1", [id]);
        res.json(result.rows[0]);
    } catch (err) {
        logger.error('almox/clientes-editar', err.message);
        res.status(500).json({ erro: "Erro ao atualizar cliente" });
    }
});

app.delete("/clientes/:id", async (req, res) => {
    try {
        if (!(await podeMexerEmCliente(req))) {
            return res.status(403).json({ erro: "Excluir cliente é da aba Clientes do sistema (permissão Adicionar / editar clientes)." });
        }
        const { id } = req.params;
        const existe = await pool.query("SELECT id, nome FROM public.cliente WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Cliente não encontrado" });
        }
        const nome = existe.rows[0].nome;
        try {
            await pool.query("DELETE FROM public.cliente WHERE id = $1", [id]);
        } catch (e) {
            if (e.code !== '23503') throw e;
            return res.status(409).json({
                erro: `O cliente "${nome}" tem obras ou unidades no sistema. Exclua pela aba Clientes.`
            });
        }
        res.json({ sucesso: true, mensagem: `Cliente "${nome}" excluído` });
    } catch (err) {
        logger.error('almox/clientes-excluir', err.message);
        res.status(500).json({ erro: "Erro ao excluir cliente" });
    }
});

// ============================================================
// ROTAS - USUÁRIOS
//
// Os colaboradores sao os do main (view almox.usuarios): cadastrar,
// editar, desativar e dar permissao e na aba Usuarios do sistema. Aqui so
// se le — a lista dos seletores (responsavel, quem recebe...) e o
// colaborador logado.
// ============================================================

app.get("/usuarios", async (req, res) => {
    return cache.responderComCache(req, res, "usuarios", "usuarios:lista", async () => {
        const result = await pool.query("SELECT * FROM almox.usuarios ORDER BY nome");
        return result.rows;
    });
});

/* quem esta logado, no formato que o lwncontrol guardava no login
   (sessionStorage 'lwn_user'): e o que public/almoxarife/sessao.js le
   ao abrir a tela */
app.get("/eu", async (req, res) => {
    try {
        /* com a media das obras avaliadas (a view public.usuario_media), que
           o menu lateral do celular mostra embaixo do nome, como no main */
        const r = await pool.query(
            `SELECT u.*, m.media::float AS media, coalesce(m.obras_avaliadas, 0)::int AS obras_avaliadas
               FROM almox.usuarios u
               LEFT JOIN public.usuario_media m ON m.usuario_id = u.id
              WHERE u.id = $1`,
            [req.dono.sub]
        );
        if (!r.rows[0]) return res.status(404).json({ erro: "Usuário não encontrado" });
        res.json(r.rows[0]);
    } catch (err) {
        logger.error('almox/eu', err.message);
        res.status(500).json({ erro: "Erro ao ler o usuário" });
    }
});

app.get("/usuarios/:id", async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM almox.usuarios WHERE id = $1", [req.params.id]);
        if (!r.rows[0]) return res.status(404).json({ erro: "Usuário não encontrado" });
        res.json(r.rows[0]);
    } catch (err) {
        logger.error('almox/usuario', err.message);
        res.status(500).json({ erro: "Erro ao ler o usuário" });
    }
});

// ============================================================
// ROTAS - BAIAS
//
// FONTE OFICIAL DAS BAIAS = INVENTÁRIO.
// Uma baia é uma ferramenta cadastrada no Inventário cujo ativo/tipo é
// "Baia" (ex.: ativo "Baia", TAG "BAIA-01", código de bipagem "BAIA01").
// A tabela `baias` NÃO é mais um cadastro paralelo: ela guarda apenas o
// ESTADO da baia (reserva/ocupação por OS) e é sincronizada a partir do
// Inventário em `sincronizarBaiasDoInventario()`.
//
// Consequências (exigidas pelo negócio):
//  - cadastrar uma baia nova no Inventário faz ela aparecer em todo o
//    sistema, sem tocar em código;
//  - excluir/alterar a baia no Inventário reflete automaticamente;
//  - a bipagem procura o código no Inventário (ferramentas.codigo_barras).
// ============================================================

// Um ativo é "baia" quando o tipo contém a palavra baia — mesma regra usada
// pelo frontend, para nunca divergir entre as duas pontas.
const SQL_TIPO_BAIA = `LOWER(COALESCE(tipo, '')) LIKE '%baia%'`;

function ehTipoBaia(tipo) {
    return String(tipo || '').toLowerCase().includes('baia');
}

// Identificador curto da baia derivado da TAG do Inventário:
// "BAIA-01" -> "01", "BAIA 7" -> "07", "DEPOSITO" -> "DEPOSITO".
function identificadorDaTagBaia(tag) {
    const texto = String(tag || '').trim();
    if (!texto) return null;
    const digitos = texto.replace(/\D/g, '');
    if (digitos) return digitos.length === 1 ? '0' + digitos : digitos.slice(0, 10);
    return texto.toUpperCase().slice(0, 10);
}

let _baiaHistoricoOk = false;
async function garantirTabelaBaiaHistorico() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

// Registra uma movimentação de baia. O histórico NUNCA é apagado quando a
// localização muda — cada alteração vira um novo evento.
// O id de baia que chega da bipagem tem DUAS formas, e só uma é chave da
// tabela "baias":
//
//   "7"    -> baia de verdade, registro da tabela baias
//   "f7"   -> ferramenta-container do Inventário, que faz papel de baia
//
// O "f" existe justamente para as duas não se confundirem. Gravar "f7" como
// baia_id apontaria para a baia 7, que é outra coisa — então o container
// devolve null e a localização fica só no texto.
function _idDeBaiaNumerico(valor) {
    if (valor === null || valor === undefined) return null;
    const t = String(valor).trim();
    if (!/^[0-9]+$/.test(t)) return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
}

async function registrarHistoricoBaia(evt) {
    try {
        await garantirTabelaBaiaHistorico();
        await pool.query(`
            INSERT INTO almox.baia_historico
            (baia_id, baia_ferramenta_id, baia_rotulo, ferramenta_id, tag, evento,
             origem, destino, os_id, numero_os, motivo, observacao, usuario)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [
            evt.baia_id || null,
            evt.baia_ferramenta_id || null,
            evt.baia_rotulo || null,
            evt.ferramenta_id || null,
            evt.tag || null,
            evt.evento || 'movimentacao',
            evt.origem || null,
            evt.destino || null,
            evt.os_id || null,
            evt.numero_os ? String(evt.numero_os) : null,
            evt.motivo || null,
            evt.observacao || null,
            evt.usuario || null
        ]);
    } catch (e) {
        console.warn("AVISO: Falha ao registrar histórico de baia:", e.message);
    }
}

// Rótulo legível de baias a partir dos ids (estado `baias.id` e/ou ferramenta
// do Inventário). Usado para escrever origem/destino no histórico.
async function rotulosDeBaia(baiaIds, ferramentaIds) {
    const mapa = new Map();
    const bIds = (baiaIds || []).map(v => parseInt(v)).filter(v => !isNaN(v));
    const fIds = (ferramentaIds || []).map(v => parseInt(v)).filter(v => !isNaN(v));
    try {
        if (bIds.length) {
            const r = await pool.query(
                `SELECT b.id, COALESCE(f.tag, b.descricao, 'Baia ' || b.identificador) AS rotulo
                   FROM almox.baias b LEFT JOIN almox.ferramentas f ON f.id = b.ferramenta_id
                  WHERE b.id = ANY($1::int[])`,
                [bIds]
            );
            r.rows.forEach(x => mapa.set('b' + x.id, x.rotulo));
        }
        if (fIds.length) {
            const r = await pool.query(`SELECT id, tag FROM almox.ferramentas WHERE id = ANY($1::int[])`, [fIds]);
            r.rows.forEach(x => mapa.set('f' + x.id, x.tag));
        }
    } catch (e) {
        console.warn("AVISO: Falha ao resolver rótulos de baia:", e.message);
    }
    return mapa;
}

// ------------------------------------------------------------
// SINCRONIZAÇÃO INVENTÁRIO -> TABELA DE ESTADO `baias`
// ------------------------------------------------------------
let _ultimaSincBaias = 0;
async function sincronizarBaiasDoInventario(forcar) {
    // Evita repetir a sincronização a cada request em rajada; qualquer escrita
    // (POST/PUT/DELETE de ferramenta ou baia) chama com forcar = true.
    if (!forcar && Date.now() - _ultimaSincBaias < 8000) return;
    _ultimaSincBaias = Date.now();

    try {
        await garantirTabelaBaiaHistorico();

        const inv = await pool.query(
            `SELECT id, tag, tipo, codigo_barras, observacoes
               FROM almox.ferramentas
              WHERE ${SQL_TIPO_BAIA}
              ORDER BY tag`
        );
        const baiasRes = await pool.query(`SELECT * FROM almox.baias`);
        const baias = baiasRes.rows;

        const porFerramenta = new Map();
        const porCodigo = new Map();
        const porIdentificador = new Map();
        baias.forEach(b => {
            if (b.ferramenta_id) porFerramenta.set(String(b.ferramenta_id), b);
            if (b.codigo_barras) porCodigo.set(String(b.codigo_barras).toUpperCase(), b);
            if (b.identificador) porIdentificador.set(String(b.identificador).toUpperCase(), b);
        });

        const vinculadas = new Set();

        for (const f of inv.rows) {
            const identificador = identificadorDaTagBaia(f.tag);
            const codigo = f.codigo_barras ? String(f.codigo_barras).trim() : null;

            let baia = porFerramenta.get(String(f.id))
                || (codigo ? porCodigo.get(codigo.toUpperCase()) : null)
                || (identificador ? porIdentificador.get(String(identificador).toUpperCase()) : null)
                || null;

            // Nunca "rouba" um registro de estado que já pertence a outra ferramenta
            if (baia && baia.ferramenta_id && String(baia.ferramenta_id) !== String(f.id)) baia = null;
            if (baia && vinculadas.has(String(baia.id))) baia = null;

            if (!baia) {
                const criada = await pool.query(
                    `INSERT INTO almox.baias (identificador, descricao, codigo_barras, status, ferramenta_id)
                     VALUES ($1, $2, $3, 'disponivel', $4)
                     RETURNING *`,
                    [identificador, f.tag || `Baia ${identificador}`, codigo, f.id]
                );
                baia = criada.rows[0];
                await registrarHistoricoBaia({
                    baia_id: baia.id,
                    baia_ferramenta_id: f.id,
                    baia_rotulo: f.tag,
                    evento: 'baia_cadastrada',
                    observacao: 'Baia criada a partir do Inventário',
                    destino: f.tag
                });
            } else {
                // Mantém a baia existente em sincronia com o Inventário (código de
                // bipagem, rótulo e reativação) sem perder reserva/ocupação atual.
                const precisaAtualizar =
                    String(baia.ferramenta_id || '') !== String(f.id) ||
                    String(baia.codigo_barras || '') !== String(codigo || '') ||
                    String(baia.descricao || '') !== String(f.tag || '') ||
                    String(baia.identificador || '') !== String(identificador || '') ||
                    baia.status === 'inativa';

                if (precisaAtualizar) {
                    const codigoMudou = String(baia.codigo_barras || '') !== String(codigo || '');
                    const novoStatus = baia.status === 'inativa' ? 'disponivel' : baia.status;
                    const atualizada = await pool.query(
                        `UPDATE almox.baias
                            SET ferramenta_id = $1,
                                codigo_barras = $2,
                                descricao = $3,
                                identificador = $4,
                                status = $5,
                                atualizado_em = CURRENT_TIMESTAMP
                          WHERE id = $6
                      RETURNING *`,
                        [f.id, codigo, f.tag || baia.descricao, identificador || baia.identificador, novoStatus, baia.id]
                    );
                    if (codigoMudou) {
                        await registrarHistoricoBaia({
                            baia_id: baia.id,
                            baia_ferramenta_id: f.id,
                            baia_rotulo: f.tag,
                            evento: 'codigo_alterado',
                            origem: baia.codigo_barras || '—',
                            destino: codigo || '—',
                            observacao: 'Código de bipagem sincronizado a partir do Inventário'
                        });
                    }
                    baia = atualizada.rows[0] || baia;
                }
            }

            vinculadas.add(String(baia.id));

            // A própria ferramenta-baia aponta para o seu registro de estado.
            await pool.query(
                `UPDATE almox.ferramentas SET baia_id = $1 WHERE id = $2 AND (baia_id IS DISTINCT FROM $1)`,
                [baia.id, f.id]
            );
        }

        // Baias que não existem mais no Inventário saem de circulação (sem apagar
        // o registro nem o histórico — só deixam de aparecer).
        for (const b of baias) {
            if (vinculadas.has(String(b.id))) continue;
            if (b.status === 'inativa') continue;
            await pool.query(
                `UPDATE almox.baias SET status = 'inativa', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1`,
                [b.id]
            );
            await registrarHistoricoBaia({
                baia_id: b.id,
                baia_ferramenta_id: b.ferramenta_id,
                baia_rotulo: b.descricao,
                evento: 'baia_inativada',
                observacao: 'Baia não existe mais no Inventário'
            });
        }
    } catch (err) {
        console.warn("AVISO: Falha ao sincronizar baias com o Inventário:", err.message);
    }
}

// SELECT padrão das baias já enriquecido com os dados do Inventário.
const SQL_BAIAS_ATIVAS = `
    SELECT b.id,
           b.identificador,
           COALESCE(f.tag, b.descricao)                AS descricao,
           b.status,
           b.os_id,
           b.data_reserva,
           b.data_liberacao,
           b.data_retorno,
           b.observacoes,
           b.criado_em,
           b.atualizado_em,
           b.ferramenta_id,
           f.tag                                       AS tag,
           f.tipo                                      AS tipo,
           COALESCE(f.codigo_barras, b.codigo_barras)  AS codigo_barras,
           (f.id IS NOT NULL)                          AS do_inventario
      FROM almox.baias b
      LEFT JOIN almox.ferramentas f ON f.id = b.ferramenta_id
`;

app.get("/baias", async (req, res) => {
    await sincronizarBaiasDoInventario();
    const todas = req.query.todas === 'true';
    return cache.responderComCache(req, res, "baias", "baias:lista" + (todas ? ":todas" : ""), async () => {
        const result = await pool.query(
            `${SQL_BAIAS_ATIVAS}
             ${todas ? '' : "WHERE COALESCE(b.status, '') <> 'inativa'"}
             ORDER BY (CASE WHEN b.identificador ~ '^[0-9]+$' THEN b.identificador::INTEGER ELSE 999999 END), b.identificador`
        );
        return result.rows;
    });
});

// Cadastrar uma baia = cadastrar o ativo "Baia" no INVENTÁRIO.
// Continua respondendo em /api/baias para não quebrar a tela "Gerenciar Baias",
// mas o registro nasce no Inventário (fonte oficial) e a tabela de estado é
// derivada dele pela sincronização.
app.post("/baias", async (req, res) => {
    console.log("POST /api/baias");
    try {
        const { identificador, descricao, codigo_barras } = req.body || {};
        if (!identificador || !String(identificador).trim()) {
            return res.status(400).json({ erro: "Identificador é obrigatório" });
        }
        const ident = String(identificador).trim();
        if (ident.length > 10) {
            return res.status(400).json({ erro: "Identificador deve ter no máximo 10 caracteres" });
        }

        const tag = /^[0-9]+$/.test(ident) ? `BAIA-${ident.padStart(2, '0')}` : `BAIA-${ident.toUpperCase()}`;
        const cb = codigo_barras ? String(codigo_barras).trim() : null;

        const tagEmUso = await pool.query("SELECT id FROM almox.ferramentas WHERE UPPER(tag) = UPPER($1)", [tag]);
        if (tagEmUso.rows.length) {
            return res.status(409).json({ erro: `Já existe uma baia com o identificador "${ident}" no Inventário` });
        }
        if (cb) {
            const codigoEmUso = await pool.query("SELECT tag FROM almox.ferramentas WHERE UPPER(codigo_barras) = UPPER($1)", [cb]);
            if (codigoEmUso.rows.length) {
                return res.status(409).json({ erro: `Código de bipagem já usado pela TAG ${codigoEmUso.rows[0].tag}` });
            }
        }

        // Nasce no Inventário — é isso que faz a baia existir no sistema inteiro.
        const ferramenta = await pool.query(`
            INSERT INTO almox.ferramentas (tag, tipo, sigla, fabricante, numero_serie, status, codigo_barras, observacoes, localizacao_atual)
            VALUES ($1, 'Baia', 'BAIA', 'LWN', $2, 'disponivel', $3, $4, 'Almoxarifado')
            RETURNING *
        `, [tag, tag, cb, descricao ? String(descricao).trim() : null]);

        await sincronizarBaiasDoInventario(true);

        const r = await pool.query(`${SQL_BAIAS_ATIVAS} WHERE b.ferramenta_id = $1`, [ferramenta.rows[0].id]);
        cache.invalidar("baias", "ferramentas");
        console.log("OK: Baia cadastrada no Inventário:", tag);
        res.status(201).json(r.rows[0] || { ferramenta: ferramenta.rows[0] });
    } catch (err) {
        console.error("ERRO: ERRO POST /api/baias:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.get("/baias/em-uso", async (req, res) => {
    console.log("GET /api/baias/em-uso");
    try {
        await sincronizarBaiasDoInventario();
        const result = await pool.query(`
            SELECT
                b.id as baia_id,
                COALESCE(f.tag, b.descricao) as baia_descricao,
                b.identificador as baia_identificador,
                b.status as baia_status,
                b.data_reserva,
                b.data_retorno,
                b.data_liberacao,
                s.id as os_id,
                s.numero_os,
                s.cliente,
                s.obra,
                s.data_inicio,
                s.data_fim,
                s.status as os_status
            FROM almox.baias b
            LEFT JOIN almox.ferramentas f ON f.id = b.ferramenta_id
            LEFT JOIN almox.solicitacoes s ON s.id = b.os_id
            WHERE b.status = 'ocupada'
            ORDER BY s.data_inicio ASC,
                     (CASE WHEN b.identificador ~ '^[0-9]+$' THEN b.identificador::INTEGER ELSE 999999 END) ASC
        `);

        console.log("OK: Baias em uso:", result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.get("/baias/historico", async (req, res) => {
    console.log("GET /api/baias/historico");
    try {
        const result = await pool.query(`
            SELECT
                b.id as baia_id,
                COALESCE(f.tag, b.descricao) as baia_descricao,
                b.identificador as baia_identificador,
                b.status as baia_status,
                b.data_reserva,
                b.data_retorno,
                b.data_liberacao,
                s.numero_os,
                s.cliente,
                s.obra,
                s.data_inicio,
                s.data_fim,
                s.status as os_status
            FROM almox.baias b
            LEFT JOIN almox.ferramentas f ON f.id = b.ferramenta_id
            LEFT JOIN almox.solicitacoes s ON s.id = b.os_id
            WHERE b.os_id IS NOT NULL
            ORDER BY b.data_retorno DESC NULLS LAST, b.data_reserva DESC
            LIMIT 50
        `);

        console.log("OK: Histórico baias:", result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// Histórico completo de UMA baia: as OS que a usaram (solicitacoes.baia_id /
// baias_ids / baia_ferramenta_ids) + os eventos de entrada/saída de ferramenta
// registrados em `baia_historico`. Nada é apagado quando a localização muda.
app.get("/baias/:id/historico", async (req, res) => {
    console.log("GET /api/baias/" + req.params.id + "/historico");
    try {
        const { id } = req.params;
        await garantirTabelaBaiaHistorico();
        const baiaRes = await pool.query(`${SQL_BAIAS_ATIVAS} WHERE b.id = $1`, [id]);
        if (!baiaRes.rows.length) return res.status(404).json({ erro: "Baia não encontrada" });
        const baia = baiaRes.rows[0];

        const result = await pool.query(`
            SELECT
                s.id AS os_id,
                s.numero_os,
                s.cliente,
                s.obra,
                s.responsavel,
                s.data_inicio,
                s.data_fim,
                s.status AS os_status,
                s.conferido_em,
                s.conferido_por,
                s.devolvido_em,
                s.devolvido_por
            FROM almox.solicitacoes s
            WHERE s.baia_id = $1
               OR s.baias_ids @> to_jsonb($1::int)
               OR ($2::int IS NOT NULL AND s.baia_ferramenta_ids @> to_jsonb($2::int))
            ORDER BY s.data_inicio DESC NULLS LAST, s.id DESC
            LIMIT 100
        `, [id, baia.ferramenta_id || null]);

        const eventos = await pool.query(`
            SELECT * FROM almox.baia_historico
             WHERE baia_id = $1
                OR ($2::int IS NOT NULL AND baia_ferramenta_id = $2)
             ORDER BY criado_em DESC, id DESC
             LIMIT 300
        `, [id, baia.ferramenta_id || null]);

        res.json({ baia, movimentacoes: result.rows, eventos: eventos.rows });
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// Ferramentas cadastradas nesta baia (fonte oficial: Inventário → TAG →
// ferramentas.baia_id / baia_pai_id). É essa lista, não uma seleção manual,
// que deve ser usada em qualquer tela que precise saber "o que está nesta baia".
app.get("/baias/:id/ferramentas", async (req, res) => {
    console.log("GET /api/baias/" + req.params.id + "/ferramentas");
    try {
        const { id } = req.params;
        const baiaRes = await pool.query(`${SQL_BAIAS_ATIVAS} WHERE b.id = $1`, [id]);
        if (!baiaRes.rows.length) return res.status(404).json({ erro: "Baia não encontrada" });
        const baia = baiaRes.rows[0];

        const result = await pool.query(
            `SELECT * FROM almox.ferramentas
              WHERE (baia_id = $1 OR ($2::int IS NOT NULL AND baia_pai_id = $2))
                AND NOT (${SQL_TIPO_BAIA})
              ORDER BY tag`,
            [id, baia.ferramenta_id || null]
        );

        res.json({ baia, ferramentas: result.rows });
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.put("/baias/:id/liberar", async (req, res) => {
    console.log("PUT /api/baias/" + req.params.id + "/liberar");

    try {
        const { id } = req.params;
        const { data_liberacao, responsavel } = req.body || {};

        const baia = await pool.query("SELECT * FROM almox.baias WHERE id = $1", [id]);
        if (baia.rows.length === 0) {
            return res.status(404).json({ erro: "Baia não encontrada" });
        }

        const result = await pool.query(`
            UPDATE almox.baias
            SET
                os_id = NULL,
                status = 'disponivel',
                data_liberacao = COALESCE($1, CURRENT_DATE),
                data_retorno = COALESCE($1, CURRENT_DATE),
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `, [data_liberacao || null, id]);

        await registrarHistoricoBaia({
            baia_id: parseInt(id),
            baia_ferramenta_id: baia.rows[0].ferramenta_id,
            baia_rotulo: baia.rows[0].descricao,
            evento: 'baia_liberada',
            os_id: baia.rows[0].os_id,
            usuario: responsavel || null
        });

        console.log("OK: Baia liberada ID:", id);
        res.json(result.rows[0]);

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({
            erro: "Erro ao liberar baia",
            detalhe: err.message
        });
    }
});

// Editar a baia altera o registro do INVENTÁRIO (quando existe), e o estado
// da baia acompanha. Assim, nunca há duas verdades sobre o mesmo objeto.
app.put("/baias/:id", async (req, res) => {
    console.log("PUT /api/baias/" + req.params.id);

    try {
        const { id } = req.params;
        const { descricao, identificador, status, codigo_barras, responsavel } = req.body;

        const existe = await pool.query("SELECT * FROM almox.baias WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Baia não encontrada" });
        }
        const antes = existe.rows[0];
        const cb = codigo_barras !== undefined
            ? (codigo_barras ? String(codigo_barras).trim() || null : null)
            : undefined;

        if (antes.ferramenta_id) {
            if (cb !== undefined) {
                if (cb) {
                    const emUso = await pool.query(
                        "SELECT tag FROM almox.ferramentas WHERE UPPER(codigo_barras) = UPPER($1) AND id <> $2",
                        [cb, antes.ferramenta_id]
                    );
                    if (emUso.rows.length) {
                        return res.status(409).json({ erro: `Código de bipagem já usado pela TAG ${emUso.rows[0].tag}` });
                    }
                }
                await pool.query(
                    "UPDATE almox.ferramentas SET codigo_barras = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
                    [cb, antes.ferramenta_id]
                );
            }
            if (descricao !== undefined && descricao) {
                await pool.query(
                    "UPDATE almox.ferramentas SET observacoes = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
                    [String(descricao).trim(), antes.ferramenta_id]
                );
            }
        }

        const result = await pool.query(`
            UPDATE almox.baias
            SET
                descricao = COALESCE($1, descricao),
                identificador = COALESCE($2, identificador),
                status = COALESCE($3, status),
                codigo_barras = CASE WHEN $5::boolean THEN $4 ELSE codigo_barras END,
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
        `, [
            descricao || null,
            identificador || null,
            status || null,
            cb === undefined ? null : cb,
            cb !== undefined,
            id
        ]);

        if (cb !== undefined && String(antes.codigo_barras || '') !== String(cb || '')) {
            await registrarHistoricoBaia({
                baia_id: parseInt(id),
                baia_ferramenta_id: antes.ferramenta_id,
                baia_rotulo: antes.descricao,
                evento: 'codigo_alterado',
                origem: antes.codigo_barras || '—',
                destino: cb || '—',
                usuario: responsavel || null
            });
        }

        cache.invalidar("baias", "ferramentas");
        console.log("OK: Baia atualizada ID:", id);
        res.json(result.rows[0]);

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        if (err.code === '23505') {
            return res.status(409).json({ erro: "Já existe uma baia cadastrada com esse código de barras" });
        }
        res.status(500).json({ erro: err.message });
    }
});

// Excluir a baia remove o ativo do INVENTÁRIO (fonte oficial) e inativa o
// registro de estado — o histórico é preservado.
app.delete("/baias/:id", async (req, res) => {
    console.log("DELETE /api/baias/" + req.params.id);

    try {
        const { id } = req.params;

        const existe = await pool.query("SELECT * FROM almox.baias WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Baia não encontrada" });
        }
        const baia = existe.rows[0];

        if (baia.status === 'ocupada') {
            return res.status(409).json({ erro: "Não é possível excluir uma baia ocupada" });
        }

        const dentro = await pool.query(
            `SELECT COUNT(*)::int AS total FROM almox.ferramentas
              WHERE (baia_id = $1 OR ($2::int IS NOT NULL AND baia_pai_id = $2))
                AND NOT (${SQL_TIPO_BAIA})`,
            [id, baia.ferramenta_id || null]
        );
        if (dentro.rows[0].total > 0 && req.query.forcar !== 'true') {
            return res.status(409).json({
                erro: `Esta baia ainda possui ${dentro.rows[0].total} ferramenta(s) vinculada(s).`,
                requerConfirmacao: true
            });
        }

        // Solta as ferramentas que apontavam para a baia (sem apagar nada delas)
        await pool.query(`UPDATE almox.ferramentas SET baia_id = NULL WHERE baia_id = $1`, [id]);
        if (baia.ferramenta_id) {
            await pool.query(`UPDATE almox.ferramentas SET baia_pai_id = NULL WHERE baia_pai_id = $1`, [baia.ferramenta_id]);
            await pool.query(`DELETE FROM almox.ferramentas WHERE id = $1`, [baia.ferramenta_id]);
        }

        await pool.query(
            "UPDATE almox.baias SET status = 'inativa', ferramenta_id = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE id = $1",
            [id]
        );

        await registrarHistoricoBaia({
            baia_id: parseInt(id),
            baia_ferramenta_id: baia.ferramenta_id,
            baia_rotulo: baia.descricao,
            evento: 'baia_excluida',
            observacao: 'Baia removida do Inventário'
        });

        cache.invalidar("baias", "ferramentas");
        console.log("OK: Baia excluída (Inventário + estado) ID:", id);
        res.json({ sucesso: true });

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// PAINEL GERAL — QUADRO DE BAIAS
//
// Uma chamada só devolve tudo o que a tela precisa: cada baia, a OS que a
// está usando (quando existe), o período correspondente e a última obra de
// onde ela voltou. Sem isso a tela precisaria cruzar /api/baias com a lista
// inteira de solicitações no navegador, e o vínculo baia↔OS mora em três
// campos diferentes (baia_id, baias_ids e baia_ferramenta_ids).
//
// Situação de cada baia:
//   em_campo      -> a OS que a ocupa já está em campo
//   reservada     -> a OS existe mas ainda não saiu (aprovação/separação)
//   no_almoxarife -> nenhuma OS em aberto
// ============================================================
// Ferramentas de uma baia, do jeito que a tela precisa mostrar:
//   - TAG já escolhida na separação -> aparece com a TAG
//   - ainda sem TAG (só quantidade) -> aparece só o ATIVO
// `bipada` é independente disso: diz se a conferência já passou pela TAG.
// Ativos pedidos por quantidade que ainda não viraram TAG entram como ativo.
// Ids de ferramenta citados em `instrumentos` — OS antigas guardam só o número,
// então sem consultar o Inventário o nome do ativo sairia como "Instrumento".
function idsDeFerramentaNaOS(linha) {
    const ids = [];
    jsonArray(linha.instrumentos).forEach(item => {
        const bruto = (item && typeof item === 'object')
            ? (item.ferramenta_id ?? item.id)
            : item;
        if (bruto === null || bruto === undefined) return;
        const n = Number(String(bruto).trim());
        if (Number.isFinite(n)) ids.push(n);
    });
    return ids;
}

function ferramentasDaBaia(linha, catalogo) {
    const porId = catalogo || new Map();
    const bipadas = new Set(
        jsonArray(linha.conferencia)
            .map(c => String((c && c.tag) || '').toUpperCase())
            .filter(Boolean)
    );

    const lista = [];
    const porAtivo = {};   // tipo -> quantas já entraram na lista

    jsonArray(linha.instrumentos).forEach(item => {
        let tag = null;
        let tipo = null;
        let id = null;

        if (item && typeof item === 'object') {
            tag = item.tag ? String(item.tag) : null;
            tipo = item.tipo ? String(item.tipo) : null;
            id = item.ferramenta_id ?? item.id ?? null;
        } else if (item !== null && item !== undefined) {
            const bruto = String(item).trim();
            if (!bruto) return;
            if (/^\d+$/.test(bruto)) id = Number(bruto);
            else tag = bruto;
        }

        // Completa o que faltar com o cadastro da ferramenta
        const doInventario = (id !== null && id !== undefined) ? porId.get(Number(id)) : null;
        if (!tag && doInventario) tag = doInventario.tag || null;
        if (!tipo && doInventario) tipo = doInventario.tipo || null;

        const foiBipada = !!tag && bipadas.has(tag.toUpperCase());
        const nome = tipo || tag || 'Instrumento';
        porAtivo[nome] = (porAtivo[nome] || 0) + 1;

        // A TAG vai junto assim que ela EXISTE (ou seja, desde a separação).
        // `bipada` continua dizendo apenas se a conferência já passou por ela.
        // Antes a TAG só era devolvida depois da bipagem, e o detalhe da baia
        // mostrava "TAG a definir" mesmo com a TAG já escolhida.
        lista.push({
            ativo: nome,
            tag: tag || null,
            bipada: foiBipada
        });
    });

    // Ativos que ainda não têm nenhuma TAG alocada (só a quantidade pedida)
    const quantidades = linha.quantidades && typeof linha.quantidades === 'object'
        && !Array.isArray(linha.quantidades) ? linha.quantidades : {};
    Object.keys(quantidades).forEach(nome => {
        if (!isNaN(Number(nome))) return;
        const pedidas = parseInt(quantidades[nome]) || 0;
        const jaTem = porAtivo[nome] || 0;
        for (let i = jaTem; i < pedidas; i++) {
            lista.push({ ativo: nome, tag: null, bipada: false });
        }
    });

    return lista.sort((a, b) =>
        String(a.ativo).localeCompare(String(b.ativo), 'pt-BR')
        || String(a.tag || '').localeCompare(String(b.tag || ''), 'pt-BR')
    );
}

app.get("/painel/baias", async (req, res) => {
    try {
        await sincronizarBaiasDoInventario();

        const r = await pool.query(`
            SELECT
                b.id,
                b.identificador,
                COALESCE(f.tag, b.descricao)                AS rotulo,
                b.status                                     AS baia_status,
                b.data_reserva,
                b.data_retorno,
                b.data_liberacao,
                s.id                                         AS os_id,
                s.numero_os,
                s.cliente,
                s.obra,
                s.responsavel,
                s.solicitado_por,
                s.data_inicio,
                s.data_fim,
                s.status                                     AS os_status,
                s.observacoes,
                s.aprovado_por,
                s.aprovado_em,
                s.separado_por,
                s.separado_em,
                s.conferido_por,
                s.conferido_em,
                s.instrumentos,
                s.quantidades,
                s.conferencia,
                ult.numero_os                                AS ultima_os,
                ult.cliente                                  AS ultima_obra,
                COALESCE(ult.devolvido_em::date, ult.data_fim) AS voltou_em
            FROM almox.baias b
            LEFT JOIN almox.ferramentas f ON f.id = b.ferramenta_id
            LEFT JOIN LATERAL (
                SELECT s2.*
                  FROM almox.solicitacoes s2
                 WHERE s2.status NOT IN ('concluida', 'cancelada', 'reprovada', 'descontinuada')
                   AND (s2.baia_id = b.id
                        OR s2.baias_ids @> to_jsonb(b.id)
                        OR (b.ferramenta_id IS NOT NULL
                            AND s2.baia_ferramenta_ids @> to_jsonb(b.ferramenta_id)))
                 ORDER BY (s2.id = b.os_id) DESC,
                          s2.data_inicio DESC NULLS LAST,
                          s2.id DESC
                 LIMIT 1
            ) s ON TRUE
            LEFT JOIN LATERAL (
                SELECT s3.numero_os, s3.cliente, s3.data_fim, s3.devolvido_em
                  FROM almox.solicitacoes s3
                 WHERE s3.status IN ('concluida', 'cancelada', 'descontinuada')
                   AND (s3.baia_id = b.id
                        OR s3.baias_ids @> to_jsonb(b.id)
                        OR (b.ferramenta_id IS NOT NULL
                            AND s3.baia_ferramenta_ids @> to_jsonb(b.ferramenta_id)))
                 ORDER BY COALESCE(s3.devolvido_em::date, s3.data_fim) DESC NULLS LAST, s3.id DESC
                 LIMIT 1
            ) ult ON TRUE
            WHERE COALESCE(b.status, '') <> 'inativa'
            ORDER BY (CASE WHEN b.identificador ~ '^[0-9]+$'
                           THEN b.identificador::INTEGER ELSE 999999 END),
                     b.identificador
        `);

        // Uma consulta só resolve o nome/TAG de todas as ferramentas citadas
        // por todas as OS da tela — nada de uma consulta por baia.
        const idsFerramentas = [...new Set(r.rows.flatMap(idsDeFerramentaNaOS))];
        const catalogo = new Map();
        if (idsFerramentas.length) {
            const fs = await pool.query(
                "SELECT id, tag, tipo FROM almox.ferramentas WHERE id = ANY($1::int[])",
                [idsFerramentas]
            );
            fs.rows.forEach(f => catalogo.set(Number(f.id), f));
        }

        const emCampoOS = ['em_campo', 'prorrogada'];
        const hoje = hojeISO();
        const baias = r.rows.map(linha => {
            const osStatus = String(linha.os_status || '').toLowerCase().trim();
            let situacao = 'no_almoxarife';
            if (linha.os_id) situacao = emCampoOS.includes(osStatus) ? 'em_campo' : 'reservada';

            // Em campo com o período já vencido = a devolutiva está atrasada.
            // Continua contando como "em campo" nos cartões-filtro; o que muda
            // é o rótulo na tabela, que passa a ser "Devolução".
            const fimISO = linha.data_fim
                ? new Date(linha.data_fim).toISOString().slice(0, 10)
                : null;
            const atrasada = situacao === 'em_campo' && !!fimISO && fimISO < hoje;

            return {
                id: linha.id,
                identificador: linha.identificador,
                rotulo: linha.rotulo,
                situacao,
                atrasada,
                baia_status: linha.baia_status,
                os: linha.os_id ? {
                    id: linha.os_id,
                    numero_os: linha.numero_os,
                    cliente: linha.cliente,
                    obra: linha.obra,
                    responsavel: linha.responsavel,
                    solicitado_por: linha.solicitado_por,
                    data_inicio: linha.data_inicio,
                    data_fim: linha.data_fim,
                    status: linha.os_status,
                    observacoes: linha.observacoes,
                    aprovado_por: linha.aprovado_por,
                    aprovado_em: linha.aprovado_em,
                    separado_por: linha.separado_por,
                    separado_em: linha.separado_em,
                    conferido_por: linha.conferido_por,
                    conferido_em: linha.conferido_em,
                    ferramentas: ferramentasDaBaia(linha, catalogo)
                } : null,
                // Para a baia parada: desde quando ela está no almoxarifado.
                // Preferimos a devolução da última obra; sem ela, a data em que
                // a baia foi liberada.
                voltou_em: linha.voltou_em || linha.data_retorno || linha.data_liberacao || null,
                ultima_os: linha.ultima_os || null,
                ultima_obra: linha.ultima_obra || null,
                data_reserva: linha.data_reserva
            };
        });

        res.json({
            baias,
            resumo: {
                total: baias.length,
                em_campo: baias.filter(b => b.situacao === 'em_campo').length,
                disponiveis: baias.filter(b => b.situacao === 'no_almoxarife').length,
                reservadas: baias.filter(b => b.situacao === 'reservada').length
            }
        });
    } catch (err) {
        console.error("ERRO: GET /api/painel/baias:", err.message);
        res.status(500).json({ erro: err.message });
    }
});


// Resolve um código bipado para uma BAIA usando o INVENTÁRIO como fonte.
// Retorna { baia, ferramenta } ou null.
async function resolverBaiaPorCodigo(codigo) {
    const texto = String(codigo || '').trim();
    if (!texto) return null;

    await sincronizarBaiasDoInventario();

    // 1) INVENTÁRIO: ativo tipo "Baia" com esse código de bipagem / TAG / série
    const inv = await pool.query(
        `SELECT * FROM almox.ferramentas
          WHERE ${SQL_TIPO_BAIA}
            AND (UPPER(COALESCE(codigo_barras, '')) = UPPER($1)
                 OR UPPER(COALESCE(tag, '')) = UPPER($1)
                 OR UPPER(COALESCE(numero_serie, '')) = UPPER($1))
          LIMIT 1`,
        [texto]
    );

    if (inv.rows.length) {
        const ferramenta = inv.rows[0];
        let r = await pool.query(`${SQL_BAIAS_ATIVAS} WHERE b.ferramenta_id = $1`, [ferramenta.id]);
        if (!r.rows.length) {
            // Inventário tem a baia mas o estado ainda não existia: cria agora.
            await sincronizarBaiasDoInventario(true);
            r = await pool.query(`${SQL_BAIAS_ATIVAS} WHERE b.ferramenta_id = $1`, [ferramenta.id]);
        }
        if (r.rows.length) return { baia: r.rows[0], ferramenta };
    }

    // 2) Compatibilidade: baias antigas que ainda não têm ativo no Inventário
    //    (identificador "01".."12" ou código gravado só na tabela de estado).
    const legado = await pool.query(
        `${SQL_BAIAS_ATIVAS}
          WHERE COALESCE(b.status, '') <> 'inativa'
            AND (UPPER(COALESCE(f.codigo_barras, b.codigo_barras, '')) = UPPER($1)
                 OR UPPER(COALESCE(b.identificador::TEXT, '')) = UPPER($1)
                 OR UPPER(COALESCE(f.tag, '')) = UPPER($1))
          LIMIT 1`,
        [texto]
    );
    if (legado.rows.length) return { baia: legado.rows[0], ferramenta: null };

    return null;
}


// ============================================================
// HELPERS - MÚLTIPLAS BAIAS POR OS
// ============================================================
function normalizarBaiasIds(baias_ids, baia_id) {
    let lista = baias_ids;
    if (typeof lista === 'string') {
        try { lista = JSON.parse(lista); } catch (e) { lista = null; }
    }
    if (!Array.isArray(lista)) lista = [];
    if (!lista.length && baia_id) lista = [baia_id];
    const unicos = [];
    lista.forEach(v => {
        const n = parseInt(v);
        if (!isNaN(n) && !unicos.includes(n)) unicos.push(n);
    });
    return unicos;
}

async function sincronizarBaiasDaOS(osId, listaBaias, dataInicio) {
    // Rastreabilidade: registra quais baias saíram e quais entraram nesta OS
    const liberadas = await pool.query(
        `SELECT id, ferramenta_id, descricao FROM almox.baias WHERE os_id = $1 AND NOT (id = ANY($2::int[]))`,
        [osId, listaBaias]
    );
    for (const b of liberadas.rows) {
        await registrarHistoricoBaia({
            baia_id: b.id,
            baia_ferramenta_id: b.ferramenta_id,
            baia_rotulo: b.descricao,
            evento: 'os_desvinculada',
            os_id: osId
        });
    }

    // Libera as baias que não pertencem mais à OS
    await pool.query(`
        UPDATE almox.baias
        SET os_id = NULL,
            status = 'disponivel',
            data_retorno = CURRENT_DATE,
            data_liberacao = CURRENT_DATE,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE os_id = $1 AND NOT (id = ANY($2::int[]))
    `, [osId, listaBaias]);

    for (const baiaId of listaBaias) {
        const ocupada = await pool.query(`
            SELECT id FROM almox.baias
            WHERE id = $1 AND status = 'ocupada' AND os_id IS NOT NULL AND os_id != $2
        `, [baiaId, osId]);
        if (ocupada.rows.length > 0) {
            console.warn("AVISO: Baia já ocupada por outra OS:", baiaId);
            continue;
        }
        const antesVinculo = await pool.query(`SELECT os_id, ferramenta_id, descricao FROM almox.baias WHERE id = $1`, [baiaId]);
        await pool.query(`
            UPDATE almox.baias
            SET os_id = $1,
                status = 'ocupada',
                data_reserva = COALESCE($2, CURRENT_DATE),
                data_retorno = NULL,
                data_liberacao = NULL,
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [osId, dataInicio || null, baiaId]);
        if (String(antesVinculo.rows[0]?.os_id || '') !== String(osId)) {
            await registrarHistoricoBaia({
                baia_id: baiaId,
                baia_ferramenta_id: antesVinculo.rows[0]?.ferramenta_id,
                baia_rotulo: antesVinculo.rows[0]?.descricao,
                evento: 'os_vinculada',
                os_id: osId
            });
        }
    }
}

// ============================================================
// LIMPEZA DE HISTÓRICO ÓRFÃO
//
// Antes de a exclusão de OS passar a apagar o rastro junto, sobraram eventos
// apontando para OS que não existem mais — e a ferramenta continuava dizendo
// que participou de uma OS excluída. Esta rotina roda uma vez na subida e
// remove SOMENTE o que referencia uma OS inexistente.
// ============================================================
async function limparHistoricoOrfao() {
    try {
        const osHist = await pool.query(`
            DELETE FROM almox.os_historico h
             WHERE h.solicitacao_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM almox.solicitacoes s WHERE s.id = h.solicitacao_id)
        `);

        const baiaHist = await pool.query(`
            DELETE FROM almox.baia_historico b
             WHERE b.os_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM almox.solicitacoes s WHERE s.id = b.os_id)
        `);

        // Movimentações: a OS é referenciada por NÚMERO (texto).
        const movimentos = await pool.query(`
            DELETE FROM almox.remanejamentos r
             WHERE (r.os_destino IS NOT NULL AND r.os_destino <> ''
                    AND NOT EXISTS (SELECT 1 FROM almox.solicitacoes s
                                     WHERE s.numero_os::text = r.os_destino OR s.id::text = r.os_destino))
                OR (r.os_origem IS NOT NULL AND r.os_origem <> ''
                    AND NOT EXISTS (SELECT 1 FROM almox.solicitacoes s
                                     WHERE s.numero_os::text = r.os_origem OR s.id::text = r.os_origem))
        `);

        // Ferramentas presas em "avariado" por causa de uma OS que já não
        // existe: continuavam listadas em "Necessita manutenção" para sempre.
        // Só são liberadas as que NÃO têm manutenção em aberto e NÃO aparecem
        // em nenhuma OS viva — quem tem avaria real segue lá.
        const avariadas = await pool.query(`
            UPDATE almox.ferramentas f
               SET status = 'disponivel',
                   localizacao_atual = 'Almoxarifado',
                   atualizado_em = CURRENT_TIMESTAMP
             WHERE f.status = 'avariado'
               AND NOT EXISTS (
                    SELECT 1 FROM almox.solicitacoes s
                     WHERE s.instrumentos::text ILIKE '%"id":' || f.id || '%'
                        OR (COALESCE(f.tag, '') <> ''
                            AND s.instrumentos::text ILIKE '%' || f.tag || '%')
               )
               AND NOT EXISTS (
                    SELECT 1 FROM almox.manutencoes m
                     WHERE (m.instrumento_id = f.id
                            OR UPPER(COALESCE(m.tag, '')) = UPPER(COALESCE(f.tag, '')))
                       AND m.data_retorno IS NULL
               )
        `).catch(e => {
            console.warn("AVISO: Liberação de avarias órfãs ignorada:", e.message);
            return { rowCount: 0 };
        });

        const total = (osHist.rowCount || 0) + (baiaHist.rowCount || 0) + (movimentos.rowCount || 0);
        if (total || avariadas.rowCount) {
            console.log(
                `OK: Rastro órfão removido: ${osHist.rowCount} da OS, ${baiaHist.rowCount} de baia, ` +
                `${movimentos.rowCount} de movimentação, ${avariadas.rowCount} avaria(s) liberada(s)`
            );
        }
        if (avariadas.rowCount) cache.invalidar("ferramentas", "manutencoes");
    } catch (e) {
        console.warn("AVISO: Limpeza de histórico órfão ignorada:", e.message);
    }
}

// ============================================================
// CONFIGURAÇÕES COMPARTILHADAS
//
// Ajustes que valem para a EMPRESA inteira e não pertencem a nenhuma tabela
// existente: permissões por cargo, cores dos cargos, cargos criados/removidos
// e quais cargos são "Responsável por obra".
//
// Antes isso vivia só no localStorage do navegador, então cada máquina via uma
// configuração diferente e uma permissão marcada em um computador não valia
// em outro. Agora o banco é a fonte, e o localStorage fica só como cache.
// ============================================================
let _configTabelaOk = false;
async function garantirTabelaConfiguracoes() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

// GET /api/configuracoes -> { chave: valor, ... }
app.get("/configuracoes", async (req, res) => {
    try {
        await garantirTabelaConfiguracoes();
        const r = await pool.query("SELECT chave, valor FROM almox.configuracoes");
        const saida = {};
        r.rows.forEach(linha => { saida[linha.chave] = linha.valor; });
        res.json(saida);
    } catch (err) {
        console.error("ERRO: GET /api/configuracoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// PUT /api/configuracoes/:chave  { valor, usuario }
app.put("/configuracoes/:chave", async (req, res) => {
    try {
        await garantirTabelaConfiguracoes();
        const chave = String(req.params.chave || '').trim();
        if (!chave) return res.status(400).json({ erro: "Chave não informada" });

        const { valor, usuario } = req.body || {};
        if (valor === undefined) return res.status(400).json({ erro: "Valor não informado" });

        const r = await pool.query(`
            INSERT INTO almox.configuracoes (chave, valor, atualizado_em, atualizado_por)
            VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP, $3)
            ON CONFLICT (chave) DO UPDATE
               SET valor = EXCLUDED.valor,
                   atualizado_em = CURRENT_TIMESTAMP,
                   atualizado_por = EXCLUDED.atualizado_por
         RETURNING chave, valor
        `, [chave, JSON.stringify(valor), usuario || null]);

        res.json({ sucesso: true, ...r.rows[0] });
    } catch (err) {
        console.error("ERRO: PUT /api/configuracoes/:chave:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// FLUXO DE APROVAÇÃO DA OS
//
//   Solicitada -> Aguardando Aprovação -> Aprovada -> Conferência
//                                      -> Reprovada (motivo obrigatório)
//
// Quem aprova é o RESPONSÁVEL PELA OBRA escolhido na solicitação (ou alguém
// com a permissão global "aprovar_todas_os"). A OS reprovada continua no
// sistema, aparece em Gerenciar OS / Minhas Obras com o motivo, e nunca entra
// na fila de conferência.
// ============================================================
const OS_STATUS = {
    AGUARDANDO_APROVACAO: 'aguardando_aprovacao',
    REPROVADA: 'reprovada',
    AGUARDANDO_CONFERENCIA: 'aguardando_conferencia'
};

// Como cada status se chama para uma pessoa. O front tem o seu
// (getStatusInfo em almoxarife.js); o e-mail sai daqui e precisa do dele —
// "aguardando_conferencia" num assunto de e-mail não diz nada a ninguém.
const OS_STATUS_ROTULO = {
    aguardando_aprovacao:   'Aguardando aprovação',
    reprovada:              'Reprovada',
    aprovada:               'Aprovada',
    aguardando_conferencia: 'Aguardando separação',
    separado:               'Separada — pronta para retirada',
    conferido:              'Retirada concluída',
    em_campo:               'Em campo',
    prorrogada:             'Em campo (prazo prorrogado)',
    concluida:              'Concluída',
    cancelada:              'Cancelada',
    descontinuada:          'Descontinuada'
};

function rotuloStatusOS(status) {
    const s = String(status || '').toLowerCase().trim();
    return OS_STATUS_ROTULO[s] || (s ? s.replace(/_/g, ' ') : '—');
}

// O responsável é gravado por nome (compatibilidade com o histórico) e por id.
// Aqui resolvemos o id a partir do que o frontend mandar — id direto, ou o nome
// exibido no select de responsáveis.
async function resolverIdDoResponsavel(responsavelId, responsavelNome) {
    const idDireto = parseInt(responsavelId);
    if (Number.isInteger(idDireto) && idDireto > 0) return idDireto;
    const nome = String(responsavelNome || '').trim();
    if (!nome) return null;
    try {
        const r = await pool.query(
            "SELECT id FROM almox.usuarios WHERE LOWER(TRIM(nome)) = LOWER($1) ORDER BY id LIMIT 1",
            [nome]
        );
        return r.rows.length ? r.rows[0].id : null;
    } catch (e) {
        console.warn("AVISO: Não foi possível resolver o id do responsável:", e.message);
        return null;
    }
}

// Preenche responsavel_id das OS antigas (criadas antes do fluxo de aprovação)
// casando pelo nome do responsável. Idempotente e sem apagar nada.
async function vincularResponsaveisAntigos() {
    try {
        const r = await pool.query(`
            UPDATE almox.solicitacoes s
               SET responsavel_id = u.id
              FROM almox.usuarios u
             WHERE s.responsavel_id IS NULL
               AND s.responsavel IS NOT NULL
               AND LOWER(TRIM(s.responsavel)) = LOWER(TRIM(u.nome))
        `);
        if (r.rowCount) console.log(`OK: ${r.rowCount} OS antigas vinculadas ao id do responsável`);
    } catch (e) {
        console.warn("AVISO: Vínculo de responsáveis antigos ignorado:", e.message);
    }
}

// Um usuário pode decidir a OS quando é o responsável pela obra OU quando tem
// a permissão global de aprovação. Nunca "qualquer usuário aprova qualquer OS".
async function usuarioPodeDecidirOS(os, usuario) {
    if (!usuario) return false;
    const permissoes = Array.isArray(usuario.permissoes) ? usuario.permissoes : [];
    if (permissoes.includes('*') || permissoes.includes('aprovar_todas_os')) return true;

    const idUsuario = parseInt(usuario.id);
    if (Number.isInteger(idUsuario) && os.responsavel_id && parseInt(os.responsavel_id) === idUsuario) return true;

    const nomeUsuario = String(usuario.nome || '').trim().toLowerCase();
    const nomeResponsavel = String(os.responsavel || '').trim().toLowerCase();
    return !!nomeUsuario && nomeUsuario === nomeResponsavel;
}

// PUT /api/solicitacoes/:id/aprovar { usuario: { id, nome, permissoes } }
app.put("/solicitacoes/:id/aprovar", async (req, res) => {
    try {
        const { usuario } = req.body || {};
        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const statusAtual = String(os.status || '').toLowerCase();
        if (statusAtual === OS_STATUS.REPROVADA) {
            return res.status(409).json({ erro: "Esta OS já foi reprovada e não pode ser aprovada." });
        }
        if (statusAtual !== OS_STATUS.AGUARDANDO_APROVACAO) {
            // Idempotente: já passou da aprovação, devolve a OS como está.
            return res.status(409).json({ erro: "Esta OS não está aguardando aprovação.", os });
        }
        if (!(await usuarioPodeDecidirOS(os, usuario))) {
            return res.status(403).json({ erro: "Somente o responsável pela obra pode aprovar esta OS." });
        }

        const r = await pool.query(`
            UPDATE almox.solicitacoes
               SET status = $1,
                   aprovado_por = $2,
                   aprovado_por_id = $3,
                   aprovado_em = CURRENT_TIMESTAMP,
                   reprovado_por = NULL,
                   reprovado_por_id = NULL,
                   reprovado_em = NULL,
                   motivo_reprovacao = NULL,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $4 AND status = $5
         RETURNING *
        `, [
            OS_STATUS.AGUARDANDO_CONFERENCIA,
            usuario?.nome || null,
            Number.isInteger(parseInt(usuario?.id)) ? parseInt(usuario.id) : null,
            os.id,
            OS_STATUS.AGUARDANDO_APROVACAO
        ]);

        // O WHERE com o status antigo impede aprovação dupla em corrida.
        if (!r.rows.length) return res.status(409).json({ erro: "Esta OS já foi decidida por outra pessoa." });

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'os_aprovada',
            observacao: 'Aprovada pelo responsável pela obra',
            data_evento: hojeISO(),
            usuario: usuario?.nome || null
        });

        // a OS ligada a uma obra marca o "Enviar OS" dela
        await marcarEnviarOS(r.rows[0]);

        // Aprovada, a OS cai na fila da Separação. Esta é das poucas sem
        // dono: separar é da fila de quem separa (ver REGRAS em push.js).
        await push.notificar(pool, 'separar', {
            os: r.rows[0],
            remetente: os.solicitado_por,
            excluir: usuario?.id
        });

        // A aprovação é a primeira mudança de status da obra, e a que mais
        // interessa a quem enviou a solicitação.
        await mail.notificar(pool, 'status_obra', {
            os: r.rows[0],
            statusAnterior: os.status,
            statusAnteriorRotulo: rotuloStatusOS(os.status),
            statusNovo: r.rows[0].status,
            statusNovoRotulo: rotuloStatusOS(r.rows[0].status),
            usuario: usuario?.nome || null,
            data: new Date(),
            somenteIds: [os.solicitado_por_id, os.responsavel_id].filter(Boolean),
            excluirId: usuario?.id
        });

        cache.invalidar("solicitacoes");
        res.json({ sucesso: true, os: r.rows[0] });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/aprovar:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// PUT /api/solicitacoes/:id/editar-aprovar
//
// O antigo "Rejeitar" da tela de aprovação virou "Editar". Em vez de devolver
// a OS ao solicitante com um motivo, o responsável pela obra corrige a lista
// ele mesmo — cliente, obra, datas, observações e as quantidades de cada
// ativo — e aprova na mesma ação.
//
// A OS segue exatamente para onde a aprovação simples a levaria (a fila da
// Retirada), com uma diferença: fica marcado que ela foi EDITADA antes de ser
// aprovada, e é isso que "Minhas Obras" mostra como
// "Editada e Aprovada por: Fulano · dd/mm/aaaa".
//
// Corpo: { cliente, obra, responsavel, data_inicio, data_fim, observacoes,
//          quantidades: { "Ativo": qtd }, usuario: { id, nome, permissoes } }
// ------------------------------------------------------------
app.put("/solicitacoes/:id/editar-aprovar", async (req, res) => {
    try {
        const b = req.body || {};
        const usuario = b.usuario || {};

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const statusAtual = String(os.status || '').toLowerCase();
        if (statusAtual === OS_STATUS.REPROVADA) {
            return res.status(409).json({ erro: "Esta OS já foi reprovada e não pode ser editada aqui." });
        }
        if (statusAtual !== OS_STATUS.AGUARDANDO_APROVACAO) {
            return res.status(409).json({ erro: "Esta OS não está aguardando aprovação.", os });
        }
        if (!(await usuarioPodeDecidirOS(os, usuario))) {
            return res.status(403).json({ erro: "Somente o responsável pela obra pode editar e aprovar esta OS." });
        }

        // Quantidades por ATIVO. Antes da separação a OS trabalha com
        // ativo + quantidade (não com TAG), então é isso que a edição mexe.
        const quantidadesBrutas = (b.quantidades && typeof b.quantidades === 'object' && !Array.isArray(b.quantidades))
            ? b.quantidades : {};
        const quantidades = {};
        Object.keys(quantidadesBrutas).forEach(ativo => {
            const qtd = parseInt(quantidadesBrutas[ativo]);
            if (String(ativo).trim() && Number.isInteger(qtd) && qtd > 0) quantidades[String(ativo).trim()] = qtd;
        });
        if (!Object.keys(quantidades).length) {
            return res.status(400).json({ erro: "A OS precisa de pelo menos um instrumento." });
        }

        const responsavelNome = String(b.responsavel || os.responsavel || '').trim() || null;
        const responsavelId = await resolverIdDoResponsavel(b.responsavel_id, responsavelNome);

        // trocou o cliente (ou a obra) na edição: a ligação com a obra do
        // main é refeita com a mesma regra da solicitação
        let ligacao = null;
        if (b.cliente_id !== undefined) {
            ligacao = await lerClienteEObra(b.cliente_id, b.obra_id);
            if (ligacao.erro) return res.status(400).json({ erro: ligacao.erro, campo: 'obra_id' });
        }

        const r = await pool.query(`
            UPDATE almox.solicitacoes
               SET cliente          = COALESCE($1, cliente),
                   obra             = COALESCE($2, obra),
                   responsavel      = COALESCE($3, responsavel),
                   responsavel_id   = COALESCE($4, responsavel_id),
                   data_inicio      = COALESCE($5, data_inicio),
                   data_fim         = COALESCE($6, data_fim),
                   observacoes      = $7,
                   quantidades      = $8::jsonb,
                   status           = $9,
                   editada_por      = $10,
                   editada_por_id   = $11,
                   editada_em       = CURRENT_TIMESTAMP,
                   aprovado_por     = $10,
                   aprovado_por_id  = $11,
                   aprovado_em      = CURRENT_TIMESTAMP,
                   reprovado_por    = NULL,
                   reprovado_por_id = NULL,
                   reprovado_em     = NULL,
                   motivo_reprovacao = NULL,
                   cliente_id       = CASE WHEN $14 THEN $15::bigint ELSE cliente_id END,
                   obra_id          = CASE WHEN $14 THEN $16::bigint ELSE obra_id END,
                   updated_at       = CURRENT_TIMESTAMP
             WHERE id = $12 AND status = $13
         RETURNING *
        `, [
            String(b.cliente || '').trim() || null,
            (ligacao && ligacao.obraRotulo) || String(b.obra || '').trim() || null,
            responsavelNome,
            responsavelId,
            b.data_inicio || null,
            b.data_fim || null,
            b.observacoes === undefined ? os.observacoes : (String(b.observacoes || '').trim() || null),
            JSON.stringify(quantidades),
            OS_STATUS.AGUARDANDO_CONFERENCIA,
            usuario?.nome || null,
            Number.isInteger(parseInt(usuario?.id)) ? parseInt(usuario.id) : null,
            os.id,
            OS_STATUS.AGUARDANDO_APROVACAO,
            Boolean(ligacao),
            ligacao ? ligacao.clienteId : null,
            ligacao ? ligacao.obraId : null
        ]);

        if (!r.rows.length) return res.status(409).json({ erro: "Esta OS já foi decidida por outra pessoa." });

        // Dois eventos, e não um só: quem lê o histórico precisa ver que houve
        // uma EDIÇÃO antes do aval — com o que era e o que passou a ser.
        const resumo = (mapa) => Object.keys(mapa || {}).sort()
            .map(k => `${k} ${mapa[k]}x`).join(', ') || '—';
        const antes = (() => {
            let q = os.quantidades;
            if (typeof q === 'string') { try { q = JSON.parse(q); } catch (e) { q = {}; } }
            return (q && typeof q === 'object' && !Array.isArray(q)) ? q : {};
        })();

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'os_editada',
            observacao: `Lista antes: ${resumo(antes)} | Lista depois: ${resumo(quantidades)}`,
            motivo: String(b.motivo || '').trim() || null,
            data_evento: hojeISO(),
            usuario: usuario?.nome || null,
            dados: { antes, depois: quantidades }
        });

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'os_aprovada',
            observacao: 'Editada e aprovada pelo responsável pela obra',
            data_evento: hojeISO(),
            usuario: usuario?.nome || null
        });

        // a OS ligada a uma obra marca o "Enviar OS" dela
        await marcarEnviarOS(r.rows[0]);

        // Fila de quem separa (ver REGRAS em push.js).
        await push.notificar(pool, 'separar', {
            os: r.rows[0],
            remetente: os.solicitado_por,
            excluir: usuario?.id
        });

        cache.invalidar("solicitacoes");
        res.json({ sucesso: true, os: r.rows[0] });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/editar-aprovar:", err);
        res.status(500).json({ erro: err.message });
    }
});

// PUT /api/solicitacoes/:id/reprovar { motivo, usuario }
app.put("/solicitacoes/:id/reprovar", async (req, res) => {
    try {
        const { usuario, motivo } = req.body || {};
        const motivoTexto = String(motivo || '').trim();
        if (!motivoTexto) return res.status(400).json({ erro: "O motivo da reprovação é obrigatório." });

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const statusAtual = String(os.status || '').toLowerCase();
        if (statusAtual !== OS_STATUS.AGUARDANDO_APROVACAO) {
            return res.status(409).json({ erro: "Esta OS não está aguardando aprovação.", os });
        }
        if (!(await usuarioPodeDecidirOS(os, usuario))) {
            return res.status(403).json({ erro: "Somente o responsável pela obra pode reprovar esta OS." });
        }

        const r = await pool.query(`
            UPDATE almox.solicitacoes
               SET status = $1,
                   motivo_reprovacao = $2,
                   reprovado_por = $3,
                   reprovado_por_id = $4,
                   reprovado_em = CURRENT_TIMESTAMP,
                   aprovado_por = NULL,
                   aprovado_por_id = NULL,
                   aprovado_em = NULL,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 AND status = $6
         RETURNING *
        `, [
            OS_STATUS.REPROVADA,
            motivoTexto,
            usuario?.nome || null,
            Number.isInteger(parseInt(usuario?.id)) ? parseInt(usuario.id) : null,
            os.id,
            OS_STATUS.AGUARDANDO_APROVACAO
        ]);

        if (!r.rows.length) return res.status(409).json({ erro: "Esta OS já foi decidida por outra pessoa." });

        // A OS reprovada nunca chega à conferência: as baias reservadas voltam
        // a ficar livres imediatamente.
        await pool.query(`
            UPDATE almox.baias
               SET os_id = NULL, status = 'disponivel',
                   data_retorno = CURRENT_DATE, data_liberacao = CURRENT_DATE,
                   atualizado_em = CURRENT_TIMESTAMP
             WHERE os_id = $1
        `, [os.id]);

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'os_reprovada',
            motivo: motivoTexto,
            data_evento: hojeISO(),
            usuario: usuario?.nome || null
        });

        await push.notificar(pool, 'reprovada', {
            os: r.rows[0],
            remetente: os.solicitado_por,
            usuarioIds: os.solicitado_por_id ? [os.solicitado_por_id] : [],
            corpo: `Sua solicitação foi reprovada — ${motivoTexto}`
        });

        cache.invalidar("solicitacoes", "baias");
        res.json({ sucesso: true, os: r.rows[0] });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/reprovar:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTAS - SOLICITAÇÕES
// ============================================================

// ------------------------------------------------------------
// NÚMERO DA OS — UM POR SOLICITAÇÃO, NUNCA DOIS IGUAIS
//
// Antes o número era calculado NO NAVEGADOR (MAX(numero_os)+1 sobre a lista
// que aquela aba tinha em memória). Duas pessoas solicitando ao mesmo tempo
// liam a mesma lista e chegavam ao mesmo número: Jefferson e Rodrigo às 10:45
// saíam os dois como OS-519.
//
// Agora quem numera é o banco, dentro da MESMA transação que insere a linha,
// e o pg_advisory_xact_lock serializa as chamadas concorrentes: a segunda
// espera a primeira terminar e só então lê o MAX — 519 e 520. O lock cai
// sozinho no COMMIT/ROLLBACK (é "xact"), então erro nenhum trava a numeração.
//
// A conta ignora o que não for dígito para valer tanto com numero_os INTEGER
// quanto com bancos antigos em que a coluna é texto.
// ------------------------------------------------------------
const OS_NUMERO_LOCK = 918273645;   // chave fixa deste lock; qualquer inteiro serve

async function proximoNumeroOS(client) {
    await client.query("SELECT pg_advisory_xact_lock($1)", [OS_NUMERO_LOCK]);
    const r = await client.query(`
        SELECT COALESCE(
                   MAX(NULLIF(regexp_replace(numero_os::text, '[^0-9]', '', 'g'), '')::bigint),
                   0
               ) + 1 AS proximo
          FROM almox.solicitacoes
    `);
    return parseInt(r.rows[0].proximo, 10) || 1;
}

app.post("/solicitacoes", async (req, res) => {
    console.log("POST /api/solicitacoes");
    console.log("Body recebido:", req.body);
    
    try {
        const {
            numero_os,
            cliente,
            responsavel,
            obra,
            data_inicio,
            data_fim,
            instrumentos,
            quantidades,
            status,
            observacoes,
            baia_id,
            baias_ids,
            solicitado_por,
            solicitado_por_id,
            responsavel_id,
            cliente_id,
            obra_id
        } = req.body;

        const listaBaias = normalizarBaiasIds(baias_ids, baia_id);
        const baiaPrincipal = listaBaias[0] || null;
        console.log("baias recebidas:", listaBaias);

        if (!cliente) {
            return res.status(400).json({ erro: "Cliente é obrigatório" });
        }
        // o cliente e a obra do main: com mais de uma obra aberta, a obra
        // é obrigatória (ver lerClienteEObra, no fim do arquivo)
        const ligacao = await lerClienteEObra(cliente_id, obra_id);
        if (ligacao.erro) {
            return res.status(400).json({ erro: ligacao.erro, campo: 'obra_id' });
        }
        if (!responsavel) {
            return res.status(400).json({ erro: "Responsável é obrigatório" });
        }
        if (!data_inicio || !data_fim) {
            return res.status(400).json({ 
                erro: "Data de início e fim são obrigatórias" 
            });
        }

        const instrumentosJson = instrumentos ? JSON.stringify(instrumentos) : '[]';
        const quantidadesJson = quantidades ? JSON.stringify(quantidades) : '{}';

        // Toda OS nova nasce aguardando a aprovação do responsável pela obra.
        // Só depois de aprovada ela entra na fila de conferência.
        const responsavelId = await resolverIdDoResponsavel(responsavel_id, responsavel);

        // O número é do SERVIDOR, não do navegador: quem manda `numero_os` no
        // corpo tem o valor ignorado. Ele é gerado e gravado na mesma
        // transação, com o lock que impede duas solicitações simultâneas de
        // receberem o mesmo número (ver proximoNumeroOS).
        const client = await pool.connect();
        let result;
        try {
            await client.query("BEGIN");
            const numeroGerado = await proximoNumeroOS(client);
            result = await client.query(`
            INSERT INTO almox.solicitacoes
            (numero_os, cliente, responsavel, obra, data_inicio, data_fim,
             instrumentos, quantidades, status, observacoes, baia_id, baias_ids, solicitado_por,
             solicitado_por_id, responsavel_id, cliente_id, obra_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17)
            RETURNING *
        `, [
            numeroGerado,
            cliente,
            responsavel,
            ligacao.obraRotulo || obra || null,
            data_inicio,
            data_fim,
            instrumentosJson,
            quantidadesJson,
            status || OS_STATUS.AGUARDANDO_APROVACAO,
            observacoes || null,
            baiaPrincipal,
            JSON.stringify(listaBaias),
            solicitado_por || null,
            Number.isInteger(parseInt(solicitado_por_id)) ? parseInt(solicitado_por_id) : null,
            responsavelId,
            ligacao.clienteId,
            ligacao.obraId
            ]);
            await client.query("COMMIT");
        } catch (erroInsert) {
            await client.query("ROLLBACK").catch(() => {});
            throw erroInsert;
        } finally {
            client.release();
        }

        const novaOS = result.rows[0];
        console.log("OK: OS inserida no banco, ID:", novaOS.id, "· número:", novaOS.numero_os);
        console.log("OK: baia_id salvo:", novaOS.baia_id);

        if (listaBaias.length) {
            await sincronizarBaiasDaOS(novaOS.id, listaBaias, data_inicio);
            console.log("OK: Baias reservadas:", listaBaias);
        }

        // "Aprovar Lista" para o responsável pela obra — e para quem pode
        // aprovar qualquer OS.
        await push.notificar(pool, 'aprovar', {
            os: novaOS,
            remetente: solicitado_por,
            // O responsável indicado na OS. O cargo de aprovador vira filtro
            // (ver REGRAS em push.js): ele confirma a pessoa, não espalha.
            usuarioIds: responsavelId ? [responsavelId] : [],
            excluir: solicitado_por_id
        });

        // O E-MAIL, ao contrário do push, vai SÓ para o responsável indicado
        // na solicitação. Quem pode "aprovar qualquer OS" continua vendo a
        // fila na tela e recebendo o push, mas não é inundado de e-mail por
        // OS que não é dele — foi assim que a regra foi pedida.
        await mail.notificar(pool, 'os_solicitada', {
            os: novaOS,
            solicitante: solicitado_por,
            somenteIds: responsavelId ? [responsavelId] : [],
            somenteNomes: responsavelId ? null : [responsavel],
            excluirId: solicitado_por_id,
            totalItens: Object.values(quantidades || {}).reduce((a, b) => a + (parseInt(b) || 0), 0),
            itens: Object.keys(quantidades || {})
                .filter(k => isNaN(Number(k)) && (parseInt(quantidades[k]) || 0) > 0)
                .map(k => ({ ativo: k, quantidade: parseInt(quantidades[k]) })),
            baias: listaBaias.length ? listaBaias.join(', ') : null
        });

        console.log("OK: Solicitação criada com sucesso!");
        res.status(201).json(novaOS);
        
    } catch (err) {
        console.error("ERRO: ERRO no POST:", err);
        res.status(500).json({ 
            erro: "Erro ao criar solicitação",
            detalhe: err.message 
        });
    }
});

app.get("/solicitacoes", async (req, res) => {
    return cache.responderComCache(req, res, "solicitacoes", "solicitacoes:lista", async () => {
        // Auto-cura: sem cron/servidor persistente (Vercel serverless), a
        // transição "Conferido -> Em campo" ao chegar a data da obra é feita
        // aqui, de forma preguiçosa, antes de qualquer leitura da lista.
        await pool.query(
            `UPDATE almox.solicitacoes SET status = 'em_campo', updated_at = CURRENT_TIMESTAMP
              WHERE status = 'conferido' AND data_inicio <= CURRENT_DATE`
        );
        const result = await pool.query(
            `SELECT * FROM almox.solicitacoes ORDER BY id DESC`
        );
        return result.rows;
    });
});

app.put("/solicitacoes/:id", async (req, res) => {
    console.log("PUT /api/solicitacoes/" + req.params.id);
    console.log("Body recebido:", req.body);
    
    try {
        const { id } = req.params;
        const {
            cliente,
            responsavel,
            obra,
            data_inicio,
            data_fim,
            instrumentos,
            quantidades,
            status,
            observacoes,
            baia_id,
            baias_ids,
            baia_ferramenta_ids,
            responsavel_id
        } = req.body;

        const listaBaias = normalizarBaiasIds(baias_ids, baia_id);
        const baiaPrincipal = listaBaias[0] || null;
        const baiaFerramentaIdsJson = baia_ferramenta_ids !== undefined
            ? JSON.stringify((Array.isArray(baia_ferramenta_ids) ? baia_ferramenta_ids : []).map(v => parseInt(v)).filter(v => !isNaN(v)))
            : null;
        console.log("baias recebidas:", listaBaias);

        const existe = await pool.query("SELECT id, baia_id FROM almox.solicitacoes WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Solicitação não encontrada" });
        }

        const baiaAntigaId = existe.rows[0].baia_id;
        console.log(" Baia antiga:", baiaAntigaId);

        const instrumentosJson = instrumentos ? JSON.stringify(instrumentos) : '[]';
        const quantidadesJson = quantidades ? JSON.stringify(quantidades) : '{}';

        const result = await pool.query(`
            UPDATE almox.solicitacoes 
            SET 
                cliente = COALESCE($1, cliente),
                responsavel = COALESCE($2, responsavel),
                obra = COALESCE($3, obra),
                data_inicio = COALESCE($4, data_inicio),
                data_fim = COALESCE($5, data_fim),
                instrumentos = $6::jsonb,
                quantidades = $7::jsonb,
                status = COALESCE($8, status),
                observacoes = COALESCE($9, observacoes),
                baia_id = $10,
                baias_ids = $11::jsonb,
                baia_ferramenta_ids = COALESCE($12::jsonb, baia_ferramenta_ids),
                responsavel_id = COALESCE($14, responsavel_id),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $13
            RETURNING *
        `, [
            cliente || null,
            responsavel || null,
            obra || null,
            data_inicio || null,
            data_fim || null,
            instrumentosJson,
            quantidadesJson,
            status || null,
            observacoes || null,
            baiaPrincipal,
            JSON.stringify(listaBaias),
            baiaFerramentaIdsJson,
            id,
            await resolverIdDoResponsavel(responsavel_id, responsavel)
        ]);

        const osAtualizada = result.rows[0];
        console.log("OK: OS atualizada com baia_id:", osAtualizada.baia_id);

        await sincronizarBaiasDaOS(osAtualizada.id, listaBaias, data_inicio);
        console.log("OK: Baias sincronizadas:", listaBaias);

        console.log("OK: Solicitação atualizada com sucesso!");
        res.json(osAtualizada);
        
    } catch (err) {
        console.error("ERRO: ERRO no PUT:", err);
        res.status(500).json({ 
            erro: "Erro ao atualizar solicitação",
            detalhe: err.message 
        });
    }
});

// ------------------------------------------------------------
// A OS DE DESTINO FOI EXCLUÍDA
//
// Quando uma ferramenta é remanejada de A para B, a OS A guarda a baixa em
// `saidas_remanejamento` e deixa de cobrar a devolução daquela TAG — quem
// responde por ela passa a ser B.
//
// Se B for excluída, essa baixa fica apontando para uma OS que não existe
// mais: a ferramenta não é cobrada em A nem em B, e não pode ser bipada em
// lugar nenhum. Aqui a baixa é desfeita e a TAG volta a ser responsabilidade
// da OS de origem, como era antes do remanejamento.
// ------------------------------------------------------------
async function _desfazerSaidasParaOS(osIdExcluida) {
    const alvo = parseInt(osIdExcluida, 10);
    if (!Number.isFinite(alvo)) return 0;

    const r = await pool.query(
        `SELECT id, instrumentos, saidas_remanejamento
           FROM almox.solicitacoes
          WHERE saidas_remanejamento @> jsonb_build_array(
                    jsonb_build_object('os_destino_id', $1::int))`,
        [alvo]
    );

    let desfeitas = 0;
    for (const os of r.rows) {
        const saidas = jsonArray(os.saidas_remanejamento);
        const voltam = saidas.filter(x => String(x?.os_destino_id) === String(alvo));
        if (!voltam.length) continue;

        const restantes = saidas.filter(x => String(x?.os_destino_id) !== String(alvo));
        const instrumentos = normalizarInstrumentosOS(os);
        voltam.forEach(v => {
            const alvoItem = instrumentos.find(x => mesmoItem(x, v));
            // Volta ao estado neutro: a TAG é de novo item comum desta OS.
            if (alvoItem && alvoItem.status_item === STATUS_ITEM_OS.SAIDA_REMANEJAMENTO) {
                delete alvoItem.status_item;
            }
        });

        await pool.query(`
            UPDATE almox.solicitacoes
               SET instrumentos = $1::jsonb,
                   saidas_remanejamento = $2::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
        `, [JSON.stringify(instrumentos), JSON.stringify(restantes), os.id]);
        desfeitas += voltam.length;
    }
    return desfeitas;
}

app.delete("/solicitacoes/:id", async (req, res) => {
    console.log("DELETE /api/solicitacoes/" + req.params.id);
    
    try {
        const { id } = req.params;

        const existe = await pool.query("SELECT id FROM almox.solicitacoes WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Solicitação não encontrada" });
        }

        // Número da OS: as tabelas de histórico referenciam tanto o id quanto
        // o número, então precisamos dos dois para limpar tudo.
        const dadosOS = await pool.query(
            "SELECT * FROM almox.solicitacoes WHERE id = $1", [id]
        );
        const osCompleta = dadosOS.rows[0] || {};
        const numeroOS = osCompleta.numero_os;
        const numeroTexto = numeroOS !== null && numeroOS !== undefined ? String(numeroOS) : null;

        // Ferramentas que passaram por esta OS — inclusive as que saíram por
        // retirada/devolução parcial. Apagar a OS tem de apagar junto o estado
        // que ela deixou nelas (era isso que mantinha a ferramenta "Avaria"
        // na Manutenção mesmo depois da OS sumir).
        const idsFerramentas = new Set();
        const tagsFerramentas = new Set();
        ['instrumentos', 'retiradas_parciais', 'inclusoes_parciais',
         'devolucoes_parciais', 'devolutiva'].forEach(campo => {
            jsonArray(osCompleta[campo]).forEach(item => {
                if (item === null || item === undefined) return;
                if (typeof item !== 'object') {
                    const bruto = String(item).trim();
                    if (!bruto) return;
                    if (/^\d+$/.test(bruto)) idsFerramentas.add(Number(bruto));
                    else tagsFerramentas.add(bruto.toUpperCase());
                    return;
                }
                const fid = item.ferramenta_id ?? item.id;
                if (fid !== null && fid !== undefined && String(fid).trim() !== '') {
                    idsFerramentas.add(Number(fid));
                }
                if (item.tag) tagsFerramentas.add(String(item.tag).trim().toUpperCase());
            });
        });

        // Liberar baia associada
        await pool.query(`
            UPDATE almox.baias
            SET
                os_id = NULL,
                status = 'disponivel',
                data_retorno = CURRENT_DATE,
                atualizado_em = CURRENT_TIMESTAMP
            WHERE os_id = $1
        `, [id]);

        // ---- Apaga o histórico gerado por esta OS ----
        // Histórico da própria OS
        await pool.query("DELETE FROM almox.os_historico WHERE solicitacao_id = $1", [id]);

        // Pedidos de prorrogação desta OS: um pendente ficaria para sempre na
        // fila da aba "Aprovar", apontando para uma OS que não existe mais.
        try {
            await pool.query("DELETE FROM almox.os_prorrogacoes WHERE solicitacao_id = $1", [id]);
        } catch (e) { /* banco antigo, ainda sem a tabela */ }

        // Eventos de baia originados nesta OS
        await pool.query("DELETE FROM almox.baia_historico WHERE os_id = $1", [id]);
        if (numeroTexto) {
            await pool.query("DELETE FROM almox.baia_historico WHERE numero_os = $1", [numeroTexto]);
        }

        // Movimentações das ferramentas (é isto que fazia a ferramenta continuar
        // dizendo que participou da OS excluída)
        if (numeroTexto) {
            await pool.query(
                "DELETE FROM almox.remanejamentos WHERE os_destino = $1 OR os_origem = $1",
                [numeroTexto]
            );
        }
        await pool.query(
            "DELETE FROM almox.remanejamentos WHERE os_destino = $1 OR os_origem = $1",
            [String(id)]
        );

        // Outras OS podem ter dado baixa numa ferramenta "remanejada para
        // esta OS". Sem desfazer isso antes de apagar, a TAG ficaria órfã.
        const saidasDesfeitas = await _desfazerSaidasParaOS(id);

        await pool.query("DELETE FROM almox.solicitacoes WHERE id = $1", [id]);

        // a OS aprovada que marcava o "Enviar OS" da obra leva o check junto
        // (a não ser que a obra tenha outra OS aprovada)
        if (osCompleta.obra_id && osCompleta.aprovado_em) await desmarcarEnviarOS(osCompleta.obra_id, osCompleta.id);

        // ---- Devolve as ferramentas ao estado neutro ----
        // A OS não existe mais: nada do que ela causou pode continuar preso à
        // ferramenta. "avariado" (que a joga para a Manutenção) e "em_campo"
        // (que a esconde do almoxarifado) voltam para "disponivel", desde que
        // nenhuma OUTRA OS em aberto ainda esteja usando a ferramenta.
        let ferramentasLiberadas = 0;
        const ids = [...idsFerramentas].filter(n => Number.isFinite(n));
        const tags = [...tagsFerramentas];
        if (ids.length || tags.length) {
            const r = await pool.query(`
                UPDATE almox.ferramentas f
                   SET status = 'disponivel',
                       localizacao_atual = 'Almoxarifado',
                       atualizado_em = CURRENT_TIMESTAMP
                 WHERE (f.id = ANY($1::int[]) OR UPPER(COALESCE(f.tag, '')) = ANY($2::text[]))
                   AND f.status IN ('avariado', 'em_campo', 'reservado', 'separado')
                   AND NOT EXISTS (
                        SELECT 1 FROM almox.solicitacoes s
                         WHERE s.status <> 'concluida'
                           AND (s.instrumentos::text ILIKE '%"id":' || f.id || '%'
                                OR (COALESCE(f.tag, '') <> ''
                                    AND s.instrumentos::text ILIKE '%' || f.tag || '%'))
                   )
            `, [ids, tags]);
            ferramentasLiberadas = r.rowCount || 0;
        }

        cache.invalidar("solicitacoes", "baias", "ferramentas", "manutencoes");
        console.log(
            "OK: Solicitação e rastro excluídos. ID:", id, "OS:", numeroTexto,
            "| ferramentas liberadas:", ferramentasLiberadas,
            "| saídas por remanejamento desfeitas:", saidasDesfeitas
        );
        res.json({
            sucesso: true,
            ferramentas_liberadas: ferramentasLiberadas,
            saidas_remanejamento_desfeitas: saidasDesfeitas
        });
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTAS - CERTIFICADOS
// ============================================================

// Listagem SEM a coluna "arquivo" (PDF em base64).
// Essa coluna era responsável pela maior parte do tráfego do banco:
// o arquivo agora é buscado sob demanda em /api/certificados/:id/arquivo
app.get("/certificados", async (req, res) => {
    return cache.responderComCache(req, res, "certificados", "certificados:lista", async () => {
        const result = await pool.query(`
            SELECT ${await certColunasLeves()}
            FROM almox.certificados
            ORDER BY id DESC
        `);
        return result.rows;
    });
});

// Arquivo (base64) de um certificado — carregado só quando o usuário
// clica em "Ver" ou "Baixar".
app.get("/certificados/:id/arquivo", async (req, res) => {
    return cache.responderComCache(
        req,
        res,
        "certificados",
        "certificados:arquivo:" + req.params.id,
        async () => {
            const r = await pool.query(
                "SELECT id, numero, nome_arquivo, arquivo FROM almox.certificados WHERE id = $1",
                [req.params.id]
            );
            return r.rows[0] || null;
        }
    );
});

app.get("/certificados/instrumento/:instrumentoId", async (req, res) => {
    console.log("GET /api/certificados/instrumento/" + req.params.instrumentoId);
    try {
        const { instrumentoId } = req.params;
        const result = await pool.query(`
            SELECT ${await certColunasLeves()}
            FROM almox.certificados 
            WHERE instrumento_id = $1 
            ORDER BY data_emissao DESC
        `, [instrumentoId]);
        console.log("OK: Certificados do instrumento:", result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// Avisa quando o STATUS do certificado muda — e só então. O status não é uma
// coluna: é a data de vencimento lida contra hoje (ver statusCertificado).
// `vencimentoAnterior` null significa "certificado novo", que sempre avisa.
async function avisarStatusCertificado(cert, usuario, vencimentoAnterior) {
    try {
        if (!cert) return;
        const antes  = vencimentoAnterior === null ? null : statusCertificado(vencimentoAnterior);
        const depois = statusCertificado(cert.data_vencimento);
        if (antes !== null && antes === depois) return;

        const f = await pool.query(
            "SELECT tag, tipo FROM almox.ferramentas WHERE id = $1",
            [cert.instrumento_id]
        );

        await mail.notificar(pool, 'certificado', {
            tag: f.rows[0]?.tag || null,
            tipo: f.rows[0]?.tipo || null,
            numero: cert.numero,
            statusAnterior: antes || 'Sem certificado',
            statusNovo: depois,
            dataCalibracao: cert.data_emissao,
            dataVencimento: cert.data_vencimento,
            usuario: usuario || '—',
            data: new Date()
        });
    } catch (e) {
        console.warn("AVISO: falha ao avisar mudança de certificado:", e.message);
    }
}

app.post("/certificados", async (req, res) => {
    console.log("POST /api/certificados");
    console.log("Body recebido:", req.body);
    
    try {
        const { 
            instrumento_id,
            numero,
            data_emissao,
            data_vencimento,
            observacoes,
            arquivo,
            nome_arquivo,
            valor,
            comprovante
        } = req.body;

        if (!instrumento_id) {
            return res.status(400).json({ erro: "Instrumento ID é obrigatório" });
        }
        if (!numero || numero.trim() === '') {
            return res.status(400).json({ erro: "Número do certificado é obrigatório" });
        }
        if (!data_emissao) {
            return res.status(400).json({ erro: "Data de emissão é obrigatória" });
        }
        if (!data_vencimento) {
            return res.status(400).json({ erro: "Data de vencimento é obrigatória" });
        }
        if (!arquivo) {
            return res.status(400).json({ erro: "Arquivo do certificado é obrigatório" });
        }

        const instrumentoExiste = await pool.query(
            "SELECT id FROM almox.ferramentas WHERE id = $1",
            [instrumento_id]
        );
        if (instrumentoExiste.rows.length === 0) {
            return res.status(404).json({ erro: "Instrumento não encontrado" });
        }

        const result = await pool.query(`
            INSERT INTO almox.certificados 
            (instrumento_id, numero, data_emissao, data_vencimento, observacoes, arquivo, nome_arquivo, valor, comprovante)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            instrumento_id,
            numero.trim(),
            data_emissao,
            data_vencimento,
            observacoes || null,
            arquivo,
            nome_arquivo || null,
            Number(valor) || 0,
            comprovante || null
        ]);

        // O certificado novo MUDA o status da ferramenta: o que estava
        // vencido (ou a vencer) volta a ser vigente. Este é o gatilho real —
        // esperar a verificação diária faria o aviso chegar um dia atrasado.
        await avisarStatusCertificado(result.rows[0], req.body?.usuario_nome || null, null);

        console.log("OK: Certificado criado ID:", result.rows[0].id);
        res.status(201).json(result.rows[0]);
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ 
            erro: "Erro ao criar certificado",
            detalhe: err.message 
        });
    }
});

app.put("/certificados/:id", async (req, res) => {
    console.log("PUT /api/certificados/" + req.params.id);
    console.log("Body recebido:", req.body);
    
    try {
        const { id } = req.params;
        const { 
            numero,
            data_emissao,
            data_vencimento,
            observacoes,
            arquivo,
            nome_arquivo,
            valor,
            comprovante
        } = req.body;

        const existe = await pool.query(
            "SELECT * FROM almox.certificados WHERE id = $1",
            [id]
        );
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Certificado não encontrado" });
        }
        const certAntes = existe.rows[0];

        // Construir query dinamicamente
        let updates = [];
        let params = [];
        let paramCount = 1;

        if (numero !== undefined) { updates.push(`numero = $${paramCount++}`); params.push(numero.trim()); }
        if (data_emissao !== undefined) { updates.push(`data_emissao = $${paramCount++}`); params.push(data_emissao); }
        if (data_vencimento !== undefined) { updates.push(`data_vencimento = $${paramCount++}`); params.push(data_vencimento); }
        if (observacoes !== undefined) { updates.push(`observacoes = $${paramCount++}`); params.push(observacoes || null); }
        if (arquivo !== undefined) { updates.push(`arquivo = $${paramCount++}`); params.push(arquivo); }
        if (nome_arquivo !== undefined) { updates.push(`nome_arquivo = $${paramCount++}`); params.push(nome_arquivo || null); }
        if (valor !== undefined) { updates.push(`valor = $${paramCount++}`); params.push(Number(valor) || 0); }
        if (comprovante !== undefined) { updates.push(`comprovante = $${paramCount++}`); params.push(comprovante || null); }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);

        if (updates.length === 0) {
            return res.status(400).json({ erro: "Nenhum campo para atualizar" });
        }

        params.push(id);
        const query = `
            UPDATE almox.certificados 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await pool.query(query, params);

        // Só a data de vencimento muda o status de um certificado. Editar o
        // número ou anexar o PDF não é mudança de status, e avisar por isso
        // seria ruído — quem recebe deixaria de ler os avisos que importam.
        await avisarStatusCertificado(
            result.rows[0],
            req.body?.usuario_nome || null,
            certAntes.data_vencimento
        );

        console.log("OK: Certificado atualizado ID:", id);
        res.json(result.rows[0]);
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ 
            erro: "Erro ao atualizar certificado",
            detalhe: err.message 
        });
    }
});

app.delete("/certificados/:id", async (req, res) => {
    console.log("DELETE /api/certificados/" + req.params.id);
    
    try {
        const { id } = req.params;

        const existe = await pool.query(
            "SELECT id FROM almox.certificados WHERE id = $1",
            [id]
        );
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Certificado não encontrado" });
        }

        await pool.query("DELETE FROM almox.certificados WHERE id = $1", [id]);

        console.log("OK: Certificado excluído ID:", id);
        res.json({ sucesso: true });
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// MIGRAÇÕES LEVES (executadas na inicialização)
// ============================================================
async function garantirColunaTelefone() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

// Colunas de saída/retorno de calibração e múltiplas baias por OS
async function garantirColunasExtras() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

// Status antigos removidos (em_planejamento, em_andamento, aguardando_separacao):
// migra os registros existentes para o status equivalente do novo conjunto.
// "aguardando_conferencia" já é o status inicial usado pela criação de OS —
// os antigos representavam o mesmo estado ("ainda não separada").
async function migrarStatusAntigosDaOS() {
    try {
        const r = await pool.query(
            `UPDATE almox.solicitacoes
                SET status = 'aguardando_conferencia', updated_at = CURRENT_TIMESTAMP
              WHERE status IN ('em_planejamento', 'em_andamento', 'aguardando_separacao')`
        );
        if (r.rowCount) console.log(`OK: ${r.rowCount} OS migradas de status antigo para 'aguardando_conferencia'`);
    } catch (e) {
        console.warn("AVISO: Migração de status antigos ignorada:", e.message);
    }
}


// ============================================================
// LOGS DE ATIVIDADE DOS COLABORADORES
// ============================================================
let logsTabelaOk = false;
async function garantirTabelaLogs() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

// ------------------------------------------------------------
// LOG ESCRITO PELO PRÓPRIO SERVIDOR
//
// O interceptador de fetch do navegador (public/almoxarife/logs.js) cobre o
// que passa pela tela, mas há coisa que nasce no servidor e nunca passaria
// por ele: login (inclusive o por reconhecimento facial), decisões tomadas em
// rotas próprias, avisos automáticos. Sem isto, essas ações simplesmente não
// existiam na aba "Logs".
//
// Nunca lança: log é registro, não regra de negócio — falhar ao registrar não
// pode derrubar a operação que estava sendo registrada.
// ------------------------------------------------------------
async function registrarLogServidor(dados) {
    try {
        await garantirTabelaLogs();
        const d = dados || {};
        await pool.query(`
            INSERT INTO almox.logs_atividade
                (usuario_id, usuario_nome, usuario_cargo, acao, modulo, entidade, descricao, detalhes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [
            Number.isInteger(parseInt(d.usuario_id)) ? parseInt(d.usuario_id) : null,
            d.usuario_nome || 'Sistema',
            d.usuario_cargo || null,
            String(d.acao || 'acesso').slice(0, 80),
            d.modulo || null,
            d.entidade || null,
            d.descricao || null,
            d.detalhes ? JSON.stringify(d.detalhes) : null
        ]);
    } catch (err) {
        console.warn("AVISO: não foi possível registrar o log:", err.message);
    }
}

app.post("/logs", async (req, res) => {
    try {
        await garantirTabelaLogs();
        const b = req.body || {};
        if (!b.acao) return res.status(400).json({ erro: "Campo 'acao' é obrigatório" });
        const r = await pool.query(`
            INSERT INTO almox.logs_atividade (usuario_id, usuario_nome, usuario_cargo, acao, modulo, entidade, descricao, detalhes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
        `, [
            b.usuario_id || null,
            b.usuario_nome || 'Desconhecido',
            b.usuario_cargo || null,
            String(b.acao).slice(0, 80),
            b.modulo || null,
            b.entidade || null,
            b.descricao || null,
            b.detalhes ? JSON.stringify(b.detalhes) : null
        ]);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: POST /api/logs:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.get("/logs", async (req, res) => {
  const chaveLogs = "logs:" + JSON.stringify(req.query || {});
  return cache.responderComCache(req, res, "logs", chaveLogs, async () => {
        await garantirTabelaLogs();
        const limite = Math.min(parseInt(req.query.limite, 10) || 300, 1000);
        const cond = [];
        const vals = [];
        if (req.query.usuario_id) { vals.push(req.query.usuario_id); cond.push(`usuario_id = $${vals.length}`); }
        if (req.query.usuario_nome) { vals.push(req.query.usuario_nome); cond.push(`usuario_nome = $${vals.length}`); }
        if (req.query.acao) { vals.push(req.query.acao); cond.push(`acao = $${vals.length}`); }
        if (req.query.modulo) { vals.push(req.query.modulo); cond.push(`modulo = $${vals.length}`); }
        if (req.query.de) { vals.push(req.query.de); cond.push(`criado_em >= $${vals.length}`); }
        if (req.query.ate) { vals.push(req.query.ate); cond.push(`criado_em < ($${vals.length}::date + interval '1 day')`); }
        vals.push(limite);
        const sql = `SELECT * FROM almox.logs_atividade ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY criado_em DESC LIMIT $${vals.length}`;
        const r = await pool.query(sql, vals);
        return r.rows;
  });
});

app.delete("/logs", async (req, res) => {
    try {
        await garantirTabelaLogs();
        const de = req.query.de || (req.body && req.body.de);
        const ate = req.query.ate || (req.body && req.body.ate);

        // Período é obrigatório para evitar exclusões acidentais do log inteiro
        if (!de || !ate) {
            return res.status(400).json({ erro: "Informe as datas 'de' e 'ate' para limpar o log." });
        }

        const r = await pool.query(
            `DELETE FROM almox.logs_atividade
             WHERE criado_em >= $1::date AND criado_em < ($2::date + interval '1 day')`,
            [de, ate]
        );
        res.json({ sucesso: true, removidos: r.rowCount });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// MANUTENÇÕES DOS INSTRUMENTOS (por TAG)
// ============================================================
// ============================================================
// ESTADO DA FERRAMENTA NAS DEVOLUÇÕES, RETIRADAS E BIPAGENS
//
//   'ok'                  Bom / em ordem.
//   'avariado'            Só volta a servir depois de manutenção. Entra na
//                         fila de "necessita manutenção" (status 'avariado').
//   'avariado_utilizavel' Tem avaria, mas continua dando conta do recado.
//                         O status volta para 'disponivel' e ela NÃO aparece
//                         como manutenção pendente; a avaria fica gravada na
//                         ferramenta e é mostrada onde a TAG aparece.
//
// Tudo que grava condição de ferramenta passa por aqui, para as três telas
// (retirada parcial, devolução parcial, devolutiva e remanejamento) tratarem
// os mesmos três valores da mesma forma.
// ============================================================
const ESTADO_OK = 'ok';
const ESTADO_AVARIADO = 'avariado';
const ESTADO_AVARIADO_UTILIZAVEL = 'avariado_utilizavel';

function normalizarEstadoFerramenta(valor) {
    const v = String(valor == null ? '' : valor).trim().toLowerCase();
    if (['avariado_utilizavel', 'avariada_utilizavel', 'avaria_utilizavel',
         'avariado-utilizavel', 'avariado_usavel'].includes(v)) {
        return ESTADO_AVARIADO_UTILIZAVEL;
    }
    if (['avariado', 'avariada', 'danificado', 'danificada'].includes(v)) return ESTADO_AVARIADO;
    return ESTADO_OK;
}

// Status que a ferramenta assume no Inventário. Repare que
// 'avariado_utilizavel' devolve 'disponivel' — é essa linha que decide que a
// avaria "leve" não vira manutenção pendente.
function statusPorEstadoFerramenta(valor) {
    return normalizarEstadoFerramenta(valor) === ESTADO_AVARIADO ? 'avariado' : 'disponivel';
}

function estadoEhAvariaUtilizavel(valor) {
    return normalizarEstadoFerramenta(valor) === ESTADO_AVARIADO_UTILIZAVEL;
}

// Os DOIS estados de avaria contam como avaria para quem é avisado por
// e-mail: a diferença entre elas é o destino da ferramenta, não o fato de
// ela ter voltado danificada.
function ehEstadoAvariado(valor) {
    const v = normalizarEstadoFerramenta(valor);
    return v === ESTADO_AVARIADO || v === ESTADO_AVARIADO_UTILIZAVEL;
}

// Grava (ou apaga) na ferramenta a avaria que não impede o uso.
// Estado 'ok' limpa a marca; 'avariado' também limpa, porque nesse caso quem
// passa a responder pela ferramenta é a fila de manutenção.
async function registrarAvariaUtilizavel(ferramentaId, estado, observacao, data) {
    if (!ferramentaId) return;
    if (estadoEhAvariaUtilizavel(estado)) {
        await pool.query(
            `UPDATE almox.ferramentas
                SET avaria_utilizavel = TRUE,
                    avaria_observacao = $1,
                    avaria_registrada_em = COALESCE($2::date, CURRENT_DATE),
                    atualizado_em = CURRENT_TIMESTAMP
              WHERE id = $3`,
            [observacao ? String(observacao).trim() : null, data || null, ferramentaId]
        );
        return;
    }
    await pool.query(
        `UPDATE almox.ferramentas
            SET avaria_utilizavel = FALSE,
                avaria_observacao = NULL,
                avaria_registrada_em = NULL,
                atualizado_em = CURRENT_TIMESTAMP
          WHERE id = $1 AND avaria_utilizavel = TRUE`,
        [ferramentaId]
    );
}

let manutencoesTabelaOk = false;
async function garantirTabelaManutencoes() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

// Enquanto a ferramenta estiver fora para manutenção (data_envio preenchida
// e data_retorno ainda não), ela deixa de aparecer como disponível na
// baia/localização anterior. Ao voltar (data_retorno preenchida), volta a
// ficar disponível no almoxarifado — mesmo padrão já usado por calibração
// (data_envio_calibracao/data_retorno_calibracao).
async function _sincronizarLocalizacaoManutencao(instrumentoId, dataEnvio, dataRetorno) {
    if (!instrumentoId) return;

    const hoje = hojeISO();
    const envio = dataEnvio ? String(dataEnvio).slice(0, 10) : null;
    const retorno = dataRetorno ? String(dataRetorno).slice(0, 10) : null;

    // A data de retorno é o retorno PREVISTO. Enquanto ela não chega, a
    // ferramenta continua fora da empresa — antes, preencher os dois campos
    // (envio 16/08, retorno 30/08) devolvia a ferramenta ao almoxarifado na
    // hora, e a Localização nunca mostrava o período de manutenção.
    const jaSaiu = !!envio && envio <= hoje;
    const jaVoltou = !!retorno && retorno < hoje;
    const foraAgora = jaSaiu && !jaVoltou;

    try {
        if (foraAgora) {
            await pool.query(
                "UPDATE almox.ferramentas SET status = 'em_manutencao', localizacao_atual = 'Em manutenção', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1",
                [instrumentoId]
            );
        } else if (jaVoltou) {
            await pool.query(
                "UPDATE almox.ferramentas SET status = 'disponivel', localizacao_atual = 'Almoxarifado', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'em_manutencao'",
                [instrumentoId]
            );
        }
        // Envio marcado para o futuro: nada muda hoje. A Localização já mostra
        // "Em manutenção" no dia certo, a partir do período do cadastro.
    } catch (e) {
        console.warn("AVISO: Não foi possível sincronizar localização de manutenção:", e.message);
    }
}

// ============================================================
// Ferramentas fora da empresa por manutenção têm de sair do almoxarifado
// SOZINHAS, quando o dia chega — ninguém vai reabrir o cadastro só para isso.
// Roda na subida e a cada hora: entra quem passou da data de envio, sai quem
// passou da data de retorno.
// ============================================================
async function sincronizarManutencoesDoDia() {
    try {
        await garantirTabelaManutencoes();

        const saiu = await pool.query(`
            UPDATE almox.ferramentas f
               SET status = 'em_manutencao',
                   localizacao_atual = 'Em manutenção',
                   atualizado_em = CURRENT_TIMESTAMP
             WHERE f.status <> 'em_manutencao'
               AND EXISTS (
                    SELECT 1 FROM almox.manutencoes m
                     WHERE (m.instrumento_id = f.id
                            OR UPPER(COALESCE(m.tag, '')) = UPPER(COALESCE(f.tag, '')))
                       AND m.data_envio IS NOT NULL
                       AND m.data_envio <= CURRENT_DATE
                       AND (m.data_retorno IS NULL OR m.data_retorno >= CURRENT_DATE)
               )
        `);

        const voltou = await pool.query(`
            UPDATE almox.ferramentas f
               SET status = 'disponivel',
                   localizacao_atual = 'Almoxarifado',
                   atualizado_em = CURRENT_TIMESTAMP
             WHERE f.status = 'em_manutencao'
               AND NOT EXISTS (
                    SELECT 1 FROM almox.manutencoes m
                     WHERE (m.instrumento_id = f.id
                            OR UPPER(COALESCE(m.tag, '')) = UPPER(COALESCE(f.tag, '')))
                       AND m.data_envio IS NOT NULL
                       AND m.data_envio <= CURRENT_DATE
                       AND (m.data_retorno IS NULL OR m.data_retorno >= CURRENT_DATE)
               )
        `);

        if (saiu.rowCount || voltou.rowCount) {
            console.log(`Manutenção sincronizada: ${saiu.rowCount} saiu(ram), ${voltou.rowCount} voltou(aram)`);
            cache.invalidar("ferramentas", "manutencoes");
        }
    } catch (e) {
        console.warn("AVISO: Sincronização de manutenções ignorada:", e.message);
    }
}

app.get("/manutencoes", async (req, res) => {
    const chave = "manutencoes:lista:" + (req.query.tag || "todas");
    return cache.responderComCache(req, res, "manutencoes", chave, async () => {
        await garantirTabelaManutencoes();
        const vals = [];
        let where = '';
        if (req.query.tag) { vals.push(req.query.tag); where = 'WHERE tag = $1'; }
        const r = await pool.query(
            `SELECT * FROM almox.manutencoes ${where} ORDER BY data_manutencao DESC NULLS LAST, id DESC`,
            vals
        );
        return r.rows;
    });
});

app.post("/manutencoes", async (req, res) => {
    try {
        await garantirTabelaManutencoes();
        const b = req.body || {};
        if (!b.tag) return res.status(400).json({ erro: "Campo 'tag' é obrigatório" });

        // Dois tipos de registro:
        //   'manutencao'        — o de sempre; a data da manutenção é obrigatória.
        //   'avaria_utilizavel' — a avaria foi anotada e a ferramenta continua
        //                         em uso. Só a emissão tem data; a data da
        //                         manutenção fica EM ABERTO até a ferramenta
        //                         de fato ir para a oficina.
        const tipoRegistro = String(b.tipo || 'manutencao').trim().toLowerCase() === 'avaria_utilizavel'
            ? 'avaria_utilizavel' : 'manutencao';
        const dataManutencao = b.data_manutencao || null;
        if (tipoRegistro === 'manutencao' && !dataManutencao) {
            return res.status(400).json({ erro: "Campo 'data_manutencao' é obrigatório" });
        }
        if (tipoRegistro === 'avaria_utilizavel' && !b.data_emissao) {
            return res.status(400).json({ erro: "Campo 'data_emissao' é obrigatório" });
        }

        const r = await pool.query(`
            INSERT INTO almox.manutencoes (tag, instrumento_id, data_emissao, data_manutencao, data_envio, data_retorno, empresa, observacao, valor, responsavel, comprovante, tipo)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
        `, [
            String(b.tag).slice(0, 120),
            b.instrumento_id || null,
            b.data_emissao || null,
            dataManutencao,
            b.data_envio || null,
            b.data_retorno || null,
            b.empresa || null,
            b.observacao || null,
            Number(b.valor) || 0,
            b.responsavel || null,
            b.comprovante || null,
            tipoRegistro
        ]);

        if (b.instrumento_id) {
            if (tipoRegistro === 'avaria_utilizavel') {
                // A ferramenta segue em uso: nada de status 'avariado' (que a
                // jogaria na fila de manutenção pendente). Só a marca de avaria.
                await registrarAvariaUtilizavel(
                    b.instrumento_id, ESTADO_AVARIADO_UTILIZAVEL,
                    b.observacao || null, b.data_emissao || null
                );
            } else {
                // Manutenção já realizada (data não é futura): a ferramenta sai
                // da fila e qualquer avaria anotada antes fica resolvida.
                const jaRealizada = String(dataManutencao).slice(0, 10) <= new Date().toISOString().slice(0, 10);
                if (jaRealizada) {
                    await pool.query(
                        "UPDATE almox.ferramentas SET status = 'disponivel', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'avariado'",
                        [b.instrumento_id]
                    );
                    await registrarAvariaUtilizavel(b.instrumento_id, ESTADO_OK);
                }
            }
        }

        await _sincronizarLocalizacaoManutencao(b.instrumento_id, b.data_envio, b.data_retorno);

        cache.invalidar("manutencoes", "ferramentas");
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: POST /api/manutencoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.put("/manutencoes/:id", async (req, res) => {
    try {
        await garantirTabelaManutencoes();
        const b = req.body || {};
        const r = await pool.query(`
            UPDATE almox.manutencoes
               SET tag = COALESCE($1, tag),
                   instrumento_id = COALESCE($2, instrumento_id),
                   data_emissao = COALESCE($3, data_emissao),
                   data_manutencao = COALESCE($4, data_manutencao),
                   data_envio = $5,
                   data_retorno = $6,
                   empresa = COALESCE($7, empresa),
                   observacao = COALESCE($8, observacao),
                   valor = COALESCE($9, valor),
                   responsavel = COALESCE($10, responsavel),
                   comprovante = COALESCE($11, comprovante),
                   tipo = COALESCE($13, tipo)
             WHERE id = $12
         RETURNING *
        `, [
            b.tag ? String(b.tag).slice(0, 120) : null,
            b.instrumento_id || null,
            b.data_emissao || null,
            b.data_manutencao || null,
            b.data_envio || null,
            b.data_retorno || null,
            b.empresa || null,
            b.observacao || null,
            (b.valor === undefined || b.valor === null) ? null : Number(b.valor),
            b.responsavel || null,
            b.comprovante || null,
            req.params.id,
            b.tipo ? String(b.tipo).trim().toLowerCase() : null
        ]);
        if (!r.rows.length) return res.status(404).json({ erro: "Manutenção não encontrada" });

        // Preencher a data da manutenção fecha o caso: a avaria que era só
        // "anotada" virou manutenção de verdade e a marca sai da ferramenta.
        const reg = r.rows[0];
        if (reg.instrumento_id) {
            if (String(reg.tipo || 'manutencao') === 'avaria_utilizavel' && !reg.data_manutencao) {
                await registrarAvariaUtilizavel(
                    reg.instrumento_id, ESTADO_AVARIADO_UTILIZAVEL,
                    reg.observacao || null, reg.data_emissao || null
                );
            } else if (reg.data_manutencao
                && String(reg.data_manutencao instanceof Date
                    ? reg.data_manutencao.toISOString() : reg.data_manutencao).slice(0, 10)
                   <= new Date().toISOString().slice(0, 10)) {
                await pool.query(
                    "UPDATE almox.ferramentas SET status = 'disponivel', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'avariado'",
                    [reg.instrumento_id]
                );
                await registrarAvariaUtilizavel(reg.instrumento_id, ESTADO_OK);
            }
        }

        await _sincronizarLocalizacaoManutencao(r.rows[0].instrumento_id, r.rows[0].data_envio, r.rows[0].data_retorno);

        cache.invalidar("manutencoes", "ferramentas");
        res.json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: PUT /api/manutencoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.delete("/manutencoes/:id", async (req, res) => {
    try {
        await garantirTabelaManutencoes();
        // Apagar o registro de uma avaria "ainda utilizável" também apaga a
        // marca na ferramenta — senão ela ficaria sinalizada para sempre sem
        // nada no histórico que explicasse o porquê.
        const antes = await pool.query("SELECT instrumento_id, tipo FROM almox.manutencoes WHERE id = $1", [req.params.id]);
        await pool.query("DELETE FROM almox.manutencoes WHERE id = $1", [req.params.id]);
        const alvo = antes.rows[0];
        if (alvo && alvo.instrumento_id && String(alvo.tipo || '') === 'avaria_utilizavel') {
            await registrarAvariaUtilizavel(alvo.instrumento_id, ESTADO_OK);
        }
        // Sem o registro, o período fora da empresa deixa de existir: a
        // ferramenta precisa voltar ao almoxarifado na hora.
        await sincronizarManutencoesDoDia();
        cache.invalidar("manutencoes", "ferramentas");
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// RASTREABILIDADE / REMANEJAMENTO DE FERRAMENTAS
// Histórico persistido no banco (substitui o localStorage)
// ============================================================
// ============================================================
// BIPAGEM POR ATIVO — 1 código de barras válido para TODO o tipo,
// independente de qual unidade/TAG específica seja
// ============================================================
let ativoCodigoBarrasTabelaOk = false;
async function garantirTabelaAtivoCodigoBarras() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

app.get("/ativos/:tipo/codigo-barras", async (req, res) => {
    try {
        await garantirTabelaAtivoCodigoBarras();
        const tipo = decodeURIComponent(req.params.tipo || "");
        const r = await pool.query("SELECT codigo_barras FROM almox.ativo_codigos_barras WHERE tipo = $1", [tipo]);
        res.json({ tipo, codigo_barras: r.rows[0]?.codigo_barras || null });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.put("/ativos/:tipo/codigo-barras", async (req, res) => {
    try {
        await garantirTabelaAtivoCodigoBarras();
        const tipo = decodeURIComponent(req.params.tipo || "");
        const codigo = (req.body?.codigo_barras || '').trim() || null;

        if (codigo) {
            const emUsoAtivo = await pool.query(
                "SELECT tipo FROM almox.ativo_codigos_barras WHERE codigo_barras = $1 AND tipo != $2",
                [codigo, tipo]
            );
            if (emUsoAtivo.rows.length) {
                return res.status(409).json({ erro: `Código já usado pelo ativo "${emUsoAtivo.rows[0].tipo}"` });
            }
            const emUsoFerramenta = await pool.query("SELECT tag FROM almox.ferramentas WHERE codigo_barras = $1", [codigo]);
            if (emUsoFerramenta.rows.length) {
                return res.status(409).json({ erro: `Código já usado pela TAG "${emUsoFerramenta.rows[0].tag}"` });
            }
        }

        const r = await pool.query(`
            INSERT INTO almox.ativo_codigos_barras (tipo, codigo_barras, atualizado_em)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (tipo) DO UPDATE SET codigo_barras = $2, atualizado_em = CURRENT_TIMESTAMP
            RETURNING *
        `, [tipo, codigo]);

        res.json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: PUT /api/ativos/:tipo/codigo-barras:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

let remanejamentosTabelaOk = false;
async function garantirTabelaRemanejamentos() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

// ------------------------------------------------------------
// REMANEJAMENTO QUE VIRA ITEM DE OS
//
// Quando a passagem tem uma OBRA DE DESTINO, a ferramenta passa a pertencer
// àquela O.S.: ela entra em `instrumentos` (como inclusão parcial, para não
// se confundir com o que foi separado no começo) e passa a ser exigida na
// bipagem da devolutiva daquela obra. É isso que dá a rastreabilidade pedida
// — o AIF-02 remanejado para a obra Abrava vira ferramenta da Abrava.
//
// Sem obra de destino a ferramenta fica "na mão" de quem recebeu, e a
// devolução é feita por ele mesmo, pela aba "Estou devolvendo".
// ------------------------------------------------------------
async function anexarFerramentaNaOS(osId, mov, usuario) {
    const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [osId]);
    if (!osRes.rows.length) return null;
    const os = osRes.rows[0];

    const fRes = await pool.query("SELECT * FROM almox.ferramentas WHERE id = $1", [mov.ferramenta_id]);
    const f = fRes.rows[0];
    if (!f) return null;

    const instrumentos = normalizarInstrumentosOS(os);
    const inclusoes = jsonArray(os.inclusoes_parciais);

    // Já pertence a esta OS: nada a fazer (o movimento continua no histórico).
    if (instrumentos.some(x => mesmoItem(x, f))) return os;

    const registro = {
        id: f.id,
        ferramenta_id: f.id,
        tag: f.tag,
        tipo: f.tipo,
        data_saida: hojeISO(),
        motivo: mov.motivo || `Remanejada de ${mov.origem || 'Almoxarifado'}`,
        observacao: mov.observacao || null,
        status_item: STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO,
        origem_remanejamento: {
            remanejamento_id: mov.id,
            origem: mov.origem || null,
            destino: mov.destino || null,
            enviado_por: mov.responsavel || null,
            recebido_por: mov.destinatario || null,
            data: hojeISO()
        },
        incluido_em: new Date().toISOString(),
        incluido_por: usuario || mov.destinatario || mov.responsavel || null
    };

    instrumentos.push({ id: f.id, tag: f.tag, tipo: f.tipo, status_item: STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO });
    inclusoes.push(registro);

    await pool.query(`
        UPDATE almox.solicitacoes
           SET instrumentos = $1::jsonb,
               inclusoes_parciais = $2::jsonb,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
    `, [JSON.stringify(instrumentos), JSON.stringify(inclusoes), os.id]);

    const destino = os.obra || os.cliente || 'Campo';
    await pool.query(
        "UPDATE almox.ferramentas SET status = 'em_campo', localizacao_atual = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
        [destino, f.id]
    );

    await registrarHistoricoOS({
        solicitacao_id: os.id,
        numero_os: os.numero_os,
        evento: 'remanejamento_recebido',
        ferramenta_id: f.id,
        tag: f.tag,
        tipo: f.tipo,
        status_item: STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO,
        motivo: registro.motivo,
        observacao: [
            mov.origem ? `Origem: ${mov.origem}` : null,
            mov.responsavel ? `Enviada por ${mov.responsavel}` : null,
            mov.destinatario ? `Recebida por ${mov.destinatario}` : null
        ].filter(Boolean).join(' · ') || null,
        data_evento: hojeISO(),
        usuario: usuario || mov.destinatario || mov.responsavel || null
    });

    return os;
}

// ------------------------------------------------------------
// A OS em que a ferramenta está AGORA
//
// Serve para o outro lado do remanejamento: quando a ferramenta sai de uma
// obra, é preciso saber de qual OS ela está saindo para registrar a baixa lá.
// Vale a OS aberta mais recente que ainda tem a TAG e da qual ela ainda não
// saiu (nem devolvida, nem retirada, nem remanejada).
// ------------------------------------------------------------
const OS_ENCERRADAS = ['concluida', 'concluido', 'concluída', 'cancelada',
                       'cancelado', 'reprovada', 'descontinuada'];

async function osAtualDaFerramenta(ferramenta) {
    if (!ferramenta) return null;
    const r = await pool.query(
        `SELECT * FROM almox.solicitacoes
          WHERE LOWER(TRIM(COALESCE(status, ''))) <> ALL($1::text[])
          ORDER BY id DESC LIMIT 300`,
        [OS_ENCERRADAS]
    );
    for (const os of r.rows) {
        if (!normalizarInstrumentosOS(os).some(x => mesmoItem(x, ferramenta))) continue;
        const jaSaiu = jsonArray(os.devolutiva).some(x => mesmoItem(x, ferramenta))
            || jsonArray(os.retiradas_parciais).some(x => mesmoItem(x, ferramenta))
            || jsonArray(os.devolucoes_parciais).some(x => mesmoItem(x, ferramenta))
            || jsonArray(os.saidas_remanejamento).some(x => mesmoItem(x, ferramenta));
        if (!jaSaiu) return os;
    }
    return null;
}

// ------------------------------------------------------------
// REMANEJAMENTO QUE SAI DE UMA OS
//
// O espelho de anexarFerramentaNaOS. A ferramenta remanejada deixa de ser
// cobrada na devolutiva da obra de origem, mas continua no histórico dela
// marcada como saída por remanejamento — com o destino e quem enviou/recebeu.
// ------------------------------------------------------------
async function registrarSaidaPorRemanejamento(mov, usuario) {
    if (!mov || !mov.ferramenta_id) return null;

    const fRes = await pool.query("SELECT * FROM almox.ferramentas WHERE id = $1", [mov.ferramenta_id]);
    const f = fRes.rows[0];
    if (!f) return null;

    const os = await osAtualDaFerramenta(f);
    if (!os) return null;
    // Remanejar para a própria OS não é saída de lugar nenhum.
    if (mov.os_destino_id && String(mov.os_destino_id) === String(os.id)) return null;

    const instrumentos = normalizarInstrumentosOS(os);
    const saidas = jsonArray(os.saidas_remanejamento);
    if (saidas.some(x => mesmoItem(x, f))) return os;

    let destinoOS = null;
    if (mov.os_destino_id) {
        const d = await pool.query(
            "SELECT id, numero_os, obra, cliente FROM almox.solicitacoes WHERE id = $1",
            [mov.os_destino_id]
        );
        destinoOS = d.rows[0] || null;
    }

    const registro = {
        id: f.id,
        ferramenta_id: f.id,
        tag: f.tag,
        tipo: f.tipo,
        data_saida: hojeISO(),
        motivo: mov.motivo || 'Remanejamento',
        observacao: mov.observacao || null,
        status_item: STATUS_ITEM_OS.SAIDA_REMANEJAMENTO,
        remanejamento_id: mov.id,
        origem: mov.origem || os.obra || os.cliente || null,
        destino: mov.destino || null,
        os_destino_id: destinoOS ? destinoOS.id : null,
        os_destino_numero: destinoOS ? destinoOS.numero_os : null,
        os_destino_obra: destinoOS ? (destinoOS.obra || destinoOS.cliente) : null,
        enviado_por: mov.responsavel || usuario || null,
        recebido_por: mov.destinatario || null,
        registrado_em: new Date().toISOString()
    };

    saidas.push(registro);
    const alvo = instrumentos.find(x => mesmoItem(x, f));
    if (alvo) alvo.status_item = STATUS_ITEM_OS.SAIDA_REMANEJAMENTO;

    await pool.query(`
        UPDATE almox.solicitacoes
           SET instrumentos = $1::jsonb,
               saidas_remanejamento = $2::jsonb,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
    `, [JSON.stringify(instrumentos), JSON.stringify(saidas), os.id]);

    await registrarHistoricoOS({
        solicitacao_id: os.id,
        numero_os: os.numero_os,
        evento: 'saida_remanejamento',
        ferramenta_id: f.id,
        tag: f.tag,
        tipo: f.tipo,
        status_item: STATUS_ITEM_OS.SAIDA_REMANEJAMENTO,
        motivo: registro.motivo,
        observacao: [
            registro.os_destino_obra
                ? `Destino: ${registro.os_destino_obra} (#OS-${String(registro.os_destino_numero || "").padStart(4, "0")})`
                : (registro.destino ? `Destino: ${registro.destino}` : null),
            registro.enviado_por ? `Enviada por ${registro.enviado_por}` : null,
            registro.recebido_por ? `Recebida por ${registro.recebido_por}` : null,
            mov.observacao || null
        ].filter(Boolean).join(' · ') || null,
        data_evento: registro.data_saida,
        usuario: usuario || mov.responsavel || null
    });

    return os;
}

// Carimbo único de uma remessa de remanejamento: todas as ferramentas
// enviadas na MESMA chamada compartilham este id, e é por ele que a tela
// junta as linhas num cartão só.
function novoGrupoRemanejamento() {
    return `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Registra um movimento e atualiza a localização atual da ferramenta
async function registrarMovimento(mov) {
    await garantirTabelaRemanejamentos();
    const r = await pool.query(`
        INSERT INTO almox.remanejamentos
        (ferramenta_id, tag, tipo, origem, destino, os_origem, os_destino, motivo, observacao,
         responsavel, destinatario, status, origem_evento, confirmado_em, os_destino_id,
         solicitado_por, solicitado_em, enviado_por, enviado_em, grupo_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING *
    `, [
        mov.ferramenta_id || null,
        mov.tag || null,
        mov.tipo || null,
        mov.origem || null,
        mov.destino || null,
        mov.os_origem || null,
        mov.os_destino || null,
        mov.motivo || null,
        mov.observacao || null,
        mov.responsavel || null,
        mov.destinatario || null,
        mov.status || 'confirmado',
        mov.origem_evento || 'remanejamento',
        (mov.status || 'confirmado') === 'confirmado' ? new Date() : null,
        mov.os_destino_id || null,
        mov.solicitado_por || null,
        mov.solicitado_por ? new Date() : null,
        mov.enviado_por || null,
        mov.enviado_por ? new Date() : null,
        mov.grupo_id || novoGrupoRemanejamento()
    ]);

    if ((mov.status || 'confirmado') === 'confirmado' && mov.destino) {
        if (mov.ferramenta_id) {
            await pool.query("UPDATE almox.ferramentas SET localizacao_atual = $1 WHERE id = $2", [mov.destino, mov.ferramenta_id]);
        } else if (mov.tag) {
            await pool.query("UPDATE almox.ferramentas SET localizacao_atual = $1 WHERE tag = $2", [mov.destino, mov.tag]);
        }
    }
    return r.rows[0];
}

app.get("/remanejamentos", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const cond = [];
        const vals = [];
        if (req.query.tag) { vals.push(req.query.tag); cond.push(`tag = $${vals.length}`); }
        if (req.query.status) { vals.push(req.query.status); cond.push(`status = $${vals.length}`); }
        if (req.query.destinatario) { vals.push(req.query.destinatario); cond.push(`destinatario = $${vals.length}`); }
        const limite = Math.min(parseInt(req.query.limite, 10) || 500, 2000);
        vals.push(limite);
        const r = await pool.query(
            `SELECT * FROM almox.remanejamentos ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
             ORDER BY criado_em DESC, id DESC LIMIT $${vals.length}`,
            vals
        );
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: GET /api/remanejamentos:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.post("/remanejamentos", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const itens = Array.isArray(b.itens) && b.itens.length ? b.itens : [b];
        // Uma passagem = uma remessa, por mais ferramentas que ela tenha.
        const grupo = novoGrupoRemanejamento();
        const criados = [];
        for (const it of itens) {
            if (!it.tag && !it.ferramenta_id) continue;
            let ferramenta = null;
            const busca = it.ferramenta_id
                ? await pool.query("SELECT id, tag, tipo, localizacao_atual FROM almox.ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT id, tag, tipo, localizacao_atual FROM almox.ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag).trim()]);
            ferramenta = busca.rows[0] || null;
            if (!ferramenta) continue;
            criados.push(await registrarMovimento({
                ferramenta_id: ferramenta.id,
                tag: ferramenta.tag,
                tipo: ferramenta.tipo,
                origem: it.origem || ferramenta.localizacao_atual || 'Almoxarifado',
                destino: it.destino || b.destino || null,
                os_origem: it.os_origem || b.os_origem || null,
                os_destino: it.os_destino || b.os_destino || null,
                motivo: it.motivo || b.motivo || null,
                observacao: it.observacao || b.observacao || null,
                responsavel: it.responsavel || b.responsavel || null,
                destinatario: it.destinatario || b.destinatario || null,
                status: it.status || b.status || 'pendente',
                origem_evento: it.origem_evento || b.origem_evento || 'remanejamento',
                os_destino_id: it.os_destino_id || b.os_destino_id || null,
                solicitado_por: it.solicitado_por || b.solicitado_por || null,
                enviado_por: it.enviado_por || b.enviado_por || null,
                grupo_id: grupo
            }));
        }
        if (!criados.length) return res.status(400).json({ erro: "Nenhuma ferramenta válida informada" });

        // A ferramenta sai da obra no momento em que é passada adiante, não
        // quando o outro lado confirma: a baixa na OS de origem é registrada
        // aqui, e é ela que tira a TAG da devolutiva daquela obra.
        //
        // Exceção: o movimento que ainda é só uma SOLICITAÇÃO (o gestor montou,
        // mas o responsável não enviou) não dá baixa nenhuma — a ferramenta
        // continua onde está até alguém de fato passá-la adiante.
        for (const mov of criados) {
            if (String(mov.status || '').toLowerCase() === 'solicitado') continue;
            if (String(mov.origem_evento || 'remanejamento') === 'remanejamento') {
                await registrarSaidaPorRemanejamento(mov, b.responsavel || null);
            }
        }

        // Passagem SEM responsável a confirmar (só obra de destino): já nasce
        // confirmada, então a ferramenta entra na OS de destino agora.
        for (const mov of criados) {
            if (mov.os_destino_id && String(mov.status).toLowerCase() === 'confirmado') {
                await anexarFerramentaNaOS(mov.os_destino_id, mov, b.responsavel || null);
            }
        }

        // Quem vai receber a ferramenta é identificado por nome no
        // remanejamento; a notificação precisa do id do usuário.
        const aConfirmar = criados.filter(m => String(m.status).toLowerCase() === 'pendente' && m.destinatario);
        if (aConfirmar.length) {
            const nomes = Array.from(new Set(aConfirmar.map(m => String(m.destinatario).trim())));
            const alvos = await pool.query(
                "SELECT id FROM almox.usuarios WHERE ativo = TRUE AND LOWER(nome) = ANY($1::text[])",
                [nomes.map(n => n.toLowerCase())]
            );
            const tags = Array.from(new Set(aConfirmar.map(m => m.tag))).join(', ');
            await push.notificar(pool, 'remanejamento', {
                os: null,
                usuarioIds: alvos.rows.map(u => u.id),
                detalhe: `${tags} — Enviado por: ${b.responsavel || '—'}`
            });
        }

        cache.invalidar("solicitacoes", "ferramentas");
        res.status(201).json(criados);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.put("/remanejamentos/:id", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const atual = await pool.query("SELECT * FROM almox.remanejamentos WHERE id = $1", [req.params.id]);
        if (!atual.rows.length) return res.status(404).json({ erro: "Remanejamento não encontrado" });
        const reg = atual.rows[0];
        const novoStatus = b.status || reg.status;
        // Os dois usos de $1 precisam do MESMO cast explícito.
        //
        // Sem eles o Postgres deduz `varchar` em `status = $1` (pelo tipo da
        // coluna) e `text` em `$1 = 'confirmado'` (pela comparação com um
        // literal), e recusa a instrução inteira com
        // "inconsistent types deduced for parameter $1" (SQLSTATE 42P08).
        // Era esse o Erro 500 ao clicar em "Receber Instrumentos".
        // Receber é assinar um termo: quem confirma declara estar de acordo
        // ("recebimento_ciente") e, se a ferramenta chegou com avaria, anota
        // aqui ("recebimento_obs"). O que não for anotado nesse momento passa
        // a ser responsabilidade de quem recebeu — por isso os dois campos são
        // gravados junto com a confirmação, e não num update solto depois.
        const r = await pool.query(`
            UPDATE almox.remanejamentos
               SET status = $1::text,
                   observacao = COALESCE($2::text, observacao),
                   confirmado_em = CASE WHEN $1::text = 'confirmado'
                                        THEN CURRENT_TIMESTAMP ELSE confirmado_em END,
                   recebido_por  = CASE WHEN $1::text = 'confirmado'
                                        THEN COALESCE($4::text, recebido_por, destinatario)
                                        ELSE recebido_por END,
                   recebimento_obs    = CASE WHEN $1::text = 'confirmado'
                                             THEN COALESCE($5::text, recebimento_obs)
                                             ELSE recebimento_obs END,
                   recebimento_ciente = CASE WHEN $1::text = 'confirmado'
                                             THEN COALESCE($6::boolean, recebimento_ciente)
                                             ELSE recebimento_ciente END
             WHERE id = $3
         RETURNING *
        `, [
            novoStatus,
            b.observacao || null,
            req.params.id,
            b.usuario ? String(b.usuario).trim() : null,
            b.recebimento_obs ? String(b.recebimento_obs).trim() : null,
            typeof b.recebimento_ciente === 'boolean' ? b.recebimento_ciente : null
        ]);

        if (novoStatus === 'confirmado' && reg.destino) {
            await pool.query(
                "UPDATE almox.ferramentas SET localizacao_atual = $1 WHERE id = $2 OR UPPER(tag) = UPPER($3)",
                [reg.destino, reg.ferramenta_id || 0, reg.tag || '']
            );
        }

        // Recebimento confirmado E com obra de destino: quem assume a
        // devolução passa a ser a O.S. daquela obra — a ferramenta entra nela
        // e vai ser exigida na bipagem da devolutiva.
        if (novoStatus === 'confirmado' && reg.os_destino_id) {
            await anexarFerramentaNaOS(reg.os_destino_id, r.rows[0], b.usuario || reg.destinatario || null);
            cache.invalidar("solicitacoes", "ferramentas");
        }

        res.json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: PUT /api/remanejamentos:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/remanejamentos/excluir { ids: [...], grupo_id, usuario }
//
// Apaga um remanejamento do HISTÓRICO. É a única operação destrutiva do
// módulo, então ela é deliberadamente burra: remove as linhas e não desfaz
// nada do que aquele movimento causou (a ferramenta continua onde está, a
// O.S. que a recebeu continua com ela). Serve para limpar registro errado
// ou de teste — não para "cancelar" um remanejamento em andamento.
//
// Aceita os ids da remessa OU o grupo_id (que pega a remessa inteira).
// ------------------------------------------------------------
app.post("/remanejamentos/excluir", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(v => parseInt(v)).filter(Number.isInteger);
        const grupo = String(b.grupo_id || '').trim();
        if (!ids.length && !grupo) {
            return res.status(400).json({ erro: "Informe o remanejamento que deve ser excluído." });
        }

        const alvo = grupo
            ? await pool.query("SELECT * FROM almox.remanejamentos WHERE grupo_id = $1", [grupo])
            : await pool.query("SELECT * FROM almox.remanejamentos WHERE id = ANY($1::int[])", [ids]);
        if (!alvo.rows.length) return res.status(404).json({ erro: "Remanejamento não encontrado." });

        const apagar = alvo.rows.map(r => r.id);
        await pool.query("DELETE FROM almox.remanejamentos WHERE id = ANY($1::int[])", [apagar]);

        console.log(`Remanejamento excluído do histórico (${apagar.length} linha(s)) por ${b.usuario || '—'}`);
        cache.invalidar("solicitacoes", "ferramentas");
        res.json({ excluidos: apagar.length, ids: apagar });
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/excluir:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// SOLICITAÇÃO DE REMANEJAMENTO
//
// O gestor monta o remanejamento inteiro — obra de origem, quem envia, quem
// recebe, obra de destino e as ferramentas bipadas — e manda para o
// responsável apenas EXECUTAR. Ele não escolhe nada disso de novo: na aba
// "Estou Passando" os campos chegam travados, e o que ele faz é bipar as
// ferramentas que o gestor definiu.
//
//   solicitado -> pendente -> confirmado -> devolvido
//    (gestor)     (enviou)     (recebeu)    (devolveu)
//
// Enquanto o movimento é só "solicitado", nada muda de lugar: a ferramenta
// continua na obra de origem e a OS de lá continua cobrando a devolução dela.
// A baixa acontece no momento do envio, como em qualquer remanejamento.
// ============================================================

// GET /api/remanejamentos/solicitacoes?responsavel=NOME
// As solicitações que ESTE usuário precisa enviar.
app.get("/remanejamentos/solicitacoes", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const responsavel = String(req.query.responsavel || '').trim();
        const cond = ["status = 'solicitado'", "origem_evento = 'remanejamento'"];
        const vals = [];
        if (responsavel) {
            vals.push(responsavel);
            cond.push(`LOWER(TRIM(COALESCE(responsavel, ''))) = LOWER($${vals.length})`);
        }
        const r = await pool.query(
            `SELECT * FROM almox.remanejamentos WHERE ${cond.join(' AND ')}
              ORDER BY solicitado_em DESC NULLS LAST, id DESC LIMIT 300`,
            vals
        );
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: GET /api/remanejamentos/solicitacoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// POST /api/remanejamentos/solicitar
// body: { itens:[{ferramenta_id,tag}], origem, destino, os_destino_id,
//         responsavel (quem envia), destinatario (quem recebe),
//         solicitado_por (o gestor), observacao }
app.post("/remanejamentos/solicitar", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const origem = String(b.origem || '').trim();
        const responsavel = String(b.responsavel || '').trim();
        const destinatario = String(b.destinatario || '').trim();
        const solicitante = String(b.solicitado_por || '').trim();

        if (!origem) return res.status(400).json({ erro: "A obra de origem é obrigatória." });
        if (!responsavel) return res.status(400).json({ erro: "Informe o responsável que vai fazer o remanejamento." });
        if (!destinatario) return res.status(400).json({ erro: "Informe quem vai receber o remanejamento." });

        const itens = Array.isArray(b.itens) ? b.itens : [];
        if (!itens.length) return res.status(400).json({ erro: "Bipe pelo menos uma ferramenta." });

        // TODAS as ferramentas desta solicitação entram no mesmo grupo: é ele
        // que faz o responsável ver UM cartão com todas as TAGs, em vez de um
        // cartão por ferramenta.
        const grupo = novoGrupoRemanejamento();
        const criados = [];
        for (const it of itens) {
            const busca = it.ferramenta_id
                ? await pool.query("SELECT id, tag, tipo, localizacao_atual FROM almox.ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT id, tag, tipo, localizacao_atual FROM almox.ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag || '').trim()]);
            const ferramenta = busca.rows[0];
            if (!ferramenta) continue;
            criados.push(await registrarMovimento({
                ferramenta_id: ferramenta.id,
                tag: ferramenta.tag,
                tipo: ferramenta.tipo,
                origem,
                destino: b.destino || null,
                os_destino_id: b.os_destino_id || null,
                motivo: b.destino
                    ? `Remanejamento de ${origem} para ${b.destino}`
                    : `Remanejamento saindo de ${origem}`,
                observacao: b.observacao || null,
                responsavel,
                destinatario,
                solicitado_por: solicitante || null,
                status: 'solicitado',
                origem_evento: 'remanejamento',
                grupo_id: grupo
            }));
        }
        if (!criados.length) return res.status(400).json({ erro: "Nenhuma ferramenta válida informada." });

        // Notifica quem vai ter de executar o remanejamento.
        try {
            const alvos = await pool.query(
                "SELECT id FROM almox.usuarios WHERE ativo = TRUE AND LOWER(TRIM(nome)) = LOWER($1)",
                [responsavel]
            );
            const tags = Array.from(new Set(criados.map(m => m.tag))).join(', ');
            await push.notificar(pool, 'remanejamento', {
                os: null,
                usuarioIds: alvos.rows.map(u => u.id),
                detalhe: `Remanejamento pendente: ${tags} — solicitado por ${solicitante || '—'}`
            });
        } catch (e) {
            console.warn("AVISO: notificação da solicitação de remanejamento ignorada:", e.message);
        }

        res.status(201).json(criados);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/solicitar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// QUEM PODE APROVAR UM REMANEJAMENTO
//
// A permissão é a chave `aprovar_remanejamento` dentro de usuarios.permissoes.
// Enquanto NINGUÉM a tiver marcada, vale a herança de transição: quem já
// mandava no remanejamento (gerenciar_os / aprovar_todas_os) decide — senão a
// fila subiria sem ninguém para aprová-la. Marcado o primeiro cargo, a herança
// some e vale só o que está configurado. Mesma regra da prorrogação.
// ============================================================
// usuarios.permissoes existe em DUAS formas no banco: objeto
// ({"logs": true}) nos cadastros novos e array (["logs"]) nos antigos. O
// operador `?` do JSONB responde as duas ("chave existe / elemento existe"),
// mas `->>` só faz sentido no objeto — num array ele não diz nada. Por isso a
// checagem do valor `false` só vale quando o JSONB é mesmo um objeto.
//
// Uma constante em vez de repetir o trecho: é a mesma pergunta em todo lugar,
// e errá-la num só ponto daria "ninguém tem essa permissão" em silêncio.
const SQL_TEM_PERMISSAO = (param) => `
    (permissoes ? ${param}
     AND COALESCE(
             CASE WHEN jsonb_typeof(permissoes) = 'object' THEN permissoes ->> ${param} END,
             'true'
         ) <> 'false')
`;

async function existeAlguemComPermissao(chave) {
    const r = await pool.query(
        `SELECT 1 FROM almox.usuarios WHERE ativo = TRUE AND ${SQL_TEM_PERMISSAO('$1')} LIMIT 1`,
        [chave]
    );
    return r.rows.length > 0;
}

async function usuariosQuePodemAprovarRemanejamento() {
    const temAlguem = await existeAlguemComPermissao('aprovar_remanejamento');
    const r = temAlguem
        ? await pool.query(
            `SELECT id, nome, email FROM almox.usuarios
              WHERE ativo = TRUE AND ${SQL_TEM_PERMISSAO('$1')}`,
            ['aprovar_remanejamento']
          )
        : await pool.query(
            `SELECT id, nome, email FROM almox.usuarios
              WHERE ativo = TRUE
                AND (${SQL_TEM_PERMISSAO('$1')}
                     OR ${SQL_TEM_PERMISSAO('$2')}
                     OR ${SQL_TEM_PERMISSAO('$3')})`,
            ['*', 'aprovar_todas_os', 'gerenciar_os']
          );
    return r.rows;
}

// ------------------------------------------------------------
// POST /api/remanejamentos/passar
//
// O pedido nasce aqui: o técnico bipou as ferramentas que está passando,
// escolheu para quem e para qual obra, e mandou. Nada sai da obra de origem
// ainda — o movimento fica em 'aguardando_aprovacao' até alguém com a
// permissão decidir.
//
// body: { itens:[{ferramenta_id,tag}], origem, destino, os_destino_id,
//         destinatario, solicitado_por, solicitado_por_id, observacao }
// ------------------------------------------------------------
app.post("/remanejamentos/passar", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const origem = String(b.origem || '').trim();
        const destinatario = String(b.destinatario || '').trim();
        const solicitante = String(b.solicitado_por || '').trim();

        if (!origem) return res.status(400).json({ erro: "A obra de origem é obrigatória." });
        // Um dos dois destinos basta:
        //   só destinatário -> a ferramenta fica com a pessoa e aparece na
        //                      Localização no nome dela; ela devolve pela aba
        //                      "Estou devolvendo"
        //   só obra         -> entra na O.S. daquela obra e é exigida na
        //                      devolutiva de lá
        //   os dois         -> entra na O.S. e a pessoa assina o recebimento
        if (!destinatario && !b.os_destino_id && !b.destino) {
            return res.status(400).json({
                erro: "Informe a obra de destino ou quem vai receber — um dos dois basta."
            });
        }

        const itens = Array.isArray(b.itens) ? b.itens : [];
        if (!itens.length) return res.status(400).json({ erro: "Bipe pelo menos uma ferramenta." });

        const grupo = novoGrupoRemanejamento();
        const criados = [];
        for (const it of itens) {
            const busca = it.ferramenta_id
                ? await pool.query("SELECT id, tag, tipo, localizacao_atual FROM almox.ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT id, tag, tipo, localizacao_atual FROM almox.ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag || '').trim()]);
            const ferramenta = busca.rows[0];
            if (!ferramenta) continue;
            criados.push(await registrarMovimento({
                ferramenta_id: ferramenta.id,
                tag: ferramenta.tag,
                tipo: ferramenta.tipo,
                origem,
                destino: b.destino || null,
                os_destino_id: b.os_destino_id || null,
                motivo: b.destino
                    ? `Remanejamento de ${origem} para ${b.destino}`
                    : `Remanejamento saindo de ${origem}`,
                observacao: b.observacao || null,
                responsavel: solicitante || null,   // quem está passando
                destinatario,
                solicitado_por: solicitante || null,
                status: 'aguardando_aprovacao',
                origem_evento: 'remanejamento',
                grupo_id: grupo
            }));
        }
        if (!criados.length) return res.status(400).json({ erro: "Nenhuma ferramenta válida informada." });

        // Quem aprova precisa saber que há pedido na fila.
        try {
            const alvos = await usuariosQuePodemAprovarRemanejamento();
            const tags = Array.from(new Set(criados.map(m => m.tag))).join(', ');
            await push.notificar(pool, 'remanejamento', {
                os: null,
                usuarioIds: alvos.map(u => u.id),
                detalhe: `Remanejamento aguardando aprovação: ${tags} — de ${origem} para ${b.destino || '—'}, por ${solicitante || '—'}`
            });
        } catch (e) {
            console.warn("AVISO: notificação do pedido de remanejamento ignorada:", e.message);
        }

        // O e-mail vai para TODOS que podem aprovar remanejamento — foi assim
        // que a regra foi pedida, e é o que evita um pedido ficar parado
        // esperando uma pessoa específica abrir o sistema.
        await mail.notificar(pool, 'remanejamento', {
            origem,
            destino: b.destino || null,
            destinatario,
            solicitante,
            instrumentos: criados.map(m => ({ tag: m.tag, tipo: m.tipo })),
            observacao: b.observacao || null,
            criado_em: new Date(),
            excluirId: b.solicitado_por_id
        });

        await registrarLogServidor({
            usuario_nome: solicitante,
            usuario_id: b.solicitado_por_id,
            acao: 'solicitar',
            modulo: 'remanejamento',
            entidade: 'Remanejamento',
            descricao: `Remanejamento solicitado — ${criados.length} ferramenta(s) de ${origem} para ${b.destino || '—'}`,
            detalhes: {
                contexto: {
                    'Origem': origem,
                    'Destino': b.destino || '—',
                    'Quem recebe': destinatario,
                    'Ferramentas': criados.map(m => m.tag).join(', '),
                    'Observação': b.observacao || '—'
                }
            }
        });

        cache.invalidar("ferramentas");
        res.status(201).json(criados);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/passar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// GET /api/remanejamentos/aprovacoes
// A fila de quem aprova. Devolve as linhas cruas; o agrupamento por remessa
// (grupo_id) é da tela, como no resto do módulo.
// ------------------------------------------------------------
app.get("/remanejamentos/aprovacoes", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const r = await pool.query(`
            SELECT * FROM almox.remanejamentos
             WHERE status = 'aguardando_aprovacao' AND origem_evento = 'remanejamento'
             ORDER BY criado_em DESC, id DESC
             LIMIT 300
        `);
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: GET /api/remanejamentos/aprovacoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/remanejamentos/aprovar { ids | grupo_id, usuario:{id,nome} }
//
// É AQUI que a ferramenta sai da obra de origem. Enquanto o pedido estava na
// fila, ela continuava respondendo pela OS de lá; aprovado, a baixa acontece
// e o movimento passa a esperar o recebimento ('pendente').
// ------------------------------------------------------------
app.post("/remanejamentos/aprovar", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(v => parseInt(v)).filter(Number.isInteger);
        const grupo = String(b.grupo_id || '').trim();
        if (!ids.length && !grupo) return res.status(400).json({ erro: "Informe o remanejamento a aprovar." });

        const quem = b.usuario || {};
        const nomeQuem = String(quem.nome || '').trim() || null;

        // A permissão é conferida no servidor, sempre: a tela nunca é a única
        // barreira (mesma regra da prorrogação).
        if (quem.id) {
            const permitidos = await usuariosQuePodemAprovarRemanejamento();
            if (!permitidos.some(u => String(u.id) === String(quem.id))) {
                return res.status(403).json({ erro: "Você não tem permissão para aprovar remanejamentos." });
            }
        }

        const filtro = grupo ? "grupo_id = $1" : "id = ANY($1::int[])";
        const valor  = grupo ? grupo : ids;

        const r = await pool.query(`
            UPDATE almox.remanejamentos
               SET status = 'pendente',
                   aprovado_por    = $2,
                   aprovado_por_id = $3,
                   aprovado_em     = CURRENT_TIMESTAMP,
                   enviado_por     = COALESCE(enviado_por, responsavel),
                   enviado_em      = COALESCE(enviado_em, CURRENT_TIMESTAMP)
             WHERE ${filtro} AND status = 'aguardando_aprovacao'
         RETURNING *
        `, [valor, nomeQuem, Number.isInteger(parseInt(quem.id)) ? parseInt(quem.id) : null]);

        if (!r.rows.length) {
            return res.status(409).json({ erro: "Este remanejamento já foi decidido ou não existe mais." });
        }

        // A ferramenta sai da obra AGORA: é a baixa que tira a TAG da
        // devolutiva da obra de origem.
        for (const mov of r.rows) {
            await registrarSaidaPorRemanejamento(mov, mov.responsavel || nomeQuem || null);
        }

        // Quem recebe entra na fila do "Estou recebendo".
        try {
            const nomes = Array.from(new Set(r.rows.map(m => String(m.destinatario || '').trim()).filter(Boolean)));
            if (nomes.length) {
                const alvos = await pool.query(
                    "SELECT id FROM almox.usuarios WHERE ativo = TRUE AND LOWER(nome) = ANY($1::text[])",
                    [nomes.map(n => n.toLowerCase())]
                );
                const tags = Array.from(new Set(r.rows.map(m => m.tag))).join(', ');
                await push.notificar(pool, 'remanejamento', {
                    os: null,
                    usuarioIds: alvos.rows.map(u => u.id),
                    detalhe: `${tags} — liberado por ${nomeQuem || '—'}. Confirme o recebimento.`
                });
            }
        } catch (e) {
            console.warn("AVISO: notificação da aprovação de remanejamento ignorada:", e.message);
        }

        // O SEGUNDO E-MAIL DO REMANEJAMENTO.
        //
        // O primeiro (no pedido) foi para quem aprova. Este vai para quem vai
        // RECEBER a ferramenta, e só agora: antes da aprovação não havia nada
        // para ele fazer, e avisá-lo seria pedir uma ação que ainda dependia
        // de outra pessoa.
        //
        // `somenteNomes` restringe ao destinatário: o cargo 'Auxiliar Técnico'
        // diz quem PODE receber este aviso, e o nome diz quem DEVE recebê-lo
        // nesta movimentação. Sem isso, os sete auxiliares seriam avisados de
        // uma ferramenta que não é deles.
        try {
            const nomes = Array.from(new Set(r.rows.map(m => String(m.destinatario || '').trim()).filter(Boolean)));
            if (nomes.length) {
                await mail.notificar(pool, 'remanejamento_aprovado', {
                    somenteNomes: nomes,
                    origem: r.rows[0].origem || null,
                    destino: r.rows[0].destino || null,
                    solicitante: r.rows[0].responsavel || null,
                    aprovador: nomeQuem,
                    instrumentos: r.rows.map(m => ({ tag: m.tag, tipo: m.tipo })),
                    observacao: r.rows[0].observacao || null,
                    aprovado_em: new Date()
                });
            }
        } catch (e) {
            console.warn("AVISO: e-mail da aprovação de remanejamento ignorado:", e.message);
        }

        await registrarLogServidor({
            usuario_nome: nomeQuem,
            usuario_id: quem.id,
            acao: 'aprovar',
            modulo: 'remanejamento',
            entidade: 'Remanejamento',
            descricao: `Remanejamento aprovado — ${r.rows.length} ferramenta(s)`,
            detalhes: {
                contexto: {
                    'Origem': r.rows[0].origem || '—',
                    'Destino': r.rows[0].destino || '—',
                    'Quem passou': r.rows[0].responsavel || '—',
                    'Quem recebe': r.rows[0].destinatario || '—',
                    'Ferramentas': r.rows.map(m => m.tag).join(', ')
                }
            }
        });

        cache.invalidar("solicitacoes", "ferramentas");
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/aprovar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/remanejamentos/rejeitar { ids | grupo_id, usuario, motivo }
// Recusado, nada se move: a ferramenta continua na obra de origem e o pedido
// fica no histórico com o motivo.
// ------------------------------------------------------------
app.post("/remanejamentos/rejeitar", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(v => parseInt(v)).filter(Number.isInteger);
        const grupo = String(b.grupo_id || '').trim();
        const motivo = String(b.motivo || '').trim();
        if (!ids.length && !grupo) return res.status(400).json({ erro: "Informe o remanejamento a rejeitar." });
        if (motivo.length < 3) return res.status(400).json({ erro: "O motivo da rejeição é obrigatório." });

        const quem = b.usuario || {};
        const nomeQuem = String(quem.nome || '').trim() || null;

        if (quem.id) {
            const permitidos = await usuariosQuePodemAprovarRemanejamento();
            if (!permitidos.some(u => String(u.id) === String(quem.id))) {
                return res.status(403).json({ erro: "Você não tem permissão para decidir remanejamentos." });
            }
        }

        const filtro = grupo ? "grupo_id = $1" : "id = ANY($1::int[])";
        const valor  = grupo ? grupo : ids;

        const r = await pool.query(`
            UPDATE almox.remanejamentos
               SET status = 'rejeitado',
                   rejeitado_por   = $2,
                   rejeitado_em    = CURRENT_TIMESTAMP,
                   motivo_rejeicao = $3
             WHERE ${filtro} AND status = 'aguardando_aprovacao'
         RETURNING *
        `, [valor, nomeQuem, motivo]);

        if (!r.rows.length) {
            return res.status(409).json({ erro: "Este remanejamento já foi decidido ou não existe mais." });
        }

        try {
            const nomes = Array.from(new Set(r.rows.map(m => String(m.responsavel || '').trim()).filter(Boolean)));
            if (nomes.length) {
                const alvos = await pool.query(
                    "SELECT id FROM almox.usuarios WHERE ativo = TRUE AND LOWER(nome) = ANY($1::text[])",
                    [nomes.map(n => n.toLowerCase())]
                );
                const tags = Array.from(new Set(r.rows.map(m => m.tag))).join(', ');
                await push.notificar(pool, 'remanejamento', {
                    os: null,
                    usuarioIds: alvos.rows.map(u => u.id),
                    detalhe: `Remanejamento recusado (${tags}) por ${nomeQuem || '—'}: ${motivo}`
                });
            }
        } catch (e) {
            console.warn("AVISO: notificação da rejeição de remanejamento ignorada:", e.message);
        }

        await registrarLogServidor({
            usuario_nome: nomeQuem,
            usuario_id: quem.id,
            acao: 'reprovar',
            modulo: 'remanejamento',
            entidade: 'Remanejamento',
            descricao: `Remanejamento rejeitado — ${r.rows.length} ferramenta(s)`,
            detalhes: { contexto: { 'Motivo': motivo, 'Ferramentas': r.rows.map(m => m.tag).join(', ') } }
        });

        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/rejeitar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// POST /api/remanejamentos/enviar { ids: [...], enviado_por, observacao }
// O responsável bipou as ferramentas que o gestor definiu e está passando
// adiante: a solicitação vira uma passagem de verdade (status "pendente"),
// e é agora que a baixa na OS de origem acontece.
app.post("/remanejamentos/enviar", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(v => parseInt(v)).filter(Number.isInteger);
        if (!ids.length) return res.status(400).json({ erro: "Nenhuma solicitação informada." });
        const enviadoPor = String(b.enviado_por || '').trim() || null;

        const atuais = await pool.query(
            "SELECT * FROM almox.remanejamentos WHERE id = ANY($1::int[]) AND status = 'solicitado'",
            [ids]
        );
        if (!atuais.rows.length) {
            return res.status(409).json({ erro: "Estas solicitações já foram enviadas ou não existem mais." });
        }

        const r = await pool.query(`
            UPDATE almox.remanejamentos
               SET status = 'pendente',
                   enviado_por = COALESCE($1, enviado_por, responsavel),
                   enviado_em = CURRENT_TIMESTAMP,
                   observacao = COALESCE($2::text, observacao)
             WHERE id = ANY($3::int[]) AND status = 'solicitado'
         RETURNING *
        `, [enviadoPor, b.observacao ? String(b.observacao).trim() : null, ids]);

        // A ferramenta sai da obra AGORA: a baixa na OS de origem é o que tira
        // a TAG da devolutiva daquela obra.
        for (const mov of r.rows) {
            await registrarSaidaPorRemanejamento(mov, enviadoPor || mov.responsavel || null);
        }

        // Quem recebe precisa saber que tem remanejamento esperando confirmação.
        try {
            const nomes = Array.from(new Set(r.rows.map(m => String(m.destinatario || '').trim()).filter(Boolean)));
            if (nomes.length) {
                const alvos = await pool.query(
                    "SELECT id FROM almox.usuarios WHERE ativo = TRUE AND LOWER(nome) = ANY($1::text[])",
                    [nomes.map(n => n.toLowerCase())]
                );
                const tags = Array.from(new Set(r.rows.map(m => m.tag))).join(', ');
                await push.notificar(pool, 'remanejamento', {
                    os: null,
                    usuarioIds: alvos.rows.map(u => u.id),
                    detalhe: `${tags} — Enviado por: ${enviadoPor || '—'}`
                });
            }
        } catch (e) {
            console.warn("AVISO: notificação do envio de remanejamento ignorada:", e.message);
        }

        cache.invalidar("solicitacoes", "ferramentas");
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/enviar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// GET /api/remanejamentos/devolver — o que ESTE usuário precisa devolver
//
// São as passagens de pessoa para pessoa: ele recebeu a ferramenta, ninguém
// mais assumiu (não havia obra de destino) e ela ainda não voltou. É essa
// lista que faz a aba "Estou devolvendo" existir — vazia, a aba some.
//
// Quando a passagem TEM obra de destino, quem responde pela devolução é o
// responsável daquela O.S., então nada aparece aqui.
// ------------------------------------------------------------
app.get("/remanejamentos/devolver", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const destinatario = String(req.query.destinatario || '').trim();
        if (!destinatario) return res.json([]);

        const r = await pool.query(`
            SELECT * FROM almox.remanejamentos
             WHERE status = 'confirmado'
               AND origem_evento = 'remanejamento'
               AND os_destino_id IS NULL
               AND devolvido_em IS NULL
               AND LOWER(TRIM(COALESCE(destinatario, ''))) = LOWER($1)
             ORDER BY confirmado_em DESC NULLS LAST, id DESC
             LIMIT 300
        `, [destinatario]);
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: GET /api/remanejamentos/devolver:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/remanejamentos/:id/devolver
// body: { data_retorno, estado: 'ok'|'avariado'|'avariado_utilizavel', observacao, responsavel }
//
// Fecha a passagem: a ferramenta volta ao almoxarifado. A data de INÍCIO não
// é pedida — ela é a data em que o recebimento foi confirmado. Voltando
// avariada, a ferramenta fica com status 'avariado' e aparece na Manutenção;
// voltando com avaria que não impede o uso, ela fica disponível e a avaria é
// registrada sem virar manutenção pendente.
// ------------------------------------------------------------
app.post("/remanejamentos/:id/devolver", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const { data_retorno, estado, observacao, responsavel } = req.body || {};

        const atual = await pool.query("SELECT * FROM almox.remanejamentos WHERE id = $1", [req.params.id]);
        if (!atual.rows.length) return res.status(404).json({ erro: "Remanejamento não encontrado" });
        const reg = atual.rows[0];

        if (reg.devolvido_em) return res.status(409).json({ erro: "Esta ferramenta já foi devolvida" });
        if (String(reg.status || '').toLowerCase() !== 'confirmado') {
            return res.status(409).json({ erro: "O recebimento ainda não foi confirmado" });
        }
        if (reg.os_destino_id) {
            return res.status(409).json({
                erro: "Esta ferramenta pertence a uma O.S. — a devolução é feita pela Devolutiva daquela obra"
            });
        }

        const condicao = normalizarEstadoFerramenta(estado);
        if (condicao !== ESTADO_OK && !String(observacao || '').trim()) {
            return res.status(400).json({ erro: "Descreva a avaria da ferramenta" });
        }
        const dataRetorno = String(data_retorno || '').slice(0, 10) || hojeISO();

        const r = await pool.query(`
            UPDATE almox.remanejamentos
               SET status = 'devolvido',
                   devolvido_em = CURRENT_TIMESTAMP,
                   devolvido_estado = $1,
                   devolvido_obs = $2,
                   data_retorno = $3::date,
                   devolvido_por = COALESCE($5::text, devolvido_por, destinatario)
             WHERE id = $4
         RETURNING *
        `, [condicao, observacao ? String(observacao).trim() : null, dataRetorno, reg.id,
            responsavel ? String(responsavel).trim() : null]);

        await pool.query(
            "UPDATE almox.ferramentas SET status = $1, localizacao_atual = 'Almoxarifado', atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
            [statusPorEstadoFerramenta(condicao), reg.ferramenta_id]
        );
        await registrarAvariaUtilizavel(reg.ferramenta_id, condicao, observacao, dataRetorno);

        // O retorno é um movimento como qualquer outro: entra no histórico da
        // ferramenta com origem, destino, data e quem devolveu.
        await registrarMovimento({
            ferramenta_id: reg.ferramenta_id,
            tag: reg.tag,
            tipo: reg.tipo,
            origem: reg.destino || reg.origem || 'Campo',
            destino: 'Almoxarifado',
            motivo: `Devolução de remanejamento (${
                condicao === ESTADO_AVARIADO ? 'avariada'
                : condicao === ESTADO_AVARIADO_UTILIZAVEL ? 'avariada, mas disponível para uso'
                : 'bom / em ordem'})`,
            observacao: [
                reg.confirmado_em ? `Recebida em ${dataBR(reg.confirmado_em)}` : null,
                `Retorno em ${dataBR(dataRetorno)}`,
                observacao ? String(observacao).trim() : null
            ].filter(Boolean).join(' · '),
            responsavel: responsavel || reg.destinatario || null,
            destinatario: reg.responsavel || null,
            status: 'confirmado',
            origem_evento: 'devolucao_remanejamento'
        });

        cache.invalidar("ferramentas");
        res.json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/:id/devolver:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// HISTÓRICO UNIFICADO DA FERRAMENTA
// Uma única linha do tempo cronológica reunindo TUDO que aconteceu com
// aquela TAG: cadastro, OS, separações, conferências, devolutivas,
// remanejamentos, mudanças de localização/baia, manutenções, calibrações
// e inclusões/devoluções parciais.
//
// Exceção intencional: RETIRADA PARCIAL não aparece aqui — por regra do
// negócio ela fica registrada somente no histórico da OS.
// ------------------------------------------------------------
app.get("/ferramentas/:id/historico", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        await garantirTabelaBaiaHistorico();
        await garantirTabelaOSHistorico();

        const f = await pool.query(
            `SELECT id, tag, tipo, fabricante, modelo, numero_serie, status, localizacao_atual,
                    baia_id, baia_pai_id, criado_em, data_aquisicao, ultima_calibracao, vencimento_calibracao
               FROM almox.ferramentas WHERE id = $1`,
            [req.params.id]
        );
        if (!f.rows.length) return res.status(404).json({ erro: "Ferramenta não encontrada" });
        const ferramenta = f.rows[0];
        const tagUpper = String(ferramenta.tag || '').toUpperCase();

        const h = await pool.query(
            `SELECT * FROM almox.remanejamentos WHERE ferramenta_id = $1 OR UPPER(tag) = UPPER($2)
             ORDER BY criado_em DESC, id DESC LIMIT 300`,
            [ferramenta.id, ferramenta.tag || '']
        );

        // Complemento: OS de que a ferramenta participou, mesmo as antigas que
        // são de antes de existir o registro de movimentação em `remanejamentos`
        // (instrumentos ali podia guardar só o ID cru da ferramenta) — sem isso,
        // o histórico "some" para qualquer OS concluída antes dessa tabela existir.
        const tagPattern = ferramenta.tag ? `%"${ferramenta.tag}"%` : null;
        const osRel = await pool.query(
            `SELECT id, numero_os, cliente, obra, responsavel, status, data_inicio, data_fim,
                    separado_em, separado_por, conferido_em, conferido_por, devolvido_em, devolvido_por,
                    conferencia, devolutiva, retiradas_parciais
               FROM almox.solicitacoes
              WHERE instrumentos @> to_jsonb($1::int)
                 OR ($2::text IS NOT NULL AND instrumentos::text ILIKE $2)
                 OR ($2::text IS NOT NULL AND conferencia::text ILIKE $2)
                 OR ($2::text IS NOT NULL AND devolutiva::text ILIKE $2)
              ORDER BY data_fim DESC NULLS LAST, id DESC
              LIMIT 100`,
            [ferramenta.id, tagPattern]
        );

        const eventosBaia = await pool.query(
            `SELECT * FROM almox.baia_historico
              WHERE ferramenta_id = $1 OR UPPER(COALESCE(tag, '')) = $2
              ORDER BY criado_em DESC, id DESC LIMIT 200`,
            [ferramenta.id, tagUpper]
        );

        const manut = await pool.query(
            `SELECT * FROM almox.manutencoes WHERE instrumento_id = $1 OR UPPER(COALESCE(tag,'')) = $2
              ORDER BY COALESCE(data_manutencao, data_emissao, criado_em::date) DESC LIMIT 100`,
            [ferramenta.id, tagUpper]
        );

        const certs = await pool.query(
            `SELECT id, instrumento_id, numero, data_emissao, data_vencimento, observacoes, valor
               FROM almox.certificados WHERE instrumento_id = $1
              ORDER BY data_emissao DESC LIMIT 100`,
            [ferramenta.id]
        );

        // Eventos da OS que também pertencem à TAG (inclusão e devolução
        // parcial). `retirada_parcial` fica de fora de propósito.
        const eventosOS = await pool.query(
            `SELECT * FROM almox.os_historico
              WHERE (ferramenta_id = $1 OR UPPER(COALESCE(tag,'')) = $2)
                AND evento <> 'retirada_parcial'
              ORDER BY criado_em DESC, id DESC LIMIT 200`,
            [ferramenta.id, tagUpper]
        );

        // ---------- LINHA DO TEMPO ÚNICA ----------
        const timeline = [];
        const push = (data, evt) => {
            if (!data) return;
            const quando = new Date(data);
            if (isNaN(quando.getTime())) return;
            timeline.push({ ...evt, data: quando.toISOString() });
        };

        const rotuloEvento = {
            remanejamento: 'Remanejamento',
            conferencia: 'Conferência',
            devolutiva: 'Devolução',
            separacao: 'Separação',
            baia: 'Alteração de baia',
            classificacao_lista: 'Classificação da lista',
            inclusao_parcial: 'Inclusão parcial',
            devolucao_parcial: 'Devolução parcial'
        };

        push(ferramenta.criado_em, {
            categoria: 'cadastro',
            titulo: 'Ferramenta cadastrada no Inventário',
            detalhe: [ferramenta.tipo, ferramenta.numero_serie ? `S/N ${ferramenta.numero_serie}` : null].filter(Boolean).join(' · ')
        });

        h.rows.forEach(m => push(m.criado_em, {
            categoria: 'movimentacao',
            tipo_evento: m.origem_evento || 'remanejamento',
            numero_os: m.os_destino || m.os_origem || null,
            os_id: m.os_destino_id || null,
            titulo: m.motivo || rotuloEvento[m.origem_evento] || 'Movimentação',
            detalhe: [
                (m.origem || m.destino) ? `${m.origem || '—'} → ${m.destino || '—'}` : null,
                m.os_destino ? `OS #${m.os_destino}` : (m.os_origem ? `OS #${m.os_origem}` : null),
                m.observacao
            ].filter(Boolean).join(' · '),
            usuario: m.responsavel || m.destinatario || null,
            origem: m.origem,
            destino: m.destino,
            status: m.status,
            referencia_id: m.id
        }));

        osRel.rows.forEach(os => {
            const rotuloOS = `OS #${os.numero_os || os.id}${os.cliente ? ' · ' + os.cliente : ''}`;
            const contem = (lista) => jsonArray(lista).some(x =>
                String(x?.tag || '').toUpperCase() === tagUpper ||
                String(x?.ferramenta_id || x?.id || '') === String(ferramenta.id)
            );
            const foiRetirada = contem(os.retiradas_parciais);

            push(os.separado_em, {
                categoria: 'os', tipo_evento: 'separacao',
                titulo: 'Separada para ' + rotuloOS, usuario: os.separado_por, os_id: os.id
            });
            // Uma TAG retirada parcialmente nunca foi conferida nem devolvida
            // nesta OS — o carimbo da OS não vale para ela.
            if (!foiRetirada && contem(os.conferencia)) {
                push(os.conferido_em, {
                    categoria: 'os', tipo_evento: 'conferencia',
                    titulo: 'Conferida na ' + rotuloOS, usuario: os.conferido_por, os_id: os.id
                });
            }
            if (!foiRetirada && contem(os.devolutiva)) {
                push(os.devolvido_em, {
                    categoria: 'os', tipo_evento: 'devolutiva',
                    titulo: 'Devolvida na ' + rotuloOS, usuario: os.devolvido_por, os_id: os.id
                });
            }
        });

        eventosBaia.rows.forEach(b => push(b.criado_em, {
            categoria: 'baia',
            tipo_evento: b.evento,
            titulo: b.evento === 'entrada_na_baia'
                ? `Entrou na baia ${b.baia_rotulo || ''}`.trim()
                : b.evento === 'saida_da_baia'
                    ? `Saiu da baia ${b.baia_rotulo || ''}`.trim()
                    : `Baia: ${String(b.evento || '').replace(/_/g, ' ')}`,
            detalhe: [
                (b.origem || b.destino) ? `${b.origem || '—'} → ${b.destino || '—'}` : null,
                b.numero_os ? `OS #${b.numero_os}` : null,
                b.observacao
            ].filter(Boolean).join(' · '),
            usuario: b.usuario,
            baia_id: b.baia_id,
            referencia_id: b.id
        }));

        manut.rows.forEach(m => push(m.data_manutencao || m.data_envio || m.criado_em, {
            categoria: 'manutencao',
            tipo_evento: 'manutencao',
            titulo: 'Manutenção' + (m.empresa ? ` · ${m.empresa}` : ''),
            detalhe: [
                m.observacao,
                m.data_envio ? `Envio em ${dataBR(m.data_envio)}` : null,
                m.data_retorno ? `Retorno em ${dataBR(m.data_retorno)}` : null
            ].filter(Boolean).join(' · '),
            usuario: m.responsavel,
            referencia_id: m.id
        }));

        certs.rows.forEach(c => push(c.data_emissao, {
            categoria: 'calibracao',
            tipo_evento: 'calibracao',
            titulo: 'Calibração' + (c.numero ? ` · certificado ${c.numero}` : ''),
            detalhe: [
                c.data_vencimento ? `Vence em ${dataBR(c.data_vencimento)}` : null,
                c.observacoes
            ].filter(Boolean).join(' · '),
            referencia_id: c.id
        }));

        eventosOS.rows.forEach(e => push(e.criado_em, {
            categoria: 'os_parcial',
            tipo_evento: e.evento,
            titulo: (rotuloEvento[e.evento] || e.evento) + (e.numero_os ? ` · OS #${e.numero_os}` : ''),
            detalhe: [
                e.motivo ? `Motivo: ${e.motivo}` : null,
                e.estado ? `Estado: ${e.estado}` : null,
                e.observacao
            ].filter(Boolean).join(' · '),
            usuario: e.usuario,
            os_id: e.solicitacao_id,
            numero_os: e.numero_os || null,
            referencia_id: e.id
        }));

        timeline.sort((a, b) => new Date(b.data) - new Date(a.data));

        // ---------- RECORTE POR O.S. (?os_id=) ----------
        //
        // Abrindo a TAG de uma OS concluída, o que interessa é o que ela viveu
        // NAQUELA OS — não a vida inteira dela. Ficam de fora eventos sem
        // vínculo com a OS (cadastro, calibração, manutenção avulsa).
        let recorte = timeline;
        let osFiltro = null;
        const osIdPedido = parseInt(req.query.os_id, 10);
        if (Number.isFinite(osIdPedido)) {
            const alvoOS = await pool.query(
                "SELECT id, numero_os, cliente, obra FROM almox.solicitacoes WHERE id = $1",
                [osIdPedido]
            );
            osFiltro = alvoOS.rows[0] || { id: osIdPedido, numero_os: null };
            const numeroAlvo = osFiltro.numero_os !== null && osFiltro.numero_os !== undefined
                ? String(osFiltro.numero_os) : null;

            recorte = timeline.filter(e =>
                (e.os_id !== undefined && e.os_id !== null && String(e.os_id) === String(osFiltro.id))
                || (numeroAlvo && e.numero_os !== undefined && e.numero_os !== null
                    && String(e.numero_os) === numeroAlvo)
            );
        }

        res.json({
            ferramenta,
            localizacao_atual: ferramenta.localizacao_atual || 'Almoxarifado',
            timeline: recorte,
            os_filtro: osFiltro,
            timeline_total: timeline.length,
            // Campos mantidos por compatibilidade com telas já existentes
            historico: h.rows,
            os_relacionadas: osRel.rows,
            eventos_baia: eventosBaia.rows,
            manutencoes: manut.rows,
            certificados: certs.rows
        });
    } catch (err) {
        console.error("ERRO: GET /api/ferramentas/:id/historico:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// BAIA COMO FERRAMENTA (CONTAINER): resolve a OS vinculada, as ferramentas
// dentro dela e o histórico — usada para bipar pela Baia em vez do código
// ============================================================
app.get("/ferramentas/:id/baia-info", async (req, res) => {
    try {
        const baiaId = parseInt(req.params.id);
        if (isNaN(baiaId)) return res.status(400).json({ erro: "ID inválido" });

        const baiaRes = await pool.query("SELECT * FROM almox.ferramentas WHERE id = $1", [baiaId]);
        if (!baiaRes.rows.length) return res.status(404).json({ erro: "Baia (ferramenta) não encontrada" });
        const baia = baiaRes.rows[0];

        const itensRes = await pool.query(
            "SELECT * FROM almox.ferramentas WHERE baia_pai_id = $1 ORDER BY tag",
            [baiaId]
        );

        const osRes = await pool.query(
            `SELECT * FROM almox.solicitacoes
              WHERE status <> 'concluida'
                AND baia_ferramenta_ids @> $1::jsonb
              ORDER BY data_criacao DESC LIMIT 1`,
            [JSON.stringify([baiaId])]
        );

        await garantirTabelaRemanejamentos();
        const histRes = await pool.query(
            `SELECT * FROM almox.remanejamentos WHERE ferramenta_id = $1 OR UPPER(tag) = UPPER($2)
             ORDER BY criado_em DESC, id DESC LIMIT 50`,
            [baia.id, baia.tag || '']
        );

        res.json({
            baia,
            itens: itensRes.rows,
            os: osRes.rows[0] || null,
            historico: histRes.rows
        });
    } catch (err) {
        console.error("ERRO: GET /api/ferramentas/:id/baia-info:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// BIPAGEM — VALIDAÇÃO NO BACKEND (não confia no frontend)
// ============================================================
function _listaTagsDaOS(os) {
    let lista = os.instrumentos;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) lista = [];
    const tags = lista
        .map(x => (x && typeof x === 'object') ? (x.tag || x.id) : x)
        .map(v => String(v || '').toUpperCase());

    // Entrou depois da separação (inclusão parcial ou remanejamento recebido):
    // também é ferramenta desta OS e também precisa poder ser bipada.
    jsonArray(os.inclusoes_parciais).forEach(i => {
        if (i?.tag) tags.push(String(i.tag).toUpperCase());
        if (i?.id !== undefined && i?.id !== null) tags.push(String(i.id).toUpperCase());
    });
    return tags;
}

async function _buscarFerramentaPorCodigo(codigo) {
    const cod = String(codigo || '').trim();
    if (!cod) return null;
    const r = await pool.query(
        `SELECT * FROM almox.ferramentas
          WHERE UPPER(codigo_barras) = UPPER($1) OR UPPER(tag) = UPPER($1) OR UPPER(numero_serie) = UPPER($1)
          LIMIT 1`,
        [cod]
    );
    return r.rows[0] || null;
}

app.get("/ferramentas/codigo/:codigo", async (req, res) => {
    try {
        const f = await _buscarFerramentaPorCodigo(req.params.codigo);
        if (!f) return res.status(404).json({ erro: "Código não encontrado no inventário" });
        res.json(f);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// POST /api/conferencia/validar { os_id, codigo, etapa, ja_bipados }
app.post("/conferencia/validar", async (req, res) => {
    try {
        const { os_id, codigo, etapa, ja_bipados } = req.body || {};
        if (!codigo) return res.status(400).json({ valido: false, erro: "Informe o código bipado" });

        // Bipagem é sempre por FERRAMENTA individual (codigo_barras/tag/numero_serie
        // próprios da TAG) — não existe mais fallback por ativo/tipo. Isso evita o bug
        // em que um código de ativo validava na bipagem mas falhava ao concluir (a
        // conclusão nunca replicava esse fallback, então "Código inválido" aparecia
        // mesmo com a ferramenta certa já bipada).
        const ferramenta = await _buscarFerramentaPorCodigo(codigo);

        if (!ferramenta) {
            return res.status(404).json({ valido: false, erro: "Código não encontrado no inventário" });
        }

        if (!os_id) return res.json({ valido: true, ferramenta });

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [os_id]);
        if (!osRes.rows.length) return res.status(404).json({ valido: false, erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const tagsOS = _listaTagsDaOS(os);
        let quantidades = os.quantidades;
        if (typeof quantidades === 'string') { try { quantidades = JSON.parse(quantidades); } catch (e) { quantidades = {}; } }
        const tiposOS = Object.keys(quantidades || {}).map(t => t.toUpperCase());

        const pertenceTag = tagsOS.includes(String(ferramenta.tag || '').toUpperCase())
            || tagsOS.includes(String(ferramenta.id));
        const pertenceTipo = tiposOS.includes(String(ferramenta.tipo || '').toUpperCase());

        if (!pertenceTag && !pertenceTipo) {
            return res.status(409).json({
                valido: false,
                erro: `A ferramenta ${ferramenta.tag} não pertence a esta OS`,
                ferramenta
            });
        }

        // Operações parciais tiram a TAG da bipagem:
        //  - retirada parcial  -> nunca foi a campo, não se bipa em etapa nenhuma
        //  - devolução parcial -> já voltou, não se bipa de novo
        const tagFerramenta = String(ferramenta.tag || '').toUpperCase();
        const retiradaParcial = jsonArray(os.retiradas_parciais)
            .find(r => String(r?.tag || '').toUpperCase() === tagFerramenta);
        if (retiradaParcial) {
            return res.status(409).json({
                valido: false,
                erro: `A ferramenta ${ferramenta.tag} foi retirada parcialmente desta OS${retiradaParcial.motivo ? ` (${retiradaParcial.motivo})` : ''} e não deve ser bipada.`,
                ferramenta
            });
        }
        const devolucaoParcial = jsonArray(os.devolucoes_parciais)
            .find(r => String(r?.tag || '').toUpperCase() === tagFerramenta);
        if (devolucaoParcial) {
            return res.status(409).json({
                valido: false,
                erro: `A ferramenta ${ferramenta.tag} já foi devolvida parcialmente em ${String(devolucaoParcial.data_devolucao || '').slice(0, 10) || 'data anterior'} e não deve ser bipada.`,
                ferramenta
            });
        }

        // Na devolutiva a ferramenta precisa pertencer à OS: ou saiu na
        // bipagem de saída, ou entrou depois (inclusão parcial / remanejamento).
        if (etapa === 'devolutiva') {
            const saiuRemanejada = await _saiuPorRemanejamento(os, ferramenta.tag);
            if (saiuRemanejada) {
                const destino = saiuRemanejada.os_destino_obra || saiuRemanejada.destino;
                return res.status(409).json({
                    valido: false,
                    erro: `A ferramenta ${ferramenta.tag} foi remanejada desta OS${destino ? ` para ${destino}` : ''} e é devolvida por lá.`,
                    ferramenta
                });
            }
            const daOS = _tagsQueVoltamNestaOS(os);
            if (daOS.size && !daOS.has(String(ferramenta.tag || '').toUpperCase())) {
                return res.status(409).json({
                    valido: false,
                    erro: `A ferramenta ${ferramenta.tag} não saiu nesta OS`,
                    ferramenta
                });
            }
        }

        res.json({ valido: true, ferramenta, os: { id: os.id, numero_os: os.numero_os, status: os.status } });
    } catch (err) {
        console.error("ERRO: POST /api/conferencia/validar:", err.message);
        res.status(500).json({ valido: false, erro: err.message });
    }
});

// POST /api/conferencia/validar-baia { codigo, os_id }
// A baia é procurada no INVENTÁRIO (ativo tipo "Baia" com aquele código de
// bipagem/TAG/série). Não existe mais lista fixa de baias no código: bipar
// "BAIA01" encontra a baia porque ela está cadastrada no Inventário.
app.post("/conferencia/validar-baia", async (req, res) => {
    try {
        const { codigo, os_id, etapa } = req.body || {};
        if (!codigo) return res.status(400).json({ valido: false, erro: "Informe o código bipado" });

        const achado = await resolverBaiaPorCodigo(codigo);
        if (!achado) {
            return res.status(404).json({
                valido: false,
                erro: `Nenhuma baia com o código "${String(codigo).trim()}" foi encontrada no Inventário`
            });
        }
        const { baia, ferramenta } = achado;

        // Se a OS possui baias vinculadas, valida se a bipada pertence a ela.
        // A OS pode referenciar a baia de duas formas (ambas aceitas):
        //  - baias_ids / baia_id     -> id do registro de estado da baia
        //  - baia_ferramenta_ids     -> id da ferramenta-baia no Inventário
        //
        // A DEVOLUTIVA é a exceção, e por um motivo prático: a ferramenta
        // volta do campo e é guardada onde houver lugar, que raramente é a
        // mesma baia de onde saiu. Exigir a baia da retirada obrigava a
        // remanejar depois só para corrigir o papel. Aqui qualquer baia do
        // Inventário vale — e QUAL foi fica gravada em cada item.
        const exigirBaiaDaOS = String(etapa || "") !== "devolutiva";
        if (os_id && exigirBaiaDaOS) {
            const osRes = await pool.query(
                "SELECT baias_ids, baia_id, baia_ferramenta_ids FROM almox.solicitacoes WHERE id = $1",
                [os_id]
            );
            if (osRes.rows.length) {
                const os = osRes.rows[0];

                let lista = os.baias_ids;
                if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = null; } }
                if (!Array.isArray(lista) || !lista.length) lista = os.baia_id ? [os.baia_id] : [];
                const idsEstado = lista.map(v => String(v));

                let listaFerr = os.baia_ferramenta_ids;
                if (typeof listaFerr === 'string') { try { listaFerr = JSON.parse(listaFerr); } catch (e) { listaFerr = null; } }
                const idsInventario = (Array.isArray(listaFerr) ? listaFerr : []).map(v => String(v));

                const temVinculo = idsEstado.length || idsInventario.length;
                const pertence = idsEstado.includes(String(baia.id))
                    || (baia.ferramenta_id && idsInventario.includes(String(baia.ferramenta_id)));

                if (temVinculo && !pertence) {
                    return res.status(409).json({ valido: false, erro: `A baia bipada não pertence a esta OS`, baia });
                }
            }
        }

        res.json({ valido: true, baia, ferramenta: ferramenta || null });
    } catch (err) {
        console.error("ERRO: POST /api/conferencia/validar-baia:", err.message);
        res.status(500).json({ valido: false, erro: err.message });
    }
});

// ============================================================
// POST /api/separacao/validar { os_id, codigo, ja_bipadas: [tag,...] }
//
// A tela "Separar TAGS" não tem mais selects: quem separa BIPA, e é este
// endpoint que decide se aquela TAG entra na OS. Ele responde três coisas
// diferentes, e a tela trata cada uma de um jeito:
//
//   200 { valido:true }              -> a TAG entra; a tela a marca como escolhida
//   409 { motivo:'em_outra_obra' }   -> está com outra OS; a tela oferece o
//                                       link para a aba de Remanejamento
//   409 { motivo:'indisponivel' | 'tipo_nao_pedido' | 'cota_cheia' | 'repetida' }
//
// A regra de "cabe nesta OS" é a mesma que os selects usavam: a OS pede N
// unidades de cada ATIVO (quantidades), então a TAG bipada precisa ser de um
// ativo pedido e ainda haver vaga naquele ativo.
// ============================================================
app.post("/separacao/validar", async (req, res) => {
    try {
        const { os_id, codigo } = req.body || {};
        const jaBipadas = (Array.isArray(req.body?.ja_bipadas) ? req.body.ja_bipadas : [])
            .map(t => String(t || '').toUpperCase()).filter(Boolean);

        if (!codigo) return res.status(400).json({ valido: false, erro: "Informe o código bipado" });
        if (!os_id)  return res.status(400).json({ valido: false, erro: "OS não informada" });

        const ferramenta = await _buscarFerramentaPorCodigo(codigo);
        if (!ferramenta) {
            return res.status(404).json({
                valido: false, motivo: 'nao_encontrada',
                erro: `O código "${String(codigo).trim()}" não existe no Inventário.`
            });
        }

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [os_id]);
        if (!osRes.rows.length) return res.status(404).json({ valido: false, erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const tagUp = String(ferramenta.tag || '').toUpperCase();

        // Baia não é ferramenta da OS: ela tem caminho próprio (validar-baia).
        if (ehTipoBaia(ferramenta.tipo)) {
            return res.status(409).json({
                valido: false, motivo: 'e_baia', ferramenta,
                erro: `${ferramenta.tag} é uma baia, não um instrumento.`
            });
        }

        if (jaBipadas.includes(tagUp)) {
            return res.status(409).json({
                valido: false, motivo: 'repetida', ferramenta,
                erro: `${ferramenta.tag} já foi bipada nesta separação.`
            });
        }

        // ---- ESTÁ DISPONÍVEL? ----
        // Primeiro a pergunta mais útil para quem está no balcão: esta TAG está
        // presa a OUTRA OS? Se estiver, a resposta traz a obra para a tela poder
        // dizer "faça o remanejamento" com o link.
        const emOutra = await pool.query(`
            SELECT id, numero_os, obra, cliente, status
              FROM almox.solicitacoes
             WHERE id <> $1
               AND LOWER(COALESCE(status,'')) NOT IN ('concluida','concluido','concluída','cancelada','cancelado','descontinuada','reprovada')
               AND (instrumentos::text ILIKE '%"' || $2 || '"%'
                    OR instrumentos::text ILIKE '%' || $3 || '%')
             ORDER BY id DESC
             LIMIT 1
        `, [os.id, String(ferramenta.id), ferramenta.tag || 'SEM-TAG-IMPOSSIVEL']);

        if (emOutra.rows.length) {
            const outra = emOutra.rows[0];
            return res.status(409).json({
                valido: false, motivo: 'em_outra_obra', ferramenta,
                os_conflito: {
                    id: outra.id,
                    numero_os: outra.numero_os,
                    obra: outra.obra || outra.cliente || null,
                    status: outra.status
                },
                erro: `${ferramenta.tag} está na OS #OS-${String(outra.numero_os || outra.id).padStart(4, '0')}`
                    + `${(outra.obra || outra.cliente) ? ' — ' + (outra.obra || outra.cliente) : ''}.`
            });
        }

        // Fora isso, vale o status do Inventário. 'em_campo' sem OS encontrada
        // acima também é bloqueio: a ferramenta não está no almoxarifado.
        const statusFerr = String(ferramenta.status || '').toLowerCase().trim();
        const ROTULO_STATUS = {
            em_campo: 'está em campo',
            em_manutencao: 'está em manutenção',
            manutencao: 'está em manutenção',
            em_calibracao: 'está em calibração',
            calibracao: 'está em calibração',
            avariado: 'está avariada',
            inativo: 'está inativa',
            inativa: 'está inativa'
        };
        if (statusFerr && statusFerr !== 'disponivel' && statusFerr !== 'avariado_utilizavel') {
            return res.status(409).json({
                valido: false, motivo: 'indisponivel', ferramenta,
                erro: `${ferramenta.tag} não está disponível — ${ROTULO_STATUS[statusFerr] || `está como "${statusFerr}"`}.`
            });
        }

        // ---- CABE NESTA OS? ----
        let quantidades = os.quantidades;
        if (typeof quantidades === 'string') { try { quantidades = JSON.parse(quantidades); } catch (e) { quantidades = {}; } }
        if (!quantidades || typeof quantidades !== 'object' || Array.isArray(quantidades)) quantidades = {};

        const pedidos = {};
        Object.keys(quantidades).forEach(chave => {
            const qtd = parseInt(quantidades[chave]) || 0;
            if (qtd > 0 && isNaN(Number(chave))) pedidos[String(chave).toUpperCase()] = qtd;
        });

        const tipoUp = String(ferramenta.tipo || '').toUpperCase();

        // OS sem lista de ativos (registro antigo): aceita qualquer TAG livre.
        if (Object.keys(pedidos).length) {
            if (!(tipoUp in pedidos)) {
                return res.status(409).json({
                    valido: false, motivo: 'tipo_nao_pedido', ferramenta,
                    erro: `Esta OS não pediu "${ferramenta.tipo || 'este ativo'}" — ${ferramenta.tag} não entra nela.`
                });
            }

            // Quantas TAGs deste mesmo ativo já foram bipadas nesta separação?
            let usadas = 0;
            if (jaBipadas.length) {
                const r = await pool.query(
                    "SELECT tipo FROM almox.ferramentas WHERE UPPER(tag) = ANY($1::text[])",
                    [jaBipadas]
                );
                usadas = r.rows.filter(f => String(f.tipo || '').toUpperCase() === tipoUp).length;
            }
            if (usadas >= pedidos[tipoUp]) {
                return res.status(409).json({
                    valido: false, motivo: 'cota_cheia', ferramenta,
                    erro: `As ${pedidos[tipoUp]} unidade(s) de "${ferramenta.tipo}" desta OS já foram bipadas.`
                });
            }
        }

        res.json({
            valido: true,
            ferramenta: {
                id: ferramenta.id,
                tag: ferramenta.tag,
                tipo: ferramenta.tipo,
                numero_serie: ferramenta.numero_serie,
                codigo_barras: ferramenta.codigo_barras
            }
        });
    } catch (err) {
        console.error("ERRO: POST /api/separacao/validar:", err.message);
        res.status(500).json({ valido: false, erro: err.message });
    }
});

// PUT /api/solicitacoes/:id/separar { responsavel }
// Transição Aguardando separação -> Separado, com responsável/data próprios
// (não sobrescreve conferido_por/em nem devolvido_por/em). Idempotente: se a
// OS já passou dessa etapa, não retrocede o status nem o carimbo.
app.put("/solicitacoes/:id/separar", async (req, res) => {
    try {
        const { responsavel } = req.body || {};
        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const statusAtual = String(os.status || '').toLowerCase().trim();
        if (statusAtual !== 'aguardando_conferencia') {
            // Já separada (ou em etapa posterior): não faz nada, só devolve a OS atual.
            return res.json(os);
        }

        // Quem separa também BIPA: cada TAG escolhida é confirmada fisicamente
        // antes de a OS seguir para a bipagem do técnico. O que ele bipou fica
        // guardado à parte (`separacao_bipagem`) — `conferencia` continua sendo
        // a bipagem de saída, feita pelo técnico.
        const bipagem = [];
        for (const it of (Array.isArray(req.body?.bipagem) ? req.body.bipagem : [])) {
            const f = await _buscarFerramentaPorCodigo(it.codigo || it.tag);
            if (!f) return res.status(409).json({ erro: `Código inválido na bipagem da separação: ${it.codigo || it.tag}` });
            bipagem.push({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                codigo: it.codigo || f.codigo_barras || f.tag,
                baia: it.baia || null,
                baia_id: it.baia_id || null,
                separado_em: new Date().toISOString(),
                separado_por: responsavel || null
            });
        }

        const r = await pool.query(`
            UPDATE almox.solicitacoes
               SET status = 'separado',
                   separado_em = CURRENT_TIMESTAMP,
                   separado_por = COALESCE($1, separado_por),
                   separacao_bipagem = $3::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
         RETURNING *
        `, [responsavel || null, req.params.id, JSON.stringify(bipagem)]);

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'separacao',
            motivo: bipagem.length
                ? `TAGs separadas e bipadas para a OS (${bipagem.length})`
                : 'TAGs separadas para a OS',
            observacao: bipagem.length ? bipagem.map(b => b.tag).join(', ') : null,
            data_evento: new Date().toISOString().slice(0, 10),
            usuario: responsavel || null
        });

        // Separada, a OS espera a bipagem de saída — e quem bipa é o técnico
        // daquela obra, não a fila inteira de quem enxerga a aba Retirada.
        await push.notificar(pool, 'bipar', {
            os: r.rows[0],
            remetente: os.solicitado_por,
            usuarioIds: os.responsavel_id ? [os.responsavel_id] : []
        });

        // "Item já disponível para retirada": é exatamente este o momento —
        // as TAGs foram separadas e bipadas, a OS mudou para "Separado".
        await mail.notificar(pool, 'retirada', {
            os: r.rows[0],
            instrumentos: bipagem.map(b => ({ tag: b.tag, tipo: b.tipo })),
            separadoPor: responsavel || null,
            separadoEm: new Date(),
            baia: bipagem.find(b => b.baia)?.baia || null
        });

        cache.invalidar("solicitacoes");
        res.json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/separar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// PUT /api/solicitacoes/:id/conferencia { itens, responsavel }
// O status resultante NÃO é escolhido pelo front — é calculado pela data da
// obra (data_inicio): conferência feita antes da data da obra vira
// "conferido"; se já chegou a data da obra, vira direto "em_campo".
app.put("/solicitacoes/:id/conferencia", async (req, res) => {
    try {
        const { itens, responsavel } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];
        if (!lista.length) return res.status(400).json({ erro: "Nenhum item conferido" });

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        // BIPAGEM PARCIAL: o técnico escolhe quais ferramentas leva. O que ele
        // deixou para trás vem aqui, com o motivo — que é obrigatório. Sem
        // motivo a gravação é recusada: o front pede, e o servidor confere.
        const pendenciasRecebidas = [];
        for (const p of (Array.isArray(req.body?.pendencias) ? req.body.pendencias : [])) {
            const motivo = String(p?.motivo || '').trim();
            if (!motivo) {
                return res.status(400).json({ erro: `Informe o motivo de ${p?.tag || 'a ferramenta'} não ter sido bipada.` });
            }
            pendenciasRecebidas.push({
                ferramenta_id: p.ferramenta_id || p.id || null,
                tag: p.tag || null,
                tipo: p.tipo || null,
                motivo,
                registrado_em: new Date().toISOString(),
                registrado_por: responsavel || null
            });
        }

        // Revalida cada item no backend antes de concluir a conferência
        const validados = [];
        for (const it of lista) {
            const f = await _buscarFerramentaPorCodigo(it.codigo || it.tag);
            if (!f) return res.status(409).json({ erro: `Código inválido: ${it.codigo || it.tag}` });
            validados.push({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                baia: it.baia || null,
                baia_id: it.baia_id || null,
                codigo: it.codigo || f.codigo_barras || f.tag,
                conferido_em: new Date().toISOString(),
                conferido_por: responsavel || null
            });
        }

        // ---- RETIRADA EM RODADAS ----
        //
        // A Retirada não é mais "uma vez e acabou". Levando 2 de 3 ferramentas,
        // a OS vai para campo com as duas, mas continua listada na Retirada até
        // a terceira ser bipada. Por isso:
        //
        //   • `conferencia` ACUMULA — a rodada nova soma à anterior, não a apaga;
        //   • `bipagem_pendencias` é o que ainda falta bipar: a TAG bipada
        //     agora sai da lista, a que ficou para trás entra (ou tem o motivo
        //     atualizado);
        //   • enquanto sobrar pendência, a Devolutiva não conclui a OS.
        const bipadasAgora = new Set(validados.map(v => String(v.tag || '').toUpperCase()));

        const conferenciaAnterior = jsonArray(os.conferencia)
            .filter(c => !bipadasAgora.has(String(c?.tag || '').toUpperCase()));
        const conferenciaFinal = [...conferenciaAnterior, ...validados];

        const pendencias = jsonArray(os.bipagem_pendencias)
            .filter(p => !bipadasAgora.has(String(p?.tag || '').toUpperCase()));
        pendenciasRecebidas.forEach(p => {
            const tag = String(p.tag || '').toUpperCase();
            if (!tag || bipadasAgora.has(tag)) return;
            const jaEstava = pendencias.findIndex(x => String(x?.tag || '').toUpperCase() === tag);
            if (jaEstava >= 0) pendencias[jaEstava] = p; else pendencias.push(p);
        });

        // As TAGs retiradas parcialmente continuam registradas na OS (com o seu
        // status), mas não são conferidas nem vão para campo. O mesmo vale para
        // as que ainda não saíram: elas seguem na OS, marcadas como pendentes.
        const retiradasDaOS = jsonArray(os.retiradas_parciais);
        const instrumentosFinais = conferenciaFinal.map(v => ({ id: v.ferramenta_id, tag: v.tag, tipo: v.tipo }));
        const jaListado = (item) => instrumentosFinais.some(x =>
            String(x.id) === String(item.id ?? item.ferramenta_id)
            || String(x.tag || '').toUpperCase() === String(item.tag || '').toUpperCase());
        pendencias.forEach(pp => {
            if (jaListado(pp)) return;
            instrumentosFinais.push({
                id: pp.ferramenta_id || pp.id, tag: pp.tag, tipo: pp.tipo,
                status_item: STATUS_ITEM_OS.AGUARDANDO_RETIRADA
            });
        });
        retiradasDaOS.forEach(rp => {
            if (jaListado(rp)) return;
            instrumentosFinais.push({ id: rp.id, tag: rp.tag, tipo: rp.tipo, status_item: STATUS_ITEM_OS.RETIRADA_PARCIAL });
        });
        // Quem entrou na OS DEPOIS da separação (inclusão parcial e ferramenta
        // remanejada para esta obra) nunca passa pela bipagem de saída, então
        // não está em `conferenciaFinal`. Sem esta linha, a rodada de Retirada
        // reescrevia `instrumentos` sem ela e a ferramenta remanejada deixava
        // de pertencer à OS — a devolutiva a mostrava e recusava a bipagem.
        jsonArray(os.inclusoes_parciais).forEach(inc => {
            if (!inc?.tag || jaListado(inc)) return;
            instrumentosFinais.push({
                id: inc.id || inc.ferramenta_id, tag: inc.tag, tipo: inc.tipo,
                status_item: inc.origem_remanejamento
                    ? STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO
                    : STATUS_ITEM_OS.INCLUIDA_PARCIAL
            });
        });

        const r = await pool.query(`
            UPDATE almox.solicitacoes
               SET conferencia = $1::jsonb,
                   status = CASE
                                WHEN status IN ('em_campo', 'prorrogada', 'concluida') THEN status
                                WHEN data_inicio > CURRENT_DATE THEN 'conferido'
                                ELSE 'em_campo'
                            END,
                   conferido_em = CURRENT_TIMESTAMP,
                   conferido_por = COALESCE($2, conferido_por),
                   instrumentos = $3::jsonb,
                   bipagem_pendencias = $5::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
         RETURNING *
        `, [
            JSON.stringify(conferenciaFinal),
            responsavel || null,
            JSON.stringify(instrumentosFinais),
            req.params.id,
            JSON.stringify(pendencias)
        ]);

        const novoStatus = r.rows[0].status;
        const destino = novoStatus === 'em_campo'
            ? (os.obra || os.cliente || 'Campo')
            : (validados.find(v => v.baia)?.baia || 'Almoxarifado');

        for (const v of validados) {
            await pool.query(
                "UPDATE almox.ferramentas SET status = $1, localizacao_atual = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3",
                [novoStatus === 'em_campo' ? 'em_campo' : 'reservado', destino, v.ferramenta_id]
            );
            await registrarMovimento({
                ferramenta_id: v.ferramenta_id,
                tag: v.tag,
                tipo: v.tipo,
                origem: 'Almoxarifado',
                destino,
                os_destino: String(os.numero_os || os.id),
                motivo: novoStatus === 'em_campo' ? 'Saída por conferência de OS' : 'Conferido e separado',
                responsavel: responsavel || null,
                status: 'confirmado',
                origem_evento: 'conferencia'
            });
            if (v.baia_id && !String(v.baia_id).startsWith('f')) {
                await registrarHistoricoBaia({
                    baia_id: parseInt(v.baia_id),
                    baia_rotulo: v.baia,
                    ferramenta_id: v.ferramenta_id,
                    tag: v.tag,
                    evento: novoStatus === 'em_campo' ? 'saida_da_baia' : 'entrada_na_baia',
                    origem: 'Almoxarifado',
                    destino,
                    os_id: os.id,
                    numero_os: os.numero_os,
                    motivo: 'Conferência de OS',
                    usuario: responsavel || null
                });
            }
        }

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'conferencia',
            motivo: `${validados.length} TAG(s) conferida(s)`,
            data_evento: new Date().toISOString().slice(0, 10),
            usuario: responsavel || null
        });

        // Cada ferramenta que ficou para trás vira um evento próprio: é assim
        // que o motivo de ela não ter ido a campo fica rastreável por TAG.
        for (const p of pendencias) {
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'bipagem_pendente',
                ferramenta_id: p.ferramenta_id,
                tag: p.tag,
                tipo: p.tipo,
                motivo: p.motivo,
                observacao: 'Não foi bipada na saída — não seguiu para a obra',
                data_evento: new Date().toISOString().slice(0, 10),
                usuario: responsavel || null
            });
        }

        // Bipada e em campo, a OS passa a esperar a devolutiva.
        if (novoStatus === 'em_campo') {
            // Vai só para o responsável daquela obra: era aqui que a lista
            // de donos era SOMADA a todo mundo com a permissão do módulo, e
            // 30 das 38 pessoas recebiam.
            await push.notificar(pool, 'devolver', {
                os: r.rows[0],
                remetente: os.solicitado_por,
                usuarioIds: os.responsavel_id ? [os.responsavel_id] : []
            });
        }

        cache.invalidar("solicitacoes", "ferramentas", "baias");
        // `retirada_pendente` é o que a tela usa para dizer "Bipado 2 de 3,
        // resta 1" e para manter a OS na Retirada.
        res.json({
            ...r.rows[0],
            retirada_pendente: pendencias.map(pp => pp.tag).filter(Boolean),
            retirada_completa: pendencias.length === 0
        });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/conferencia:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// TAGs QUE A OS TEM PARA RECEBER DE VOLTA
//
// Por muito tempo isso foi só `conferencia` — o que foi bipado na SAÍDA. Só
// que nem tudo que está na obra passou por lá: a ferramenta incluída
// parcialmente e a remanejada de outra obra entram na OS DEPOIS da separação
// e nunca aparecem em `conferencia`.
//
// Sem juntar as duas listas, a devolutiva recusava justamente essas TAGs com
// "A ferramenta X não saiu nesta OS" — embora a tela as mostrasse na lista de
// itens a bipar. É este conjunto que manda em toda validação de devolução.
// ------------------------------------------------------------
function _tagsQueVoltamNestaOS(os) {
    const tags = new Set();
    jsonArray(os.conferencia).forEach(c => { if (c?.tag) tags.add(String(c.tag).toUpperCase()); });
    // Inclusão parcial E remanejamento recebido — os dois gravam aqui.
    jsonArray(os.inclusoes_parciais).forEach(i => { if (i?.tag) tags.add(String(i.tag).toUpperCase()); });
    return tags;
}

// A TAG saiu desta OS por remanejamento? Então quem responde por ela agora é
// a OS de destino, e ela não deve ser bipada aqui.
//
// Só vale enquanto a OS de destino existir. Se ela tiver sido excluída, a
// baixa é ignorada e a TAG volta a poder ser bipada aqui — do contrário a
// ferramenta ficaria presa, sem OS nenhuma para devolvê-la.
async function _saiuPorRemanejamento(os, tag) {
    const alvo = String(tag || '').toUpperCase();
    const saida = jsonArray(os.saidas_remanejamento)
        .find(r => String(r?.tag || '').toUpperCase() === alvo) || null;
    if (!saida) return null;
    if (!saida.os_destino_id) return saida;

    const destino = await pool.query("SELECT 1 FROM almox.solicitacoes WHERE id = $1", [saida.os_destino_id]);
    return destino.rowCount ? saida : null;
}

// PUT /api/solicitacoes/:id/devolutiva { itens, responsavel }
// TAGs que ainda precisam voltar nesta OS: saíram na conferência e não foram
// retiradas nem devolvidas parcialmente.
function _tagsPendentesDeDevolucao(os) {
    const foraDaOS = new Set();
    // Ainda não bipada na Retirada: ela não está em campo, então não pode ser
    // devolvida — mas continua devendo. É o que impede a OS de se concluir
    // enquanto sobrar ferramenta parada no almoxarifado.
    const aguardandoRetirada = jsonArray(os.bipagem_pendencias)
        .map(pp => String(pp?.tag || '').toUpperCase()).filter(Boolean);
    jsonArray(os.retiradas_parciais).forEach(r => { if (r?.tag) foraDaOS.add(String(r.tag).toUpperCase()); });
    jsonArray(os.devolucoes_parciais).forEach(r => { if (r?.tag) foraDaOS.add(String(r.tag).toUpperCase()); });
    // Remanejada para outra obra: quem responde por ela agora é a OS de destino.
    jsonArray(os.saidas_remanejamento).forEach(r => { if (r?.tag) foraDaOS.add(String(r.tag).toUpperCase()); });
    // Já bipada numa rodada anterior da devolutiva: voltou, não é pendência.
    jsonArray(os.devolutiva).forEach(r => { if (r?.tag) foraDaOS.add(String(r.tag).toUpperCase()); });

    const conferidas = jsonArray(os.conferencia);
    const base = conferidas.length ? conferidas.slice() : normalizarInstrumentosOS(os);
    // O que entrou na OS DEPOIS da separação (inclusão parcial e remanejamento
    // recebido) nunca passou por `conferencia`, mas também tem de voltar.
    jsonArray(os.inclusoes_parciais).forEach(i => {
        const tag = String(i?.tag || '').toUpperCase();
        if (!tag) return;
        if (base.some(x => String(x?.tag || '').toUpperCase() === tag)) return;
        base.push(i);
    });
    const pendentes = base
        .map(x => String(x?.tag || '').toUpperCase())
        .filter(tag => tag && !foraDaOS.has(tag));
    aguardandoRetirada.forEach(tag => { if (!pendentes.includes(tag)) pendentes.push(tag); });
    return pendentes;
}

// Data (AAAA-MM-DD) de hoje no fuso local do servidor.
function _hojeISOLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

app.put("/solicitacoes/:id/devolutiva", async (req, res) => {
    try {
        const { itens, responsavel, finalizar, motivo_antecipacao } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        // Lista vazia só é aceita quando realmente não sobrou nada a devolver
        // (tudo já saiu por retirada/devolução parcial). Nesse caso a
        // devolutiva serve para encerrar a OS e liberar a baia.
        if (!lista.length) {
            const pendentes = _tagsPendentesDeDevolucao(os);
            if (pendentes.length) {
                return res.status(400).json({
                    erro: `Ainda faltam devolver: ${pendentes.join(', ')}`
                });
            }
        }

        // Aceita o que saiu na bipagem de saída E o que entrou depois
        // (inclusão parcial / remanejamento recebido).
        const daOS = _tagsQueVoltamNestaOS(os);

        const devolvidos = [];
        for (const it of lista) {
            const f = await _buscarFerramentaPorCodigo(it.codigo || it.tag);
            if (!f) return res.status(409).json({ erro: `Código inválido: ${it.codigo || it.tag}` });
            if (daOS.size && !daOS.has(String(f.tag).toUpperCase())) {
                return res.status(409).json({ erro: `A ferramenta ${f.tag} não saiu nesta OS` });
            }
            devolvidos.push({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                baia: it.baia || null,
                baia_id: it.baia_id || null,
                condicao: normalizarEstadoFerramenta(it.condicao),
                observacao: it.observacoes || it.observacao || null,
                devolvido_em: new Date().toISOString(),
                devolvido_por: responsavel || null
            });
        }

        // Itens já devolvidos parcialmente não precisam ser bipados de novo, e
        // continuam registrados na devolutiva final (o histórico não é perdido).
        //
        // O mesmo vale para uma devolutiva anterior INCOMPLETA: agora a
        // devolução pode vir em rodadas (o técnico escolhe o que está voltando
        // hoje), então o que já foi bipado antes precisa ser somado — sem
        // isso, a rodada nova apagaria a anterior.
        const parciais = jsonArray(os.devolucoes_parciais);
        const jaDevolvidosAntes = jsonArray(os.devolutiva);
        const devolucaoFinal = devolvidos.slice();
        [...jaDevolvidosAntes, ...parciais].forEach(pv => {
            if (devolucaoFinal.some(d => String(d.tag || '').toUpperCase() === String(pv.tag || '').toUpperCase())) return;
            devolucaoFinal.push(pv);
        });

        // A OS só se conclui quando TUDO voltou. Antes, `finalizar: true` vindo
        // do front bastava para encerrar mesmo faltando TAG — e a ferramenta
        // ficava presa, sem OS nenhuma cobrando a devolução dela.
        //
        // A lista de pendentes é a mesma de _tagsPendentesDeDevolucao (o que
        // saiu na bipagem MAIS o que entrou depois por inclusão parcial ou
        // remanejamento), descontado o que já foi devolvido nesta chamada.
        const jaDevolvidas = new Set(devolucaoFinal.map(d => String(d.tag || '').toUpperCase()).filter(Boolean));
        const faltantes = _tagsPendentesDeDevolucao(os).filter(tag => !jaDevolvidas.has(tag));
        const todosDevolvidos = faltantes.length === 0;

        // Devolução incompleta com pedido explícito de encerrar: recusa e diz
        // exatamente o que falta bipar.
        if (finalizar === true && faltantes.length) {
            return res.status(409).json({
                erro: `A OS só é concluída quando todas as ferramentas forem bipadas. Faltam: ${faltantes.join(', ')}`,
                faltantes
            });
        }

        // ---- DEVOLUÇÃO ANTECIPADA ----
        // Concluir a devolutiva antes da data de término contratada muda o
        // prazo da OS: a data de término passa a ser HOJE e a contratada fica
        // guardada em data_fim_original. O motivo é obrigatório — é ele que
        // justifica a diferença entre as duas datas no histórico e no PDF.
        const hoje = _hojeISOLocal();
        const fimContratado = os.data_fim ? new Date(os.data_fim).toISOString().slice(0, 10) : null;
        const antecipada = todosDevolvidos && !!fimContratado && hoje < fimContratado && !os.devolvida_antecipada;
        const motivoAntec = String(motivo_antecipacao || '').trim();
        if (antecipada && !motivoAntec) {
            return res.status(400).json({
                erro: "A devolutiva está sendo concluída antes do término previsto — informe o motivo da antecipação",
                antecipada: true,
                data_fim_original: fimContratado,
                data_fim_antecipada: hoje
            });
        }

        const r = await pool.query(`
            UPDATE almox.solicitacoes
               SET devolutiva = $1::jsonb,
                   status = CASE WHEN $2 THEN 'concluida' ELSE status END,
                   devolvido_em = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE devolvido_em END,
                   devolvido_por = COALESCE($3, devolvido_por),
                   instrumentos = CASE WHEN $2 THEN $5::jsonb ELSE instrumentos END,
                   devolvida_antecipada  = CASE WHEN $6 THEN TRUE        ELSE devolvida_antecipada END,
                   motivo_antecipacao    = CASE WHEN $6 THEN $7::text    ELSE motivo_antecipacao   END,
                   data_fim_original     = CASE WHEN $6 THEN $8::date    ELSE data_fim_original    END,
                   data_fim              = CASE WHEN $6 THEN $9::date    ELSE data_fim             END,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
         RETURNING *
        `, [
            JSON.stringify(devolucaoFinal),
            todosDevolvidos,
            responsavel || null,
            req.params.id,
            JSON.stringify(devolucaoFinal.map(d => ({ id: d.ferramenta_id || d.id, tag: d.tag, tipo: d.tipo }))),
            antecipada,
            antecipada ? motivoAntec : null,
            antecipada ? fimContratado : null,
            antecipada ? hoje : null
        ]);

        for (const d of devolvidos) {
            const destino = d.baia || 'Almoxarifado';
            // baia_id junto do texto: sem ele a ferramenta ficava com o nome
            // da baia nova em localizacao_atual mas continuava ligada à baia
            // antiga, e o Inventário mostrava as duas coisas ao mesmo tempo.
            // COALESCE preserva a baia atual quando a devolução não informa
            // nenhuma (devolvido ao almoxarifado, sem baia).
            await pool.query(
                `UPDATE almox.ferramentas
                    SET status = $1,
                        localizacao_atual = $2,
                        baia_id = COALESCE($4, baia_id),
                        atualizado_em = CURRENT_TIMESTAMP
                  WHERE id = $3`,
                [statusPorEstadoFerramenta(d.condicao), destino, d.ferramenta_id,
                 _idDeBaiaNumerico(d.baia_id)]
            );
            await registrarAvariaUtilizavel(d.ferramenta_id, d.condicao, d.observacao, _hojeISOLocal());
            await registrarMovimento({
                ferramenta_id: d.ferramenta_id,
                tag: d.tag,
                tipo: d.tipo,
                origem: os.obra || os.cliente || 'Campo',
                destino,
                os_origem: String(os.numero_os || os.id),
                motivo: 'Devolutiva de OS',
                observacao: d.observacao,
                responsavel: responsavel || null,
                status: 'confirmado',
                origem_evento: 'devolutiva'
            });

            // A baia que RECEBEU também registra a entrada. É o que permite
            // olhar uma baia e saber o que voltou para dentro dela, mesmo
            // quando não foi a baia original da OS.
            const idBaia = _idDeBaiaNumerico(d.baia_id);
            if (idBaia) {
                await registrarHistoricoBaia({
                    baia_id: idBaia,
                    baia_rotulo: d.baia,
                    ferramenta_id: d.ferramenta_id,
                    tag: d.tag,
                    evento: 'entrada_na_baia',
                    origem: os.obra || os.cliente || 'Campo',
                    destino,
                    os_id: os.id,
                    numero_os: os.numero_os,
                    motivo: 'Devolutiva de OS',
                    usuario: responsavel || null
                });
            }
        }

        // Libera as baias da OS quando tudo voltou (registrando no histórico)
        if (todosDevolvidos) {
            try {
                const ocupadas = await pool.query(
                    "SELECT id, ferramenta_id, descricao FROM almox.baias WHERE os_id = $1",
                    [os.id]
                );
                await pool.query(
                    `UPDATE almox.baias
                        SET status = 'disponivel',
                            os_id = NULL,
                            data_retorno = CURRENT_DATE,
                            data_liberacao = CURRENT_DATE,
                            atualizado_em = CURRENT_TIMESTAMP
                      WHERE os_id = $1`,
                    [os.id]
                );
                for (const b of ocupadas.rows) {
                    await registrarHistoricoBaia({
                        baia_id: b.id,
                        baia_ferramenta_id: b.ferramenta_id,
                        baia_rotulo: b.descricao,
                        evento: 'baia_liberada',
                        os_id: os.id,
                        numero_os: os.numero_os,
                        motivo: 'OS concluída',
                        usuario: responsavel || null
                    });
                }
            } catch (e) {
                console.warn("AVISO: Falha ao liberar baias da OS:", e.message);
            }
        }

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: todosDevolvidos ? 'devolucao_concluida' : 'devolucao',
            motivo: `${devolvidos.length} TAG(s) devolvida(s)`,
            data_evento: new Date().toISOString().slice(0, 10),
            usuario: responsavel || null
        });

        // A antecipação é um evento próprio: guarda as DUAS datas, para que o
        // histórico continue mostrando o prazo contratado mesmo depois de a
        // data de término da OS ter sido puxada para o dia da devolução.
        if (antecipada) {
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'devolucao_antecipada',
                motivo: motivoAntec,
                observacao: `Término de ${dataBR(fimContratado)} adiantado para ${dataBR(hoje)}`,
                data_evento: hoje,
                usuario: responsavel || null,
                dados: { data_fim_original: fimContratado, data_fim_antecipada: hoje }
            });
        }

        // AVARIA: cada ferramenta que voltou danificada vira um aviso próprio
        // para quem tem a permissão de receber e-mail de avaria. Um e-mail por
        // TAG, de propósito — juntar tudo num só esconderia o que aconteceu com
        // cada uma, e é justamente esse detalhe que interessa à Manutenção.
        for (const d of devolvidos) {
            if (!ehEstadoAvariado(d.condicao)) continue;
            await mail.notificar(pool, 'avaria', {
                os: r.rows[0],
                tag: d.tag,
                tipo: d.tipo,
                estado: d.condicao,
                observacao: d.observacao,
                devolvidoPor: responsavel || null,
                data: new Date()
            });
        }

        // STATUS DA OBRA: concluída é a mudança de status que mais interessa,
        // e é a única que acontece nesta rota.
        if (todosDevolvidos) {
            await mail.notificar(pool, 'status_obra', {
                os: r.rows[0],
                statusAnterior: os.status,
                statusAnteriorRotulo: rotuloStatusOS(os.status),
                statusNovo: r.rows[0].status,
                statusNovoRotulo: rotuloStatusOS(r.rows[0].status),
                usuario: responsavel || null,
                motivo: antecipada ? (motivo_antecipacao || 'Devolução antecipada') : null,
                data: new Date()
            });
        }

        // "OS Concluída" para quem enviou a solicitação e para o responsável.
        if (todosDevolvidos) {
            await push.notificar(pool, 'concluida', {
                os: r.rows[0],
                remetente: os.solicitado_por,
                usuarioIds: [os.solicitado_por_id, os.responsavel_id].filter(Boolean),
                corpo: antecipada
                    ? `Devolvida com antecedência — término adiantado para ${dataBR(hoje)}.`
                    : undefined
            });
        }

        cache.invalidar("solicitacoes", "ferramentas", "baias");
        res.json({
            os: r.rows[0],
            faltantes,
            concluida: todosDevolvidos,
            antecipada,
            data_fim_original: antecipada ? fimContratado : null,
            data_fim_antecipada: antecipada ? hoje : null
        });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/devolutiva:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// PUT /api/solicitacoes/:id/conferir-devolucao
//      { itens: [{ codigo, tag, estado, observacoes }], responsavel, observacao }
//
// A SEGUNDA CHECAGEM DA DEVOLUÇÃO.
//
// A devolutiva é feita por quem trouxe a ferramenta de volta. Esta etapa é de
// outra pessoa — a que tem a permissão "Conferir devolução": ela bipa o que
// voltou e diz, peça por peça, se voltou inteira. É auditoria, não fluxo:
//
//   * NÃO mexe no status da OS (ela já está concluída pela devolutiva);
//   * mexe, sim, no estado das FERRAMENTAS — uma avaria encontrada aqui vale
//     tanto quanto a encontrada na devolutiva, e manda a peça para a fila de
//     manutenção do mesmo jeito;
//   * carimba quem conferiu e quando, e é esse carimbo que a tela mostra como
//     "Devolução conferida por ...".
//
// Reconferir é permitido: o carimbo passa a ser o da última conferência, e o
// histórico guarda as duas.
// ------------------------------------------------------------
app.put("/solicitacoes/:id/conferir-devolucao", async (req, res) => {
    try {
        const { itens, responsavel, observacao } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        if (!lista.length) {
            return res.status(400).json({ erro: "Bipe ao menos uma ferramenta para conferir a devolução." });
        }

        // Só vale bipar o que esta OS devolveu de fato — na devolutiva ou nas
        // devoluções parciais. Bipar outra coisa aqui seria conferir a
        // devolução de outra obra.
        const devolvidasDaOS = new Set();
        jsonArray(os.devolutiva).forEach(d => { if (d?.tag) devolvidasDaOS.add(String(d.tag).toUpperCase()); });
        jsonArray(os.devolucoes_parciais).forEach(d => { if (d?.tag) devolvidasDaOS.add(String(d.tag).toUpperCase()); });

        const conferidos = [];
        for (const it of lista) {
            const f = await _buscarFerramentaPorCodigo(it.codigo || it.tag);
            if (!f) {
                return res.status(404).json({
                    erro: `O código "${String(it.codigo || it.tag || '').trim()}" não existe no Inventário.`
                });
            }
            const tagUp = String(f.tag || '').toUpperCase();
            if (devolvidasDaOS.size && !devolvidasDaOS.has(tagUp)) {
                return res.status(409).json({
                    erro: `${f.tag} não foi devolvida nesta OS — não há o que conferir aqui.`
                });
            }

            const estado = normalizarEstadoFerramenta(it.estado);
            const obsItem = it.observacoes ? String(it.observacoes).trim() : null;
            if (ehEstadoAvariado(estado) && !obsItem) {
                return res.status(400).json({
                    erro: `Descreva a avaria encontrada em ${f.tag}.`
                });
            }

            conferidos.push({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo || null,
                estado,
                observacoes: obsItem,
                conferido_em: new Date().toISOString(),
                conferido_por: responsavel ? String(responsavel).trim() : null
            });
        }

        // A avaria encontrada na conferência vale como qualquer outra: a
        // ferramenta muda de status e, sendo avaria de verdade, sai de
        // circulação até a manutenção.
        for (const c of conferidos) {
            await pool.query(
                `UPDATE almox.ferramentas
                    SET status = $1,
                        atualizado_em = CURRENT_TIMESTAMP
                  WHERE id = $2`,
                [statusPorEstadoFerramenta(c.estado), c.ferramenta_id]
            );
            await registrarAvariaUtilizavel(c.ferramenta_id, c.estado, c.observacoes, _hojeISOLocal());
        }

        const quem = responsavel ? String(responsavel).trim() : null;
        const atualizada = await pool.query(`
            UPDATE almox.solicitacoes
               SET devolucao_conferencia = $1::jsonb,
                   devolucao_conferida_por = $2,
                   devolucao_conferida_em = CURRENT_TIMESTAMP,
                   devolucao_conferencia_observacao = $3,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
         RETURNING *
        `, [JSON.stringify(conferidos), quem, observacao ? String(observacao).trim() : null, os.id]);

        // Uma linha por TAG no histórico da OS: é ali que se lê depois quem
        // conferiu o quê, e o que encontrou.
        for (const c of conferidos) {
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'devolucao_conferida',
                ferramenta_id: c.ferramenta_id,
                tag: c.tag,
                tipo: c.tipo,
                estado: c.estado,
                observacao: c.observacoes,
                usuario: quem,
                dados: { origem: 'conferencia_devolucao' }
            });
        }

        const avariadas = conferidos.filter(c => ehEstadoAvariado(c.estado));
        res.json({
            ok: true,
            os: atualizada.rows[0],
            conferidos: conferidos.length,
            avariadas: avariadas.length,
            devolucao_conferida_por: quem,
            devolucao_conferida_em: atualizada.rows[0]?.devolucao_conferida_em || null
        });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/conferir-devolucao:", err.message);
        res.status(500).json({ erro: err.message });
    }
});


// ============================================================
// OPERAÇÕES PARCIAIS DA OS
//   • Inclusão Parcial  -> entra na OS depois da separação
//   • Retirada Parcial  -> sai da OS antes de ir a campo
//   • Devolução Parcial -> volta do campo antes da devolutiva final
//
// Rastreabilidade é sempre POR TAG individual: cada unidade física tem os
// seus próprios registros. As três operações gravam no histórico da OS
// (`os_historico`); apenas a RETIRADA PARCIAL não gera evento no histórico
// individual da ferramenta — regra explícita do negócio.
// ============================================================

// Status de item dentro da OS (não confundir com o status da OS).
// Como cada TAG entrou ou saiu da OS. É esta marca que dá a cor do chip na
// tela de OS Concluídas: roxo para inclusão parcial, vermelho para o que saiu
// antes do fim e azul para as duas pontas do remanejamento.
const STATUS_ITEM_OS = {
    // A ferramenta faz parte da OS mas ainda NÃO foi bipada na Retirada: a
    // OS foi para campo pela metade e continua aparecendo lá até ela sair.
    AGUARDANDO_RETIRADA: 'aguardando_retirada',
    INCLUIDA_PARCIAL: 'incluida_parcialmente',
    INCLUIDA_REMANEJAMENTO: 'incluida_remanejamento',
    SAIDA_REMANEJAMENTO: 'saida_remanejamento',
    RETIRADA_PARCIAL: 'retirada_parcial',
    DEVOLVIDA_PARCIAL: 'devolvida_parcialmente'
};

let _osHistoricoOk = false;
async function garantirTabelaOSHistorico() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

async function registrarHistoricoOS(evt) {
    await garantirTabelaOSHistorico();
    const r = await pool.query(`
        INSERT INTO almox.os_historico
        (solicitacao_id, numero_os, evento, ferramenta_id, tag, tipo, status_item,
         motivo, observacao, estado, data_evento, usuario, dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
    `, [
        evt.solicitacao_id || null,
        evt.numero_os ? String(evt.numero_os) : null,
        evt.evento,
        evt.ferramenta_id || null,
        evt.tag || null,
        evt.tipo || null,
        evt.status_item || null,
        evt.motivo || null,
        evt.observacao || null,
        evt.estado || null,
        evt.data_evento || null,
        evt.usuario || null,
        JSON.stringify(evt.dados || {})
    ]);
    return r.rows[0];
}

function jsonArray(valor) {
    let lista = valor;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    return Array.isArray(lista) ? lista : [];
}

// Normaliza solicitacoes.instrumentos (que historicamente guarda ora IDs crus,
// ora TAGs, ora objetos) para objetos { id, tag, tipo, status_item }.
function normalizarInstrumentosOS(os) {
    return jsonArray(os.instrumentos).map(x => {
        if (x && typeof x === 'object') return { ...x };
        const bruto = String(x);
        return /^\d+$/.test(bruto) ? { id: Number(bruto) } : { tag: bruto };
    });
}

function mesmoItem(item, ferramenta) {
    if (!item || !ferramenta) return false;
    if (item.id !== undefined && item.id !== null && String(item.id) === String(ferramenta.id)) return true;
    if (item.ferramenta_id !== undefined && item.ferramenta_id !== null && String(item.ferramenta_id) === String(ferramenta.id)) return true;
    if (item.tag && ferramenta.tag && String(item.tag).toUpperCase() === String(ferramenta.tag).toUpperCase()) return true;
    return false;
}

// Data em pt-BR (dd/mm/aaaa). O driver do Postgres devolve Date, e o
// String() dele sai em inglês ("Thu Aug 20 ...") — nunca formate por slice.
function dataBR(valor) {
    if (!valor) return '';
    const d = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(d.getTime())) return String(valor).slice(0, 10);
    const dia = String(d.getUTCDate()).padStart(2, '0');
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

// ------------------------------------------------------------
// GET /api/ativos/disponibilidade?inicio=YYYY-MM-DD&fim=YYYY-MM-DD[&os_id=]
//
// Quantas unidades de cada ATIVO sobram NO PERÍODO PEDIDO.
//
// A tela de solicitação mostrava a contagem do Inventário — quantas TAGs
// daquele ativo existem —, o que é outra pergunta. Uma ferramenta prometida a
// outra obra na mesma semana, ou que vai estar na calibração, continuava
// aparecendo como disponível, e o aperto só aparecia na separação.
//
// Sem `inicio`/`fim` a resposta é sobre HOJE — é o que a tela mostra enquanto
// ninguém escolheu o período da obra.
//
// TIRAM UMA UNIDADE DO ATIVO NO PERÍODO:
//
//   OS JÁ SEPARADA    guarda as TAGs em `instrumentos`; cada TAG tira uma
//                     unidade do ativo dela.
//   OS AINDA NÃO      não tem TAG nenhuma; a reserva está em `quantidades`,
//   SEPARADA          com o NOME do ativo na chave (depois da separação essa
//                     chave passa a ser o id da ferramenta — por isso só as
//                     chaves não numéricas contam como reserva por ativo).
//   CALIBRAÇÃO        o período envio -> retorno gravado na ferramenta, quando
//                     cruza o período pedido.
//   MANUTENÇÃO        mesma ideia, com o período do cadastro de manutenção.
//   AVARIADA/INATIVA  não vai para obra nenhuma, em data nenhuma.
//
// Só entram as OS cujo período CRUZA o pedido e que ainda não se encerraram.
// A OS que está sendo editada (os_id) fica de fora: o que ela já reservou é
// dela. 'em_campo' não é bloqueio por si — a OS que a prende é que diz até
// quando.
//
// `motivos` devolve a conta aberta por ativo (obra / calibração / manutenção /
// avaria), que é o que a tela usa para explicar por que sobrou menos.
// ------------------------------------------------------------
const DISP_STATUS_AVARIA = ['avariado', 'avariada'];
// Dada baixa no Inventário: continua cadastrada, mas não vai mais para obra.
const DISP_STATUS_INATIVA = ['inativo', 'inativa'];

// Dois períodos se cruzam? Fim aberto (null) conta como "ainda não voltou".
function _periodoCruza(ini, fim, alvoIni, alvoFim) {
    if (!ini && !fim) return false;
    const comeca = ini || fim;
    if (comeca && comeca > alvoFim) return false;
    if (fim && fim < alvoIni) return false;
    return true;
}

function _dataISO(valor) {
    if (!valor) return null;
    if (valor instanceof Date) {
        const d = valor;
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    const s = String(valor).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

app.get("/ativos/disponibilidade", async (req, res) => {
    try {
        const hoje = _hojeISOLocal();
        const inicio = String(req.query.inicio || hoje).slice(0, 10);
        const fim = String(req.query.fim || inicio).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
            return res.status(400).json({ erro: "Informe inicio e fim no formato AAAA-MM-DD." });
        }
        const osIgnorada = parseInt(req.query.os_id, 10);

        const ferrRes = await pool.query(
            `SELECT id, tag, tipo, status, data_envio_calibracao, data_retorno_calibracao
               FROM almox.ferramentas`
        );

        // Manutenções com período informado — é o que tira a ferramenta de
        // circulação enquanto ela está fora da empresa.
        let manutencoes = [];
        try {
            const r = await pool.query(
                `SELECT instrumento_id, tag, data_envio, data_retorno FROM almox.manutencoes`
            );
            manutencoes = r.rows;
        } catch (e) {
            // A tabela nasce na primeira manutenção; sem ela, só não há o que descontar.
            console.warn("AVISO: manutenções não lidas na disponibilidade:", e.message);
        }

        const manutencaoNoPeriodo = new Set();
        manutencoes.forEach(m => {
            const ini = _dataISO(m.data_envio);
            const ret = _dataISO(m.data_retorno);
            if (!_periodoCruza(ini, ret, inicio, fim)) return;
            if (m.instrumento_id) manutencaoNoPeriodo.add(String(m.instrumento_id));
            if (m.tag) manutencaoNoPeriodo.add(String(m.tag).toUpperCase());
        });

        const total = {};
        const motivos = {};
        const tipoPorId = {};
        const tipoPorTag = {};
        const anota = (tipo, chave) => {
            if (!motivos[tipo]) motivos[tipo] = { obra: 0, calibracao: 0, manutencao: 0, avaria: 0, inativa: 0 };
            motivos[tipo][chave]++;
        };

        ferrRes.rows.forEach(f => {
            const tipo = f.tipo || 'Sem tipo';
            if (ehTipoBaia(tipo)) return;
            tipoPorId[String(f.id)] = tipo;
            if (f.tag) tipoPorTag[String(f.tag).toUpperCase()] = tipo;

            // Entra no total do ativo — o que sai, sai pelos motivos abaixo.
            total[tipo] = (total[tipo] || 0) + 1;
            if (!motivos[tipo]) motivos[tipo] = { obra: 0, calibracao: 0, manutencao: 0, avaria: 0, inativa: 0 };

            const status = String(f.status || '').toLowerCase().trim();
            if (DISP_STATUS_INATIVA.includes(status)) { anota(tipo, 'inativa'); return; }
            if (DISP_STATUS_AVARIA.includes(status)) { anota(tipo, 'avaria'); return; }

            const calIni = _dataISO(f.data_envio_calibracao);
            const calFim = _dataISO(f.data_retorno_calibracao);
            const emCalibracao = _periodoCruza(calIni, calFim, inicio, fim)
                || (!calIni && !calFim && (status === 'em_calibracao' || status === 'calibracao'));
            if (emCalibracao) { anota(tipo, 'calibracao'); return; }

            const emManutencao = manutencaoNoPeriodo.has(String(f.id))
                || manutencaoNoPeriodo.has(String(f.tag || '').toUpperCase())
                || ((status === 'em_manutencao' || status === 'manutencao')
                    && !manutencoes.some(m => String(m.instrumento_id) === String(f.id)));
            if (emManutencao) { anota(tipo, 'manutencao'); return; }
        });

        const osRes = await pool.query(
            `SELECT id, numero_os, status, data_inicio, data_fim, instrumentos, quantidades
               FROM almox.solicitacoes
              WHERE LOWER(TRIM(COALESCE(status, ''))) <> ALL($1::text[])
                AND COALESCE(data_inicio, data_fim) <= $3::date
                AND COALESCE(data_fim, data_inicio) >= $2::date`,
            [OS_ENCERRADAS, inicio, fim]
        );

        osRes.rows.forEach(os => {
            if (Number.isInteger(osIgnorada) && os.id === osIgnorada) return;

            const itens = normalizarInstrumentosOS(os);
            itens.forEach(item => {
                const tipo = item.tipo
                    || tipoPorId[String(item.id ?? item.ferramenta_id ?? '')]
                    || tipoPorTag[String(item.tag || '').toUpperCase()];
                if (tipo && !ehTipoBaia(tipo)) anota(tipo, 'obra');
            });

            // Reserva por ativo (OS ainda sem TAG): chave é o nome do ativo.
            let quantidades = os.quantidades;
            if (typeof quantidades === 'string') {
                try { quantidades = JSON.parse(quantidades); } catch (e) { quantidades = {}; }
            }
            if (!itens.length && quantidades && typeof quantidades === 'object') {
                Object.keys(quantidades).forEach(chave => {
                    if (/^\d+$/.test(String(chave).trim())) return;   // id de ferramenta
                    if (ehTipoBaia(chave)) return;
                    const n = parseInt(quantidades[chave], 10) || 0;
                    for (let i = 0; i < n; i++) anota(chave, 'obra');
                });
            }
        });

        const disponiveis = {};
        const comprometidos = {};
        Object.keys(total).forEach(tipo => {
            const m = motivos[tipo] || { obra: 0, calibracao: 0, manutencao: 0, avaria: 0, inativa: 0 };
            const fora = m.obra + m.calibracao + m.manutencao + m.avaria + m.inativa;
            comprometidos[tipo] = fora;
            disponiveis[tipo] = Math.max(0, total[tipo] - fora);
        });

        res.json({
            periodo: { inicio, fim, hoje: inicio === hoje && fim === hoje },
            total,
            comprometidos,
            motivos,
            disponiveis
        });
    } catch (err) {
        console.error("ERRO: GET /api/ativos/disponibilidade:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// GET /api/solicitacoes/:id/historico — linha do tempo da OS
// ------------------------------------------------------------
app.get("/solicitacoes/:id/historico", async (req, res) => {
    try {
        await garantirTabelaOSHistorico();
        const r = await pool.query(
            `SELECT * FROM almox.os_historico WHERE solicitacao_id = $1 ORDER BY criado_em DESC, id DESC LIMIT 500`,
            [req.params.id]
        );
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: GET /api/solicitacoes/:id/historico:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// PUT /api/solicitacoes/:id/prorrogar { data_fim, motivo, usuario }
//
// Estica o prazo de uma OS que está em campo, DIRETO — sem passar pela fila de
// aprovação. Por isso ela exige a permissão "Aceitar prorrogação": quem não a
// tem abre um pedido (POST /api/solicitacoes/:id/prorrogacoes), que é o
// caminho que o botão "Prorrogar" da tela usa.
//
// A nova data substitui a `data_fim` (é ela que manda no atraso, no quadro de
// baias e na Devolutiva), o status passa a 'prorrogada' e o evento fica no
// histórico da OS com a data anterior, a nova e o motivo — que é obrigatório.
//
// A prorrogação NÃO encerra nada: a OS só se conclui pela devolutiva.
// ------------------------------------------------------------
app.put("/solicitacoes/:id/prorrogar", async (req, res) => {
    try {
        const { data_fim, motivo, responsavel, usuario } = req.body || {};
        const quem = usuario || (responsavel ? { nome: responsavel } : null);
        if (!(await usuarioPodeAceitarProrrogacao(quem))) {
            return res.status(403).json({
                erro: "Prorrogar direto exige a permissão \"Aceitar prorrogação\". Abra uma solicitação de prorrogação."
            });
        }

        const novaData = String(data_fim || '').slice(0, 10);
        if (!String(motivo || '').trim()) {
            return res.status(400).json({ erro: "O motivo da prorrogação é obrigatório" });
        }

        const check = await validarPedidoProrrogacao(req.params.id, novaData);
        if (check.erro) return res.status(check.status).json({ erro: check.erro });

        const aplicado = await aplicarProrrogacaoNaOS(
            check.os, novaData, motivo, quem?.nome || null, { direta: true }
        );
        res.json({ os: aplicado.os, data_fim_anterior: aplicado.anterior, data_fim: novaData });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/prorrogar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// SOLICITAÇÃO DE PRORROGAÇÃO
//
// Prorrogar deixou de ser um ato: virou um PEDIDO. Quem está com a OS em
// campo informa a nova data de término e o motivo, e isso vira uma
// solicitação que aparece na aba "Aprovar" do Painel Geral para quem tem a
// permissão "Aceitar prorrogação" (`aceitar_prorrogacao`).
//
//   solicitada  ->  aprovada           (a data nova entra na OS)
//               ->  editada e aprovada (entra OUTRA data, com o motivo da edição)
//               ->  rejeitada          (a OS não muda; o motivo fica registrado)
//
// Cada ponta tem nome, carimbo e motivo próprios — na tabela e no histórico
// da OS. Enquanto o pedido está pendente, a OS não aceita um segundo: o botão
// "Prorrogar" some e o cartão mostra "aguardando aprovação".
// ============================================================
const PRORROGACAO_STATUS = { PENDENTE: 'pendente', APROVADA: 'aprovada', REJEITADA: 'rejeitada' };

let _prorrogacoesOk = false;
async function garantirTabelaProrrogacoes() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

// `usuarios.permissoes` foi gravada ao longo do tempo como objeto, array e
// string JSON. Ler as três evita negar acesso a quem tem a permissão só
// porque o formato do registro é antigo.
function listaDePermissoes(bruto) {
    let v = bruto;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
    if (Array.isArray(v)) return v.map(String);
    if (v && typeof v === 'object') return Object.keys(v).filter(k => v[k]);
    return [];
}

// Quem já mexia numa OS em andamento herda a permissão nova — mas só enquanto
// ela ainda não tiver sido configurada (ver abaixo).
const PRORROGACAO_HERDA_DE = ['gerenciar_os', 'aprovar_todas_os', 'prorrogar_os'];

// A permissão "aceitar_prorrogacao" nasce com este código: nenhum usuário a
// tem no banco no dia em que ela sobe, e sem herança a fila de prorrogações
// ficaria sem ninguém para decidir. Enquanto NINGUÉM a tiver, quem já podia
// prorrogar decide. Assim que o primeiro cargo é salvo com ela, a herança some
// e passa a valer só o que está marcado — inclusive o que foi desmarcado.
//
// É a mesma regra da tela de cargos (aplicarPermissoesHerdadas), aplicada de
// novo aqui: o frontend nunca é a única barreira.
async function permissaoProrrogacaoJaConfigurada() {
    try {
        const r = await pool.query(`
            SELECT 1 FROM almox.usuarios
             WHERE ativo = TRUE AND permissoes::text LIKE '%aceitar_prorrogacao%'
             LIMIT 1
        `);
        return r.rows.length > 0;
    } catch (e) {
        console.warn("AVISO: Falha ao verificar 'aceitar_prorrogacao':", e.message);
        return true; // na dúvida, exige a permissão explícita
    }
}

// Quem pode decidir uma prorrogação. A resposta vem do BANCO sempre que o id
// do usuário chega: a lista que o navegador manda serve só de reserva, para
// sessão antiga que ainda não tem o id no payload.
async function usuarioPodeAceitarProrrogacao(usuario) {
    if (!usuario) return false;

    let permissoes = null;
    const idUsuario = parseInt(usuario.id);
    if (Number.isInteger(idUsuario)) {
        try {
            const r = await pool.query("SELECT permissoes FROM almox.usuarios WHERE id = $1 AND ativo = TRUE", [idUsuario]);
            if (r.rows.length) permissoes = listaDePermissoes(r.rows[0].permissoes);
        } catch (e) {
            console.warn("AVISO: Falha ao ler permissões do usuário:", e.message);
        }
    }
    if (!permissoes) {
        permissoes = Array.isArray(usuario.permissoes) ? usuario.permissoes.map(String) : [];
    }

    if (permissoes.includes('*') || permissoes.includes('aceitar_prorrogacao')) return true;
    if (!permissoes.some(p => PRORROGACAO_HERDA_DE.includes(p))) return false;
    return !(await permissaoProrrogacaoJaConfigurada());
}

function dataISO(valor) {
    if (!valor) return null;
    const d = valor instanceof Date ? valor : new Date(valor);
    return isNaN(d.getTime()) ? String(valor).slice(0, 10) : d.toISOString().slice(0, 10);
}

// Aplica a nova data na OS. É o único lugar que mexe em data_fim por causa de
// prorrogação — a rota antiga e a aprovação do pedido passam as duas por aqui.
async function aplicarProrrogacaoNaOS(os, novaData, motivo, usuarioNome, dadosExtras) {
    const anterior = dataISO(os.data_fim);
    const r = await pool.query(`
        UPDATE almox.solicitacoes
           SET data_fim = $1::date,
               status = 'prorrogada',
               updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
     RETURNING *
    `, [novaData, os.id]);

    await registrarHistoricoOS({
        solicitacao_id: os.id,
        numero_os: os.numero_os,
        evento: 'prorrogacao',
        motivo: String(motivo || '').trim() || null,
        observacao: anterior
            ? `Término de ${dataBR(os.data_fim)} para ${dataBR(novaData)}`
            : `Término definido para ${dataBR(novaData)}`,
        data_evento: novaData,
        usuario: usuarioNome || null,
        dados: Object.assign({ data_fim_anterior: anterior, data_fim_nova: novaData }, dadosExtras || {})
    });

    cache.invalidar("solicitacoes", "baias");
    return { os: r.rows[0], anterior };
}

// Validações comuns: a OS existe, está em campo e a data proposta é posterior
// ao término atual. Devolve { erro, status } ou { os, anterior }.
async function validarPedidoProrrogacao(osId, novaData) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
        return { erro: "Informe a nova data de término (AAAA-MM-DD)", status: 400 };
    }
    const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [osId]);
    if (!osRes.rows.length) return { erro: "OS não encontrada", status: 404 };
    const os = osRes.rows[0];

    const status = String(os.status || '').toLowerCase().trim();
    if (!['em_campo', 'prorrogada'].includes(status)) {
        return { erro: "Só é possível prorrogar uma OS que está em campo", status: 409 };
    }

    const anterior = dataISO(os.data_fim);
    if (anterior && novaData <= anterior) {
        return { erro: `A nova data precisa ser posterior a ${dataBR(os.data_fim)}`, status: 400 };
    }
    return { os, anterior };
}

// ------------------------------------------------------------
// GET /api/prorrogacoes?status=pendente&os_id=123
//
// A aba "Aprovar" lê os pendentes daqui; a Devolutiva usa a mesma lista para
// saber quais OS já têm um pedido em aberto. Os dados da OS vêm no JOIN para
// o cartão não depender de outra chamada.
// ------------------------------------------------------------
app.get("/prorrogacoes", async (req, res) => {
    try {
        await garantirTabelaProrrogacoes();
        const filtros = [];
        const valores = [];
        const status = String(req.query.status || '').trim().toLowerCase();
        if (status && status !== 'todas') {
            valores.push(status);
            filtros.push(`p.status = $${valores.length}`);
        }
        if (req.query.os_id) {
            valores.push(parseInt(req.query.os_id));
            filtros.push(`p.solicitacao_id = $${valores.length}`);
        }
        const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
        const r = await pool.query(`
            SELECT p.*,
                   s.cliente, s.obra, s.responsavel, s.responsavel_id,
                   s.solicitado_por, s.data_inicio, s.status AS os_status,
                   s.data_fim AS os_data_fim
              FROM almox.os_prorrogacoes p
              LEFT JOIN almox.solicitacoes s ON s.id = p.solicitacao_id
              ${onde}
             ORDER BY p.solicitado_em DESC, p.id DESC
             LIMIT 300
        `, valores);
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: GET /api/prorrogacoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/solicitacoes/:id/prorrogacoes { data_fim, motivo, usuario }
//
// Abre o pedido. Nada muda na OS aqui: a data só entra quando alguém com a
// permissão "Aceitar prorrogação" aprovar.
// ------------------------------------------------------------
app.post("/solicitacoes/:id/prorrogacoes", async (req, res) => {
    try {
        await garantirTabelaProrrogacoes();
        const { data_fim, motivo, usuario } = req.body || {};
        const novaData = String(data_fim || '').slice(0, 10);
        if (!String(motivo || '').trim()) {
            return res.status(400).json({ erro: "O motivo da prorrogação é obrigatório" });
        }

        const check = await validarPedidoProrrogacao(req.params.id, novaData);
        if (check.erro) return res.status(check.status).json({ erro: check.erro });
        const { os, anterior } = check;

        // Um pedido de cada vez por OS: dois pendentes aprovariam datas
        // diferentes para a mesma OS sem ninguém perceber.
        const pendente = await pool.query(
            "SELECT * FROM almox.os_prorrogacoes WHERE solicitacao_id = $1 AND status = $2 LIMIT 1",
            [os.id, PRORROGACAO_STATUS.PENDENTE]
        );
        if (pendente.rows.length) {
            return res.status(409).json({
                erro: "Esta OS já tem uma prorrogação aguardando aprovação.",
                prorrogacao: pendente.rows[0]
            });
        }

        const idSolicitante = Number.isInteger(parseInt(usuario?.id)) ? parseInt(usuario.id) : null;
        const r = await pool.query(`
            INSERT INTO almox.os_prorrogacoes
            (solicitacao_id, numero_os, data_fim_anterior, data_fim_solicitada, motivo,
             status, solicitado_por, solicitado_por_id)
            VALUES ($1,$2,$3::date,$4::date,$5,$6,$7,$8)
            RETURNING *
        `, [
            os.id,
            os.numero_os ? String(os.numero_os) : null,
            anterior,
            novaData,
            String(motivo).trim(),
            PRORROGACAO_STATUS.PENDENTE,
            usuario?.nome || null,
            idSolicitante
        ]);

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'prorrogacao_solicitada',
            motivo: String(motivo).trim(),
            observacao: anterior
                ? `Pedido de término de ${dataBR(os.data_fim)} para ${dataBR(novaData)}`
                : `Pedido de término para ${dataBR(novaData)}`,
            data_evento: novaData,
            usuario: usuario?.nome || null,
            dados: { data_fim_anterior: anterior, data_fim_solicitada: novaData, prorrogacao_id: r.rows[0].id }
        });

        await push.notificar(pool, 'prorrogacao_solicitada', {
            os,
            remetente: usuario?.nome || os.solicitado_por,
            excluir: usuario?.id
        });

        res.status(201).json({ sucesso: true, prorrogacao: r.rows[0] });
    } catch (err) {
        console.error("ERRO: POST /api/solicitacoes/:id/prorrogacoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// PUT /api/prorrogacoes/:id/aprovar { data_fim, motivo_decisao, usuario }
//
// Aprovar e "editar e aprovar" são a mesma rota: mandando uma `data_fim`
// diferente da pedida, o pedido é marcado como EDITADO e o motivo da edição
// passa a ser obrigatório. Em qualquer um dos dois casos a data entra na OS.
// ------------------------------------------------------------
app.put("/prorrogacoes/:id/aprovar", async (req, res) => {
    try {
        await garantirTabelaProrrogacoes();
        const { data_fim, motivo_decisao, usuario } = req.body || {};

        if (!(await usuarioPodeAceitarProrrogacao(usuario))) {
            return res.status(403).json({ erro: "Você não tem permissão para aceitar prorrogações." });
        }

        const pedidoRes = await pool.query("SELECT * FROM almox.os_prorrogacoes WHERE id = $1", [req.params.id]);
        if (!pedidoRes.rows.length) return res.status(404).json({ erro: "Solicitação de prorrogação não encontrada" });
        const pedido = pedidoRes.rows[0];
        if (pedido.status !== PRORROGACAO_STATUS.PENDENTE) {
            return res.status(409).json({ erro: "Esta solicitação já foi decidida." });
        }

        const pedida = dataISO(pedido.data_fim_solicitada);
        const novaData = String(data_fim || pedida || '').slice(0, 10);
        const editada = novaData !== pedida;
        const justificativa = String(motivo_decisao || '').trim();
        if (editada && justificativa.length < 3) {
            return res.status(400).json({ erro: "Informe o motivo da alteração da data." });
        }

        // A OS pode ter mudado desde o pedido: revalidamos contra o estado de agora.
        const check = await validarPedidoProrrogacao(pedido.solicitacao_id, novaData);
        if (check.erro) return res.status(check.status).json({ erro: check.erro });
        const { os } = check;

        const r = await pool.query(`
            UPDATE almox.os_prorrogacoes
               SET status = $1,
                   data_fim_aprovada = $2::date,
                   editada = $3,
                   motivo_decisao = $4,
                   decidido_por = $5,
                   decidido_por_id = $6,
                   decidido_em = CURRENT_TIMESTAMP
             WHERE id = $7 AND status = $8
         RETURNING *
        `, [
            PRORROGACAO_STATUS.APROVADA,
            novaData,
            editada,
            justificativa || null,
            usuario?.nome || null,
            Number.isInteger(parseInt(usuario?.id)) ? parseInt(usuario.id) : null,
            pedido.id,
            PRORROGACAO_STATUS.PENDENTE
        ]);
        // O WHERE com o status antigo impede decisão dupla em corrida.
        if (!r.rows.length) return res.status(409).json({ erro: "Esta solicitação já foi decidida por outra pessoa." });

        const aplicado = await aplicarProrrogacaoNaOS(os, novaData, pedido.motivo, usuario?.nome, {
            prorrogacao_id: pedido.id,
            solicitado_por: pedido.solicitado_por,
            aprovado_por: usuario?.nome || null,
            data_fim_solicitada: pedida,
            editada,
            motivo_edicao: editada ? justificativa : null
        });

        if (editada) {
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'prorrogacao_editada',
                motivo: justificativa,
                observacao: `Data pedida ${dataBR(pedida)} alterada para ${dataBR(novaData)} na aprovação`,
                data_evento: novaData,
                usuario: usuario?.nome || null,
                dados: { prorrogacao_id: pedido.id, data_fim_solicitada: pedida, data_fim_aprovada: novaData }
            });
        }

        // Quem pediu precisa saber que a data mudou (e qual data ficou).
        if (pedido.solicitado_por_id) {
            await push.notificar(pool, 'prorrogada', {
                os: aplicado.os,
                usuarioIds: [pedido.solicitado_por_id],
                corpo: editada
                    ? `Prorrogação aprovada com outra data: ${dataBR(novaData)}.`
                    : `Prorrogação aprovada até ${dataBR(novaData)}.`,
                excluir: usuario?.id
            });
        }

        res.json({ sucesso: true, prorrogacao: r.rows[0], os: aplicado.os, data_fim: novaData });
    } catch (err) {
        console.error("ERRO: PUT /api/prorrogacoes/:id/aprovar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// PUT /api/prorrogacoes/:id/rejeitar { motivo, usuario }
//
// A OS não muda: continua com o término que já tinha. O motivo da recusa é
// obrigatório e fica no pedido e no histórico da OS.
// ------------------------------------------------------------
app.put("/prorrogacoes/:id/rejeitar", async (req, res) => {
    try {
        await garantirTabelaProrrogacoes();
        const { motivo, usuario } = req.body || {};

        if (!(await usuarioPodeAceitarProrrogacao(usuario))) {
            return res.status(403).json({ erro: "Você não tem permissão para aceitar prorrogações." });
        }
        const justificativa = String(motivo || '').trim();
        if (justificativa.length < 3) {
            return res.status(400).json({ erro: "O motivo da rejeição é obrigatório" });
        }

        const pedidoRes = await pool.query("SELECT * FROM almox.os_prorrogacoes WHERE id = $1", [req.params.id]);
        if (!pedidoRes.rows.length) return res.status(404).json({ erro: "Solicitação de prorrogação não encontrada" });
        const pedido = pedidoRes.rows[0];
        if (pedido.status !== PRORROGACAO_STATUS.PENDENTE) {
            return res.status(409).json({ erro: "Esta solicitação já foi decidida." });
        }

        const r = await pool.query(`
            UPDATE almox.os_prorrogacoes
               SET status = $1,
                   motivo_decisao = $2,
                   decidido_por = $3,
                   decidido_por_id = $4,
                   decidido_em = CURRENT_TIMESTAMP
             WHERE id = $5 AND status = $6
         RETURNING *
        `, [
            PRORROGACAO_STATUS.REJEITADA,
            justificativa,
            usuario?.nome || null,
            Number.isInteger(parseInt(usuario?.id)) ? parseInt(usuario.id) : null,
            pedido.id,
            PRORROGACAO_STATUS.PENDENTE
        ]);
        if (!r.rows.length) return res.status(409).json({ erro: "Esta solicitação já foi decidida por outra pessoa." });

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [pedido.solicitacao_id]);
        const os = osRes.rows[0] || { id: pedido.solicitacao_id, numero_os: pedido.numero_os };

        await registrarHistoricoOS({
            solicitacao_id: pedido.solicitacao_id,
            numero_os: pedido.numero_os,
            evento: 'prorrogacao_rejeitada',
            motivo: justificativa,
            observacao: `Pedido de término para ${dataBR(pedido.data_fim_solicitada)} rejeitado — a OS mantém o prazo atual`,
            data_evento: hojeISO(),
            usuario: usuario?.nome || null,
            dados: {
                prorrogacao_id: pedido.id,
                solicitado_por: pedido.solicitado_por,
                data_fim_solicitada: dataISO(pedido.data_fim_solicitada)
            }
        });

        if (pedido.solicitado_por_id) {
            await push.notificar(pool, 'prorrogacao_rejeitada', {
                os,
                usuarioIds: [pedido.solicitado_por_id],
                excluir: usuario?.id
            });
        }

        res.json({ sucesso: true, prorrogacao: r.rows[0] });
    } catch (err) {
        console.error("ERRO: PUT /api/prorrogacoes/:id/rejeitar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// GET /api/solicitacoes/:id/ferramentas — itens da OS com o status de cada
// TAG (inclusive as parciais). É a fonte dos popups e do grid da OS.
// ------------------------------------------------------------
app.get("/solicitacoes/:id/ferramentas", async (req, res) => {
    try {
        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const itens = normalizarInstrumentosOS(os);
        const conferencia = jsonArray(os.conferencia);
        const devolutiva = jsonArray(os.devolutiva);
        const retiradas = jsonArray(os.retiradas_parciais);
        const inclusoes = jsonArray(os.inclusoes_parciais);
        // Inclusão parcial e remanejamento recebido entram na OS DEPOIS da
        // separação. Elas já são gravadas em `instrumentos`, mas OS antigas
        // (gravadas antes da correção) podem não tê-las lá — sem isto a
        // ferramenta remanejada some do grid e dos popups.
        inclusoes.forEach(inc => {
            if (!inc || (!inc.tag && !inc.id)) return;
            if (itens.some(x => mesmoItem(x, { id: inc.id ?? inc.ferramenta_id, tag: inc.tag }))) return;
            itens.push({ id: inc.id ?? inc.ferramenta_id, tag: inc.tag, tipo: inc.tipo });
        });
        const devolucoes = jsonArray(os.devolucoes_parciais);
        const saidasRem = jsonArray(os.saidas_remanejamento);

        const ids = itens.map(i => parseInt(i.id ?? i.ferramenta_id)).filter(v => !isNaN(v));
        const tags = itens.map(i => i.tag).filter(Boolean);

        const inv = await pool.query(
            `SELECT * FROM almox.ferramentas
              WHERE ($1::int[] IS NOT NULL AND id = ANY($1::int[]))
                 OR ($2::text[] IS NOT NULL AND UPPER(tag) = ANY($2::text[]))`,
            [ids.length ? ids : null, tags.length ? tags.map(t => String(t).toUpperCase()) : null]
        );

        const lista = itens.map(item => {
            const f = inv.rows.find(x => mesmoItem(item, x)) || null;
            const ref = f || { id: item.id, tag: item.tag, tipo: item.tipo };
            const retirada = retiradas.find(r => mesmoItem(r, ref));
            const inclusao = inclusoes.find(r => mesmoItem(r, ref));
            const devolucao = devolucoes.find(r => mesmoItem(r, ref));
            const saidaRem = saidasRem.find(r => mesmoItem(r, ref));
            const conferida = conferencia.some(c => mesmoItem(c, ref));
            const devolvida = devolutiva.some(c => mesmoItem(c, ref));

            // Ordem de precedência: o que ACONTECEU por último com a TAG manda
            // na marca. Registros antigos de inclusão por remanejamento não
            // guardavam status próprio — daí o teste por origem_remanejamento.
            let status_item = null;
            if (saidaRem) status_item = STATUS_ITEM_OS.SAIDA_REMANEJAMENTO;
            else if (retirada) status_item = STATUS_ITEM_OS.RETIRADA_PARCIAL;
            else if (devolucao) status_item = STATUS_ITEM_OS.DEVOLVIDA_PARCIAL;
            else if (inclusao) {
                status_item = (inclusao.origem_remanejamento
                    || inclusao.status_item === STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO)
                    ? STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO
                    : STATUS_ITEM_OS.INCLUIDA_PARCIAL;
            }

            return {
                ferramenta_id: ref.id || null,
                tag: ref.tag || item.tag || null,
                tipo: ref.tipo || item.tipo || null,
                numero_serie: f?.numero_serie || null,
                codigo_barras: f?.codigo_barras || null,
                localizacao_atual: f?.localizacao_atual || null,
                status_ferramenta: f?.status || null,
                status_item,
                conferida,
                devolvida,
                retirada_parcial: retirada || null,
                inclusao_parcial: inclusao || null,
                devolucao_parcial: devolucao || null,
                saida_remanejamento: saidaRem || null,
                origem_remanejamento: (inclusao && inclusao.origem_remanejamento) || null,
                avaria_utilizavel: !!(f && f.avaria_utilizavel),
                avaria_observacao: (f && f.avaria_observacao) || null
            };
        });

        res.json({ os_id: os.id, numero_os: os.numero_os, status: os.status, itens: lista });
    } catch (err) {
        console.error("ERRO: GET /api/solicitacoes/:id/ferramentas:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/solicitacoes/:id/inclusao-parcial
// body: { itens: [{ ferramenta_id | tag, data_saida, motivo, observacao }], responsavel }
// ------------------------------------------------------------
app.post("/solicitacoes/:id/inclusao-parcial", async (req, res) => {
    try {
        const { itens, responsavel } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];
        if (!lista.length) return res.status(400).json({ erro: "Selecione ao menos uma ferramenta" });

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const instrumentos = normalizarInstrumentosOS(os);
        const inclusoes = jsonArray(os.inclusoes_parciais);
        let retiradas = jsonArray(os.retiradas_parciais);
        const emCampo = ['em_campo', 'prorrogada'].includes(String(os.status || '').toLowerCase());

        const adicionadas = [];
        const ignoradas = [];
        const retornadas = [];

        for (const it of lista) {
            if (!String(it.motivo || '').trim()) {
                return res.status(400).json({ erro: "O motivo da inclusão é obrigatório" });
            }

            const fRes = it.ferramenta_id
                ? await pool.query("SELECT * FROM almox.ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT * FROM almox.ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag || '').trim()]);
            const f = fRes.rows[0];
            if (!f) return res.status(404).json({ erro: `Ferramenta não encontrada: ${it.ferramenta_id || it.tag}` });

            // VOLTA DE UM ITEM RETIRADO PARCIALMENTE
            //
            // A ferramenta continua listada em `instrumentos` (marcada como
            // retirada), então o teste de duplicidade abaixo a barraria. Aqui
            // ela é destravada: sai de `retiradas_parciais`, volta a valer na
            // OS e o retorno vira um evento próprio no histórico.
            //
            // Única porta fechada: retirada por AVARIA não volta — a
            // ferramenta está no fluxo de manutenção.
            const retiradaAnterior = retiradas.find(x => mesmoItem(x, f));
            if (retiradaAnterior) {
                if (String(retiradaAnterior.estado || retiradaAnterior.condicao || '').toLowerCase() === 'avariado') {
                    return res.status(409).json({
                        erro: `${f.tag} foi retirada como avariada e não pode voltar para a OS.`
                    });
                }

                retiradas = retiradas.filter(x => !mesmoItem(x, f));

                const alvoItem = instrumentos.find(x => mesmoItem(x, f));
                if (alvoItem) alvoItem.status_item = STATUS_ITEM_OS.INCLUIDA_PARCIAL;
                else instrumentos.push({ id: f.id, tag: f.tag, tipo: f.tipo, status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL });

                const registroRetorno = {
                    id: f.id,
                    ferramenta_id: f.id,
                    tag: f.tag,
                    tipo: f.tipo,
                    data_saida: it.data_saida || hojeISO(),
                    motivo: String(it.motivo).trim(),
                    observacao: it.observacao ? String(it.observacao).trim() : null,
                    status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL,
                    retorno_de_retirada: true,
                    retirada_anterior: {
                        data_retirada: retiradaAnterior.data_retirada || null,
                        motivo: retiradaAnterior.motivo || null,
                        estado: retiradaAnterior.estado || retiradaAnterior.condicao || null
                    },
                    incluido_em: new Date().toISOString(),
                    incluido_por: responsavel || null
                };
                inclusoes.push(registroRetorno);
                retornadas.push(registroRetorno);

                const destinoRetorno = emCampo ? (os.obra || os.cliente || 'Campo') : (f.localizacao_atual || 'Almoxarifado');
                await pool.query(
                    "UPDATE almox.ferramentas SET status = $1, localizacao_atual = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3",
                    [emCampo ? 'em_campo' : 'reservado', destinoRetorno, f.id]
                );

                // Cada ida e cada volta vira uma linha do histórico da OS: a
                // trilha da ferramenta nesta OS fica completa mesmo quando ela
                // sai e volta várias vezes.
                await registrarHistoricoOS({
                    solicitacao_id: os.id,
                    numero_os: os.numero_os,
                    evento: 'retorno_parcial',
                    ferramenta_id: f.id,
                    tag: f.tag,
                    tipo: f.tipo,
                    status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL,
                    motivo: registroRetorno.motivo,
                    observacao: retiradaAnterior.motivo
                        ? `Havia sido retirada em ${dataBR(retiradaAnterior.data_retirada)} — ${retiradaAnterior.motivo}`
                        : registroRetorno.observacao,
                    estado: 'ok',
                    data_evento: registroRetorno.data_saida,
                    usuario: responsavel || null
                });

                await registrarMovimento({
                    ferramenta_id: f.id,
                    tag: f.tag,
                    tipo: f.tipo,
                    origem: f.localizacao_atual || 'Almoxarifado',
                    destino: destinoRetorno,
                    os_destino: String(os.numero_os || os.id),
                    motivo: `Retorno à OS após retirada parcial: ${registroRetorno.motivo}`,
                    observacao: registroRetorno.observacao,
                    responsavel: responsavel || null,
                    status: 'confirmado',
                    origem_evento: 'retorno_parcial'
                });

                continue;
            }

            // Não duplica: se a TAG já está na OS, ela é ignorada silenciosamente.
            if (instrumentos.some(x => mesmoItem(x, f))) { ignoradas.push(f.tag); continue; }

            const registro = {
                id: f.id,
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                data_saida: it.data_saida || hojeISO(),
                motivo: String(it.motivo).trim(),
                observacao: it.observacao ? String(it.observacao).trim() : null,
                status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL,
                incluido_em: new Date().toISOString(),
                incluido_por: responsavel || null
            };

            instrumentos.push({ id: f.id, tag: f.tag, tipo: f.tipo, status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL });
            inclusoes.push(registro);
            adicionadas.push(registro);

            const destino = emCampo ? (os.obra || os.cliente || 'Campo') : (f.localizacao_atual || 'Almoxarifado');
            await pool.query(
                "UPDATE almox.ferramentas SET status = $1, localizacao_atual = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3",
                [emCampo ? 'em_campo' : 'reservado', destino, f.id]
            );

            // Histórico da OS
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'inclusao_parcial',
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL,
                motivo: registro.motivo,
                observacao: registro.observacao,
                data_evento: registro.data_saida,
                usuario: responsavel || null
            });

            // Histórico da ferramenta (a inclusão parcial ENTRA aqui)
            await registrarMovimento({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                origem: f.localizacao_atual || 'Almoxarifado',
                destino,
                os_destino: String(os.numero_os || os.id),
                motivo: `Inclusão parcial na OS: ${registro.motivo}`,
                observacao: registro.observacao,
                responsavel: responsavel || null,
                status: 'confirmado',
                origem_evento: 'inclusao_parcial'
            });
        }

        const r = await pool.query(`
            UPDATE almox.solicitacoes
               SET instrumentos = $1::jsonb,
                   inclusoes_parciais = $2::jsonb,
                   retiradas_parciais = $3::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
         RETURNING *
        `, [JSON.stringify(instrumentos), JSON.stringify(inclusoes), JSON.stringify(retiradas), os.id]);

        cache.invalidar("solicitacoes", "ferramentas");
        res.json({ os: r.rows[0], incluidas: adicionadas, retornadas, ignoradas });
    } catch (err) {
        console.error("ERRO: POST /api/solicitacoes/:id/inclusao-parcial:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/solicitacoes/:id/retirada-parcial
// body: { itens: [{ ferramenta_id | tag, data_retirada, motivo }], responsavel }
//
// REGRA FIXA: a retirada parcial NÃO entra no histórico individual da
// ferramenta — fica registrada somente no histórico da OS.
// ------------------------------------------------------------
app.post("/solicitacoes/:id/retirada-parcial", async (req, res) => {
    // body.itens[].estado: 'ok' (Bom / Em ordem) | 'avariado'
    // 'avariado' marca a ferramenta como avariada no Inventário, o que a faz
    // aparecer na aba Manutenção.
    try {
        const { itens, responsavel } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];
        if (!lista.length) return res.status(400).json({ erro: "Selecione ao menos uma ferramenta" });

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const instrumentos = normalizarInstrumentosOS(os);
        const retiradas = jsonArray(os.retiradas_parciais);
        const retiradasNovas = [];

        for (const it of lista) {
            if (!String(it.motivo || '').trim()) {
                return res.status(400).json({ erro: "O motivo da retirada é obrigatório" });
            }

            const fRes = it.ferramenta_id
                ? await pool.query("SELECT * FROM almox.ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT * FROM almox.ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag || '').trim()]);
            const f = fRes.rows[0];
            if (!f) return res.status(404).json({ erro: `Ferramenta não encontrada: ${it.ferramenta_id || it.tag}` });

            if (!instrumentos.some(x => mesmoItem(x, f))) {
                return res.status(409).json({ erro: `A ferramenta ${f.tag} não pertence a esta OS` });
            }
            if (retiradas.some(x => mesmoItem(x, f))) continue; // já retirada

            // 'ok', 'avariado' ou 'avariado_utilizavel' (ver normalizarEstadoFerramenta).
            const estado = normalizarEstadoFerramenta(it.estado || it.condicao);

            const registro = {
                id: f.id,
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                data_retirada: it.data_retirada || hojeISO(),
                motivo: String(it.motivo).trim(),
                observacao: it.observacao ? String(it.observacao).trim() : null,
                estado,
                condicao: estado,
                status_item: STATUS_ITEM_OS.RETIRADA_PARCIAL,
                retirado_em: new Date().toISOString(),
                retirado_por: responsavel || null
            };
            retiradas.push(registro);
            retiradasNovas.push(registro);

            // Marca o item na OS (permanece na OS, mas não vai para campo)
            const alvo = instrumentos.find(x => mesmoItem(x, f));
            if (alvo) alvo.status_item = STATUS_ITEM_OS.RETIRADA_PARCIAL;

            // A ferramenta NÃO vai para campo. Retirada por avaria que exige
            // conserto, ela fica "avariado" e aparece na aba Manutenção. Nos
            // outros dois casos volta a ficar disponível no almoxarifado — e a
            // avaria que não impede o uso fica gravada na própria ferramenta.
            if (estado === ESTADO_AVARIADO) {
                await pool.query(
                    "UPDATE almox.ferramentas SET status = 'avariado', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1",
                    [f.id]
                );
            } else {
                await pool.query(
                    "UPDATE almox.ferramentas SET status = 'disponivel', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1 AND status <> 'em_campo'",
                    [f.id]
                );
            }
            await registrarAvariaUtilizavel(f.id, estado, registro.observacao, registro.data_retirada);

            // Somente histórico da OS — nunca `remanejamentos` (histórico da ferramenta)
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'retirada_parcial',
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                status_item: STATUS_ITEM_OS.RETIRADA_PARCIAL,
                motivo: registro.motivo,
                observacao: registro.observacao,
                estado,
                data_evento: registro.data_retirada,
                usuario: responsavel || null,
                dados: { retirada_por: registro.motivo }
            });
        }

        const r = await pool.query(`
            UPDATE almox.solicitacoes
               SET instrumentos = $1::jsonb,
                   retiradas_parciais = $2::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
         RETURNING *
        `, [JSON.stringify(instrumentos), JSON.stringify(retiradas), os.id]);

        cache.invalidar("solicitacoes", "ferramentas");
        res.json({ os: r.rows[0], retiradas: retiradasNovas });
    } catch (err) {
        console.error("ERRO: POST /api/solicitacoes/:id/retirada-parcial:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/solicitacoes/:id/devolucao-parcial
// body: { itens: [{ ferramenta_id | tag, estado, observacao }],
//         data_devolucao, motivo, baia_id, responsavel }
// ------------------------------------------------------------
app.post("/solicitacoes/:id/devolucao-parcial", async (req, res) => {
    try {
        const { itens, responsavel, data_devolucao, motivo, baia_id, baia } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];
        if (!lista.length) return res.status(400).json({ erro: "Selecione ao menos uma ferramenta" });
        if (!String(motivo || '').trim()) return res.status(400).json({ erro: "O motivo da devolução parcial é obrigatório" });

        const osRes = await pool.query("SELECT * FROM almox.solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const conferencia = jsonArray(os.conferencia);
        const devolutiva = jsonArray(os.devolutiva);
        const devolucoes = jsonArray(os.devolucoes_parciais);
        const dataEvento = data_devolucao || hojeISO();
        const motivoTexto = String(motivo).trim();

        const devolvidasAgora = [];

        for (const it of lista) {
            const fRes = it.ferramenta_id
                ? await pool.query("SELECT * FROM almox.ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT * FROM almox.ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag || '').trim()]);
            const f = fRes.rows[0];
            if (!f) return res.status(404).json({ erro: `Ferramenta não encontrada: ${it.ferramenta_id || it.tag}` });

            // Mesma regra da devolutiva: vale o que saiu na bipagem de saída
            // e o que entrou depois, por inclusão parcial ou remanejamento.
            const daOS = _tagsQueVoltamNestaOS(os);
            if (daOS.size && !daOS.has(String(f.tag || '').toUpperCase())) {
                return res.status(409).json({ erro: `A ferramenta ${f.tag} não saiu nesta OS` });
            }
            if (devolucoes.some(d => mesmoItem(d, f))) continue; // já devolvida parcialmente

            const estado = normalizarEstadoFerramenta(it.estado || it.condicao);
            const registro = {
                id: f.id,
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                estado,
                condicao: estado,
                motivo: motivoTexto,
                observacao: it.observacao ? String(it.observacao).trim() : null,
                data_devolucao: dataEvento,
                baia_id: baia_id || it.baia_id || null,
                baia: baia || it.baia || null,
                status_item: STATUS_ITEM_OS.DEVOLVIDA_PARCIAL,
                devolvido_em: new Date().toISOString(),
                devolvido_por: responsavel || null
            };
            devolucoes.push(registro);
            devolutiva.push(registro);
            devolvidasAgora.push(registro);

            // Sai de "Em campo" e volta para a baia/almoxarifado
            const destino = registro.baia || 'Almoxarifado';
            const statusFerramenta = statusPorEstadoFerramenta(estado);
            await pool.query(
                `UPDATE almox.ferramentas
                    SET status = $1,
                        localizacao_atual = $2,
                        baia_id = COALESCE($3, baia_id),
                        atualizado_em = CURRENT_TIMESTAMP
                  WHERE id = $4`,
                [statusFerramenta, destino, registro.baia_id ? parseInt(registro.baia_id) : null, f.id]
            );
            await registrarAvariaUtilizavel(f.id, estado, registro.observacao, dataEvento);

            // Histórico da OS
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'devolucao_parcial',
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                status_item: STATUS_ITEM_OS.DEVOLVIDA_PARCIAL,
                motivo: motivoTexto,
                observacao: registro.observacao,
                estado,
                data_evento: dataEvento,
                usuario: responsavel || null
            });

            // Histórico da ferramenta (a devolução parcial ENTRA aqui)
            await registrarMovimento({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                origem: os.obra || os.cliente || 'Campo',
                destino,
                os_origem: String(os.numero_os || os.id),
                motivo: `Devolução parcial: ${motivoTexto}`,
                observacao: [registro.observacao, `Estado: ${estado}`].filter(Boolean).join(' · '),
                responsavel: responsavel || null,
                status: 'confirmado',
                origem_evento: 'devolucao_parcial'
            });

            if (registro.baia_id) {
                await registrarHistoricoBaia({
                    baia_id: parseInt(registro.baia_id),
                    baia_rotulo: registro.baia,
                    ferramenta_id: f.id,
                    tag: f.tag,
                    evento: 'entrada_na_baia',
                    origem: os.obra || os.cliente || 'Campo',
                    destino,
                    os_id: os.id,
                    numero_os: os.numero_os,
                    motivo: `Devolução parcial: ${motivoTexto}`,
                    usuario: responsavel || null
                });
            }
        }

        const r = await pool.query(`
            UPDATE almox.solicitacoes
               SET devolucoes_parciais = $1::jsonb,
                   devolutiva = $2::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
         RETURNING *
        `, [JSON.stringify(devolucoes), JSON.stringify(devolutiva), os.id]);

        cache.invalidar("solicitacoes", "ferramentas", "baias");
        res.json({ os: r.rows[0], devolvidas: devolvidasAgora });
    } catch (err) {
        console.error("ERRO: POST /api/solicitacoes/:id/devolucao-parcial:", err.message);
        res.status(500).json({ erro: err.message });
    }
});


// ============================================================
// AVISOS QUE DEPENDEM DA DATA, NÃO DE UM CLIQUE
//
// Dois dos avisos pedidos não têm um "alguém fez alguma coisa" para servir de
// gatilho — eles acontecem porque o CALENDÁRIO andou:
//
//   • último dia da obra  -> quem responde pela OS precisa fazer a devolutiva
//                            ou pedir prorrogação
//   • certificado         -> mudou de vigente para a vencer, ou para vencido
//
// Como o servidor é serverless (a Vercel não mantém processo em pé), não há
// setInterval que sobreviva: o disparo vem de fora, por uma chamada diária a
// GET /api/notificacoes/diarias — o cron declarado em vercel.json.
//
// A tabela `notificacoes_enviadas` é o que impede o mesmo aviso de sair duas
// vezes: a chave carrega o dia, então rodar o cron dez vezes no mesmo dia
// manda um e-mail só. E, como a chave é única no banco, duas execuções
// simultâneas também não se atropelam.
// ============================================================
let _notifTabelaOk = false;
async function garantirTabelaNotificacoes() {
    /* a estrutura vem de db/atualizacao-38.sql.txt */
}

// Reserva o aviso. Devolve true só na PRIMEIRA vez — quem receber false não
// deve enviar nada.
async function reservarAviso(chave) {
    try {
        await garantirTabelaNotificacoes();
        const r = await pool.query(
            "INSERT INTO almox.notificacoes_enviadas (chave) VALUES ($1) ON CONFLICT (chave) DO NOTHING RETURNING id",
            [String(chave)]
        );
        return r.rows.length > 0;
    } catch (e) {
        console.warn("AVISO: falha ao reservar o aviso:", e.message);
        return false;
    }
}

// O status do certificado não é uma coluna: ele é a data de vencimento lida
// contra hoje. É essa leitura que "muda de status" de um dia para o outro.
const CERT_DIAS_A_VENCER = 30;

function statusCertificado(dataVencimento) {
    if (!dataVencimento) return 'sem vencimento';
    const venc = new Date(dataVencimento);
    if (isNaN(venc)) return 'sem vencimento';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    venc.setHours(0, 0, 0, 0);
    const dias = Math.round((venc - hoje) / 86400000);
    if (dias < 0) return 'Vencido';
    if (dias <= CERT_DIAS_A_VENCER) return `A vencer (${dias} dia${dias === 1 ? '' : 's'})`;
    return 'Vigente';
}

// ------------------------------------------------------------
// GET /api/notificacoes/diarias
//
// Chamada pelo cron uma vez por dia. Também pode ser aberta à mão para
// conferir o que sairia — a resposta lista tudo que foi enviado.
// ------------------------------------------------------------
async function notificacoesDiarias(req, res) {
    const saida = { data: new Date().toISOString().slice(0, 10), devolutiva: [], certificados: [], erros: [] };

    try {
        const hoje = saida.data;

        // ---- ÚLTIMO DIA DA OBRA (e os atrasos) ----
        // Vale para a OS que vence HOJE e para as que já venceram e continuam
        // em campo: um aviso por dia, até a devolutiva acontecer.
        try {
            const r = await pool.query(`
                SELECT * FROM almox.solicitacoes
                 WHERE LOWER(COALESCE(status,'')) IN ('em_campo', 'prorrogada')
                   AND data_fim IS NOT NULL
                   AND data_fim <= CURRENT_DATE
                 ORDER BY data_fim ASC
            `);

            for (const os of r.rows) {
                const chave = `devolutiva:${os.id}:${hoje}`;
                if (!(await reservarAviso(chave))) continue;

                const dias = Math.max(0, Math.round(
                    (new Date(hoje) - new Date(String(os.data_fim).slice(0, 10))) / 86400000
                ));

                // Quem responde pela obra recebe sempre; os demais dependem da
                // permissão de notificação (ver destinatarios em email.js).
                const alvos = [];
                if (os.responsavel_id) alvos.push(os.responsavel_id);
                if (os.solicitado_por_id) alvos.push(os.solicitado_por_id);

                const envio = await mail.notificar(pool, 'devolutiva', {
                    os,
                    diasAtraso: dias,
                    instrumentos: _tagsPendentesDeDevolucao(os).map(t => ({ tag: t })),
                    somenteIds: alvos.length ? alvos : null
                });

                await push.notificar(pool, 'devolver', {
                    os,
                    usuarioIds: alvos,
                    corpo: dias > 0
                        ? `Obra vencida há ${dias} dia(s) — faça a devolutiva ou peça prorrogação.`
                        : 'Último dia da obra — faça a devolutiva ou peça prorrogação.'
                });

                saida.devolutiva.push({ os: os.numero_os || os.id, dias, enviados: envio.enviados });
            }
        } catch (e) {
            saida.erros.push('devolutiva: ' + e.message);
        }

        // ---- CERTIFICADOS QUE MUDARAM DE STATUS ----
        // "Mudou de status" aqui é: venceu hoje, ou entrou hoje na janela dos
        // 30 dias. Nos dois casos o dia é a fronteira, e é por isso que a
        // chave do aviso leva a data.
        try {
            const r = await pool.query(`
                SELECT c.*, f.tag, f.tipo
                  FROM almox.certificados c
             LEFT JOIN almox.ferramentas f ON f.id = c.instrumento_id
                 WHERE c.data_vencimento IS NOT NULL
                   AND (c.data_vencimento = CURRENT_DATE
                        OR c.data_vencimento = CURRENT_DATE + ($1 || ' days')::interval)
            `, [String(CERT_DIAS_A_VENCER)]);

            for (const c of r.rows) {
                const venceHoje = String(c.data_vencimento).slice(0, 10) === hoje;
                const chave = `certificado:${c.id}:${venceHoje ? 'vencido' : 'a-vencer'}:${hoje}`;
                if (!(await reservarAviso(chave))) continue;

                const envio = await mail.notificar(pool, 'certificado', {
                    tag: c.tag,
                    tipo: c.tipo,
                    numero: c.numero,
                    statusAnterior: venceHoje ? `A vencer` : 'Vigente',
                    statusNovo: venceHoje ? 'Vencido' : `A vencer (${CERT_DIAS_A_VENCER} dias)`,
                    dataCalibracao: c.data_emissao,
                    dataVencimento: c.data_vencimento,
                    usuario: 'Sistema (verificação diária)',
                    data: new Date()
                });
                saida.certificados.push({
                    certificado: c.numero || c.id,
                    tag: c.tag,
                    situacao: venceHoje ? 'vencido' : 'a vencer',
                    enviados: envio.enviados
                });
            }
        } catch (e) {
            saida.erros.push('certificados: ' + e.message);
        }

        res.json(saida);
    } catch (err) {
        console.error("ERRO: GET /api/notificacoes/diarias:", err.message);
        res.status(500).json({ erro: err.message, parcial: saida });
    }
}



// ============================================================
// O CHECK "ENVIAR OS" DA OBRA (db/atualizacao-38.sql.txt)
//
// A O.S. pedida para uma obra do main (o campo "Obra" da Solicitação)
// marca o check "Enviar OS" dela — 3a etapa, card do Time Técnico — no
// instante em que é APROVADA. É o único check do roteiro que ninguém marca
// na mão: nem com a permissão de concluir sem a informação (ver
// routes/dados.js e src/domain/obras.js).
//
// Quem fica como autor do check é quem ENVIOU a O.S. (o técnico da obra);
// sem ele, quem aprovou. A O.S. aprovada que é excluída leva o check
// junto, a não ser que a obra tenha outra O.S. aprovada.
// ============================================================

/** O check do sistema daquele tipo que ESTA obra enxerga (ou null). A mesma conta de routes/frotas.js. */
async function checkDaObra(obraId, tipo) {
    const { rows } = await pool.query(
        `SELECT ck.id
           FROM obra o
           JOIN etapa_check ck ON ck.tipo = $2
                              AND CASE WHEN o.checks_proprios
                                       THEN ck.obra_id = o.id AND ck.vigente_ate IS NULL
                                       ELSE ck.obra_id IS NULL
                                            AND ck.vigente_de <= o.criado_em
                                            AND (ck.vigente_ate IS NULL OR o.criado_em < ck.vigente_ate)
                                  END
          WHERE o.id = $1
          ORDER BY ck.id DESC
          LIMIT 1`,
        [obraId, tipo]
    );
    return rows[0]?.id ?? null;
}

async function marcarEnviarOS(os) {
    if (!os?.obra_id || !os.aprovado_em) return false;
    try {
        const checkId = await checkDaObra(os.obra_id, 'enviar_os');
        if (!checkId) return false;
        const quem = os.solicitado_por_id || os.aprovado_por_id || null;
        const r = await pool.query(
            `INSERT INTO obra_check (obra_id, check_id, feito_por) VALUES ($1, $2, $3)
             ON CONFLICT (obra_id, check_id) DO NOTHING
             RETURNING check_id`,
            [os.obra_id, checkId, quem]
        );
        if (!r.rowCount) return false;
        await informacaoChegou(os.obra_id, checkId);
        if (quem) {
            await registrarAtividade(quem, {
                acao: 'check.marcado',
                categoria: 'check',
                entidade: ['obra', os.obra_id],
                descricao: 'Check concluído pelo Almoxarife (OS aprovada)',
                detalhes: {
                    ...(await descreverObra(os.obra_id)),
                    check: 'Enviar OS',
                    os: '#' + String(os.numero_os || os.id).padStart(4, '0'),
                    aprovada_por: os.aprovado_por || null
                }
            });
            /* quem enviou a O.S. entra na obra; a etapa que fechou vai para os membros no Teams */
            await depoisDeMarcar(quem, os.obra_id);
        }
        return true;
    } catch (e) {
        logger.error('almox/enviar-os', e.message);
        return false;
    }
}

async function desmarcarEnviarOS(obraId, excetoOsId) {
    if (!obraId) return;
    try {
        const outra = await pool.query(
            `SELECT 1 FROM almox.solicitacoes
              WHERE obra_id = $1 AND aprovado_em IS NOT NULL AND id <> $2 LIMIT 1`,
            [obraId, excetoOsId]
        );
        if (outra.rows.length) return;
        const checkId = await checkDaObra(obraId, 'enviar_os');
        if (checkId) await pool.query('DELETE FROM obra_check WHERE obra_id = $1 AND check_id = $2', [obraId, checkId]);
    } catch (e) {
        logger.error('almox/enviar-os', e.message);
    }
}

/* ------------------------------------------------------------
   O cliente e a obra da Solicitação

   `cliente_id` e `obra_id` sao do main. Com o cliente escolhido:
     - nenhuma obra aberta: a O.S. sai sem obra (o campo de texto
       "Obra" continua como era no lwncontrol);
     - uma obra aberta: a O.S. vai para ela;
     - mais de uma: escolher a obra é obrigatório.
   Devolve { clienteId, obraId, obraRotulo } ou { erro }.
   ------------------------------------------------------------ */
async function lerClienteEObra(clienteIdBruto, obraIdBruto) {
    const clienteId = /^\d{1,18}$/.test(String(clienteIdBruto ?? '')) ? Number(clienteIdBruto) : null;
    const obraId = /^\d{1,18}$/.test(String(obraIdBruto ?? '')) ? Number(obraIdBruto) : null;
    if (!clienteId) return { clienteId: null, obraId: null };
    const { rows } = await pool.query(
        `SELECT id, proposta, descricao FROM obra
          WHERE cliente_id = $1 AND concluida_em IS NULL
          ORDER BY criado_em DESC`,
        [clienteId]
    );
    const rotulo = (o) => [o.proposta, o.descricao].filter(Boolean).join(' — ') || `Obra ${o.id}`;
    if (obraId) {
        const obra = rows.find((o) => Number(o.id) === obraId);
        if (!obra) return { erro: "Esta obra não é do cliente escolhido (ou já foi concluída). Escolha de novo." };
        return { clienteId, obraId, obraRotulo: rotulo(obra) };
    }
    if (rows.length > 1) return { erro: "Este cliente tem mais de uma obra. Escolha a obra da OS." };
    if (rows.length === 1) return { clienteId, obraId: Number(rows[0].id), obraRotulo: rotulo(rows[0]) };
    return { clienteId, obraId: null };
}

// ============================================================
// GET /api/almox/sininho — o sino da barra de cima, o mesmo do main
//
// No main o sino le o que ja esta na carga do quadro (as obras com os
// avisos e os membros parciais, em DadosContext: minhasNotificacoes e
// minhasSolicitacoes). A tela do Almoxarife nao carrega o quadro, entao
// aqui vem so o que o sino mostra, com as mesmas regras:
//
//   avisos   os avisos das obras para o SETOR de quem esta logado (aviso
//            sem setor e de todo mundo), do mais novo para o mais velho,
//            com `lido` (aviso_leitura). O sino mostra os 20 primeiros;
//   pedidos  as inclusoes como membro parcial que esperam a resposta
//            dele (status pendente).
//
// Marcar como lido e responder o pedido sao as rotas do main de sempre
// (POST /api/dados/avisos/lidos e /api/dados/obras/:id/parciais/...).
// ============================================================
app.get("/sininho", async (req, res) => {
    try {
        const eu = req.dono.sub;
        const [avisos, pedidos, termo] = await Promise.all([
            pool.query(
                `WITH meu AS (
                     SELECT c.chave FROM usuario u LEFT JOIN cargo c ON c.id = u.cargo_id WHERE u.id = $1
                 )
                 SELECT a.id, a.obra_id, a.etapa, a.mensagem, a.enviado_em, u.name AS enviado_por_nome,
                        o.tipo AS obra_tipo, cl.nome AS cliente,
                        coalesce((SELECT array_agg(c.nome ORDER BY c.ordem)
                                    FROM obra_aviso_cargo ac JOIN cargo c ON c.id = ac.cargo_id
                                   WHERE ac.aviso_id = a.id), '{}') AS setores,
                        EXISTS (SELECT 1 FROM aviso_leitura l WHERE l.aviso_id = a.id AND l.usuario_id = $1) AS lido
                   FROM obra_aviso a
                   JOIN obra o         ON o.id = a.obra_id
                   LEFT JOIN cliente cl ON cl.id = o.cliente_id
                   LEFT JOIN usuario u  ON u.id = a.enviado_por
                  WHERE NOT EXISTS (SELECT 1 FROM obra_aviso_cargo ac WHERE ac.aviso_id = a.id)
                     OR EXISTS (SELECT 1 FROM obra_aviso_cargo ac JOIN cargo c ON c.id = ac.cargo_id
                                 WHERE ac.aviso_id = a.id AND c.chave = (SELECT chave FROM meu))
                  ORDER BY a.enviado_em DESC`,
                [eu]
            ),
            pool.query(
                `SELECT p.obra_id, p.incluido_em, u.name AS incluido_por_nome,
                        o.tipo AS obra_tipo, o.proposta, cl.nome AS cliente
                   FROM obra_membro_parcial p
                   JOIN obra o          ON o.id = p.obra_id
                   LEFT JOIN cliente cl ON cl.id = o.cliente_id
                   LEFT JOIN usuario u  ON u.id = p.incluido_por
                  WHERE p.usuario_id = $1 AND p.status = 'pendente'
                  ORDER BY p.incluido_em DESC`,
                [eu]
            ).catch((e) => (e.code === '42P01' ? { rows: [] } : Promise.reject(e))),
            pool.query("SELECT valor FROM configuracao WHERE chave = 'termo_etapa'").catch(() => ({ rows: [] }))
        ]);
        res.json({
            termoEtapa: termo.rows[0]?.valor || 'Etapa',
            avisos: avisos.rows.map((a) => ({
                id: String(a.id),
                obraId: String(a.obra_id),
                obraTipo: a.obra_tipo,
                cliente: a.cliente,
                etapa: a.etapa,
                mensagem: a.mensagem || '',
                setores: a.setores,
                enviadoPorNome: a.enviado_por_nome,
                enviadoEm: a.enviado_em,
                lido: a.lido
            })),
            pedidos: pedidos.rows.map((p) => ({
                obraId: String(p.obra_id),
                obraTipo: p.obra_tipo,
                obra: [p.cliente, p.proposta].filter(Boolean).join(' - ') || 'Obra',
                incluidoPorNome: p.incluido_por_nome,
                incluidoEm: p.incluido_em
            }))
        });
    } catch (err) {
        logger.error('almox/sininho', err.message);
        res.status(500).json({ erro: "Não foi possível ler as notificações." });
    }
});

// ============================================================
// GET /api/almox/painel — o painel do Almoxarife no Dashboard
//
// Era o "Dashboard PowerBI" do lwncontrol. Saiu da tela do Almoxarife e
// foi para o Dashboard da página inicial (src/pages/Home/PainelAlmoxarife),
// ao lado dos painéis de despesas, frota e comercial.
//
// Devolve as linhas já resumidas — sem arquivo nenhum de certificado ou
// comprovante — e a tela faz as contas do período escolhido nas setas do
// topo, com as mesmas regras do lwncontrol (powerbi.js):
//
//   os           cada O.S.: a data (fim, início ou criação), o status, o
//                responsável, o cliente, a UF do cliente e os ativos;
//   despesas     calibração (certificados com valor, ou o valor antigo da
//                ferramenta), manutenção e ferramentas novas (aquisição);
//   calibracao   as faixas do inventário de hoje (OK, alerta, vencido,
//                em calibração);
//   baias        quantas baias estão em campo agora.
// ============================================================
app.get("/painel", async (req, res) => {
    try {
        const [os, ferramentas, certificados, manutencoes, baias, clientes] = await Promise.all([
            pool.query(`SELECT id, numero_os, status, responsavel, cliente, instrumentos, quantidades,
                               to_char(coalesce(data_fim, data_inicio, data_criacao, created_at::date), 'YYYY-MM-DD') AS data
                          FROM almox.solicitacoes`),
            pool.query(`SELECT id, tag, tipo, status, valor, valor_calibracao, vencimento_calibracao,
                               to_char(coalesce(data_aquisicao, criado_em::date), 'YYYY-MM-DD') AS aquisicao,
                               to_char(coalesce(data_calibracao_agendada, ultima_calibracao), 'YYYY-MM-DD') AS calibracao_antiga
                          FROM almox.ferramentas`),
            pool.query(`SELECT instrumento_id, valor, to_char(coalesce(data_emissao, criado_em::date), 'YYYY-MM-DD') AS data
                          FROM almox.certificados`),
            pool.query(`SELECT tag, valor, to_char(coalesce(data_manutencao, criado_em::date), 'YYYY-MM-DD') AS data
                          FROM almox.manutencoes`),
            /* a baia em campo: a O.S. que a prende esta em campo (a mesma
               leitura do quadro de baias, GET /painel/baias) */
            pool.query(`SELECT count(*)::int AS em_campo FROM almox.baias b
                         WHERE coalesce(b.status, '') <> 'inativa'
                           AND EXISTS (SELECT 1 FROM almox.solicitacoes s
                                        WHERE s.status IN ('em_campo', 'prorrogada')
                                          AND (s.baia_id = b.id
                                               OR s.baias_ids @> to_jsonb(b.id)
                                               OR (b.ferramenta_id IS NOT NULL
                                                   AND s.baia_ferramenta_ids @> to_jsonb(b.ferramenta_id))))`),
            pool.query(`SELECT nome, uf FROM almox.clientes`)
        ]);

        const porId = new Map(ferramentas.rows.map((f) => [String(f.id), f]));
        const tipoDaTag = new Map(ferramentas.rows.map((f) => [String(f.tag), f.tipo]));
        const ufDoCliente = new Map(clientes.rows.map((c) => [String(c.nome || '').trim().toLowerCase(), c.uf]));

        /* os ativos da O.S.: pelas TAGs escolhidas ou, nas antigas, pelas quantidades */
        const tiposDaOS = (o) => {
            const tipos = new Set();
            (Array.isArray(o.instrumentos) ? o.instrumentos : []).forEach((id) => {
                const f = porId.get(String(id));
                if (f?.tipo) tipos.add(String(f.tipo));
            });
            if (!tipos.size && o.quantidades && typeof o.quantidades === 'object') {
                Object.keys(o.quantidades).forEach((k) => {
                    if (!/^\d+$/.test(k)) tipos.add(String(k));
                    else if (porId.get(k)?.tipo) tipos.add(String(porId.get(k).tipo));
                });
            }
            return [...tipos];
        };
        const ufDe = (nome) => {
            const direto = ufDoCliente.get(String(nome || '').trim().toLowerCase());
            if (direto) return String(direto).toUpperCase();
            const m = String(nome || '').match(/\/([A-Za-z]{2})\s*$/);
            return m ? m[1].toUpperCase() : null;
        };

        const comValor = new Set();
        const calibracao = certificados.rows
            .filter((c) => Number(c.valor) > 0 && c.data)
            .map((c) => {
                comValor.add(String(c.instrumento_id));
                return { data: c.data, valor: Number(c.valor), tipo: porId.get(String(c.instrumento_id))?.tipo || 'Sem tipo' };
            });
        ferramentas.rows.forEach((f) => {
            if (comValor.has(String(f.id)) || !(Number(f.valor_calibracao) > 0) || !f.calibracao_antiga) return;
            calibracao.push({ data: f.calibracao_antiga, valor: Number(f.valor_calibracao), tipo: f.tipo || 'Sem tipo' });
        });

        /* a faixa de calibracao de cada ferramenta, hoje. Vai por id porque as
           isentas ("sem calibração") ficam no navegador de quem marcou
           (localStorage 'lwn_sem_calibracao', como no lwncontrol): quem tira
           elas da conta e a tela */
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const calibracaoItens = [];
        ferramentas.rows.forEach((f) => {
            let faixa = null;
            if (String(f.status || '').toLowerCase() === 'em_calibracao') faixa = 'em_calibracao';
            else if (f.vencimento_calibracao) {
                const venc = new Date(String(f.vencimento_calibracao).slice(0, 10) + 'T00:00:00');
                if (!isNaN(venc.getTime())) {
                    const dias = Math.ceil((venc - hoje) / 86400000);
                    faixa = dias < 15 ? 'vencido' : dias < 30 ? 'alerta' : 'ok';
                }
            }
            /* sem vencimento nao ha faixa: fica fora, em vez de inflar "Vencido" */
            if (faixa) calibracaoItens.push({ id: f.id, faixa });
        });

        res.json({
            os: os.rows.filter((o) => o.data).map((o) => ({
                data: o.data,
                status: String(o.status || '').toLowerCase().trim(),
                responsavel: o.responsavel || 'Sem responsável',
                cliente: o.cliente || '',
                uf: ufDe(o.cliente),
                tipos: tiposDaOS(o)
            })),
            despesas: {
                calibracao,
                manutencao: manutencoes.rows
                    .filter((m) => Number(m.valor) > 0 && m.data)
                    .map((m) => ({ data: m.data, valor: Number(m.valor), tipo: tipoDaTag.get(String(m.tag)) || 'Sem tipo' })),
                ferramentas: ferramentas.rows
                    .filter((f) => Number(f.valor) > 0 && f.aquisicao)
                    .map((f) => ({ data: f.aquisicao, valor: Number(f.valor), tipo: f.tipo || 'Sem tipo' }))
            },
            calibracao: calibracaoItens,
            baiasEmCampo: baias.rows[0]?.em_campo ?? 0
        });
    } catch (err) {
        logger.error('almox/painel', err.message);
        res.status(500).json({ erro: "Não foi possível montar o painel do Almoxarife." });
    }
});

export { notificacoesDiarias };
export default app;
