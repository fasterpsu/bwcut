/**
 * sse.js — BWCut Server-Sent Events (SSE) Client
 */

import { state, emit } from "./store.js";

let eventSource = null;
let reconnectTimer = null;

export function initSSE() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource("/api/render-events");

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleSSEMessage(data);
    } catch (err) {
      console.error("SSE parse error:", err);
    }
  };

  eventSource.onerror = () => {
    console.warn("SSE connection lost. Reconnecting in 3s...");
    eventSource.close();
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(initSSE, 3000);
  };
}

function handleSSEMessage(data) {
  switch (data.type) {
    case "init":
      if (data.clips) {
        state.clips = data.clips;
        emit("clips", state.clips);
      }
      if (data.queue) {
        state.queue = data.queue;
        emit("queue", state.queue);
      }
      state.isRendering = Boolean(data.isRendering);
      if (data.logs && Array.isArray(data.logs)) {
        state.logs = data.logs.slice(-500);
        emit("logs", state.logs);
      }
      emit("render-status", { isRendering: state.isRendering });
      break;

    case "clip-update":
      if (data.clip) {
        updateOrAddClip(data.clip);
      }
      break;

    case "queue-update":
      state.queue = data.queue || [];
      state.isRendering = Boolean(data.isRendering);
      emit("queue", state.queue);
      emit("render-status", { isRendering: state.isRendering });
      break;

    case "render-progress":
      if (data.queue) state.queue = data.queue;
      state.progress = data.progress;
      emit("progress", { progress: data.progress, queue: state.queue });
      break;

    case "log":
      if (data.message) {
        state.logs.push(data.message);
        if (state.logs.length > 500) state.logs.shift();
        emit("log", data.message);
      }
      break;

    case "clips-loaded":
      state.clips = data.clips || [];
      emit("clips", state.clips);
      break;
  }
}

/**
 * Merge updated clip preserving client-side local edits and history
 */
function updateOrAddClip(updatedClip) {
  const idx = state.clips.findIndex((c) => c.id === updatedClip.id);
  if (idx !== -1) {
    const existing = state.clips[idx];
    const isCurrentActive = state.currentIndex === idx;

    state.clips[idx] = {
      ...updatedClip,
      // Preserve client-only fields
      selected: existing.selected !== undefined ? existing.selected : updatedClip.selected,
      originalSilence: existing.originalSilence || updatedClip.originalSilence,
      undoHistory: existing.undoHistory || [],
      redoHistory: existing.redoHistory || [],
      // If currently active in editor, preserve active user selections/styles
      approved: isCurrentActive && existing.approved !== undefined ? existing.approved : updatedClip.approved,
      fontFamily: isCurrentActive ? (existing.fontFamily || updatedClip.fontFamily) : updatedClip.fontFamily,
      topFontSize: isCurrentActive ? (existing.topFontSize || updatedClip.topFontSize) : updatedClip.topFontSize,
      bottomFontSize: isCurrentActive ? (existing.bottomFontSize || updatedClip.bottomFontSize) : updatedClip.bottomFontSize,
      lineSpacing: isCurrentActive ? (existing.lineSpacing || updatedClip.lineSpacing) : updatedClip.lineSpacing,
      headlineStartSec: isCurrentActive && existing.headlineStartSec !== undefined ? existing.headlineStartSec : updatedClip.headlineStartSec,
      headlineEndSec: isCurrentActive && existing.headlineEndSec !== undefined ? existing.headlineEndSec : updatedClip.headlineEndSec,
      enableCta: isCurrentActive && existing.enableCta !== undefined ? existing.enableCta : updatedClip.enableCta,
      productCode: isCurrentActive ? (existing.productCode || updatedClip.productCode) : updatedClip.productCode,
      // Accept server headline if fresh from AI
      headline: updatedClip.headline || existing.headline,
    };
    emit("clip-update", { clip: state.clips[idx], index: idx });
  } else {
    state.clips.push(updatedClip);
    emit("clip-update", { clip: updatedClip, index: state.clips.length - 1 });
  }
}
