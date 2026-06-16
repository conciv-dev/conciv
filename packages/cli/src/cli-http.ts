// The agent-facing CLIs (`aidx tools` / `aidx ui`) run inside the headless claude
// loop and call the dev server over plain localhost HTTP. No auth, no third-party client —
// native fetch is enough. The port is the one the vite plugin is serving on, passed to the
// claude child as AIDX_PORT (defaulting to vite's 5173).

export function defaultOrigin(): string {
  const port = process.env.AIDX_PORT ?? '5173'
  return `http://127.0.0.1:${port}`
}

export async function sendJson(method: 'GET' | 'POST', url: string, body?: Record<string, unknown>): Promise<string> {
  // The session id (injected into the agent's env as AIDX_SESSION_ID) rides every call so core
  // routes the agent's `aidx ui` / permission-hook requests to the originating turn's channel.
  const sessionId = process.env.AIDX_SESSION_ID
  const sessionHeader: Record<string, string> = sessionId ? {'aidx-session-id': sessionId} : {}
  const init: RequestInit =
    method === 'POST'
      ? {method, headers: {'content-type': 'application/json', ...sessionHeader}, body: JSON.stringify(body ?? {})}
      : {method, headers: sessionHeader}
  const res = await fetch(url, init)
  return res.text()
}
