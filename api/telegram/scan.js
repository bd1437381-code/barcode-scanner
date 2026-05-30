const BOT_TOKEN = "8947404552:AAHFOVTjO4W5SBb45FFXzVOlzI8qIf-Bi64";
const CHAT_ID = "7437622808";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const { text, format, valid } = req.body;
  if (!text) return res.status(400).json({ ok: false, error: "text required" });

  const icon = valid ? "✅" : "❌";
  const status = valid ? "صحيح" : "غير صحيح";
  const now = new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });

  const message =
    `${icon} <b>نتيجة مسح الباركود</b>\n\n` +
    `📋 <b>النص:</b> <code>${text}</code>\n` +
    `🏷 <b>النوع:</b> ${format || "غير معروف"}\n` +
    `📊 <b>الحالة:</b> ${status}\n` +
    `🕐 <b>الوقت:</b> ${now}`;

  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "HTML" }),
  });
  const data = await r.json();
  res.json({ ok: data.ok });
}
