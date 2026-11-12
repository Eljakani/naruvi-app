import { ext, settings } from "./lib/api.js"
import { h, icon } from "./lib/dom.js"
import { t } from "./lib/i18n.js"

const $ = (id) => document.getElementById(id)
const text = { title: t.optTitle, lead: t.optLead, "l-server": t.address, "l-key": t.apiKey, "h-key": t.keyHint, save: t.test, open: t.openApp, "badge-title": t.badgeTitle, "badge-body": t.badgeBody, shortcuts: t.shortcuts, "s-open": t.shortcutOpen, "s-read": t.shortcutRead, "change-shortcuts": t.shortcutChange, privacy: t.privacy, "privacy-body": t.privacyBody }
for (const [id, value] of Object.entries(text)) $(id).textContent = value

const status = (kind, message) => $("status").replaceChildren(h(`div.alert.${kind}`, icon(kind === "success" ? "check" : "alert"), h("div.grow", message)))
const isLocal = (origin) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)

settings().then(({ server, key, badge }) => {
  $("server").value = server
  $("key").value = key
  $("badge").checked = badge
  if (key) $("open").hidden = false
})

$("save").addEventListener("click", async () => {
  const server = $("server").value.trim().replace(/\/+$/, "") || "http://localhost:3000"
  const key = $("key").value.trim()
  $("save").disabled = true
  try {
    const origin = new URL(server).origin
    // localhost is allowed by default; any other address needs your permission once.
    if (!isLocal(origin) && !(await ext.permissions.request({ origins: [`${origin}/*`] }))) throw new Error(t.refused)
    let response
    try {
      response = await fetch(`${origin}/api/v1/me`, { headers: { authorization: `Bearer ${key}` } })
    } catch {
      throw new Error(t.cantReach)
    }
    if (!response.ok) throw new Error(response.status === 401 ? t.badKey : `Naruvi answered ${response.status}.`)
    const me = await response.json().catch(() => ({}))
    await ext.storage.local.set({ server: origin, key })
    status("success", t.connected(me.name))
    $("open").hidden = false
  } catch (error) {
    status("danger", error.message)
  } finally {
    $("save").disabled = false
  }
})

$("open").addEventListener("click", async () => ext.tabs.create({ url: (await settings()).server }))

$("badge").addEventListener("change", async (event) => {
  if (event.target.checked) {
    // Needed to see the address of the page you're on as you browse.
    const granted = await ext.permissions.request({ permissions: ["tabs"] })
    if (!granted) event.target.checked = false
  } else {
    await ext.permissions.remove({ permissions: ["tabs"] }).catch(() => {})
  }
  await ext.storage.local.set({ badge: event.target.checked })
})

$("change-shortcuts").addEventListener("click", () => {
  const firefox = typeof globalThis.browser !== "undefined" && navigator.userAgent.includes("Firefox")
  if (firefox) return ext.commands?.openShortcutSettings?.()
  ext.tabs.create({ url: "chrome://extensions/shortcuts" })
})
