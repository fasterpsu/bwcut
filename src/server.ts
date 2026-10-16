/**
 * server.ts — High-Performance Local Web Server for BWCut
 * Port: 3110
 */

import * as http from "node:http";
import * as url from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { loadSettings, saveSettings, type BWCutSettings } from "./engine/config.js";
import {
  findFfmpeg,
  detectBestEncoder,
  getVideoMetadata,
  getOrGenerateThumbnail,
  openInExplorer,
  getFileHash,
  type VideoMetadata,
} from "./engine/ffmpeg.js";
import { analyzeSilence, type SilenceAnalysisResult } from "./engine/silence.js";
import { generateHeadline, type HeadlineResult } from "./engine/headline.js";
import { DirectVideoRenderer, type DirectRenderConfig } from "./engine/render-direct.js";
import {
  validateLicense,
  activateLicense,
  getStoredLicense,
} from "./engine/licensing.js";
import {
  checkGitUpdate,
  checkZipUpdate,
  applyGitUpdate,
  getCurrentVersion,
} from "./engine/updater.js";
import {
  sendNtfyNotification,
  sendRenderCompletedNotification,
  sendBatchCompletedNotification,
} from "./engine/ntfy.js";

const PORT = parseInt(process.env.PORT || "3110", 10);

interface ClipData {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  metadata?: VideoMetadata;
  thumbnailUrl?: string;
  silence?: SilenceAnalysisResult;
  headline?: HeadlineResult;
  beautyLevel: "none" | "natural" | "smooth" | "glow";
  fontFamily?: string;
  topFontSize?: number;
  bottomFontSize?: number;
  lineSpacing?: number;
  enableCta?: boolean;
  randomZoom?: boolean;
  enableHookZoom?: boolean;
  hookZoomDurationSec?: number;
  hookZoomScalePercent?: number;
  headlineStartSec?: number;
  headlineEndSec?: number;
  topHeadlineColor?: string;
  bottomHeadlineColor?: string;
  productCode?: string;
  approved: boolean;
  status: "unprocessed" | "analyzing" | "ready" | "approved" | "rendering" | "completed" | "error";
  error?: string;
}

interface RenderQueueItem {
  id: string;
  clipId: string;
  name: string;
  inputPath: string;
  outputPath: string;
  status: "pending" | "rendering" | "completed" | "failed" | "cancelled";
  progress: number;
  speed: string;
  fps: number;
  etaSec: number;
  error?: string;
}

const SESSION_FILE = path.resolve("temp/session.json");
const LOGS_FILE = path.resolve("temp/activity.log");
const CLIPS_STORE_FILE = path.resolve("temp/clips_store.json");

function loadSession(): { lastFolderPath: string } {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
      if (data && data.lastFolderPath && fs.existsSync(data.lastFolderPath)) {
        return data;
      }
    }
  } catch {}
  return { lastFolderPath: "D:/OneDrive/Download/BW_Cut/videos" };
}

function saveSession(session: { lastFolderPath: string }) {
  try {
    const dir = path.dirname(SESSION_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save session:", e);
  }
}

function loadLogsFromDisk(): string[] {
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const raw = fs.readFileSync(LOGS_FILE, "utf-8");
      return raw.split("\n").map((l) => l.trim()).filter(Boolean).slice(-200);
    }
  } catch {}
  return [];
}

function appendLogToDisk(entry: string) {
  try {
    const dir = path.dirname(LOGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOGS_FILE, entry + "\n", "utf-8");
  } catch {}
}

