import {existsSync, writeFileSync} from 'node:fs'

const argv = process.argv.slice(2)
const argvFile = process.env.CONCIV_TEST_ARGV_FILE
if (argvFile) writeFileSync(argvFile, JSON.stringify(argv))

if (process.env.CONCIV_FAKE_HANG) {
  process.on('SIGTERM', () => process.exit(143))
  setInterval(() => {}, 1000)
} else if (process.env.CONCIV_FAKE_RELEASE_FILE) {
  const releaseFile = process.env.CONCIV_FAKE_RELEASE_FILE
  const head = [
    {type: 'system', subtype: 'init', session_id: 'sess-fake', model: 'claude-test'},
    {type: 'stream_event', event: {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}}},
    {
      type: 'stream_event',
      event: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'first-half '}},
    },
  ]
  for (const line of head) process.stdout.write(JSON.stringify(line) + '\n')
  const waitForRelease = () => {
    if (existsSync(releaseFile)) {
      const tail = [
        {
          type: 'stream_event',
          event: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'second-half'}},
        },
        {type: 'stream_event', event: {type: 'content_block_stop', index: 0}},
        {type: 'assistant', message: {model: 'claude-test', content: [{type: 'text', text: 'first-half second-half'}]}},
        {type: 'result', session_id: 'sess-fake', num_turns: 1, total_cost_usd: 0.001},
      ]
      for (const line of tail) process.stdout.write(JSON.stringify(line) + '\n')
      process.exit(0)
    }
    setTimeout(waitForRelease, 20)
  }
  waitForRelease()
} else if (process.env.CONCIV_FAKE_PARTIAL) {
  const lines = [
    {type: 'system', subtype: 'init', session_id: 'sess-fake', model: 'claude-test'},
    {
      type: 'stream_event',
      event: {
        type: 'message_start',
        message: {
          model: 'claude-test',
          usage: {input_tokens: 100, cache_read_input_tokens: 40, cache_creation_input_tokens: 10, output_tokens: 1},
        },
      },
    },
    {type: 'stream_event', event: {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}}},
    {
      type: 'stream_event',
      event: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'hello from fake'}},
    },
    {type: 'stream_event', event: {type: 'content_block_stop', index: 0}},
    {type: 'assistant', message: {model: 'claude-test', content: [{type: 'text', text: 'hello from fake'}]}},
    {type: 'stream_event', event: {type: 'message_delta', usage: {input_tokens: 100, output_tokens: 5}}},
    {type: 'stream_event', event: {type: 'message_stop'}},
    {
      type: 'result',
      session_id: 'sess-fake',
      num_turns: 1,
      total_cost_usd: 0.001,
      modelUsage: {'claude-test': {contextWindow: 200000}},
    },
  ]
  for (const line of lines) process.stdout.write(JSON.stringify(line) + '\n')
  process.exit(0)
} else if (process.env.CONCIV_FAKE_RICH) {
  const lines = [
    {type: 'system', subtype: 'init', session_id: 'sess-fake'},
    {type: 'summary', summary: 'Fake session title'},
    {
      type: 'assistant',
      message: {
        content: [
          {type: 'thinking', thinking: ''},
          {type: 'text', text: 'Proving it.'},
          {type: 'tool_use', id: 'tc1', name: 'conciv_page', input: {verb: 'route'}},
        ],
      },
    },
    {type: 'assistant', message: {content: [{type: 'text', text: 'RICH_REPLY_VISIBLE'}]}},
    {type: 'result', session_id: 'sess-fake', num_turns: 1, total_cost_usd: 0.001},
  ]
  for (const line of lines) process.stdout.write(JSON.stringify(line) + '\n')
  process.exit(0)
} else {
  const inputTokens = Number(process.env.CONCIV_FAKE_INPUT_TOKENS ?? '100')
  const lines = [
    {type: 'system', subtype: 'init', session_id: 'sess-fake', model: 'claude-test'},
    {type: 'summary', summary: 'Fake session title'},
    {
      type: 'assistant',
      message: {
        model: 'claude-test',
        content: [{type: 'text', text: 'hello from fake'}],
        usage: {
          input_tokens: inputTokens,
          cache_read_input_tokens: 40,
          cache_creation_input_tokens: 10,
          output_tokens: 5,
        },
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
