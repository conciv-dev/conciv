import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {pi} from './index.js'

describe('history', () => {
  it('a session folder lists its session by name and reads back only the active branch', async () => {
    const agentDir = tempDir('pi-agent-')
    const project = tempDir('pi-project-')
    const sessionId = HarnessSessionId.parse('0193a1b2-0000-7000-8000-000000000001')
    const folder = join(agentDir, 'sessions', `--${project.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`)
    mkdirSync(folder, {recursive: true})
    writeFileSync(
      join(folder, `2026-11-21T10-00-00-000Z_${sessionId}.jsonl`),
      [
        {type: 'session', id: sessionId, timestamp: '2026-11-21T10:00:00.000Z', cwd: project},
        {type: 'message', id: 'e1', parentId: null, message: {role: 'user', content: 'Fix the login button'}},
        {
          type: 'message',
          id: 'e2',
          parentId: 'e1',
          message: {role: 'assistant', content: [{type: 'text', text: 'I deleted the button'}]},
        },
        {
          type: 'message',
          id: 'e3',
          parentId: 'e1',
          message: {role: 'assistant', content: [{type: 'text', text: 'The button now submits'}]},
        },
        {type: 'session_info', id: 'e4', parentId: 'e3', name: 'Login button fix'},
      ]
        .map((record) => JSON.stringify(record))
        .join('\n'),
    )
    const history = pi(ConfigProvider.fromEnvRecord({PI_CODING_AGENT_DIR: agentDir})).history

    const page = await history.list({cwd: project}, {after: null, limit: 10})
    const messages = await history.messages(project, sessionId)

    expect(page.sessions).toEqual([
      expect.objectContaining({id: sessionId, cwd: project, derivedTitle: 'Login button fix'}),
    ])
    expect(messages).toEqual([
      {id: 'e1', role: 'user', parts: [{type: 'text', content: 'Fix the login button'}]},
      {id: 'e3', role: 'assistant', parts: [{type: 'text', content: 'The button now submits'}]},
    ])
  })
  it('opening the session reads back the whole conversation, tool calls and results included', async () => {
    const agentDir = tempDir('pi-agent-')
    const project = tempDir('pi-project-')
    const sessionId = HarnessSessionId.parse('0193a1b2-0000-7000-8000-000000000002')
    const folder = join(agentDir, 'sessions', `--${project.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`)
    mkdirSync(folder, {recursive: true})
    writeFileSync(
      join(folder, `2026-11-21T10-00-00-000Z_${sessionId}.jsonl`),
      [
        {type: 'session', id: sessionId, timestamp: '2026-11-21T10:00:00.000Z', cwd: project},
        {type: 'message', id: 'e1', parentId: null, message: {role: 'user', content: 'Fix the login button'}},
        {
          type: 'message',
          id: 'e2',
          parentId: 'e1',
          message: {
            role: 'assistant',
            content: [{type: 'toolCall', id: 'call_1', name: 'bash', arguments: {command: 'ls'}}],
          },
        },
        {
          type: 'message',
          id: 'e3',
          parentId: 'e2',
          message: {role: 'toolResult', toolCallId: 'call_1', content: [{type: 'text', text: 'src'}]},
        },
        {
          type: 'message',
          id: 'e4',
          parentId: 'e3',
          message: {role: 'assistant', content: [{type: 'text', text: 'The button now submits'}]},
        },
      ]
        .map((record) => JSON.stringify(record))
        .join('\n'),
    )
    const history = pi(ConfigProvider.fromEnvRecord({PI_CODING_AGENT_DIR: agentDir})).history

    const messages = await history.messages(project, sessionId)

    expect(messages).toEqual([
      {id: 'e1', role: 'user', parts: [{type: 'text', content: 'Fix the login button'}]},
      {
        id: 'e2',
        role: 'assistant',
        parts: [
          {type: 'tool-call', id: 'call_1', name: 'bash', arguments: '{"command":"ls"}', state: 'input-complete'},
          {type: 'tool-result', toolCallId: 'call_1', content: 'src', state: 'complete'},
        ],
      },
      {id: 'e4', role: 'assistant', parts: [{type: 'text', content: 'The button now submits'}]},
    ])
  })
})
