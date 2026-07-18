export async function probeCore(token: string, ports: readonly number[], signal?: AbortSignal): Promise<string | null> {
  const attempts = ports.map(async (port) => {
    const base = `http://127.0.0.1:${port}/t/${token}`
    const response = await fetch(`${base}/health`, {signal})
    if (!response.ok) throw new Error(`port ${port} unhealthy`)
    return base
  })
  return Promise.any(attempts).catch(() => null)
}

export function preflight(token: string, timeoutMs: number, ports: readonly number[]): Promise<string | null> {
  return probeCore(token, ports, AbortSignal.timeout(timeoutMs))
}
