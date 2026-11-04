/**
 * Queue worker. Workflow steps (fetch → parse → analyze → generate → compile
 * → check) are registered here as they land; for now it only proves the
 * queue is reachable and shuts down cleanly.
 */
import { config } from "dotenv"
import { PgBoss } from "pg-boss"

config({ path: ".env.local" })

const boss = new PgBoss(process.env.DATABASE_URL!)
boss.on("error", (error) => console.error("[worker]", error))

await boss.start()
console.log("[worker] queue ready")

const stop = async () => {
  await boss.stop({ graceful: true })
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
