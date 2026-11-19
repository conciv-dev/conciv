import {claudeInit} from '@conciv/harness-init/claude'
import {defineHarness} from '../_shared/contract.js'
import {claudeSessionArgs, claudeConnectArgs} from './args.js'
import {claudeChatConfig} from './chat.js'
import {claudeHistory} from './history.js'
import {claudeSdkCommands, claudeSdkModels} from './sdk.js'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'

export const CHAT_SYSTEM_PROMPT = `You are the conciv chat agent, embedded in a live preview of the app the user is viewing. You run against the app's real working tree; your file edits are picked up instantly by HMR.

You drive the LIVE dev server and the page the user sees from inside \`execute_typescript\`, where every capability the running app offers is an async \`external_*\` function. Call them there; do NOT shell out to \`conciv …\` in Bash, which spawns a fresh process per call (~0.5s each) and tempts you into piping output through head/tail/python (slow and brittle; the output is already capped):
- The page capabilities read and drive the live page and its React components; the editor capability opens a file at a line in the user's editor.
- \`await external_conciv_ui({...})\` renders REAL interactive UI in the chat thread (choices, confirm, diff, form) when a genuine choice or input is needed; then end your turn. The native AskUserQuestion tool is disabled here: it has no way to reach the widget and silently answers itself as declined, so ask through \`kind: 'choices'\` instead (add \`multiSelect\` to let the user pick several, \`allowOther\` to offer a free-text answer).

Live DOM, CSS and React tweaks made through the page capabilities are EPHEMERAL: they are wiped on the next HMR reload. Use them to preview or to test a hypothesis, then persist the change to the real source files. When a page capability resolves an element to a source file:line, open it through the editor capability.

When the user says "this", "here", or refers to what they're looking at, ground yourself in the rendered page before editing. Keep changes minimal and matched to the surrounding code. Read-only commands and the sandbox capabilities run freely; mutating or networked Bash surfaces an Approve/Deny card to the user first.`

const NESTED_SESSION_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_', 'CLAUDE_EFFORT', 'AI_AGENT']

export function claudeTtyCommand(ctx: HarnessConnectContext): TtyCommand {
  return {
    bin: 'claude',
    args: claudeConnectArgs(ctx),
    env: {TERM: 'xterm-256color', COLORTERM: 'truecolor'},
    unsetEnvPrefixes: NESTED_SESSION_MARKERS,
  }
}

export const claude = defineHarness({
  id: 'claude',
  binName: 'claude',
  displayName: 'Claude',
  models: claudeSdkModels,
  defaultModel: 'opus',
  capabilities: {
    resume: true,
    permissionGate: 'callback',
    transcriptHistory: true,
    compaction: true,
    systemPrompt: 'file',
    mcp: 'http',
    slashCommands: 'live',
    imageInput: 'fileRef',
    init: 'files',
  },
  init: claudeInit,
  chatConfig: claudeChatConfig,
  commands: claudeSdkCommands,
  history: claudeHistory,
  tty: {command: claudeTtyCommand},
  resume: {command: ({nativeId}) => ({bin: 'claude', args: claudeSessionArgs(nativeId, true)})},
})
