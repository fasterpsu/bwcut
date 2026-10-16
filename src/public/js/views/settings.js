/**
 * settings.js — BWCut System Settings Modal Controller
 */

import { getSettings, saveSettings, clearTemp } from "../api.js";
import { state, emit } from "../store.js";
import { showSnackbar } from "../ui/snackbar.js";
import { confirmDialog } from "../ui/dialog.js";
import { FONTS, COLOR_PRESETS } from "../constants.js";

let modalEl = null;
let currentTab = "ai";
let initialSettings = {};

export function initSettingsView() {
  modalEl = document.getElementById("settings-modal");
  if (!modalEl) return;

  // Nav buttons
  const navBtns = modalEl.querySelectorAll(".dialog-nav button");
  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      navBtns.forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      currentTab = btn.dataset.tab;
      renderActiveTab();
    });
  });

  // Close button
  const closeBtn = modalEl.querySelector(".btn-close-settings");
  if (closeBtn) closeBtn.addEventListener("click", closeSettingsModal);

  // Cancel button
  const cancelBtn = modalEl.querySelector(".btn-cancel-settings");
  if (cancelBtn) cancelBtn.addEventListener("click", closeSettingsModal);

  // Save button
  const saveBtn = modalEl.querySelector(".btn-save-settings");
  if (saveBtn) saveBtn.addEventListener("click", handleSaveSettings);

  // Scrim click
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeSettingsModal();
  });
}

export async function openSettingsModal() {
  if (!modalEl) return;
  try {
    const s = await getSettings();
    initialSettings = s || {};
    state.settings = s || {};
    populateForm(initialSettings);
    modalEl.classList.add("show");
  } catch (err) {
    showSnackbar("ไม่สามารถโหลดการตั้งค่าได้: " + err.message, { tone: "error" });
  }
}

export function closeSettingsModal() {
  if (modalEl) modalEl.classList.remove("show");
}

function renderActiveTab() {
  if (!modalEl) return;
  const sections = modalEl.querySelectorAll(".settings-tab-pane");
  sections.forEach((sec) => {
    sec.classList.toggle("hidden", sec.dataset.pane !== currentTab);
  });
}

function populateForm(s) {
  if (!modalEl) return;

  // 1. AI
  setValue("setGeminiKey", s.geminiApiKey || "");
  setValue("setGroqKey", s.groqApiKey || "");
  setSegmented("setPreferredAi", s.preferredAi || "groq");

  // 2. Render
  setValue("setDefaultEncoder", s.defaultEncoder || "auto");
  setValue("setDefaultResolution", s.defaultResolution || "1080p");
  setValue("setOutputDir", s.outputDir || "");

  // 3. Typography Defaults
  populateFontSelect(s.defaultFont || "Prompt-Bold");
  setValue("setTopFontSize", s.topFontSize || 14);
  setValue("setBottomFontSize", s.bottomFontSize || 14);
  setValue("setDefaultLineSpacing", s.defaultLineSpacing || 68);
  setValue("setTopColor", s.topHeadlineColor || "#FFE600");
  setValue("setBottomColor", s.bottomHeadlineColor || "#FFFFFF");
  const topCode = document.getElementById("setTopColorCode");
  const botCode = document.getElementById("setBottomColorCode");
  if (topCode) topCode.textContent = s.topHeadlineColor || "#FFE600";
  if (botCode) botCode.textContent = s.bottomHeadlineColor || "#FFFFFF";
  setSegmented("setDefaultBeauty", s.defaultBeauty || "none");
  setCheckbox("setDefaultEnableCta", s.defaultEnableCta !== false);

  // 4. Zoom & Tail Trim
  setCheckbox("setRandomZoom", s.randomZoom ?? false);
  setValue("setZoomLevels", s.zoomLevels || "1.0, 1.2, 1.3, 1.4");
  setValue("setMaxCutDuration", s.maxCutDurationSec || 4.0);
  setCheckbox("setEnableHookZoom", s.enableHookZoom ?? false);
  setValue("setHookZoomDuration", s.hookZoomDurationSec || 4.0);
  setValue("setHookZoomScale", s.hookZoomScalePercent || 120);
  setValue("setTailTrimSec", s.tailTrimSec || 0);

  // 5. Storage (Clear Temp button binding)
  const clearBtn = document.getElementById("btnClearTempAction");
  if (clearBtn) {
    clearBtn.onclick = handleClearTemp;
  }

  // Setup color pickers sync
  const topColorInput = document.getElementById("setTopColor");
  const botColorInput = document.getElementById("setBottomColor");
  if (topColorInput && topCode) {
    topColorInput.oninput = () => { topCode.textContent = topColorInput.value; };
  }
  if (botColorInput && botCode) {
    botColorInput.oninput = () => { botCode.textContent = botColorInput.value; };
  }

  // Setup line spacing range fill
  const spSlider = document.getElementById("setDefaultLineSpacing");
  if (spSlider) {
    const updateP = () => {
      const min = parseFloat(spSlider.min) || 20;
      const max = parseFloat(spSlider.max) || 200;
      const p = Math.round(((parseFloat(spSlider.value) - min) / (max - min)) * 100);
      spSlider.style.setProperty("--p", `${p}%`);
      const valLabel = document.getElementById("lblLineSpacingVal");
      if (valLabel) valLabel.textContent = `${spSlider.value} px`;
    };
    spSlider.oninput = updateP;
    updateP();
  }
}

