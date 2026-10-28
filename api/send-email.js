// ============================================================
// PÁTRIA SEM FRONTEIRAS — endpoint de captura de leads
// Vercel Serverless Function (Node, ESM, zero framework)
// Dependência única: nodemailer
// ============================================================
import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------
// Configuração (variáveis de ambiente)
// ------------------------------------------------------------
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  MAIL_TO,
  MAIL_FROM_NAME = "Pátria Sem Fronteiras",
  SITE_ORIGIN,
} = process.env;

const PDF_PATH = fileURLToPath(
  new URL("../assets/Patria_Sem_Fronteiras_Guia_Patriota_Verde_e_Amarelo.pdf", import.meta.url)
);
const PDF_FILENAME = "Guia_Patriota_Verde_e_Amarelo.pdf";

const BODY_LIMIT_BYTES = 2048;
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const RATE_MAX_SENDS = 3; // envios por IP por janela
const MIN_INTERVAL_MS = 2000; // intervalo mínimo entre requisições do mesmo IP

// ------------------------------------------------------------
// Proteções em memória (por instância warm — suficiente para o
// volume esperado; documentado no README)
// ------------------------------------------------------------
const hits = new Map(); // ip -> { count: number, windowStart: number }
const lastSeen = new Map(); // ip -> timestamp

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim().slice(0, 45);
  }
  return (req.socket?.remoteAddress || "unknown").slice(0, 45);
}

function tooSoon(ip) {
  const now = Date.now();
  const prev = lastSeen.get(ip);
  lastSeen.set(ip, now);
  return prev !== undefined && now - prev < MIN_INTERVAL_MS;
}

// quota consumida apenas por tentativas válidas de envio —
// erros de digitação não trancam o usuário
function quotaExceeded(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX_SENDS;
}

