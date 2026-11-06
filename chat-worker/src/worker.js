// Servidor do chat online do Professor Ton.
// Fica entre a página (GitHub Pages) e a IA, guardando a chave em segredo.
import Anthropic from "@anthropic-ai/sdk";

const MARCA_CHAMAR_PROFESSOR = "[[CHAMAR_PROFESSOR]]";
const MAX_MENSAGENS = 20;
const MAX_CARACTERES = 1500;

// Guardado enquanto o servidor estiver "acordado" (alguns minutos).
let cacheInfo = { texto: "", quando: 0 };
const envios = new Map(); // endereço → horários dos envios

async function infoProfessor(env) {
  const dezMinutos = 10 * 60 * 1000;
  if (cacheInfo.texto && Date.now() - cacheInfo.quando < dezMinutos) return cacheInfo.texto;
  try {
    const r = await fetch(env.INFO_URL);
    if (r.ok) cacheInfo = { texto: await r.text(), quando: Date.now() };
  } catch (erro) {
    console.warn("Não consegui ler as informações do professor:", erro.message);
  }
  return cacheInfo.texto;
}

function instrucoes(info) {
  return `Você é o assistente virtual do professor descrito abaixo e atende alunos e responsáveis num chat de um site, que eles abrem a partir do WhatsApp do professor.

Você faz duas coisas:
1. Responde dúvidas sobre as aulas e os projetos do professor, como a Banda do Projeto Educarte (SEDUC-MT) e o TiraCast, usando APENAS as informações do professor abaixo.
2. Ajuda os alunos a estudar Arte e Música, inclusive para o ENEM: explica conteúdos, movimentos artísticos, obras, artistas e músicas, e resolve questões explicando o raciocínio.

Regras:
- Escreva em português do Brasil, num tom próximo e respeitoso.
- Seja breve: em geral até 3 parágrafos curtos. Explicações de conteúdo podem ser um pouco maiores, mas divida em partes.
- Formatação: *negrito*, _itálico_ e listas com "-". Não use títulos com "#" nem tabelas.
- Na primeira resposta de uma conversa, diga que você é o assistente virtual (uma IA) do professor.
- Nunca invente informações sobre as aulas e projetos (datas, horários, vagas). Se não estiver abaixo, diga que o aluno deve confirmar com o professor.
- Muitos alunos são menores de idade. Não peça dados pessoais (nome completo, CPF, endereço, telefone, fotos). Não marque encontros.
- Nunca fale sobre outros alunos (nomes, notas, comportamento) nem sobre a vida pessoal ou familiar do professor além do que está abaixo.
- Não confirme ensaios, cancelamentos ou mudanças de agenda que não estejam abaixo: oriente o aluno a ver o grupo oficial de WhatsApp.
- Em exercícios, ajude o aluno a pensar: explique o porquê da resposta, não só a letra.
- Assuntos fora de Arte, Música, ENEM, aulas e projetos: responda com gentileza que você só ajuda com isso.

Quando chamar o professor:
Se a pessoa pedir para falar com o professor ou com um humano, ou se o assunto for algo que só ele resolve (reclamação, falta ou justificativa, ocorrência disciplinar, autorização de pais, empréstimo ou dano de instrumento, situação pessoal delicada, combinar algo novo), diga que é melhor falar direto com o professor pelo WhatsApp e termine a mensagem exatamente com ${MARCA_CHAMAR_PROFESSOR}

Se o aluno disser algo que indique risco à saúde ou segurança dele, acolha, oriente a procurar um adulto de confiança ou o CVV (ligue 188, grátis, 24h) e chame o professor.

=== INFORMAÇÕES DO PROFESSOR ===
${info}`;
}

function passouDoLimite(ip, limite) {
  const umaHoraAtras = Date.now() - 60 * 60 * 1000;
  const lista = (envios.get(ip) || []).filter((t) => t > umaHoraAtras);
  lista.push(Date.now());
  envios.set(ip, lista);
  if (envios.size > 10000) envios.delete(envios.keys().next().value);
  return lista.length > limite;
}

