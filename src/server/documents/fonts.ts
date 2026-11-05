import "server-only"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Font } from "@react-pdf/renderer"
import type { Script } from "@/lib/scripts"
import { safeFetch } from "@/server/assets/safe-fetch"
import { ASSETS_DIR } from "@/server/assets/store"

/**
 * Font registry for PDF rendering.
 *
 * Each writing system is its own family (fontsource ships per-script files);
 * documents use a stack [template font, ...script fonts] and react-pdf falls
 * back glyph by glyph. CJK fonts are too large to bundle (50–85 MB), so they
 * are downloaded once on first use and cached in the asset volume.
 */
const FONTSOURCE = join(process.cwd(), "node_modules", "@fontsource")
const file = (pkg: string, name: string) => join(FONTSOURCE, pkg, "files", name)

type Face = { src: string; fontWeight?: number; fontStyle?: "normal" | "italic" }

function faces(pkg: string, subset: string, opts: { bold?: boolean; italic?: boolean } = {}): Face[] {
  const list: Face[] = [{ src: file(pkg, `${pkg}-${subset}-400-normal.woff`), fontWeight: 400 }]
  if (opts.bold !== false) list.push({ src: file(pkg, `${pkg}-${subset}-700-normal.woff`), fontWeight: 700 })
  if (opts.italic) list.push({ src: file(pkg, `${pkg}-${subset}-400-italic.woff`), fontWeight: 400, fontStyle: "italic" })
  return list.filter((face) => existsSync(/* turbopackIgnore: true */ face.src))
}

/** Template base fonts (Latin) */
export const BASE_FAMILIES = {
  sans: { family: "CB Noto Sans", faces: () => faces("noto-sans", "latin", { italic: true }) },
  inter: { family: "CB Inter", faces: () => faces("inter", "latin") },
  serif: { family: "CB Source Serif", faces: () => faces("source-serif-4", "latin", { italic: true }) },
  lato: { family: "CB Lato", faces: () => faces("lato", "latin", { italic: true }) },
  roboto: { family: "CB Roboto", faces: () => faces("roboto", "latin", { italic: true }) },
  plex: { family: "CB IBM Plex Sans", faces: () => faces("ibm-plex-sans", "latin", { italic: true }) },
  merriweather: { family: "CB Merriweather", faces: () => faces("merriweather", "latin", { italic: true }) },
  garamond: { family: "CB EB Garamond", faces: () => faces("eb-garamond", "latin", { italic: true }) },
} as const
export type BaseFont = keyof typeof BASE_FAMILIES

/** Script fallbacks, bundled */
const SCRIPT_FAMILIES: Partial<Record<Script, { family: string; faces: () => Face[] }>> = {
  "latin-ext": { family: "CB Latin Ext", faces: () => faces("noto-sans", "latin-ext", { italic: true }) },
  cyrillic: { family: "CB Cyrillic", faces: () => [...faces("noto-sans", "cyrillic", { italic: true }), ...faces("noto-sans", "cyrillic-ext")] },
  greek: { family: "CB Greek", faces: () => faces("noto-sans", "greek", { italic: true }) },
  arabic: { family: "CB Arabic", faces: () => faces("noto-sans-arabic", "arabic") },
  hebrew: { family: "CB Hebrew", faces: () => faces("noto-sans-hebrew", "hebrew") },
  devanagari: { family: "CB Devanagari", faces: () => faces("noto-sans-devanagari", "devanagari") },
  thai: { family: "CB Thai", faces: () => faces("noto-sans-thai", "thai") },
}

/**
 * CJK, downloaded on demand from the official Noto CJK repository (OFL):
 * static Regular + Bold (variable fonts would render at their Thin default).
 */
const CJK_BASE = "https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF"
const CJK: Partial<Record<Script, { family: string; code: string }>> = {
  "cjk-sc": { family: "CB CJK SC", code: "SC" },
  "cjk-jp": { family: "CB CJK JP", code: "JP" },
  "cjk-kr": { family: "CB CJK KR", code: "KR" },
}

const registered = new Set<string>()

/**
 * react-pdf throws instead of falling back when a weight/style is missing, and
 * most scripts have no italic. Fill the gaps with the closest real face.
 */
