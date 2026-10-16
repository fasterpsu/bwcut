/**
 * headline.ts — Multi-API Headline & Hook Generator for BWCut Studio
 * Created by fasterpsu (BW OS)
 * Enhanced with 19 TikTok brand rules, robust multi-tier fallback, and multi-model failover.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, basename, extname } from "node:path";
import { extractAudioSnippet, getFileHash } from "./ffmpeg.js";

export interface HeadlineResult {
  line1: string;
  emoji1: string;
  line2: string;
  emoji2: string;
  source: "gemini" | "groq" | "fallback";
  transcript?: string;
}

export interface HeadlineColorPair {
  name: string;
  top: string;
  bottom: string;
}

export const TIKTOK_VIRAL_COLOR_PAIRS: HeadlineColorPair[] = [
  { name: "เหลืองนีออน + ขาว (ยอดนิยม)", top: "#FFE600", bottom: "#FFFFFF" },
  { name: "ขาวคลีน + เหลืองนีออน", top: "#FFFFFF", bottom: "#FFE600" },
  { name: "เขียวนีออน + ขาว (ดึงดูดสายตา)", top: "#00FF66", bottom: "#FFFFFF" },
  { name: "ฟ้าสดใส + ขาว (คมชัด)", top: "#00E5FF", bottom: "#FFFFFF" },
  { name: "ส้มสดไฟลุก + ขาว (ไฮไลท์เด่น)", top: "#FF6B00", bottom: "#FFFFFF" },
  { name: "ชมพูฮอตพิงค์ + ขาว (สายแฟชั่น/บิวตี้)", top: "#FF2A85", bottom: "#FFFFFF" },
  { name: "เหลืองนีออน + ฟ้าสด (คู่สีคอนทราสต์)", top: "#FFE600", bottom: "#00E5FF" },
  { name: "แดงสดเตือนภัย + ขาว (กระตุ้นหยุดดู)", top: "#FF3333", bottom: "#FFFFFF" },
  { name: "เขียวมิ้นต์สว่าง + เหลืองนีออน", top: "#2EE59D", bottom: "#FFE600" },
  { name: "ม่วงลาเวนเดอร์ + ขาว (โมเดิร์นพรีเมียม)", top: "#C084FC", bottom: "#FFFFFF" },
];

export function getViralColorPair(index: number): HeadlineColorPair {
  return TIKTOK_VIRAL_COLOR_PAIRS[Math.abs(index) % TIKTOK_VIRAL_COLOR_PAIRS.length];
}

const CATCHY_EMOJIS = ["🔥", "⚡", "💥", "✨", "📢", "⚠️", "😱", "👀", "🛒", "👍", "💯", "❗", "👇", "🚀", "🎯"];

// Verified available Google Gemini models (Flash-Lite models prioritized for high free quota)
export const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-2.5-flash",
];

// Verified available Groq Whisper models
export const GROQ_WHISPER_MODELS = [
  "whisper-large-v3-turbo",
  "whisper-large-v3",
];

// Verified available Groq LLM Chat models (22/9 baseline: gpt-oss-120b primary)
export const GROQ_CHAT_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}\u{1F900}-\u{1F9FF}]/gu;

/**
 * Strip any emojis from text and extract the last emoji for placement at the end
 */
export function stripEmojisFromText(text: string): { cleanText: string; foundEmoji: string } {
  let foundEmoji = "";
  const matches = text.match(EMOJI_REGEX);
  if (matches && matches.length > 0) {
    foundEmoji = matches[matches.length - 1];
  }
  const cleanText = text.replace(EMOJI_REGEX, "").replace(/\s{2,}/g, " ").trim();
  return { cleanText, foundEmoji };
}

function thaiWordToDigit(w: string): string {
  const map: Record<string, string> = {
    "ศูนย์": "0",
    "หนึ่ง": "1",
    "สอง": "2",
    "สาม": "3",
    "สี่": "4",
    "ห้า": "5",
    "หก": "6",
    "เจ็ด": "7",
    "แปด": "8",
    "เก้า": "9",
    "สิบ": "10",
  };
  return map[w] || w;
}

