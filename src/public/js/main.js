/**
 * main.js — BWCut Studio Production Controller (0 - 100% Real Engine)
 * Fully wired to BWCut Backend APIs with Zero Mockup Dependencies
 */

// ─── UTILITIES & HELPERS ─────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(sec) {
  if (sec === null || isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTimePrecise(sec) {
  if (sec === null || isNaN(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

const ST_META = {
  unprocessed: { label: "ยังไม่ตัด", color: "var(--st-unprocessed)" },
  analyzing:   { label: "กำลังตัดเสียง...", color: "var(--st-analyzing)" },
  ready:       { label: "รอตรวจ", color: "var(--st-ready)" },
  approved:    { label: "ผ่าน QC", color: "var(--st-approved)" },
  rendering:   { label: "กำลังเรนเดอร์", color: "var(--st-rendering)" },
  completed:   { label: "เรนเดอร์แล้ว", color: "var(--st-completed)" },
  error:       { label: "ผิดพลาด", color: "var(--st-error)" }
};

const SWATCH_PRESETS = [
  ["#FFE600","#FFFFFF"],["#FFFFFF","#FFE600"],["#00FF66","#FFFFFF"],["#00E5FF","#FFFFFF"],["#FF6B00","#FFFFFF"],
  ["#FF2A85","#FFFFFF"],["#FFE600","#00E5FF"],["#FF3333","#FFFFFF"],["#2EE59D","#FFE600"],["#C084FC","#FFFFFF"]
];

const THAI_FONTS = [
  { value: "none", label: "ไม่ใส่ข้อความ" },
  { value: "Prompt-Bold", label: "Prompt Bold (ค่าเริ่มต้น)" },
  { value: "Kanit-Regular", label: "Kanit Regular" },
  { value: "Kanit-MediumItalic", label: "Kanit Medium Italic" },
  { value: "Mitr-Bold", label: "Mitr Bold" },
  { value: "Mitr-Regular", label: "Mitr Regular" },
  { value: "NotoSansThai-Bold", label: "Noto Sans Thai Bold" },
  { value: "Athiti-Regular", label: "Athiti Regular" },
  { value: "Fahkwang-Medium", label: "Fahkwang Medium" },
  { value: "Mali-Medium", label: "Mali Medium" },
  { value: "Niramit-Medium", label: "Niramit Medium" },
  { value: "Pattaya-Regular", label: "Pattaya Regular" },
  { value: "Sriracha-Regular", label: "Sriracha Regular" }
];

// ─── APPLICATION STATE ───────────────────────────────────────────────────────

let clips = [];
let renderQueue = [];
let currentClipIndex = -1;
let currentFilter = "all";
let filmstripFilter = "all";
let isRendering = false;
let wasRenderingBatch = false;
let systemSettings = {};
let sseSource = null;

// Timeline & Editing State
let markIn = null;
let markOut = null;
let timelineZoom = 1.0;
const ZOOM_STEPS = [1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0, 16.0];
let jumpCutEnabled = true;
let isScrubbing = false;
let isSelectingOnTimeline = false;
let selectDragStartTime = 0;

// Undo / Redo history map (clipId -> { undo: [], redo: [] })
const clipHistory = new Map();

// ─── INITIALIZATION ──────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", async () => {
  initUIComponents();
  initInspectorTabs();
  initTimelineInteractions();
  initEventBindings();
  initShortcuts();

  // 1. Connect Realtime Server-Sent Events (SSE)
  connectSSE();

  // 2. Fetch system configuration & current session folder
  await loadSystemStatus();
});

// ─── SSE CONNECTION & EVENT ROUTER ───────────────────────────────────────────

function connectSSE() {
  if (sseSource) sseSource.close();
  sseSource = new EventSource("/api/render-events");

  sseSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      switch (data.type) {
        case "init":
          if (Array.isArray(data.clips)) {
            clips = data.clips;
            renderLibraryGrid();
            renderFilmstrip();
            updateFilterCounters();
            if (clips.length > 0 && currentClipIndex === -1) {
              loadClipToEditor(0);
            }
          }
          if (Array.isArray(data.queue)) {
            renderQueue = data.queue;
            renderQueueTable();
          }
          isRendering = Boolean(data.isRendering);
          if (Array.isArray(data.logs)) {
            data.logs.forEach(appendTerminalLog);
          }
          break;

        case "clip-update":
          if (data.clip) {
            handleClipUpdateFromServer(data.clip);
          }
          break;

        case "queue-update":
          const prevRendering = isRendering;
          renderQueue = data.queue || [];
          isRendering = Boolean(data.isRendering);
          renderQueueTable();
          updateExportBadge();
          updateRenderProgressCard(null);

          const totalJobs = renderQueue.length;
          const doneJobs = renderQueue.filter((q) => q.status === "completed").length;
          if ((prevRendering || wasRenderingBatch) && !isRendering && totalJobs > 0 && doneJobs === totalJobs) {
            wasRenderingBatch = false;
            showRenderCompleteModal(doneJobs);
          }
          break;

        case "render-progress":
          if (data.queue) renderQueue = data.queue;
          updateRenderProgressCard(data.progress);
          renderQueueTable();
          break;

        case "log":
          if (data.message) appendTerminalLog(data.message);
          break;
      }
    } catch (err) {
      console.error("SSE Error:", err);
    }
  };

  sseSource.onerror = () => {
    setTimeout(connectSSE, 3000);
  };
}

function handleClipUpdateFromServer(updatedClip) {
  const idx = clips.findIndex((c) => c.id === updatedClip.id);
  if (idx !== -1) {
    // Preserve local selection state
    const wasSelected = clips[idx].selected;
    clips[idx] = { ...clips[idx], ...updatedClip, selected: wasSelected };

    renderLibraryGrid();
    renderFilmstrip();
    updateFilterCounters();

    // If currently viewing this clip, refresh stage and inspector
    if (idx === currentClipIndex) {
      loadClipToEditor(idx, false);
    }
  } else {
    clips.push(updatedClip);
    renderLibraryGrid();
    renderFilmstrip();
    updateFilterCounters();
  }
}

// ─── SYSTEM API CALLS ────────────────────────────────────────────────────────

async function loadSystemStatus() {
  try {
    const res = await fetch("/api/system");
    if (!res.ok) return;
    const sys = await res.json();
    if (sys.ok) {
      systemSettings = sys.settings || {};
      populateSettingsModal(systemSettings);

      const savedFolder = localStorage.getItem("bwcut_last_folder");
      const folderPath = savedFolder || sys.currentFolderPath || "";
      const input = document.getElementById("folderInput");
      if (input && folderPath) {
        input.value = folderPath;
        // Trigger initial scan on the saved folder
        await executeFolderScan(folderPath);
      }
    }
  } catch (err) {
    console.error("Failed to load system status:", err);
  }
}

async function executeFolderScan(folderPath) {
  if (!folderPath) return;

  const btnScan = document.getElementById("btnFolderScan");
  if (btnScan) {
    btnScan.disabled = true;
    btnScan.innerHTML = `<span class="ms sm spin">progress_activity</span>กำลังสแกน...`;
  }

  try {
    localStorage.setItem("bwcut_last_folder", folderPath);
    appendTerminalLog(`สแกนโฟลเดอร์: ${folderPath}...`);

    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath })
    });

    const data = await res.json();
    if (data.ok && Array.isArray(data.clips)) {
      clips = data.clips;
      renderLibraryGrid();
      renderFilmstrip();
      updateFilterCounters();
      appendTerminalLog(`✓ พบวิดีโอทั้งหมด ${clips.length} ไฟล์ในโฟลเดอร์`);
      showSnackbar(`✓ สแกนพบ ${clips.length} คลิปเรียบร้อยแล้ว`);

      if (clips.length > 0) {
        loadClipToEditor(0);
      } else {
        showEmptyLibraryNotice();
      }
    } else {
      showSnackbar("สแกนไม่สำเร็จ: " + (data.error || "เกิดข้อผิดพลาด"), { danger: true });
    }
  } catch (err) {
    showSnackbar("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: " + err.message, { danger: true });
  } finally {
    if (btnScan) {
      btnScan.disabled = false;
      btnScan.innerHTML = `<span class="ms">refresh</span>สแกน`;
    }
  }
}

// ─── VIEW ROUTING (1:1 with mockup.html) ──────────────────────────────────────

window.go = function(viewName) {
  document.querySelectorAll(".view").forEach((el) => {
    el.classList.toggle("active", el.id === "view-" + viewName);
  });
  document.querySelectorAll(".rail-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.v === viewName);
  });
  window.location.hash = "#/" + viewName;

  if (viewName === "editor" && currentClipIndex >= 0 && clips[currentClipIndex]) {
    // Re-fit stage wrapper
    setTimeout(fitStageVideoWrapper, 50);
  }
};

window.toggleSel = function(on) {
  const lib = document.getElementById("view-library");
  if (lib) lib.classList.toggle("selecting", on);
  updateContextualBar();
};

window.openDlg = async function() {
  const dlg = document.getElementById("dlg");
  if (!dlg) return;
  try {
    const res = await fetch("/api/settings");
    if (res.ok) {
      systemSettings = await res.json();
      populateSettingsModal(systemSettings);
    }
  } catch {}
  dlg.classList.add("show");
};

// ─── LIBRARY VIEW (GRID, SELECTION, FILTERING) ───────────────────────────────

function renderLibraryGrid() {
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.innerHTML = "";

  if (clips.length === 0) {
    showEmptyLibraryNotice();
    return;
  }

  const query = (document.getElementById("libSearchInput")?.value || "").toLowerCase().trim();

  clips.forEach((clip, i) => {
    // 1. Status Filter
    const effStatus = getEffectiveStatus(clip);
    if (currentFilter !== "all" && effStatus !== currentFilter) return;

    // 2. Search Query Filter
    if (query) {
      const nameMatch = clip.name.toLowerCase().includes(query);
      const codeMatch = (clip.productCode || "").toLowerCase().includes(query);
      if (!nameMatch && !codeMatch) return;
    }

    const meta = ST_META[effStatus] || ST_META.unprocessed;
    const isSelected = Boolean(clip.selected);
    const durFormatted = clip.metadata?.durationFormatted || formatTime(clip.metadata?.durationSec || 0);

    const card = document.createElement("div");
    card.className = `card ${isSelected ? "sel" : ""}`;
    card.dataset.id = clip.id;
    card.dataset.index = i;

    // Media Thumbnail
    const thumbSrc = clip.thumbnailUrl || (clip.path ? `/api/stream?path=${encodeURIComponent(clip.path)}#t=1.0` : "");
    const mediaHtml = clip.thumbnailUrl
      ? `<img src="${clip.thumbnailUrl}" loading="lazy" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;">`
      : thumbSrc
      ? `<video src="${thumbSrc}" preload="metadata" muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;"></video>`
      : `<div class="ph" style="background:#202124;"></div>`;

    // Headline Preview Overlay on Card
    const l1 = clip.headline?.line1 ? `${clip.headline.line1} ${clip.headline.emoji1 || ""}` : "";
    const l2 = clip.headline?.line2 ? `${clip.headline.line2} ${clip.headline.emoji2 || ""}` : "";
    const topCol = clip.topHeadlineColor || systemSettings.topHeadlineColor || "#FFE600";
    const botCol = clip.bottomHeadlineColor || systemSettings.bottomHeadlineColor || "#FFFFFF";

    card.innerHTML = `
      <div class="card-media">
        ${mediaHtml}
        ${l1 || l2 ? `
          <div class="card-hl">
            <span style="color:${topCol}">${escapeHtml(l1)}</span>
            <em style="color:${botCol}">${escapeHtml(l2)}</em>
          </div>
        ` : ""}
        <span class="card-check"><span class="ms sm">check</span></span>
        <span class="card-dur">${escapeHtml(durFormatted)}</span>
      </div>
      <div class="card-body">
        <div class="card-name" title="${escapeHtml(clip.name)}">${escapeHtml(clip.name)}</div>
        ${clip.productCode ? `<span><span class="tag-code">${escapeHtml(clip.productCode)}</span></span>` : ""}
        <div class="card-meta">
          <span class="status" data-s="${effStatus}">${meta.label}</span>
          ${clip.silence?.percentTrimmed ? `<span class="trim">−${clip.silence.percentTrimmed}%</span>` : ""}
        </div>
      </div>
    `;

    // Checkbox toggle (Click on circular check icon)
    const checkBtn = card.querySelector(".card-check");
    checkBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      clip.selected = !clip.selected;
      card.classList.toggle("sel", clip.selected);
      updateContextualBar();
    });

    // Card body click opens clip in Editor View
    card.addEventListener("click", () => {
      loadClipToEditor(i, true);
      go("editor");
    });

    grid.appendChild(card);
  });

  updateContextualBar();
}

function getEffectiveStatus(clip) {
  if (!clip) return "unprocessed";
  let s = clip.status || "unprocessed";
  if (clip.approved && s !== "rendering" && s !== "completed") {
    return "approved";
  }
  return s;
}

