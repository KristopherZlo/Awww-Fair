export function listenHost(env?: Partial<Record<string, string | undefined>>): string;
export function publicPath(env?: Partial<Record<string, string | undefined>>): string;
export function advertisedUrls(env: Partial<Record<string, string | undefined>>, urls: string[]): string[];
export function advertisedLanUrls(
  env: Partial<Record<string, string | undefined>>,
  port: number,
  options?: Record<string, unknown>
): string[];
