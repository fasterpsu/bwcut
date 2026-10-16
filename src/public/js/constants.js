/**
 * constants.js — BWCut System Constants (Locked Schema)
 */

export const FONTS = [
  { value: "none", th: "ไม่ใส่ข้อความ / ปิดซับ", file: null },
  { value: "Prompt-Bold", th: "Prompt Bold (พร้อมท์ หนา) [แนะนำ]", file: "Prompt-Bold.ttf", isDefault: true },
  { value: "Kanit-Regular", th: "Kanit Regular (คณิต ปกติ)", file: "Kanit-Regular.ttf" },
  { value: "Kanit-MediumItalic", th: "Kanit Medium Italic (คณิต ตัวเอียง)", file: "Kanit-MediumItalic.ttf" },
  { value: "Mitr-Bold", th: "Mitr Bold (มิตร ตัวหนา)", file: "Mitr-Bold.ttf" },
  { value: "Mitr-Regular", th: "Mitr Regular (มิตร ปกติ)", file: "Mitr-Regular.ttf" },
  { value: "NotoSansThai-Bold", th: "Noto Sans Thai Bold (โนโตะ หนา)", file: "NotoSansThai-Bold.ttf" },
  { value: "Athiti-Regular", th: "Athiti Regular (อธิติ)", file: "Athiti-Regular.ttf" },
  { value: "Fahkwang-Medium", th: "Fahkwang Medium (ฟ้ากว้าง)", file: "Fahkwang-Medium.ttf" },
  { value: "Mali-Medium", th: "Mali Medium (มะลิ)", file: "Mali-Medium.ttf" },
  { value: "Niramit-Medium", th: "Niramit Medium (นิรมิต)", file: "Niramit-Medium.ttf" },
  { value: "Pattaya-Regular", th: "Pattaya Regular (พัทยา)", file: "Pattaya-Regular.ttf" },
  { value: "Sriracha-Regular", th: "Sriracha Regular (ศรีราชา)", file: "Sriracha-Regular.ttf" }
];

export const COLOR_PRESETS = [
  { name: "เหลืองนีออน + ขาว (ยอดนิยม)", top: "#FFE600", bottom: "#FFFFFF" },
  { name: "ขาวคลีน + เหลืองนีออน", top: "#FFFFFF", bottom: "#FFE600" },
  { name: "เขียวมะนาว + ขาว (ดึงดูดสายตา)", top: "#00FF66", bottom: "#FFFFFF" },
  { name: "ฟ้าสว่าง + ขาว (สบายตา)", top: "#00E5FF", bottom: "#FFFFFF" },
  { name: "ส้มสะท้อนแสง + ขาว (โปรเด็ดเร้าใจ)", top: "#FF6B00", bottom: "#FFFFFF" },
  { name: "ชมพูสดนีออน + ขาว (ของน่ารัก/ผู้หญิง)", top: "#FF2A85", bottom: "#FFFFFF" },
  { name: "เหลืองนีออน + ฟ้าสด (สะดุดตาสองโทน)", top: "#FFE600", bottom: "#00E5FF" },
  { name: "แดงเตือนภัย + ขาว (คลิปรีบด่วน/ลดโหด)", top: "#FF3333", bottom: "#FFFFFF" },
  { name: "เขียวมิ้นท์พาสเทล + เหลืองนีออน", top: "#2EE59D", bottom: "#FFE600" },
  { name: "ม่วงพาสเทล + ขาว (พรีเมียมดูแพง)", top: "#C084FC", bottom: "#FFFFFF" }
];

export const STATUS_META = {
  unprocessed: { label: "ยังไม่ตัด", code: "unprocessed" },
  analyzing: { label: "กำลังวิเคราะห์", code: "analyzing" },
  ready: { label: "รอตรวจ", code: "ready" },
  approved: { label: "ผ่าน QC", code: "approved" },
  rendering: { label: "กำลังเรนเดอร์", code: "rendering" },
  completed: { label: "เรนเดอร์แล้ว", code: "completed" },
  error: { label: "ผิดพลาด", code: "error" }
};

export const QUEUE_STATUS_META = {
  pending: { label: "รอคิว", s: "unprocessed" },
  rendering: { label: "กำลังเรนเดอร์", s: "rendering" },
  completed: { label: "สำเร็จ", s: "approved" },
  failed: { label: "ล้มเหลว", s: "error" },
  cancelled: { label: "ยกเลิก", s: "unprocessed" }
};

export const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16];
export const ZOOM_MAX = 16;
export const PRODUCT_CODE_RE = /^[A-Z0-9]{4}-\d{6}$/;
export const UNDO_LIMIT = 50;
export const CTA_TAIL_SEC = 2.0;

export const OVERLAY = {
  line1TopPct: 15.75,
  pxPerPt: 5.3,
  refWidth: 1080,
  refHeight: 1920,
  ctaPt: 30
};