function updateFilterCounters() {
  const counts = { all: clips.length, unprocessed: 0, ready: 0, approved: 0, completed: 0, error: 0 };
  clips.forEach((c) => {
    const s = getEffectiveStatus(c);
    if (counts[s] !== undefined) counts[s]++;
  });

  document.getElementById("countAll") && (document.getElementById("countAll").textContent = counts.all);
  document.getElementById("countUnprocessed") && (document.getElementById("countUnprocessed").textContent = counts.unprocessed);
  document.getElementById("countReady") && (document.getElementById("countReady").textContent = counts.ready);
  document.getElementById("countApproved") && (document.getElementById("countApproved").textContent = counts.approved);
  document.getElementById("countCompleted") && (document.getElementById("countCompleted").textContent = counts.completed);
  document.getElementById("countError") && (document.getElementById("countError").textContent = counts.error);

  updateExportBadge();
}

function updateContextualBar() {
  const selCount = clips.filter((c) => c.selected).length;
  const countLabel = document.getElementById("ctxSelectedCount");
  if (countLabel) countLabel.textContent = `เลือก ${selCount} คลิป`;

  const libView = document.getElementById("view-library");
  if (libView) libView.classList.toggle("selecting", selCount > 0);
}

function updateExportBadge() {
  const pendingApproved = clips.filter((c) => c.approved && c.status !== "completed" && c.status !== "rendering").length;

  const fab = document.getElementById("btnFabRenderApproved");
  const fabSpan = document.getElementById("fabApprovedCount");
  if (fab && fabSpan) {
    fabSpan.textContent = pendingApproved;
    fab.style.display = pendingApproved > 0 ? "flex" : "none";
  }

  // Editor stage topbar render approved button
  const editorBtn = document.getElementById("btnEditorRenderApproved");
  const editorSpan = document.getElementById("editorApprovedCount");
  if (editorBtn && editorSpan) {
    editorSpan.textContent = pendingApproved;
    editorBtn.style.display = pendingApproved > 0 ? "inline-flex" : "none";
  }

  const badge = document.getElementById("railBadgeExport");
  if (badge) {
    badge.textContent = pendingApproved;
    badge.style.display = pendingApproved > 0 ? "flex" : "none";
  }
}

function showEmptyLibraryNotice() {
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px var(--sp-4);color:var(--c-text-3);">
      <span class="ms" style="font-size:48px;opacity:0.4;display:block;margin-bottom:12px;">video_library</span>
      <h3 style="font:var(--t-title-m);color:var(--c-text);margin-bottom:8px;">ไม่พบไฟล์วิดีโอในโฟลเดอร์นี้</h3>
      <p style="font:var(--t-body-m);max-width:440px;margin:0 auto 16px;">
        กรุณาตรวจสอบ Path ด้านบน หรือเลือกโฟลเดอร์ที่มีไฟล์วิดีโอ .mp4, .mov แล้วกดปุ่ม <b>สแกน</b>
      </p>
    </div>
  `;
}

// ─── EDITOR VIEW (VIDEO STAGE, FILMSTRIP, TIMELINE, INSPECTOR) ───────────────

function renderFilmstrip() {
  const film = document.getElementById("film");
  if (!film) return;
  film.innerHTML = "";

  // 1. Calculate counts for film filter dropdown
  const counts = { all: clips.length, unprocessed: 0, ready: 0, approved: 0, completed: 0, error: 0 };
  clips.forEach((clip) => {
    const s = getEffectiveStatus(clip);
    if (counts[s] !== undefined) counts[s]++;
  });

  const setC = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setC("ffCountAll", counts.all);
  setC("ffCountUnprocessed", counts.unprocessed);
  setC("ffCountReady", counts.ready);
  setC("ffCountApproved", counts.approved);
  setC("ffCountCompleted", counts.completed);
  setC("ffCountError", counts.error);

  // Update filter button active visual state
  const btnFilter = document.getElementById("btnFilmFilter");
  if (btnFilter) {
    btnFilter.classList.toggle("selected", filmstripFilter !== "all");
    if (filmstripFilter !== "all") {
      btnFilter.style.color = "var(--c-primary)";
      btnFilter.style.background = "var(--c-primary-container)";
    } else {
      btnFilter.style.color = "";
      btnFilter.style.background = "";
    }
  }

  // 2. Filter clips according to filmstripFilter
  const filteredIndices = [];
  clips.forEach((clip, i) => {
    const effStatus = getEffectiveStatus(clip);
    if (filmstripFilter === "all" || effStatus === filmstripFilter) {
      filteredIndices.push(i);
    }
  });

  const filmCount = document.getElementById("filmCount");
  if (filmCount) {
    const posInFiltered = filteredIndices.indexOf(currentClipIndex);
    const posLabel = posInFiltered >= 0 ? posInFiltered + 1 : (filteredIndices.length > 0 ? 1 : 0);
    filmCount.textContent = `${posLabel} / ${filteredIndices.length}${filmstripFilter !== "all" ? ` (${counts.all})` : ""}`;
  }

  if (filteredIndices.length === 0) {
    film.innerHTML = `
      <div style="padding:28px 12px;text-align:center;color:var(--c-text-3);font:var(--t-body-s);">
        ไม่พบคลิปในสถานะนี้
      </div>
    `;
    return;
  }

  filteredIndices.forEach((i) => {
    const clip = clips[i];
    const effStatus = getEffectiveStatus(clip);
    const meta = ST_META[effStatus] || ST_META.unprocessed;
    const isActive = i === currentClipIndex;

    const item = document.createElement("div");
    item.className = `film-item ${isActive ? "active" : ""}`;
    item.dataset.index = i;

    const thumbSrc = clip.thumbnailUrl || (clip.path ? `/api/stream?path=${encodeURIComponent(clip.path)}#t=1.0` : "");
    const thHtml = clip.thumbnailUrl
      ? `<img src="${clip.thumbnailUrl}" loading="lazy" alt="" style="width:100%;height:100%;object-fit:cover;pointer-events:none;">`
      : thumbSrc
      ? `<video src="${thumbSrc}" preload="metadata" muted playsinline style="width:100%;height:100%;object-fit:cover;pointer-events:none;"></video>`
      : `<div style="width:100%;height:100%;background:#202124;"></div>`;

    item.innerHTML = `
      <span class="idx">${i + 1}</span>
      <div class="th">
        ${thHtml}
        <span style="position:absolute;bottom:3px;right:3px;width:7px;height:7px;border-radius:50%;background:${meta.color};box-shadow:0 0 0 1.5px var(--c-surface);"></span>
      </div>
      <div class="info">
        <span class="nm">${escapeHtml(clip.name)}</span>
        <span class="status" data-s="${effStatus}">${meta.label}</span>
      </div>
    `;

    item.addEventListener("click", () => {
      loadClipToEditor(i, true);
    });

    film.appendChild(item);
  });
}

