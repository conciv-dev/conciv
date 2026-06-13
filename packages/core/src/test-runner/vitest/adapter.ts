import {defineRunner} from '@devgent/protocol/runner-types'
import {makeVitestManager} from './manager.js'

// The inline vitest runner adapter, authored through defineRunner (never a bare object
// literal) — mirrors harness/claude/adapter.ts. Plan 3 moves this whole vitest/ folder into
// @devgent/runner/vitest and registers it the same way.
export const vitestRunner = defineRunner({
  id: 'vitest',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: true},
  create: (cwd: string) => makeVitestManager(cwd),
})
