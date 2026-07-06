import type {ModelMessage} from '@tanstack/ai'
import {claudeCodeText} from '@tanstack/ai-claude-code'
import type {HarnessChatConfig, HarnessChatDeps} from '@conciv/protocol/harness-types'
import {definedEntries} from '../_shared/env.js'
import {lastUserImages} from '../_shared/text-adapter.js'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'
import {imageRefs} from './args.js'

export function claudeExecutable(pluginDir: string | null): string {
  const flags = ['claude', '--strict-mcp-config']
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
    cwd: deps.cwd,
    permissionMode: 'acceptEdits',
    addDirs: [deps.cwd],
    claudeExecutable: claudeExecutable(CONCIV_PLUGIN_DIR),
    systemPromptMode: 'append',
    env: definedEntries(deps.env),
  }),
  modelOptions: {cwd: deps.cwd, ...(deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {})},
  prepareMessages: (messages) =>
    deps.kind === 'compact' ? withLastUserText(messages, '/compact') : withImageRefs(messages, deps.cwd),
})
