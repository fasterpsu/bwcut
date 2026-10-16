/**
 * silence.ts — Audio Silence Detection & Segment Calculation for BWCut Studio
 * Created by fasterpsu (BW OS)
 */

import { resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { getFileHash, formatDuration, findFfmpeg, getVideoMetadata } from "./ffmpeg.js";

export interface TimeRange {
  startInSeconds: number;
  endInSeconds: number;
  durationInSeconds: number;
}

export interface SilenceAnalysisResult {
  videoPath: string;
  originalDurationSec: number;
  originalDurationFormatted: string;
  keptDurationSec: number;
  keptDurationFormatted: string;
  removedDurationSec: number;
  removedDurationFormatted: string;
  percentTrimmed: number;
  audibleParts: TimeRange[];
  silentParts: TimeRange[];
  thresholdDb: number;
  minDurationSec: number;
  paddingSec: number;
}

export async function analyzeSilence(
  videoPath: string,
  options: {
    thresholdDb?: number;
    minDurationSec?: number;
    paddingSec?: number;
    useCache?: boolean;
  } = {}
): Promise<SilenceAnalysisResult> {
  const thresholdDb = options.thresholdDb ?? -20;
  const minDurationSec = options.minDurationSec ?? 0.4;
  const paddingSec = options.paddingSec ?? 0.05;
  const useCache = options.useCache ?? true;

  const hash = getFileHash(videoPath);
  const silenceDir = resolve("temp/silence");
  if (!existsSync(silenceDir)) mkdirSync(silenceDir, { recursive: true });

  const cacheKey = `${hash}_th${thresholdDb}_min${Math.round(minDurationSec * 100)}_pad${Math.round(paddingSec * 100)}_t1s`;
  const cacheFile = join(silenceDir, `${cacheKey}.json`);

  if (useCache && existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, "utf-8")) as SilenceAnalysisResult;
      return cached;
    } catch {}
  }

  const absolutePath = resolve(videoPath);
  const meta = await getVideoMetadata(absolutePath);
  const totalDur = meta.durationSec || 0;

  // Run bundled FFmpeg silencedetect filter
  const ffmpeg = findFfmpeg();
  const args = [
    "-hide_banner",
    "-i", absolutePath,
    "-vn",
    "-af", `silencedetect=noise=${thresholdDb}dB:d=${minDurationSec}`,
    "-f", "null",
    "-"
  ];

  const rawOutput = await new Promise<string>((res, rej) => {
    const proc = spawn(ffmpeg, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0 || stderr.includes("silencedetect")) {
        res(stderr);
      } else {
        rej(new Error(`FFmpeg silencedetect failed with code ${code}`));
      }
    });
    proc.on("error", (err) => rej(err));
  });

  // Parse silence intervals
  const rawSilent: Array<{ startInSeconds: number; endInSeconds: number }> = [];
  const lines = rawOutput.split(/\r?\n/);
  let curStart: number | null = null;

  for (const line of lines) {
    const sm = line.match(/silence_start:\s*([-\d.]+)/);
    if (sm) {
      curStart = Math.max(0, parseFloat(sm[1]));
    }
    const em = line.match(/silence_end:\s*([-\d.]+)/);
    if (em) {
      const end = Math.min(totalDur, parseFloat(em[1]));
      const start = curStart !== null ? curStart : 0;
      if (end > start) {
        rawSilent.push({ startInSeconds: start, endInSeconds: end });
      }
      curStart = null;
    }
  }

  // Handle trailing silence
  if (curStart !== null && curStart < totalDur) {
    rawSilent.push({ startInSeconds: curStart, endInSeconds: totalDur });
  }

  // Calculate audible parts as inverse of silence
  const rawAudible: Array<{ startInSeconds: number; endInSeconds: number }> = [];
  let lastEnd = 0;
  for (const s of rawSilent) {
    if (s.startInSeconds > lastEnd) {
      rawAudible.push({ startInSeconds: lastEnd, endInSeconds: s.startInSeconds });
    }
    lastEnd = Math.max(lastEnd, s.endInSeconds);
  }
  if (lastEnd < totalDur) {
    rawAudible.push({ startInSeconds: lastEnd, endInSeconds: totalDur });
  }

  // Apply padding to preserve natural word attacks and endings
  let audibleRanges: Array<{ startInSeconds: number; endInSeconds: number }> = [];
  if (rawAudible.length === 0) {
    audibleRanges = [{ startInSeconds: 0, endInSeconds: totalDur }];
  } else if (paddingSec > 0) {
    for (const part of rawAudible) {
      const start = Math.max(0, part.startInSeconds - paddingSec);
      const end = Math.min(totalDur, part.endInSeconds + paddingSec);
      if (audibleRanges.length > 0 && start <= audibleRanges[audibleRanges.length - 1].endInSeconds) {
        audibleRanges[audibleRanges.length - 1].endInSeconds = Math.max(
          audibleRanges[audibleRanges.length - 1].endInSeconds,
          end
        );
      } else {
        audibleRanges.push({ startInSeconds: start, endInSeconds: end });
      }
    }
  } else {
    audibleRanges = rawAudible;
  }

  // ── Auto-Mark Last 1.0s of Clip as Cut (RED on Timeline) ────────────────────
  // Excludes camera shutoff / reach-to-camera motion for all clips by default
  const maxAudibleEnd = Math.max(0, totalDur - 1.0);
  const trimmedAudible: Array<{ startInSeconds: number; endInSeconds: number }> = [];
  for (const part of audibleRanges) {
    if (part.startInSeconds >= maxAudibleEnd) {
      // Entirely within the trailing 1.0s -> exclude from audible (will show as red)
      continue;
    }
    const clampedEnd = Math.min(part.endInSeconds, maxAudibleEnd);
    if (clampedEnd - part.startInSeconds > 0.05) {
      trimmedAudible.push({
        startInSeconds: part.startInSeconds,
        endInSeconds: clampedEnd,
      });
    }
  }

  const audibleParts: TimeRange[] = trimmedAudible.map((p) => ({
    startInSeconds: Math.round(p.startInSeconds * 1000) / 1000,
    endInSeconds: Math.round(p.endInSeconds * 1000) / 1000,
    durationInSeconds: Math.round((p.endInSeconds - p.startInSeconds) * 1000) / 1000,
  }));

  const silentParts: TimeRange[] = rawSilent.map((p) => ({
    startInSeconds: Math.round(p.startInSeconds * 1000) / 1000,
    endInSeconds: Math.round(p.endInSeconds * 1000) / 1000,
    durationInSeconds: Math.round((p.endInSeconds - p.startInSeconds) * 1000) / 1000,
  }));

  const keptDurationSec = audibleParts.reduce((acc, cur) => acc + cur.durationInSeconds, 0);
  const removedDurationSec = Math.max(0, totalDur - keptDurationSec);
  const percentTrimmed = totalDur > 0 ? Math.round((removedDurationSec / totalDur) * 100) : 0;

  const analysis: SilenceAnalysisResult = {
    videoPath,
    originalDurationSec: Math.round(totalDur * 1000) / 1000,
    originalDurationFormatted: formatDuration(totalDur),
    keptDurationSec: Math.round(keptDurationSec * 1000) / 1000,
    keptDurationFormatted: formatDuration(keptDurationSec),
    removedDurationSec: Math.round(removedDurationSec * 1000) / 1000,
    removedDurationFormatted: formatDuration(removedDurationSec),
    percentTrimmed,
    audibleParts,
    silentParts,
    thresholdDb,
    minDurationSec,
    paddingSec,
  };

  try {
    writeFileSync(cacheFile, JSON.stringify(analysis, null, 2), "utf-8");
  } catch {}

  return analysis;
}
