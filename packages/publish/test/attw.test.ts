import {test, expect} from 'vitest'
import {execa} from 'execa'
import {fileURLToPath} from 'node:url'

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const grabDir = fileURLToPath(new URL('../../grab', import.meta.url))

test('attw subcommand packs with pnpm and passes flags through', {timeout: 120_000}, async () => {
  const result = await execa('node', [cli, 'attw', '--profile', 'esm-only'], {cwd: grabDir, reject: false})
  expect(result.exitCode, result.stderr + result.stdout).toBe(0)
})
