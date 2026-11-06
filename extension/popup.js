// Sends the current tab (link, title and visible text) to Naruvi as a job lead,
// then opens Naruvi to review it. Nothing is saved as a job until you check it there.
const api = globalThis.browser ?? globalThis.chrome
const $ = (id) => document.getElementById(id)

async function settings() {
  const { server = "http://localhost:3000", key = "" } = await api.storage.local.get(["server", "key"])
  return { server: server.replace(/\/+$/, ""), key }
}

async function main() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true })
  const { key } = await settings()
  $("settings").addEventListener("click", (event) => {
    event.preventDefault()
    api.runtime.openOptionsPage()
  })
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    $("page").textContent = "Open a job posting first."
    return
  }
  $("page").textContent = tab.title || tab.url
  if (!key) {
    $("status").textContent = "Add your Naruvi address and API key in Settings first."
    return
  }
  $("save").disabled = false
  $("save").addEventListener("click", async () => {
    $("save").disabled = true
    $("status").textContent = "Saving…"
    try {
      const [{ result }] = await api.scripting.executeScript({
        target: { tabId: tab.id },
        // Visible text only: no cookies, no form data, no HTML.
        func: () => (document.querySelector("main, article, [role=main]") ?? document.body).innerText.slice(0, 120000),
      })
      const { server, key } = await settings()
      const response = await fetch(`${server}/api/v1/captures`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ url: tab.url, title: tab.title ?? "", text: result ?? "" }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `Naruvi answered ${response.status}`)
      await api.tabs.create({ url: body.review })
      window.close()
    } catch (error) {
      $("status").textContent = error instanceof TypeError ? "Couldn't reach Naruvi. Is it running, and is the address right in Settings?" : error.message
      $("save").disabled = false
    }
  })
}

main()