function loadClipsFromDisk(): ClipData[] {
  try {
    if (fs.existsSync(CLIPS_STORE_FILE)) {
      const raw = fs.readFileSync(CLIPS_STORE_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Failed to load clips from disk:", e);
  }
  return [];
}

// Server state
let session = loadSession();
let currentFolderPath = session.lastFolderPath;
if (!fs.existsSync(currentFolderPath)) {
  currentFolderPath = path.resolve(".");
}

// Global persistent clip database (all folders preserved)
let allKnownClips: ClipData[] = loadClipsFromDisk();
// Currently active clips for currentFolderPath
let clips: ClipData[] = [];

function saveClipsToDisk() {
  try {
    // Sync current active clips into allKnownClips
    for (const active of clips) {
      const normActive = path.resolve(active.path).toLowerCase().replace(/\\/g, "/");
      const idx = allKnownClips.findIndex(
        (c) => path.resolve(c.path).toLowerCase().replace(/\\/g, "/") === normActive || c.id === active.id
      );
      if (idx !== -1) {
        allKnownClips[idx] = active;
      } else {
        allKnownClips.push(active);
      }
    }

    const dir = path.dirname(CLIPS_STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CLIPS_STORE_FILE, JSON.stringify(allKnownClips, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save clips to disk:", e);
  }
}

let renderQueue: RenderQueueItem[] = [];
let activeRenderer: DirectVideoRenderer | null = null;
let isRendering = false;
let logs: string[] = loadLogsFromDisk();

// SSE Clients
const sseClients = new Set<http.ServerResponse>();

function broadcastSSE(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {}
  }
}

function addLog(message: string) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${message}`;
  logs.push(entry);
  if (logs.length > 500) logs.shift();
  appendLogToDisk(entry);
  broadcastSSE({ type: "log", message: entry });
}

// MIME Types
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const COLOR_PRESETS = [
  { name: "เหลืองนีออน + ขาว", top: "#FFE600", bottom: "#FFFFFF" },
  { name: "ขาวคลีน + เหลืองนีออน", top: "#FFFFFF", bottom: "#FFE600" },
  { name: "เขียวมะนาว + ขาว", top: "#00FF66", bottom: "#FFFFFF" },
  { name: "ฟ้าสว่าง + ขาว", top: "#00E5FF", bottom: "#FFFFFF" },
  { name: "ส้มสะท้อนแสง + ขาว", top: "#FF6B00", bottom: "#FFFFFF" },
  { name: "ชมพูสดนีออน + ขาว", top: "#FF2A85", bottom: "#FFFFFF" },
  { name: "เหลืองนีออน + ฟ้าสด", top: "#FFE600", bottom: "#00E5FF" },
  { name: "แดงเตือนภัย + ขาว", top: "#FF3333", bottom: "#FFFFFF" },
  { name: "เขียวมิ้นท์พาสเทล + เหลืองนีออน", top: "#2EE59D", bottom: "#FFE600" },
  { name: "ม่วงพาสเทล + ขาว", top: "#C084FC", bottom: "#FFFFFF" },
];

/**
 * Scan video files in directory
 */
async function scanFolder(rawFolder: string): Promise<ClipData[]> {
  const folder = path.resolve(rawFolder.replace(/^["']|["']$/g, "").trim());
  if (!fs.existsSync(folder)) {
    throw new Error(`ไม่พบโฟลเดอร์: ${folder}`);
  }

  const validExts = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi"]);
  const entries = fs.readdirSync(folder, { withFileTypes: true });
  const videoFiles = entries.filter((e) => e.isFile() && validExts.has(path.extname(e.name).toLowerCase()));

  const settings = loadSettings();
  const outputDir = settings.outputDir || path.resolve("rendered");
  const result: ClipData[] = [];

  // Update and save current session folder
  currentFolderPath = folder;
  saveSession({ lastFolderPath: folder });

  // Refresh allKnownClips from disk if empty
  if (allKnownClips.length === 0) {
    allKnownClips = loadClipsFromDisk();
  }

  for (const file of videoFiles) {
    const fullPath = path.resolve(path.join(folder, file.name));
    const stats = fs.statSync(fullPath);
    const id = getFileHash(fullPath);

    // Check if output file already exists in rendered output directory
    const baseName = path.basename(file.name, path.extname(file.name));
    const renderedPath = path.join(outputDir, `${baseName}.mp4`);
    const isAlreadyRendered = fs.existsSync(renderedPath);

    // Reuse existing clip from allKnownClips (normalize path for comparison)
    const normFullPath = fullPath.toLowerCase().replace(/\\/g, "/");
    let existing = allKnownClips.find(
      (c) => path.resolve(c.path).toLowerCase().replace(/\\/g, "/") === normFullPath || c.id === id
    );

    if (existing) {
      existing.id = id;
      existing.path = fullPath;
      existing.name = file.name;
      existing.sizeBytes = stats.size;
      // Auto-detect status: rendered > ready > unprocessed
      if (isAlreadyRendered) {
        existing.status = "completed";
      } else if (existing.silence && existing.status === "unprocessed") {
        existing.status = "ready";
      }
      result.push(existing);
      continue;
    }

    // Determine headline colors: 10 Presets (Random) vs Uniform
    let clipTopColor = settings.topHeadlineColor || "#FFE600";
    let clipBottomColor = settings.bottomHeadlineColor || "#FFFFFF";

    if (settings.randomHeadlineColors !== false) {
      const preset = COLOR_PRESETS[result.length % COLOR_PRESETS.length];
      clipTopColor = preset.top;
      clipBottomColor = preset.bottom;
    }

    const newClip: ClipData = {
      id,
      name: file.name,
      path: fullPath,
      sizeBytes: stats.size,
      beautyLevel: settings.defaultBeauty || "none",
      enableCta: settings.defaultEnableCta !== false,
      headlineStartSec: 0.0,
      headlineEndSec: 10.0,
      fontFamily: settings.defaultFont,
      topFontSize: settings.topFontSize,
      bottomFontSize: settings.bottomFontSize,
      lineSpacing: settings.defaultLineSpacing || 68,
      topHeadlineColor: clipTopColor,
      bottomHeadlineColor: clipBottomColor,
      approved: isAlreadyRendered,
      status: isAlreadyRendered ? "completed" : "unprocessed",
    };
    allKnownClips.push(newClip);
    result.push(newClip);
  }

  clips = result;
  saveClipsToDisk();
  return clips;
}

/**
 * Background metadata & thumbnail loader for scanned clips
 */
async function loadThumbnailsAndMetadata(clipList: ClipData[]) {
  for (const clip of clipList) {
    try {
      if (!clip.metadata) {
        clip.metadata = await getVideoMetadata(clip.path);
      }
      if (!clip.thumbnailUrl) {
        const thumbPath = await getOrGenerateThumbnail(clip.path, clip.metadata?.durationSec || 1);
        clip.thumbnailUrl = `/api/thumb/${path.basename(thumbPath)}`;
      }
      saveClipsToDisk();
      broadcastSSE({ type: "clip-update", clip });
    } catch (e) {
      console.error(`Failed to process metadata for ${clip.name}:`, e);
    }
  }
}

/**
 * Render Queue Runner
 */
async function processRenderQueue() {
  if (isRendering) return;
  isRendering = true;

  const settings = loadSettings();
  const outputDir = settings.outputDir || path.resolve("rendered");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  addLog(`Starting render queue with ${renderQueue.filter((q) => q.status === "pending").length} clips.`);
  broadcastSSE({ type: "queue-update", queue: renderQueue, isRendering: true });

  for (const item of renderQueue) {
    if (item.status !== "pending") continue;

    item.status = "rendering";
    item.progress = 0;
    broadcastSSE({ type: "queue-update", queue: renderQueue, isRendering: true });

    const clip = clips.find((c) => c.id === item.clipId);
    if (!clip) {
      item.status = "failed";
      item.error = "Clip not found";
      continue;
    }

    clip.status = "rendering";
    broadcastSSE({ type: "clip-update", clip });

    activeRenderer = new DirectVideoRenderer();

    try {
      // Analyze silence if not yet analyzed
      if (!clip.silence) {
        addLog(`Analyzing silence for ${clip.name}...`);
        clip.silence = await analyzeSilence(clip.path, {
          thresholdDb: settings.silenceThresholdDb,
          minDurationSec: settings.minSilenceDurationSec,
          paddingSec: settings.paddingSec,
        });
      }

      const zoomLevelsArr = (settings.zoomLevels || "1.0, 1.2, 1.3, 1.4")
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n) && n > 0);

      await activeRenderer.render({
        videoPath: clip.path,
        outputPath: item.outputPath,
        audibleParts: clip.silence.audibleParts,
        headline: clip.headline
          ? {
              line1: clip.headline.line1,
              emoji1: clip.headline.emoji1,
              line2: clip.headline.line2,
              emoji2: clip.headline.emoji2,
            }
          : undefined,
        resolution: settings.defaultResolution,
        encoder: settings.defaultEncoder,
        beautyLevel: clip.beautyLevel || settings.defaultBeauty,
        enableCta: clip.enableCta !== false && settings.defaultEnableCta !== false,
        headlineStartSec: clip.headlineStartSec,
        headlineEndSec: clip.headlineEndSec,
        fontFamily: clip.fontFamily || settings.defaultFont,
        topFontSize: clip.topFontSize || settings.topFontSize,
        bottomFontSize: clip.bottomFontSize || settings.bottomFontSize,
        topColorHex: clip.topHeadlineColor || settings.topHeadlineColor,
        bottomColorHex: clip.bottomHeadlineColor || settings.bottomHeadlineColor,
        lineSpacing: clip.lineSpacing || settings.defaultLineSpacing || 68,
        randomZoom: clip.randomZoom ?? settings.randomZoom,
        zoomLevels: zoomLevelsArr.length > 0 ? zoomLevelsArr : [1.0, 1.2, 1.3, 1.4],
        maxCutDurationSec: settings.maxCutDurationSec || 4.0,
        enableHookZoom: clip.enableHookZoom ?? settings.enableHookZoom,
        hookZoomDurationSec: clip.hookZoomDurationSec ?? settings.hookZoomDurationSec ?? 4.0,
        hookZoomScalePercent: clip.hookZoomScalePercent ?? settings.hookZoomScalePercent ?? 120,
        onProgress: (prog) => {
          item.progress = prog.percent;
          item.speed = prog.speed;
          item.fps = prog.fps;
          item.etaSec = prog.etaSec;
          broadcastSSE({
            type: "render-progress",
            jobId: item.id,
            progress: prog,
            queue: renderQueue,
          });
        },
        onLog: (msg) => addLog(msg),
      });

      item.status = "completed";
      item.progress = 100;
      clip.status = "completed";
      saveClipsToDisk();
      addLog(`Render completed: ${path.basename(item.outputPath)}`);

      // Push notification via ntfy
      if (settings.ntfyEnabled && settings.ntfyTopic) {
        sendRenderCompletedNotification(settings.ntfyTopic, clip.name, clip.metadata?.durationSec || 0).catch(() => {});
      }
    } catch (err: any) {
      if (err.message?.includes("cancelled")) {
        item.status = "cancelled";
        clip.status = "ready";
        addLog(`Render cancelled for: ${clip.name}`);
        break;
      } else {
        item.status = "failed";
        item.error = err.message || "Render error";
        clip.status = "error";
        clip.error = item.error;
        addLog(`Render failed for ${clip.name}: ${item.error}`);
      }
    } finally {
      activeRenderer = null;
      broadcastSSE({ type: "queue-update", queue: renderQueue, isRendering: true });
      broadcastSSE({ type: "clip-update", clip });
    }
  }

  isRendering = false;
  addLog("All render jobs processed.");
  broadcastSSE({ type: "queue-update", queue: renderQueue, isRendering: false });

  // Batch completion notification
  const currentSettings = loadSettings();
  const completedInQueue = renderQueue.filter((q) => q.status === "completed").length;
  if (currentSettings.ntfyEnabled && currentSettings.ntfyTopic && completedInQueue > 0) {
    sendBatchCompletedNotification(currentSettings.ntfyTopic, completedInQueue, 0).catch(() => {});
  }
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;
  const method = req.method || "GET";

  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── API ROUTES ─────────────────────────────────────────────────────────────

  // SSE Stream
  if (pathname === "/api/render-events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseClients.add(res);

    // Send initial state
    res.write(`data: ${JSON.stringify({ type: "init", clips, queue: renderQueue, isRendering, logs })}\n\n`);

    req.on("close", () => {
      sseClients.delete(res);
    });
    return;
  }

  // System status
  if (pathname === "/api/system" && method === "GET") {
    try {
      const ffmpeg = findFfmpeg();
      const encoder = detectBestEncoder();
      const settings = loadSettings();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          ffmpegPath: ffmpeg,
          bestEncoder: encoder,
          currentFolderPath,
          settings,
        })
      );
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // Scan folder
  if (pathname === "/api/scan" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const json = body ? JSON.parse(body) : {};
        let folder = (json.folderPath || currentFolderPath || "").trim();
        folder = folder.replace(/^["']|["']$/g, "").trim();
        if (!folder) throw new Error("กรุณาระบุโฟลเดอร์วิดีโอ");
        currentFolderPath = folder;

        const scanned = await scanFolder(folder);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, clips: scanned, folderPath: folder }));

        // Load thumbnails and metadata in background
        loadThumbnailsAndMetadata(scanned);
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Serve Thumbnail
  if (pathname.startsWith("/api/thumb/")) {
    const filename = path.basename(pathname);
    const thumbPath = path.resolve("temp/thumbs", filename);
    if (fs.existsSync(thumbPath)) {
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
      fs.createReadStream(thumbPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end("Thumbnail not found");
    }
    return;
  }

  // Serve Audio Waveform Image
  if (pathname.startsWith("/api/waveform/")) {
    const rawId = path.basename(pathname).replace(/\.png$/i, "");
    const clip = clips.find((c) => c.id === rawId) || allKnownClips.find((c) => c.id === rawId);
    if (!clip || !fs.existsSync(clip.path)) {
      res.writeHead(404);
      res.end("Clip not found");
      return;
    }

    const waveDir = path.resolve("temp/waveforms");
    if (!fs.existsSync(waveDir)) fs.mkdirSync(waveDir, { recursive: true });
    const wavePath = path.join(waveDir, `${clip.id}.png`);

    if (!fs.existsSync(wavePath)) {
      try {
        const ffmpeg = findFfmpeg();
        // Generate crisp 1200x64 PNG waveform using showwavespic in ~0.2s
        spawnSync(ffmpeg, [
          "-y",
          "-i", clip.path,
          "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=1200x64:colors=#0ea5e9",
          "-frames:v", "1",
          wavePath,
        ]);
      } catch (err: any) {
        res.writeHead(500);
        res.end("Failed to generate waveform: " + err.message);
        return;
      }
    }

    if (fs.existsSync(wavePath)) {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" });
      fs.createReadStream(wavePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end("Waveform generation failed");
    }
    return;
  }

  // Video Streaming with Range requests for instant preview seeking
  if (pathname === "/api/stream") {
    const videoPath = parsedUrl.searchParams.get("path") || "";
    if (!videoPath || !fs.existsSync(videoPath)) {
      res.writeHead(404);
      res.end("Video not found");
      return;
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(videoPath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
      });
      fs.createReadStream(videoPath).pipe(res);
    }
    return;
  }

  // Analyze Silence for a single clip
  if (pathname === "/api/analyze-silence" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { clipId, thresholdDb, minDurationSec, paddingSec } = JSON.parse(body);
        const clip = clips.find((c) => c.id === clipId);
        if (!clip) throw new Error("Clip not found");

        const silence = await analyzeSilence(clip.path, {
          thresholdDb: thresholdDb !== undefined ? parseFloat(thresholdDb) : undefined,
          minDurationSec: minDurationSec !== undefined ? parseFloat(minDurationSec) : undefined,
          paddingSec: paddingSec !== undefined ? parseFloat(paddingSec) : undefined,
          useCache: false,
        });

        clip.silence = silence;
        if (clip.status === "unprocessed") clip.status = "ready";
        saveClipsToDisk();
        broadcastSSE({ type: "clip-update", clip });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, silence }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Generate Headline for a single clip
  if (pathname === "/api/generate-headline" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { clipId, preferredAi } = JSON.parse(body);
        const clip = clips.find((c) => c.id === clipId);
        if (!clip) throw new Error("Clip not found");

        const settings = loadSettings();
        const headline = await generateHeadline(clip.path, {
          preferredAi: preferredAi || settings.preferredAi,
          geminiApiKey: settings.geminiApiKey,
          groqApiKey: settings.groqApiKey,
          useCache: false,
          onLog: (msg) => addLog(msg),
        });

        clip.headline = headline;
        saveClipsToDisk();
        broadcastSSE({ type: "clip-update", clip });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, headline }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Update clip properties (manual edit of headline, beauty level, approval, spacing, CTA, timing)
  if (pathname === "/api/update-clip" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { clipId, headline, beautyLevel, approved, status, fontFamily, topFontSize, bottomFontSize, lineSpacing, silence, enableCta, randomZoom, enableHookZoom, hookZoomDurationSec, hookZoomScalePercent, headlineStartSec, headlineEndSec, topHeadlineColor, bottomHeadlineColor, productCode } = JSON.parse(body);
        const clip = clips.find((c) => c.id === clipId);
        if (!clip) throw new Error("Clip not found");

        if (headline) clip.headline = { ...(clip.headline || { source: "fallback" }), ...headline };
        if (beautyLevel) clip.beautyLevel = beautyLevel;
        if (approved !== undefined) {
          clip.approved = approved;
          if (clip.status !== "rendering" && clip.status !== "completed") {
            clip.status = approved ? "approved" : (clip.silence ? "ready" : "unprocessed");
          }
        }
        if (status !== undefined) clip.status = status;
        if (fontFamily !== undefined) clip.fontFamily = fontFamily;
        if (topFontSize !== undefined) clip.topFontSize = parseInt(topFontSize, 10);
        if (bottomFontSize !== undefined) clip.bottomFontSize = parseInt(bottomFontSize, 10);
        if (lineSpacing !== undefined) clip.lineSpacing = parseInt(lineSpacing, 10);
        if (silence) clip.silence = silence;
        if (enableCta !== undefined) clip.enableCta = Boolean(enableCta);
        if (randomZoom !== undefined) clip.randomZoom = Boolean(randomZoom);
        if (enableHookZoom !== undefined) clip.enableHookZoom = Boolean(enableHookZoom);
        if (hookZoomDurationSec !== undefined) clip.hookZoomDurationSec = parseFloat(hookZoomDurationSec);
        if (hookZoomScalePercent !== undefined) clip.hookZoomScalePercent = parseInt(hookZoomScalePercent, 10);
        if (headlineStartSec !== undefined) clip.headlineStartSec = parseFloat(headlineStartSec);
        if (headlineEndSec !== undefined) clip.headlineEndSec = parseFloat(headlineEndSec);
        if (topHeadlineColor !== undefined) clip.topHeadlineColor = topHeadlineColor;
        if (bottomHeadlineColor !== undefined) clip.bottomHeadlineColor = bottomHeadlineColor;
        if (productCode !== undefined) clip.productCode = productCode;

        saveClipsToDisk();
        broadcastSSE({ type: "clip-update", clip });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, clip }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Batch Auto-Analyze (Silence + AI Hook) for all or selected clips
  if (pathname === "/api/batch-analyze" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { clipIds, mode, forceReheadline } = JSON.parse(body || "{}");
        const isSilenceOnly = mode === "silence-only";
        const isHeadlineOnly = mode === "headline-only";
        if (!clipIds || !Array.isArray(clipIds) || clipIds.length === 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "กรุณาเลือกคลิปที่ต้องการประมวลผลก่อนครับ" }));
          return;
        }
        const targets = clips.filter((c) => clipIds.includes(c.id));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: targets.length }));

        const settings = loadSettings();

        // Process in sequential loop for stability and rate-limit safety
        (async () => {
          for (const clip of targets) {
            try {
              clip.status = "analyzing";
              broadcastSSE({ type: "clip-update", clip });

              if (isHeadlineOnly) {
                addLog(`💡 ให้ AI คิดพาดหัวใหม่: ${clip.name}...`);
              } else if (isSilenceOnly) {
                addLog(`⚡ ตัดเสียงเงียบ (ออฟไลน์ 100%): ${clip.name}...`);
              } else {
                addLog(`🤖 กำลังตัดเสียง + คิดพาดหัว AI: ${clip.name}...`);
              }

              // 1. Silence (only when not in headline-only mode)
              if (!isHeadlineOnly && !clip.silence) {
                clip.silence = await analyzeSilence(clip.path, {
                  thresholdDb: settings.silenceThresholdDb,
                  minDurationSec: settings.minSilenceDurationSec,
                  paddingSec: settings.paddingSec,
                });
              }

              // 2. AI Headline
              // Regenerate if in headline-only mode, forceReheadline=true, or full mode, or clip has no headline yet
              const shouldDoHeadline = !isSilenceOnly && (isHeadlineOnly || forceReheadline || !clip.headline);
              if (shouldDoHeadline) {
                clip.headline = await generateHeadline(clip.path, {
                  preferredAi: settings.preferredAi,
                  geminiApiKey: settings.geminiApiKey,
                  groqApiKey: settings.groqApiKey,
                  useCache: false, // Force fresh calculation with current prompt & models
                  onLog: (msg) => addLog(msg),
                });
              }

              clip.status = "ready";
              clip.approved = false; // User must manually QC approve
              clip.error = undefined;
              saveClipsToDisk();
              broadcastSSE({ type: "clip-update", clip });

              if (shouldDoHeadline && clip.headline) {
                addLog(`✅ คิดพาดหัวสำเร็จ: ${clip.name} -> "${clip.headline.line1} ${clip.headline.emoji1}" / "${clip.headline.line2} ${clip.headline.emoji2}"`);
              } else {
                addLog(`✅ ประมวลผลสำเร็จ: ${clip.name} (ตัดออก: ${clip.silence?.percentTrimmed || 0}%)`);
              }
            } catch (e: any) {
              clip.status = "error";
              clip.error = e.message;
              broadcastSSE({ type: "clip-update", clip });
              addLog(`❌ ข้อผิดพลาดกับ ${clip.name}: ${e.message}`);
            }
          }
        })();
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Render Batch
  if (pathname === "/api/render-batch" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { clipIds, clipOverrides } = JSON.parse(body || "{}");
        if (clipOverrides && typeof clipOverrides === "object") {
          for (const [id, overrides] of Object.entries(clipOverrides)) {
            const c = clips.find((item) => item.id === id);
            if (c && typeof overrides === "object") {
              Object.assign(c, overrides);
            }
          }
          saveClipsToDisk();
        }
        const settings = loadSettings();
        const outputDir = settings.outputDir || path.resolve("rendered");

        const targets = clipIds && clipIds.length > 0 ? clips.filter((c) => clipIds.includes(c.id)) : clips.filter((c) => c.approved && c.status !== "completed");

        if (targets.length === 0) {
          throw new Error("No approved clips to render");
        }

        renderQueue = targets.map((c) => {
          const baseName = path.basename(c.name, path.extname(c.name));
          const cleanCode = c.productCode ? c.productCode.trim().replace(/[^a-zA-Z0-9_-]/g, '') : '';
          const codePrefix = cleanCode ? `${cleanCode.toUpperCase()}_` : '';
          return {
            id: `job_${c.id}_${Date.now()}`,
            clipId: c.id,
            name: c.name,
            inputPath: c.path,
            outputPath: path.join(outputDir, `${codePrefix}${baseName}.mp4`),
            status: "pending",
            progress: 0,
            speed: "0.0x",
            fps: 0,
            etaSec: 0,
          };
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, queued: renderQueue.length }));

        // Start processing queue
        processRenderQueue();
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Cancel Render
  if (pathname === "/api/cancel-render" && method === "POST") {
    if (activeRenderer) {
      activeRenderer.cancel();
      addLog("Render cancelled by user request.");
    }
    isRendering = false;
    for (const q of renderQueue) {
      if (q.status === "pending" || q.status === "rendering") {
        q.status = "cancelled";
      }
    }
    broadcastSSE({ type: "queue-update", queue: renderQueue, isRendering: false });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Open output folder in Explorer
  if (pathname === "/api/open-output" && method === "POST") {
    const settings = loadSettings();
    const outputDir = settings.outputDir || path.resolve("rendered");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    openInExplorer(outputDir);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Clear Temp Cache Files
  if (pathname === "/api/clear-temp" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { clearClipsStore } = JSON.parse(body || "{}");
        const tempDir = path.resolve("temp");
        let deletedCount = 0;
        let freedBytes = 0;

        if (fs.existsSync(tempDir)) {
          const subDirs = ["headlines", "overlays", "silence", "snippets", "subtitles", "thumbs"];
          for (const sub of subDirs) {
            const subPath = path.join(tempDir, sub);
            if (fs.existsSync(subPath)) {
              for (const f of fs.readdirSync(subPath)) {
                const p = path.join(subPath, f);
                try {
                  const st = fs.statSync(p);
                  if (st.isFile()) {
                    freedBytes += st.size;
                    fs.unlinkSync(p);
                    deletedCount++;
                  }
                } catch {}
              }
            }
          }

          // Loose files in temp
          for (const f of fs.readdirSync(tempDir)) {
            const p = path.join(tempDir, f);
            try {
              const st = fs.statSync(p);
              if (st.isFile()) {
                if (f === "clips_store.json" && !clearClipsStore) continue;
                freedBytes += st.size;
                fs.unlinkSync(p);
                deletedCount++;
              }
            } catch {}
          }
        }

        if (clearClipsStore) {
          clips = [];
          renderQueue = [];
          broadcastSSE({ type: "clips-loaded", clips: [] });
          broadcastSSE({ type: "queue-update", queue: [], isRendering: false });
        }

        const mb = (freedBytes / (1024 * 1024)).toFixed(2);
        addLog(`🧹 เคลียร์แคชชั่วคราวเสร็จสิ้น: ลบ ${deletedCount} ไฟล์ (ประหยัดพื้นที่ ${mb} MB)`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, deletedCount, freedMb: mb }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Settings
  if (pathname === "/api/settings") {
    if (method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(loadSettings()));
      return;
    }
    if (method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const updated = saveSettings(JSON.parse(body));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, settings: updated }));
        } catch (e: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
  }

  // Apply Headline Colors to all clips (Uniform or Random 10 Presets)
  if (pathname === "/api/apply-colors" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { mode, topColor, bottomColor } = JSON.parse(body || "{}");
        const settings = loadSettings();

        if (mode === "random") {
          clips.forEach((clip, idx) => {
            const preset = COLOR_PRESETS[idx % COLOR_PRESETS.length];
            clip.topHeadlineColor = preset.top;
            clip.bottomHeadlineColor = preset.bottom;
          });
          allKnownClips.forEach((clip, idx) => {
            const preset = COLOR_PRESETS[idx % COLOR_PRESETS.length];
            clip.topHeadlineColor = preset.top;
            clip.bottomHeadlineColor = preset.bottom;
          });
          saveSettings({ randomHeadlineColors: true });
        } else {
          const finalTop = topColor || settings.topHeadlineColor || "#FFE600";
          const finalBot = bottomColor || settings.bottomHeadlineColor || "#FFFFFF";
          clips.forEach((clip) => {
            clip.topHeadlineColor = finalTop;
            clip.bottomHeadlineColor = finalBot;
          });
          allKnownClips.forEach((clip) => {
            clip.topHeadlineColor = finalTop;
            clip.bottomHeadlineColor = finalBot;
          });
          saveSettings({
            randomHeadlineColors: false,
            topHeadlineColor: finalTop,
            bottomHeadlineColor: finalBot,
          });
        }

        saveClipsToDisk();
        broadcastSSE({ type: "clips-loaded", clips });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: clips.length }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ─── COMMERCIAL & SYSTEM ENDPOINTS ──────────────────────────────────────────

  // Network Info for Mobile Device Connection & QR Code
  if (pathname === "/api/network-info") {
    const localIp = getLocalIpAddress();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        localIp,
        port: PORT,
        mobileUrl: `http://${localIp}:${PORT}`,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=http://${localIp}:${PORT}`,
      })
    );
    return;
  }

  // License Status Check
  if (pathname === "/api/license/status") {
    const settings = loadSettings();
    const status = await validateLicense(settings.gasServerUrl);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, license: status }));
    return;
  }

  // License Activation
  if (pathname === "/api/license/activate" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { key } = JSON.parse(body || "{}");
        const settings = loadSettings();
        const result = await activateLicense(key, settings.gasServerUrl);
        if (result.success) {
          saveSettings({ licenseKey: key });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, message: e.message }));
      }
    });
    return;
  }

  // ntfy Test Notification
  if (pathname === "/api/ntfy/test" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { topic } = JSON.parse(body || "{}");
        const settings = loadSettings();
        const targetTopic = topic || settings.ntfyTopic || "bwcut-alerts";
        const result = await sendNtfyNotification({
          topic: targetTopic,
          title: "🔔 ทดสอบแจ้งเตือน BWCut Studio",
          message: "การแจ้งเตือนเข้ามือถือทำงานได้อย่างถูกต้องแล้วครับ!",
          priority: "high",
          tags: ["bell", "sparkles"],
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: result.success, error: result.error }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Check for updates
  if (pathname === "/api/system/update-check") {
    const settings = loadSettings();
    const lic = getStoredLicense();
    let updateResult;
    if (lic.channel === "zip" && settings.gasServerUrl) {
      updateResult = await checkZipUpdate(settings.gasServerUrl);
    } else {
      updateResult = checkGitUpdate();
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, update: updateResult }));
    return;
  }

  // Apply Git update
  if (pathname === "/api/system/update-apply" && method === "POST") {
    const lic = getStoredLicense();
    if (lic.channel === "git") {
      const result = applyGitUpdate();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: "ระบบ ZIP อัปเดตจะปรับใช้เมื่อเปิดโปรแกรมใหม่" }));
    }
    return;
  }

  // Admin Dashboard Overview (Localhost only)
  if (pathname === "/api/admin/overview") {
    const ip = req.socket.remoteAddress || "";
    const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    if (!isLocal) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Admin dashboard is only accessible from host machine" }));
      return;
    }

    const license = getStoredLicense();
    const version = getCurrentVersion();
    const completedCount = clips.filter((c) => c.status === "completed").length;
    const readyCount = clips.filter((c) => c.status === "ready" || c.status === "approved").length;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        version,
        license,
        stats: {
          totalClips: clips.length,
          completedCount,
          readyCount,
          queueLength: renderQueue.length,
        },
        system: {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          totalMemGb: (os.totalmem() / 1024 ** 3).toFixed(1),
          freeMemGb: (os.freemem() / 1024 ** 3).toFixed(1),
          uptimeHours: (os.uptime() / 3600).toFixed(1),
        },
      })
    );
    return;
  }

  // ─── STATIC FILE SERVING ───────────────────────────────────────────────────
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  if (safePath === "/" || safePath === "\\") safePath = "/index.html";

  // Dedicated font serving
  if (safePath.startsWith("/fonts/") || safePath.startsWith("\\fonts\\") || safePath.startsWith("fonts/") || safePath.startsWith("fonts\\")) {
    const relFont = safePath.replace(/^[\\\/]?fonts[\\\/]/, "");
    const fontFilePath = path.join(path.resolve("fonts"), relFont);
    if (fs.existsSync(fontFilePath) && fs.statSync(fontFilePath).isFile()) {
      const ext = path.extname(fontFilePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "font/ttf",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(fontFilePath).pipe(res);
      return;
    }
  }

  const staticDir = path.resolve("src/public");
  const filePath = path.join(staticDir, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const isDevAsset = ext === ".html" || ext === ".css" || ext === ".js";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": isDevAsset ? "no-cache, no-store, must-revalidate" : "public, max-age=86400",
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

function getLocalIpAddress(): string {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {}
  return "127.0.0.1";
}

server.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ ข้อผิดพลาด: พอร์ต ${PORT} กำลังถูกใช้งานอยู่โดยโปรแกรมอื่น`);
    console.error(`👉 คุณสามารถเปิดผ่าน run.bat ซึ่งจะทำการรีเซ็ตพอร์ตและเปิดโปรแกรมให้โดยอัตโนมัติครับ\n`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
  }
});

server.listen(PORT, async () => {
  const cyan = "\x1b[96m";
  const yellow = "\x1b[93m";
  const green = "\x1b[92m";
  const white = "\x1b[97m";
  const dim = "\x1b[90m";
  const bold = "\x1b[1m";
  const reset = "\x1b[0m";
  const localIp = getLocalIpAddress();

  console.log(`\n${cyan}${bold}   ██████╗  ██╗    ██╗  ${yellow} ██████╗  ██╗   ██╗ ████████╗${reset}`);
  console.log(`${cyan}${bold}   ██╔══██╗ ██║    ██║  ${yellow}██╔════╝  ██║   ██║ ╚══██╔══╝${reset}`);
  console.log(`${cyan}${bold}   ██████╔╝ ██║ █╗ ██║  ${yellow}██║       ██║   ██║    ██║   ${reset}`);
  console.log(`${cyan}${bold}   ██╔══██╗ ██║███╗██║  ${yellow}██║       ██║   ██║    ██║   ${reset}`);
  console.log(`${cyan}${bold}   ██████╔╝ ╚███╔███╔╝  ${yellow}╚██████╗  ╚██████╔╝    ██║   ${reset}`);
  console.log(`${cyan}${bold}   ╚═════╝   ╚══╝╚══╝   ${yellow} ╚═════╝   ╚═════╝     ╚═╝   ${reset}`);
  console.log(`\n${white}${bold}   ⚡ BWCUT STUDIO — High-Speed Video Editor & Batch Processor ⚡${reset}`);
  console.log(`${dim}   ────────────────────────────────────────────────────────────${reset}`);
  console.log(`${dim}   💻 Local PC      : ${green}${bold}http://localhost:${PORT}${reset}`);
  console.log(`${dim}   📱 iPad / Wi-Fi  : ${cyan}${bold}http://${localIp}:${PORT}${reset} ${dim}(เปิดบน Safari/Chrome)${reset}`);
  console.log(`${dim}   📂 Studio Status : ${white}Ready for high-speed batch video editing${reset}`);
  console.log(`${dim}   🛑 Stop Server   : ${dim}Press Ctrl + C or close window to exit${reset}`);
  console.log(`${dim}   ────────────────────────────────────────────────────────────\n${reset}`);

  // Auto-scan last session folder on startup so state is ready immediately
  if (currentFolderPath && fs.existsSync(currentFolderPath)) {
    scanFolder(currentFolderPath)
      .then((scanned) => {
        loadThumbnailsAndMetadata(scanned);
        console.log(`Loaded ${scanned.length} clips from session folder: ${currentFolderPath}`);
      })
      .catch((err) => console.error("Initial scan error:", err));
  }

  // Auto-open default browser for seamless one-click experience
  try {
    const { exec } = await import("node:child_process");
    exec(`start http://localhost:${PORT}`);
  } catch {}
});
