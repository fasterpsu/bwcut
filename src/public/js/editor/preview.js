/**
 * preview.js — BWCut Video Player, Overlay Preview, and Realtime Jump-Cut Logic
 * 100% 1:1 Proportional Scaling to FFmpeg Render Engine
 */

import { state, getCurrentClip } from "../store.js";
import { OVERLAY, FONTS } from "../constants.js";
import { formatTime } from "../utils.js";

let videoEl = null;
let toastTimer = null;
const loadedFonts = new Set();

export function initPreview() {
  videoEl = document.getElementById("editorVideo");
  if (!videoEl) return;

  const playBtn = document.getElementById("btnEditorPlay");
  if (playBtn) playBtn.addEventListener("click", togglePlay);

  const jumpToggle = document.getElementById("btnToggleJumpCut");
  if (jumpToggle) {
    jumpToggle.addEventListener("click", () => {
      state.jumpCut = !state.jumpCut;
      jumpToggle.classList.toggle("selected", state.jumpCut);
      const icon = jumpToggle.querySelector(".ms");
      if (icon) icon.textContent = state.jumpCut ? "check" : "close";
    });
  }

  // Transport skip buttons
  const btnPrev = document.getElementById("btnEditorPrev");
  const btnNext = document.getElementById("btnEditorNext");
  const btnReplay5 = document.getElementById("btnEditorReplay5");
  const btnForward5 = document.getElementById("btnEditorForward5");

  if (btnPrev) btnPrev.addEventListener("click", () => navigateClip(-1));
  if (btnNext) btnNext.addEventListener("click", () => navigateClip(1));
  if (btnReplay5) btnReplay5.addEventListener("click", () => seekRelative(-2));
  if (btnForward5) btnForward5.addEventListener("click", () => seekRelative(2));

  // Video playback listeners
  videoEl.addEventListener("play", onPlayStateChange);
  videoEl.addEventListener("pause", onPlayStateChange);
  videoEl.addEventListener("timeupdate", onTimeUpdate);
  videoEl.addEventListener("loadedmetadata", () => {
    fitVideoWrapper();
    updateOverlay();
  });

  // Window resize watcher to keep 1:1 aspect ratio and font scaling
  window.addEventListener("resize", () => {
    fitVideoWrapper();
    updateOverlay();
  });

  // Preload standard fonts
  FONTS.forEach((f) => {
    if (f.file) ensureFontLoaded(f.value);
  });
}

export function loadClipVideo(clip, reloadSrc = true) {
  if (!videoEl || !clip) return;
  if (reloadSrc) {
    videoEl.src = `/api/stream?path=${encodeURIComponent(clip.path)}`;
    videoEl.load();
  }
  fitVideoWrapper();
  updateOverlay(clip);
}

export function togglePlay() {
  if (!videoEl) return;
  if (videoEl.paused || videoEl.ended) {
    const clip = getCurrentClip();
    const parts = clip?.silence?.audibleParts;
    if (state.jumpCut && parts && parts.length > 0) {
      if (videoEl.currentTime < parts[0].startInSeconds || videoEl.currentTime >= parts[parts.length - 1].endInSeconds) {
        videoEl.currentTime = parts[0].startInSeconds;
      }
    }
    videoEl.play();
  } else {
    videoEl.pause();
  }
}

export function seekTo(seconds) {
  if (videoEl && videoEl.duration) {
    videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, seconds));
  }
}

export function seekRelative(deltaSec) {
  if (videoEl) {
    seekTo(videoEl.currentTime + deltaSec);
  }
}

function onPlayStateChange() {
  const playBtn = document.getElementById("btnEditorPlay");
  if (!playBtn) return;
  const isPlaying = !videoEl.paused && !videoEl.ended;
  const icon = playBtn.querySelector(".ms");
  if (icon) {
    icon.textContent = isPlaying ? "pause" : "play_arrow";
  }
}

/**
 * Realtime Jump-Cut Seeking & Dynamic Overlay Timing Simulation
 */
function onTimeUpdate() {
  if (!videoEl) return;
  const cur = videoEl.currentTime;
  const dur = videoEl.duration || 1;
  const clip = getCurrentClip();

  // 1. Update Transport Time Display
  const timeEl = document.getElementById("editorCurrentTime");
  if (timeEl) {
    const keptSec = clip?.silence?.keptDurationSec || dur;
    timeEl.innerHTML = `<b>${formatTime(cur)}</b> / ${formatTime(keptSec)}`;
  }

  // 2. Realtime Jump Cut
  if (!videoEl.paused && state.jumpCut) {
    const parts = clip?.silence?.audibleParts;
    if (parts && parts.length > 0) {
      let inAudible = false;
      for (let i = 0; i < parts.length; i++) {
        if (cur >= parts[i].startInSeconds && cur < parts[i].endInSeconds) {
          inAudible = true;
          break;
        }
      }

      if (!inAudible) {
        const nextPart = parts.find((p) => p.startInSeconds > cur);
        if (nextPart) {
          const skipped = nextPart.startInSeconds - cur;
          videoEl.currentTime = nextPart.startInSeconds;
          flashJumpToast(`ข้ามช่วงเงียบ ${skipped.toFixed(1)}s`);
        } else {
          // Loop back to first audible section
          videoEl.currentTime = parts[0].startInSeconds;
        }
      }
    }
  }

  // 3. Dynamic Headline Visibility Simulation
  const l1El = document.getElementById("editorOverlayL1");
  const l2El = document.getElementById("editorOverlayL2");
  const ctaEl = document.getElementById("editorOverlayCta");

  const hStart = clip?.headlineStartSec !== undefined ? clip.headlineStartSec : 0.0;
  const hEnd = clip?.headlineEndSec !== undefined ? clip.headlineEndSec : Math.min(dur, 10.0);
  const isCtaOn = clip?.enableCta !== false;

  const showHeadline = cur >= hStart && cur <= hEnd;
  const showCta = isCtaOn && cur >= Math.max(0, dur - OVERLAY.ctaPt / 15); // ~2s last

  if (l1El) l1El.style.opacity = showHeadline ? "1" : "0";
  if (l2El) l2El.style.opacity = showHeadline ? "1" : "0";
  if (ctaEl) ctaEl.style.opacity = showCta ? "1" : "0";

  // Dispatch playhead position for timeline sync
  if (window._syncTimelinePlayhead) {
    window._syncTimelinePlayhead(cur, dur);
  }
}

