import {execSync} from 'node:child_process'
import {describe, expect, it} from 'vitest'
import {execFileOutcome} from '../src/init/exec.js'

describe('execFileOutcome', () => {
  it('settles a nonzero code with the exit code and output when the child exits normally', async () => {
    const outcome = await execFileOutcome(
      'node',
      ['-e', 'process.stdout.write("hi"); process.exit(3)'],
      {cwd: process.cwd()},
      () => {},
    )
    expect(outcome).toEqual({code: 3, output: 'hi'})
  })

  it('reports a nonzero exit code and a signal note when the child is killed by a signal', async () => {
    const marker = `conciv-exec-outcome-test-${Date.now()}`
    const outcomePromise = execFileOutcome(
      'node',
      ['-e', `process.stdout.write(${JSON.stringify(marker)}); setInterval(() => {}, 100)`],
      {cwd: process.cwd()},
      () => {},
    )
    await new Promise((resolve) => setTimeout(resolve, 200))
    execSync(`pkill -SIGKILL -f ${marker}`)
    const outcome = await outcomePromise
    expect(outcome.code).not.toBe(0)
    expect(outcome.output).toContain(marker)
    expect(outcome.output).toContain('terminated by SIGKILL')
  }, 5000)
})
