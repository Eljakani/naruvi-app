/**
 * Which writing systems a text uses, so documents can pick fonts that
 * actually contain the glyphs. Pure.
 */
export type Script = "latin" | "latin-ext" | "cyrillic" | "greek" | "arabic" | "hebrew" | "devanagari" | "thai" | "cjk-sc" | "cjk-jp" | "cjk-kr"

const RANGES: [Script, RegExp][] = [
  ["latin-ext", /[Ā-ɏḀ-ỿ]/],
  ["cyrillic", /[Ѐ-ӿԀ-ԯ]/],
  ["greek", /[Ͱ-Ͽἀ-῿]/],
  ["arabic", /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/],
  ["hebrew", /[֐-׿יִ-ﭏ]/],
  ["devanagari", /[ऀ-ॿ]/],
  ["thai", /[฀-๿]/],
]

export function detectScripts(text: string, language = ""): Script[] {
  const value = String(text ?? "")
  const found = new Set<Script>(["latin"])
  for (const [script, pattern] of RANGES) if (pattern.test(value)) found.add(script)
  const kana = /[぀-ヿ]/.test(value)
  const hangul = /[가-힯ᄀ-ᇿ]/.test(value)
  const han = /[一-鿿㐀-䶿]/.test(value)
  if (hangul) found.add("cjk-kr")
  if (kana || (han && language === "ja")) found.add("cjk-jp")
  // Simplified Chinese forms are missing from the JP/KR fonts: any Han text
  // that is not clearly Japanese/Korean-only also needs the SC font.
  if (han && language !== "ja" && language !== "ko" && (language === "zh" || (!kana && !hangul) || (kana && hangul))) found.add("cjk-sc")
  return [...found]
}

/** Right-to-left scripts change text alignment. */
export function isRtl(scripts: Script[]) {
  return scripts.includes("arabic") || scripts.includes("hebrew")
}
