# Save to Naruvi (browser extension)

Sends the job posting you're looking at to your own Naruvi: the link, the page title and the visible text. That works for pages behind a login (LinkedIn) that Naruvi can't read on its own. The page lands in **Jobs → Job leads**, and opens in **Add a job** so you can check it before saving.

It reads the current tab only when you click **Save this job**, and only its visible text: no cookies, no form data.

## Install (Chrome, Edge, Brave, Arc)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension` folder.
3. Right-click the extension icon → **Options**: enter your Naruvi address (default `http://localhost:3000`) and an API key from **Integrations → API & browser extension**.

## Install (Firefox 128+)

1. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** and pick `manifest.json`.
2. Open the add-on's preferences and enter the address and API key.
