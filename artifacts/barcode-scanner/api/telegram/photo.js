const BOT_TOKEN = "8947404552:AAHFOVTjO4W5SBb45FFXzVOlzI8qIf-Bi64";
const CHAT_ID = "7437622808";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const { photo, result, valid, filename } = req.body;
  if (!photo) return res.status(400).json({ ok: false, error: "photo required" });

  const icon = valid ? "✅" : "❌";
  const status = valid ? "صحيح" : "غير صحيح";
  const now = new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });

  const caption =
    `${icon} <b>صورة مرفوعة من الموقع</b>\n\n` +
    (result ? `📋 <b>النتيجة:</b> <code>${result}</code>\n` : "") +
    `📊 <b>الحالة:</b> ${status}\n` +
    `🕐 <b>الوقت:</b> ${now}`;

  // Decode base64 photo and send to Telegram
  const buffer = Buffer.from(photo, "base64");
  const formData = new FormData();
  formData.append("chat_id", CHAT_ID);
  formData.append("caption", caption);
  formData.append("parse_mode", "HTML");
  formData.append("photo", new Blob([buffer], { type: "image/jpeg" }), filename || "scan.jpg");

  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: formData,
  });
  const data = await r.json();
  res.json({ ok: data.ok });
}