function loadClipToEditor(index, reloadVideo = true) {
  if (index < 0 || index >= clips.length) return;
  currentClipIndex = index;
  const clip = clips[index];

  // 1. Stage Header
  const headName = document.getElementById("editorClipHeadName");
  if (headName) headName.textContent = clip.name;

  const headCode = document.getElementById("editorHeadProductCode");
  if (headCode) {
    headCode.textContent = clip.productCode || "";
    headCode.style.display = clip.productCode ? "inline-block" : "none";
  }

  const headStatus = document.getElementById("editorHeadStatus");
  if (headStatus) {
    const eff = getEffectiveStatus(clip);
    headStatus.dataset.s = eff;
    headStatus.textContent = (ST_META[eff] || ST_META.unprocessed).label;
  }

  const badge = document.getElementById("inspClipBadge");
  if (badge) badge.textContent = `${index + 1} / ${clips.length}`;

  const filmCount = document.getElementById("filmCount");
  if (filmCount) filmCount.textContent = `${index + 1} / ${clips.length}`;

  // 2. Video Player
  const video = document.getElementById("editorVideo");
  const placeholder = document.getElementById("editorVideoPlaceholder");
  if (clip.path && video) {
    if (placeholder) placeholder.style.display = "none";
    video.style.display = "block";
    if (reloadVideo) {
      video.src = `/api/stream?path=${encodeURIComponent(clip.path)}`;
      video.load();
    }
  }

  // 3. Update Video Overlay Typography
  updateVideoOverlay();

  // 4. Populate Inspector Form Fields
  populateInspectorFields(clip);

  // 5. Render Timeline Multi-Track
  renderTimelineForClip(clip);

  // 6. Highlight active filmstrip item & scroll into view
  document.querySelectorAll(".film-item").forEach((el) => {
    const elIdx = parseInt(el.dataset.index, 10);
    const active = elIdx === index;
    el.classList.toggle("active", active);
    if (active) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  // Reset mark in/out on clip change
  markIn = null;
  markOut = null;
  updateMarkInOutUI();
}

function fitStageVideoWrapper() {
  const frame = document.querySelector(".video-frame");
  const video = document.getElementById("editorVideo");
  if (!frame || !video) return;

  const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  const vidW = video.videoWidth || clip?.metadata?.width || 1080;
  const vidH = video.videoHeight || clip?.metadata?.height || 1920;
  const aspect = vidW / vidH;

  frame.style.aspectRatio = `${aspect}`;
}

function updateVideoOverlay() {
  fitStageVideoWrapper();

  const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  if (!clip) return;

  const l1El = document.getElementById("editorOverlayL1");
  const l2El = document.getElementById("editorOverlayL2");
  const ctaEl = document.getElementById("editorOverlayCta");

  const l1Text = clip.headline?.line1 ? `${clip.headline.line1} ${clip.headline.emoji1 || ""}` : "";
  const l2Text = clip.headline?.line2 ? `${clip.headline.line2} ${clip.headline.emoji2 || ""}` : "";

  const chosenFont = clip.fontFamily || systemSettings.defaultFont || "Prompt-Bold";
  const topPt = clip.topFontSize || systemSettings.topFontSize || 14;
  const botPt = clip.bottomFontSize || systemSettings.bottomFontSize || 14;
  const spacing = clip.lineSpacing || systemSettings.defaultLineSpacing || 68;

  const topColor = clip.topHeadlineColor || systemSettings.topHeadlineColor || "#FFE600";
  const botColor = clip.bottomHeadlineColor || systemSettings.bottomHeadlineColor || "#FFFFFF";

  // 1:1 Scaling formula matching render-direct.ts
  const frame = document.querySelector(".video-frame");
  const previewW = frame ? frame.offsetWidth : 270;
  const scale = previewW / 1080;

  if (l1El) {
    l1El.textContent = l1Text;
    l1El.style.color = topColor;
    l1El.style.fontFamily = `"${chosenFont}", sans-serif`;
    l1El.style.fontSize = `${Math.max(8, Math.round(topPt * 5.3 * scale))}px`;
    l1El.style.display = chosenFont === "none" ? "none" : "block";
  }

  if (l2El) {
    l2El.textContent = l2Text;
    l2El.style.color = botColor;
    l2El.style.fontFamily = `"${chosenFont}", sans-serif`;
    l2El.style.fontSize = `${Math.max(8, Math.round(botPt * 5.3 * scale))}px`;
    const gapPct = (spacing / 1920) * 100;
    l2El.style.top = `calc(15.75% + ${gapPct}%)`;
    l2El.style.display = chosenFont === "none" ? "none" : "block";
  }

  if (ctaEl) {
    ctaEl.textContent = clip.basketCta || "🛒👇";
    ctaEl.style.display = clip.enableCta !== false ? "block" : "none";
    ctaEl.style.fontSize = `${Math.max(12, Math.round(30 * 5.3 * scale))}px`;
  }
}

function updateProductCodeHelper(code) {
  const helper = document.getElementById("qcProductCodeHelper");
  if (!helper) return;
  const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  const baseName = clip?.name ? clip.name.replace(/\.[^/.]+$/, "") : "video";
  const val = (code || "").trim();

  if (!val) {
    helper.textContent = `(ไม่มีรหัสสินค้า · ไฟล์จะชื่อ ${baseName}.mp4)`;
    helper.className = "helper";
  } else {
    const clean = val.replace(/[^a-zA-Z0-9_-]/g, "");
    helper.textContent = `✓ ชื่อไฟล์ผลลัพธ์: ${clean.toUpperCase()}_${baseName}.mp4`;
    helper.className = "helper ok";
  }
}

function populateInspectorFields(clip) {
  const activeEl = document.activeElement;

  // 1. Text Tab
  const pCode = document.getElementById("qcProductCode");
  if (pCode && activeEl !== pCode) {
    pCode.value = clip.productCode || "";
  }
  updateProductCodeHelper(pCode ? pCode.value : "");

  const l1 = document.getElementById("qcLine1");
  const e1 = document.getElementById("qcEmoji1");
  const l2 = document.getElementById("qcLine2");
  const e2 = document.getElementById("qcEmoji2");

  if (l1 && activeEl !== l1) l1.value = clip.headline?.line1 || "";
  if (e1 && activeEl !== e1) e1.value = clip.headline?.emoji1 || "🔥";
  if (l2 && activeEl !== l2) l2.value = clip.headline?.line2 || "";
  if (e2 && activeEl !== e2) e2.value = clip.headline?.emoji2 || "👇";

  const hStart = document.getElementById("qcHeadStartSec");
  const hEnd = document.getElementById("qcHeadEndSec");
  const totalSec = clip.metadata?.durationSec || 10;
  if (hStart && activeEl !== hStart) hStart.value = clip.headlineStartSec !== undefined ? clip.headlineStartSec : "0.0";
  if (hEnd && activeEl !== hEnd) hEnd.value = clip.headlineEndSec !== undefined ? clip.headlineEndSec : Math.min(totalSec, 10.0).toFixed(1);

  // 2. Style Tab
  populateFontList(clip.fontFamily || systemSettings.defaultFont || "Prompt-Bold");
  const topSizeEl = document.getElementById("qcTopFontSizeVal");
  if (topSizeEl && activeEl !== topSizeEl) {
    topSizeEl.value = clip.topFontSize || 14;
  }
  const botSizeEl = document.getElementById("qcBottomFontSizeVal");
  if (botSizeEl && activeEl !== botSizeEl) {
    botSizeEl.value = clip.bottomFontSize || 14;
  }
  document.getElementById("qcLineSpacingVal").textContent = `${clip.lineSpacing || 68} px`;
  document.getElementById("qcLineSpacingSlider").value = clip.lineSpacing || 68;
  updateInspectorColors(clip.topHeadlineColor || "#FFE600", clip.bottomHeadlineColor || "#FFFFFF");

  // 3. FX Tab
  const ctaCheck = document.getElementById("qcEnableCta");
  if (ctaCheck) ctaCheck.checked = clip.enableCta !== false;

  const rndZoom = document.getElementById("qcRandomZoom");
  if (rndZoom) rndZoom.checked = clip.randomZoom ?? systemSettings.randomZoom ?? true;

  const hookZoom = document.getElementById("qcEnableHookZoom");
  if (hookZoom) hookZoom.checked = clip.enableHookZoom ?? systemSettings.enableHookZoom ?? false;

  const hookSub = document.getElementById("qcHookZoomSubOpts");
  if (hookSub) hookSub.style.display = hookZoom?.checked ? "flex" : "none";

  const hookDur = document.getElementById("qcHookZoomDur");
  if (hookDur) hookDur.value = clip.hookZoomDurationSec ?? 4.0;

  const hookScale = document.getElementById("qcHookZoomScale");
  if (hookScale) hookScale.value = clip.hookZoomScalePercent ?? 120;

  // Beauty segmented
  const level = clip.beautyLevel || "none";
  document.querySelectorAll("#qcBeautySegmented button").forEach((b) => {
    b.classList.toggle("on", b.dataset.val === level);
  });

  // 4. Audio Tab
  const th = clip.silence?.thresholdDb ?? systemSettings.silenceThresholdDb ?? -20;
  const thSlider = document.getElementById("qcThresholdSlider");
  const thVal = document.getElementById("qcThresholdVal");
  if (thSlider) thSlider.value = th;
  if (thVal) thVal.textContent = `${th} dB`;
}

function populateFontList(currentFont) {
  const container = document.getElementById("inspFontList");
  if (!container) return;

  const existingOpts = container.querySelectorAll(".font-opt");
  if (existingOpts.length === THAI_FONTS.length) {
    existingOpts.forEach((opt) => {
      opt.classList.toggle("on", opt.dataset.f === currentFont);
    });
    return;
  }

  container.innerHTML = "";

  THAI_FONTS.forEach((f) => {
    const opt = document.createElement("div");
    opt.className = `font-opt ${f.value === currentFont ? "on" : ""}`;
    opt.dataset.f = f.value;
    opt.innerHTML = `
      <span class="pv" style="${f.value !== 'none' ? `font-family:'${f.value}',sans-serif;` : 'color:var(--c-text-3);'}">
        ${f.value === 'none' ? 'ไม่ใส่ข้อความ' : 'ป้ายยาของดี'}
      </span>
      <small>${escapeHtml(f.label)}</small>
    `;
    opt.addEventListener("click", () => {
      container.querySelectorAll(".font-opt").forEach((o) => o.classList.remove("on"));
      opt.classList.add("on");
      const clip = clips[currentClipIndex];
      if (clip) {
        clip.fontFamily = f.value;
        updateVideoOverlay();
        saveClipChangesToServer(clip);
      }
    });
    container.appendChild(opt);
  });
}

function updateInspectorColors(top, bot) {
  const swTop = document.getElementById("swatchTopColor");
  const swBot = document.getElementById("swatchBotColor");
  const txtTop = document.getElementById("swatchTopColorText");
  const txtBot = document.getElementById("swatchBotColorText");
  const inTop = document.getElementById("qcTopColorInput");
  const inBot = document.getElementById("qcBotColorInput");

  if (swTop) swTop.style.background = top;
  if (swBot) swBot.style.background = bot;
  if (txtTop) txtTop.textContent = top;
  if (txtBot) txtBot.textContent = bot;
  if (inTop && top && top.startsWith("#")) inTop.value = top;
  if (inBot && bot && bot.startsWith("#")) inBot.value = bot;

  // Highlight matching swatch preset (if any)
  document.querySelectorAll("#sw .sw").forEach((el) => {
    const elTop = el.dataset.top || "";
    const elBot = el.dataset.bot || "";
    const match = elTop.toUpperCase() === (top || "").toUpperCase() && elBot.toUpperCase() === (bot || "").toUpperCase();
    el.classList.toggle("on", match);
  });
}

// ─── TIMELINE ENGINE (WAVEFORM, AUDIBLE SEGMENTS, MARKS, SCRUBBING) ──────────

function renderTimelineForClip(clip) {
  const track = document.getElementById("timelineTrack");
  const audioLane = document.getElementById("audio");
  if (!track || !audioLane || !clip) return;

  const totalSec = clip.metadata?.durationSec || clip.silence?.originalDurationSec || 1;
  const keptSec = clip.silence?.keptDurationSec || totalSec;
  const removedSec = clip.silence?.removedDurationSec || 0;
  const pct = clip.silence?.percentTrimmed || 0;

  // 1. Stats Bar
  document.getElementById("tlStatKept").textContent = `พูด ${keptSec.toFixed(1)}s`;
  document.getElementById("tlStatRemoved").textContent = `ตัดออก ${removedSec.toFixed(1)}s`;
  document.getElementById("tlStatPct").textContent = `−${pct}%`;

  // 2. Ruler
  const ruler = document.getElementById("ruler");
  if (ruler) {
    ruler.innerHTML = "";
    const step = totalSec > 60 ? 5 : totalSec > 30 ? 2 : 1;
    for (let t = 0; t <= totalSec; t += step) {
      const span = document.createElement("span");
      span.style.left = `${(t / totalSec) * 100}%`;
      span.textContent = formatTime(t);
      ruler.appendChild(span);
    }
  }

  // 3. Headline Bar
  updateTimelineHeadlineBar(clip, totalSec);

  // 4. Audio Waveform Background
  const wave = document.getElementById("timelineWave");
  if (wave) {
    wave.style.backgroundImage = `url('/api/waveform/${encodeURIComponent(clip.id)}.png')`;
  }

  // 5. Audible Speech Segments (Green bars)
  audioLane.querySelectorAll(".seg").forEach((el) => el.remove());
  const audibleParts = clip.silence?.audibleParts || [{ startInSeconds: 0, endInSeconds: totalSec, durationInSeconds: totalSec }];

  audibleParts.forEach((part) => {
    const seg = document.createElement("div");
    seg.className = "seg";
    const leftPct = (part.startInSeconds / totalSec) * 100;
    const widthPct = (part.durationInSeconds / totalSec) * 100;
    seg.style.left = `${leftPct}%`;
    seg.style.width = `${widthPct}%`;
    seg.title = `พูด: ${part.startInSeconds.toFixed(1)}s – ${part.endInSeconds.toFixed(1)}s (${part.durationInSeconds.toFixed(1)}s)`;

    // Double-click segment to select its range
    seg.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      markIn = part.startInSeconds;
      markOut = part.endInSeconds;
      updateMarkInOutUI();
    });

    audioLane.appendChild(seg);
  });

  // 6. Selection Overlay & Undo/Redo Buttons
  renderMarkOverlayOnTimeline(totalSec);
  updateUndoRedoButtons(clip);
}

function updateTimelineHeadlineBar(clip, totalSec) {
  const bar = document.getElementById("timelineHeadlineBar");
  if (!bar) return;

  const start = clip.headlineStartSec !== undefined ? clip.headlineStartSec : 0.0;
  const end = clip.headlineEndSec !== undefined ? clip.headlineEndSec : Math.min(totalSec, 10.0);

  if (end > start) {
    const leftPct = (start / totalSec) * 100;
    const widthPct = ((end - start) / totalSec) * 100;
    bar.style.left = `${leftPct}%`;
    bar.style.width = `${widthPct}%`;
    bar.style.display = "flex";
    const text = clip.headline?.line1 || "พาดหัวคลิป";
    bar.textContent = `${text} · ${start.toFixed(1)}–${end.toFixed(1)}s`;
  } else {
    bar.style.display = "none";
  }
}

function updateMarkInOutUI() {
  const lblIn = document.getElementById("lblMarkIn");
  const lblOut = document.getElementById("lblMarkOut");
  const btnIn = document.getElementById("btnTlMarkIn");
  const btnOut = document.getElementById("btnTlMarkOut");

  if (lblIn) lblIn.textContent = markIn !== null ? formatTimePrecise(markIn) : "--:--";
  if (lblOut) lblOut.textContent = markOut !== null ? formatTimePrecise(markOut) : "--:--";

  if (btnIn) btnIn.classList.toggle("on", markIn !== null);
  if (btnOut) btnOut.classList.toggle("on", markOut !== null);

  const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  const totalSec = clip?.metadata?.durationSec || 1;
  renderMarkOverlayOnTimeline(totalSec);
}

function setMarkInAtCurrentTime() {
  const video = document.getElementById("editorVideo");
  const time = video ? video.currentTime : 0;
  markIn = Math.max(0, time);
  if (markOut !== null && markOut <= markIn) {
    // If previous Out is before this new In, clear Out so user can set forward Out
    markOut = null;
  }
  updateMarkInOutUI();
}

function setMarkOutAtCurrentTime() {
  const video = document.getElementById("editorVideo");
  const time = video ? video.currentTime : 0;
  markOut = Math.max(0, time);
  if (markIn !== null && markIn >= markOut) {
    // If previous In is after this new Out, clear In so user can set backward In
    markIn = null;
  }
  updateMarkInOutUI();
}

function renderMarkOverlayOnTimeline(totalSec) {
  const overlay = document.getElementById("timelineSelectionOverlay");
  const lineIn = document.getElementById("timelineMarkInLine");
  const lineOut = document.getElementById("timelineMarkOutLine");

  // In line marker
  if (lineIn) {
    if (markIn !== null) {
      lineIn.style.left = `${(markIn / totalSec) * 100}%`;
      lineIn.style.display = "block";
      const span = lineIn.querySelector("span");
      if (span) span.textContent = `In ${formatTimePrecise(markIn)}`;
    } else {
      lineIn.style.display = "none";
    }
  }

  // Out line marker
  if (lineOut) {
    if (markOut !== null) {
      lineOut.style.left = `${(markOut / totalSec) * 100}%`;
      lineOut.style.display = "block";
      const span = lineOut.querySelector("span");
      if (span) span.textContent = `Out ${formatTimePrecise(markOut)}`;
    } else {
      lineOut.style.display = "none";
    }
  }

  // Selection range overlay
  if (overlay) {
    if (markIn !== null && markOut !== null) {
      const start = Math.min(markIn, markOut);
      const end = Math.max(markIn, markOut);
      const dur = end - start;

      if (dur >= 0.05) {
        const leftPct = (start / totalSec) * 100;
        const widthPct = (dur / totalSec) * 100;
        overlay.style.left = `${leftPct}%`;
        overlay.style.width = `${widthPct}%`;
        overlay.style.display = "block";
        const span = overlay.querySelector("span");
        if (span) span.textContent = `${dur.toFixed(1)}s (กด X ตัด / R คืน)`;
        return;
      }
    }
    overlay.style.display = "none";
  }
}

// ─── CUT / RESTORE / UNDO / REDO ENGINE ──────────────────────────────────────

function executeTimelineCut() {
  const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  if (!clip) return;
  if (markIn === null && markOut === null) {
    return showSnackbar("กรุณากด I และ O เพื่อเลือกช่วงเสียงก่อนตัดครับ");
  }
  if (markIn === null) {
    return showSnackbar("กรุณากด I หรือคลิกปุ่ม In เพื่อกำหนดจุดเริ่มก่อนตัดครับ");
  }
  if (markOut === null) {
    return showSnackbar("กรุณากด O หรือคลิกปุ่ม Out เพื่อกำหนดจุดจบก่อนตัดครับ");
  }

  const startCut = Math.min(markIn, markOut);
  const endCut = Math.max(markIn, markOut);
  const totalSec = clip.metadata?.durationSec || 1;

  // Push current silence state to undo history
  pushUndoHistory(clip);

  const oldAudible = clip.silence?.audibleParts || [{ startInSeconds: 0, endInSeconds: totalSec, durationInSeconds: totalSec }];
  const newAudible = [];

  for (const part of oldAudible) {
    // 1. Part entirely before cut
    if (part.endInSeconds <= startCut) {
      newAudible.push(part);
    }
    // 2. Part entirely after cut
    else if (part.startInSeconds >= endCut) {
      newAudible.push(part);
    }
    // 3. Cut splits part
    else if (part.startInSeconds < startCut && part.endInSeconds > endCut) {
      newAudible.push({
        startInSeconds: part.startInSeconds,
        endInSeconds: startCut,
        durationInSeconds: startCut - part.startInSeconds
      });
      newAudible.push({
        startInSeconds: endCut,
        endInSeconds: part.endInSeconds,
        durationInSeconds: part.endInSeconds - endCut
      });
    }
    // 4. Cut overlaps start of part
    else if (part.startInSeconds >= startCut && part.endInSeconds > endCut && part.startInSeconds < endCut) {
      newAudible.push({
        startInSeconds: endCut,
        endInSeconds: part.endInSeconds,
        durationInSeconds: part.endInSeconds - endCut
      });
    }
    // 5. Cut overlaps end of part
    else if (part.startInSeconds < startCut && part.endInSeconds <= endCut && part.endInSeconds > startCut) {
      newAudible.push({
        startInSeconds: part.startInSeconds,
        endInSeconds: startCut,
        durationInSeconds: startCut - part.startInSeconds
      });
    }
  }

  recalculateSilenceStats(clip, newAudible, totalSec);
  markIn = null;
  markOut = null;
  updateMarkInOutUI();
  renderTimelineForClip(clip);
  saveClipChangesToServer(clip);
}

