// The popup renders the current tab's state (kept by background.js) and the "Today" view.
// Reading and saving happen in the background, so closing the popup never loses work.
import { appUrl, call, ext, settings } from "./lib/api.js"
import { looksLikePosting } from "./lib/capture.js"
import { h, icon, logo } from "./lib/dom.js"
import { errorText, t } from "./lib/i18n.js"

const $ = (id) => document.getElementById(id)
const view = $("view")
let tab = null
let me = null
let current = "page"
let readingTimer = null

const send = (message) => ext.runtime.sendMessage(message)
const stateKey = () => `tab:${tab?.id}`
async function tabState() {
  const state = (await ext.storage.session.get(stateKey()))[stateKey()] ?? null
  // A draft for a page this tab has left behind is stale.
  return state?.page?.url && tab?.url && state.page.url !== tab.url && state.phase !== "reading" ? null : state
}
async function openInApp(url) {
  await ext.tabs.create({ url: url.startsWith("http") ? url : await appUrl(url) })
  window.close()
}
const render = (...nodes) => {
  clearInterval(readingTimer)
  view.replaceChildren(h("div.stack.fade", ...nodes))
}
const hero = (art, title, body, ...actions) => h("div.hero", h("img", { src: `art/${art}.png`, alt: "", class: art === "working" ? "bob" : "" }), h("h2", title), body ? h("p", body) : null, actions.length ? h("div.row", { style: "margin-top:6px" }, ...actions) : null)
const button = (label, kind, onclick, iconName) => h(`button.btn.${kind}`, { type: "button", onclick }, iconName ? icon(iconName) : null, label)

/* ---------- page header card ---------- */

function pageCard(page) {
  let host = ""
  try { host = new URL(page.url).hostname.replace(/^www\./, "") } catch {}
  const fav = page.icon && /^https:/.test(page.icon) ? h("img.favicon", { src: page.icon, alt: "", referrerPolicy: "no-referrer" }) : null
  return h("div.card.soft", h("div.row", fav, h("div.grow", h("div.strong.clamp-2", page.title || page.url), h("div.tiny.muted.truncate", page.site || host))))
}

/* ---------- views ---------- */

function connectView() {
  $("tabs").hidden = true
  render(hero("hello", t.connectTitle, t.connectBody, button(t.connect, "primary", () => ext.runtime.openOptionsPage(), "settings")))
}

function offlineView(message) {
  render(hero("careful", t.offlineTitle, message || t.offlineBody, button(t.retry, "outline", () => boot(), "refresh"), button(t.settings, "ghost", () => ext.runtime.openOptionsPage())))
}

function readingView(state) {
  const items = t.readingSteps.map((label) => h("li", h("span.mark"), label))
  render(
    hero("working", t.reading, null),
    state.page ? pageCard(state.page) : null,
    h("ul.steps", items),
    h("p.tiny.muted.center", t.readingNote),
  )
  const tick = () => {
    const elapsed = (Date.now() - (state.at ?? Date.now())) / 1000
    const step = Math.min(items.length - 1, Math.floor(elapsed / 4))
    items.forEach((item, index) => (item.className = index < step ? "done" : index === step ? "now" : ""))
  }
  tick()
  readingTimer = setInterval(tick, 500)
}

function errorView(state) {
  if (state.offline) return offlineView()
  render(
    hero("careful", t.failedTitle, state.error),
    state.page ? pageCard(state.page) : null,
    h("div.grid-2", button(t.retry, "outline", () => send({ type: "read", tabId: tab.id }), "refresh"), button(t.saveLead, "ghost", () => send({ type: "lead", tabId: tab.id }), "bookmark")),
  )
}

