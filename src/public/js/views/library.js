/**
 * library.js — BWCut Clip Library View Controller
 * High-speed 100+ clips grid with keyed updates and batch contextual actions
 */

import { state, emit, on, getEffectiveStatus, getPendingApprovedCount } from "../store.js";
import { STATUS_META } from "../constants.js";
import { formatTime, debounce, escapeHtml } from "../utils.js";
import { batchAnalyze, updateClip, renderBatch } from "../api.js";
import { showSnackbar } from "../ui/snackbar.js";
import { openSettingsModal } from "./settings.js";

const cardElements = new Map();
let lastSelectedIndex = -1;

export function initLibraryView() {
  const viewEl = document.getElementById("view-library");
  if (!viewEl) return;

  // 1. Search input handler (debounce 150ms)
  const searchInput = document.getElementById("libSearchInput");
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      debounce((e) => {
        state.librarySearch = e.target.value.trim().toLowerCase();
        applyFiltersAndRender();
      }, 150)
    );
  }

  // 2. Filter chips handler
  const filterChips = document.querySelectorAll(".lib-filter-chip");
  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      filterChips.forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      state.libraryFilter = chip.dataset.filter || "all";
      applyFiltersAndRender();
    });
  });

  // 3. Select all button in normal toolbar
  const btnSelectAll = document.getElementById("btnLibSelectAll");
  if (btnSelectAll) {
    btnSelectAll.addEventListener("click", () => selectAllVisible(true));
  }

  // 4. Contextual action bar controls
  const btnCloseSelection = document.getElementById("btnCloseSelection");
  if (btnCloseSelection) {
    btnCloseSelection.addEventListener("click", () => selectAllVisible(false));
  }

  const btnCtxSelectAll = document.getElementById("btnCtxSelectAll");
  if (btnCtxSelectAll) {
    btnCtxSelectAll.addEventListener("click", () => selectAllVisible(true));
  }

  const btnCtxSilence = document.getElementById("btnCtxSilence");
  if (btnCtxSilence) btnCtxSilence.addEventListener("click", handleBatchSilence);

  const btnCtxAi = document.getElementById("btnCtxAi");
  if (btnCtxAi) btnCtxAi.addEventListener("click", handleBatchAi);

  const btnCtxReheadline = document.getElementById("btnCtxReheadline");
  if (btnCtxReheadline) btnCtxReheadline.addEventListener("click", handleBatchReheadline);

  const btnCtxApprove = document.getElementById("btnCtxApprove");
  if (btnCtxApprove) btnCtxApprove.addEventListener("click", handleBatchApprove);

  // 5. FAB render approved clips button
  const fabBtn = document.getElementById("btnFabRenderApproved");
  if (fabBtn) {
    fabBtn.addEventListener("click", handleRenderApprovedClips);
  }

  // Listen for store events
  on("clips", () => {
    renderGridFull();
    updateFilterCounts();
    updateContextualBar();
  });

  on("clip-update", ({ clip }) => {
    updateSingleCard(clip);
    updateFilterCounts();
    updateContextualBar();
  });
}

/**
 * Full initial render of the library grid
 */
