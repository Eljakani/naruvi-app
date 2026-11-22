#!/usr/bin/env node
/**
 * After `skybridge build`: bundles each view with its chunks and styles into one
 * self-contained HTML page (dist/inline/<view>.html).
 *
 * Skybridge's views load their scripts from this server's URL. A host that
 * renders views in its own sandbox (Claude Desktop with a local server) cannot
 * reach http://localhost:3200 from there, so the view would not load. An inline
 * page needs no network at all. src/inline-views.ts serves these pages.
 */
import { build } from "esbuild"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const assets = "dist/assets/assets"
const views = readdirSync("src/views").filter((file) => file.endsWith(".tsx")).map((file) => file.slice(0, -4))
const files = readdirSync(assets)
const style = files.find((file) => /^style-.*\.css$/.test(file))
const css = style ? readFileSync(join(assets, style), "utf8") : ""
mkdirSync("dist/inline", { recursive: true })

for (const view of views) {
  const entry = files.find((file) => new RegExp(`^${view}-[\\w-]{8}\\.js$`).test(file))
  if (!entry) throw new Error(`No built chunk for view "${view}" in ${assets}. Run skybridge build first.`)
  const result = await build({ entryPoints: [join(assets, entry)], bundle: true, format: "esm", minify: true, write: false, logLevel: "warning" })
  const js = result.outputFiles[0].text.replace(/<\/(script)/gi, "<\\/$1")
  const html = `<style>${css.replace(/<\/(style)/gi, "<\\/$1")}</style>\n<div id="root"></div>\n<script type="module">${js}</script>\n`
  writeFileSync(`dist/inline/${view}.html`, html)
  console.log(`inline view: dist/inline/${view}.html (${Math.round(html.length / 1024)} KB)`)
}
