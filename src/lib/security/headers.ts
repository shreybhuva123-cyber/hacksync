/**
 * HackSync Production Security Headers & CSP Configuration
 * Enforces strict Content-Security-Policy, HSTS, X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.
 */

export interface SecurityHeadersConfig {
  supabaseUrl?: string;
  isProduction?: boolean;
}

export function getProductionSecurityHeaders(config?: SecurityHeadersConfig): Record<string, string> {
  const supabaseHost = config?.supabaseUrl ? new URL(config.supabaseUrl).host : "*.supabase.co";

  const cspDirectives = [
    "default-src 'self'",
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com`,
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite/TanStack SSR hydration
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ];

  return {
    "Content-Security-Policy": cspDirectives.join("; "),
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "X-XSS-Protection": "1; mode=block",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
