// Envio de mensagens pela API oficial do WhatsApp (Meta).
import crypto from "node:crypto";

const VERSAO = process.env.GRAPH_API_VERSION || "v25.0";
const LIMITE_TEXTO = 4000; // o WhatsApp aceita até 4096 caracteres

// Celulares do Brasil às vezes chegam da Meta sem o 9 da frente
// (5565999998888 vira 556599998888). Esta chave trata os dois como iguais.
export function chaveNumero(numero) {
  const digitos = String(numero || "").replace(/\D/g, "");
  const m = digitos.match(/^55(\d{2})9(\d{8})$/);
  return m ? `55${m[1]}${m[2]}` : digitos;
}

async function chamarApi(corpo) {
  const url = `https://graph.facebook.com/${VERSAO}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
  });
  if (!resp.ok) {
    throw new Error(`WhatsApp respondeu ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

function dividir(texto) {
  const partes = [];
  let resto = texto;
  while (resto.length > LIMITE_TEXTO) {
    let corte = resto.lastIndexOf("\n", LIMITE_TEXTO);
    if (corte < LIMITE_TEXTO / 2) corte = resto.lastIndexOf(" ", LIMITE_TEXTO);
    if (corte <= 0) corte = LIMITE_TEXTO;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte).trimStart();
  }
  if (resto) partes.push(resto);
  return partes;
}

export async function enviarTexto(para, texto) {
  for (const parte of dividir(texto)) {
    await chamarApi({ to: para, type: "text", text: { body: parte, preview_url: true } });
  }
}

// Mostra os dois risquinhos azuis para o aluno.
export async function marcarComoLida(idMensagem) {
  try {
    await chamarApi({ status: "read", message_id: idMensagem });
  } catch (erro) {
    console.warn("Não marquei como lida:", erro.message);
  }
}

// Confere se a mensagem veio mesmo da Meta (e não de alguém se passando por ela).
export function assinaturaValida(corpoBruto, assinatura) {
  const segredo = process.env.META_APP_SECRET;
  if (!segredo) return true; // sem segredo configurado, não dá para conferir
  if (!assinatura?.startsWith("sha256=")) return false;
  const esperado = "sha256=" + crypto.createHmac("sha256", segredo).update(corpoBruto).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(assinatura);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Extrai as mensagens recebidas do aviso que a Meta envia.
export function extrairMensagens(aviso) {
  const lista = [];
  for (const entrada of aviso?.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const valor = mudanca.value ?? {};
      const nomes = Object.fromEntries(
        (valor.contacts ?? []).map((c) => [c.wa_id, c.profile?.name])
      );
      for (const m of valor.messages ?? []) {
        lista.push({
          id: m.id,
          de: m.from,
          nome: nomes[m.from] || "",
          tipo: m.type,
          texto: m.type === "text" ? m.text?.body ?? "" : m.button?.text ?? m.interactive?.button_reply?.title ?? "",
        });
      }
    }
  }
  return lista;
}
