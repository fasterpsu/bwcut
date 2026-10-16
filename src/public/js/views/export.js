/**
 * export.js — BWCut Render Queue & Export Dashboard
 */

import { state, on } from "../store.js";
import { formatTime, escapeHtml } from "../utils.js";
import { cancelRender, openOutput } from "../api.js";
import { showSnackbar } from "../ui/snackbar.js";
import { confirmDialog } from "../ui/dialog.js";
import { QUEUE_STATUS_META } from "../constants.js";

export function initExportView() {
  const btnCancel = document.getElementById("btnCancelAllRender");
  if (btnCancel) {
    btnCancel.addEventListener("click", handleCancelRender);
  }

  const btnOpenOut = document.getElementById("btnOpenRenderDir");
  if (btnOpenOut) {
    btnOpenOut.addEventListener("click", () => {
      openOutput().catch((e) => showSnackbar("เปิดโฟลเดอร์ไม่สำเร็จ: " + e.message, { tone: "error" }));
    });
  }

  const btnClearLogs = document.getElementById("btnClearTerminalLogs");
  if (btnClearLogs) {
    btnClearLogs.addEventListener("click", () => {
      state.logs = [];
      const logBox = document.getElementById("terminalLogBox");
      if (logBox) logBox.innerHTML = "";
    });
  }

  // Subscribe to store events
  on("queue", () => {
    renderQueueTable();
    updateProgressCard();
    updateTopbarRenderPill();
  });

  on("progress", ({ progress }) => {
    updateProgressCard(progress);
    renderQueueTable();
    updateTopbarRenderPill();
  });

  on("log", (msg) => {
    appendLogEntry(msg);
  });

  on("logs", (logs) => {
    const logBox = document.getElementById("terminalLogBox");
    if (!logBox) return;
    logBox.innerHTML = "";
    logs.forEach(appendLogEntry);
  });
}

export function updateProgressCard(prog = state.progress) {
  const titleEl = document.getElementById("renderProgressTitle");
  const subEl = document.getElementById("renderProgressSub");
  const fillEl = document.getElementById("renderProgressLinearFill");
  const btnCancel = document.getElementById("btnCancelAllRender");

  const kpiPct = document.getElementById("kpiProgressPct");
  const kpiSpeed = document.getElementById("kpiSpeed");
  const kpiFps = document.getElementById("kpiFps");
  const kpiEta = document.getElementById("kpiEta");

  const total = state.queue.length;
  const completed = state.queue.filter((q) => q.status === "completed").length;
  const activeJob = state.queue.find((q) => q.status === "rendering");

  if (state.isRendering || activeJob) {
    if (titleEl) titleEl.textContent = `กำลังเรนเดอร์ ${completed + 1} จาก ${total} คลิป`;
    if (subEl) subEl.textContent = `${activeJob ? activeJob.name : ""} · 1080p MP4`;
    if (btnCancel) btnCancel.classList.remove("hidden");

    const pct = prog ? prog.percent : 0;
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (kpiPct) kpiPct.textContent = `${pct.toFixed(1)}%`;
    if (kpiSpeed) kpiSpeed.textContent = prog?.speed || "0.0x";
    if (kpiFps) kpiFps.textContent = `${prog?.fps || 0}`;
    if (kpiEta) kpiEta.textContent = formatTime(prog?.etaSec || 0);
  } else if (total > 0 && completed === total) {
    if (titleEl) titleEl.textContent = `เรนเดอร์เสร็จสิ้นแล้วทั้ง ${total} คลิป`;
    if (subEl) subEl.textContent = "ไฟล์ทั้งหมดพร้อมโพสต์ลง TikTok / Reels / Shorts แล้ว";
    if (fillEl) fillEl.style.width = "100%";
    if (btnCancel) btnCancel.classList.add("hidden");
    if (kpiPct) kpiPct.textContent = "100%";
    if (kpiSpeed) kpiSpeed.textContent = "สำเร็จ";
    if (kpiFps) kpiFps.textContent = "—";
    if (kpiEta) kpiEta.textContent = "0:00";
  } else {
    if (titleEl) titleEl.textContent = "ยังไม่มีคิวเรนเดอร์";
    if (subEl) subEl.textContent = "เลือกคลิปที่ต้องการในคลังคลิปแล้วกดเรนเดอร์เพื่อเริ่มงาน";
    if (fillEl) fillEl.style.width = "0%";
    if (btnCancel) btnCancel.classList.add("hidden");
    if (kpiPct) kpiPct.textContent = "0%";
    if (kpiSpeed) kpiSpeed.textContent = "—";
    if (kpiFps) kpiFps.textContent = "—";
    if (kpiEta) kpiEta.textContent = "--:--";
  }
}

export function renderQueueTable() {
  const container = document.getElementById("renderQueueRows");
  if (!container) return;
  container.innerHTML = "";

  state.queue.forEach((item, index) => {
    const meta = QUEUE_STATUS_META[item.status] || QUEUE_STATUS_META.pending;
    const row = document.createElement("div");
    row.className = "q-row";

    const isDone = item.status === "completed";
    const fillStyle = isDone ? "background-color:var(--c-success);" : "";
    const speedText = item.status === "rendering" ? (item.speed || "0.0x") : isDone ? "เสร็จ" : "—";

    row.innerHTML = `
      <span class="n">${index + 1}</span>
      <span class="truncate" title="${escapeHtml(item.name)}"><strong>${escapeHtml(item.name)}</strong></span>
      <span class="status" data-s="${meta.s}">${meta.label}</span>
      <div class="linear"><i style="width:${item.progress}%;${fillStyle}"></i></div>
      <span class="sp">${speedText}</span>
    `;
    container.appendChild(row);
  });
}

export function updateTopbarRenderPill() {
  const pill = document.getElementById("topbarRenderPill");
  const countEl = document.getElementById("topbarRenderCount");
  const fillEl = document.getElementById("topbarRenderMiniFill");
  if (!pill) return;

  const total = state.queue.length;
  const completed = state.queue.filter((q) => q.status === "completed").length;
  const isPending = total > 0 && completed < total;

  if (isPending || state.isRendering) {
    pill.classList.remove("hidden");
    if (countEl) countEl.textContent = `${completed}/${total}`;
    const pct = state.progress ? state.progress.percent : 0;
    if (fillEl) fillEl.style.width = `${pct}%`;
  } else {
    pill.classList.add("hidden");
  }
}

function appendLogEntry(msg) {
  const logBox = document.getElementById("terminalLogBox");
  if (!logBox) return;

  const line = document.createElement("div");
  const isSuccess = msg.includes("✅") || msg.includes("สำเร็จ") || msg.includes("✓");
  const isErr = msg.includes("❌") || msg.includes("ข้อผิดพลาด") || msg.includes("Error") || msg.includes("failed");

  if (isSuccess) line.className = "ok";
  else if (isErr) line.className = "err";

  line.textContent = msg;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

async function handleCancelRender() {
  const confirmed = await confirmDialog({
    title: "ยกเลิกการเรนเดอร์ทั้งหมด?",
    body: "กระบวนการแปลงวิดีโอที่กำลังทำงานอยู่จะถูกหยุดทันที ใช่หรือไม่?",
    confirmLabel: "หยุดเรนเดอร์",
    danger: true,
  });

  if (!confirmed) return;

  try {
    await cancelRender();
    showSnackbar("ยกเลิกการเรนเดอร์เรียบร้อยแล้ว");
  } catch (err) {
    showSnackbar("ยกเลิกล้มเหลว: " + err.message, { tone: "error" });
  }
}
