# ✂️ BWCut Studio — High-Speed AI Video Editor (100% Free & Open-Source)

> **BWCut Studio** คือโปรแกรมตัดต่อคลิปวิดีโอความเร็วสูงระดับสตูดิโอ ที่เปิดให้ใช้งาน **ฟรี 100% (Free & Open-Source)** ออกแบบมาสำหรับสายทำคลิปสั้น **TikTok, Reels, Shorts** และวิดีโอ Affiliate โดยเฉพาะ รองรับการตัดเสียงเงียบแบบ Jump Cut อัตโนมัติ, สร้างพาดหัวคลิปด้วย AI (Gemini / Groq), ปรับสีพาดหัวตามธีมหรือสุ่มสีแต่ละคลิป, ใส่เอฟเฟกต์ซูมกระตุกต่อมอยากดู (Hook Zoom), ฟิลเตอร์หน้าเนียน (Beauty Filter) และแจ้งเตือนผ่านมือถือ (ntfy) เมื่อเรนเดอร์เสร็จ

---

## ✨ จุดเด่นและฟีเจอร์หลัก (Key Features)

- ⚡ **100% Offline Silence Cut (Jump Cut)**: ตรวจจับและตัดเดดแอร์/เสียงเงียบในคลิปด้วยความเร็วสูงมาก ทำงานบนเครื่องของคุณ 100%
- 🤖 **AI Hook & Headline Generation**: ถอดเสียงพูดด้วย Groq Whisper และสร้างพาดหัวแบบสองบรรทัดที่ดึงดูดสายตาด้วย Google Gemini Flash
- 🎨 **100% Free Google Fonts**: รวมฟอนต์ภาษาไทยยอดนิยมภายใต้ลิขสิทธิ์เสรี **SIL Open Font License (OFL)** ได้แก่ **Prompt (ค่าเริ่มต้น), Kanit, Mitr, Noto Sans Thai, Fahkwang, Athiti, Mali, Niramit, Pattaya, Sriracha** ใช้เชิงพาณิชย์ได้อย่างสบายใจ ปราศจากปัญหาลิขสิทธิ์
- 🌈 **Multi-Color & Random Palette**: ปรับสีพาดหัวได้ทั้งโปรเจกต์ หรือเลือก "สุ่มสี 10 โทน" เพื่อให้แต่ละคลิปมีสีสันสะดุดตาไม่ซ้ำกัน
- ✨ **Beauty Filter (โหมดหน้าเนียน)**: ปรับผิวเนียนสว่างได้ 3 ระดับ (Natural, Smooth Plus, Glow)
- 🎚️ **Interactive Timeline & Filmstrip**: ไทม์ไลน์คลื่นเสียงแบบซูมได้อิสระ มาร์กจุดตัด In/Out (กด `I`, `O`, `X`) หรือกู้คืนรอยตัด (`R`)
- 🚀 **Hardware Acceleration (NVENC / AMF / QSV)**: ตรวจจับการ์ดจอ NVIDIA, AMD Radeon และ Intel อัตโนมัติ เรนเดอร์ไฟล์ 1080p 60fps ได้อย่างรวดเร็ว
- 🔔 **ntfy Mobile Push Notification**: แจ้งเตือนเข้ามือถือทันทีเมื่อคลิปหรือชุดคลิปเรนเดอร์เสร็จ ไม่ต้องนั่งเฝ้าหน้าจอ
- 📱 **Mobile & Tablet Connect**: รองรับการเปิดใช้งานผ่านมือถือ/iPad ในเครือข่าย Wi-Fi เดียวกัน พร้อมสแกน QR Code เข้าใช้งานได้ทันที
- 🆓 **100% Free Forever**: ไม่มีระบบล็อคเครื่อง ไม่ต้องใช้ License Key ใช้งานได้เต็มทุกฟังก์ชันแบบถาวร

---

## 🛠️ วิธีติดตั้งและเปิดใช้งาน (Installation)

### วิธีที่ 1: ติดตั้งผ่านตัวติดตั้งคลิกเดียว (แนะนำสำหรับ Windows 10 / 11)
1. ดับเบิลคลิกที่ไฟล์ `Install-BWCut.bat`
2. ระบบจะทำการตรวจสอบสเปกเครื่อง (RAM, CPU, การ์ดจอ) และติดตั้ง Node.js, Git, FFmpeg ผ่าน winget ให้โดยอัตโนมัติ
3. เมื่อติดตั้งเสร็จ จะมีไอคอนทางลัด **"BWCut Studio"** บนหน้าจอ Desktop
4. โปรแกรมจะเปิดหน้าต่างเบราว์เซอร์เข้าสู่ `http://127.0.0.1:3110` ทันที

