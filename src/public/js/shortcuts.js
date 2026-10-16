/**
 * shortcuts.js — BWCut Global Keyboard Shortcuts Engine
 */

import { state, emit } from "./store.js";

const handlers = new Map();

/**
 * Register shortcut action
 */
export function registerShortcut(actionName, handler) {
  handlers.set(actionName, handler);
}

export function initShortcuts() {
  window.addEventListener("keydown", (e) => {
    const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    const activeEl = document.activeElement;

    // Handle Escape globally
    if (e.key === "Escape") {
      if (handlers.has("escape")) {
        e.preventDefault();
        handlers.get("escape")();
        return;
      }
    }

    // Ctrl+A in Library View selects all visible
    if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
      if (!isInput && state.view === "library") {
        e.preventDefault();
        if (handlers.has("selectAll")) handlers.get("selectAll")();
        return;
      }
    }

    // Shortcuts active ONLY in Editor View
    if (state.view === "editor") {
      const isHeadlineInput = activeEl?.id === "qcLine1" || activeEl?.id === "qcLine2" || activeEl?.id === "qcEmoji1" || activeEl?.id === "qcEmoji2";
      const isProductCodeInput = activeEl?.id === "qcProductCode";

      // Enter inside headline inputs approves and advances
      if (e.key === "Enter" && isHeadlineInput) {
        e.preventDefault();
        activeEl.blur();
        if (handlers.has("approveNext")) handlers.get("approveNext")();
        return;
      }

      // Enter inside product code triggers auto date & sequence
      if (e.key === "Enter" && isProductCodeInput) {
        e.preventDefault();
        if (handlers.has("autoProductCode")) handlers.get("autoProductCode")();
        return;
      }

      // Undo / Redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) outside of text inputs
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        if (!isHeadlineInput && !isProductCodeInput) {
          e.preventDefault();
          if (e.shiftKey) {
            if (handlers.has("redo")) handlers.get("redo")();
          } else {
            if (handlers.has("undo")) handlers.get("undo")();
          }
          return;
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        if (!isHeadlineInput && !isProductCodeInput) {
          e.preventDefault();
          if (handlers.has("redo")) handlers.get("redo")();
          return;
        }
      }

      // If user is currently typing in an input field, do not trigger single-key shortcuts
      if (isInput) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (handlers.has("togglePlay")) handlers.get("togglePlay")();
          break;

        case "Enter":
          e.preventDefault();
          if (handlers.has("approveNext")) handlers.get("approveNext")();
          break;

        case "[":
        case "ArrowLeft":
          e.preventDefault();
          if (handlers.has("prevClip")) handlers.get("prevClip")();
          break;

        case "]":
        case "ArrowRight":
          e.preventDefault();
          if (handlers.has("nextClip")) handlers.get("nextClip")();
          break;

        case "i":
        case "I":
          e.preventDefault();
          if (handlers.has("markIn")) handlers.get("markIn")();
          break;

        case "o":
        case "O":
          e.preventDefault();
          if (handlers.has("markOut")) handlers.get("markOut")();
          break;

        case "x":
        case "X":
        case "Delete":
          e.preventDefault();
          if (handlers.has("cutSegment")) handlers.get("cutSegment")();
          break;

        case "r":
        case "R":
          e.preventDefault();
          if (handlers.has("restoreSegment")) handlers.get("restoreSegment")();
          break;

        case "j":
        case "J":
          e.preventDefault();
          if (handlers.has("seekStepBack")) handlers.get("seekStepBack")();
          break;

        case "l":
        case "L":
          e.preventDefault();
          if (handlers.has("seekStepForward")) handlers.get("seekStepForward")();
          break;

        case ",":
          e.preventDefault();
          if (handlers.has("nudgeBack")) handlers.get("nudgeBack")();
          break;

        case ".":
          e.preventDefault();
          if (handlers.has("nudgeForward")) handlers.get("nudgeForward")();
          break;

        case "+":
        case "=":
          e.preventDefault();
          if (handlers.has("zoomIn")) handlers.get("zoomIn")();
          break;

        case "-":
        case "_":
          e.preventDefault();
          if (handlers.has("zoomOut")) handlers.get("zoomOut")();
          break;

        case "1":
        case "2":
        case "3":
        case "4":
          e.preventDefault();
          if (handlers.has("switchTabNumber")) handlers.get("switchTabNumber")(parseInt(e.key, 10));
          break;

        case "?":
          e.preventDefault();
          if (handlers.has("showHelp")) handlers.get("showHelp")();
          break;
      }
    }
  });
}
