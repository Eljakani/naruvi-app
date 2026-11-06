const api = globalThis.browser ?? globalThis.chrome
const $ = (id) => document.getElementById(id)

api.storage.local.get(["server", "key"]).then(({ server = "http://localhost:3000", key = "" }) => {
  $("server").value = server
  $("key").value = key
})

$("save").addEventListener("click", async () => {
  const server = $("server").value.trim().replace(/\/+$/, "") || "http://localhost:3000"
  const key = $("key").value.trim()
  try {
    const origin = new URL(server).origin
    // localhost is allowed by default; any other address needs your permission once.
    if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      const granted = await api.permissions.request({ origins: [`${origin}/*`] })
      if (!granted) throw new Error("Permission to reach that address was refused.")
    }
    const response = await fetch(`${origin}/api/v1/me`, { headers: { authorization: `Bearer ${key}` } })
    if (!response.ok) throw new Error(response.status === 401 ? "Naruvi didn't accept that API key." : `Naruvi answered ${response.status}.`)
    await api.storage.local.set({ server: origin, key })
    $("status").textContent = "Saved. Connected to Naruvi."
  } catch (error) {
    $("status").textContent = error instanceof TypeError ? "Couldn't reach Naruvi at that address." : error.message
  }
})
