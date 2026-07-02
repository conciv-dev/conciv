import {defineStubRunner} from '../runner/driver.js'

export const nodeTest = defineStubRunner({
  id: 'node-test',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: false},
  reason: 'node-test runner not implemented',
})
