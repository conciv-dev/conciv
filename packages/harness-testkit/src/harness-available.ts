import {execSync} from 'node:child_process'
import type {HarnessAdapter} from '@conciv/harness'

export function harnessAvailable(harness: HarnessAdapter): boolean {
  try {
    execSync(`command -v ${harness.binName}`, {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}
