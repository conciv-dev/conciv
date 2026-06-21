import {z} from 'zod'

const RunResult = z.object({result: z.unknown()})

export type RunTool = (name: string, input: unknown) => Promise<unknown>

export function createRunTool(apiBase: string, headers: () => Record<string, string>): RunTool {
  return async (name, input) => {
    const res = await fetch(`${apiBase}/api/tools/run`, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...headers()},
      body: JSON.stringify({name, input}),
    })
    if (!res.ok) throw new Error(`runTool ${name} failed: ${res.status}`)
    return RunResult.parse(await res.json()).result
  }
}
