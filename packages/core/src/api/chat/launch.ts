import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {writeFileSync, chmodSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {platform} from 'node:os'
import type {HarnessLaunchContext, HarnessLaunchResult} from '@conciv/protocol/harness-types'
import type {ChatLaunch} from '@conciv/protocol/chat-types'
import type {ChatRuntime} from './chat-env.js'

export async function launchHarness(
  deps: ChatRuntime,
  opts: {sessionId: string | null; model?: string; origin: string},
): Promise<ChatLaunch> {
  if (!deps.harness.launch) return {supported: false, opened: false, command: null}
  const token = opts.sessionId ? ((await deps.store.get(opts.sessionId))?.harnessSessionId ?? null) : null
  const ctx: HarnessLaunchContext = {
    cwd: deps.cwd,
    sessionId: token || null,
    model: opts.model ?? null,
    mcpUrl: deps.harness.capabilities.mcp === 'http' ? `${opts.origin}/api/mcp` : null,
    openTerminal: (argv) => openTerminal(argv, deps.cwd),
    openUrl: (url) => openUrl(url),
  }
  const result = await deps.harness.launch(ctx)
  return {supported: true, opened: result.opened, command: result.command}
}

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

async function spawnTerminal(command: string): Promise<boolean> {
  switch (platform()) {
    case 'darwin': {
      const file = join(tmpdir(), `conciv-launch-${randomUUID()}.command`)

      writeFileSync(file, `#!/bin/bash\n${command}\nexec $SHELL\n`)
      chmodSync(file, 0o755)
      const terminalApp = macTerminalApp(process.env.TERM_PROGRAM)
      return spawnDetached('open', terminalApp ? ['-a', terminalApp, file] : [file])
    }
    case 'win32':
      return spawnDetached('cmd', ['/c', 'start', 'cmd', '/k', command])
    case 'linux':
      return spawnDetached('x-terminal-emulator', ['-e', 'bash', '-lc', `${command}; exec bash`])
    default:
      return false
  }
}

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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

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
