# Atmosfera LWN

**Plataforma integrada de gestão corporativa.** Um ambiente digital
centralizado para conectar processos, informações e operações, promovendo
mais integração, organização e eficiência no dia a dia da LWN. Front-end em
React + Vite, API em Express e banco PostgreSQL. (Antes se chamava Customers /
Trajetória de Clientes.)

> **Dentro do site da LWN.** O sistema mora em `core/` no repositório do site
> e é servido em `lwnengenharia.com.br/core`. A API continua em `/api`
> (`api/index.js` → `core/server/app.js`).
>
> **Em produção** a API roda no próprio projeto `main` da Vercel, com as
> variáveis de ambiente cadastradas nele (`DATABASE_URL` do Neon e
> `APP_URL=https://www.lwnengenharia.com.br/core`, entre outras). O projeto
> antigo `customers` (`lwn-customers.vercel.app`) não é mais usado pelo site.
> Falta só `OLLAMA_URL` (o servidor do LWN Bot): sem ela o bot responde que
> está indisponível.
>
> Tudo roda da **raiz do repositório**, com o `.env` também na raiz:
>
> - `npm run dev:all` — site e Atmosfera LWN em http://localhost:3000 (o sistema
>   em `/core`) e a API na porta 3001;
> - `npm run api:dev`, `npm run db:senha`, `npm run db:validar`,
>   `npm run db:atualizar` — os mesmos comandos de antes.
>
> O retorno do login com Outlook passou a ser `/core/outlook`, e o `APP_URL`
> (links dos e-mails) aponta para `.../core`. Onde este README fala em
> `npm run dev` na pasta do projeto, `localhost:5173`, `/login` ou `/app`,
> leia a partir da raiz e com `/core` na frente.

## Rodando

Precisa de **Node 18+** e **PostgreSQL** rodando na maquina.

```bash
npm install
cp .env.example .env      # e preencha as credenciais do banco
```

Depois abra **dois terminais**:

```bash
npm run api               # API + banco, em http://localhost:3001
```

```bash
npm run dev               # front, em http://localhost:5173
```

O Vite faz proxy de tudo que comeca com `/api` para a API (vale no `dev` e no
`preview`), entao o front nao precisa saber a porta do backend.

| Script              | O que faz                                              |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | front em desenvolvimento (HMR)                         |
| `npm run api`       | API Express + PostgreSQL                               |
| `npm run api:dev`   | a mesma API, recarregando a cada mudanca em `server/`  |
| `npm run build`     | build de producao em `dist/`                           |
| `npm run preview`   | serve o build gerado                                   |
| `npm run db:senha`  | gera o hash bcrypt de uma senha                        |
| `npm run db:validar`| roda o SQL num banco descartavel e confere tudo        |

## Publicando (Vercel + Neon)

O sistema roda hospedado na **Vercel**, com o banco no **Neon** (Postgres
gerenciado). Sao duas diferencas em relacao a maquina local, e as duas ja
estao resolvidas no repositorio:

**1. Nao ha processo ouvindo uma porta.** Na Vercel cada chamada acorda uma
funcao, responde e morre. Por isso as rotas moram em `server/app.js`, que nao
sabe nada de porta nenhuma, e quem liga elas ao mundo sao dois arquivos
diferentes:

| Arquivo          | Onde vale       | O que faz                          |
| ---------------- | --------------- | ---------------------------------- |
| `server/app.js`  | os dois         | as rotas, e so                     |
| `server/index.js`| maquina local   | `listen` na porta + conferencias   |
| `api/index.js`   | Vercel          | entrega o mesmo `app` para a nuvem |

O desvio de `/api/...` para essa funcao, o `dist/` do front e o fallback do
SPA estao no `vercel.json`.

**2. O banco vem de uma variavel so.** Com `DATABASE_URL` preenchida, o
`server/db.js` usa ela e ignora `DB_HOST`/`DB_USER`/etc. — que continuam
valendo para quem roda local. Use sempre a connection string do endpoint
**pooler** do Neon (o host com `-pooler`): em serverless cada chamada abre a
propria conexao, e sem o pooler o limite do banco estoura antes de chegar
gente de verdade.

### O que precisa estar configurado na Vercel

`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES`, `APP_URL` (o endereco publico do
site — e dele que sai o link do "esqueci minha senha"), `GRAPH_TENANT_ID`,
`GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `MAIL_USUARIO` e, se o login com
Outlook estiver ligado, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET` e
`OUTLOOK_TENANT`.

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_ASSUNTO` ligam as notificacoes no
celular (ver "Notificacoes no celular"). Gere um par novo com
`npx web-push generate-vapid-keys`; trocar o par desliga quem ja tinha
ligado, e cada um liga de novo em Configuracoes.

`TOMTOM_KEY` liga o transito da Grande Sao Paulo na aba Frotas (conta gratis
em developer.tomtom.com; o plano gratis da 2.500 consultas por dia). Sem
ela, o painel mostra so a lentidao da capital, pela CET.

**O painel de transito.** Cada corredor da regiao metropolitana (Marginais,
Dutra, Castello, Anchieta, Rodoanel... a lista e os pontos estao em
`src/domain/transito.js`) tem um ponto em cada pista, um por sentido, tirado
do OpenStreetMap. O TomTom devolve a velocidade de agora e a sem transito
daquele trecho, e o nivel sai da razao entre as duas: Livre (75% ou mais),
Moderado (50 a 75%), Intenso (30 a 50%), Muito intenso (abaixo de 30%). A
regiao (Capital, Norte, Leste, ABC, Oeste, Sudoeste) leva o nivel da media
dos trechos dela. A consulta gasta uma chamada por ponto e fica 20 minutos
na memoria. Os "km" da CET sao **km de lentidao** (vias paradas ou lentas),
e nao distancia. Os avisos do INMET valem para os 39 municipios da regiao.

**Rodizio na reserva de carro.** Ao reservar o carro de uma obra, a lista diz
em quantos dias da execucao cada carro cai no rodizio de Sao Paulo (final da
placa x dia da semana, sem fim de semana e feriado; `GET
/api/frotas/reservas/disponiveis`). Os que nao caem vem primeiro, e escolher um
que cai mostra os dias. Sem o prazo da execucao, a tela pede para definir o
periodo; carro sem placa vai para o fim, sem conferencia.

**Uso da frota no Painel.** A pagina inicial (aba Painel, para quem tambem
tem Frotas) mostra os km rodados por mes, quem mais dirigiu e a tabela de km
por carro e por mes, sempre em doze meses (`GET /api/frotas/uso`). Cada
viagem vai da saida (ou troca) ate o registro seguinte do carro e conta no mes
em que terminou; viagem com KM voltando ou acima de 3.000 km fica de fora.

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` **nao** vao para a
Vercel: elas apontam para o Postgres da sua maquina, que a nuvem nao alcanca.

### O Chat LWN em producao

O modelo roda no Ollama, que vive na maquina de quem desenvolve — na Vercel
nao ha maquina nossa do outro lado. Os assuntos do manual continuam
respondendo normalmente; a pergunta que dependeria do modelo volta dizendo
que ele nao esta ligado nesta hospedagem, em vez de esperar o tempo acabar.
Para ligar o modelo em producao, aponte `OLLAMA_URL` para um endereco publico
que a Vercel alcance.

### Migrando o banco da maquina para o Neon

Mesma versao maior dos dois lados (Postgres 18), entao o caminho e direto:

```bash
pg_dump --no-owner --no-privileges --no-tablespaces --schema=public \
        --dbname=TrajetoClientes --file=local.sql
```

Tire do arquivo gerado as duas linhas `CREATE SCHEMA public;` e
`COMMENT ON SCHEMA public ...` — o schema ja existe no Neon — e restaure:

```bash
psql -v ON_ERROR_STOP=1 --single-transaction -d "$DATABASE_URL" -f local.sql
```

Depois confira a view `obra_conclusao`: se o banco de origem tiver rodado o
`sistema.sql.txt` depois do `atualizacao.sql.txt`, ela volta na versao antiga,
a que cobra da obra ate os checks criados depois dela. A definicao certa esta
no `db/atualizacao.sql.txt`.

## A esfera de clientes (tela de login)

O lado esquerdo do login e uma **esfera de fotos** que gira sozinha, obedece ao
arrasto e se inclina na direcao do cursor (`src/components/SphereGallery`).

**As placas sao as logos dos clientes cadastrados**, e so as de quem TEM logo:
cliente sem foto nao vira placa em branco, ele simplesmente nao entra na
esfera. Enquanto nenhum cliente tiver logo, entra `public/assets/login.webp`
como reserva — senao a tela abriria com uma bola de retangulos vazios.

As fotos vem de `GET /api/dados/vitrine`, a **unica rota de dados sem sessao**
do sistema. Ela e publica por necessidade: a esfera esta na tela de login, onde
ainda nao existe token. Por isso devolve **so a imagem** — sem nome, sem id, sem
endereco —, no maximo 24 delas. Quem abrir a resposta na mao ve o mesmo punhado
de logos que ja ve na tela, e nada que ligue uma logo a um cadastro.

> Vale saber, na hora de cadastrar: a logo de um cliente fica visivel para quem
> abrir a tela de login, sem precisar entrar. Se alguma nao puder aparecer, e
> melhor nao subir ela no cadastro.

O desenho e **canvas 2D**, nao WebGL: as placas sempre olham para a camera,
entao nao ha nada que precise de shader — e a tela de login nao carrega uma
biblioteca 3D so para o enfeite. Os pontos se espalham pela distribuicao de
Fibonacci (angulo aureo), o que mantem a casca uniforme com qualquer numero de
placas, sem polos apinhados.

Duas mascaras que se cruzam (`mask-composite: intersect`) tiram a esfera de onde
ela atrapalharia: uma dissolve na direcao do cartao de login, a outra abre um
claro atras da frase "Trajetoria de Clientes".

## Banco de dados

> **Instalacao NOVA — rodar nesta ordem:** `db/usuario.sql.txt`,
> `db/sistema.sql.txt`, `db/quadro.sql.txt`, `db/atualizacao.sql.txt`,
> `db/setores-e-chat.sql.txt`, `db/atualizacao-2.sql.txt`,
> `db/atualizacao-3.sql.txt`, `db/atualizacao-4.sql.txt`,
> `db/atualizacao-5.sql.txt`, `db/atualizacao-6.sql.txt`,
> `db/atualizacao-7.sql.txt`, `db/atualizacao-8.sql.txt`,
> `db/atualizacao-9.sql.txt`, `db/atualizacao-10.sql.txt`,
> `db/atualizacao-11.sql.txt`, `db/atualizacao-12.sql.txt`,
> `db/atualizacao-13.sql.txt`, `db/atualizacao-14.sql.txt`,
> `db/atualizacao-15.sql.txt`, `db/atualizacao-16.sql.txt` e, por ultimo,
> `db/atualizacao-17.sql.txt`, `db/atualizacao-18.sql.txt`, `db/atualizacao-19.sql.txt`, `db/atualizacao-20.sql.txt`, `db/atualizacao-21.sql.txt` e `db/atualizacao-22.sql.txt`.
>
> **Banco que JA roda — um comando so:**
>
> ```bash
> npm run db:atualizar
> ```
>
> Ele aplica os arquivos de atualizacao que faltam, na ordem, e no fim
> lista o que ficou no banco. Usa a mesma conexao da API (o `.env`),
> entao nao precisa de `psql` no PATH nem de digitar senha. Pode rodar
> de novo quantas vezes quiser.
>
> Os tres primeiros arquivos ficam de fora dele de proposito: sao de
> instalacao. Num banco existente eles nao acrescentam nada, e o
> `sistema.sql.txt` ainda desfaz o que o `quadro.sql.txt` fez (ele repoe
> as views antigas, que olham a tabela `obra_tarefa`). Se rodar aquele
> por engano, rode o `quadro.sql.txt` logo em seguida.
>
> Os arquivos de atualizacao so ACRESCENTAM e podem rodar mais de uma
> vez sem problema. Enquanto o `-2` nao rodar, a API nao sobe: ela ja le
> `obra.proposta`, `obra.concluida_em` e `usuario.cargo_titulo`. A aba
> **Concluidas** volta a listar depois dele, que e quem carimba as obras
> ja fechadas na coluna nova.

