import {defineStubRunner} from '../driver.js'

// Capability-only stub for the seam-stressing e2e runner. Registered so listRunners() advertises
// it; create() throws until the playwright child lands. When implemented, switch to
// defineChildRunner and add a playwright/child.ts entry (run with --reporter=json via
// PLAYWRIGHT_JSON_OUTPUT_NAME → map the JSON report onto TestEvent). watch:false, failedOnly:false.
export const playwright = defineStubRunner({
  id: 'playwright',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: false},
  reason: 'playwright runner not implemented',
})
