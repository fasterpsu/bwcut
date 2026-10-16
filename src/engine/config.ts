/**
 * config.ts — Configuration and Environment Settings for BWCut Studio
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface BWCutSettings {
  geminiApiKey: string;
  groqApiKey: string;
  assemblyAiApiKey: string;
  preferredAi: "gemini" | "groq";
  defaultEncoder: "auto" | "h264_amf" | "h264_nvenc" | "libx264";
  defaultResolution: "1080p" | "original" | "720p";
  defaultBeauty: "none" | "natural" | "smooth" | "glow";
  defaultEnableCta: boolean;
  defaultFont: string;
  topFontSize: number;
  bottomFontSize: number;
  topHeadlineColor: string;
  bottomHeadlineColor: string;
  outputDir: string;
  silenceThresholdDb: number;
  minSilenceDurationSec: number;
  paddingSec: number;
  randomZoom: boolean;
  zoomLevels: string;
  maxCutDurationSec: number;
  defaultLineSpacing: number;
  enableHookZoom: boolean;
  hookZoomDurationSec: number;
  hookZoomScalePercent: number;
  randomHeadlineColors: boolean;
  // Commercial & Notification features
  ntfyEnabled: boolean;
  ntfyTopic: string;
  licenseKey: string;
  gasServerUrl: string;
}

const ENV_PATH = resolve(".env");

export function loadSettings(): BWCutSettings {
  const env: Record<string, string> = {};

  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        env[key] = val;
        process.env[key] = val;
      }
    }
  }

  return {
    geminiApiKey: env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "",
    groqApiKey: env.GROQ_API_KEY || process.env.GROQ_API_KEY || "",
    assemblyAiApiKey: env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLYAI_API_KEY || "",
    preferredAi: (env.PREFERRED_AI as any) || "gemini",
    defaultEncoder: (env.DEFAULT_ENCODER as any) || "auto",
    defaultResolution: (env.DEFAULT_RESOLUTION as any) || "1080p",
    defaultBeauty: (env.DEFAULT_BEAUTY as any) || "none",
    defaultEnableCta: env.DEFAULT_ENABLE_CTA !== "false",
    defaultFont: env.DEFAULT_FONT || "Prompt-Bold",
    topFontSize: parseInt(env.TOP_FONT_SIZE || "16", 10),
    bottomFontSize: parseInt(env.BOTTOM_FONT_SIZE || "15", 10),
    topHeadlineColor: env.TOP_HEADLINE_COLOR || "#FFE600",
    bottomHeadlineColor: env.BOTTOM_HEADLINE_COLOR || "#FFFFFF",
    outputDir: resolve(env.OUTPUT_DIR || "rendered"),
    silenceThresholdDb: parseFloat(env.SILENCE_THRESHOLD_DB || "-20"),
    minSilenceDurationSec: parseFloat(env.MIN_SILENCE_DURATION_SEC || "0.4"),
    paddingSec: parseFloat(env.PADDING_SEC || "0.05"),
    randomZoom: env.RANDOM_ZOOM === "true",
    zoomLevels: env.ZOOM_LEVELS || "1.0, 1.2, 1.3, 1.4",
    maxCutDurationSec: parseFloat(env.MAX_CUT_DURATION_SEC || "4.0"),
    defaultLineSpacing: parseInt(env.DEFAULT_LINE_SPACING || "88", 10),
    enableHookZoom: env.ENABLE_HOOK_ZOOM === "true",
    hookZoomDurationSec: parseFloat(env.HOOK_ZOOM_DURATION_SEC || "4.0"),
    hookZoomScalePercent: parseInt(env.HOOK_ZOOM_SCALE_PERCENT || "120", 10),
    randomHeadlineColors: env.RANDOM_HEADLINE_COLORS !== "false",
    ntfyEnabled: env.NTFY_ENABLED === "true",
    ntfyTopic: env.NTFY_TOPIC || "bwcut-alerts",
    licenseKey: env.LICENSE_KEY || "",
    gasServerUrl: env.GAS_SERVER_URL || "",
  };
}

export function saveSettings(settings: Partial<BWCutSettings>): BWCutSettings {
  const current = loadSettings();
  const updated: BWCutSettings = { ...current, ...settings };

  const lines = [
    "# BWCut Studio — Environment Configuration",
    `GEMINI_API_KEY=${updated.geminiApiKey}`,
    `GROQ_API_KEY=${updated.groqApiKey}`,
    `ASSEMBLYAI_API_KEY=${updated.assemblyAiApiKey}`,
    `PREFERRED_AI=${updated.preferredAi}`,
    `DEFAULT_ENCODER=${updated.defaultEncoder}`,
    `DEFAULT_RESOLUTION=${updated.defaultResolution}`,
    `DEFAULT_BEAUTY=${updated.defaultBeauty}`,
    `DEFAULT_ENABLE_CTA=${updated.defaultEnableCta ? "true" : "false"}`,
    `DEFAULT_FONT=${updated.defaultFont}`,
    `TOP_FONT_SIZE=${updated.topFontSize}`,
    `BOTTOM_FONT_SIZE=${updated.bottomFontSize}`,
    `TOP_HEADLINE_COLOR=${updated.topHeadlineColor}`,
    `BOTTOM_HEADLINE_COLOR=${updated.bottomHeadlineColor}`,
    `OUTPUT_DIR=${updated.outputDir}`,
    `SILENCE_THRESHOLD_DB=${updated.silenceThresholdDb}`,
    `MIN_SILENCE_DURATION_SEC=${updated.minSilenceDurationSec}`,
    `PADDING_SEC=${updated.paddingSec}`,
    `RANDOM_ZOOM=${updated.randomZoom ? "true" : "false"}`,
    `ZOOM_LEVELS=${updated.zoomLevels}`,
    `MAX_CUT_DURATION_SEC=${updated.maxCutDurationSec}`,
    `DEFAULT_LINE_SPACING=${updated.defaultLineSpacing}`,
    `ENABLE_HOOK_ZOOM=${updated.enableHookZoom ? "true" : "false"}`,
    `HOOK_ZOOM_DURATION_SEC=${updated.hookZoomDurationSec}`,
    `HOOK_ZOOM_SCALE_PERCENT=${updated.hookZoomScalePercent}`,
    `RANDOM_HEADLINE_COLORS=${updated.randomHeadlineColors ? "true" : "false"}`,
    `NTFY_ENABLED=${updated.ntfyEnabled ? "true" : "false"}`,
    `NTFY_TOPIC=${updated.ntfyTopic}`,
    `LICENSE_KEY=${updated.licenseKey}`,
    `GAS_SERVER_URL=${updated.gasServerUrl}`,
  ];

  writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");

  // Also update process.env
  if (updated.geminiApiKey) process.env.GEMINI_API_KEY = updated.geminiApiKey;
  if (updated.groqApiKey) process.env.GROQ_API_KEY = updated.groqApiKey;
  if (updated.assemblyAiApiKey) process.env.ASSEMBLYAI_API_KEY = updated.assemblyAiApiKey;
  if (updated.ntfyTopic) process.env.NTFY_TOPIC = updated.ntfyTopic;
  if (updated.licenseKey) process.env.LICENSE_KEY = updated.licenseKey;
  if (updated.gasServerUrl) process.env.GAS_SERVER_URL = updated.gasServerUrl;

  return updated;
}
