import assert from "node:assert/strict"
import test from "node:test"
import { z } from "zod"
import { requestCompletion } from "../../llm/transport"
import { AiRequestError } from "../../llm/errors"

const config = { baseUrl: "https://provider.example/v1", model: "test-model", apiKey: "test-only-secret", configured: true }
const input = { system: "Use verified facts.", user: "Check this requirement." }

test("model calls use the provided current configuration and refuse redirects", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://provider.example/v1/chat/completions")
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${config.apiKey}`)
    assert.equal(init?.redirect, "error")
    const body = JSON.parse(String(init?.body))
    assert.equal(body.model, config.model)
    assert.ok(!String(init?.body).includes(config.apiKey))
    return Response.json({ choices: [{ message: { content: '{"reviews":[]}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
  }
  const result = await requestCompletion(config, input, { fetcher })
  assert.equal(result.text, '{"reviews":[]}')
  assert.equal(result.inputTokens, 10)
})

test("provider and network errors cannot echo keys into UI messages or run logs", async () => {
  const fetchers: typeof fetch[] = [
    async () => new Response(`Invalid Authorization: Bearer ${config.apiKey}`, { status: 401 }),
    async () => { throw new Error(`Network error with ${config.apiKey}`) },
    async () => new Response(config.apiKey),
  ]
  for (const fetcher of fetchers) {
    await assert.rejects(() => requestCompletion(config, input, { fetcher }), (error: Error) => {
      assert.ok(!error.message.includes(config.apiKey))
      return true
    })
  }
})

test("local models can omit authorization and connection tests omit JSON mode", async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    assert.equal(new Headers(init?.headers).has("authorization"), false)
    assert.equal(JSON.parse(String(init?.body)).response_format, undefined)
    return Response.json({ choices: [{ message: { content: "ok" } }] })
  }
  await requestCompletion({ ...config, apiKey: "" }, input, { fetcher, jsonMode: false })
})

test("AI SDK requests JSON mode and validates each workflow's Zod schema", async () => {
  const schema = z.object({ answer: z.number() })
  const fetcher: typeof fetch = async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).response_format.type, "json_object")
    assert.match(JSON.parse(String(init?.body)).messages[0].content, /"answer"/)
    return Response.json({ choices: [{ message: { content: '{"answer":"wrong type"}' }, finish_reason: "stop" }] })
  }
  await assert.rejects(() => requestCompletion(config, { ...input, schema }, { fetcher }), /workflow's schema/)
})

test("AI SDK retries one transient failure and reports actual network attempts and usage", async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    if (++calls === 1) return Response.json({ error: { message: "Temporarily unavailable" } }, { status: 503 })
    return Response.json({ id: "fixture-request", choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 42, completion_tokens: 7 } })
  }
  const result = await requestCompletion(config, input, { fetcher })
  assert.equal(result.attempts, 2)
  assert.equal(calls, 2)
  assert.equal(result.inputTokens, 42)
  assert.equal(result.outputTokens, 7)
  assert.equal(result.requestId, "fixture-request")
  assert.equal(result.finishReason, "stop")
})

test("truncated JSON preserves safe usage metrics and explains the output limit", async () => {
  const fetcher: typeof fetch = async () => Response.json({ choices: [{ message: { content: '{"unfinished":' }, finish_reason: "length" }], usage: { prompt_tokens: 100, completion_tokens: 6000 } })
  await assert.rejects(() => requestCompletion(config, input, { fetcher }), (error: Error) => {
    assert.ok(error instanceof AiRequestError)
    assert.match(error.message, /output limit/)
    assert.equal(error.metrics.inputTokens, 100)
    assert.equal(error.metrics.outputTokens, 6000)
    assert.equal(error.metrics.finishReason, "length")
    assert.equal(error.metrics.attempts, 1)
    assert.ok(!JSON.stringify(error).includes(config.apiKey))
    return true
  })
})

test("DeepSeek JSON workflows disable default thinking but future workflows can opt in", async () => {
  for (const reasoning of ["none", "high"] as const) {
    const fetcher: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      assert.equal(body.thinking.type, reasoning === "none" ? "disabled" : "enabled")
      if (reasoning === "high") assert.equal(body.reasoning_effort, "high")
      return Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] })
    }
    await requestCompletion({ ...config, baseUrl: "https://api.deepseek.com/v1" }, { ...input, reasoning }, { fetcher })
  }
})

test("a schema mismatch gets one repair round naming the problem", async () => {
  const prompts: string[] = []
  const answers = ['{"status":"maybe"}', '{"status":"met"}']
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    prompts.push(body.messages.at(-1).content)
    return Response.json({ choices: [{ message: { content: answers[prompts.length - 1] }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
  }
  const result = await requestCompletion(config, { ...input, schema: z.object({ status: z.enum(["met", "gap"]) }) }, { fetcher })
  assert.equal(JSON.parse(result.text).status, "met")
  assert.equal(prompts.length, 2)
  assert.match(prompts[1], /did not match the schema \(status:/)
  assert.equal(result.inputTokens, 20, "usage is summed across attempts")
})

test("Claude uses the native Messages API and returns structured workflow output", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages")
    const headers = new Headers(init?.headers)
    assert.equal(headers.get("x-api-key"), config.apiKey)
    assert.equal(headers.has("authorization"), false)
    assert.equal(init?.redirect, "error")
    const body = JSON.parse(String(init?.body))
    assert.equal(body.model, "claude-sonnet-4-6")
    assert.equal(body.output_config.format.type, "json_schema")
    return Response.json({
      id: "msg_test", type: "message", role: "assistant", model: body.model,
      content: [{ type: "text", text: '{"ok":true}' }], stop_reason: "end_turn",
      stop_sequence: null, usage: { input_tokens: 20, output_tokens: 5 },
    })
  }
  const result = await requestCompletion({ ...config, baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6" }, { ...input, schema: z.object({ ok: z.boolean() }) }, { fetcher })
  assert.deepEqual(JSON.parse(result.text), { ok: true })
})

test("OpenAI uses the token limit supported by reasoning models", async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    assert.equal(body.max_completion_tokens, 512)
    assert.equal(body.max_tokens, undefined)
    assert.equal(body.temperature, undefined)
    return Response.json({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] })
  }
  await requestCompletion({ ...config, baseUrl: "https://api.openai.com/v1" }, { ...input, maxTokens: 512 }, { fetcher, jsonMode: false })
})
