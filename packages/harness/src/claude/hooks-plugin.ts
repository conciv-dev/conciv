import {join} from 'node:path'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {concivHooksPluginDir} from '@conciv/protocol/state-types'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'
import type {HookEventName} from '@conciv/session-observer/types'

export const CLAUDE_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SessionEnd',
] as const satisfies readonly HookEventName[]

const HOOK_TIMEOUT_SECONDS = 3
const SESSION_END_TIMEOUT_SECONDS = 1

export type ClaudeHooksPluginOptions = {stateDir: string; concivSessionId: string; hookUrl: string}

export type ClaudeHooksManifestOptions = {concivSessionId?: string; hookUrl: string}

export function claudeHooksManifest(opts: ClaudeHooksManifestOptions): string {
  const headers = opts.concivSessionId ? {headers: {[CONCIV_SESSION_HEADER]: opts.concivSessionId}} : {}
  const hooks = Object.fromEntries(
    CLAUDE_HOOK_EVENTS.map((event) => [
      event,
      [
        {
          hooks: [
            {
              type: 'http',
              url: opts.hookUrl,
              ...headers,
              timeout: event === 'SessionEnd' ? SESSION_END_TIMEOUT_SECONDS : HOOK_TIMEOUT_SECONDS,
            },
          ],
        },
      ],
    ]),
  )
  return `${JSON.stringify({hooks}, null, 2)}\n`
}

function pluginManifest(): string {
  return `${JSON.stringify(
    {
      name: 'conciv-hooks',
      version: '0.0.0',
      description: 'Reports claude session lifecycle events back to the conciv widget.',
      author: {name: 'conciv'},
    },
    null,
    2,
  )}\n`
}

export function claudeHooksPluginFiles(opts: ClaudeHooksPluginOptions): HarnessConnectFile[] {
  const dir = concivHooksPluginDir(opts.stateDir, opts.concivSessionId)
  return [
    {path: join(dir, '.claude-plugin', 'plugin.json'), contents: pluginManifest()},
    {path: join(dir, 'hooks', 'hooks.json'), contents: claudeHooksManifest(opts)},
  ]
}
