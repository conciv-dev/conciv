import {defaultOrigin, sendJson} from './cli-http.js'

// Every CLI command reduces to one of these — a method + path (+ JSON body for POST) against
// the dev server's /api/* surface. citty parses argv, zod validates it, and a builder
// produces this; runRequest sends it.
export type CliRequest = {method: 'GET' | 'POST'; path: string; body?: Record<string, unknown>}

// Drop undefined/empty entries — the server treats an absent param as unset.
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