function reviewView(state) {
  const draft = { ...state.draft }
  const saving = state.phase === "saving"
  const input = (name, label, attrs = {}) =>
    h("label.field", h("span.label", label), h("input.input", { value: draft[name] ?? "", disabled: saving, oninput: (event) => (draft[name] = event.target.value), ...attrs }))
  const confidence = Math.round((draft.parseConfidence ?? 0) * 100)
  const same = (state.duplicates ?? []).find((item) => item.sameLink)
  const similar = (state.duplicates ?? []).filter((item) => !item.sameLink)
  const facts = [draft.location && h("span.badge", icon("map"), draft.location), draft.remote && h("span.badge", draft.remote), draft.employmentType && h("span.badge", draft.employmentType), draft.salary && h("span.badge.success", draft.salary)].filter(Boolean)

  render(
    h(
      "div.card",
      h("div.row", { style: "align-items:flex-start" }, logo(state.logo, draft.company), h("div.grow", h("div.strong.clamp-2", draft.title || "—"), h("div.small.muted.truncate", draft.company || "—")), h(`span.badge.${confidence >= 80 ? "success" : confidence >= 50 ? "warning" : "danger"}`, h("span.dot"), t.confidence(confidence))),
      facts.length ? h("div.row", { style: "flex-wrap:wrap;margin-top:10px;gap:6px" }, facts) : null,
    ),
    same ? h("div.alert.warning", icon("copy"), h("div.grow", t.duplicateSame, " ", h("a", { href: "#", onclick: (e) => (e.preventDefault(), openInApp(same.open)) }, t.openIt))) : null,
    similar.length ? h("div.alert.warning", icon("copy"), h("div.grow", t.duplicateSimilar, similar.map((item) => h("div", h("a", { href: "#", onclick: (e) => (e.preventDefault(), openInApp(item.open)) }, `${item.title} · ${item.company}`))))) : null,
    state.error ? h("div.alert.danger", icon("alert"), h("div.grow", state.error)) : null,
    h("div.section-title", t.review),
    input("title", t.role),
    h("div.grid-2", input("company", t.company), input("location", t.location)),
    h("div.grid-2", input("remote", t.remote), input("employmentType", t.contract)),
    input("salary", t.salary),
    (draft.warnings ?? []).length ? h("p.tiny.muted", draft.warnings.slice(0, 2).join(" · ")) : null,
    h(
      "div.row",
      h("button.btn.primary.grow", { type: "button", disabled: saving, onclick: () => send({ type: "save", tabId: tab.id, draft }) }, icon(saving ? "refresh" : "check"), saving ? t.saving : t.saveTrack),
      h("button.btn.outline", { type: "button", disabled: saving, title: t.saveLeadHint, onclick: () => send({ type: "lead", tabId: tab.id }) }, icon("bookmark")),
      h("button.btn.ghost", { type: "button", disabled: saving, title: t.discard, onclick: () => send({ type: "reset", tabId: tab.id }) }, icon("x")),
    ),
  )
}

function savedView(state) {
  render(
    hero("done", t.savedTitle, t.savedBody),
    h("div.card", h("div.row", logo(state.logo, state.draft?.company), h("div.grow", h("div.strong.truncate", state.draft?.title), h("div.small.muted.truncate", state.draft?.company)), h("span.badge.success", icon("check"), t.status("draft")))),
    h("div.grid-2", button(t.openIt, "primary", () => openInApp(state.open), "external"), button(t.today, "outline", () => switchTo("today"), "list")),
  )
}

function leadView() {
  render(hero("done", t.savedTitle, t.leadSaved), button(t.openApp, "outline", () => openInApp("/jobs"), "external"))
}

function knownView(job) {
  render(
    h("div.alert.success", icon("check"), h("div.grow", t.alreadyTitle)),
    h("div.card", h("div.row", logo(job.logo, job.company), h("div.grow", h("div.strong.clamp-2", job.title), h("div.small.muted.truncate", job.company)), h("span.badge.brand", t.status(job.status)))),
    h("div.grid-2", button(t.openIt, "primary", () => openInApp(job.open), "external"), button(t.retry, "ghost", () => send({ type: "read", tabId: tab.id }), "refresh")),
  )
}

