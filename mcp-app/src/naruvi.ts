import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

/**
 * Talks to Naruvi's own MCP endpoint (/api/v1/mcp) with the caller's API key.
 * This app keeps no key of its own: every request carries the `nrv_` key of
 * the person using it, and Naruvi checks it, scopes the data and rate-limits.
 */

export const KEY_PATTERN = /^Bearer\s+(nrv_[a-f0-9]{48})$/;

/** The key of the request being served, set by the /mcp middleware. */
export const requestKey = new AsyncLocalStorage<string>();

export class NaruviError extends Error {}

type Fetch = typeof fetch;

export function naruviClient(baseUrl: string, fetchImpl: Fetch = fetch) {
  const base = baseUrl.replace(/\/+$/, "");
  const verified = new Map<string, number>();
  let nextId = 1;

  return {
    base,

    /** Whether Naruvi accepts this key. A good answer is remembered for a minute. */
    async verify(key: string) {
      const fingerprint = createHash("sha256").update(key).digest("hex");
      if ((verified.get(fingerprint) ?? 0) > Date.now()) return true;
      const response = await fetchImpl(`${base}/api/v1/me`, { headers: { authorization: `Bearer ${key}` } });
      if (!response.ok) return false;
      verified.set(fingerprint, Date.now() + 60_000);
      return true;
    },

    /** Calls one of Naruvi's MCP tools and returns its structured result; a tool error becomes a thrown NaruviError. */
    async callTool<T = Record<string, unknown>>(key: string, name: string, args: Record<string, unknown>): Promise<T> {
      const response = await fetchImpl(`${base}/api/v1/mcp`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }),
        signal: AbortSignal.timeout(600_000),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string | { message?: string };
        result?: { isError?: boolean; structuredContent?: T; content?: { type: string; text?: string }[] };
      } | null;
      if (!body) throw new NaruviError(`Naruvi answered ${response.status} without JSON. Check NARUVI_URL (${base}).`);
      if (body.error) throw new NaruviError(typeof body.error === "string" ? body.error : (body.error.message ?? "Naruvi refused the request."));
      const result = body.result;
      const text = result?.content?.find((item) => item.type === "text")?.text ?? "";
      if (!result || result.isError) throw new NaruviError(text || "Naruvi could not run that tool.");
      if (result.structuredContent) return result.structuredContent;
      return JSON.parse(text) as T;
    },
  };
}

export type NaruviClient = ReturnType<typeof naruviClient>;

/** The key for the current request, or a clear error when the app is reached without one. */
export function currentKey() {
  const key = requestKey.getStore();
  if (!key) throw new NaruviError("No Naruvi API key on this request.");
  return key;
}
