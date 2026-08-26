/**
 * HackSync Production Security Headers & Strict CSP Configuration
 * Enforces strict Content-Security-Policy (without unsafe-eval in production),
 * HSTS, X-Frame-Options (DENY), X-Content-Type-Options (nosniff),
 * Referrer-Policy, COOP, CORP, and Permissions-Policy.
 */

export interface SecurityHeadersConfig {
  supabaseUrl?: string;
  isProduction?: boolean;
}

export function getProductionSecurityHeaders(config?: SecurityHeadersConfig): Record<string, string> {
  const isProd = config?.isProduction ?? (process.env["NODE_ENV"] === "production");
  const supabaseHost = config?.supabaseUrl ? new URL(config.supabaseUrl).host : "*.supabase.co";

  // Production CSP strictly forbids unsafe-eval
  const scriptDirectives = isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  const cspDirectives = [
    "default-src 'self'",
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com`,
    scriptDirectives,
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
