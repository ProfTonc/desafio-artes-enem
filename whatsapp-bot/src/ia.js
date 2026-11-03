// Conversa com a IA (Claude) e monta as instruções do assistente.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO_PROFESSOR = path.join(aqui, "..", "config", "professor.md");

export const MARCA_CHAMAR_PROFESSOR = "[[CHAMAR_PROFESSOR]]";

const MODELO = process.env.CLAUDE_MODEL || "claude-opus-5-5";
// Haiku não tem "fallback" no servidor; os outros modelos atuais têm.
const USAR_FALLBACK = !MODELO.startsWith("claude-haiku");

const client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente

function montarInstrucoes() {
  const infoProfessor = fs.readFileSync(ARQUIVO_PROFESSOR, "utf8");
  return `Você é o assistente virtual do professor descrito abaixo e atende alunos e responsáveis pelo WhatsApp.

Você faz duas coisas:
1. Responde dúvidas sobre as aulas (horários, valores, inscrição, materiais) usando APENAS as informações do professor abaixo.
2. Ajuda os alunos a estudar Artes para o ENEM: explica conteúdos, movimentos artísticos, obras e artistas, e resolve questões explicando o raciocínio.

Regras:
- Escreva em português do Brasil, num tom próximo e respeitoso, como uma conversa de WhatsApp.
- Seja breve: em geral até 3 parágrafos curtos. Explicações de conteúdo podem ser um pouco maiores, mas divida em partes.
- Formatação do WhatsApp: *negrito*, _itálico_ e listas com "-". Não use títulos com "#" nem tabelas.
- Na primeira resposta de uma conversa, diga que você é o assistente virtual (uma IA) do professor.
- Nunca invente informações sobre as aulas (preços, datas, vagas). Se não estiver abaixo, diga que vai confirmar com o professor.
- Muitos alunos são menores de idade. Não peça dados pessoais (CPF, endereço, documentos, fotos). Não marque encontros.
- Em exercícios, ajude o aluno a pensar: explique o porquê da resposta, não só a letra.
- Assuntos fora de Artes/ENEM/aulas: responda com gentileza que você só ajuda com isso.

Quando chamar o professor:
Se a pessoa pedir para falar com o professor ou com um humano, ou se o assunto for algo que só ele resolve (pagamento com problema, reclamação, situação pessoal delicada, combinar algo novo), responda avisando que vai chamar o professor e termine a mensagem exatamente com ${MARCA_CHAMAR_PROFESSOR}

Se o aluno disser algo que indique risco à saúde ou segurança dele, acolha, oriente a procurar um adulto de confiança ou o CVV (ligue 188, grátis, 24h) e chame o professor.

=== INFORMAÇÕES DO PROFESSOR ===
${infoProfessor}`;
}

// Lido uma vez ao iniciar: o texto fica igual entre as conversas,
// o que permite o cache da IA (mais barato e rápido).
const INSTRUCOES = montarInstrucoes();

/**
 * Gera a resposta da IA.
 * @param {Anthropic.MessageParam[]} historico conversa até agora (termina com a mensagem do aluno)
 * @returns {Promise<string>} texto da resposta
 */
export async function responder(historico) {
  const pedido = {
    model: MODELO,
    max_tokens: 8000,
    system: INSTRUCOES,
    cache_control: { type: "ephemeral" },
    output_config: { effort: "low" },
    messages: historico,
  };
  if (USAR_FALLBACK) {
    pedido.betas = ["server-side-fallback-2026-07-01"];
    pedido.fallbacks = "default";
  }

  const resposta = await client.beta.messages.create(pedido);

  if (resposta.stop_reason === "refusal") {
    console.warn("IA recusou a mensagem:", resposta.stop_details?.category);
    return `Não consigo ajudar com isso por aqui. Vou chamar o professor. ${MARCA_CHAMAR_PROFESSOR}`;
  }

  const texto = resposta.content
    .filter((bloco) => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("\n")
    .trim();

  const u = resposta.usage;
  console.log(
    `IA: entrada=${u.input_tokens} cache=${u.cache_read_input_tokens ?? 0} saída=${u.output_tokens}`
  );

  return texto || "Desculpa, não consegui pensar numa resposta agora. Pode repetir? 🙂";
}
