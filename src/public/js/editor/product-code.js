/**
 * product-code.js — BWCut Product Code Validator & Auto-Increment Generator
 * Ported from BW100 app.js L1460-1556
 */

import { PRODUCT_CODE_RE } from "../constants.js";

/**
 * Validate product code format
 * Format: XXYY-MMDD## (e.g. CN4A-101401)
 */
export function validateProductCode(code) {
  const val = (code || "").trim().toUpperCase();
  if (PRODUCT_CODE_RE.test(val)) {
    return {
      valid: true,
      text: `✓ รูปแบบถูกต้อง · ไฟล์ผลลัพธ์จะขึ้นต้นด้วย ${val}_`,
      statusClass: "ok",
    };
  } else if (val) {
    return {
      valid: false,
      text: "⚠️ รอเติมครบ 11 ตัว (เช่น CN4A-101401)",
      statusClass: "warn",
    };
  } else {
    return {
      valid: false,
      text: "โครงสร้าง XXYY-MMDD## (ยังไม่ได้ระบุ)",
      statusClass: "muted",
    };
  }
}

/**
 * Generate auto-incremented product code for today
 * Calculates sequence number automatically per prefix and date
 */
export function generateAutoProductCode(currentVal = "", currentIndex = 0, allClips = []) {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const datePattern = `${mm}${dd}`;

  let val = (currentVal || "").trim().toUpperCase();

  // If empty, auto-inherit prefix from previous clip if available
  if (!val && currentIndex > 0 && allClips[currentIndex - 1]?.productCode) {
    const prevMatch = allClips[currentIndex - 1].productCode.match(/^([A-Z0-9]{4})/);
    if (prevMatch) val = prevMatch[1];
  }

  const prefixMatch = val.match(/^([A-Z0-9]{2,4})/);
  let prefix = prefixMatch ? prefixMatch[1] : "BWXX";
  if (prefix.length === 2) prefix = prefix + "XX";
  else if (prefix.length === 3) prefix = prefix + "X";
  prefix = prefix.slice(0, 4);

  // Find all existing sequence numbers used by other clips for this prefix + date
  const usedSeqs = [];
  allClips.forEach((c, idx) => {
    if (idx === currentIndex) return;
    if (!c.productCode) return;
    const m = c.productCode.trim().toUpperCase().match(new RegExp(`^${prefix}-${datePattern}(\\d{2})$`));
    if (m) {
      usedSeqs.push(parseInt(m[1], 10));
    }
  });

  // Calculate next sequence number
  let nextSeq = 1;
  if (usedSeqs.length > 0) {
    nextSeq = Math.max(...usedSeqs) + 1;
  }
  const seqStr = String(nextSeq).padStart(2, "0");
  return `${prefix}-${datePattern}${seqStr}`;
}
