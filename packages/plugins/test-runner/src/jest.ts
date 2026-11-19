import {defineStubRunner} from './driver.js'

export const jest = defineStubRunner({
  id: 'jest',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: true},
  reason: 'jest runner not implemented',
})
