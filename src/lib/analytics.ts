// GA4 埋点封装:dev 不上报,生产走 gtag
export function track(name: string, params: Record<string, unknown> = {}): void {
  if (import.meta.env.DEV) return;
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  w.gtag?.('event', name, params);
}
