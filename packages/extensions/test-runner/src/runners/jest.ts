import {defineStubRunner} from '../runner/driver.js'

// Capability-only stub (mirrors the harness gemini/opencode/pi stubs). Registered so
// it advertises its capabilities via the adapters array; create() throws until the jest child lands. When implemented,
// switch to defineChildRunner({childUrl, buildRunArgs, buildListArgs}) like vitest and add a
// jest/child.ts entry (resolve the app's @jest/core runCLI → TestEvent NDJSON on fd 3).
export const jest = defineStubRunner({
  id: 'jest',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: true},
  reason: 'jest runner not implemented',
})
