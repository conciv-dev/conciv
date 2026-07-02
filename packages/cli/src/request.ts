import {defaultOrigin, sendJson} from './cli-http.js'

export type CliRequest = {method: 'GET' | 'POST'; path: string; body?: Record<string, unknown>}

export function compact(o: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = String(v)
  }
  return out
}

export function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(compact(params))
  if (entries.length === 0) return ''
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
}

export async function runRequest(req: CliRequest): Promise<string> {
  return sendJson(req.method, `${defaultOrigin()}${req.path}`, req.body)
}

export async function runAndPrint(req: CliRequest): Promise<void> {
  process.stdout.write((await runRequest(req)) + '\n')
}
