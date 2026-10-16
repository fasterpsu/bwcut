/**
 * inspector.js — BWCut Inspector Controller
 * Tabbed clip inspector managing metadata, styling, AI hook, FX, and persistence
 */

import { state, getCurrentClip, emit } from "../store.js";
import { FONTS, COLOR_PRESETS } from "../constants.js";
import { validateProductCode, generateAutoProductCode } from "./product-code.js";
import { updateClip, generateHeadline, analyzeSilence, renderBatch } from "../api.js";
import { showSnackbar } from "../ui/snackbar.js";
import { debounce } from "../utils.js";
import { updateOverlay } from "./preview.js";
import { renderTimeline } from "./timeline.js";
import { openSettingsModal } from "../views/settings.js";

let activeTab = "text";
const debouncedSave = debounce(() => saveCurrentClipChanges(), 300);

export function initInspector() {
  const inspEl = document.querySelector(".insp");
  if (!inspEl) return;

  // 1. Inspector Tab Switching
  const tabs = inspEl.querySelectorAll(".tabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      switchInspectorTab(tab.dataset.t);
    });
  });

  // Restore saved tab
  const savedTab = localStorage.getItem("bwcut_inspector_tab");
  if (savedTab) switchInspectorTab(savedTab);

  // 2. Product Code
  const pCodeInput = document.getElementById("qcProductCode");
  const btnAutoDate = document.getElementById("btnAutoProductCodeDate");

  if (pCodeInput) {
    pCodeInput.addEventListener("input", () => {
      pCodeInput.value = pCodeInput.value.toUpperCase();
      updateProductCodeUI(pCodeInput.value);
      const clip = getCurrentClip();
      if (clip) {
        clip.productCode = pCodeInput.value.trim();
        debouncedSave();
      }
    });

    pCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (btnAutoDate) btnAutoDate.click();
      }
    });
  }

  if (btnAutoDate) {
    btnAutoDate.addEventListener("click", () => {
      const clip = getCurrentClip();
      if (!clip) return;
      const newCode = generateAutoProductCode(pCodeInput?.value, state.currentIndex, state.clips);
      if (pCodeInput) pCodeInput.value = newCode;
      updateProductCodeUI(newCode);
      clip.productCode = newCode;
      saveCurrentClipChanges();
    });
  }

  // 3. Headline Inputs
  const l1Input = document.getElementById("qcLine1");
  const e1Input = document.getElementById("qcEmoji1");
  const l2Input = document.getElementById("qcLine2");
  const e2Input = document.getElementById("qcEmoji2");

  [l1Input, e1Input, l2Input, e2Input].filter(Boolean).forEach((inp) => {
    inp.addEventListener("input", () => {
      const clip = getCurrentClip();
      if (clip) {
        clip.headline = {
          ...(clip.headline || {}),
          line1: l1Input?.value.trim() || "",
          emoji1: e1Input?.value.trim() || "",
          line2: l2Input?.value.trim() || "",
          emoji2: e2Input?.value.trim() || "",
        };
        updateOverlay(clip);
        renderTimeline(clip);
        debouncedSave();
      }
    });
  });

  // AI Regen Button
  const btnRegenAi = document.getElementById("btnQcRegenAi");
  if (btnRegenAi) {
    btnRegenAi.addEventListener("click", handleRegenAi);
  }

  // 4. Headline Timing Inputs
  const hStartInput = document.getElementById("qcHeadStartSec");
  const hEndInput = document.getElementById("qcHeadEndSec");
  const btnSetStartCur = document.getElementById("btnSetHeadStartCur");
  const btnSetEndCur = document.getElementById("btnSetHeadEndCur");
  const btnSetFull = document.getElementById("btnSetHeadFull");

  if (hStartInput) {
    hStartInput.addEventListener("input", () => {
      const clip = getCurrentClip();
      if (clip) {
        clip.headlineStartSec = parseFloat(hStartInput.value) || 0;
        renderTimeline(clip);
        debouncedSave();
      }
    });
  }

  if (hEndInput) {
    hEndInput.addEventListener("input", () => {
      const clip = getCurrentClip();
      if (clip) {
        clip.headlineEndSec = hEndInput.value !== "" ? parseFloat(hEndInput.value) : undefined;
        renderTimeline(clip);
        debouncedSave();
      }
    });
  }

  const videoEl = document.getElementById("editorVideo");
  if (btnSetStartCur && videoEl) {
    btnSetStartCur.addEventListener("click", () => {
      const cur = parseFloat((videoEl.currentTime || 0).toFixed(1));
      if (hStartInput) hStartInput.value = cur;
      const clip = getCurrentClip();
      if (clip) {
        clip.headlineStartSec = cur;
        renderTimeline(clip);
        saveCurrentClipChanges();
      }
    });
  }

  if (btnSetEndCur && videoEl) {
    btnSetEndCur.addEventListener("click", () => {
      const cur = parseFloat((videoEl.currentTime || 0).toFixed(1));
      if (hEndInput) hEndInput.value = cur;
      const clip = getCurrentClip();
      if (clip) {
        clip.headlineEndSec = cur;
        renderTimeline(clip);
        saveCurrentClipChanges();
      }
    });
  }

  if (btnSetFull && videoEl) {
    btnSetFull.addEventListener("click", () => {
      const dur = parseFloat((videoEl.duration || 10).toFixed(1));
      if (hStartInput) hStartInput.value = "0.0";
      if (hEndInput) hEndInput.value = dur;
      const clip = getCurrentClip();
      if (clip) {
        clip.headlineStartSec = 0;
        clip.headlineEndSec = dur;
        renderTimeline(clip);
        saveCurrentClipChanges();
      }
    });
  }

  // 5. FX Switches
  const ctaSwitch = document.getElementById("qcEnableCta");
  const rndZoomSwitch = document.getElementById("qcRandomZoom");
  const hookZoomSwitch = document.getElementById("qcEnableHookZoom");
  const hookZoomDur = document.getElementById("qcHookZoomDur");
  const hookZoomScale = document.getElementById("qcHookZoomScale");

  if (ctaSwitch) {
    ctaSwitch.addEventListener("change", () => {
      const clip = getCurrentClip();
      if (clip) {
        clip.enableCta = ctaSwitch.checked;
        updateOverlay(clip);
        saveCurrentClipChanges();
      }
    });
  }

  if (rndZoomSwitch) {
    rndZoomSwitch.addEventListener("change", () => {
      const clip = getCurrentClip();
      if (clip) {
        clip.randomZoom = rndZoomSwitch.checked;
        saveCurrentClipChanges();
      }
    });
  }

  if (hookZoomSwitch) {
    hookZoomSwitch.addEventListener("change", () => {
      const clip = getCurrentClip();
      if (clip) {
        clip.enableHookZoom = hookZoomSwitch.checked;
        const subOpts = document.getElementById("qcHookZoomSubOpts");
        if (subOpts) subOpts.classList.toggle("hidden", !hookZoomSwitch.checked);
        saveCurrentClipChanges();
      }
    });
  }

  if (hookZoomDur) {
    hookZoomDur.addEventListener("input", () => {
      const clip = getCurrentClip();
      if (clip) {
        clip.hookZoomDurationSec = parseFloat(hookZoomDur.value) || 4.0;
        debouncedSave();
      }
    });
  }

  if (hookZoomScale) {
    hookZoomScale.addEventListener("input", () => {
      const clip = getCurrentClip();
      if (clip) {
        clip.hookZoomScalePercent = parseInt(hookZoomScale.value, 10) || 120;
        debouncedSave();
      }
    });
  }

  // Beauty Filter Segmented
  const beautyGroup = document.getElementById("qcBeautySegmented");
  if (beautyGroup) {
    const btns = beautyGroup.querySelectorAll("button");
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        btns.forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        const clip = getCurrentClip();
        if (clip) {
          clip.beautyLevel = btn.dataset.val;
          saveCurrentClipChanges();
        }
      });
    });
  }

  // 6. Silence Threshold Slider & Recut
  const thSlider = document.getElementById("qcThresholdSlider");
  const thVal = document.getElementById("qcThresholdVal");
  const btnRecut = document.getElementById("btnQcRecut");

  if (thSlider && thVal) {
    thSlider.addEventListener("input", () => {
      thVal.textContent = `${thSlider.value} dB`;
      const min = parseFloat(thSlider.min) || -35;
      const max = parseFloat(thSlider.max) || -10;
      const p = Math.round(((parseFloat(thSlider.value) - min) / (max - min)) * 100);
      thSlider.style.setProperty("--p", `${p}%`);
    });
  }

  if (btnRecut && thSlider) {
    btnRecut.addEventListener("click", handleRecutSilence);
  }

  // 7. Sticky Footer Action Buttons
  const btnApprove = document.getElementById("btnQcApproveAdvance");
  const btnRenderNow = document.getElementById("btnQcRenderNow");

  if (btnApprove) btnApprove.addEventListener("click", approveAndAdvance);
  if (btnRenderNow) btnRenderNow.addEventListener("click", renderCurrentClipNow);

  // Inspector Nav Clip buttons
  const btnNavPrev = document.getElementById("btnInspPrev");
  const btnNavNext = document.getElementById("btnInspNext");
  if (btnNavPrev) btnNavPrev.addEventListener("click", () => navigateClipIndex(-1));
  if (btnNavNext) btnNavNext.addEventListener("click", () => navigateClipIndex(1));
}

