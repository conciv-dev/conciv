import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {existsSync, mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const require = createRequire(import.meta.url)
const tsxEntry = fileURLToPath(pathToFileURL(require.resolve('tsx')))
const fakeClaudePath = fileURLToPath(new URL('./fake-claude.ts', import.meta.url))
const readyFile = join(mkdtempSync(join(tmpdir(), 'orphan-sim-')), 'argv.json')

const child = spawn(process.execPath, ['--import', tsxEntry, fakeClaudePath], {
  stdio: 'ignore',
  env: {...process.env, CONCIV_FAKE_HANG: '1', CONCIV_TEST_ARGV_FILE: readyFile},
})

const poll = setInterval(() => {
  if (!existsSync(readyFile)) return
  clearInterval(poll)
  process.stdout.write(`READY ${child.pid}\n`)
  setInterval(() => {}, 1000)
}, 50)
