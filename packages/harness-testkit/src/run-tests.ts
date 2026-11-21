import {spawn} from 'node:child_process'
import {mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {isolatedEnv} from './isolated-env.js'

const VitestManifestSchema = z.object({bin: z.object({vitest: z.string()})})

function vitestEntry(): string {
  const manifest = createRequire(join(process.cwd(), 'package.json')).resolve('vitest/package.json')
  const {bin} = VitestManifestSchema.parse(JSON.parse(readFileSync(manifest, 'utf8')))
  return join(dirname(manifest), bin.vitest)
}

const entry = vitestEntry()
// oxlint-disable-next-line conciv/no-hand-made-temp-dir -- the test process's own home, as opencode's test runner: removed when vitest exits
const home = mkdtempSync(join(tmpdir(), 'conciv-test-home-'))
const temporary = join(home, 'tmp')
mkdirSync(temporary)

const child = spawn(process.execPath, [entry, 'run', ...process.argv.slice(2)], {
  env: isolatedEnv(process.env, home, temporary),
  stdio: 'inherit',
})
const interrupt = (): void => {
  child.kill('SIGINT')
}
const terminate = (): void => {
  child.kill('SIGTERM')
}
process.once('SIGINT', interrupt)
process.once('SIGTERM', terminate)
child.once('exit', (code, signal) => {
  process.off('SIGINT', interrupt)
  process.off('SIGTERM', terminate)
  rmSync(home, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  process.exitCode = code ?? (signal === null ? 1 : 128)
})
child.once('error', (error) => {
  rmSync(home, {recursive: true, force: true})
  process.exitCode = 1
  throw error
})
