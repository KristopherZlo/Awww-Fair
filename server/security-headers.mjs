export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "media-src 'self'",
  "manifest-src 'self'"
].join("; ");

export function securityHeaders({ contentSecurityPolicy = true } = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    ...(contentSecurityPolicy ? { "Content-Security-Policy": CONTENT_SECURITY_POLICY } : {})
  };
}
