/**
 * O QUE O SISTEMA SABE SOBRE SI MESMO.
 *
 * Esta lista é o manual do LWN Bot. Ela não decide mais nada sozinha:
 * `server/routes/bot.js` a transforma em texto corrido e entrega ao
 * modelo como material de consulta, e quem escreve a resposta é o
 * modelo.
 *
 * Por que continuar existindo, então? Porque é a parte que um modelo
 * não tem como saber: quem pode marcar um check aqui dentro, por que a
 * etapa não abre, o que vai para o histórico das observações. Sem isto
 * o bot responderia sobre "um sistema de obras em geral" — plausível e
 * errado. Com isto ele responde sobre ESTE.
 *
 * ---------------- Como acrescentar um assunto ----------------
 *
 * Escreva a `resposta` como você explicaria para alguém que sentou ao
 * seu lado. O modelo reescreve no tom da conversa, então não precisa
 * ficar redonda — precisa estar CERTA.
 *
 * Os campos `gatilhos` e `peso` sobraram do casador de palavras que
 * existia antes e continuam servindo: entram no material como pistas do
 * vocabulário que as pessoas usam para cada assunto.
 */

export const ASSUNTOS = [
  {
    id: 'trocar-senha',
    titulo: 'Trocar a minha senha',
    gatilhos: ['trocar', 'mudar', 'alterar', 'senha', 'nova'],
    resposta:
      'Em Configurações, no bloco "Senha": informe a senha atual, a nova (mínimo 6 caracteres) e repita. ' +
      'Ao salvar, o aviso de senha padrão some sozinho.',
  },
  {
    id: 'senha-padrao',
    titulo: 'Por que aparece "Troque a sua senha"',
    peso: 1.4,
    gatilhos: ['padrao', 'temporaria', 'aviso', 'ilha', 'topo', 'senha', 'obrigatorio', 'insiste'],
    resposta:
      'Porque a sua senha ainda é a que outra pessoa definiu quando criou o seu acesso — e senha que outra ' +
      'pessoa escolheu é senha que outra pessoa sabe. O aviso não tem como ser dispensado: "Agora não" só ' +
      'recolhe. Ele sai quando você troca a senha em Configurações.',
  },
  {
    id: 'esqueci-senha',
    titulo: 'Esqueci a minha senha',
    peso: 1.3,
    gatilhos: ['esqueci', 'perdi', 'recuperar', 'codigo', 'entrar', 'login', 'acesso', 'bloqueado'],
    resposta:
      'Na tela de entrada, clique em "Esqueci minha senha": chega um código de 6 dígitos no e-mail ' +
      'cadastrado, que vale 3 minutos. Com ele você cria a senha nova sem precisar da antiga.',
  },
  {
    id: 'etapas',
    titulo: 'Etapa, card e check',
    gatilhos: ['etapa', 'roteiro', 'card', 'check', 'tarefa', 'passo', 'fase'],
    resposta:
      'A obra anda por ETAPAS. Cada etapa tem CARDS (um por setor, mais ou menos), e cada card tem os ' +
      'CHECKS — as tarefas de verdade, que alguém marca. A etapa seguinte só abre quando a anterior fecha; ' +
      'é por isso que a sua vez às vezes depende de outro setor terminar o que é dele.',
  },
  {
    id: 'nao-marco',
    titulo: 'Não consigo marcar um check',
    peso: 1.3,
    gatilhos: ['marcar', 'consigo', 'travado', 'cadeado', 'bloqueado', 'cinza', 'desabilitado', 'permissao'],
    resposta:
      'Três motivos possíveis: o check é de outro setor; a etapa dele ainda não abriu (a anterior não ' +
      'fechou); ou o seu cargo não tem a permissão. Na grade da página inicial, a linha com cadeado é ' +
      'justamente a de outro setor — ela aparece para você saber quem está segurando a fila.',
  },
  {
    id: 'colunas',
    titulo: 'As colunas da página inicial',
    gatilhos: ['coluna', 'quadro', 'andamento', 'iniciado', 'concluida', 'grade', 'aba'],
    resposta:
      '"Em andamento" são as etapas ABERTAS — o que dá para tocar hoje. "Não iniciado" são as futuras, ' +
      'travadas esperando outro cargo fechar a parte dele. "Concluída" é o que já foi marcado, agrupado ' +
      'por card e do mais recente para o mais antigo.',
  },
  {
    id: 'prioridade',
    titulo: 'Prioridade da obra',
    gatilhos: ['prioridade', 'urgente', 'alta', 'baixa', 'ordem', 'vermelho'],
    resposta:
      'A prioridade é da OBRA, não da tarefa, e é ela que ordena a grade. Obra de emergência entra sempre ' +
      'com prioridade alta e com todas as etapas liberadas de saída.',
  },
  {
    id: 'prazo',
    titulo: 'Prazo e data de conclusão',
    gatilhos: ['prazo', 'data', 'vencido', 'atraso', 'conclusao', 'entrega'],
    resposta:
      'O prazo que aparece na grade é a data de conclusão da OBRA. Ele fica amarelo quando é hoje e ' +
      'vermelho quando já passou. Na obra de emergência a data é obrigatória: é o prazo que a cobrança usa.',
  },
  {
    id: 'observacoes',
    titulo: 'Observações do quadro',
    gatilhos: ['observacao', 'recado', 'mural', 'duracao', 'historico', 'vencida'],
    resposta:
      'São os recados que valem para as obras em geral, no painel à direita do quadro de Obras. Marcando ' +
      '"Adicionar duração", a observação sai do painel sozinha na data final e vai para a aba Histórico — ' +
      'que você abre pelo relógio no topo do painel. Observação sem duração fica até alguém apagar.',
  },
  {
    id: 'avisos',
    titulo: 'Avisar um setor / o sininho',
    gatilhos: ['aviso', 'avisar', 'sino', 'sininho', 'notificacao', 'cobrar', 'email'],
    resposta:
      'Na coluna "Enviar aviso" do quadro, clicar no card cobra o setor que está devendo: acende o sininho ' +
      'dele e sai um e-mail. Precisa da permissão "enviar avisos" — sem ela o botão nem aparece.',
  },
  {
    id: 'emergencia',
    titulo: 'Obra de emergência',
    gatilhos: ['emergencia', 'urgencia', 'vermelha', 'corrida'],
    resposta:
      'Entra no quadro em vermelho, com prioridade alta e todas as etapas liberadas desde o início — ' +
      'ninguém fica esperando a vez. A data de conclusão é obrigatória nela.',
  },
  {
    id: 'chats',
    titulo: 'Chat da equipe e chat da obra',
    gatilhos: ['chat', 'conversa', 'mensagem', 'falar', 'equipe'],
    resposta:
      'São dois, de propósito. O da EQUIPE é o do dia a dia, no botão "+" de qualquer tela. O da OBRA vive ' +
      'dentro dela e morre com ela, virando histórico daquela obra. Por isso o botão do chat da equipe ' +
      'some quando você entra numa obra.',
  },
  {
    id: 'anexos',
    titulo: 'Anexos e fotos',
    gatilhos: ['anexo', 'foto', 'arquivo', 'documento', 'imagem', 'pdf', 'upload'],
    resposta:
      'Dentro da obra, na aba de anexos. No chat também dá para mandar arquivo e foto pela câmera — o ' +
      'mesmo recurso nos dois chats, porque são a mesma peça.',
  },
  {
    id: 'outlook',
    titulo: 'Entrar com o Outlook',
    gatilhos: ['outlook', 'microsoft', 'corporativa', 'vincular', 'conta'],
    resposta:
      'Em Configurações, bloco "Conta Microsoft": vincule a conta da empresa e passe a entrar pelo botão ' +
      'do Outlook, sem digitar senha. Vincular também puxa a sua foto de perfil.',
  },
  {
    id: 'permissoes',
    titulo: 'Não vejo uma aba / um botão',
    gatilhos: ['nao', 'vejo', 'sumiu', 'aparece', 'escondido', 'menu', 'cargo', 'setor'],
    resposta:
      'O menu e os botões seguem as permissões do seu CARGO: o que você não pode fazer não aparece, em vez ' +
      'de aparecer e recusar. Se precisa de um acesso que não tem, fale com quem cuida de Usuários — ou me ' +
      'mande como sugestão, que ela chega na Excelência sem o seu nome.',
  },
  {
    id: 'avaliacoes',
    titulo: 'Avaliações',
    gatilhos: ['avaliacao', 'nota', 'estrela', 'desempenho'],
    resposta:
      'A aba Avaliações reúne as notas por pessoa e por obra. Quem vê e quem lança depende da permissão do ' +
      'cargo.',
  },
  {
    id: 'despesas',
    titulo: 'Despesas, refeições e bônus',
    gatilhos: ['despesa', 'reembolso', 'gasto', 'recibo', 'comprovante', 'refeicao', 'almoco', 'janta', 'bonus', 'vale'],
    resposta:
      'Na aba Despesas, escolha Enviar despesa, Enviar refeição ou Enviar bônus. O cliente é obrigatório e ' +
      'a obra, opcional. Toda despesa precisa do ' +
      'comprovante (imagem, PDF ou ZIP, até 3 MB); a refeição tem valor fixo. O que você enviou fica em ' +
      '"Meus envios", por mês (dia a dia) ou por ano (mês a mês), com os totais e o filtro por tipo. Quem ' +
      'tem a permissão "Revisar despesa geral" ganha também "Envios gerais", com os envios de cada pessoa ' +
      'da equipe.',
  },
  {
    id: 'concluidas',
    titulo: 'Obras concluídas',
    gatilhos: ['concluida', 'terminada', 'encerrada', 'finalizada', 'arquivo', 'passado'],
    resposta:
      'Vão para a aba Concluídas e continuam abrindo — só que travadas. Obra encerrada é registro: dá para ' +
      'ver tudo, não dá para mexer em nada.',
  },
]
