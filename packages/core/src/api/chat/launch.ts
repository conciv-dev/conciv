import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {writeFileSync, chmodSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {platform} from 'node:os'
import {type H3, readValidatedBody} from 'h3'
import type {HarnessAdapter, HarnessLaunchContext, HarnessLaunchResult} from '@aidx/protocol/harness-types'
import {ChatLaunchRequestSchema, type ChatLaunch} from '@aidx/protocol/chat-types'
import type {SessionLookup} from './session.js'
import {sessionIdFromHeaders} from './session-id.js'

// "Open in <harness>": build the harness's launch context (carrying the same model + mcpUrl the
// chat turn uses), let the harness pick its interactive argv, and open it in a local terminal.
// Core owns ALL the open logic here; the harness only builds argv.

export type LaunchRouteDeps = {
  cwd: string
  harness: HarnessAdapter
  sessionFor: SessionLookup
}

//   POST /api/chat/launch → {supported, opened, command} — launches the header session's transcript
export function registerLaunchRoutes(app: H3, deps: LaunchRouteDeps): void {
  app.post('/api/chat/launch', async (event): Promise<ChatLaunch> => {
    if (!deps.harness.launch) return {supported: false, opened: false, command: null}
    const {model} = await readValidatedBody(event, ChatLaunchRequestSchema)
    const token = deps.sessionFor(sessionIdFromHeaders(event.req.headers)).harnessSessionId
    const origin = `http://${event.req.headers.get('host') ?? '127.0.0.1:3000'}`
    const ctx: HarnessLaunchContext = {
      cwd: deps.cwd,
      sessionId: token || null,
      model: model ?? null,
      mcpUrl: deps.harness.capabilities.mcp === 'http' ? `${origin}/api/mcp` : null,
      openTerminal: (argv) => openTerminal(argv, deps.cwd),
      openUrl: (url) => openUrl(url),
    }
    const result = await deps.harness.launch(ctx)
    return {supported: true, opened: result.opened, command: result.command}
  })
}

// Run `argv` in an interactive terminal at cwd. The resolved command is the paste-able fallback;
// `opened` reflects whether the per-OS terminal actually spawned.
async function openTerminal(argv: string[], cwd: string): Promise<HarnessLaunchResult> {
  const command = `cd ${shellQuote(cwd)} && ${argv.map(shellQuote).join(' ')}`
  const opened = await spawnTerminal(command)
  return {opened, command}
}

async function openUrl(url: string): Promise<HarnessLaunchResult> {
  const invocation = urlOpener(url)
  const opened = invocation ? await spawnDetached(invocation[0], invocation[1]) : false
  return {opened, command: url}
}

// Open a fresh OS terminal running `command`. macOS writes a temp *.command and `open`s it (targeting
// the user's terminal via $TERM_PROGRAM when known); Windows uses `start`; Linux tries the
// Debian-alternatives `x-terminal-emulator`. Returns whether the child spawned.
async function spawnTerminal(command: string): Promise<boolean> {
  switch (platform()) {
    case 'darwin': {
      const file = join(tmpdir(), `aidx-launch-${randomUUID()}.command`)
      // exec $SHELL keeps the window alive after the CLI exits, so errors stay visible.
      writeFileSync(file, `#!/bin/bash\n${command}\nexec $SHELL\n`)
      chmodSync(file, 0o755)
      const app = macTerminalApp(process.env.TERM_PROGRAM)
      return spawnDetached('open', app ? ['-a', app, file] : [file])
    }
    case 'win32':
      return spawnDetached('cmd', ['/c', 'start', 'cmd', '/k', command])
    case 'linux':
      return spawnDetached('x-terminal-emulator', ['-e', 'bash', '-lc', `${command}; exec bash`])
    default:
      return false
  }
}

// Map $TERM_PROGRAM (inherited from the terminal that launched the dev server) to its app name.
// null → `open <file>` uses the OS default .command handler.
function macTerminalApp(termProgram: string | undefined): string | null {
  switch (termProgram) {
    case 'iTerm.app':
      return 'iTerm'
    case 'Apple_Terminal':
      return 'Terminal'
    case 'WarpTerminal':
      return 'Warp'
    case 'WezTerm':
      return 'WezTerm'
    case 'ghostty':
      return 'Ghostty'
    case 'Hyper':
      return 'Hyper'
    case 'kitty':
      return 'kitty'
    default:
      return null
  }
}

function urlOpener(url: string): [string, string[]] | null {
  switch (platform()) {
    case 'darwin':
      return ['open', [url]]
    case 'win32':
      return ['cmd', ['/c', 'start', '', url]]
    case 'linux':
      return ['xdg-open', [url]]
    default:
      return null
  }
}

// POSIX single-quote (cwd/args may contain spaces): close, escaped literal quote, reopen.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

// Spawn detached + unref'd so the terminal outlives the dev server. Resolves true on 'spawn', false
// if the binary is missing or spawning fails.
function spawnDetached(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {detached: true, stdio: 'ignore'})
    child.once('spawn', () => {
      child.unref()
      resolve(true)
    })
    child.once('error', () => resolve(false))
  })
}
