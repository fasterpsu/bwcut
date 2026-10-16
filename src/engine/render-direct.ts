/**
 * render-direct.ts — Pure FFmpeg Direct Video Renderer for BWCut Studio
 * Created by fasterpsu (BW OS)
 * Performs batch jump-cutting, Thai typography burn-in, TikTok CTA, and GPU acceleration.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { resolve, dirname, basename, extname, join } from "node:path";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { findFfmpeg, detectBestEncoder, getVideoMetadata } from "./ffmpeg.js";
import { type TimeRange } from "./silence.js";
import { generateAssFile, getRandomBasketCta, type SubtitleOptions } from "./subtitles.js";
import { stripEmojisFromText } from "./headline.js";

// ─── Browser Discovery for Full-Color Twemoji Rendering ───────────────────────

export function findBrowserExecutable(): string | null {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    process.env.CHROME_BIN || "",
    process.env.EDGE_BIN || "",
  ].filter(Boolean);
  return candidates.find((c) => existsSync(c)) || null;
}

// ─── Twemoji & Full-Color HTML Overlay Generator ──────────────────────────────

function formatEmojiTextToHtml(rawText: string, emojiSizePx: number, fontsDir: string): string {
  const emojiRegex = /(\p{Extended_Pictographic}|\p{Emoji_Presentation})/gu;
  const emojiDir = join(fontsDir, "emojis");

  return rawText.replace(emojiRegex, (match) => {
    const cp = match.codePointAt(0)?.toString(16);
    if (!cp) return match;

    const localSvg = join(emojiDir, `${cp}.svg`).replace(/\\/g, "/");
    // URL-encode each path segment to handle Thai characters (e.g. ตัดต่อ) in folder names
    const localSvgUrl = localSvg.split("/").map((seg, i) =>
      i === 0 ? seg : encodeURIComponent(seg)
    ).join("/");

    // Prefer local SVG (works offline, no CDN dependency)
    let srcUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cp}.svg`;
    if (existsSync(localSvg)) {
      srcUrl = `file:///${localSvgUrl}`;
    }

    return `<img src="${srcUrl}" style="width: ${emojiSizePx}px; height: ${emojiSizePx}px; vertical-align: -0.15em; margin: 0 0.12em; display: inline-block; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.7));" />`;
  });
}

interface GenerateOverlayOptions {
  fontsDir: string;
  browserPath: string;
  width: number;
  height: number;
  line1: string;
  emoji1?: string;
  line2: string;
  emoji2?: string;
  totalDurationSec: number;
  fontFamily?: string;
  topFontSizePt?: number;
  bottomFontSizePt?: number;
  topColorHex?: string;
  bottomColorHex?: string;
  basketCta?: string;
  lineSpacing?: number;
  headlineStartSec?: number;
  headlineEndSec?: number;
  enableCta?: boolean;
}

export function resolveFontFileName(chosenFont?: string): string {
  if (!chosenFont || chosenFont === "none") return "Prompt-Bold.ttf";
  const f = chosenFont.trim();
  if (f === "Prompt" || f === "Prompt-Bold") return "Prompt-Bold.ttf";
  if (f === "Kanit-Regular" || f === "Kanit") return "Kanit-Regular.ttf";
  if (f === "Kanit-MediumItalic") return "Kanit-MediumItalic.ttf";
  if (f === "Mitr-Regular" || f === "Mitr Regular") return "Mitr-Regular.ttf";
  if (f === "Mitr-Bold" || f === "Mitr Bold" || f === "Mitr") return "Mitr-Bold.ttf";
  if (f === "NotoSansThai-Bold" || f === "Noto Sans Thai" || f === "NotoSansThai") return "NotoSansThai-Bold.ttf";
  if (f === "Athiti-Regular" || f === "Athiti") return "Athiti-Regular.ttf";
  if (f === "Fahkwang-Medium" || f === "Fahkwang") return "Fahkwang-Medium.ttf";
  if (f === "Mali-Medium" || f === "Mali") return "Mali-Medium.ttf";
  if (f === "Niramit-Medium" || f === "Niramit") return "Niramit-Medium.ttf";
  if (f === "Pattaya-Regular" || f === "Pattaya") return "Pattaya-Regular.ttf";
  if (f === "Sriracha-Regular" || f === "Sriracha") return "Sriracha-Regular.ttf";
  return "Prompt-Bold.ttf";
}

function generateColorEmojiOverlays(opts: GenerateOverlayOptions): Array<{ pngPath: string; htmlPath: string; startSec: number; endSec: number }> {
  const tempDir = resolve("temp/overlays");
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

  const fontFileName = resolveFontFileName(opts.fontFamily);
  const fontFilePath = join(opts.fontsDir, fontFileName).replace(/\\/g, "/");
  // URL-encode path segments so Chrome headless can handle Thai characters (e.g. ตัดต่อ) in folder names
  const fontFileUrl = fontFilePath.split("/").map((seg, i) =>
    i === 0 ? seg : encodeURIComponent(seg)
  ).join("/");

  // Coordinate conversion from cutbulk.ts
  const spacing = opts.lineSpacing || 68;
  const line1Y = Math.round((1 - 0.685) / 2 * opts.height); // 302px at 1920 (15.75% from top)
  const line2Y = line1Y + Math.round(spacing * (opts.height / 1920)); // default: 302 + 68 = 370px (19.25% from top)
  const ctaX   = Math.round((-0.68 + 1) / 2 * opts.width);   // 173px (16.0% from left)
  const ctaY   = Math.round((1 + 0.62) / 2 * opts.height);   // 1555px (81.0% from top)

  const scale = opts.width / 1080;
  const topPt = opts.topFontSizePt || 18;
  const bottomPt = opts.bottomFontSizePt || 14;
  const fs1 = Math.round(topPt * 5.3 * scale);
  const fs2 = Math.round(bottomPt * 5.3 * scale);
  const fsCta = Math.round(30 * 5.3 * scale);

  const topColor = opts.topColorHex || "#ffe600";
  const bottomColor = opts.bottomColorHex || "#ffffff";

  const s1 = stripEmojisFromText(opts.line1);
  const s2 = stripEmojisFromText(opts.line2);
  const em1 = (opts.emoji1 || s1.foundEmoji || "").trim();
  const em2 = (opts.emoji2 || s2.foundEmoji || "").trim();
  const fullL1 = em1 ? `${s1.cleanText} ${em1}` : s1.cleanText;
  const fullL2 = em2 ? `${s2.cleanText} ${em2}` : s2.cleanText;
  const ctaText = opts.basketCta || getRandomBasketCta();

  const results: Array<{ pngPath: string; htmlPath: string; startSec: number; endSec: number }> = [];

  // Slice 1: Headline timing (Default: 0s to 10s or clip duration)
  const hStartSec = typeof opts.headlineStartSec === "number" ? Math.max(0, opts.headlineStartSec) : 0.0;
  const hEndSec   = typeof opts.headlineEndSec === "number" ? Math.min(opts.totalDurationSec, opts.headlineEndSec) : Math.min(opts.totalDurationSec, 10.0);

  const headlineHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'HeadFont';
    src: url('file:///${fontFileUrl}');
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    width: ${opts.width}px; height: ${opts.height}px;
    background: transparent; overflow: hidden;
    font-family: 'HeadFont', sans-serif;
  }
  .line1 {
    position: absolute; top: ${line1Y}px; left: 0; width: 100%;
    transform: translateY(-50%); text-align: center;
    font-size: ${fs1}px; font-weight: bold; color: ${topColor};
    text-shadow: 0 4px 12px rgba(0,0,0,1.0), 0 8px 30px rgba(0,0,0,1.0);
    white-space: nowrap; padding: 0 20px;
  }
  .line2 {
    position: absolute; top: ${line2Y}px; left: 0; width: 100%;
    transform: translateY(-50%); text-align: center;
    font-size: ${fs2}px; font-weight: normal; color: ${bottomColor};
    text-shadow: 0 4px 12px rgba(0,0,0,1.0), 0 8px 30px rgba(0,0,0,1.0);
    white-space: nowrap; padding: 0 20px;
  }
</style>
</head>
<body>
  <div class="line1">${formatEmojiTextToHtml(fullL1, Math.round(fs1 * 0.95), opts.fontsDir)}</div>
  <div class="line2">${formatEmojiTextToHtml(fullL2, Math.round(fs2 * 0.95), opts.fontsDir)}</div>
</body>
</html>`;

  const hHtmlPath = join(tempDir, `ov_head_${Date.now()}.html`);
  const hPngPath  = join(tempDir, `ov_head_${Date.now()}.png`);
  writeFileSync(hHtmlPath, headlineHtml, "utf-8");

  const syncRes1 = spawnSync(opts.browserPath, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--default-background-color=00000000",
    `--window-size=${opts.width},${opts.height}`,
    `--screenshot=${hPngPath}`,
    hHtmlPath,
  ]);

  if (syncRes1.status === 0 && existsSync(hPngPath)) {
    results.push({ pngPath: hPngPath, htmlPath: hHtmlPath, startSec: hStartSec, endSec: hEndSec });
  }

  // Slice 2: TikTok Basket CTA (only rendered if enableCta is not false)
  if (opts.enableCta !== false) {
    const ctaStartSec = Math.max(0, opts.totalDurationSec - 2.0);
    const ctaEndSec   = opts.totalDurationSec;

    const ctaHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'HeadFont';
    src: url('file:///${fontFileUrl}');
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    width: ${opts.width}px; height: ${opts.height}px;
    background: transparent; overflow: hidden;
    font-family: 'HeadFont', sans-serif;
  }
  .cta {
    position: absolute; top: ${ctaY}px; left: ${ctaX}px;
    transform: translate(-10%, -50%);
    font-size: ${fsCta}px; font-weight: bold; color: ${topColor};
    text-shadow: 0 4px 16px rgba(0,0,0,1.0);
    white-space: nowrap;
  }
</style>
</head>
<body>
  <div class="cta">${formatEmojiTextToHtml(ctaText, Math.round(fsCta * 0.95), opts.fontsDir)}</div>
</body>
</html>`;

    const cHtmlPath = join(tempDir, `ov_cta_${Date.now()}.html`);
    const cPngPath  = join(tempDir, `ov_cta_${Date.now()}.png`);
    writeFileSync(cHtmlPath, ctaHtml, "utf-8");

    const syncRes2 = spawnSync(opts.browserPath, [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--default-background-color=00000000",
      `--window-size=${opts.width},${opts.height}`,
      `--screenshot=${cPngPath}`,
      cHtmlPath,
    ]);

    if (syncRes2.status === 0 && existsSync(cPngPath)) {
      results.push({ pngPath: cPngPath, htmlPath: cHtmlPath, startSec: ctaStartSec, endSec: ctaEndSec });
    }
  }

  return results;
}


export interface DirectRenderConfig {
  videoPath: string;
  outputPath: string;
  audibleParts: TimeRange[];
  headline?: {
    line1: string;
    emoji1?: string;
    line2: string;
    emoji2?: string;
  };
  headlineStartSec?: number;
  headlineEndSec?: number;
  enableCta?: boolean;
  resolution?: "1080p" | "original" | "720p";
  encoder?: "auto" | "h264_amf" | "h264_nvenc" | "libx264";
  beautyLevel?: "none" | "natural" | "smooth" | "glow";
  fontFamily?: string;
  topFontSize?: number;
  bottomFontSize?: number;
  topColorHex?: string;
  bottomColorHex?: string;
  lineSpacing?: number;
  randomZoom?: boolean;
  zoomLevels?: number[];
  maxCutDurationSec?: number;
  enableHookZoom?: boolean;
  hookZoomDurationSec?: number;
  hookZoomScalePercent?: number;
  onProgress?: (progress: {
    percent: number;
    currentTimeSec: number;
    totalTimeSec: number;
    speed: string;
    fps: number;
    etaSec: number;
  }) => void;
  onLog?: (line: string) => void;
}

/**
 * Split cuts longer than maxCutSec so each sub-cut can switch zoom levels dynamically.
 */