export function populateInspector(clip = getCurrentClip()) {
  if (!clip) return;

  // Header Nav Count
  const badge = document.getElementById("inspClipBadge");
  if (badge) badge.textContent = `${state.currentIndex + 1} / ${state.clips.length}`;

  const headNm = document.getElementById("editorClipHeadName");
  if (headNm) headNm.textContent = clip.name;

  const headTag = document.getElementById("editorHeadProductCode");
  if (headTag) {
    headTag.textContent = clip.productCode || "";
    headTag.classList.toggle("hidden", !clip.productCode);
  }

  const headStatus = document.getElementById("editorHeadStatus");
  if (headStatus) {
    const eff = clip.approved && clip.status !== "rendering" && clip.status !== "completed" ? "approved" : clip.status || "unprocessed";
    headStatus.dataset.s = eff;
    headStatus.textContent = eff === "approved" ? "ผ่าน QC" : eff === "ready" ? "รอตรวจ" : eff;
  }

  // 1. Text Tab
  const pCodeInput = document.getElementById("qcProductCode");
  if (pCodeInput) pCodeInput.value = clip.productCode || "";
  updateProductCodeUI(clip.productCode || "");

  const l1Input = document.getElementById("qcLine1");
  const e1Input = document.getElementById("qcEmoji1");
  const l2Input = document.getElementById("qcLine2");
  const e2Input = document.getElementById("qcEmoji2");

  if (l1Input) l1Input.value = clip.headline?.line1 || "";
  if (e1Input) e1Input.value = clip.headline?.emoji1 || "🔥";
  if (l2Input) l2Input.value = clip.headline?.line2 || "";
  if (e2Input) e2Input.value = clip.headline?.emoji2 || "👇";

  const hStartInput = document.getElementById("qcHeadStartSec");
  const hEndInput = document.getElementById("qcHeadEndSec");
  if (hStartInput) hStartInput.value = clip.headlineStartSec !== undefined ? clip.headlineStartSec : "0.0";
  if (hEndInput) hEndInput.value = clip.headlineEndSec !== undefined ? clip.headlineEndSec : "10.0";

  // 2. Style Tab
  populateInspectorFontList(clip.fontFamily || state.settings?.defaultFont || "Prompt-Bold");
  setupSteppers(clip);
  setupColorPresets(clip);

  // 3. FX Tab
  const ctaSwitch = document.getElementById("qcEnableCta");
  if (ctaSwitch) ctaSwitch.checked = clip.enableCta !== false;

  const rndZoomSwitch = document.getElementById("qcRandomZoom");
  if (rndZoomSwitch) rndZoomSwitch.checked = clip.randomZoom ?? state.settings?.randomZoom ?? true;

  const hookZoomSwitch = document.getElementById("qcEnableHookZoom");
  if (hookZoomSwitch) hookZoomSwitch.checked = clip.enableHookZoom ?? state.settings?.enableHookZoom ?? false;

  const hookSub = document.getElementById("qcHookZoomSubOpts");
  if (hookSub) hookSub.classList.toggle("hidden", !hookZoomSwitch?.checked);

  const hookDur = document.getElementById("qcHookZoomDur");
  if (hookDur) hookDur.value = clip.hookZoomDurationSec ?? 4.0;

  const hookScale = document.getElementById("qcHookZoomScale");
  if (hookScale) hookScale.value = clip.hookZoomScalePercent ?? 120;

  const beautyGroup = document.getElementById("qcBeautySegmented");
  if (beautyGroup) {
    const level = clip.beautyLevel || "none";
    beautyGroup.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("on", b.dataset.val === level);
    });
  }

  // 4. Audio Tab
  const thSlider = document.getElementById("qcThresholdSlider");
  const thVal = document.getElementById("qcThresholdVal");
  const th = clip.silence?.thresholdDb || state.settings?.silenceThresholdDb || -20;
  if (thSlider && thVal) {
    thSlider.value = th;
    thVal.textContent = `${th} dB`;
    const min = parseFloat(thSlider.min) || -35;
    const max = parseFloat(thSlider.max) || -10;
    const p = Math.round(((th - min) / (max - min)) * 100);
    thSlider.style.setProperty("--p", `${p}%`);
  }
}