PostgreSQL. As credenciais ficam no `.env` (fora do git):

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=...
DB_NAME=TrajetoClientes
```

O schema esta em **quatro arquivos, nesta ordem**:

| Arquivo                  | O que cria                                                      |
| ------------------------ | --------------------------------------------------------------- |
| `db/usuario.sql.txt`     | o banco, a tabela `usuario`, as travas e o usuario inicial       |
| `db/sistema.sql.txt`     | cargos, clientes, obras, observacoes e avaliacoes                 |
| `db/quadro.sql.txt`      | o roteiro (etapas, cards, checks), `obra_check` e a senha padrao  |
| `db/atualizacao.sql.txt` | permissoes, chat, etiquetas, anexos, notas, avisos lidos e senha  |
| `db/atualizacao-2.sql.txt` | n. da proposta, conclusao manual, cargo x setor, e-mail opcional |
| `db/atualizacao-3.sql.txt` | termos configuraveis e o "apagar para todos / para mim" do chat  |
| `db/atualizacao-4.sql.txt` | cadastro de cargos, recorte das imagens e nascimento opcional     |
| `db/atualizacao-5.sql.txt` | descricao da etapa, duracao da observacao e aviso por e-mail      |
| `db/atualizacao-6.sql.txt` | chat da equipe com anexo, mencao, resposta e apagar              |
| `db/atualizacao-7.sql.txt` | etiquetas dos cards do roteiro (catalogo proprio)                 |
| `db/atualizacao-8.sql.txt` | despesas, refeicoes e bonus (aba Despesas) e o comprovante        |
| `db/atualizacao-9.sql.txt` | historico de atividades (pagina inicial > Historico)             |
| `db/atualizacao-10.sql.txt` | cliente no envio (obra opcional) e as permissoes da aba Despesas |
| `db/atualizacao-11.sql.txt` | permissoes "Ver dashboard" e "Excluir lancamento de despesa"    |
| `db/atualizacao-12.sql.txt` | CPF opcional: cadastro de colaborador so pelo e-mail             |
| `db/atualizacao-13.sql.txt` | check Sim/Nao, informacoes do card e do check, prazos por obra   |
| `db/atualizacao-14.sql.txt` | etapas fixas, checks dos ensaios, catalogo e execucao de ensaios |
| `db/atualizacao-15.sql.txt` | prazo da execucao separado do prazo da obra                      |
| `db/atualizacao-16.sql.txt` | etapas de volta a "1° Etapa"...; fim da regra dos 3 dias         |
| `db/atualizacao-17.sql.txt` | ensaio HVAC/GASES; check "Material de gases" do sistema          |
| `db/atualizacao-18.sql.txt` | checks proprios de cada obra (mexer dentro da obra vale so nela) |
| `db/atualizacao-19.sql.txt` | check "Prazo da execucao" no card do Time Tecnico da 1a etapa    |
| `db/atualizacao-20.sql.txt` | dias da execucao escolhidos um a um (`obra.execucao_dias`)        |
| `db/atualizacao-21.sql.txt` | limite de tentativas: login, codigo de senha e sugestao          |
| `db/atualizacao-22.sql.txt` | Frotas: veiculos, saidas e devolucoes, fotos e as 3 permissoes   |
| `db/atualizacao-23.sql.txt` | clientes prioritarios; reserva e retirada do carro da obra         |
| `db/atualizacao-24.sql.txt` | historico de despesas do SharePoint (cliente_texto, planilha_chave) |
| `db/atualizacao-25.sql.txt` | ensaios por item: servico da obra, itens (ambiente/TAG/ponto de uso) e linhas com o resultado |
| `db/atualizacao-26.sql.txt` | notificacoes no celular (push_inscricao) e mensagens nao lidas do chat (chat_site_leitura) |
| `db/atualizacao-27.sql.txt` | Comercial (negocio, negocio_email), pessoas/dono/proximo contato do cliente, setor "Painel TV" e as permissoes novas |
| `db/atualizacao-28.sql.txt` | presenca (a bolinha verde/vermelha/cinza da tela de Usuarios) |
| `db/atualizacao-29.sql.txt` | negocio.moeda, negocio.probabilidade, negocio.contato_tipo; contato (cliente_pessoa) sem empresa |
| `db/atualizacao-31.sql.txt` | check com horario (etapa_check.horario, obra_horario, obra_horario_membro) e a aba Turnos (cronograma, turno, turno_anotacao) com `ver_turnos` / `editar_turnos` |
| `db/atualizacao-30.sql.txt` | negocio.obra_id (o negocio de Novos negocios vira obra), obra_membro_parcial e a permissao `excluir_membro_parcial` |
| `db/ensaios-lwn.sql.txt`    | o catalogo de ensaios da LWN (HVAC e Gases); roda de novo sem duplicar |

Rode o primeiro na ordem indicada dentro dele; depois rode os outros
inteiros, conectado ao banco `TrajetoClientes`. Todos, do segundo em diante,
sao **idempotentes**: podem rodar de novo sem quebrar nada do que ja existe.

### O que `db/atualizacao.sql.txt` acrescenta

Nada e apagado — o arquivo so **acrescenta**:

- `cargo.permissoes`: a lista de permissoes de cada cargo;
- `obra.data_inicio`, `obra.data_conclusao` e `obra.atualizado_por`
  (a `data_prevista` continua na tabela so para nao perder o historico);
- `etiqueta` + `obra_etiqueta`: os rotulos das obras;
- `obra_anexo`: os documentos da obra;
- `obra_chat` + `obra_chat_mencao`: a conversa de cada obra;
- `obra_avaliacao_item`: as varias notas por obra (diretor, cliente, ...) —
  `obra_avaliacao` passa a guardar a **media** delas, mantida por gatilho;
- `vigente_de` / `vigente_ate` em `etapa`, `etapa_card` e `etapa_check`:
  e o que faz o roteiro andar so para a frente (ver *As cinco etapas*);
- `aviso_leitura`: quem ja abriu qual aviso — e o selo do sininho;
- `senha_codigo`: o codigo do "esqueci minha senha";
- `usuario.outlook_email` / `outlook_id`: o vinculo com a conta Microsoft.

> **Depois de rodar:** todo cargo **sem acesso total** fica com *zero*
> permissoes, e quem estiver nele nao ve nenhuma aba do menu. Isso e de
> proposito (o padrao pedido), mas quer dizer que a primeira coisa a fazer
> e abrir **Usuarios > Cargos** e marcar as permissoes de cada um. Os
> cargos com `acesso_total` ja saem do SQL com a lista cheia, entao a
> diretoria nunca fica trancada do lado de fora.

O **roteiro de fabrica** (as 5 etapas com os cards e os checks) nao vem no SQL:
quem planta e a API, em `server/roteiro.js`, na primeira vez que ela sobe. E
assim porque os titulos tem acento, e colar acento no psql do Windows depende do
code page do terminal. Depois de plantado, o roteiro e seu: o que voce criar ou
apagar pela tela fica, e subir a API de novo nao mexe em nada.

Ele tambem liga a tabela `usuario` a de cargos: acrescenta `cargo_id` e `foto`,
e preenche o `cargo_id` a partir do texto que ja esta em `usuario.cargo`
(ignorando maiuscula e acento). Quem ja estava cadastrado nao precisa ser
recadastrado.

No fim do arquivo ha um **modelo pronto de INSERT** para cadastrar pessoas na
mao (nome, CPF, e-mail, telefone e cargo), com a senha padrao `123456` ja
convertida em hash. Sao os mesmos campos do formulario *Adicionar
colaborador* — a tela nao pede nada que a tabela nao tenha.

A **secao 13** cria a view `obra_conclusao`, que a tela Concluidas usa para
agrupar por ano e mes. Ela nao precisa de coluna nova: a data de conclusao e o
carimbo da ultima tarefa marcada, que o gatilho da secao 5 ja grava. Se voce ja
rodou o arquivo antes, da para rodar so essa secao.

Para conferir sem tocar no banco de verdade:

```bash
npm run db:validar
```

E para APLICAR as atualizacoes no banco de verdade, sem `psql`:

```bash
npm run db:atualizar
```

Ele cria um banco descartavel, roda **os dois scripts**, testa as restricoes, a
protecao do usuario id=1, os gatilhos, a media das avaliacoes e as consultas que
a API usa — e apaga o banco no fim.

Para trazer o historico da planilha antiga do Forms ("Controle Saída e
Devolução de Veículos.xlsx") para a aba Frotas, depois da atualizacao 22:

```bash
npm run db:frota -- "C:\caminho\Controle Saída e Devolução de Veículos.xlsx"
```

Com `--simular` no fim ele so mostra o que faria. Rodar de novo nao duplica
nada: cada linha guarda o Id do Forms.

O historico de despesas, refeicoes e bonus das listas do SharePoint
("Despesas.xlsx"), depois da atualizacao 24:

```bash
npm run db:despesas -- "C:\caminho\Despesas.xlsx"
```

Quem criou cada linha e procurado entre os usuarios pelo nome; quem nao e
achado vira um usuario DESATIVADO com o nome da planilha. `--simular` mostra
esse casamento antes de gravar.

### O que `db/atualizacao-2.sql.txt` acrescenta

- `obra.proposta`: o n. da proposta, obrigatorio nas obras novas (as antigas
  ficam com o campo vazio — nao da para inventar numero de proposta velha);
- `obra.descricao` passa a aceitar NULL: virou campo **opcional**;
- `obra.concluida_em / concluida_por / conclusao_obs`: a conclusao deixou de
  ser automatica e virou um clique. O arquivo **carimba** as obras que ja
  estavam fechadas pela regra antiga, para nenhuma sumir de Concluidas;
- `usuario.cargo_titulo`: o CARGO especifico da pessoa. O SETOR continua sendo
  `usuario.cargo_id` -> tabela `cargo`;
- `usuario.email` passa a aceitar NULL: e-mail virou **opcional**;
- gatilho `obra_check_sai`: quem desmarca o ultimo check sai da lista de
  membros da obra (o par do `obra_check_entra`, que ja existia);
- a permissao `excluir_concluidas` entra nos setores com acesso total.

### O que `db/atualizacao-3.sql.txt` acrescenta

- tabela `configuracao`: os termos que a empresa troca pela tela — hoje, como
  se chama "Etapa" (singular e plural);
- `obra_chat.apagada_em / apagada_por`: mensagem apagada **para todos** fica na
  conversa, vazia, com a marca "mensagem apagada";
- tabela `obra_chat_oculta`: mensagem apagada **so para mim**, que continua
  inteira para todo o resto do chat.

### O que `db/atualizacao-4.sql.txt` acrescenta

- tabela `cargo_titulo`: o cadastro de **cargos** ("Analista de Qualidade",
  "Coordenador de Obras"). Sem cor e sem permissao nenhuma — quem pinta a tela
  e carrega as permissoes e o **setor** (tabela `cargo`). Os cargos que ja
  estavam digitados em `usuario.cargo_titulo` viram cadastro na propria
  migracao, e cada pessoa ja aponta para o dela;
- `usuario.cargo_titulo_id`: o vinculo com esse cadastro. A coluna de texto
  fica e continua sendo copiada junto, entao renomear um cargo vale para todo
  mundo que esta nele sem quebrar quem le so o texto;
- `usuario.data_nascimento` aceita NULL: o cadastro de colaborador passou a
  exigir so **CPF, nome e setor**;
- recorte das imagens — `cliente.logo_original / recorte_logo / capa /
  recorte_capa` e `usuario.foto_original / recorte_foto`. A coluna da imagem
  em si (`logo`, `capa`, `foto`) guarda o resultado JA recortado, que e o que
  as telas mostram; o original serve para reenquadrar depois sem recortar o
  recorte anterior, e o `{ cx, cy, zoom }` para reabrir o editor no mesmo
  lugar. O cliente tem DOIS recortes independentes da mesma imagem: a logo
  (quadrada) e o header da obra (faixa larga).

### O que `db/atualizacao-5.sql.txt` acrescenta

- `etapa.descricao`: a linha de apoio embaixo do nome da etapa ("aguardando
  aprovacao"). O card do quadro passou a mostrar **nome + descricao** no lugar
  de "1ª Etapa + nome" — ver [Nome e descricao de cada etapa](#nome-e-descricao-de-cada-etapa);
- `observacao_quadro.inicio_em` / `fim_em` (DATE, com `CHECK`): a **duracao**
  da observacao do quadro. Passada a data final ela sai do painel sozinha e vai
  para a aba Historico — nao e apagada. As duas datas andam juntas: janela pela
  metade nao e janela, e o banco recusa;
- `usuario.avisos_email` (default `true`): quem NAO quer receber o aviso de
  pendencia por e-mail alem do sininho. Nao ha tela para isso ainda — e uma
  valvula de escape para virar no banco se alguem reclamar de excesso.

### O que `db/atualizacao-6.sql.txt` acrescenta

O **chat da equipe** (`chat_site`) ganha o que o chat da obra ja tinha:
`responde_a`, `arquivo_nome/tipo/conteudo`, `apagada_em/apagada_por`, e as
tabelas `chat_site_mencao` e `chat_site_oculta`. `texto` deixa de ser NOT NULL
— mensagem que e so anexo nao tem texto, e apagar para todos zera o texto e
mantem a linha.

Os nomes sao os MESMOS de `obra_chat`, de proposito: as duas tabelas respondem
a mesma pergunta e sao lidas pelo mesmo componente. Nome diferente para a
mesma coisa e o comeco de dois jeitos diferentes de tratar a mesma coisa.

### O que `db/atualizacao-8.sql.txt` acrescenta

A aba **Despesas** (ver [Despesas](#despesas)):

- `despesa_envio`: um envio — **despesa**, **refeicao** ou **bonus** (coluna
  `categoria`) — com quem enviou, a obra, a data, o tipo, o valor
  (`NUMERIC(12,2)`, nunca texto), justificativa e observacao. Uma tabela so para
  as tres porque elas tem a mesma forma e sao lidas juntas; a trava
  `despesa_envio_tipo_ok` garante que cada categoria so aceita os tipos dela;
- `despesa_anexo`: o comprovante, em data URL, como os anexos da obra;
- a permissao `revisar_despesa_geral` entra nos setores com acesso total.

Excluir a obra **nao apaga** a despesa: o vinculo vira `NULL`. O `usuario_id`
e `RESTRICT`: pessoa com despesa nao pode ser apagada do banco (desligar e
desativar, como sempre foi).

### O que `db/atualizacao-9.sql.txt` acrescenta

A tabela `atividade`, o [Historico](#historico) da pagina inicial: quem fez, a
acao (`obra.criada`, `check.marcado`...), o assunto (`categoria`), a frase
pronta e os detalhes em `jsonb`, como eram na hora.

### O que `db/atualizacao-10.sql.txt` acrescenta

- `despesa_envio.cliente_id`: o cliente passa a ser gravado no envio, porque a
  **obra ficou opcional**. Os envios que ja existiam ganham o cliente da obra
  deles. Com obra, a leitura continua usando o cliente da obra; sem obra (ou com
  a obra excluida depois), vale o do envio. Excluir o cliente tambem **nao
  apaga** a despesa (`ON DELETE SET NULL`);
- as permissoes `ver_despesas` e `alterar_despesas` entram em **todos os
  setores que ja existem** — ate aqui a aba era de todo mundo, e ninguem perde
  o acesso no dia da troca. Isso acontece **uma vez so**: rodar o arquivo de
  novo nao devolve a permissao a um setor de quem ela foi tirada depois.

SQL simples, sem bloco `DO`: roda igual no `psql`, no `npm run db:atualizar` e
no editor de SQL do Neon.

### Usuario protegido

O registro `id = 1` tem `protegido = true`: um gatilho recusa `UPDATE` e
`DELETE` nele. A unica excecao automatica e o carimbo de `ultimo_acesso`, para o
login conseguir registrar o acesso. Para mexer de proposito, destrave na
propria transacao:

```sql
BEGIN;
  SET LOCAL app.desbloqueio = 'on';
  UPDATE usuario SET telefone = '(11) 99999-9999' WHERE id = 1;
COMMIT;
```

## Login

O campo de acesso aceita **e-mail ou CPF** (CPF validado pelos dois digitos
verificadores, guardado so com digitos). A senha e conferida com bcrypt na API.

Senha padrao do sistema: `123456`.

| Rota da API                     | O que faz                                    |
| ------------------------------- | -------------------------------------------- |
| `POST /api/auth/login`          | recebe `{ identifier, password }`            |
| `GET /api/auth/me`              | devolve o usuario do token (Bearer)          |
| `GET /api/health`               | diz se o banco responde e se a tabela existe |
| `GET /api/equipe/cargos`        | lista os cargos com nome, sigla e cor        |
| `POST /api/equipe/cargos`       | cria um cargo                                |
| `PATCH /api/equipe/cargos/:id`  | edita nome, sigla, cor ou acesso total       |
| `DELETE /api/equipe/cargos/:id` | apaga (recusa cargo fixo ou em uso)          |
| `GET /api/equipe/titulos`       | lista os CARGOS da equipe (sem cor)          |
| `POST /api/equipe/titulos`      | cria um cargo (pede `editar_cargo_titulo`)   |
| `PATCH /api/equipe/titulos/:id` | renomeia (e acerta quem esta nele)           |
| `DELETE /api/equipe/titulos/:id`| apaga (recusa cargo em uso)                  |
| `POST /api/auth/senha`          | troca a propria senha (sai da senha padrao)  |
| `POST /api/auth/recuperar`      | manda o codigo de 6 digitos por e-mail       |
| `POST /api/auth/codigo`         | confere o codigo e libera a troca            |
| `POST /api/auth/redefinir`      | grava a senha nova                           |
| `GET /api/auth/outlook/config`  | diz se o login com Outlook esta configurado  |
| `POST /api/auth/outlook/entrar` | entra com a conta Microsoft ja vinculada     |
| `POST /api/auth/outlook/vincular` | vincula a conta Microsoft ao usuario logado |
| `GET /api/equipe/usuarios`      | equipe com cargo, cor e media das avaliacoes |
| `POST /api/equipe/usuarios`     | cadastra colaborador (basta e-mail + setor) com senha temporaria |
| `PATCH /api/equipe/usuarios/:id` | edita o cadastro (CPF dos outros so pela diretoria; o proprio, cada um) |
| `DELETE /api/equipe/usuarios/:id` | desativa o acesso (o historico fica)       |
| `GET /api/dados`                | clientes, obras, checks, observacoes, avisos |
| `GET /api/dados/vitrine`        | so as logos dos clientes — **sem sessao**, para a esfera do login |
| `POST/PATCH/DELETE /api/dados/setores` | setores do cliente (o ramo da empresa) |
| `GET/POST/DELETE /api/dados/chat` | o chat geral da equipe (botao flutuante) |
| `POST/PATCH/DELETE /api/dados/clientes` | cadastro de cliente                  |
| `POST/PATCH/DELETE /api/dados/obras` | cadastro de obra                        |
| `PUT/DELETE /api/dados/obras/:id/checks/:ck` | marca/desmarca um check        |
| `POST /api/dados/obras/:id/observacoes` | observacao da obra                   |
| `POST /api/dados/observacoes`   | observacao do quadro (vale para o geral)     |
| `POST /api/dados/obras/:id/avisos` | aviso aos setores pendentes               |
| `POST /api/dados/obras/:id/avaliacoes` | acrescenta uma nota (diretor, cliente...) |
| `PATCH/DELETE /api/dados/avaliacoes/:id` | edita ou tira uma nota                |
| `DELETE /api/dados/obras/:id/avaliacao` | tira todas as notas da obra            |
| `POST /api/dados/avisos/lidos` | marca avisos como lidos (zera o sininho)     |
| `GET/POST /api/dados/obras/:id/chat` | a conversa da obra                     |
| `POST /api/dados/obras/:id/etiquetas` | marca a obra com uma etiqueta         |
| `POST /api/dados/obras/:id/anexos` | anexa um documento a obra                |
| `GET /api/dados/anexos/:id`     | baixa o conteudo de um anexo                 |
| `GET /api/roteiro`              | o roteiro inteiro: etapas > cards > checks   |
| `POST/PATCH/DELETE /api/roteiro/etapas` | etapas (permissao `editar_etapa`)   |
| `POST/PATCH/DELETE /api/roteiro/cards`  | cards, com 1..N cargos cada         |
| `POST/PATCH/DELETE /api/roteiro/checks` | checks de um card                    |
| `POST /api/despesas/envios`     | envia uma despesa, refeicao ou bonus         |
| `GET /api/despesas/envios?mes=AAAA-MM` | os envios do mes, dia a dia, com os totais |
| `GET /api/despesas/resumo?ano=AAAA` | o ano mes a mes e o total anual          |
| `GET /api/despesas/anexos/:id`  | baixa o comprovante (dono ou revisor)        |

As rotas do roteiro aceitam um `obraId` (no corpo, ou na query nos DELETE):
e ele que diz **a partir de qual obra** a mudanca vale. Ver *As cinco etapas*.

### O token vive na memoria, nao so no localStorage

Em `src/services/api.js` o token tem **duas moradas**: uma variavel de modulo e
o `localStorage`. A da memoria e a que vale, e ela existe por causa de um bug
que fazia o login parecer quebrado.

Quem escreve no `localStorage` e um efeito do `AuthContext`, e efeito so roda
depois que a tela pinta. So que o `DadosProvider` e **filho** do `AuthProvider`,
e no React o efeito do filho roda **antes** do efeito do pai. Resultado: no
instante em que o login abria a sessao, a primeira carga do quadro ja saia — e
saia sem token, porque o `localStorage` ainda estava vazio.

```
POST /api/auth/login    → 200      a senha estava certa
GET  /api/dados         → 401      ...mas foi sem Authorization
GET  /api/equipe/cargos → 401
GET  /api/roteiro       → 401
```

O 401 vinha com `sessao: false`, o `api.js` derrubava a sessao recem-aberta e a
tela voltava para o login dizendo **"sua sessao expirou por tempo"** — logo
depois de a pessoa acertar a senha.

A correcao e o `guardarToken()`: o `AuthContext` empurra o token para a memoria
do `api` **no mesmo passo** em que muda a sessao, antes de qualquer efeito. O
`localStorage` continua sendo escrito pelo efeito, e serve para a proxima vez
que o site abrir.


### Permissoes

Cada **setor** tem uma lista de chaves em `cargo.permissoes`. A lista mora em
`src/domain/permissoes.js` — **um arquivo so, usado pelos dois lados**: a tela
esconde o botao e a API recusa a chamada usando exatamente as mesmas chaves.

| Grupo        | Chaves                                                              |
| ------------ | ------------------------------------------------------------------- |
| Visualizacao | `ver_inicio`, `ver_obras`, `ver_clientes`, `ver_concluidas`, `ver_despesas`, `ver_frotas`, `ver_comercial`, `ver_avaliacoes`, `ver_avisos` |
| Alteracao    | `ver_dashboard`, `ver_historico`, `editar_usuario`, `editar_cargo`, `editar_cargo_titulo`, `editar_avaliacoes`, `editar_clientes`, `exportar_clientes`, `editar_obras`, `excluir_concluidas`, `check_todas_etapas`, `editar_etapa`, `editar_cards`, `editar_cargos_card`, `editar_checks`, `definir_prazos`, `gerenciar_ensaios`, `enviar_avisos`, `alterar_despesas`, `revisar_despesa_geral`, `excluir_despesas`, `registrar_frota`, `editar_veiculos`, `editar_negocios`, `excluir_negocios`, `responder_emails` |

Alteracao **sempre** depende da visualizacao correspondente: desmarcar "Obras"
apaga junto tudo o que so faz sentido dentro de Obras, e essas linhas ficam
travadas ate a visualizacao voltar. Quem tem `acesso_total` (diretoria) passa
por qualquer uma, marcada ou nao. A lista e normalizada ao gravar **e ao ler**
(`normalizar()`): alteracao gravada sem a visualizacao dela nao vale.

Na tela do setor, cada aba ocupa uma linha: a visualizacao a esquerda e as
alteracoes dela ao lado, uma na frente da outra, quebrando a linha no fim
(`GRUPOS` em `permissoes.js`); as tres de Usuarios, que nao dependem de
visualizacao nenhuma, fecham a lista. No celular a aba fica em cima e as
alteracoes embaixo.

As da atualizacao 27 entraram assim (uma vez so — rodar de novo nao devolve
uma permissao que alguem tirou depois):

- **`ver_historico`** — o Historico embaixo da Grade. Todo setor que ja via a
  pagina inicial ganhou; a TV nao tem. A API (`GET /api/atividades`) confere;
- **`exportar_clientes`** — o botao "Exportar clientes". Quem edita cliente
  ganhou;
- **`ver_comercial`**, **`editar_negocios`**, **`excluir_negocios`**,
  **`responder_emails`** — a aba Comercial. O setor Comercial e o acesso
  total ganharam; os outros, quem administra marca.

Tres chaves valem uma nota:

- **`excluir_concluidas`** e separada de `editar_obras` de proposito. Apagar
  uma obra fechada nao e mexer em trabalho em andamento: e apagar o registro do
  que a empresa entregou. Ela depende de `ver_concluidas`;
- **`editar_etapa`** manda tambem no **nome** das etapas — a palavra "Etapa" em
  si, que a empresa pode trocar. Quem manda no roteiro decide como o roteiro se
  chama;
- **`editar_cargo_titulo`** manda no cadastro de **cargos** e, junto com ele,
  em ATRIBUIR um cargo a alguem. Sem ela o campo Cargo fica travado no cadastro
  do colaborador e tambem em Configuracoes — ninguem se promove sozinho no
  proprio perfil. Ela nao depende de nenhuma visualizacao: quem so tem ela
  entra na aba Usuarios pela lista de Cargos.

### E-mail (esqueci minha senha)

O "esqueci minha senha" manda um codigo de 6 digitos que vale **3 minutos**. So
o hash do codigo e guardado, e o passo 1 responde a mesma coisa exista ou nao a
conta — nao entrega quem esta cadastrado.

Existem **dois caminhos de envio**, e o primeiro que estiver configurado ganha:

| | Quando usar | O que preencher no `.env` |
|---|---|---|
| **API da Microsoft (Graph)** | Caixa em Microsoft 365 — inclusive a da LWN | `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `MAIL_USUARIO` |
| **SMTP** | Qualquer outro provedor (Gmail, Zoho, SMTP proprio) | `MAIL_USUARIO`, `MAIL_SENHA`, `MAIL_HOST`, `MAIL_PORT` |

