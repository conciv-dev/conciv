import {execFile} from 'node:child_process'
import {readdirSync, symlinkSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {promisify} from 'node:util'
import {describe, expect, test} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'

describe('profiling a test run', () => {
  test('with CONCIV_TEST_CPU_PROF set the run leaves a CPU profile in that folder, and without it none is written', async ({
    signal,
  }) => {
    const run = promisify(execFile)
    const profiles = tempDir('profiles-')
    const workdir = tempDir('run-')
    writeFileSync(join(workdir, 'package.json'), '{}')
    symlinkSync(resolve('node_modules'), join(workdir, 'node_modules'))
    const command = [
      resolve('src/run-tests.ts'),
      '--root',
      process.cwd(),
      'src/run-tests.test.ts',
      '-t',
      'no test has this name',
      '--passWithNoTests',
      '--project=node',
    ]
    const env = {PATH: process.env.PATH}

    await Promise.all([
      run(process.execPath, command, {cwd: workdir, signal, env: {...env, CONCIV_TEST_CPU_PROF: profiles}}),
      run(process.execPath, command, {cwd: workdir, signal, env}),
    ])

    expect(readdirSync(profiles).filter((name) => name.endsWith('.cpuprofile')).length).toBeGreaterThan(0)
    expect(readdirSync(workdir).filter((name) => name.endsWith('.cpuprofile'))).toEqual([])
  })
})