function updateProductCodeUI(code) {
  const helperEl = document.getElementById("qcProductCodeHelper");
  if (!helperEl) return;
  const res = validateProductCode(code);
  helperEl.className = `helper ${res.statusClass}`;
  helperEl.textContent = res.text;
}

function switchInspectorTab(tabName) {
  activeTab = tabName;
  localStorage.setItem("bwcut_inspector_tab", tabName);

  const inspEl = document.querySelector(".insp");
  if (!inspEl) return;

  inspEl.querySelectorAll(".tabs .tab").forEach((t) => {
    t.classList.toggle("on", t.dataset.t === tabName);
  });

  inspEl.querySelectorAll(".insp-body .tabpane").forEach((p) => {
    p.classList.toggle("on", p.dataset.p === tabName);
  });
}

function populateInspectorFontList(currentFont) {
  const container = document.getElementById("inspFontList");
  if (!container) return;
  container.innerHTML = "";

  FONTS.forEach((f) => {
    const opt = document.createElement("div");
    opt.className = `font-opt ${f.value === currentFont ? "on" : ""}`;
    opt.innerHTML = `
      <span class="pv" style="${f.value !== 'none' ? `font-family:'${f.value}',sans-serif;font-weight:bold;` : 'color:var(--c-text-3);'}">
        ${f.value === 'none' ? 'ไม่ใส่ข้อความ' : 'ป้ายยาของดี'}
      </span>
      <small>${f.th}</small>
    `;
    opt.addEventListener("click", () => {
      container.querySelectorAll(".font-opt").forEach((o) => o.classList.remove("on"));
      opt.classList.add("on");
      const clip = getCurrentClip();
      if (clip) {
        clip.fontFamily = f.value;
        updateOverlay(clip);
        saveCurrentClipChanges();
      }
    });
    container.appendChild(opt);
  });
}