export function renderGridFull() {
  const gridContainer = document.getElementById("libClipGrid");
  const emptyState = document.getElementById("libEmptyState");
  if (!gridContainer) return;

  gridContainer.innerHTML = "";
  cardElements.clear();

  if (state.clips.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  state.clips.forEach((clip, index) => {
    const card = createCardElement(clip, index);
    cardElements.set(clip.id, card);
    gridContainer.appendChild(card);
  });

  applyFiltersAndRender();
}

/**
 * Keyed update of a single card element in-place without touching other nodes
 */
function updateSingleCard(clip) {
  const existingCard = cardElements.get(clip.id);
  const index = state.clips.findIndex((c) => c.id === clip.id);
  if (!existingCard || index === -1) {
    renderGridFull();
    return;
  }

  const newCard = createCardElement(clip, index);
  existingCard.replaceWith(newCard);
  cardElements.set(clip.id, newCard);
  applyFiltersAndRender();
}

/**
 * Create a DOM card element for a clip
 */
function createCardElement(clip, index) {
  const card = document.createElement("div");
  const effStatus = getEffectiveStatus(clip);
  const isSelected = Boolean(clip.selected || clip.approved);
  const dur = clip.metadata?.durationFormatted || formatTime(clip.metadata?.durationSec || 0);

  card.className = `card ${isSelected ? "sel" : ""} ${effStatus === "analyzing" ? "is-analyzing" : ""}`;
  card.dataset.id = clip.id;
  card.dataset.index = index;

  // Headline lines
  const l1 = clip.headline?.line1 ? `${clip.headline.line1} ${clip.headline.emoji1 || ""}` : "";
  const l2 = clip.headline?.line2 ? `${clip.headline.line2} ${clip.headline.emoji2 || ""}` : "";

  const statusInfo = STATUS_META[effStatus] || STATUS_META.unprocessed;
  const topColor = clip.topHeadlineColor || state.settings?.topHeadlineColor || "#FFE600";
  const botColor = clip.bottomHeadlineColor || state.settings?.bottomHeadlineColor || "#FFFFFF";

  card.innerHTML = `
    <div class="card-media">
      ${clip.thumbnailUrl ? `<img src="${clip.thumbnailUrl}" alt="${escapeHtml(clip.name)}" loading="lazy">` : `<div class="ph"></div>`}
      <span class="card-check"><span class="ms sm">check</span></span>
      <span class="card-dur">${dur}</span>
      ${l1 || l2 ? `
        <div class="card-hl">
          <div style="color:${topColor}">${escapeHtml(l1)}</div>
          <em style="color:${botColor}">${escapeHtml(l2)}</em>
        </div>
      ` : ""}
    </div>
    <div class="card-body">
      <div class="card-name" title="${escapeHtml(clip.name)}">${escapeHtml(clip.name)}</div>
      ${clip.productCode ? `<div><span class="tag-code">🏷️ ${escapeHtml(clip.productCode)}</span></div>` : ""}
      <div class="card-meta">
        <span class="status" data-s="${effStatus}">${statusInfo.label}</span>
        ${clip.silence?.percentTrimmed ? `<span class="trim">−${clip.silence.percentTrimmed}%</span>` : ""}
      </div>
    </div>
  `;

  // Click on Card Checkbox toggles selection
  const checkEl = card.querySelector(".card-check");
  if (checkEl) {
    checkEl.addEventListener("click", (e) => {
      e.stopPropagation();
      handleCheckboxClick(index, e.shiftKey);
    });
  }

  // Click anywhere on Card opens Editor view
  card.addEventListener("click", () => {
    window.location.hash = `#/editor/${index}`;
  });

  return card;
}

/**
 * Handle checkbox selection (supports single and Shift + click range selection)
 */
function handleCheckboxClick(index, isShiftKey) {
  if (index < 0 || index >= state.clips.length) return;

  if (isShiftKey && lastSelectedIndex !== -1) {
    const start = Math.min(lastSelectedIndex, index);
    const end = Math.max(lastSelectedIndex, index);
    const targetState = !state.clips[index].selected;
    for (let i = start; i <= end; i++) {
      state.clips[i].selected = targetState;
      const el = cardElements.get(state.clips[i].id);
      if (el) el.classList.toggle("sel", targetState);
    }
  } else {
    state.clips[index].selected = !state.clips[index].selected;
    const el = cardElements.get(state.clips[index].id);
    if (el) el.classList.toggle("sel", state.clips[index].selected);
    lastSelectedIndex = index;
  }

  updateContextualBar();
}

/**
 * Select or deselect all visible clips
 */
function selectAllVisible(selectState) {
  state.clips.forEach((c) => {
    const card = cardElements.get(c.id);
    if (card && card.style.display !== "none") {
      c.selected = selectState;
      card.classList.toggle("sel", selectState);
    }
  });
  lastSelectedIndex = -1;
  updateContextualBar();
}

/**
 * Filter visibility based on active filter chip and search input
 */
function applyFiltersAndRender() {
  const filter = state.libraryFilter;
  const query = state.librarySearch;

  state.clips.forEach((clip) => {
    const card = cardElements.get(clip.id);
    if (!card) return;

    const effStatus = getEffectiveStatus(clip);
    let matchesFilter = filter === "all" || effStatus === filter;
    let matchesSearch = !query || clip.name.toLowerCase().includes(query) || (clip.productCode && clip.productCode.toLowerCase().includes(query));

    card.style.display = matchesFilter && matchesSearch ? "" : "none";
  });

  updateFilterCounts();
}

/**
 * Update numbers inside filter chips & FAB
 */
function updateFilterCounts() {
  const counts = { all: state.clips.length, unprocessed: 0, ready: 0, approved: 0, completed: 0, error: 0 };

  state.clips.forEach((c) => {
    const s = getEffectiveStatus(c);
    if (counts[s] !== undefined) counts[s]++;
  });

  for (const [key, cnt] of Object.entries(counts)) {
    const countSpan = document.getElementById(`count-filter-${key}`);
    if (countSpan) countSpan.textContent = cnt;
  }

  // Update FAB label
  const pendingApproved = getPendingApprovedCount();
  const fabBtn = document.getElementById("btnFabRenderApproved");
  const fabCount = document.getElementById("fabApprovedCount");
  if (fabBtn && fabCount) {
    fabCount.textContent = pendingApproved;
    fabBtn.classList.toggle("hidden", pendingApproved === 0);
  }

  // Update Rail export badge
  const railBadge = document.getElementById("railExportBadge");
  if (railBadge) {
    railBadge.textContent = pendingApproved;
    railBadge.classList.toggle("hidden", pendingApproved === 0);
  }
}

/**
 * Show/hide contextual bar and update count
 */
function updateContextualBar() {
  const viewEl = document.getElementById("view-library");
  const countEl = document.getElementById("ctxSelectedCount");
  if (!viewEl) return;

  const selectedClips = state.clips.filter((c) => c.selected || c.approved);
  const count = selectedClips.length;

  if (count > 0) {
    viewEl.classList.add("selecting");
    if (countEl) countEl.textContent = `เลือก ${count} คลิป`;
  } else {
    viewEl.classList.remove("selecting");
  }
}

// ─── BATCH ACTION HANDLERS ──────────────────────────────────────────────────

async function handleBatchSilence() {
  const selected = state.clips.filter((c) => c.selected || c.approved);
  if (selected.length === 0) return showSnackbar("กรุณาเลือกคลิปที่ต้องการตัดเสียงก่อนครับ");

  try {
    const res = await batchAnalyze(selected.map((c) => c.id), "silence-only");
    if (res?.ok) {
      showSnackbar(`⚡ กำลังตัดเสียงเงียบแบบ Jump Cut สำหรับ ${res.count} คลิป (100% Offline)`);
    }
  } catch (err) {
    showSnackbar("เกิดข้อผิดพลาด: " + err.message, { tone: "error" });
  }
}

async function handleBatchAi() {
  const selected = state.clips.filter((c) => c.selected || c.approved);
  if (selected.length === 0) return showSnackbar("กรุณาเลือกคลิปที่ต้องการตัดเสียง + พาดหัวก่อนครับ");

  if (!state.settings?.groqApiKey && !state.settings?.geminiApiKey) {
    showSnackbar("ยังไม่ได้ระบุ API Key สำหรับ AI", {
      action: { label: "ไปตั้งค่า", onClick: () => openSettingsModal() },
      duration: 6000,
    });
    return;
  }

  try {
    const res = await batchAnalyze(selected.map((c) => c.id), "full", true);
    if (res?.ok) {
      showSnackbar(`🤖 เริ่มต้น AI ตัดเสียง + คิดพาดหัวสำหรับ ${res.count} คลิป...`);
    }
  } catch (err) {
    showSnackbar("เกิดข้อผิดพลาด: " + err.message, { tone: "error" });
  }
}

async function handleBatchReheadline() {
  const selected = state.clips.filter((c) => c.selected || c.approved);
  if (selected.length === 0) return showSnackbar("กรุณาเลือกคลิปที่ต้องการคิดพาดหัวใหม่ก่อนครับ");

  if (!state.settings?.groqApiKey && !state.settings?.geminiApiKey) {
    showSnackbar("ยังไม่ได้ระบุ API Key สำหรับ AI", {
      action: { label: "ไปตั้งค่า", onClick: () => openSettingsModal() },
      duration: 6000,
    });
    return;
  }

  try {
    const res = await batchAnalyze(selected.map((c) => c.id), "headline-only", true);
    if (res?.ok) {
      showSnackbar(`💡 สั่ง AI คิดพาดหัวใหม่สำหรับ ${res.count} คลิป...`);
    }
  } catch (err) {
    showSnackbar("เกิดข้อผิดพลาด: " + err.message, { tone: "error" });
  }
}

async function handleBatchApprove() {
  const selected = state.clips.filter((c) => c.selected || c.approved);
  if (selected.length === 0) return showSnackbar("กรุณาเลือกคลิปที่ต้องการอนุมัติก่อนครับ");

  for (const c of selected) {
    c.approved = true;
    if (c.status !== "rendering" && c.status !== "completed") {
      c.status = "approved";
    }
    updateClip(c.id, { approved: true, status: c.status }).catch(() => {});
  }

  showSnackbar(`✅ ผ่าน QC ${selected.length} คลิปเรียบร้อยแล้ว`);
  renderGridFull();
}

async function handleRenderApprovedClips() {
  const pending = state.clips.filter((c) => c.approved && c.status !== "completed" && c.status !== "rendering");
  if (pending.length === 0) {
    return showSnackbar("ยังไม่มีคลิปที่ผ่าน QC รอเรนเดอร์ครับ");
  }

  const clipOverrides = {};
  pending.forEach((c) => {
    clipOverrides[c.id] = {
      fontFamily: c.fontFamily,
      topFontSize: c.topFontSize,
      bottomFontSize: c.bottomFontSize,
      lineSpacing: c.lineSpacing,
      topHeadlineColor: c.topHeadlineColor,
      bottomHeadlineColor: c.bottomHeadlineColor,
      enableCta: c.enableCta,
      randomZoom: c.randomZoom,
      enableHookZoom: c.enableHookZoom,
      hookZoomDurationSec: c.hookZoomDurationSec,
      hookZoomScalePercent: c.hookZoomScalePercent,
      headlineStartSec: c.headlineStartSec,
      headlineEndSec: c.headlineEndSec,
    };
  });

  try {
    const res = await renderBatch(pending.map((c) => c.id), clipOverrides);
    if (res?.ok) {
      window.location.hash = "#/export";
    }
  } catch (err) {
    showSnackbar("การสั่งเรนเดอร์ล้มเหลว: " + err.message, { tone: "error" });
  }
}
