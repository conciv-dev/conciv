import {test} from '@playwright/test'
import {runTrustPolicyInstall} from '../packed/trust-policy.js'

test('a fresh packed @conciv/it install resolves attested @pierre/theme and cytoscape under pnpm trustPolicy: no-downgrade (#520)', async () => {
  test.setTimeout(6 * 60_000)
  await runTrustPolicyInstall()
})
