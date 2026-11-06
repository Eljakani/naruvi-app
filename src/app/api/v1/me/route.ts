import { api } from "@/server/integrations/api"

/** Lets a client check its address and key. */
export const GET = api(async () => ({ app: "naruvi", api: 1 }))
