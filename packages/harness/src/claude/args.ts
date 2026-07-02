import {randomUUID} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {HarnessImage, HarnessTurn} from '@conciv/protocol/harness-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'

type McpHttpServer = {type: 'http'; url: string; headers?: Record<string, string>}

export function mcpServerConfig(mcpUrl: string, sessionId?: string): {conciv: McpHttpServer} {
  const conciv: McpHttpServer = {type: 'http', url: mcpUrl}
  return {conciv: sessionId ? {...conciv, headers: {[CONCIV_SESSION_HEADER]: sessionId}} : conciv}
}

export function claudeMcpArgs(mcpUrl: string, sessionId?: string): string[] {
  return ['--mcp-config', JSON.stringify({mcpServers: mcpServerConfig(mcpUrl, sessionId)}), '--strict-mcp-config']
}

function hookSettings(permissionUrl: string): string {
  const hooks = [{type: 'http', url: permissionUrl, timeout: 600}]
  return JSON.stringify({
    hooks: {
      PreToolUse: [
        {matcher: 'Bash', hooks},
        {matcher: 'mcp__conciv__.*', hooks},
      ],
    },
  })
}

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

export function buildClaudeArgs(turn: HarnessTurn): string[] {
  const prompt = turn.images?.length ? `${turn.prompt}\n\n${imageRefs(turn.images, turn.cwd)}` : turn.prompt
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',

    '--include-partial-messages',
    '--permission-mode',
    'acceptEdits',
    '--add-dir',
    turn.cwd,
  ]
  if (turn.mcpUrl) args.push(...claudeMcpArgs(turn.mcpUrl, turn.sessionId))
  if (CONCIV_PLUGIN_DIR) args.push('--plugin-dir', CONCIV_PLUGIN_DIR)
  if (turn.model) args.push('--model', turn.model)
  if (turn.permissionUrl) args.push('--settings', hookSettings(turn.permissionUrl))
  if (turn.systemPrompt) args.push('--append-system-prompt-file', turn.systemPrompt)
  if (turn.resumeSessionId) args.push('--resume', turn.resumeSessionId)
  return args
}

export function buildClaudeCompactArgs(turn: HarnessTurn): string[] {
  return buildClaudeArgs({...turn, prompt: '/compact', images: undefined})
}
