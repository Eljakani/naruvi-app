import postgres from "postgres"
import { digest, token } from "./crypto"
const sql = postgres(process.env.DATABASE_URL!, { max: 3, onnotice: () => {} })
let ready: Promise<void> | undefined
export function initializeAuth() {
  return ready ??= (async () => {
    // Separate tables deliberately stay outside workspace imports/exports.
    await sql`CREATE TABLE IF NOT EXISTS naruvi_owner (id integer PRIMARY KEY CHECK(id=1), username text NOT NULL, password text NOT NULL)`
    await sql`CREATE TABLE IF NOT EXISTS naruvi_sessions (hash text PRIMARY KEY, expires timestamptz NOT NULL)`
    await sql`ALTER TABLE naruvi_sessions ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now()`
    await sql`CREATE TABLE IF NOT EXISTS naruvi_work_leases (scope text NOT NULL, id text PRIMARY KEY, expires timestamptz NOT NULL)`
    await sql`CREATE TABLE IF NOT EXISTS naruvi_auth_buckets (key text PRIMARY KEY, attempts integer NOT NULL, expires timestamptz NOT NULL)`
    await sql`CREATE INDEX IF NOT EXISTS naruvi_auth_buckets_expiry ON naruvi_auth_buckets(expires)`
    await sql`CREATE TABLE IF NOT EXISTS naruvi_bootstrap (id integer PRIMARY KEY CHECK(id=1), hash text NOT NULL, expires timestamptz NOT NULL)`
    await sql`CREATE TABLE IF NOT EXISTS naruvi_auth_limit (id integer PRIMARY KEY CHECK(id=1), attempts integer NOT NULL, until_at timestamptz NOT NULL)`
  })()
}
export async function hasOwner() {
  await initializeAuth()
  return (await sql`SELECT id FROM naruvi_owner WHERE id=1`).length > 0
}
/** Issues a fresh one-time owner setup link, or null once an owner exists. */
export async function issueSetupLink() {
  await initializeAuth()
  if (await hasOwner()) return null
  const secret = token()
  await sql`INSERT INTO naruvi_bootstrap VALUES (1, ${digest(secret)}, now() + interval '1 hour') ON CONFLICT(id) DO UPDATE SET hash=excluded.hash, expires=excluded.expires`
  return `${process.env.NARUVI_URL || "http://localhost:3000"}/auth/setup?token=${secret}`
}
export async function printSetupLink() {
  const link = await issueSetupLink()
  if (!link) return
  const command = process.env.NARUVI_DEPLOYMENT === "installer" ? "naruvi setup-link" : "npm run auth:setup-link"
  console.log(`\n[Naruvi] Create your owner account (expires in 1 hour):\n${link}\nKeep this link private. Run \`${command}\` for a new link.\n`)
}
export async function validSetup(value: string) {
  await initializeAuth()
  return !await hasOwner() && (await sql`SELECT id FROM naruvi_bootstrap WHERE id=1 AND hash=${digest(value)} AND expires>now()`).length > 0
}
export async function createOwner(secret: string, username: string, password: string) {
  return sql.begin(async tx => {
    const rows = await tx`DELETE FROM naruvi_bootstrap WHERE id=1 AND hash=${digest(secret)} AND expires>now() RETURNING id`
    if (!rows.length) return false
    const created = await tx`INSERT INTO naruvi_owner VALUES (1, ${username}, ${password}) ON CONFLICT DO NOTHING RETURNING id`
    return created.length > 0
  })
}
export async function owner() {
  await initializeAuth()
  return (await sql`SELECT username,password FROM naruvi_owner WHERE id=1`)[0]
}
export async function allowedAttempt() {
  await initializeAuth()
  // Global, database-backed budget prevents proxy-header spoofing and survives restarts.
  const rows = await sql`INSERT INTO naruvi_auth_limit VALUES (1,1,now()+interval '1 minute') ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN naruvi_auth_limit.until_at<now() THEN 1 ELSE naruvi_auth_limit.attempts+1 END, until_at=CASE WHEN naruvi_auth_limit.until_at<now() THEN now()+interval '1 minute' ELSE naruvi_auth_limit.until_at END RETURNING attempts`
  return rows[0].attempts <= 10
}
/** Atomic fixed-window counters, shared across processes. Only keyed hashes are stored. */
export async function rateLimit(key: string, limit: number, seconds: number) {
  await initializeAuth()
  await sql`DELETE FROM naruvi_auth_buckets WHERE expires < now()`
  const [row] = await sql`INSERT INTO naruvi_auth_buckets VALUES (${digest(key)},1,now()+${seconds}*interval '1 second') ON CONFLICT(key) DO UPDATE SET attempts=naruvi_auth_buckets.attempts+1 RETURNING attempts, greatest(1,ceil(extract(epoch FROM expires-now())))::integer AS retry`
  return { allowed: row.attempts <= limit, retry: Number(row.retry) }
}
export async function resetLimit(key: string) {
  await sql`DELETE FROM naruvi_auth_buckets WHERE key=${digest(key)}`
}
export async function newSession(expectedPasswordHash?: string) {
  const value = token()
  await sql.begin(async tx => {
    const [account] = await tx`SELECT id,password FROM naruvi_owner WHERE id=1 FOR UPDATE`
    if (expectedPasswordHash && account?.password !== expectedPasswordHash) throw new Error("Credentials changed during sign-in")
    await tx`DELETE FROM naruvi_sessions WHERE expires<now() OR last_seen<now()-interval '30 minutes'`
    await tx`DELETE FROM naruvi_sessions WHERE hash IN (SELECT hash FROM naruvi_sessions ORDER BY expires DESC,hash OFFSET 9)`
    await tx`INSERT INTO naruvi_sessions (hash,expires,last_seen) VALUES (${digest(value)},now()+interval '7 days',now())`
  })
  return value
}
export async function validSession(value: string, touch = true) {
  await initializeAuth()
  if (!/^[a-f0-9]{64}$/.test(value)) return false
  const rows = await sql`SELECT hash FROM naruvi_sessions WHERE hash=${digest(value)} AND expires>now() AND last_seen>now()-interval '30 minutes'`
  if (!rows.length) return false
  if (touch) await sql`UPDATE naruvi_sessions SET last_seen=now() WHERE hash=${digest(value)} AND last_seen<now()-interval '1 minute'`
  return true
}
export async function revokeSession(value: string) {
  await initializeAuth()
  if (!/^[a-f0-9]{64}$/.test(value)) return
  await sql`DELETE FROM naruvi_sessions WHERE hash=${digest(value)}`
}

