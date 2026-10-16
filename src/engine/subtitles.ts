/**
 * subtitles.ts — ASS Subtitle & TikTok CTA Generator for BWCut Studio
 * Created by fasterpsu (BW OS)
 *
 * All positions, sizes, colors, and timing are calibrated for TikTok & Shorts.
 *
 * CapCut coordinate system (used in cutbulk.ts):
 *   - Origin = center of frame
 *   - X: -1.0 = left edge, 0.0 = center, +1.0 = right edge
 *   - Y: -1.0 = bottom edge, 0.0 = center, +1.0 = top edge
 *
 * Conversion to ASS pixel coords (origin = top-left):
 *   pixelX = (capcut_X + 1) / 2 * width
 *   pixelY = (1 - capcut_Y) / 2 * height
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

// ─── Constants from cutbulk.ts ────────────────────────────────────────────────

// Text positions (CapCut normalized coords — same values as cutbulk.ts)
const TEXT_X_CENTER = 0.0;   // Center aligned (cutbulk: TEXT_X_CENTER)
const LINE1_Y       = 0.685; // Upper line     (cutbulk: LINE1_Y)
const LINE2_Y       = 0.615; // Lower line     (cutbulk: LINE2_Y, ~0.07 delta tight spacing)

// Font sizes: cutbulk uses pt in CapCut units; scale to pixels at 1920p.
// Empirically: 1 CapCut pt ≈ 5.5 px at 1920p
const CAPCUT_PT_TO_PX   = 5.5;
const LINE1_FONTSIZE_PT = 16; // cutbulk.ts LINE1_FONTSIZE
const LINE2_FONTSIZE_PT = 15; // cutbulk.ts LINE2_FONTSIZE
const LINE1_FONTSIZE_PX = Math.round(LINE1_FONTSIZE_PT * CAPCUT_PT_TO_PX); // 88px
const LINE2_FONTSIZE_PX = Math.round(LINE2_FONTSIZE_PT * CAPCUT_PT_TO_PX); // 82px

// Colors (cutbulk.ts defaults: Yellow top, White bottom)
// Yellow [1.0, 0.90, 0.0] = #FFE600   White [1.0,1.0,1.0] = #FFFFFF
const COLOR_LINE1_HEX = "#FFE600";
const COLOR_LINE2_HEX = "#FFFFFF";
const COLOR_CTA_HEX   = "#FFE600"; // Same yellow as cutbulk ctaColor

// Timing (cutbulk.ts TEXT_START_OFFSET_SEC / TEXT_END_OFFSET_SEC)
const TEXT_START_OFFSET_SEC = 1.0; // Appear at 1.0s
const TEXT_END_OFFSET_SEC   = 1.0; // Disappear 1.0s before end

// TikTok Basket CTA (cutbulk.ts BASKET_CTA_X / BASKET_CTA_Y / BASKET_CTA_DURATION_SEC)
const BASKET_CTA_X        = -0.68; // Bottom-left, above TikTok basket icon
const BASKET_CTA_Y        = -0.62; // Hovering directly above yellow basket
const BASKET_CTA_DURATION = 2.0;   // Last 2 seconds

// CTA size: cutbulk BASKET_CTA_VARIANTS has size 30
const CTA_FONTSIZE_PX = Math.round(30 * CAPCUT_PT_TO_PX); // 165px

// Shadow: cutbulk buildContent uses outline=5, shadow=4 (distance 5.5, feather 1.0, angle 315°)
const OUTLINE_SIZE = 5;
const SHADOW_SIZE  = 4;

// ─── CTA Variants (exact list from cutbulk.ts BASKET_CTA_VARIANTS) ────────────

export const BASKET_CTA_VARIANTS = [
  { text: "👇",    size: 30 },
  { text: "👇👇",  size: 28 },
  { text: "🛒👇",  size: 28 },
  { text: "🛍️👇", size: 28 },
  { text: "↙️",   size: 30 },
  { text: "✨👇",  size: 28 },
  { text: "🔥👇",  size: 28 },
  { text: "📦👇",  size: 28 },
  { text: "⬇️",   size: 30 },
  { text: "🏷️👇", size: 28 },
  { text: "💥👇",  size: 28 },
  { text: "🎯👇",  size: 28 },
];

export function getRandomBasketCta(): string {
  return BASKET_CTA_VARIANTS[Math.floor(Math.random() * BASKET_CTA_VARIANTS.length)].text;
}

// ─── Coordinate Converters ────────────────────────────────────────────────────

/** CapCut normalized X (−1..+1) → ASS pixel X (left=0) */
function ccXtoPixel(ccX: number, width: number): number {
  return Math.round((ccX + 1) / 2 * width);
}

