export const CONTENT_SECURITY_POLICY: string;

export function securityHeaders(options?: { contentSecurityPolicy?: boolean }): Record<string, string>;
