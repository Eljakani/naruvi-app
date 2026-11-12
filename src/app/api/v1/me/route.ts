import { api } from "@/server/integrations/api"
import { logoDataUrl } from "@/server/integrations/extension"
import { getProfile } from "@/server/profile/repository"

/** Lets a client check its address and key, and greet the person. */
export const GET = api(async () => {
  const profile = await getProfile().catch(() => null)
  return { app: "naruvi", api: 2, name: profile?.fullName ?? null, photo: await logoDataUrl(profile?.photoPath, 220 * 1024) }
})
