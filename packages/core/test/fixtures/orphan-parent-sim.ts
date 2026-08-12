import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'

const require = createRequire(import.meta.url)
const tsxEntry = fileURLToPath(pathToFileURL(require.resolve('tsx')))
const fakeClaudePath = fileURLToPath(new URL('./fake-claude.ts', import.meta.url))

const child = spawn(process.execPath, ['--import', tsxEntry, fakeClaudePath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {...process.env, CONCIV_FAKE_HANG: '1'},
  detached: true,
})

child.stdin.on('error', () => {})
child.stdout.on('error', () => {})
child.stderr.on('error', () => {})
child.stdin.write('{"role":"user","content":"hi"}')
child.stdin.end()
child.stdout.resume()
child.stderr.resume()

process.stdout.write(`READY ${child.pid}\n`)

setInterval(() => {}, 1000)
