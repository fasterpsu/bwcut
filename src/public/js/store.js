/**
 * store.js — BWCut Central State & Pub/Sub Event Bus
 */

export const state = {
  clips: [],            // ClipData[] (+ client-only: selected, originalSilence, undoHistory, redoHistory)
  queue: [],            // RenderQueueItem[]
  isRendering: false,
  settings: {},         // BW100Settings
  currentIndex: -1,     // Active editor clip index
  view: "library",      // "library" | "editor" | "export"
  libraryFilter: "all", // "all" | "unprocessed" | "ready" | "approved" | "completed" | "error"
  librarySearch: "",
  markIn: null,
  markOut: null,
  timelineZoom: 1.0,
  jumpCut: true,
  progress: null,       // Last render-progress payload
  logs: [],             // Realtime logs string[] (capped at 500)
};

const listeners = new Map();

/**
 * Subscribe to an event
 * Events: 'clips', 'clip-update', 'queue', 'progress', 'log', 'view', 'current', 'marks', 'settings'
 */
export function on(event, handler) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

/**
 * Unsubscribe from an event
 */
export function off(event, handler) {
  if (listeners.has(event)) {
    listeners.get(event).delete(handler);
  }
}

/**
 * Emit an event with payload
 */
export function emit(event, payload) {
  if (listeners.has(event)) {
    for (const handler of listeners.get(event)) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`Error in event listener for "${event}":`, err);
      }
    }
  }
}

/**
 * Determine effective display status of a clip
 */
export function getEffectiveStatus(clip) {
  if (!clip) return "unprocessed";
  let s = clip.status || "unprocessed";
  if (clip.approved && s !== "rendering" && s !== "completed") {
    return "approved";
  }
  return s;
}

/**
 * Count clips that are approved and ready to render
 */
export function getPendingApprovedCount() {
  return state.clips.filter((c) => c.approved && c.status !== "completed" && c.status !== "rendering").length;
}

/**
 * Count queue jobs that are pending or currently rendering
 */
export function getActiveQueueCount() {
  return state.queue.filter((q) => q.status === "pending" || q.status === "rendering").length;
}

/**
 * Get current active clip object
 */
export function getCurrentClip() {
  if (state.currentIndex >= 0 && state.currentIndex < state.clips.length) {
    return state.clips[state.currentIndex];
  }
  return null;
}
