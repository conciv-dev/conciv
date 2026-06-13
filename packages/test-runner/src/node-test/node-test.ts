import {defineRunner} from '@devgent/protocol/runner-types'

// Capability-only stub. Registered so listRunners() advertises it; create() throws until the
// node:test child lands. When implemented, switch to defineChildRunner and fill in
// node-test/child.ts (node:test run({files}) stream → TestEvent NDJSON on fd 3). node:test has
// no failed-only memory on a fresh child, so failedOnly:false.
export const nodeTest = defineRunner({
  id: 'node-test',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: false},
  create() {
    throw new Error('node-test runner not implemented')
  },
})
