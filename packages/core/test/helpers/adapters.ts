import {getHarness} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'

export function requireClaude(): HarnessAdapter {
  const adapter = getHarness('claude')
  if (!adapter) throw new Error('claude adapter not registered')
  return adapter
}
