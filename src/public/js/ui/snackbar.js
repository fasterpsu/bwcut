/**
 * snackbar.js — BWCut Clean Notification Toast
 */

let activeSnackbar = null;
let dismissTimer = null;

/**
 * Show a snackbar message
 * @param {string} message - text to display
 * @param {object} options - { action?: { label, onClick }, duration?: number, tone?: 'default' | 'error' }
 */
export function showSnackbar(message, options = {}) {
  const { action, duration = 3500, tone = "default" } = options;

  if (activeSnackbar) {
    activeSnackbar.remove();
    clearTimeout(dismissTimer);
    activeSnackbar = null;
  }

  const container = document.getElementById("snackbar-root") || document.body;
  const bar = document.createElement("div");
  bar.className = `snackbar ${tone === "error" ? "error" : ""}`;

  const textSpan = document.createElement("span");
  textSpan.textContent = message;
  bar.appendChild(textSpan);

  if (action && action.label && typeof action.onClick === "function") {
    const actBtn = document.createElement("button");
    actBtn.className = "btn btn-text btn-sm";
    actBtn.textContent = action.label;
    actBtn.addEventListener("click", () => {
      bar.remove();
      action.onClick();
    });
    bar.appendChild(actBtn);
  }

  container.appendChild(bar);
  activeSnackbar = bar;

  dismissTimer = setTimeout(() => {
    if (activeSnackbar === bar) {
      bar.style.opacity = "0";
      bar.style.transform = "translate(-50%, 15px)";
      bar.style.transition = "opacity 200ms, transform 200ms";
      setTimeout(() => {
        if (bar.parentElement) bar.remove();
        if (activeSnackbar === bar) activeSnackbar = null;
      }, 200);
    }
  }, duration);
}
