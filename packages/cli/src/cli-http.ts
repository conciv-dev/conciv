export function defaultOrigin(): string {
  const port = process.env.CONCIV_PORT ?? '5173'
  return `http://127.0.0.1:${port}`
}

export async function sendJson(method: 'GET' | 'POST', url: string, body?: Record<string, unknown>): Promise<string> {
  const sessionId = process.env.CONCIV_SESSION_ID
  const sessionHeader: Record<string, string> = sessionId ? {'conciv-session-id': sessionId} : {}
  const init: RequestInit =
    method === 'POST'
      ? {method, headers: {'content-type': 'application/json', ...sessionHeader}, body: JSON.stringify(body ?? {})}
      : {method, headers: sessionHeader}
  const res = await fetch(url, init)
  return res.text()
}