function executeTimelineRestore() {
  const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  if (!clip) return;
  if (markIn === null && markOut === null) {
    return showSnackbar("กรุณากด I และ O เพื่อเลือกช่วงเสียงก่อนคืนเสียงครับ");
  }
  if (markIn === null) {
    return showSnackbar("กรุณากด I หรือคลิกปุ่ม In เพื่อกำหนดจุดเริ่มก่อนคืนเสียงครับ");
  }
  if (markOut === null) {
    return showSnackbar("กรุณากด O หรือคลิกปุ่ม Out เพื่อกำหนดจุดจบก่อนคืนเสียงครับ");
  }

  const startRes = Math.min(markIn, markOut);
  const endRes = Math.max(markIn, markOut);
  const totalSec = clip.metadata?.durationSec || 1;

  pushUndoHistory(clip);

  const oldAudible = clip.silence?.audibleParts || [];
  const combined = [...oldAudible, { startInSeconds: startRes, endInSeconds: endRes, durationInSeconds: endRes - startRes }];

  // Sort and merge overlapping audible parts
  combined.sort((a, b) => a.startInSeconds - b.startInSeconds);
  const merged = [];
  for (const part of combined) {
    if (merged.length === 0) {
      merged.push({ ...part });
    } else {
      const last = merged[merged.length - 1];
      if (part.startInSeconds <= last.endInSeconds + 0.05) {
        last.endInSeconds = Math.max(last.endInSeconds, part.endInSeconds);
        last.durationInSeconds = last.endInSeconds - last.startInSeconds;
      } else {
        merged.push({ ...part });
      }
    }
  }

  recalculateSilenceStats(clip, merged, totalSec);
  markIn = null;
  markOut = null;
  updateMarkInOutUI();
  renderTimelineForClip(clip);
  saveClipChangesToServer(clip);
}

function recalculateSilenceStats(clip, audibleParts, totalSec) {
  let keptDurationSec = 0;
  for (const p of audibleParts) {
    p.durationInSeconds = p.endInSeconds - p.startInSeconds;
    keptDurationSec += p.durationInSeconds;
  }
  const removedDurationSec = Math.max(0, totalSec - keptDurationSec);
  const percentTrimmed = totalSec > 0 ? Math.round((removedDurationSec / totalSec) * 100) : 0;

  clip.silence = {
    ...clip.silence,
    audibleParts,
    originalDurationSec: totalSec,
    keptDurationSec,
    removedDurationSec,
    percentTrimmed
  };
}

function pushUndoHistory(clip) {
  if (!clipHistory.has(clip.id)) {
    clipHistory.set(clip.id, { undo: [], redo: [] });
  }
  const h = clipHistory.get(clip.id);
  h.undo.push(JSON.parse(JSON.stringify(clip.silence)));
  h.redo = []; // clear redo on new action
  if (h.undo.length > 50) h.undo.shift();
  updateUndoRedoButtons(clip);
}

function executeUndo() {
  const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  if (!clip || !clipHistory.has(clip.id)) return;
  const h = clipHistory.get(clip.id);
  if (h.undo.length === 0) return;

  h.redo.push(JSON.parse(JSON.stringify(clip.silence)));
  clip.silence = h.undo.pop();
  renderTimelineForClip(clip);
  updateUndoRedoButtons(clip);
  saveClipChangesToServer(clip);
}

function executeRedo() {
  const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  if (!clip || !clipHistory.has(clip.id)) return;
  const h = clipHistory.get(clip.id);
  if (h.redo.length === 0) return;

  h.undo.push(JSON.parse(JSON.stringify(clip.silence)));
  clip.silence = h.redo.pop();
  renderTimelineForClip(clip);
  updateUndoRedoButtons(clip);
  saveClipChangesToServer(clip);
}

function updateUndoRedoButtons(clip) {
  const btnUndo = document.getElementById("btnTlUndo");
  const btnRedo = document.getElementById("btnTlRedo");
  const h = clipHistory.get(clip?.id);

  if (btnUndo) btnUndo.disabled = !(h && h.undo.length > 0);
  if (btnRedo) btnRedo.disabled = !(h && h.redo.length > 0);
}

// ─── TIMELINE INTERACTIONS (Scrubbing / Drag-Select) ─────────────────────────

function initTimelineInteractions() {
  const track = document.getElementById("timelineTrack");
  const playhead = document.getElementById("timelinePlayhead");
  const video = document.getElementById("editorVideo");
  if (!track) return;

  let isPointerDown = false;
  let isRulerScrubbing = false;
  let dragStartX = 0;
  let dragStartTime = 0;
  let isDraggingSelection = false;

  track.addEventListener("selectstart", (e) => e.preventDefault());

  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; // Left click only
    e.preventDefault();
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
    const totalSec = clip?.metadata?.durationSec || 1;
    const time = ratio * totalSec;

    isPointerDown = true;
    dragStartX = e.clientX;
    dragStartTime = time;
    isDraggingSelection = false;
    isRulerScrubbing = !!(e.target.closest("#ruler") || e.target === playhead);

    seekVideoTo(time);
    track.setPointerCapture(e.pointerId);
  });

  track.addEventListener("pointermove", (e) => {
    if (!isPointerDown) return;
    e.preventDefault();
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
    const totalSec = clip?.metadata?.durationSec || 1;
    const time = ratio * totalSec;

    if (isRulerScrubbing) {
      seekVideoTo(time);
      return;
    }

    const dx = Math.abs(e.clientX - dragStartX);
    if (!isDraggingSelection && dx > 5) {
      isDraggingSelection = true;
    }

    if (isDraggingSelection) {
      markIn = Math.min(dragStartTime, time);
      markOut = Math.max(dragStartTime, time);
      seekVideoTo(time);
      updateMarkInOutUI();
    }
  });

  track.addEventListener("pointerup", (e) => {
    if (!isPointerDown) return;
    e.preventDefault();
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
    const totalSec = clip?.metadata?.durationSec || 1;
    const time = ratio * totalSec;

    if (isDraggingSelection) {
      markIn = Math.min(dragStartTime, time);
      markOut = Math.max(dragStartTime, time);
      updateMarkInOutUI();
    } else if (!isRulerScrubbing) {
      // Single click seek
      seekVideoTo(time);
    }

    isPointerDown = false;
    isDraggingSelection = false;
    isRulerScrubbing = false;
    try { track.releasePointerCapture(e.pointerId); } catch (err) {}
  });

  // Video event handlers
  if (video) {
    video.addEventListener("loadedmetadata", () => {
      fitStageVideoWrapper();
      updateVideoOverlay();
    });
    video.addEventListener("timeupdate", onVideoTimeUpdate);
    video.addEventListener("play", () => updatePlayButtonIcon(true));
    video.addEventListener("pause", () => updatePlayButtonIcon(false));
  }

  window.addEventListener("resize", () => {
    fitStageVideoWrapper();
    updateVideoOverlay();
  });
}

function onVideoTimeUpdate() {
  const video = document.getElementById("editorVideo");
  const playhead = document.getElementById("timelinePlayhead");
  const timeDisplay = document.getElementById("editorCurrentTime");
  if (!video) return;

  const cur = video.currentTime;
  const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  const totalSec = clip?.metadata?.durationSec || video.duration || 1;
  const keptSec = clip?.silence?.keptDurationSec || totalSec;

  // 1. Update Playhead position
  if (playhead) {
    playhead.style.left = `${(cur / totalSec) * 100}%`;
  }

  // 2. Update Time Display
  if (timeDisplay) {
    timeDisplay.innerHTML = `<b>${formatTimePrecise(cur)}</b> / ${formatTime(keptSec)}`;
  }

  // 3. Realtime Jump-Cut Simulator (Skip silence automatically)
  if (!video.paused && jumpCutEnabled) {
    const audibleParts = clip?.silence?.audibleParts;
    if (audibleParts && audibleParts.length > 0) {
      let inAudible = false;
      for (const p of audibleParts) {
        if (cur >= p.startInSeconds && cur < p.endInSeconds) {
          inAudible = true;
          break;
        }
      }

      if (!inAudible) {
        const nextPart = audibleParts.find((p) => p.startInSeconds > cur);
        if (nextPart) {
          const skipAmount = (nextPart.startInSeconds - cur).toFixed(1);
          video.currentTime = nextPart.startInSeconds;
          flashJumpToast(`⚡ ข้ามช่วงเงียบ ${skipAmount}s`);
        } else {
          // Reached after last speech segment
          video.pause();
        }
      }
    }
  }
}

function seekVideoTo(time) {
  const video = document.getElementById("editorVideo");
  if (video && !isNaN(video.duration)) {
    video.currentTime = Math.max(0, Math.min(video.duration, time));
  }
}

function flashJumpToast(msg) {
  const toast = document.getElementById("editorJumpToast");
  if (!toast) return;
  toast.innerHTML = `<span class="ms sm">bolt</span>${escapeHtml(msg)}`;
  toast.style.display = "flex";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = "none"; }, 900);
}

function updatePlayButtonIcon(isPlaying) {
  const btn = document.getElementById("btnEditorPlay");
  const icon = btn?.querySelector(".ms");
  if (icon) icon.textContent = isPlaying ? "pause" : "play_arrow";
}

function togglePlay() {
  const video = document.getElementById("editorVideo");
  if (!video || !video.src) return;

  if (video.paused || video.ended) {
    const clip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
    const parts = clip?.silence?.audibleParts;
    if (jumpCutEnabled && parts && parts.length > 0) {
      if (video.currentTime < parts[0].startInSeconds || video.currentTime >= parts[parts.length - 1].endInSeconds) {
        video.currentTime = parts[0].startInSeconds;
      }
    }
    video.play();
  } else {
    video.pause();
  }
}

// ─── EXPORT VIEW CONTROLLER ──────────────────────────────────────────────────

function renderQueueTable() {
  const container = document.getElementById("queue");
  if (!container) return;
  container.innerHTML = "";

  if (renderQueue.length === 0) {
    container.innerHTML = `
      <div style="padding:var(--sp-4);text-align:center;color:var(--c-text-3);font:var(--t-body-m);">
        ยังไม่มีงานในคิวเรนเดอร์ (เลือกคลิปที่ผ่าน QC แล้วกดปุ่มเรนเดอร์เพื่อเริ่มงาน)
      </div>
    `;
    return;
  }

  renderQueue.forEach((item, i) => {
    const isDone = item.status === "completed";
    const statusLabel = item.status === "rendering" ? "กำลังเรนเดอร์" : isDone ? "สำเร็จ" : item.status === "cancelled" ? "ยกเลิก" : "รอคิว";
    const statusClass = item.status === "rendering" ? "rendering" : isDone ? "approved" : item.status === "cancelled" ? "error" : "unprocessed";
    const speed = item.status === "rendering" ? (item.speed || "3.4×") : isDone ? "เสร็จ" : "—";

    const row = document.createElement("div");
    row.className = "q-row";
    row.innerHTML = `
      <span class="n">${i + 1}</span>
      <span title="${escapeHtml(item.name)}"><strong>${escapeHtml(item.name)}</strong></span>
      <span class="status" data-s="${statusClass}">${statusLabel}</span>
      <div class="linear"><i style="width:${item.progress || 0}%;${isDone ? 'background:var(--c-success);' : ''}"></i></div>
      <span class="sp">${speed}</span>
    `;
    container.appendChild(row);
  });
}

