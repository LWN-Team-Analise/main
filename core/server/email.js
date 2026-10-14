/**
 * Envio de e-mail do sistema.
 *
 * Duas coisas saem daqui:
 *
 *   1. o codigo de recuperacao de senha ("esqueci minha senha");
 *   2. o aviso de pendencia, quando alguem clica em "Enviar aviso" no
 *      quadro — a mesma cobranca que acende o sininho, so que na caixa
 *      de entrada de quem precisa agir.
 *
 * A conta que assina e a corporativa da LWN — as credenciais ficam no
 * .env, que nao vai para o Git.
 *
 * Ha DOIS caminhos de envio, e o primeiro que estiver configurado ganha:
 *
 *   1. API da Microsoft (Graph), em graph.js. E o caminho bom, e o
 *      unico que funciona no tenant da LWN: o SMTP autenticado esta
 *      desligado la, e nenhuma senha faz o servidor aceitar
 *      ("535 5.7.139 ... SmtpClientAuthentication is disabled").
 *
 *   2. SMTP comum, com nodemailer. Continua aqui para quem roda o
 *      sistema em outro provedor (Gmail, Zoho, um SMTP proprio) e
 *      para o ambiente de desenvolvimento.
 *
 * Se a conta do SMTP tiver verificacao em duas etapas, o servidor
 * recusa a senha normal: nesse caso gere uma "senha de aplicativo" no
 * portal do provedor e ponha ela no MAIL_SENHA.
 */
import nodemailer from 'nodemailer'
import * as graph from './graph.js'
import { logger } from './logger.js'

/* As credenciais vem SO do .env — nunca escritas aqui. Este arquivo vai
   para o Git; o .env, nao. Se MAIL_SENHA estiver vazia, `temEmail()`
   devolve false e a tela avisa em vez de tentar enviar. */
const REMETENTE = process.env.MAIL_USUARIO
const SENHA = process.env.MAIL_SENHA
const SERVIDOR = process.env.MAIL_HOST || 'smtp.office365.com'
const PORTA = Number(process.env.MAIL_PORT ?? 587)

/* O endereco do site, para os LINKS do e-mail. Sem barra no fim, para
   nao sair "site.com//app/obras/12". */
const SITE = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '')

let carteiro = null

/** O transporte e criado uma vez so e reaproveitado. */
function conectar() {
  if (carteiro) return carteiro
  carteiro = nodemailer.createTransport({
    host: SERVIDOR,
    port: PORTA,
    // 587 e STARTTLS: comeca em texto e sobe para TLS
    secure: PORTA === 465,
    auth: { user: REMETENTE, pass: SENHA },
    requireTLS: PORTA !== 465,
  })
  return carteiro
}

/** true quando existe ALGUM caminho de envio configurado. */
export function temEmail() {
  return graph.configurado() || Boolean(REMETENTE && SENHA)
}

/** Qual caminho vai ser usado — aparece no log ao subir a API. */
export function comoEnvia() {
  if (graph.configurado()) return 'api-microsoft'
  if (REMETENTE && SENHA) return 'smtp'
  return 'nenhum'
}

/** O que o Graph descobriu sobre as proprias permissoes. */
export const diagnostico = graph.diagnostico

export const escapar = (texto) =>
  String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/* ============================================================
   O despacho

   Os dois e-mails do sistema passam por aqui. A funcao escolhe o
   caminho (Graph ou SMTP), traduz o formato das imagens embutidas para
   o que cada um espera e devolve sempre { ok, motivo? } — nunca
   estoura, para a rota decidir o que contar na tela.

   `embutidas` sao as imagens que aparecem DENTRO do corpo (a logo do
   cliente, no aviso). Elas vao como anexo com um contentId, e o HTML
   aponta para `cid:aquele-id`. Data URL no src nao serve: Gmail,
   Outlook Web e quase todo cliente descartam `src="data:..."`.
   ============================================================ */

