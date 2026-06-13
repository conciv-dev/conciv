import {defineRunner} from '@devgent/protocol/runner-types'

// Capability-only stub for the seam-stressing e2e runner. Registered so listRunners() advertises
// it; create() throws until the playwright child lands. When implemented, switch to
// defineChildRunner and fill in playwright/child.ts (run with --reporter=json via
// PLAYWRIGHT_JSON_OUTPUT_NAME → map the JSON report onto TestEvent). watch:false (no cheap e2e
// watch); failedOnly:false (no fresh-child failure memory).
export const playwright = defineRunner({
  id: 'playwright',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: false},
  create() {
    throw new Error('playwright runner not implemented')
  },
})
