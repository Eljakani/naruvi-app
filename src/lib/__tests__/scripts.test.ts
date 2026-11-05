import assert from "node:assert/strict"
import test from "node:test"
import { detectScripts, isRtl } from "../scripts"

test("detects scripts used in a document", () => {
  assert.deepEqual(detectScripts("Plain English CV"), ["latin"])
  assert.deepEqual(detectScripts("Łukasz Wiśniewski, Kraków"), ["latin", "latin-ext"])
  assert.deepEqual(detectScripts("Иван Петров — инженер"), ["latin", "cyrillic"])
  assert.deepEqual(detectScripts("محمد العلوي — مهندس"), ["latin", "arabic"])
  assert.ok(isRtl(detectScripts("שלום")))
  assert.deepEqual(detectScripts("王小明 软件工程师"), ["latin", "cjk-sc"])
  assert.deepEqual(detectScripts("山田太郎 エンジニア"), ["latin", "cjk-jp"])
  assert.deepEqual(detectScripts("山田太郎", "ja"), ["latin", "cjk-jp"])
  assert.deepEqual(detectScripts("将部署时间缩短 デプロイ 배포").sort(), ["cjk-jp", "cjk-kr", "cjk-sc", "latin"])
  assert.deepEqual(detectScripts("김민준 개발자"), ["latin", "cjk-kr"])
  assert.deepEqual(detectScripts("राहुल शर्मा"), ["latin", "devanagari"])
})
