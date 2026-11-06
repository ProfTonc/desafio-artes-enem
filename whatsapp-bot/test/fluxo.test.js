// Teste do fluxo completo, com a IA e o WhatsApp simulados (não gasta nada).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";

const enviados = [];
const pedidosIA = [];
let proximaResposta = "Olá! Sou o assistente virtual (uma IA) do professor.";

const falsaIA = http.createServer(async (req, res) => {
  let corpo = "";
  for await (const p of req) corpo += p;
  pedidosIA.push(JSON.parse(corpo));
  res.writeHead(200, { "Content-Type": "application/json" }).end(
    JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5",
      content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: proximaResposta }],
      stop_reason: "end_turn", stop_details: null,
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
    })
  );
});

let servidor, base;
const fetchOriginal = globalThis.fetch;

before(async () => {
  await new Promise((r) => falsaIA.listen(0, r));
  Object.assign(process.env, {
    ANTHROPIC_API_KEY: "teste",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${falsaIA.address().port}`,
    WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123",
    WHATSAPP_VERIFY_TOKEN: "senha", META_APP_SECRET: "segredo",
    PROFESSOR_TELEFONE: "5511900000000",
  });
  globalThis.fetch = async (url, opcoes) => {
    if (String(url).startsWith("https://graph.facebook.com/")) {
      enviados.push(JSON.parse(opcoes.body));
      return new Response("{}", { status: 200 });
    }
    return fetchOriginal(url, opcoes);
  };
  const { criarServidor } = await import("../src/server.js");
  servidor = criarServidor();
  await new Promise((r) => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => { servidor.close(); falsaIA.close(); globalThis.fetch = fetchOriginal; });

function aviso(de, texto, id) {
  return JSON.stringify({ entry: [{ changes: [{ value: {
    contacts: [{ wa_id: de, profile: { name: "Ana" } }],
    messages: [{ id, from: de, type: "text", text: { body: texto } }],
  } }] }] });
}
async function postar(corpo, assinar = true) {
  const sig = "sha256=" + crypto.createHmac("sha256", "segredo").update(corpo).digest("hex");
  return fetchOriginal(base + "/webhook", { method: "POST", body: corpo,
    headers: assinar ? { "x-hub-signature-256": sig } : {} });
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const textosPara = (n) => enviados.filter((e) => e.to === n && e.type === "text").map((e) => e.text.body);

test("confirma o webhook só com a senha certa", async () => {
  const ok = await fetchOriginal(`${base}/webhook?hub.mode=subscribe&hub.verify_token=senha&hub.challenge=42`);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "42");
  const ruim = await fetchOriginal(`${base}/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=42`);
  assert.equal(ruim.status, 403);
});

test("recusa mensagem sem assinatura da Meta", async () => {
  const r = await postar(aviso("5511911111111", "oi", "a0"), false);
  assert.equal(r.status, 401);
});

test("responde o aluno e lembra da conversa", async () => {
  await postar(aviso("5511911111111", "Oi, qual o horário?", "a1"));
  await postar(aviso("5511911111111", "Oi, qual o horário?", "a1")); // repetida pela Meta
  await esperar(300);
  assert.deepEqual(textosPara("5511911111111"), [proximaResposta]);

  proximaResposta = "O Barroco brasileiro teve Aleijadinho como destaque.";
  await postar(aviso("5511911111111", "E o Barroco?", "a2"));
  await esperar(300);
  const ultimo = pedidosIA.at(-1);
  assert.equal(ultimo.model, "claude-opus-5-5");
  assert.equal(ultimo.messages.length, 3);
  assert.equal(ultimo.messages[1].role, "assistant");
  assert.equal(typeof ultimo.messages[1].content, "string"); // só texto, sem "pensamentos"
  assert.match(ultimo.system, /Barroco|ENEM/);
});

test("chama o professor, pausa o robô e religa com #voltar", async () => {
  proximaResposta = "Claro! Vou chamar o professor. [[CHAMAR_PROFESSOR]]";
  await postar(aviso("5511922222222", "quero falar com o professor", "b1"));
  await esperar(300);
  assert.deepEqual(textosPara("5511922222222"), ["Claro! Vou chamar o professor."]);
  assert.match(textosPara("5511900000000")[0], /Ana.*wa\.me\/5511922222222/s);

  const antes = pedidosIA.length;
  await postar(aviso("5511922222222", "alô?", "b2"));
  await esperar(300);
  assert.equal(pedidosIA.length, antes, "robô pausado não deve chamar a IA");

  // A Meta manda o número do professor sem o 9 e ele digita o do aluno com o 9.
  await postar(aviso("551100000000", "#voltar 5511922222222", "p1"));
  await esperar(300);
  assert.match(textosPara("551100000000").at(-1), /ligado de novo/);

  proximaResposta = "Voltei!";
  await postar(aviso("551122222222", "oi de novo", "b3")); // mesmo aluno, sem o 9
  await esperar(300);
  assert.equal(textosPara("551122222222").at(-1), "Voltei!");
});
