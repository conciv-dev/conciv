import {mkdir, mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeAll, describe, expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import {pi} from '../src/pi/index.js'
import {encodeSessionDir, parseHistory, sessionsDir} from '../src/pi/history.js'

const PROJECT = '/workspace/pi.demo'
const SESSION = '39a461cc-ceb9-495a-891b-b11fe6a03c55'
const FILE = `2026-07-30T09-45-14-653Z_${SESSION}.jsonl`

const LINES = [
  {type: 'session', version: 3, id: SESSION, timestamp: '2026-07-30T09:45:14.653Z', cwd: PROJECT},
  {
    type: 'model_change',
    id: '47cbae6a',
    parentId: null,
    timestamp: '2026-07-30T09:45:14.712Z',
    provider: 'anthropic',
    modelId: 'claude-opus-4-6',
  },
  {
    type: 'message',
    id: '357f05eb',
    parentId: '47cbae6a',
    timestamp: '2026-07-30T09:45:29.518Z',
    message: {role: 'user', content: [{type: 'text', text: 'count the files'}], timestamp: 1785404729517},
  },
  {
    type: 'message',
    id: '493b7644',
    parentId: '357f05eb',
    timestamp: '2026-07-30T09:45:30.837Z',
    message: {
      role: 'assistant',
      content: [
        {type: 'thinking', thinking: 'need to run ls'},
        {type: 'toolCall', id: 'call_1', name: 'bash', arguments: {command: 'ls'}},
      ],
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      stopReason: 'toolUse',
    },
  },
  {
    type: 'message',
    id: '5a1c9d02',
    parentId: '493b7644',
    timestamp: '2026-07-30T09:45:31.100Z',
    message: {
      role: 'toolResult',
      toolCallId: 'call_1',
      toolName: 'bash',
      content: [{type: 'text', text: 'README.md'}],
      isError: false,
    },
  },
  {
    type: 'message',
    id: 'abandoned1',
    parentId: '5a1c9d02',
    timestamp: '2026-07-30T09:45:32.000Z',
    message: {role: 'assistant', content: [{type: 'text', text: 'ABANDONED BRANCH'}], stopReason: 'stop'},
  },
  {
    type: 'message',
    id: 'kept1',
    parentId: '5a1c9d02',
    timestamp: '2026-07-30T09:45:33.000Z',
    message: {role: 'assistant', content: [{type: 'text', text: 'One file.'}], stopReason: 'stop'},
  },
]

const jsonl = (lines: unknown[]): string => `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`

const state = {home: ''}

const context = (over: Partial<HarnessConnectContext> = {}): HarnessConnectContext => ({
  cwd: PROJECT,
  stateDir: '/tmp/.conciv/pi',
  concivSessionId: SessionId.parse('conciv_pi_test'),
  harnessSessionId: null,
  resume: false,
  model: null,
  mcpUrl: null,
  hookUrl: null,
  ...over,
})

const history = () => {
  const found = pi.history
  if (!found) throw new Error('pi harness has no history')
  return found
}

beforeAll(async () => {
  state.home = await mkdtemp(join(tmpdir(), 'pi-history-'))
  const dir = sessionsDir(PROJECT, state.home)
  await mkdir(dir, {recursive: true})
  await writeFile(join(dir, FILE), jsonl(LINES), 'utf8')
})

describe('pi session directory encoding', () => {
  it('wraps the cwd in double dashes and keeps dots', () => {
    expect(encodeSessionDir('/workspace/pi.demo')).toBe('--workspace-pi.demo--')
  })
})

describe('pi transcript parsing', () => {
  it('walks the newest leaf back to the root and drops the abandoned branch', () => {
    expect(parseHistory(jsonl(LINES))).toEqual([
      {id: 'h1', role: 'user', parts: [{type: 'text', content: 'count the files'}]},
      {
        id: 'h2',
        role: 'assistant',
        parts: [
          {type: 'thinking', content: 'need to run ls'},
          {
            type: 'tool-call',
            id: 'call_1',
            name: 'bash',
            arguments: JSON.stringify({command: 'ls'}),
            state: 'input-complete',
          },
          {type: 'tool-result', toolCallId: 'call_1', content: 'README.md', state: 'complete'},
        ],
      },
      {id: 'h3', role: 'assistant', parts: [{type: 'text', content: 'One file.'}]},
    ])
  })
})

describe('pi history sidecar', () => {
  it('lists the sessions stored under the cwd directory', async () => {
    const sessions = await history().list(PROJECT, state.home)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      id: SESSION,
      derivedTitle: 'count the files',
      lastMessage: 'One file.',
      messageCount: 3,
      model: 'claude-opus-4-6',
      createdAt: Date.parse('2026-07-30T09:45:14.653Z'),
    })
  })

  it('finds the transcript by its session id suffix', async () => {
    expect(history().transcriptPath?.(PROJECT, SESSION, state.home)).toBe(join(sessionsDir(PROJECT, state.home), FILE))
    const messages = await history().messages(PROJECT, SESSION, state.home)
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'assistant'])
    const stat = await history().transcriptStat(PROJECT, SESSION, state.home)
    expect(stat?.size).toBeGreaterThan(0)
  })

  it('reports nothing for an unknown session', async () => {
    expect(await history().messages(PROJECT, 'missing', state.home)).toEqual([])
    expect(await history().transcriptStat(PROJECT, 'missing', state.home)).toBeNull()
  })
})

describe('pi connect.plan', () => {
  it('pins the session id and the model when both are known', () => {
    expect(pi.connect?.plan(context({harnessSessionId: 'sess-1', model: 'anthropic/claude-opus-4-6'}))).toEqual({
      argv: ['pi', '--session-id', 'sess-1', '--model', 'anthropic/claude-opus-4-6'],
      env: {},
      files: [],
    })
  })

  it('launches bare when nothing is pinned', () => {
    expect(pi.connect?.plan(context()).argv).toEqual(['pi'])
  })
})