function populateFontSelect(selectedFont) {
  const container = document.getElementById("setFontListContainer");
  if (!container) return;
  container.innerHTML = "";

  FONTS.forEach((f) => {
    const opt = document.createElement("div");
    opt.className = `font-opt ${f.value === selectedFont ? "on" : ""}`;
    opt.innerHTML = `
      <span class="pv" style="${f.value !== 'none' ? `font-family:'${f.value}',sans-serif;font-weight:bold;` : 'color:var(--c-text-3);'}">
        ${f.value === 'none' ? 'ไม่ใส่ข้อความ' : 'ป้ายยาของดี'}
      </span>
      <small>${f.th}</small>
    `;
    opt.addEventListener("click", () => {
      container.querySelectorAll(".font-opt").forEach((o) => o.classList.remove("on"));
      opt.classList.add("on");
      container.dataset.value = f.value;
    });
    container.appendChild(opt);
  });
  container.dataset.value = selectedFont;
}

async function handleSaveSettings() {
  const fontContainer = document.getElementById("setFontListContainer");
  const updated = {
    geminiApiKey: getValue("setGeminiKey"),
    groqApiKey: getValue("setGroqKey"),
    preferredAi: getSegmented("setPreferredAi") || "groq",
    defaultEncoder: getValue("setDefaultEncoder") || "auto",
    defaultResolution: getValue("setDefaultResolution") || "1080p",
    outputDir: getValue("setOutputDir"),
    defaultFont: fontContainer?.dataset.value || "Prompt-Bold",
    topFontSize: parseInt(getValue("setTopFontSize"), 10) || 14,
    bottomFontSize: parseInt(getValue("setBottomFontSize"), 10) || 14,
    defaultLineSpacing: parseInt(getValue("setDefaultLineSpacing"), 10) || 68,
    topHeadlineColor: getValue("setTopColor") || "#FFE600",
    bottomHeadlineColor: getValue("setBottomColor") || "#FFFFFF",
    defaultBeauty: getSegmented("setDefaultBeauty") || "none",
    defaultEnableCta: getCheckbox("setDefaultEnableCta"),
    randomZoom: getCheckbox("setRandomZoom"),
    zoomLevels: getValue("setZoomLevels") || "1.0, 1.2, 1.3, 1.4",
    maxCutDurationSec: parseFloat(getValue("setMaxCutDuration")) || 4.0,
    enableHookZoom: getCheckbox("setEnableHookZoom"),
    hookZoomDurationSec: parseFloat(getValue("setHookZoomDuration")) || 4.0,
    hookZoomScalePercent: parseInt(getValue("setHookZoomScale"), 10) || 120,
    tailTrimSec: parseFloat(getValue("setTailTrimSec")) || 0,
  };

  try {
    const res = await saveSettings(updated);
    if (res?.ok) {
      state.settings = res.settings;
      emit("settings", state.settings);
      closeSettingsModal();
      showSnackbar("บันทึกการตั้งค่าเรียบร้อยแล้ว");
    }
  } catch (err) {
    showSnackbar("บันทึกการตั้งค่าล้มเหลว: " + err.message, { tone: "error" });
  }
}

async function handleClearTemp() {
  const doResetClips = getCheckbox("chkClearClipsStore");
  const confirmed = await confirmDialog({
    title: doResetClips ? "รีเซ็ตรายการคลิปและลบแคช?" : "ล้างไฟล์แคชชั่วคราว?",
    body: doResetClips
      ? "คุณต้องการลบไฟล์แคชทั้งหมด และรีเซ็ตรายการคลิปเดิมเพื่อเริ่มโปรเจกต์ใหม่ ใช่หรือไม่?"
      : "คุณต้องการล้างภาพย่อและไฟล์แคชชั่วคราวเพื่อประหยัดพื้นที่ดิสก์ ใช่หรือไม่?",
    confirmLabel: "ล้างทันที",
    danger: true,
  });

  if (!confirmed) return;

  try {
    const res = await clearTemp(doResetClips);
    if (res?.ok) {
      if (doResetClips) {
        state.clips = [];
        state.currentIndex = -1;
        emit("clips", []);
      }
      showSnackbar(`ลบไปทั้งหมด ${res.deletedCount} ไฟล์ (คืนพื้นที่ ${res.freedMb} MB)`);
    }
  } catch (err) {
    showSnackbar("เกิดข้อผิดพลาดในการล้างไฟล์: " + err.message, { tone: "error" });
  }
}

// Helpers
function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function getCheckbox(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

function setCheckbox(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(checked);
}

function getSegmented(groupId) {
  const container = document.getElementById(groupId);
  if (!container) return "";
  const activeBtn = container.querySelector("button.on");
  return activeBtn ? activeBtn.dataset.val : "";
}

function setSegmented(groupId, val) {
  const container = document.getElementById(groupId);
  if (!container) return;
  const btns = container.querySelectorAll("button");
  btns.forEach((b) => {
    const isMatch = b.dataset.val === val;
    b.classList.toggle("on", isMatch);
    b.onclick = () => {
      btns.forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
    };
  });
}
