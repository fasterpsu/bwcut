/**
 * timeline.js — BWCut Precision Timeline Dock Controller
 * Multi-track waveform, interactive drag-selection, headline trim handles, and smooth scrubber
 */

import { state, getCurrentClip, emit } from "../store.js";
import { formatTime, formatTimePrecise, clamp } from "../utils.js";
import { cutRange, restoreRange, pushUndo, undo, redo, resetToOriginal } from "./cuts.js";
import { updateClip } from "../api.js";
import { showSnackbar } from "../ui/snackbar.js";
import { confirmDialog } from "../ui/dialog.js";
import { flashJumpToast, seekTo } from "./preview.js";
import { ZOOM_STEPS, ZOOM_MAX } from "../constants.js";

let trackEl = null;
let scrollWrapper = null;
let playheadEl = null;
let headlineBarEl = null;
let selectionOverlayEl = null;

let isScrubbing = false;
let isSelecting = false;
let selectDragStartSec = 0;

export function initTimeline() {
  trackEl = document.getElementById("timelineTrack");
  scrollWrapper = document.getElementById("timelineScrollWrapper");
  playheadEl = document.getElementById("timelinePlayhead");
  headlineBarEl = document.getElementById("timelineHeadlineBar");
  selectionOverlayEl = document.getElementById("timelineSelectionOverlay");

  if (!trackEl || !scrollWrapper) return;

  // Toolbar Actions
  const btnIn = document.getElementById("btnTlMarkIn");
  const btnOut = document.getElementById("btnTlMarkOut");
  const btnCut = document.getElementById("btnTlCut");
  const btnRestore = document.getElementById("btnTlRestore");
  const btnClear = document.getElementById("btnTlClear");
  const btnUndo = document.getElementById("btnTlUndo");
  const btnRedo = document.getElementById("btnTlRedo");
  const btnFit = document.getElementById("btnTlFit");
  const btnZoomIn = document.getElementById("btnTlZoomIn");
  const btnZoomOut = document.getElementById("btnTlZoomOut");
  const zoomSlider = document.getElementById("tlZoomSlider");
  const btnResetCuts = document.getElementById("btnTlResetCuts");

  if (btnIn) btnIn.addEventListener("click", setMarkInAtPlayhead);
  if (btnOut) btnOut.addEventListener("click", setMarkOutAtPlayhead);
  if (btnCut) btnCut.addEventListener("click", executeCut);
  if (btnRestore) btnRestore.addEventListener("click", executeRestore);
  if (btnClear) btnClear.addEventListener("click", clearSelection);
  if (btnUndo) btnUndo.addEventListener("click", executeUndo);
  if (btnRedo) btnRedo.addEventListener("click", executeRedo);
  if (btnFit) btnFit.addEventListener("click", () => setZoom(1.0));
  if (btnZoomIn) btnZoomIn.addEventListener("click", () => stepZoom(1));
  if (btnZoomOut) btnZoomOut.addEventListener("click", () => stepZoom(-1));
  if (btnResetCuts) btnResetCuts.addEventListener("click", handleResetCuts);

  if (zoomSlider) {
    zoomSlider.addEventListener("input", (e) => {
      setZoom(parseFloat(e.target.value));
    });
  }

  // Ctrl + Wheel on timeline to zoom
  scrollWrapper.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 1 : -1);
    }
  }, { passive: false });

  // Track pointer interactions (Scrubbing / Drag selecting)
  trackEl.addEventListener("pointerdown", onTrackPointerDown);
  window.addEventListener("pointermove", onTrackPointerMove);
  window.addEventListener("pointerup", onTrackPointerUp);

  // Expose playhead sync to preview.js
  window._syncTimelinePlayhead = (curTime, totalDur) => {
    if (isScrubbing) return;
    const pct = totalDur > 0 ? clamp((curTime / totalDur) * 100, 0, 100) : 0;
    if (playheadEl) playheadEl.style.left = `${pct}%`;

    // Auto-scroll track when zoomed and playing
    if (state.timelineZoom > 1.0 && scrollWrapper && trackEl) {
      const trackW = trackEl.offsetWidth;
      const wrapW = scrollWrapper.clientWidth;
      const playheadX = (pct / 100) * trackW;
      const scrollLeft = scrollWrapper.scrollLeft;
      const margin = wrapW * 0.25;

      if (playheadX < scrollLeft + margin) {
        scrollWrapper.scrollLeft = Math.max(0, playheadX - margin);
      } else if (playheadX > scrollLeft + wrapW - margin) {
        scrollWrapper.scrollLeft = Math.min(trackW - wrapW, playheadX - wrapW + margin);
      }
    }
  };
}

