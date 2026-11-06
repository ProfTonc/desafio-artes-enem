# 💬 Chat online do Professor Ton

Um chat com IA numa página do GitHub Pages. Você coloca o link na mensagem automática do WhatsApp Business, e o aluno toca no link para conversar com o assistente.

- **Página do chat:** `chat/` → https://proftonc.github.io/desafio-artes-enem/chat/
- **Servidor (esta pasta):** roda grátis na Cloudflare e guarda a chave da IA em segredo.
- **Informações do professor:** o chat lê o mesmo arquivo do robô, `whatsapp-bot/config/professor.md`. Edite só ele.

### Por que precisa da Cloudflare?
O GitHub Pages só mostra páginas e não consegue esconder segredos. Se a chave da IA ficasse na página, qualquer pessoa poderia copiá-la e gastar seus créditos. A Cloudflare faz a ponte: a página fala com ela, e ela fala com a IA usando a chave escondida.

```
Aluno no WhatsApp → toca no link → página (GitHub Pages) → Cloudflare (chave secreta) → IA
```

---

## Passo 1: publicar o servidor na Cloudflare (10 min)

> Antes, o Pull Request com esta pasta precisa estar aprovado (merge) no `main`.

1. Crie uma conta grátis em **dash.cloudflare.com**. Não precisa de cartão.
2. No menu, abra **Compute (Workers) → Workers & Pages → Create**.
3. Escolha **Import a repository** e conecte o GitHub. Autorize o repositório **desafio-artes-enem**.
4. Configure:
   - **Project name:** `chat-professor-ton`
   - **Root directory** (em "Advanced settings"): `chat-worker`
   - O resto pode ficar como está.
5. Toque em **Deploy** e espere 1 a 2 minutos.
6. Abra **Settings → Variables and Secrets → Add**:
   - **Type:** Secret
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** a sua chave da IA
   - Toque em **Deploy** (ou "Save").
7. Copie o endereço do servidor, que fica em **Settings → Domains & Routes** e se parece com `https://chat-professor-ton.SEU-NOME.workers.dev`. Ao abrir esse endereço, deve aparecer `"Chat do Professor Ton no ar ✅"`.

## Passo 2: ligar a página ao servidor (2 min)

1. No GitHub, abra o arquivo `chat/config.js` e toque no lápis ✏️.
2. Cole o endereço do Passo 1 entre as aspas:
   ```js
   window.CHAT_API_URL = "https://chat-professor-ton.SEU-NOME.workers.dev";
   ```
3. Se quiser o botão "Abrir WhatsApp do professor", coloque também o número que os alunos usam para falar com você (só dígitos, com 55 e DDD):
   ```js
   window.WHATSAPP_PROFESSOR = "5565999998888";
   ```
4. Toque em **Commit changes**. Em 1 a 2 minutos o chat funciona em
   **https://proftonc.github.io/desafio-artes-enem/chat/**

## Passo 3: colocar o link no WhatsApp Business (5 min)

No app WhatsApp Business: **Ferramentas comerciais (ou Configurações → Ferramentas comerciais)**.

**Mensagem de saudação** (para quem fala com você pela primeira vez ou depois de 14 dias):
```
Olá! 👋 Aqui é o Professor Ton (Arte e Música – E.E. PM Tiradentes).

Para dúvidas rápidas sobre a Banda do Educarte, o TiraCast, as aulas de música ou para estudar Arte para o ENEM, fale com o meu assistente virtual, que responde na hora:
👉 https://proftonc.github.io/desafio-artes-enem/chat/

Se for algo que só eu resolvo, pode escrever aqui que eu respondo assim que puder. 🎺
```

**Mensagem de ausência** (fora do seu horário):
```
Oi! No momento não consigo responder. 🎶
Enquanto isso, meu assistente virtual pode te ajudar:
👉 https://proftonc.github.io/desafio-artes-enem/chat/
Eu respondo aqui assim que possível.
```

**Resposta rápida** (para enviar o link digitando `/chat`):
- Atalho: `chat`
- Mensagem: `Tire suas dúvidas com meu assistente virtual: https://proftonc.github.io/desafio-artes-enem/chat/`

---

## Custos e segurança

- **Cloudflare e GitHub Pages:** grátis.
- **IA:** você só paga pelo uso, com os créditos da platform.claude.com. Deixe a **recarga automática desligada** e o gasto nunca passa do valor que você colocou.
- Para gastar menos, troque em `chat-worker/wrangler.toml` a linha `CLAUDE_MODEL = "claude-opus-5-5"` por `CLAUDE_MODEL = "claude-haiku-5-5"`. Fica bem mais barato, com respostas um pouco mais simples.
- Proteções: só a página do GitHub Pages pode usar o servidor, cada pessoa pode mandar até 30 mensagens por hora (`LIMITE_POR_HORA`) e cada mensagem tem no máximo 1500 letras.
- O chat avisa que é uma IA e pede para não escrever dados pessoais.
- A conversa fica só no navegador do aluno e some quando ele fecha a aba. O chat não guarda nada.

## Para quem programa

```bash
cd chat-worker
npm install
npm test          # testes com a IA simulada
npx wrangler dev  # roda o servidor no computador (precisa do arquivo .dev.vars com ANTHROPIC_API_KEY=...)
```
