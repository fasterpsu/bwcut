/**
 * utils.js — BWCut Helper Utilities
 */

/**
 * Format seconds to M:SS (e.g. 1:04, 0:24)
 */
export function formatTime(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format seconds to M:SS.S with sub-second precision
 */
export function formatTimePrecise(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

/**
 * Clamp a number between min and max
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Debounce function invocation
 */
export function debounce(fn, wait = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Escape HTML special chars to prevent XSS
 */
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * DOM element creation helper
 */
export function el(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === "className" || key === "class") {
      element.className = val;
    } else if (key === "dataset" && typeof val === "object") {
      Object.assign(element.dataset, val);
    } else if (key.startsWith("on") && typeof val === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === "style" && typeof val === "object") {
      Object.assign(element.style, val);
    } else if (val !== null && val !== undefined && val !== false) {
      element.setAttribute(key, val === true ? "" : val);
    }
  }

  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === "string" || typeof child === "number") {
      element.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  }
  return element;
}
