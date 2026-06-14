import {defineStubRunner} from '../driver.js'

// Capability-only stub. Registered so listRunners() advertises it; create() throws until the
// node:test child lands. When implemented, switch to defineChildRunner and add a node-test/child.ts
// entry (node:test run({files}) stream → TestEvent NDJSON on fd 3). No fresh-child failure memory,
// so failedOnly:false.
export const nodeTest = defineStubRunner({
  id: 'node-test',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: false},
  reason: 'node-test runner not implemented',
})
