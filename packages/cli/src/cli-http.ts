// The agent-facing CLIs (`devgent tools` / `devgent ui`) run inside the headless claude
// loop and call the dev server over plain localhost HTTP. No auth, no third-party client —
// native fetch is enough. The port is the one the vite plugin is serving on, passed to the
// claude child as DEVGENT_PORT (defaulting to vite's 5173).

export function defaultOrigin(): string {
  const port = process.env.DEVGENT_PORT ?? '5173'
  return `http://127.0.0.1:${port}`
}

export async function sendJson(method: 'GET' | 'POST', url: string, body?: Record<string, unknown>): Promise<string> {
  const init: RequestInit =
    method === 'POST'
      ? {method, headers: {'content-type': 'application/json'}, body: JSON.stringify(body ?? {})}
      : {method}
  const res = await fetch(url, init)
  return res.text()
}