export function renderTimeline(clip = getCurrentClip()) {
  if (!trackEl || !clip) return;

  const totalSec = clip.metadata?.durationSec || clip.silence?.originalDurationSec || 1;
  const keptSec = clip.silence?.keptDurationSec || totalSec;
  const removedSec = clip.silence?.removedDurationSec || 0;
  const pct = clip.silence?.percentTrimmed || 0;

  // 1. Update toolbar stats
  const keptEl = document.getElementById("tlStatKept");
  const removedEl = document.getElementById("tlStatRemoved");
  const pctEl = document.getElementById("tlStatPct");

  if (keptEl) keptEl.textContent = `พูด ${keptSec.toFixed(1)}s`;
  if (removedEl) removedEl.textContent = `ตัดออก ${removedSec.toFixed(1)}s`;
  if (pctEl) pctEl.textContent = `−${pct}%`;

  // 2. Render Ruler Ticks
  renderRuler(totalSec);

  // 3. Render Headline Bar
  renderHeadlineBar(clip, totalSec);

  // 4. Render Audio Waveform & Segments
  renderAudioLane(clip, totalSec);

  // 5. Render Selection Overlay & Buttons
  updateSelectionUI(totalSec);
  updateUndoRedoButtons(clip);
}

function renderRuler(totalSec) {
  const rulerEl = document.getElementById("timelineRuler");
  if (!rulerEl) return;
  rulerEl.innerHTML = "";

  const stepSec = totalSec > 60 ? 5 : totalSec > 30 ? 2 : 1;
  for (let t = 0; t <= totalSec; t += stepSec) {
    const span = document.createElement("span");
    const pct = (t / totalSec) * 100;
    span.style.left = `${pct}%`;
    span.textContent = formatTime(t);
    rulerEl.appendChild(span);
  }
}

function renderHeadlineBar(clip, totalSec) {
  if (!headlineBarEl) return;
  const start = clip.headlineStartSec !== undefined ? clip.headlineStartSec : 0.0;
  const end = clip.headlineEndSec !== undefined ? clip.headlineEndSec : Math.min(totalSec, 10.0);

  if (end > start) {
    const leftPct = (start / totalSec) * 100;
    const widthPct = ((end - start) / totalSec) * 100;
    headlineBarEl.style.left = `${leftPct}%`;
    headlineBarEl.style.width = `${widthPct}%`;
    headlineBarEl.style.display = "flex";

    const title = clip.headline?.line1 || "พาดหัวคลิป";
    headlineBarEl.textContent = `${title} · ${start.toFixed(1)}–${end.toFixed(1)}s`;
  } else {
    headlineBarEl.style.display = "none";
  }
}

function renderAudioLane(clip, totalSec) {
  const audioLaneEl = document.getElementById("timelineAudioLane");
  if (!audioLaneEl) return;

  // Clear previous segment divs
  audioLaneEl.querySelectorAll(".seg").forEach((el) => el.remove());

  // Waveform Background
  const waveEl = audioLaneEl.querySelector(".wave");
  if (waveEl) {
    waveEl.style.backgroundImage = `url('/api/waveform/${encodeURIComponent(clip.id)}.png')`;
  }

  // Audible speech segments (Green)
  const audibleParts = clip.silence?.audibleParts || [{ startInSeconds: 0, endInSeconds: totalSec, durationInSeconds: totalSec }];
  audibleParts.forEach((part) => {
    const seg = document.createElement("div");
    seg.className = "seg";
    const leftPct = (part.startInSeconds / totalSec) * 100;
    const widthPct = (part.durationInSeconds / totalSec) * 100;
    seg.style.left = `${leftPct}%`;
    seg.style.width = `${widthPct}%`;
    seg.title = `พูด: ${part.startInSeconds.toFixed(1)}s – ${part.endInSeconds.toFixed(1)}s (${part.durationInSeconds.toFixed(1)}s)`;

    // Double-click segment to select it fully
    seg.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      state.markIn = part.startInSeconds;
      state.markOut = part.endInSeconds;
      updateSelectionUI(totalSec);
    });

    audioLaneEl.appendChild(seg);
  });
}

// ─── POINTER INTERACTIONS (Scrubbing / Drag-Select) ──────────────────────────

function onTrackPointerDown(e) {
  if (e.button !== 0) return; // primary click only
  const rect = trackEl.getBoundingClientRect();
  const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  const clip = getCurrentClip();
  const totalSec = clip?.metadata?.durationSec || 1;
  const time = ratio * totalSec;

  const target = e.target;

  // 1. Clicked on Playhead needle or Ruler -> Start Scrubbing
  if (target === playheadEl || target.closest(".ruler")) {
    isScrubbing = true;
    seekTo(time);
    trackEl.setPointerCapture(e.pointerId);
    return;
  }

  // 2. Clicked on Headline Bar handle -> Adjust Headline timing
  if (target.classList.contains("bar") || target.closest(".bar")) {
    // Handled by headline drag
    return;
  }

  // 3. Clicked on Audio Lane -> Start Range Selection
  isSelecting = true;
  selectDragStartSec = time;
  state.markIn = time;
  state.markOut = time;
  seekTo(time);
  updateSelectionUI(totalSec);
  trackEl.setPointerCapture(e.pointerId);
}