async function despachar({ para, cco, assunto, html, texto, embutidas = [] }) {
  if (!temEmail()) {
    return { ok: false, motivo: 'O envio de e-mail não está configurado no servidor.' }
  }

  const lista = (Array.isArray(para) ? para : [para]).filter(Boolean)
  if (lista.length === 0) return { ok: false, motivo: 'Nenhum destinatário informado.' }

  /* a API da Microsoft na frente: no tenant da LWN e a unica que sai */
  if (graph.configurado()) {
    return graph.enviar({ para: lista, cco, assunto, html, texto, embutidas })
  }

  try {
    await conectar().sendMail({
      from: `"LWN Team Análise" <${REMETENTE}>`,
      to: lista.join(', '),
      ...(cco?.length ? { bcc: (Array.isArray(cco) ? cco : [cco]).join(', ') } : {}),
      subject: assunto,
      text: texto,
      html,
      attachments: embutidas.map((img) => ({
        cid: img.id,
        filename: `${img.id}.png`,
        content: Buffer.from(img.base64, 'base64'),
        contentType: img.tipo || 'image/png',
      })),
    })
    return { ok: true }
  } catch (erro) {
    logger.error('email', erro.message)

    /* Este erro tem nome e sobrenome, e a resposta generica escondia
       ele: a conta e a senha estao certas, o que esta desligado e o
       SMTP do tenant inteiro. Sem dizer isso, a diretoria procura o
       problema no lugar errado. */
    if (erro.message?.includes('SmtpClientAuthentication is disabled')) {
      return {
        ok: false,
        motivo:
          'A Microsoft bloqueia o envio por SMTP neste domínio. Configure o envio pela API (GRAPH_TENANT_ID, GRAPH_CLIENT_ID e GRAPH_CLIENT_SECRET no .env) — veja o README.',
      }
    }
    if (erro.responseCode === 535 || erro.code === 'EAUTH') {
      return {
        ok: false,
        motivo: 'O servidor de e-mail recusou a conta configurada. Confira MAIL_USUARIO e MAIL_SENHA.',
      }
    }
    return { ok: false, motivo: 'Não foi possível enviar o e-mail agora. Tente de novo.' }
  }
}

/**
 * Uma data URL virando { id, tipo, base64 } — o formato que o despacho
 * entende. Devolve null para qualquer coisa que nao seja imagem, e a
 * logo grande demais tambem cai fora: e enfeite, e enfeite nao segura
 * o envio de uma cobranca.
 */
function imagemEmbutida(id, dataUrl) {
  const casa = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(String(dataUrl ?? ''))
  if (!casa) return null
  const base64 = casa[2]
  if (base64.length > 400_000) return null
  return { id, tipo: casa[1], base64 }
}

/* ============================================================
   A moldura dos dois e-mails

   Mesma casca — fundo claro, cartao branco, a assinatura da LWN em
   cima. O que muda e o miolo. Dai o aviso e o codigo chegarem com a
   mesma cara, e quem recebe reconhecer de onde vem antes de ler.
   ============================================================ */

const moldura = (titulo, miolo) => `
    <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;background:#f4f6fb;padding:28px">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;
                  padding:28px 30px;border:1px solid #e3e8f2">
        <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;
                  color:#7b8798">LWN Engenharia</p>
        <h1 style="margin:0 0 18px;font-size:20px;color:#0d1b33">${titulo}</h1>
        ${miolo}
      </div>
    </div>`

/**
 * Manda o codigo de recuperacao.
 *
 * Devolve { ok: true } quando saiu, ou { ok: false, motivo } quando o
 * servidor de e-mail recusou — a rota decide o que contar para a tela
 * (nunca "esse e-mail nao existe", que entregaria quem esta cadastrado).
 */
export async function enviarCodigo({ para, nome, codigo, minutos = 3 }) {
  const primeiro = String(nome ?? '').trim().split(/\s+/)[0] || 'Olá'

  const corpo = moldura(
    'Recuperação de senha',
    `
        <p style="margin:0 0 14px;font-size:15px;color:#33415c;line-height:1.55">
          ${escapar(primeiro)}, use o código abaixo para criar uma nova senha na
          Atmosfera LWN:
        </p>

        <p style="margin:0 0 16px;text-align:center">
          <span style="display:inline-block;padding:14px 26px;border-radius:12px;
                       background:#0f2a52;color:#fff;font-size:30px;font-weight:700;
                       letter-spacing:.28em">${escapar(codigo)}</span>
        </p>

        <p style="margin:0 0 14px;font-size:14px;color:#5a6a85;line-height:1.55">
          O código vale por <strong>${minutos} minutos</strong>. Depois disso ele deixa de
          funcionar e você precisa pedir outro na própria tela.
        </p>

        <p style="margin:0;font-size:13px;color:#8a97ab;line-height:1.55">
          Se não foi você que pediu, ignore este e-mail — sua senha continua a mesma.
        </p>`,
  )

  return despachar({
    para,
    assunto: `Seu código de recuperação: ${codigo}`,
    html: corpo,
    texto: `Seu código de recuperação é ${codigo}. Ele vale por ${minutos} minutos.`,
  })
}

