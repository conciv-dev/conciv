// Real executable standing in for a harness CLI in ITs — spawned as a child to exercise the
// true spawn → stdout-pipe → decode path. Replays a format-specific transcript selected by
// CONCIV_FAKE_FORMAT (claude | codex). Echoes argv (CONCIV_TEST_ARGV_FILE) so a test can
// assert resume; hangs until SIGTERM under CONCIV_FAKE_HANG to exercise Stop.
import {writeFileSync} from 'node:fs'

function claudeLines(): unknown[] {
  return [
    {type: 'system', subtype: 'init', session_id: 'sess-fake'},
    {type: 'assistant', message: {content: [{type: 'text', text: 'hello from fake'}]}},
    {type: 'result', session_id: 'sess-fake', num_turns: 1, total_cost_usd: 0.001},
  ]
}

function codexLines(): unknown[] {
  return [
    {type: 'thread.started', thread_id: 'th-fake'},
    {type: 'turn.started'},
    {type: 'item.completed', item: {id: 'item_1', type: 'agent_message', text: 'hello from fake'}},
    {type: 'turn.completed', usage: {input_tokens: 1, output_tokens: 1}},
  ]
}

function transcript(format: string): unknown[] {
  return format === 'codex' ? codexLines() : claudeLines()
}

function main(): void {
  const argv = process.argv.slice(2)
  const argvFile = process.env.CONCIV_TEST_ARGV_FILE
  if (argvFile) writeFileSync(argvFile, JSON.stringify(argv))

  if (process.env.CONCIV_FAKE_HANG) {
    process.on('SIGTERM', () => process.exit(143))
    setInterval(() => {}, 1000)
    return
  }
  for (const line of transcript(process.env.CONCIV_FAKE_FORMAT ?? 'claude')) {
    process.stdout.write(JSON.stringify(line) + '\n')
  }
  process.exit(0)
}

main()
