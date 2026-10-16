/**
 * ffmpeg.ts — FFmpeg Discovery, Media Analysis & Thumbnail Utilities for BWCut Studio
 * Created by fasterpsu (BW OS)
 */

import { join, resolve, basename, extname } from "node:path";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawnSync, exec, execSync } from "node:child_process";
import { createHash } from "node:crypto";

let cachedFfmpegPath: string | null = null;
let cachedFfprobePath: string | null = null;
let cachedBestEncoder: "h264_amf" | "h264_nvenc" | "libx264" | null = null;

export function findFfmpeg(): string {
  if (cachedFfmpegPath && existsSync(cachedFfmpegPath)) return cachedFfmpegPath;

  // 1. Check bundled or common system paths
  const commonCandidates = [
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    resolve("bin/ffmpeg.exe"),
    resolve("bin/ffmpeg"),
    resolve("ffmpeg.exe"),
    resolve("ffmpeg"),
    join(resolve("."), "bin", "ffmpeg.exe"),
  ];
  for (const c of commonCandidates) {
    if (existsSync(c)) {
      cachedFfmpegPath = c;
      return c;
    }
  }

  // 2. Check system PATH
  try {
    const isWin = process.platform === "win32";
    const cmdResult = isWin 
      ? spawnSync("cmd", ["/c", "where", "ffmpeg"], { encoding: "utf-8", stdio: "pipe" })
      : spawnSync("which", ["ffmpeg"], { encoding: "utf-8", stdio: "pipe" });
    if (cmdResult.status === 0 && cmdResult.stdout?.trim()) {
      const found = cmdResult.stdout.trim().split(/\r?\n/)[0].trim();
      cachedFfmpegPath = found;
      return found;
    }
  } catch(e) {}

  // 3. Check winget
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (home) {
    const wingetBase = join(home, "AppData", "Local", "Microsoft", "WinGet", "Packages");
    if (existsSync(wingetBase)) {
      try {
        const dirs = readdirSync(wingetBase);
        const ffmpegDir = dirs.find((d) => d.startsWith("Gyan.FFmpeg"));
        if (ffmpegDir) {
          const candidate = join(wingetBase, ffmpegDir, "bin", "ffmpeg.exe");
          if (existsSync(candidate)) {
            cachedFfmpegPath = candidate;
            return candidate;
          }
        }
      } catch {}
    }
  }

  throw new Error("FFmpeg not found. Please ensure ffmpeg is installed or placed in bin/ folder.");
}

export function findFfprobe(): string {
  if (cachedFfprobePath && existsSync(cachedFfprobePath)) return cachedFfprobePath;

  // 1. Check common candidates
  const commonCandidates = [
    "/usr/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    resolve("bin/ffprobe.exe"),
    resolve("bin/ffprobe"),
    resolve("ffprobe.exe"),
    resolve("ffprobe"),
    join(resolve("."), "bin", "ffprobe.exe"),
  ];
  for (const c of commonCandidates) {
    if (existsSync(c)) {
      cachedFfprobePath = c;
      return c;
    }
  }

  try {
    const ffmpeg = findFfmpeg();
    const candidate = ffmpeg.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
    if (existsSync(candidate)) {
      cachedFfprobePath = candidate;
      return candidate;
    }
  } catch {}

  try {
    const isWin = process.platform === "win32";
    const cmdResult = isWin
      ? spawnSync("cmd", ["/c", "where", "ffprobe"], { encoding: "utf-8", stdio: "pipe" })
      : spawnSync("which", ["ffprobe"], { encoding: "utf-8", stdio: "pipe" });
    if (cmdResult.status === 0 && cmdResult.stdout?.trim()) {
      const found = cmdResult.stdout.trim().split(/\r?\n/)[0].trim();
      cachedFfprobePath = found;
      return found;
    }
  } catch(e) {}

  return "ffprobe";
}

export function detectBestEncoder(): "h264_amf" | "h264_nvenc" | "libx264" {
  if (cachedBestEncoder) return cachedBestEncoder;

  try {
    const ffmpeg = findFfmpeg();

    // Probe h264_nvenc with an active 1-frame test
    const testNvenc = spawnSync(ffmpeg, [
      "-f", "lavfi",
      "-i", "color=c=black:s=64x64:d=0.04",
      "-c:v", "h264_nvenc",
      "-f", "null",
      "-"
    ], { stdio: "pipe" });
    if (testNvenc.status === 0) {
      cachedBestEncoder = "h264_nvenc";
      return "h264_nvenc";
    }

    // Probe h264_amf with an active 1-frame test
    const testAmf = spawnSync(ffmpeg, [
      "-f", "lavfi",
      "-i", "color=c=black:s=64x64:d=0.04",
      "-c:v", "h264_amf",
      "-f", "null",
      "-"
    ], { stdio: "pipe" });
    if (testAmf.status === 0) {
      cachedBestEncoder = "h264_amf";
      return "h264_amf";
    }
  } catch {}

  cachedBestEncoder = "libx264";
  return "libx264";
}

export interface VideoMetadata {
  width: number;
  height: number;
  durationSec: number;
  durationFormatted: string;
  fps: number;
  bitrate: number;
  hasAudio: boolean;
}