/* Como cada prioridade aparece no e-mail: a cor e a palavra. Emergencia
   nao e prioridade (a obra e que e de emergencia), mas quem le a
   cobranca precisa saber disso na primeira linha — entao ela entra na
   mesma faixa. */
const TOM = {
  emergencia: { fundo: '#7f1d1d', texto: '#fff', rotulo: 'EMERGÊNCIA' },
  alta: { fundo: '#b91c1c', texto: '#fff', rotulo: 'Prioridade alta' },
  media: { fundo: '#b45309', texto: '#fff', rotulo: 'Prioridade média' },
  baixa: { fundo: '#15803d', texto: '#fff', rotulo: 'Prioridade baixa' },
}

const linha = (rotulo, valor) =>
  valor
    ? `<tr>
         <td style="padding:6px 12px 6px 0;font-size:13px;color:#7b8798;white-space:nowrap;
                    vertical-align:top">${escapar(rotulo)}</td>
         <td style="padding:6px 0;font-size:14px;color:#0d1b33">${escapar(valor)}</td>
       </tr>`
    : ''

/**
 * O aviso de pendencia, por e-mail.
 *
 * O clique em "Enviar aviso" ja gravava a cobranca e acendia o sininho.
 * O sininho, porem, so cobra quem esta com o sistema aberto — e quem
 * esta devendo informacao costuma ser exatamente quem nao esta. Este
 * e-mail e a outra metade: ele chega na caixa de entrada, diz de qual
 * obra se trata, com que urgencia, e traz um botao que abre a obra na
 * tela onde a pessoa vai marcar o check.
 *
 * `para` e a lista de e-mails do setor cobrado — um envio so, e nao um
 * por pessoa: e a mesma cobranca, e quem recebe ve quem mais recebeu.
 *
 * Devolve { ok, motivo? }. A rota NAO trava se der errado: o aviso ja
 * esta gravado, e um e-mail que nao saiu nao pode desfazer a cobranca.
 */
export async function enviarAviso({ para, obra, cliente, etapa, mensagem, remetente }) {
  const tom = TOM[obra?.tipo === 'emergencia' ? 'emergencia' : obra?.prioridade] ?? TOM.media
  const titulo = [obra?.proposta, cliente?.nome].filter(Boolean).join(' — ') || 'Obra'
  const link = `${SITE}/app/obras/${obra?.id}`

  const logo = imagemEmbutida('logo-cliente', cliente?.logo)

  const corpo = moldura(
    'Você tem uma pendência',
    `
        <p style="margin:0 0 18px;font-size:15px;color:#33415c;line-height:1.55">
          ${escapar(mensagem || 'Há um check pendente do seu setor nesta obra.')}
        </p>

        <div style="border:1px solid #e3e8f2;border-radius:12px;padding:16px 18px;margin:0 0 20px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
            <tr>
              ${
                logo
                  ? `<td style="width:56px;padding-right:14px;vertical-align:top">
                       <img src="cid:logo-cliente" alt="" width="52" height="52"
                            style="width:52px;height:52px;border-radius:10px;object-fit:cover;
                                   border:1px solid #e3e8f2" />
                     </td>`
                  : ''
              }
              <td style="vertical-align:top">
                <p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#0d1b33">
                  ${escapar(titulo)}
                </p>
                <span style="display:inline-block;padding:3px 11px;border-radius:999px;
                             background:${tom.fundo};color:${tom.texto};font-size:11px;
                             font-weight:700;letter-spacing:.05em;text-transform:uppercase">
                  ${tom.rotulo}
                </span>
              </td>
            </tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:14px">
            ${linha('Cliente', cliente?.nome)}
            ${linha('Proposta', obra?.proposta)}
            ${linha('Descrição', obra?.descricao)}
            ${linha('Etapa', etapa)}
            ${linha('Setor cobrado', obra?.setores)}
            ${linha('Tipo', obra?.tipo === 'emergencia' ? 'Emergência' : 'Padrão')}
            ${linha('Avisado por', remetente)}
          </table>
        </div>

        <p style="margin:0 0 18px;text-align:center">
          <a href="${escapar(link)}"
             style="display:inline-block;padding:13px 26px;border-radius:12px;background:#0f2a52;
                    color:#fff;font-size:15px;font-weight:700;text-decoration:none">
            Abrir a obra e resolver
          </a>
        </p>

        <p style="margin:0;font-size:13px;color:#8a97ab;line-height:1.55">
          O botão leva direto para a obra, na etapa em que ela está. Se ele não abrir,
          copie este endereço: ${escapar(link)}
        </p>`,
  )

  const simples =
    `${mensagem || 'Há um check pendente do seu setor.'}\n\n` +
    `${titulo}\n${tom.rotulo}\n${obra?.descricao ?? ''}\n\nAbra a obra: ${link}`

  return despachar({
    para,
    assunto: `[${tom.rotulo}] Pendência em ${titulo}`,
    html: corpo,
    texto: simples,
    embutidas: logo ? [logo] : [],
  })
}

