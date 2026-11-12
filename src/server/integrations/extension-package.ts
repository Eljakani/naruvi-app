import "server-only"
import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { strToU8, zipSync, type Zippable } from "fflate"

const FOLDER = "naruvi-extension"

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    if (entry.name.startsWith(".")) return []
    return entry.isDirectory() ? files(path) : [path]
  }))
  return nested.flat()
}

/**
 * The browser extension as a zip with one folder to load unpacked. `server`
 * goes into naruvi.json so the extension opens already pointing at this
 * Naruvi; no key or other secret is ever included.
 */
export async function extensionZip(server: string): Promise<Uint8Array> {
  const root = join(process.cwd(), "extension")
  const zip: Zippable = {}
  for (const path of await files(root)) zip[`${FOLDER}/${relative(root, path).split("\\").join("/")}`] = new Uint8Array(await readFile(path))
  zip[`${FOLDER}/naruvi.json`] = strToU8(`${JSON.stringify({ server }, null, 2)}\n`)
  return zipSync(zip, { level: 6 })
}