export function normalizeThaiNumbers(text: string): string {
  if (!text) return "";
  const numWords = "ศูนย์|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ";
  const units = "ปี|เดือน|วัน|ชั่วโมง|นาที|วิ|วินาที|ชั้น|ชิ้น|อัน|ตัว|เท่า|เท่าตัว|หัว|ใบ|เมตร|มิล|เซน|เซนติเมตร|โล|กิโล|กิโลกรัม|ลิตร|มิลลิลิตร|วัตต์|แอมป์|บาท|คู่|ชุด|แพ็ค|กล่อง|ซอง|ขวด|ด้าม|แผ่น|ม้วน";

  // Match pattern: (numberWord)(optional spaces)(unit) e.g. "สามปี", "สาม ปี", "สองชั้น"
  const regexUnit = new RegExp(`(${numWords})\\s*(${units})`, "g");
  let res = text.replace(regexUnit, (_, num, unit) => `${thaiWordToDigit(num)} ${unit}`.trim());

  // Also replace explicit phrases like "ประกันยาวสามปี" -> "ประกันยาว 3 ปี"
  const regexPrefix = new RegExp(`(ยาว|กว่า|ถึง|เกิน|ได้|รับ|แถม|ลด|คุ้ม|จัด|เกือบ)(${numWords})`, "g");
  res = res.replace(regexPrefix, (_, pre, num) => `${pre} ${thaiWordToDigit(num)}`.trim());

  return res.replace(/\s{2,}/g, " ").trim();
}

/**
 * Robust parser matching BW_Cut headline parser
 */
export function parseHeadline(raw: string): { line1: string; emoji1: string; line2: string; emoji2: string } | null {
  // Strip markdown code fences if present (e.g. ```json ... ```)
  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  // 1. Direct JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.line1 && parsed.line2) {
      let rawL1 = String(parsed.line1).trim();
      let rawL2 = String(parsed.line2).trim();
      let e1 = parsed.emoji1 ? String(parsed.emoji1).trim() : "";
      let e2 = parsed.emoji2 ? String(parsed.emoji2).trim() : "";

      const s1 = stripEmojisFromText(rawL1);
      const s2 = stripEmojisFromText(rawL2);

      const l1 = normalizeThaiNumbers(s1.cleanText);
      const l2 = normalizeThaiNumbers(s2.cleanText);
      if (!e1) e1 = s1.foundEmoji || "🔥";
      if (!e2) e2 = s2.foundEmoji || "👇";

      return { line1: l1, emoji1: e1, line2: l2, emoji2: e2 };
    }
  } catch {}

  // 2. Regex extract "line1": "..." and "line2": "..."
  const l1 = cleaned.match(/"line1"\s*:\s*"([^"]+)"/i);
  const l2 = cleaned.match(/"line2"\s*:\s*"([^"]+)"/i);
  const e1 = cleaned.match(/"emoji1"\s*:\s*"([^"]+)"/i);
  const e2 = cleaned.match(/"emoji2"\s*:\s*"([^"]+)"/i);
  if (l1 && l2) {
    const s1 = stripEmojisFromText(l1[1]);
    const s2 = stripEmojisFromText(l2[1]);
    return {
      line1: normalizeThaiNumbers(s1.cleanText),
      emoji1: e1 ? e1[1].trim() : (s1.foundEmoji || "🔥"),
      line2: normalizeThaiNumbers(s2.cleanText),
      emoji2: e2 ? e2[1].trim() : (s2.foundEmoji || "👇"),
    };
  }

  // 3. Fallback to Thai line match (บรรทัด 1 / บรรทัด 2)
  const b1 = cleaned.match(/บรรทัด\s*1\s*[:.\-]?\s*([^\n\r]+)/i);
  const b2 = cleaned.match(/บรรทัด\s*2\s*[:.\-]?\s*([^\n\r]+)/i);
  if (b1 && b2) {
    const s1 = stripEmojisFromText(b1[1]);
    const s2 = stripEmojisFromText(b2[1]);
    return {
      line1: normalizeThaiNumbers(s1.cleanText),
      emoji1: s1.foundEmoji || "🔥",
      line2: normalizeThaiNumbers(s2.cleanText),
      emoji2: s2.foundEmoji || "👇"
    };
  }

  return null;
}

/**
 * Build TikTok headline prompt with full BW_Cut brand dictionary & emoji rules (22/9 original)
 */