export function splitLongTimeRanges(
  segments: TimeRange[],
  maxCutSec: number = 4.0
): TimeRange[] {
  if (maxCutSec <= 0) return segments;
  const result: TimeRange[] = [];

  for (const seg of segments) {
    const dur = seg.durationInSeconds;
    if (dur <= maxCutSec || dur <= 0) {
      result.push(seg);
      continue;
    }

    const numParts = Math.ceil(dur / maxCutSec);
    const partDur = dur / numParts;
    let currStart = seg.startInSeconds;

    for (let i = 0; i < numParts; i++) {
      const thisEnd = i === numParts - 1 ? seg.endInSeconds : currStart + partDur;
      const thisDur = thisEnd - currStart;
      result.push({
        startInSeconds: currStart,
        endInSeconds: thisEnd,
        durationInSeconds: thisDur,
      });
      currStart = thisEnd;
    }
  }

  return result;
}

/**
 * Generate a sequence of zoom levels where consecutive cuts NEVER have the same scale,
 * and the first cut ALWAYS starts at 1.0 (100%).
 */
export function makeZoomSequence(pool: number[], count: number): number[] {
  if (count <= 0) return [];
  const cleanPool = Array.from(new Set(pool.filter((z) => !isNaN(z) && z > 0)));
  if (cleanPool.length === 0) return Array(count).fill(1.0);
  if (cleanPool.length === 1) return Array(count).fill(cleanPool[0]);

  const seq: number[] = [];
  let lastZoom = -1;

  for (let i = 0; i < count; i++) {
    // First cut ALWAYS starts at 100% (1.0)
    if (i === 0) {
      seq.push(1.0);
      lastZoom = 1.0;
      continue;
    }
    const available = cleanPool.filter((z) => Math.abs(z - lastZoom) > 0.001);
    const chosen = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : cleanPool[0];
    seq.push(chosen);
    lastZoom = chosen;
  }

  return seq;
}

