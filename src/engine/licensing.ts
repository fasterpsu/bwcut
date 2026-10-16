/**
 * licensing.ts — Community Edition & License Status Engine for BWCut
 * BWCut is 100% Free and Open-Source Software (Commercial & Personal Use Allowed)
 */

export interface LicenseData {
  key: string;
  machineId: string;
  status: "active" | "trial" | "expired" | "invalid" | "unregistered";
  activatedAt?: string;
  expiresAt?: string;
  lastVerifiedAt?: string;
  customerName?: string;
  channel?: "git" | "zip";
  offlineGraceDaysRemaining?: number;
}

/**
 * Unique identifier for the installation
 */
export function getMachineFingerprint(): string {
  return "BWCUT-COMMUNITY";
}

/**
 * Returns permanent active status for all BWCut users (100% Free & Open-Source)
 */
export function getStoredLicense(): LicenseData {
  return {
    key: "BWCUT-FREE-COMMUNITY",
    machineId: "BWCUT-OPEN-SOURCE",
    status: "active",
    customerName: "Community User",
    activatedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2099-12-31T23:59:59Z",
    channel: "git",
  };
}

/**
 * Save license data (No-op in Free Community edition)
 */
export function saveLicense(_data: Partial<LicenseData>): LicenseData {
  return getStoredLicense();
}

/**
 * Validate license status — always returns active
 */
export async function validateLicense(_gasUrl?: string): Promise<LicenseData> {
  return getStoredLicense();
}

/**
 * Activate license key — always successful in Free edition
 */
export async function activateLicense(
  _key?: string,
  _gasUrl?: string
): Promise<{ success: boolean; message: string; license?: LicenseData }> {
  return {
    success: true,
    message: "BWCut เป็นซอฟต์แวร์ฟรี 100% (Open-Source) พร้อมใช้งานทุกฟังก์ชันถาวรครับ",
    license: getStoredLicense(),
  };
}
