// A real executable standing in for the `claude` CLI in chat-route ITs — NOT a JS mock:
// it's spawned as a child process and exercises the true spawn → stdout-pipe → SSE path.
// It echoes its argv (so the test can assert --resume on the 2nd turn) and replays a
// stream-json transcript. With AIDX_FAKE_HANG it sleeps until SIGTERM to exercise Stop.
import {writeFileSync} from 'node:fs'

const argv = process.argv.slice(2)
const argvFile = process.env.AIDX_TEST_ARGV_FILE
if (argvFile) writeFileSync(argvFile, JSON.stringify(argv))

if (process.env.AIDX_FAKE_HANG) {
  process.on('SIGTERM', () => process.exit(143))
  setInterval(() => {}, 1000) // stay alive until signalled
} else if (process.env.AIDX_FAKE_RICH) {
  // A multi-block turn mirroring a real claude turn: an EMPTY thinking block, text, a tool_use,
  // then more text. Exercises the chat() + uiBus SSE pipeline for the "reply not rendering" case.
  const lines = [
    {type: 'system', subtype: 'init', session_id: 'sess-fake'},
    {
      type: 'assistant',
      message: {
        content: [
          {type: 'thinking', thinking: ''},
          {type: 'text', text: 'Proving it.'},
          {type: 'tool_use', id: 'tc1', name: 'aidx_page', input: {verb: 'route'}},
        ],
      },
    },
    {type: 'assistant', message: {content: [{type: 'text', text: 'RICH_REPLY_VISIBLE'}]}},
    {type: 'result', session_id: 'sess-fake', num_turns: 1, total_cost_usd: 0.001},
  ]
  for (const line of lines) process.stdout.write(JSON.stringify(line) + '\n')
  process.exit(0)
} else {
  const lines = [
    {type: 'system', subtype: 'init', session_id: 'sess-fake'},
    {type: 'assistant', message: {content: [{type: 'text', text: 'hello from fake'}]}},
    {type: 'result', session_id: 'sess-fake', num_turns: 1, total_cost_usd: 0.001},
  ]
  for (const line of lines) process.stdout.write(JSON.stringify(line) + '\n')
  process.exit(0)
}
