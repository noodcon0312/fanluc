/**
 * Rewrite relative "/api/..." fetch URLs to an absolute base URL so the
 * browser-oriented utils (which call fetch("/api/...")) also work inside
 * the Node TUI process.
 */
export function installRelativeFetchShim(baseUrl: string): void {
  const g = globalThis as Record<string, unknown> & { fetch: typeof fetch };
  if (g.__fanlucFetchShim === baseUrl) return;
  const base = baseUrl.replace(/\/$/, "");
  const original =
    (g.__fanlucOriginalFetch as typeof fetch | undefined) || g.fetch.bind(g);
  g.__fanlucOriginalFetch = original;
  g.__fanlucFetchShim = baseUrl;
  g.fetch = ((input: unknown, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/")) input = base + input;
    return (original as typeof fetch)(input as RequestInfo, init);
  }) as typeof fetch;
}