function setupSteppers(clip) {
  const topSizeVal = document.getElementById("qcTopFontSizeVal");
  const botSizeVal = document.getElementById("qcBottomFontSizeVal");
  const spacingSlider = document.getElementById("qcLineSpacingSlider");
  const spacingVal = document.getElementById("qcLineSpacingVal");

  if (topSizeVal) topSizeVal.textContent = clip.topFontSize || 14;
  if (botSizeVal) botSizeVal.textContent = clip.bottomFontSize || 14;

  const btnTopMinus = document.getElementById("btnTopSizeMinus");
  const btnTopPlus = document.getElementById("btnTopSizePlus");
  const btnBotMinus = document.getElementById("btnBotSizeMinus");
  const btnBotPlus = document.getElementById("btnBotSizePlus");

  if (btnTopMinus) {
    btnTopMinus.onclick = () => {
      clip.topFontSize = Math.max(8, (clip.topFontSize || 14) - 1);
      if (topSizeVal) topSizeVal.textContent = clip.topFontSize;
      updateOverlay(clip);
      debouncedSave();
    };
  }
  if (btnTopPlus) {
    btnTopPlus.onclick = () => {
      clip.topFontSize = Math.min(60, (clip.topFontSize || 14) + 1);
      if (topSizeVal) topSizeVal.textContent = clip.topFontSize;
      updateOverlay(clip);
      debouncedSave();
    };
  }

  if (btnBotMinus) {
    btnBotMinus.onclick = () => {
      clip.bottomFontSize = Math.max(8, (clip.bottomFontSize || 14) - 1);
      if (botSizeVal) botSizeVal.textContent = clip.bottomFontSize;
      updateOverlay(clip);
      debouncedSave();
    };
  }
  if (btnBotPlus) {
    btnBotPlus.onclick = () => {
      clip.bottomFontSize = Math.min(60, (clip.bottomFontSize || 14) + 1);
      if (botSizeVal) botSizeVal.textContent = clip.bottomFontSize;
      updateOverlay(clip);
      debouncedSave();
    };
  }

  if (spacingSlider) {
    const sp = clip.lineSpacing || 68;
    spacingSlider.value = sp;
    if (spacingVal) spacingVal.textContent = `${sp} px`;
    const min = parseFloat(spacingSlider.min) || 20;
    const max = parseFloat(spacingSlider.max) || 200;
    spacingSlider.style.setProperty("--p", `${Math.round(((sp - min) / (max - min)) * 100)}%`);

    spacingSlider.oninput = (e) => {
      const val = parseInt(e.target.value, 10);
      clip.lineSpacing = val;
      if (spacingVal) spacingVal.textContent = `${val} px`;
      spacingSlider.style.setProperty("--p", `${Math.round(((val - min) / (max - min)) * 100)}%`);
      updateOverlay(clip);
      debouncedSave();
    };
  }
}

