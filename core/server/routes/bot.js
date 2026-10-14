import { Router } from 'express'
import { query } from '../db.js'
import { enviarSugestao } from '../email.js'
import { exigeSessao, meuCargo, tratar } from '../sessao.js'
import { anotar, estourou } from '../limite.js'

/* sugestoes por pessoa por hora (server/limite.js) */
const SUGESTOES_POR_HORA = 5
/* a lista de assuntos e a MESMA que a tela usava quando o bot respondia
   por regras. Agora ela nao decide nada: entra no system como material
   de consulta, e quem escreve a resposta e o modelo. Um arquivo so
   continua sendo a fonte do que o sistema sabe sobre si mesmo. */
import { ASSUNTOS } from '../../src/domain/ajuda.js'

const router = Router()

/* ============================================================
   LWN BOT

   O modelo e LOCAL, servido por Ollama na propria maquina. Duas razoes:

     - custo: nao ha cobranca por conversa. API hospedada cobra por
       token; a camada gratuita do Google nao cobra dinheiro, mas no
       plano gratuito o conteudo pode ser usado para treinar e lido por
       revisores.

     - sigilo: a sugestao ANONIMA e o caso que decide. Prometer "ninguem
       vai saber quem escreveu" e mandar o texto para fora da empresa
       nao cabem na mesma frase. Aqui a conversa nao atravessa a porta.

   ---------------- Por que o modelo NAO tem ferramenta ----------------

   A primeira versao era um agente: o modelo recebia a ferramenta de
   mandar e-mail e decidia sozinho quando usa-la. Funcionou com qwen3:8b
   e caiu por terra na maquina onde isto roda — um notebook sem placa de
   video, onde o 8B leva de 30s a 2min por resposta.

   Os modelos rapidos o bastante para esta maquina nao sao confiaveis
   com ferramenta. Medido: o llama3.2:3b chamou `enviar_sugestao` para a
   pergunta "como eu troco minha senha?" — teria mandado um e-mail
   assinado para a diretoria por causa de uma duvida de senha.

   Entao a decisao de enviar saiu do modelo e voltou para a pessoa. O
   modelo so RECONHECE que o assunto virou sugestao e redige; quem manda
   e um clique. E um degrau a menos de automacao e um degrau a mais de
   seguranca — num recurso que manda e-mail anonimo para a diretoria, e
   a troca certa.

   Com um servidor melhor, o caminho do agente continua valendo: e
   trocar o modelo no .env e devolver a ferramenta a chamada.
   ============================================================ */

/* llama3.2:3b responde em ~6s nesta maquina e escreve portugues
   correto. Em servidor com GPU, qwen3:8b da respostas melhores. */
const MODELO = process.env.OLLAMA_MODELO || 'llama3.2:3b'
const SERVIDOR = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '')

/* Modelo local e lento no PRIMEIRO pedido de cada carga: ele processa o
   manual inteiro antes da primeira palavra. Medido: 43s frio, 6s com o
   prefixo em cache. O teto e generoso de proposito. */
const PACIENCIA = Number(process.env.OLLAMA_TIMEOUT ?? 240000)

/* Quanto tempo o modelo fica na memoria depois de responder. E o numero
   que mais pesa: no padrao do Ollama (5 minutos) ele descarrega entre
   uma conversa e outra, e a pergunta seguinte paga o carregamento
   inteiro de novo. Em servidor apertado, baixe para '5m'. */
const NA_MEMORIA = process.env.OLLAMA_KEEP_ALIVE || '30m'

const CARGO_DESTINO = 'excelencia'

/* o que o sistema sabe sobre si mesmo, em texto corrido */
const MANUAL = ASSUNTOS.map((a) => `## ${a.titulo}\n${a.resposta}`).join('\n\n')

/**
 * O system prompt, em DUAS partes — e a ordem delas é desempenho, não
 * estética.
 *
 * O Ollama guarda o prompt já processado enquanto o começo dele não
 * muda. Como o manual é quase todo o custo (cerca de mil tokens), ele
 * vem PRIMEIRO e igual para todo mundo; o nome de quem fala muda a cada
 * conversa e vai no fim.
 *
 * Estava ao contrário na primeira versão: o nome abria o texto, então
 * cada pessoa reprocessava o manual inteiro. É o tipo de erro que não
 * aparece em teste com um usuário só.
 */
const PARTE_FIXA = `Você é o LWN Bot, o assistente da Atmosfera LWN, a plataforma integrada de gestão corporativa da LWN Team Análise — uma empresa de engenharia que acompanha obras para clientes.

Responda SEMPRE em português do Brasil, na segunda pessoa ("você"), em duas ou três frases, com o tom de um colega que conhece o sistema por dentro: direto, sem formalidade de manual.

# Regras

- Use o manual abaixo como fonte sobre ESTE sistema. Para o que ele não cobre, responda com o que é razoável esperar de um sistema assim, deixando claro quando está supondo.
- Nunca invente número, nome de tela ou permissão que não esteja no manual.

# Quando a pessoa sugerir alguma coisa

Se ela sugerir, criticar ou pedir uma mudança no sistema — mesmo sem usar a palavra "sugestão" —, faça as duas coisas:

1. responda que dá para mandar isso ao setor de Excelência;
2. acrescente, na ÚLTIMA linha, exatamente neste formato:
SUGESTAO: <a sugestão redigida em uma frase>

Nunca escreva a linha SUGESTAO quando for só uma dúvida.

# Manual do sistema

${MANUAL}`

