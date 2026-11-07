import "server-only"
import { createHash } from "node:crypto"
import { getProfile } from "@/server/profile/repository"

export async function getLiveContact() {
  const profile = await getProfile()
  if (!profile) return null
  return { email: profile.email, phone: profile.phone, location: profile.location, links: profile.links }
}

export function contactVersion(contact: Awaited<ReturnType<typeof getLiveContact>>) {
  return createHash("sha256").update(JSON.stringify(contact)).digest("hex").slice(0, 20)
}