export class DirectVideoRenderer {
  private activeProcess: ChildProcess | null = null;
  private isCancelled = false;

  public cancel() {
    this.isCancelled = true;
    if (this.activeProcess) {
      try {
        this.activeProcess.kill("SIGTERM");
      } catch {}
      this.activeProcess = null;
    }
  }

  public async render(config: DirectRenderConfig): Promise<string> {
    this.isCancelled = false;
    const ffmpegPath = findFfmpeg();

    const outputDir = dirname(config.outputPath);
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    const meta = await getVideoMetadata(config.videoPath);

    // Calculate dimensions
    let targetW = meta.width;
    let targetH = meta.height;
    if (config.resolution === "1080p") {
      const isPortrait = meta.height >= meta.width;
      targetW = isPortrait ? 1080 : 1920;
      targetH = isPortrait ? 1920 : 1080;
    } else if (config.resolution === "720p") {
      const isPortrait = meta.height >= meta.width;
      targetW = isPortrait ? 720 : 1280;
      targetH = isPortrait ? 1280 : 720;
    }

    // Audible segments
    let segments = config.audibleParts;
    if (!segments || segments.length === 0) {
      segments = [{
        startInSeconds: 0,
        endInSeconds: meta.durationSec,
        durationInSeconds: meta.durationSec,
      }];
    }

    // ── Random Dynamic Zoom Setup (ported from BW_Cut) ────────────────────────
    const doZoom = !!config.randomZoom;
    const zoomPool = doZoom
      ? (config.zoomLevels && config.zoomLevels.length > 0 ? config.zoomLevels : [1.0, 1.2, 1.3, 1.4])
      : [1.0];

    if (doZoom) {
      const maxCut = config.maxCutDurationSec && config.maxCutDurationSec > 0 ? config.maxCutDurationSec : 4.0;
      segments = splitLongTimeRanges(segments, maxCut);
    }

    const n = segments.length;
    let zoomSeq: number[];
    if (!doZoom) {
      zoomSeq = Array(n).fill(1.0);
    } else if (config.enableHookZoom) {
      const hookDur = config.hookZoomDurationSec && config.hookZoomDurationSec > 0 ? config.hookZoomDurationSec : 4.0;
      zoomSeq = [];
      let cumTime = 0;
      let lastZoom = 1.0;
      const cleanPool = Array.from(new Set(zoomPool.filter((z) => !isNaN(z) && z > 0)));

      for (let i = 0; i < n; i++) {
        if (cumTime < hookDur) {
          zoomSeq.push(1.0);
          lastZoom = 1.0;
        } else {
          const available = cleanPool.filter((z) => Math.abs(z - lastZoom) > 0.001);
          const chosen = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : cleanPool[0];
          zoomSeq.push(chosen);
          lastZoom = chosen;
        }
        cumTime += segments[i].durationInSeconds;
      }
    } else {
      zoomSeq = makeZoomSequence(zoomPool, n);
    }

    if (doZoom) {
      config.onLog?.(`🔍 Random Zoom enabled: [${zoomPool.map((z) => Math.round(z * 100) + "%").join(", ")}] → ${n} cuts (Scale alternating)`);
    }

    const totalOutputDurationSec = segments.reduce((acc, cur) => acc + cur.durationInSeconds, 0);

    // ── Headline & Typography Setup (skip if fontFamily is 'none') ──
    let assPath: string | null = null;
    let emojiOverlays: Array<{ pngPath: string; htmlPath: string; startSec: number; endSec: number }> = [];

    const shouldBurnText = config.fontFamily !== "none" && config.headline && (config.headline.line1 || config.headline.line2);

    if (shouldBurnText) {
      const browserExe = findBrowserExecutable();
      const fontsDir = resolve("fonts");

      // Check if browser is available for full-color Twemoji + CSS drop shadows
      if (browserExe) {
        try {
          emojiOverlays = generateColorEmojiOverlays({
            browserPath: browserExe,
            fontsDir,
            width: targetW,
            height: targetH,
            line1: config.headline!.line1,
            emoji1: config.headline!.emoji1,
            line2: config.headline!.line2,
            emoji2: config.headline!.emoji2,
            totalDurationSec: totalOutputDurationSec,
            fontFamily: config.fontFamily || "Mahanakhon",
            topFontSizePt: config.topFontSize || 14,
            bottomFontSizePt: config.bottomFontSize || 14,
            topColorHex: config.topColorHex || "#FFE600",
            bottomColorHex: config.bottomColorHex || "#FFFFFF",
            lineSpacing: config.lineSpacing || 68,
            headlineStartSec: config.headlineStartSec,
            headlineEndSec: config.headlineEndSec,
            enableCta: config.enableCta,
          });
          config.onLog?.(`✨ Full-Color Emoji mode: [${config.fontFamily || "Mahanakhon"}] (Top: ${config.topFontSize || 14}pt, Bottom: ${config.bottomFontSize || 14}pt, Spacing: ${config.lineSpacing || 68}px)`);
        } catch (err: any) {
          config.onLog?.(`Emoji overlay generation failed, falling back to ASS: ${err.message}`);
          emojiOverlays = [];
        }
      }

      // Fallback to ASS subtitle if browser not available or failed
      if (emojiOverlays.length === 0) {
        assPath = generateAssFile({
          line1: config.headline!.line1,
          emoji1: config.headline!.emoji1,
          line2: config.headline!.line2,
          emoji2: config.headline!.emoji2,
          totalDurationSec: totalOutputDurationSec,
          canvasWidth: targetW,
          canvasHeight: targetH,
          fontFamily: config.fontFamily || "Mahanakhon",
          topFontSizePt: config.topFontSize || 14,
          bottomFontSizePt: config.bottomFontSize || 14,
          topColorHex: config.topColorHex || "#FFE600",
          bottomColorHex: config.bottomColorHex || "#FFFFFF",
          lineSpacing: config.lineSpacing || 68,
        });
      }
    } else if (config.fontFamily === "none") {
      config.onLog?.(`Subtitles disabled (font: none). Rendering clean video without text.`);
    }


    // Choose Encoder
    let selectedEncoder: string = config.encoder || "auto";
    if (selectedEncoder === "auto") {
      selectedEncoder = detectBestEncoder();
    } else if (selectedEncoder !== "libx264") {
      // Validate that the explicitly chosen hardware encoder is functional on this machine
      try {
        const testProbe = spawnSync(ffmpegPath, [
          "-f", "lavfi",
          "-i", "color=c=black:s=64x64:d=0.04",
          "-c:v", selectedEncoder,
          "-f", "null",
          "-"
        ], { stdio: "pipe" });
        if (testProbe.status !== 0) {
          config.onLog?.(`⚠️ Hardware encoder '${selectedEncoder}' is not available on this machine. Falling back to CPU 'libx264'.`);
          selectedEncoder = "libx264";
        }
      } catch {
        selectedEncoder = "libx264";
      }
    }

    // Prepare filter graph
    const filterParts: string[] = [];

    for (let i = 0; i < n; i++) {
      const seg = segments[i];
      const start = seg.startInSeconds.toFixed(3);
      const end = seg.endInSeconds.toFixed(3);
      if (doZoom) {
        const zoom = zoomSeq[i] ?? 1.0;
        const zoomFilter =
          zoom > 1.0
            ? `,scale=${Math.round(targetW * zoom)}:${Math.round(targetH * zoom)},crop=${targetW}:${targetH}`
            : "";
        filterParts.push(
          `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1${zoomFilter}[v${i}]`
        );
      } else {
        filterParts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`);
      }
      filterParts.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`);
    }

    let concatInputs = "";
    for (let i = 0; i < n; i++) {
      concatInputs += `[v${i}][a${i}]`;
    }
    filterParts.push(`${concatInputs}concat=n=${n}:v=1:a=1[vconcat][aconcat]`);

    // Post processing on video
    let lastVTag = "vconcat";

    // Beauty filter
    if (config.beautyLevel && config.beautyLevel !== "none") {
      let bFilter = "";
      if (config.beautyLevel === "natural") {
        bFilter = "bilateral=sigmaS=3:sigmaR=0.06,eq=brightness=0.015:contrast=1.02:saturation=1.03,unsharp=3:3:0.4";
      } else if (config.beautyLevel === "smooth") {
        bFilter = "bilateral=sigmaS=7:sigmaR=0.10,eq=brightness=0.015:contrast=1.02:saturation=1.03,unsharp=3:3:0.4";
      } else if (config.beautyLevel === "glow") {
        bFilter = "hqdn3d=2:2:5:5,smartblur=lr=2.2:ls=-0.45:lt=3,eq=brightness=0.03:contrast=1.03:saturation=1.05,unsharp=3:3:0.6";
      }
      if (bFilter) {
        filterParts.push(`[${lastVTag}]${bFilter}[vbeauty]`);
        lastVTag = "vbeauty";
      }
    }

    // Scale / Pad to target dimensions (only if not already done per-segment by doZoom)
    if (!doZoom && (targetW !== meta.width || targetH !== meta.height)) {
      filterParts.push(
        `[${lastVTag}]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black[vscaled]`
      );
      lastVTag = "vscaled";
    }

    // Hook Slow Zoom (Smooth Push-In from 100% -> scale during first N seconds)
    if (config.enableHookZoom) {
      const d = config.hookZoomDurationSec && config.hookZoomDurationSec > 0 ? config.hookZoomDurationSec : 4.0;
      const pct = config.hookZoomScalePercent && config.hookZoomScalePercent >= 100 ? config.hookZoomScalePercent : 120;
      const delta = (pct - 100) / 100;
      if (delta > 0) {
        // FFmpeg re-evaluates crop x/y per-frame only when expression contains 't'.
        // So we embed the same zoom formula in crop x/y offsets explicitly.
        // zoom(t) = 1 + delta*(t/d)  while t<=d, else 1
        // scaled_w = targetW * zoom(t),  crop_x = (scaled_w - targetW)/2 = targetW*delta*(t/d)/2
        const dStr = d.toFixed(3);
        const dltStr = delta.toFixed(4);
        filterParts.push(
          `[${lastVTag}]scale=eval=frame` +
          `:w='trunc(${targetW}*(if(lte(t,${dStr}),1+${dltStr}*(t/${dStr}),1))/2)*2'` +
          `:h='trunc(${targetH}*(if(lte(t,${dStr}),1+${dltStr}*(t/${dStr}),1))/2)*2'` +
          `,crop=w=${targetW}:h=${targetH}` +
          `:x='${targetW}*(if(lte(t,${dStr}),${dltStr}*(t/${dStr}),0))/2'` +
          `:y='${targetH}*(if(lte(t,${dStr}),${dltStr}*(t/${dStr}),0))/2'` +
          `:exact=1[vhookzoom]`
        );
        lastVTag = "vhookzoom";
        config.onLog?.(`🎬 Hook Slow Zoom: 0s - ${d}s (100% → ${pct}%)`);
      }
    }

    // Burn-in Overlays or ASS Subtitles
    const extraInputs: string[] = [];
    if (emojiOverlays.length > 0) {
      emojiOverlays.forEach((ov, idx) => {
        const inputIdx = 1 + idx; // 0 is video
        extraInputs.push("-i", ov.pngPath);
        const isLast = idx === emojiOverlays.length - 1;
        const nextV = isLast ? "vsub" : `v_ov${idx}`;
        const fmtStr = isLast ? ",format=yuv420p" : "";
        filterParts.push(
          `[${lastVTag}][${inputIdx}:v]overlay=x=0:y=0:enable='between(t,${ov.startSec.toFixed(3)},${ov.endSec.toFixed(3)})'${fmtStr}[${nextV}]`
        );
        lastVTag = nextV;
      });
    } else if (assPath && existsSync(assPath)) {
      const fontsDir = resolve("fonts").replace(/\\/g, "/").replace(/:/g, "\\:");
      const escapedAss = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      filterParts.push(`[${lastVTag}]ass=filename='${escapedAss}':fontsdir='${fontsDir}'[vsub]`);
      lastVTag = "vsub";
    }

    const filterComplex = filterParts.join(";\n");

    // Build FFmpeg Arguments
    const args = [
      "-y",
      "-i", config.videoPath,
      ...extraInputs,
      "-filter_complex", filterComplex,
      "-map", `[${lastVTag}]`,
      "-map", "[aconcat]",
    ];


    // Encoder options
    if (selectedEncoder === "h264_amf") {
      args.push(
        "-c:v", "h264_amf",
        "-quality", "speed",
        "-rc", "cbr",
        "-b:v", "8M",
        "-maxrate", "12M",
        "-pix_fmt", "yuv420p"
      );
    } else if (selectedEncoder === "h264_nvenc") {
      args.push(
        "-c:v", "h264_nvenc",
        "-preset", "p4",
        "-cq", "22",
        "-b:v", "8M",
        "-pix_fmt", "yuv420p"
      );
    } else {
      args.push(
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-pix_fmt", "yuv420p"
      );
    }

    args.push(
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-movflags", "+faststart",
      config.outputPath
    );

    return new Promise((resolvePromise, rejectPromise) => {
      config.onLog?.(`Starting FFmpeg render -> ${basename(config.outputPath)}`);
      config.onLog?.(`Encoder: ${selectedEncoder}, Resolution: ${targetW}x${targetH}, Duration: ${totalOutputDurationSec.toFixed(1)}s`);

      const proc = spawn(ffmpegPath, args);
      this.activeProcess = proc;

      let stderrAcc = "";

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderrAcc += text;

        // Parse progress line: time=00:00:15.25 bitrate=8124kbits/s speed=2.45x fps=72
        const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
        const fpsMatch = text.match(/fps=\s*(\d+\.?\d*)/);
        const speedMatch = text.match(/speed=\s*(\d+\.?\d*)x/);

        if (timeMatch && totalOutputDurationSec > 0) {
          const currentSec =
            parseInt(timeMatch[1], 10) * 3600 +
            parseInt(timeMatch[2], 10) * 60 +
            parseFloat(timeMatch[3]);

          const percent = Math.min(99.5, Math.round((currentSec / totalOutputDurationSec) * 1000) / 10);
          const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
          const speedStr = speedMatch ? `${speedMatch[1]}x` : "1.0x";
          const speedVal = speedMatch ? parseFloat(speedMatch[1]) : 1.0;

          const remainSec = Math.max(0, totalOutputDurationSec - currentSec);
          const etaSec = speedVal > 0 ? Math.round(remainSec / speedVal) : 0;

          config.onProgress?.({
            percent,
            currentTimeSec: currentSec,
            totalTimeSec: totalOutputDurationSec,
            speed: speedStr,
            fps,
            etaSec,
          });
        }
      });

      proc.on("close", (code) => {
        this.activeProcess = null;

        // Clean up temp ass and emoji overlay files
        if (assPath && existsSync(assPath)) {
          try {
            unlinkSync(assPath);
          } catch {}
        }
        if (emojiOverlays.length > 0) {
          emojiOverlays.forEach((ov) => {
            try { if (existsSync(ov.pngPath)) unlinkSync(ov.pngPath); } catch {}
            try { if (existsSync(ov.htmlPath)) unlinkSync(ov.htmlPath); } catch {}
          });
        }

        if (this.isCancelled) {
          config.onLog?.("Render cancelled by user.");
          return rejectPromise(new Error("Render cancelled by user"));
        }

        if (code === 0 && existsSync(config.outputPath)) {
          config.onProgress?.({
            percent: 100,
            currentTimeSec: totalOutputDurationSec,
            totalTimeSec: totalOutputDurationSec,
            speed: "1.0x",
            fps: 0,
            etaSec: 0,
          });
          config.onLog?.(`Render completed successfully: ${basename(config.outputPath)}`);
          resolvePromise(config.outputPath);
        } else {
          const errMsg = stderrAcc.slice(-500);
          config.onLog?.(`Render failed with code ${code}: ${errMsg}`);
          rejectPromise(new Error(`FFmpeg exited with code ${code}: ${errMsg}`));
        }
      });

      proc.on("error", (err) => {
        this.activeProcess = null;
        rejectPromise(err);
      });
    });
  }
}