function instrucoes({ nome, cargo }) {
  /* só o rodapé muda de conversa para conversa */
  return `${PARTE_FIXA}

# Quem está falando com você agora

${nome}${cargo ? `, do setor ${cargo}` : ''}.`
}

/**
 * O marcador, lido com folga.
 *
 * O modelo foi instruído a pôr a linha no fim, e um modelo de 3B às
 * vezes a escreve no meio do parágrafo. Aceitar as duas formas custa um
 * regex e evita perder a sugestão por causa de uma quebra de linha.
 */
const MARCA = /SUGEST(?:AO|ÃO)\s*:\s*([\s\S]+)$/i

/**
 * A rede de segurança do reconhecimento.
 *
 * Modelo pequeno esquece o formato — medido: acertou duas rodadas e
 * falhou na terceira com o mesmo prompt. Quando ele esquece, estas
 * palavras na fala da PESSOA seguram o caso, e a sugestão proposta vira
 * o que ela mesma escreveu.
 *
 * Falso positivo aqui não faz mal: o que a tela mostra é uma proposta,
 * e nada sai sem o clique.
 */
const PISTAS = [
  'sugest', 'sugir', 'seria bom', 'seria legal', 'podia ', 'poderia ', 'devia ', 'deveria ',
  'falta ', 'faltou', 'melhor seria', 'melhoria', 'ideia', 'proposta', 'reclam', 'critic',
  'odeio', 'detesto', 'irritante', 'chato ', 'difícil de', 'dificil de',
]

const pareceSugestao = (texto) => {
  const limpo = String(texto ?? '').toLowerCase()
  return PISTAS.some((p) => limpo.includes(p))
}

/** Erro que a rota sabe traduzir para um recado de tela. */
class SemModelo extends Error {}

