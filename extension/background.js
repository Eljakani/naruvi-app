// Background worker: reads and saves pages without opening Naruvi, so you can close the
// popup mid-way. Each tab's progress lives in storage.session under `tab:<id>`, which the
// popup renders; the toolbar badge tells you when a draft is ready.
import { call, ext, settings } from "./lib/api.js"
import { capturePage, looksLikePosting } from "./lib/capture.js"
import { errorText, t } from "./lib/i18n.js"

const BRAND = "#8a4a22"
const key = (tabId) => `tab:${tabId}`

export async function getState(tabId) {
  return (await ext.storage.session.get(key(tabId)))[key(tabId)] ?? null
}
async function setState(tabId, value) {
  if (value) await ext.storage.session.set({ [key(tabId)]: { ...value, at: Date.now() } })
  else await ext.storage.session.remove(key(tabId))
  await paintBadge(tabId, value)
}

async function paintBadge(tabId, state) {
  const look = {
    reading: ["…", "#71717a"],
    draft: ["1", BRAND],
    saved: ["✓", "#15803d"],
    known: ["✓", "#15803d"],
    lead: ["✓", "#15803d"],
    error: ["!", "#b91c1c"],
  }[state?.phase] ?? ["", BRAND]
  await ext.action.setBadgeText({ tabId, text: look[0] }).catch(() => {})
  await ext.action.setBadgeBackgroundColor({ tabId, color: look[1] }).catch(() => {})
  ext.action.setBadgeTextColor?.({ tabId, color: "#ffffff" })?.catch?.(() => {})
}

async function capture(tabId) {
  const [{ result }] = await ext.scripting.executeScript({ target: { tabId }, func: capturePage })
  if (!result) throw new Error("Couldn't read this page.")
  return result
}

/** Read the posting in the tab into a draft (nothing is saved yet). */
async function read(tabId) {
  const current = await getState(tabId)
  if (current?.phase === "reading" && Date.now() - current.at < 120_000) return
  let page
  try {
    page = await capture(tabId)
  } catch (error) {
    return setState(tabId, { phase: "error", error: errorText(error) })
  }
  const meta = { url: page.url, title: page.title, site: page.site, icon: page.icon }
  await setState(tabId, { phase: "reading", page: meta })
  try {
    const result = await call("/jobs/preview", { method: "POST", body: { url: page.url, text: page.text, html: page.html }, timeout: 150_000 })
    // The tab may have moved on meanwhile: keep the result only if it's still the same page.
    const latest = await getState(tabId)
    if (latest?.page?.url !== page.url) return
    await setState(tabId, { phase: "draft", page: meta, draft: result.draft, logo: result.logo, duplicates: result.duplicates ?? [] })
  } catch (error) {
    await setState(tabId, { phase: "error", page: meta, error: errorText(error), offline: Boolean(error.offline) })
  }
}

async function save(tabId, draft) {
  const state = await getState(tabId)
  await setState(tabId, { ...state, phase: "saving" })
  try {
    const result = await call("/jobs", { method: "POST", body: draft })
    await setState(tabId, { ...state, phase: "saved", draft, open: result.open })
  } catch (error) {
    await setState(tabId, { ...state, phase: "draft", error: errorText(error) })
  }
}

/** Keep the page as a lead (no AI, instant). */
async function keepLead(tabId, url) {
  const state = await getState(tabId)
  try {
    const page = url ? { url, title: "", text: "" } : await capture(tabId)
    await call("/captures", { method: "POST", body: { url: page.url, title: page.title ?? "", text: page.text ?? "" } })
    if (!url) await setState(tabId, { ...state, phase: "lead", page: state?.page ?? { url: page.url, title: page.title, site: page.site, icon: page.icon } })
    return { ok: true }
  } catch (error) {
    if (!url) await setState(tabId, { ...state, phase: "error", error: errorText(error) })
    return { ok: false, error: errorText(error) }
  }
}

async function saveContact(person, linkedinUrl) {
  try {
    const result = await call("/contacts", { method: "POST", body: { name: person.name, title: person.title ?? "", companyName: person.companyName ?? "", linkedinUrl } })
    return { ok: true, open: result.open }
  } catch (error) {
    return { ok: false, error: errorText(error) }
  }
}

/* ---------- messages from the popup ---------- */

ext.runtime.onMessage.addListener((message, _sender, reply) => {
  const run = {
    read: () => read(message.tabId),
    save: () => save(message.tabId, message.draft),
    lead: () => keepLead(message.tabId),
    contact: () => saveContact(message.person, message.url),
    reset: () => setState(message.tabId, null),
    capture: () => capture(message.tabId),
  }[message?.type]
  if (!run) return false
  Promise.resolve(run()).then(reply, (error) => reply({ ok: false, error: errorText(error) }))
  return true
})

/* ---------- shortcuts and right-click ---------- */

ext.commands?.onCommand.addListener(async (command, tab) => {
  if (command !== "read-page") return
  const target = tab ?? (await ext.tabs.query({ active: true, currentWindow: true }))[0]
  if (target?.id && /^https?:/.test(target.url ?? "https:")) read(target.id)
})

function installMenus() {
  ext.contextMenus.removeAll(() => {
    ext.contextMenus.create({ id: "naruvi-page", title: t.menuPage, contexts: ["page"], documentUrlPatterns: ["http://*/*", "https://*/*"] })
    ext.contextMenus.create({ id: "naruvi-link", title: t.menuLink, contexts: ["link"], targetUrlPatterns: ["http://*/*", "https://*/*"] })
  })
}
ext.runtime.onInstalled.addListener(installMenus)
ext.runtime.onStartup?.addListener(installMenus)

ext.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return
  if (info.menuItemId === "naruvi-page") read(tab.id)
  if (info.menuItemId === "naruvi-link" && info.linkUrl) {
    const result = await keepLead(tab.id, info.linkUrl)
    await ext.action.setBadgeText({ tabId: tab.id, text: result.ok ? "+1" : "!" }).catch(() => {})
    await ext.action.setBadgeBackgroundColor({ tabId: tab.id, color: result.ok ? "#15803d" : "#b91c1c" }).catch(() => {})
  }
})

/* ---------- forget a tab's draft when it navigates; optionally mark known pages ---------- */

ext.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (!change.url && change.status !== "complete") return
  const state = await getState(tabId)
  const url = change.url ?? tab.url
  if (state?.page?.url && url && state.page.url !== url && state.phase !== "reading") await setState(tabId, null)
  if (change.status !== "complete" || !tab.url || !/^https?:/.test(tab.url)) return
  const { badge, key: apiKey } = await settings()
  if (!badge || !apiKey || (await getState(tabId))) return
  // Only for pages worth checking, to keep traffic to your Naruvi low.
  if (!looksLikePosting(tab.url) && !/linkedin\.com\/in\//.test(tab.url)) return
  const known = await call(`/lookup?url=${encodeURIComponent(tab.url)}`, { timeout: 8000 }).catch(() => null)
  if (known?.job || known?.contact) await paintBadge(tabId, { phase: "known" })
})

ext.tabs.onRemoved.addListener((tabId) => ext.storage.session.remove(key(tabId)))
