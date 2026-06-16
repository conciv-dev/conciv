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
} else if (process.env.AIDX_FAKE_PARTIAL) {
  // Mirrors real claude under --include-partial-messages: raw Anthropic SSE stream_events
  // (message_start carries usage early) AROUND the consolidated assistant event. Proves text
  // still renders and usage is extracted on this path.
  const lines = [
    {type: 'system', subtype: 'init', session_id: 'sess-fake', model: 'claude-test'},
    {
      type: 'stream_event',
      event: {type: 'message_start', message: {model: 'claude-test', usage: {input_tokens: 100, cache_read_input_tokens: 40, cache_creation_input_tokens: 10, output_tokens: 1}}},
    },
    {type: 'stream_event', event: {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}}},
    {type: 'stream_event', event: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'hello from fake'}}},
    {type: 'stream_event', event: {type: 'content_block_stop', index: 0}},
    {type: 'assistant', message: {model: 'claude-test', content: [{type: 'text', text: 'hello from fake'}]}},
    {type: 'stream_event', event: {type: 'message_delta', usage: {input_tokens: 100, output_tokens: 5}}},
    {type: 'stream_event', event: {type: 'message_stop'}},
    {type: 'result', session_id: 'sess-fake', num_turns: 1, total_cost_usd: 0.001, modelUsage: {'claude-test': {contextWindow: 200000}}},
  ]
  for (const line of lines) process.stdout.write(JSON.stringify(line) + '\n')
  process.exit(0)
} else if (process.env.AIDX_FAKE_RICH) {
  // A multi-block turn mirroring a real claude turn: an EMPTY thinking block, text, a tool_use,
  // then more text. Exercises the chat() + uiBus SSE pipeline for the "reply not rendering" case.
  const lines = [
    {type: 'system', subtype: 'init', session_id: 'sess-fake'},
    {type: 'summary', summary: 'Fake session title'},
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
  // input_tokens is configurable per spawn (AIDX_FAKE_INPUT_TOKENS) so interleaved-turn tests can
  // prove usage is keyed per session and not cross-written. Defaults to 100.
  const inputTokens = Number(process.env.AIDX_FAKE_INPUT_TOKENS ?? '100')
  const lines = [
    {type: 'system', subtype: 'init', session_id: 'sess-fake', model: 'claude-test'},
    {type: 'summary', summary: 'Fake session title'},
    {
      type: 'assistant',
      message: {
        model: 'claude-test',
        content: [{type: 'text', text: 'hello from fake'}],
        usage: {input_tokens: inputTokens, cache_read_input_tokens: 40, cache_creation_input_tokens: 10, output_tokens: 5},
      },
    },
    {
      type: 'result',
      session_id: 'sess-fake',
      num_turns: 1,
      total_cost_usd: 0.001,
      modelUsage: {'claude-test': {contextWindow: 200000, costUSD: 0.001}},
    },
  ]
  for (const line of lines) process.stdout.write(JSON.stringify(line) + '\n')
  process.exit(0)
}