// Confere a conversa enviada pela página.
function validar(mensagens) {
  if (!Array.isArray(mensagens) || mensagens.length === 0) return null;
  const recentes = mensagens.slice(-MAX_MENSAGENS);
  while (recentes.length && recentes[0].role !== "user") recentes.shift();
  for (let i = 0; i < recentes.length; i++) {
    const m = recentes[i];
    const papelEsperado = i % 2 === 0 ? "user" : "assistant";
    if (!m || m.role !== papelEsperado || typeof m.content !== "string") return null;
    if (!m.content.trim() || m.content.length > MAX_CARACTERES * 3) return null;
  }
  const ultima = recentes.at(-1);
  if (!ultima || ultima.role !== "user" || ultima.content.length > MAX_CARACTERES) return null;
  return recentes.map((m) => ({ role: m.role, content: m.content }));
}

function cabecalhos(env, origem) {
  const permitidas = [env.ALLOWED_ORIGIN, "http://localhost:8000", "http://127.0.0.1:8000"];
  return {
    "Access-Control-Allow-Origin": permitidas.includes(origem) ? origem : env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

const json = (dados, status, headers) => new Response(JSON.stringify(dados), { status, headers });

export default {
  async fetch(request, env) {
    const origem = request.headers.get("Origin") || "";
    const headers = cabecalhos(env, origem);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "GET") return json({ ok: true, mensagem: "Chat do Professor Ton no ar ✅" }, 200, headers);
    if (request.method !== "POST") return json({ erro: "Método não aceito" }, 405, headers);

    if (origem && origem !== env.ALLOWED_ORIGIN && !origem.startsWith("http://localhost") && !origem.startsWith("http://127.0.0.1")) {
      return json({ erro: "Origem não autorizada" }, 403, headers);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "desconhecido";
    if (passouDoLimite(ip, Number(env.LIMITE_POR_HORA || 30))) {
      return json({ erro: "Muitas mensagens em pouco tempo. Tente de novo daqui a pouco. 🙂" }, 429, headers);
    }

    let corpo;
    try {
      corpo = await request.json();
    } catch {
      return json({ erro: "Pedido inválido" }, 400, headers);
    }
    const mensagens = validar(corpo?.mensagens);
    if (!mensagens) {
      return json({ erro: `Mensagem inválida ou muito longa (máximo ${MAX_CARACTERES} letras).` }, 400, headers);
    }

    const modelo = env.CLAUDE_MODEL || "claude-opus-5-5";
    const pedido = {
      model: modelo,
      max_tokens: 8000,
      system: instrucoes(await infoProfessor(env)),
      cache_control: { type: "ephemeral" },
      output_config: { effort: "low" },
      messages: mensagens,
    };
    // O Haiku não tem "fallback" no servidor; os outros modelos atuais têm.
    if (!modelo.startsWith("claude-haiku")) {
      pedido.betas = ["server-side-fallback-2026-07-01"];
      pedido.fallbacks = "default";
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined });

    let resposta;
    try {
      resposta = await client.beta.messages.create(pedido);
    } catch (erro) {
      if (erro instanceof Anthropic.AuthenticationError) {
        console.error("Chave da IA inválida");
      } else if (erro instanceof Anthropic.RateLimitError) {
        return json({ erro: "Muita gente usando agora. Tente de novo em um minuto. 🙏" }, 503, headers);
      } else if (erro instanceof Anthropic.APIError) {
        console.error(`Erro da IA ${erro.status}:`, erro.message);
      } else {
        console.error("Erro:", erro);
      }
      return json({ erro: "Tive um probleminha agora. Tente de novo daqui a pouco. 🙏" }, 502, headers);
    }

    let texto;
    if (resposta.stop_reason === "refusal") {
      texto = `Não consigo ajudar com isso por aqui. É melhor falar direto com o professor. ${MARCA_CHAMAR_PROFESSOR}`;
    } else {
      texto = resposta.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    }

    const chamarProfessor = texto.includes(MARCA_CHAMAR_PROFESSOR);
    texto = texto.replaceAll(MARCA_CHAMAR_PROFESSOR, "").trim() || "Desculpa, não consegui responder agora. Pode repetir? 🙂";

    return json({ resposta: texto, chamarProfessor }, 200, headers);
  },
};