function buildHeadlinePrompt(transcript: string): string {
  return `วิเคราะห์คำพูดจากคลิปวิดีโอนี้ แล้วคิด "พาดหัวสั้นสไตล์ TikTok/Reels" 2 บรรทัด (บรรทัดละ 2-5 คำ) เพื่อสื่ออารมณ์ ดึงดูดสายตา และช่วยให้เข้าใจง่ายขึ้น:

คำพูดในคลิป: "${transcript.slice(0, 350)}"

กฎสำคัญ:
1. line1: สรุปประเด็นหลัก/ชื่อสินค้า (กระชับ ชัดเจน เป็นตัวหนังสือล้วน ห้ามใส่อีโมจิตรงกลางประโยค)
2. line2: ฮุคดึงดูด/เตือนใจ/ข้อคิด (กระชับ คมชัด เป็นตัวหนังสือล้วน ห้ามใส่อีโมจิตรงกลางประโยค)
3. emoji1 และ emoji2: เลือก Unicode Emoji 1 ตัวที่เข้ากับบริบทที่สุด เพื่อนำไปแสดง "ต่อท้ายประโยค" เท่านั้น (ห้ามใส่อีโมจิไว้ใน line1 หรือ line2)
4. สไตล์อีโมจิ: ใช้อีโมจิที่ตรงกับเนื้อหาจริง (แก้วน้ำ=🥤, ของกิน=🍲, เครื่องมือช่าง=🛠️, ปลั๊กไฟ=🔌, โปรโมชั่น=🏷️, น้ำแข็ง/เย็น=🧊/❄️, เงิน=💸, กันน้ำ=💧, กรรไกร/เขียง=🔪, แว่นตา=👓/🕶️)
5. กฎเด็ดขาดเรื่องชื่อแบรนด์ (สำคัญที่สุด):
   - ห้ามใส่ชื่อแบรนด์หรือยี่ห้อสินค้าใดๆ ทั้งสิ้นในพาดหัวเด็ดขาด! (เช่น ห้ามใส่ BLACKDOG, SEALN, SMAIL, BEWON, Deli, AMBOSS, Botare, Dearny, MAYBUCK, SOLOEVER, ADDA, ipopi, KKSKY, CONOYAR, CIVAGO ฯลฯ)
   - คลิปต้องนำไปลงได้ทุกแพลตฟอร์มอย่างเป็นกลาง (TikTok, Facebook Reels, Shopee Video, YouTube Shorts) โดยไม่มีชื่อแบรนด์ติดไป
   - ให้เน้นระบุ "ประเภทสินค้า" และ "จุดเด่น/ประโยชน์/ฟังก์ชัน" แทนชื่อแบรนด์ เช่น:
     - ห้ามใช้ "BLACKDOG" -> ให้ใช้ "ไฟฉายพกพา", "ไฟฉาย EDC", "โคมไฟแคมป์ปิ้ง", "โคมไฟเต็นท์"
     - ห้ามใช้ "SEALN / SMAIL / CIVAGO / CONOYAR" -> ให้ใช้ "แก้วเก็บความเย็น", "กระบอกน้ำสแตนเลส"
     - ห้ามใช้ "BEWON / Deli / AMBOSS" -> ให้ใช้ "บล็อกยาง", "รางปลั๊กไฟ", "หัวแปลงปลั๊ก"
     - ห้ามใช้ "Botare / ipopi" -> ให้ใช้ "ทิชชู่แขวน", "ทิชชู่ Pop-up", "น้ำยาซักผ้า"
     - ห้ามใช้ "MAYBUCK" -> ให้ใช้ "เคียวแมงกานีส", "เลื่อยพับ", "ไขควงช่าง"
     - ห้ามใช้ "SOLOEVER" -> ให้ใช้ "ถุงมือขับขี่", "เสื้อกันฝน"
     - ห้ามใช้ "ADDA" -> ให้ใช้ "รองเท้าแตะ", "รองเท้าหัวโต"
     - ห้ามใช้ "KKSKY" -> ให้ใช้ "โคมไฟโซลาร์เซลล์"
   - ห้ามใช้คำว่า "แก้วเยติ" ให้ใช้ "แก้วเก็บความเย็น"
   - ห้ามพูดถึงหรืออ้างอิงชื่อแพลตฟอร์มใดๆ (เช่น TikTok, Shopee, Lazada) เพื่อให้นำไปโพสต์ได้ทุกแพลตฟอร์ม
6. กฎการเขียนตัวเลข (เด็ดขาด):
   - หากมีตัวเลข จำนวน ระยะเวลา ปี วัน ชิ้น ชั้น ขนาด วัตต์ หรือราคา ให้ใช้ "เลขอารบิก (0-9)" เสมอ!
   - ห้ามสะกดคำอ่านตัวเลขเป็นภาษาไทยเด็ดขาด!
     - เช่น ห้ามใช้ "สามปี" -> ให้ใช้ "3 ปี" เสมอ!
     - ห้ามใช้ "หนึ่งปี" -> ให้ใช้ "1 ปี" เสมอ!
     - ห้ามใช้ "สองปี" -> ให้ใช้ "2 ปี" เสมอ!
     - ห้ามใช้ "ห้าปี" -> ให้ใช้ "5 ปี" เสมอ!
     - ห้ามใช้ "สิบเท่า" -> ให้ใช้ "10 เท่า" เสมอ!
     - ห้ามใช้ "สองชั้น" -> ให้ใช้ "2 ชั้น" เสมอ!
     - ห้ามใช้ "สามหัว" -> ให้ใช้ "3 หัว" เสมอ!
     - ห้ามใช้ "หนึ่งร้อย" -> ให้ใช้ "100" เสมอ!
     - ห้ามใช้ "สองชิ้น" -> ให้ใช้ "2 ชิ้น" เสมอ!
7. บังคับตอบเป็น JSON เท่านั้น (line1 และ line2 เป็นตัวหนังสือล้วน, emoji1 และ emoji2 เป็นอีโมจิที่จะอยู่ท้ายประโยค):
{"line1": "ข้อความบรรทัดที่หนึ่ง", "emoji1": "🔥", "line2": "ข้อความบรรทัดที่สอง", "emoji2": "👇"}`;
}

