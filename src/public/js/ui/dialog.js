/**
 * dialog.js — BWCut Confirm Modal Dialog (Promise-based)
 */

/**
 * Show a confirmation modal dialog
 * @param {object} options - { title: string, body: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }
 * @returns {Promise<boolean>}
 */
export function confirmDialog(options = {}) {
  const {
    title = "ยืนยันการดำเนินการ",
    body = "คุณต้องการดำเนินการขั้นตอนนี้ใช่หรือไม่?",
    confirmLabel = "ยืนยัน",
    cancelLabel = "ยกเลิก",
    danger = false,
  } = options;

  return new Promise((resolve) => {
    const scrim = document.createElement("div");
    scrim.className = "scrim show";

    const box = document.createElement("div");
    box.className = "dialog-box";

    const h3 = document.createElement("h3");
    h3.textContent = title;

    const p = document.createElement("p");
    p.textContent = body;

    const actions = document.createElement("div");
    actions.className = "dialog-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-text";
    cancelBtn.textContent = cancelLabel;

    const confirmBtn = document.createElement("button");
    confirmBtn.className = `btn ${danger ? "btn-danger-tonal" : "btn-filled"}`;
    confirmBtn.textContent = confirmLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    box.appendChild(h3);
    box.appendChild(p);
    box.appendChild(actions);
    scrim.appendChild(box);

    const cleanup = (result) => {
      scrim.classList.remove("show");
      setTimeout(() => scrim.remove(), 150);
      document.removeEventListener("keydown", onKeyDown);
      resolve(result);
    };

    cancelBtn.addEventListener("click", () => cleanup(false));
    confirmBtn.addEventListener("click", () => cleanup(true));

    scrim.addEventListener("click", (e) => {
      if (e.target === scrim) cleanup(false);
    });

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        cleanup(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);

    document.body.appendChild(scrim);
    confirmBtn.focus();
  });
}