function updateRenderProgressCard(prog) {
  const title = document.getElementById("renderProgressTitle");
  const sub = document.getElementById("renderProgressSub");
  const overallFill = document.getElementById("renderOverallLinearFill");
  const clipFill = document.getElementById("renderClipLinearFill");
  const overallText = document.getElementById("renderOverallProgressText");
  const clipLabel = document.getElementById("renderClipProgressLabel");
  const clipText = document.getElementById("renderClipProgressText");
  const btnCancel = document.getElementById("btnCancelAllRender");
  const legacyFill = document.getElementById("renderProgressLinearFill");

  const pctEl = document.getElementById("kpiProgressPct");
  const speedEl = document.getElementById("kpiSpeed");
  const fpsEl = document.getElementById("kpiFps");
  const etaEl = document.getElementById("kpiEta");

  const total = renderQueue.length;
  const completed = renderQueue.filter((q) => q.status === "completed").length;
  const activeJob = renderQueue.find((q) => q.status === "rendering");

  const currentClipPct = prog ? Math.max(0, Math.min(100, prog.percent)) : (activeJob ? (activeJob.progress || 0) : 0);
  const overallPct = total > 0 ? Math.min(100, ((completed + (currentClipPct / 100)) / total) * 100) : 0;

  if (isRendering || activeJob) {
    wasRenderingBatch = true;
    if (title) title.textContent = `กำลังเรนเดอร์ ${completed + 1} จาก ${total} คลิป`;
    if (sub) sub.textContent = `${activeJob ? activeJob.name : ""} · 1080p MP4`;
    if (btnCancel) btnCancel.style.display = "inline-flex";

    // 1. Overall Progress Bar (Top)
    if (overallFill) overallFill.style.width = `${overallPct}%`;
    if (overallText) overallText.textContent = `${completed} / ${total} คลิป (${overallPct.toFixed(1)}%)`;

    // 2. Current Clip Progress Bar (Bottom)
    if (clipFill) clipFill.style.width = `${currentClipPct}%`;
    if (clipLabel) clipLabel.textContent = `คลิปปัจจุบัน: ${activeJob ? activeJob.name : "กำลังเตรียมไฟล์..."}`;
    if (clipText) clipText.textContent = `${currentClipPct.toFixed(1)}%`;

    if (legacyFill) legacyFill.style.width = `${overallPct}%`;

    // 3. KPIs
    if (pctEl) pctEl.textContent = `${overallPct.toFixed(1)}%`;
    if (speedEl) speedEl.textContent = prog?.speed || "0.0x";
    if (fpsEl) fpsEl.textContent = `${prog?.fps || 0}`;
    if (etaEl) etaEl.textContent = formatTime(prog?.etaSec || 0);

    // Update Topbar Mini Render Pill
    updateTopbarRenderPill(completed + 1, total, overallPct);
  } else if (total > 0 && completed === total) {
    if (title) title.textContent = `เรนเดอร์เสร็จสิ้นแล้วทั้ง ${total} คลิป`;
    if (sub) sub.textContent = "ไฟล์ทั้งหมดพร้อมโพสต์ลง TikTok / Reels / Shorts แล้ว";
    if (btnCancel) btnCancel.style.display = "none";

    if (overallFill) overallFill.style.width = "100%";
    if (overallText) overallText.textContent = `${total} / ${total} คลิป (100.0%)`;

    if (clipFill) clipFill.style.width = "100%";
    if (clipLabel) clipLabel.textContent = "คลิปปัจจุบัน: สำเร็จครบทุกคลิป";
    if (clipText) clipText.textContent = "100%";

    if (legacyFill) legacyFill.style.width = "100%";

    if (pctEl) pctEl.textContent = "100%";
    if (speedEl) speedEl.textContent = "สำเร็จ";
    if (fpsEl) fpsEl.textContent = "—";
    if (etaEl) etaEl.textContent = "0:00";
    updateTopbarRenderPill(total, total, 100);

    if (wasRenderingBatch) {
      wasRenderingBatch = false;
      showRenderCompleteModal(total);
    }
  } else {
    // Idle / reset state
    if (overallFill) overallFill.style.width = "0%";
    if (overallText) overallText.textContent = "0 / 0 คลิป (0.0%)";
    if (clipFill) clipFill.style.width = "0%";
    if (clipLabel) clipLabel.textContent = "คลิปที่กำลังเรนเดอร์: —";
    if (clipText) clipText.textContent = "0.0%";
    if (legacyFill) legacyFill.style.width = "0%";
    if (pctEl) pctEl.textContent = "0.0%";
    if (speedEl) speedEl.textContent = "—";
    if (fpsEl) fpsEl.textContent = "—";
    if (etaEl) etaEl.textContent = "0:00";
    if (btnCancel) btnCancel.style.display = "none";
    updateTopbarRenderPill(0, 0, 0);
  }
}

function playCompletionChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    playTone(523.25, 0.0, 0.2); // C5
    playTone(659.25, 0.15, 0.2); // E5
    playTone(783.99, 0.3, 0.4); // G5
    playTone(1046.50, 0.45, 0.6); // C6
  } catch (e) {
    console.log("Audio chime not available:", e);
  }
}

function showRenderCompleteModal(count) {
  playCompletionChime();
  const dlg = document.getElementById("dlgRenderComplete");
  const msg = document.getElementById("renderCompleteMsg");
  if (msg) {
    msg.textContent = `เรนเดอร์เสร็จสิ้นทั้งหมด ${count} คลิปเรียบร้อยแล้ว ไฟล์วิดีโอพร้อมนำไปใช้งานได้ทันทีครับ`;
  }
  if (dlg) {
    dlg.style.display = "flex";
    dlg.classList.add("show");
  }

  // System notification if permission granted
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("BWCut — เรนเดอร์เสร็จสมบูรณ์!", {
      body: `เรนเดอร์เสร็จสิ้นทั้ง ${count} คลิป พร้อมนำไปโพสต์แล้ว`,
      icon: "/favicon.ico"
    });
  }
}

function closeRenderCompleteModal() {
  const dlg = document.getElementById("dlgRenderComplete");
  if (dlg) {
    dlg.classList.remove("show");
    dlg.style.display = "none";
  }
}

function updateTopbarRenderPill(cur, total, pct) {
  const pill = document.getElementById("topbarRenderPill");
  const text = document.getElementById("renderPillText");
  const mini = document.getElementById("renderPillMini");

  if (pill && text && mini) {
    if (isRendering && total > 0) {
      pill.style.display = "flex";
      text.textContent = `เรนเดอร์ ${cur}/${total}`;
      mini.style.width = `${pct}%`;
    } else {
      pill.style.display = "none";
    }
  }
}

function appendTerminalLog(msg) {
  const box = document.getElementById("terminalLogBox");
  if (!box || !msg) return;
  const div = document.createElement("div");
  if (msg.includes("✓") || msg.includes("✅")) div.className = "ok";
  if (msg.includes("❌") || msg.includes("Error") || msg.includes("failed")) div.className = "err";
  div.textContent = msg;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ─── SETTINGS MODAL CONTROLLER ───────────────────────────────────────────────

function populateSettingsModal(s) {
  if (!s) return;
  const setGemini = document.getElementById("setGeminiKey");
  const setGroq = document.getElementById("setGroqKey");
  const setEnc = document.getElementById("setDefaultEncoder");
  const setOut = document.getElementById("setOutputDir");
  const setFont = document.getElementById("setDefaultFont");
  const setTopPt = document.getElementById("setTopFontSize");
  const setBotPt = document.getElementById("setBottomFontSize");

  if (setGemini) setGemini.value = s.geminiApiKey || "";
  if (setGroq) setGroq.value = s.groqApiKey || "";
  if (setEnc) setEnc.value = s.defaultEncoder || "auto";
  if (setOut) setOut.value = s.outputDir || "";
  if (setFont) setFont.value = s.defaultFont || "Prompt-Bold";
  if (setTopPt) setTopPt.value = s.topFontSize || 14;
  if (setBotPt) setBotPt.value = s.bottomFontSize || 14;

  const prefAi = s.preferredAi || "groq";
  document.querySelectorAll("#setPreferredAi button").forEach((b) => {
    b.classList.toggle("on", b.dataset.val === prefAi);
  });

  // Top & Bottom Headline Colors
  const topColor = s.topHeadlineColor || "#FFE600";
  const botColor = s.bottomHeadlineColor || "#FFFFFF";
  const topIn = document.getElementById("setTopColor");
  const botIn = document.getElementById("setBottomColor");
  const topCode = document.getElementById("settingsTopColorCode");
  const botCode = document.getElementById("settingsBottomColorCode");
  const topSw = document.getElementById("settingsTopColorSwatch");
  const botSw = document.getElementById("settingsBottomColorSwatch");
  const randCheck = document.getElementById("setRandomHeadlineColors");

  if (topIn) topIn.value = topColor;
  if (botIn) botIn.value = botColor;
  if (topCode) topCode.textContent = topColor;
  if (botCode) botCode.textContent = botColor;
  if (topSw) topSw.style.background = topColor;
  if (botSw) botSw.style.background = botColor;
  if (randCheck) randCheck.checked = s.randomHeadlineColors !== false;

  const uniformBox = document.getElementById("uniformColorSettingsBox");
  if (uniformBox) uniformBox.style.opacity = randCheck?.checked ? "0.6" : "1";

  renderSettingsSwatches(topColor, botColor);
}

function renderSettingsSwatches(curTop, curBot) {
  const container = document.getElementById("settingsSwatches");
  if (!container) return;
  container.innerHTML = "";

  SWATCH_PRESETS.forEach(([top, bot], i) => {
    const sw = document.createElement("div");
    const isMatched = top.toUpperCase() === (curTop || "").toUpperCase() && bot.toUpperCase() === (curBot || "").toUpperCase();
    sw.className = `sw ${isMatched ? "on" : ""}`;
    sw.dataset.top = top;
    sw.dataset.bot = bot;
    sw.title = `คู่สีที่ ${i + 1}: ${top} + ${bot}`;
    sw.innerHTML = `<i style="background:${top}"></i><i style="background:${bot}"></i>`;
    sw.addEventListener("click", () => {
      container.querySelectorAll(".sw").forEach((el) => el.classList.remove("on"));
      sw.classList.add("on");

      const topIn = document.getElementById("setTopColor");
      const botIn = document.getElementById("setBottomColor");
      const topCode = document.getElementById("settingsTopColorCode");
      const botCode = document.getElementById("settingsBottomColorCode");
      const topSw = document.getElementById("settingsTopColorSwatch");
      const botSw = document.getElementById("settingsBottomColorSwatch");

      if (topIn) topIn.value = top;
      if (botIn) botIn.value = bot;
      if (topCode) topCode.textContent = top;
      if (botCode) botCode.textContent = bot;
      if (topSw) topSw.style.background = top;
      if (botSw) botSw.style.background = bot;

      // Automatically uncheck random colors when user chooses a specific color
      const randCheck = document.getElementById("setRandomHeadlineColors");
      if (randCheck && randCheck.checked) {
        randCheck.checked = false;
        const uniformBox = document.getElementById("uniformColorSettingsBox");
        if (uniformBox) uniformBox.style.opacity = "1";
      }
    });
    container.appendChild(sw);
  });
}

async function saveSystemSettings() {
  const payload = {
    geminiApiKey: document.getElementById("setGeminiKey")?.value.trim(),
    groqApiKey: document.getElementById("setGroqKey")?.value.trim(),
    defaultEncoder: document.getElementById("setDefaultEncoder")?.value,
    outputDir: document.getElementById("setOutputDir")?.value.trim(),
    defaultFont: document.getElementById("setDefaultFont")?.value,
    topFontSize: parseInt(document.getElementById("setTopFontSize")?.value || "14", 10),
    bottomFontSize: parseInt(document.getElementById("setBottomFontSize")?.value || "14", 10),
    preferredAi: document.querySelector("#setPreferredAi button.on")?.dataset.val || "groq",
    topHeadlineColor: document.getElementById("setTopColor")?.value || "#FFE600",
    bottomHeadlineColor: document.getElementById("setBottomColor")?.value || "#FFFFFF",
    randomHeadlineColors: document.getElementById("setRandomHeadlineColors")?.checked ?? true,
  };

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      systemSettings = { ...systemSettings, ...payload };
      document.getElementById("dlg")?.classList.remove("show");
      showSnackbar("✓ บันทึกการตั้งค่าระบบเรียบร้อยแล้ว");
    }
  } catch (err) {
    showSnackbar("บันทึกการตั้งค่าไม่สำเร็จ: " + err.message, { danger: true });
  }
}

// ─── CLIP PERSISTENCE ────────────────────────────────────────────────────────

async function saveClipChangesToServer(clip) {
  if (!clip || !clip.id) return;
  const indicator = document.getElementById("editorSavedIndicator");
  if (indicator) {
    indicator.innerHTML = `<span class="ms sm spin">sync</span>กำลังบันทึก...`;
  }

  try {
    const res = await fetch("/api/update-clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clipId: clip.id,
        headline: clip.headline,
        productCode: clip.productCode,
        fontFamily: clip.fontFamily,
        topFontSize: clip.topFontSize,
        bottomFontSize: clip.bottomFontSize,
        lineSpacing: clip.lineSpacing,
        topHeadlineColor: clip.topHeadlineColor,
        bottomHeadlineColor: clip.bottomHeadlineColor,
        enableCta: clip.enableCta,
        randomZoom: clip.randomZoom,
        enableHookZoom: clip.enableHookZoom,
        hookZoomDurationSec: clip.hookZoomDurationSec,
        hookZoomScalePercent: clip.hookZoomScalePercent,
        beautyLevel: clip.beautyLevel,
        headlineStartSec: clip.headlineStartSec,
        headlineEndSec: clip.headlineEndSec,
        silence: clip.silence,
        approved: clip.approved,
        status: clip.status
      })
    });

    if (res.ok && indicator) {
      indicator.innerHTML = `<span class="ms sm">cloud_done</span>บันทึกแล้ว`;
    }
  } catch (err) {
    if (indicator) indicator.innerHTML = `<span class="ms sm" style="color:var(--c-danger)">error</span>บันทึกล้มเหลว`;
  }
}

