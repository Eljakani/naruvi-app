import assert from "node:assert/strict"
import test from "node:test"
import { decryptSecret, encryptSecret, encryptionReady } from "../../settings/encryption"
import { exportableSettings, LLM_SETTINGS_KEY, llmSettingsInput, prepareLlmSettings } from "../../settings/llm-schema"

const master = "ab".repeat(32)
const apiKey = "test-only-provider-key"
const context = "llm:https://provider.example/v1"
const fallback = { baseUrl: "https://provider.example/v1", model: "test-model", apiKey: "" }
const input = { baseUrl: fallback.baseUrl, model: fallback.model, apiKey }

test("authenticated encryption round-trips and randomizes every write", () => {
  const a = encryptSecret(apiKey, master, context)
  const b = encryptSecret(apiKey, master, context)
  assert.notEqual(a, b)
  assert.ok(!a.includes(apiKey))
  assert.equal(decryptSecret(a, master, context), apiKey)
})

test("ciphertext, nonce, tag, key, and endpoint tampering fail closed", () => {
  const encrypted = encryptSecret(apiKey, master, context)
  for (const index of [1, 2, 3]) {
    const parts = encrypted.split(".")
    parts[index] = (parts[index][0] === "A" ? "B" : "A") + parts[index].slice(1)
    assert.throws(() => decryptSecret(parts.join("."), master, context), /could not be decrypted/)
  }
  assert.throws(() => decryptSecret(encrypted, "cd".repeat(32), context), /could not be decrypted/)
  assert.throws(() => decryptSecret(encrypted, master, "llm:https://other.example/v1"), /could not be decrypted/)
})

test("malformed envelopes and invalid master keys never reveal input in errors", () => {
  for (const value of ["", "v2.a.b.c", "v1.a.b.c", `v1.?.b.${apiKey}`]) {
    assert.throws(() => decryptSecret(value, master, context), /could not be decrypted/)
  }
  for (const key of ["", "x".repeat(64), "aa".repeat(31), "aa".repeat(33)]) {
    assert.equal(encryptionReady(key), false)
    assert.throws(() => encryptSecret(apiKey, key, context), /SETTINGS_ENCRYPTION_KEY/)
  }
})

test("saving encrypts a new key; blank preserves ciphertext; replacement changes it", () => {
  const saved = prepareLlmSettings(input, null, fallback, master)
  assert.equal(decryptSecret(saved.encryptedApiKey!, master, context), apiKey)
  const kept = prepareLlmSettings({ ...input, apiKey: "", model: "new-model" }, saved, fallback, master)
  assert.equal(kept.encryptedApiKey, saved.encryptedApiKey)
  assert.equal(kept.model, "new-model")
  const replaced = prepareLlmSettings({ ...input, apiKey: "replacement" }, kept, fallback, master)
  assert.equal(decryptSecret(replaced.encryptedApiKey!, master, context), "replacement")
})

test("removal stays removed even when an environment key exists", () => {
  const legacy = { ...fallback, apiKey }
  const migrated = prepareLlmSettings({ ...input, apiKey: "" }, null, legacy, master)
  assert.equal(decryptSecret(migrated.encryptedApiKey!, master, context), apiKey)
  const removed = prepareLlmSettings({ ...input, apiKey: "", removeKey: true }, migrated, legacy, master)
  assert.equal(removed.encryptedApiKey, null)
  assert.equal(prepareLlmSettings({ ...input, apiKey: "" }, removed, legacy, master).encryptedApiKey, null)
})

test("changing endpoint never silently sends an existing key to a different provider", () => {
  const saved = prepareLlmSettings(input, null, fallback, master)
  const changed = { ...input, baseUrl: "https://other.example/v1", apiKey: "" }
  assert.throws(() => prepareLlmSettings(changed, saved, fallback, master), /replacement API key/)
  const replaced = prepareLlmSettings({ ...changed, apiKey: "other-key" }, saved, fallback, master)
  assert.equal(decryptSecret(replaced.encryptedApiKey!, master, "llm:https://other.example/v1"), "other-key")
  assert.equal(prepareLlmSettings({ ...changed, removeKey: true }, saved, fallback, master).encryptedApiKey, null)
})

test("endpoint validation rejects embedded secrets and non-HTTP protocols", () => {
  for (const baseUrl of ["file:///etc/passwd", "https://user:secret@provider.example", "https://provider.example?key=secret", "https://provider.example#secret", "not a url"]) {
    assert.equal(llmSettingsInput.safeParse({ ...input, baseUrl }).success, false)
  }
  const value = llmSettingsInput.parse({ ...input, baseUrl: `${fallback.baseUrl}/` })
  assert.equal(value.baseUrl, fallback.baseUrl)
})

test("data exports omit the entire credential setting, including ciphertext", () => {
  const rows = [{ key: "documents", value: { accent: "#2563eb" } }, { key: LLM_SETTINGS_KEY, value: { encryptedApiKey: "secret ciphertext" } }]
  assert.deepEqual(exportableSettings(rows), [rows[0]])
})