export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const ffprobe = findFfprobe();
  return new Promise((resolvePromise, reject) => {
    const args = [
      "-v", "error",
      "-show_entries", "format=duration,bit_rate:stream=width,height,r_frame_rate,codec_type",
      "-of", "json",
      filePath
    ];

    exec(`"${ffprobe}" ${args.join(" ")}`, (err, stdout) => {
      if (err) {
        // Fallback with ffmpeg -i
        try {
          const ffmpeg = findFfmpeg();
          const proc = spawnSync(ffmpeg, ["-i", filePath], { encoding: "utf-8" });
          const out = proc.stderr || "";
          const durMatch = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
          let duration = 0;
          if (durMatch) {
            duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
          }
          const resMatch = out.match(/,\s*(\d{3,5})x(\d{3,5})/);
          const width = resMatch ? parseInt(resMatch[1]) : 1080;
          const height = resMatch ? parseInt(resMatch[2]) : 1920;
          return resolvePromise({
            width,
            height,
            durationSec: duration,
            durationFormatted: formatDuration(duration),
            fps: 30,
            bitrate: 0,
            hasAudio: out.includes("Audio:"),
          });
        } catch (e) {
          return reject(err);
        }
      }

      try {
        const data = JSON.parse(stdout);
        let width = 1080;
        let height = 1920;
        let fps = 30;
        let hasAudio = false;

        if (data.streams) {
          for (const s of data.streams) {
            if (s.codec_type === "video") {
              if (s.width) width = s.width;
              if (s.height) height = s.height;
              if (s.r_frame_rate) {
                const parts = s.r_frame_rate.split("/");
                if (parts.length === 2 && parseFloat(parts[1]) > 0) {
                  fps = Math.round(parseFloat(parts[0]) / parseFloat(parts[1]));
                }
              }
            } else if (s.codec_type === "audio") {
              hasAudio = true;
            }
          }
        }

        const duration = parseFloat(data.format?.duration || "0");
        const bitrate = parseInt(data.format?.bit_rate || "0");

        resolvePromise({
          width,
          height,
          durationSec: duration,
          durationFormatted: formatDuration(duration),
          fps,
          bitrate,
          hasAudio,
        });
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

export function getFileHash(filePath: string): string {
  return createHash("md5").update(resolve(filePath)).digest("hex").slice(0, 16);
}

/**
 * Generate a thumbnail JPG for the video.
 */
export async function getOrGenerateThumbnail(videoPath: string, durationSec = 1): Promise<string> {
  const hash = getFileHash(videoPath);
  const thumbsDir = resolve("temp/thumbs");
  if (!existsSync(thumbsDir)) mkdirSync(thumbsDir, { recursive: true });

  const thumbPath = join(thumbsDir, `${hash}.jpg`);
  if (existsSync(thumbPath)) return thumbPath;

  const ffmpeg = findFfmpeg();
  const seekTime = Math.min(0.5, Math.max(0, durationSec * 0.1));

  return new Promise((resolvePromise, reject) => {
    // Extract single frame at 0.5s or 10%
    const cmd = `"${ffmpeg}" -y -ss ${seekTime.toFixed(2)} -i "${videoPath.replace(/\\/g, "/")}" -frames:v 1 -update 1 -q:v 3 -vf "scale=480:-1" "${thumbPath.replace(/\\/g, "/")}"`;
    exec(cmd, (err) => {
      if (err) {
        // Retry at 0s
        const fallbackCmd = `"${ffmpeg}" -y -i "${videoPath.replace(/\\/g, "/")}" -frames:v 1 -update 1 -q:v 3 -vf "scale=480:-1" "${thumbPath.replace(/\\/g, "/")}"`;
        exec(fallbackCmd, (fallbackErr) => {
          if (fallbackErr) return reject(fallbackErr);
          resolvePromise(thumbPath);
        });
      } else {
        resolvePromise(thumbPath);
      }
    });
  });
}

/**
 * Extract 18-second audio snippet as 16kHz mono MP3 for fast AI transcription.
 */
export async function extractAudioSnippet(videoPath: string, durationSec = 18): Promise<string> {
  const hash = getFileHash(videoPath);
  const snippetsDir = resolve("temp/snippets");
  if (!existsSync(snippetsDir)) mkdirSync(snippetsDir, { recursive: true });

  const snippetPath = join(snippetsDir, `snippet-${hash}.mp3`);
  if (existsSync(snippetPath)) return snippetPath;

  const ffmpeg = findFfmpeg();
  return new Promise((resolvePromise, reject) => {
    const cmd = `"${ffmpeg}" -y -i "${videoPath.replace(/\\/g, "/")}" -t ${durationSec} -vn -ar 16000 -ac 1 -q:a 5 "${snippetPath.replace(/\\/g, "/")}"`;
    exec(cmd, { timeout: 30000 }, (err) => {
      if (err) return reject(err);
      resolvePromise(snippetPath);
    });
  });
}


/**
 * Open Windows Explorer at path.
 */
export function openInExplorer(folderPath: string) {
  try {
    spawnSync("explorer.exe", [resolve(folderPath)], { stdio: "ignore" });
  } catch {}
}
