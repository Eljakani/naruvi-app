import { api } from "@/server/integrations/api"
import { naruviData } from "@/server/mcp/data"
import { handleMcpRequest } from "@/server/mcp/server"

/** Fit analysis and document generation run a language model: allow them time. */
export const maxDuration = 300

/**
 * Naruvi's MCP server over Streamable HTTP (stateless, JSON responses).
 * Same `Authorization: Bearer nrv_…` key and rate limits as the rest of /api/v1.
 */
const handle = api((request: Request) => handleMcpRequest(naruviData, request))

export const POST = handle
/** Stateless: no server-sent event stream and no sessions to end. */
export const GET = handle
export const DELETE = handle