function setupColorPresets(clip) {
  const container = document.getElementById("qcColorPresets");
  const topPicker = document.getElementById("qcTopColorPicker");
  const botPicker = document.getElementById("qcBotColorPicker");
  const topCode = document.getElementById("qcTopColorCode");
  const botCode = document.getElementById("qcBotColorCode");

  const curTop = clip.topHeadlineColor || "#FFE600";
  const curBot = clip.bottomHeadlineColor || "#FFFFFF";

  if (topPicker) topPicker.value = curTop;
  if (botPicker) botPicker.value = curBot;
  if (topCode) topCode.textContent = curTop;
  if (botCode) botCode.textContent = curBot;

  if (topPicker) {
    topPicker.oninput = () => {
      clip.topHeadlineColor = topPicker.value;
      if (topCode) topCode.textContent = topPicker.value;
      updateOverlay(clip);
      debouncedSave();
    };
  }

  if (botPicker) {
    botPicker.oninput = () => {
      clip.bottomHeadlineColor = botPicker.value;
      if (botCode) botCode.textContent = botPicker.value;
      updateOverlay(clip);
      debouncedSave();
    };
  }

  if (!container) return;
  container.innerHTML = "";

  COLOR_PRESETS.forEach((preset, i) => {
    const sw = document.createElement("div");
    const isMatched = preset.top.toUpperCase() === curTop.toUpperCase() && preset.bottom.toUpperCase() === curBot.toUpperCase();
    sw.className = `sw ${isMatched ? "on" : ""}`;
    sw.title = preset.name;
    sw.innerHTML = `<i style="background:${preset.top}"></i><i style="background:${preset.bottom}"></i>`;
    sw.onclick = () => {
      container.querySelectorAll(".sw").forEach((s) => s.classList.remove("on"));
      sw.classList.add("on");
      clip.topHeadlineColor = preset.top;
      clip.bottomHeadlineColor = preset.bottom;
      if (topPicker) topPicker.value = preset.top;
      if (botPicker) botPicker.value = preset.bottom;
      if (topCode) topCode.textContent = preset.top;
      if (botCode) botCode.textContent = preset.bottom;
      updateOverlay(clip);
      saveCurrentClipChanges();
    };
    container.appendChild(sw);
  });
}

async function handleRegenAi() {
  const clip = getCurrentClip();
  if (!clip) return;

  if (!state.settings?.groqApiKey && !state.settings?.geminiApiKey) {
    return showSnackbar("ยังไม่ได้ระบุ API Key สำหรับ AI", {
      action: { label: "ไปตั้งค่า", onClick: () => openSettingsModal() },
    });
  }

  const btn = document.getElementById("btnQcRegenAi");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="ms sm">sync</span>กำลังคิด...`;
  }

  try {
    const res = await generateHeadline(clip.id);
    if (res?.ok && res.headline) {
      clip.headline = res.headline;
      const l1 = document.getElementById("qcLine1");
      const e1 = document.getElementById("qcEmoji1");
      const l2 = document.getElementById("qcLine2");
      const e2 = document.getElementById("qcEmoji2");
      if (l1) l1.value = clip.headline.line1 || "";
      if (e1) e1.value = clip.headline.emoji1 || "🔥";
      if (l2) l2.value = clip.headline.line2 || "";
      if (e2) e2.value = clip.headline.emoji2 || "👇";
      updateOverlay(clip);
      renderTimeline(clip);
      showSnackbar("AI คิดพาดหัวใหม่เรียบร้อยแล้ว");
    }
  } catch (err) {
    showSnackbar("AI คิดพาดหัวล้มเหลว: " + err.message, { tone: "error" });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="ms sm">auto_awesome</span>AI คิดใหม่`;
    }
  }
}