// ─── UI CONTROLS & BINDINGS (0-100% COMPLETE) ────────────────────────────────

function initUIComponents() {
  initSwatches();
  initInspectorTabs();
}

function initInspectorTabs() {
  document.querySelectorAll(".insp .tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".insp .tabs .tab").forEach((x) => x.classList.remove("on"));
      document.querySelectorAll(".insp-body .tabpane").forEach((p) => p.classList.remove("on"));
      tab.classList.add("on");
      const targetPane = document.querySelector(`.insp-body .tabpane[data-p="${tab.dataset.t}"]`);
      if (targetPane) targetPane.classList.add("on");
    });
  });

  document.querySelectorAll(".dialog-nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".dialog-nav button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      document.querySelectorAll(".settings-tab-pane").forEach((pane) => {
        pane.style.display = pane.dataset.pane === btn.dataset.tab ? "block" : "none";
      });
    });
  });
}

function initSwatches() {
  const swContainer = document.getElementById("sw");
  if (!swContainer) return;
  swContainer.innerHTML = "";

  SWATCH_PRESETS.forEach(([top, bot], i) => {
    const sw = document.createElement("div");
    sw.className = `sw ${i === 0 ? "on" : ""}`;
    sw.dataset.top = top;
    sw.dataset.bot = bot;
    sw.title = `เลือกสี [${top} / ${bot}] สำหรับคลิปนี้`;
    sw.innerHTML = `<i style="background:${top}"></i><i style="background:${bot}"></i>`;
    sw.addEventListener("click", () => {
      document.querySelectorAll("#sw .sw").forEach((el) => el.classList.remove("on"));
      sw.classList.add("on");
      const clip = clips[currentClipIndex];
      if (clip) {
        clip.topHeadlineColor = top;
        clip.bottomHeadlineColor = bot;
        updateVideoOverlay();
        updateInspectorColors(top, bot);
        saveClipChangesToServer(clip);
      }
    });
    swContainer.appendChild(sw);
  });

  // Custom Color Pickers in Inspector
  const btnTop = document.getElementById("btnPickTopColor");
  const inTop = document.getElementById("qcTopColorInput");
  const btnBot = document.getElementById("btnPickBotColor");
  const inBot = document.getElementById("qcBotColorInput");

  if (btnTop && inTop) {
    btnTop.onclick = () => inTop.click();
    inTop.oninput = (e) => {
      const hex = e.target.value.toUpperCase();
      const clip = clips[currentClipIndex];
      if (clip) {
        clip.topHeadlineColor = hex;
        updateVideoOverlay();
        updateInspectorColors(hex, clip.bottomHeadlineColor || "#FFFFFF");
        saveClipChangesToServer(clip);
      }
    };
  }

  if (btnBot && inBot) {
    btnBot.onclick = () => inBot.click();
    inBot.oninput = (e) => {
      const hex = e.target.value.toUpperCase();
      const clip = clips[currentClipIndex];
      if (clip) {
        clip.bottomHeadlineColor = hex;
        updateVideoOverlay();
        updateInspectorColors(clip.topHeadlineColor || "#FFE600", hex);
        saveClipChangesToServer(clip);
      }
    };
  }
}

