// The agent-facing CLIs (`mandarax tools` / `mandarax ui`) run inside the headless claude
// loop and call the dev server over plain localhost HTTP. No auth, no third-party client —
// native fetch is enough. The port is the one the vite plugin is serving on, passed to the
// claude child as MANDARAX_PORT (defaulting to vite's 5173).

export function defaultOrigin(): string {
  const port = process.env.MANDARAX_PORT ?? '5173'
  return `http://127.0.0.1:${port}`
}

export async function sendJson(method: 'GET' | 'POST', url: string, body?: Record<string, unknown>): Promise<string> {
  // The session id (injected into the agent's env as MANDARAX_SESSION_ID) rides every call so core
  // routes the agent's `mandarax ui` / permission-hook requests to the originating turn's channel.
  const sessionId = process.env.MANDARAX_SESSION_ID
  const sessionHeader: Record<string, string> = sessionId ? {'mandarax-session-id': sessionId} : {}
  const init: RequestInit =
    method === 'POST'
      ? {method, headers: {'content-type': 'application/json', ...sessionHeader}, body: JSON.stringify(body ?? {})}
      : {method, headers: sessionHeader}
  const res = await fetch(url, init)
  return res.text()
}
