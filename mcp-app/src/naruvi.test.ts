import test from "node:test";
import assert from "node:assert/strict";
import { cvBlocks, boldParts, fitText } from "./summaries.js";
import { NaruviError, naruviClient } from "./naruvi.js";

const KEY = `nrv_${"ab".repeat(24)}`;

/** A fetch that answers like Naruvi and records what was asked. */
function fakeNaruvi(answer: (url: string, body: unknown) => Response) {
  const seen: { url: string; auth: string | null; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    seen.push({ url, auth: new Headers(init?.headers).get("authorization"), body });
    return answer(url, body);
  }) as typeof fetch;
  return { seen, client: naruviClient("http://naruvi.test/", fetchImpl) };
}

test("tool calls go to Naruvi's MCP endpoint with the caller's key and return structured content", async () => {
  const { seen, client } = fakeNaruvi(() => Response.json({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "{}" }], structuredContent: { fit: 81 } } }));
  const result = await client.callTool<{ fit: number }>(KEY, "naruvi_get_fit_analysis", { id: "x" });
  assert.equal(result.fit, 81);
  assert.equal(seen[0].url, "http://naruvi.test/api/v1/mcp");
  assert.equal(seen[0].auth, `Bearer ${KEY}`);
  assert.deepEqual((seen[0].body as { params: unknown }).params, { name: "naruvi_get_fit_analysis", arguments: { id: "x" } });
});

test("tool errors and refused keys become readable errors", async () => {
  const failing = fakeNaruvi(() => Response.json({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "Application not found." }] } }));
  await assert.rejects(failing.client.callTool(KEY, "naruvi_get_cv", {}), (error) => error instanceof NaruviError && error.message === "Application not found.");
  const refused = fakeNaruvi(() => Response.json({ error: "Missing or invalid API key." }, { status: 401 }));
  await assert.rejects(refused.client.callTool(KEY, "naruvi_get_cv", {}), /invalid API key/);
  assert.equal(await refused.client.verify(KEY), false);
});

test("a key Naruvi accepted is not checked again within a minute", async () => {
  const { seen, client } = fakeNaruvi(() => Response.json({ app: "naruvi" }));
  assert.equal(await client.verify(KEY), true);
  assert.equal(await client.verify(KEY), true);
  assert.equal(seen.length, 1);
});

test("CV Markdown becomes blocks, and bold text is split without HTML", () => {
  assert.deepEqual(cvBlocks("# Alex Example\n**Platform Engineer**\n\n## Experience\n### Engineer (Northwind Labs)\n- Built pipelines").map((block) => block.type), ["name", "text", "section", "item", "bullet"]);
  assert.deepEqual(boldParts("- **Cloud**: AWS <b>"), [{ bold: false, text: "- " }, { bold: true, text: "Cloud" }, { bold: false, text: ": AWS <b>" }]);
});

test("the model gets a short fit summary next to the view", () => {
  const text = fitText({ analyzed: true, title: "Platform Engineer", company: "Northwind Labs", fit: 72, counts: { proven: 5, partial: 2, missing: 1, yourCall: 1 }, mustHaveGaps: ["Go"] });
  assert.match(text, /Platform Engineer at Northwind Labs: 72 \(5 proven/);
  assert.match(text, /Must-have gaps: Go/);
  assert.equal(fitText({ analyzed: false, note: "Run the analysis first." }), "Run the analysis first.");
});