function initEventBindings() {
  // 1. Topbar Folder & Scan
  document.getElementById("btnFolderScan")?.addEventListener("click", () => {
    executeFolderScan(document.getElementById("folderInput")?.value.trim());
  });
  document.getElementById("folderInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") executeFolderScan(e.target.value.trim());
  });

  // 2. Open Output Directory in Explorer
  document.getElementById("btnOpenFolderOutput")?.addEventListener("click", async () => {
    try {
      await fetch("/api/open-output", { method: "POST" });
    } catch (e) {}
  });

  // 3. Settings Modal Open/Save/Clear Temp & Color controls
  document.getElementById("btnOpenSettings")?.addEventListener("click", openDlg);
  document.getElementById("btnSaveSettings")?.addEventListener("click", saveSystemSettings);

  // Preferred AI segmented buttons
  document.querySelectorAll("#setPreferredAi button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll("#setPreferredAi button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
    });
  });

  // Settings color inputs sync
  const topIn = document.getElementById("setTopColor");
  const botIn = document.getElementById("setBottomColor");
  if (topIn) {
    topIn.addEventListener("input", (e) => {
      const hex = e.target.value.toUpperCase();
      const code = document.getElementById("settingsTopColorCode");
      const sw = document.getElementById("settingsTopColorSwatch");
      if (code) code.textContent = hex;
      if (sw) sw.style.background = hex;
      // When user manually picks a color, uncheck random colors
      const randCheck = document.getElementById("setRandomHeadlineColors");
      if (randCheck && randCheck.checked) {
        randCheck.checked = false;
        const uniformBox = document.getElementById("uniformColorSettingsBox");
        if (uniformBox) uniformBox.style.opacity = "1";
      }
    });
  }
  if (botIn) {
    botIn.addEventListener("input", (e) => {
      const hex = e.target.value.toUpperCase();
      const code = document.getElementById("settingsBottomColorCode");
      const sw = document.getElementById("settingsBottomColorSwatch");
      if (code) code.textContent = hex;
      if (sw) sw.style.background = hex;
      // When user manually picks a color, uncheck random colors
      const randCheck = document.getElementById("setRandomHeadlineColors");
      if (randCheck && randCheck.checked) {
        randCheck.checked = false;
        const uniformBox = document.getElementById("uniformColorSettingsBox");
        if (uniformBox) uniformBox.style.opacity = "1";
      }
    });
  }

  // Toggle uniformBox opacity when random checkbox changes
  document.getElementById("setRandomHeadlineColors")?.addEventListener("change", (e) => {
    const uniformBox = document.getElementById("uniformColorSettingsBox");
    if (uniformBox) uniformBox.style.opacity = e.target.checked ? "0.6" : "1";
  });

  // Apply uniform color to all clips
  document.getElementById("btnApplyColorToAllClips")?.addEventListener("click", async () => {
    const top = document.getElementById("setTopColor")?.value || "#FFE600";
    const bot = document.getElementById("setBottomColor")?.value || "#FFFFFF";
    try {
      const res = await fetch("/api/apply-colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "uniform", topColor: top, bottomColor: bot })
      });
      if (res.ok) {
        clips.forEach((c) => {
          c.topHeadlineColor = top;
          c.bottomHeadlineColor = bot;
        });
        const randCheck = document.getElementById("setRandomHeadlineColors");
        if (randCheck) randCheck.checked = false;
        const uniformBox = document.getElementById("uniformColorSettingsBox");
        if (uniformBox) uniformBox.style.opacity = "1";
        renderLibraryGrid();
        updateVideoOverlay();
        showSnackbar(`✓ เปลี่ยนสีพาดหัวเป็น [${top} / ${bot}] ให้ทุกคลิปในโปรเจกต์เรียบร้อย`);
      }
    } catch (e) {
      showSnackbar("เกิดข้อผิดพลาด: " + e.message, { danger: true });
    }
  });

  // Randomize 10 colors across all clips
  document.getElementById("btnRandomizeAllClipsColors")?.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/apply-colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "random" })
      });
      if (res.ok) {
        clips.forEach((c, i) => {
          const [top, bot] = SWATCH_PRESETS[i % SWATCH_PRESETS.length];
          c.topHeadlineColor = top;
          c.bottomHeadlineColor = bot;
        });
        const randCheck = document.getElementById("setRandomHeadlineColors");
        if (randCheck) randCheck.checked = true;
        const uniformBox = document.getElementById("uniformColorSettingsBox");
        if (uniformBox) uniformBox.style.opacity = "0.6";
        renderLibraryGrid();
        updateVideoOverlay();
        showSnackbar(`🎲 สุ่ม 10 คู่สียอดนิยมให้ทุกคลิปเรียบร้อยแล้วครับ`);
      }
    } catch (e) {
      showSnackbar("เกิดข้อผิดพลาด: " + e.message, { danger: true });
    }
  });

  document.getElementById("btnClearTempAction")?.addEventListener("click", async () => {
    if (!confirm("คุณต้องการล้างไฟล์แคช waveform และ preview ชั่วคราวทั้งหมดใช่หรือไม่?")) return;
    try {
      await fetch("/api/clear-temp", { method: "POST" });
      showSnackbar("✓ ล้างไฟล์แคชชั่วคราวเรียบร้อยแล้ว");
    } catch (e) {
      showSnackbar("ล้างแคชล้มเหลว: " + e.message, { danger: true });
    }
  });

  // 4. System Update Checker
  document.getElementById("btnCheckUpdateAction")?.addEventListener("click", async () => {
    const box = document.getElementById("updateStatusBox");
    const btn = document.getElementById("btnCheckUpdateAction");
    if (!box) return;

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="ms sm">sync</span> กำลังตรวจสอบ...`;
    }
    box.innerHTML = `<span style="color:var(--c-primary);">⏳ กำลังเชื่อมต่อกับ GitHub เพื่อตรวจสอบเวอร์ชันล่าสุด...</span>`;

    try {
      const res = await fetch("/api/system/update-check");
      const data = await res.json();
      const update = data.update;

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="ms sm">sync</span>ตรวจหาอัปเดตใหม่`;
      }

      if (update && update.hasUpdate) {
        box.innerHTML = `
          <div style="color:var(--c-primary);font-weight:700;margin-bottom:6px;">🎉 พบเวอร์ชันใหม่บน GitHub! (Commit: ${update.latestVersion})</div>
          <div style="color:var(--c-text-2);margin-bottom:10px;font-family:monospace;font-size:12px;background:var(--c-surface-container);padding:6px 10px;border-radius:6px;white-space:pre-wrap;">${update.changeLog || "มีการอัปเดตโค้ดและปรับปรุงฟังก์ชันใหม่"}</div>
          <button type="button" class="btn btn-filled btn-sm has-icon" id="btnApplyUpdateAction" style="background:var(--c-success);color:#fff;">
            <span class="ms sm">download</span>อัปเดตเป็นเวอร์ชันล่าสุดทันที
          </button>
        `;

        document.getElementById("btnApplyUpdateAction")?.addEventListener("click", async () => {
          const applyBtn = document.getElementById("btnApplyUpdateAction");
          if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.innerHTML = `<span class="ms sm">sync</span> กำลังติดตั้งอัปเดต...`;
          }
          box.innerHTML = `<span style="color:var(--c-primary);">⚡ กำลังดึงโค้ดและติดตั้งแพ็กเกจ กรุณารอสักครู่...</span>`;

          try {
            const upRes = await fetch("/api/system/update-apply", { method: "POST" });
            const upData = await upRes.json();
            if (upData.success) {
              box.innerHTML = `<span style="color:var(--c-success);font-weight:700;">✓ ${upData.message}</span><div style="margin-top:6px;color:var(--c-text-3);">โปรดรีเฟรชหน้าต่างเบราว์เซอร์ (Ctrl+F5) หรือเปิดโปรแกรมใหม่</div>`;
              showSnackbar("✓ อัปเดตเวอร์ชันใหม่สำเร็จแล้ว");
            } else {
              box.innerHTML = `<span style="color:var(--c-danger);">✖ ${upData.message}</span>`;
              showSnackbar(upData.message, { danger: true });
            }
          } catch (err) {
            box.innerHTML = `<span style="color:var(--c-danger);">✖ เกิดข้อผิดพลาด: ${err.message}</span>`;
          }
        });
      } else {
        box.innerHTML = `<span style="color:var(--c-success);font-weight:600;">✓ BWCut Studio ของคุณเป็นเวอร์ชันล่าสุดแล้ว (${update?.currentVersion || "Up to date"})</span>`;
        showSnackbar("✓ คุณกำลังใช้งานเวอร์ชันล่าสุดแล้วครับ");
      }
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="ms sm">sync</span>ตรวจหาอัปเดตใหม่`;
      }
      box.innerHTML = `<span style="color:var(--c-danger);">✖ ตรวจสอบไม่สำเร็จ: ${err.message} (กรุณาตรวจสอบว่ามีอินเทอร์เน็ตหรือไม่)</span>`;
    }
  });

  // 4. Library Search & Filters
  document.getElementById("libSearchInput")?.addEventListener("input", renderLibraryGrid);
  document.querySelectorAll(".lib-toolbar .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".lib-toolbar .chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      currentFilter = chip.dataset.filter || "all";
      renderLibraryGrid();
    });
  });

  // 5. Select All & Clear Selection
  document.getElementById("btnLibSelectAll")?.addEventListener("click", () => {
    selectAllVisibleCards(true);
  });
  document.getElementById("btnCtxSelectAll")?.addEventListener("click", () => {
    selectAllVisibleCards(true);
  });
  document.getElementById("btnCtxClearSelection")?.addEventListener("click", clearAllSelection);

  // 6. Batch Actions in Contextual Bar
  document.getElementById("btnCtxSilence")?.addEventListener("click", () => runBatchAnalysis("silence-only"));
  document.getElementById("btnCtxAi")?.addEventListener("click", () => runBatchAnalysis("full"));
  document.getElementById("btnCtxReheadline")?.addEventListener("click", () => runBatchAnalysis("headline-only"));
  document.getElementById("btnCtxApprove")?.addEventListener("click", batchApproveSelected);

  // 7. FAB Render Approved & Editor Render Approved
  document.getElementById("btnFabRenderApproved")?.addEventListener("click", renderAllApprovedClips);
  document.getElementById("btnEditorRenderApproved")?.addEventListener("click", renderAllApprovedClips);

  // Topbar Shortcuts Help Modal
  document.getElementById("btnShortcutsHelp")?.addEventListener("click", openShortcutsModal);
  document.getElementById("btnCloseShortcutsX")?.addEventListener("click", closeShortcutsModal);
  document.getElementById("btnCloseShortcutsBtn")?.addEventListener("click", closeShortcutsModal);

  // 8. Editor Transport Controls
  document.getElementById("btnEditorPlay")?.addEventListener("click", togglePlay);
  document.getElementById("btnEditorNext")?.addEventListener("click", () => navigateClip(1));
  document.getElementById("btnEditorPrev")?.addEventListener("click", () => navigateClip(-1));
  document.getElementById("btnInspNext")?.addEventListener("click", () => navigateClip(1));
  document.getElementById("btnInspPrev")?.addEventListener("click", () => navigateClip(-1));
  document.getElementById("btnEditorReplay5")?.addEventListener("click", () => seekRelative(-2));
  document.getElementById("btnEditorForward5")?.addEventListener("click", () => seekRelative(2));

  // Jump Cut Toggle Chip
  const jumpChip = document.getElementById("btnToggleJumpCut");
  jumpChip?.addEventListener("click", () => {
    jumpCutEnabled = !jumpCutEnabled;
    jumpChip.classList.toggle("selected", jumpCutEnabled);
    const icon = jumpChip.querySelector(".ms");
    if (icon) icon.textContent = jumpCutEnabled ? "check" : "close";
    showSnackbar(jumpCutEnabled ? "⚡ เปิดการจำลอง Jump Cut อัตโนมัติ" : "ปิดการจำลอง Jump Cut");
  });

  // 9. Timeline Toolbar Actions
  document.getElementById("btnTlUndo")?.addEventListener("click", executeUndo);
  document.getElementById("btnTlRedo")?.addEventListener("click", executeRedo);
  document.getElementById("btnTlMarkIn")?.addEventListener("click", setMarkInAtCurrentTime);
  document.getElementById("btnTlMarkOut")?.addEventListener("click", setMarkOutAtCurrentTime);
  document.getElementById("btnTlCut")?.addEventListener("click", executeTimelineCut);
  document.getElementById("btnTlRestore")?.addEventListener("click", executeTimelineRestore);
  document.getElementById("btnTlClear")?.addEventListener("click", () => {
    markIn = null;
    markOut = null;
    updateMarkInOutUI();
  });
  document.getElementById("btnTlFit")?.addEventListener("click", () => setTimelineZoom(1.0));
  document.getElementById("btnTlZoomIn")?.addEventListener("click", () => stepTimelineZoom(1));
  document.getElementById("btnTlZoomOut")?.addEventListener("click", () => stepTimelineZoom(-1));
  document.getElementById("tlZoomSlider")?.addEventListener("input", (e) => {
    setTimelineZoom(parseFloat(e.target.value));
  });
  document.getElementById("btnTlResetCuts")?.addEventListener("click", resetTimelineCutsToOriginal);
  document.getElementById("btnResetCutsInsp")?.addEventListener("click", resetTimelineCutsToOriginal);

  // 10. Inspector Live Text Sync
  const syncInputs = () => {
    const clip = clips[currentClipIndex];
    if (clip) {
      clip.headline = {
        line1: document.getElementById("qcLine1")?.value || "",
        emoji1: document.getElementById("qcEmoji1")?.value || "🔥",
        line2: document.getElementById("qcLine2")?.value || "",
        emoji2: document.getElementById("qcEmoji2")?.value || "👇"
      };
      const pVal = document.getElementById("qcProductCode")?.value || "";
      clip.productCode = pVal.trim();
      clip.headlineStartSec = parseFloat(document.getElementById("qcHeadStartSec")?.value || "0");
      clip.headlineEndSec = parseFloat(document.getElementById("qcHeadEndSec")?.value || "10");

      const headCode = document.getElementById("editorHeadProductCode");
      if (headCode) {
        headCode.textContent = clip.productCode;
        headCode.style.display = clip.productCode ? "inline-block" : "none";
      }

      updateProductCodeHelper(pVal);
      updateVideoOverlay();
      updateTimelineHeadlineBar(clip, clip.metadata?.durationSec || 1);
      debouncedSaveClip(clip);
    }
  };

  ["qcLine1", "qcEmoji1", "qcLine2", "qcEmoji2", "qcProductCode", "qcHeadStartSec", "qcHeadEndSec"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", syncInputs);
  });

  // Product Code Auto Date (Smart increment & prefix inheritance)
  document.getElementById("btnAutoProductCodeDate")?.addEventListener("click", () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const datePattern = `${mm}${dd}`;

    const pCodeInput = document.getElementById("qcProductCode");
    let currentVal = (pCodeInput ? pCodeInput.value.trim() : "").toUpperCase();

    // If empty, auto-inherit prefix from previous clip if available, or default to CN4A
    if (!currentVal && currentClipIndex > 0 && clips[currentClipIndex - 1]?.productCode) {
      const prevPrefixMatch = clips[currentClipIndex - 1].productCode.match(/^([A-Z0-9]{2,6})/i);
      if (prevPrefixMatch) currentVal = prevPrefixMatch[1];
    }

    const prefixMatch = currentVal.match(/^([A-Z0-9]{2,6})/i);
    let prefix = prefixMatch ? prefixMatch[1].toUpperCase() : "CN4A";

    // Find used sequence numbers for this prefix and date among other clips
    const usedSeqs = [];
    clips.forEach((c, idx) => {
      if (idx === currentClipIndex) return;
      if (!c.productCode) return;
      const m = c.productCode.trim().toUpperCase().match(new RegExp(`^${prefix}-${datePattern}(\\d{2})$`));
      if (m) usedSeqs.push(parseInt(m[1], 10));
    });

    let nextSeq = 1;
    if (usedSeqs.length > 0) {
      nextSeq = Math.max(...usedSeqs) + 1;
    }
    const seqStr = String(nextSeq).padStart(2, "0");
    const newCode = `${prefix}-${datePattern}${seqStr}`;

    if (pCodeInput) {
      pCodeInput.value = newCode;
      syncInputs();
    }
  });

  // AI Headline Generator Button
  document.getElementById("btnQcRegenAi")?.addEventListener("click", generateAiHeadlineForCurrentClip);

  // Headline Timing Buttons
  document.getElementById("btnHeadlineAllClip")?.addEventListener("click", () => {
    const clip = clips[currentClipIndex];
    if (clip) {
      clip.headlineStartSec = 0.0;
      clip.headlineEndSec = clip.metadata?.durationSec || 10.0;
      document.getElementById("qcHeadStartSec").value = "0.0";
      document.getElementById("qcHeadEndSec").value = clip.headlineEndSec.toFixed(1);
      syncInputs();
    }
  });
  document.getElementById("btnSetStartCurrent")?.addEventListener("click", () => {
    const video = document.getElementById("editorVideo");
    if (video) {
      document.getElementById("qcHeadStartSec").value = video.currentTime.toFixed(1);
      syncInputs();
    }
  });
  document.getElementById("btnSetEndCurrent")?.addEventListener("click", () => {
    const video = document.getElementById("editorVideo");
    if (video) {
      document.getElementById("qcHeadEndSec").value = video.currentTime.toFixed(1);
      syncInputs();
    }
  });

  // Steppers Font Size (+ / - buttons and direct input)
  document.getElementById("btnTopSizePlus")?.addEventListener("click", () => adjustFontSize("topFontSize", 1));
  document.getElementById("btnTopSizeMinus")?.addEventListener("click", () => adjustFontSize("topFontSize", -1));
  document.getElementById("btnBotSizePlus")?.addEventListener("click", () => adjustFontSize("bottomFontSize", 1));
  document.getElementById("btnBotSizeMinus")?.addEventListener("click", () => adjustFontSize("bottomFontSize", -1));

  [
    { id: "qcTopFontSizeVal", field: "topFontSize" },
    { id: "qcBottomFontSizeVal", field: "bottomFontSize" }
  ].forEach(({ id, field }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", (e) => {
      const clip = clips[currentClipIndex];
      if (!clip) return;
      let val = parseInt(e.target.value, 10);
      if (!isNaN(val)) {
        val = Math.max(8, Math.min(60, val));
        clip[field] = val;
        updateVideoOverlay();
        debouncedSaveClip(clip);
      }
    });
    el.addEventListener("blur", (e) => {
      const clip = clips[currentClipIndex];
      if (!clip) return;
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 8) val = 8;
      if (val > 60) val = 60;
      clip[field] = val;
      e.target.value = val;
      updateVideoOverlay();
      debouncedSaveClip(clip);
    });
  });

  // Line Spacing Slider
  document.getElementById("qcLineSpacingSlider")?.addEventListener("input", (e) => {
    const clip = clips[currentClipIndex];
    if (clip) {
      clip.lineSpacing = parseInt(e.target.value, 10);
      document.getElementById("qcLineSpacingVal").textContent = `${clip.lineSpacing} px`;
      updateVideoOverlay();
      debouncedSaveClip(clip);
    }
  });

  // FX Toggles
  document.getElementById("qcEnableCta")?.addEventListener("change", (e) => {
    const clip = clips[currentClipIndex];
    if (clip) {
      clip.enableCta = e.target.checked;
      updateVideoOverlay();
      saveClipChangesToServer(clip);
    }
  });
  document.getElementById("qcRandomZoom")?.addEventListener("change", (e) => {
    const clip = clips[currentClipIndex];
    if (clip) {
      clip.randomZoom = e.target.checked;
      saveClipChangesToServer(clip);
    }
  });
  document.getElementById("qcEnableHookZoom")?.addEventListener("change", (e) => {
    const clip = clips[currentClipIndex];
    if (clip) {
      clip.enableHookZoom = e.target.checked;
      const sub = document.getElementById("qcHookZoomSubOpts");
      if (sub) sub.style.display = e.target.checked ? "flex" : "none";
      saveClipChangesToServer(clip);
    }
  });
  document.getElementById("qcHookZoomDur")?.addEventListener("input", (e) => {
    const clip = clips[currentClipIndex];
    if (clip) {
      clip.hookZoomDurationSec = parseFloat(e.target.value) || 4.0;
      debouncedSaveClip(clip);
    }
  });
  document.getElementById("qcHookZoomScale")?.addEventListener("input", (e) => {
    const clip = clips[currentClipIndex];
    if (clip) {
      clip.hookZoomScalePercent = parseInt(e.target.value, 10) || 120;
      debouncedSaveClip(clip);
    }
  });

  // Beauty segmented
  document.querySelectorAll("#qcBeautySegmented button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#qcBeautySegmented button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      const clip = clips[currentClipIndex];
      if (clip) {
        clip.beautyLevel = btn.dataset.val;
        saveClipChangesToServer(clip);
      }
    });
  });

  // Silence Threshold & Recut
  document.getElementById("qcThresholdSlider")?.addEventListener("input", (e) => {
    document.getElementById("qcThresholdVal").textContent = `${e.target.value} dB`;
  });
  document.getElementById("btnQcRecut")?.addEventListener("click", recutSilenceForCurrentClip);

  // Inspector Bottom Buttons
  document.getElementById("btnQcApproveAdvance")?.addEventListener("click", approveAndAdvanceToNext);
  document.getElementById("btnQcRenderNow")?.addEventListener("click", renderCurrentClipImmediately);

  // Export Buttons
  document.getElementById("btnCancelAllRender")?.addEventListener("click", cancelActiveRender);
  document.getElementById("btnOpenRenderDir")?.addEventListener("click", () => {
    fetch("/api/open-output", { method: "POST" });
  });
  document.getElementById("btnClearTerminalLogs")?.addEventListener("click", () => {
    const box = document.getElementById("terminalLogBox");
    if (box) box.innerHTML = "";
  });

  // Filmstrip Filter Dropdown
  const btnFilmFilter = document.getElementById("btnFilmFilter");
  const filmFilterMenu = document.getElementById("filmFilterMenu");

  btnFilmFilter?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!filmFilterMenu) return;
    const isShown = filmFilterMenu.style.display !== "none";
    filmFilterMenu.style.display = isShown ? "none" : "flex";
  });

  document.querySelectorAll(".film-filter-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const filter = item.dataset.filter || "all";
      filmstripFilter = filter;
      document.querySelectorAll(".film-filter-item").forEach((i) => {
        i.classList.toggle("active", i.dataset.filter === filter);
      });
      if (filmFilterMenu) filmFilterMenu.style.display = "none";
      renderFilmstrip();

      // If active clip is filtered out, select first available clip in this filter
      const matchingIndices = [];
      clips.forEach((c, idx) => {
        if (filmstripFilter === "all" || getEffectiveStatus(c) === filmstripFilter) {
          matchingIndices.push(idx);
        }
      });
      if (matchingIndices.length > 0 && !matchingIndices.includes(currentClipIndex)) {
        loadClipToEditor(matchingIndices[0], true);
      }
    });
  });

  window.addEventListener("click", (e) => {
    if (filmFilterMenu && !filmFilterMenu.contains(e.target) && e.target !== btnFilmFilter) {
      filmFilterMenu.style.display = "none";
    }
  });

  // Render Complete Popup Buttons
  document.getElementById("btnOpenRenderDirFromPopup")?.addEventListener("click", () => {
    closeRenderCompleteModal();
    fetch("/api/open-output", { method: "POST" });
  });
  document.getElementById("btnCloseRenderCompletePopup")?.addEventListener("click", () => {
    closeRenderCompleteModal();
  });
}

// ─── ACTIONS IMPLEMENTATION ──────────────────────────────────────────────────

let saveTimer = null;
function debouncedSaveClip(clip) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveClipChangesToServer(clip), 400);
}

function adjustFontSize(field, delta) {
  const clip = clips[currentClipIndex];
  if (!clip) return;
  const currentVal = parseInt(clip[field], 10) || 14;
  clip[field] = Math.max(8, Math.min(60, currentVal + delta));
  const el = field === "topFontSize" ? document.getElementById("qcTopFontSizeVal") : document.getElementById("qcBottomFontSizeVal");
  if (el) el.value = clip[field];
  updateVideoOverlay();
  debouncedSaveClip(clip);
}

async function generateAiHeadlineForCurrentClip() {
  const clip = clips[currentClipIndex];
  if (!clip) return;

  const btn = document.getElementById("btnQcRegenAi");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="ms sm spin">sync</span>กำลังคิด...`;
  }

  try {
    const res = await fetch("/api/generate-headline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipId: clip.id })
    });
    const data = await res.json();
    if (data.ok && data.headline) {
      clip.headline = data.headline;
      document.getElementById("qcLine1").value = clip.headline.line1 || "";
      document.getElementById("qcEmoji1").value = clip.headline.emoji1 || "🔥";
      document.getElementById("qcLine2").value = clip.headline.line2 || "";
      document.getElementById("qcEmoji2").value = clip.headline.emoji2 || "👇";
      updateVideoOverlay();
      showSnackbar("💡 AI คิดพาดหัวใหม่เรียบร้อยแล้ว");
    } else {
      showSnackbar("AI คิดพาดหัวล้มเหลว: " + (data.error || "กรุณาใส่ API Key ในหน้าตั้งค่า"), { danger: true });
    }
  } catch (err) {
    showSnackbar("เกิดข้อผิดพลาด: " + err.message, { danger: true });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="ms">auto_awesome</span>AI คิดใหม่`;
    }
  }
}

async function recutSilenceForCurrentClip() {
  const clip = clips[currentClipIndex];
  if (!clip) return;

  const btn = document.getElementById("btnQcRecut");
  const th = parseFloat(document.getElementById("qcThresholdSlider")?.value || "-20");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="ms sm spin">sync</span>กำลังคำนวณ...`;
  }

  try {
    const res = await fetch("/api/analyze-silence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipId: clip.id, thresholdDb: th })
    });
    const data = await res.json();
    if (data.ok && data.silence) {
      clip.silence = data.silence;
      renderTimelineForClip(clip);
      showSnackbar(`✓ คำนวณใหม่แล้ว: ตัดออก ${clip.silence.percentTrimmed}%`);
    }
  } catch (err) {
    showSnackbar("คำนวณรอยตัดล้มเหลว: " + err.message, { danger: true });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="ms">refresh</span>คำนวณรอยตัดใหม่`;
    }
  }
}

function resetTimelineCutsToOriginal() {
  const clip = clips[currentClipIndex];
  if (!clip) return;
  if (!confirm("คุณต้องการคืนค่ารอยตัดเดิมทั้งหมดจากการวิเคราะห์เสียงใช่หรือไม่?")) return;

  if (clip.originalSilence) {
    clip.silence = JSON.parse(JSON.stringify(clip.originalSilence));
  } else {
    // Re-fetch analysis
    recutSilenceForCurrentClip();
    return;
  }
  markIn = null;
  markOut = null;
  updateMarkInOutUI();
  renderTimelineForClip(clip);
  saveClipChangesToServer(clip);
  showSnackbar("↺ คืนค่ารอยตัดเดิมเรียบร้อยแล้ว");
}

function approveAndAdvanceToNext() {
  const clip = clips[currentClipIndex];
  if (clip) {
    clip.approved = true;
    if (clip.status !== "rendering" && clip.status !== "completed") {
      clip.status = "approved";
    }
    saveClipChangesToServer(clip);
    renderLibraryGrid();
    updateFilterCounters();
    showSnackbar(`✓ ผ่าน QC คลิปที่ ${currentClipIndex + 1} แล้ว`);
  }

  if (currentClipIndex < clips.length - 1) {
    navigateClip(1);
  } else {
    showSnackbar("🎉 ตรวจสอบผ่าน QC ครบทุกคลิปแล้ว พร้อมเรนเดอร์ได้เลย");
    go("export");
  }
}

async function renderCurrentClipImmediately() {
  const clip = clips[currentClipIndex];
  if (!clip) return;

  clip.approved = true;
  if (clip.status !== "rendering" && clip.status !== "completed") clip.status = "approved";
  await saveClipChangesToServer(clip);

  try {
    const res = await fetch("/api/render-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipIds: [clip.id] })
    });
    const data = await res.json();
    if (data.ok) {
      go("export");
    } else {
      showSnackbar("เรนเดอร์ล้มเหลว: " + data.error, { danger: true });
    }
  } catch (err) {
    showSnackbar("เชื่อมต่อล้มเหลว: " + err.message, { danger: true });
  }
}

async function renderAllApprovedClips() {
  const approved = clips.filter((c) => c.approved && c.status !== "completed");
  if (approved.length === 0) {
    return showSnackbar("ยังไม่มีคลิปที่ผ่าน QC รอเรนเดอร์ครับ");
  }

  try {
    const res = await fetch("/api/render-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipIds: approved.map((c) => c.id) })
    });
    const data = await res.json();
    if (data.ok) {
      go("export");
    } else {
      showSnackbar("เริ่มงานเรนเดอร์ล้มเหลว: " + data.error, { danger: true });
    }
  } catch (err) {
    showSnackbar("เกิดข้อผิดพลาด: " + err.message, { danger: true });
  }
}

async function cancelActiveRender() {
  try {
    await fetch("/api/cancel-render", { method: "POST" });
    showSnackbar("🛑 สั่งหยุดการเรนเดอร์แล้ว");
  } catch (e) {}
}

async function runBatchAnalysis(mode) {
  const selected = clips.filter((c) => c.selected);
  if (selected.length === 0) {
    return showSnackbar("กรุณาเลือกคลิปที่ต้องการประมวลผลก่อนครับ");
  }

  showSnackbar(`⚡ กำลังส่ง ${selected.length} คลิปเพื่อประมวลผล (${mode})...`);

  try {
    const res = await fetch("/api/batch-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clipIds: selected.map((c) => c.id),
        mode,
        forceReheadline: mode === "headline-only"
      })
    });
    const data = await res.json();
    if (data.ok) {
      showSnackbar(`✓ เริ่มต้นประมวลผล ${data.count} คลิปแล้ว ติดตามได้ใน Terminal Logs`);
    } else {
      showSnackbar("เกิดข้อผิดพลาด: " + data.error, { danger: true });
    }
  } catch (err) {
    showSnackbar("เชื่อมต่อล้มเหลว: " + err.message, { danger: true });
  }
}

function batchApproveSelected() {
  const selected = clips.filter((c) => c.selected);
  if (selected.length === 0) return;

  selected.forEach((c) => {
    c.approved = true;
    if (c.status !== "rendering" && c.status !== "completed") c.status = "approved";
    saveClipChangesToServer(c);
  });

  renderLibraryGrid();
  updateFilterCounters();
  showSnackbar(`✓ อนุมัติผ่าน QC ${selected.length} คลิปเรียบร้อยแล้ว`);
}

function clearAllSelection() {
  clips.forEach((clip) => {
    clip.selected = false;
  });
  renderLibraryGrid();
  updateContextualBar();
}

function selectAllVisibleCards(select) {
  if (!select) {
    return clearAllSelection();
  }
  const query = (document.getElementById("libSearchInput")?.value || "").toLowerCase().trim();
  clips.forEach((clip) => {
    const effStatus = getEffectiveStatus(clip);
    if (currentFilter !== "all" && effStatus !== currentFilter) return;
    if (query) {
      const matchName = clip.name.toLowerCase().includes(query);
      const matchCode = (clip.productCode || "").toLowerCase().includes(query);
      if (!matchName && !matchCode) return;
    }
    clip.selected = true;
  });

  renderLibraryGrid();
  updateContextualBar();
}

function toggleSel(selecting) {
  if (!selecting) {
    clearAllSelection();
  } else {
    selectAllVisibleCards(true);
  }
}
window.toggleSel = toggleSel;
window.selectAllCards = (select) => selectAllVisibleCards(select);

function openShortcutsModal() {
  const dlg = document.getElementById("dlgShortcuts");
  if (dlg) dlg.classList.add("show");
}

function closeShortcutsModal() {
  const dlg = document.getElementById("dlgShortcuts");
  if (dlg) dlg.classList.remove("show");
}
window.openShortcutsModal = openShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;

function navigateClip(delta) {
  const target = currentClipIndex + delta;
  if (target >= 0 && target < clips.length) {
    loadClipToEditor(target, true);
  }
}

function seekRelative(deltaSec) {
  const video = document.getElementById("editorVideo");
  if (video && !isNaN(video.duration)) {
    seekVideoTo(video.currentTime + deltaSec);
  }
}

function setTimelineZoom(newZoom) {
  timelineZoom = Math.max(1.0, Math.min(16.0, newZoom));
  const track = document.getElementById("timelineTrack");
  if (track) {
    track.style.width = `${timelineZoom * 100}%`;
  }
  const slider = document.getElementById("tlZoomSlider");
  if (slider) {
    slider.value = timelineZoom;
    const p = Math.round(((timelineZoom - 1) / 15) * 100);
    slider.style.setProperty("--p", `${p}%`);
  }
}

function stepTimelineZoom(direction) {
  const cur = timelineZoom;
  let target;
  if (direction > 0) {
    target = ZOOM_STEPS.find((z) => z > cur) || 16.0;
  } else {
    target = [...ZOOM_STEPS].reverse().find((z) => z < cur) || 1.0;
  }
  setTimelineZoom(target);
}

function showSnackbar(msg, options = {}) {
  const sb = document.getElementById("globalSnackbar");
  const txt = document.getElementById("snackbarText");
  if (!sb || !txt) return;

  txt.textContent = msg;
  sb.style.background = options.danger ? "var(--c-danger)" : "var(--g-grey-800)";
  sb.style.display = "flex";
  clearTimeout(sb._timer);
  sb._timer = setTimeout(() => { sb.style.display = "none"; }, options.duration || 3500);
}

// ─── KEYBOARD SHORTCUTS ENGINE ───────────────────────────────────────────────

function initShortcuts() {
  window.addEventListener("keydown", (e) => {
    const activeEl = document.activeElement;
    const isInput = ["INPUT", "TEXTAREA"].includes(activeEl?.tagName);

    if (e.key === "Escape") {
      document.getElementById("dlg")?.classList.remove("show");
      document.getElementById("dlgShortcuts")?.classList.remove("show");
      clearAllSelection();
      markIn = null;
      markOut = null;
      updateMarkInOutUI();
      return;
    }

    // Enter inside headline text inputs advances immediately
    if (e.key === "Enter" && (activeEl?.id === "qcLine1" || activeEl?.id === "qcLine2")) {
      e.preventDefault();
      activeEl.blur();
      approveAndAdvanceToNext();
      return;
    }

    if (isInput) return;

    // Ctrl+Z Undo, Ctrl+Y Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) executeRedo(); else executeUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      executeRedo();
      return;
    }

    // Ctrl+A Select All in Library
    if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      selectAllVisibleCards(true);
      return;
    }

    switch (e.key) {
      case " ":
        e.preventDefault();
        togglePlay();
        break;
      case "Enter":
        e.preventDefault();
        approveAndAdvanceToNext();
        break;
      case "i":
      case "I":
        e.preventDefault();
        setMarkInAtCurrentTime();
        break;
      case "o":
      case "O":
        e.preventDefault();
        setMarkOutAtCurrentTime();
        break;
      case "x":
      case "X":
        e.preventDefault();
        executeTimelineCut();
        break;
      case "r":
      case "R":
        e.preventDefault();
        executeTimelineRestore();
        break;
      case "[":
        e.preventDefault();
        navigateClip(-1);
        break;
      case "]":
        e.preventDefault();
        navigateClip(1);
        break;
      case "j":
      case "J":
      case "ArrowLeft":
        e.preventDefault();
        seekRelative(-2);
        break;
      case "l":
      case "L":
      case "ArrowRight":
        e.preventDefault();
        seekRelative(2);
        break;
      case "1":
        go("library");
        break;
      case "2":
        go("editor");
        break;
      case "3":
        go("export");
        break;
      case "?":
        e.preventDefault();
        openShortcutsModal();
        break;
    }
  });
}