async function handleRecutSilence() {
  const clip = getCurrentClip();
  const thSlider = document.getElementById("qcThresholdSlider");
  const btn = document.getElementById("btnQcRecut");
  if (!clip || !thSlider) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = "กำลังคำนวณ...";
  }

  try {
    const res = await analyzeSilence(clip.id, { thresholdDb: parseFloat(thSlider.value) });
    if (res?.ok) {
      clip.silence = res.silence;
      renderTimeline(clip);
      showSnackbar(`คำนวณใหม่แล้ว: ตัดออก ${clip.silence.percentTrimmed}%`);
    }
  } catch (err) {
    showSnackbar("คำนวณรอยตัดล้มเหลว: " + err.message, { tone: "error" });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="ms sm">refresh</span>คำนวณรอยตัดใหม่`;
    }
  }
}

export async function saveCurrentClipChanges() {
  const clip = getCurrentClip();
  if (!clip) return;

  const savedBadge = document.getElementById("editorSavedBadge");
  if (savedBadge) {
    savedBadge.innerHTML = `<span class="ms sm">sync</span>กำลังบันทึก...`;
    savedBadge.style.opacity = "1";
  }

  try {
    await updateClip(clip.id, {
      headline: clip.headline,
      productCode: clip.productCode,
      beautyLevel: clip.beautyLevel,
      approved: clip.approved,
      status: clip.status,
      fontFamily: clip.fontFamily,
      topFontSize: clip.topFontSize,
      bottomFontSize: clip.bottomFontSize,
      lineSpacing: clip.lineSpacing,
      silence: clip.silence,
      headlineStartSec: clip.headlineStartSec,
      headlineEndSec: clip.headlineEndSec,
      enableCta: clip.enableCta,
      randomZoom: clip.randomZoom,
      enableHookZoom: clip.enableHookZoom,
      hookZoomDurationSec: clip.hookZoomDurationSec,
      hookZoomScalePercent: clip.hookZoomScalePercent,
      topHeadlineColor: clip.topHeadlineColor,
      bottomHeadlineColor: clip.bottomHeadlineColor,
    });

    if (savedBadge) {
      savedBadge.innerHTML = `<span class="ms sm">cloud_done</span>บันทึกแล้ว`;
      setTimeout(() => {
        if (savedBadge) savedBadge.style.opacity = "0.7";
      }, 1200);
    }
    emit("clip-update", { clip, index: state.currentIndex });
  } catch (err) {
    if (savedBadge) savedBadge.innerHTML = `<span class="ms sm">error</span>บันทึกล้มเหลว`;
  }
}

export async function approveAndAdvance() {
  const clip = getCurrentClip();
  if (!clip) return;

  clip.approved = true;
  if (clip.status !== "rendering") {
    clip.status = "approved";
  }
  await saveCurrentClipChanges();

  if (state.currentIndex < state.clips.length - 1) {
    window.location.hash = `#/editor/${state.currentIndex + 1}`;
  } else {
    showSnackbar("🎉 ตรวจสอบผ่าน QC ครบทุกคลิปแล้ว พร้อมเรนเดอร์ได้เลย", {
      action: { label: "ไปเรนเดอร์", onClick: () => { window.location.hash = "#/export"; } },
      duration: 6000,
    });
    window.location.hash = "#/library";
  }
}

async function renderCurrentClipNow() {
  const clip = getCurrentClip();
  if (!clip) return;

  clip.approved = true;
  if (clip.status !== "rendering") clip.status = "approved";
  await saveCurrentClipChanges();

  try {
    const res = await renderBatch([clip.id], {
      [clip.id]: {
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
        headlineStartSec: clip.headlineStartSec,
        headlineEndSec: clip.headlineEndSec,
      },
    });

    if (res?.ok) {
      window.location.hash = "#/export";
    }
  } catch (err) {
    showSnackbar("สั่งเรนเดอร์ล้มเหลว: " + err.message, { tone: "error" });
  }
}

function navigateClipIndex(delta) {
  const target = state.currentIndex + delta;
  if (target >= 0 && target < state.clips.length) {
    window.location.hash = `#/editor/${target}`;
  }
}