/** Requires trusted terminal/database access; never exposed as a public HTTP endpoint. */
export async function resetOwnerPassword(passwordHash: string) {
  await initializeAuth()
  await sql.begin(async tx => {
    const rows = await tx`UPDATE naruvi_owner SET password=${passwordHash} WHERE id=1 RETURNING id`
    if (!rows.length) throw new Error("No owner account exists")
    await tx`DELETE FROM naruvi_sessions`
    await tx`DELETE FROM naruvi_bootstrap`
    await tx`DELETE FROM naruvi_auth_limit`
    await tx`DELETE FROM naruvi_auth_buckets`
  })
}
export async function closeAuth() { await sql.end() }

/** Database advisory lock makes admission atomic across application processes. */
export async function acquireWorkLease(scope: string, maximum: number, seconds: number) {
  await initializeAuth()
  const id = token()
  const admitted = await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`naruvi-work:${scope}`}))`
    await tx`DELETE FROM naruvi_work_leases WHERE expires<now()`
    const [row] = await tx`SELECT count(*)::integer AS n FROM naruvi_work_leases WHERE scope=${scope}`
    if (row.n >= maximum) return false
    await tx`INSERT INTO naruvi_work_leases VALUES (${scope},${id},now()+${seconds}*interval '1 second')`
    return true
  })
  if (!admitted) return null
  return async () => { await sql`DELETE FROM naruvi_work_leases WHERE id=${id}` }
}
