import {randomUUID, createHash} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import type {ModelMessage} from '@conciv/types/chat-message-types'
import {claudeCode} from '../adapters/adapters.js'
import {concivStateDir, createConcivStateDir} from '@conciv/types/state-types'
import {FILE_REF_PREFIX, type HarnessChatDeps, type HarnessImage} from '@conciv/types/harness-types'
import {type HarnessChatConfig} from '../_shared/contract.js'
import {definedEntries} from '../_shared/env.js'
import {lastUserImages} from '../_shared/text-adapter.js'
import {CLAUDE_BIN} from './args.js'
import {claudePluginDir} from './plugin-dir.js'
import {tmpdir} from 'node:os'

const GIT_RISKS = [
  'push --force*',
  'push * --force*',
  'push -f*',
  'push * -f*',
  'push --delete*',
  'push * --delete*',
  'push -d*',
  'push * -d *',
  'push * :**',
  'reset --hard*',
  'reset * --hard*',
  'clean*',
  'branch -D*',
  'branch * -D*',
  'gc --prune*',
  'gc * --prune*',
]

export const CLAUDE_ASK_RULES = [
  ...GIT_RISKS.flatMap((risk) => [`Bash(git ${risk})`, `Bash(git * ${risk})`]),
  'Bash(rm -r*)',
  'Bash(rm -fr*)',
  'Bash(rm -R*)',
  'Bash(rm -fR*)',
  'Bash(rm * -r*)',
  'Bash(chmod -R*)',
  'Bash(chown -R*)',
  'Bash(sudo *)',
]

async function claudeAskSettingsFile(): Promise<string> {
  const settings = JSON.stringify({permissions: {ask: CLAUDE_ASK_RULES}})
  const digest = createHash('sha256').update(settings).digest('hex').slice(0, 16)
  const path = join(tmpdir(), `conciv-claude-settings-${digest}.json`)
  await writeFile(path, settings)
  return path
}

const MCP_TOOL_TIMEOUT_MS = 3_600_000

const BRIDGED_CONCIV_TOOLS = ['mcp__tanstack']

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export async function imageRefs(images: HarnessImage[], cwd: string): Promise<string> {
  const tmpDir = join(await createConcivStateDir(concivStateDir(cwd)), 'tmp')
  await mkdir(tmpDir, {recursive: true})
  const refs = await Promise.all(
    images.map(async (img) => {
      const ext = IMAGE_EXT[img.mediaType] ?? 'png'
      const path = join(tmpDir, `img-${randomUUID()}.${ext}`)
      await writeFile(path, Buffer.from(img.dataBase64, 'base64'))
      return `@${path}`
    }),
  )
  return refs.join(' ')
}

function spaceFreePath(flag: string, path: string): string {
  if (/\s/.test(path)) {
    throw new Error(
      `claudeExecutable: ${flag} path "${path}" contains whitespace. The claude harness cannot pass a path containing whitespace because @tanstack/ai-claude-code splits its executable string on plain spaces before spawning. Move it to a space-free path.`,
    )
  }
  return path
}

export function claudeExecutable(pluginDir: string | null, settingsFile: string | null = null): string {
  const flags = [CLAUDE_BIN, '--strict-mcp-config']
  if (pluginDir) flags.push('--plugin-dir', spaceFreePath('--plugin-dir', pluginDir))
  if (settingsFile) flags.push('--settings', spaceFreePath('--settings', settingsFile))
  return flags.join(' ')
}

function withLastUserText(messages: ModelMessage[], text: string): ModelMessage[] {
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user')
  if (lastUserIndex === -1) return messages
  return messages.map((message, index) => (index === lastUserIndex ? {...message, content: text} : message))
}

async function withImageRefs(messages: ModelMessage[], cwd: string): Promise<ModelMessage[]> {
  const images = lastUserImages(messages)
  if (!images.length) return messages
  const refsText = `${FILE_REF_PREFIX} ${await imageRefs(images, cwd)}`
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user')
  return messages.map((message, index) => {
    if (index !== lastUserIndex) return message
    if (typeof message.content === 'string' || message.content === null) {
      return {...message, content: `${message.content ?? ''}${refsText}`}
    }
    return {...message, content: [...message.content, {type: 'text', content: refsText}]}
  })
}

export const claudeChatConfig = async (deps: HarnessChatDeps): Promise<HarnessChatConfig> => ({
  adapter: claudeCode(deps.model ?? 'opus', {
    addDirs: [deps.cwd],
    claudeExecutable: claudeExecutable(await claudePluginDir(), await claudeAskSettingsFile()),
    systemPromptMode: 'append',
    emitDiff: false,
    allowedTools: BRIDGED_CONCIV_TOOLS,
    disallowedTools: ['AskUserQuestion'],
    env: definedEntries({
      MCP_TOOL_TIMEOUT: String(MCP_TOOL_TIMEOUT_MS),
      ENABLE_TOOL_SEARCH: 'false',
      ...deps.env,
      ...(deps.effort ? {CLAUDE_CODE_EFFORT_LEVEL: deps.effort} : {}),
    }),
  }),
  modelOptions: {permissionMode: 'auto', ...(deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {})},
  prepareMessages: async (messages) =>
    deps.kind === 'compact' ? withLastUserText(messages, '/compact') : withImageRefs(messages, deps.cwd),
})
