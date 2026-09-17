import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Universally generate a UUID v4 compatible string.
 * Works seamlessly in:
 * - Secure browser contexts (HTTPS / localhost) via crypto.randomUUID()
 * - Non-secure browser contexts (HTTP LAN IP like http://192.168.x.x) via crypto.getRandomValues() or Math.random() fallback
 * - Node.js / Bun environments
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // In case of restriction, fall through
    }
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    try {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      buf[6] = (buf[6]! & 0x0f) | 0x40; // Version 4
      buf[8] = (buf[8]! & 0x3f) | 0x80; // Variant 10xx
      const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    } catch {
      // Fall through to Math.random
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