function onTrackPointerMove(e) {
  if (!isScrubbing && !isSelecting) return;
  const rect = trackEl.getBoundingClientRect();
  const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  const clip = getCurrentClip();
  const totalSec = clip?.metadata?.durationSec || 1;
  const time = ratio * totalSec;

  if (isScrubbing) {
    seekTo(time);
  } else if (isSelecting) {
    state.markIn = Math.min(selectDragStartSec, time);
    state.markOut = Math.max(selectDragStartSec, time);
    seekTo(time);
    updateSelectionUI(totalSec);
  }
}

function onTrackPointerUp(e) {
  if (isScrubbing || isSelecting) {
    isScrubbing = false;
    isSelecting = false;
    try { trackEl.releasePointerCapture(e.pointerId); } catch {}
  }
}

// ─── MARK IN / OUT & CUT EXECUTION ──────────────────────────────────────────

export function setMarkInAtPlayhead() {
  const videoEl = document.getElementById("editorVideo");
  if (!videoEl) return;
  state.markIn = videoEl.currentTime || 0;
  const clip = getCurrentClip();
  updateSelectionUI(clip?.metadata?.durationSec || 1);
  flashJumpToast(`มาร์ก In: ${formatTimePrecise(state.markIn)}`);
}

export function setMarkOutAtPlayhead() {
  const videoEl = document.getElementById("editorVideo");
  if (!videoEl) return;
  state.markOut = videoEl.currentTime || 0;
  const clip = getCurrentClip();
  updateSelectionUI(clip?.metadata?.durationSec || 1);
  flashJumpToast(`มาร์ก Out: ${formatTimePrecise(state.markOut)}`);
}

export function clearSelection() {
  state.markIn = null;
  state.markOut = null;
  const clip = getCurrentClip();
  updateSelectionUI(clip?.metadata?.durationSec || 1);
}

function updateSelectionUI(totalSec) {
  const btnIn = document.getElementById("btnTlMarkIn");
  const btnOut = document.getElementById("btnTlMarkOut");
  const btnCut = document.getElementById("btnTlCut");
  const btnRestore = document.getElementById("btnTlRestore");

  const hasIn = state.markIn !== null;
  const hasOut = state.markOut !== null;

  if (btnIn) {
    btnIn.classList.toggle("on", hasIn);
    btnIn.innerHTML = `<span class="ms sm">first_page</span>In <b>${hasIn ? formatTimePrecise(state.markIn) : "--:--"}</b>`;
  }

  if (btnOut) {
    btnOut.classList.toggle("on", hasOut);
    btnOut.innerHTML = `<span class="ms sm">last_page</span>Out <b>${hasOut ? formatTimePrecise(state.markOut) : "--:--"}</b>`;
  }

  const hasValidRange = hasIn && hasOut && Math.abs(state.markOut - state.markIn) >= 0.05;
  if (btnCut) btnCut.disabled = !hasValidRange;
  if (btnRestore) btnRestore.disabled = !hasValidRange;

  // Update Range Overlay Box
  if (selectionOverlayEl) {
    if (hasValidRange) {
      const s = Math.min(state.markIn, state.markOut);
      const e = Math.max(state.markIn, state.markOut);
      const leftPct = (s / totalSec) * 100;
      const widthPct = ((e - s) / totalSec) * 100;

      selectionOverlayEl.style.left = `${leftPct}%`;
      selectionOverlayEl.style.width = `${widthPct}%`;
      selectionOverlayEl.style.display = "block";

      const label = selectionOverlayEl.querySelector("span");
      if (label) label.textContent = `${(e - s).toFixed(1)}s`;
    } else {
      selectionOverlayEl.style.display = "none";
    }
  }
}

export async function executeCut() {
  const clip = getCurrentClip();
  if (!clip || !clip.silence || state.markIn === null || state.markOut === null) return;
  const totalSec = clip.metadata?.durationSec || 1;

  pushUndo(clip);
  const res = cutRange(clip.silence, state.markIn, state.markOut, totalSec);
  if (!res.ok) {
    return showSnackbar(res.error, { tone: "error" });
  }

  clearSelection();
  renderTimeline(clip);
  flashJumpToast(`✂️ ตัดช่วงพูดผิดออก ${res.cutDuration}s`);
  updateClip(clip.id, { silence: clip.silence }).catch(() => {});
  emit("clip-update", { clip, index: state.currentIndex });
}