async function contactView(known) {
  const page = await send({ type: "capture", tabId: tab.id }).catch(() => null)
  const person = { ...(page?.person ?? {}) }
  const status = h("div")
  const save = h("button.btn.primary.block", { type: "button" }, icon("user"), t.saveContact)
  save.addEventListener("click", async () => {
    save.disabled = true
    const result = await send({ type: "contact", person, url: tab.url.replace(/[?#].*$/, "").replace(/\/$/, "") })
    status.replaceChildren(result?.ok ? h("div.alert.success", icon("check"), h("div.grow", t.contactSaved(person.name), " ", h("a", { href: "#", onclick: (e) => (e.preventDefault(), openInApp(result.open)) }, t.openIt))) : h("div.alert.danger", icon("alert"), h("div.grow", result?.error ?? t.failedTitle)))
    save.disabled = false
  })
  const input = (name, label) => h("label.field", h("span.label", label), h("input.input", { value: person[name] ?? "", oninput: (event) => (person[name] = event.target.value) }))
  render(
    known ? h("div.alert.success", icon("check"), h("div.grow", t.contactKnown)) : null,
    h("div.section-title", t.person),
    h("div.card", h("div.row", logo(person.photo, person.name, "round"), h("div.grow", h("div.strong.truncate", person.name || "—"), h("div.small.muted.clamp-2", person.title)))),
    input("name", t.name),
    input("title", t.headline),
    input("companyName", t.company),
    save,
    status,
    h("div.sep"),
    button(t.saveLead, "ghost", () => send({ type: "lead", tabId: tab.id }), "bookmark"),
  )
}

async function idleView() {
  const isProfile = /linkedin\.com\/in\//.test(tab.url)
  const known = await call(`/lookup?url=${encodeURIComponent(tab.url)}`, { timeout: 8000 }).catch(() => null)
  if (known?.job) return knownView(known.job)
  if (isProfile) return contactView(known?.contact)
  const page = await send({ type: "capture", tabId: tab.id }).catch(() => null)
  const posting = Boolean(page?.isPosting) || looksLikePosting(tab.url)
  // A posting: start reading straight away — that's why you clicked.
  if (posting) return send({ type: "read", tabId: tab.id })
  render(
    pageCard({ url: tab.url, title: tab.title, site: page?.site, icon: page?.icon || tab.favIconUrl }),
    h("p.small.muted", t.notPostingHint),
    button(t.readPosting, "primary block", () => send({ type: "read", tabId: tab.id }), "sparkles"),
    button(t.saveLead, "outline block", () => send({ type: "lead", tabId: tab.id }), "bookmark"),
  )
}

async function pageView() {
  if (!tab?.url || !/^https?:/.test(tab.url)) return render(hero("finding", t.noPageTitle, t.noPageBody))
  const state = await tabState()
  if (current !== "page") return
  if (!state) return idleView()
  if (state.phase === "reading") return readingView(state)
  if (state.phase === "draft" || state.phase === "saving") return reviewView(state)
  if (state.phase === "saved") return savedView(state)
  if (state.phase === "lead") return leadView()
  if (state.phase === "error") return errorView(state)
  return idleView()
}

/* ---------- today ---------- */

function row(iconName, title, subtitle, href) {
  return h("a.item", { href: "#", onclick: (e) => (e.preventDefault(), openInApp(href)) }, h("div.item-icon", icon(iconName)), h("div.grow", h("div.small.strong.truncate", title), subtitle ? h("div.tiny.muted.clamp-2", subtitle) : null))
}

async function todayView() {
  render(h("div.skeleton", { style: "height:36px" }), h("div.skeleton", { style: "height:120px" }))
  const search = h("input.input", { type: "search", placeholder: t.searchJobs })
  const results = h("div.list")
  let timer
  search.addEventListener("input", () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const q = search.value.trim()
      if (!q) return results.replaceChildren()
      const found = await call(`/jobs?q=${encodeURIComponent(q)}`).catch(() => ({ jobs: [] }))
      results.replaceChildren(...(found.jobs.length ? found.jobs.slice(0, 6).map((job) => row("bookmark", job.title, [job.company, job.location].filter(Boolean).join(" · "), job.applicationId ? `/applications/${job.applicationId}` : `/jobs/${job.id}`)) : [h("p.small.muted", t.noJobs)]))
    }, 220)
  })
  let data
  try {
    data = await call("/attention", { timeout: 15000 })
  } catch (error) {
    return error.offline ? offlineView() : render(h("div.alert.danger", icon("alert"), h("div.grow", errorText(error))))
  }
  if (current !== "today") return
  const section = (title, items) => (items.length ? [h("div.section-title", title), h("div.list", items)] : [])
  const replies = data.replies.slice(0, 4).map((r) => row("mail", `${r.company} · ${r.subject || r.title}`, r.suggestion || r.from, `/applications/${r.applicationId}`))
  const todo = data.todo.slice(0, 5).map((r) => row("list", `${r.title} · ${r.company}`, r.message || r.reason, `/applications/${r.applicationId}`))
  const upcoming = data.upcoming.slice(0, 4).map((r) => row("calendar", `${r.nextStep} · ${r.company}`, new Date(r.due).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), `/applications/${r.applicationId}`))
  const empty = !replies.length && !todo.length && !upcoming.length
  render(search, results, empty ? hero("done", t.todayEmpty, null) : null, ...section(t.replies, replies), ...section(t.todo, todo), ...section(t.upcoming, upcoming))
  const total = data.replies.length + data.todo.length
  $("tab-today").replaceChildren(t.today, total ? h("span.count", String(total)) : "")
}

