export async function resolveSession(apiBase: string, id?: string): Promise<string> {
  const response = await fetch(`${apiBase}/api/chat/session/resolve`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(id ? {id} : {}),
  })
  const parsed: unknown = await response.json()
  if (typeof parsed !== 'object' || parsed === null || !('sessionId' in parsed)) {
    throw new Error('resolve: response had no sessionId')
  }
  const {sessionId} = parsed
  if (typeof sessionId !== 'string') throw new Error('resolve: sessionId was not a string')
  return sessionId
}
