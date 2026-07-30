import {join} from 'node:path'
import {defineHarness} from '@conciv/protocol/harness-types'
import {unsupportedChatConfig} from '../_shared/stub.js'
import {piHistory, sessionsDir} from './history.js'

export function piSessionArgs(cwd: string, harnessSessionId: string | null): string[] {
  if (!harnessSessionId) return []
  return ['--session', join(sessionsDir(cwd), `${harnessSessionId}.jsonl`)]
}

export const pi = defineHarness({
  id: 'pi',
  binName: 'pi',
  displayName: 'Pi',
  capabilities: {
    resume: false,
    permissionGate: 'none',
    transcriptHistory: true,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'none',
    slashCommands: 'none',
    imageInput: false,
  },
  chatConfig: unsupportedChatConfig('pi', 'pi'),
  history: piHistory,
  connect: {
    plan: (ctx) => ({
      argv: ['pi', ...piSessionArgs(ctx.cwd, ctx.harnessSessionId), ...(ctx.model ? ['--model', ctx.model] : [])],
      env: {},
      files: [],
    }),
  },
})
