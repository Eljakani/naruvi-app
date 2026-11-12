import { ext, settings } from "./lib/api.js"
import { h, icon } from "./lib/dom.js"
import { t } from "./lib/i18n.js"

const $ = (id) => document.getElementById(id)
const text = { title: t.optTitle, lead: t.optLead, "l-server": t.address, "h-server": t.addressHint, connect: t.connectButton, manual: t.manualKey, "l-key": t.apiKey, "h-key": t.keyHint, save: t.test, open: t.openApp, "badge-title": t.badgeTitle, "badge-body": t.badgeBody, shortcuts: t.shortcuts, "s-open": t.shortcutOpen, "s-read": t.shortcutRead, "change-shortcuts": t.shortcutChange, privacy: t.privacy, "privacy-body": t.privacyBody }
for (const [id, value] of Object.entries(text)) $(id).textContent = value

const status = (kind, message) => $("status").replaceChildren(h(`div.alert.${kind}`, icon(kind === "success" ? "check" : "alert"), h("div.grow", message)))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const isLocal = (origin) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)

settings().then(({ server, key, badge }) => {
  $("server").value = server
  $("key").value = key
  $("badge").checked = badge
  if (key) $("open").hidden = false
})

/** The address typed in, with permission to reach it. localhost is allowed by default; any other address asks once. */
async function reachable() {
  const server = $("server").value.trim().replace(/\/+$/, "") || "http://localhost:3000"
  let origin
  try {
    origin = new URL(/^https?:\/\//.test(server) ? server : `https://${server}`).origin
  } catch {
    throw new Error(t.cantReach)
  }
  if (!isLocal(origin) && !(await ext.permissions.request({ origins: [`${origin}/*`] }))) throw new Error(t.refused)
  return origin
}

/** Checks the key against Naruvi, then keeps both in this browser. */
async function save(origin, key) {
  let response
  try {
    response = await fetch(`${origin}/api/v1/me`, { headers: { authorization: `Bearer ${key}` } })
  } catch {
    throw new Error(t.cantReach)
  }
  if (!response.ok) throw new Error(response.status === 401 ? t.badKey : `Naruvi answered ${response.status}.`)
  const me = await response.json().catch(() => ({}))
  await ext.storage.local.set({ server: origin, key })
  $("server").value = origin
  status("success", t.connected(me.name))
  $("open").hidden = false
}

/**
 * One-click connection: opens Naruvi's "Connect the extension" page, where you
 * approve while signed in. That page shows the new key in its own tab; only
 * this extension (allowed on that address) and you can read it there.
 */
async function waitForKey(tabId, origin) {
  const deadline = Date.now() + 10 * 60_000
  while (Date.now() < deadline) {
    await sleep(1000)
    try {
      await ext.tabs.get(tabId)
    } catch {
      throw new Error(t.connectClosed)
    }
    try {
      const [result] = await ext.scripting.executeScript({
        target: { tabId },
        args: [origin],
        func: (expected) => (location.origin === expected ? document.querySelector("[data-naruvi-extension-key]")?.getAttribute("data-naruvi-extension-key") ?? null : null),
      })
      const key = result?.result
      if (typeof key === "string" && /^nrv_[a-f0-9]{48}$/.test(key)) return key
    } catch {
      // Still loading, or on the sign-in page: keep waiting.
    }
  }
  throw new Error(t.connectTimeout)
}

$("connect").addEventListener("click", async () => {
  $("connect").disabled = true
  try {
    const origin = await reachable()
    const tab = await ext.tabs.create({ url: `${origin}/integrations/extension` })
    status("warning", t.connectWaiting)
    const key = await waitForKey(tab.id, origin)
    await save(origin, key)
    await ext.tabs.remove(tab.id).catch(() => {})
    const self = await ext.tabs.getCurrent?.()
    if (self?.id) ext.tabs.update(self.id, { active: true }).catch(() => {})
  } catch (error) {
    status("danger", error.message)
  } finally {
    $("connect").disabled = false
  }
})

$("save").addEventListener("click", async () => {
  $("save").disabled = true
  try {
    await save(await reachable(), $("key").value.trim())
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
