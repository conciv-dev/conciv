import {execFile} from 'node:child_process'
import {chmodSync, existsSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {delimiter, dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {tempDir} from '@internal/vitest-config/temp-dir'

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

export function recordedClaudeOnPath(): {bin: string; path: string; started: () => boolean} {
  const sdkEntry = createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk')
  const nativePackage = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`
  const native = join(dirname(createRequire(sdkEntry).resolve(nativePackage)), 'claude')
  const bin = tempDir('claude-on-path-')
  const startedFile = join(bin, 'started')
  writeFileSync(join(bin, 'claude'), `#!/bin/sh\ntouch '${startedFile}'\nexec '${native}' "$@"\n`)
  chmodSync(join(bin, 'claude'), 0o755)
  return {bin, path: `${bin}${delimiter}${process.env.PATH ?? ''}`, started: () => existsSync(startedFile)}
}

export function hungClaudeOnPath(): {path: string; release: () => void} {
  const bin = tempDir('hung-claude-on-path-')
  const releaseFile = join(bin, 'release')
  writeFileSync(join(bin, 'claude'), `#!/bin/sh\nwhile [ ! -e '${releaseFile}' ]; do sleep 0.1; done\nexit 1\n`)
  chmodSync(join(bin, 'claude'), 0o755)
  return {path: `${bin}${delimiter}${process.env.PATH ?? ''}`, release: () => writeFileSync(releaseFile, '')}
}
