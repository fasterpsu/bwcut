# ✂️ BWCut — Frontend Redesign Master Plan (v1.0 · LOCKED)

> **เอกสารนี้คือ "สัญญา" (Contract) สำหรับ AI ตัวที่จะลงมือสร้าง (เช่น Gemini)**
> ออกแบบโดย Claude · 2026-10-14 · แทนที่ UI ของ `BW100_Studio` ทั้งหมด
> ห้ามตีความใหม่ ห้ามเพิ่มสี/ฟอนต์/เลย์เอาต์นอกเหนือจากที่ระบุ — ถ้าไม่แน่ใจ ให้ยึด [mockup.html](../design/mockup.html) เป็นความจริงสูงสุด

---

## 0. วิธีใช้เอกสารนี้ (อ่านก่อนเริ่มงาน)

| ไฟล์ | บทบาท | ลำดับความสำคัญ |
|---|---|---|
| `docs/BWCUT_REDESIGN_PLAN.md` (ไฟล์นี้) | สเปกฟังก์ชัน, สถาปัตยกรรม, ลำดับงาน, เช็กลิสต์ | 1 |
| `design/mockup.html` | **หน้าตาจริง** (เปิดในเบราว์เซอร์ได้เลย) — layout / spacing / component | 1 |
| `design/tokens.css` | Design tokens ที่ล็อกแล้ว — คัดลอกไปใช้ตรง ๆ | 1 |
| `_Tools/BW Production/BW100_Studio/src/public/app.js` | โค้ดเดิม — **แหล่งตรรกะ (logic) ที่ต้อง port** | อ้างอิง |

### 🔒 Golden Rules (ห้ามละเมิด)

1. **Backend API ห้ามเปลี่ยน** — endpoint, payload, response ต้องเหมือนเดิม 100% (ดู §9)
2. **ฟังก์ชันต้องครบ 100%** — ทุกปุ่ม/ทุก input ในระบบเดิมต้องมีที่อยู่ใหม่ (ดู Parity Matrix §10)
3. **ห้าม hardcode สี/ขนาด** ใน component — ใช้ CSS variables จาก `tokens.css` เท่านั้น
4. **ห้ามใช้ emoji ใน UI chrome** (ปุ่ม, หัวข้อ, label, เมนู) → ใช้ **Material Symbols Rounded** แทน
   *ยกเว้น*: emoji ที่เป็น "เนื้อหา" ของพาดหัว (`emoji1`, `emoji2`, CTA `🛒👇`) ยังคงเป็น emoji
5. **ห้ามใช้ `alert()` / `confirm()`** → ใช้ Snackbar + Confirm Dialog component (ดู §5.10)
6. **ห้ามใช้ inline `style=""`** ใน HTML (ยกเว้นค่าที่คำนวณ runtime เช่น `left:%`, `width:%`)
7. **ห้ามใช้ gradient, glow, glassmorphism, neon** — นี่คือสาเหตุที่ UI เดิม "ดูเหมือน AI ทำ"
8. **Vanilla JS + ES Modules เท่านั้น** — ไม่มี framework, ไม่มี build step (server เสิร์ฟ `src/public` แบบ static)
9. ข้อความใน UI = **ภาษาไทยสั้น กระชับ** (ดู Copywriting §8)

---

## 1. วินิจฉัยปัญหา UI เดิม (BW100 Studio)

| # | ปัญหา | หลักฐานในโค้ดเดิม | ทางแก้ใน BWCut |
|---|---|---|---|
| 1 | **ดูเหมือน AI ทำ** — emoji ทุกปุ่ม, gradient สีฟ้า/ส้ม, ชื่อปุ่มยาวมีวงเล็บภาษาอังกฤษ | `index.html` L26–52, `🤖 AI ตัดเสียง + พาดหัว`, `linear-gradient(135deg,#0ea5e9…)` | Material Symbols + ปุ่ม 4 แบบตายตัว, label ≤ 3 คำ |
| 2 | **Sub-bar รก** — 7 ปุ่ม batch แสดงตลอดเวลาแม้ยังไม่ได้เลือกคลิป | L45–53 | **Contextual Action Bar** แบบ Gmail: โผล่เฉพาะตอนเลือกคลิป |
| 3 | **แผง QC ยาวเป็นหางว่าว** — 8 section ซ้อนกันต้อง scroll ยาว | L189–404 | **Inspector 4 แท็บ** (ข้อความ / สไตล์ / เอฟเฟกต์ / เสียง) + ปุ่มหลัก sticky ด้านล่าง |
| 4 | **ตัดต่อยาก** — ไทม์ไลน์เล็ก คลิกได้อย่างเดียว ต้องกด I/O หรือพิมพ์ตัวเลข; toolbar ตัด 8 ปุ่ม + hint text | L104–185 | **Timeline Dock** เต็มความกว้าง: ลากเพื่อเลือกช่วง, ลาก playhead, ลากขอบแถบพาดหัว, zoom slider |
| 5 | **ไม่มีภาพรวมคลิปขณะ QC** — มีแค่ปุ่มก่อน/ถัดไป | L190–195 | **Filmstrip** ด้านซ้าย เห็นสถานะทุกคลิป คลิกกระโดดได้ |
| 6 | **วิดีโอพรีวิวเล็ก** (max 360×480) | `fitVideoWrapper()` app.js L578 | Stage เต็มพื้นที่ (สูงสุด ~560px) |
| 7 | Inline style กระจายทั่ว HTML, font list ซ้ำ 2 ที่ | L142–153, L296–321 & L597–622 | CSS แยกไฟล์ + `FONTS` array เดียว render ทั้ง 2 ที่ |
| 8 | Log อยู่แค่หน้า Render, ไม่เห็นสถานะการเรนเดอร์จากหน้าอื่น | L452 | **Render Pill** บน Top bar เห็นได้ทุกหน้า |
| 9 | `renderGrid()` render ใหม่ทั้งกริดทุก SSE event (ช้าเมื่อ 100 คลิป) | app.js L250, L391 | **Keyed update**: อัปเดตเฉพาะการ์ดที่เปลี่ยน |
| 10 | `alert()`/`confirm()` ขัดจังหวะงาน | หลายจุด | Snackbar (ไม่บล็อก) + Dialog (เฉพาะ destructive) |

---

## 2. หลักการออกแบบ (Design Principles)

1. **Content first** — วิดีโอคือพระเอก, UI เป็นพื้นหลังสีเทาอ่อน/ขาว ไม่แย่งสายตา
2. **One primary action per screen** — แต่ละหน้ามีปุ่ม Filled (สีน้ำเงิน) ได้ **ปุ่มเดียว**
   - คลังคลิป → FAB "เรนเดอร์ N คลิปที่ผ่าน QC"
   - ตัดต่อ → "ผ่าน QC · ถัดไป"
   - Settings → "บันทึก"
3. **Progressive disclosure** — ฟีเจอร์ที่ใช้ไม่บ่อย (Hook zoom options, reset cuts, threshold) ซ่อนในแท็บ/เมนู
4. **Keyboard-first editing** — เป้าหมาย 100 คลิป / 2 ชม. ทุก action หลักมีคีย์ลัดและแสดงใน tooltip
5. **Color = meaning** — สี Google 4 สีใช้ตามความหมายเท่านั้น:
   - 🔵 Blue `#1a73e8` = Primary / Selection / Info
   - 🔴 Red `#ea4335` = ตัดทิ้ง / ลบ / Error
   - 🟡 Yellow `#fbbc05` = พาดหัว (Headline track) / รอตรวจ
   - 🟢 Green `#34a853` = เสียงพูดที่เก็บ / ผ่าน QC / สำเร็จ

---

## 3. ขอบเขตงาน (Scope)

### ✅ In scope
- เขียน `src/public/` ใหม่ทั้งหมด (HTML / CSS / JS)
- Rebrand เป็น **BWCut** (title, logo, ข้อความ, localStorage keys)
- แก้ backend **เฉพาะ** 3 จุดนี้ (ไม่แตะ logic):
  1. `server.ts` L3, L26 → default port `3100` → **`3110`** (รันคู่กับ BW100 ได้)
  2. ข้อความ console banner / log ที่มีคำว่า `BW100` → `BWCut`
  3. `package.json` → `"name": "bwcut"`, description ใหม่
- `run.bat` → title `BWCut Studio (port 3110)`
- `manual.html` → ปรับธีมให้ใช้ tokens เดียวกัน (Phase 6, optional)

### ❌ Out of scope
- `src/engine/*` (ffmpeg, silence, headline, render-direct, subtitles, config) — **ห้ามแก้**
- เปลี่ยน data model `ClipData`, `RenderQueueItem`, `BW100Settings`
- Dark mode (เตรียม token ไว้แล้ว แต่ยังไม่ทำ)

---

## 4. โครงสร้างโฟลเดอร์ & Bootstrap