/** CapCut normalized Y (−1..+1) → ASS pixel Y (top=0) */
function ccYtoPixel(ccY: number, height: number): number {
  return Math.round((1 - ccY) / 2 * height);
}

// ─── ASS Helpers ──────────────────────────────────────────────────────────────

export function hexToAssColor(hex: string, alphaHex = "00"): string {
  if (!hex || hex === "auto") return `&H${alphaHex}FFFFFF&`;
  const clean = hex.replace("#", "").trim();
  if (clean.length === 6) {
    const r = clean.slice(0, 2);
    const g = clean.slice(2, 4);
    const b = clean.slice(4, 6);
    return `&H${alphaHex}${b}${g}${r}&`; // ASS = BGR order
  }
  return `&H${alphaHex}FFFFFF&`;
}

export function formatAssTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h  = Math.floor(clamped / 3600);
  const m  = Math.floor((clamped % 3600) / 60);
  const s  = Math.floor(clamped % 60);
  const cs = Math.floor((clamped % 1) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

// ─── Options Interface ────────────────────────────────────────────────────────

// ─── Options Interface ────────────────────────────────────────────────────────

export interface SubtitleOptions {
  line1: string;
  emoji1?: string;
  line2: string;
  emoji2?: string;
  totalDurationSec: number;
  canvasWidth?: number;
  canvasHeight?: number;
  fontFamily?: string;       // Supports all 15 BW_Cut font presets
  topFontSizePt?: number;    // Line 1 font size in pt (default: 18)
  bottomFontSizePt?: number; // Line 2 font size in pt (default: 14)
  topFontSizePx?: number;    // Line 1 px size override
  bottomFontSizePx?: number; // Line 2 px size override
  topColorHex?: string;      // Default: "#FFE600" Yellow
  bottomColorHex?: string;   // Default: "#FFFFFF" White
  basketCta?: string;        // CTA text, default: random BASKET_CTA_VARIANTS
  ctaFontSizePx?: number;    // Override CTA px size
  lineSpacing?: number;      // Distance in px between line 1 and line 2 (default: 68)
  enableCta?: boolean;
}

/**
 * Resolve Font family name & bold flag for ASS subtitle generation (100% matched to BW_Cut)
 */
export function resolveAssFont(chosenFont?: string): { fontName: string; isBold: boolean } {
  if (!chosenFont || chosenFont === "none") return { fontName: "Mahanakhon", isBold: false };
  const f = chosenFont.trim();
  if (f === "Mitr-Regular" || f === "Mitr Regular") return { fontName: "Mitr", isBold: false };
  if (f === "Mitr-Bold" || f === "Mitr Bold" || f === "Mitr") return { fontName: "Mitr", isBold: true };
  if (f === "Kanit-Regular" || f === "Kanit") return { fontName: "Kanit", isBold: false };
  if (f === "Kanit-MediumItalic") return { fontName: "Kanit Medium", isBold: false };
  if (f === "Prompt" || f === "Prompt-Bold") return { fontName: "Prompt", isBold: true };
  if (f === "Mahanakhon" || f === "mahanakhon") return { fontName: "Mahanakhon", isBold: false };
  if (f === "Athiti-Regular" || f === "Athiti") return { fontName: "Athiti", isBold: false };
  if (f === "RDDaotok" || f === "RD Daotok") return { fontName: "RDDaotok", isBold: false };
  if (f === "SOV_HuaHlim" || f === "SOV HuaHlim") return { fontName: "SOV_HuaHlim", isBold: false };
  if (f === "SOV_MaeBaan" || f === "SOV MaeBaan") return { fontName: "SOV_MaeBaan", isBold: false };
  if (f === "SOV_Prisna" || f === "SOV Prisna") return { fontName: "SOV_Prisna", isBold: false };
  if (f === "SamphanCondensed" || f === "Samphan Condensed") return { fontName: "Samphan Condensed", isBold: false };
  if (f === "TorsilpDekthapud") return { fontName: "Torsilp Dekthapud", isBold: false };
  if (f === "TorsilpThamnganMangThoe") return { fontName: "Torsilp ThamnganMangThoe", isBold: false };
  if (f === "Fahkwang-Medium" || f === "Fahkwang") return { fontName: "Fahkwang", isBold: false };
  if (f === "GoogleSans" || f === "Google Sans") return { fontName: "Prompt", isBold: true };
  if (f === "Mali-Medium" || f === "Mali") return { fontName: "Mali", isBold: false };
  if (f === "Niramit-Medium" || f === "Niramit") return { fontName: "Niramit", isBold: false };
  if (f === "NotoSansThai" || f === "NotoSansThai-Bold") return { fontName: "Noto Sans Thai", isBold: true };
  if (f === "Pattaya-Regular" || f === "Pattaya") return { fontName: "Pattaya", isBold: false };
  if (f === "Sriracha-Regular" || f === "Sriracha") return { fontName: "Sriracha", isBold: false };
  if (f.startsWith("iannnnn-TIGER") || f.startsWith("iannnnn_TIGER") || f.includes("TIGER")) return { fontName: "iannnnn-TIGER", isBold: true };
  return { fontName: f || "Mahanakhon", isBold: false };
}

// ─── Main Generator ───────────────────────────────────────────────────────────

/**
 * Generate an .ass subtitle file with positions, typography and drop shadow
 * exactly matching cutbulk.ts and the BW_Cut render engine.
 */
export function generateAssFile(options: SubtitleOptions): string {
  const width  = options.canvasWidth  || 1080;
  const height = options.canvasHeight || 1920;
  const totalSec = options.totalDurationSec;

  const fontInfo = resolveAssFont(options.fontFamily);
  const fontName = fontInfo.fontName;

  // Scale font sizes to current resolution (Matching CapCut gold standard: pt * 5.8 * width/1080)
  const scaleFactor = width / 1080;
  const topPt = options.topFontSizePt || 16;
  const bottomPt = options.bottomFontSizePt || 15;
  const topSize    = options.topFontSizePx    || Math.round(topPt * 5.8 * scaleFactor);
  const bottomSize = options.bottomFontSizePx || Math.round(bottomPt * 5.8 * scaleFactor);
  const ctaSize    = options.ctaFontSizePx    || Math.round(30 * 5.8 * scaleFactor); // ~174px

  // Colors: cutbulk defaults - Yellow top (#FFE600), White bottom (#FFFFFF)
  const topColorHex    = options.topColorHex    || COLOR_LINE1_HEX;
  const bottomColorHex = options.bottomColorHex || COLOR_LINE2_HEX;
  const ctaColorHex    = COLOR_CTA_HEX;

  const topColorAss    = hexToAssColor(topColorHex);
  const bottomColorAss = hexToAssColor(bottomColorHex);
  const ctaColorAss    = hexToAssColor(ctaColorHex);

  // ── Timing (mirrors cutbulk.ts lines 537-543) ──
  let textStartSec = TEXT_START_OFFSET_SEC;
  let textEndSec   = totalSec - TEXT_END_OFFSET_SEC;
  if (textEndSec <= textStartSec || totalSec <= 2.0) {
    textStartSec = 0;
    textEndSec   = totalSec;
  }

  const ctaStartSec = Math.max(0, totalSec - BASKET_CTA_DURATION);
  const ctaEndSec   = totalSec;

  const timeStart = formatAssTime(textStartSec);
  const timeEnd   = formatAssTime(textEndSec);
  const ctaStart  = formatAssTime(ctaStartSec);
  const ctaEnd    = formatAssTime(ctaEndSec);

  // ── Pixel positions (converted from cutbulk.ts CapCut normalized coords) ──
  // Formula from BW_Cut render-engine.ts:
  // posX = width / 2 + (tfX * width) / 2
  // posY = height / 2 - (tfY * height) / 2
  // Line 1: X=0.0 (center), Y=0.685 -> X=540, Y=302px (15.75% from top)
  const line1X = ccXtoPixel(TEXT_X_CENTER, width); // 540
  const line1Y = ccYtoPixel(LINE1_Y, height);      // 302

  // Line 2: dynamic spacing offset from Line 1 (default 88px for large readable text)
  const spacing = options.lineSpacing || 88;
  const line2X = ccXtoPixel(TEXT_X_CENTER, width); // 540
  const line2Y = line1Y + Math.round(spacing * (height / 1920));

  // CTA: X=-0.68 (left), Y=-0.62 (lower) -> X=173, Y=1555px (81.0% from top)
  const ctaX = ccXtoPixel(BASKET_CTA_X, width);    // 173
  const ctaY = ccYtoPixel(BASKET_CTA_Y, height);   // 1555

  // Drop shadow offset (distance 5.5px, angle 315° as in cutbulk buildContent)
  const shadowDist = Math.round(5.5 * scaleFactor);
  const shadowOffX = Math.round(shadowDist * 0.707);
  const shadowOffY = Math.round(shadowDist * 0.707);

  // ── Text content (clean Thai text without raw emojis in ASS mode to prevent [NO GLYPH] boxes) ──
  const fullLine1 = (options.line1 || "").replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}\u{1F900}-\u{1F9FF}]/gu, "").trim();
  const fullLine2 = (options.line2 || "").replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}\u{1F900}-\u{1F9FF}]/gu, "").trim();
  const enableCta = options.enableCta !== false;

  // ── Dual-Halo Drop Shadow + Crisp Typography (from BW_Cut render-engine.ts) ──
  // Layer 0: Shadow pass 1 (diffuse glow, blur 16)
  // Layer 0: Shadow pass 2 (sharper contour, blur 6)
  // Layer 1: Foreground text with \bord0\shad0 (clean, unadulterated Thai glyphs)
  const assContent = `[Script Info]
Title: BWCut Studio Typography (BW OS by fasterpsu)
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},75,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,5,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
; Line 1 Shadows (Dual-halo: diffuse blur 16 + contour blur 6)
Dialogue: 0,${timeStart},${timeEnd},Default,,0,0,0,,{\\fn${fontName}\\b1\\an5\\pos(${line1X + shadowOffX},${line1Y + shadowOffY})\\fs${topSize}\\c&H00000000&\\bord4\\3c&H00000000&\\blur16\\alpha&H00&}${fullLine1}
Dialogue: 0,${timeStart},${timeEnd},Default,,0,0,0,,{\\fn${fontName}\\b1\\an5\\pos(${line1X + shadowOffX},${line1Y + shadowOffY})\\fs${topSize}\\c&H00000000&\\bord2\\3c&H00000000&\\blur6\\alpha&H00&}${fullLine1}
; Line 1 Foreground Text (Crisp yellow, no border)
Dialogue: 1,${timeStart},${timeEnd},Default,,0,0,0,,{\\fn${fontName}\\b1\\an5\\pos(${line1X},${line1Y})\\fs${topSize}\\c${topColorAss}\\bord0\\shad0}${fullLine1}
; Line 2 Shadows (Dual-halo: diffuse blur 16 + contour blur 6)
Dialogue: 0,${timeStart},${timeEnd},Default,,0,0,0,,{\\fn${fontName}\\b0\\an5\\pos(${line2X + shadowOffX},${line2Y + shadowOffY})\\fs${bottomSize}\\c&H00000000&\\bord4\\3c&H00000000&\\blur16\\alpha&H00&}${fullLine2}
Dialogue: 0,${timeStart},${timeEnd},Default,,0,0,0,,{\\fn${fontName}\\b0\\an5\\pos(${line2X + shadowOffX},${line2Y + shadowOffY})\\fs${bottomSize}\\c&H00000000&\\bord2\\3c&H00000000&\\blur6\\alpha&H00&}${fullLine2}
; Line 2 Foreground Text (Crisp white, no border)
Dialogue: 1,${timeStart},${timeEnd},Default,,0,0,0,,{\\fn${fontName}\\b0\\an5\\pos(${line2X},${line2Y})\\fs${bottomSize}\\c${bottomColorAss}\\bord0\\shad0}${fullLine2}
`;

  const subDir = resolve("temp/subtitles");
  if (!existsSync(subDir)) mkdirSync(subDir, { recursive: true });

  const fileName = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.ass`;
  const subPath  = join(subDir, fileName);
  writeFileSync(subPath, assContent, "utf-8");
  return subPath;
}