export async function executeRestore() {
  const clip = getCurrentClip();
  if (!clip || !clip.silence || state.markIn === null || state.markOut === null) return;
  const totalSec = clip.metadata?.durationSec || 1;

  pushUndo(clip);
  const res = restoreRange(clip.silence, state.markIn, state.markOut, totalSec);
  if (!res.ok) {
    return showSnackbar(res.error, { tone: "error" });
  }

  clearSelection();
  renderTimeline(clip);
  flashJumpToast(`➕ คืนเสียงช่วงนี้ ${res.restoredDuration}s`);
  updateClip(clip.id, { silence: clip.silence }).catch(() => {});
  emit("clip-update", { clip, index: state.currentIndex });
}

export async function executeUndo() {
  const clip = getCurrentClip();
  if (!clip) return;
  const totalSec = clip.metadata?.durationSec || 1;
  if (undo(clip, totalSec)) {
    clearSelection();
    renderTimeline(clip);
    flashJumpToast("↶ ย้อนกลับการตัดแล้ว");
    updateClip(clip.id, { silence: clip.silence }).catch(() => {});
    emit("clip-update", { clip, index: state.currentIndex });
  }
}

export async function executeRedo() {
  const clip = getCurrentClip();
  if (!clip) return;
  const totalSec = clip.metadata?.durationSec || 1;
  if (redo(clip, totalSec)) {
    clearSelection();
    renderTimeline(clip);
    flashJumpToast("↷ ทำซ้ำการตัดแล้ว");
    updateClip(clip.id, { silence: clip.silence }).catch(() => {});
    emit("clip-update", { clip, index: state.currentIndex });
  }
}

async function handleResetCuts() {
  const clip = getCurrentClip();
  if (!clip || !clip.originalSilence) return showSnackbar("คลิปนี้ยังไม่มีการตัดแต่งด้วยมือ");

  const confirmed = await confirmDialog({
    title: "คืนค่ารอยตัดเดิมทั้งหมด?",
    body: "รอยตัดที่ทำด้วยมือทั้งหมดของคลิปนี้จะถูกล้าง และย้อนกลับไปใช้รอยตัดจากการวิเคราะห์เสียงเดิม ใช่หรือไม่?",
    confirmLabel: "คืนค่าเดิม",
    danger: true,
  });

  if (!confirmed) return;

  const totalSec = clip.metadata?.durationSec || 1;
  resetToOriginal(clip, totalSec);
  clearSelection();
  renderTimeline(clip);
  flashJumpToast("↺ คืนค่ารอยตัดเดิมเรียบร้อยแล้ว");
  updateClip(clip.id, { silence: clip.silence }).catch(() => {});
  emit("clip-update", { clip, index: state.currentIndex });
}

function updateUndoRedoButtons(clip) {
  const btnUndo = document.getElementById("btnTlUndo");
  const btnRedo = document.getElementById("btnTlRedo");
  const canUndo = Boolean(clip?.undoHistory && clip.undoHistory.length > 0);
  const canRedo = Boolean(clip?.redoHistory && clip.redoHistory.length > 0);

  if (btnUndo) {
    btnUndo.disabled = !canUndo;
    btnUndo.title = canUndo ? `ย้อนกลับการตัด (Ctrl+Z) — มี ${clip.undoHistory.length} ขั้น` : "ไม่มีประวัติให้ย้อนกลับ";
  }
  if (btnRedo) {
    btnRedo.disabled = !canRedo;
    btnRedo.title = canRedo ? `ทำซ้ำการตัด (Ctrl+Y) — มี ${clip.redoHistory.length} ขั้น` : "ไม่มีประวัติให้ทำซ้ำ";
  }
}

// ─── TIMELINE ZOOM ───────────────────────────────────────────────────────────

export function setZoom(newZoom) {
  state.timelineZoom = clamp(newZoom, 1.0, ZOOM_MAX);
  if (trackEl) {
    trackEl.style.width = `${state.timelineZoom * 100}%`;
  }
  const slider = document.getElementById("tlZoomSlider");
  if (slider) {
    slider.value = state.timelineZoom;
    const p = Math.round(((state.timelineZoom - 1) / (ZOOM_MAX - 1)) * 100);
    slider.style.setProperty("--p", `${p}%`);
  }
}

function stepZoom(direction) {
  const cur = state.timelineZoom;
  let target;
  if (direction > 0) {
    target = ZOOM_STEPS.find((z) => z > cur) || ZOOM_MAX;
  } else {
    target = [...ZOOM_STEPS].reverse().find((z) => z < cur) || 1.0;
  }
  setZoom(target);
}