/* ---------- shell ---------- */

function switchTo(name) {
  current = name
  $("tab-page").setAttribute("aria-selected", String(name === "page"))
  $("tab-today").setAttribute("aria-selected", String(name === "today"))
  return name === "page" ? pageView() : todayView()
}

async function boot() {
  const { key } = await settings()
  // `?tab=<id>` lets the popup be opened as a page for a given tab (screenshots, debugging).
  const pinned = Number(new URLSearchParams(location.search).get("tab"))
  ;[tab] = pinned ? [await ext.tabs.get(pinned)] : await ext.tabs.query({ active: true, currentWindow: true })
  if (!key) return connectView()
  try {
    me = await call("/me", { timeout: 6000 })
  } catch (error) {
    return error.status === 401 ? connectView() : offlineView()
  }
  $("greeting").textContent = t.hello(me.name)
  $("tabs").hidden = false
  // Count what's waiting, without blocking the page view.
  call("/attention", { timeout: 15000 }).then((data) => {
    const total = data.replies.length + data.todo.length
    if (total) $("tab-today").replaceChildren(t.today, h("span.count", String(total)))
  }, () => {})
  return switchTo("page")
}

$("settings").append(icon("settings"))
$("settings").title = t.settings
$("settings").addEventListener("click", () => ext.runtime.openOptionsPage())
$("tab-page").textContent = t.thisPage
$("tab-today").textContent = t.today
$("tab-page").addEventListener("click", () => switchTo("page"))
$("tab-today").addEventListener("click", () => switchTo("today"))
$("open-app").append(t.openApp, icon("external"))
$("open-app").addEventListener("click", (event) => (event.preventDefault(), openInApp("/")))
$("hint").replaceChildren(h("kbd", "Alt"), " ", h("kbd", "Shift"), " ", h("kbd", "S"))
$("hint").title = t.shortcutRead

// Re-render when the background worker moves this tab along.
ext.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && tab && changes[stateKey()] && current === "page") pageView()
})

boot()
