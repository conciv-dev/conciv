import {defineRunner} from '@devgent/protocol/runner-types'

// Capability-only stub (mirrors the harness gemini/opencode/pi stubs). Registered so
// listRunners() advertises it; create() throws until the jest child lands. When implemented,
// switch to defineChildRunner({childUrl, buildRunArgs, buildListArgs}) like vitest and fill in
// jest/child.ts (resolve the app's @jest/core runCLI → TestEvent NDJSON on fd 3).
export const jest = defineRunner({
  id: 'jest',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: true},
  create() {
    throw new Error('jest runner not implemented')
  },
})
