import {z} from 'zod'

const RunResult = z.object({result: z.unknown()})
const NeedsApprovalBody = z.object({needsApproval: z.literal(true), name: z.string(), input: z.unknown()})

export type RunTool = (name: string, input: unknown) => Promise<unknown>
export type NeedsApproval = z.infer<typeof NeedsApprovalBody>

export function isNeedsApproval(value: unknown): value is NeedsApproval {
  return NeedsApprovalBody.safeParse(value).success
}

async function postRun(
  apiBase: string,
  headers: () => Record<string, string>,
  body: {name: string; input: unknown; confirmed?: boolean},
): Promise<Response> {
  return fetch(`${apiBase}/api/tools/run`, {
    method: 'POST',
    headers: {'content-type': 'application/json', ...headers()},
    body: JSON.stringify(body),
  })
}

// The widget-direct caller. An `ask` tool returns the typed needs-approval discriminant (not a throw)
// so the caller can surface ApprovalModal and re-run via runToolApproved on confirm.
export function createRunTool(apiBase: string, headers: () => Record<string, string>): RunTool {
  return async (name, input) => {
    const res = await postRun(apiBase, headers, {name, input})
    if (res.status === 403) {
      const body = NeedsApprovalBody.safeParse(await res.json())
      if (body.success) return body.data
      throw new Error(`runTool ${name} failed: 403`)
    }
    if (!res.ok) throw new Error(`runTool ${name} failed: ${res.status}`)
    return RunResult.parse(await res.json()).result
  }
}

// Re-run a previously-gated tool after the user confirmed in ApprovalModal.
export function createRunToolApproved(apiBase: string, headers: () => Record<string, string>): RunTool {
  return async (name, input) => {
    const res = await postRun(apiBase, headers, {name, input, confirmed: true})
    if (!res.ok) throw new Error(`runToolApproved ${name} failed: ${res.status}`)
    return RunResult.parse(await res.json()).result
  }
}
