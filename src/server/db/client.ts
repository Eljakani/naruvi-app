import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "@/lib/env"
import * as schema from "./schema"

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> }

// Reuse one pool across hot reloads in dev.
const sql = globalForDb.sql ?? postgres(env.DATABASE_URL, { max: 10 })
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql

export const db = drizzle(sql, { schema, casing: "snake_case" })
export type Db = typeof db
