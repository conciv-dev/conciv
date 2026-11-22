import {execFile} from 'node:child_process'
import {delimiter} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

const LIST_IN_CHILD = [
  "import {ConfigProvider} from 'effect'",
  "import {claude} from '@conciv/harness/claude'",
  'const history = claude(ConfigProvider.fromEnv()).history',
  'const page = await history.list({cwd: process.argv[1]}, {after: null, limit: 10})',
  'process.stdout.write(JSON.stringify(page))',
].join('\n')

const MODELS_IN_CHILD = [
  "import {ConfigProvider} from 'effect'",
  "import {opencode} from '@conciv/harness/opencode'",
  'const models = await opencode(ConfigProvider.fromEnv()).models({signal: new AbortController().signal})',
  'process.stdout.write(JSON.stringify(models))',
].join('\n')

async function runInChild(script: string, args: string[], env: NodeJS.ProcessEnv): Promise<unknown> {
  const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, ...args], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env,
  })
  return JSON.parse(stdout)
}

export function listClaudeSessionsInChild(configDir: string, cwd: string): Promise<unknown> {
  return runInChild(LIST_IN_CHILD, [cwd], {...process.env, CLAUDE_CONFIG_DIR: configDir})
}

export function listOpencodeModelsInChild(binDir: string): Promise<unknown> {
  return runInChild(MODELS_IN_CHILD, [], {...process.env, PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`})
}
