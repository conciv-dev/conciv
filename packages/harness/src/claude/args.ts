import {randomUUID} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {HarnessImage, HarnessTurn} from '@aidx/protocol/harness-types'
import {AIDX_PLUGIN_DIR} from './plugin-dir.js'

// aidx tools (ui/page/test) reach the agent via MCP-over-HTTP, not Bash: point claude at our
// in-process server and allow the MCP tools so they run unprompted. --strict-mcp-config makes claude
// use ONLY our server, ignoring the user's own MCP servers — without it that tool flood buries
// aidx_* behind claude's deferred-tool search and the agent can't find them reliably. Shared by the
// chat turn (buildClaudeArgs) and the interactive "open in claude" launch so they cannot drift.
export function claudeMcpArgs(mcpUrl: string): string[] {
  return [
    '--mcp-config',
    JSON.stringify({mcpServers: {aidx: {type: 'http', url: mcpUrl}}}),
    '--strict-mcp-config',
    // Server-level allow: every tool the aidx MCP server exposes (ui/page/test/open + any future
    // tool) runs unprompted, so the allowlist can't drift as we add tools. --strict-mcp-config keeps
    // this to OUR server only, so it never blesses a user's MCP server.
    '--allowedTools',
    'mcp__aidx',
  ]
}

// PreToolUse http hook on Bash → the dev server's permission route. 600s (route denies sooner).
function hookSettings(permissionUrl: string): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [{matcher: 'Bash', hooks: [{type: 'http', url: permissionUrl, timeout: 600}]}],
    },
  })
}

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

// claude ingests images via `@<path>` file references in the prompt (inline base64 over stream-json
// is rejected by the CLI). Write each image under cwd (an allowed dir via --add-dir, so claude can
// read it) and return the space-joined refs.
function imageRefs(images: HarnessImage[], cwd: string): string {
  return images
    .map((img) => {
      const ext = IMAGE_EXT[img.mediaType] ?? 'png'
      const path = join(cwd, `.aidx-img-${randomUUID()}.${ext}`)
      writeFileSync(path, Buffer.from(img.dataBase64, 'base64'))
      return `@${path}`
    })
    .join(' ')
}

// The headless `claude -p` argv: stream-json, acceptEdits (git is the undo net), cwd allowed.
// systemPrompt is delivered as a file — turn.systemPrompt is the path the chat route wrote.
// Images are appended to the prompt as `@<temp-path>` file references (claude loads them).
export function buildClaudeArgs(turn: HarnessTurn): string[] {
  const prompt = turn.images?.length ? `${turn.prompt}\n\n${imageRefs(turn.images, turn.cwd)}` : turn.prompt
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    // Emit the raw Anthropic SSE too: message_start carries the full context at turn start, so the
    // widget's usage tracker fills live before the reply finishes.
    '--include-partial-messages',
    '--permission-mode',
    'acceptEdits',
    '--add-dir',
    turn.cwd,
  ]
  if (turn.mcpUrl) args.push(...claudeMcpArgs(turn.mcpUrl))
  if (AIDX_PLUGIN_DIR) args.push('--plugin-dir', AIDX_PLUGIN_DIR)
  if (turn.model) args.push('--model', turn.model)
  if (turn.permissionUrl) args.push('--settings', hookSettings(turn.permissionUrl))
  if (turn.systemPrompt) args.push('--append-system-prompt-file', turn.systemPrompt)
  if (turn.resumeSessionId) args.push('--resume', turn.resumeSessionId)
  return args
}

// Compaction turn: claude's `/compact` slash command, sent as the prompt against the resumed
// session. Validated headless (CLI 2.x): it streams a `compact_boundary` system event, writes the
// summary into the transcript, and returns no assistant text — the UI shows only a boundary divider.
// Reuses buildClaudeArgs so --resume/--model/MCP/plugin all carry over; the prompt is fixed and
// images are irrelevant to a compaction.
export function buildClaudeCompactArgs(turn: HarnessTurn): string[] {
  return buildClaudeArgs({...turn, prompt: '/compact', images: undefined})
}
