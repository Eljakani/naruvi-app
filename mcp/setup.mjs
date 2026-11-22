#!/usr/bin/env node
/**
 * Prints ready-to-paste Naruvi MCP setup for an AI client, or adds it to
 * Claude Code directly.
 *
 *   npm run mcp:setup -- <client> [--http | --stdio] [--url <naruvi url>] [--app] [--install]
 *
 *   client     claude-code | claude-desktop | codex | cursor | vscode | all (default all)
 *   --http     connect to <url>/api/v1/mcp over Streamable HTTP (default when the client supports it)
 *   --stdio    run mcp/naruvi-mcp.mjs, which forwards to the same endpoint
 *   --url      where Naruvi runs (default: NARUVI_URL or http://localhost:3000)
 *   --app      connect the Naruvi MCP App (mcp-app/, port 3200) instead of the core server
 *   --install  Claude Code only: run `claude mcp add` (user scope) instead of printing it
 *
 * The API key is never written by this script: configs read it from the
 * NARUVI_API_KEY environment variable where the client supports that, and
 * show `nrv_…` where you paste the key yourself.
 */
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const CLIENTS = ["claude-code", "claude-desktop", "codex", "cursor", "vscode"]
const client = args.find((value) => !value.startsWith("--") && value !== option("--url")) ?? "all"
if (client !== "all" && !CLIENTS.includes(client)) {
  console.error(`Unknown client "${client}". Use one of: ${CLIENTS.join(", ")}, all.`)
  process.exit(1)
}

const url = (option("--url") ?? process.env.NARUVI_URL ?? "http://localhost:3000").replace(/\/+$/, "")
const app = flag("--app")
const endpoint = app ? (process.env.NARUVI_MCP_APP_URL ?? "http://localhost:3200/mcp") : `${url}/api/v1/mcp`
const name = app ? "naruvi-app" : "naruvi"
const script = join(dirname(fileURLToPath(import.meta.url)), "naruvi-mcp.mjs")
const stdio = flag("--stdio")
const stdioEnv = { NARUVI_URL: url, NARUVI_API_KEY: "nrv_…", ...(app ? { NARUVI_MCP_URL: endpoint } : {}) }
const quote = (value) => (/^[\w./:@-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`)

const sections = {
  "claude-code": () => {
    const command = stdio
      ? ["claude", "mcp", "add", "--scope", "user", name, ...Object.entries(stdioEnv).flatMap(([key, value]) => ["-e", `${key}=${key === "NARUVI_API_KEY" ? "${NARUVI_API_KEY}" : value}`]), "--", "node", script]
      : ["claude", "mcp", "add", "--scope", "user", "--transport", "http", name, endpoint, "--header", "Authorization: Bearer ${NARUVI_API_KEY}"]
    if (flag("--install")) {
      if (!process.env.NARUVI_API_KEY) {
        console.error("Set NARUVI_API_KEY first (export NARUVI_API_KEY=nrv_…), then run again with --install.")
        process.exit(1)
      }
      const resolved = command.map((part) => part.replace("${NARUVI_API_KEY}", process.env.NARUVI_API_KEY))
      const result = spawnSync(resolved[0], resolved.slice(1), { stdio: "inherit" })
      if (result.error) console.error(`Could not run claude: ${result.error.message}`)
      process.exit(result.status ?? 1)
    }
    return ["Claude Code (with NARUVI_API_KEY exported in your shell; add --install to run it):", command.map(quote).join(" ")]
  },
  "claude-desktop": () => [
    "Claude Desktop: Settings → Developer → Edit Config, then add to claude_desktop_config.json (stdio; paste your key):",
    JSON.stringify({ mcpServers: { [name]: { command: "node", args: [script], env: stdioEnv } } }, null, 2),
  ],
  codex: () => [
    "Codex: add to ~/.codex/config.toml (with NARUVI_API_KEY exported):",
    stdio
      ? [`[mcp_servers.${name}]`, `command = "node"`, `args = [${JSON.stringify(script)}]`, `env_vars = ["NARUVI_API_KEY"]`, "", `[mcp_servers.${name}.env]`, ...Object.entries(stdioEnv).filter(([key]) => key !== "NARUVI_API_KEY").map(([key, value]) => `${key} = ${JSON.stringify(value)}`)].join("\n")
      : [`[mcp_servers.${name}]`, `url = ${JSON.stringify(endpoint)}`, `bearer_token_env_var = "NARUVI_API_KEY"`, `tool_timeout_sec = 600`].join("\n"),
  ],
  cursor: () => [
    "Cursor: add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project), with NARUVI_API_KEY exported:",
    JSON.stringify({ mcpServers: { [name]: stdio ? { type: "stdio", command: "node", args: [script], env: { ...stdioEnv, NARUVI_API_KEY: "${env:NARUVI_API_KEY}" } } : { url: endpoint, headers: { Authorization: "Bearer ${env:NARUVI_API_KEY}" } } } }, null, 2),
  ],
  vscode: () => [
    "VS Code (Copilot agent mode): add to .vscode/mcp.json; VS Code asks for the key once and stores it securely:",
    JSON.stringify({ inputs: [{ type: "promptString", id: "naruvi-key", description: "Naruvi API key (nrv_…)", password: true }], servers: { [name]: stdio ? { type: "stdio", command: "node", args: [script], env: { ...stdioEnv, NARUVI_API_KEY: "${input:naruvi-key}" } } : { type: "http", url: endpoint, headers: { Authorization: "Bearer ${input:naruvi-key}" } } } }, null, 2),
  ],
}

console.log(`Naruvi ${app ? "MCP App" : "MCP server"}: ${stdio ? `node ${script} → ` : ""}${endpoint}\nCreate a key in Naruvi under Integrations → API & browser extension. More: docs/MCP.md\n`)
for (const key of client === "all" ? CLIENTS : [client]) console.log(`${sections[key]().join("\n")}\n`)
