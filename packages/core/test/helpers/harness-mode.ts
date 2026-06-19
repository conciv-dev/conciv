import {execSync} from 'node:child_process'

export const useFakeHarness = !!process.env.MANDARAX_CLAUDE_CLI

export function hasClaude(): boolean {
  try {
    execSync('command -v claude', {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}