/**
 * Transcribe snippet with Groq Whisper
 */
async function transcribeWithGroq(snippetPath: string, apiKey: string): Promise<string> {
  const audioBuffer = readFileSync(snippetPath);
  let lastErr = "";

  for (const model of GROQ_WHISPER_MODELS) {
    try {
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: "audio/mp3" });
      formData.append("file", blob, "snippet.mp3");
      formData.append("model", model);
      formData.append("language", "th");
      formData.append("response_format", "json");

      const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const json = await resp.json();
        const text = json.text?.trim() ?? "";
        if (text) return text;
      }

      const errText = await resp.text();
      lastErr = `[Groq Whisper ${model}] ${resp.status}: ${errText.slice(0, 200)}`;
    } catch (e: any) {
      lastErr = `[Groq Whisper ${model}] ${e?.message ?? e}`;
    }
  }

  throw new Error(`Groq Whisper transcription failed: ${lastErr}`);
}

/**
 * Transcribe snippet with Google Gemini Audio
 */
async function transcribeWithGemini(snippetPath: string, apiKey: string): Promise<string> {
  const audioBuffer = readFileSync(snippetPath);
  const base64Audio = audioBuffer.toString("base64");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: "audio/mp3",
              data: base64Audio,
            },
          },
          {
            text: 'ฟังเสียงภาษาไทยในคลิปนี้แล้วพิมพ์ข้อความคำพูดภาษาไทยที่ได้ยินทั้งหมดออกมาแบบคำต่อคำ (ห้ามตอบเป็นภาษาอื่น):',
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 500,
    },
  };

  let lastErr = "";
  for (const model of GEMINI_MODELS) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (resp.ok) {
        const json = await resp.json();
        const res = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        if (res) return res;
      }

      const errText = await resp.text();
      lastErr = `[Gemini STT ${model}] ${resp.status}: ${errText.slice(0, 200)}`;
    } catch (e: any) {
      lastErr = `[Gemini STT ${model}] ${e?.message ?? e}`;
    }
  }

  throw new Error(`Gemini STT transcription failed: ${lastErr}`);
}

/**
 * Summarize transcript into TikTok headline using Groq LLM
 */
async function summarizeWithGroq(transcript: string, apiKey: string): Promise<{ line1: string; emoji1: string; line2: string; emoji2: string }> {
  const prompt = buildHeadlinePrompt(transcript);
  let lastErr = "";

  for (const model of GROQ_CHAT_MODELS) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 1000,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const json = await resp.json();
        const raw = json.choices?.[0]?.message?.content ?? "";
        const parsed = parseHeadline(raw);
        if (parsed) return parsed;
      }

      const errText = await resp.text();
      lastErr = `[Groq LLM ${model}] ${resp.status}: ${errText.slice(0, 200)}`;
    } catch (e: any) {
      lastErr = `[Groq LLM ${model}] ${e?.message ?? e}`;
    }
  }

  throw new Error(`Groq LLM summary failed: ${lastErr}`);
}

/**
 * Summarize transcript into TikTok headline using Gemini
 */
