import assert from "node:assert/strict"
import test from "node:test"
import { siteLogoCandidates } from "../../jobs/logo-candidates"

test("ranks touch icons and JSON-LD logos above social banners", () => {
  const html = `<head>
    <meta property="og:image" content="/social-banner.png">
    <link rel="icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <script type="application/ld+json">{"@type":"Organization","logo":{"@type":"ImageObject","url":"https:\\/\\/cdn.acme.com\\/logo.svg"}}</script>
  </head><body><img class="site-logo" src="/img/acme-logo.png" alt="Acme"><img alt="Partner logo" src="/p.png"></body>`
  const ranked = siteLogoCandidates(html, "https://acme.com/")
  assert.deepEqual(
    ranked.map((item) => item.source),
    ["apple-touch-icon", "json-ld", "header-img", "og:image", "icon", "favicon-service"],
  )
  assert.equal(ranked[1].url, "https://cdn.acme.com/logo.svg")
  assert.equal(ranked.find((item) => item.source === "og:image")?.strictShape, true)
  assert.ok(!ranked.some((item) => item.url.endsWith("/p.png")))
})
