import {execFileSync} from 'node:child_process'
import type {HarnessAdapter} from '@conciv/harness'

export function harnessAvailable(harness: HarnessAdapter): boolean {
  try {
    execFileSync('sh', ['-c', 'command -v "$1"', 'sh', harness.binName], {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}
