import {execFile} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

const CHILD_DEADLINE_MS = 20_000

const LIST_IN_CHILD = [
  "import {ConfigProvider} from 'effect'",
  "import {claude} from '@conciv/harness/claude'",
  'const history = claude(ConfigProvider.fromEnv()).history',
  'const page = await history.list({cwd: process.argv[1]}, {after: null, limit: 10})',
  'process.stdout.write(JSON.stringify(page))',
].join('\n')

export async function listClaudeSessionsInChild(configDir: string, cwd: string): Promise<unknown> {
  const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', LIST_IN_CHILD, cwd], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {...process.env, CLAUDE_CONFIG_DIR: configDir},
    timeout: CHILD_DEADLINE_MS,
    killSignal: 'SIGKILL',
  })
  return JSON.parse(stdout)
}
