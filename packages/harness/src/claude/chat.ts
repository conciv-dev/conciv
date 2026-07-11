import {randomUUID} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {ModelMessage} from '@tanstack/ai'
import {claudeCodeText} from '@tanstack/ai-claude-code'
import type {HarnessChatConfig, HarnessChatDeps, HarnessImage} from '@conciv/protocol/harness-types'
import {definedEntries} from '../_shared/env.js'
import {lastUserImages} from '../_shared/text-adapter.js'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'

const MCP_TOOL_TIMEOUT_MS = 150_000

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export function imageRefs(images: HarnessImage[], cwd: string): string {
  return images
    .map((img) => {
      const ext = IMAGE_EXT[img.mediaType] ?? 'png'
      const path = join(cwd, `.conciv-img-${randomUUID()}.${ext}`)
      writeFileSync(path, Buffer.from(img.dataBase64, 'base64'))
      return `@${path}`
    })
    .join(' ')
}

export function claudeExecutable(pluginDir: string | null): string {
  const flags = ['exec', 'claude', '--strict-mcp-config']
  if (pluginDir) flags.push('--plugin-dir', `'${pluginDir.replaceAll("'", `'\\''`)}'`)
  return flags.join(' ')
}

function withLastUserText(messages: ModelMessage[], text: string): ModelMessage[] {
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user')
  if (lastUserIndex === -1) return messages
  return messages.map((message, index) => (index === lastUserIndex ? {...message, content: text} : message))
}

function withImageRefs(messages: ModelMessage[], cwd: string): ModelMessage[] {
  const images = lastUserImages(messages)
  if (!images.length) return messages
  const refs = imageRefs(images, cwd)
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user')
  return messages.map((message, index) => {
    if (index !== lastUserIndex) return message
    if (typeof message.content === 'string' || message.content === null) {
      return {...message, content: `${message.content ?? ''}\n\n${refs}`}
    }
    return {...message, content: [...message.content, {type: 'text', content: refs}]}
  })
}

export const claudeChatConfig = (deps: HarnessChatDeps): HarnessChatConfig => ({
  adapter: claudeCodeText(deps.model ?? 'sonnet', {
    permissionMode: 'default',
    addDirs: [deps.cwd],
    claudeExecutable: claudeExecutable(CONCIV_PLUGIN_DIR),
    systemPromptMode: 'append',
    emitDiff: false,
    env: definedEntries({MCP_TOOL_TIMEOUT: String(MCP_TOOL_TIMEOUT_MS), ...deps.env}),
  }),
  modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
  prepareMessages: (messages) =>
    deps.kind === 'compact' ? withLastUserText(messages, '/compact') : withImageRefs(messages, deps.cwd),
})