Ao subir a API, o log diz por onde o e-mail vai sair — e, no caminho da
Microsoft, **se o aplicativo realmente pode enviar**:

```
[api] envio de e-mail: API da Microsoft (Graph)
[api] permissao ok: Mail.Send concedida; caixa lwnteamanalise@lwnengenharia.com.br
```

Autenticar e uma coisa, ter permissao e outra: o registro pode estar certinho,
o segredo valido, o token sair na hora — e o envio falhar com 403 porque
ninguem concedeu `Mail.Send`. A resposta esta dentro do proprio token (na lista
`roles`), e ler isso ao subir a API poupa a investigacao de "por que o e-mail
nao chega". Quando falta, o log e direto:

```
[api] ATENCAO: o aplicativo autentica, mas NAO tem a permissao Mail.Send.
      No Entra ID: Permissoes de API > Adicionar > Microsoft Graph >
      Permissoes de APLICATIVO > Mail.Send > e depois
      "Conceder consentimento do administrador".
```

#### Por que o SMTP nao funciona neste dominio

O tenant da LWN tem o **SMTP autenticado desligado**. Testando
`lwnteamanalise@lwnengenharia.com.br` em `smtp.office365.com:587`, o servidor
responde:

```
535 5.7.139 Authentication unsuccessful,
SmtpClientAuthentication is disabled for the Tenant.
```

**A senha esta certa.** O que a Microsoft nao aceita mais e login por SMTP — ela
desligou isso por padrao em todo tenant novo. Nenhuma senha de aplicativo
resolve, porque o bloqueio e do tenant, nao da conta.

O caminho que a Microsoft deixou aberto e a **API (Graph)**: em vez de conectar
na caixa e mandar, o servidor pede um token ao Entra ID e chama `/sendMail`.
Quem se autentica e o **aplicativo**, nao uma pessoa — nao ha senha de caixa nem
MFA para atrapalhar.

#### Passo a passo: ligar o envio pela API da Microsoft

Precisa de uma conta com papel de **Administrador global** (ou Administrador de
aplicativos, mais alguem que possa dar o consentimento) no tenant.

**1. Registrar o aplicativo**

1. Abra <https://entra.microsoft.com> e entre com a conta de administrador.
2. **Identidade → Aplicativos → Registros de aplicativo → Novo registro**.
3. Nome: `Trajetoria de Clientes — envio de e-mail`.
4. Tipos de conta com suporte: **Somente contas neste diretorio organizacional**.
5. URI de redirecionamento: **deixe em branco** — este aplicativo nao tem tela de
   login, ele fala sozinho com a API.
6. **Registrar**.

**2. Copiar os dois IDs**

Na tela **Visao geral** do aplicativo recem-criado, copie:

- **ID do aplicativo (cliente)** → vai em `GRAPH_CLIENT_ID`
- **ID do diretorio (locatario)** → vai em `GRAPH_TENANT_ID`

**3. Criar o segredo do cliente**

1. **Certificados e segredos → Segredos do cliente → Novo segredo do cliente**.
2. Descricao: `api-customers`. Expiracao: 24 meses.
3. **Adicionar**, e copie a coluna **Valor** (nao a "ID do segredo").

> O valor so aparece uma vez. Saiu da tela, nao tem como ver de novo — e preciso
> criar outro. E ele **vence**: anote a data, porque quando vencer o e-mail para
> de sair, com erro 401.

**4. Dar a permissao de enviar**

1. **Permissoes de API → Adicionar uma permissao → Microsoft Graph**.
2. Escolha **Permissoes de aplicativo** (nao "delegadas" — nao ha usuario logado
   neste fluxo).
3. Procure `Mail.Send` e marque.
4. **Adicionar permissoes**.
5. Clique em **Conceder consentimento do administrador para \<empresa\>** e
   confirme. A linha do `Mail.Send` tem que ficar com o **visto verde** — sem
   esse passo o envio volta 403.

**5. (Recomendado) Limitar a quais caixas o aplicativo pode enviar**

Do jeito que esta, o aplicativo pode enviar como **qualquer caixa do tenant**.
Para prende-lo so na caixa do sistema, rode no PowerShell (modulo
`ExchangeOnlineManagement`):

```powershell
Connect-ExchangeOnline
New-DistributionGroup -Name "App Envio Customers" -Alias app-envio-customers -Type Security -Members lwnteamanalise@lwnengenharia.com.br
New-ApplicationAccessPolicy -AppId <GRAPH_CLIENT_ID> -PolicyScopeGroupId app-envio-customers@lwnengenharia.com.br -AccessRight RestrictAccess -Description "So a caixa do Trajetoria de Clientes"
```

**6. Preencher o `.env` e reiniciar a API**

```
MAIL_USUARIO=lwnteamanalise@lwnengenharia.com.br
GRAPH_TENANT_ID=<ID do diretorio (locatario)>
GRAPH_CLIENT_ID=<ID do aplicativo (cliente)>
GRAPH_CLIENT_SECRET=<o Valor do segredo>
```

```bash
npm run api
```

O log tem que dizer `[api] envio de e-mail: API da Microsoft (Graph)`. Feito
isso, teste o "Esqueci minha senha" na tela de login: o codigo chega, e uma
copia fica em **Itens Enviados** da caixa.

#### Quando nao chegar

| O que a tela diz | O que e |
|---|---|
| "Falta a permissao Mail.Send..." (403) | O passo 4 nao foi concluido — falta o consentimento do administrador, ou a permissao foi marcada como *delegada* em vez de *de aplicativo* |
| "O aplicativo nao esta autorizado..." (401) | O segredo esta errado ou **venceu**. Crie outro no passo 3 |
| "A caixa ... nao foi encontrada" (404) | O `MAIL_USUARIO` nao existe nesse tenant, ou nao tem caixa do Exchange |
| "A Microsoft bloqueia o envio por SMTP..." | Os `GRAPH_*` estao vazios e o sistema caiu no SMTP. Volte ao passo 6 |

> **Se preferir nao mexer no Entra ID**, a outra saida e ligar o SMTP: no
> Microsoft 365 admin center, **Usuarios → a conta → Email → Gerenciar
> aplicativos de email → Autenticacao SMTP**, e desligar o bloqueio no nivel do
> tenant pelo Exchange admin center. E menos recomendavel: a Microsoft esta
> descontinuando esse caminho.

### Login com Outlook

O login com Outlook usa o fluxo padrao da Microsoft e precisa de um aplicativo
registrado no Entra ID (`OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`,
`OUTLOOK_TENANT`). Sem isso, a tela mostra o recado no lugar do botao e o resto
do sistema continua igual. O vinculo casa pelo **e-mail**: a conta Microsoft
tem que ser a mesma do cadastro — e por isso que o e-mail nao se altera mais
pela tela do usuario.

#### O Outlook e OBRIGATORIO: o portao do meio

Entrar com CPF/e-mail e senha **nao da mais acesso ao sistema**. Quem entrou
mas ainda nao vinculou a conta Microsoft para numa tela do meio
(`src/pages/Login/PortaoOutlook.jsx`) e nao ve nada alem dela — sem menu, sem
barra lateral e sem rota que passe por fora. Duas saidas: vincular ou sair.

Quem decide isso e o `ProtectedRoute`, em tres portoes na ordem: sessao →
Outlook → cargo. O portao do Outlook vale para TODA rota interna, inclusive
Configuracoes — deixa-la de fora seria abrir a porta que a regra fecha, porque
e de la que se mexe no proprio cadastro.

> **A valvula de seguranca.** O portao so aparece quando o servidor confirma
> que o login com Outlook esta configurado (`GET /api/auth/outlook/config`).
> Isso nao e conforto, e seguranca: com o `.env` sem as chaves da Microsoft, ou
> com o segredo do cliente vencido, o portao trancaria **todo mundo** para fora
> do sistema — inclusive quem poderia consertar, e sem nenhuma tela por onde
> fazer isso. Enquanto o servidor responder que nao ha por onde entrar, o
> sistema volta a funcionar como antes.
>
> A consequencia pratica: **o registro no Entra ID virou dependencia de
> producao.** Segredo do cliente vencido nao degrada mais uma funcionalidade —
> ele desliga o login da empresa inteira ate alguem renovar. Anote a data de
> expiracao.

A resposta do `/outlook/config` fica em cache pela vida da pagina
(`authService`): o `ProtectedRoute` faz essa pergunta a cada troca de rota, e
sem o cache seriam dezenas de requisicoes identicas.

#### O redirect URI precisa estar cadastrado no portal

```
AADSTS50011: The redirect URI 'http://localhost:5173/outlook' specified in the
request does not match the redirect URIs configured for the application...
```

Esse erro nao e de codigo: a Microsoft so devolve o `code` para um endereco que
esteja **na lista do registro**, e essa lista comeca vazia. No Entra ID:

1. **Registros de aplicativo → o app → Autenticacao**;
2. **Adicionar uma plataforma → Web**. Tem de ser **Web**, e nao "Aplicativo de
   pagina unica (SPA)": a troca do `code` pelo token acontece no NOSSO
   servidor, com o segredo do cliente, e a Microsoft recusa segredo em
   redirect de SPA;
3. URI de redirecionamento: `http://localhost:5173/outlook` (o de
   desenvolvimento) e o endereco de producao, um por linha;
4. **Configurar / Salvar**. Vale em poucos segundos.

O caminho `/outlook` e a pagina `RetornoOutlook`: ela so pega o `code`, entrega
para a janela que abriu e se fecha.

> **Nao da para conferir isso por fora.** Chamar o `/authorize` com um redirect
> errado devolve **HTTP 200 e a tela de login normal** — igualzinho a um
> redirect certo. O AADSTS50011 so aparece DEPOIS que a conta e escolhida. A
> unica prova e clicar no botao.

O login devolve tambem o cargo do usuario (chave, nome, cor e `acessoTotal`) —
e dai que sai a trava de quem edita o que. Se `db/sistema.sql.txt` ainda nao
tiver sido rodado, a consulta cai numa versao sem cargo e o login continua
funcionando.

As rotas de `/api/equipe` exigem sessao (Bearer) e devolvem **503** com uma
mensagem clara enquanto o SQL nao for rodado — o front trata isso como "sem
banco" e usa os dados locais, sem quebrar nada.

Usuario e senha errados devolvem a mesma mensagem, de proposito: nao entrega a
quem tenta adivinhar qual e-mail existe no sistema.

## Notificacoes

O sininho mostra **so os avisos endereçados ao SEU setor**. Quem e da
Excelencia nao recebe a cobranca de um check pendente do Comercial: nao ha nada
que essa pessoa possa fazer a respeito, e um sino cheio de aviso de outro setor
e um sino que ninguem mais abre.

A regra vale **inclusive para a diretoria**. Antes o acesso total trazia tudo, e
o sino dela virava o despejo do quadro inteiro; quem quer a visao geral do que
falta em cada setor tem a coluna de pendencias na tela de Obras, que mostra a
mesma coisa organizada.

A unica excecao e o aviso **sem setor nenhum**: esse e recado para a empresa
toda e chega para todo mundo. Quem decide e `minhasNotificacoes`, no
`DadosContext`.

### O aviso tambem vai por e-mail

O sininho so cobra quem esta com o sistema aberto — e quem esta devendo
informacao costuma ser exatamente quem nao esta. Por isso o clique em **Enviar
aviso** faz duas coisas: grava a cobranca (o sininho) e manda um e-mail para
**quem e do setor cobrado**.

O e-mail leva o que a pessoa precisa para decidir se para o que esta fazendo:

- a prioridade em destaque — **EMERGENCIA**, alta, media ou baixa, com a cor
  correspondente. Obra de emergencia entra como emergencia, nao como "alta";
- o numero da proposta e o nome do cliente, com a **logo** dele;
- a descricao da obra, a etapa e quais setores foram cobrados;
- quem disparou o aviso;
- um botao **"Abrir a obra e resolver"**, que leva direto para
  `/app/obras/:id` — a tela onde o check e marcado. O endereco sai de
  `APP_URL` no `.env`; em producao, ponha o dominio de verdade.

A logo viaja como **anexo embutido** (`cid:`), nao como `src="data:..."`:
Gmail, Outlook Web e quase todo cliente descartam data URL em imagem, e ela
chegaria quebrada.

