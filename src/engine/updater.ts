/**
 * updater.ts — Automated Update & Integrity Engine for BWCut Studio
 * Supports Git Pull (Dev/Repo) and ZIP Manifest (Customer) with Rollback
 */

import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { getStoredLicense } from "./licensing.js";

export interface UpdateCheckResult {
  hasUpdate: boolean;
  channel: "git" | "zip";
  currentVersion: string;
  latestVersion: string;
  changeLog?: string;
  downloadUrl?: string;
}

export function getCurrentVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf-8"));
    return pkg.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

/**
 * Check if Git repository has updates on origin/stable or origin/main
 */
export function checkGitUpdate(): UpdateCheckResult {
  const currentVersion = getCurrentVersion();
  try {
    // Check if git directory exists
    if (!fs.existsSync(path.resolve(".git"))) {
      return { hasUpdate: false, channel: "git", currentVersion, latestVersion: currentVersion };
    }

    // Fetch silently with timeout
    execSync("git fetch origin stable", { timeout: 10000, stdio: "ignore" });
    const localHash = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    const remoteHash = execSync("git rev-parse origin/stable", { encoding: "utf-8" }).trim();

    if (localHash !== remoteHash) {
      const log = execSync("git log HEAD..origin/stable --oneline -n 5", { encoding: "utf-8" }).trim();
      return {
        hasUpdate: true,
        channel: "git",
        currentVersion: localHash.slice(0, 7),
        latestVersion: remoteHash.slice(0, 7),
        changeLog: log,
      };
    }
  } catch {}

  return { hasUpdate: false, channel: "git", currentVersion, latestVersion: currentVersion };
}

/**
 * Check for updates via Google Apps Script ZIP manifest (Customer mode)
 */
export async function checkZipUpdate(gasUrl: string): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion();
  const lic = getStoredLicense();

  if (!gasUrl) {
    return { hasUpdate: false, channel: "zip", currentVersion, latestVersion: currentVersion };
  }

  try {
    const sep = gasUrl.includes("?") ? "&" : "?";
    const query = `${gasUrl}${sep}action=manifest&key=${encodeURIComponent(lic.key)}`;

    const res = await fetch(query, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.url && data.version_count) {
        const latestVer = String(data.version_count);
        const hasUpdate = latestVer !== currentVersion;
        return {
          hasUpdate,
          channel: "zip",
          currentVersion,
          latestVersion: latestVer,
          downloadUrl: data.url,
          changeLog: data.notes || "อัปเดตเวอร์ชันใหม่ล่าสุดพร้อมปรับปรุงประสิทธิภาพ",
        };
      }
    }
  } catch {}

  return { hasUpdate: false, channel: "zip", currentVersion, latestVersion: currentVersion };
}

/**
 * Apply Git update
 */
export function applyGitUpdate(): { success: boolean; message: string } {
  try {
    execSync("git fetch origin stable && git checkout -B stable origin/stable && git reset --hard origin/stable", {
      stdio: "inherit",
      timeout: 30000,
    });
    execSync("npm install", { stdio: "inherit", timeout: 60000 });
    return { success: true, message: "อัปเดตระบบจาก GitHub สำเร็จเรียบร้อยแล้ว กรุณารีสตาร์ทโปรแกรม" };
  } catch (err: any) {
    return { success: false, message: `อัปเดตไม่สำเร็จ: ${err?.message || err}` };
  }
}
