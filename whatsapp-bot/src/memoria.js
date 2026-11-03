// Memória das conversas, guardada na memória do servidor.
// Se o servidor reiniciar, as conversas recomeçam do zero (sem problema).

const MAX_MENSAGENS = 20; // últimas 20 mensagens (10 idas e voltas)
const CONVERSA_EXPIRA_MS = 24 * 60 * 60 * 1000; // esquece após 24h parado
const PAUSA_MS = Number(process.env.PAUSA_HORAS || 12) * 60 * 60 * 1000;
const LIMITE_POR_HORA = Number(process.env.LIMITE_POR_HORA || 30);

/** @type {Map<string, {historico: any[], atualizado: number, pausadoAte: number, envios: number[], fila: Promise<void>}>} */
const conversas = new Map();

function pegar(numero) {
  let c = conversas.get(numero);
  if (!c || Date.now() - c.atualizado > CONVERSA_EXPIRA_MS) {
    c = { historico: [], atualizado: Date.now(), pausadoAte: c?.pausadoAte || 0, envios: [], fila: Promise.resolve() };
    conversas.set(numero, c);
  }
  return c;
}

export function historico(numero) {
  return pegar(numero).historico;
}

// Guarda só o texto (sem os "pensamentos" da IA). Assim podemos
// cortar mensagens antigas sem quebrar nada.
export function adicionar(numero, papel, texto) {
  const c = pegar(numero);
  c.historico.push({ role: papel, content: texto });
  while (c.historico.length > MAX_MENSAGENS) c.historico.shift();
  // A conversa precisa começar com uma mensagem do aluno.
  while (c.historico.length && c.historico[0].role !== "user") c.historico.shift();
  c.atualizado = Date.now();
}

export function pausar(numero) {
  pegar(numero).pausadoAte = Date.now() + PAUSA_MS;
}

export function retomar(numero) {
  const c = pegar(numero);
  c.pausadoAte = 0;
  c.historico = [];
}

export function estaPausado(numero) {
  return pegar(numero).pausadoAte > Date.now();
}

export function listarPausados() {
  const agora = Date.now();
  return [...conversas.entries()].filter(([, c]) => c.pausadoAte > agora).map(([n]) => n);
}

// Evita gastar demais se alguém mandar muitas mensagens seguidas.
export function passouDoLimite(numero) {
  const c = pegar(numero);
  const umaHoraAtras = Date.now() - 60 * 60 * 1000;
  c.envios = c.envios.filter((t) => t > umaHoraAtras);
  c.envios.push(Date.now());
  return c.envios.length > LIMITE_POR_HORA;
}

// Processa as mensagens de cada aluno uma de cada vez, na ordem.
export function naFila(numero, tarefa) {
  const c = pegar(numero);
  c.fila = c.fila.then(tarefa).catch((erro) => console.error("Erro ao processar:", erro));
  return c.fila;
}

// Mensagens já recebidas (a Meta às vezes manda a mesma duas vezes).
const jaVistas = new Set();
export function jaProcessada(idMensagem) {
  if (jaVistas.has(idMensagem)) return true;
  jaVistas.add(idMensagem);
  if (jaVistas.size > 5000) jaVistas.delete(jaVistas.values().next().value);
  return false;
}