function complete(list: Face[]): Face[] {
  const find = (weight: number, style: "normal" | "italic") => list.find((f) => (f.fontWeight ?? 400) === weight && (f.fontStyle ?? "normal") === style)
  const regular = find(400, "normal") ?? list[0]
  const bold = find(700, "normal") ?? regular
  const out = [...list]
  if (!find(700, "normal")) out.push({ ...bold, fontWeight: 700, fontStyle: "normal" })
  if (!find(400, "italic")) out.push({ ...regular, fontWeight: 400, fontStyle: "italic" })
  if (!find(700, "italic")) out.push({ ...(find(400, "italic") ?? bold), fontWeight: 700, fontStyle: "italic" })
  return out
}

function register(family: string, list: Face[]) {
  if (registered.has(family) || !list.length) return
  Font.register({ family, fonts: complete(list) })
  registered.add(family)
}

async function download(url: string, path: string) {
  if (existsSync(/* turbopackIgnore: true */ path)) return true
  try {
    const response = await safeFetch(url, { maxBytes: 20 * 1024 * 1024, accept: "font/otf,application/octet-stream,*/*", timeoutMs: 120_000 })
    if (response.status >= 400 || response.buffer.length < 500_000) return false
    await mkdir(/* turbopackIgnore: true */ join(ASSETS_DIR, "fonts"), { recursive: true })
    await writeFile(/* turbopackIgnore: true */ path, response.buffer)
    return true
  } catch {
    return false // offline: the quality gate reports the missing script
  }
}

async function ensureCjk(script: Script): Promise<string | null> {
  const spec = CJK[script]
  if (!spec) return null
  if (registered.has(spec.family)) return spec.family
  const dir = join(ASSETS_DIR, "fonts")
  const regular = join(dir, `NotoSans${spec.code}-Regular.otf`)
  const bold = join(dir, `NotoSans${spec.code}-Bold.otf`)
  if (!(await download(`${CJK_BASE}/${spec.code}/NotoSans${spec.code}-Regular.otf`, regular))) return null
  const hasBold = await download(`${CJK_BASE}/${spec.code}/NotoSans${spec.code}-Bold.otf`, bold)
  register(spec.family, [{ src: regular, fontWeight: 400 }, ...(hasBold ? [{ src: bold, fontWeight: 700 }] : [])])
  return spec.family
}

export type FontPlan = { stack: string[]; missing: Script[] }

/** Register what the document needs and return the font stack to use. */
/**
 * Primary script for a document language: its font goes first so whole runs
 * (spaces, punctuation, digits) stay in one font and complex shaping (Arabic,
 * Devanagari, Thai) is not broken by per-glyph fallback.
 */
const PRIMARY: Record<string, Script> = { ar: "arabic", fa: "arabic", ur: "arabic", he: "hebrew", hi: "devanagari", mr: "devanagari", ne: "devanagari", th: "thai", ru: "cyrillic", uk: "cyrillic", bg: "cyrillic", sr: "cyrillic", el: "greek", zh: "cjk-sc", ja: "cjk-jp", ko: "cjk-kr" }

export async function prepareFonts(base: BaseFont, scripts: Script[], language = ""): Promise<FontPlan> {
  const baseFamily = BASE_FAMILIES[base]
  register(baseFamily.family, baseFamily.faces())
  // The Noto Latin family is always a fallback for templates whose base font is narrower.
  register(BASE_FAMILIES.sans.family, BASE_FAMILIES.sans.faces())
  const stack: string[] = [baseFamily.family]
  if (base !== "sans") stack.push(BASE_FAMILIES.sans.family)
  const missing: Script[] = []
  for (const script of scripts) {
    if (script === "latin") continue
    const bundled = SCRIPT_FAMILIES[script]
    if (bundled) {
      register(bundled.family, bundled.faces())
      if (registered.has(bundled.family)) stack.push(bundled.family)
      else missing.push(script)
      continue
    }
    const cjk = await ensureCjk(script)
    if (cjk) stack.push(cjk)
    else missing.push(script)
  }
  const primary = PRIMARY[language]
  if (primary) {
    const family = SCRIPT_FAMILIES[primary]?.family ?? CJK[primary]?.family
    const index = family ? stack.indexOf(family) : -1
    if (index > 0) stack.unshift(...stack.splice(index, 1))
  }
  return { stack, missing }
}
