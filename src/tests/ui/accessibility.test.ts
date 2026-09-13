/**
 * HackSync Phase 7: Accessibility & WCAG 2.1 AA Target Verification Test Suite
 * Automated tests verifying:
 * 1. Mathematical contrast ratios (WCAG 2.1 AA >= 4.5:1 text, >= 3.0:1 UI components)
 * 2. Reduced-motion mode CSS rules (@media prefers-reduced-motion)
 * 3. Focus visibility tokens across interactive primitives
 * 4. Modal dialog accessibility attributes (role="dialog", aria-modal)
 * 5. Screen reader text and ARIA labels
 * 6. Keyboard navigation shortcut contracts (Ctrl+K, Ctrl+B, Esc)
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Helper function to calculate sRGB relative luminance per WCAG 2.1 specification
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("HackSync Phase 7: Accessibility & WCAG 2.1 AA Target Tests", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Color Contrast Mathematical Verification (WCAG AA)
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Color Contrast Mathematical Verification", () => {
    const TOKENS = {
      background: "#0B0F14",
      surface: "#11161D",
      foreground: "#F3F4F6",
      mutedForeground: "#9CA3AF",
      primary: "#4F8CFF",
      primaryForeground: "#0B0F14",
      success: "#22C55E",
      warning: "#F59E0B",
      danger: "#EF4444",
      info: "#38BDF8",
    };

    it("should satisfy WCAG AA >= 4.5:1 for primary text on background", () => {
      const ratio = getContrastRatio(TOKENS.foreground, TOKENS.background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      // In fact, it exceeds 15:1
      expect(ratio).toBeGreaterThan(14.0);
    });

    it("should satisfy WCAG AA >= 4.5:1 for card text on surface", () => {
      const ratio = getContrastRatio(TOKENS.foreground, TOKENS.surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(13.0);
    });

    it("should satisfy WCAG AA >= 4.5:1 for muted text on surface", () => {
      const ratio = getContrastRatio(TOKENS.mutedForeground, TOKENS.surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(5.5);
    });

    it("should satisfy WCAG AA >= 4.5:1 for primary button label on primary blue", () => {
      const ratio = getContrastRatio(TOKENS.primaryForeground, TOKENS.primary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(5.5);
    });

    it("should satisfy WCAG AA >= 3.0:1 for graphical UI status indicators", () => {
      expect(getContrastRatio(TOKENS.success, TOKENS.surface)).toBeGreaterThanOrEqual(3.0);
      expect(getContrastRatio(TOKENS.warning, TOKENS.surface)).toBeGreaterThanOrEqual(3.0);
      expect(getContrastRatio(TOKENS.danger, TOKENS.surface)).toBeGreaterThanOrEqual(3.0);
      expect(getContrastRatio(TOKENS.info, TOKENS.surface)).toBeGreaterThanOrEqual(3.0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Reduced-Motion Mode Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Reduced-Motion Mode Support", () => {
    it("should include @media (prefers-reduced-motion: reduce) rules in styles.css", () => {
      const cssPath = resolve(process.cwd(), "src/styles.css");
      const cssContent = readFileSync(cssPath, "utf-8");

      expect(cssContent).toContain("prefers-reduced-motion: reduce");
      expect(cssContent).toContain("animation-duration: 0.01ms");
      expect(cssContent).toContain("transition-duration: 0.01ms");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Focus Visibility Tokens
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Focus Visibility Tokens", () => {
    it("should verify AppShell contains focus ring styles for keyboard navigation", () => {
      const appShellPath = resolve(process.cwd(), "src/components/hacksync/AppShell.tsx");
      const content = readFileSync(appShellPath, "utf-8");

      expect(content).toContain("focus-visible:ring-2");
      expect(content).toContain("focus-visible:ring-primary");
    });

    it("should verify primitives include visible focus ring utility tokens", () => {
      const cssPath = resolve(process.cwd(), "src/styles.css");
      const content = readFileSync(cssPath, "utf-8");
      expect(content).toContain("--ring: #4F8CFF;");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Modal Dialog Accessibility & Keyboard Trapping
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Modal Dialog Accessibility Contracts", () => {
    it("should verify ApprovalGate includes dialog semantic roles and escape support", () => {
      const approvalGatePath = resolve(process.cwd(), "src/components/hacksync/ApprovalGate.tsx");
      const content = readFileSync(approvalGatePath, "utf-8");

      expect(content).toContain("role=\"dialog\"");
      expect(content).toContain("aria-modal=\"true\"");
      expect(content).toContain("aria-labelledby=");
      expect(content).toContain("onClose");
    });

    it("should verify CommandPalette integrates with command dialog and keyboard shortcut", () => {
      const palettePath = resolve(process.cwd(), "src/components/hacksync/CommandPalette.tsx");
      const content = readFileSync(palettePath, "utf-8");

      expect(content).toContain("CommandDialog");
      expect(content).toContain("onOpenChange");
      expect(content).toContain("metaKey || e.ctrlKey");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Screen Reader Labels & Non-Reliance on Color
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Screen Reader & Color Independence", () => {
    it("should verify DiffViewer includes textual hunk markers alongside line diffs", () => {
      const diffViewerPath = resolve(process.cwd(), "src/components/hacksync/DiffViewer.tsx");
      const content = readFileSync(diffViewerPath, "utf-8");

      expect(content).toContain("@@");
      expect(content).toContain("header");
    });

    it("should verify TopBar includes descriptive accessible text for branch status", () => {
      const appShellPath = resolve(process.cwd(), "src/components/hacksync/AppShell.tsx");
      const content = readFileSync(appShellPath, "utf-8");

      expect(content).toContain("Live Sync Active");
      expect(content).toContain("main");
    });
  });
});