/**
 * Fit video frame within available container maintaining aspect ratio without black bars
 */
export function fitVideoWrapper() {
  const frame = document.querySelector(".video-frame");
  const stageBody = document.querySelector(".stage-body");
  if (!frame || !stageBody) return;

  const clip = getCurrentClip();
  const vidW = videoEl?.videoWidth || clip?.metadata?.width || 1080;
  const vidH = videoEl?.videoHeight || clip?.metadata?.height || 1920;
  const aspect = vidW / vidH;

  const availW = Math.max(200, stageBody.clientWidth - 32);
  const availH = Math.max(260, stageBody.clientHeight - 16);

  let finalH = Math.min(560, availH);
  let finalW = Math.round(finalH * aspect);

  if (finalW > availW) {
    finalW = availW;
    finalH = Math.round(finalW / aspect);
  }

  frame.style.width = `${finalW}px`;
  frame.style.height = `${finalH}px`;
}

/**
 * 1:1 Proportional Font Scaling to FFmpeg Direct Video Renderer
 */
export function updateOverlay(clip = getCurrentClip()) {
  const l1El = document.getElementById("editorOverlayL1");
  const l2El = document.getElementById("editorOverlayL2");
  const ctaEl = document.getElementById("editorOverlayCta");
  if (!l1El || !l2El) return;

  if (!clip) {
    l1El.textContent = "";
    l2El.textContent = "";
    if (ctaEl) ctaEl.textContent = "";
    return;
  }

  const l1Text = clip.headline?.line1 ? `${clip.headline.line1} ${clip.headline.emoji1 || ""}`.trim() : "";
  const l2Text = clip.headline?.line2 ? `${clip.headline.line2} ${clip.headline.emoji2 || ""}`.trim() : "";

  l1El.textContent = l1Text;
  l2El.textContent = l2Text;
  if (ctaEl) ctaEl.textContent = "🛒👇";

  const chosenFont = clip.fontFamily || state.settings?.defaultFont || "Prompt-Bold";
  if (chosenFont === "none") {
    l1El.style.display = "none";
    l2El.style.display = "none";
    if (ctaEl) ctaEl.style.display = "none";
    return;
  }

  l1El.style.display = "";
  l2El.style.display = "";
  if (ctaEl) ctaEl.style.display = clip.enableCta !== false ? "" : "none";

  ensureFontLoaded(chosenFont);
  l1El.style.fontFamily = `"${chosenFont}", sans-serif`;
  l2El.style.fontFamily = `"${chosenFont}", sans-serif`;
  if (ctaEl) ctaEl.style.fontFamily = `"${chosenFont}", sans-serif`;

  // Scale calculations matching render-direct.ts
  const frame = document.querySelector(".video-frame");
  const previewW = frame ? frame.offsetWidth : 270;
  const scale = previewW / OVERLAY.refWidth;

  const topPt = clip.topFontSize || state.settings?.topFontSize || 14;
  const botPt = clip.bottomFontSize || state.settings?.bottomFontSize || 14;
  const spacing = clip.lineSpacing || state.settings?.defaultLineSpacing || 68;

  l1El.style.fontSize = `${Math.max(8, Math.round(topPt * OVERLAY.pxPerPt * scale))}px`;
  l2El.style.fontSize = `${Math.max(8, Math.round(botPt * OVERLAY.pxPerPt * scale))}px`;
  if (ctaEl) ctaEl.style.fontSize = `${Math.max(12, Math.round(30 * OVERLAY.pxPerPt * scale))}px`;

  // Dynamic spacing
  const gapPct = (spacing / OVERLAY.refHeight) * 100;
  l2El.style.top = `${OVERLAY.line1TopPct + gapPct}%`;

  // Colors
  const topColor = clip.topHeadlineColor || state.settings?.topHeadlineColor || "#FFE600";
  const botColor = clip.bottomHeadlineColor || state.settings?.bottomHeadlineColor || "#FFFFFF";
  l1El.style.color = topColor;
  l2El.style.color = botColor;
}

export function flashJumpToast(msg) {
  const toast = document.getElementById("editorJumpToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 900);
}

function ensureFontLoaded(fontFamily) {
  if (!fontFamily || fontFamily === "none" || loadedFonts.has(fontFamily)) return;
  const matched = FONTS.find((f) => f.value === fontFamily);
  if (!matched || !matched.file) return;

  const font = new FontFace(fontFamily, `url('/fonts/${matched.file}')`);
  font.load().then((loaded) => {
    document.fonts.add(loaded);
    loadedFonts.add(fontFamily);
  }).catch(() => {});
}

function navigateClip(delta) {
  const newIndex = state.currentIndex + delta;
  if (newIndex >= 0 && newIndex < state.clips.length) {
    window.location.hash = `#/editor/${newIndex}`;
  }
}
