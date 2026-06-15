import {randomUUID} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {HarnessImage, HarnessTurn} from '@aidx/protocol/harness-types'
import {AIDX_PLUGIN_DIR} from './plugin-dir.js'

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
  // aidx tools (ui/page/test) reach the agent via MCP-over-HTTP, not Bash: point claude at our
  // in-process server and allow the MCP tools so they run unprompted. --strict-mcp-config makes
  // claude use ONLY our server, ignoring the user's own MCP servers — without it that tool flood
  // buries aidx_* behind claude's deferred-tool search and the agent can't find them reliably.
  if (turn.mcpUrl) {
    args.push('--mcp-config', JSON.stringify({mcpServers: {aidx: {type: 'http', url: turn.mcpUrl}}}))
    args.push('--strict-mcp-config')
    args.push('--allowedTools', 'mcp__aidx__aidx_ui', 'mcp__aidx__aidx_page', 'mcp__aidx__aidx_test')
  }
  // Bundled aidx-tools plugin: its react-introspection skill teaches the agent the page
  // locate/inspect/tree/find verbs on demand, so it stops hand-rolling fiber detection via eval.
  if (AIDX_PLUGIN_DIR) args.push('--plugin-dir', AIDX_PLUGIN_DIR)
  if (turn.permissionUrl) args.push('--settings', hookSettings(turn.permissionUrl))
  if (turn.systemPrompt) args.push('--append-system-prompt-file', turn.systemPrompt)
  if (turn.resumeSessionId) args.push('--resume', turn.resumeSessionId)
  return args
}