### วิธีที่ 2: ติดตั้งผ่าน Git (สำหรับนักพัฒนา)
```bash
# โคลนโปรเจกต์
git clone https://github.com/fasterpsu/bwcut.git
cd bwcut

# ติดตั้งแพ็กเกจ
npm install

# สร้างไฟล์คอนฟิกจากตัวอย่าง
cp .env.example .env

# รันโปรแกรมในโหมดเริ่มต้น
npm start
```

---

## ⚙️ การตั้งค่า API Key (ฟรี)

1. **Google Gemini API Key** (สำหรับสร้างพาดหัวดึงดูด):
   - ขอรับฟรีได้ที่: [Google AI Studio](https://aistudio.google.com/apikey)
2. **Groq API Key** (สำหรับถอดเสียงพูดเร็วพิเศษ):
   - ขอรับฟรีได้ที่: [Groq Console](https://console.groq.com/keys)
3. นำ API Key ไปกรอกในหน้าต่าง **"⚙️ ตั้งค่า"** ภายในโปรแกรม และกดบันทึก

---

## ⌨️ คีย์ลัดแป้นพิมพ์ (Keyboard Shortcuts)

| คีย์ลัด | หน้าที่การทำงาน |
|---|---|
| <kbd>Spacebar</kbd> | เล่น / หยุดเล่นพรีวิววิดีโอ |
| <kbd>I</kbd> | มาร์กจุดเริ่มต้นช่วงที่ต้องการตัดทิ้ง (Mark In) |
| <kbd>O</kbd> | มาร์กจุดสิ้นสุดช่วงที่ต้องการตัดทิ้ง (Mark Out) |
| <kbd>X</kbd> หรือ <kbd>Delete</kbd> | ตัดช่วงที่มาร์กทิ้งทันที (Cut Out) |
| <kbd>R</kbd> | กู้คืนช่วงที่มาร์กกลับมาเป็นเสียงพูด (Restore) |
| <kbd>Enter</kbd> | อนุมัติคลิปนี้ (ผ่าน QC) และข้ามไปคลิปถัดไป |
| <kbd>[</kbd> / <kbd>]</kbd> | ย้ายไปคลิปก่อนหน้า / คลิปถัดไป |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | เลิกทำ (Undo) |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> | ทำซ้ำ (Redo) |
| <kbd>Ctrl</kbd> + เมาส์ Scroll | ซูมขยาย / ย่อไทม์ไลน์คลื่นเสียง |

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```
BWCut/
├── Install-BWCut.bat       ← ตัวติดตั้งอัตโนมัติ (Polyglot Batch + PowerShell)
├── run.bat                 ← ตัวเปิดใช้งานโปรแกรม (ตรวจพอร์ต 3110 และรัน Node)
├── package.json            ← รายการ Dependencies & Scripts
├── tsconfig.json           ← การตั้งค่า TypeScript
├── .env.example            ← ตัวอย่างไฟล์ตั้งค่าคอนฟิก
├── .gitignore              ← กฎยกเว้นไฟล์สำหรับ Git
├── src/
│   ├── server.ts           ← Local Web Server & API Router (port 3110)
│   ├── engine/
│   │   ├── config.ts       ← ระบบอ่าน/เขียนการตั้งค่าคอนฟิก
│   │   ├── ffmpeg.ts       ← ตัวตรวจจับ FFmpeg, เมตาดาต้า, การ์ดจอ
│   │   ├── headline.ts     ← ระบบสร้างพาดหัว AI (Gemini / Groq)
│   │   ├── silence.ts      ← ระบบวิเคราะห์เสียงเงียบ & Jump Cut
│   │   ├── render-direct.ts← เรนเดอร์วิดีโอผ่าน FFmpeg Direct Pipeline
│   │   ├── licensing.ts    ← สถานะ Community Free Edition
│   │   ├── updater.ts      ← ระบบอัปเดตผ่าน Git
│   │   └── ntfy.ts         ← ระบบส่งแจ้งเตือนเข้ามือถือผ่าน ntfy.sh
│   └── public/             ← หน้าจอควบคุมผู้ใช้งาน (Google Store Theme)
│       ├── index.html      ← หน้าจอหลัก
│       ├── css/            ← Design Tokens & Modular CSS
│       └── js/             ← Vanilla ES Modules Frontend
└── fonts/                  ← ฟอนต์ฟรี Google Fonts (OFL) และ Twemoji
```

---

## 📄 ใบอนุญาตการใช้งาน (License)

โปรแกรมนี้เปิดให้ใช้งานฟรี 100% สำหรับทุกคน (Free & Open Source Software) ภายใต้สิทธิ์การใช้งานทั้งส่วนตัวและเชิงพาณิชย์

---

*สร้างสรรค์โดย fasterpsu (เจ้าของระบบ BW OS) & BWCut Studio Team*
