/**
 * editor.js — BWCut Editor View Coordinator
 * Glues Preview, Timeline, Inspector, and Filmstrip components into a unified workflow
 */

import { state, emit, on, getCurrentClip } from "../store.js";
import { initPreview, loadClipVideo } from "../editor/preview.js";
import { initTimeline, renderTimeline } from "../editor/timeline.js";
import { initInspector, populateInspector } from "../editor/inspector.js";
import { initFilmstrip, renderFilmstrip, scrollToActive } from "../editor/filmstrip.js";

let isInitialized = false;

export function initEditorView() {
  if (isInitialized) return;
  isInitialized = true;

  // Initialize subcomponents
  initPreview();
  initTimeline();
  initInspector();
  initFilmstrip();

  // Listen to store events
  on("current", ({ index }) => {
    loadClipByIndex(index);
  });

  on("clip-update", ({ clip, index }) => {
    if (index === state.currentIndex) {
      renderTimeline(clip);
      populateInspector(clip);
    }
  });

  // Global window resize re-aligns timeline and video stage
  window.addEventListener("resize", () => {
    const cur = getCurrentClip();
    if (cur && state.view === "editor") {
      renderTimeline(cur);
    }
  });
}

/**
 * Load a clip into the editor by index
 */
export function loadClipByIndex(index) {
  if (state.clips.length === 0) {
    state.currentIndex = -1;
    showEmptyEditorState();
    return;
  }

  const clampedIndex = Math.max(0, Math.min(state.clips.length - 1, index));
  state.currentIndex = clampedIndex;

  const clip = state.clips[clampedIndex];
  if (!clip) return;

  // Hide empty state if present
  hideEmptyEditorState();

  // Load into subcomponents
  loadClipVideo(clip, true);
  renderTimeline(clip);
  populateInspector(clip);
  scrollToActive();
}

/**
 * Go to next clip
 */
export function nextClip() {
  if (state.currentIndex < state.clips.length - 1) {
    window.location.hash = `#/editor/${state.currentIndex + 1}`;
  }
}

/**
 * Go to previous clip
 */
export function prevClip() {
  if (state.currentIndex > 0) {
    window.location.hash = `#/editor/${state.currentIndex - 1}`;
  }
}

function showEmptyEditorState() {
  const stageBody = document.querySelector(".stage-body");
  if (stageBody) {
    stageBody.innerHTML = `
      <div style="text-align:center;color:var(--c-text-3);padding:var(--sp-8);">
        <span class="ms" style="font-size:48px;opacity:0.5;display:block;margin-bottom:12px;">video_library</span>
        <div style="font:var(--t-title-m);color:var(--c-text);margin-bottom:8px;">ไม่มีคลิปในโฟลเดอร์นี้</div>
        <div style="font:var(--t-body-m);">เลือกโฟลเดอร์ที่มีไฟล์วิดีโอจากแถบด้านบน หรือกดกลับไปที่คลังคลิป</div>
      </div>
    `;
  }
}

function hideEmptyEditorState() {
  const stageBody = document.querySelector(".stage-body");
  if (!stageBody) return;
  // If stageBody contains the empty placeholder, restore video frame
  if (!stageBody.querySelector(".video-frame")) {
    stageBody.innerHTML = `
      <div class="video-frame">
        <video id="editorVideo" playsinline preload="auto"></video>
        <div class="ov-l1" id="editorOverlayL1"></div>
        <div class="ov-l2" id="editorOverlayL2"></div>
        <div class="ov-cta" id="editorOverlayCta">🛒👇</div>
        <div class="jump-toast hidden" id="editorJumpToast"></div>
      </div>
    `;
    initPreview();
  }
}
