import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {createTestHarness, type TestHarness} from './create-test-harness.js'
import {harnessAvailable} from './harness-available.js'

export type HarnessMode =
  | {name: 'fake'; harness: TestHarness; run: true}
  | {name: 'real'; harness: HarnessAdapter; run: boolean}

function isCI(): boolean {
  return Boolean(process.env.CI)
}

export function harnessModes(real: HarnessAdapter): HarnessMode[] {
  return [
    {name: 'fake', harness: createTestHarness(real), run: true},
    {name: 'real', harness: real, run: !isCI() && harnessAvailable(real)},
  ]
}
