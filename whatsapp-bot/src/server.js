// Servidor que recebe as mensagens do WhatsApp e responde com a IA.
import http from "node:http";
import { fileURLToPath } from "node:url";
import { responder, MARCA_CHAMAR_PROFESSOR } from "./ia.js";
import * as memoria from "./memoria.js";
import { enviarTexto, marcarComoLida, assinaturaValida, extrairMensagens, chaveNumero } from "./whatsapp.js";

const PROFESSOR = (process.env.PROFESSOR_TELEFONE || "").replace(/\D/g, "");
// Formato do número do professor que a Meta usa (aprendido quando ele manda mensagem).
let professorWaId = PROFESSOR;
const ehProfessor = (numero) => PROFESSOR && chaveNumero(numero) === chaveNumero(PROFESSOR);

async function avisarProfessor(texto) {
  if (!PROFESSOR) return;
  try {
    await enviarTexto(professorWaId, texto);
  } catch (erro) {
    // A Meta só deixa mandar mensagem livre para quem falou com o número
    // nas últimas 24h. Veja a dica no README.
    console.warn("Não consegui avisar o professor:", erro.message);
  }
}

// Comandos que o professor manda do número dele para o robô.
async function comandoDoProfessor(texto) {
  const [comando, alvo] = texto.trim().split(/\s+/);
  const numero = (alvo || "").replace(/\D/g, "");
  switch (comando.toLowerCase()) {
    case "#voltar":
      if (!numero) return "Use: #voltar 5511999998888";
      memoria.retomar(numero);
      return `✅ Robô ligado de novo para ${numero}.`;
    case "#pausar":
      if (!numero) return "Use: #pausar 5511999998888";
      memoria.pausar(numero);
      return `⏸️ Robô pausado para ${numero}. Pode falar direto com o aluno.`;
    case "#pausados": {
      const lista = memoria.listarPausados();
      return lista.length ? `Pausados:\n${lista.join("\n")}` : "Nenhum aluno pausado.";
    }
    default:
      return "Comandos: #pausados, #pausar <número>, #voltar <número>";
  }
}

async function processar(msg) {
  await marcarComoLida(msg.id);

  if (ehProfessor(msg.de)) professorWaId = msg.de;

  if (ehProfessor(msg.de) && msg.texto.startsWith("#")) {
    await enviarTexto(msg.de, await comandoDoProfessor(msg.texto));
    return;
  }

  if (memoria.estaPausado(msg.de)) return; // o professor está cuidando

  if (!msg.texto) {
    await enviarTexto(msg.de, "Por enquanto eu só consigo ler mensagens de texto. Pode escrever sua dúvida? 🙂");
    return;
  }

  if (memoria.passouDoLimite(msg.de)) {
    await enviarTexto(msg.de, "Você mandou muitas mensagens em pouco tempo. Vamos dar uma pausa e continuamos daqui a pouco? 🙂");
    return;
  }

  memoria.adicionar(msg.de, "user", msg.texto);

  let resposta;
  try {
    resposta = await responder(memoria.historico(msg.de));
  } catch (erro) {
    console.error("Erro na IA:", erro);
    memoria.historico(msg.de).pop();
    await enviarTexto(msg.de, "Tive um probleminha agora. Pode mandar de novo daqui a pouco? 🙏");
    return;
  }

  const chamarProfessor = resposta.includes(MARCA_CHAMAR_PROFESSOR);
  resposta = resposta.replaceAll(MARCA_CHAMAR_PROFESSOR, "").trim();

  memoria.adicionar(msg.de, "assistant", resposta);
  await enviarTexto(msg.de, resposta);

  if (chamarProfessor) {
    memoria.pausar(msg.de);
    const quem = msg.nome ? `${msg.nome} (${msg.de})` : msg.de;
    await avisarProfessor(
      `🔔 *${quem}* quer falar com você.\n\nÚltima mensagem: "${msg.texto}"\n\nFalar com o aluno: https://wa.me/${msg.de}\n\nO robô ficou pausado para esse aluno. Para religar: #voltar ${msg.de}`
    );
  }
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on("data", (p) => partes.push(p));
    req.on("end", () => resolve(Buffer.concat(partes)));
    req.on("error", reject);
  });
}

export function criarServidor() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    // A Meta chama aqui uma vez para confirmar que o webhook é seu.
    if (req.method === "GET" && url.pathname === "/webhook") {
      const ok =
        url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN;
      res.writeHead(ok ? 200 : 403).end(ok ? url.searchParams.get("hub.challenge") : "senha errada");
      return;
    }

    // Mensagens novas chegam aqui.
    if (req.method === "POST" && url.pathname === "/webhook") {
      const corpo = await lerCorpo(req);
      if (!assinaturaValida(corpo, req.headers["x-hub-signature-256"])) {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(200).end(); // responde logo, senão a Meta reenvia

      let aviso;
      try {
        aviso = JSON.parse(corpo.toString("utf8"));
      } catch {
        return;
      }
      for (const msg of extrairMensagens(aviso)) {
        if (memoria.jaProcessada(msg.id)) continue;
        memoria.naFila(msg.de, () => processar(msg));
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("Robô do professor no ar ✅");
      return;
    }

    res.writeHead(404).end();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const faltando = ["ANTHROPIC_API_KEY", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"].filter(
    (v) => !process.env[v]
  );
  if (faltando.length) console.warn("⚠️ Faltam configurar:", faltando.join(", "));
  if (!process.env.META_APP_SECRET) console.warn("⚠️ META_APP_SECRET vazio: não dá para conferir se as mensagens vêm da Meta.");

  const porta = Number(process.env.PORT || 3000);
  criarServidor().listen(porta, () => console.log(`Robô rodando na porta ${porta}`));
}
