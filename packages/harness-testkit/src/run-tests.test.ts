import {execFile} from 'node:child_process'
import {readdirSync} from 'node:fs'
import {promisify} from 'node:util'
import {describe, expect, test} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'

describe('profiling a test run', () => {
  test('with CONCIV_TEST_CPU_PROF set the run leaves a CPU profile in that folder, and without it none is written', async () => {
    const run = promisify(execFile)
    const folder = tempDir('profiles-')
    const command = [
      'dist/run-tests.js',
      'src/run-tests.test.ts',
      '-t',
      'no test has this name',
      '--passWithNoTests',
      '--project=node',
    ]

    await Promise.all([
      run(process.execPath, command, {env: {...process.env, CONCIV_TEST_CPU_PROF: folder}}),
      run(process.execPath, command, {env: {...process.env, CONCIV_TEST_CPU_PROF: undefined}}),
    ])

    expect(readdirSync(folder).filter((name) => name.endsWith('.cpuprofile')).length).toBeGreaterThan(0)
    expect(readdirSync('.').filter((name) => name.endsWith('.cpuprofile'))).toEqual([])
  })
})
