import {getHarness} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'

export function requireClaude(): HarnessAdapter {
  const adapter = getHarness('claude')
  if (!adapter) throw new Error('claude adapter not registered')
  return adapter
}

export function requireTranscriptPath(
  adapter: HarnessAdapter,
): (cwd: string, sessionId: string, home?: string) => string {
  const path = adapter.history?.transcriptPath
  if (!path) throw new Error(`${adapter.id} adapter exposes no transcript path`)
  return path
}