async function summarizeWithGemini(transcript: string, apiKey: string): Promise<{ line1: string; emoji1: string; line2: string; emoji2: string }> {
  const prompt = buildHeadlinePrompt(transcript);

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 250,
      response_mime_type: "application/json",
    },
  };

  let lastErr = "";
  for (const model of GEMINI_MODELS) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (resp.ok) {
        const json = await resp.json();
        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        const parsed = parseHeadline(raw);
        if (parsed) return parsed;
      }

      const errText = await resp.text();
      lastErr = `[Gemini LLM ${model}] ${resp.status}: ${errText.slice(0, 200)}`;
    } catch (e: any) {
      lastErr = `[Gemini LLM ${model}] ${e?.message ?? e}`;
    }
  }

  throw new Error(`Gemini LLM summary failed: ${lastErr}`);
}

/**
 * Smart fallback headline generator
 */
export function generateSmartFallback(videoPath: string, transcript?: string): HeadlineResult {
  if (transcript && transcript.trim().length > 0) {
    const clean = transcript.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const line1 = clean.slice(0, 20).trim() || "สินค้าเด็ดต้องดู";
    return {
      line1,
      emoji1: "✨",
      line2: "รีบดูก่อนหมดโปร",
      emoji2: "🔥",
      source: "fallback",
      transcript,
    };
  }

  const videoBase = basename(videoPath, extname(videoPath));
  const hashNum = videoBase.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

  const fallbackPairs: Array<{ line1: string; emoji1: string; line2: string; emoji2: string }> = [
    { line1: "ไอเทมเด็ดต้องมี", emoji1: "🔥", line2: "ดูให้จบมีคำตอบ", emoji2: "👇" },
    { line1: "ของดีบอกต่อ", emoji1: "✨", line2: "คุ้มค่าเกินราคา", emoji2: "💸" },
    { line1: "เปิดกล่องรีวิว", emoji1: "📦", line2: "ของมันต้องลอง", emoji2: "👍" },
    { line1: "ตัวเด็ดประจำวัน", emoji1: "⚡", line2: "ห้ามพลาดเด็ดขาด", emoji2: "🎯" },
    { line1: "รีวิวของใช้สุดปัง", emoji1: "💯", line2: "กดดูในตะกร้าเลย", emoji2: "🛒" },
    { line1: "สินค้าคุณภาพพรีเมียม", emoji1: "⭐", line2: "ตอบโจทย์ทุกการใช้งาน", emoji2: "🚀" },
  ];

  const picked = fallbackPairs[hashNum % fallbackPairs.length];
  return {
    ...picked,
    source: "fallback",
  };
}

/**
 * Main Headline Generation Entry Point with Automatic Failover (22/9 original flow)
 */
