import { Router } from "express";

const router = Router();

const BOT_TOKEN = "8947404552:AAHFOVTjO4W5SBb45FFXzVOlzI8qIf-Bi64";
const CHAT_ID = "7437622808";
const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(text: string) {
  const res = await fetch(`${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
  });
  return res.json();
}

async function sendPhoto(buffer: Buffer, caption: string, filename: string) {
  const formData = new FormData();
  formData.append("chat_id", CHAT_ID);
  formData.append("caption", caption);
  formData.append("parse_mode", "HTML");
  const blob = new Blob([buffer], { type: "image/jpeg" });
  formData.append("photo", blob, filename);
  const res = await fetch(`${TG}/sendPhoto`, { method: "POST", body: formData });
  return res.json();
}

// POST /api/telegram/scan — إرسال نتيجة المسح
router.post("/telegram/scan", async (req, res) => {
  const { text, format, valid } = req.body as { text?: string; format?: string; valid?: boolean };

  if (!text) {
    res.status(400).json({ ok: false, error: "text is required" });
    return;
  }

  const icon = valid ? "✅" : "❌";
  const status = valid ? "صحيح" : "غير صحيح";
  const now = new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });

  const message =
    `${icon} <b>نتيجة مسح الباركود</b>\n\n` +
    `📋 <b>النص:</b> <code>${text}</code>\n` +
    `🏷 <b>النوع:</b> ${format || "غير معروف"}\n` +
    `📊 <b>الحالة:</b> ${status}\n` +
    `🕐 <b>الوقت:</b> ${now}`;

  try {
    const result = await sendMessage(message);
    res.json({ ok: result.ok });
  } catch (err) {
    req.log.error({ err }, "Telegram sendMessage failed");
    res.status(500).json({ ok: false, error: "Failed to send to Telegram" });
  }
});

// POST /api/telegram/photo — إرسال صورة (base64 JSON)
router.post("/telegram/photo", async (req, res) => {
  const { photo, result, valid, filename } = req.body as {
    photo?: string;
    result?: string;
    valid?: boolean;
    filename?: string;
  };

  if (!photo) {
    res.status(400).json({ ok: false, error: "photo is required" });
    return;
  }

  const icon = valid ? "✅" : "❌";
  const status = valid ? "صحيح" : "غير صحيح";
  const now = new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });

  const caption =
    `${icon} <b>صورة مرفوعة من الموقع</b>\n\n` +
    (result ? `📋 <b>النتيجة:</b> <code>${result}</code>\n` : "") +
    `📊 <b>الحالة:</b> ${status}\n` +
    `🕐 <b>الوقت:</b> ${now}`;

  try {
    const buffer = Buffer.from(photo, "base64");
    const tgResult = await sendPhoto(buffer, caption, filename || "scan.jpg");
    res.json({ ok: tgResult.ok });
  } catch (err) {
    req.log.error({ err }, "Telegram sendPhoto failed");
    res.status(500).json({ ok: false, error: "Failed to send photo to Telegram" });
  }
});

export default router;
