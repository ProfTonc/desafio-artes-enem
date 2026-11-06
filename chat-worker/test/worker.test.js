// Testa o servidor do chat com a IA simulada (não gasta nada).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const pedidosIA = [];
let proxima = "Olá! Sou o assistente virtual (uma IA) do Professor Ton.";

const falso = http.createServer(async (req, res) => {
  if (req.url.startsWith("/info")) {
    res.writeHead(200).end("Ensaios: quarta das 12h às 13h.");
    return;
  }
  let corpo = "";
  for await (const p of req) corpo += p;
  pedidosIA.push(JSON.parse(corpo));
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
    id: "m", type: "message", role: "assistant", model: "claude-opus-5-5",
    content: [{ type: "text", text: proxima }], stop_reason: "end_turn", stop_details: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }));
});

let worker, env;
before(async () => {
  await new Promise((r) => falso.listen(0, r));
  const base = `http://127.0.0.1:${falso.address().port}`;
  env = { ANTHROPIC_API_KEY: "teste", ANTHROPIC_BASE_URL: base, INFO_URL: `${base}/info`,
    ALLOWED_ORIGIN: "https://proftonc.github.io", LIMITE_POR_HORA: "3" };
  worker = (await import("../src/worker.js")).default;
});
after(() => falso.close());

const pedir = (corpo, origem = "https://proftonc.github.io", ip = "1.1.1.1") =>
  worker.fetch(new Request("https://chat.test/", { method: "POST",
    headers: { Origin: origem, "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(corpo) }), env);

test("responde e usa as informações do professor", async () => {
  const r = await pedir({ mensagens: [{ role: "user", content: "Quando é o ensaio?" }] });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://proftonc.github.io");
  const dados = await r.json();
  assert.equal(dados.resposta, proxima);
  assert.equal(dados.chamarProfessor, false);
  assert.match(pedidosIA.at(-1).system, /quarta das 12h/);
  assert.equal(pedidosIA.at(-1).model, "claude-opus-5-5");
});

test("avisa quando é para chamar o professor", async () => {
  proxima = "Melhor falar com o professor. [[CHAMAR_PROFESSOR]]";
  const r = await pedir({ mensagens: [
    { role: "user", content: "oi" }, { role: "assistant", content: "Olá!" },
    { role: "user", content: "quero falar com o professor" }] }, undefined, "2.2.2.2");
  const dados = await r.json();
  assert.equal(dados.resposta, "Melhor falar com o professor.");
  assert.equal(dados.chamarProfessor, true);
});

test("recusa outros sites, conversa inválida e excesso de mensagens", async () => {
  assert.equal((await pedir({ mensagens: [{ role: "user", content: "oi" }] }, "https://site-estranho.com", "3.3.3.3")).status, 403);
  assert.equal((await pedir({ mensagens: [{ role: "assistant", content: "oi" }] }, undefined, "4.4.4.4")).status, 400);
  assert.equal((await pedir({ mensagens: [{ role: "user", content: "x".repeat(2000) }] }, undefined, "4.4.4.5")).status, 400);
  const status = [];
  for (let i = 0; i < 4; i++) status.push((await pedir({ mensagens: [{ role: "user", content: "oi" }] }, undefined, "5.5.5.5")).status);
  assert.deepEqual(status, [200, 200, 200, 429]);
});
