/**
 * cuts.js — BWCut Pure Cut & Audio Manipulation Logic
 * Ported verbatim from BW100 core algorithms with pure functional safety
 */

import { UNDO_LIMIT } from "../constants.js";

/**
 * Recompute kept seconds, removed seconds, and trim percentage
 */
export function recomputeStats(silence, totalSec) {
  if (!silence) return;
  const audible = silence.audibleParts || [];
  const keptSec = Math.round(audible.reduce((acc, p) => acc + (p.durationInSeconds || (p.endInSeconds - p.startInSeconds)), 0) * 10) / 10;
  const removedSec = Math.round((totalSec - keptSec) * 10) / 10;
  const pct = totalSec > 0 ? Math.round((removedSec / totalSec) * 100) : 0;

  silence.keptDurationSec = keptSec;
  silence.removedDurationSec = removedSec;
  silence.percentTrimmed = pct;
}

/**
 * Cut out marked time segment [start, end]
 * Ported from BW100 app.js L919-999
 */
export function cutRange(silence, start, end, totalSec) {
  if (!silence) return { ok: false, error: "No silence data" };
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  if (e - s < 0.08) {
    return { ok: false, error: "ช่วงที่ต้องการตัดสั้นเกินไป (อย่างน้อย 0.1 วินาที)" };
  }

  const oldAudible = silence.audibleParts || [{ startInSeconds: 0, endInSeconds: totalSec, durationInSeconds: totalSec }];
  const newAudible = [];

  for (const part of oldAudible) {
    // 1. Part is entirely before cut
    if (part.endInSeconds <= s) {
      newAudible.push(part);
    }
    // 2. Part is entirely after cut
    else if (part.startInSeconds >= e) {
      newAudible.push(part);
    }
    // 3. Cut overlaps part
    else {
      // Left remnant
      if (part.startInSeconds < s) {
        const leftDur = Math.round((s - part.startInSeconds) * 1000) / 1000;
        if (leftDur > 0.05) {
          newAudible.push({
            startInSeconds: part.startInSeconds,
            endInSeconds: s,
            durationInSeconds: leftDur,
          });
        }
      }
      // Right remnant
      if (part.endInSeconds > e) {
        const rightDur = Math.round((part.endInSeconds - e) * 1000) / 1000;
        if (rightDur > 0.05) {
          newAudible.push({
            startInSeconds: e,
            endInSeconds: part.endInSeconds,
            durationInSeconds: rightDur,
          });
        }
      }
    }
  }

  silence.audibleParts = newAudible;
  recomputeStats(silence, totalSec);
  return { ok: true, cutDuration: Math.round((e - s) * 10) / 10 };
}

/**
 * Restore marked time segment [start, end] back to audible speech
 * Ported from BW100 app.js L1001-1076
 */
export function restoreRange(silence, start, end, totalSec) {
  if (!silence) return { ok: false, error: "No silence data" };
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  if (e - s < 0.05) {
    return { ok: false, error: "ช่วงที่ต้องการคืนเสียงสั้นเกินไป" };
  }

  const oldAudible = silence.audibleParts || [];
  const merged = [...oldAudible, { startInSeconds: s, endInSeconds: e, durationInSeconds: e - s }];
  merged.sort((a, b) => a.startInSeconds - b.startInSeconds);

  // Merge overlapping and contiguous audible segments
  const resolvedAudible = [];
  for (const part of merged) {
    if (resolvedAudible.length === 0) {
      resolvedAudible.push({ ...part });
    } else {
      const last = resolvedAudible[resolvedAudible.length - 1];
      if (part.startInSeconds <= last.endInSeconds + 0.04) {
        last.endInSeconds = Math.max(last.endInSeconds, part.endInSeconds);
        last.durationInSeconds = Math.round((last.endInSeconds - last.startInSeconds) * 1000) / 1000;
      } else {
        resolvedAudible.push({ ...part });
      }
    }
  }

  silence.audibleParts = resolvedAudible;
  recomputeStats(silence, totalSec);
  return { ok: true, restoredDuration: Math.round((e - s) * 10) / 10 };
}

/**
 * Push current silence state into undo stack
 */
export function pushUndo(clip) {
  if (!clip || !clip.silence) return;
  if (!clip.originalSilence) {
    clip.originalSilence = JSON.parse(JSON.stringify(clip.silence));
  }
  if (!clip.undoHistory) clip.undoHistory = [];
  clip.undoHistory.push(JSON.parse(JSON.stringify(clip.silence)));
  if (clip.undoHistory.length > UNDO_LIMIT) clip.undoHistory.shift();
  clip.redoHistory = [];
}

/**
 * Undo one step
 */
export function undo(clip, totalSec) {
  if (!clip || !clip.undoHistory || clip.undoHistory.length === 0) return false;
  if (!clip.redoHistory) clip.redoHistory = [];
  clip.redoHistory.push(JSON.parse(JSON.stringify(clip.silence)));

  clip.silence = clip.undoHistory.pop();
  recomputeStats(clip.silence, totalSec);
  return true;
}

/**
 * Redo one step
 */
export function redo(clip, totalSec) {
  if (!clip || !clip.redoHistory || clip.redoHistory.length === 0) return false;
  if (!clip.undoHistory) clip.undoHistory = [];
  clip.undoHistory.push(JSON.parse(JSON.stringify(clip.silence)));

  clip.silence = clip.redoHistory.pop();
  recomputeStats(clip.silence, totalSec);
  return true;
}

/**
 * Reset silence cuts back to original automatic silence detection
 */
export function resetToOriginal(clip, totalSec) {
  if (!clip || !clip.originalSilence) return false;
  pushUndo(clip);
  clip.silence = JSON.parse(JSON.stringify(clip.originalSilence));
  recomputeStats(clip.silence, totalSec);
  return true;
}
