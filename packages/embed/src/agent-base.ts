const AGENT_PATH = /^\/t\/([^/]+)\/?$/

export type EngineAddress = {apiBase: string; engineToken?: () => Promise<string>}

export function engineAddress(base: string): EngineAddress {
  const url = new URL(base)
  const agentToken = AGENT_PATH.exec(url.pathname)?.[1]
  if (agentToken === undefined) return {apiBase: url.href.replace(/\/$/, '')}
  return {apiBase: url.origin, engineToken: () => Promise.resolve(agentToken)}
}
