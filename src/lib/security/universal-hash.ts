/**
 * Universal Cryptographic SHA-256 Hashing Utility
 * Compatible with Browser Client (Vite), Node.js, Bun, and SSR.
 * Zero reliance on Node's externalized "crypto" module.
 */
import { sha256 } from "js-sha256";

export function computeSha256Sync(data: string): string {
  if (!data) return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  return sha256(data);
}

export async function computeSha256Async(data: string): Promise<string> {
  if (!data) return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
    try {
      const buffer = new TextEncoder().encode(data);
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // Fallback to synchronous pure JS sha256
    }
  }
  return sha256(data);
}