// limpeza periódica para o Map não crescer sem fim
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) {
    if (now - entry.windowStart > RATE_WINDOW_MS) hits.delete(ip);
  }
  for (const [ip, ts] of lastSeen) {
    if (now - ts > RATE_WINDOW_MS) lastSeen.delete(ip);
  }
}, RATE_WINDOW_MS).unref();

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function securityHeaders(req) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
  };
  const origin = req.headers.origin;
  if (SITE_ORIGIN && origin && origin === SITE_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = SITE_ORIGIN;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function sendJson(res, status, body, headers) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return; // drena o restante sem acumular
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        rejected = true;
        reject(Object.assign(new Error("payload too large"), { code: "LIMIT" }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!rejected) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => {
      if (!rejected) reject(err);
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ------------------------------------------------------------
// Template HTML do e-mail (editável)
// ------------------------------------------------------------
function leadEmailHtml(lead) {
  const row = (label, value) => `
    <tr>
      <td style="padding:10px 14px;background:#f4f4ee;font-weight:bold;color:#333;border:1px solid #e2e2d8;width:160px;">${label}</td>
      <td style="padding:10px 14px;color:#222;border:1px solid #e2e2d8;">${escapeHtml(value)}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#0a0f0c;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#009739;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#ffd500;font-size:22px;letter-spacing:1px;">PÁTRIA SEM FRONTEIRAS</h1>
      <p style="margin:6px 0 0;color:#ffffff;font-size:13px;">Novo lead — promoção 22% OFF</p>
    </div>
    <div style="padding:24px;">
      <h2 style="color:#009739;font-size:18px;margin:0 0 16px;">Dados do interessado</h2>
      <table role="presentation" style="border-collapse:collapse;width:100%;font-size:14px;">
        ${row("Nome", lead.nome)}
        ${row("E-mail", lead.email)}
        ${row("Idade", lead.idade)}
        ${row("Celular", lead.celular)}
      </table>
      <p style="color:#666;font-size:12px;margin:20px 0 0;">Recebido em ${lead.quando}. Responder em até 1 dia útil.</p>
    </div>
  </div>
</body>
</html>`;
}

function confirmationEmailHtml(lead) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#0a0f0c;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#009739;padding:28px;text-align:center;">
      <h1 style="margin:0;color:#ffd500;font-size:24px;letter-spacing:1px;">PÁTRIA SEM FRONTEIRAS</h1>
      <p style="margin:6px 0 0;color:#ffffff;font-size:14px;">Suas raízes, novos horizontes</p>
    </div>
    <div style="padding:28px;">
      <h2 style="color:#009739;font-size:20px;margin:0 0 12px;">Bem-vindo(a), ${escapeHtml(lead.nome.split(" ")[0])}!</h2>
      <p style="color:#333;font-size:15px;line-height:1.6;">
        Recebemos o seu interesse e o <strong>Guia do Patriota Verde-e-Amarelo</strong> está em anexo neste e-mail.
      </p>
      <p style="color:#333;font-size:15px;line-height:1.6;">
        Nossa equipe entrará em contato em até <strong>1 dia útil</strong> para iniciar o seu diagnóstico de realocação
        e garantir o seu plano com <strong>22% de desconto</strong>, válido até 31/12/2026.
      </p>
      <p style="color:#333;font-size:15px;line-height:1.6;">
        Ser patriota não significa ficar parado. Até breve!
      </p>
      <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">
        Pátria Sem Fronteiras — consultoria informativa. Não prometemos vistos, empregos ou aprovação;
        regras migratórias dependem das autoridades oficiais de cada país.
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
export default async function handler(req, res) {
  const headers = securityHeaders(req);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {}, headers);
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Método não permitido." }, headers);
    return;
  }

  const ip = clientIp(req);
  if (tooSoon(ip)) {
    sendJson(res, 429, { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, headers);
    return;
  }

  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.includes("application/json")) {
    sendJson(res, 400, { ok: false, error: "Requisição inválida." }, headers);
    return;
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    const status = err && err.code === "LIMIT" ? 413 : 400;
    sendJson(res, status, { ok: false, error: "Requisição inválida." }, headers);
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { ok: false, error: "Requisição inválida." }, headers);
    return;
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    sendJson(res, 400, { ok: false, error: "Requisição inválida." }, headers);
    return;
  }

  // honeypot: bot preencheu o campo invisível — finge sucesso e descarta
  if (typeof data.website === "string" && data.website.trim() !== "") {
    sendJson(res, 200, { ok: true }, headers);
    return;
  }

  // rejeita campos não esperados
  const allowed = new Set(["nome", "email", "idade", "celular", "website"]);
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) {
      sendJson(res, 400, { ok: false, error: "Requisição inválida." }, headers);
      return;
    }
  }

  // ---------- validação ----------
  const nome = typeof data.nome === "string" ? data.nome.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const idade = Number(data.idade);
  const celularDigits = typeof data.celular === "string" ? data.celular.replace(/\D/g, "") : "";

  const nomeOk = nome.length >= 3 && nome.length <= 100 && /^[\p{L} .'-]+$/u.test(nome);
  const emailOk = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const idadeOk = Number.isInteger(idade) && idade >= 18 && idade <= 99;
  const celularOk = celularDigits.length >= 10 && celularDigits.length <= 11;

  if (!nomeOk || !emailOk || !idadeOk || !celularOk) {
    sendJson(res, 400, { ok: false, error: "Confira os dados informados e tente novamente." }, headers);
    return;
  }

  if (quotaExceeded(ip)) {
    sendJson(res, 429, { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, headers);
    return;
  }

  const celular =
    celularDigits.length === 11
      ? `(${celularDigits.slice(0, 2)}) ${celularDigits.slice(2, 7)}-${celularDigits.slice(7)}`
      : `(${celularDigits.slice(0, 2)}) ${celularDigits.slice(2, 6)}-${celularDigits.slice(6)}`;

  const lead = {
    nome,
    email,
    idade: String(idade),
    celular,
    quando: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  };

  // ---------- envio ----------
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_TO) {
    sendJson(res, 500, { ok: false, error: "Serviço de e-mail não configurado." }, headers);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: String(SMTP_SECURE) === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 8000,
      socketTimeout: 8000,
    });

    const pdf = readFileSync(PDF_PATH);

    const from = `"${MAIL_FROM_NAME}" <${SMTP_USER}>`;

    await transporter.sendMail({
      from,
      to: MAIL_TO,
      subject: `Novo lead — ${nome} (${lead.celular})`,
      html: leadEmailHtml(lead),
      attachments: [{ filename: PDF_FILENAME, content: pdf }],
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: "Seu Guia do Patriota Verde-e-Amarelo chegou! 🇧🇷",
      html: confirmationEmailHtml(lead),
      attachments: [{ filename: PDF_FILENAME, content: pdf }],
    });

    sendJson(res, 200, { ok: true }, headers);
  } catch {
    sendJson(res, 500, { ok: false, error: "Não foi possível enviar o e-mail agora. Tente novamente em instantes." }, headers);
  }
}