**ตำแหน่ง:** `D:\OneDrive\BW_OS\_Tools\BWCut\`

```
BWCut/
├── docs/
│   └── BWCUT_REDESIGN_PLAN.md      ← ไฟล์นี้
├── design/
│   ├── tokens.css                  ← Design tokens (LOCKED)
│   └── mockup.html                 ← Visual reference (LOCKED)
├── bin/                            ← copy จาก BW100 (ffmpeg.exe, ffprobe.exe)
├── fonts/                          ← copy จาก BW100 (ฟอนต์สำหรับ render)
├── src/
│   ├── server.ts                   ← copy + แก้ port/ชื่อ เท่านั้น
│   ├── engine/                     ← copy ทั้งโฟลเดอร์ ห้ามแก้
│   └── public/                     ← ★ เขียนใหม่ทั้งหมด ★
│       ├── index.html
│       ├── manual.html
│       ├── fonts/                  ← copy จาก BW100 src/public/fonts
│       ├── vendor/
│       │   └── material-symbols-rounded.woff2   ← ดาวน์โหลดเก็บไว้ (ใช้ออฟไลน์ได้)
│       ├── css/
│       │   ├── tokens.css          ← copy จาก design/tokens.css
│       │   ├── base.css            ← reset, typography, scrollbar, @font-face
│       │   ├── components.css      ← button, chip, input, switch, slider, tabs, dialog, snackbar…
│       │   ├── shell.css           ← topbar, rail, view container
│       │   ├── library.css
│       │   ├── editor.css          ← filmstrip, stage, inspector
│       │   ├── timeline.css
│       │   ├── export.css
│       │   └── render-fonts.css    ← @font-face ของ 23 ฟอนต์ไทย (preview overlay)
│       └── js/
│           ├── main.js             ← entry: init, wiring
│           ├── store.js            ← global state + pub/sub
│           ├── api.js              ← fetch wrappers ทุก endpoint
│           ├── sse.js              ← EventSource + reconnect
│           ├── constants.js        ← FONTS, COLOR_PRESETS, STATUS_META, ZOOM_STEPS
│           ├── utils.js            ← formatTime, formatTimePrecise, debounce, clamp, el()
│           ├── shortcuts.js        ← keyboard map
│           ├── ui/
│           │   ├── snackbar.js
│           │   ├── dialog.js       ← confirmDialog() คืน Promise<boolean>
│           │   └── tooltip.js      ← (optional) หรือใช้ title attribute
│           ├── views/
│           │   ├── library.js
│           │   ├── editor.js       ← orchestrator ของหน้าตัดต่อ
│           │   ├── export.js
│           │   └── settings.js
│           └── editor/
│               ├── filmstrip.js
│               ├── preview.js      ← video, overlay, jump-cut playback
│               ├── timeline.js     ← render tracks, drag, zoom
│               ├── cuts.js         ← cut/restore/undo/redo/reset (pure functions)
│               ├── inspector.js    ← tabs + form binding
│               └── product-code.js
├── package.json
├── tsconfig.json
├── run.bat
└── README.md
```

### Bootstrap commands (PowerShell — Phase 0)

```powershell
$src = "D:\OneDrive\BW_OS\_Tools\BW Production\BW100_Studio"
$dst = "D:\OneDrive\BW_OS\_Tools\BWCut"
robocopy "$src\bin"        "$dst\bin"        /E
robocopy "$src\fonts"      "$dst\fonts"      /E
robocopy "$src\src\engine" "$dst\src\engine" /E
robocopy "$src\src\public\fonts" "$dst\src\public\fonts" /E
Copy-Item "$src\src\server.ts","$src\package.json","$src\package-lock.json","$src\tsconfig.json","$src\run.bat","$src\.env" "$dst\" -Force
Move-Item "$dst\server.ts" "$dst\src\server.ts" -Force
New-Item -ItemType Directory -Force "$dst\temp","$dst\src\public\css","$dst\src\public\js\ui","$dst\src\public\js\views","$dst\src\public\js\editor","$dst\src\public\vendor" | Out-Null
Copy-Item "$dst\design\tokens.css" "$dst\src\public\css\tokens.css"
cd $dst; npm install
```

> ⚠️ **ห้าม copy**: `temp/`, `dist/`, `node_modules/`, `bw100_deploy.tar.gz`, `rendered/`
> ⚠️ ตรวจว่า `MIME_TYPES` ใน `server.ts` มี `.js → application/javascript`, `.woff2 → font/woff2`, `.svg → image/svg+xml` — ถ้าไม่มีให้เพิ่ม (นี่คือการแก้ backend ที่อนุญาตเพิ่มเติม ข้อเดียว)

---

## 5. Design System

> ค่าทั้งหมดอยู่ใน [`tokens.css`](../design/tokens.css) — ส่วนนี้อธิบาย **การใช้งาน**

### 5.1 Color usage

| Token | ใช้กับ |
|---|---|
| `--c-bg` (#f8f9fa) | พื้นหลังแอป, พื้นหลังหน้าคลังคลิป |
| `--c-surface` (#fff) | Topbar, Rail, การ์ด, Filmstrip, Inspector, Timeline, Dialog |
| `--c-surface-dim` (#f1f3f4) | ช่องค้นหา folder, KPI box, log box, track bg |
| `--c-surface-stage` (#e8eaed) | พื้นหลังรอบวิดีโอ (Stage) |
| `--c-outline` (#dadce0) | เส้นขอบ input / chip / outlined button |
| `--c-outline-variant` (#e8eaed) | เส้นแบ่ง panel / divider |
| `--c-primary-container` (#e8f0fe) | Selected state (chip, rail, film item, tab bg, contextual bar) |

### 5.2 Status mapping (ใช้เหมือนกันทุกหน้า)

| `clip.status` (หรือ effective) | Label ไทย | Dot token | Icon (ถ้าต้องใช้) |
|---|---|---|---|
| `unprocessed` | ยังไม่ตัด | `--st-unprocessed` เทา | `radio_button_unchecked` |
| `analyzing` | กำลังวิเคราะห์ | `--st-analyzing` น้ำเงิน (+ pulse animation) | `progress_activity` |
| `ready` | รอตรวจ | `--st-ready` เหลือง | `pending` |
| `approved` *(clip.approved && ไม่ใช่ rendering/completed)* | ผ่าน QC | `--st-approved` เขียว | `check_circle` |
| `rendering` | กำลังเรนเดอร์ | `--st-rendering` น้ำเงิน (+ pulse) | `movie` |
| `completed` | เรนเดอร์แล้ว | `--st-completed` น้ำเงินเข้ม | `task_alt` |
| `error` | ผิดพลาด | `--st-error` แดง | `error` |

Queue status: `pending`=รอคิว (เทา), `rendering`=กำลังเรนเดอร์ (น้ำเงิน), `completed`=สำเร็จ (เขียว), `failed`=ล้มเหลว (แดง), `cancelled`=ยกเลิก (เทา)

Component: `<span class="status" data-s="ready">รอตรวจ</span>` (จุดสี 8px + label) — ดู mockup

### 5.3 Typography

- UI font: `--font-ui` → **Google Sans** (ละติน) + **Kanit** (ไทย fallback อัตโนมัติ)
- ตัวเลขเวลา / รหัสสินค้า / ความเร็ว: `--font-mono` (**Roboto Mono**) — เพื่อไม่ให้ตัวเลขกระโดดขณะเล่น
- Scale ที่ใช้ได้ **เท่านั้น**: `--t-display`, `--t-title-l/m/s`, `--t-body-l/m/s`, `--t-label-l/m/s`, `--t-mono-m/s`
- Google Fonts URL:
  ```
  https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Kanit:wght@300;400;500&family=Roboto+Mono:wght@500&display=swap
  ```
- ฟอนต์ preview overlay (23 ฟอนต์ไทย) โหลดจาก `/fonts/*.ttf` ผ่าน `render-fonts.css` + `ensureFontLoaded()` (port จาก app.js L517–575)

### 5.4 Icons

- **Material Symbols Rounded** — weight 400, FILL 0 (FILL 1 เมื่อ active เช่น rail item ที่เลือก, ปุ่ม play)
- ขนาด: 20px default, 18px ในปุ่ม/ปุ่มเล็ก, 24px ใน FAB
- ⚠️ **Self-host** ไฟล์ woff2 ใน `src/public/vendor/` + `@font-face` ใน `base.css` (เพราะระบบตัดเสียงเงียบทำงานออฟไลน์ได้ — ไอคอนต้องไม่หายเมื่อไม่มีเน็ต). Fallback: ลิงก์ Google Fonts CDN
- Icon dictionary (ใช้ตามนี้เท่านั้น):

| ความหมาย | Icon |
|---|---|
| คลังคลิป | `video_library` |
| ตัดต่อ / ตัดทิ้ง | `content_cut` |
| เรนเดอร์ | `movie` |
| สแกน | `refresh` |
| โฟลเดอร์ | `folder` / `folder_open` |
| ตั้งค่า | `settings` |
| คู่มือ | `help` |
| AI | `auto_awesome` |
| ตัดเสียงเงียบ / เสียง | `graphic_eq` |
| คิดพาดหัวใหม่ | `edit_note` |
| ผ่าน QC | `check_circle` / `check` |
| Undo / Redo | `undo` / `redo` |
| Mark In / Out | `first_page` / `last_page` |
| คืนเสียง | `undo` (บนปุ่ม tonal เขียว) |
| คืนค่าเดิมทั้งหมด | `restart_alt` |
| ซูม | `zoom_in` / `zoom_out` / `fit_screen` |
| พาดหัว track | `title` |
| ตำแหน่งปัจจุบัน | `my_location` |
| วันนี้ | `today` |
| เลือกทั้งหมด | `select_all` |
| ปิด/ยกเลิก | `close` |
| บันทึกแล้ว | `cloud_done` |
| หยุดเรนเดอร์ | `stop_circle` |
| ล้างแคช | `cleaning_services` |

### 5.5 Buttons (มี 6 แบบเท่านั้น)

| Variant | Class | ใช้เมื่อ |
|---|---|---|
| Filled | `.btn.btn-filled` | Primary action — **1 ปุ่ม/หน้าจอ** |
| Tonal | `.btn.btn-tonal` | Secondary สำคัญ (วันนี้, คำนวณใหม่) |
| Outlined | `.btn.btn-outlined` | Secondary ทั่วไป (เรนเดอร์ทันที, หยุด) |
| Text | `.btn.btn-text` | Tertiary (AI คิดใหม่, action ใน contextual bar) |
| Danger tonal | `.btn.btn-danger-tonal` | ตัดทิ้ง |
| Success tonal | `.btn.btn-success-tonal` | คืนเสียง |

- ขนาด: default 40px, `.btn-sm` 32px · รูปทรง pill (`--r-full`) · มีไอคอน → เพิ่ม `.has-icon`
- `.icon-btn` 40px / `.icon-btn.sm` 32px วงกลม, hover = `--c-state-hover`
- **ทุกปุ่มที่มีคีย์ลัด ต้องมี `title="ชื่อ (คีย์)"`**

### 5.6 Inputs
- Text field: สูง 40px, `--r-sm`, border `--c-outline`, focus = border primary + ring 3px `--c-focus-ring`
- รหัสสินค้า: `.input.mono` (uppercase, letter-spacing 1px)
- Time field: `.time-in` (label ซ้าย, ค่า mono ชิดขวา, ปุ่ม `my_location` ท้าย)
- Number stepper: `.stepper` (− ค่า +) สำหรับขนาดฟอนต์
- Slider: native range ที่ style ใหม่ (track 4px, thumb 20px) + ต้อง set CSS var `--p` เป็น % เพื่อเติมสี
- Switch: M3 style 52×32 (`.switch`)
- Segmented button: `.segmented` (Beauty filter, AI provider)
- Select ยาว (ฟอนต์): ใช้ **Font list** (`.font-list`) แสดง preview "ป้ายยาของดี" ด้วยฟอนต์นั้นจริง แทน `<select>`; ใน Settings ใช้ component เดียวกัน

### 5.7 Cards
- การ์ดคลิป: radius 12, border `--c-outline-variant`, hover → `--e-2` + border transparent
- Selected: `outline 2px --c-primary` + checkbox วงกลมน้ำเงิน

### 5.8 Elevation
- Topbar/Rail/Panels: **ไม่มีเงา** ใช้เส้นขอบ 1px
- การ์ด hover: `--e-2` · FAB/Snackbar: `--e-3` · Dialog: `--e-4`

### 5.9 Motion
- Hover/focus: `--dur-fast` · เปลี่ยน view, เปิด panel: `--dur-base` + `--ease-standard` · Dialog: `--dur-slow` + `--ease-emphasized`
- ห้ามใช้ bounce/scale ใหญ่ ๆ

### 5.10 Feedback components (แทน alert/confirm)

```js
// ui/snackbar.js
showSnackbar(message, { action?: {label, onClick}, duration = 4000, tone?: 'default'|'error' })
// ui/dialog.js
await confirmDialog({ title, body, confirmLabel = 'ยืนยัน', danger = false }) // → boolean
```
- Snackbar: กลางล่าง, `--g-grey-800`, ข้อความขาว, คิวทีละอัน
- ใช้ confirmDialog เฉพาะ: ยกเลิกเรนเดอร์ทั้งหมด, คืนค่ารอยตัดเดิม, ล้างแคช/รีเซ็ตรายการ

---

## 6. App Shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [▦ BWCut]   ( 📁 D:/…/videos                         [⟳ สแกน] )   [▶ เรนเดอร์ 5/12 ▬▬]  ?  📂  ⚙ │ 56px Topbar
├──────┬───────────────────────────────────────────────────────────────────────┤
│  ▣   │                                                                       │
│ คลัง │                                                                       │
│      │                       ACTIVE VIEW                                     │
│  ✂   │        (library | editor | export)                                    │
│ตัดต่อ│                                                                       │
│      │                                                                       │
│  🎬  │                                                                       │
│เรนเดอร์│                                                                     │
└──────┴───────────────────────────────────────────────────────────────────────┘
 80px Nav Rail
```

### 6.1 Top App Bar (56px, `--c-surface`, border-bottom)
| ส่วน | รายละเอียด |
|---|---|
| Logo | กล่อง 28px มี 4 สี่เหลี่ยมเล็กสี Blue/Red/Yellow/Green (2×2) + ข้อความ "**BW**Cut" (Google Sans 20px, "BW" สี `--c-text`, "Cut" สี `--c-text-2`) |
| Folder bar | Pill สูง 44px พื้น `--c-surface-dim` (focus → ขาว + `--e-1`), ไอคอน `folder`, input path, ปุ่ม Filled sm "สแกน" (`refresh`) · Enter = สแกน · จำค่าใน `localStorage['bwcut_last_folder']` (fallback อ่าน `bw100_last_folder` ครั้งแรก) |
| Render pill | แสดง **เฉพาะเมื่อ** `isRendering` หรือมีคิว pending: "เรนเดอร์ X/Y" + mini progress 64px · คลิก → ไปหน้าเรนเดอร์ |
| Icon buttons | `help` → เปิด `/manual.html` แท็บใหม่ · `folder_open` → POST `/api/open-output` · `settings` → เปิด Settings dialog |

### 6.2 Navigation Rail (80px)
| Item | Icon | Label | Badge |
|---|---|---|---|
| Library | `video_library` | คลังคลิป | — (จำนวนรวมแสดงใน toolbar แทน) |
| Editor | `content_cut` | ตัดต่อ | — |
| Export | `movie` | เรนเดอร์ | จำนวน approved ที่ยังไม่ render (แดง) ถ้า > 0 |

- Active: pill 56×32 พื้น `--c-primary-container`, icon FILL 1
- ถ้ายังไม่มีคลิปที่เปิด → คลิก "ตัดต่อ" จะเปิดคลิปแรก (index 0) หรือแสดง empty state ถ้าไม่มีคลิป
- Router: hash-based `#/library`, `#/editor/:index`, `#/export` (กด Back ของเบราว์เซอร์ได้)

### 6.3 Responsive
| ความกว้าง | พฤติกรรม |
|---|---|
| ≥ 1440px | เลย์เอาต์เต็มตาม mockup |
| 1200–1439 | Filmstrip ย่อเหลือ 88px (เฉพาะ thumbnail + เลข) |
| 1024–1199 | Filmstrip ซ่อน (toggle ด้วยปุ่ม `view_sidebar` ใน stage head), Inspector 340px |
| < 1024 (iPad portrait) | Inspector กลายเป็น bottom sheet; Rail อยู่ซ้ายเหมือนเดิม |

---

## 7. Screen Specifications

### 7.1 คลังคลิป (Library) — `#/library`

```
┌───────────────────────────────────────────────────────────────────────────┐
│ คลังคลิป  [ทั้งหมด 48][ยังไม่ตัด 12][รอตรวจ 21][ผ่านแล้ว 9][เรนเดอร์แล้ว 5][ผิดพลาด 1]   (🔍 ค้นหา)  [☑] │ ← Toolbar
├───────────────────────────────────────────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                          │
│ │9:16│ │    │ │    │ │    │ │    │ │    │ │    │   grid auto-fill 176px   │
│ │    │ │    │ │    │ │    │ │    │ │    │ │    │   gap 20px                │
│ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘                          │
│ name   …                                                                  │
│ ● รอตรวจ   −32%                                          [🎬 เรนเดอร์ 9 คลิปที่ผ่าน QC] ← FAB │
└───────────────────────────────────────────────────────────────────────────┘
```

**Toolbar (ไม่มีคลิปถูกเลือก)**
- Title "คลังคลิป" (`--t-title-l`)
- Filter chips (single-select): ทั้งหมด / ยังไม่ตัด / รอตรวจ / ผ่านแล้ว / เรนเดอร์แล้ว / ผิดพลาด — แต่ละอันแสดงจำนวน (ใช้ effective status ตาม §5.2) · ซ่อน chip ที่จำนวน = 0 ยกเว้น "ทั้งหมด"
- Search (240px): filter ตาม `clip.name` หรือ `clip.productCode` (case-insensitive, debounce 150ms)
- Icon button `select_all` → เลือกทุกคลิปที่ **มองเห็นอยู่** (ตาม filter)

**Contextual Action Bar (มี ≥ 1 คลิปถูกเลือก)** — แทนที่ toolbar, พื้น `--c-primary-container`, radius 16, สูง 56
| ปุ่ม | Icon | การทำงาน (port จาก) |
|---|---|---|
| ✕ | `close` | ยกเลิกเลือกทั้งหมด (`btnDeselectAll`) · คีย์ `Esc` |
| "เลือก N คลิป" | — | ข้อความ |
| ตัดเสียงเงียบ | `graphic_eq` | `btnBatchSilence` → `/api/batch-analyze` mode `silence-only` (app.js L1882–1914) |
| AI ตัดเสียง + พาดหัว | `auto_awesome` | `btnBatchAnalyze` → mode `full`, `forceReheadline:true` (L1917–1959) · ถ้าไม่มี API key → snackbar พร้อม action "ไปตั้งค่า" |
| คิดพาดหัวใหม่ | `edit_note` | `btnBatchReheadline` → mode `headline-only` (L1962–2002) |
| ผ่าน QC | `check_circle` | **เปลี่ยนพฤติกรรมเล็กน้อย**: approve เฉพาะคลิปที่เลือก (เดิม `btnApproveAll` approve ทุกคลิป L1868) · ถ้าต้องการทุกคลิป → กด `select_all` ก่อน |
| เลือกทั้งหมด | `select_all` | `btnSelectAll` |

> ⚠️ **Selection semantics ต้องเหมือนเดิม**: batch ใช้ `clips.filter(c => c.selected || c.approved)` (L1886) และ `isSelected = clip.selected !== false && (clip.selected === true || clip.approved)` (L349) — คงไว้

**Clip card**
- Media 9:16: thumbnail (`clip.thumbnailUrl`, lazy) · fallback พื้น `--g-grey-800` + ไอคอน `movie` สีเทา
- Overlay พาดหัวย่อ (ถ้ามี headline): บรรทัด 1 สีตาม `topHeadlineColor`/default, บรรทัด 2 สีตาม `bottomHeadlineColor` ฟอนต์ Prompt Bold 13px text-shadow ดำ — **ไม่แสดง CTA ในการ์ด** (ลดความรก)
- Checkbox วงกลม 24px มุมซ้ายบน: ซ่อน → แสดงเมื่อ hover หรือเมื่ออยู่ในโหมดเลือก
- Duration pill มุมขวาล่าง (mono)
- Analyzing → แสดง linear progress indeterminate 3px ที่ขอบล่างของ media
- Body: ชื่อไฟล์ (1 บรรทัด ellipsis, `title` = ชื่อเต็ม) · tag รหัสสินค้า (ถ้ามี) · แถว status + `−XX%` (percentTrimmed)
- **คลิกการ์ด** → `#/editor/:index` · **คลิก checkbox** → toggle `clip.selected` (stopPropagation) · **Shift+คลิก checkbox** → เลือกเป็นช่วง (ใหม่)
- Error → แถบแดงบาง + tooltip `clip.error`

**FAB** (Extended, มุมขวาล่าง 24px): "เรนเดอร์ N คลิปที่ผ่าน QC" — N = `approved && status ∉ {completed, rendering}` · ซ่อนเมื่อ N = 0 · การทำงาน = `btnRenderApproved` (L2005–2051) แล้วไป `#/export`

**Empty state** (ไม่มีคลิป): ไอคอน `video_library` 64px สี `--g-grey-400`, หัวข้อ "ยังไม่มีคลิป", คำอธิบาย "วางที่อยู่โฟลเดอร์ด้านบน แล้วกด สแกน", ปุ่ม Tonal "สแกนโฟลเดอร์" (focus ช่อง path)

**Performance:** render การ์ดครั้งแรกทั้งหมด, หลังจากนั้น `updateCard(clipId)` แทนที่เฉพาะ node นั้น (`Map<clipId, HTMLElement>`) — ห้าม `innerHTML = ""` ทั้งกริดเมื่อได้ SSE `clip-update`

---

### 7.2 ตัดต่อ (Editor / QC) — `#/editor/:index`

```
┌──────────┬──────────────────────────────────────┬────────────────────┐
│ คลิป 12/48│ IMG_4821.mp4  [CN4A-101401] ●รอตรวจ ☁บันทึกแล้ว│ ตั้งค่าคลิป  ‹ 12/48 › │
│ ▸1 ▯ name│                                      ├────────────────────┤
│  2 ▯ name│            ┌─────────┐               │ ข้อความ│สไตล์│เอฟเฟกต์│เสียง│
│ ■12 ▯ name│           │  VIDEO  │               ├────────────────────┤
│  13 ▯ …  │            │  9:16   │               │                    │
│          │            └─────────┘               │   (tab content)    │
│          │ 0:12.4/0:24.1  ⏮ ⏪ ( ▶ ) ⏩ ⏭  [✓ข้ามช่วงเงียบ]│                    │
├──────────┴──────────────────────────────────────┤                    │
│ ↶ ↷ │ [In 0:06.2][Out 0:08.9] [✂ตัดทิ้ง][↶คืนเสียง] ✕   ●พูด 24.1s ●ตัด 13.9s −37%  🔍━━○━━ ⛶ ⋮ │
│ ────┼─────────────────────────────────────────────── ruler ──────── │                    │
│ T พาดหัว│ [██████ yellow ██████]                              │ [เรนเดอร์][✓ผ่าน QC·ถัดไป ⏎]│
│ ≋ เสียง │ ▓▓▓░░▓▓▓▓░▓▓▓▓▓░░[sel]░▓▓▓▓│▓▓ (green kept / red hatched)│                    │
└─────────────────────────────────────────────────┴────────────────────┘
```

CSS Grid:
```css
grid-template-columns: var(--filmstrip-w) 1fr var(--inspector-w);
grid-template-rows: 1fr var(--timeline-h);
grid-template-areas: "film stage insp" "tl tl insp";
```

#### 7.2.1 Filmstrip (248px)
- Header: "คลิป" + `currentIndex+1 / total` + icon btn `filter_list` (เมนู: ทั้งหมด / เฉพาะยังไม่ผ่าน QC)
- Item: เลขลำดับ (mono) · thumb 36×64 radius 6 · ชื่อ (ellipsis) · status dot+label
- Active: พื้น `--c-primary-container` · auto `scrollIntoView({block:'nearest'})` เมื่อเปลี่ยนคลิป
- คลิก → `saveCurrentQcChanges()` แล้ว `loadClipIntoQc(i)` (เหมือน `openQcTab` L407)
- ใช้ keyed update เหมือน Library

#### 7.2.2 Stage (กลาง, พื้น `--c-surface-stage`)
- **Head**: ชื่อไฟล์ (`--t-title-m`), tag รหัสสินค้า, status, ขวาสุด "บันทึกแล้ว" (`cloud_done`) — แสดงเมื่อ save สำเร็จ, fade หลัง 1.2s (แทน `qcSavedBadge`); ขณะกำลัง save แสดง `cloud_sync` "กำลังบันทึก…"
- **Video frame**: สูง 100% ของพื้นที่ (max 560px), aspect ตาม `videoWidth/videoHeight` (default 9:16), radius 12, `--e-2`, พื้นดำ
  - `<video playsinline>` src = `/api/stream?path=<encoded clip.path>`
  - Overlay พาดหัว + CTA: **คงสูตรคำนวณเดิมทุกตัว** (app.js L613–672):
    - Line1 `top: 15.75%` · Line2 `top: 15.75% + (lineSpacing/1920*100)%`
    - font-size = `max(8, round(pt × 5.3 × previewWidth/1080))` px · CTA = `max(12, round(30 × 5.3 × previewWidth/1080))`
    - สีจาก per-clip → settings → default `#FFE600` / `#FFFFFF`
    - font `none` → ซ่อนทั้งหมด · CTA ซ่อนถ้า `enableCta === false`
    - ระหว่างเล่น: opacity พาดหัว = 1 ถ้า `hStart ≤ t ≤ hEnd` ไม่งั้น 0; CTA = 1 ถ้า `t ≥ dur − 2` · ขณะ pause: พาดหัว 1/0.5 (L1369–1382)
    - text-shadow ดำ 3 ชั้น (เหมือน render จริง)
  - **Jump toast** (แทน `qcJumpBadge`): pill ดำโปร่ง 85% กลางบนของวิดีโอ, ไอคอน `bolt` + ข้อความ, หายใน 900ms
- **Transport bar**:
  - ซ้าย: เวลา `ปัจจุบัน / ความยาวที่เก็บ(kept)` mono (เช่น `0:12.4 / 0:24.1`)
  - กลาง: `skip_previous` (คลิปก่อน `[`) · `replay_5` (−2s, `J`) · **Play 48px วงกลมน้ำเงิน** (`Space`) · `forward_5` (+2s, `L`) · `skip_next` (คลิปถัดไป `]`)
  - ขวา: Filter chip "ข้ามช่วงเงียบ" (selected = เปิด, default เปิด) = `qcJumpCutToggle`
  - Jump-cut playback logic: port `toggleQcPlay` + `timeupdate` handler (L1345–1451) **ทั้งหมด** — แนะนำเปลี่ยนจาก `timeupdate` (~4Hz) เป็น `requestAnimationFrame` loop ขณะเล่น เพื่อข้ามช่วงเงียบได้แม่นขึ้น (ทำใน Phase 5)

#### 7.2.3 Timeline Dock (สูง 232px, เต็มความกว้าง film+stage)

**Toolbar (52px)** เรียงซ้าย→ขวา:
| Control | Spec | Port จาก |
|---|---|---|
| Undo / Redo | `.icon-btn.sm` disabled เมื่อไม่มี history; tooltip แสดงจำนวนขั้น | `undoCut/redoCut` L871–917 |
| divider | | |
| **In** | `.mark-btn` "In `0:06.2`" — คลิก = set markIn ที่ playhead; active state เมื่อมีค่า; **ดับเบิลคลิก** = เปิด popover ให้พิมพ์ค่าวินาที (แทน `qcInputMarkIn`) | `setMarkIn` L834 |
| **Out** | เหมือน In | `setMarkOut` L840 |
| ตัดทิ้ง | `.btn-danger-tonal.btn-sm` `content_cut` — disabled ถ้าช่วง < 0.05s | `cutMarkedSegment` L919 |
| คืนเสียง | `.btn-success-tonal.btn-sm` | `restoreMarkedSegment` L1001–1076 |
| ✕ | ล้าง In/Out | `clearMarkInOut` L846 |
| Stats (ดันขวา) | "● พูด 24.1s" · "● ตัดออก 13.9s" · pill เขียว "−37%" | `renderQcTimeline` L703–711 |
| Zoom | `zoom_out` · slider (1–16, snap ZOOM_STEPS `[1,1.5,2,3,4,6,8,12,16]`) · `zoom_in` | `setTimelineZoom` L1262–1300 |
| Fit | `fit_screen` → zoom 1 scroll 0 | `btnZoomReset` |
| More `more_vert` | เมนู: "คืนค่ารอยตัดเดิมทั้งหมด" (→ confirmDialog) | `resetSilenceCuts` L1078 |

**Track area**: คอลัมน์ label 88px (sticky) + scroll area (`overflow-x:auto`, track width = `zoom × 100%`)
| Row | สูง | เนื้อหา |
|---|---|---|
| Ruler | 24px | tick ทุก 1s (ซูมมาก → 0.5s), label เวลา mono ทุก N วินาที ตามความกว้าง (ห่าง ≥ 64px) |
| พาดหัว | 36px | แถบ `--tl-headline-bg` ขอบ `--tl-headline` 1.5px radius 6 ตั้งแต่ `headlineStartSec` ถึง `headlineEndSec`; ข้างในแสดงข้อความ line1 + ช่วงเวลา · **มี handle 2 ข้าง ลากเพื่อปรับ start/end** (snap 0.1s) · ลากตรงกลาง = เลื่อนทั้งแถบ |
| เสียง | ที่เหลือ (~120px) | พื้น `--tl-removed` + ลายเส้นทแยง (ช่วงที่ถูกตัด) · waveform PNG `/api/waveform/:id.png` เป็น background (opacity 0.35, `background-size: 100% 100%`) · ทับด้วย segment สีเขียว `--tl-kept` ตาม `silence.audibleParts` radius 4 · tooltip แต่ละ segment "พูด 3.2s–5.8s (2.6s)" |

**Overlay บน track**
- Playhead: เส้น 2px `--tl-playhead` สูงทุก row + หัวรูป pentagon 14px ที่ ruler · **ลากหัว playhead = scrub**
- Selection range (In/Out): พื้น `--tl-selection` ขอบซ้ายขวา 2px น้ำเงิน + label ลอยด้านบน "2.7s" · ลากขอบเพื่อปรับ

**Mouse interactions (ใหม่ — หัวใจของ "ตัดต่อง่ายขึ้น")**
| การกระทำ | ผล |
|---|---|
| คลิก ruler หรือ track (ไม่ลาก) | seek ไปตำแหน่งนั้น (เดิม L1322) |
| **ลาก (drag) บน track เสียง** ≥ 4px | สร้างช่วงเลือก → set `markIn`/`markOut` อัตโนมัติ แล้วกด `X` ตัด / `R` คืน ได้ทันที |
| ลากขอบ selection | ปรับ In/Out |
| ลากหัว playhead | scrub วิดีโอ (pause ระหว่างลาก) |
| ลาก handle แถบพาดหัว | ปรับ `headlineStartSec`/`headlineEndSec` → sync ช่องใน Inspector + save (debounce 300ms) |
| Ctrl + Wheel | zoom (anchor = ตำแหน่งเมาส์) |
| Wheel ปกติ (ขณะ zoom > 1) | เลื่อนแนวนอน |
| ดับเบิลคลิก segment เขียว | เลือกช่วงของ segment นั้นทั้งก้อน (In/Out = start/end ของ segment) |

- ใช้ Pointer Events (`pointerdown/move/up` + `setPointerCapture`) → รองรับ iPad touch
- แปลงพิกัด: `t = clamp((clientX − trackRect.left) / trackRect.width, 0, 1) × duration`
- Auto-scroll ตาม playhead ขณะเล่นเมื่อ zoom > 1 (port L1396–1408)

#### 7.2.4 Inspector (380px, เต็มความสูง)

**Head**: "ตั้งค่าคลิป" + ตัวนำทาง `‹ 12/48 ›` (= `btnQcPrev/btnQcNext`, ปุ่มเดียวกับ transport แต่สำหรับคนใช้เมาส์ฝั่งขวา)

**Tabs** (M3 secondary tabs, indicator 3px น้ำเงิน): จำแท็บล่าสุดใน `localStorage['bwcut_inspector_tab']`

**แท็บ 1 — ข้อความ** (default)
| Section | Controls | Binding |
|---|---|---|
| รหัสสินค้า | `.input.mono` maxlength 11 placeholder `XXYY-MMDD##` + Tonal "วันนี้" (`today`) | `clip.productCode` · auto uppercase · **Enter = กดปุ่มวันนี้** · logic auto-date + running seq + สืบ prefix จากคลิปก่อนหน้า: port L1477–1556 ทั้งหมด |
| (helper) | ✓ ถูกต้อง (เขียว) → แสดงชื่อไฟล์ผลลัพธ์ตัวอย่าง `CODE_basename.mp4` / ⚠ ยังไม่ครบ (เหลือง) / ว่าง (เทา) | regex `^[A-Z0-9]{4}-\d{6}$` (L1462) |
| พาดหัว | หัว section + Text btn "AI คิดใหม่" (`auto_awesome`) · บรรทัดบน: input + emoji input 52px · บรรทัดล่าง: input + emoji | `headline.line1/emoji1/line2/emoji2` · AI → `/api/generate-headline` (L1641–1682) · ระหว่างรอ: ปุ่มแสดง spinner + "กำลังคิด…" |
| (helper) | "กด Enter ในช่องพาดหัว = ผ่าน QC แล้วไปคลิปถัดไป" | L2342–2347 |
| ช่วงเวลาแสดงพาดหัว | หัว section + chip "ตลอดคลิป" · 2 `.time-in` (เริ่ม / จบ) แต่ละช่องมีปุ่ม `my_location` = ใช้เวลาปัจจุบัน | `headlineStartSec/EndSec` · default start 0, end `min(dur,10)` · port L1142–1213 · sync สองทางกับแถบเหลืองในไทม์ไลน์ |

**แท็บ 2 — สไตล์**
| Section | Controls | Binding |
|---|---|---|
| ฟอนต์ | `.font-list` (สูงสูงสุด 240px scroll) — แถวแรก "ไม่ใส่ข้อความ" (value `none`) + 23 ฟอนต์ แต่ละแถวแสดง "ป้ายยาของดี" ด้วยฟอนต์จริง + ชื่อไทย/อังกฤษ | `clip.fontFamily` default `settings.defaultFont` → `Prompt-Bold` |
| ขนาด | 2 steppers: บน (pt, 8–60) · ล่าง (pt, 8–60) · slider ระยะห่างบรรทัด (20–200 step 2, px) แสดงค่าใน label | `topFontSize`, `bottomFontSize`, `lineSpacing` |
| ชุดสี | Grid 5×2 swatch (10 ชุดจาก `TIKTOK_VIRAL_COLOR_PAIRS`) — คลิก = set ทั้งบนและล่าง · ด้านล่าง 2 color picker (บน / ล่าง) แสดง hex mono | `topHeadlineColor`, `bottomHeadlineColor` |

ทุกการเปลี่ยน → `updateQcOverlay()` ทันที + save (debounce 300ms สำหรับ input ต่อเนื่อง)

**แท็บ 3 — เอฟเฟกต์**
| Row (list-row + switch) | คำอธิบายรอง | Binding |
|---|---|---|
| ป้ายตะกร้า CTA | แสดง 2 วินาทีสุดท้ายของคลิป | `enableCta` (default `true`) |
| สุ่มซูมมุมกล้อง | สลับระยะกล้องตามรอยตัด | `randomZoom` (default `settings.randomZoom ?? true`) |
| สมูทซูมช่วงเปิดคลิป | Push-in ดึงสายตา (Hook) | `enableHookZoom` · เมื่อเปิด → แสดง 2 time-in: นาน (1–15 วิ step 0.5, default 4.0) · ซูม (105–200% step 5, default 120) → `hookZoomDurationSec`, `hookZoomScalePercent` · เมื่อปิด → ซ่อน (ไม่ใช่ disable) |
| **Beauty Filter** (section) | Segmented 4 ปุ่ม: ปิด / ธรรมชาติ / เนียน / ผ่อง | `beautyLevel`: `none/natural/smooth/glow` |

**แท็บ 4 — เสียง**
| Section | Controls | Binding |
|---|---|---|
| ความไวตัดเสียงเงียบ | ค่า mono สีน้ำเงิน "−20 dB" · slider −35…−10 step 1 · helper ซ้าย "ตัดน้อย" ขวา "ตัดเยอะ" · Tonal "คำนวณรอยตัดใหม่" (`refresh`) | `/api/analyze-silence` `{clipId, thresholdDb}` (L1606–1638) · ระหว่างรอ: spinner + disabled |
| รอยตัดด้วยมือ | Outlined "คืนค่ารอยตัดเดิมทั้งหมด" (`restart_alt`) → confirmDialog · helper "ย้อนกลับได้สูงสุด 50 ขั้น" | `resetSilenceCuts` |

**Sticky footer**
- Outlined "เรนเดอร์" (`movie`) = `btnQcRenderNow` (L1805–1852) → ไป `#/export`
- **Filled "ผ่าน QC · ถัดไป" + `<kbd>⏎</kbd>`** (flex:1) = `approveCurrentClipAndAdvance` (L1786–1802)
  - คลิปสุดท้าย → snackbar "ตรวจครบทุกคลิปแล้ว" + action "ไปเรนเดอร์" แล้วกลับ `#/library`
  - ถ้าคลิปนี้ approved อยู่แล้ว → label เปลี่ยนเป็น "ถัดไป" + icon `arrow_forward` (ยังกด approve ซ้ำได้)

**Empty state (Editor ไม่มีคลิป)**: ไอคอน `content_cut` + "เลือกคลิปจากคลังเพื่อเริ่มตัดต่อ" + ปุ่ม Tonal "ไปที่คลังคลิป"

---

### 7.3 เรนเดอร์ (Export) — `#/export`

คอลัมน์เดียวกลางจอ max-width 1040px, gap 20px, 3 การ์ด (`.card-panel` radius 16 border):

1. **Progress card**
   - หัวข้อ: "กำลังเรนเดอร์ X จาก Y คลิป" / "เรนเดอร์เสร็จแล้ว Y คลิป" / "ยังไม่มีคิวเรนเดอร์" (ตามสถานะ)
   - บรรทัดรอง: ชื่อคลิปที่กำลังทำ
   - ขวา: Outlined สีแดง "หยุดทั้งหมด" (`stop_circle`) → confirmDialog(danger) → `/api/cancel-render` · ซ่อนเมื่อไม่ได้เรนเดอร์
   - Linear progress 8px
   - 4 KPI box: ความคืบหน้า % · ความเร็ว (`speed`) · FPS · เหลือประมาณ (`formatTime(etaSec)`) — จาก SSE `render-progress` (L2064–2070)
2. **คิวเรนเดอร์** — แถว grid `32px 1fr 160px 120px 64px`: ลำดับ · ชื่อ · status · mini progress 4px (เขียวเมื่อเสร็จ) · speed · ปุ่ม text "เปิดโฟลเดอร์ผลลัพธ์" ที่หัวการ์ด
3. **บันทึกการทำงาน** — กล่อง `--c-surface-dim` mono 12px, สูงสุด 240px auto-scroll ล่าง · บรรทัดที่มี `✅`/`สำเร็จ` → สีเขียว, `❌`/`ข้อผิดพลาด`/`failed` → สีแดง · prefix เวลา `[HH:MM:SS]` ฝั่ง client · ปุ่ม text "ล้าง" (ล้างเฉพาะ UI เหมือนเดิม)

Empty: ไอคอน `movie` + "ยังไม่มีคิวเรนเดอร์" + ปุ่ม Tonal "ไปที่คลังคลิป"

---

### 7.4 Settings Dialog

Modal 880×680 radius 28, `--e-4`, scrim 45% · Layout: head 64px / nav ซ้าย 220px / body scroll / footer 72px (ยกเลิก + **บันทึก** Filled)

| Section (nav) | Icon | Fields → settings key |
|---|---|---|
| AI & API Keys | `key` | Gemini key (password + ปุ่ม `visibility` toggle) `geminiApiKey` · Groq key `groqApiKey` · ผู้ให้บริการหลัก segmented Groq/Gemini `preferredAi` · ลิงก์ "ขอคีย์ฟรี" (aistudio / console.groq) |
| การเรนเดอร์ | `memory` | Encoder (Auto/AMD h264_amf/NVIDIA h264_nvenc/CPU libx264) `defaultEncoder` · ความละเอียด (1080p แนะนำ/ต้นฉบับ/720p) `defaultResolution` · โฟลเดอร์ผลลัพธ์ `outputDir` |
| ค่าเริ่มต้นพาดหัว | `title` | ฟอนต์ (font-list component เดียวกับ Inspector) `defaultFont` · ขนาดบน/ล่าง `topFontSize`/`bottomFontSize` · ระยะห่าง `defaultLineSpacing` · ชุดสี + picker `topHeadlineColor`/`bottomHeadlineColor` · Beauty เริ่มต้น `defaultBeauty` · switch CTA เริ่มต้น `defaultEnableCta` |
| ซูม & ตัดท้าย | `zoom_in` | switch Random zoom `randomZoom` · ระดับซูม text `zoomLevels` (default "1.0, 1.2, 1.3, 1.4") · Max cut duration `maxCutDurationSec` · switch Hook zoom `enableHookZoom` · ระยะเวลา `hookZoomDurationSec` · ซูมสูงสุด % `hookZoomScalePercent` · ตัดท้ายคลิป วินาที `tailTrimSec` |
| พื้นที่จัดเก็บ | `cleaning_services` | คำอธิบาย · checkbox "รีเซ็ตรายการคลิปทั้งหมด (เริ่มชุดใหม่)" `clearClipsStore` · Outlined แดง "ล้างแคชชั่วคราว" → confirmDialog → `/api/clear-temp` → snackbar "ลบ N ไฟล์ · คืนพื้นที่ X MB" |

- โหลดค่า: GET `/api/settings` ตอนเปิด (L2127–2159) · บันทึก: POST payload **ครบทุก key ตาม L2173–2195** → snackbar "บันทึกการตั้งค่าแล้ว" → ปิด dialog
- `Esc` ปิด · คลิก scrim ปิด · มีการแก้ไขค้างแล้วปิด → confirmDialog "ทิ้งการแก้ไข?"

---

## 8. Copywriting Rules

1. ภาษาไทยสั้น ≤ 3–4 คำต่อปุ่ม · ไม่ใส่วงเล็บภาษาอังกฤษในปุ่ม (ใส่ใน tooltip ได้)
2. ไม่มี emoji ใน UI chrome · ไม่ใช้ "!!!" · ไม่ใช้คำโฆษณา ("ยอดเยี่ยม!", "เร็วมาก")
3. Glossary (ใช้คำนี้ให้ตรงกันทุกที่):

| แนวคิด | คำที่ใช้ |
|---|---|
| Library | คลังคลิป |
| Editor / QC | ตัดต่อ |
| Export / Render | เรนเดอร์ |
| Approve | ผ่าน QC |
| status ready | รอตรวจ |
| Silence removal | ตัดเสียงเงียบ |
| Manual cut | ตัดทิ้ง |
| Restore | คืนเสียง |
| Headline | พาดหัว |
| Product code | รหัสสินค้า |

4. Snackbar messages ตัวอย่าง: "บันทึกแล้ว" · "เริ่มตัดเสียงเงียบ 12 คลิป" · "ตัดออก 2.7 วิ" · "ยังไม่ได้ใส่ API Key" [ไปตั้งค่า] · "สแกนพบ 48 คลิป"

---

## 9. Frontend Architecture

### 9.1 State (`store.js`)

```js
export const state = {
  clips: [],            // ClipData[] (+ client-only: selected, originalSilence, undoHistory, redoHistory)
  queue: [],            // RenderQueueItem[]
  isRendering: false,
  settings: {},         // BW100Settings
  currentIndex: -1,     // editor clip index
  view: 'library',      // 'library' | 'editor' | 'export'
  libraryFilter: 'all', // 'all'|'unprocessed'|'ready'|'approved'|'completed'|'error'
  librarySearch: '',
  markIn: null, markOut: null,
  timelineZoom: 1,
  jumpCut: true,
  progress: null,       // last render-progress payload
  logs: [],             // string[] (cap 500)
};
// pub/sub แบบเบา
export function emit(event, payload) {}
export function on(event, handler) {}   // events: 'clips', 'clip:<id>', 'queue', 'progress', 'log', 'view', 'current', 'marks', 'settings'
```

- Client-only fields (`selected`, `originalSilence`, `undoHistory`, `redoHistory`) **ต้องคงอยู่** เมื่อ SSE `clip-update` มา — ใช้ merge logic ของ `updateOrAddClip` (L224–252) + เก็บ client fields เพิ่ม
- จัดการ SSE `clips-loaded` (server ส่งตอน clear-temp แต่โค้ดเดิมไม่รับ) → set `clips = data.clips`

### 9.2 API layer (`api.js`) — **Frozen contract**

| Function | Method / Path | Request body | Response |
|---|---|---|---|
| `getSystem()` | GET `/api/system` | — | `{ok, ffmpegPath, bestEncoder, currentFolderPath, settings}` |
| `scan(folderPath)` | POST `/api/scan` | `{folderPath}` | `{ok, clips, folderPath}` |
| `thumbUrl` | GET `/api/thumb/:file` | (ใช้ `clip.thumbnailUrl`) | jpeg |
| `waveformUrl(id)` | GET `/api/waveform/:id.png` | — | png 1200×64 |
| `streamUrl(path)` | GET `/api/stream?path=` | Range | mp4 |
| `analyzeSilence(clipId, thresholdDb)` | POST `/api/analyze-silence` | `{clipId, thresholdDb, minDurationSec?, paddingSec?}` | `{ok, silence}` |
| `generateHeadline(clipId)` | POST `/api/generate-headline` | `{clipId, preferredAi?}` | `{ok, headline}` |
| `updateClip(clipId, data)` | POST `/api/update-clip` | `{clipId, headline?, beautyLevel?, approved?, status?, fontFamily?, topFontSize?, bottomFontSize?, lineSpacing?, silence?, enableCta?, randomZoom?, enableHookZoom?, hookZoomDurationSec?, hookZoomScalePercent?, headlineStartSec?, headlineEndSec?, topHeadlineColor?, bottomHeadlineColor?, productCode?}` | `{ok, clip}` |
| `batchAnalyze(clipIds, mode, forceReheadline)` | POST `/api/batch-analyze` | `{clipIds, mode:'full'|'silence-only'|'headline-only', forceReheadline?}` | `{ok, count}` |
| `renderBatch(clipIds, clipOverrides)` | POST `/api/render-batch` | `{clipIds, clipOverrides:{[id]:{fontFamily, topFontSize, bottomFontSize, lineSpacing, topHeadlineColor, bottomHeadlineColor, enableCta, randomZoom, enableHookZoom, hookZoomDurationSec, hookZoomScalePercent, headlineStartSec, headlineEndSec}}}` | `{ok, queued}` |
| `cancelRender()` | POST `/api/cancel-render` | — | `{ok}` |
| `openOutput()` | POST `/api/open-output` | — | `{ok}` |
| `clearTemp(clearClipsStore)` | POST `/api/clear-temp` | `{clearClipsStore}` | `{ok, deletedCount, freedMb}` |
| `getSettings()` / `saveSettings(s)` | GET / POST `/api/settings` | settings object | settings / `{ok, settings}` |

ทุก function: `try/catch` → error แสดง snackbar tone error · คืน `null` เมื่อล้ม

### 9.3 SSE (`sse.js`)
- `new EventSource('/api/render-events')`, reconnect 3s เมื่อ error (L164–181)
- Events: `init` · `clip-update` · `queue-update` · `render-progress` · `log` · `clips-loaded`
- แต่ละ event → อัปเดต `state` แล้ว `emit()` — views subscribe เอง (ไม่เรียก render ข้าม module ตรง ๆ)

### 9.4 Constants (`constants.js`)

```js
export const FONTS = [ // value ต้องตรงกับ backend 100%
  { value: 'none', th: 'ไม่ใส่ข้อความ', file: null },
  { value: 'Prompt-Bold', th: 'พร้อมท์ หนา', file: 'Prompt-Bold.ttf', isDefault: true },
  { value: 'Mahanakhon', th: 'มหานคร', file: 'Mahanakhon.ttf' },
  { value: 'Kanit-Regular', th: 'คณิต', file: 'Kanit-Regular.ttf' },
  { value: 'Kanit-MediumItalic', th: 'คณิต ตัวเอียง', file: 'Kanit-MediumItalic.ttf' },
  { value: 'Mitr-Regular', th: 'มิตร', file: 'Mitr-Regular.ttf' },
  { value: 'Mitr-Bold', th: 'มิตร หนา', file: 'Mitr-Bold.ttf' },
  { value: 'Athiti-Regular', th: 'อธิติ', file: 'Athiti-Regular.ttf' },
  { value: 'Fahkwang-Medium', th: 'ฟ้ากว้าง', file: 'Fahkwang-Medium.ttf' },
  { value: 'Mali-Medium', th: 'มะลิ', file: 'Mali-Medium.ttf' },
  { value: 'Niramit-Medium', th: 'นิรมิต', file: 'Niramit-Medium.ttf' },
  { value: 'Pattaya-Regular', th: 'พัทยา', file: 'Pattaya-Regular.ttf' },
  { value: 'Sriracha-Regular', th: 'ศรีราชา', file: 'Sriracha-Regular.ttf' },
  { value: 'RDDaotok', th: 'ดาวตก', file: 'RDDaotok.ttf' },
  { value: 'SOV_HuaHlim', th: 'หัวแหลม', file: 'SOV_HuaHlim.ttf' },
  { value: 'SOV_MaeBaan', th: 'แม่บ้าน', file: 'SOV_MaeBaan.ttf' },
  { value: 'SOV_Prisna', th: 'ปริศนา', file: 'SOV_Prisna.ttf' },
  { value: 'SamphanCondensed', th: 'สัมพันธ์', file: 'SamphanCondensed.ttf' },
  { value: 'TorsilpDekthapud', th: 'เด็กท่าพูด', file: 'TorsilpDekthapud.ttf' },
  { value: 'TorsilpThamnganMangThoe', th: 'ทำงานมั่งเถอะ', file: 'TorsilpThamnganMangThoe.ttf' },
  { value: 'iannnnn-TIGER-Bold', th: 'เสือ หนา', file: 'iannnnn-TIGER-Bold.ttf' },
  { value: 'iannnnn-TIGER-Regular', th: 'เสือ ปกติ', file: 'iannnnn-TIGER-Regular.ttf' },
  { value: 'MN Namphrik Long Ruea Italic', th: 'น้ำพริกลงเรือ', file: 'MN Namphrik Long Ruea Italic.ttf' },
  { value: 'NotoSansThai-Bold', th: 'Noto Sans Thai หนา', file: 'NotoSansThai-Bold.ttf' },
];

export const COLOR_PRESETS = [ // = TIKTOK_VIRAL_COLOR_PAIRS ใน engine/headline.ts
  { top: '#FFE600', bottom: '#FFFFFF' }, { top: '#FFFFFF', bottom: '#FFE600' },
  { top: '#00FF66', bottom: '#FFFFFF' }, { top: '#00E5FF', bottom: '#FFFFFF' },
  { top: '#FF6B00', bottom: '#FFFFFF' }, { top: '#FF2A85', bottom: '#FFFFFF' },
  { top: '#FFE600', bottom: '#00E5FF' }, { top: '#FF3333', bottom: '#FFFFFF' },
  { top: '#2EE59D', bottom: '#FFE600' }, { top: '#C084FC', bottom: '#FFFFFF' },
];

export const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16];
export const PRODUCT_CODE_RE = /^[A-Z0-9]{4}-\d{6}$/;
export const UNDO_LIMIT = 50;
export const CTA_TAIL_SEC = 2.0;
export const OVERLAY = { line1TopPct: 15.75, pxPerPt: 5.3, refWidth: 1080, refHeight: 1920, ctaPt: 30 };
```

### 9.5 Pure logic to port **verbatim** (`editor/cuts.js`)
ย้ายเป็น pure functions (รับ `silence`, คืน `silence` ใหม่) เพื่อทดสอบง่าย:
- `cutRange(silence, start, end, totalSec)` ← `cutMarkedSegment` L919–999 (เงื่อนไข `< 0.08s` ปฏิเสธ, remnant `> 0.05s`, ปัดเศษเหมือนเดิม)
- `restoreRange(silence, start, end, totalSec)` ← `restoreMarkedSegment` L1001–1076
- `recomputeStats(silence, totalSec)` ← keptSec/removedSec/percentTrimmed
- History: `pushUndo(clip)`, `undo(clip)`, `redo(clip)`, `resetToOriginal(clip)` ← L871–917, L1078–1101

### 9.6 Save strategy
- `saveCurrentQcChanges()` (L1695–1750): อ่านค่าจาก Inspector → `clip` → `updateClip()` — **payload ครบทุก field เหมือนเดิม**
- Trigger: input ต่อเนื่อง (พิมพ์, slider, ลาก) → debounce 300ms · change/toggle/คลิก → ทันที · เปลี่ยนคลิป / เปลี่ยน view / `beforeunload` → flush ทันที
- ห้ามเรียก `renderGrid()` ทั้งกริดหลัง save → `updateCard(clip.id)` + `updateFilmItem(clip.id)` เท่านั้น

### 9.7 Keyboard map (`shortcuts.js`)

ทำงานเมื่อ view = editor และ focus **ไม่อยู่ใน** input/select/textarea (ยกเว้นระบุ)

| Key | Action | เดิม |
|---|---|---|
| `Space` | เล่น/หยุด | ✓ |
| `Enter` | ผ่าน QC · ถัดไป | ✓ |
| `Enter` *(ในช่องพาดหัว)* | blur + ผ่าน QC · ถัดไป | ✓ |
| `Enter` *(ในช่องรหัสสินค้า)* | กดปุ่ม "วันนี้" | ✓ |
| `[` / `←` | คลิปก่อนหน้า | ✓ |
| `]` / `→` | คลิปถัดไป | ✓ |
| `I` / `O` | Mark In / Out | ✓ |
| `X` / `Delete` | ตัดทิ้ง | ✓ |
| `R` | คืนเสียง | ✓ |
| `Esc` | ล้าง In/Out (editor) · ยกเลิกเลือก (library) · ปิด dialog | ✓ + ขยาย |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / Redo (ไม่ทำงานในช่องพาดหัว) | ✓ |
| `J` / `L` | ถอย / เดินหน้า 2 วินาที | 🆕 |
| `,` / `.` | ถอย / เดินหน้า 0.1 วินาที (frame nudge) | 🆕 |
| `+` / `-` | Zoom timeline | 🆕 |
| `1`–`4` | สลับแท็บ Inspector | 🆕 |
| `?` | เปิด Shortcut sheet (dialog รายการคีย์ลัด) | 🆕 |
| `Ctrl+A` *(library)* | เลือกทั้งหมด | 🆕 |

---

## 10. Feature Parity Matrix (ห้ามขาดแม้แต่แถวเดียว)

| Old ID (BW100) | ฟังก์ชัน | New location | New component |
|---|---|---|---|
| `folderInput`, `btnScan` | สแกนโฟลเดอร์ | Topbar folder bar | input + Filled sm |
| `btnOpenOutput` | เปิดโฟลเดอร์ผลลัพธ์ | Topbar icon + Export card head | icon-btn / text btn |
| `btnSettings` | ตั้งค่า | Topbar icon | icon-btn → Dialog |
| manual link | คู่มือ | Topbar `help` | icon-btn |
| `countTotal` | จำนวนคลิป | Library chip "ทั้งหมด N" | chip count |
| `countQueued` | คิวที่รอ | Render pill + Export header | pill |
| `countApproved` | รอเรนเดอร์ | Rail badge + FAB label | badge / FAB |
| tab buttons | สลับหน้า | Nav rail + hash router | rail-item |
| `btnSelectAll` / `btnDeselectAll` | เลือก/ยกเลิก | Toolbar `select_all` / Ctx bar `close` | icon-btn |
| `btnBatchSilence` | ตัดเสียงเงียบ batch | Ctx bar | text btn |
| `btnBatchAnalyze` | AI ตัดเสียง+พาดหัว | Ctx bar | text btn |
| `btnBatchReheadline` | คิดพาดหัวใหม่ batch | Ctx bar | text btn |
| `btnApproveAll` | ผ่าน QC batch | Ctx bar (เฉพาะที่เลือก) | text btn |
| `btnRenderApproved` | เรนเดอร์ที่ผ่าน QC | Library FAB | FAB |
| `clipGrid` / `emptyGrid` | กริดคลิป | Library | cards / empty state |
| `.card-checkbox` | เลือกคลิป | Card check | circle check |
| `qcVideo` | วิดีโอ | Stage | video-frame |
| `qcOverlay*` | พรีวิวพาดหัว/CTA | Stage overlay | ov-l1/l2/cta |
| `qcJumpBadge` | แจ้งข้ามช่วงเงียบ | Stage jump toast | pill |
| `btnQcPlayPause` | เล่น/หยุด | Transport | play-btn |
| `qcJumpCutToggle` | ข้ามช่วงเงียบ | Transport chip | filter chip |
| `qcTimelineTrack/Waveform/HeadlineBar/Playhead` | ไทม์ไลน์ | Timeline dock | tracks |
| `qcTimelineDuration` | เวลา | Transport time | mono |
| `btnZoomIn/Out/Reset`, `zoomLevelLabel` | ซูมไทม์ไลน์ | TL toolbar | icon-btn + slider |
| `qcKeptSec/RemovedSec/TrimPct` | สถิติ | TL toolbar stats | legend + pill |
| `qcInputMarkIn/Out`, `btnMarkIn/Out`, `txtMarkIn/Out`, `txtMarkDuration` | In/Out | TL toolbar mark-btn (+ dblclick popover) + drag select + selection label | mark-btn |
| `btnCutMarked` | ตัดทิ้ง | TL toolbar | danger tonal |
| `btnRestoreMarked` | คืนเสียง | TL toolbar | success tonal |
| `btnUndoCut` / `btnRedoCut` | undo/redo | TL toolbar | icon-btn |
| `btnClearMark` | ล้างเลือก | TL toolbar ✕ | icon-btn |
| `btnResetSilence` | คืนค่ารอยตัดเดิม | TL more menu + Inspector › เสียง | menu / outlined |
| `btnQcPrev/Next`, `qcCurrentIndexBadge` | นำทางคลิป | Transport + Inspector head + Filmstrip | icon-btn |
| `qcSavedBadge` | บันทึกแล้ว | Stage head | cloud_done |
| `qcClipName` | ชื่อคลิป | Stage head | title-m |
| `qcProductCode`, `btnAutoProductCodeDate`, `qcProductCodeStatus` | รหัสสินค้า | Inspector › ข้อความ | input mono + tonal + helper |
| `btnQcRegenAi` | AI คิดใหม่ | Inspector › ข้อความ | text btn |
| `qcLine1/2`, `qcEmoji1/2` | พาดหัว | Inspector › ข้อความ | input + emoji input |
| `qcHeadStartSec/EndSec`, `btnSetHeadStartCur/EndCur`, `btnSetHeadFull` | เวลาพาดหัว | Inspector › ข้อความ + TL headline handles | time-in + chip |
| `qcEnableCta` | CTA | Inspector › เอฟเฟกต์ | switch |
| `qcRandomZoom` | สุ่มซูม | Inspector › เอฟเฟกต์ | switch |
| `qcEnableHookZoom`, `qcHookZoomDur`, `qcHookZoomScale` | Hook zoom | Inspector › เอฟเฟกต์ | switch + time-in |
| `qcFontSelect` | ฟอนต์ | Inspector › สไตล์ | font-list |
| `qcTopFontSize/BottomFontSize` | ขนาด | Inspector › สไตล์ | stepper |
| `qcLineSpacing` | ระยะห่าง | Inspector › สไตล์ | slider |
| `qcTopColor/BottomColor` (+Code) | สี | Inspector › สไตล์ | swatches + picker |
| `qcBeauty` radios | Beauty | Inspector › เอฟเฟกต์ | segmented |
| `qcThresholdSlider/Val`, `btnQcRecut` | threshold | Inspector › เสียง | slider + tonal |
| `btnQcApprove` | ผ่าน QC → ถัดไป | Inspector footer | Filled |
| `btnQcRenderNow` | เรนเดอร์คลิปนี้ | Inspector footer | Outlined |
| `btnCancelRender` | ยกเลิกเรนเดอร์ | Export progress card | outlined red |
| `renderProgressBar/Pct/Speed/Fps/Eta` | ความคืบหน้า | Export progress card + Render pill | linear + KPI |
| `queueTableBody` | คิว | Export queue card | q-row |
| `terminalLogs`, `btnClearLogs` | log | Export log card | log box |
| `set*` (ทั้งหมด 22 field) | ตั้งค่า | Settings dialog 5 sections | ดู §7.4 |
| `btnClearTemp`, `chkClearClipsStore` | ล้างแคช | Settings › พื้นที่จัดเก็บ | outlined red + checkbox |
| `btnSaveSettings`, `btnCloseSettings` | บันทึก/ปิด | Dialog footer/head | Filled / icon-btn |

---

## 11. Implementation Phases (ทำตามลำดับ · ห้ามข้าม)

> แต่ละ Phase จบด้วย **Acceptance Criteria** — ต้องผ่านครบก่อนไป Phase ถัดไป

### Phase 0 — Bootstrap (≈ 15 นาที)
- [ ] รัน bootstrap commands §4 · แก้ port 3110 + ชื่อ BWCut ใน `server.ts`, `package.json`, `run.bat`
- [ ] ตรวจ/เพิ่ม MIME `.js`, `.woff2`, `.svg`
- [ ] ดาวน์โหลด Material Symbols Rounded woff2 → `src/public/vendor/`
- ✅ **AC:** `npm start` แล้วเปิด `http://localhost:3110` ได้ (หน้าว่างก็ได้) · `/api/system` ตอบ `ok:true`

### Phase 1 — Design system & Shell (≈ 1–2 ชม.)
- [ ] `tokens.css`, `base.css`, `components.css`, `shell.css` (คัดจาก mockup)
- [ ] `index.html`: topbar + rail + 3 view containers + dialog/snackbar roots · `<script type="module" src="/js/main.js">`
- [ ] `store.js`, `api.js`, `sse.js`, `utils.js`, `constants.js`, `ui/snackbar.js`, `ui/dialog.js`
- [ ] Hash router + rail active state
- [ ] Folder bar: โหลด path จาก localStorage/`/api/system` → auto scan (L263–305)
- ✅ **AC:** หน้าตาตรง mockup (topbar/rail) · สแกนโฟลเดอร์ได้ → snackbar "สแกนพบ N คลิป" · SSE connect และ log เข้า `state.logs`

### Phase 2 — Library (≈ 2 ชม.)
- [ ] Card render + keyed update · filter chips + count · search · selection + Shift-range
- [ ] Contextual action bar + 4 batch actions + API key guard
- [ ] FAB render approved · Empty state
- ✅ **AC:** 100 คลิปเลื่อนลื่น · SSE `clip-update` ระหว่าง batch อัปเดตเฉพาะการ์ดนั้น (ตรวจใน DevTools: ไม่ re-create node อื่น) · ทุก batch ทำงานเหมือนเดิม

### Phase 3 — Editor layout, Preview, Inspector (≈ 3 ชม.)
- [ ] Grid 3 โซน + Filmstrip · Stage head · video + `fitVideoWrapper` ใหม่ (fit ทั้งความสูงและกว้าง)
- [ ] Overlay พาดหัว/CTA + font loading (สูตร §7.2.2)
- [ ] Transport + jump-cut playback
- [ ] Inspector 4 tabs + bind ทุก field + `loadClipIntoQc` / `saveCurrentQcChanges` (debounce/flush)
- [ ] Product code logic · AI regen · Recut · Approve & next · Render now
- ✅ **AC:** พรีวิวพาดหัวตรงกับไฟล์ที่เรนเดอร์จริง (ทดสอบ 3 ฟอนต์ × 2 ขนาด) · แก้ค่าแล้วสลับคลิปไปกลับ ค่ายังอยู่ · reload หน้าแล้วค่ายังอยู่ (มาจาก server)

### Phase 4 — Timeline (≈ 3 ชม.)
- [ ] Render ruler / headline lane / audio lane (waveform + segments) / playhead
- [ ] Zoom (slider, buttons, Ctrl+wheel anchor ที่เมาส์) + auto-scroll
- [ ] Pointer interactions ทั้งหมดตาราง §7.2.3
- [ ] `cuts.js` pure functions + undo/redo/reset + toolbar states
- ✅ **AC:** ลากเลือกช่วง → `X` → segment หายตรงตำแหน่ง · `Ctrl+Z` กลับมา · ลาก handle พาดหัว → ช่องเวลาใน Inspector เปลี่ยนตาม และกลับกัน · ใช้งานบน iPad (touch) ได้

### Phase 5 — Export, Settings, Shortcuts, Polish (≈ 2 ชม.)
- [ ] Export view (progress / queue / log) + Render pill topbar + Rail badge
- [ ] Settings dialog 5 sections (โหลด/บันทึก/ล้างแคช/dirty check)
- [ ] `shortcuts.js` ครบ §9.7 + Shortcut sheet (`?`)
- [ ] Jump-cut ด้วย rAF · Responsive breakpoints §6.3 · focus-visible ring ทุก control
- ✅ **AC:** ผ่าน QA checklist §12 ทั้งหมด

### Phase 6 — Docs (optional)
- [ ] `manual.html` ใช้ tokens + โครงหน้าเดียวกัน · `README.md` ของ BWCut

---

## 12. QA Checklist (ทดสอบก่อนส่งมอบ)

**Visual**
- [ ] ไม่มี emoji ใน UI chrome (ค้นใน `index.html` + `js/` ด้วย regex `[\u{1F300}-\u{1FAFF}]` — อนุญาตเฉพาะ default emoji ของพาดหัว/CTA)
- [ ] ไม่มี `linear-gradient` ใน CSS (ยกเว้น slider fill + timeline hatched pattern)
- [ ] ไม่มีสี hex ใน `components.css`/view CSS (grep `#[0-9a-fA-F]{3,6}` ต้องเจอแค่ใน `tokens.css`)
- [ ] ไม่มี `alert(` / `confirm(` ใน `js/`
- [ ] ปุ่ม Filled มี 1 ปุ่มต่อหน้าจอ (ไม่นับใน dialog)
- [ ] เปรียบเทียบกับ `mockup.html` ข้างกัน — spacing/สี/ขนาดตรง

**Functional (ใช้โฟลเดอร์ทดสอบ ≥ 10 คลิป)**
- [ ] สแกน → thumbnail + duration โหลดทยอยมา
- [ ] Batch ตัดเสียงเงียบ (offline) → สถานะ analyzing → รอตรวจ
- [ ] Batch AI (มี key / ไม่มี key)
- [ ] คิดพาดหัวใหม่ batch
- [ ] Editor: เล่น jump-cut, ปิด jump-cut เล่นเต็ม
- [ ] I/O + X, ลากเลือก + X, R คืนเสียง, Undo/Redo 5 ขั้น, Reset
- [ ] แก้พาดหัว + Enter → ไปคลิปถัดไปและ approved
- [ ] รหัสสินค้า: พิมพ์ `CN4A` + Enter → `CN4A-MMDD01`; คลิปถัดไป (ว่าง) กด "วันนี้" → `CN4A-MMDD02`
- [ ] ฟอนต์/ขนาด/สี/ระยะห่าง เปลี่ยนแล้วพรีวิวเปลี่ยนทันที
- [ ] Threshold −28 → คำนวณใหม่ → timeline เปลี่ยน
- [ ] CTA / Random zoom / Hook zoom / Beauty → เรนเดอร์ออกมาตรงตามที่ตั้ง
- [ ] เรนเดอร์คลิปเดียว + เรนเดอร์ batch + ยกเลิกกลางทาง
- [ ] ชื่อไฟล์ผลลัพธ์มี prefix รหัสสินค้าเมื่อรหัสถูกต้อง
- [ ] Settings: บันทึกทุก field แล้วเปิดใหม่ค่าตรง · ล้างแคช (มี/ไม่มี reset รายการ)
- [ ] ปิดเบราว์เซอร์ระหว่างแก้ → เปิดใหม่ค่ายังอยู่
- [ ] เปิดจาก iPad ผ่าน Wi-Fi (`http://<LAN-IP>:3110`) → ลาก timeline ด้วยนิ้วได้

**Performance**
- [ ] 100 คลิป: เปิด library < 1s (หลัง thumbnail cache), สลับคลิปใน editor < 300ms

---

## 13. Known issues ในโค้ดเดิม (แก้ระหว่าง port)

| # | ปัญหา | ตำแหน่ง | วิธีแก้ |
|---|---|---|---|
| 1 | `updateHeadlineBar()` ใช้ตัวแปร `totalSec` ที่ไม่ได้ประกาศใน scope → ReferenceError | app.js L682–687 | คำนวณ `totalSec = clip.metadata?.durationSec \|\| clip.silence?.originalDurationSec \|\| video.duration \|\| 1` ในฟังก์ชัน |
| 2 | SSE `clips-loaded` ไม่ถูก handle | server L941 / app.js L183 | เพิ่ม case ใน `sse.js` |
| 3 | `btnApproveAll` approve ทุกคลิปโดยไม่สนการเลือก | L1868 | เปลี่ยนเป็นเฉพาะที่เลือก (§7.1) |
| 4 | Product code status ใช้สี dark theme (`#14532d`, `#78350f`) บนธีมสว่าง | L1462–1474 | ใช้ helper text + token สี success/warning |
| 5 | `renderGrid()` ถูกเรียกทุก keystroke ผ่าน `saveCurrentQcChanges` | L1748 | keyed update |
| 6 | Card แสดง productCode ด้วย inline style สีเข้ม | L375 | `.tag-code` |

---

## 14. Prompt Template สำหรับส่งให้ Gemini

คัดลอกไปใช้ทีละ Phase:

```
คุณคือ Senior Frontend Engineer กำลังสร้าง BWCut ตามแผนที่ล็อกแล้ว

อ่านไฟล์เหล่านี้ให้ครบก่อนเขียนโค้ด:
1. D:\OneDrive\BW_OS\_Tools\BWCut\docs\BWCUT_REDESIGN_PLAN.md   (สเปกหลัก)
2. D:\OneDrive\BW_OS\_Tools\BWCut\design\mockup.html            (หน้าตาที่ต้องเหมือน 1:1)
3. D:\OneDrive\BW_OS\_Tools\BWCut\design\tokens.css             (design tokens)
4. D:\OneDrive\BW_OS\_Tools\BW Production\BW100_Studio\src\public\app.js (logic เดิมที่ต้อง port)

งานรอบนี้: ทำ Phase <N> ตาม §11 เท่านั้น

กฎ:
- ทำตาม Golden Rules §0 ทุกข้อ
- ห้ามแก้ src/engine/* และห้ามเปลี่ยน API contract §9.2
- logic ที่ระบุว่า "port" ให้ย้ายพฤติกรรมเดิมแบบตรงตัว (อ้างอิงเลขบรรทัดในแผน)
- เมื่อเสร็จ ให้ตรวจ Acceptance Criteria ของ Phase นี้ทีละข้อ แล้วรายงานผลเป็นตาราง ✅/❌
- ถ้าแผนไม่ชัดเจน ให้ยึด mockup.html; ถ้ายังไม่ชัด ให้ถามก่อน ห้ามเดา
```

---

*BWCut Redesign Plan v1.0 — Designed by Claude for BW OS · ห้ามแก้ไขส่วน Design System (§5) โดยไม่ผ่านการอนุมัติจาก Bear*
