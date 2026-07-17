import {intro, log, note, outro, spinner} from '@clack/prompts'
import {defineCommand, runMain} from 'citty'
import {runConnect, type ConnectEvent} from './connect.js'

export function plainLines(event: ConnectEvent): string[] {
  if (event.type === 'seeded') {
    return [
      event.seeded ? 'workspace seeded with the landing-page source' : 'no source manifest found — continuing unseeded',
    ]
  }
  if (event.type === 'started') {
    return [
      `connected: conciv core on 127.0.0.1:${event.port} (harness: ${event.harness})`,
      'return to your browser tab — keep this command running',
    ]
  }
  return ['browser paired — the widget is live']
}

function plainUi(): (event: ConnectEvent) => void {
  return (event) => plainLines(event).forEach((line) => process.stdout.write(line + '\n'))
}

function clackUi(): (event: ConnectEvent) => void {
  intro('conciv — live connect')
  const seedSpinner = spinner({cancelMessage: 'Disconnecting…'})
  seedSpinner.start('Preparing workspace')
  let waitSpinner: ReturnType<typeof spinner> | undefined
  return (event) => {
    if (event.type === 'seeded') {
      seedSpinner.stop(
        event.seeded
          ? 'Workspace ready — seeded with the conciv.dev landing source'
          : 'Workspace ready — no source manifest found, continuing unseeded',
      )
      return
    }
    if (event.type === 'started') {
      log.success(`conciv core running on 127.0.0.1:${event.port} (harness: ${event.harness})`)
      note('Return to conciv.dev — Chrome will ask to allow\nlocal network access. Approve it.', 'Next')
      waitSpinner = spinner({cancelMessage: 'Disconnecting…'})
      waitSpinner.start('Waiting for your browser…')
      return
    }
    waitSpinner?.stop('Browser paired ✓ — the widget is live')
    log.info('Keep this running. Ctrl+C disconnects.')
  }
}

const main = defineCommand({
  meta: {name: 'conciv-try', description: 'try conciv live on conciv.dev with the agent on this machine'},
  args: {
    token: {type: 'string', required: true, description: 'pairing token from conciv.dev'},
    harness: {type: 'string', description: 'claude (default), codex, gemini-cli, opencode or pi'},
    workspace: {type: 'string', description: 'pass "." to use the current directory (default: throwaway temp dir)'},
    origin: {type: 'string', description: 'override the allowed browser origin (testing only)'},
  },
  run: async ({args}) => {
    const interactive = process.stdout.isTTY === true
    const onEvent = interactive ? clackUi() : plainUi()
    const engine = await runConnect({
      token: args.token,
      harness: args.harness,
      workspace: args.workspace,
      origin: args.origin,
      onEvent,
    })
    process.on('SIGINT', () => {
      void engine.stop().finally(() => {
        if (interactive) outro('Disconnected')
        process.exit(0)
      })
    })
    await new Promise(() => {})
  },
})

export function runCli(): void {
  void runMain(main)
}