/** A única função que fala com o modelo. */
async function perguntarAoModelo(mensagens) {
  /* Na Vercel nao ha maquina nossa do outro lado: "localhost" ali e a
     propria funcao, que nao roda modelo nenhum. Sem esta guarda a
     pergunta atravessava tudo so para voltar "nao consegui falar com o
     Ollama em http://localhost:11434" — recado que faz sentido para
     quem cuida do servidor e nenhum para quem esta usando o site. */
  if (process.env.VERCEL && /(localhost|127\.0\.0\.1)/.test(SERVIDOR)) {
    throw new SemModelo(
      'O modelo de IA não está ligado nesta hospedagem. O Chat LWN continua respondendo pelo manual do sistema; para o resto, fale com a equipe.',
    )
  }

  let resposta
  try {
    resposta = await fetch(`${SERVIDOR}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(PACIENCIA),
      body: JSON.stringify({
        model: MODELO,
        messages: mensagens,
        stream: false,
        keep_alive: NA_MEMORIA,
        /* sem o monólogo de raciocínio nos modelos que o têm */
        think: false,
        options: { temperature: 0.3, num_predict: 400 },
      }),
    })
  } catch (erro) {
    if (erro.name === 'TimeoutError' || erro.name === 'AbortError') {
      throw new SemModelo('O modelo demorou demais para responder. Tente de novo.')
    }
    throw new SemModelo(
      `Não consegui falar com o Ollama em ${SERVIDOR}. Confira se ele está rodando na máquina do servidor.`,
    )
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '')
    if (resposta.status === 404 || /not found/i.test(corpo)) {
      throw new SemModelo(
        `O modelo "${MODELO}" ainda não foi baixado. Na máquina do servidor, rode: ollama pull ${MODELO}`,
      )
    }
    throw new SemModelo('O Ollama recusou a conversa. Confira o log dele no servidor.')
  }

  const dados = await resposta.json()
  return String(dados?.message?.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
}

/** Quem está no cargo de Excelência, ativo e com e-mail. */
async function quemRecebe() {
  const { rows } = await query(
    `SELECT u.email
       FROM usuario u
       JOIN cargo c ON c.id = u.cargo_id
      WHERE u.ativo AND c.chave = $1 AND u.email IS NOT NULL AND u.email <> ''`,
    [CARGO_DESTINO],
  )
  return rows.map((l) => l.email)
}

/** O cadastro de quem está falando — nome, e-mail e setor. */
async function quemFala(id) {
  const { rows } = await query('SELECT name, email FROM usuario WHERE id = $1', [id])
  const cargo = await meuCargo(id)
  return {
    nome: rows[0]?.name ?? 'Alguém da equipe',
    email: rows[0]?.email ?? '',
    cargo: cargo.nome ?? null,
  }
}

/**
 * POST /api/bot — uma rodada de conversa.
 *
 * Devolve o que o bot respondeu e, quando o assunto virou sugestão, o
 * texto proposto. Esta rota NÃO manda e-mail nenhum: proposta é
 * proposta.
 */
router.post('/', exigeSessao, async (req, res) => {
  const vindas = Array.isArray(req.body?.mensagens) ? req.body.mensagens : []
  if (vindas.length === 0) return res.status(400).json({ erro: 'Nenhuma mensagem.' })

  try {
    const autor = await quemFala(req.dono.sub)

    const conversa = vindas
      .filter((m) => m?.texto)
      .slice(-24)
      .map((m) => ({
        role: m.papel === 'bot' ? 'assistant' : 'user',
        content: String(m.texto),
      }))

    const bruto = await perguntarAoModelo([
      { role: 'system', content: instrucoes({ nome: autor.nome.split(/\s+/)[0], cargo: autor.cargo }) },
      ...conversa,
    ])

    const achou = bruto.match(MARCA)
    const fala = bruto.replace(MARCA, '').trim()
    const ultimaMinha = [...conversa].reverse().find((m) => m.role === 'user')?.content ?? ''

    /* o modelo redige quando consegue; quando esquece o formato, vale o
       que a própria pessoa escreveu */
    const sugestao = achou
      ? achou[1].trim()
      : pareceSugestao(ultimaMinha)
        ? ultimaMinha.trim()
        : null

    return res.json({
      resposta:
        fala || 'Não consegui formular uma resposta. Pode perguntar de outro jeito?',
      sugestao,
    })
  } catch (erro) {
    if (erro instanceof SemModelo) return res.status(503).json({ erro: erro.message })
    return tratar(erro, res, 'bot')
  }
})

/**
 * POST /api/bot/sugestao — o envio, disparado por um clique.
 *
 * Só chega aqui o que a pessoa leu na tela e confirmou. É onde o
 * anonimato acontece: `autor` é montado sempre e jogado fora quando o
 * envio é anônimo, antes de o e-mail ser montado. Não há tabela de
 * sugestões de propósito — texto mais horário seria, na prática, um
 * caderno de quem reclamou do quê.
 */
router.post('/sugestao', exigeSessao, async (req, res) => {
  const texto = String(req.body?.texto ?? '').trim()
  const anonima = req.body?.anonima !== false

  if (texto.length < 10) {
    return res.status(400).json({ erro: 'Escreva um pouco mais — com uma linha só não dá para agir.' })
  }
  if (texto.length > 2000) {
    return res.status(400).json({ erro: 'A sugestão passou de 2000 caracteres.' })
  }

  try {
    /* cada sugestao e um e-mail para o setor inteiro: um freio por
       pessoa impede que um clique repetido (ou um script) encha a caixa */
    const chave = `sugestao:${req.dono.sub}`
    if (await estourou([{ chave, maximo: SUGESTOES_POR_HORA, minutos: 60 }])) {
      return res.status(429).json({ erro: 'Muitas sugestões em pouco tempo. Tente de novo daqui a uma hora.' })
    }

    const para = await quemRecebe()
    if (para.length === 0) {
      return res.status(503).json({
        erro: 'Ninguém está cadastrado no setor de Excelência para receber a sugestão.',
      })
    }

    const autor = anonima ? null : await quemFala(req.dono.sub)
    const envio = await enviarSugestao({ para, texto, autor })
    if (!envio.ok) return res.status(502).json({ erro: envio.motivo })
    await anotar(chave)

    return res.json({ ok: true, como: anonima ? 'anônima' : 'identificada' })
  } catch (erro) {
    /* o log vai SEM o texto e sem o autor: um log com o conteúdo desfaz
       o anonimato pela porta dos fundos */
    return tratar(erro, res, 'bot/sugestao')
  }
})

/**
 * Esquenta o modelo quando a API sobe.
 *
 * Sem isto, a PRIMEIRA pergunta do dia paga o carregamento do modelo
 * mais o processamento do manual inteiro — medido em 52s, contra 7s nas
 * seguintes. Como a pessoa que pergunta primeiro não tem culpa de ser a
 * primeira, o servidor paga essa conta sozinho, ao subir, quando não há
 * ninguém esperando.
 *
 * Falha em silêncio de propósito: Ollama fora do ar não pode impedir a
 * API de subir — o resto do sistema não depende do bot.
 */
export function aquecer() {
  perguntarAoModelo([
    { role: 'system', content: instrucoes({ nome: 'Equipe', cargo: null }) },
    { role: 'user', content: 'oi' },
  ])
    .then(() => console.log(`[api] LWN Bot pronto (${MODELO} em ${SERVIDOR})`))
    .catch((erro) => console.log(`[api] LWN Bot indisponível: ${erro.message}`))
}

export default router
