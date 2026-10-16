/**
 * filmstrip.js — BWCut Editor Filmstrip Controller
 * High-speed vertical clip navigator for rapid QC transitions
 */

import { state, on, getEffectiveStatus } from "../store.js";
import { escapeHtml } from "../utils.js";
import { STATUS_META } from "../constants.js";

let filmContainer = null;
let filmCountEl = null;

export function initFilmstrip() {
  filmContainer = document.getElementById("film");
  filmCountEl = document.getElementById("filmCount");

  // Re-render when clips change
  on("clips", () => {
    renderFilmstrip();
  });

  // Re-render when active clip index changes
  on("current", () => {
    renderFilmstrip();
    scrollToActive();
  });

  // When a single clip is updated, update its corresponding film item
  on("clip-update", ({ index }) => {
    updateFilmItem(index);
  });
}

/**
 * Render all clips in the vertical filmstrip
 */
export function renderFilmstrip() {
  if (!filmContainer) return;

  const total = state.clips.length;
  const current = state.currentIndex >= 0 ? state.currentIndex + 1 : 0;

  if (filmCountEl) {
    filmCountEl.textContent = `${current} / ${total}`;
  }

  filmContainer.innerHTML = "";

  if (total === 0) {
    filmContainer.innerHTML = `
      <div style="padding:var(--sp-4);text-align:center;color:var(--c-text-3);font:var(--t-body-s);">
        ไม่มีคลิปในโฟลเดอร์
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  state.clips.forEach((clip, index) => {
    const isActive = index === state.currentIndex;
    const effStatus = getEffectiveStatus(clip);
    const meta = STATUS_META[effStatus] || STATUS_META.unprocessed;

    const item = document.createElement("div");
    item.className = `film-item ${isActive ? "active" : ""}`;
    item.dataset.index = index;
    item.title = `${clip.name} (${meta.label})`;

    // Subtle thumbnail preview or color gradient
    const thumbUrl = `/api/stream?path=${encodeURIComponent(clip.path)}`;

    item.innerHTML = `
      <span class="idx">${String(index + 1).padStart(2, "0")}</span>
      <div class="th">
        <video src="${escapeHtml(thumbUrl)}#t=1.0" preload="metadata" muted playsinline style="width:100%;height:100%;object-fit:cover;pointer-events:none;"></video>
        <span class="status-dot" style="position:absolute;bottom:4px;right:4px;width:8px;height:8px;border-radius:50%;background:${meta.color};box-shadow:0 0 0 1.5px var(--c-surface);"></span>
      </div>
      <div class="info">
        <span class="nm">${escapeHtml(clip.name)}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          ${clip.productCode ? `<span class="tag-code" style="font-size:10px;padding:1px 4px;">${escapeHtml(clip.productCode)}</span>` : ""}
          <span style="font:var(--t-label-s);color:${meta.color};">${escapeHtml(meta.label)}</span>
        </div>
      </div>
    `;

    item.addEventListener("click", () => {
      if (state.currentIndex !== index) {
        window.location.hash = `#/editor/${index}`;
      }
    });

    fragment.appendChild(item);
  });

  filmContainer.appendChild(fragment);
}

/**
 * Update a single film item in-place without rebuilding DOM
 */
function updateFilmItem(index) {
  if (!filmContainer) return;
  const item = filmContainer.querySelector(`.film-item[data-index="${index}"]`);
  if (!item) return;

  const clip = state.clips[index];
  if (!clip) return;

  const effStatus = getEffectiveStatus(clip);
  const meta = STATUS_META[effStatus] || STATUS_META.unprocessed;

  item.className = `film-item ${index === state.currentIndex ? "active" : ""}`;
  item.title = `${clip.name} (${meta.label})`;

  const infoEl = item.querySelector(".info");
  if (infoEl) {
    infoEl.innerHTML = `
      <span class="nm">${escapeHtml(clip.name)}</span>
      <div style="display:flex;align-items:center;gap:6px;">
        ${clip.productCode ? `<span class="tag-code" style="font-size:10px;padding:1px 4px;">${escapeHtml(clip.productCode)}</span>` : ""}
        <span style="font:var(--t-label-s);color:${meta.color};">${escapeHtml(meta.label)}</span>
      </div>
    `;
  }

  const dot = item.querySelector(".status-dot");
  if (dot) dot.style.background = meta.color;
}

/**
 * Scroll filmstrip so active clip is visible
 */
export function scrollToActive() {
  if (!filmContainer) return;
  const activeEl = filmContainer.querySelector(".film-item.active");
  if (activeEl) {
    activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}
