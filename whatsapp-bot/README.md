# 🤖 Robô do Professor no WhatsApp

Um assistente com IA que responde seus alunos no WhatsApp 24 horas por dia:

- **Tira dúvidas de Artes para o ENEM**: explica conteúdos, obras e questões.
- **Informa sobre as aulas**: horários, valores e inscrição, usando só o que você escrever.
- **Chama você quando precisa**: se o aluno pedir para falar com o professor, o robô para de responder esse aluno e te manda um aviso com o link da conversa.
- Lembra do que o aluno já falou (até 24h) e avisa que é uma IA.

---

## Passo 1: suas informações (5 min)

Abra o arquivo [`config/professor.md`](config/professor.md) e troque o que está entre `[colchetes]` pelos seus dados. Dá para editar pelo próprio site do GitHub (ícone de lápis ✏️).

## Passo 2: chave da IA (5 min)

1. Entre em **console.anthropic.com** e crie uma conta.
2. Em **Billing**, coloque um cartão e adicione créditos (US$ 5 já dá para começar).
3. Em **API Keys**, clique em **Create Key** e copie a chave (começa com `sk-ant-`). Guarde-a, porque você vai usá-la no Passo 4.

## Passo 3: WhatsApp oficial da Meta (30 min)

1. Entre em **developers.facebook.com** e clique em **Meus apps → Criar app**.
2. Escolha o tipo **Empresa (Business)** e depois adicione o produto **WhatsApp**.
3. Na tela **WhatsApp → Configuração da API (API Setup)**:
   - Copie o **Phone number ID** (identificação do número).
   - Adicione o **número de telefone** que o robô vai usar. Use um chip que **não** esteja instalado no app do WhatsApp, ou siga a opção de conectar seu número do WhatsApp Business, se a Meta oferecer.
4. Crie um **token permanente**: em **business.facebook.com → Configurações → Usuários do sistema**, crie um usuário de sistema, dê acesso ao app com a permissão `whatsapp_business_messaging` e gere o token. O token temporário da tela de teste vence em 24h.
5. Em **Configurações do app → Básico**, copie a **Chave secreta do app (App secret)**.

## Passo 4: colocar no ar no Render (10 min)

1. Crie uma conta em **render.com** entrando com seu GitHub.
2. Clique em **New → Blueprint** e escolha o repositório `desafio-artes-enem`.
3. O Render vai pedir estes valores:

| Nome | O que colocar |
|---|---|
| `ANTHROPIC_API_KEY` | chave do Passo 2 |
| `WHATSAPP_TOKEN` | token permanente do Passo 3 |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID do Passo 3 |
| `WHATSAPP_VERIFY_TOKEN` | uma senha que você inventa (ex: `artes2026`) |
| `META_APP_SECRET` | App secret do Passo 3 |
| `PROFESSOR_TELEFONE` | seu número pessoal, só números (ex: `5511999998888`) |

4. Clique em **Apply**. Quando terminar, abra o endereço que o Render mostra (algo como `https://robo-whatsapp-professor.onrender.com`). Deve aparecer **"Robô do professor no ar ✅"**.

## Passo 5: ligar o WhatsApp ao robô (5 min)

1. No app da Meta, vá em **WhatsApp → Configuração → Webhook → Editar**.
2. Em **URL de callback**, coloque o endereço do Render seguido de `/webhook`, por exemplo `https://robo-whatsapp-professor.onrender.com/webhook`.
3. Em **Token de verificação**, coloque a mesma senha do `WHATSAPP_VERIFY_TOKEN`.
4. Clique em **Verificar e salvar** e depois **assine (subscribe)** o campo **messages**.
5. Mande um "oi" para o número do robô. Pronto! 🎉

---

## Comandos do professor

Mande estas mensagens **do seu número pessoal** para o número do robô:

| Comando | O que faz |
|---|---|
| `#pausados` | lista os alunos com o robô pausado |
| `#pausar 5511999998888` | pausa o robô para um aluno (para você falar direto) |
| `#voltar 5511999998888` | religa o robô para o aluno |

O robô também religa sozinho depois de 12 horas (`PAUSA_HORAS`).

> **Dica:** a Meta só deixa o robô te mandar avisos se você tiver falado com ele nas últimas 24h. Mande um `#pausados` para o robô de vez em quando (por exemplo, todo dia de manhã) para continuar recebendo os avisos.

## Custos (aproximados)

- **Meta:** responder alunos que mandaram mensagem primeiro costuma ser gratuito. Confira a tabela atual em developers.facebook.com.
- **IA:** o modelo padrão (`claude-opus-5-5`) custa poucos centavos por resposta. Para gastar menos, troque `CLAUDE_MODEL` no Render para `claude-haiku-5-5`, que é bem mais barato e mais simples. Acompanhe o gasto em console.anthropic.com.
- **Render:** o plano grátis funciona, mas "dorme" após 15 minutos sem uso, e a primeira mensagem depois disso pode demorar até 1 minuto. O plano pago mais barato mantém o robô sempre acordado.
- Proteção: cada número pode mandar no máximo 30 mensagens por hora (`LIMITE_POR_HORA`).

## Cuidados

- Muitos alunos são menores de idade. O robô avisa que é uma IA e não pede dados pessoais. Vale avisar os alunos e responsáveis que o atendimento usa IA (LGPD).
- A IA pode errar. Revise de vez em quando o que ela responde e ajuste o `config/professor.md`.
- Nunca coloque chaves e tokens dentro dos arquivos do GitHub. Use só a tela do Render.

## Para quem programa

```bash
cd whatsapp-bot
npm install
npm test     # testa tudo com IA e WhatsApp simulados
npm start    # precisa das variáveis do .env.example
```

- `src/server.js`: recebe as mensagens (webhook) e decide o que fazer.
- `src/ia.js`: instruções do assistente e chamada à IA.
- `src/memoria.js`: histórico, pausas e limites (fica na memória e zera se o servidor reiniciar).
- `src/whatsapp.js`: envio de mensagens e conferência da assinatura da Meta.

Ideias futuras: entender áudios, guardar histórico num banco de dados, enviar o quiz como botão.
