/**
 * api.js — BWCut Backend API Client (Frozen Contract)
 */

async function request(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
    }
    return data;
  } catch (err) {
    console.error(`API Error [${options.method || "GET"} ${url}]:`, err);
    throw err;
  }
}

/**
 * Get system status and configuration
 */
export async function getSystem() {
  return request("/api/system");
}

/**
 * Scan a video folder
 */
export async function scan(folderPath) {
  return request("/api/scan", {
    method: "POST",
    body: JSON.stringify({ folderPath }),
  });
}

/**
 * Analyze silence on a single clip
 */
export async function analyzeSilence(clipId, options = {}) {
  return request("/api/analyze-silence", {
    method: "POST",
    body: JSON.stringify({
      clipId,
      thresholdDb: options.thresholdDb,
      minDurationSec: options.minDurationSec,
      paddingSec: options.paddingSec,
    }),
  });
}

/**
 * Generate AI Headline on a single clip
 */
export async function generateHeadline(clipId, preferredAi) {
  return request("/api/generate-headline", {
    method: "POST",
    body: JSON.stringify({ clipId, preferredAi }),
  });
}

/**
 * Update clip properties
 */
export async function updateClip(clipId, data) {
  return request("/api/update-clip", {
    method: "POST",
    body: JSON.stringify({ clipId, ...data }),
  });
}

/**
 * Batch analyze clips (silence-only, headline-only, or full)
 */
export async function batchAnalyze(clipIds, mode = "full", forceReheadline = false) {
  return request("/api/batch-analyze", {
    method: "POST",
    body: JSON.stringify({ clipIds, mode, forceReheadline }),
  });
}

/**
 * Queue clips for FFmpeg batch render
 */
export async function renderBatch(clipIds, clipOverrides = {}) {
  return request("/api/render-batch", {
    method: "POST",
    body: JSON.stringify({ clipIds, clipOverrides }),
  });
}

/**
 * Cancel active render queue
 */
export async function cancelRender() {
  return request("/api/cancel-render", { method: "POST" });
}

/**
 * Open rendered output folder in Windows Explorer
 */
export async function openOutput() {
  return request("/api/open-output", { method: "POST" });
}

/**
 * Clear temporary cache files
 */
export async function clearTemp(clearClipsStore = false) {
  return request("/api/clear-temp", {
    method: "POST",
    body: JSON.stringify({ clearClipsStore }),
  });
}

/**
 * Load system settings
 */
export async function getSettings() {
  return request("/api/settings");
}

/**
 * Save updated system settings
 */
export async function saveSettings(settings) {
  return request("/api/settings", {
    method: "POST",
    body: JSON.stringify(settings),
  });
}
