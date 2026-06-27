export async function resolveSession(apiBase: string): Promise<string> {
  const res = await fetch(`${apiBase}/api/chat/session/resolve`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({}),
  })
  const body = (await res.json()) as {sessionId: string}
  return body.sessionId
}