/**
 * A sugestão do LWN Bot — nas duas formas.
 *
 * ---------------- Anônima ----------------
 *
 * Sai da caixa do sistema PARA A PRÓPRIA caixa do sistema, e quem
 * precisa ler entra em Cco. Os dois motivos:
 *
 *   - o cabeçalho visível fica `lwnteamanalise -> lwnteamanalise`, sem
 *     um único endereço de pessoa em lugar nenhum;
 *   - a Excelência recebe assim mesmo, sem aparecer na lista.
 *
 * A função não recebe nome, e-mail nem cargo quando é anônima: não tem
 * como vazar o autor porque nunca soube quem era.
 *
 * ---------------- Identificada ----------------
 *
 * Vai direto para a Excelência com o nome de quem escreveu, e o e-mail
 * diz que dá para responder. É a diferença que a pessoa escolheu ao
 * mandar: quem assina quer resposta.
 */
export async function enviarSugestao({ para, texto, autor = null }) {
  const anonima = !autor

  const corpo = moldura(
    anonima ? 'Sugestão anônima da equipe' : 'Sugestão da equipe',
    `
        <p style="margin:0 0 16px;font-size:15px;color:#33415c;line-height:1.55">
          Chegou uma sugestão pelo LWN Bot.
        </p>

        <div style="border:1px solid #e3e8f2;border-radius:12px;padding:18px 20px;margin:0 0 18px;
                    background:#f8fafd">
          <p style="margin:0;font-size:15px;color:#0d1b33;line-height:1.6;white-space:pre-wrap">${escapar(
            texto,
          )}</p>
        </div>

        ${
          anonima
            ? `<p style="margin:0;font-size:13px;color:#7b8798;line-height:1.55">
                 <strong style="color:#33415c">Enviada sem identificação.</strong> O sistema não
                 registra quem escreveu: não há nome, e-mail ou setor para consultar, aqui ou no
                 banco. A resposta, quando houver, é mudar o processo — não há para quem responder.
               </p>`
            : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
                 ${linha('De', autor.nome)}
                 ${linha('Setor', autor.cargo)}
                 ${linha('E-mail', autor.email)}
               </table>
               <p style="margin:14px 0 0;font-size:13px;color:#7b8798;line-height:1.55">
                 Quem escreveu escolheu se identificar — dá para responder direto.
               </p>`
        }`,
  )

  return despachar({
    /* anônima: da caixa do sistema para ela mesma, com quem lê em Cco */
    para: anonima ? graph.caixaDeSaida() || para : para,
    cco: anonima ? para : undefined,
    assunto: anonima ? 'Sugestão anônima da equipe' : `Sugestão de ${autor.nome}`,
    html: corpo,
    texto: anonima
      ? `Sugestão enviada pelo LWN Bot, sem identificação do autor:

${texto}`
      : `Sugestão de ${autor.nome} (${autor.cargo ?? 'sem setor'}, ${autor.email}):

${texto}`,
  })
}