export async function generateHeadline(
  videoPath: string,
  options: {
    preferredAi?: "gemini" | "groq";
    geminiApiKey?: string;
    groqApiKey?: string;
    useCache?: boolean;
    onLog?: (msg: string) => void;
  } = {}
): Promise<HeadlineResult> {
  const hash = getFileHash(videoPath);
  const cacheDir = resolve("temp/headlines");
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const cacheFile = join(cacheDir, `${hash}.json`);

  if (options.useCache !== false && existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, "utf-8")) as HeadlineResult;
      if (cached && cached.line1 && cached.source !== "fallback") {
        return cached;
      }
    } catch {}
  }

  // Extract 18s audio snippet
  const snippetPath = await extractAudioSnippet(videoPath, 18);

  const preferred = options.preferredAi || process.env.PREFERRED_AI || "gemini";
  const geminiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;
  const groqKey = options.groqApiKey || process.env.GROQ_API_KEY;

  let transcript = "";

  // ── Step 1: Transcribe Audio ────────────────────────────────────────────────
  if (preferred === "groq" && groqKey) {
    try {
      transcript = await transcribeWithGroq(snippetPath, groqKey);
      options.onLog?.(`🎙️ ถอดเสียงด้วย Groq Whisper สำเร็จ: "${transcript.slice(0, 60)}..."`);
    } catch (e: any) {
      options.onLog?.(`⚠️ Groq Whisper ล้มเหลว: ${e.message} -> ลองใช้ Gemini Audio...`);
      if (geminiKey) {
        try {
          transcript = await transcribeWithGemini(snippetPath, geminiKey);
          options.onLog?.(`🎙️ ถอดเสียงด้วย Gemini Audio สำเร็จ: "${transcript.slice(0, 60)}..."`);
        } catch (gErr: any) {
          options.onLog?.(`⚠️ Gemini Audio ล้มเหลวเช่นกัน: ${gErr.message}`);
        }
      }
    }
  } else if (preferred === "gemini" && geminiKey) {
    try {
      transcript = await transcribeWithGemini(snippetPath, geminiKey);
      options.onLog?.(`🎙️ ถอดเสียงด้วย Gemini Audio สำเร็จ: "${transcript.slice(0, 60)}..."`);
    } catch (e: any) {
      options.onLog?.(`⚠️ Gemini Audio ล้มเหลว: ${e.message} -> ลองใช้ Groq Whisper...`);
      if (groqKey) {
        try {
          transcript = await transcribeWithGroq(snippetPath, groqKey);
          options.onLog?.(`🎙️ ถอดเสียงด้วย Groq Whisper สำเร็จ: "${transcript.slice(0, 60)}..."`);
        } catch (gErr: any) {
          options.onLog?.(`⚠️ Groq Whisper ล้มเหลวเช่นกัน: ${gErr.message}`);
        }
      }
    }
  } else {
    // Try whatever key is available
    if (groqKey) {
      try {
        transcript = await transcribeWithGroq(snippetPath, groqKey);
      } catch {}
    } else if (geminiKey) {
      try {
        transcript = await transcribeWithGemini(snippetPath, geminiKey);
      } catch {}
    }
  }

  // If no speech detected in audio
  if (!transcript || transcript.trim().length === 0) {
    options.onLog?.(`ℹ️ ไม่พบเสียงพูดในคลิป หรือไฟล์เสียงเงียบ -> ใช้พาดหัวอัจฉริยะ`);
    const fallbackResult = generateSmartFallback(videoPath);
    return fallbackResult;
  }

  // ── Step 2: Summarize to Headline ───────────────────────────────────────────
  let headlineObj: { line1: string; emoji1: string; line2: string; emoji2: string } | null = null;
  let source: "gemini" | "groq" | "fallback" = "fallback";

  if (preferred === "groq" && groqKey) {
    try {
      headlineObj = await summarizeWithGroq(transcript, groqKey);
      if (headlineObj) source = "groq";
    } catch (e: any) {
      options.onLog?.(`⚠️ Groq LLM ล้มเหลว: ${e.message} -> สลับไปใช้ Gemini LLM...`);
      if (geminiKey) {
        try {
          headlineObj = await summarizeWithGemini(transcript, geminiKey);
          if (headlineObj) source = "gemini";
        } catch (gErr: any) {
          options.onLog?.(`⚠️ Gemini LLM ล้มเหลวเช่นกัน: ${gErr.message}`);
        }
      }
    }
  } else if (preferred === "gemini" && geminiKey) {
    try {
      headlineObj = await summarizeWithGemini(transcript, geminiKey);
      if (headlineObj) source = "gemini";
    } catch (e: any) {
      options.onLog?.(`⚠️ Gemini LLM ล้มเหลว: ${e.message} -> สลับไปใช้ Groq LLM...`);
      if (groqKey) {
        try {
          headlineObj = await summarizeWithGroq(transcript, groqKey);
          if (headlineObj) source = "groq";
        } catch (gErr: any) {
          options.onLog?.(`⚠️ Groq LLM ล้มเหลวเช่นกัน: ${gErr.message}`);
        }
      }
    }
  } else {
    if (groqKey) {
      headlineObj = await summarizeWithGroq(transcript, groqKey).catch(() => null);
      if (headlineObj) source = "groq";
    } else if (geminiKey) {
      headlineObj = await summarizeWithGemini(transcript, geminiKey).catch(() => null);
      if (headlineObj) source = "gemini";
    }
  }

  if (headlineObj) {
    const result: HeadlineResult = {
      line1: headlineObj.line1,
      emoji1: headlineObj.emoji1,
      line2: headlineObj.line2,
      emoji2: headlineObj.emoji2,
      source,
      transcript,
    };
    writeFileSync(cacheFile, JSON.stringify(result, null, 2), "utf-8");
    options.onLog?.(`🤖 พาดหัว AI สำเร็จโดย ${source.toUpperCase()}: "${result.line1} ${result.emoji1}" / "${result.line2} ${result.emoji2}"`);
    return result;
  }

  // Fallback if summary models failed
  const fallback = generateSmartFallback(videoPath, transcript);
  return fallback;
}