**Quem recebe:** todo mundo do setor cobrado, **inclusive quem apertou o
botao**. Isso e diferente do sininho, que pula o autor de proposito — o selo
vermelho existe para dizer "tem coisa nova para voce", e um recado que a
propria pessoa escreveu nao e novidade nenhuma. O e-mail responde outra
pergunta: ele e o REGISTRO da cobranca, e quem esta no setor cobrado esta
sendo cobrado, tenha ou nao apertado o botao. Alem disso, avisar o proprio
setor e o caso mais comum de todos ("a Excelencia esta devendo, e eu sou da
Excelencia") — pular o autor fazia justamente ele nao receber nada.

Duas coisas que o envio nao faz, de proposito:

- nao manda para quem tem `usuario.avisos_email = false`;
- **nao trava a chamada**. O aviso ja esta gravado quando o e-mail sai; um
  e-mail que nao foi nao pode desfazer uma cobranca que foi.

A resposta traz `emails` (quantos sairam) e `emailMotivo` (por que nenhum
saiu), e a tela mostra os dois:

```
Aviso enviado para GQ — Libbs. 3 pessoas receberam por e-mail.
Aviso enviado para GQ — Libbs. Nenhum e-mail saiu: falta a permissão Mail.Send
no aplicativo, ou o consentimento do administrador.
```

O segundo caso importa: sem ele a tela dizia "enviado" e o e-mail morria em
silencio, e so o log do servidor sabia.

## Notificacoes no celular

Avisos na tela do celular (ou do computador), mesmo com o app fechado. Cada
pessoa liga em **Configuracoes > Notificacoes no celular**, aparelho por
aparelho; a tela do chat da equipe tambem convida a ligar. Chegam:

| O que | Para quem |
|---|---|
| mensagem no chat da equipe | todo mundo (menos quem escreveu) |
| mensagem no chat de uma obra | quem participa da obra |
| mencao com @ (em qualquer chat) | quem foi citado, com "Fulano mencionou voce" |
| aviso de etapa | as pessoas dos setores avisados |

Como funciona: `public/core/sw.js` (o service worker, registrado em
`src/main.jsx`, que NAO guarda pagina em cache) recebe e mostra a
notificacao; o toque abre o app na tela dela. O servidor manda pelo
`server/push.js` (biblioteca `web-push`, chaves VAPID nas variaveis da
Vercel) para cada linha de `push_inscricao`; inscricao que o navegador diz
que morreu (404/410) sai sozinha.

No **iPhone** so funciona com o app instalado na Tela de Inicio (Compartilhar
> Adicionar a Tela de Inicio) e aberto por ela; a tela de Configuracoes
explica isso a quem abre pelo Safari.

**O icone do app** e o mesmo desenho do favicon, em fundo branco
(`public/core/icone-app-*.png`, gerados do `public/assets/favicon.png`; o
iPhone pinta de preto o que e transparente). Os nomes sao novos para o
celular que guardou o icone antigo buscar este. No Android ele troca sozinho
em alguns dias; no iPhone, so tirando o app da Tela de Inicio e pondo de novo.

### Mensagens nao lidas

O botao do chat da equipe mostra quantas mensagens de outras pessoas a
pessoa ainda nao leu (`GET /api/dados/chat/nao-lidas`, conferido a cada 45s,
ao voltar para a aba e na hora em que chega uma notificacao). Abrir a tela do
chat marca como lido (`POST /api/dados/chat/lido`). Quem ainda nao tinha
leitura comeca "em dia". A tela do chat busca mensagens novas sozinha a cada
12s.


## Comercial (os funis de venda)

A aba **Comercial** (`/app/comercial`, icone `fi-rr-calendar-clock` do
Flaticon) e o quadro de negocios no desenho do Pipedrive. Quatro funis, no
seletor do canto direito, cada um com as colunas dele
(`src/domain/comercial.js`, usado pela tela e pela API):

| Funil | Colunas |
|---|---|
| Novos negócios | Demanda Recebida, Aguardando Documentação, Proposta em Elaboração, Proposta Enviada, Construtora Aguardando Concorrência, Negociação/Aprovação Interna, Aguardando Agendamento/Execução |
| Funil de renovação | Demanda Futura, Contato com o Cliente, Autorizado Renovação de Proposta, Proposta Enviada, Negociação/Aprovação interna, Aguardando Pedido de Compras, Aguardando Execução |
| Funil de Resgate | Retomar Contato, Contato Agendado, Proposta, Negociação, Fechamento |
| Funil Prospecção | Empresa-Alvo Identificada, Enriquecer dados, Contato Iniciado, Interesse em Conversa Técnica, Demanda Identificada, Elaboração Proposta |

A barra e a do Pipedrive: as visoes **Funil**, **Lista**, **Previsão** (pelo
mes da data de fechamento esperada) e **Arquivados** (ganhos e perdidos), o
**+ Negócio** (com importar), a contagem, o funil, o **Filtro** (de quem e o
negocio) e o **⋯** (exportar para Excel e importar). Embaixo: **Fixar
filtros** (guarda neste navegador), **Adicionar condição** (texto, etiqueta,
situacao da atividade, valor minimo), **Ordenar por** e **Mostrar negócios
fechados**.

O cartao traz a etiqueta, o titulo, a empresa, a pessoa, o valor, o
responsavel e a situacao da proxima atividade (triangulo amarelo = nenhuma;
vermelho = atrasada; verde = hoje; cinza = marcada). O "+" de cada coluna
fica no topo dela, logo abaixo do cabecalho, e so aparece com o mouse em cima do
cabecalho (no celular, sempre). Os nomes das etapas e os textos dos cartoes
quebram linha em vez de virar "...". Arrastar muda a etapa;
enquanto arrasta, sobe a faixa **Excluir / Perdido / Ganho / Mover para
outro funil**. No celular a etapa muda dentro do negocio (as setas do topo).

**Importar:** a planilha que o Pipedrive exporta (`.xlsx` ou `.csv`) e lida
na tela (`src/utils/lerPlanilha.js`, sem biblioteca); cada coluna e casada
pelo nome, e a coluna "Funil" manda cada linha para o funil dela (VENDAS
NOVAS -> Novos negócios, RENOVAÇÃO, RESGATE, PROSPECÇÃO). A empresa casa com o
cliente pelo nome; o responsavel, pelo nome ou e-mail.

### O formulario do negocio (atualizacao 29)

- **Contato** nao depende da organizacao: a lista traz todas as pessoas
  cadastradas (as da empresa escolhida primeiro). Ao lado, o **Tipo**
  (Comercial ou Pessoal); embaixo, o **Adicionar contato**, que cria a pessoa
  na hora — na empresa escolhida, ou sem empresa (`POST /api/comercial/contatos`);
- **E-mail**: vem do contato escolhido e pode ser trocado so neste negocio. E
  para ele que vai o "Responder?";
- **Valor** com **Moeda** ao lado: Real (R$), Dolar americano (US$) ou Euro (€).
  Os totais das colunas nao misturam moedas ("R$ 62.010 + US$ 5.000"), e o
  ticket medio da aba Clientes conta so os negocios em reais;
- **Probabilidade** (%), ao lado da data de fechamento esperada. A "Proxima atividade"
  saiu do formulario (o que ja estava gravado continua);
- no negocio novo, o **Importar** fica no canto esquerdo do rodape.

### "Responder?": e-mail saindo da caixa da propria pessoa

O botao do cartao abre a janela de e-mail; a mensagem sai **da caixa do
Outlook de quem esta logado** (`usuario.outlook_email`, ou o e-mail do
cadastro), pela mesma permissao de aplicativo **Mail.Send** que ja manda os
avisos: `POST /users/{caixa}/sendMail` (`server/graph.js`, `enviarComo`).
Fica nos Itens Enviados da pessoa e a resposta do cliente volta para ela. Os
enviados ficam registrados no negocio (`negocio_email`). Limite: 30 por
pessoa por hora.

A janela mostra quem envia com a foto do perfil do site (a do Outlook), e
o historico de enviados traz a foto de cada remetente.

**Responder dentro da conversa** e saber **quem espera resposta** exigem ler a
caixa de entrada: a permissao de aplicativo **Mail.Read** (ou
Mail.ReadBasic.All) no mesmo registro do Entra ID, com consentimento do
administrador. Com ela:

- a janela mostra o ultimo e-mail do contato e a resposta entra no fio dele
  (`/messages/{id}/reply`);
- o quadro confere, 20 por vez, a caixa do responsavel de cada negocio aberto
  (`POST /api/comercial/emails/conferir`), e o "Responder?" aparece so onde o
  ultimo e-mail do contato ainda nao foi respondido.

Sem ela (o que ha hoje: so Mail.Send), o envio funciona como e-mail novo, e o
"Responder?" aparece em todo negocio aberto que tem e-mail de contato. Nada
precisa mudar no codigo para ligar: o sistema le as permissoes do proprio
token.

## Clientes: pessoas, proprietario e exportacao

O cadastro do cliente ganhou (atualizacao 27):

- **Proprietário** — quem cadastrou (ou responde pela) empresa. Vem
  preenchido com quem esta cadastrando; os clientes antigos ganharam o que o
  historico registrou;
- **Próximo contato** — uma data;
- **Pessoas de contato** — nome, cargo, e-mail e telefone (`cliente_pessoa`).
  Sao as pessoas que o negocio escolhe no Comercial; o e-mail delas e o destino
  do "Responder?";
- **Calculado pelo sistema** (so leitura): negocios fechados (ganhos) e em
  aberto e o ticket medio (media dos ganhos), do Comercial
  (`GET /api/comercial/resumo-clientes`); e a nota de satisfacao media, das
  obras avaliadas.

**Exportar clientes** (`exportar_clientes`) baixa um `.xlsx` com duas abas:
**Clientes** (Empresa, Endereço, Cidade, UF, Setor, Pessoas, Negócios
fechados, Negócios em aberto, Ticket médio, Próximo contato, Proprietário,
Nota de satisfação média) e **Pessoas** (uma por linha).

### O negocio de Novos negocios vira obra (atualizacao 30)

Negocio **criado** no funil **Novos negocios** ja nasce com a obra dele em
**Obras** — o Comercial cadastra a obra por la. O cadastro manual em Obras
continua do mesmo jeito.

- No formulario aparece o bloco da obra com o **N° da proposta**, ja sugerido
  como no "Nova obra" (o da ultima, mais um; `GET /api/comercial/proxima-proposta`,
  liberado para quem tem `editar_negocios`).
- A empresa tem de ser um **cliente cadastrado** (a obra precisa dele): nesse
  funil some o "Empresa nao cadastrada".
- A obra nasce padrao, prioridade media, inicio hoje, com o **titulo do
  negocio como descricao**. Negocio e obra sao gravados juntos (uma transacao).
- O negocio guarda a obra (`negocio.obra_id`) e mostra o atalho **Obra 1234**
  na linha da etapa. Apagar a obra solta o negocio; apagar o negocio nao mexe
  na obra.
- So na criacao: importar planilha, editar ou trocar de funil depois nao cria
  obra.

## O check com horario (ponto de encontro)

No editor do check (no modelo ou dentro da obra), a caixa **"Check com horario"**
transforma o check — ex.: "Ponto de encontro" — num check de datas: clicar nele
dentro da obra abre o pop-up (`ModalHorario`) com as datas da obra (os dias da
execucao, mais as que alguem acrescentar ali), cada uma com o **horario** (06:30)
e **quem vai** naquele dia. O check e marcado no proprio pop-up ("Check
concluido"), com ao menos uma data com horario. Nao junta com o Sim/Nao.

- Quem vai numa data e ainda nao e membro da obra recebe a solicitacao de
  inclusao (o membro parcial) — e o "adicionar membros" por ali.
- Cada pessoa de cada data vira um turno na aba Turnos (borda tracejada), que
  so muda pela obra.
- `PUT /api/dados/obras/:id/horarios/:checkId` grava a lista inteira; marcar o
  check no clique, sem horario nenhum, e recusado.

## Turnos (a escala da equipe)

A aba **Turnos** (abaixo de Comercial) copia os Turnos do Teams: o periodo
(Hoje, setas, uma ou duas semanas), a linha dos dias (pessoas e horas de cada
dia), as **Anotacoes do dia** e os **cronogramas** — Cronograma LWN e
Cronograma Anapolis, e os que forem criados no "+ Cronograma". Cada cronograma
abre e fecha e tem os "Turnos abertos" (sem pessoa) e uma linha por pessoa.

O turno e um bloco de fundo transparente, so com a borda na cor. Tem titulo,
linha de baixo, dias (um ou um trecho, como uma folga), horario (ou o dia
inteiro) e pode vir de uma tarefa de obra (a obra e o check). As horas contam
so os turnos com inicio e fim.

- `ver_turnos` ve a aba (a atualizacao 31 deu a todo setor, menos o da TV);
  `editar_turnos` cria e muda turnos, anotacoes e cronogramas (so o acesso
  total, de inicio). Rotas em `/api/turnos` (`server/routes/turnos.js`).
- A secao **Obras**, no alto da grade, vem direto das obras: a **Execucao** (os dias
  da execucao de cada obra, em trechos, com o carro reservado; emergencia em
  vermelho) e os **Prazos de tarefas** (checks com prazo ainda nao feitos; saem
  quando o check e marcado). Nada disso se edita aqui: clicar leva a obra.
- Toda a equipe ativa comecou no Cronograma LWN; quem e de Anapolis passa pelo
  "Editar" do cronograma. Tirar alguem leva junto os turnos dele ali.

## Frotas: excluir saida ou devolucao

Em **Saídas e devoluções**, o registro aberto mostra **Excluir saída / devolução
/ troca de condutor** para quem tem `excluir_registro_frota`
(`DELETE /api/frotas/registros/:id`). Saem o registro e as fotos. Se era o
ultimo registro do veiculo, o KM atual volta ao do registro anterior; se era a
saida que retirou o carro reservado de uma obra, a reserva volta a esperar a
retirada e o check "Retirada do carro" e desmarcado.

## Prazo final: o dia do ultimo check

O prazo final **nao se escolhe mais** — saiu do cadastro e da edicao da obra
(`ModalObra`), inclusive da emergencia, que antes o exigia. Ele aparece sozinho
quando a obra chega a 5a etapa e o ultimo usuario marca o ultimo check que
faltava: e o **dia desse check** (`prazoFinalDaObra`, em `src/domain/obras.js`).
Antes disso a faixa da obra diz "ao concluir os checks" e o card nao mostra
prazo.

Consequencias:

- a cor do card nao vem mais do prazo final (verde/laranja/vermelho/atrasada):
  so o prazo de cada **check** pinta de amarelo;
- a coluna **Prazo** da pagina inicial mostra o prazo do proprio check;
- no quadro de Obras, o filtro "Data ate" e a ordem "Data de inicio" olham o
  inicio da obra;
- o calendario do periodo de execucao nao tem mais teto;
- o `data_conclusao` que obras antigas guardam continua no banco como
  historico (o painel de atraso das obras fechadas e a exportacao ainda leem),
  mas nao aparece nem trava data nenhuma. A API ignora `dataConclusao` no
  cadastro e na edicao.

## Obra nova: o n° da proposta ja vem preenchido

Abrir o cadastro de uma obra nova busca `GET /api/dados/obras/proxima-proposta`:
o n° da ULTIMA obra cadastrada, mais um (`8234` -> `8235`; `1042/2026` ->
`1043/2026`, o primeiro grupo de digitos e o contador). Numero que ja existe e
pulado. O campo continua editavel (`src/domain/proposta.js`).

## A tela da TV (Painel TV)

O setor marcado como **Tela da TV** (`cargo.painel_tv`, so o acesso total
liga) e a televisao da empresa. Quem esta nele:

- so ve a **pagina inicial**, sem Dashboard, sem Historico e sem chat;
- e o **unico login sem Outlook** (o portao do Outlook nao barra), e a sessao
  dura 30 dias;
- ve "Ótima tarde, **Time**!", "**Para equipe**" e "Possuímos N tarefas para
  fazer agora.", com as tarefas de TODOS os setores (o filtro **Todas**);
- a pagina se troca sozinha (`src/pages/Home/useModoTv.js`): Grade e Quadro
  se revezando, com um esmaecer suave na troca. A pagina tem a altura da
  tela: a faixa do dia e as abas ficam paradas, e so a lista de tarefas
  desce, em loop — desce ate o fim, para um instante, volta ao inicio e
  desce de novo;
- as caixas andam em grupos, cada grupo no seu laco:
  - **Grade**: a tabela (com o cabecalho parado), a 25 px/s — mais ou menos
    uma linha a cada 2 s;
  - **"Em andamento" e "Não iniciado"**: juntas, cada uma na mesma fracao do
    caminho (chegam ao fim ao mesmo tempo), a 40 px/s na mais comprida;
  - **"Concluída"**: sozinha, a 25 px/s, e nao conta para a troca — e
    historico, e costuma ser bem maior que as outras;
- cada tela fica 1 minuto exato. Quando a Grade (ou o par do Quadro) ja
  mostrou o fim, a tela troca no minuto; se nao, ela segue ate 10 s a mais e
  troca — e, na proxima vez, continua de onde parou. A cada troca os dados
  sao lidos de novo;
- a lista desliza com `transform` (Web Animations), e nao mexendo no
  scrollTop: anda em fracao de pixel e e a placa de video que move, sem
  redesenhar a lista. No modo TV saem tambem a textura animada do fundo, o
  desfoque do vidro e as sombras dos cards — era isso que travava a TV;
- a medida nao e feita uma vez so: a cada 0,7 s cada grupo confere o tamanho
  da lista (os dados relidos chegam depois que a tela troca) e segue do
  ponto em que esta. As caixas ganham a altura da tela em pixels, e o quanto
  falta descer e medido contra a borda da TELA — o ultimo card nunca fica
  cortado no rodape. A tabela da Grade usa bordas por celula na TV, para as
  linhas subirem junto com as tarefas.

A conta da TV e criada pelo script (com a senha que voce escolher):

```
npm run db:painel -- lwnteamanalise@lwnengenharia.com.br "SenhaDaTV"
```

Para criar no Neon, rode com o `DATABASE_URL` dele no ambiente. Rodar de
novo com o mesmo e-mail troca a senha. Na TV: `/core/login`, com o e-mail e a
senha.

## Usuarios: os cards

Todos os cards fechados tem o **mesmo tamanho**: o topo tem altura fixa, o nome
fica numa linha so e o que nao cabe corta com reticencias (o texto inteiro
aparece ao parar o mouse). Embaixo do nome, o setor e, na terceira linha, o
cargo e o "Cadastro incompleto".

O **"v" no canto de cima, a direita** abre o card: contato, nota e, para quem
tem a permissao de usuarios, os botoes **Editar** e **Excluir** — que so
aparecem ali, com o card aberto (antes apareciam ao passar o mouse).

## Usuarios: quem esta online (a bolinha)

No card de cada pessoa, a foto tem uma bolinha no canto de baixo, a direita
(atualizacao 28, `src/hooks/usePresenca.js`, `server/routes/presenca.js`):

- **verde** — o sistema esta aberto e na frente;
- **vermelho** — aberto, mas em segundo plano (outra aba, janela minimizada,
  celular com outro app na frente);
- **cinza** — offline: fechou a aba, ou nenhuma aba avisou em 3 minutos.

Cada aba aberta avisa o servidor a cada minuto e na hora em que muda de
visibilidade; fechar a aba (ou sair da conta) avisa na hora. Uma linha por aba
em `presenca`: com duas abas abertas, vale a melhor das duas. O prazo e contado
pelo relogio do banco. A tela de Usuarios rele as bolinhas a cada 30 s.

## Setores do cliente

> Nao confundir com o **setor da equipe** (Comercial, GQ, Excelencia), que e a
> tabela `cargo` e carrega as permissoes. Este aqui e o ramo do CLIENTE, e nao
> decide nada alem de filtro e cor de etiqueta.

O ramo em que a empresa atua. Desde 09/10/2026 sao **seis**, os mesmos do site
da LWN (lwnengenharia.com.br/clientes): Setor Pharma, Setor Agro, Setor
Alimenticio, Instituicoes de Saude, Setor de Engenharia e Outros Setores. A
troca dos dezesseis de antes por estes (e de cada cliente para o seu) esta em
`db/setores-de-clientes-6.sql.txt`, ja rodado no banco da maquina e no Neon.
Vive em tabela
propria (`setor_cliente`) e nao como texto no cliente, porque o setor tem que
ser o MESMO em todos os cadastros — com texto livre, "Farmaceutico" e
"farmaceutica" viram dois setores e o filtro deixa de funcionar.

Quem mexe e quem pode mexer em cliente: o botao **Setores** na aba Clientes
cria, edita e exclui; o cadastro de cada cliente escolhe entre os que existem.

Apagar um setor **nao apaga os clientes dele**. A chave estrangeira e
`ON DELETE SET NULL`: eles voltam para "sem setor" e aparecem no filtro *Sem
setor*, para reclassificar com calma.

### O card que abre e fecha

Fechado, o cliente e uma linha: logo, nome e a setinha. Aberto, ele vira o
cartao de quinas recortadas com a logo no topo.

A passagem entre os dois e animada **nos dois sentidos**: abrindo, o cartao se
desenrola de cima para baixo, como uma persiana que desce a partir da linha
fechada; fechando, ele se recolhe de baixo para cima, pelo mesmo caminho. Quem
faz e um `clip-path` que vai de `inset(0 0 100% 0)` a `inset(0 0 0 0)`, com a
origem da escala presa no topo.

Fechar precisa do estado `is-fechando` no JSX: a animacao de saida so roda
enquanto o elemento **ainda esta no DOM**. Sem ele, o React tira o cartao no
mesmo instante do clique e nao ha o que animar — por isso o clique marca a
classe, deixa a animacao correr e so entao desmonta.

**Fecha por tres caminhos, e os tres valem**: o botao *Fechar* sobre a foto, o
proprio cabecalho (a faixa com a logo e o nome) e **qualquer ponto do card
aberto**. Clicar de novo onde se clicou para abrir e o gesto que a mao ja
espera — e o resto do cartao, que antes era area morta, agora responde igual.

O clique so nao fecha quando sai de um elemento com funcao propria (`button`,
`a`, `input`, `select`, `textarea`): apagar um cliente nao pode fechar o card
no mesmo gesto. Quem decide e um `closest()` no alvo do clique.

### A previa do header, no cadastro

A logo do cliente aparece em dois lugares com recortes **independentes**: o
quadrado do card e a faixa larga que abre a tela da obra. O quadrado sempre
esteve a vista no cadastro; a faixa, nao — ela so existia dentro do editor, e
para ve-la era preciso clicar em "Ajustar enquadramento", que e justamente a
decisao que a previa deveria ajudar a tomar.

Agora a faixa aparece **parada, no cadastro**, do tamanho real, logo abaixo da
logo. O editor continua sendo onde se MEXE nos dois recortes; ali so se ve como
esta. E a mesma peca (`PreviaHeader`, em `components/EditorImagem`) nos dois
lugares: com `aoMudar` ela e arrastavel e E o ajuste do header; sem, e amostra.

Cliente cadastrado antes do recorte separado nao tem `capa`. Nesse caso a
previa usa a propria logo e diz isso embaixo, com o caminho para dar um recorte
proprio a faixa.

## Chat da equipe

O botao redondo do canto inferior direito abre a conversa geral da equipe
(`chat_site`) numa tela propria, `/app/chat` — nao mais num pop-up. O
"Voltar" do canto superior esquerdo leva para a pagina inicial. Ela e separada do chat da obra de proposito: aquele morre com a
obra e vira historico dela; este e do dia a dia e nao pertence a obra nenhuma.

### Uma conversa so, usada por duas telas

As duas faziam a mesma coisa e **so uma sabia fazer**: o chat da obra tinha
anexo, camera, mencao com @, resposta e as duas formas de apagar; o da equipe
era uma caixa de texto e um botao de enviar. Quem precisava mandar uma foto
para a equipe abria uma obra qualquer so para usar o chat dela.

Em vez de copiar as duzentas linhas para o outro lado — e ficar com dois chats
que divergem na primeira correcao —, a conversa inteira virou um componente:
**`src/components/Chat/Conversa.jsx`**. As duas telas sao cascas finas em cima
dele:

| Tela | O que ela faz |
|---|---|
| `pages/Obras/ModalChat.jsx` | carrega o chat DA OBRA e poe os participantes dela na frente da lista de @ |
| `pages/Chat/ChatEquipe.jsx` | a tela do chat DA EQUIPE (`/app/chat`); ali a equipe inteira pode ser citada, em ordem alfabetica |

O componente **nao carrega nem guarda** as mensagens: quem faz isso e quem
chama, porque as duas origens sao rotas diferentes. Dali saem so dois pedidos
— `aoEnviar` e `aoApagar` — e a lista que voltar e responsabilidade de quem
chamou.

O CSS foi junto: `pages/Obras/ModalChat.css` virou
`components/Chat/Chat.css`, e as duas telas usam as mesmas classes `chat__*`.

O botao muda conforme a tela:

| Tela | O botao |
|---|---|
| Obras | **+**, com *Adicionar observação* e *Chat da equipe* |
| Demais | icone de chat, atalho direto |
| Dentro de uma obra | **nao aparece** — la o chat que vale e o da obra |
| Chat da equipe | **nao aparece** — a pessoa ja esta nele |

Conversar e de todo mundo que entra; nao ha permissao para isso. O que se
controla e quem apaga: cada um tira so a propria mensagem, e a API confere de
novo antes de apagar.

## Obra fechada: a tela travada

Clicar numa obra em **Concluidas** abre `/app/concluidas/:id` — a MESMA tela
da obra, com `somenteLeitura`. A pessoa nao sai da aba de concluidas, ve tudo
(capa, etapas, checks marcados, observacoes, **chat, etiquetas, anexos**,
avaliacoes) e nao escreve nada.

A trava e num lugar so — as permissoes da tela caem juntas:

```jsx
const soLeitura = somenteLeitura || concluida(obra)
const podeEtapa = !soLeitura && pode('editar_etapa')
```

Espalhar o `!soLeitura` por quinze condicoes e como se esquece uma.

Repare no `|| concluida(obra)`: a trava e da OBRA, nao do caminho por onde se
chegou nela. Uma obra fechada aberta por `/app/obras/:id` (um link antigo, o
botao de voltar do navegador) vem travada do mesmo jeito.

**O que continua a vista, e so para consulta:**

| Onde | O que da para fazer | O que sumiu |
| ---- | ------------------- | ----------- |
| Chat | ler a conversa inteira | a caixa de escrever, o responder e o apagar |
| Etiquetas | ver quais a obra tem | adicionar, editar e reaproveitar |
| Anexos | **baixar** os documentos | anexar e excluir |
| Observacoes | ler todas | escrever e editar, mesmo a propria |
| Checks | ver o que foi marcado, por quem e quando | marcar e desmarcar |

Etiquetas e anexos ficavam de fora antes: os dois botoes sumiam junto com o
Editar, e tudo o que tinha sido etiquetado ou anexado durante a obra
desaparecia no dia em que ela era concluida — justo quando esse material vira
registro e passa a ser o que alguem volta para consultar.

A API repete a trava, e nao depende da tela: o middleware `obraAberta`
(`server/routes/dados.js`) recusa com 409 qualquer escrita numa obra fechada —
check, chat, observacao, aviso, etiqueta, anexo e a propria edicao da obra.
Fora da trava ficam as **avaliacoes**, de proposito: e depois de concluida que
a obra e avaliada.

Na faixa de carimbos aparecem, **so aqui**, "Concluida em", "Concluida por" e a
observacao do encerramento. Numa obra em andamento os tres seriam linhas
vazias.

Abaixo de tudo vem a **Rastreabilidade**: uma linha do tempo unica com quem
marcou cada check e a que horas, o chat, as observacoes, os avisos, os anexos
e as notas. Ela aparece em QUALQUER obra, aberta ou fechada: saber quem marcou
o que serve tanto para conferir o passado quanto para acompanhar o presente.

Os filtros do topo sao:

```
[Tudo] [1ª Etapa] [2ª Etapa] [3ª Etapa] ... [Chat] [Observações] [Avisos] [Avaliações] [Anexos]
```

As etapas vem do roteiro DAQUELA obra, e sao quantas ela tiver. Antes havia um
filtro so, "Checks", que jogava as cinco etapas na mesma pilha e nao respondia
a pergunta que se faz olhando a ficha: **"o que aconteceu na 3ª?"**.

A engrenagem no fim da fila renomeia a palavra "Etapa" — veja a secao seguinte.

## O nome das etapas

"Etapa" e a palavra da empresa, nao do sistema: amanha o roteiro pode se chamar
Fase, Marco, Frente ou Entrega. Ela mora na tabela `configuracao`
(`termo_etapa` e `termo_etapas`), vem junto na carga do quadro e sai do
`DadosContext`:

```jsx
const { termoEtapa, termoEtapas, rotuloEtapa } = useDados()
rotuloEtapa(3) // "3ª Etapa"
```

Toda tela que escreve a palavra usa esses tres — o cabecalho de cada bloco na
tela da obra, o card do quadro, os filtros da rastreabilidade, os avisos, o
pop-up de criar etapa e o de editar. Trocar num lugar troca em todos.

Sao dois campos, e nao um: o portugues precisa do singular ("3ª Etapa") e do
plural ("Etapas pendentes"). Deduzir o plural com um "s" no fim daria "Fases"
certo e "Marcoss" errado.

> **Nao ha mais tela para trocar essa palavra.** A engrenagem que ficava ao
> lado dos filtros da rastreabilidade saiu, e o bloco que a substituiu em
> Configuracoes tambem. Os valores continuam na tabela `configuracao` e
> continuam mandando em toda tela que escreve a palavra — so a edicao pela
> interface deixou de existir. Para trocar hoje, e um `UPDATE` em
> `configuracao` (chaves `termo_etapa` e `termo_etapas`) ou um `PATCH` em
> `/api/dados/termos`, que continua de pe.
>
> Com a etapa ganhando **nome proprio** (logo abaixo), o rotulo por posicao
> perdeu o lugar de destaque e a palavra passou a aparecer bem menos.

### Nome e descricao de cada etapa

O rotulo por posicao ("1ª Etapa") deixou de ser o titulo do card. Quem manda
agora e o **nome** da etapa, e embaixo dele vem uma **descricao** — texto
livre, opcional, que conta em que pe a etapa esta:

```
Comercial                <- etapa.nome        (o titulo)
aguardando aprovacao     <- etapa.descricao   (a linha de apoio)
```

Antes eram estas duas linhas:

```
1ª Etapa                 <- rotuloEtapa(1), automatico
comercial                <- etapa.nome, em caixa alta e pequeno
```

O lugar de destaque estava gasto para dizer uma coisa que a ordem das colunas
ja diz. O rotulo por posicao continua existindo — ele e o titulo de quem nao
deu nome a etapa, a dica do card, e a frase "Liberada quando a 2ª fechar" —,
so nao e mais o cabecalho.

O lapis no canto do card abre o mesmo pop-up de sempre (`ModalEtapa`), agora
com os dois campos e uma previa das duas linhas. Nome e descricao valem para
**todas as obras**: e a mesma etapa, so mudou como ela se chama e como esta.
Criar e excluir e que continuam valendo desta obra em diante.

## Confirmações

Quatro acoes pedem confirmacao antes de acontecer, e o `Confirma` tem dois
tons: `perigo` (vermelho, para apagar) e `acao` (cor do sistema — pintar de
vermelho um "Criar obra" faz a pessoa hesitar sem motivo).

| Ação | O que a caixa mostra |
|---|---|
| Sair | que a sessao fecha |
| Criar obra | empresa, tipo, prioridade e descricao |
| Novo colaborador | o cargo e **o que ele libera**, permissao por permissao |
| Novo/editar cargo | acesso total e a lista de permissoes marcadas |

As duas ultimas sao as que importam: cargo nao e cadastro de uma pessoa, e o
que um grupo inteiro passa a poder fazer. Uma caixa marcada sem querer libera
aquilo para todo mundo do cargo, e ninguem percebe na hora.

## Estrutura

```
src/
├── assets/                 # imagens importadas pelo bundler
├── components/
│   ├── AppShell/           # barra lateral (icone + descricao) + barra superior
│   ├── Avatar/             # foto redonda de pessoa/empresa (cai nas iniciais)
│   ├── Button/             # botao primario, azul solido
│   ├── Campo/              # campos de form: texto, area, selecao, pastilhas, foto
│   ├── CookieConsent/      # aviso de cookies + leitura do consentimento
│   ├── GlassCard/          # superficie liquid glass (blur + refracao + brilho)
│   ├── LiquidGlass/        # filtros SVG (refracao e ruido)
│   ├── Confirma/           # confirmacao de exclusao (no lugar do window.confirm)
│   ├── Modal/              # pop-up opaco (Esc, clique fora, rolagem travada)
│   ├── SocialRow/          # entrar com Outlook
│   ├── TextField/          # campo com label flutuante (login)
│   └── ThemeToggle/        # botao lua/sol, fixo no canto superior direito
├── context/
│   ├── AuthContext.jsx     # sessao, login, logout, persistencia
│   ├── DadosContext.jsx    # obras, clientes, cargos, equipe e avaliacoes
│   └── ThemeContext.jsx    # tema claro/escuro (padrao: claro)
├── domain/obras.js         # setores, prioridades, as 5 etapas, avanco e permissao
├── hooks/
│   ├── usePointerGlow.js   # brilho especular que segue o ponteiro
│   ├── useCorDaLogo.js     # cor predominante da logo do cliente
│   └── useMediaQuery.js    # troca de layout desktop/mobile
├── pages/
│   ├── Avaliacoes/         # nota por obra; a do usuario e a media
│   ├── Clientes/           # cadastro de clientes (CEP + IBGE)
│   ├── Concluidas/         # fechadas, agrupadas por ano e mes
│   ├── Configuracoes/      # editar a propria conta e o tema
│   ├── Home/               # o "meu dia": Grade, Quadro e Dashboard
│   ├── Login/              # tela de login (foto + faixas de vidro + cartao)
│   ├── Obras/              # quadro, card, modais e a tela da obra
│   ├── Privacy/            # politica de privacidade (texto provisorio)
│   └── Usuarios/           # equipe por cargo + cadastro de cargos
├── routes/                 # rotas e guarda de rota
├── services/
│   ├── authService.js      # camada de autenticacao
│   ├── api.js              # o jeito unico de falar com a API (token, erros)
│   ├── dadosService.js     # clientes, obras, checks e observacoes via /api/dados
│   ├── roteiroService.js   # etapas, cards e checks via /api/roteiro
│   ├── equipeService.js    # cargos e usuarios via /api/equipe
│   └── enderecoService.js  # ViaCEP + IBGE (estados e cidades)
├── utils/
│   ├── corDaImagem.js      # cor predominante de uma imagem
│   ├── formato.js          # datas, CEP, iniciais, cor a partir do nome
│   └── pessoa.js           # saudacao pelo horario, iniciais, primeiro nome
└── styles/                 # tokens, pecas comuns e estilos globais

server/
├── index.js                # API Express
├── db.js                   # pool do PostgreSQL
├── sessao.js               # token, "exige sessao" e traducao de erro do Postgres
├── roteiro.js              # o roteiro de fabrica; planta sozinho na 1a subida
├── routes/auth.js          # login, sessao e troca de senha
├── routes/equipe.js        # setores (tabela cargo) e usuarios
├── routes/dados.js         # clientes, obras, checks, observacoes, avisos, notas
├── routes/roteiro.js       # etapas, cards e checks (o roteiro das obras)
└── scripts/                # gerar hash de senha, validar o SQL

db/
├── usuario.sql.txt         # PARTE 1: banco, tabela usuario, travas
├── sistema.sql.txt         # PARTE 2: setores (tabela cargo), clientes, obras
├── quadro.sql.txt          # PARTE 3: roteiro, obra_check, senha provisoria
├── atualizacao.sql.txt     # permissoes, chat, etiquetas, anexos, notas
├── setores-e-chat.sql.txt  # setor do cliente e o chat da equipe
├── atualizacao-2.sql.txt   # proposta, conclusao manual, setor x cargo
├── atualizacao-3.sql.txt   # termos configuraveis, apagar msg para todos/mim
├── atualizacao-4.sql.txt   # cadastro de cargos, recorte das imagens
└── atualizacao-5.sql.txt   # descricao da etapa, duracao da observacao, aviso por e-mail
```

## Rotas

| Rota                        | Tela                     | Acesso    |
| --------------------------- | ------------------------ | --------- |
| `/login`                    | Login                    | publico   |
| `/politica-de-privacidade`  | Politica de privacidade  | publico   |
| `/app`                      | Pagina inicial (o "meu dia") | protegido |
| `/app/obras`                | Quadro de obras          | protegido |
| `/app/obras/:id`            | Tela da obra (5 etapas)  | protegido |
| `/app/clientes`             | Clientes                 | protegido |
| `/app/concluidas`           | Obras concluidas         | protegido |
| `/app/comercial`            | Comercial (funis de venda) | protegido |
| `/app/avaliacoes`           | Avaliacoes da equipe     | protegido |
| `/app/usuarios`             | Usuarios                 | protegido |
| `/app/despesas`             | Despesas (enviar)        | protegido |
| `/app/despesas/envios`      | Meus envios (mes / ano)  | protegido |
| `/app/configuracoes`        | Configuracoes (esboco)   | protegido |

Sem sessao, `/app` redireciona para `/login`. Ao entrar, o usuario volta para a
rota que tentou acessar (ou `/app`).

A barra lateral repete essa ordem, com o icone e a descricao de cada tela. Ela e
uma **bolha de vidro flutuante**, centralizada na vertical, e leva *so* os itens
de navegacao — a logo fica solta no canto superior esquerdo e o avatar no canto
inferior esquerdo, os dois fora dela. Clicando no avatar abrem-se
**Configuracoes** e **Sair**.

## Pagina inicial

Tres modos de olhar a MESMA lista, e a lista e uma so: **os checks das
obras abertas**.

| Aba | O que mostra |
|---|---|
| **Grade** | so o que da para fazer AGORA, em ordem de urgencia |
| **Quadro** | as mesmas tarefas em tres colunas: Nao iniciado / Em andamento / Concluida |
| **Dashboard** | os numeros de tempo que a lista nao mostra |

### Tarefa aqui e CHECK de obra

Nao existe cadastro de tarefa neste sistema, e **nao ha botao de
"adicionar tarefa" em lugar nenhum** desta tela. Uma tarefa solta nao
teria obra onde ser marcada nem quem a cobrasse — o sininho, os avisos e
a rastreabilidade so sabem falar de check de obra. Quem cria tarefa e
quem monta o roteiro.

### A faixa do dia

Data, tempo, saudacao e o resumo do dia. O icone do tempo e o de VERDADE,
puxado da [Open-Meteo](https://open-meteo.com) para **Santana, Sao Paulo**
(`src/hooks/useClima.js`) — ali havia um sol desenhado, fixo, que num dia de
chuva mentia. A temperatura de agora, com a maxima e a minima, fica sobreposta
ao canto superior direito do desenho, sem moldura: o desenho responde "como
esta la fora" de relance, e o numero e o detalhe de quem parou para olhar.

A Open-Meteo foi escolhida por dois motivos praticos: **nao pede chave de API**
(nada a cadastrar, nada a vencer, nada a esconder no `.env`) e responde direto
ao navegador, com CORS liberado. Nao vai dado nenhum do usuario na chamada — so
as coordenadas fixas do bairro, que sao duas constantes no topo do arquivo.

A resposta fica em cache por 15 minutos. Falhou (sem internet, servico fora)? O
hook devolve `null`, a faixa mostra so o desenho neutro e o dia da pessoa segue:
nenhuma tela deste sistema pode depender de um servico de previsao do tempo.

Os trinta codigos da OMM caem em **nove desenhos** (`familiaDoTempo`): "garoa
leve" e "garoa moderada" pedem a mesma figura, e desenhar trinta seria trocar
clareza por variedade. Os desenhos estao em
`src/components/Clima/IconeClima.jsx`.

> As gotas caem com atraso **negativo**, distribuido pelo ciclo (`-i/n` de uma
> volta). Nao e detalhe de estilo: com atraso positivo pequeno as tres caiam
> quase juntas e ficavam invisiveis ao mesmo tempo, e o icone de garoa virava um
> icone de "encoberto" por meio segundo a cada volta.

### O que entra na Grade

Duas coisas, e so essas duas:

1. **o que falta agora** — os checks da etapa que ja abriu e ainda nao foram
   marcados;
2. **uma linha por obra onde nada falta para voce**, dizendo o que aconteceu
   ("Sua parte esta concluida" ou "Ainda nao abriu para voce") e, principalmente,
   **quem esta segurando a passagem** para a proxima etapa.

Fica de fora o que esta preso em etapa futura: nao ha o que fazer com ele hoje,
e uma lista de afazeres que mistura o que da para fazer com o que nao da vira
inventario do roteiro. Fica de fora tambem o que ja foi marcado. Esses dois
moram no **Quadro**, que e a aba do estado.

A linha de espera nao some da Grade de proposito: sumir daria a entender que a
obra acabou. E o nome de quem esta devendo aparece ali porque, sem ele, a unica
saida era abrir a obra e conferir card por card.

Quem monta a lista e `src/pages/Home/useTarefas.js`. O **estado** de cada
tarefa sai destas perguntas, nesta ordem:

```
marcado?                          -> Concluida
a etapa dele e a ATUAL da obra?   -> Em andamento   (da para fazer agora)
e a PROXIMA etapa do setor dele?  -> Nao iniciado   (outros setores seguram)
etapa mais adiante que essa       -> ainda nao aparece
```

A "proxima etapa do setor" e a primeira, da atual em diante, em que o setor
ainda tem check por marcar. E ela que diz em que pe a obra esta para aquele
setor. A Excelencia, que esta na 2ª e na 5ª etapa:

```
1ª aberta            a 2ª dela em "Nao iniciado" (a 5ª ainda nao aparece)
2ª aberta            a 2ª em "Em andamento"
fez a parte da 2ª    a 5ª volta para "Nao iniciado", esperando os outros
                     setores fecharem a 2ª, a 3ª e a 4ª
5ª aberta            a 5ª em "Em andamento"
```

O card de "Nao iniciado" diz **quem segura a fila**: "Aguardando a conclusao
de", com cada etapa anterior que ainda nao fechou e os setores que ainda devem
check nela.

Obra de emergencia (Urgente) nunca tem "Nao iniciado": ali todas as etapas
abrem de uma vez, e tudo o que falta fica em "Em andamento". Obra ENCERRADA fica de fora inteira — ela e registro, e um
quadro que mistura o que acabou com o que falta para de responder a
pergunta que existe para responder.

### A coluna de concluidas mostra o CARD

Nas duas primeiras colunas, um card por CHECK. Na de concluidas, um card por
**card do roteiro** — "Comercial" —, com os checks dele dentro, cada um com a
data, a hora e quem marcou. O rodape traz a hora em que o card inteiro fechou,
que e a do ultimo check dele.

Antes cada check virava um retangulo solto ali, e um card de seis checks
enchia a coluna com seis retangulos contando a mesma historia.

Card ainda pela metade entra na mesma lista, com o placar ("3 de 6") e a borda
em azul em vez de verde: esconde-lo faria o trabalho ja feito sumir da tela sem
ter para onde ir.

**Nao da para arrastar card entre colunas**, e isso e proposital. A
coluna nao e uma escolha, e uma consequencia: "Em andamento" quer dizer
que a etapa abriu, e "Concluida" que alguem marcou o check. Arrastar
para "Concluida" seria marcar o check por fora do controle de quem pode
marcar o que — a marcacao continua na tela da obra, onde essa regra vive.

O botao **Minhas / Todas** filtra pelo SETOR de quem esta logado. Quem
nao tem setor, ou nao tem nenhuma tarefa no dele, ve tudo — senao a tela
abriria vazia e pareceria quebrada.

### Dashboard

Tres perguntas, e todas as respostas saem de carimbos que o sistema **ja
fazia**: `obra.data_inicio`, `obra.concluida_em` e o `feito_em` de cada
check. Nao ha coluna nova, cronometro nem ninguem apontando hora.

**1. Duracao da obra** — de `data_inicio` (ou, sem ela, da data de
cadastro) ate `concluida_em`.

**2. Tempo de resposta, por setor ou por pessoa** — este merece leitura
atenta, porque o nome pode enganar. Nao existe "inicio da tarefa"
gravado em lugar nenhum: so o instante em que ela foi MARCADA. Entao o
que da para medir e o **intervalo entre uma marcacao e a seguinte dentro
da mesma obra** — quanto tempo a obra ficou parada esperando aquele
check depois que o anterior saiu. A primeira marcacao conta a partir do
inicio da obra.

O credito vai para **quem marcou** (`feito_por`), e nao para o setor
dono do check no roteiro: numa emergencia qualquer um pode marcar, e
atribuir o tempo a quem nao encostou na obra seria inventar numero.

**3. Atraso e adiantamento** — a unica que compara o combinado com o
acontecido: `data_conclusao` (prometida) contra `concluida_em` (real).
Positivo e depois do prazo, negativo e antes. Obra sem data combinada
fica de fora: nao da para estar atrasado em relacao a um prazo que nunca
existiu.

O painel olha a **empresa inteira**, e nao o setor de quem esta vendo —
media de uma pessoa so nao e media de nada. Por isso o filtro
Minhas/Todas some nessa aba.

> **Todo grafico depende de OBRA CONCLUIDA.** Enquanto nao houver uma,
> tres dos quatro numeros de cima aparecem como `—` e dois dos graficos
> mostram o motivo no lugar da barra. Isso e o desenho funcionando, nao
> um erro: media de zero obras nao existe, e um grafico vazio que nao
> explica por que esta vazio manda a pessoa procurar defeito onde nao
> ha.

As contas ficam em `src/pages/Home/Painel.jsx` e sao feitas em **dias
inteiros de calendario**, com `Date.UTC` nas duas pontas: subtrair dois
`new Date()` erra por uma hora em toda virada de horario de verao, e um
relatorio que muda de resultado em outubro nao serve para nada.

### A ordem do Dashboard

1. **Atraso e adiantamento** — no topo. Um resumo com tres contadores para as
   obras **em andamento hoje** (adiantadas, no prazo, atrasadas — e as sem
   prazo final) e para as **concluidas no mes** (adiantadas, no dia,
   atrasadas), com as atrasadas pelo nome. Embaixo, os cartoes Atraso e
   Adiantamento, obra a obra.
   Em andamento: **atrasada** e a que tem algum prazo vencido (o final, o de
   uma etapa ou o de um check); **adiantada** e a que ja fez pelo menos 10
   pontos a mais do que o tempo que passou entre o inicio e o prazo final; o
   resto com prazo e **no prazo**.
2. **Tempo de resposta**.
3. **Entregas no prazo** (a rosca).
4. Tempo medio de obra em campo — a etapa de execucao e a fixa
   (`etapa.papel = 'execucao'`) quando existe.

### Os graficos

Quatro, em `src/pages/Home/graficos.jsx`, **sem biblioteca nenhuma**:

| Peca | Onde entra |
|---|---|
| `Barras` | tempo de resposta por setor ou por pessoa |
| `Rosca` | a fatia de entregas no prazo |
| `Divergente` | atraso e adiantamento, obra a obra |
| `Colunas` | duracao das obras concluidas, com a linha da media |

Eles ficam **lado a lado** numa grade de duas colunas; os que precisam de
largura (um item por obra) atravessam as duas com `cartao--largo`. Abaixo de
1080px viram uma coluna so — com menos de 300px uteis o eixo e os nomes nao
cabem, e o desenho para de comparar.

Duas decisoes sustentam o arquivo dos graficos:

**1. O SVG e desenhado no tamanho real em pixels**, medido por
`ResizeObserver`, e nao num `viewBox` que estica. Num viewBox a letra do eixo
estica junto com o desenho: o mesmo grafico sairia com fonte de 9px numa coluna
estreita e de 18px numa larga. Medindo, o texto tem 11px em qualquer largura.

**2. A escala cai em numeros redondos** (0, 5, 10, 15), da familia
1 / 2 / 2,5 / 5 / 10 vezes uma potencia de dez. Eixo com marca em 8,7 obriga a
fazer conta para ler o grafico.

A rosca e feita com `stroke-dasharray` num circulo, e nao com um `path` de
arco: arco de 0% e arco de 100% sao os dois casos que quebram o desenho por
caminho (um vira um ponto, o outro nao fecha) — e sao justamente os dois que
este grafico mais mostra, "nenhuma atrasada" e "todas atrasadas".

## Obras

### "Urgente": a prioridade da emergencia

No banco a emergencia continua sendo `prioridade = 'alta'` — e o gatilho que
garante isso, e mexer no valor gravado obrigaria a migrar a coluna, o CHECK e
todas as obras antigas para ganhar uma palavra.

O que mudou e a LEITURA: onde a obra e de emergencia, a tela escreve
**"Urgente"**. "Alta" nao distinguia nada — a obra padrao tambem pode ser
alta, e as duas apareciam iguais no quadro.

A escolha do formulario continua sendo entre as **tres de sempre**, e so na
obra padrao. Urgente nao e uma quarta opcao a marcar; e o nome que a
emergencia da a prioridade que ela ja tem. A palavra leva o **azul** do botao
"Obra emergencia" (`--pri-urgente`, em src/styles/tokens.css), e nao o
vermelho da alta.

Quem decide isso sao dois helpers em `src/domain/obras.js` —
`rotuloPrioridadeObra(obra)` e `tomPrioridadeObra(obra)` —, usados por toda
tela que escreve a palavra. Ja houve o dia em que um lugar dizia "média" e o
outro "Media".

### "Concluido em" no card

Quando o ULTIMO check da obra e marcado, o card do quadro passa a mostrar
**"Concluido em: [data e hora]"** no canto inferior direito, embaixo dos
avatares.

A hora e a da **ultima marcacao** — e ela que responde "quando ficou pronto".
Nao e a mesma coisa que `obra.concluida_em`, que e o carimbo do clique em
"Concluir obra". Enquanto esse clique nao vem, a obra continua no quadro — e e
exatamente ai que o carimbo serve, porque e o que faz alguem lembrar de
fechar.

### A data de conclusao

Na obra **padrao** ela e opcional: a data as vezes so se sabe depois. Na
**emergencia** e OBRIGATORIA, no formulario e na API.

Emergencia sem prazo e uma contradicao: sem uma data ate a qual aquilo
precisa estar resolvido, o que existe e uma obra urgente — e urgente ja e a
prioridade alta da obra padrao. Alem disso e o prazo que faz a obra aparecer
como **atrasada** na pagina inicial e entrar na conta de atraso do Dashboard;
sem ele, a emergencia seria a unica que nunca cobra ninguem.

A regra e conferida em dois lugares: a tela barra o envio, e a API repete a
checagem — quem chamasse `/api/dados/obras` direto passaria por cima da
primeira. Na EDICAO a API olha o banco, e nao so o corpo da chamada, porque ha
dois caminhos ate a mesma contradicao: apagar a data de uma emergencia que ja
existe, e transformar em emergencia uma obra padrao que esta sem data.

Na obra padrao sem data, a tela da obra mostra um **(!) piscando** no canto
superior direito do bloco "Data de conclusao". Ele nao e enfeite: sem prazo a
obra some dos dois unicos lugares que existem para cobra-la, e ninguem
percebe. O sinal e um botao — clicar abre o cadastro, que e onde a data se
preenche; aviso que aponta um buraco sem levar ate ele obriga a pessoa a
procurar sozinha onde conserta.

Ele pulsa devagar (1,6s) e nunca apaga de vez: a opacidade minima e 0,35.
Sinal que some inteiro vira um bloco vazio piscando. Para quem pediu menos
movimento no sistema ele fica firme, e o recado continua o mesmo.

Nao aparece na emergencia (la a data e obrigatoria no cadastro, entao o caso
nao existe) nem na obra ja concluida (o prazo daquela ja passou, e piscar
sobre registro fechado e ruido).

Uma obra pertence a um cliente e nasce **padrao** (card ciano) ou
**emergencia** (card laranja/vermelho). O quadro tem tres colunas: obras padrao,
obras emergencia e *enviar aviso* — esta ultima lista so as obras que tem setor
devendo informacao, com um botao por setor e um **Todos** que avisa todos os
pendentes daquela obra. O `+` do cabecalho dessa coluna avisa todas as obras de
uma vez.

### Observacao do quadro com duracao

O painel a direita do quadro guarda os recados que valem para as obras em
geral. Muitos deles valem **por um periodo**, nao para sempre ("ate sexta o
galpao fica fechado"), e ate aqui quem escrevia tinha de lembrar de voltar e
apagar. Quase nunca lembrava, e o painel virava um mural de recado vencido.

Marcando **Adicionar duracao** abrem os dois calendarios — *de* e *ate* —, os
dois **obrigatorios**: uma janela pela metade nao diz quando a observacao sai
do quadro, que e a unica coisa que a duracao existe para dizer. A regra e
conferida em tres lugares: o `min`/`max` cruzado dos campos, a conferencia no
envio e o `CHECK` da tabela.

Passada a data final, a observacao **sai do painel sozinha** e vai para a aba
**Historico** do pop-up. Ela nao e apagada: "o que estava valendo em marco?" e
uma pergunta legitima, e a resposta sumiria junto com a linha.

Duas coisas que **nao** entram no historico, de proposito:

- a observacao **sem duracao**, que nunca vence — fica no painel ate alguem
  apagar, como sempre foi;
- a observacao **apagada na mao** — quem clicou no lixo nao queria mais ver
  aquilo, e ressuscitar numa aba seria o contrario do gesto.

O corte usa `AAAA-MM-DD` comparado como **texto**. Nessa forma a ordem
alfabetica E a cronologica, entao nao ha `Date` nem fuso no meio para fazer a
observacao sumir um dia antes. As colunas sao `DATE` pelo mesmo motivo: o prazo
e "ate sexta", nao "ate sexta as 14h32".

Quem separa as duas listas e o `DadosContext`: `observacoesQuadro` (o que vale
hoje, e o que o painel mostra) e `historicoObservacoes` (o que venceu, da
vencida mais recente para a mais antiga).

### No celular

A barra de baixo tem **Pagina inicial · Obras · Despesas · Menu**. O Menu
(hamburguer, na ponta direita) abre o **menu lateral** pela direita: a foto,
o nome e a avaliacao de quem esta logado; as outras abas (Clientes,
Concluidas, Avaliacoes, Usuarios...), so icone e nome com uma linha fina
entre elas; e **Configuracoes sozinha no rodape**. Ele desliza com o veu
escurecendo a tela, e as pecas de dentro chegam em cascata logo atras.

O menu lateral so existe no celular. As classes dele sao `menulado__*`: a
tela de Obras ja usa `.lateral` (a coluna das emergencias), e quando o menu
tambem se chamava assim o CSS de um pintava o outro — o menu aparecia aberto
e sem estilo no computador, e no celular a coluna das emergencias sumia.

A barra de cima (saudacao, sino, foto e busca) e mais baixa que no
computador; a letra da busca so fica em 16px no iPhone, que da zoom na tela
em campo com letra menor.

### O quadro

Uma coluna por etapa, **lado a lado**, ocupando a largura — 1ª Etapa,
2ª Etapa, 3ª Etapa... A obra padrao
fica na coluna da etapa em que esta; etapa sem obra aparece em branco. Na
ponta direita, **Obras emergenciais** e, embaixo dela, as **Observacoes** do
quadro. O card so abre a obra: os checks moram dentro dela.

Obra nova nasce **so** pelos botoes **+ Obra padrao** (verde) e **+ Obra
emergencia** (azul) da barra — as colunas nao tem "+".

Ao lado deles, **Editar** abre o **Modelo da obra** (`ModalModeloObra`): o
roteiro que uma obra criada agora vai ter, com todas as etapas abertas, para
criar e editar etapas, cards e checks — e arrastar checks — sem precisar
entrar numa obra. Tudo ali vale para as obras criadas a partir de agora.
Aparece para quem tem alguma das permissoes do roteiro.

### A cor do card

A cor sai de `situacaoDaObra()` (`src/domain/obras.js`), e vale a mais urgente:

| Cor      | Quando                                                                 |
| -------- | ---------------------------------------------------------------------- |
| verde    | obra padrao em dia — e toda obra **sem prazo final**, ate ele existir   |
| azul     | obra de emergencia em dia                                              |
| amarelo  | prazo final com metade do periodo (ou 3 dias) restando; ou um check vencido / vencendo em 3 dias |
| laranja  | prazo final muito perto (2 dias, ou o ultimo quarto do periodo)        |
| vermelho | prazo final amanha ou hoje; ou ja vencido (selo "Atrasada")            |

**A cor vem do PRAZO FINAL DA OBRA** (`data_inicio` → `data_conclusao`), em
qualquer etapa, enquanto houver check aberto. O vermelho chega **1 dia antes**.

O **prazo da execucao** (o ultimo dos dias da execucao, so a 3a etapa)
**nao mexe na cor**: com a execucao hoje ou amanha e o prazo final longe (ou
sem prazo final), o card continua verde. Ele so serve para a 3a etapa andar e
para o registro dos ensaios dia a dia.

Na emergencia o card fica azul ate o prazo final vencer. Quando a cor nao e
a de sempre, uma linha no card diz o porque ("Prazo final vence amanha",
"Prazo de "Hospedagem" venceu em 03/10 — ADM").

### O card da obra

O card mostra a logo da empresa, **o n. da proposta e o nome do cliente**, a
etapa atual, os setores que ainda devem informacao nela, o motivo da cor, a
descricao, a barra da execucao dos ensaios, a prioridade com o inicio e o
prazo final e as fotos de quem mexeu na obra.

**O fio da esquerda e a cor da PRIORIDADE**, e nao a do prazo: verde baixa,
amarelo media, vermelho alta, azul no "Urgente" da emergencia. A palavra em
"Prioridade: Alta" sai na mesma cor. O fundo do card continua contando o
prazo final (verde, amarelo, laranja, vermelho).

O titulo e `"1042/2026 - Acme"`: **o n. da proposta na frente**, porque e por
ele que a obra e procurada no resto da empresa — quem liga perguntando de uma
obra tem o numero da proposta na mao, e nao o nome da empresa (que costuma ter
cinco obras abertas ao mesmo tempo). Obra antiga, sem proposta cadastrada,
mostra so o nome do cliente. Quem monta e o `tituloDaObra()` de
`src/domain/obras.js`, para o card, a capa da obra, a lista de Concluidas e o
titulo do chat escreverem o MESMO nome.

**No cadastro da obra:** o n. da proposta e **obrigatorio** e a **descricao
virou opcional**. A obra ja e identificada pela dupla proposta + cliente, e
obrigar um texto livre so fazia aparecer "obra" e "-" no lugar da descricao.

**A prioridade e uma pastilha clara**, e nao texto colorido solto. O motivo e o
card de emergencia: ele ja e laranja-avermelhado, e o vermelho da prioridade
alta escrito por cima dele sumia. A saida anterior era desistir da cor ali —
so que ai a prioridade do card mais urgente do quadro era justamente a unica
que nao dava para reconhecer pela cor, que e para isso que a cor existe.

### As cinco etapas

| Etapa | Setores envolvidos                        |
| ----- | ----------------------------------------- |
| 1ª    | Comercial                                 |
| 2ª    | Tecnico, ADM, GQ, Excelencia              |
| 3ª    | Tecnico, GQ, Excelencia, Comercial        |
| 4ª    | GQ, Comercial, ADM                        |
| 5ª    | Comercial, ADM, GQ, Excelencia            |

Cada setor tem um roteiro de tarefas dentro da etapa (`src/domain/obras.js`). O
setor fecha quando marca todas as suas tarefas; a etapa fecha quando **todos**
os setores dela fecharam. As cinco etapas deslizam na horizontal, com o painel
de **Observacoes** fixo a direita.

**Como as etapas abrem depende do tipo da obra:**

- **Padrao** — fila. So a etapa atual aceita marcacao; as seguintes ficam com
  cadeado ate a anterior fechar.
- **Emergencia** — as cinco ja nascem liberadas. Numa emergencia ninguem espera
  a etapa anterior fechar para agir.

Uma observacao guarda o nome de quem escreveu, a nota dessa pessoa, o texto e o
carimbo de data/hora. Cada um edita e apaga so a **propria** observacao; quando
edita, o card mostra "editada" no rodape. Obra com as etapas fechadas sai do
quadro e vai para **Concluidas**.

**O roteiro anda so para a frente.** Mexer no roteiro dentro de uma obra vale
para **ela e para as proximas** — nunca para as que ja passaram. Uma obra
fechada em marco nao pode ganhar um check novo em maio e voltar a aparecer como
pendente.

Como isso funciona: cada peca (etapa, card, check) tem uma janela de vigencia —
`vigente_de` e `vigente_ate`. Uma obra criada em X enxerga a peca quando
`vigente_de <= X < vigente_ate`. Criar dentro da obra X carimba `vigente_de`
com a data de nascimento de X; excluir carimba `vigente_ate` com a mesma data
(nada e apagado de verdade, senao o historico das obras antigas iria junto).
Depois de filtrar, as etapas sao **renumeradas dentro da propria obra**: se a 2a
saiu do roteiro em maio, a obra de junho ve a antiga 3a como a sua 2a.

Renomear uma etapa ou um card continua valendo para todas: e a mesma peca, so
mudou o rotulo.

**Onde a mudanca de um check vale** depende de onde ela e feita:

- **dentro de uma obra** — criar, editar, excluir ou arrastar um check vale
  **so naquela obra**: nem nas proximas, nem nas que ja passaram. Na primeira
  mudanca de check dentro dela, a obra ganha uma copia dos checks que enxerga
  (`etapa_check.obra_id`, com `origem_id` apontando o check do roteiro), as
  marcas e os prazos dela passam para as copias e `obra.checks_proprios` vira
  true (atualizacao 18). Dali em diante ela le so as copias dela;
- **no Modelo da obra** (o "Editar" do quadro) — vale para as obras criadas
  **a partir de agora**. O check que alguma obra que existe hoje ja enxerga
  vira versao nova (o de antes fecha agora, o novo abre agora); o que nenhuma
  obra enxerga (criado agora no modelo) muda no proprio lugar.

Os cards e as etapas continuam sendo do roteiro: criar um card dentro de uma
obra vale para ela e para as proximas, como antes.

**Arrastar checks.** O proprio check e a alca — nao ha pegador. Com o mouse,
apertar e mover; no celular, segurar o check parado um instante (ele vibra) e
arrastar. O check sobe, desce ou vai para outro card, de qualquer setor e de
qualquer etapa; perto da borda a tela rola sozinha
(`src/pages/Obras/arrasteChecks.js`, `PUT /roteiro/cards/:id/checks/ordem`).
Soltar sem ter movido continua sendo o clique de marcar. Os checks do sistema
mudam de ordem e de card, mas nao saem da etapa deles.

Os botoes do check (prazo, lapis) so ocupam lugar com o mouse em cima:
fechados nao tem largura. O texto do check quebra linha, e as etiquetas
(Sim/Nao, gases, prazo, dono) descem para a linha de baixo quando nao cabem
do lado — nada fica cortado nem por cima do texto.

### Etapas fixas, prazos e ensaios

**Etapas fixas.** As etapas de fabrica (`etapa.fixa`, atualizacao 14) sao o
esqueleto do fluxo e **nao se renomeiam, nao se reordenam e nao se excluem** —
a tela nao mostra o lapis e a API responde 409. Elas se chamam "1° Etapa",
"2° Etapa"... (a atualizacao 15 chegou a renomea-las; a 16 desfez). As tres
primeiras tem um papel interno (`etapa.papel`: planejamento, intermediaria,
execucao) — e por ele que o sistema acha onde mora o Planejamento de ensaios
e qual etapa e a execucao. O papel nao aparece na tela.
So as etapas criadas a mao seguem editaveis. Os cards e os checks dentro de
uma etapa fixa continuam editaveis.

**O card e de um setor so.** O gradiente de varios setores (e "qualquer um
deles marca") saiu. Quem marca cada check e decidido NO CHECK.

**Tudo o que diz como um check se comporta mora no check:**

- `[ ] Obrigatorio responder Sim ou Nao?` — marcada, o check abre a pergunta.
  Sim marca com ✓; Nao tambem marca, com um X e "Nao" do lado. No mesmo card um
  check pode pedir resposta e o do lado nao;
- **Prazo** nesta obra (com a permissao "Pode definir prazo para checks");
- **Quem marca** (vazio = o setor do card);
- **Informacoes** — a dica ao passar o mouse.

**Prazo de um check especifico.** Com `definir_prazos`, o calendario no
cabecalho da etapa (ao lado do + de card) abre "Prazos dos checks": escolher
o check, escolher a data, salvar. O prazo fica gravado naquele check, naquela
obra (`obra_prazo_check`). O calendario de cada check faz o mesmo direto. O
antigo botao "Definir prazo" da etapa inteira saiu.

**Obra emergencial e so a cadastrada como emergencial** (+ Obra emergencia).
Data nenhuma muda o tipo: execucao em menos de 3 dias, hoje ou amanha, nao
transforma obra padrao em emergencia (a regra dos 3 dias saiu; a atualizacao
16 devolveu a padrao as obras que ela tinha convertido).

**O cadastro da obra tem so o inicio e o prazo final.** O periodo de execucao
e definido DENTRO da obra, na **1a etapa**: o check do sistema **"Prazo da
execucao"** (atualizacao 19) mora no card do Time Tecnico, logo depois do
Planejamento de ensaios. O clique nele abre o "Periodo de execucao", e
definir o prazo MARCA o check — ele nao se marca nem se desmarca na mao.
Quem define e quem marca os checks desse card (o Tecnico) ou quem tem
`definir_prazos`.

**A execucao exige o prazo dela.** Na etapa de execucao nenhum check se marca
sem o prazo da execucao. O bloco da 3a etapa mostra o periodo **travado**,
com "definido na 1a etapa" — sem botao; sem o prazo, ele diz que o prazo vem
da 1a etapa. O "Periodo de execucao" grava so o periodo da execucao (nunca o
prazo final da obra, e nao deixa passar dele).

**O periodo de execucao e escolhido DIA A DIA** (atualizacao 20). O "Periodo
de execucao" e um calendario so: clique em cada dia, ou clique e arraste para
marcar um trecho (comecando num dia marcado, o arraste tira); Shift + clique
marca do ultimo dia clicado ate ali. Uma execucao de 5 dias nao precisa ser 5
dias seguidos — so dias uteis, pulando uma semana, num feriado. O atalho
"Tirar fins de semana" desmarca sabados e domingos. Os dias ficam em
`obra.execucao_dias`; o primeiro e o ultimo continuam em `execucao_inicio` e
`execucao_prazo` (o prazo da execucao e o ultimo dia marcado). Os dias fora
da obra (antes do inicio, depois do prazo final) ficam travados. Obra que
definiu o periodo antes disso (`execucao_dias` vazio) vale como periodo
corrido e abre com todos aqueles dias marcados. Na Execucao dos ensaios, a
fila de dias e a dos dias marcados; um dia fora deles se escolhe pelo campo
de data e aparece tracejado.

O check vale para as obras criadas a partir da atualizacao 19. As que ja
existiam nao o enxergam (ganhar um check na 1a etapa faria voltar de etapa
quem ja passou dela) e continuam definindo o prazo no bloco da 3a etapa,
como antes.

**Planejamento de ensaios (1a etapa).** O check abre a escolha dos ensaios:
a pessoa **arrasta** os ensaios do catalogo para a caixa da obra (e de volta
para tirar; dentro da caixa, arrastar muda a ordem). Fica em `obra_ensaio`.
O check so fecha com ao menos um ensaio.

**Execucao dos ensaios (3a etapa).** O check abre so os ensaios planejados.
Dentro do periodo de execucao, o responsavel escolhe um **dia** e diz quanto
cada ensaio estava feito naquele dia (`obra_ensaio_progresso`: ensaio + dia +
percentual — um dia nao apaga o outro). O andamento de um ensaio e o do dia
mais recente; o da execucao e a media (Vazao 100% + Smoke Test 50% = 75%). O
check **so fecha com todos em 100%**, e reabre sozinho se um ensaio voltar a
ficar abaixo disso (um dia corrigido, um ensaio novo no planejamento).

**Ensaios por item (atualizacao 25).** A obra nova planeja **por item**: em
vez de uma lista solta, cadastra o que vai ser ensaiado e, em cada item, os
ensaios com a condicao.

| Item | Identifica | Ensaios que aparecem |
| --- | --- | --- |
| Ambiente | nome + classe (ISO 7 / Grau C) | HVAC |
| Equipamento | nome + TAG | HVAC |
| Sistema | nome (AHU, rede de gases) | HVAC e Gases |
| Ponto de uso | nome + **gas** (obrigatorio) | Gases |

Cada ensaio marcado no item escolhe **Como encontrado** (o ensaio antes de
qualquer ajuste, que registra como o sistema estava — o "As-Found" do
mercado), **Como certificado** (depois dos ajustes, o resultado que vai para o
certificado) ou as duas, para comparar o antes e o depois. Na tela tudo e em
portugues; no banco os ids continuam `as_found` e `como_certificado`. Cada
item + ensaio + condicao e uma **linha** (`obra_item_ensaio`). O
**servico** e um por obra (`obra.servico`: Qualificacao/Certificacao, QI, QO,
QP, TAB, Comissionamento ou Requalificacao). Cada item salvo ja vai para o
banco; "Concluir planejamento" pede o servico, ao menos um item e todo item
com ensaio. "Duplicar" abre a copia de um item no editor, para trocar so o
nome (Sala 101 -> Sala 102).

Na **Execucao**, cada linha recebe o resultado: data, valor medido, conforme
ou nao conforme e observacao. "Nao conforme" e resultado, nao pendencia: a
linha conta como feita. O % da execucao e a parte das linhas feitas, e o
check so fecha com todas. "Salvar e proxima" pula para a proxima pendente
com a mesma data.

As tabelas da lista solta continuam sendo a fonte do resto do sistema: a
cada mudanca o servidor (`sincronizarItens`) refaz `obra_ensaio` (os ensaios
distintos das linhas) e `obra_ensaio_progresso` (por ensaio e dia: linhas
feitas ate aquele dia / linhas do ensaio). O quadro, o "Material de gases" e
as regras dos dois checks nao mudaram. As rotas sao `PUT
/api/dados/obras/:id/planejamento-itens` e `PUT
/api/dados/obras/:id/execucao-itens`; as da lista solta recusam (409) a obra
que planeja por item.

A obra que ja tinha escolhido ensaios pela lista **continua nela**. Enquanto
nao tiver execucao registrada, o botao "Planejar por item" passa para itens
(ao salvar o primeiro item, a lista passa a sair dos itens). Os itens se
cadastram pela tela; importar de planilha fica para depois.

**Catalogo de ensaios.** Comeca com Teste 1, 2 e 3. Quem tem "Adicionar /
editar ensaios" (`gerenciar_ensaios`) cria, renomeia e exclui pelo botao
"Gerenciar ensaios" do planejamento. Excluir um ensaio ja usado so o tira do
catalogo: as obras que o tinham continuam com ele e com a execucao.

Todo ensaio e **HVAC** ou **GASES** (`ensaio.classificacao`, atualizacao 17):
escolhido ao criar (o "Adicionar" so libera com a classificacao) e trocavel na
lista. Os ensaios que ja existiam ficam sem classificacao ate alguem escolher.

**Material de gases.** O check da Qualidade na 2a etapa que fala de gases
("Material de gases") virou check do sistema (`tipo = 'material_gases'`). Ele
so e **obrigatorio** na obra que tem algum ensaio de GASES planejado — a dica
dele diz qual ("Obrigatorio: esta obra tem ensaio de GASES atribuido (...)") e
o selo fica "obrigatorio". Nas outras obras ele fica "opcional": pode ser
marcado, mas nao segura o card, a etapa, o progresso nem a conclusao da obra
(`aplicarRegraDosGases` na tela; a mesma conta no `POST /obras/:id/concluir`).

As duas permissoes novas (`definir_prazos` e `gerenciar_ensaios`) so entram
sozinhas no setor de acesso total. Os outros setores ganham marcando a caixa
em Usuarios > Setor.

### Chat, etiquetas e anexos

Cada obra tem **uma conversa propria**, gravada no banco. Abre pelo botao
*Abrir chat* (ao lado de Membros) ou pelo "+" do canto — e o mesmo chat. Da para
escrever, anexar arquivo, tirar foto pela camera, responder uma mensagem
especifica e mencionar alguem com `@`.

**Apagar uma mensagem pergunta para quem**, porque sao dois gestos diferentes:

| | O que acontece | Quem pode |
| --- | --- | --- |
| **Apagar para todos** | a mensagem some da conversa de todo mundo. A linha fica, vazia, com a marca *"mensagem apagada"* — o texto e o arquivo viram NULL no banco | so o autor (e o acesso total) |
| **Apagar para mim** | some so da sua tela; para os outros a conversa continua inteira | qualquer um, em qualquer mensagem |

A marca do "para todos" nao e enfeite: sem ela, quem tivesse respondido a
mensagem apagada ficaria com uma resposta solta no meio da conversa, sem
entender a que. O "para mim" e uma linha em `obra_chat_oculta`, filtrada na
leitura — e por isso ele e o **padrao** da rota: uma chamada sem `escopo` nao
apaga a mensagem de outras pessoas.

O pop-up de escolha so oferece o "para todos" na propria mensagem. Na de outra
pessoa ha um caminho so, e perguntar ali seria oferecer uma escolha que nao
existe.

As **etiquetas** rotulam a obra: o botao *Adicionar etiqueta* fica sempre em
primeiro, as etiquetas ja postas logo abaixo, e o lapis de cada uma na direita —
e dentro da edicao que mora o Excluir. A etiqueta e do sistema: a mesma pode
marcar varias obras, e some da lista quando nao esta em nenhuma.

Os **anexos** guardam os documentos da obra (ate 4 MB cada). A lista que chega
com o quadro traz so nome, tipo e tamanho; o arquivo em si so e buscado no
clique de baixar — senao cada carregamento arrastaria todos os documentos de
todas as obras junto.

### Quem pode editar o que

Cada setor mexe so nas tarefas do proprio setor: o ADM nao fecha tarefa do
Tecnico. O bloco do outro setor continua visivel (da para acompanhar), mas com
cadeado, o check riscado em diagonal, o cursor de bloqueado e o botao
desabilitado — **nao da nem para clicar**.

Tres saidas dessa regra:

- o setor com **acesso total** (`cargo.acesso_total`, a diretoria);
- a permissao **check em todas as etapas**;
- obra de **emergencia** (`obra.tipo = 'emergencia'`) — ali ninguem espera o
  setor certo: **qualquer setor** marca qualquer check. Na obra padrao a trava
  por setor continua igual.

A regra vive em `podeEditarCheck()` de `src/domain/obras.js` — e a API repete a
mesma em `podeMarcar()` (`server/routes/dados.js`) — e vale junto com a
trava de etapa: uma etapa que ainda nao abriu continua travada mesmo para a
diretoria.

**A tela e o servidor precisam responder a MESMA coisa.** Havia dois atalhos so
no cliente — o texto `'todos'` na lista antiga de permissoes e a chave do setor
ser `diretor` — que o servidor nao conhecia. O efeito era o check que **marcava
e desmarcava sozinho**: a tela liberava o clique, a gravacao era recusada e o
recarregamento devolvia o check ao estado anterior, meio segundo depois. Hoje
`temAcessoTotal()` le so a marca `acessoTotal`, a mesma coluna que o
`meuCargo()` do servidor consulta.

Alem disso, `alternarCheck()` (no `DadosContext`) faz a pergunta **antes** de
mexer na tela: check de outro setor nao chega a piscar, e obra concluida nem
aceita o clique.

### Membros da obra

**Membro e quem MARCOU algum check nela** — mais ninguem.

Dois gatilhos no banco cuidam disso: `obra_check_entra` poe a pessoa na lista
quando ela marca, e `obra_check_sai` a tira quando ela desmarca o ultimo check
dela naquela obra. Sem o segundo, quem marcasse por engano e desmarcasse ficava
como participante para sempre.

Na tela, obra sem nenhum membro mostra "ninguem ainda". Ela mostrava os quatro
primeiros da equipe como se fossem os participantes — gente que nunca tinha
encostado naquela obra aparecendo como responsavel por ela.

#### Membro parcial (atualizacao 30)

Nem todo mundo que vai a obra marca check — nem ha check para todos. Por isso
da para **incluir a pessoa na mao**: clicar em **Membros** na tela da obra abre
a lista (`ModalMembrosObra`), com quem entrou pelo check, os incluidos e o
**Incluir membro**.

- Incluir: qualquer um que ve Obras. A pessoa recebe a **solicitacao** — no
  alto do sino, numa faixa na tela da obra e no celular — e **aceita** ou
  **recusa**. Recusar exige o **motivo**, que quem incluiu ve na lista (e
  recebe no celular). Quem inclui a si mesmo entra ja aceito.
- Aceito, o membro parcial conta como membro em tudo: fotos da obra, "em
  andamento" da pessoa, chat da obra e a media das avaliacoes (a view
  `usuario_media` foi refeita para somar os dois).
- Tirar da obra: setor com `excluir_membro_parcial` (entra marcada no acesso
  total). Sem ela, so quem incluiu, e so enquanto a pessoa nao respondeu.
- Quem recusou pode ser incluido de novo: a solicitacao volta a pendente.

Mora numa tabela propria, `obra_membro_parcial`, e nao em `obra_membro`, de
proposito: `obra_membro` e so do check (o `obra_check_sai` tira quem desmarca
o ultimo, e a limpeza da atualizacao 2 apaga, toda vez que as atualizacoes
rodam, quem nao tem check). Uma inclusao feita a mao ali sumiria sozinha.

Rotas: `POST /api/dados/obras/:id/parciais` (incluir),
`POST .../parciais/:usuarioId/resposta` (a propria pessoa responde) e
`DELETE .../parciais/:usuarioId` (tirar).

### Setor e cargo

Sao duas coisas diferentes, e a confusao entre elas custa caro:

| | **Setor** | **Cargo** |
| --- | --- | --- |
| O que e | o grupo da equipe: Comercial, Excelencia, GQ | o titulo da pessoa: "Analista de Qualidade" |
| De onde vem | uma lista cadastrada (tela Usuarios > **Setores**) | texto livre no cadastro dela |
| Obrigatorio? | sim | nao |
| Decide permissao? | **sim — tudo** | nao, nada |
| Onde mora | `usuario.cargo_id` -> tabela `cargo` | `usuario.cargo_titulo` |

**Todas as permissoes saem do SETOR.** Dois analistas e um coordenador do mesmo
setor podem exatamente as mesmas coisas — o cargo e informacao, nao poder.

> **Nota para quem le o codigo:** a tabela do banco continua se chamando
> `cargo`, e no front os campos ainda sao `cargo`, `cargoNome`, `cargoCor`,
> `cargoPorChave`. Renomear a tabela derrubaria as chaves estrangeiras de meia
> duzia de outras (`etapa_card_cargo`, `etapa_check_cargo`, `obra_aviso_cargo`)
> e os trinta pontos do front que leem esses campos — sem mudar nada do que o
> sistema faz. Na TELA, tudo isso se chama Setor. O cargo especifico e o campo
> novo, `cargoTitulo`.

Setores sao cadastrados na tela **Usuarios** (botao *Setores*): nome, sigla,
**cor** e a marca de acesso total. A cor escolhida ali pinta as etiquetas
`[tec] [gq]` do card, os blocos das etapas e as tarjas dos cards de usuario —
nao ha cor de setor fixa no CSS.

Os cinco setores que as etapas usam (`fixo = true`) mudam de nome e de cor, mas
nao podem ser apagados. Setor em uso por algum usuario tambem nao.

### Avaliacoes

A nota e **da obra**, nao da pessoa. Uma obra pode ter **varias notas** — a do
diretor e a do cliente sao as de sempre, e o "+" acrescenta outras. A **media**
delas e a nota da obra (no banco, `obra_avaliacao` guarda essa media, mantida
por gatilho a partir de `obra_avaliacao_item`).

O card da lista e enxuto de proposito: nome da empresa, se a obra e padrao ou
emergencia, a nota, e os rostos de quem participou. A tarja da esquerda leva a
cor da **empresa** — a mesma do card dela na aba Clientes. O resto (descricao,
datas, cada nota separada) abre no clique. Obra avaliada precisa ficar com ao
menos uma nota: para zerar tudo existe o *Remover avaliacao*.

**A nota de cada usuario e a media das obras avaliadas em que ele entrou** — 8
numa obra e 5 em outra dao 6.5. Ela aparece na tela de Usuarios. No banco isso e
a view `usuario_media`; no front, o `mediaDoUsuario()` do `DadosContext`.

### Concluir a obra

Marcar o ultimo check **nao fecha mais a obra sozinho**. Ele so faz aparecer, a
**direita do Progresso**, o botao **Concluir obra** — e o botao so existe com a
barra em 100%, com todos os checks marcados e para quem pode editar obra.

Ele fica ao LADO da barra, e nao embaixo dela: embaixo, ao aparecer, empurrava
a faixa inteira de informacoes para baixo justamente no momento em que a pessoa
estava olhando para ela. Ao lado, a faixa nao muda de altura — o botao nasce no
espaco que ja existia a direita.

Sao dois passos depois disso: um formulario com a **observacao do
encerramento** (opcional) e uma segunda confirmacao, que e onde a obra fecha de
verdade. Dai ela sai do quadro e passa a viver em Concluidas.

Antes o fechamento era automatico: no instante em que o ultimo check era
marcado, a obra sumia do quadro sem ninguem decidir nada — e um check marcado
por engano a levava junto. Agora sao duas perguntas diferentes, e o codigo as
separa:

```js
obraConcluida(roteiro, checks) // "marcou tudo?"      -> o botao aparece
obraFechada(obra)              // "alguem concluiu?"  -> sai do quadro
```

Quem responde a segunda e a coluna `obra.concluida_em`, carimbada no clique. A
view `obra_conclusao` continua existindo e agora responde so a primeira.

### Concluidas

Obra concluida vai para **Concluidas**, agrupada por **ano** (no topo,
selecionavel) e por **mes** — cada mes ocupa a linha inteira e mostra quantas
fecharam, quantas eram emergencia e a nota media. Clicando no mes, ele abre e
lista as obras.

A data que agrupa e `obra.concluidaEm`: a hora em que alguem clicou em Concluir
obra. Cada linha mostra tambem **quem** concluiu.

**Excluir** uma obra concluida tem permissao propria — `excluir_concluidas` — e
nao sai de `editar_obras`. Nao e a mesma coisa: aqui nao se mexe em trabalho em
andamento, apaga-se o REGISTRO do que a empresa entregou, com a rastreabilidade,
o chat, as observacoes, as etiquetas, os anexos e as avaliacoes junto. Sem a
permissao o lixo nem aparece na linha, e a API recusa do mesmo jeito.

O lixo fica FORA do botao que abre a obra, e nao dentro: um botao dentro de
outro e onde o clique erra de alvo, e aqui errar significa apagar o registro de
uma obra entregue.

### Usuarios e setores

**Adicionar colaborador** abre curto: **e-mail, setor e cargo**. Basta o
e-mail e o setor — nome, nascimento e CPF a propria pessoa completa em
Configuracoes > Sua conta, que mostra o aviso "Complete o seu cadastro"
enquanto falta o CPF. Ate la o nome e o provisorio tirado do e-mail
("joao.silva@" vira "Joao Silva") e o card em Usuarios leva o selo
**Cadastro incompleto**. Passando o mouse pelo card aparecem os botoes de
editar e excluir.

"Preencher os dados da pessoa agora" abre o resto (foto, nome, nascimento,
CPF, telefone). Quem trabalha em campo e nao tem e-mail corporativo **entra
pelo CPF**, que o login ja aceita no mesmo campo: sem e-mail, nome e CPF
passam a ser obrigatorios. Preenchidos, os campos continuam sendo validados: o
que a validacao deve pegar e o dedo trocado, nao a ausencia.

Colaborador novo entra com a **senha padrao 123456** e com `senha_temporaria`
ligado. A coluna continua sendo gravada, mas **nenhuma tela cobra mais a
troca**: a faixa amarela que aparecia no alto de todas as paginas e o alerta que
ficava dentro de Configuracoes > Senha foram removidos. Trocar a senha continua
sendo em Configuracoes > Senha, por quem quiser.

Excluir **desativa** o acesso (`ativo = false`) em vez de apagar, para o
historico das obras nao perder quem marcou o que.

A lista filtra por **nome** (campo de busca, que tambem acha por e-mail) e por
**setor** — e da para marcar mais de um setor ao mesmo tempo.

O **proprio CPF** cada um preenche e corrige em Configuracoes. O CPF **dos
outros** so a diretoria muda, pela tela de Usuarios — e trava de setor, nao
permissao configuravel, e a rota `PATCH /api/equipe/usuarios/:id` recusa do
mesmo jeito. CPF ja preenchido nao volta a ficar vazio.

**Setores** abre a lista em uma linha so de etiquetas coloridas — ADM | GQ |
EXCELENCIA — que quebra quando chega no fim do pop-up. Clicar em uma delas ja
abre a edicao em OUTRO pop-up por cima, com **Excluir** ao lado de **Salvar**.

O "acesso total" de um setor aparece SO no formulario dele. Em nenhuma outra
tela — nem no card da pessoa, nem na lista de setores — se diz quem tem.

### Onde os dados moram

**Tudo no banco, gravado na hora.** Nao ha botao de "salvar geral" nem copia no
`localStorage`: cliente, obra, check marcado, observacao, aviso, avaliacao,
cargo, colaborador e foto de perfil vao para o PostgreSQL no momento da acao.

Quem faz isso e o `DadosContext` (`src/context/DadosContext.jsx`), o unico lugar
que fala com a API. Cada acao muda a tela primeiro (para nao travar esperando a
rede) e grava em seguida; se o servidor recusar, o estado volta a ser o do banco
e o motivo aparece numa faixa vermelha no topo da tela.

**Gravar e reler numa ida so.** Antes, cada acao (criar, editar, excluir,
marcar) era seguida de cinco leituras separadas — quadro, cargos, titulos,
usuarios e roteiro —, e a tela so fechava o pop-up depois da ultima. O quadro
trazia junto a logo e a capa de todos os clientes (~1 MB) a cada vez, e na
Vercel o pool tinha uma conexao so: as ~30 consultas da releitura iam para o
banco uma atras da outra. Agora (`server/carga.js`):

- **a carga** (`GET /api/carga`) traz quadro, equipe e roteiro numa chamada; a
  primeira de cada sessao vem com as imagens;
- **a carga junto**: enquanto o contexto grava (`comCarga`,
  `src/services/api.js`), a chamada sai com `X-Carga: leve` e a resposta ja
  volta com os dados relidos em `__carga` — inclusive a exclusao, que respondia
  204 e passa a responder 200 so com a carga. A tela recebe o mesmo corpo de
  antes;
- **a carga leve** nao repete imagem: cada cliente vem com a `imagemVersao`
  (md5 da logo e da capa) e cada pessoa com a `fotoVersao`. A tela reaproveita
  as que ja tem quando a versao bate, e busca so as que mudaram em
  `GET /api/carga/imagens?clientes=1,2&usuarios=3`;
- **quatro conexoes** por funcao na Vercel (`server/db.js`), em vez de uma, e a
  funcao roda em **Sao Paulo** (`"regions": ["gru1"]` no `vercel.json`), a mesma
  regiao do banco no Neon (sa-east-1).

O `localStorage` guarda so tres coisas, todas do navegador e nao do sistema: a
sessao (`customers.session`), o tema (`customers.theme`) e a resposta ao aviso
de cookies (`customers.cookies`).

**O roteiro das obras** (etapas, cards e checks) tambem e cadastro: mora nas
tabelas `etapa`, `etapa_card` e `etapa_check`, e a propria tela da obra cria e
apaga. Como o roteiro e unico, mexer nele vale para TODAS as obras — por isso so
cargo com acesso total edita. O que cada obra ja marcou fica em `obra_check`.

O cadastro de cliente usa duas APIs publicas, sem chave: **ViaCEP** (o CEP
preenche endereco, bairro, cidade e estado) e **IBGE** (listas de estados e de
cidades). Se qualquer uma falhar, os campos continuam editaveis na mao.

A tarja colorida do card do cliente sai da **cor predominante da logo**
(`src/utils/corDaImagem.js`): a imagem e reduzida num canvas e os pixels sao
agrupados em baldes de cor, descartando branco, preto e cinza — senao quase toda
logo devolveria "branco". Sem logo, entra a cor derivada do nome.

## Reembolso (a aba que se chamava Despesas)

A aba mudou de nome na tela (menu, titulo, busca); a rota (`/app/despesas`), a
API (`/api/despesas`) e as chaves das permissoes continuam as mesmas.

### O que mudou

- **Comprovante**: obrigatorio so no **Combustível** e em **Outros**. Vale
  Transporte e Transporte Intermunicipal aceitam o anexo, mas nao exigem.
- **Bônus apartamento**: R$ 35,00, o mesmo para todo cliente, travado no
  formulario.
- **Valores pré-definidos**: o botao da aba, para quem tem
  `definir_valores_reembolso`, abre a lista de todos os tipos. Marcado, o tipo
  tem o valor da casa (travado para quem envia); desmarcado, quem envia digita.
  A tabela fica em `configuracao` (`valores_reembolso`, JSON); sem ela valem os
  padroes de `VALORES_FIXOS` (almoco e janta R$ 41,50, bonus apartamento R$ 35).
  Rotas: `GET /api/despesas/valores` e `PUT /api/despesas/valores`.

As tabelas abaixo sao de antes dessas mudancas: valem com as tres excecoes acima.

Tres permissoes, conferidas **na API** a cada chamada de `/api/despesas`:

| Permissao               | O que libera                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `ver_despesas`          | a aba (menu, rota) e os **proprios** envios. Sem ela, 403 em toda rota de despesas |
| `alterar_despesas`      | enviar despesa, refeicao e bonus (`POST /envios`)              |
| `revisar_despesa_geral` | **Envios gerais**: os envios dos outros                         |

As duas de baixo dependem de `ver_despesas`. Quem so visualiza ve a tela com
**Meus envios** e sem os tres botoes de envio.

A tela abre com tres botoes — **Enviar despesa**, **Enviar refeição**,
**Enviar bônus** —, lado a lado no computador e um embaixo do outro no celular
(com a descricao), e **Meus envios** / **Envios gerais** embaixo. Os
formularios abrem em pop-up, por cima dela.

| Envio    | Campos                                                                 |
| -------- | ---------------------------------------------------------------------- |
| Despesa  | data, cliente, obra (opcional), tipo (Vale Transporte, Transporte Intermunicipal, Combustível, Outros — este com justificativa opcional), valor, **comprovante obrigatorio**, observacao |
| Refeição | data, cliente, obra (opcional), tipo (Almoço, Janta), valor **fixo** (R$ 41,50), observacao |
| Bônus    | data, tipo (Bônus viagem, Bônus apartamento), cliente, obra (opcional), valor, observacao |

**Os tipos e os valores fixos moram num arquivo so**, `src/domain/despesas.js`,
importado pela tela e pela API — o mesmo esquema de `permissoes.js`. Mudar o
valor da refeicao e mudar `VALORES_FIXOS` ali; a tela passa a mostrar o numero
novo no campo travado e o servidor passa a gravar ele. O servidor **ignora** o
valor que vier no pedido para tipo com valor fixo, entao o campo travado e regra,
nao sugestao. Os bonus ainda nao tem valor definido e sao digitados; no dia em
que tiverem, basta acrescentar `bonus_viagem: ...` ao mesmo objeto. Cada envio
guarda o valor do dia em que foi feito — mudar o numero nao reescreve o passado.

O **valor** e digitado so com numeros, que entram pela direita (4-1-5-0 vira
R$ 41,50); letra nao entra. O **comprovante** aceita imagem, PDF, ZIP/RAR/7Z e
documentos (Word, Excel, TXT, CSV, XML), ate **3 MB** — e nao 4 como os anexos
da obra: em base64 o arquivo cresce um terco, e acima de 3 MB o pedido passaria
do limite de 4,5 MB por chamada da Vercel. Foto maior que 1,5 MB e reduzida no
navegador antes de sair (2000 px de lado), o que deixa o recibo legivel com
algumas centenas de KB.

O **cliente e obrigatorio** e a **obra e opcional** ("Nenhuma" e a primeira
opcao, e a que vem escolhida). Primeiro o cliente, depois, se for o caso, uma
das obras dele — em andamento primeiro, concluidas marcadas. A API confere que
a obra escolhida e mesmo daquele cliente. Sem obra, o envio aparece com o
cliente e "sem obra".

### Meus envios

- **Mensal**: os envios do mes agrupados por dia, com o total de cada dia, o
  total por categoria e o **total do mes** no fim;
- **Anual**: os doze meses com o total de cada um (clicar abre o mes) e o
  **total anual** no fim.

Todos os totais sao somados **no banco** (`SUM` sobre `NUMERIC`); a tela so
escreve o que recebe. O mes e o ano ficam no endereco
(`?visao=ano&ano=2026`), entao o "voltar" do navegador funciona.

Os dois tem o filtro de tipo **Todos / Despesa / Refeição / Bônus**, que se soma
ao periodo — quem filtra e o banco.

### Envios gerais

Quem tem `revisar_despesa_geral` ganha o botao **Envios gerais** ao lado de Meus
envios. A lista traz so quem ja enviou alguma coisa (foto, nome, setor, cargo,
e-mail, total), mais um cartao "Todos os usuarios". Clicar numa pessoa abre os
envios dela com os mesmos filtros de Meus envios.

A trava e **na API**, a cada chamada: sem a permissao, `/pessoas`,
`?usuarios=todos` ou o id de outra pessoa voltam **403**, e o comprovante de
outra pessoa volta **404** (como se nao existisse). Esconder o botao da tela e
so conforto — quem chama a API na mao da de cara na mesma recusa.

## Historico

Na pagina inicial, abaixo da grade: o que a **propria** pessoa fez no sistema,
do mais recente para o mais antigo, agrupado por dia. Cada linha e gravada pela
API no momento da acao, por uma funcao so (`registrarAtividade`, em
`server/atividade.js`), com a foto do que era na hora (nome do cliente, n° da
obra, valor).

- **Filtro**: Todos / Checks / Envios de despesas (`?tipo=checks|despesas`),
  aplicado no SELECT;
- **So os ultimos 7 dias**, contados pelo carimbo exato de cada linha
  (`criado_em >= now() - 7 dias`), tambem no SELECT. O que passou disso some do
  historico, mas **nada e apagado**: a linha continua na tabela `atividade`, e
  a despesa, o check ou a obra de que ela fala nao sao tocados;
- **So as suas**: o usuario sai do token; nao ha parametro para pedir o de
  outra pessoa.

## Temas

Fundo **preto e branco**, com **azul escuro** nas acoes (botoes, foco, checkbox,
selecao de texto) via `--accent`. O site abre no **modo claro** (fundo branco).

A troca de tema fica em **Configuracoes > Aparencia**, e so la — o header nao tem
mais esse botao. A escolha vale para o sistema inteiro e fica guardada em
`localStorage` (`customers.theme`).

O site inteiro usa **liquid glass**: superficie translucida, desfoque do que
passa atras, luz na borda de cima e um reflexo diagonal por cima. Botao colorido
mantem a cor e recebe o vidro em cima dela. A unica excecao e o **pop-up**, que e
opaco de proposito — formulario tem que ser facil de ler. Os tokens estao em
`tokens.css` (`--vidro-*`) e as classes prontas em `comum.css` (`.vidro`,
`.vidro-cor`).

As cores vivem todas em `src/styles/tokens.css`: o bloco `:root` e o tema claro
e `:root[data-theme='dark']` redefine os mesmos tokens. Componente novo deve usar
os tokens semanticos (`--text-strong`, `--line`, `--control-bg`, `--btn-*`,
`--glass-*`, `--photo-*`) em vez de cores fixas — assim ele ja nasce funcionando
nos dois temas.

O botao primario e **azul solido** nos dois temas (`--btn-bg` / `--btn-fg`) — sem
vidro, sem desfoque e sem brilho. Ele conclui uma acao (Entrar, Adicionar
colaborador, Salvar), entao precisa ser o elemento mais firme da tela. No escuro
clareia um pouco para se ler sobre o preto.

### Vidro, fundo e pop-ups

Sao tres camadas, e a regra e simples:

1. **Fundo** — uma malha azul em `radial-gradient` no `body`
   (`--mesh-a/b/c/topo`), bem fraca de proposito: e o que passa por tras do
   vidro. Se ela pesar, o efeito de bolha some. Fica `background-attachment:
   fixed`, entao rola o conteudo e nao o fundo.
2. **Superficies do site** — barra lateral, barra superior, painel de filtros e
   cards usam `--glass-*` com `backdrop-filter`: translucidas o bastante para
   deixar a malha aparecer, fechadas o bastante para o texto se ler.
3. **Pop-ups** — a unica excecao. `Modal` e o menu do avatar usam `--modal-bg`,
   `--modal-borda` e `--modal-sombra`: **opacos, sem desfoque e sem brilho**.
   Formulario tem que ser facil de ler, nao bonito de atravessar.

Componente novo dentro de um pop-up deve usar `--modal-*` ou `--surface`, nunca
`--glass-*` — senao volta a transparencia justamente onde ela atrapalha.

A logo troca junto com o tema: `LogoLWN.png` no claro e `LogoLWNWhite.png` no
escuro, escolhidas pelo `useTheme()` no `Login.jsx`. O logo do Outlook em
`src/assets/outlook.png` segue o mesmo caminho. As duas ficam em
**`src/assets/`** e sao importadas pelo bundler (`import logo from
'@/assets/LogoLWN.png'`) — assim o caminho e resolvido no build, com hash, e um
arquivo faltando vira erro de build em vez de imagem quebrada. Para trocar a
logo, substitua o arquivo em `src/assets/`.

A foto recebe `--photo-tint`: um veu branco no tema claro (para o titulo escuro
se ler por cima) e preto no escuro.

## Layout

**Desktop** — a foto ocupa a esquerda e se dissolve num gradiente ate
transparente por baixo do cartao (`mask-image` em `.hero__slices`). Nao ha
painel nem borda arredondada: o unico bloco com raio e o cartao de login.

**Mobile** (ate 768px) — a foto vira o bloco de cima e o formulario sobe 28px
por baixo dela, com as quinas superiores arredondadas. O titulo "Login" muda de
lugar de verdade (nao ha markup duplicado): `useMediaQuery` decide se o bloco
`.head` e renderizado dentro da foto ou dentro do cartao. "Esqueci minha senha"
desce para baixo do botao via `order` no grid do formulario.

## Cookies

O aviso aparece no primeiro acesso (`src/components/CookieConsent/`) com duas
opcoes: **Apenas essenciais** e **Aceitar todos**. A escolha e gravada em
`localStorage` sob `customers.cookies` junto com a data.

Antes de disparar qualquer analytics, consulte o consentimento:

```js
import { hasAnalyticsConsent } from '@/components/CookieConsent/CookieConsent'

if (hasAnalyticsConsent()) {
  // carregar o script de analise
}
```

Hoje nenhum cookie de analise e realmente instalado — o componente registra a
escolha e expoe o helper; falta plugar a ferramenta de analytics quando ela for
definida. `clearCookieConsent()` apaga a escolha e faz o aviso reaparecer.


## Troca de tema

Ao clicar no botao lua/sol, o `ThemeContext` poe a classe `theme-switching` no
`<html>` por 500ms. Enquanto ela existe, uma regra em `global.css` faz todas as
cores (fundo, texto, borda, sombra, preenchimento) deslizarem de um tema para o
outro; depois a classe sai, para nao atropelar as transicoes proprias de hover e
foco de cada componente. Com `prefers-reduced-motion` a classe nem entra.

Superficies que precisam acompanhar essa transicao usam **cor solida** em vez de
gradiente (`--btn-bg`, `--photo-veil`), porque `background-image` nao e
animavel em CSS. O brilho por cima continua sendo gradiente.
